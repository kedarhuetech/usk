import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiArrowUpRight,
  FiChevronDown,
  FiDownload,
  FiFilter,
  FiMoreVertical,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSliders,
  FiX,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import AddItem from "./AddItem";
import { loadBusinessItems, loadPurchaseBills, loadSalesInvoices, saveBusinessItem } from "../../services/businessRecords";
import { getInventoryAdjustments, saveInventoryAdjustment } from "../../services/inventoryAdjustmentsStorage";
import { addCustomUnit, addUnitConversion, getUnitConversions, getUnits } from "../../services/unitsStorage";

const tabs = [
  { id: "product", label: "PRODUCTS" },
  { id: "service", label: "SERVICES" },
  { id: "units", label: "UNITS" },
];

function dateLabel(value) {
  if (!value) return "-";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN");
}

function money(value) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function quantity(item) {
  return Number(item?.openingQuantity ?? item?.stock ?? 0) || 0;
}

function stockValue(item) {
  return quantity(item) * (Number(item?.purchasePrice || 0) || 0);
}

function transactionRows(item, sales, purchases) {
  if (!item) return [];
  const matches = (row) => row.sourceItemId === item.id || String(row.item || "").trim().toLowerCase() === String(item.itemName || "").trim().toLowerCase();
  const saleRows = sales.flatMap((invoice) => (invoice.rows || []).filter(matches).map((row) => ({
    id: `${invoice.id}-${row.id}`,
    type: invoice.transactionType === "purchase" ? "Purchase" : "Sale",
    invoice: invoice.form?.invoiceNumber || invoice.invoiceNumber || "-",
    name: invoice.form?.customer || (invoice.transactionType === "purchase" ? "Supplier" : "Cash Sale"),
    date: invoice.form?.invoiceDate || invoice.createdAt,
    quantity: row.qty || 0,
    unit: row.unit || item.unit || "",
    price: row.price || 0,
    amount: row.calculated?.amount ?? Number(row.qty || 0) * Number(row.price || 0),
    status: Number(invoice.totals?.balance || 0) > 0 ? "Due" : "Paid",
  })));
  const purchaseRows = purchases.flatMap((invoice) => (invoice.rows || []).filter(matches).map((row) => ({
    id: `${invoice.id}-${row.id}`,
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
    type: "Add Adjustment",
    invoice: "-",
    name: adjustment.note || "Stock adjustment",
    date: adjustment.createdAt,
    quantity: `${adjustment.direction === "reduce" ? "−" : "+"}${adjustment.quantity}`,
    unit: adjustment.unit || item.unit || "",
    price: "-",
    amount: "-",
    status: "Completed",
  }));
  return [...saleRows, ...purchaseRows, ...adjustments].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function downloadCsv(filename, rows) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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

function AdjustmentModal({ item, onClose, onSave }) {
  const [direction, setDirection] = useState("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) { setError("Enter a quantity greater than zero."); return; }
    const next = quantity(item) + (direction === "add" ? parsed : -parsed);
    if (next < 0) { setError("Stock cannot be reduced below zero."); return; }
    setSaving(true);
    try { await onSave(item, String(next), { direction, quantity: parsed, note: note.trim() }); onClose(); }
    catch (saveError) { setError(saveError.message || "Could not save the stock adjustment."); setSaving(false); }
  };
  return (
    <Modal title="Adjust Stock" onClose={onClose}>
      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-600">{item.itemName} · Current quantity <b>{quantity(item)} {item.unit}</b></p>
        <label className="block text-sm font-semibold text-slate-600">Adjustment type<select value={direction} onChange={(event) => setDirection(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"><option value="add">Add stock</option><option value="reduce">Reduce stock</option></select></label>
        <label className="block text-sm font-semibold text-slate-600">Quantity<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" placeholder="Enter quantity" /></label>
        <label className="block text-sm font-semibold text-slate-600">Note <span className="font-normal text-slate-400">(optional)</span><input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" placeholder="Reason for adjustment" /></label>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button onClick={onClose} className="bg-slate-100 text-slate-700">Cancel</Button><Button onClick={save} disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">{saving ? "Saving…" : "Save Adjustment"}</Button></div>
      </div>
    </Modal>
  );
}

function ItemsDashboard() {
  const [activeTab, setActiveTab] = useState("product");
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState("All categories");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState("");
  const [itemModal, setItemModal] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
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
  const menuRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const [loadedItems, loadedSales, loadedPurchases] = await Promise.all([loadBusinessItems(), loadSalesInvoices(), loadPurchaseBills()]);
      setItems(loadedItems);
      setSales(loadedSales);
      setPurchases(loadedPurchases);
      setSelectedId((current) => current || loadedItems[0]?.id || "");
    } catch (error) {
      setLoadError(error.message || "Could not load item data.");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onPointerDown = (event) => { if (!menuRef.current?.contains(event.target)) { setMenuOpen(false); setRowMenu(""); } };
    const onKeyDown = (event) => { if (event.key === "Escape") { setMenuOpen(false); setRowMenu(""); setItemModal(null); setAdjustItem(null); setUnitModal(false); setConversionModal(false); } };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  const categories = useMemo(() => ["All categories", ...new Set(items.filter((item) => item.type === activeTab && item.category).map((item) => item.category))], [items, activeTab]);
  const filteredItems = useMemo(() => items.filter((item) => {
    if (item.type !== activeTab || activeTab === "units") return false;
    if (category !== "All categories" && item.category !== category) return false;
    if (lowStockOnly && activeTab === "product" && quantity(item) > Number(item.minimumStock || 0)) return false;
    return String(item.itemName || "").toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => String(a.itemName || "").localeCompare(String(b.itemName || ""))), [items, activeTab, category, lowStockOnly, search]);
  const selectedItem = filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null;
  const allTransactions = useMemo(() => transactionRows(selectedItem, sales, purchases), [selectedItem, sales, purchases]);
  const filteredTransactions = allTransactions.filter((row) => `${row.type} ${row.invoice} ${row.name} ${row.quantity} ${row.unit}`.toLowerCase().includes(transactionSearch.trim().toLowerCase()));
  const visibleUnits = units.filter((unit) => unit.toLowerCase().includes(unitSearch.trim().toLowerCase()));
  const conversions = useMemo(() => getUnitConversions(selectedUnit).filter((conversion) => `${conversion.toUnit} ${conversion.factor}`.toLowerCase().includes(conversionSearch.trim().toLowerCase())), [selectedUnit, units, conversionSearch]);

  const saveItem = async (value) => {
    const saved = await saveBusinessItem(value);
    setItems((current) => [...current.filter((item) => item.id !== saved.id), saved]);
    setSelectedId(saved.id);
    setActiveTab(saved.type === "service" ? "service" : "product");
    setCategory("All categories");
    setSearch("");
    setItemModal(null);
    setNotice(`${saved.itemName} saved.`);
  };

  const saveAdjustment = async (item, nextQuantity, adjustment) => {
    const updated = await saveBusinessItem({ ...item, openingQuantity: nextQuantity, stock: nextQuantity });
    saveInventoryAdjustment({ itemId: item.id, unit: item.unit || "", ...adjustment });
    setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    setNotice("Stock adjustment saved.");
  };

  const createUnit = () => {
    const nextUnits = addCustomUnit(unitName);
    if (!unitName.trim()) return;
    const added = nextUnits.find((unit) => unit.toLowerCase() === unitName.trim().toLowerCase());
    setUnits(nextUnits);
    if (added) setSelectedUnit(added);
    setUnitName("");
    setUnitModal(false);
  };

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

  const exportItems = () => downloadCsv("items.csv", [["Item", "Code", "Category", "Sale Price", "Purchase Price", "Stock", "Unit"], ...filteredItems.map((item) => [item.itemName, item.itemCode, item.category, item.salePrice, item.purchasePrice, quantity(item), item.unit])]);
  const exportTransactions = () => downloadCsv(`item-transactions-${selectedItem?.itemName || ""}.csv`, [["Type", "Invoice", "Name", "Date", "Quantity", "Unit", "Price", "Amount", "Status"], ...filteredTransactions.map((row) => [row.type, row.invoice, row.name, row.date, row.quantity, row.unit, row.price, row.amount, row.status])]);

  return (
    <div className="flex min-h-full flex-col bg-slate-200 p-1.5">
      <div className="mb-1 grid grid-cols-3 bg-white">
        {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setSelectedId(""); setSearch(""); }} className={`border-b-2 px-3 py-4 text-center text-sm font-bold transition ${activeTab === tab.id ? "border-sky-600 text-slate-800" : "border-transparent text-slate-400 hover:text-slate-700"}`}>{tab.label}</button>)}
      </div>
      {loadError && <div role="alert" className="mb-1 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</div>}
      {notice && <div role="status" className="mb-1 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><FiX /></button></div>}

      {activeTab !== "units" ? (
        <div className="grid min-h-[calc(100vh-12.5rem)] flex-1 gap-1 xl:grid-cols-[minmax(280px,24%)_minmax(0,1fr)]">
          <Card className="flex min-h-[420px] flex-col overflow-visible shadow-sm">
            <div className="relative flex items-center gap-2 border-b border-slate-200 p-3">
              <button type="button" aria-label={searchOpen ? "Close item search" : "Search items"} onClick={() => { setSearchOpen((open) => !open); if (searchOpen) setSearch(""); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"><FiSearch className="h-5 w-5" /></button>
              {searchOpen && <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${activeTab}s`} aria-label={`Search ${activeTab}s`} className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-500" />}
              <div ref={menuRef} className="relative ml-auto flex h-11 overflow-visible rounded-md bg-amber-500 text-white shadow-sm">
                <button type="button" onClick={() => setItemModal({ mode: "create", initialItem: { type: activeTab } })} className="flex items-center gap-2 px-3 text-sm font-bold hover:bg-amber-600"><FiPlus /> Add {activeTab === "product" ? "Item" : "Service"}</button>
                <button type="button" aria-label="Choose item type" onClick={() => setRowMenu((current) => current === "create-menu" ? "" : "create-menu")} className="grid w-10 place-items-center border-l border-amber-600/50 hover:bg-amber-600"><FiChevronDown /></button>
                {rowMenu === "create-menu" && <div className="absolute right-0 top-12 z-40 w-44 rounded-md border border-slate-200 bg-white py-1 text-slate-700 shadow-xl"><button type="button" onClick={() => { setActiveTab("product"); setItemModal({ mode: "create", initialItem: { type: "product" } }); setRowMenu(""); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50">Add Product</button><button type="button" onClick={() => { setActiveTab("service"); setItemModal({ mode: "create", initialItem: { type: "service" } }); setRowMenu(""); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50">Add Service</button></div>}
              </div>
              <div className="relative">
                <button type="button" aria-label="More item actions" onClick={() => setMenuOpen((open) => !open)} className="grid h-9 w-7 place-items-center text-slate-500 hover:text-slate-900"><FiMoreVertical /></button>
                {menuOpen && <div className="absolute right-0 top-9 z-40 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-xl"><button type="button" onClick={() => { exportItems(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-50"><FiDownload /> Export items</button><button type="button" onClick={() => { refresh(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-50"><FiRefreshCw /> Refresh list</button></div>}
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_30px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold uppercase text-slate-500"><span>Item</span><span>{activeTab === "product" ? "Quantity" : "Unit"}</span><button type="button" aria-label="Filter items" onClick={() => setFiltersOpen((open) => !open)} className={`grid h-7 w-7 place-items-center rounded ${filtersOpen ? "bg-blue-100 text-blue-700" : "hover:bg-slate-200"}`}><FiFilter /></button></div>
            {filtersOpen && <div className="grid gap-2 border-b border-slate-200 bg-white p-3"><label className="text-[11px] font-semibold uppercase text-slate-500">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700">{categories.map((value) => <option key={value}>{value}</option>)}</select></label>{activeTab === "product" && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} className="accent-blue-600" />Low stock only</label>}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredItems.map((item) => <div key={item.id} className={`group relative grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2 px-3 ${selectedItem?.id === item.id ? "bg-sky-100" : "bg-white hover:bg-slate-50"}`}>
                <button type="button" onClick={() => setSelectedId(item.id)} className="min-w-0 py-2 text-left"><span className="block truncate text-sm font-semibold text-slate-800">{item.itemName}</span>{item.itemCode && <span className="block truncate text-xs text-slate-400">{item.itemCode}</span>}</button>
                <span className={`whitespace-nowrap text-sm font-medium ${activeTab === "product" && quantity(item) < 0 ? "text-rose-600" : "text-emerald-600"}`}>{activeTab === "product" ? `${quantity(item)}${item.unit ? ` ${item.unit}` : ""}` : item.unit || "-"}</span>
                <button type="button" aria-label={`Actions for ${item.itemName}`} onClick={() => setRowMenu((current) => current === item.id ? "" : item.id)} className="grid h-8 w-6 place-items-center rounded text-slate-400 hover:bg-white hover:text-slate-700"><FiMoreVertical /></button>
                {rowMenu === item.id && <div className="absolute right-2 top-9 z-30 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"><button type="button" onClick={() => { setItemModal({ mode: "edit", initialItem: item }); setRowMenu(""); }} className="w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">View / Edit</button>{activeTab === "product" && <button type="button" onClick={() => { setAdjustItem(item); setRowMenu(""); }} className="w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Adjust Stock</button>}</div>}
              </div>)}
              {!filteredItems.length && <div className="grid min-h-60 place-items-center px-6 text-center"><div><p className="font-semibold text-slate-700">{search ? "No items match your search" : `No ${activeTab}s yet`}</p><p className="mt-1 text-sm text-slate-500">Add a {activeTab} to get started.</p><Button onClick={() => setItemModal({ mode: "create", initialItem: { type: activeTab } })} className="mt-4 bg-amber-500 text-white hover:bg-amber-600"><FiPlus /> Add {activeTab === "product" ? "Item" : "Service"}</Button></div></div>}
            </div>
          </Card>

          <div className="flex min-w-0 flex-col gap-1">
            <Card className="shrink-0 p-4 shadow-sm sm:p-5">
              {selectedItem ? <>
                <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-2"><h1 className="truncate text-lg font-semibold uppercase text-slate-900">{selectedItem.itemName}</h1><button type="button" aria-label="Edit item" onClick={() => setItemModal({ mode: "edit", initialItem: selectedItem })} className="rounded p-1 text-slate-600 hover:bg-slate-100"><FiArrowUpRight /></button></div>{activeTab === "product" && <Button onClick={() => setAdjustItem(selectedItem)} className="rounded-md bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-700"><FiSliders /> Adjust Item</Button>}</div>
                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div className="space-y-3"><p className="text-slate-700">SALE PRICE: <b className="font-medium text-emerald-600">{money(selectedItem.salePrice)} <span className="font-normal text-slate-500">(excl)</span></b></p><p className="text-slate-700">PURCHASE PRICE: <b className="font-medium text-emerald-600">{money(selectedItem.purchasePrice)} <span className="font-normal text-slate-500">(excl)</span></b></p></div><div className="space-y-3 sm:text-right"><p className="text-slate-700">{activeTab === "product" ? "STOCK QUANTITY:" : "UNIT:"} <b className="font-medium text-emerald-600">{activeTab === "product" ? `${quantity(selectedItem)} ${selectedItem.unit || ""}` : selectedItem.unit || "-"}</b></p>{activeTab === "product" && <p className="text-slate-700">STOCK VALUE: <b className="font-medium text-emerald-600">{money(stockValue(selectedItem))}</b></p>}</div></div>
              </> : <div className="flex min-h-[160px] items-center justify-center text-sm text-slate-500">Select an item to see its details.</div>}
            </Card>

            <Card className="flex min-h-[340px] flex-1 flex-col overflow-hidden shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><h2 className="text-base font-semibold uppercase text-slate-800">Transactions</h2><div className="flex items-center gap-2"><label className="relative w-48 max-w-[55vw]"><FiSearch className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} aria-label="Search item transactions" className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label><button type="button" onClick={exportTransactions} aria-label="Export transactions" title="Export transactions" className="grid h-9 w-9 place-items-center rounded text-blue-600 hover:bg-blue-50"><FiDownload className="h-5 w-5" /></button></div></div>
              <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[800px] border-collapse text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs font-bold uppercase text-slate-500"><tr>{["Type", "Invoice", "Name", "Date", "Quantity", "Price / Unit", "Status", ""].map((heading) => <th key={heading} className="border-y border-slate-200 px-3 py-3">{heading}</th>)}</tr></thead><tbody>
                {filteredTransactions.map((row) => <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50"><td className="whitespace-nowrap px-3 py-3"><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${row.type === "Sale" ? "bg-emerald-500" : row.type === "Purchase" ? "bg-emerald-900" : "bg-rose-900"}`} />{row.type}</td><td className="px-3 py-3">{row.invoice}</td><td className="px-3 py-3">{row.name}</td><td className="whitespace-nowrap px-3 py-3">{dateLabel(row.date)}</td><td className="whitespace-nowrap px-3 py-3">{row.quantity} {row.unit}</td><td className="whitespace-nowrap px-3 py-3">{row.price === "-" ? "-" : money(row.price)}</td><td className="px-3 py-3">{row.status}</td><td className="px-3 py-3 text-slate-400"><FiMoreVertical /></td></tr>)}
                {!filteredTransactions.length && <tr><td colSpan="8" className="px-4 py-16 text-center text-sm text-slate-500">{selectedItem ? "No Rows To Show" : "Select an item to see its transactions."}</td></tr>}
              </tbody></table></div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[calc(100vh-12.5rem)] flex-1 gap-1 xl:grid-cols-[minmax(280px,24%)_minmax(0,1fr)]">
          <Card className="flex min-h-[420px] flex-col overflow-visible shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 p-3"><button type="button" aria-label="Search units" onClick={() => { setUnitSearchOpen((open) => !open); if (unitSearchOpen) setUnitSearch(""); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700"><FiSearch /></button>{unitSearchOpen && <input autoFocus value={unitSearch} onChange={(event) => setUnitSearch(event.target.value)} placeholder="Search units" className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm" />}<Button onClick={() => setUnitModal(true)} className="ml-auto h-11 rounded-md bg-amber-500 px-3 text-white shadow-sm hover:bg-amber-600"><FiPlus /> Add Units</Button><button type="button" aria-label="More unit actions" onClick={() => setUnitModal(true)} className="grid h-9 w-7 place-items-center text-slate-500"><FiMoreVertical /></button></div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold uppercase text-slate-500"><span>Full Name</span><span>Short Name</span><span /></div>
            <div className="min-h-0 flex-1 overflow-y-auto">{visibleUnits.map((unit) => <button key={unit} type="button" onClick={() => setSelectedUnit(unit)} className={`grid min-h-[58px] w-full grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2 px-3 text-left text-sm ${selectedUnit === unit ? "bg-sky-100" : "bg-white hover:bg-slate-50"}`}><span className="truncate font-medium text-slate-800">{unit}</span><span className="text-slate-700">{unit.length <= 4 ? unit[0] + unit.slice(1).toLowerCase() : unit.split(/\s+/).map((word) => word[0]).join("")}</span><FiMoreVertical className="text-slate-400" /></button>)}{!visibleUnits.length && <p className="p-6 text-center text-sm text-slate-500">No units match.</p>}</div>
          </Card>
          <div className="flex min-w-0 flex-col gap-1"><Card className="flex items-center justify-between p-4 shadow-sm"><h1 className="text-lg font-semibold uppercase text-slate-900">{selectedUnit}</h1><Button onClick={() => setConversionModal(true)} className="rounded-md bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-700">Add Conversion</Button></Card><Card className="flex min-h-[340px] flex-1 flex-col overflow-hidden shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4"><h2 className="text-base font-semibold uppercase text-slate-800">Units</h2><label className="relative w-52 max-w-[55vw]"><FiSearch className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={conversionSearch} onChange={(event) => setConversionSearch(event.target.value)} aria-label="Search conversions" className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label></div><div className="flex-1 overflow-auto"><table className="w-full border-collapse text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500"><tr><th className="border-b border-slate-200 px-4 py-3 text-left">Conversion</th><th className="border-b border-slate-200 px-4 py-3 text-left">Equivalent Unit</th><th className="border-b border-slate-200 px-4 py-3 text-right">Action</th></tr></thead><tbody>{conversions.map((conversion) => <tr key={conversion.id} className="border-b border-slate-100"><td className="px-4 py-3">1 {conversion.unit} = {conversion.factor} {conversion.toUnit}</td><td className="px-4 py-3">{conversion.toUnit}</td><td className="px-4 py-3 text-right text-slate-400"><FiMoreVertical className="inline" /></td></tr>)}{!conversions.length && <tr><td colSpan="3" className="h-56 text-center text-slate-500">No Rows To Show</td></tr>}</tbody></table></div></Card></div>
        </div>
      )}

      {itemModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setItemModal(null); }}><div className="w-full max-w-6xl" onMouseDown={(event) => event.stopPropagation()}><AddItem embedded mode={itemModal.mode} initialItem={itemModal.initialItem} onClose={() => setItemModal(null)} onSave={saveItem} /></div></div>}
      {adjustItem && <AdjustmentModal item={adjustItem} onClose={() => setAdjustItem(null)} onSave={saveAdjustment} />}
      {unitModal && <Modal title="Add Unit" onClose={() => setUnitModal(false)}><div className="space-y-4 p-5"><label className="block text-sm font-semibold text-slate-600">Unit name<input autoFocus value={unitName} onChange={(event) => setUnitName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createUnit(); }} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" placeholder="e.g. Carton" /></label><div className="flex justify-end gap-2"><Button onClick={() => setUnitModal(false)} className="bg-slate-100 text-slate-700">Cancel</Button><Button onClick={createUnit} className="bg-blue-600 text-white">Save Unit</Button></div></div></Modal>}
      {conversionModal && <Modal title={`Add Conversion · ${selectedUnit}`} onClose={() => setConversionModal(false)}><div className="space-y-4 p-5"><label className="block text-sm font-semibold text-slate-600">1 {selectedUnit} equals<input inputMode="decimal" value={conversionFactor} onChange={(event) => setConversionFactor(event.target.value.replace(/[^\d.]/g, ""))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal" /></label><label className="block text-sm font-semibold text-slate-600">Unit<select value={conversionUnit} onChange={(event) => setConversionUnit(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">Select unit</option>{units.filter((unit) => unit !== selectedUnit).map((unit) => <option key={unit}>{unit}</option>)}</select></label><div className="flex justify-end gap-2"><Button onClick={() => setConversionModal(false)} className="bg-slate-100 text-slate-700">Cancel</Button><Button onClick={createConversion} className="bg-blue-600 text-white">Save Conversion</Button></div></div></Modal>}
    </div>
  );
}

export default ItemsDashboard;
