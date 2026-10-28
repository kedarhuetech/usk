// Implements the update items in bulk page.
import { useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiSearch, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { units, taxModes, taxOptions, discountTypes } from "../../constants/itemsData";
import { getInventoryItems, saveInventoryItem } from "../../services/itemsStorage";

const fields = [
  { key: "itemName", label: "Item Name", type: "text" },
  { key: "hsn", label: "HSN / SAC", type: "text" },
  { key: "category", label: "Category", type: "text" },
  { key: "itemCode", label: "Item Code", type: "text" },
  { key: "unit", label: "Unit", type: "select", options: units },
  { key: "secondaryUnit", label: "Secondary Unit", type: "select", options: units },
  { key: "salePrice", label: "Sale Price", type: "number" },
  { key: "saleTaxMode", label: "Sale Tax Mode", type: "select", options: taxModes },
  { key: "purchasePrice", label: "Purchase Price", type: "number" },
  { key: "purchaseTaxMode", label: "Purchase Tax Mode", type: "select", options: taxModes },
  { key: "discount", label: "Discount", type: "number" },
  { key: "discountType", label: "Discount Type", type: "select", options: discountTypes },
  { key: "taxRate", label: "Tax Rate", type: "select", options: taxOptions },
  { key: "openingQuantity", label: "Opening Quantity", type: "number" },
  { key: "atPrice", label: "At Price", type: "number" },
  { key: "asOfDate", label: "As Of Date", type: "date" },
  { key: "location", label: "Location", type: "text" },
  { key: "minimumStock", label: "Minimum Stock", type: "number" },
];

const numericFields = new Set(["salePrice", "purchasePrice", "discount", "openingQuantity", "atPrice", "minimumStock"]);

// This helper handles value logic.
function itemValue(item, key) {
  if (key === "itemName") return item.itemName || item.name || "";
  if (key === "itemCode") return item.itemCode || item.code || "";
  if (key === "unit") return item.unit || item.baseUnit || "";
  return item[key] ?? "";
}

// This helper handles item logic.
function changedItem(item, key, value) {
  return {
    ...item,
    [key]: value,
    ...(key === "itemName" ? { name: value, ...(item.type === "service" ? { serviceName: value } : {}) } : {}),
    ...(key === "itemCode" ? { code: value, ...(item.type === "service" ? { serviceCode: value } : {}) } : {}),
    ...(key === "unit" ? { baseUnit: value } : {}),
    ...(key === "salePrice" ? { price: value } : {}),
    ...(key === "openingQuantity" ? { stock: value } : {}),
  };
}

// Renders the update items in bulk interface.
function UpdateItemsInBulk() {
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [type, setType] = useState("All types");
  const [selectedField, setSelectedField] = useState("");
  const [fieldValues, setFieldValues] = useState({});
  const [step, setStep] = useState("select");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setItems(getInventoryItems());
    setLoading(false);
  }, []);

  const categories = useMemo(() => ["All categories", ...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !needle || `${item.itemName || item.name || ""} ${item.itemCode || item.code || ""}`.toLowerCase().includes(needle);
      const matchesCategory = category === "All categories" || item.category === category;
      const matchesType = type === "All types" || (item.type || "product") === type;
      return matchesQuery && matchesCategory && matchesType;
    });
  }, [items, query, category, type]);
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
  const selectedFieldDefinition = fields.find((field) => field.key === selectedField);

  // Toggles item.
  const toggleItem = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  // Toggles visible.
  const toggleVisible = () => {
    const visibleIds = visibleItems.map((item) => item.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  };
  // Handles field.
  const chooseField = (key) => {
    setSelectedField(key);
    if (!(key in fieldValues)) setFieldValues((current) => ({ ...current, [key]: "" }));
  };
  // Validates result.
  const validate = () => {
    if (!selectedItems.length) return "Select at least one existing item.";
    if (!selectedFieldDefinition) return "Choose one existing item field to update.";
    const value = String(fieldValues[selectedField] ?? "").trim();
    if (selectedField === "itemName" && !value) return "Item Name cannot be blank.";
    if (numericFields.has(selectedField) && value && (!Number.isFinite(Number(value)) || Number(value) < 0)) return `${selectedFieldDefinition.label} must be a non-negative number.`;
    return "";
  };
  // Handles to preview.
  const continueToPreview = () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError("");
    setStep("preview");
  };
  // Applies update.
  const applyUpdate = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError("");
    setStatus("");
    const value = fieldValues[selectedField] ?? "";
    const updated = selectedItems.map((item) => saveInventoryItem(changedItem(item, selectedField, value)));
    setItems((current) => current.map((item) => updated.find((next) => next.id === item.id) || item));
    setStatus(`Updated ${updated.length} item${updated.length === 1 ? "" : "s"} in local storage.`);
    setSelectedIds([]);
    setStep("select");
    setSaving(false);
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header><h1 className="text-2xl font-bold text-slate-900">Update Items In Bulk</h1><p className="mt-1 text-sm text-slate-500">Select locally saved items, choose a field, review the change, and save it to this browser.</p></header>
        {error && <p role="alert" className="flex gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle />{error}</p>}
        {status && <p role="status" className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><FiCheckCircle />{status}</p>}
        {step === "select" ? (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
              <label className="flex min-w-56 flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3"><FiSearch className="text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item name or code" className="h-10 w-full outline-none" /></label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"><option>All categories</option>{categories.slice(1).map((value) => <option key={value}>{value}</option>)}</select>
              <select value={type} onChange={(event) => setType(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"><option>All types</option><option value="product">Products</option><option value="service">Services</option></select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm"><label className="flex items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={visibleItems.length > 0 && visibleItems.every((item) => selectedIds.includes(item.id))} onChange={toggleVisible} />Select visible ({visibleItems.length})</label><span className="text-slate-500">{selectedIds.length} selected</span></div>
            {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading items...</p> : <div className="max-h-[28rem] overflow-auto"><table className="min-w-full text-left text-sm"><thead className="bg-white text-xs uppercase text-slate-500"><tr><th className="w-12 px-4 py-3"></th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Type</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleItem(item.id)} aria-label={`Select ${item.itemName || item.name}`} /></td><td className="px-4 py-3 font-semibold text-slate-800">{item.itemName || item.name || "-"}</td><td className="px-4 py-3 text-slate-600">{item.itemCode || item.code || "-"}</td><td className="px-4 py-3 text-slate-600">{item.category || "-"}</td><td className="px-4 py-3 text-slate-600">{item.type || "product"}</td></tr>)}</tbody></table>{!visibleItems.length && <p className="p-8 text-center text-sm text-slate-500">No items match the current search and filters.</p>}</div>}
            <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-4"><label className="min-w-64 flex-1 text-sm font-semibold text-slate-700">Field to update<select value={selectedField} onChange={(event) => chooseField(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 font-normal"><option value="">Choose a supported field</option>{fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>{selectedFieldDefinition && <label className="min-w-64 flex-1 text-sm font-semibold text-slate-700">New value{selectedFieldDefinition.type === "select" ? <select value={fieldValues[selectedField] || ""} onChange={(event) => setFieldValues((current) => ({ ...current, [selectedField]: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 font-normal"><option value="">Choose value</option>{selectedFieldDefinition.options.map((option) => <option key={option}>{option}</option>)}</select> : <input type={selectedFieldDefinition.type} value={fieldValues[selectedField] || ""} onChange={(event) => setFieldValues((current) => ({ ...current, [selectedField]: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />}</label>}<Button onClick={continueToPreview} disabled={!selectedIds.length || !selectedField} className="bg-emerald-600 text-white hover:bg-emerald-700">Review Changes</Button></div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h2 className="font-bold text-slate-800">Review bulk update</h2><p className="text-sm text-slate-500">{selectedItems.length} existing item{selectedItems.length === 1 ? "" : "s"} will be updated.</p></div><div className="flex gap-3"><Button onClick={() => setStep("select")} disabled={saving} className="border border-slate-300 text-slate-700 hover:bg-white"><FiX /> Back</Button><Button onClick={applyUpdate} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">{saving ? "Saving..." : "Confirm Update"}</Button></div></div>
            <div className="overflow-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Current {selectedFieldDefinition?.label}</th><th className="px-4 py-3">New {selectedFieldDefinition?.label}</th></tr></thead><tbody>{selectedItems.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold text-slate-800">{item.itemName || item.name}</td><td className="px-4 py-3 text-slate-600">{String(itemValue(item, selectedField) || "-")}</td><td className="px-4 py-3 font-semibold text-emerald-700">{String(fieldValues[selectedField] || "-")}</td></tr>)}</tbody></table></div>
            <p className="border-t border-slate-200 bg-amber-50 p-4 text-sm text-amber-800">Only <strong>{selectedFieldDefinition?.label}</strong> will change. All other saved item fields remain unchanged.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export default UpdateItemsInBulk;
