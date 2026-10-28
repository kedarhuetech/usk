// Implements the export items page.
import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { FiAlertCircle, FiCheckCircle, FiDownload, FiFileText, FiSearch } from "react-icons/fi";
import * as XLSX from "xlsx";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { getInventoryItems } from "../../services/itemsStorage";

const fieldDefinitions = [
  ["itemName", "Item Name"],
  ["itemCode", "Item Code"],
  ["description", "Description"],
  ["category", "Category"],
  ["hsn", "HSN"],
  ["salePrice", "Sale Price"],
  ["purchasePrice", "Purchase Price"],
  ["stock", "Current Stock"],
  ["minimumStock", "Minimum Stock"],
  ["location", "Item Location"],
  ["taxRate", "Tax Rate"],
  ["saleTaxMode", "Sale Tax Type"],
  ["purchaseTaxMode", "Purchase Tax Type"],
];

// This helper handles for logic.
const valueFor = (item, key) => {
  if (key === "stock") return item.openingQuantity ?? item.stock ?? "";
  return item[key] ?? "";
};

// This helper handles stamp logic.
const dateStamp = () => new Date().toISOString().slice(0, 10);

// Exports rows.
function exportRows(items) {
  const activeFields = fieldDefinitions.filter(([key]) => (
    key === "itemName" || items.some((item) => String(valueFor(item, key)).trim())
  ));
  return {
    headers: activeFields.map(([, label]) => label),
    rows: items.map((item) => activeFields.map(([key]) => String(valueFor(item, key) ?? ""))),
  };
}

// Downloads pdf.
function downloadPdf(items) {
  const { headers, rows } = exportRows(items);
  const document = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 28;
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const columnWidth = (pageWidth - (margin * 2)) / headers.length;
  const rowHeight = 24;
  // Draws header.
  const drawHeader = () => {
    document.setFillColor(26, 31, 113);
    document.rect(margin, 28, pageWidth - (margin * 2), 24, "F");
    document.setTextColor(255, 255, 255);
    document.setFontSize(7);
    headers.forEach((header, index) => document.text(header.slice(0, 18), margin + (index * columnWidth) + 3, 44));
    document.setTextColor(30, 41, 59);
  };

  document.setFontSize(14);
  document.setTextColor(15, 23, 42);
  document.text("USV Items", margin, 20);
  let y = 52;
  drawHeader();
  document.setFontSize(7);
  rows.forEach((row) => {
    if (y + rowHeight > pageHeight - margin) {
      document.addPage();
      y = 28;
      drawHeader();
      y = 52;
    }
    document.setDrawColor(226, 232, 240);
    document.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    row.forEach((value, index) => {
      const lines = document.splitTextToSize(value, Math.max(columnWidth - 6, 20)).slice(0, 2);
      document.text(lines, margin + (index * columnWidth) + 3, y + 10);
    });
    y += rowHeight;
  });
  document.save(`USV_Items_${dateStamp()}.pdf`);
}

// Renders the export items interface.
function ExportItems() {
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setItems(getInventoryItems());
    setLoading(false);
  }, []);

  const categories = useMemo(() => [...new Set(items.map((item) => String(item.category || "").trim()).filter(Boolean))].sort(), [items]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const searchable = [item.itemName, item.itemCode, item.description, item.category].map((value) => String(value || "").toLowerCase()).join(" ");
      return (!normalizedQuery || searchable.includes(normalizedQuery)) && (!category || item.category === category);
    });
  }, [items, query, category]);
  const selectedItems = useMemo(() => {
    const source = selectedIds.size ? filteredItems.filter((item) => selectedIds.has(item.id)) : filteredItems;
    return source;
  }, [filteredItems, selectedIds]);
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));

  // Toggles all.
  const toggleAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filteredItems.forEach((item) => next.delete(item.id));
      else filteredItems.forEach((item) => next.add(item.id));
      return next;
    });
  };

  // Toggles item.
  const toggleItem = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Exports excel.
  const exportExcel = () => {
    if (!selectedItems.length) {
      setStatus({ type: "error", message: "There are no items matching the current selection." });
      return;
    }
    const { headers, rows } = exportRows(selectedItems);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    worksheet["!cols"] = headers.map((header, index) => ({
      wch: Math.min(34, Math.max(header.length + 2, ...rows.map((row) => String(row[index] || "").length + 2))),
    }));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Items");
    XLSX.writeFile(workbook, `USV_Items_${dateStamp()}.xlsx`);
    setStatus({ type: "success", message: `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} exported to Excel.` });
  };

  // Exports pdf.
  const exportPdf = () => {
    if (!selectedItems.length) {
      setStatus({ type: "error", message: "There are no items matching the current selection." });
      return;
    }
    downloadPdf(selectedItems);
    setStatus({ type: "success", message: `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} exported to PDF.` });
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Export Items</h1>
          <p className="mt-1 text-sm text-slate-500">Export saved items from the current business without changing inventory.</p>
        </header>
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <FiSearch className="text-slate-400" />
              <input aria-label="Search items" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, category..." className="h-10 w-full outline-none" />
            </label>
            <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="">All categories</option>
              {categories.map((value) => <option key={value}>{value}</option>)}
            </select>
            <Button onClick={exportExcel} disabled={loading || !filteredItems.length} className="bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiDownload /> Export Excel</Button>
            <Button onClick={exportPdf} disabled={loading || !filteredItems.length} className="border border-slate-300 text-slate-700 hover:bg-white"><FiFileText /> Export PDF</Button>
          </div>
          {status.message && <p role={status.type === "error" ? "alert" : "status"} className={`mt-4 flex gap-2 rounded-lg p-3 text-sm ${status.type === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{status.type === "error" ? <FiAlertCircle /> : <FiCheckCircle />}{status.message}</p>}
        </Card>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-800">Saved Items</h2>
              <p className="text-sm text-slate-500">{loading ? "Loading items..." : `${filteredItems.length} item${filteredItems.length === 1 ? "" : "s"} shown`}{selectedIds.size ? ` · ${selectedIds.size} selected` : " · all shown items will export"}</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} disabled={!filteredItems.length} className="accent-blue-600" /> Select shown items</label>
          </div>
          {loading ? <p className="p-5 text-sm text-slate-500">Loading saved items...</p> : !filteredItems.length ? <p className="p-5 text-sm text-slate-500">No saved items match the current filters.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Select</th><th className="px-5 py-3">Item Name</th><th className="px-5 py-3">Item Code</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Sale Price</th><th className="px-5 py-3">Current Stock</th></tr></thead>
                <tbody>{filteredItems.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-5 py-3"><input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleItem(item.id)} className="accent-blue-600" /></td><td className="px-5 py-3 font-medium text-slate-800">{item.itemName || "Unnamed item"}</td><td className="px-5 py-3 text-slate-600">{item.itemCode || "-"}</td><td className="px-5 py-3 text-slate-600">{item.category || "-"}</td><td className="px-5 py-3 text-slate-600">{item.salePrice || "-"}</td><td className="px-5 py-3 text-slate-600">{valueFor(item, "stock") || "-"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default ExportItems;
