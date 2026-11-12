// Party-wise Profit & Loss Service
// Calculates revenue, Cost of Goods Sold (COGS), gross profit/loss, and profit margins per customer/party.
// Designed as a standalone, framework-agnostic calculation engine to support easy migration to MySQL backend APIs.

import {
  parseYMD,
  formatDateDisplay,
  formatMoney,
  resolveItemPurchaseCost,
  isValidCost,
} from "../utils/billWiseProfit.js";

/**
 * Normalizes party names for case-insensitive matching.
 */
export function normalizePartyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Normalizes ID strings.
 */
export function normalizeId(id) {
  return String(id ?? "").trim();
}

/**
 * Formats a percentage number cleanly.
 */
export function formatPercentage(val) {
  if (val === null || val === undefined || isNaN(val)) return "0.00%";
  const num = Number(val);
  return `${num >= 0 ? "" : ""}${num.toFixed(2)}%`;
}

/**
 * Resolves a party from an invoice by partyId first, then by customer/party name.
 */
export function matchPartyForInvoice(invoice = {}, partiesMaster = []) {
  const invPartyId = normalizeId(
    invoice.partyId || invoice.form?.partyId || invoice.customerId || invoice.form?.customerId
  );
  const invPartyName = String(
    invoice.partyName || invoice.customer || invoice.form?.customer || invoice.party || ""
  ).trim();

  let matched = null;
  if (invPartyId && Array.isArray(partiesMaster)) {
    matched = partiesMaster.find((p) => normalizeId(p.id) === invPartyId);
  }
  if (!matched && invPartyName && Array.isArray(partiesMaster)) {
    const norm = normalizePartyName(invPartyName);
    matched = partiesMaster.find(
      (p) => normalizePartyName(p.partyName || p.name) === norm
    );
  }

  if (matched) {
    return {
      partyId: String(matched.id),
      partyName: String(matched.partyName || matched.name || invPartyName).trim(),
      partyType: matched.partyType || matched.type || "Customer",
      phone: matched.phone || matched.mobile || matched.contactNumber || "",
      email: matched.email || "",
      isRegisteredParty: true,
    };
  }

  const fallbackName = invPartyName || "Cash Sale";
  return {
    partyId: invPartyId || `unregistered-${normalizePartyName(fallbackName)}`,
    partyName: fallbackName,
    partyType: fallbackName.toLowerCase().includes("supplier") ? "Supplier" : "Customer",
    phone: invoice.customerPhone || invoice.form?.customerPhone || "",
    email: invoice.customerEmail || invoice.form?.customerEmail || "",
    isRegisteredParty: false,
  };
}

/**
 * Evaluates the line items of a single sales invoice to calculate:
 * - Line item selling amount
 * - Line item discount
 * - Unit cost from inventory or purchase bills
 * - Total line item COGS
 * - Line item profit
 */
export function evaluateInvoiceLineItems(invoice = {}, inventoryItems = [], purchaseBills = []) {
  const rawRows = invoice.rows || invoice.items || invoice.lineItems || [];
  let invoiceHasMissingCost = false;
  let totalLineDiscount = 0;
  let totalLineAmount = 0;
  let totalLineCogs = 0;

  const validRows = rawRows.filter((r) => {
    if (!r || typeof r !== "object") return false;
    const name = String(r.item || r.name || r.itemName || r.productName || r.itemNameSnapshot || "").trim();
    const qty = Number(r.qty ?? r.quantity);
    const hasQty = !isNaN(qty) && qty > 0;
    const hasId = Boolean(r.sourceItemId || r.itemId || r.productId);
    return Boolean(name || hasId) && (hasQty || Boolean(r.price ?? r.rate));
  });

  const items = validRows.map((row) => {
    const qty = Math.max(Number(row.qty ?? row.quantity ?? 1), 0);
    const unitPrice = Number(row.price ?? row.rate ?? row.unitPrice ?? 0);
    const grossAmount = qty * unitPrice;

    // Line Discount
    let lineDiscount = 0;
    if (isValidCost(row.discountAmount)) {
      lineDiscount = Number(row.discountAmount);
    } else if (isValidCost(row.discount) || isValidCost(row.discountPercent)) {
      const discPct = Number(row.discount ?? row.discountPercent);
      lineDiscount = (grossAmount * discPct) / 100;
    }

    const netAmount = Math.max(grossAmount - lineDiscount, 0);
    totalLineDiscount += lineDiscount;
    totalLineAmount += netAmount;

    // Resolve Purchase Cost per Unit
    let itemName = String(row.item || row.name || row.itemName || row.productName || "").trim();
    if (!itemName && (row.sourceItemId || row.itemId) && Array.isArray(inventoryItems)) {
      const master = inventoryItems.find((it) => normalizeId(it.id) === normalizeId(row.sourceItemId || row.itemId));
      if (master) itemName = String(master.itemName || master.name || "").trim();
    }
    if (!itemName) itemName = "Item";

    const { purchasePrice, source } = resolveItemPurchaseCost(row, inventoryItems, purchaseBills);

    let lineCogs = null;
    let lineProfit = null;

    if (purchasePrice !== null && !isNaN(purchasePrice)) {
      lineCogs = qty * Number(purchasePrice);
      lineProfit = netAmount - lineCogs;
      totalLineCogs += lineCogs;
    } else {
      invoiceHasMissingCost = true;
    }

    return {
      id: row.id || `row-${crypto.randomUUID()}`,
      itemName,
      qty,
      unit: row.unit || "PCS",
      unitPrice,
      grossAmount,
      discount: lineDiscount,
      netAmount,
      costPrice: purchasePrice,
      totalCogs: lineCogs,
      profit: lineProfit,
      costSource: source,
      isCostMissing: purchasePrice === null,
    };
  });

  return {
    items,
    invoiceHasMissingCost,
    totalLineDiscount,
    totalLineAmount,
    totalLineCogs,
  };
}

/**
 * Calculates profit and cost breakdown for a single sales invoice in party context.
 */
export function calculateInvoiceProfitForParty(invoice = {}, inventoryItems = [], purchaseBills = []) {
  const invoiceNumber = String(
    invoice.form?.invoiceNumber || invoice.invoiceNumber || invoice.number || invoice.id || "—"
  );
  const rawDate =
    invoice.form?.invoiceDate || invoice.invoiceDate || invoice.date || invoice.createdAt || "";
  const dateYmd = parseYMD(rawDate);

  const {
    items,
    invoiceHasMissingCost,
    totalLineDiscount,
    totalLineAmount,
    totalLineCogs,
  } = evaluateInvoiceLineItems(invoice, inventoryItems, purchaseBills);

  // Avoid double counting: totals.discount in USV typically includes row discounts
  const recordedTotalDiscount = Number(
    invoice.totals?.discount ?? invoice.totals?.totalDiscount ?? invoice.form?.discount ?? invoice.discountAmount ?? 0
  );
  const totalDiscount = Math.max(totalLineDiscount, recordedTotalDiscount);

  // Final Net Sales Amount for this Invoice
  const invoiceTotal = Number(
    invoice.totals?.finalTotal ??
      invoice.totals?.grandTotal ??
      invoice.totalAmount ??
      invoice.amount ??
      totalLineAmount
  );

  const profit = invoiceHasMissingCost ? null : invoiceTotal - totalLineCogs;

  return {
    id: invoice.id || invoice.invoiceId || invoiceNumber,
    invoiceNumber,
    rawDate,
    dateYmd,
    formattedDate: formatDateDisplay(rawDate),
    items,
    totalDiscount,
    saleAmount: invoiceTotal,
    cogs: totalLineCogs,
    profit,
    hasMissingCost: invoiceHasMissingCost,
    isCancelled: Boolean(invoice.cancelled || invoice.status === "Cancelled"),
  };
}

/**
 * Calculates party-wise profitability over a specified date range.
 *
 * @param {object} options
 * @param {Array} options.salesInvoices - All sales invoices
 * @param {Array} options.saleReturns - All sale returns (optional)
 * @param {Array} options.partiesMaster - All parties from partiesStorage
 * @param {Array} options.inventoryItems - Master inventory items for cost resolution
 * @param {Array} options.purchaseBills - Purchase bills for cost fallback
 * @param {string} options.from - Start date (YYYY-MM-DD)
 * @param {string} options.to - End date (YYYY-MM-DD)
 * @param {string} options.selectedPartyId - Optional filter by party ID or "All"
 * @param {boolean} options.onlyWithSales - If true, omits parties with 0 sales
 * @param {string} options.searchQuery - Search query to filter parties
 */
export function calculatePartyWiseProfit({
  salesInvoices = [],
  saleReturns = [],
  partiesMaster = [],
  inventoryItems = [],
  purchaseBills = [],
  from = "",
  to = "",
  selectedPartyId = "All",
  onlyWithSales = false,
  searchQuery = "",
} = {}) {
  const partyMap = new Map();

  // Helper to ensure party entry exists in map
  const getOrCreatePartyRecord = (partyMeta) => {
    const key = partyMeta.partyId || normalizePartyName(partyMeta.partyName);
    if (!partyMap.has(key)) {
      partyMap.set(key, {
        partyId: partyMeta.partyId,
        partyName: partyMeta.partyName,
        partyType: partyMeta.partyType || "Customer",
        phone: partyMeta.phone || "",
        email: partyMeta.email || "",
        invoices: [],
        returns: [],
        grossSales: 0,
        returnAmount: 0,
        netSales: 0,
        totalDiscount: 0,
        cogs: 0,
        grossProfit: 0,
        profitMargin: 0,
        hasMissingCost: false,
        missingCostItemNames: new Set(),
      });
    }
    return partyMap.get(key);
  };

  // 1. Initialize master parties so all registered parties can be reported
  if (Array.isArray(partiesMaster)) {
    for (const p of partiesMaster) {
      if (!p || typeof p !== "object") continue;
      getOrCreatePartyRecord({
        partyId: String(p.id),
        partyName: String(p.partyName || p.name || "Unnamed Party").trim(),
        partyType: p.partyType || p.type || "Customer",
        phone: p.phone || p.mobile || "",
        email: p.email || "",
      });
    }
  }

  // 2. Process Sales Invoices
  if (Array.isArray(salesInvoices)) {
    for (const inv of salesInvoices) {
      if (!inv || typeof inv !== "object") continue;

      // Skip cancelled or voided invoices
      if (inv.cancelled || inv.status === "Cancelled" || inv.isVoid) continue;

      const rawDate = inv.form?.invoiceDate || inv.invoiceDate || inv.date || inv.createdAt || "";
      const dateYmd = parseYMD(rawDate);

      // Date Range Filtering
      if (from && dateYmd && dateYmd < from) continue;
      if (to && dateYmd && dateYmd > to) continue;

      const partyMeta = matchPartyForInvoice(inv, partiesMaster);
      const partyRecord = getOrCreatePartyRecord(partyMeta);

      // Evaluate invoice line items and profit
      const evalInvoice = calculateInvoiceProfitForParty(inv, inventoryItems, purchaseBills);

      partyRecord.invoices.push(evalInvoice);
      partyRecord.grossSales += evalInvoice.saleAmount;
      partyRecord.totalDiscount += evalInvoice.totalDiscount;
      partyRecord.cogs += evalInvoice.cogs;

      if (evalInvoice.hasMissingCost) {
        partyRecord.hasMissingCost = true;
        for (const item of evalInvoice.items) {
          if (item.isCostMissing) {
            partyRecord.missingCostItemNames.add(item.itemName);
          }
        }
      }
    }
  }

  // 3. Process Sales Returns
  if (Array.isArray(saleReturns)) {
    for (const ret of saleReturns) {
      if (!ret || typeof ret !== "object") continue;
      if (ret.cancelled || ret.status === "Cancelled") continue;

      const rawDate = ret.date || ret.returnDate || ret.createdAt || "";
      const dateYmd = parseYMD(rawDate);

      if (from && dateYmd && dateYmd < from) continue;
      if (to && dateYmd && dateYmd > to) continue;

      const retPartyId = normalizeId(ret.partyId || ret.form?.partyId);
      const retPartyName = String(ret.partyName || ret.party || ret.customer || "").trim();

      let matchedParty = null;
      if (retPartyId && Array.isArray(partiesMaster)) {
        matchedParty = partiesMaster.find((p) => normalizeId(p.id) === retPartyId);
      }
      if (!matchedParty && retPartyName && Array.isArray(partiesMaster)) {
        const norm = normalizePartyName(retPartyName);
        matchedParty = partiesMaster.find((p) => normalizePartyName(p.partyName || p.name) === norm);
      }

      const partyMeta = matchedParty
        ? {
            partyId: String(matchedParty.id),
            partyName: String(matchedParty.partyName || matchedParty.name).trim(),
            partyType: matchedParty.partyType || "Customer",
          }
        : {
            partyId: retPartyId || `unregistered-${normalizePartyName(retPartyName)}`,
            partyName: retPartyName || "Cash Sale",
            partyType: "Customer",
          };

      const partyRecord = getOrCreatePartyRecord(partyMeta);

      const retAmount = Number(
        ret.totals?.finalTotal ?? ret.finalTotal ?? ret.totalAmount ?? ret.amount ?? 0
      );
      partyRecord.returnAmount += retAmount;

      // If return has rows, evaluate returned item COGS to deduct from COGS
      const retRows = ret.rows || ret.items || [];
      let returnCogs = 0;
      for (const r of retRows) {
        const qty = Number(r.qty ?? r.quantity ?? 1);
        const { purchasePrice } = resolveItemPurchaseCost(r, inventoryItems, purchaseBills);
        if (purchasePrice !== null && !isNaN(purchasePrice)) {
          returnCogs += qty * Number(purchasePrice);
        }
      }
      partyRecord.cogs = Math.max(0, partyRecord.cogs - returnCogs);
      partyRecord.returns.push({
        id: ret.id || `ret-${crypto.randomUUID()}`,
        returnNo: ret.returnNo || ret.invoiceNumber || "RET",
        dateYmd,
        amount: retAmount,
        returnCogs,
      });
    }
  }

  // 4. Compute Final Metrics per Party
  const allRows = Array.from(partyMap.values()).map((p) => {
    const netSales = Math.max(0, p.grossSales - p.returnAmount);
    const grossProfit = netSales - p.cogs;
    const profitMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

    return {
      partyId: p.partyId,
      partyName: p.partyName,
      partyType: p.partyType,
      phone: p.phone,
      email: p.email,
      invoicesCount: p.invoices.length,
      returnsCount: p.returns.length,
      grossSales: p.grossSales,
      returnAmount: p.returnAmount,
      totalSales: netSales,
      totalDiscount: p.totalDiscount,
      cogs: p.cogs,
      grossProfit,
      profitMargin,
      isProfit: grossProfit > 0,
      isLoss: grossProfit < 0,
      hasMissingCost: p.hasMissingCost,
      missingCostItems: Array.from(p.missingCostItemNames),
      invoices: p.invoices,
      returns: p.returns,
    };
  });

  // 5. Apply UI Filters (Party Filter, Sales Threshold, Search Query)
  let filtered = allRows;

  if (selectedPartyId && selectedPartyId !== "All") {
    filtered = filtered.filter(
      (r) => normalizeId(r.partyId) === normalizeId(selectedPartyId) || normalizePartyName(r.partyName) === normalizePartyName(selectedPartyId)
    );
  }

  if (onlyWithSales) {
    filtered = filtered.filter((r) => r.invoicesCount > 0 || r.totalSales > 0);
  }

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.partyName.toLowerCase().includes(q) ||
        (r.phone && r.phone.includes(q)) ||
        (r.email && r.email.toLowerCase().includes(q))
    );
  }

  // Sort: Parties with sales first, descending by Total Sales
  filtered.sort((a, b) => {
    if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales;
    return a.partyName.localeCompare(b.partyName);
  });

  // 6. Summary Aggregates (Strictly reconciling with filtered rows)
  const totalSales = filtered.reduce((sum, r) => sum + r.totalSales, 0);
  const totalCost = filtered.reduce((sum, r) => sum + r.cogs, 0);
  const totalDiscount = filtered.reduce((sum, r) => sum + r.totalDiscount, 0);
  const totalGrossProfit = totalSales - totalCost;
  const overallMargin = totalSales > 0 ? (totalGrossProfit / totalSales) * 100 : 0;
  const totalInvoices = filtered.reduce((sum, r) => sum + r.invoicesCount, 0);

  const summary = {
    totalSales,
    totalCost,
    totalGrossProfit,
    overallMargin,
    totalDiscount,
    totalInvoices,
    partiesCount: filtered.length,
    profitableCount: filtered.filter((r) => r.isProfit).length,
    lossCount: filtered.filter((r) => r.isLoss).length,
    missingCostCount: filtered.filter((r) => r.hasMissingCost).length,
  };

  return {
    rows: filtered,
    allParties: allRows,
    summary,
  };
}
