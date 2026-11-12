import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  FiPrinter,
  FiRefreshCw,
  FiSearch,
  FiChevronDown,
  FiChevronRight,
  FiAlertCircle,
  FiInfo,
  FiCheckCircle,
} from "react-icons/fi";
import { RiFileExcel2Line } from "react-icons/ri";
import * as XLSX from "xlsx";
import {
  loadSalesInvoices,
  loadPurchaseBills,
  loadBusinessItems,
} from "../../services/businessRecords.js";
import { getSaleInvoices } from "../../services/salesStorage.js";
import { getPurchaseBills } from "../../services/purchaseBillsStorage.js";
import { getSaleReturns } from "../../services/saleReturnsStorage.js";
import { getInventoryItems } from "../../services/itemsStorage.js";
import { getAppSettings } from "../../services/appSettingsStorage.js";

// Helper to parse dates in multiple formats into YYYY-MM-DD
function parseYMD(val) {
  if (!val) return "";
  if (typeof val === "string") {
    const s = val.trim();
    const ymd = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    }
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
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

function isValidCost(val) {
  if (val === null || val === undefined || val === "") return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num) && num > 0;
}

function normalizeName(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves historical purchase cost for an item row sold on invoiceDate.
 *
 * Cost Resolution Priority:
 * 1. Direct row snapshot (row.purchasePrice / row.costPrice) if explicitly saved on transaction row.
 * 2. Batch-specific costing: If row has batchNo, matches the purchase bill introducing that batch.
 * 3. Historical purchase bills: Looks up purchase bills for the item dated ON or BEFORE invoiceDate,
 *    selecting the most recent purchase bill prior to the sale.
 * 4. Item Master opening cost: Checks opening purchase price (atPrice or purchasePrice).
 * 5. Fallback: Any subsequent purchase bill if purchases occurred after the sale date.
 * 6. Missing: Returns unitCost: null, isMissing: true.
 */
function resolveHistoricalItemCost(
  row = {},
  invoiceDate = "",
  inventoryItems = [],
  purchaseBills = []
) {
  if (isValidCost(row.purchasePrice)) {
    return { unitCost: Number(row.purchasePrice), source: "Row Snapshot", isMissing: false };
  }
  if (isValidCost(row.costPrice)) {
    return { unitCost: Number(row.costPrice), source: "Row Snapshot", isMissing: false };
  }
  if (isValidCost(row.cost)) {
    return { unitCost: Number(row.cost), source: "Row Snapshot", isMissing: false };
  }

  const rowItemId = String(row.sourceItemId || row.itemId || row.productId || "").trim();
  const rowItemName = normalizeName(
    row.item || row.name || row.itemName || row.productName || row.itemNameSnapshot || ""
  );

  let matchedMasterItem = null;
  if (Array.isArray(inventoryItems) && inventoryItems.length > 0) {
    if (rowItemId) {
      matchedMasterItem = inventoryItems.find((it) => String(it.id || "").trim() === rowItemId);
    }
    if (!matchedMasterItem && rowItemName) {
      matchedMasterItem = inventoryItems.find(
        (it) => normalizeName(it.itemName || it.name) === rowItemName
      );
    }
  }

  const masterName = matchedMasterItem
    ? normalizeName(matchedMasterItem.itemName || matchedMasterItem.name)
    : "";
  const masterId = matchedMasterItem ? String(matchedMasterItem.id || "").trim() : "";

  // 1. Batch-wise matching
  const rowBatchNo = String(row.batchNo || "").trim();
  if (rowBatchNo && Array.isArray(purchaseBills) && purchaseBills.length > 0) {
    for (const bill of purchaseBills) {
      if (bill.cancelled || bill.status === "Cancelled") continue;
      for (const br of bill.rows || bill.items || []) {
        const brBatchNo = String(br.batchNo || "").trim();
        if (brBatchNo !== rowBatchNo) continue;
        const brItemId = String(br.sourceItemId || br.itemId || br.productId || "").trim();
        const brName = normalizeName(
          br.item || br.name || br.itemName || br.productName || br.itemNameSnapshot || ""
        );
        const isMatch =
          (rowItemId && brItemId && rowItemId === brItemId) ||
          (masterId && brItemId && masterId === brItemId) ||
          (rowItemName && brName && rowItemName === brName) ||
          (masterName && brName && masterName === brName);

        if (isMatch) {
          const candidateCost = [
            br.purchasePrice,
            br.price,
            br.rate,
            br.unitPrice,
            br.finalUnitPrice,
            br.costPrice,
            br.cost,
          ].find(isValidCost);
          if (candidateCost !== undefined) {
            return {
              unitCost: Number(candidateCost),
              source: `Batch (${rowBatchNo})`,
              isMissing: false,
              batchNo: rowBatchNo,
            };
          }
          const rawAmt = Number(br.amount ?? br.total ?? 0);
          const rawQty = Number(br.qty ?? br.quantity ?? 0);
          if (rawAmt > 0 && rawQty > 0) {
            return {
              unitCost: rawAmt / rawQty,
              source: `Batch (${rowBatchNo})`,
              isMissing: false,
              batchNo: rowBatchNo,
            };
          }
        }
      }
    }
  }

  // 2. Historical Purchase Bills: dated <= invoiceDate
  if (Array.isArray(purchaseBills) && purchaseBills.length > 0) {
    const priorBills = purchaseBills
      .filter((b) => !b.cancelled && b.status !== "Cancelled")
      .map((b) => ({
        bill: b,
        ymd: parseYMD(b.form?.billDate || b.form?.invoiceDate || b.billDate || b.date || b.createdAt),
      }))
      .filter(({ ymd }) => !invoiceDate || !ymd || ymd <= invoiceDate)
      .sort((a, b) => String(b.ymd).localeCompare(String(a.ymd)));

    for (const { bill } of priorBills) {
      for (const br of bill.rows || bill.items || []) {
        const brItemId = String(br.sourceItemId || br.itemId || br.productId || "").trim();
        const brName = normalizeName(
          br.item || br.name || br.itemName || br.productName || br.itemNameSnapshot || ""
        );
        const isMatch =
          (rowItemId && brItemId && rowItemId === brItemId) ||
          (masterId && brItemId && masterId === brItemId) ||
          (rowItemName && brName && rowItemName === brName) ||
          (masterName && brName && masterName === brName);

        if (isMatch) {
          const candidateCost = [
            br.purchasePrice,
            br.price,
            br.rate,
            br.unitPrice,
            br.finalUnitPrice,
            br.costPrice,
            br.cost,
          ].find(isValidCost);
          if (candidateCost !== undefined) {
            return {
              unitCost: Number(candidateCost),
              source: "Historical Purchase Bill",
              isMissing: false,
            };
          }
          const rawAmt = Number(br.amount ?? br.total ?? 0);
          const rawQty = Number(br.qty ?? br.quantity ?? 0);
          if (rawAmt > 0 && rawQty > 0) {
            return {
              unitCost: rawAmt / rawQty,
              source: "Historical Purchase Bill",
              isMissing: false,
            };
          }
        }
      }
    }
  }

  // 3. Inventory Master opening cost / atPrice / purchasePrice
  if (matchedMasterItem) {
    if (isValidCost(matchedMasterItem.atPrice)) {
      return {
        unitCost: Number(matchedMasterItem.atPrice),
        source: "Master Opening Cost",
        isMissing: false,
      };
    }
    if (isValidCost(matchedMasterItem.purchasePrice)) {
      return {
        unitCost: Number(matchedMasterItem.purchasePrice),
        source: "Master Purchase Price",
        isMissing: false,
      };
    }
  }

  // 4. Subsequent Purchase Bills (if items were purchased after date of sale)
  if (Array.isArray(purchaseBills) && purchaseBills.length > 0) {
    for (const bill of purchaseBills) {
      if (bill.cancelled || bill.status === "Cancelled") continue;
      for (const br of bill.rows || bill.items || []) {
        const brItemId = String(br.sourceItemId || br.itemId || br.productId || "").trim();
        const brName = normalizeName(
          br.item || br.name || br.itemName || br.productName || br.itemNameSnapshot || ""
        );
        const isMatch =
          (rowItemId && brItemId && rowItemId === brItemId) ||
          (masterId && brItemId && masterId === brItemId) ||
          (rowItemName && brName && rowItemName === brName) ||
          (masterName && brName && masterName === brName);

        if (isMatch) {
          const candidateCost = [
            br.purchasePrice,
            br.price,
            br.rate,
            br.unitPrice,
            br.finalUnitPrice,
            br.costPrice,
            br.cost,
          ].find(isValidCost);
          if (candidateCost !== undefined) {
            return {
              unitCost: Number(candidateCost),
              source: "Subsequent Purchase Bill",
              isMissing: false,
            };
          }
        }
      }
    }
  }

  // Cost genuinely missing or unrecorded
  return { unitCost: null, source: "Missing Cost", isMissing: true };
}

const defaultFrom = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const defaultTo = () => {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
};

export default function ItemCategoryWiseProfitAndLoss() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [period, setPeriod] = useState("This Month");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Raw data states
  const [salesInvoices, setSalesInvoices] = useState(() => getSaleInvoices());
  const [purchaseBills, setPurchaseBills] = useState(() => getPurchaseBills());
  const [inventoryItems, setInventoryItems] = useState(() => getInventoryItems());
  const [saleReturns, setSaleReturns] = useState(() => {
    try {
      return getSaleReturns();
    } catch {
      return [];
    }
  });

  // App settings for currency symbol & decimal formatting
  const appSettings = useMemo(() => getAppSettings(), []);
  const rawSym = String(appSettings.currencySymbol || "₹").trim();
  const currencySymbol = (!appSettings.multiCurrencyEnabled && (rawSym === "$" || rawSym === "USD" || !rawSym)) ? "₹" : (rawSym || "₹");
  const decimals = appSettings.amountDecimalPlaces ?? 2;

  const fmtCurrency = useCallback(
    (num) => {
      const val = Number(num || 0);
      return `${currencySymbol} ${val.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}`;
    },
    [currencySymbol, decimals]
  );

  const fmtQty = (num) => {
    const val = Number(num || 0);
    return val.toLocaleString("en-IN");
  };

  // Synchronize data from backend APIs and local storage
  const syncData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [sales, purchases, items] = await Promise.all([
        loadSalesInvoices().catch(() => getSaleInvoices()),
        loadPurchaseBills().catch(() => getPurchaseBills()),
        loadBusinessItems().catch(() => getInventoryItems()),
      ]);
      setSalesInvoices(sales || []);
      setPurchaseBills(purchases || []);
      setInventoryItems(items || []);
    } catch {
      setSalesInvoices(getSaleInvoices());
      setPurchaseBills(getPurchaseBills());
      setInventoryItems(getInventoryItems());
    } finally {
      try {
        setSaleReturns(getSaleReturns());
      } catch {
        setSaleReturns([]);
      }
      setIsRefreshing(false);
    }
  }, []);

  // Initial load and event listeners for real-time synchronization
  useEffect(() => {
    syncData();
    const handleDataChange = () => {
      syncData();
      setRefreshTrigger((k) => k + 1);
    };
    window.addEventListener("ledgerly:business-data-changed", handleDataChange);
    window.addEventListener("storage", handleDataChange);
    return () => {
      window.removeEventListener("ledgerly:business-data-changed", handleDataChange);
      window.removeEventListener("storage", handleDataChange);
    };
  }, [syncData]);

  // Handle Quick Date Period changes
  const handlePeriodChange = (preset) => {
    setPeriod(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === "This Month") {
      setFrom(`${y}-${String(m + 1).padStart(2, "0")}-01`);
      const last = new Date(y, m + 1, 0).getDate();
      setTo(`${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`);
    } else if (preset === "Last Month") {
      const lm = m === 0 ? 11 : m - 1;
      const ly = m === 0 ? y - 1 : y;
      setFrom(`${ly}-${String(lm + 1).padStart(2, "0")}-01`);
      const last = new Date(ly, lm + 1, 0).getDate();
      setTo(`${ly}-${String(lm + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`);
    } else if (preset === "This Quarter") {
      const qStartMonth = Math.floor(m / 3) * 3;
      setFrom(`${y}-${String(qStartMonth + 1).padStart(2, "0")}-01`);
      const qEndMonth = qStartMonth + 2;
      const last = new Date(y, qEndMonth + 1, 0).getDate();
      setTo(`${y}-${String(qEndMonth + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`);
    } else if (preset === "This Year") {
      setFrom(`${y}-01-01`);
      setTo(`${y}-12-31`);
    } else if (preset === "All Time") {
      setFrom("");
      setTo("");
    }
  };

  // Toggle Category Accordion Expansion
  const toggleExpand = (categoryName) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) next.delete(categoryName);
      else next.add(categoryName);
      return next;
    });
  };

  // Expand or Collapse All
  const toggleExpandAll = () => {
    if (expandedCategories.size > 0) {
      setExpandedCategories(new Set());
    } else {
      setExpandedCategories(new Set(categoryRows.map((c) => c.category)));
    }
  };

  // ─── MAIN PROFIT & LOSS AGGREGATION ENGINE ───
  const { categoryRows, allCategoriesList, totals, totalMissingCostItems } = useMemo(() => {
    const categoryMap = new Map();
    let missingCostCount = 0;

    const getCategoryAndItem = (row) => {
      const rowItemId = String(row.sourceItemId || row.itemId || row.productId || "").trim();
      const rowItemName = normalizeName(
        row.item || row.name || row.itemName || row.productName || row.itemNameSnapshot || ""
      );

      let invItem = null;
      if (rowItemId) {
        invItem = inventoryItems.find((it) => String(it.id || "").trim() === rowItemId);
      }
      if (!invItem && rowItemName) {
        invItem = inventoryItems.find(
          (it) => normalizeName(it.itemName || it.name) === rowItemName
        );
      }

      const category = String(invItem?.category || "").trim() || "Uncategorized";
      const canonicalName = invItem?.itemName || invItem?.name || row.item || "Unknown Item";
      const canonicalId = invItem?.id || rowItemId || canonicalName;
      return { category, canonicalId, canonicalName, invItem };
    };

    const getCatEntry = (categoryName) => {
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          category: categoryName,
          soldItemIds: new Set(),
          qtySold: 0,
          grossSales: 0,
          salesDiscount: 0,
          salesReturns: 0,
          cogs: 0,
          hasMissingCost: false,
          missingItemsCount: 0,
          itemsMap: new Map(),
        });
      }
      return categoryMap.get(categoryName);
    };

    const getItemEntry = (catEntry, itemId, itemName) => {
      if (!catEntry.itemsMap.has(itemId)) {
        catEntry.itemsMap.set(itemId, {
          id: itemId,
          name: itemName,
          qtySold: 0,
          grossSales: 0,
          salesDiscount: 0,
          salesReturns: 0,
          cogs: 0,
          costSource: "",
          unitCost: null,
          hasMissingCost: false,
        });
      }
      return catEntry.itemsMap.get(itemId);
    };

    // 1. Process Sales Invoices
    salesInvoices.forEach((invoice) => {
      if (
        invoice.cancelled ||
        invoice.status === "Cancelled" ||
        invoice.deleted ||
        invoice.isDeleted
      ) {
        return;
      }
      const invDate = parseYMD(
        invoice.form?.invoiceDate || invoice.invoiceDate || invoice.date || invoice.createdAt
      );
      if (from && invDate && invDate < from) return;
      if (to && invDate && invDate > to) return;

      (invoice.rows || []).forEach((row) => {
        const qty = Math.max(Number(row.qty ?? row.quantity ?? 0), 0);
        if (qty <= 0) return;
        const { category, canonicalId, canonicalName } = getCategoryAndItem(row);
        const catEntry = getCatEntry(category);
        const itemEntry = getItemEntry(catEntry, canonicalId, canonicalName);

        const price = Number(row.price ?? row.rate ?? 0);
        const disc =
          Number(row.discountAmount || 0) ||
          (price * qty * Number(row.discountPercent || row.discount || 0)) / 100;
        const lineGross = price * qty;

        const { unitCost, isMissing, source } = resolveHistoricalItemCost(
          row,
          invDate,
          inventoryItems,
          purchaseBills
        );
        const lineCogs = isMissing ? 0 : unitCost * qty;

        catEntry.soldItemIds.add(canonicalId);
        catEntry.qtySold += qty;
        catEntry.grossSales += lineGross;
        catEntry.salesDiscount += disc;
        catEntry.cogs += lineCogs;

        itemEntry.qtySold += qty;
        itemEntry.grossSales += lineGross;
        itemEntry.salesDiscount += disc;
        itemEntry.cogs += lineCogs;
        itemEntry.costSource = source;
        itemEntry.unitCost = unitCost;

        if (isMissing) {
          if (!itemEntry.hasMissingCost) {
            itemEntry.hasMissingCost = true;
            catEntry.hasMissingCost = true;
            catEntry.missingItemsCount += 1;
            missingCostCount += 1;
          }
        }
      });
    });

    // 2. Process Sales Returns (Credit Notes)
    saleReturns.forEach((ret) => {
      if (ret.cancelled || ret.status === "Cancelled" || ret.deleted || ret.isDeleted) return;
      const retDate = parseYMD(ret.form?.invoiceDate || ret.date || ret.createdAt);
      if (from && retDate && retDate < from) return;
      if (to && retDate && retDate > to) return;

      (ret.rows || []).forEach((row) => {
        const qty = Math.max(Number(row.qty ?? row.quantity ?? 0), 0);
        if (qty <= 0) return;
        const { category, canonicalId, canonicalName } = getCategoryAndItem(row);
        const catEntry = getCatEntry(category);
        const itemEntry = getItemEntry(catEntry, canonicalId, canonicalName);

        const price = Number(row.price ?? row.rate ?? 0);
        const disc =
          Number(row.discountAmount || 0) ||
          (price * qty * Number(row.discount || row.discountPercent || 0)) / 100;
        const lineGross = price * qty;
        const netReturnVal = Math.max(0, lineGross - disc);

        const { unitCost, isMissing } = resolveHistoricalItemCost(
          row,
          retDate,
          inventoryItems,
          purchaseBills
        );
        const returnCogs = isMissing ? 0 : unitCost * qty;

        catEntry.qtySold -= qty;
        catEntry.salesReturns += netReturnVal;
        catEntry.cogs = Math.max(0, catEntry.cogs - returnCogs);

        itemEntry.qtySold -= qty;
        itemEntry.salesReturns += netReturnVal;
        itemEntry.cogs = Math.max(0, itemEntry.cogs - returnCogs);
      });
    });

    // 3. Finalize Categories & Items
    const categories = Array.from(categoryMap.values()).map((cat) => {
      const netSales = cat.grossSales - cat.salesDiscount - cat.salesReturns;
      const grossProfit = netSales - cat.cogs;
      const profitMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

      const items = Array.from(cat.itemsMap.values()).map((it) => {
        const itNetSales = it.grossSales - it.salesDiscount - it.salesReturns;
        const itGrossProfit = itNetSales - it.cogs;
        const itMargin = itNetSales > 0 ? (itGrossProfit / itNetSales) * 100 : 0;
        return {
          ...it,
          netSales: itNetSales,
          grossProfit: itGrossProfit,
          profitMargin: itMargin,
        };
      });

      // Sort items by Net Sales descending
      items.sort((a, b) => b.netSales - a.netSales);

      return {
        category: cat.category,
        itemsCount: cat.soldItemIds.size,
        qtySold: cat.qtySold,
        grossSales: cat.grossSales,
        salesDiscount: cat.salesDiscount,
        salesReturns: cat.salesReturns,
        netSales,
        cogs: cat.cogs,
        grossProfit,
        profitMargin,
        hasMissingCost: cat.hasMissingCost,
        missingItemsCount: cat.missingItemsCount,
        items,
      };
    });

    // Sort categories by Net Sales descending
    categories.sort((a, b) => b.netSales - a.netSales);

    const allCatList = categories.map((c) => c.category);

    // Filter categories based on dropdown and live search
    const filteredCategories = categories.filter((cat) => {
      if (selectedCategory !== "ALL" && cat.category !== selectedCategory) return false;
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const catMatch = cat.category.toLowerCase().includes(query);
        const itemMatch = cat.items.some((it) => it.name.toLowerCase().includes(query));
        return catMatch || itemMatch;
      }
      return true;
    });

    // Grand Totals across filtered categories
    const grandTotals = filteredCategories.reduce(
      (acc, cat) => {
        acc.itemsCount += cat.itemsCount;
        acc.qtySold += cat.qtySold;
        acc.grossSales += cat.grossSales;
        acc.salesDiscount += cat.salesDiscount;
        acc.salesReturns += cat.salesReturns;
        acc.netSales += cat.netSales;
        acc.cogs += cat.cogs;
        acc.grossProfit += cat.grossProfit;
        return acc;
      },
      {
        itemsCount: 0,
        qtySold: 0,
        grossSales: 0,
        salesDiscount: 0,
        salesReturns: 0,
        netSales: 0,
        cogs: 0,
        grossProfit: 0,
      }
    );

    grandTotals.profitMargin =
      grandTotals.netSales > 0 ? (grandTotals.grossProfit / grandTotals.netSales) * 100 : 0;

    return {
      categoryRows: filteredCategories,
      allCategoriesList: allCatList,
      totals: grandTotals,
      totalMissingCostItems: missingCostCount,
    };
  }, [salesInvoices, purchaseBills, saleReturns, inventoryItems, from, to, selectedCategory, search]);

  // Excel Export Handler
  const handleExportExcel = () => {
    // Sheet 1: Category Summary
    const summaryData = [
      [
        "Item Category",
        "Items Sold",
        "Qty Sold",
        "Gross Sales",
        "Sales Discount",
        "Sales Returns",
        "Net Sales",
        "COGS",
        "Gross Profit",
        "Margin (%)",
        "Cost Status",
      ],
      ...categoryRows.map((cat) => [
        cat.category,
        cat.itemsCount,
        cat.qtySold,
        cat.grossSales,
        cat.salesDiscount,
        cat.salesReturns,
        cat.netSales,
        cat.cogs,
        cat.grossProfit,
        `${cat.profitMargin.toFixed(2)}%`,
        cat.hasMissingCost ? "Unrecorded Cost" : "Verified",
      ]),
      [
        "Total",
        totals.itemsCount,
        totals.qtySold,
        totals.grossSales,
        totals.salesDiscount,
        totals.salesReturns,
        totals.netSales,
        totals.cogs,
        totals.grossProfit,
        `${totals.profitMargin.toFixed(2)}%`,
        totalMissingCostItems > 0 ? `${totalMissingCostItems} items missing cost` : "All Verified",
      ],
    ];

    // Sheet 2: Item Details Breakdown
    const itemData = [
      [
        "Item Category",
        "Item Name",
        "Qty Sold",
        "Gross Sales",
        "Sales Discount",
        "Sales Returns",
        "Net Sales",
        "COGS",
        "Gross Profit",
        "Margin (%)",
        "Cost Source",
      ],
      ...categoryRows.flatMap((cat) =>
        cat.items.map((it) => [
          cat.category,
          it.name,
          it.qtySold,
          it.grossSales,
          it.salesDiscount,
          it.salesReturns,
          it.netSales,
          it.cogs,
          it.grossProfit,
          `${it.profitMargin.toFixed(2)}%`,
          it.hasMissingCost ? "Missing Cost" : it.costSource || "Verified",
        ])
      ),
    ];

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    const wsItems = XLSX.utils.aoa_to_sheet(itemData);

    XLSX.utils.book_append_sheet(wb, wsSummary, "Category Summary");
    XLSX.utils.book_append_sheet(wb, wsItems, "Item Details");

    const dateSuffix = from && to ? `_${from}_to_${to}` : "";
    XLSX.writeFile(wb, `Item_Category_Wise_Profit_and_Loss${dateSuffix}.xlsx`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 text-slate-800 text-xs">
      {/* ── Top Bar: Date presets, filters, search, refresh, print, export ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Preset Dropdown */}
          <div className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 shadow-2xs">
            <span className="font-medium text-slate-500">Period:</span>
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
            >
              <option value="This Month">This Month</option>
              <option value="Last Month">Last Month</option>
              <option value="This Quarter">This Quarter</option>
              <option value="This Year">This Year</option>
              <option value="All Time">All Time</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          {/* Date Range: From */}
          <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 shadow-2xs cursor-pointer hover:border-sky-500 transition-colors">
            <span className="text-slate-500 font-medium select-none">From:</span>
            <input
              type="date"
              value={from}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker();
                } catch {}
              }}
              onChange={(e) => {
                setPeriod("Custom");
                setFrom(e.target.value);
              }}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
            />
          </label>

          {/* Date Range: To */}
          <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 shadow-2xs cursor-pointer hover:border-sky-500 transition-colors">
            <span className="text-slate-500 font-medium select-none">To:</span>
            <input
              type="date"
              value={to}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker();
                } catch {}
              }}
              onChange={(e) => {
                setPeriod("Custom");
                setTo(e.target.value);
              }}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
            />
          </label>

          {/* Category Filter Dropdown */}
          <div className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 shadow-2xs">
            <span className="font-medium text-slate-500">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer max-w-[150px] truncate"
            >
              <option value="ALL">All Categories</option>
              {allCategoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Live Search */}
          <div className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 shadow-2xs focus-within:border-sky-500">
            <FiSearch className="text-slate-400 h-3.5 w-3.5" />
            <input
              type="text"
              placeholder="Search category or item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-slate-800 placeholder-slate-400 outline-none w-44"
            />
          </div>
        </div>

        {/* Actions: Refresh, Toggle Expand All, Export, Print */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={syncData}
            title="Refresh Report Data from Database"
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-sky-600" : ""}`} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            type="button"
            onClick={toggleExpandAll}
            title="Expand or Collapse All Categories"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            {expandedCategories.size > 0 ? "Collapse All" : "Expand All"}
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            title="Export Excel (.xlsx)"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-2xs hover:bg-emerald-100 transition-colors"
          >
            <RiFileExcel2Line className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            title="Print Report"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <FiPrinter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-white p-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Net Sales
          </p>
          <p className="mt-1 text-lg font-bold text-slate-800">{fmtCurrency(totals.netSales)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Gross: {fmtCurrency(totals.grossSales)} | Returns: {fmtCurrency(totals.salesReturns)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Cost of Goods Sold (COGS)
          </p>
          <p className="mt-1 text-lg font-bold text-amber-700">{fmtCurrency(totals.cogs)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {totals.qtySold} total units sold net
          </p>
        </div>

        <div
          className={`rounded-lg border p-3 shadow-2xs ${
            totals.grossProfit >= 0
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-rose-200 bg-rose-50/40"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Gross Profit / Loss
          </p>
          <p
            className={`mt-1 text-lg font-bold ${
              totals.grossProfit >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {fmtCurrency(totals.grossProfit)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Net Sales minus historical COGS
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Profit Margin (%)
          </p>
          <p
            className={`mt-1 text-lg font-bold ${
              totals.profitMargin >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {totals.profitMargin.toFixed(2)}%
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Across {categoryRows.length} active categories
          </p>
        </div>
      </div>

      {/* ── Warning Banner for Missing Cost Items ── */}
      {totalMissingCostItems > 0 && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
          <FiAlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>Accounting Notice:</strong> {totalMissingCostItems} item(s) have no recorded
            purchase bill, opening purchase price, or batch cost. Missing costs are excluded from COGS
            rather than assumed to be zero, preventing false margin inflation. Check items marked with
            the warning badge below.
          </span>
        </div>
      )}

      {/* ── Table Container ── */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[980px] border-collapse text-left text-xs">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/90 backdrop-blur-xs font-semibold uppercase tracking-wider text-slate-600 text-[11px]">
              <th className="py-2.5 px-3 w-8"></th>
              <th className="py-2.5 px-3">Item Category</th>
              <th className="py-2.5 px-3 text-right">Items Sold</th>
              <th className="py-2.5 px-3 text-right">Qty Sold</th>
              <th className="py-2.5 px-3 text-right">Gross Sales</th>
              <th className="py-2.5 px-3 text-right">Discount</th>
              <th className="py-2.5 px-3 text-right">Returns</th>
              <th className="py-2.5 px-3 text-right">Net Sales</th>
              <th className="py-2.5 px-3 text-right">COGS</th>
              <th className="py-2.5 px-3 text-right">Gross Profit</th>
              <th className="py-2.5 px-3 text-right">Margin (%)</th>
              <th className="py-2.5 px-3 text-center">Cost Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categoryRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-12 text-center text-slate-400">
                  <FiInfo className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  <p className="font-medium text-slate-600">No category transactions found</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Adjust the date range or ensure sale invoices have been created.
                  </p>
                </td>
              </tr>
            ) : (
              categoryRows.map((cat) => {
                const isExpanded = expandedCategories.has(cat.category);
                return (
                  <React.Fragment key={cat.category}>
                    {/* Category Row */}
                    <tr
                      onClick={() => toggleExpand(cat.category)}
                      className="group cursor-pointer hover:bg-slate-50/80 transition-colors font-medium text-slate-800"
                    >
                      <td className="py-2.5 px-3 text-center text-slate-400 group-hover:text-slate-600">
                        {isExpanded ? (
                          <FiChevronDown className="h-4 w-4" />
                        ) : (
                          <FiChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 flex items-center gap-1.5">
                        <span>{cat.category}</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          ({cat.items.length} {cat.items.length === 1 ? "item" : "items"})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600">{cat.itemsCount}</td>
                      <td className="py-2.5 px-3 text-right font-medium">{fmtQty(cat.qtySold)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-600">
                        {fmtCurrency(cat.grossSales)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        {fmtCurrency(cat.salesDiscount)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-600">
                        {fmtCurrency(cat.salesReturns)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {fmtCurrency(cat.netSales)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-amber-700">
                        {fmtCurrency(cat.cogs)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          cat.grossProfit >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {fmtCurrency(cat.grossProfit)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          cat.profitMargin >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {cat.profitMargin.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {cat.hasMissingCost ? (
                          <span
                            title={`${cat.missingItemsCount} item(s) missing recorded purchase cost`}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                          >
                            <FiAlertCircle className="h-3 w-3" />
                            <span>Missing Cost</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                            <FiCheckCircle className="h-3 w-3" />
                            <span>Verified</span>
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Expandable Item-level Breakdown Sub-table */}
                    {isExpanded && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={12} className="p-0">
                          <div className="border-y border-slate-200 bg-slate-50/70 px-6 py-3">
                            <div className="mb-2 flex items-center justify-between">
                              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                Item Breakdown for {cat.category}
                              </h4>
                              <span className="text-[10px] text-slate-400">
                                Click category row to collapse
                              </span>
                            </div>
                            <table className="w-full border-collapse rounded-md border border-slate-200 bg-white text-[11px]">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-100/80 font-semibold text-slate-600">
                                  <th className="py-1.5 px-3">Item Name</th>
                                  <th className="py-1.5 px-3 text-right">Qty Sold</th>
                                  <th className="py-1.5 px-3 text-right">Gross Sales</th>
                                  <th className="py-1.5 px-3 text-right">Discount</th>
                                  <th className="py-1.5 px-3 text-right">Returns</th>
                                  <th className="py-1.5 px-3 text-right">Net Sales</th>
                                  <th className="py-1.5 px-3 text-right">Unit Cost</th>
                                  <th className="py-1.5 px-3 text-right">COGS</th>
                                  <th className="py-1.5 px-3 text-right">Profit / Loss</th>
                                  <th className="py-1.5 px-3 text-right">Margin (%)</th>
                                  <th className="py-1.5 px-3 text-center">Cost Source</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {cat.items.map((it) => (
                                  <tr key={it.id} className="hover:bg-slate-50/60">
                                    <td className="py-1.5 px-3 font-medium text-slate-800">
                                      {it.name}
                                    </td>
                                    <td className="py-1.5 px-3 text-right">{fmtQty(it.qtySold)}</td>
                                    <td className="py-1.5 px-3 text-right text-slate-600">
                                      {fmtCurrency(it.grossSales)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-slate-500">
                                      {fmtCurrency(it.salesDiscount)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-rose-600">
                                      {fmtCurrency(it.salesReturns)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-semibold text-slate-800">
                                      {fmtCurrency(it.netSales)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-slate-600">
                                      {it.hasMissingCost ? (
                                        <span className="text-amber-600 font-medium">Unrecorded</span>
                                      ) : (
                                        fmtCurrency(it.unitCost)
                                      )}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-amber-700">
                                      {fmtCurrency(it.cogs)}
                                    </td>
                                    <td
                                      className={`py-1.5 px-3 text-right font-semibold ${
                                        it.grossProfit >= 0 ? "text-emerald-700" : "text-rose-700"
                                      }`}
                                    >
                                      {fmtCurrency(it.grossProfit)}
                                    </td>
                                    <td
                                      className={`py-1.5 px-3 text-right ${
                                        it.profitMargin >= 0 ? "text-emerald-700" : "text-rose-700"
                                      }`}
                                    >
                                      {it.profitMargin.toFixed(2)}%
                                    </td>
                                    <td className="py-1.5 px-3 text-center text-slate-500">
                                      {it.hasMissingCost ? (
                                        <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                                          Missing Cost
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-slate-600">
                                          {it.costSource || "Verified"}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>

          {/* ── Table Footer Totals ── */}
          {categoryRows.length > 0 && (
            <tfoot>
              <tr className="sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3 uppercase tracking-wider">Total / Grand Summary</td>
                <td className="py-3 px-3 text-right">{totals.itemsCount}</td>
                <td className="py-3 px-3 text-right">{fmtQty(totals.qtySold)}</td>
                <td className="py-3 px-3 text-right">{fmtCurrency(totals.grossSales)}</td>
                <td className="py-3 px-3 text-right">{fmtCurrency(totals.salesDiscount)}</td>
                <td className="py-3 px-3 text-right text-rose-600">{fmtCurrency(totals.salesReturns)}</td>
                <td className="py-3 px-3 text-right">{fmtCurrency(totals.netSales)}</td>
                <td className="py-3 px-3 text-right text-amber-800">{fmtCurrency(totals.cogs)}</td>
                <td
                  className={`py-3 px-3 text-right ${
                    totals.grossProfit >= 0 ? "text-emerald-800" : "text-rose-800"
                  }`}
                >
                  {fmtCurrency(totals.grossProfit)}
                </td>
                <td
                  className={`py-3 px-3 text-right ${
                    totals.profitMargin >= 0 ? "text-emerald-800" : "text-rose-800"
                  }`}
                >
                  {totals.profitMargin.toFixed(2)}%
                </td>
                <td className="py-3 px-3 text-center text-[10px]">
                  {totalMissingCostItems > 0 ? (
                    <span className="text-amber-700">{totalMissingCostItems} Unrecorded</span>
                  ) : (
                    <span className="text-emerald-700">All Verified</span>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
