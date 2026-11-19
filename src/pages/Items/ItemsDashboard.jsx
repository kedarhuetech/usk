// Implements the items dashboard page.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowUpRight,
  FiChevronDown,
  FiDownload,
  FiFilter,
  FiMoreVertical,
  FiPlus,
  FiSearch,
  FiShield,
  FiSliders,
  FiX,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import AddItem from "./AddItem";
import { deleteBusinessItem, loadBusinessItems, loadPurchaseBills, loadSalesInvoices, saveBusinessItem } from "../../services/businessRecords";
import { itemsDb } from "../../services/databaseRepository";
import { isDatabaseMode } from "../../services/dataStorageConfig";
import { getSaleInvoices } from "../../services/salesStorage";
import { getPurchaseBills } from "../../services/purchaseBillsStorage";
import { cancelInventoryAdjustment, getInventoryAdjustments, saveInventoryAdjustment } from "../../services/inventoryAdjustmentsStorage";
import { getSaleReturns } from "../../services/saleReturnsStorage";
import { csvImportedItemsStorageKey, itemTransactionActionsStorageKey, itemUiOverridesStorageKey, getInventoryItems, sameInventoryItemIdentity, saveInventoryItem } from "../../services/itemsStorage";
import { addCustomUnit, addUnitConversion, getUnitConversions, getUnits } from "../../services/unitsStorage";
import { deleteAllInventoryItems, previewDeleteAllInventoryItems } from "../../services/inventoryItemBulkDelete";
import { businessDataChangedEvent } from "../../services/businessDataChanged";
import { useAppSettings } from "../../hooks/useAppSettings";
import { toast } from "../../components/Common/Toast.jsx";
import ConfirmModal from "../../components/Common/ConfirmModal.jsx";

const tabs = [
  { id: "product", label: "PRODUCTS" },
  { id: "service", label: "SERVICES" },
  { id: "units", label: "UNITS" },
];
const ITEM_TRANSACTION_ACTIONS_KEY = itemTransactionActionsStorageKey;
const ITEM_UI_OVERRIDES_KEY = itemUiOverridesStorageKey;
const ITEM_CSV_IMPORTS_KEY = csvImportedItemsStorageKey;

// Parses csv.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV must include a header row and at least one item.");
  // Normalizes result.
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headers = rows[0].map(normalize);
  // Handles result.
  const column = (...names) => headers.findIndex((header) => names.includes(header));
  const indexes = {
    name: column("item", "itemname", "name", "product", "productname", "servicename"),
    code: column("itemcode", "code", "sku", "productcode"),
    type: column("type", "itemtype"),
    category: column("category", "itemcategory"),
    unit: column("unit", "baseunit", "measurementunit"),
    salePrice: column("saleprice", "sellingprice", "price", "rate"),
    purchasePrice: column("purchaseprice", "costprice", "purchasecost"),
    quantity: column("quantity", "openingquantity", "openingstock", "stock", "stockquantity"),
    hsn: column("hsn", "hsnsac", "sac"),
  };
  if (indexes.name < 0) throw new Error("Add an Item Name (or Name / Product Name) column to your CSV.");
  const parsed = rows.slice(1).map((values) => {
    // Gets result.
    const get = (key) => indexes[key] < 0 ? "" : String(values[indexes[key]] || "").trim();
    const name = get("name");
    if (!name) return null;
    const type = get("type").toLowerCase() === "service" ? "service" : "product";
    const code = get("code");
    const unit = get("unit");
    const id = globalThis.crypto?.randomUUID?.() || `csv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const salePrice = get("salePrice");
    const purchasePrice = get("purchasePrice");
    const openingQuantity = get("quantity");
    return {
      id, type, itemName: name, serviceName: type === "service" ? name : "",
      itemCode: code, code, category: get("category"), unit, baseUnit: unit,
      salePrice, price: salePrice, purchasePrice, openingQuantity, stock: openingQuantity,
      hsnSac: get("hsn"), isActive: true, createdAt: new Date().toISOString(),
    };
  }).filter(Boolean);
  if (!parsed.length) throw new Error("No item names were found in the CSV rows.");
  return parsed;
}

// Reads csv imported items.
function readCsvImportedItems() {
  try {
    const value = JSON.parse(window.localStorage.getItem(ITEM_CSV_IMPORTS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

// Reads item ui overrides.
function readItemUiOverrides() {
  try {
    const value = JSON.parse(window.localStorage.getItem(ITEM_UI_OVERRIDES_KEY) || "{}");
    return value && typeof value === "object" ? value : { edits: {}, deleted: [] };
  } catch {
    return { edits: {}, deleted: [] };
  }
}

// Writes item ui overrides.
function writeItemUiOverrides(value) {
  window.localStorage.setItem(ITEM_UI_OVERRIDES_KEY, JSON.stringify(value));
}

// Applies item ui overrides.
function applyItemUiOverrides(sourceItems) {
  const overrides = readItemUiOverrides();
  // Older versions only hid rows in this browser; deletion now removes the local record itself.
  return sourceItems.map((item) => ({ ...item, ...(overrides.edits?.[item.id] || {}) }));
}

// Reads transaction actions.
function readTransactionActions() {
  try {
    const value = JSON.parse(window.localStorage.getItem(ITEM_TRANSACTION_ACTIONS_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

// Writes transaction actions.
function writeTransactionActions(value) {
  window.localStorage.setItem(ITEM_TRANSACTION_ACTIONS_KEY, JSON.stringify(value));
}

// This helper handles label logic.
function dateLabel(value) {
  if (!value) return "-";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN");
}

// This helper handles result logic.
function money(value) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// This helper handles result logic.
function quantity(item) {
  return Number(item?.currentStock ?? item?.current_stock ?? item?.stock ?? item?.openingQuantity ?? 0) || 0;
}

// This helper handles value logic.
function stockValue(item) {
  return quantity(item) * (Number(item?.purchasePrice || 0) || 0);
}

// Checks whether an item is already included in any database transaction (such as sales or purchases).
function hasItemTransactions(item, salesList = [], purchasesList = []) {
  if (!item) return false;
  const matches = (row) =>
    row.sourceItemId === item.id ||
    row.itemId === item.id ||
    row.productId === item.id ||
    (row.item && String(row.item).trim().toLowerCase() === String(item.itemName || "").trim().toLowerCase()) ||
    (row.itemName && String(row.itemName).trim().toLowerCase() === String(item.itemName || "").trim().toLowerCase());

  const inSales = (salesList || []).some((inv) => (inv.rows || []).some(matches));
  if (inSales) return true;

  const inPurchases = (purchasesList || []).some((bill) => (bill.rows || []).some(matches));
  if (inPurchases) return true;

  try {
    const returns = getSaleReturns() || [];
    if (returns.some((ret) => (ret.rows || []).some(matches))) return true;
  } catch {}

  try {
    const adjustments = getInventoryAdjustments(item.id) || [];
    if (adjustments.length > 0) return true;
  } catch {}

  return false;
}

// This helper handles rows logic.
function transactionRows(item, sales, purchases) {
  if (!item) return [];
  // Handles result.
  const matches = (row) => row.sourceItemId === item.id || String(row.item || "").trim().toLowerCase() === String(item.itemName || "").trim().toLowerCase();
  const saleRows = sales.flatMap((invoice) => (invoice.rows || []).filter(matches).map((row) => ({
    id: `${invoice.id}-${row.id}`,
    itemId: row.sourceItemId || row.itemId || row.productId || "",
    itemName: row.item || row.name || row.itemName || row.productName || "",
    sourceId: invoice.id,
    source: invoice,
    type: invoice.transactionType === "purchase" ? "Purchase" : "Sale",
    invoice: invoice.form?.invoiceNumber || invoice.invoiceNumber || "-",
    name: invoice.form?.customer || (invoice.transactionType === "purchase" ? "Supplier" : "Cash Sale"),
    date: invoice.form?.invoiceDate || invoice.createdAt,
    quantity: row.qty || 0,
    unit: row.unit || item.unit || "",
    price: row.price || 0,
    amount: row.calculated?.amount ?? Number(row.qty || 0) * Number(row.price || 0),
    status: invoice.saleType === "credit" || Number(invoice.totals?.balance || 0) > 0 ? "Unpaid" : "Paid",
  })));
  const purchaseRows = purchases.flatMap((invoice) => (invoice.rows || []).filter(matches).map((row) => ({
    id: `${invoice.id}-${row.id}`,
    itemId: row.sourceItemId || row.itemId || row.productId || "",
    itemName: row.item || row.name || row.itemName || row.productName || "",
    sourceId: invoice.id,
    source: invoice,
    type: "Purchase",
    invoice: invoice.form?.invoiceNumber || invoice.invoiceNumber || "-",
    name: invoice.form?.customer || invoice.form?.party || "Supplier",
    date: invoice.form?.invoiceDate || invoice.createdAt,
    quantity: row.qty || 0,
    unit: row.unit || item.unit || "",
    price: row.price || 0,
    amount: row.calculated?.amount ?? Number(row.qty || 0) * Number(row.price || 0),
    status: "Saved",
  })));
  const adjustments = getInventoryAdjustments(item.id).map((adjustment) => ({
    id: adjustment.id,
    source: adjustment,
    type: adjustment.direction === "reduce" ? "Reduce Adjustment" : "Add Adjustment",
    invoice: "-",
    name: adjustment.note || "Stock adjustment",
    date: adjustment.createdAt,
    quantity: `${adjustment.direction === "reduce" ? "−" : "+"}${adjustment.quantity}`,
    unit: adjustment.unit || item.unit || "",
    price: "-",
    amount: "-",
    status: adjustment.cancelled ? "Cancelled" : "Completed",
  }));
  const soldQuantity = saleRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const purchasedQuantity = purchaseRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const adjustedQuantity = adjustments.filter((row) => !row.source.cancelled).reduce((sum, row) => sum + (String(row.quantity).startsWith("−") ? -1 : 1) * Number(String(row.quantity).replace(/[−+]/g, "")), 0);
  const originalOpeningQuantity = quantity(item) + soldQuantity - purchasedQuantity - adjustedQuantity;
  const openingStockRow = originalOpeningQuantity > 0 ? [{
    id: `${item.id}-opening-stock`,
    type: "Opening Stock",
    invoice: "-",
    name: "Opening Stock",
    date: item.asOfDate,
    quantity: originalOpeningQuantity,
    unit: item.unit || "",
    price: "-",
    amount: "-",
    status: "Recorded",
    source: { type: "Opening Stock", quantity: originalOpeningQuantity, date: item.asOfDate, unit: item.unit || "" },
  }] : [];
  const actions = readTransactionActions();
  // Handles rows.
  const copiedRows = (actions.copies || []).filter((entry) => entry.itemId === item.id).map((entry) => ({ ...entry.row, id: entry.id }));
  // Handles rows.
  const returnedRows = (actions.returns || []).filter((entry) => entry.itemId === item.id).map((entry) => ({
    id: entry.id,
    type: "Sale Return",
    invoice: entry.invoice || "-",
    name: entry.name || "Returned items",
    date: entry.date,
    quantity: entry.quantity,
    unit: entry.unit || item.unit || "",
    price: entry.price || "-",
    amount: entry.amount || "-",
    status: "Recorded locally",
    source: entry,
  }));
  let savedReturnRows = [];
  try {
    savedReturnRows = getSaleReturns().filter((ret) => !ret.cancelled).flatMap((ret) => {
      return (ret.rows || []).filter(matches).map((r) => ({
        id: `sale-return-${ret.id}-${r.id}`,
        sourceId: ret.id,
        source: ret,
        type: "Sale Return",
        invoice: ret.invoiceNumber || ret.number || "-",
        name: ret.party || "Customer",
        date: ret.date,
        quantity: r.qty || 0,
        unit: r.unit || item.unit || "",
        price: r.price || 0,
        amount: r.calculated?.amount ?? (Number(r.qty || 0) * Number(r.price || 0)),
        status: ret.status || "Recorded",
      }));
    });
  } catch (err) {
    console.warn("Could not load saved returns for item", err);
  }
  const rows = [...saleRows, ...purchaseRows, ...adjustments, ...openingStockRow, ...copiedRows, ...returnedRows, ...savedReturnRows];
  return rows.filter((row) => !actions.deleted?.includes(row.sourceId || row.id)).map((row) => ({
    ...row,
    status: actions.cancelled?.[row.sourceId] ? "Cancelled" : row.status,
  })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

// Downloads csv.
function downloadCsv(filename, rows) {
  // Handles result.
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Renders the modal interface.
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <Card className="w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-lg font-bold text-slate-800">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100"><FiX /></button></div>
        {children}
      </Card>
    </div>
  );
}

// Renders the adjustment modal interface.
function AdjustmentModal({ item, onClose, onSave, enableBatchTracking = false }) {
  const [direction, setDirection] = useState("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [batchNo, setBatchNo] = useState("");
  const [expDate, setExpDate] = useState("");
  // Saves result.
  const save = async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) { setError("Enter a quantity greater than zero."); return; }
    const next = quantity(item) + (direction === "add" ? parsed : -parsed);
    if (next < 0) { setError("Stock cannot be reduced below zero."); return; }
    setSaving(true);
    try { await onSave(item, String(next), { direction, quantity: parsed, note: note.trim(), batchNo, expDate }); onClose(); }
    catch (saveError) { setError(saveError.message || "Could not save the stock adjustment."); setSaving(false); }
  };
  return (
    <Modal title="Adjust Stock" onClose={onClose}>
      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-600">{item.itemName} · Current quantity <b>{quantity(item)} {item.unit}</b></p>
        <label className="block text-sm font-semibold text-slate-600">Adjustment type<select value={direction} onChange={(event) => setDirection(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"><option value="add">Add stock</option><option value="reduce">Reduce stock</option></select></label>
        {enableBatchTracking && <label className="block text-sm font-semibold text-slate-600">Batch<select value={batchNo} onChange={(event) => { const batch = item.batches?.find((entry) => entry.batchNo === event.target.value); setBatchNo(event.target.value); setExpDate(batch?.expDate || ""); }} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">{direction === "add" ? "Select or enter new batch" : "Select batch to reduce"}</option>{(item.batches || []).map((batch) => <option key={batch.id || batch.batchNo} value={batch.batchNo}>{batch.batchNo} · {batch.openingQty || 0}</option>)}</select>{direction === "add" && <input value={batchNo} onChange={(event) => setBatchNo(event.target.value)} placeholder="New batch number" className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" />}</label>}
        {enableBatchTracking && direction === "add" && <label className="block text-sm font-semibold text-slate-600">Expiry date<input type="date" value={expDate} onChange={(event) => setExpDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" /></label>}
        <label className="block text-sm font-semibold text-slate-600">Quantity<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" placeholder="Enter quantity" /></label>
        <label className="block text-sm font-semibold text-slate-600">Note <span className="font-normal text-slate-400">(optional)</span><input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" placeholder="Reason for adjustment" /></label>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button onClick={onClose} className="bg-slate-100 text-slate-700">Cancel</Button><Button onClick={save} disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">{saving ? "Saving…" : "Save Adjustment"}</Button></div>
      </div>
    </Modal>
  );
}

// Renders the items dashboard interface.
function ItemsDashboard() {
  const appSettings = useAppSettings();
  const enableBarcodeScanning = appSettings.enableBarcodeScanning ?? true;
  const enableItemCategory = appSettings.enableItemCategory ?? true;
  const enableItemDescription = appSettings.enableItemDescription ?? true;
  const enableBatchTracking = Boolean(appSettings.enableBatchTracking);
  const enableSerialTracking = Boolean(appSettings.enableSerialTracking);
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("product");
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [searchOpen, setSearchOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState("All categories");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkSelectionOpen, setBulkSelectionOpen] = useState(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState([]);
  const [bulkCodes, setBulkCodes] = useState({});
  const [bulkUnit, setBulkUnit] = useState("");
  const [bulkFields, setBulkFields] = useState({ salePrice: "", purchasePrice: "", category: "" });
  const [rowMenu, setRowMenu] = useState("");
  const [itemModal, setItemModal] = useState(null);
  const [itemStatusModal, setItemStatusModal] = useState(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllCount, setDeleteAllCount] = useState(null);
  const [deleteAllPhrase, setDeleteAllPhrase] = useState("");
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState("");

  useEffect(() => {
    if (location.state?.openAddItem) {
      setItemModal({ mode: "create", initialItem: { type: "product" } });
    } else if (location.state?.itemId) {
      setSelectedId(location.state.itemId);
      const target = items.find((it) => it.id === location.state.itemId);
      if (target?.type) setActiveTab(target.type);
      if (location.state?.openEditItem && target) {
        setItemModal({ mode: "edit", initialItem: target });
      }
    } else if (location.state?.openEditItem) {
      const target = location.state.item || (selectedId ? items.find((it) => it.id === selectedId) : items[0]);
      if (target) setItemModal({ mode: "edit", initialItem: target });
    }
  }, [location.state, items, selectedId]);
  const [adjustItem, setAdjustItem] = useState(null);
  const [transactionDetails, setTransactionDetails] = useState(null);
  const [transactionHistory, setTransactionHistory] = useState(null);
  const [mobileItemView, setMobileItemView] = useState("list");
  const [units, setUnits] = useState(() => getUnits());
  const [selectedUnit, setSelectedUnit] = useState(() => getUnits()[0] || "PCS");
  const [unitSearch, setUnitSearch] = useState("");
  const [unitSearchOpen, setUnitSearchOpen] = useState(false);
  const [conversionSearch, setConversionSearch] = useState("");
  const [unitModal, setUnitModal] = useState(false);
  const [unitName, setUnitName] = useState("");
  const [conversionModal, setConversionModal] = useState(false);
  const [conversionFactor, setConversionFactor] = useState("1");
  const [conversionUnit, setConversionUnit] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null);
  const menuRef = useRef(null);
  const csvInputRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoadError("");
    const showItems = (loadedItems) => {
      const allItems = [...(loadedItems || []), ...readCsvImportedItems()];
      setItems(applyItemUiOverrides(allItems));
      setSelectedId((current) => current || allItems[0]?.id || "");
    };

    // Render local items immediately if available
    showItems(getInventoryItems());
    try {
      const dbItems = await loadBusinessItems();
      if (Array.isArray(dbItems) && dbItems.length > 0) {
        showItems(dbItems);
      }
    } catch (error) {
      setLoadError(error.message || "Could not load item data.");
    }

    const [salesResult, purchasesResult] = await Promise.allSettled([loadSalesInvoices(), loadPurchaseBills()]);
    if (salesResult.status === "fulfilled") setSales(salesResult.value);
    if (purchasesResult.status === "fulfilled") setPurchases(purchasesResult.value);
    if (salesResult.status === "rejected" || purchasesResult.status === "rejected") {
      setNotice("Items loaded from local storage. Some transaction history is unavailable.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    let isMounted = true;
    let debounceTimer = null;
    let inFlight = false;

    const reloadData = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(async () => {
        if (inFlight || !isMounted) return;
        inFlight = true;
        try {
          if (isDatabaseMode()) {
            try {
              const dbItems = await loadBusinessItems();
              if (isMounted && Array.isArray(dbItems)) {
                const allItems = [...dbItems, ...readCsvImportedItems()];
                setItems(applyItemUiOverrides(allItems));
              }
            } catch {
              if (isMounted) {
                const currentItems = [...getInventoryItems(), ...readCsvImportedItems()];
                setItems(applyItemUiOverrides(currentItems));
              }
            }
          } else {
            const currentItems = [...getInventoryItems(), ...readCsvImportedItems()];
            setItems(applyItemUiOverrides(currentItems));
          }
          setSales(getSaleInvoices());
          setPurchases(getPurchaseBills());
        } finally {
          inFlight = false;
        }
      }, 150);
    };

    window.addEventListener(businessDataChangedEvent, reloadData);
    window.addEventListener("storage", reloadData);
    return () => {
      isMounted = false;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      window.removeEventListener(businessDataChangedEvent, reloadData);
      window.removeEventListener("storage", reloadData);
    };
  }, []);
  useEffect(() => {
    // Handles pointer down.
    const onPointerDown = (event) => { if (!menuRef.current?.contains(event.target) && !event.target.closest?.("[data-item-bulk-menu]") && !event.target.closest?.("[data-item-transaction-actions]") && !event.target.closest?.("[data-item-row-actions]")) { setMenuOpen(false); setRowMenu(""); } };
    // Handles key down.
    const onKeyDown = (event) => { if (event.key === "Escape") { setMenuOpen(false); setRowMenu(""); setItemModal(null); setItemStatusModal(null); setAdjustItem(null); setTransactionDetails(null); setTransactionHistory(null); setUnitModal(false); setConversionModal(false); } };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  const getItemType = (item) => String(item?.type || item?.itemType || item?.item_type || "product").toLowerCase();

  const categories = useMemo(() => ["All categories", ...new Set(items.filter((item) => getItemType(item) === activeTab && item.category).map((item) => item.category))], [items, activeTab]);
  const filteredItems = useMemo(() => {
    const unique = new Map();
    items.filter((item) => {
      if (getItemType(item) !== activeTab || activeTab === "units") return false;
      if (enableItemCategory && category !== "All categories" && item.category !== category) return false;
      if (lowStockOnly && activeTab === "product" && quantity(item) > Number(item.minimumStock || 0)) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const matchName = String(item.itemName || "").toLowerCase().includes(q);
      const matchCode = String(item.itemCode || "").toLowerCase().includes(q);
      const matchBarcode = enableBarcodeScanning && String(item.barcode || "").toLowerCase().includes(q);
      const matchDescription = String(item.description || "").toLowerCase().includes(q);
      return matchName || matchCode || matchBarcode || matchDescription;
    }).forEach((item) => {
      const code = String(item.itemCode || "").trim().toLowerCase();
      const fallbackName = `${String(item.itemName || "").trim().toLowerCase()}|${String(item.unit || "").trim().toLowerCase()}|${String(item.category || "").trim().toLowerCase()}`;
      const key = item.id || (code ? `code:${code}` : `name:${fallbackName}`);
      const existing = unique.get(key);
      const itemUpdated = new Date(item.updatedAt || item.createdAt || 0).getTime();
      const existingUpdated = existing ? new Date(existing.updatedAt || existing.createdAt || 0).getTime() : -1;
      if (!existing || itemUpdated > existingUpdated) unique.set(key, item);
    });
    return [...unique.values()].sort((a, b) => String(a.itemName || "").localeCompare(String(b.itemName || "")));
  }, [items, activeTab, category, lowStockOnly, search, enableBarcodeScanning, enableItemCategory]);
  const selectedItem = filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null;
  const allTransactions = useMemo(() => transactionRows(selectedItem, sales, purchases), [selectedItem, sales, purchases]);
  const filteredTransactions = allTransactions.filter((row) => `${row.type} ${row.invoice} ${row.name} ${row.quantity} ${row.unit}`.toLowerCase().includes(transactionSearch.trim().toLowerCase()));
  const visibleUnits = units.filter((unit) => unit.toLowerCase().includes(unitSearch.trim().toLowerCase()));
  const selectedBulkItems = filteredItems.filter((item) => selectedBulkIds.includes(item.id));
  const conversions = useMemo(() => getUnitConversions(selectedUnit).filter((conversion) => `${conversion.toUnit} ${conversion.factor}`.toLowerCase().includes(conversionSearch.trim().toLowerCase())), [selectedUnit, units, conversionSearch]);

  // Saves item.
  const saveItem = async (value) => {
    if (itemModal?.mode === "edit") {
      const saved = await saveBusinessItem(value);
      setItems((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setSelectedId(saved.id);
      setItemModal(null);
      setNotice(`${saved.itemName} updated.`);
      return saved;
    }
    const saved = await saveBusinessItem(value);
    setItems((current) => [...current.filter((item) => item.id !== saved.id), saved]);
    setSelectedId(saved.id);
    setActiveTab(saved.type === "service" ? "service" : "product");
    setCategory("All categories");
    setSearch("");
    setItemModal(null);
    setNotice(`${saved.itemName} saved.`);
  };

  // Imports items csv.
  const importItemsCsv = async (file) => {
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Please choose a CSV file. In Excel, use Save As → CSV (Comma delimited).");
      const parsed = parseCsv(await file.text());
      const existing = [...items];
      const existingKeys = new Set(existing.flatMap((item) => [
        item.itemCode ? `code:${String(item.itemCode).trim().toLowerCase()}` : "",
        `name:${String(item.itemName || "").trim().toLowerCase()}|${String(item.unit || "").trim().toLowerCase()}`,
      ]).filter(Boolean));
      const imported = parsed.filter((item) => {
        const codeKey = item.itemCode ? `code:${item.itemCode.trim().toLowerCase()}` : "";
        const nameKey = `name:${item.itemName.trim().toLowerCase()}|${item.unit.trim().toLowerCase()}`;
        if ((codeKey && existingKeys.has(codeKey)) || existingKeys.has(nameKey)) return false;
        if (codeKey) existingKeys.add(codeKey);
        existingKeys.add(nameKey);
        return true;
      });
      if (!imported.length) throw new Error("Every item in this file already exists. No duplicate rows were imported.");
      const stored = [...readCsvImportedItems(), ...imported];
      window.localStorage.setItem(ITEM_CSV_IMPORTS_KEY, JSON.stringify(stored));
      setItems((current) => applyItemUiOverrides([...current, ...imported]));
      setActiveTab(imported[0].type);
      setSelectedId(imported[0].id);
      setCategory("All categories");
      setSearch("");
      setNotice(`${imported.length} item${imported.length === 1 ? "" : "s"} imported to this browser. No database or backend records were changed.`);
    } catch (error) {
      setNotice(error.message || "Could not import this CSV file.");
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  // Saves adjustment.
  const saveAdjustment = async (item, nextQuantity, adjustment) => {
    const itemName = item.itemName || item.name || item.item_name || "";
    if (enableBatchTracking) {
      saveInventoryAdjustment({ itemId: item.id, itemName, unit: item.unit || "", batchTracked: true, ...adjustment });
      const updated = await saveBusinessItem(getInventoryItems().find((entry) => entry.id === item.id));
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setNotice("Batch stock adjustment saved.");
      return;
    }
    const updated = await saveBusinessItem({ ...item, openingQuantity: nextQuantity, stock: nextQuantity });
    saveInventoryAdjustment({ itemId: item.id, itemName, unit: item.unit || "", ...adjustment });
    setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    setNotice("Stock adjustment saved.");
  };

  // Creates unit.
  const createUnit = () => {
    const nextUnits = addCustomUnit(unitName);
    if (!unitName.trim()) return;
    const added = nextUnits.find((unit) => unit.toLowerCase() === unitName.trim().toLowerCase());
    setUnits(nextUnits);
    if (added) setSelectedUnit(added);
    setUnitName("");
    setUnitModal(false);
  };

  // Creates conversion.
  const createConversion = () => {
    const factor = Number(conversionFactor);
    if (!conversionUnit || !Number.isFinite(factor) || factor <= 0) return;
    addUnitConversion(selectedUnit, { factor, toUnit: conversionUnit });
    setConversionModal(false);
    setConversionUnit("");
    setConversionFactor("1");
    setNotice("Unit conversion saved.");
    setUnits((current) => [...current]);
  };

  // Exports transactions.
  const exportTransactions = () => downloadCsv(`item-transactions-${selectedItem?.itemName || ""}.csv`, [["Type", "Invoice", "Name", "Date", "Quantity", "Unit", "Price", "Amount", "Status"], ...filteredTransactions.map((row) => [row.type, row.invoice, row.name, row.date, row.quantity, row.unit, row.price, row.amount, row.status])]);
  // Applies bulk update.
  const applyBulkUpdate = (makeUpdate, message) => {
    const overrides = readItemUiOverrides();
    const edits = { ...(overrides.edits || {}) };
    const targetIds = new Set(selectedBulkItems.map((item) => item.id));
    if (!targetIds.size) { setNotice("Select one or more visible items first."); setBulkAction(""); return; }
    const updatedItems = items.map((item) => {
      if (!targetIds.has(item.id)) return item;
      const updated = makeUpdate(item);
      edits[item.id] = updated;
      saveInventoryItem(updated);
      return updated;
    });
    writeItemUiOverrides({ ...overrides, edits });
    setItems(updatedItems);
    setNotice(`${message} applied to ${targetIds.size} selected ${activeTab}${targetIds.size === 1 ? "" : "s"}.`);
    setSelectedBulkIds((current) => current.filter((id) => !targetIds.has(id)));
    setBulkAction("");
  };
  // Starts bulk action.
  const startBulkAction = (action) => {
    setMenuOpen(false);
    if (!filteredItems.length) { setNotice("There are no items available to select."); return; }
    setSelectedBulkIds([]);
    setBulkAction(action);
    setBulkSelectionOpen(true);
  };
  // Handles bulk selection.
  const continueBulkSelection = () => {
    if (!selectedBulkItems.length) { setNotice("Select one or more items to continue."); return; }
    setBulkSelectionOpen(false);
    if (bulkAction === "inactive" || bulkAction === "active") {
      const eligibleItems = selectedBulkItems.filter((item) => bulkAction === "inactive" ? item.isActive !== false : item.isActive === false);
      if (!eligibleItems.length) { setNotice(bulkAction === "active" ? "The selected items are already active." : "The selected items are already inactive."); setBulkAction(""); setSelectedBulkIds([]); return; }
      const label = bulkAction === "inactive" ? "inactive" : "active";
      setConfirmDialog({
        title: bulkAction === "inactive" ? "Bulk Inactivate Items" : "Bulk Activate Items",
        message: `Mark ${eligibleItems.length} selected items as ${label}? Disabled items remain visible in Items but are unavailable for new purchase and sale selections.`,
        confirmText: bulkAction === "inactive" ? "Mark Inactive" : "Mark Active",
        danger: bulkAction === "inactive",
        onConfirm: () => {
          const eligibleIds = new Set(eligibleItems.map((item) => item.id));
          applyBulkUpdate((item) => eligibleIds.has(item.id) ? ({ ...item, isActive: bulkAction === "active" }) : item, bulkAction === "inactive" ? "Bulk inactive" : "Bulk active");
          setConfirmDialog(null);
        },
        onCancel: () => {
          setBulkAction("");
          setSelectedBulkIds([]);
          setConfirmDialog(null);
        },
      });
      return;
    }
    if (bulkAction === "code") setBulkCodes(Object.fromEntries(selectedBulkItems.map((item) => [item.id, item.itemCode || ""])));
  };
  // Saves bulk action.
  const saveBulkAction = () => {
    if (bulkAction === "code") {
      const codes = selectedBulkItems.map((item) => String(bulkCodes[item.id] || "").trim());
      if (codes.some((code) => !code)) { setNotice("Enter a code for every selected item."); return; }
      if (new Set(codes.map((code) => code.toLowerCase())).size !== codes.length) { setNotice("Each selected item must have a unique code."); return; }
      applyBulkUpdate((item) => ({ ...item, itemCode: String(bulkCodes[item.id]).trim(), code: String(bulkCodes[item.id]).trim(), ...(item.type === "service" ? { serviceCode: String(bulkCodes[item.id]).trim() } : {}) }), "Unique item codes assigned");
    } else if (bulkAction === "units") {
      if (!bulkUnit) return;
      applyBulkUpdate((item) => ({ ...item, unit: bulkUnit, baseUnit: bulkUnit }), "Unit assigned");
    } else if (bulkAction === "update") {
      applyBulkUpdate((item) => ({
        ...item,
        ...(bulkFields.salePrice !== "" ? { salePrice: bulkFields.salePrice } : {}),
        ...(bulkFields.purchasePrice !== "" ? { purchasePrice: bulkFields.purchasePrice } : {}),
        ...(bulkFields.category.trim() ? { category: bulkFields.category.trim() } : {}),
      }), "Bulk update");
      setBulkFields({ salePrice: "", purchasePrice: "", category: "" });
    }
  };

  const openDeleteAll = async () => {
    if (isDatabaseMode()) {
      setNotice("Delete All Items is disabled in database mode to protect historical transaction integrity. Delete items individually or mark them inactive.");
      toast.info("Delete All Items is disabled in database mode to protect historical transactions.");
      return;
    }
    setDeleteAllError("");
    setLoadError("");
    setDeleteAllLoading(true);
    try {
      const preview = await previewDeleteAllInventoryItems();
      setDeleteAllCount(preview);
      setDeleteAllPhrase("");
      setDeleteAllOpen(true);
    } catch (error) {
      setDeleteAllError(error.message || "Could not verify the items to delete.");
      setLoadError(error.message || "Could not verify the items.");
    } finally { setDeleteAllLoading(false); }
  };

  const confirmDeleteAll = async () => {
    if (deleteAllPhrase !== "DELETE ALL ITEMS" || deleteAllLoading) return;
    setDeleteAllLoading(true);
    setDeleteAllError("");
    try {
      const result = deleteAllInventoryItems(deleteAllCount?.local);
      setDeleteAllOpen(false);
      const currentItems = applyItemUiOverrides([...getInventoryItems(), ...readCsvImportedItems()]);
      setItems(currentItems);
      setSelectedId(currentItems[0]?.id || "");
      setSelectedBulkIds([]);
      setNotice(`Deleted ${result.deletedLocal}  item records. Historical invoices and other business records were preserved.`);
    } catch (error) {
      setDeleteAllError(error.message || "Items could not be deleted from browser storage.");
    } finally { setDeleteAllLoading(false); }
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-200 p-1.5">
      <div className="mb-1 grid grid-cols-3 bg-white">
        {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setSelectedId(""); setSearch(""); }} className={`border-b-2 px-3 py-4 text-center text-sm font-bold transition ${activeTab === tab.id ? "border-sky-600 text-slate-800" : "border-transparent text-slate-400 hover:text-slate-700"}`}>{tab.label}</button>)}
      </div>
      {loadError && <div role="alert" className="mb-1 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</div>}
      {notice && <div role="status" className="mb-1 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><FiX /></button></div>}

      {/* Mobile Master-Detail View Switcher (< xl) */}
      {activeTab !== "units" && (
        <div className="flex xl:hidden border-b border-slate-200 bg-white p-1.5 gap-1.5 shrink-0 z-10 shadow-xs mb-1">
          <button
            type="button"
            onClick={() => setMobileItemView("list")}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition cursor-pointer ${
              mobileItemView === "list"
                ? "bg-[#14171E] text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {activeTab === "product" ? "Products" : "Services"} List ({filteredItems.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileItemView("details")}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition cursor-pointer truncate px-2 ${
              mobileItemView === "details"
                ? "bg-[#FF5A1F] text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {selectedItem ? selectedItem.itemName : "Item"} Details &amp; History
          </button>
        </div>
      )}

      {activeTab !== "units" ? (
        <div className="grid min-h-[calc(100vh-12.5rem)] flex-1 gap-1 xl:grid-cols-[minmax(280px,24%)_minmax(0,1fr)]">
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Choose item CSV file" onChange={(event) => importItemsCsv(event.target.files?.[0])} />
          <Card className={`flex min-h-[350px] sm:min-h-[420px] xl:min-h-0 flex-col overflow-visible shadow-sm ${
            mobileItemView === "details" ? "hidden xl:flex" : "flex"
          }`}>
            <div className="relative flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
              <div className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 shadow-xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                <FiSearch className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={enableBarcodeScanning ? "Search name, code, barcode..." : `Search ${activeTab}s`}
                  aria-label={`Search ${activeTab}s`}
                  className="h-full w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <FiX className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div ref={menuRef} className="relative ml-auto flex h-11 overflow-visible rounded-md bg-amber-500 text-white shadow-sm">
                <button type="button" onClick={() => setItemModal({ mode: "create", initialItem: { type: activeTab } })} className="flex items-center gap-2 px-3 text-sm font-bold hover:bg-amber-600"><FiPlus /> Add {activeTab === "product" ? "Item" : "Service"}</button>
                <button type="button" aria-label="Choose item type" onClick={() => setRowMenu((current) => current === "create-menu" ? "" : "create-menu")} className="grid w-10 place-items-center border-l border-amber-600/50 hover:bg-amber-600"><FiChevronDown /></button>
                {rowMenu === "create-menu" && <div className="absolute right-0 top-12 z-40 w-56 rounded-md border border-slate-200 bg-white py-1 text-slate-700 shadow-xl"><button type="button" onClick={() => { setActiveTab("product"); setItemModal({ mode: "create", initialItem: { type: "product" } }); setRowMenu(""); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50">Add Product</button><button type="button" onClick={() => { setActiveTab("service"); setItemModal({ mode: "create", initialItem: { type: "service" } }); setRowMenu(""); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50">Add Service</button><div className="my-1 border-t border-slate-100" /><button type="button" onClick={() => { setRowMenu(""); csvInputRef.current?.click(); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50">Import Items via Excel / CSV</button></div>}
              </div>
              <div className="relative" data-item-bulk-menu>
                <button type="button" aria-label="More item actions" onClick={() => setMenuOpen((open) => !open)} className="grid h-9 w-7 place-items-center text-slate-500 hover:text-slate-900"><FiMoreVertical /></button>
                {menuOpen && <div className="absolute right-0 top-9 z-40 w-60 rounded-md border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl">{[{ id: "inactive", label: "Bulk Inactive" }, { id: "active", label: "Bulk Active" }, { id: "code", label: "Bulk Assign Code" }, { id: "units", label: "Assign Units" }, { id: "update", label: "Bulk Update Items" }].map((action) => <button key={action.id} type="button" onClick={() => action.id === "update" ? (setMenuOpen(false), navigate("/utilities/update-items-in-bulk")) : startBulkAction(action.id)} className="block w-full rounded px-3 py-2.5 text-left text-sm hover:bg-slate-100">{action.label}</button>)}</div>}
              </div>
              <button
                type="button"
                onClick={openDeleteAll}
                disabled={deleteAllLoading || isDatabaseMode()}
                title={isDatabaseMode() ? "Bulk deletion is disabled in database mode to protect historical transactions." : undefined}
                className="h-10 w-full basis-full rounded-md border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDatabaseMode() ? "Delete All Items (Disabled in DB Mode)" : deleteAllLoading ? "Checking…" : "Delete All Items"}
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_30px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold uppercase text-slate-500"><span>Item</span><span>{activeTab === "product" ? "Quantity" : "Unit"}</span><button type="button" aria-label="Filter items" onClick={() => setFiltersOpen((open) => !open)} className={`grid h-7 w-7 place-items-center rounded ${filtersOpen ? "bg-blue-100 text-blue-700" : "hover:bg-slate-200"}`}><FiFilter /></button></div>
            {filtersOpen && <div className="grid gap-2 border-b border-slate-200 bg-white p-3">{enableItemCategory && <label className="text-[11px] font-semibold uppercase text-slate-500">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700">{categories.map((value) => <option key={value}>{value}</option>)}</select></label>}{activeTab === "product" && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} className="accent-blue-600" />Low stock only</label>}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredItems.map((item) => <div key={item.id} data-item-row-actions className={`group relative grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2 px-3 ${selectedItem?.id === item.id ? "bg-sky-100" : "bg-white hover:bg-slate-50"}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setMobileItemView("details");
                  }}
                  className="min-w-0 py-2 text-left cursor-pointer"
                >
                  <span className="block truncate text-sm font-semibold text-slate-800">{item.itemName}{item.isActive === false && <span className="ml-2 text-[10px] font-normal text-slate-400">Inactive</span>}</span><span className="block truncate text-xs text-slate-400">{item.itemCode || ""}{enableItemCategory && item.category && <span className="ml-2 font-medium text-slate-500">[{item.category}]</span>}</span>
                </button>
                <span className={`whitespace-nowrap text-sm font-medium ${activeTab === "product" && quantity(item) < 0 ? "text-rose-600" : "text-emerald-600"}`}>{activeTab === "product" ? `${quantity(item)}${item.unit ? ` ${item.unit}` : ""}` : item.unit || "-"}</span>
                <button type="button" aria-label={`Actions for ${item.itemName}`} onClick={() => setRowMenu((current) => current === item.id ? "" : item.id)} className="grid h-8 w-6 place-items-center rounded text-slate-400 hover:bg-white hover:text-slate-700"><FiMoreVertical /></button>
                {rowMenu === item.id && (
                  <div className="absolute right-2 top-9 z-30 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setItemModal({ mode: "edit", initialItem: item });
                        setRowMenu("");
                      }}
                      className="w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      View / Edit
                    </button>
                    {item.isActive === false ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setRowMenu("");
                          try {
                            if (isDatabaseMode()) {
                              await itemsDb.reactivate(item.id);
                            }
                            saveInventoryItem({ ...item, isActive: true });
                            await refresh();
                            setNotice(`"${item.itemName}" marked as Active.`);
                            toast.success(`"${item.itemName}" marked as Active.`);
                          } catch (err) {
                            toast.error(err.message || "Could not activate item.");
                          }
                        }}
                        className="w-full rounded px-3 py-2 text-left text-sm font-medium text-emerald-600 hover:bg-emerald-50"
                      >
                        Make Active
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          setRowMenu("");
                          try {
                            if (isDatabaseMode()) {
                              await itemsDb.deactivate(item.id);
                            }
                            saveInventoryItem({ ...item, isActive: false });
                            await refresh();
                            setNotice(`"${item.itemName}" marked as Inactive.`);
                            toast.success(`"${item.itemName}" marked as Inactive.`);
                          } catch (err) {
                            toast.error(err.message || "Could not inactivate item.");
                          }
                        }}
                        className="w-full rounded px-3 py-2 text-left text-sm font-medium text-amber-600 hover:bg-amber-50"
                      >
                        Make Inactive
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRowMenu("");
                        const isReferenced = hasItemTransactions(item, sales, purchases);
                        if (isReferenced) {
                          setItemStatusModal(item);
                          return;
                        }
                        setConfirmDialog({
                          title: "Delete Item",
                          message: `Permanently delete "${item.itemName}"? This item is not used in any transactions and this operation cannot be undone.`,
                          confirmText: "Delete",
                          danger: true,
                          onConfirm: async () => {
                            setConfirmDialog(null);
                            try {
                              const result = await deleteBusinessItem(item);
                              await refresh();
                              if (result?.action === "deactivated") {
                                setNotice(`${item.itemName} has active transactions and was deactivated.`);
                                toast.success(`${item.itemName} marked inactive.`);
                              } else {
                                const modeSuffix = isDatabaseMode() ? "" : " from local storage";
                                setNotice(`${item.itemName} deleted successfully${modeSuffix}.`);
                                toast.success(`${item.itemName} permanently deleted.`);
                              }
                            } catch (error) {
                              console.error("Item delete error:", error);
                              if (error?.status === 409 || error?.code === "ITEM_REFERENCED" || error?.message?.includes("referenced") || error?.message?.includes("transactions")) {
                                setItemStatusModal(item);
                              } else {
                                toast.error(`Could not delete item: ${error.message}`);
                                setLoadError(`Failed to delete ${item.itemName}: ${error.message}`);
                              }
                            }
                          },
                          onCancel: () => setConfirmDialog(null),
                        });
                      }}
                      className="w-full rounded px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                    {activeTab === "product" && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustItem(item);
                          setRowMenu("");
                        }}
                        className="w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Adjust Stock
                      </button>
                    )}
                  </div>
                )}
              </div>)}
              {!filteredItems.length && <div className="grid min-h-60 place-items-center px-6 text-center"><div><p className="font-semibold text-slate-700">{search ? "No items match your search" : `No ${activeTab}s yet`}</p><p className="mt-1 text-sm text-slate-500">Add a {activeTab} to get started.</p><Button onClick={() => setItemModal({ mode: "create", initialItem: { type: activeTab } })} className="mt-4 bg-amber-500 text-white hover:bg-amber-600"><FiPlus /> Add {activeTab === "product" ? "Item" : "Service"}</Button></div></div>}
            </div>
          </Card>

          <div className={`min-w-0 flex-col gap-1 ${
            mobileItemView === "list" ? "hidden xl:flex" : "flex"
          }`}>
            {/* Mobile Back Button to Items List (< xl) */}
            <div className="flex xl:hidden items-center justify-between border-b border-slate-200 px-4 py-2 bg-white rounded-md shrink-0 shadow-xs">
              <button
                type="button"
                onClick={() => setMobileItemView("list")}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                ← Back to {activeTab === "product" ? "Products" : "Services"} List
              </button>
              <span className="text-xs font-semibold text-slate-500">
                {filteredItems.length} items
              </span>
            </div>

            <Card className="shrink-0 p-4 shadow-sm sm:p-5">
              {selectedItem ? <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-lg font-semibold uppercase text-slate-900">{selectedItem.itemName}</h1>
                    {selectedItem.isActive === false ? (
                      <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">Inactive</span>
                    ) : (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">Active</span>
                    )}
                    <button type="button" aria-label="Edit item" title="Edit item" onClick={() => setItemModal({ mode: "edit", initialItem: selectedItem })} className="rounded p-1 text-slate-600 hover:bg-slate-100"><FiArrowUpRight /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const nextActive = selectedItem.isActive === false;
                          if (isDatabaseMode()) {
                            if (nextActive) await itemsDb.reactivate(selectedItem.id);
                            else await itemsDb.deactivate(selectedItem.id);
                          }
                          saveInventoryItem({ ...selectedItem, isActive: nextActive });
                          await refresh();
                          toast.success(`"${selectedItem.itemName}" is now ${nextActive ? "Active" : "Inactive"}.`);
                        } catch (err) {
                          toast.error(err.message || "Could not update item status.");
                        }
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                        selectedItem.isActive === false
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {selectedItem.isActive === false ? "Make Active" : "Make Inactive"}
                    </button>
                    {activeTab === "product" && <Button onClick={() => setAdjustItem(selectedItem)} className="rounded-md bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-700"><FiSliders /> Adjust Item</Button>}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="space-y-2">
                    {enableItemDescription && selectedItem.description && <p className="text-slate-700">DESCRIPTION: <span className="font-normal text-slate-600">{selectedItem.description}</span></p>}
                    <p className="text-slate-700">SALE PRICE: <b className="font-medium text-emerald-600">{money(selectedItem.salePrice)} <span className="font-normal text-slate-500">(excl)</span></b></p>
                    <p className="text-slate-700">PURCHASE PRICE: <b className="font-medium text-emerald-600">{money(selectedItem.purchasePrice)} <span className="font-normal text-slate-500">(excl)</span></b></p>
                    {enableItemCategory && selectedItem.category && (
                      <p className="text-slate-700">CATEGORY: <b className="font-medium text-slate-800">{selectedItem.category}{selectedItem.subCategory ? ` › ${selectedItem.subCategory}` : ""}</b></p>
                    )}
                    {enableBarcodeScanning && (selectedItem.barcode || selectedItem.itemCode) && (
                      <p className="text-slate-700">BARCODE: <b className="font-mono font-medium text-slate-800">{selectedItem.barcode || selectedItem.itemCode}</b></p>
                    )}
                  </div>
                  <div className="space-y-2 sm:text-right">
                    <p className="text-slate-700">{activeTab === "product" ? "STOCK QUANTITY:" : "UNIT:"} <b className="font-medium text-emerald-600">{activeTab === "product" ? `${quantity(selectedItem)} ${selectedItem.unit || ""}` : selectedItem.unit || "-"}</b></p>
                    {activeTab === "product" && <p className="text-slate-700">STOCK VALUE: <b className="font-medium text-emerald-600">{money(stockValue(selectedItem))}</b></p>}
                    {enableSerialTracking && selectedItem.serialNumbers?.length > 0 && (
                      <p className="text-slate-700">TRACKED UNITS: <b className="font-medium text-purple-600">{selectedItem.serialNumbers.length} Serial{selectedItem.serialNumbers.length === 1 ? "" : "s"}</b></p>
                    )}
                  </div>
                </div>

                {enableBatchTracking && selectedItem.batches?.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Batches & Expiry Dates</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-2 py-1.5">Batch / Lot No.</th>
                            <th className="px-2 py-1.5">Mfg. Date</th>
                            <th className="px-2 py-1.5">Expiry Date</th>
                            <th className="px-2 py-1.5">Remarks</th>
                            <th className="px-2 py-1.5 text-right">Opening Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedItem.batches.map((b, idx) => (
                            <tr key={b.id || idx} className="border-b border-slate-100">
                              <td className="px-2 py-1.5 font-mono font-semibold text-slate-800">{b.batchNo || "-"}</td>
                              <td className="px-2 py-1.5 text-slate-600">{b.mfgDate ? dateLabel(b.mfgDate) : "-"}</td>
                              <td className="px-2 py-1.5 font-medium text-amber-700">{b.expDate ? dateLabel(b.expDate) : "-"}</td>
                              <td className="px-2 py-1.5 text-slate-500">{b.remarks || "-"}</td>
                              <td className="px-2 py-1.5 text-right font-semibold text-slate-800">{b.openingQty || "0"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {enableSerialTracking && selectedItem.serialNumbers?.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Tracked Serial / IMEI Numbers ({selectedItem.serialNumbers.length})</h3>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {selectedItem.serialNumbers.map((s, idx) => (
                        <span key={idx} className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-purple-700">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </> : <div className="flex min-h-[160px] items-center justify-center text-sm text-slate-500">Select an item to see its details.</div>}
            </Card>

            <Card className="flex min-h-[340px] flex-1 flex-col overflow-hidden shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><h2 className="text-base font-semibold uppercase text-slate-800">Transactions</h2><div className="flex items-center gap-2"><label className="relative w-48 max-w-[55vw]"><FiSearch className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} aria-label="Search item transactions" className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label><button type="button" onClick={exportTransactions} aria-label="Export transactions" title="Export transactions" className="grid h-9 w-9 place-items-center rounded text-blue-600 hover:bg-blue-50"><FiDownload className="h-5 w-5" /></button></div></div>
              <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[920px] border-collapse text-left text-sm text-slate-900 dark:text-slate-100"><thead className="sticky top-0 bg-slate-100/95 text-xs font-bold uppercase tracking-wider text-slate-700 dark:bg-[#1A1E27] dark:text-slate-300"><tr>{["Type", "Invoice", "Name", "Date", "Quantity", "Price / Unit", "Amount", "Status", ""].map((heading) => <th key={heading} className="border-y border-slate-200 px-3 py-3.5 text-slate-700 dark:border-[#252B37] dark:text-slate-300">{heading}</th>)}</tr></thead><tbody>
                {filteredTransactions.map((row) => {
                  const actionKey = row.sourceId || row.id;
                  // Handles action.
                  const localAction = (action) => {
                    const current = readTransactionActions();
                    if (action === "Cancel Invoice") current.cancelled = { ...current.cancelled, [actionKey]: true };
                    if (action === "Delete") current.deleted = [...new Set([...(current.deleted || []), actionKey])];
                    if (action === "Convert To Return") current.returns = [...(current.returns || []), { id: `return-${Date.now()}`, itemId: selectedItem.id, invoice: row.invoice, name: row.name, date: new Date().toISOString(), quantity: row.quantity, unit: row.unit, price: row.price, amount: row.amount }];
                    writeTransactionActions(current);
                    setRowMenu("");
                    refresh();
                    setNotice(action === "Delete" ? "Transaction hidden from the Items screen." : `${action} saved in this browser only.`);
                  };
                  const isOpeningStock = row.type === "Opening Stock" || row.name === "Opening Stock" || String(row.id).includes("opening-stock");
                  const actions = row.type === "Sale"
                    ? ["View/Edit", "Delete", "Open PDF", "Preview", "Print", "Convert To Return", "Payment History", "View History"]
                    : row.type === "Purchase"
                    ? ["View/Edit", "Delete", "Open PDF", "Preview", "Print", "Payment History", "View History"]
                    : ["View Details", "Delete", "Preview", "Print", "Payment History", "View History"];
                  const rowActions = row.source?.batchTracked ? (row.source.cancelled ? ["View Details"] : ["View Details", "Reverse Adjustment"]) : actions;
                  return (
                    <tr key={row.id} className="border-b border-slate-200/80 text-slate-900 hover:bg-slate-50 dark:border-[#252B37] dark:text-slate-100 dark:hover:bg-[#1A1E27]/50">
                      <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                        <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${row.type === "Sale" ? "bg-emerald-500" : row.type === "Purchase" ? "bg-blue-600" : "bg-rose-600"}`} />
                        {row.type}
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{row.invoice}</td>
                      <td className="px-3 py-3.5 font-medium text-slate-800 dark:text-slate-200">{row.name}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-slate-700 dark:text-slate-300">{dateLabel(row.date)}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{row.quantity} {row.unit}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-slate-800 dark:text-slate-200">{row.price === "-" ? "-" : money(row.price)}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 font-bold text-slate-950 dark:text-slate-50">{row.amount === "-" ? "-" : money(row.amount)}</td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === "Unpaid" || row.status === "Overdue" ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-400">
                        {isOpeningStock ? (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setTransactionDetails(row)}
                              className="whitespace-nowrap rounded px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition cursor-pointer"
                            >
                              View Details
                            </button>
                          </div>
                        ) : (
                          <div className="relative flex justify-end" data-item-transaction-actions>
                            <button
                              type="button"
                              aria-label={`Actions for ${row.type}`}
                              onClick={() => setRowMenu((current) => current === `transaction-${row.id}` ? "" : `transaction-${row.id}`)}
                              className="grid h-8 w-7 place-items-center rounded hover:bg-slate-100 text-slate-400"
                            >
                              <FiMoreVertical />
                            </button>
                            {rowMenu === `transaction-${row.id}` && (
                              <div className="absolute right-0 top-8 z-40 max-h-[min(440px,70vh)] w-52 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 text-slate-700 shadow-xl">
                                {rowActions.map((action) => (
                                  <button
                                    key={action}
                                    type="button"
                                    onClick={() => {
                                      setRowMenu("");
                                      if (action === "Reverse Adjustment") {
                                        try {
                                          cancelInventoryAdjustment(row.source.id);
                                          saveBusinessItem(getInventoryItems().find((entry) => entry.id === row.source.itemId)).then(() => { refresh(); setNotice("Batch adjustment reversed."); }).catch((error) => setNotice(error.message || "Could not sync the reversed adjustment."));
                                        } catch (error) { setNotice(error.message || "Could not reverse this batch adjustment."); }
                                        return;
                                      }
                                      if (action === "Convert To Return") {
                                        const invoiceToConvert = row.source || {
                                          id: row.sourceId || `sale-${Date.now()}`,
                                          invoiceNumber: row.invoice,
                                          form: {
                                            invoiceNumber: row.invoice,
                                            customer: row.name,
                                            invoiceDate: row.date,
                                          },
                                          rows: [{
                                            id: `row-${Date.now()}`,
                                            sourceItemId: selectedItem?.id,
                                            item: selectedItem?.itemName || "Item",
                                            qty: row.quantity,
                                            price: row.price,
                                            unit: row.unit,
                                          }],
                                          totals: { finalTotal: row.amount },
                                        };
                                        navigate("/sales/sale-return-credit-note", {
                                          state: {
                                            convertInvoice: invoiceToConvert,
                                            invoiceId: row.sourceId || row.source?.id,
                                            invoiceNumber: row.invoice,
                                            customerName: row.name,
                                            targetItemId: selectedItem?.id,
                                            targetItemName: selectedItem?.itemName,
                                            targetQty: row.quantity,
                                          },
                                        });
                                        return;
                                      }
                                      if (action === "View Details" || action === "Payment History") { setTransactionDetails(row); return; }
                                      if (action === "Preview") { if (row.type === "Sale" && row.source) navigate("/sales/sale-invoices/preview", { state: { invoice: row.source } }); else setTransactionDetails(row); return; }
                                      if (action === "View/Edit") {
                                        let rawDoc = row.source ? { ...row.source, id: row.source.id || row.sourceId } : null;
                                        if (!rawDoc && row.sourceId) {
                                          if (row.type === "Sale") {
                                            rawDoc = sales.find((s) => s.id === row.sourceId) || getSaleInvoices().find((s) => s.id === row.sourceId);
                                          } else if (row.type === "Purchase") {
                                            rawDoc = purchases.find((p) => p.id === row.sourceId) || getPurchaseBills().find((p) => p.id === row.sourceId);
                                          }
                                        }

                                        if (row.type === "Sale") {
                                          navigate("/sales/sale-invoices/new", {
                                            state: { from: location.pathname, editInvoice: rawDoc },
                                          });
                                          return;
                                        }
                                        if (row.type === "Purchase") {
                                          navigate("/purchase-expense/purchase-bills/new", {
                                            state: { from: location.pathname, editPurchase: rawDoc, editBill: rawDoc, editInvoice: rawDoc },
                                          });
                                          return;
                                        }
                                        if (row.type === "Sale Order") {
                                          navigate("/sales/sale-order", {
                                            state: { from: location.pathname, editOrder: rawDoc },
                                          });
                                          return;
                                        }
                                        if (row.type === "Purchase Order") {
                                          navigate("/purchase-expense/purchase-order", {
                                            state: { from: location.pathname, editOrder: rawDoc },
                                          });
                                          return;
                                        }
                                        if (String(row.type).includes("Estimate")) {
                                          navigate("/sales/estimate-quotation", {
                                            state: { from: location.pathname, editEstimate: rawDoc, editInvoice: rawDoc },
                                          });
                                          return;
                                        }
                                        if (String(row.type).includes("Proforma")) {
                                          navigate("/sales/proforma-invoice", {
                                            state: { from: location.pathname, editProforma: rawDoc, editInvoice: rawDoc },
                                          });
                                          return;
                                        }
                                        if (row.type === "Sale Return" || row.type === "Credit Note" || String(row.type).includes("Return")) {
                                          navigate("/sales/sale-return-credit-note", {
                                            state: { from: location.pathname, editReturn: rawDoc, editCreditNote: rawDoc },
                                          });
                                          return;
                                        }
                                        if (row.type === "Purchase Return" || row.type === "Debit Note") {
                                          navigate("/purchase-expense/purchase-return-debit-note", {
                                            state: { from: location.pathname, editReturn: rawDoc, editDebitNote: rawDoc },
                                          });
                                          return;
                                        }
                                        if (row.type === "Payment-In") {
                                          navigate("/sales/payment-in", {
                                            state: { from: location.pathname, editPayment: rawDoc },
                                          });
                                          return;
                                        }
                                        if (row.type === "Payment-Out") {
                                          navigate("/purchase-expense/payment-out", {
                                            state: { from: location.pathname, editPayment: rawDoc },
                                          });
                                          return;
                                        }

                                        setTransactionDetails(row);
                                        return;
                                      }
                                      if (action === "Open PDF" || action === "Print") { if (row.source) navigate("/sales/sale-invoices/preview", { state: { invoice: row.source, printAfterOpen: true } }); else setTransactionDetails(row); return; }
                                      if (action === "View History") { setTransactionHistory(row); return; }
                                      if (action === "Delete") {
                                        setConfirmDialog({
                                          title: "Hide Transaction",
                                          message: "Hide this transaction from the Items screen? Its saved invoice will not be deleted.",
                                          confirmText: "Hide",
                                          danger: true,
                                          onConfirm: () => {
                                            localAction(action);
                                            toast.info("Transaction hidden from Items view.");
                                            setConfirmDialog(null);
                                          },
                                          onCancel: () => setConfirmDialog(null),
                                        });
                                        return;
                                      }
                                      localAction(action);
                                    }}
                                    className="w-full rounded px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                                  >
                                    {action}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filteredTransactions.length && <tr><td colSpan="9" className="px-4 py-16 text-center text-sm text-slate-500">{selectedItem ? "No Rows To Show" : "Select an item to see its transactions."}</td></tr>}
              </tbody></table></div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[calc(100vh-12.5rem)] flex-1 gap-1 xl:grid-cols-[minmax(280px,24%)_minmax(0,1fr)]">
          <Card className="flex min-h-[350px] sm:min-h-[420px] flex-col overflow-visible shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 p-3"><button type="button" aria-label="Search units" onClick={() => { setUnitSearchOpen((open) => !open); if (unitSearchOpen) setUnitSearch(""); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700"><FiSearch /></button>{unitSearchOpen && <input autoFocus value={unitSearch} onChange={(event) => setUnitSearch(event.target.value)} placeholder="Search units" className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm" />}<Button onClick={() => setUnitModal(true)} className="ml-auto h-11 rounded-md bg-amber-500 px-3 text-white shadow-sm hover:bg-amber-600"><FiPlus /> Add Units</Button><button type="button" aria-label="More unit actions" onClick={() => setUnitModal(true)} className="grid h-9 w-7 place-items-center text-slate-500"><FiMoreVertical /></button></div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold uppercase text-slate-500"><span>Full Name</span><span>Short Name</span><span /></div>
            <div className="min-h-0 flex-1 overflow-y-auto">{visibleUnits.map((unit) => <button key={unit} type="button" onClick={() => setSelectedUnit(unit)} className={`grid min-h-[58px] w-full grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2 px-3 text-left text-sm ${selectedUnit === unit ? "bg-sky-100" : "bg-white hover:bg-slate-50"}`}><span className="truncate font-medium text-slate-800">{unit}</span><span className="text-slate-700">{unit.length <= 4 ? unit[0] + unit.slice(1).toLowerCase() : unit.split(/\s+/).map((word) => word[0]).join("")}</span><FiMoreVertical className="text-slate-400" /></button>)}{!visibleUnits.length && <p className="p-6 text-center text-sm text-slate-500">No units match.</p>}</div>
          </Card>
          <div className="flex min-w-0 flex-col gap-1"><Card className="flex items-center justify-between p-4 shadow-sm"><h1 className="text-lg font-semibold uppercase text-slate-900">{selectedUnit}</h1><Button onClick={() => setConversionModal(true)} className="rounded-md bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-700">Add Conversion</Button></Card><Card className="flex min-h-[340px] flex-1 flex-col overflow-hidden shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4"><h2 className="text-base font-semibold uppercase text-slate-800">Units</h2><label className="relative w-52 max-w-[55vw]"><FiSearch className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={conversionSearch} onChange={(event) => setConversionSearch(event.target.value)} aria-label="Search conversions" className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label></div><div className="flex-1 overflow-auto"><table className="w-full border-collapse text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500"><tr><th className="border-b border-slate-200 px-4 py-3 text-left">Conversion</th><th className="border-b border-slate-200 px-4 py-3 text-left">Equivalent Unit</th><th className="border-b border-slate-200 px-4 py-3 text-right">Action</th></tr></thead><tbody>{conversions.map((conversion) => <tr key={conversion.id} className="border-b border-slate-100"><td className="px-4 py-3">1 {conversion.unit} = {conversion.factor} {conversion.toUnit}</td><td className="px-4 py-3">{conversion.toUnit}</td><td className="px-4 py-3 text-right text-slate-400"><FiMoreVertical className="inline" /></td></tr>)}{!conversions.length && <tr><td colSpan="3" className="h-56 text-center text-slate-500">No Rows To Show</td></tr>}</tbody></table></div></Card></div>
        </div>
      )}

      {itemModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setItemModal(null); }}><div className="w-full max-w-6xl" onMouseDown={(event) => event.stopPropagation()}><AddItem embedded mode={itemModal.mode} initialItem={itemModal.initialItem} onClose={() => setItemModal(null)} onSave={saveItem} /></div></div>}
      {adjustItem && <AdjustmentModal item={adjustItem} onClose={() => setAdjustItem(null)} onSave={saveAdjustment} enableBatchTracking={enableBatchTracking} />}
      {transactionDetails && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setTransactionDetails(null); }}><section className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-bold text-slate-800">{transactionDetails.type} Details</h2><p className="mt-1 text-sm text-slate-500">{transactionDetails.invoice !== "-" ? `Invoice ${transactionDetails.invoice}` : transactionDetails.name}</p></div><button type="button" aria-label="Close transaction details" onClick={() => setTransactionDetails(null)} className="rounded p-2 text-slate-500 hover:bg-slate-100"><FiX /></button></header><div className="max-h-[70vh] space-y-5 overflow-auto p-5"><div className="grid gap-4 sm:grid-cols-3">{[["Name", transactionDetails.name], ["Date", dateLabel(transactionDetails.date)], ["Status", transactionDetails.status], ["Quantity", `${transactionDetails.quantity} ${transactionDetails.unit}`], ["Price / Unit", transactionDetails.price === "-" ? "-" : money(transactionDetails.price)], ["Amount", transactionDetails.amount === "-" ? "-" : money(transactionDetails.amount)]].map(([label, value]) => <div key={label} className="rounded-md bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 font-medium text-slate-800">{value || "-"}</p></div>)}</div>{transactionDetails.source?.rows?.length > 0 && <div className="overflow-x-auto"><h3 className="mb-2 font-semibold text-slate-800">Invoice items</h3><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Item", "Quantity", "Unit", "Price", "Discount", "Tax", "Amount"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{transactionDetails.source.rows.filter((entry) => entry.item || entry.qty).map((entry, index) => <tr key={entry.id || index} className="border-b border-slate-100"><td className="px-3 py-2">{entry.item || "-"}</td><td className="px-3 py-2">{entry.calculated?.qty || entry.qty || "-"}</td><td className="px-3 py-2">{entry.unit || "-"}</td><td className="px-3 py-2">{money(entry.price)}</td><td className="px-3 py-2">{money(entry.calculated?.discount)}</td><td className="px-3 py-2">{money(entry.calculated?.tax)}</td><td className="px-3 py-2">{money(entry.calculated?.amount)}</td></tr>)}</tbody></table></div>}{transactionDetails.source?.note && <p className="text-sm text-slate-600">Note: {transactionDetails.source.note}</p>}</div><footer className="flex justify-end border-t border-slate-200 px-5 py-3"><Button onClick={() => setTransactionDetails(null)} className="bg-slate-100 text-slate-700">Close</Button></footer></section></div>}
      {transactionHistory && <Modal title="Transaction History" onClose={() => setTransactionHistory(null)}><div className="space-y-3 p-5 text-sm text-slate-700"><p><b>Type:</b> {transactionHistory.type}</p><p><b>Invoice:</b> {transactionHistory.invoice}</p><p><b>Recorded:</b> {dateLabel(transactionHistory.date)}</p><p><b>Status:</b> {transactionHistory.status}</p><p className="text-slate-500">Local changes made from this menu are stored in this browser. Source invoice records are unchanged.</p><div className="flex justify-end"><Button onClick={() => setTransactionHistory(null)} className="bg-slate-100 text-slate-700">Close</Button></div></div></Modal>}
      {deleteAllOpen && <Modal title="Delete All Items" onClose={() => { if (!deleteAllLoading) { setDeleteAllOpen(false); setDeleteAllError(""); } }}><div className="space-y-4 p-5"><p className="text-sm text-slate-700">This will permanently remove <b>{deleteAllCount?.local ?? 0} item records</b>.</p><div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">This operation cannot be undone unless a backup exists. Historical invoices, purchase bills, payments, parties, reports and shared attachments will be preserved.</div><label className="block text-sm font-medium text-slate-700">Type <b>DELETE ALL ITEMS</b> to continue<input autoFocus value={deleteAllPhrase} onChange={(event) => setDeleteAllPhrase(event.target.value)} className="mt-1.5 h-10 w-full rounded border border-slate-300 px-3" /></label>{deleteAllError && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{deleteAllError}</p>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button disabled={deleteAllLoading} onClick={() => setDeleteAllOpen(false)} className="bg-slate-100 text-slate-700">Cancel</Button><Button disabled={deleteAllPhrase !== "DELETE ALL ITEMS" || deleteAllLoading} onClick={confirmDeleteAll} className="bg-rose-600 text-white disabled:cursor-not-allowed disabled:opacity-50">{deleteAllLoading ? "Deleting…" : "Delete All Items"}</Button></div></div></Modal>}
      {bulkSelectionOpen && <Modal title={bulkAction === "inactive" ? "Select Items to Inactivate" : bulkAction === "active" ? "Select Items to Activate" : bulkAction === "code" ? "Select Items for Code Assignment" : bulkAction === "units" ? "Select Items for Unit Assignment" : "Select Items to Bulk Update"} onClose={() => { setBulkSelectionOpen(false); setBulkAction(""); setSelectedBulkIds([]); }}><div className="space-y-4 p-5"><p className="text-sm text-slate-500">Choose the items this action should affect.</p><label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={filteredItems.length > 0 && filteredItems.every((item) => selectedBulkIds.includes(item.id))} onChange={(event) => setSelectedBulkIds(event.target.checked ? filteredItems.map((item) => item.id) : [])} className="h-4 w-4 accent-blue-600" />Select all shown items</label><div className="max-h-72 space-y-1 overflow-y-auto">{filteredItems.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedBulkIds.includes(item.id)} onChange={(event) => setSelectedBulkIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} className="h-4 w-4 accent-blue-600" /><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{item.itemName}</span><span className="text-xs text-slate-400">{item.itemCode || "No code"}</span></label>)}</div><div className="flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-sm text-slate-500">{selectedBulkItems.length} selected</span><div className="flex gap-2"><Button onClick={() => { setBulkSelectionOpen(false); setBulkAction(""); setSelectedBulkIds([]); }} className="bg-slate-100 text-slate-700">Cancel</Button><Button onClick={continueBulkSelection} disabled={!selectedBulkItems.length} className="bg-blue-600 text-white">Continue</Button></div></div></div></Modal>}
      {bulkAction && !bulkSelectionOpen && <Modal title={bulkAction === "code" ? "Bulk Assign Code" : bulkAction === "units" ? "Assign Units" : "Bulk Update Items"} onClose={() => { setBulkAction(""); setSelectedBulkIds([]); }}><div className="space-y-4 p-5"><p className="text-sm text-slate-500">This action applies to {selectedBulkItems.length} selected {activeTab}{selectedBulkItems.length === 1 ? "" : "s"} and is saved only in this browser.</p>{bulkAction === "code" && <div className="max-h-72 space-y-3 overflow-y-auto">{selectedBulkItems.map((item) => <label key={item.id} className="block text-sm font-medium text-slate-600">{item.itemName}<input value={bulkCodes[item.id] || ""} onChange={(event) => setBulkCodes((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1.5 h-10 w-full rounded border border-slate-300 px-3" placeholder={`Unique code for ${item.itemName}`} /></label>)}</div>}{bulkAction === "units" && <label className="block text-sm font-medium text-slate-600">Set the same unit for all selected items<select value={bulkUnit} onChange={(event) => setBulkUnit(event.target.value)} className="mt-1.5 h-10 w-full rounded border border-slate-300 bg-white px-3"><option value="">Choose a unit</option>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>}{bulkAction === "update" && <div className="space-y-3"><label className="block text-sm font-medium text-slate-600">Sale price<input value={bulkFields.salePrice} onChange={(event) => setBulkFields((current) => ({ ...current, salePrice: event.target.value }))} className="mt-1.5 h-10 w-full rounded border border-slate-300 px-3" placeholder="Leave blank to keep current" /></label><label className="block text-sm font-medium text-slate-600">Purchase price<input value={bulkFields.purchasePrice} onChange={(event) => setBulkFields((current) => ({ ...current, purchasePrice: event.target.value }))} className="mt-1.5 h-10 w-full rounded border border-slate-300 px-3" placeholder="Leave blank to keep current" /></label><label className="block text-sm font-medium text-slate-600">Category<input value={bulkFields.category} onChange={(event) => setBulkFields((current) => ({ ...current, category: event.target.value }))} className="mt-1.5 h-10 w-full rounded border border-slate-300 px-3" placeholder="Leave blank to keep current" /></label></div>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button onClick={() => { setBulkAction(""); setSelectedBulkIds([]); }} className="bg-slate-100 text-slate-700">Cancel</Button><Button onClick={saveBulkAction} disabled={(bulkAction === "units" && !bulkUnit) || (bulkAction === "code" && selectedBulkItems.some((item) => !String(bulkCodes[item.id] || "").trim()))} className="bg-blue-600 text-white">Apply</Button></div></div></Modal>}
      {unitModal && <Modal title="Add Unit" onClose={() => setUnitModal(false)}><div className="space-y-4 p-5"><label className="block text-sm font-semibold text-slate-600">Unit name<input autoFocus value={unitName} onChange={(event) => setUnitName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createUnit(); }} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" placeholder="e.g. Carton" /></label><div className="flex justify-end gap-2"><Button onClick={() => setUnitModal(false)} className="bg-slate-100 text-slate-700">Cancel</Button><Button onClick={createUnit} className="bg-blue-600 text-white">Save Unit</Button></div></div></Modal>}
      {conversionModal && <Modal title={`Add Conversion · ${selectedUnit}`} onClose={() => setConversionModal(false)}><div className="space-y-4 p-5"><label className="block text-sm font-semibold text-slate-600">1 {selectedUnit} equals<input inputMode="decimal" value={conversionFactor} onChange={(event) => setConversionFactor(event.target.value.replace(/[^\d.]/g, ""))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" /></label><label className="block text-sm font-semibold text-slate-600">Unit<select value={conversionUnit} onChange={(event) => setConversionUnit(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">Select unit</option>{units.filter((unit) => unit !== selectedUnit).map((unit) => <option key={unit}>{unit}</option>)}</select></label><div className="flex justify-end gap-2"><Button onClick={() => setConversionModal(false)} className="bg-slate-100 text-slate-700">Cancel</Button><Button onClick={createConversion} className="bg-blue-600 text-white">Save Conversion</Button></div></div></Modal>}
      {itemStatusModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setItemStatusModal(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                  <FiShield className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Cannot Delete Item</h2>
                  <p className="text-xs text-slate-500">Transaction integrity protection</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItemStatusModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950 leading-relaxed">
                <p className="font-semibold text-amber-950">
                  "{itemStatusModal.itemName}" is already included in database transactions (such as purchase or sales transactions).
                </p>
                <p className="mt-1.5 text-amber-900">
                  To protect historical invoice and audit records, this item <strong>must not be permanently deleted</strong>. You can deactivate it without deleting it by choosing an option below:
                </p>
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Status Options:</p>

                {/* Active Option */}
                <button
                  type="button"
                  onClick={async () => {
                    const item = itemStatusModal;
                    try {
                      if (isDatabaseMode()) await itemsDb.reactivate(item.id);
                      saveInventoryItem({ ...item, isActive: true });
                      await refresh();
                      toast.success(`"${item.itemName}" set to Active.`);
                      setItemStatusModal(null);
                    } catch (err) {
                      toast.error(err.message || "Could not activate item.");
                    }
                  }}
                  className={`w-full flex items-center justify-between rounded-xl border p-3.5 text-left transition ${
                    itemStatusModal.isActive !== false
                      ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20"
                      : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-3 w-3 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Active
                        {itemStatusModal.isActive !== false && (
                          <span className="ml-2 text-xs font-normal text-emerald-700">(Current)</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">Item is active and available for new sales &amp; purchases.</p>
                    </div>
                  </div>
                  {itemStatusModal.isActive !== false ? (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">Active</span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 hover:bg-emerald-100">Set Active</span>
                  )}
                </button>

                {/* Inactive Option */}
                <button
                  type="button"
                  onClick={async () => {
                    const item = itemStatusModal;
                    try {
                      if (isDatabaseMode()) await itemsDb.deactivate(item.id);
                      saveInventoryItem({ ...item, isActive: false });
                      await refresh();
                      toast.success(`"${item.itemName}" marked as Inactive.`);
                      setItemStatusModal(null);
                    } catch (err) {
                      toast.error(err.message || "Could not inactivate item.");
                    }
                  }}
                  className={`w-full flex items-center justify-between rounded-xl border p-3.5 text-left transition ${
                    itemStatusModal.isActive === false
                      ? "border-rose-400 bg-rose-50/60 ring-2 ring-rose-400/20"
                      : "border-slate-200 hover:border-amber-400 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-3 w-3 shrink-0 rounded-full bg-rose-500 ring-4 ring-rose-100" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Inactive
                        {itemStatusModal.isActive === false && (
                          <span className="ml-2 text-xs font-normal text-rose-700">(Current)</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">Deactivated: hidden from new sales, but preserves all historical data.</p>
                    </div>
                  </div>
                  {itemStatusModal.isActive === false ? (
                    <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full">Inactive</span>
                  ) : (
                    <span className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1 rounded-md shadow-xs">
                      Make Inactive
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-100 pt-3">
              <Button
                onClick={() => setItemStatusModal(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog && (
        <ConfirmModal
          isOpen={Boolean(confirmDialog)}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText="Cancel"
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel || (() => setConfirmDialog(null))}
        />
      )}
    </div>
  );
}

export default ItemsDashboard;
