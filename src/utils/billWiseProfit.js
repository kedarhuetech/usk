// Calculation helpers and cost resolution for the Bill Wise Profit report.
import { getAppSettings } from "../services/appSettingsStorage.js";

export function parseYMD(val) {
  if (!val) return "";
  if (typeof val === "string") {
    const s = val.trim();
    // 1. YYYY-MM-DD or YYYY/MM/DD
    const ymd = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    }
    // 2. DD/MM/YYYY or MM/DD/YYYY
    const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmySlash) {
      const first = Number(dmySlash[1]);
      const second = Number(dmySlash[2]);
      const year = dmySlash[3];
      if (second > 12 && first <= 12) {
        return `${year}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
      }
      return `${year}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    }
    // 3. DD-MM-YYYY or MM-DD-YYYY
    const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmyDash) {
      const first = Number(dmyDash[1]);
      const second = Number(dmyDash[2]);
      const year = dmyDash[3];
      if (second > 12 && first <= 12) {
        return `${year}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
      }
      return `${year}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    }
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }
  return "";
}

export function formatDateDisplay(val) {
  const ymd = parseYMD(val);
  if (!ymd) return "-";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export function formatMoney(val) {
  const num = Number(val);
  const settings = getAppSettings();
  const sym = settings.currencySymbol || "₹";
  const decimals = settings.amountDecimalPlaces ?? 2;
  if (isNaN(num)) return `${sym} ${(0).toFixed(decimals)}`;
  return `${sym} ${num.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function isValidCost(val) {
  if (val === null || val === undefined || val === "") return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num) && num > 0;
}

function normalizedItemName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves the applicable purchase cost for a sold invoice item row.
 * Does NOT assume zero when missing.
 *
 * @param {object} row - Line item row from sale invoice
 * @param {Array} inventoryItems - Master inventory items
 * @param {Array} purchaseBills - Stored purchase bills
 * @returns {{ purchasePrice: number | null, source: string }}
 */
export function resolveItemPurchaseCost(row = {}, inventoryItems = [], purchaseBills = []) {
  // 1. Direct snapshot on row if explicitly recorded
  if (isValidCost(row.purchasePrice)) {
    return { purchasePrice: Number(row.purchasePrice), source: "row_snapshot" };
  }
  if (isValidCost(row.costPrice)) {
    return { purchasePrice: Number(row.costPrice), source: "row_snapshot" };
  }
  if (isValidCost(row.cost)) {
    return { purchasePrice: Number(row.cost), source: "row_snapshot" };
  }

  const rowItemId = String(row.sourceItemId || row.itemId || row.productId || "").trim();
  const rowItemName = normalizedItemName(
    row.item || row.name || row.itemName || row.productName || row.itemNameSnapshot || ""
  );

  // 2. Lookup in Inventory Items Master
  let matchedMasterItem = null;
  if (Array.isArray(inventoryItems) && inventoryItems.length > 0) {
    if (rowItemId) {
      matchedMasterItem = inventoryItems.find((it) => String(it.id || "").trim() === rowItemId);
    }
    if (!matchedMasterItem && rowItemName) {
      matchedMasterItem = inventoryItems.find((it) => {
        const itName = normalizedItemName(it.itemName || it.name);
        return itName === rowItemName;
      });
    }

    if (matchedMasterItem) {
      if (isValidCost(matchedMasterItem.purchasePrice)) {
        return { purchasePrice: Number(matchedMasterItem.purchasePrice), source: "inventory_master" };
      }
      if (isValidCost(matchedMasterItem.atPrice)) {
        return { purchasePrice: Number(matchedMasterItem.atPrice), source: "inventory_at_price" };
      }
    }
  }

  const canonicalMasterName = matchedMasterItem
    ? String(matchedMasterItem.itemName || matchedMasterItem.name || "").trim().toLowerCase()
    : "";

  // 3. Fallback: Lookup in Purchase Bills history
  // Sort purchase bills by latest date first so the latest valid purchase price is selected
  if (Array.isArray(purchaseBills) && purchaseBills.length > 0 && (rowItemId || rowItemName || canonicalMasterName)) {
    const sortedBills = [...purchaseBills].sort((a, b) => {
      const dateA = a.form?.billDate || a.form?.invoiceDate || a.billDate || a.date || a.createdAt || "";
      const dateB = b.form?.billDate || b.form?.invoiceDate || b.billDate || b.date || b.createdAt || "";
      return String(dateB).localeCompare(String(dateA));
    });

    for (const bill of sortedBills) {
      if (bill.cancelled || bill.status === "Cancelled") continue;
      const billRows = bill.rows || bill.items || bill.lineItems || [];

      // Match by Item ID first, then fallback to normalized item name
      const matchedBillRow = billRows.find((br) => {
        if (!br || typeof br !== "object") return false;
        const brItemId = String(br.sourceItemId || br.itemId || br.productId || "").trim();
        if (rowItemId && brItemId && rowItemId === brItemId) {
          return true;
        }
        if (matchedMasterItem?.id && brItemId && String(matchedMasterItem.id).trim() === brItemId) {
          return true;
        }
        const brName = normalizedItemName(
          br.item || br.name || br.itemName || br.productName || br.itemNameSnapshot || ""
        );

        if (rowItemName && brName && rowItemName === brName) {
          return true;
        }
        if (canonicalMasterName && brName && canonicalMasterName === brName) {
          return true;
        }
        return false;
      });

      if (matchedBillRow) {
        // Read purchase price safely from supported fields
        const candidatePrice = [
          matchedBillRow.purchasePrice,
          matchedBillRow.price,
          matchedBillRow.rate,
          matchedBillRow.unitPrice,
          matchedBillRow.finalUnitPrice,
          matchedBillRow.costPrice,
          matchedBillRow.cost,
        ].find(isValidCost);

        if (candidatePrice !== undefined) {
          return {
            purchasePrice: Number(candidatePrice),
            source: "purchase_bill_history",
          };
        }

        const rawAmt = matchedBillRow.amount ?? matchedBillRow.total;
        const rawQty = matchedBillRow.qty ?? matchedBillRow.quantity;
        if (isValidCost(rawAmt) && Number(rawQty) > 0) {
          return {
            purchasePrice: Number(rawAmt) / Number(rawQty),
            source: "purchase_bill_history",
          };
        }
      }
    }
  }

  // Cost genuinely missing or unknown. DO NOT assume zero!
  return { purchasePrice: null, source: "missing" };
}

/**
 * Calculates profit/loss breakdown for a single sale invoice.
 * Formula:
 * Total Cost = Sum of (Item Quantity × Item Purchase Cost)
 * Profit/Loss = Sale Amount − Total Cost − Tax Payable + TDS Receivable
 * Profit (Excluding Additional Charges) = Profit − Additional Charges
 *
 * @param {object} invoice
 * @param {Array} inventoryItems
 * @param {Array} purchaseBills
 */
export function calculateInvoiceProfit(invoice = {}, inventoryItems = [], purchaseBills = [], partiesMaster = []) {
  const invoiceNumber = String(
    invoice.form?.invoiceNumber || invoice.invoiceNumber || invoice.number || invoice.id || "—"
  );
  const partyId = invoice.form?.partyId || invoice.partyId || invoice.form?.customerId || invoice.customerId || "";
  let partyName = String(
    invoice.form?.customer || invoice.customer || invoice.partyName || invoice.party || ""
  ).trim();

  if ((!partyName || partyName.toLowerCase() === "cash sale") && partyId && Array.isArray(partiesMaster)) {
    const matchedParty = partiesMaster.find((p) => String(p.id) === String(partyId));
    if (matchedParty) {
      partyName = String(matchedParty.partyName || matchedParty.name || "").trim();
    }
  }
  if (!partyName) partyName = "Cash Sale";
  const rawDate =
    invoice.form?.invoiceDate || invoice.invoiceDate || invoice.date || invoice.createdAt || "";
  const dateYmd = parseYMD(rawDate);
  const formattedDate = formatDateDisplay(rawDate);

  // Line items - filter out genuinely blank/empty template rows
  const allRows = invoice.rows || invoice.items || invoice.lineItems || [];
  const validRows = allRows.filter((r) => {
    if (!r || typeof r !== "object") return false;
    const name = String(r.item || r.name || r.itemName || r.productName || r.itemNameSnapshot || "").trim();
    const rawQty = r.qty ?? r.quantity;
    const qty = Number(rawQty);
    const hasQty = rawQty !== "" && rawQty !== null && rawQty !== undefined && !isNaN(qty) && qty > 0;
    const rawPrice = r.price ?? r.rate ?? r.unitPrice;
    const price = Number(rawPrice);
    const hasPrice = rawPrice !== "" && rawPrice !== null && rawPrice !== undefined && !isNaN(price) && price > 0;
    const hasId = Boolean(r.sourceItemId || r.itemId || r.productId);
    return Boolean((name || hasId) && (hasQty || hasPrice || hasId));
  });

  // If no valid items exist, cost is unknown
  let hasMissingCost = validRows.length === 0;

  const itemDetails = validRows.map((row) => {
    const qty = Math.max(Number(row.qty ?? row.quantity ?? 1), 0);
    let itemName = String(row.item || row.name || row.itemName || row.productName || row.itemNameSnapshot || "").trim();
    if (!itemName && (row.sourceItemId || row.itemId) && Array.isArray(inventoryItems)) {
      const targetId = String(row.sourceItemId || row.itemId).trim();
      const master = inventoryItems.find((it) => String(it.id || "").trim() === targetId);
      if (master) itemName = String(master.itemName || master.name || "").trim();
    }
    if (!itemName) itemName = "Unnamed Item";

    const { purchasePrice, source } = resolveItemPurchaseCost(row, inventoryItems, purchaseBills);

    if (purchasePrice === null) {
      hasMissingCost = true;
    }

    const totalCost = purchasePrice !== null ? qty * purchasePrice : null;

    return {
      id: row.id || crypto.randomUUID(),
      itemName,
      qty,
      unit: row.unit || "",
      purchasePrice,
      totalCost,
      source,
      isCostMissing: purchasePrice === null,
      missingReason: purchasePrice === null
        ? `Purchase cost not recorded for: ${itemName}. Add a purchase bill or enter the item's purchase price. Profit cannot be calculated until the missing cost is available.`
        : "",
    };
  });

  // Calculate invoice Total Cost
  let totalCost = null;
  if (!hasMissingCost) {
    totalCost = itemDetails.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  }

  // Sale Amount
  const rowSum = validRows.reduce(
    (sum, r) =>
      sum +
      Number(
        r.calculated?.amount ??
          r.amount ??
          r.total ??
          Math.max(Number(r.qty ?? 1), 0) * Number(r.price ?? 0)
      ),
    0
  );

  const saleAmount = Number(
    invoice.totals?.finalTotal ??
      invoice.totals?.grandTotal ??
      invoice.totalAmount ??
      invoice.amount ??
      (rowSum > 0 ? rowSum : 0)
  );

  // Tax Payable (Tax collected on this sale)
  const taxPayable = Number(
    invoice.totals?.tax ??
      invoice.totals?.totalTax ??
      validRows.reduce((sum, r) => sum + Number(r.calculated?.tax ?? r.taxAmount ?? 0), 0) ??
      0
  );

  // TDS Receivable
  const tdsReceivable = Number(
    invoice.tdsReceivable ?? invoice.tdsAmount ?? invoice.totals?.tds ?? invoice.form?.tds ?? 0
  );

  // Additional Charges
  const additionalCharges = Number(
    invoice.totals?.additionalCharges ??
      invoice.additionalCharges ??
      invoice.form?.additionalCharges ??
      0
  );

  // Profit/Loss Calculation
  let profit = null;
  let profitExcludingCharges = null;

  if (!hasMissingCost && totalCost !== null) {
    // Profit = Sale Amount - Total Cost - Tax Payable + TDS Receivable
    profit = saleAmount - totalCost - taxPayable + tdsReceivable;
    // Profit (Excluding Additional Charges) = Profit - Additional Charges
    profitExcludingCharges = profit - additionalCharges;
  }

  return {
    id: invoice.id || invoice.invoiceId || invoiceNumber,
    rawInvoice: invoice,
    invoiceNumber,
    partyId,
    partyName,
    rawDate,
    dateYmd,
    formattedDate,
    saleAmount,
    totalCost,
    taxPayable,
    tdsReceivable,
    additionalCharges,
    profit,
    profitExcludingCharges,
    hasMissingCost,
    isLoss: profit !== null && profit < 0,
    items: itemDetails,
    missingCostItems: itemDetails.filter((item) => item.isCostMissing).map((item) => item.itemName),
  };
}
