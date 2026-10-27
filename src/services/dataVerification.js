// Checks company records through read-only business data APIs.
import { businessDataApi } from "./apiClient.js";
import { calculateInvoiceTotals } from "../utils/saleInvoice.js";

const unavailableChecks = [
  "Stock quantities cannot be reconciled because USV does not expose a complete stock movement history.",
  "Party balances cannot be reconciled because payments and stable party links are not stored with transactions.",
];

// Compares monetary values at the cent precision used by invoice records.
function moneyMatches(left, right) {
  return left !== null && left !== undefined && left !== "" && Number.isFinite(Number(left))
    && Math.round(Number(left) * 100) === Math.round(Number(right) * 100);
}

// Gives each issue a stable destination in the existing app.
function recordPath(resource) {
  if (resource === "items") return "/items";
  if (resource === "parties") return "/parties/party-details";
  if (resource === "purchase-bills") return "/purchase-expense/purchase-bills";
  return "/sales/sale-invoices";
}

// Checks relationships and invoice math without writing any records.
export function verifyBusinessData(data) {
  const items = data.items || [];
  const parties = data.parties || [];
  const sales = data.salesInvoices || [];
  const purchases = data.purchaseBills || [];
  const issues = [];
  const incompleteChecks = [...unavailableChecks];
  const itemIds = new Set(items.map((item) => String(item.id)));

  // Only explicit saved item IDs count as relationships; free-text item labels are allowed.
  for (const [resource, records] of [["sales-invoices", sales], ["purchase-bills", purchases]]) {
    for (const transaction of records) {
      const reference = transaction.form?.invoiceNumber || transaction.invoiceNumber || transaction.id || "Unknown transaction";
      for (const row of transaction.rows || []) {
        const quantity = Number(row.qty ?? row.quantity);
        const price = Number(row.price);
        if (row.item && (!Number.isFinite(quantity) || quantity <= 0)) {
          issues.push({
            id: `${resource}:${transaction.id}:${row.id || row.index || row.item}:quantity`,
            severity: "error",
            recordType: resource === "sales-invoices" ? "Sale" : "Purchase",
            recordReference: reference,
            explanation: `Line “${row.item}” has a missing, invalid, or non-positive quantity. USV requires a quantity greater than zero for a saved transaction line.`,
            path: recordPath(resource),
          });
        }
        if (row.item && row.price !== "" && (!Number.isFinite(price) || price < 0)) {
          issues.push({
            id: `${resource}:${transaction.id}:${row.id || row.index || row.item}:price`,
            severity: "error",
            recordType: resource === "sales-invoices" ? "Sale" : "Purchase",
            recordReference: reference,
            explanation: `Line “${row.item}” has an invalid or negative price.`,
            path: recordPath(resource),
          });
        }
        const itemId = row.sourceItemId || row.itemId || row.inventoryItemId;
        if (itemId && !itemIds.has(String(itemId))) {
          issues.push({
            id: `${resource}:${transaction.id}:${row.id || row.index || row.item}`,
            severity: "error",
            recordType: resource === "sales-invoices" ? "Sale" : "Purchase",
            recordReference: reference,
            explanation: `Line “${row.item || "unnamed item"}” refers to item ID ${itemId}, which is not in the current company item records.`,
            path: recordPath(resource),
          });
        }
      }

      // Reuse USV's invoice calculator so verification follows the same tax and rounding rules.
      if (!Array.isArray(transaction.rows) || !transaction.totals || transaction.totals.finalTotal === undefined) {
        incompleteChecks.push(`${resource} transaction ${reference} has no saved rows or final total, so its total could not be recalculated.`);
        continue;
      }
      const saved = transaction.totals;
      const recomputed = calculateInvoiceTotals(
        transaction.rows,
        true,
        String(saved.roundOffAmount ?? ""),
        saved.received ?? 0,
      );
      if (!moneyMatches(saved.finalTotal, recomputed.finalTotal)) {
        issues.push({
          id: `${resource}:${transaction.id}:total`,
          severity: "error",
          recordType: resource === "sales-invoices" ? "Sale" : "Purchase",
          recordReference: reference,
          explanation: `Saved total ${saved.finalTotal} does not match the total recalculated from its lines (${recomputed.finalTotal.toFixed(2)}).`,
          path: recordPath(resource),
        });
      }
      if (saved.balance !== undefined && !moneyMatches(saved.balance, recomputed.balance)) {
        issues.push({
          id: `${resource}:${transaction.id}:balance`,
          severity: "warning",
          recordType: resource === "sales-invoices" ? "Sale" : "Purchase",
          recordReference: reference,
          explanation: `Saved remaining balance ${saved.balance} does not match the calculated balance (${recomputed.balance.toFixed(2)}).`,
          path: recordPath(resource),
        });
      }
    }
  }

  // A party relationship can only be checked where a stable party ID was saved.
  const partyIds = new Set(parties.map((party) => String(party.id)));
  for (const [resource, records] of [["sales-invoices", sales], ["purchase-bills", purchases]]) {
    for (const transaction of records) {
      const partyId = transaction.form?.partyId || transaction.partyId || transaction.customerId || transaction.supplierId;
      if (partyId && !partyIds.has(String(partyId))) {
        issues.push({
          id: `${resource}:${transaction.id}:party`,
          severity: "error",
          recordType: resource === "sales-invoices" ? "Sale" : "Purchase",
          recordReference: transaction.form?.invoiceNumber || transaction.id || "Unknown transaction",
          explanation: `This transaction refers to party ID ${partyId}, which is not in the current company party records.`,
          path: recordPath(resource),
        });
      }
    }
  }

  return {
    recordsChecked: items.length + parties.length + sales.length + purchases.length,
    issues,
    completedChecks: [
      `Loaded ${items.length} items, ${parties.length} parties, ${sales.length} sales, and ${purchases.length} purchases from the current company.`,
      "Recalculated saved transaction totals and checked explicit item and party ID references.",
    ],
    incompleteChecks: [...new Set(incompleteChecks)],
    checkedAt: new Date().toISOString(),
  };
}

// Reads every supported record type; a failed request leaves verification incomplete.
export async function runDataVerification(api = businessDataApi) {
  try {
    const [items, parties, salesInvoices, purchaseBills] = await Promise.all([
      api.list("items"),
      api.list("parties"),
      api.list("sales-invoices"),
      api.list("purchase-bills"),
    ]);
    return verifyBusinessData({ items, parties, salesInvoices, purchaseBills });
  } catch (error) {
    return {
      recordsChecked: 0,
      issues: [],
      completedChecks: [],
      incompleteChecks: [`Could not read all records from the existing USV backend: ${error.message || "request failed"}`],
      checkedAt: new Date().toISOString(),
      failed: true,
    };
  }
}
