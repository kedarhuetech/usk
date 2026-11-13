import React, { useMemo, useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  FiChevronDown,
  FiPrinter,
  FiX,
  FiSearch,
  FiArrowUp,
  FiArrowDown,
  FiBox,
  FiTrendingUp,
  FiTrendingDown,
  FiLayers,
  FiFilter,
  FiEye,
  FiList,
} from "react-icons/fi";
import { RiFileExcel2Line } from "react-icons/ri";
import * as XLSX from "xlsx";
import { getInventoryItems } from "../../services/itemsStorage";
import {
  calculateItemDetailMovements,
  calculateAllItemsSummary,
  getPresetDateRange,
  formatDateDMY,
} from "../../utils/itemDetailCalculations.js";
import {
  buildUnifiedDocumentHtml,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";
import {
  readTransactionCollection,
  readTransactionValue,
  transactionStorageKeys,
} from "../../services/transactionRepository.js";

function readLocal(key) {
  try {
    return readTransactionCollection(key);
  } catch {
    return [];
  }
}

function readSaleUiActions() {
  try {
    return readTransactionValue(transactionStorageKeys.saleInvoiceUi, {});
  } catch {
    return {};
  }
}

export default function ItemDetailReport() {
  const location = useLocation();

  // Filters state
  const [period, setPeriod] = useState("This Month");
  const [dateRange, setDateRange] = useState(() => getPresetDateRange("This Month"));
  const [selectedItemName, setSelectedItemName] = useState(
    () => location.state?.itemName || location.state?.item || "ALL"
  );
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hideInactiveDates, setHideInactiveDates] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [sortAsc, setSortAsc] = useState(true); // true = oldest date first
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Sync with business data events
  useEffect(() => {
    const handler = () => setRefreshTrigger((k) => k + 1);
    window.addEventListener("ledgerly:business-data-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("ledgerly:business-data-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isDropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isDropdownOpen]);

  // 1. Transactions Data
  const sales = useMemo(() => readLocal("ledgerly:saleInvoices.v1"), [refreshTrigger]);
  const purchases = useMemo(() => readLocal("ledgerly:purchaseBills.v1"), [refreshTrigger]);
  const saleReturns = useMemo(() => readLocal("ledgerly:saleReturns.v1"), [refreshTrigger]);
  const purchaseReturns = useMemo(() => readLocal("ledgerly:purchaseReturns.v1"), [refreshTrigger]);
  const adjustments = useMemo(() => readLocal("ledgerly:inventoryAdjustments.v1"), [refreshTrigger]);
  const saleUiActions = useMemo(() => readSaleUiActions(), [refreshTrigger]);

  // 2. Comprehensive Inventory Items (from items master + any transactions)
  const inventoryItems = useMemo(() => {
    try {
      const items = (getInventoryItems() || []).filter((i) => i.type !== "service");
      const itemMap = new Map();
      items.forEach((item) => {
        const name = (item.itemName || item.name || "").trim();
        if (name) itemMap.set(name.toLowerCase(), item);
      });

      // Discover items from sales
      sales.forEach((s) => {
        (s.rows || []).forEach((r) => {
          const name = (r.item || r.itemName || r.name || "").trim();
          if (name && !itemMap.has(name.toLowerCase())) {
            itemMap.set(name.toLowerCase(), {
              id: r.itemId || r.sourceItemId || `item-${name}`,
              itemName: name,
              name,
              itemCode: r.itemCode || r.code || "",
              unit: r.unit || "PCS",
              stock: 0,
              type: "product",
            });
          }
        });
      });

      // Discover items from purchases
      purchases.forEach((p) => {
        (p.rows || []).forEach((r) => {
          const name = (r.item || r.itemName || r.name || "").trim();
          if (name && !itemMap.has(name.toLowerCase())) {
            itemMap.set(name.toLowerCase(), {
              id: r.itemId || r.sourceItemId || `item-${name}`,
              itemName: name,
              name,
              itemCode: r.itemCode || r.code || "",
              unit: r.unit || "PCS",
              stock: 0,
              type: "product",
            });
          }
        });
      });

      return Array.from(itemMap.values());
    } catch {
      return [];
    }
  }, [refreshTrigger, sales, purchases]);

  // Handle Preset Change
  const handlePresetChange = (preset) => {
    setPeriod(preset);
    if (preset !== "Custom") {
      setDateRange(getPresetDateRange(preset));
    }
  };

  const isAllMode = !selectedItemName || selectedItemName === "ALL";

  // Find currently selected item object (if not ALL)
  const currentItem = useMemo(() => {
    if (isAllMode) return null;
    const target = selectedItemName.trim().toLowerCase();
    return (
      inventoryItems.find(
        (i) => (i.itemName || i.name || "").trim().toLowerCase() === target
      ) || null
    );
  }, [inventoryItems, selectedItemName, isAllMode]);

  // Filter items in dropdown by itemSearchQuery (DECOUPLED from selectedItemName!)
  const filteredItemList = useMemo(() => {
    const q = (itemSearchQuery || "").trim().toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter((i) => {
      const name = (i.itemName || i.name || "").toLowerCase();
      const code = (i.itemCode || i.code || "").toLowerCase();
      const category = (i.category || "").toLowerCase();
      return name.includes(q) || code.includes(q) || category.includes(q);
    });
  }, [inventoryItems, itemSearchQuery]);

  // 3. Compute Movements for Single Item
  const movements = useMemo(() => {
    if (isAllMode || !currentItem) {
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
    return calculateItemDetailMovements({
      selectedItem: currentItem,
      sales,
      purchases,
      saleReturns,
      purchaseReturns,
      adjustments,
      from: dateRange.from,
      to: dateRange.to,
      hideInactiveDates,
      saleUiActions,
    });
  }, [
    isAllMode,
    currentItem,
    sales,
    purchases,
    saleReturns,
    purchaseReturns,
    adjustments,
    dateRange.from,
    dateRange.to,
    hideInactiveDates,
    saleUiActions,
  ]);

  // 4. Compute Movements across All Items
  const allItemsSummary = useMemo(() => {
    return calculateAllItemsSummary({
      inventoryItems,
      sales,
      purchases,
      saleReturns,
      purchaseReturns,
      adjustments,
      from: dateRange.from,
      to: dateRange.to,
      saleUiActions,
    });
  }, [
    inventoryItems,
    sales,
    purchases,
    saleReturns,
    purchaseReturns,
    adjustments,
    dateRange.from,
    dateRange.to,
    saleUiActions,
  ]);

  // Filtered rows for All Items table
  const filteredAllItemRows = useMemo(() => {
    const q = (tableSearchQuery || "").trim().toLowerCase();
    if (!q) return allItemsSummary.rows;
    return allItemsSummary.rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.code || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q)
    );
  }, [allItemsSummary.rows, tableSearchQuery]);

  // Sorted rows for Single Item table
  const sortedRows = useMemo(() => {
    return [...movements.rows].sort((a, b) => {
      const cmp = String(a.date || "").localeCompare(String(b.date || ""));
      return sortAsc ? cmp : -cmp;
    });
  }, [movements.rows, sortAsc]);

  // Export to Excel (Handles both Single Item & All Items overview)
  const handleExcel = () => {
    const wb = XLSX.utils.book_new();

    if (isAllMode) {
      const headerInfo = [
        ["Item Detail & Stock Movement Report (All Items)"],
        ["Period", `${dateRange.from || "All"} to ${dateRange.to || "All"}`],
        ["Total Items", allItemsSummary.totalItemsCount],
        ["Items With Movement", allItemsSummary.itemsWithMovementCount],
        [""],
        [
          "Item Name",
          "Item Code",
          "Category",
          "Unit",
          "Opening Stock",
          "Inward (Purchased)",
          "Outward (Sold)",
          "Adjustments",
          "Closing Stock",
        ],
      ];

      const dataRows = allItemsSummary.rows.map((r) => [
        r.name,
        r.code || "—",
        r.category || "General",
        r.unit,
        r.periodOpeningQty,
        r.totalInward,
        r.totalOutward,
        r.totalAdj,
        r.periodClosingQty,
      ]);

      const footerRow = [
        "Total",
        "",
        "",
        "",
        allItemsSummary.totalOpeningQty,
        allItemsSummary.totalInwardQty,
        allItemsSummary.totalOutwardQty,
        allItemsSummary.totalAdjQty,
        allItemsSummary.totalClosingQty,
      ];

      const ws = XLSX.utils.aoa_to_sheet([...headerInfo, ...dataRows, footerRow]);
      XLSX.utils.book_append_sheet(wb, ws, "All Items Detail");
      XLSX.writeFile(
        wb,
        `Item_Detail_All_Items_${dateRange.from || "all"}_to_${dateRange.to || "all"}.xlsx`
      );
    } else {
      const itemName = currentItem?.itemName || currentItem?.name || selectedItemName || "Item";
      const headerInfo = [
        ["Item Detail Report - Daily Stock Ledger"],
        ["Item Name", itemName],
        ["Item Code", currentItem?.itemCode || currentItem?.code || "—"],
        ["Category", currentItem?.category || "General"],
        ["Period", `${dateRange.from || "All"} to ${dateRange.to || "All"}`],
        ["Opening Stock (Start of Period)", movements.periodOpeningQty],
        [""],
        [
          "Date",
          "Sale Quantity (Outward)",
          "Purchase Quantity (Inward)",
          "Adjustment Quantity",
          "Closing Quantity",
        ],
      ];

      const dataRows = sortedRows.map((r) => [
        r.displayDate,
        r.saleQty,
        r.purchaseQty,
        r.adjQty,
        r.closingQty,
      ]);

      const footerRow = [
        "Total",
        movements.totalSaleQty,
        movements.totalPurchaseQty,
        movements.totalAdjQty,
        movements.periodClosingQty,
      ];

      const ws = XLSX.utils.aoa_to_sheet([...headerInfo, ...dataRows, footerRow]);
      XLSX.utils.book_append_sheet(wb, ws, "Daily Stock Ledger");

      const safeName = itemName.replace(/[^a-zA-Z0-9_-]/g, "_");
      XLSX.writeFile(
        wb,
        `Item_Detail_${safeName}_${dateRange.from || "all"}_to_${dateRange.to || "all"}.xlsx`
      );
    }
  };

  // Print Preview (Handles both Single Item & All Items overview)
  const handlePrint = () => {
    const dateSub =
      dateRange.from && dateRange.to
        ? `Period: ${formatDateDMY(dateRange.from)} to ${formatDateDMY(dateRange.to)}`
        : "Period: All Time";

    if (isAllMode) {
      const rows = allItemsSummary.rows.map((r, idx) => ({
        index: idx + 1,
        itemName: r.name,
        code: r.code || "—",
        category: r.category || "General",
        openingQty: r.periodOpeningQty,
        inwardQty: r.totalInward,
        outwardQty: r.totalOutward,
        adjQty: r.totalAdj,
        closingQty: r.periodClosingQty,
      }));

      const html = buildUnifiedDocumentHtml({
        title: "Item Detail Report (All Items)",
        documentNumber: `ITEM-ALL-${dateRange.from ? dateRange.from.replace(/-/g, "") : "ALL"}`,
        date: formatDateDMY(new Date().toISOString().slice(0, 10)),
        status: `All Items (${allItemsSummary.totalItemsCount} items)`,
        partyName: `Total Opening: ${allItemsSummary.totalOpeningQty} | Total Closing: ${allItemsSummary.totalClosingQty}`,
        columns: [
          { key: "index", label: "#", align: "center", width: "40px" },
          { key: "itemName", label: "Item Name", align: "left" },
          { key: "category", label: "Category", align: "left", width: "110px" },
          { key: "openingQty", label: "Opening", align: "right", width: "90px" },
          { key: "inwardQty", label: "Inward (+)", align: "right", width: "90px" },
          { key: "outwardQty", label: "Outward (-)", align: "right", width: "90px" },
          { key: "adjQty", label: "Adj", align: "right", width: "80px" },
          { key: "closingQty", label: "Closing", align: "right", width: "90px" },
        ],
        rows,
        totals: {
          subtotal: allItemsSummary.totalInwardQty,
          total: allItemsSummary.totalClosingQty,
        },
        notes: `${dateSub} | Total Opening: ${allItemsSummary.totalOpeningQty} | Inward: +${allItemsSummary.totalInwardQty} | Outward: -${allItemsSummary.totalOutwardQty} | Adj: ${allItemsSummary.totalAdjQty} | Final Closing: ${allItemsSummary.totalClosingQty}`,
        autoPrint: true,
      });

      openPrintWindow(html, true);
    } else {
      const itemName = currentItem?.itemName || currentItem?.name || selectedItemName || "Item";
      const rows = sortedRows.map((r, idx) => ({
        index: idx + 1,
        date: r.displayDate,
        saleQty: r.saleQty || 0,
        purchaseQty: r.purchaseQty || 0,
        adjQty: r.adjQty || 0,
        closingQty: r.closingQty,
      }));

      const html = buildUnifiedDocumentHtml({
        title: "Item Detail Report",
        documentNumber: `ITEM-${dateRange.from ? dateRange.from.replace(/-/g, "") : "ALL"}`,
        date: formatDateDMY(new Date().toISOString().slice(0, 10)),
        status: `Item: ${itemName}`,
        partyName: `Opening: ${movements.periodOpeningQty} | Closing: ${movements.periodClosingQty}`,
        columns: [
          { key: "index", label: "#", align: "center", width: "40px" },
          { key: "date", label: "Date", align: "center", width: "110px" },
          { key: "saleQty", label: "Sale Qty (Outward)", align: "right", width: "130px" },
          { key: "purchaseQty", label: "Purchase Qty (Inward)", align: "right", width: "130px" },
          { key: "adjQty", label: "Adjustment Qty", align: "right", width: "110px" },
          { key: "closingQty", label: "Closing Qty", align: "right", width: "110px" },
        ],
        rows,
        totals: {
          subtotal: movements.totalPurchaseQty,
          total: movements.periodClosingQty,
        },
        notes: `${dateSub} | Item: ${itemName} | Opening: ${movements.periodOpeningQty} | Total Inward: ${movements.totalPurchaseQty} | Total Outward: ${movements.totalSaleQty} | Net Adj: ${movements.totalAdjQty} | Final Closing Stock: ${movements.periodClosingQty}`,
        autoPrint: true,
      });

      openPrintWindow(html, true);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 text-slate-800 text-xs">
      {/* Top Header Bar */}
      <header className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">Item Detail Report</h1>
            {isAllMode ? (
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold text-slate-700">
                All Items Overview ({inventoryItems.length})
              </span>
            ) : (
              <span className="rounded-full bg-sky-100 px-3 py-0.5 text-xs font-semibold text-sky-800">
                {currentItem?.unit || "PCS"}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {isAllMode
              ? "Comprehensive stock movement ledger across all inventory items for the selected period."
              : `Day-by-day stock ledger tracking inward purchases, outward sales, inventory adjustments, and closing stock balance.`}
          </p>
        </div>

        {/* Excel & Print Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExcel}
            title="Export to Excel (.xlsx)"
            className="flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
          >
            <RiFileExcel2Line className="h-4 w-4" /> Export
          </button>
          <button
            type="button"
            onClick={handlePrint}
            title="Print report preview"
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
          >
            <FiPrinter className="h-4 w-4" /> Print
          </button>
        </div>
      </header>

      {/* Filter Toolbar & Item Selector */}
      <section className="border-b border-slate-200 bg-white px-5 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-4">
          {/* Item Selector Dropdown */}
          <div className="flex items-center gap-2" ref={dropdownRef}>
            <span className="font-semibold text-slate-600 text-xs whitespace-nowrap">
              Item Name:
            </span>
            <div className="relative">
              {/* Trigger Button */}
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen((prev) => !prev);
                  setItemSearchQuery("");
                }}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 outline-none hover:border-slate-400 focus:border-sky-500 min-w-[280px] max-w-[360px] text-left shadow-xs transition"
              >
                <span className="truncate">
                  {isAllMode ? (
                    <span className="font-semibold text-sky-700">
                      ★ All Items (Overview)
                    </span>
                  ) : currentItem ? (
                    <span>
                      {currentItem.itemName || currentItem.name}{" "}
                      <span className="text-slate-400 font-normal">
                        ({currentItem.unit || "PCS"})
                      </span>
                    </span>
                  ) : (
                    selectedItemName
                  )}
                </span>
                <div className="flex items-center gap-1 text-slate-400 shrink-0">
                  {!isAllMode && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItemName("ALL");
                      }}
                      className="p-0.5 hover:text-slate-600 transition"
                      title="Clear to All Items"
                    >
                      <FiX size={14} />
                    </span>
                  )}
                  <FiChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${
                      isDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {/* Floating Dropdown List */}
              {isDropdownOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-80 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl flex flex-col">
                  {/* Search Bar inside dropdown */}
                  <div className="border-b border-slate-100 bg-slate-50 p-2">
                    <div className="relative flex items-center">
                      <FiSearch className="absolute left-2.5 text-slate-400" size={13} />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={itemSearchQuery}
                        onChange={(e) => setItemSearchQuery(e.target.value)}
                        placeholder="Search items by name, code..."
                        className="w-full rounded border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-xs outline-none focus:border-sky-500"
                      />
                      {itemSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setItemSearchQuery("")}
                          className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5"
                        >
                          <FiX size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* List of items */}
                  <div className="overflow-y-auto max-h-64 py-1 divide-y divide-slate-50">
                    {/* Option 1: All Items Overview */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedItemName("ALL");
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center justify-between ${
                        isAllMode
                          ? "bg-sky-50 text-sky-700 font-bold border-l-4 border-sky-600"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-sky-100 text-sky-700 text-xs font-bold">
                          ★
                        </span>
                        <div>
                          <div className="font-semibold">All Items (Overview)</div>
                          <div className="text-[10px] text-slate-400">
                            Multi-item ledger summary
                          </div>
                        </div>
                      </div>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {inventoryItems.length} Items
                      </span>
                    </button>

                    {/* Section Header */}
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50/70">
                      Inventory Items ({filteredItemList.length})
                    </div>

                    {filteredItemList.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-slate-400 text-center">
                        No matching items found
                      </div>
                    ) : (
                      filteredItemList.map((item) => {
                        const name = item.itemName || item.name;
                        const isCurr =
                          !isAllMode &&
                          name.toLowerCase() === selectedItemName.trim().toLowerCase();
                        return (
                          <button
                            key={item.id || name}
                            type="button"
                            onClick={() => {
                              setSelectedItemName(name);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center justify-between ${
                              isCurr
                                ? "bg-sky-50 text-sky-700 font-bold border-l-4 border-sky-600"
                                : "hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="pr-2 min-w-0">
                              <div className="font-medium text-slate-800 truncate">
                                {name}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 truncate">
                                {item.itemCode && <span>Code: {item.itemCode}</span>}
                                {item.category && <span>• {item.category}</span>}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                Stock: {item.stock ?? 0} {item.unit || "PCS"}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Preset Selector */}
          <div className="relative">
            <select
              aria-label="Date preset selector"
              value={period}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="h-9 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
            >
              <option>Today</option>
              <option>This Month</option>
              <option>Last Month</option>
              <option>This Quarter</option>
              <option>This Year</option>
              <option>All Time</option>
              <option>Custom</option>
            </select>
            <FiChevronDown
              className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400"
              size={14}
            />
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
            <span className="text-slate-400">From</span>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => {
                setPeriod("Custom");
                setDateRange((prev) => ({ ...prev, from: e.target.value }));
              }}
              className="bg-transparent text-slate-700 outline-none text-xs cursor-pointer font-medium"
            />
            <span className="text-slate-400">To</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => {
                setPeriod("Custom");
                setDateRange((prev) => ({ ...prev, to: e.target.value }));
              }}
              className="bg-transparent text-slate-700 outline-none text-xs cursor-pointer font-medium"
            />
          </div>

          {/* Hide Inactive Dates Checkbox (for Single Item view) */}
          {!isAllMode && (
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={hideInactiveDates}
                onChange={(e) => setHideInactiveDates(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-sky-600 cursor-pointer"
              />
              <span>Hide inactive dates</span>
            </label>
          )}
        </div>
      </section>

      {/* Active Item Drilldown Bar */}
      {!isAllMode && currentItem && (
        <div className="mx-5 mt-4 flex items-center justify-between rounded-lg bg-sky-50 border border-sky-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
              Single Item View
            </span>
            <span className="font-bold text-slate-800 text-xs">
              {currentItem.itemName || currentItem.name}
            </span>
            {currentItem.itemCode && (
              <span className="text-slate-500 text-[11px]">
                (Code: {currentItem.itemCode})
              </span>
            )}
            {currentItem.category && (
              <span className="rounded bg-slate-200/70 px-2 py-0.5 text-[10px] text-slate-700 font-medium">
                {currentItem.category}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedItemName("ALL")}
            className="flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 underline cursor-pointer"
          >
            ← View All Items Overview
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <section className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card 1: Opening Stock */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Opening Stock
            </p>
            <p className="mt-1 text-2xl font-black text-slate-800">
              {isAllMode ? allItemsSummary.totalOpeningQty : movements.periodOpeningQty}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              At start of period
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <FiBox size={20} />
          </div>
        </div>

        {/* Card 2: Total Inward (Purchases) */}
        <div className="rounded-xl border border-sky-100 bg-white p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Inward (Purchased)
            </p>
            <p className="mt-1 text-2xl font-black text-sky-700">
              {(isAllMode ? allItemsSummary.totalInwardQty : movements.totalPurchaseQty) > 0
                ? `+${isAllMode ? allItemsSummary.totalInwardQty : movements.totalPurchaseQty}`
                : (isAllMode ? allItemsSummary.totalInwardQty : movements.totalPurchaseQty) < 0
                ? `${isAllMode ? allItemsSummary.totalInwardQty : movements.totalPurchaseQty}`
                : "0"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Inward stock received
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-600">
            <FiTrendingUp size={20} />
          </div>
        </div>

        {/* Card 3: Total Outward (Sales) */}
        <div className="rounded-xl border border-rose-100 bg-white p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Outward (Sold)
            </p>
            <p className="mt-1 text-2xl font-black text-rose-600">
              {(isAllMode ? allItemsSummary.totalOutwardQty : movements.totalSaleQty) > 0
                ? `-${isAllMode ? allItemsSummary.totalOutwardQty : movements.totalSaleQty}`
                : (isAllMode ? allItemsSummary.totalOutwardQty : movements.totalSaleQty) < 0
                ? `+${Math.abs(isAllMode ? allItemsSummary.totalOutwardQty : movements.totalSaleQty)}`
                : "0"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Outward stock dispatched
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <FiTrendingDown size={20} />
          </div>
        </div>

        {/* Card 4: Adjustments */}
        <div className="rounded-xl border border-amber-100 bg-white p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Adjustments
            </p>
            <p className="mt-1 text-2xl font-black text-amber-700">
              {isAllMode
                ? allItemsSummary.totalAdjQty >= 0
                  ? `+${allItemsSummary.totalAdjQty}`
                  : allItemsSummary.totalAdjQty
                : movements.totalAdjQty >= 0
                ? `+${movements.totalAdjQty}`
                : movements.totalAdjQty}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Physical inventory delta
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <FiLayers size={20} />
          </div>
        </div>

        {/* Card 5: Closing Stock */}
        <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Closing Stock
            </p>
            <p
              className={`mt-1 text-2xl font-black ${
                (isAllMode ? allItemsSummary.totalClosingQty : movements.periodClosingQty) <
                0
                  ? "text-rose-600"
                  : "text-emerald-700"
              }`}
            >
              {isAllMode ? allItemsSummary.totalClosingQty : movements.periodClosingQty}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Final period balance
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <FiBox size={20} />
          </div>
        </div>
      </section>

      {/* Main Table Area */}
      <div className="mx-5 mb-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {/* Table Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              {isAllMode ? "All Items Movement Ledger" : "Daily Stock Ledger"}
            </h2>
            <p className="text-xs text-slate-400">
              {isAllMode
                ? "Opening stock, inward purchases, outward sales, adjustments, and closing stock for each item."
                : `Detailed daily stock entries for ${currentItem?.itemName || selectedItemName}.`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isAllMode ? (
              <div className="relative flex items-center">
                <FiSearch className="absolute left-2.5 text-slate-400" size={13} />
                <input
                  type="text"
                  value={tableSearchQuery}
                  onChange={(e) => setTableSearchQuery(e.target.value)}
                  placeholder="Filter items in table..."
                  className="rounded-md border border-slate-300 bg-white py-1 pl-8 pr-3 text-xs outline-none focus:border-sky-500 w-52"
                />
              </div>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {sortedRows.length} Days Recorded
              </span>
            )}
          </div>
        </div>

        {/* VIEW 1: All Items Overview Table */}
        {isAllMode ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-center w-12">#</th>
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-center">Unit</th>
                  <th className="px-4 py-3 text-right">Opening Stock</th>
                  <th className="px-4 py-3 text-right">Inward (Purchased)</th>
                  <th className="px-4 py-3 text-right">Outward (Sold)</th>
                  <th className="px-4 py-3 text-right">Adjustments</th>
                  <th className="px-4 py-3 text-right">Closing Stock</th>
                  <th className="px-4 py-3 text-center w-28">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAllItemRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-400">
                      No items found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredAllItemRows.map((row, idx) => {
                    return (
                      <tr
                        key={row.id || row.name + idx}
                        className="hover:bg-slate-50 transition-colors odd:bg-white even:bg-slate-50/40"
                      >
                        <td className="px-4 py-2.5 text-center text-slate-400 font-medium">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          <div>{row.name}</div>
                          {row.code && (
                            <div className="text-[10px] text-slate-400">Code: {row.code}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 font-normal">
                          {row.category || "General"}
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-500">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold">
                            {row.unit}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                          {row.periodOpeningQty}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-sky-700">
                          {row.totalInward > 0 ? `+${row.totalInward}` : "0"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-rose-600">
                          {row.totalOutward > 0 ? `-${row.totalOutward}` : "0"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-amber-700">
                          {row.totalAdj !== 0
                            ? row.totalAdj > 0
                              ? `+${row.totalAdj}`
                              : row.totalAdj
                            : "0"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold">
                          <span
                            className={
                              row.periodClosingQty < 0 ? "text-rose-600" : "text-emerald-700"
                            }
                          >
                            {row.periodClosingQty}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedItemName(row.name)}
                            title="Drill down into daily ledger"
                            className="inline-flex items-center gap-1 rounded bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 hover:text-sky-800 transition cursor-pointer"
                          >
                            <FiEye size={12} /> Ledger
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredAllItemRows.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-left">
                      Total ({filteredAllItemRows.length} Items)
                    </td>
                    <td className="px-4 py-3 text-right">
                      {allItemsSummary.totalOpeningQty}
                    </td>
                    <td className="px-4 py-3 text-right text-sky-700">
                      +{allItemsSummary.totalInwardQty}
                    </td>
                    <td className="px-4 py-3 text-right text-rose-600">
                      -{allItemsSummary.totalOutwardQty}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-700">
                      {allItemsSummary.totalAdjQty >= 0
                        ? `+${allItemsSummary.totalAdjQty}`
                        : allItemsSummary.totalAdjQty}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-800 font-black">
                      {allItemsSummary.totalClosingQty}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          /* VIEW 2: Single Item Daily Stock Ledger Table */
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th
                    className="px-5 py-3 cursor-pointer select-none"
                    onClick={() => setSortAsc((prev) => !prev)}
                    title="Click to sort by date"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Date</span>
                      {sortAsc ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />}
                    </div>
                  </th>
                  <th className="px-5 py-3 text-right">Sale Quantity (Outward)</th>
                  <th className="px-5 py-3 text-right">Purchase Quantity (Inward)</th>
                  <th className="px-5 py-3 text-right">Adjustment Quantity</th>
                  <th className="px-5 py-3 text-right">Closing Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-400">
                      No stock movements recorded for this item in the selected period.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row, idx) => {
                    const isSelected = selectedRow === idx;
                    return (
                      <tr
                        key={row.date + idx}
                        onClick={() => setSelectedRow(idx)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-sky-50 font-medium"
                            : "hover:bg-slate-50/80 odd:bg-white even:bg-slate-50/40"
                        }`}
                      >
                        <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                          {row.displayDate}
                        </td>
                        <td className="px-5 py-2.5 text-right font-medium text-rose-600">
                          {row.saleQty !== 0
                            ? row.saleQty > 0
                              ? `-${row.saleQty}`
                              : `+${Math.abs(row.saleQty)}`
                            : "0"}
                        </td>
                        <td className="px-5 py-2.5 text-right font-medium text-sky-700">
                          {row.purchaseQty !== 0
                            ? row.purchaseQty > 0
                              ? `+${row.purchaseQty}`
                              : `-${Math.abs(row.purchaseQty)}`
                            : "0"}
                        </td>
                        <td className="px-5 py-2.5 text-right font-medium text-amber-700">
                          {row.adjQty !== 0
                            ? row.adjQty > 0
                              ? `+${row.adjQty}`
                              : row.adjQty
                            : "0"}
                        </td>
                        <td className="px-5 py-2.5 text-right font-bold whitespace-nowrap">
                          <span
                            className={
                              row.closingQty < 0 ? "text-rose-600" : "text-emerald-700"
                            }
                          >
                            {row.closingQty}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {sortedRows.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                  <tr>
                    <td className="px-5 py-3 text-left">
                      Total Movement ({sortedRows.length} Days)
                    </td>
                    <td className="px-5 py-3 text-right text-rose-600 font-bold">
                      {movements.totalSaleQty !== 0
                        ? movements.totalSaleQty > 0
                          ? `-${movements.totalSaleQty}`
                          : `+${Math.abs(movements.totalSaleQty)}`
                        : "0"}
                    </td>
                    <td className="px-5 py-3 text-right text-sky-700 font-bold">
                      {movements.totalPurchaseQty !== 0
                        ? movements.totalPurchaseQty > 0
                          ? `+${movements.totalPurchaseQty}`
                          : `-${Math.abs(movements.totalPurchaseQty)}`
                        : "0"}
                    </td>
                    <td className="px-5 py-3 text-right text-amber-700 font-bold">
                      {movements.totalAdjQty >= 0
                        ? `+${movements.totalAdjQty}`
                        : movements.totalAdjQty}
                    </td>
                    <td className="px-5 py-3 text-right font-black text-emerald-800">
                      Ending: {movements.periodClosingQty}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
