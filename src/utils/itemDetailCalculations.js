import { parseYMD } from "./billWiseProfit.js";
import { getPresetDateRange, formatDateDMY } from "./gstRateCalculations.js";

export { parseYMD, getPresetDateRange, formatDateDMY };

export function num(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export function roundQty(val) {
  const n = num(val);
  return Number(Math.round(n + "e4") + "e-4");
}

/**
 * Checks if a transaction is cancelled, deleted, or voided.
 */
export function isRecordCancelled(rec, uiActions = {}) {
  if (!rec) return true;
  if (rec.cancelled || rec.isCancelled || rec.deleted || rec.isDeleted) return true;
  const status = String(rec.status || "").trim().toLowerCase();
  if (
    status === "cancelled" ||
    status === "canceled" ||
    status === "void" ||
    status === "deleted"
  ) {
    return true;
  }
  const idStr = String(rec.id || rec.invoiceId || "");
  if (
    uiActions.cancelled &&
    typeof uiActions.cancelled === "object" &&
    uiActions.cancelled[idStr]
  ) {
    return true;
  }
  if (
    uiActions.deleted &&
    Array.isArray(uiActions.deleted) &&
    uiActions.deleted.map(String).includes(idStr)
  ) {
    return true;
  }
  return false;
}

/**
 * Tests whether a line item row matches the selected inventory item (by ID, Name, or Code).
 */
export function matchesItem(row, targetItem) {
  if (!row || !targetItem) return false;

  const targetName = String(
    targetItem.itemName || targetItem.name || ""
  ).trim().toLowerCase();
  const targetId = String(targetItem.id || "").trim();
  const targetCode = String(targetItem.itemCode || targetItem.code || "").trim().toLowerCase();

  const rowItemId = String(row.sourceItemId || row.itemId || row.inventoryItemId || "").trim();
  if (targetId && rowItemId && rowItemId === targetId) {
    return true;
  }

  const rowName = String(row.item || row.itemName || row.name || "").trim().toLowerCase();
  if (targetName && rowName && rowName === targetName) {
    return true;
  }

  const rowCode = String(row.itemCode || row.code || "").trim().toLowerCase();
  if (targetCode && rowCode && rowCode === targetCode) {
    return true;
  }

  return false;
}

/**
 * Calculates item stock movements and daily running balance for the Item Detail Report.
 */
export function calculateItemDetailMovements({
  selectedItem,
  sales = [],
  purchases = [],
  saleReturns = [],
  purchaseReturns = [],
  adjustments = [],
  from = "",
  to = "",
  hideInactiveDates = false,
  saleUiActions = {},
}) {
  if (!selectedItem) {
    return {
      openingQty: 0,
      periodOpeningQty: 0,
      totalSaleQty: 0,
      totalPurchaseQty: 0,
      totalAdjQty: 0,
      periodClosingQty: 0,
      rows: [],
      hasActivity: false,
    };
  }

  // Base opening quantity recorded when item was created
  const initialOpeningQty = Number(
    selectedItem.initialOpeningQuantity !== undefined &&
      selectedItem.initialOpeningQuantity !== ""
      ? selectedItem.initialOpeningQuantity
      : selectedItem.openingQuantity !== undefined &&
        selectedItem.openingQuantity !== ""
      ? selectedItem.openingQuantity
      : selectedItem.stock || 0
  );

  // Daily bucket map: YYYY-MM-DD -> { saleQty, purchaseQty, adjQty }
  const daily = new Map();

  const getDayEntry = (dateStr) => {
    const ymd = parseYMD(dateStr);
    if (!ymd) return null;
    if (!daily.has(ymd)) {
      daily.set(ymd, { saleQty: 0, purchaseQty: 0, adjQty: 0 });
    }
    return { ymd, entry: daily.get(ymd) };
  };

  let beforeSale = 0;
  let beforePurchase = 0;
  let beforeAdj = 0;

  // 1. Process Sales (Outward stock movement)
  sales.forEach((s) => {
    if (isRecordCancelled(s, saleUiActions)) return;
    const d = parseYMD(
      s.form?.invoiceDate || s.invoiceDate || s.date || s.createdAt
    );
    (s.rows || []).forEach((r) => {
      if (!matchesItem(r, selectedItem)) return;
      const q = Math.max(num(r.qty || r.quantity), 0);
      if (from && d && d < from) {
        beforeSale += q;
      } else if (d) {
        const day = getDayEntry(d);
        if (day) day.entry.saleQty += q;
      }
    });
  });

  // 2. Process Sale Returns / Credit Notes (Inward stock movement - reduces net sales)
  (saleReturns || []).forEach((sr) => {
    if (isRecordCancelled(sr)) return;
    const d = parseYMD(sr.date || sr.createdAt);
    (sr.rows || []).forEach((r) => {
      if (!matchesItem(r, selectedItem)) return;
      const q = Math.max(num(r.qty || r.quantity), 0);
      if (from && d && d < from) {
        beforeSale -= q;
      } else if (d) {
        const day = getDayEntry(d);
        if (day) day.entry.saleQty -= q;
      }
    });
  });

  // 3. Process Purchases (Inward stock movement)
  purchases.forEach((p) => {
    if (isRecordCancelled(p)) return;
    const d = parseYMD(
      p.form?.billDate || p.form?.invoiceDate || p.billDate || p.date || p.createdAt
    );
    (p.rows || []).forEach((r) => {
      if (!matchesItem(r, selectedItem)) return;
      const q = Math.max(num(r.qty || r.quantity), 0);
      if (from && d && d < from) {
        beforePurchase += q;
      } else if (d) {
        const day = getDayEntry(d);
        if (day) day.entry.purchaseQty += q;
      }
    });
  });

  // 4. Process Purchase Returns / Debit Notes (Outward stock movement - reduces net purchases)
  (purchaseReturns || []).forEach((pr) => {
    if (isRecordCancelled(pr)) return;
    const d = parseYMD(pr.date || pr.createdAt);
    (pr.rows || []).forEach((r) => {
      if (!matchesItem(r, selectedItem)) return;
      const q = Math.max(num(r.qty || r.quantity), 0);
      if (from && d && d < from) {
        beforePurchase -= q;
      } else if (d) {
        const day = getDayEntry(d);
        if (day) day.entry.purchaseQty -= q;
      }
    });
  });

  // 5. Process Inventory Adjustments
  (adjustments || []).forEach((adj) => {
    if (!matchesItem(adj, selectedItem)) return;
    const d = parseYMD(adj.date || adj.createdAt);
    const q = num(adj.quantity || adj.qty);
    if (from && d && d < from) {
      beforeAdj += q;
    } else if (d) {
      const day = getDayEntry(d);
      if (day) day.entry.adjQty += q;
    }
  });

  // Opening quantity as of `from` date
  const periodOpeningQty = roundQty(
    initialOpeningQty + beforePurchase - beforeSale + beforeAdj
  );

  // Generate sequence of dates from `from` to `to`
  let startDate;
  let endDate;

  if (from) {
    const [fy, fm, fd] = from.split("-").map(Number);
    startDate = new Date(fy, fm - 1, fd);
  } else {
    // If no from date specified, start from earliest activity or beginning of current month
    const dates = Array.from(daily.keys()).sort();
    if (dates.length > 0) {
      const [fy, fm, fd] = dates[0].split("-").map(Number);
      startDate = new Date(fy, fm - 1, fd);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  if (to) {
    const [ty, tm, td] = to.split("-").map(Number);
    endDate = new Date(ty, tm - 1, td);
  } else {
    const now = new Date();
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  const resultRows = [];
  let runningClosing = periodOpeningQty;
  let periodTotalSale = 0;
  let periodTotalPurchase = 0;
  let periodTotalAdj = 0;

  const cur = new Date(startDate);
  // Guard against runaway loop
  let safetyCounter = 0;
  const maxDays = 1500;

  while (cur <= endDate && safetyCounter < maxDays) {
    safetyCounter++;
    const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    const dayData = daily.get(ymd) || { saleQty: 0, purchaseQty: 0, adjQty: 0 };

    runningClosing = roundQty(
      runningClosing + dayData.purchaseQty - dayData.saleQty + dayData.adjQty
    );

    periodTotalSale += dayData.saleQty;
    periodTotalPurchase += dayData.purchaseQty;
    periodTotalAdj += dayData.adjQty;

    const hasActivity =
      dayData.saleQty !== 0 || dayData.purchaseQty !== 0 || dayData.adjQty !== 0;

    if (!hideInactiveDates || hasActivity) {
      resultRows.push({
        date: ymd,
        displayDate: formatDateDMY(ymd),
        saleQty: roundQty(dayData.saleQty),
        purchaseQty: roundQty(dayData.purchaseQty),
        adjQty: roundQty(dayData.adjQty),
        closingQty: runningClosing,
        hasActivity,
      });
    }

    cur.setDate(cur.getDate() + 1);
  }

  // Also include any active dates outside the generated sequence if `from`/`to` were open-ended
  if (safetyCounter >= maxDays) {
    console.warn("ItemDetail: date sequence exceeded max limit of 1500 days.");
  }

  return {
    openingQty: initialOpeningQty,
    periodOpeningQty,
    totalSaleQty: roundQty(periodTotalSale),
    totalPurchaseQty: roundQty(periodTotalPurchase),
    totalAdjQty: roundQty(periodTotalAdj),
    periodClosingQty: runningClosing,
    rows: resultRows,
    hasActivity:
      periodTotalSale !== 0 || periodTotalPurchase !== 0 || periodTotalAdj !== 0,
  };
}

/**
 * Calculates stock movements summary across all inventory items for the selected period.
 */
export function calculateAllItemsSummary({
  inventoryItems = [],
  sales = [],
  purchases = [],
  saleReturns = [],
  purchaseReturns = [],
  adjustments = [],
  from = "",
  to = "",
  saleUiActions = {},
}) {
  const byId = new Map();
  const byName = new Map();
  const byCode = new Map();

  const itemsList = (inventoryItems || []).map((item) => {
    const id = String(item.id || "").trim();
    const name = String(item.itemName || item.name || "").trim();
    const code = String(item.itemCode || item.code || "").trim();
    const category = String(item.category || "").trim();
    const unit = String(item.unit || item.baseUnit || "PCS").trim();
    const initialOpening = Number(
      item.initialOpeningQuantity !== undefined && item.initialOpeningQuantity !== ""
        ? item.initialOpeningQuantity
        : item.openingQuantity !== undefined && item.openingQuantity !== ""
        ? item.openingQuantity
        : item.stock || 0
    ) || 0;

    const entry = {
      raw: item,
      id,
      name,
      code,
      category,
      unit,
      initialOpening,
      beforeInward: 0,
      beforeOutward: 0,
      beforeAdj: 0,
      periodInward: 0,
      periodOutward: 0,
      periodAdj: 0,
    };

    if (id) byId.set(id, entry);
    if (name) byName.set(name.toLowerCase(), entry);
    if (code) byCode.set(code.toLowerCase(), entry);

    return entry;
  });

  const findItem = (row) => {
    if (!row) return null;
    const rowItemId = String(row.sourceItemId || row.itemId || row.inventoryItemId || "").trim();
    if (rowItemId && byId.has(rowItemId)) return byId.get(rowItemId);
    const rowName = String(row.item || row.itemName || row.name || "").trim().toLowerCase();
    if (rowName && byName.has(rowName)) return byName.get(rowName);
    const rowCode = String(row.itemCode || row.code || "").trim().toLowerCase();
    if (rowCode && byCode.has(rowCode)) return byCode.get(rowCode);
    return null;
  };

  // 1. Sales
  (sales || []).forEach((s) => {
    if (isRecordCancelled(s, saleUiActions)) return;
    const d = parseYMD(s.form?.invoiceDate || s.invoiceDate || s.date || s.createdAt);
    (s.rows || []).forEach((r) => {
      const target = findItem(r);
      if (!target) return;
      const q = Math.max(num(r.qty || r.quantity), 0);
      if (from && d && d < from) {
        target.beforeOutward += q;
      } else if ((!from || !d || d >= from) && (!to || !d || d <= to)) {
        target.periodOutward += q;
      }
    });
  });

  // 2. Sale Returns
  (saleReturns || []).forEach((sr) => {
    if (isRecordCancelled(sr)) return;
    const d = parseYMD(sr.date || sr.createdAt);
    (sr.rows || []).forEach((r) => {
      const target = findItem(r);
      if (!target) return;
      const q = Math.max(num(r.qty || r.quantity), 0);
      if (from && d && d < from) {
        target.beforeOutward -= q;
      } else if ((!from || !d || d >= from) && (!to || !d || d <= to)) {
        target.periodOutward -= q;
      }
    });
  });

  // 3. Purchases
  (purchases || []).forEach((p) => {
    if (isRecordCancelled(p)) return;
    const d = parseYMD(p.form?.billDate || p.form?.invoiceDate || p.billDate || p.date || p.createdAt);
    (p.rows || []).forEach((r) => {
      const target = findItem(r);
      if (!target) return;
      const q = Math.max(num(r.qty || r.quantity), 0);
      if (from && d && d < from) {
        target.beforeInward += q;
      } else if ((!from || !d || d >= from) && (!to || !d || d <= to)) {
        target.periodInward += q;
      }
    });
  });

  // 4. Purchase Returns
  (purchaseReturns || []).forEach((pr) => {
    if (isRecordCancelled(pr)) return;
    const d = parseYMD(pr.date || pr.createdAt);
    (pr.rows || []).forEach((r) => {
      const target = findItem(r);
      if (!target) return;
      const q = Math.max(num(r.qty || r.quantity), 0);
      if (from && d && d < from) {
        target.beforeInward -= q;
      } else if ((!from || !d || d >= from) && (!to || !d || d <= to)) {
        target.periodInward -= q;
      }
    });
  });

  // 5. Adjustments
  (adjustments || []).forEach((adj) => {
    const target = findItem(adj);
    if (!target) return;
    const d = parseYMD(adj.date || adj.createdAt);
    const q = num(adj.quantity || adj.qty);
    if (from && d && d < from) {
      target.beforeAdj += q;
    } else if ((!from || !d || d >= from) && (!to || !d || d <= to)) {
      target.periodAdj += q;
    }
  });

  // Consolidate rows
  const rows = itemsList.map((item) => {
    const periodOpeningQty = roundQty(
      item.initialOpening + item.beforeInward - item.beforeOutward + item.beforeAdj
    );
    const periodClosingQty = roundQty(
      periodOpeningQty + item.periodInward - item.periodOutward + item.periodAdj
    );
    const totalInward = roundQty(item.periodInward);
    const totalOutward = roundQty(item.periodOutward);
    const totalAdj = roundQty(item.periodAdj);
    const hasActivity = totalInward !== 0 || totalOutward !== 0 || totalAdj !== 0;

    return {
      id: item.id,
      name: item.name,
      itemName: item.name,
      code: item.code,
      category: item.category,
      unit: item.unit,
      initialOpening: item.initialOpening,
      periodOpeningQty,
      totalInward,
      totalPurchaseQty: totalInward,
      totalOutward,
      totalSaleQty: totalOutward,
      totalAdj,
      totalAdjQty: totalAdj,
      periodClosingQty,
      hasActivity,
      raw: item.raw,
    };
  });

  const totalOpeningQty = roundQty(rows.reduce((sum, r) => sum + r.periodOpeningQty, 0));
  const totalInwardQty = roundQty(rows.reduce((sum, r) => sum + r.totalInward, 0));
  const totalOutwardQty = roundQty(rows.reduce((sum, r) => sum + r.totalOutward, 0));
  const totalAdjQty = roundQty(rows.reduce((sum, r) => sum + r.totalAdj, 0));
  const totalClosingQty = roundQty(rows.reduce((sum, r) => sum + r.periodClosingQty, 0));

  return {
    rows,
    totalOpeningQty,
    totalInwardQty,
    totalOutwardQty,
    totalAdjQty,
    totalClosingQty,
    itemsWithMovementCount: rows.filter((r) => r.hasActivity).length,
    totalItemsCount: rows.length,
  };
}
