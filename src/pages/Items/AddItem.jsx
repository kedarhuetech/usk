import { useRef, useState } from "react";
import { FiCamera, FiChevronDown, FiPlus, FiSearch, FiSettings, FiTrash2, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import Input from "../../components/Common/Input";
import DatePicker from "../../components/items/DatePicker";
import UnitSelector from "../../components/items/UnitSelector";
import { defaultCategories, discountTypes, itemDefaults, taxModes, taxOptions } from "../../constants/itemsData";
import { saveInventoryItem } from "../../services/itemsStorage";

function SelectField({ label, value, options, onChange, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function CategoryPicker({ value, categories, onSelect, onAddNew }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = categories.filter((category) => category.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between rounded-md border bg-white px-3 text-left text-sm outline-none transition ${
          open ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-300 hover:border-blue-300"
        }`}
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>{value || "Category"}</span>
        <FiChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <label className="mb-2 flex h-10 items-center gap-2 rounded-full border border-slate-200 px-3">
            <FiSearch className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Category"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-slate-400">
                <FiX />
              </button>
            )}
          </label>

          <div className="max-h-40 overflow-y-auto">
            {filtered.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => {
                  onSelect(category);
                  setOpen(false);
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50"
              >
                {category}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddNew();
            }}
            className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
          >
            <FiPlus /> Add New Category
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryModal({ onClose, onCreate }) {
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <Card className="w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">Add Category</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <FiX />
          </button>
        </div>
        <div className="p-5">
          <Input label="Enter Category Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g., Grocery" />
          <Button onClick={() => name.trim() && onCreate(name.trim())} className="mt-7 w-full bg-rose-600 text-white hover:bg-rose-700">
            Create
          </Button>
        </div>
      </Card>
    </div>
  );
}

function UnitModal({ form, setField, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <Card className="w-full max-w-md overflow-visible shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">Select Unit</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <FiX />
          </button>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <UnitSelector label="Base Unit" value={form.baseUnit} onChange={(value) => setField("baseUnit", value)} />
          <UnitSelector label="Secondary Unit" value={form.secondaryUnit} onChange={(value) => setField("secondaryUnit", value)} />
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <Button
            onClick={() => {
              setField("unit", form.baseUnit || form.secondaryUnit);
              onClose();
            }}
            className="rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}

function createBatchRow() {
  return { id: crypto.randomUUID(), batchNo: "", manufacturer: "", mfgDate: "", expDate: "", remarks: "", openingQty: "" };
}

function normalizeBatchRow(row) {
  return {
    id: row.id || crypto.randomUUID(),
    batchNo: row.batchNo || "",
    manufacturer: row.manufacturer || "",
    mfgDate: row.mfgDate || "",
    expDate: row.expDate || "",
    remarks: row.remarks || row.dosage || "",
    openingQty: row.openingQty || "",
  };
}

function batchQty(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function hasValue(value) {
  return value !== "" && value !== null && value !== undefined;
}

function getFilledBatchRows(rows) {
  return rows
    .map(normalizeBatchRow)
    .filter((row) => Object.entries(row).some(([key, value]) => key !== "id" && String(value || "").trim()));
}

function getBatchTotal(rows) {
  return rows.reduce((total, row) => total + batchQty(row.openingQty), 0);
}

function createEditableItemForm(initialItem) {
  if (!initialItem) return itemDefaults;

  const openingQuantity = hasValue(initialItem.openingQuantity) ? initialItem.openingQuantity : initialItem.stock || "";

  return {
    ...itemDefaults,
    id: initialItem.id,
    createdAt: initialItem.createdAt,
    type: initialItem.type || itemDefaults.type,
    itemName: initialItem.itemName || initialItem.serviceName || initialItem.name || "",
    hsn: initialItem.hsn || initialItem.sac || "",
    category: initialItem.category || "",
    itemCode: initialItem.itemCode || initialItem.serviceCode || initialItem.code || "",
    unit: initialItem.unit || "",
    baseUnit: initialItem.baseUnit || initialItem.unit || "",
    secondaryUnit: initialItem.secondaryUnit || "",
    salePrice: initialItem.salePrice || initialItem.price || "",
    saleTaxMode: initialItem.saleTaxMode || itemDefaults.saleTaxMode,
    purchasePrice: initialItem.purchasePrice || "",
    purchaseTaxMode: initialItem.purchaseTaxMode || itemDefaults.purchaseTaxMode,
    discount: initialItem.discount || "",
    discountType: initialItem.discountType || itemDefaults.discountType,
    taxRate: initialItem.taxRate || itemDefaults.taxRate,
    openingQuantity,
    atPrice: initialItem.atPrice || "",
    asOfDate: initialItem.asOfDate || itemDefaults.asOfDate,
    location: initialItem.location || "",
    minimumStock: initialItem.minimumStock || "",
    description: initialItem.description || "",
  };
}

function createEditableWholesale(initialItem) {
  const wholesale = initialItem?.wholesale || {};
  return {
    price: initialItem?.wholesalePrice || wholesale.price || "",
    taxMode: initialItem?.wholesaleTaxMode || wholesale.taxMode || taxModes[0],
    minimumQty: initialItem?.minimumWholesaleQuantity || wholesale.minimumQty || "",
  };
}

function hasWholesale(initialItem) {
  const wholesale = createEditableWholesale(initialItem);
  return Boolean(wholesale.price || wholesale.minimumQty);
}

function createEditableBatchRows(initialItem) {
  if (!initialItem?.batches?.length) return [createBatchRow()];
  return initialItem.batches.map(normalizeBatchRow);
}

function BatchModal({ rows, setRows, onSave, onClose }) {
  const total = getBatchTotal(rows);
  const updateRow = (index, field, value) => {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <Card className="w-full max-w-6xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-7 py-6">
          <h2 className="text-xl font-bold text-slate-800">Add Stock - Batches</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <FiX className="h-7 w-7" />
          </button>
        </div>

        <div className="px-7 pb-5">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] table-fixed border-collapse border border-slate-200 text-sm">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[4%]" />
              </colgroup>
              <thead>
                <tr className="bg-white text-left text-sm font-semibold text-slate-700 shadow-sm">
                  {["Batch / Lot No.", "Manufacturer / Brand", "Mfg. Date", "Expiry Date", "Remarks", "Opening Qty", ""].map((header) => (
                    <th key={header} className="border border-slate-200 px-3 py-4">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.id}>
                    {["batchNo", "manufacturer", "mfgDate", "expDate", "remarks", "openingQty"].map((field) => (
                      <td key={field} className="border border-slate-200 p-2 align-top">
                        <input
                          type={field.includes("Date") ? "date" : "text"}
                          value={row[field]}
                          onChange={(event) => updateRow(rowIndex, field, event.target.value)}
                          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </td>
                    ))}
                    <td className="border border-slate-200 p-2 align-top">
                      <button
                        type="button"
                        onClick={() => setRows((current) => current.length > 1 ? current.filter((item) => item.id !== row.id) : current)}
                        className="grid h-10 w-full place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => setRows((current) => [...current, createBatchRow()])}
            className="mt-4 flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <FiPlus /> Add Row
          </button>
        </div>

        <div className="flex items-center justify-end gap-10 border-t border-slate-100 px-7 py-5">
          <span className="text-sm text-slate-700">Total <b className="ml-3">{total}</b></span>
          <Button
            onClick={() => {
              onSave(total);
              onClose();
            }}
            className="rounded-md bg-blue-600 px-10 text-white shadow-md hover:bg-blue-700"
          >
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PriceGroup({ inputProps, selectValue, onSelectChange }) {
  return (
    <div className="flex h-10 w-full max-w-sm overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
      <input className="min-w-0 flex-1 px-3 text-sm outline-none placeholder:text-slate-400" {...inputProps} />
      <select
        value={selectValue}
        onChange={(event) => onSelectChange(event.target.value)}
        className="w-32 border-l border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none"
      >
        {taxModes.map((mode) => (
          <option key={mode}>{mode}</option>
        ))}
      </select>
    </div>
  );
}

function DiscountGroup({ form, setField }) {
  return (
    <div className="flex h-10 w-full max-w-sm overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
      <input
        value={form.discount}
        onChange={(event) => setField("discount", event.target.value)}
        placeholder="Disc. On Sale Price"
        className="min-w-0 flex-1 px-3 text-sm outline-none placeholder:text-slate-400"
      />
      <select
        value={form.discountType}
        onChange={(event) => setField("discountType", event.target.value)}
        className="w-32 border-l border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none"
      >
        {discountTypes.map((type) => (
          <option key={type}>{type}</option>
        ))}
      </select>
    </div>
  );
}

function TaxesSection({ form, setField, compact = false }) {
  return (
    <Card className={`p-5 ${compact ? "" : "min-h-32"}`}>
      <SelectField label="Tax Rate" value={form.taxRate} onChange={(value) => setField("taxRate", value)} options={taxOptions} className="max-w-xs" />
    </Card>
  );
}

function PricingTab({ form, setField, isProduct, wholesaleVisible, setWholesaleVisible, wholesale, setWholesale }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-800">Sale Price</h3>
        <div className="flex flex-wrap gap-4">
          <PriceGroup
            inputProps={{
              value: form.salePrice,
              onChange: (event) => setField("salePrice", event.target.value),
              placeholder: "Sale Price",
            }}
            selectValue={form.saleTaxMode}
            onSelectChange={(value) => setField("saleTaxMode", value)}
          />
          <DiscountGroup form={form} setField={setField} />
        </div>

        {!wholesaleVisible ? (
          <button
            type="button"
            onClick={() => setWholesaleVisible(true)}
            className="mt-5 flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <FiPlus /> Add Wholesale Price
          </button>
        ) : (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-4">
              <h4 className="text-sm font-bold text-slate-800">Wholesale Price</h4>
              <button type="button" onClick={() => setWholesaleVisible(false)} className="text-xs font-semibold text-slate-500 hover:text-rose-600">
                Remove
              </button>
            </div>
            <div className="flex flex-wrap gap-4">
              <PriceGroup
                inputProps={{
                  value: wholesale.price,
                  onChange: (event) => setWholesale((current) => ({ ...current, price: event.target.value })),
                  placeholder: "Wholesale Price",
                }}
                selectValue={wholesale.taxMode}
                onSelectChange={(value) => setWholesale((current) => ({ ...current, taxMode: value }))}
              />
              <Input
                value={wholesale.minimumQty}
                onChange={(event) => setWholesale((current) => ({ ...current, minimumQty: event.target.value }))}
                placeholder="Minimum Wholesale Qty"
              />
            </div>
          </div>
        )}
      </Card>

      {isProduct ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_0.7fr]">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-slate-800">Purchase Price</h3>
            <PriceGroup
              inputProps={{
                value: form.purchasePrice,
                onChange: (event) => setField("purchasePrice", event.target.value),
                placeholder: "Purchase Price",
              }}
              selectValue={form.purchaseTaxMode}
              onSelectChange={(value) => setField("purchaseTaxMode", value)}
            />
          </Card>
          <TaxesSection form={form} setField={setField} />
        </div>
      ) : (
        <TaxesSection form={form} setField={setField} compact />
      )}
    </div>
  );
}

function StockTab({ form, setField, onBatch }) {
  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-3">
      <div className="relative">
        <Input value={form.openingQuantity} onChange={(event) => setField("openingQuantity", event.target.value)} placeholder="Opening Quantity" />
        <button type="button" onClick={onBatch} className="absolute right-3 top-2 rounded-md bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 hover:bg-blue-100">
          Batch
        </button>
      </div>
      <Input value={form.atPrice} onChange={(event) => setField("atPrice", event.target.value)} placeholder="At Price" />
      <DatePicker label="As Of Date" value={form.asOfDate} onChange={(value) => setField("asOfDate", value)} />
      <Input value={form.minimumStock} onChange={(event) => setField("minimumStock", event.target.value)} placeholder="Minimum Stock To Maintain" />
      <Input value={form.location} onChange={(event) => setField("location", event.target.value)} placeholder="Location" />
      <UnitSelector label="Stock Unit" value={form.baseUnit} onChange={(value) => setField("baseUnit", value)} />
    </div>
  );
}

function AddItem({ embedded = false, mode = "create", initialItem = null, onClose, onSave }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState(() => createEditableItemForm(initialItem));
  const [categories, setCategories] = useState(() => (
    initialItem?.category && !defaultCategories.includes(initialItem.category)
      ? [...defaultCategories, initialItem.category]
      : defaultCategories
  ));
  const [activeTab, setActiveTab] = useState("pricing");
  const [image, setImage] = useState(() => initialItem?.imageUrl || initialItem?.image || "");
  const [categoryModal, setCategoryModal] = useState(false);
  const [unitModal, setUnitModal] = useState(false);
  const [batchModal, setBatchModal] = useState(false);
  const [wholesaleVisible, setWholesaleVisible] = useState(() => hasWholesale(initialItem));
  const [wholesale, setWholesale] = useState(() => createEditableWholesale(initialItem));
  const [batchRows, setBatchRows] = useState(() => createEditableBatchRows(initialItem));
  const [saveStatus, setSaveStatus] = useState("");

  const isProduct = form.type === "product";
  const isEditMode = mode === "edit";
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const toggleType = () => {
    const nextType = isProduct ? "service" : "product";
    setField("type", nextType);
    if (nextType === "service") setActiveTab("pricing");
  };

  const handleImage = (file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setImage(reader.result || "");
    reader.readAsDataURL(file);
  };

  const saveItem = (resetAfterSave = false) => {
    const savedBatchRows = getFilledBatchRows(batchRows);
    const hasBatchStock = savedBatchRows.length > 0;
    const batchTotal = getBatchTotal(savedBatchRows);
    const openingQuantity = hasBatchStock ? String(batchTotal) : String(form.openingQuantity || "");
    const itemPayload = {
      ...form,
      id: initialItem?.id || form.id,
      createdAt: initialItem?.createdAt || form.createdAt,
      openingQuantity,
      stock: openingQuantity,
      serviceName: form.type === "service" ? form.itemName : "",
      serviceCode: form.type === "service" ? form.itemCode : "",
      sac: form.type === "service" ? form.hsn : "",
      image,
      imageUrl: image,
      wholesale: wholesaleVisible ? wholesale : null,
      wholesalePrice: wholesaleVisible ? wholesale.price : "",
      wholesaleTaxMode: wholesaleVisible ? wholesale.taxMode : "",
      minimumWholesaleQuantity: wholesaleVisible ? wholesale.minimumQty : "",
      batches: savedBatchRows,
    };
    const savedItem = onSave ? onSave(itemPayload) : saveInventoryItem(itemPayload);
    setSaveStatus(`${savedItem?.itemName || itemPayload.itemName || "Item"} saved.`);
    if (resetAfterSave && !isEditMode) {
      setForm(itemDefaults);
      setImage("");
      setWholesaleVisible(false);
      setBatchRows([createBatchRow()]);
      setActiveTab("pricing");
      return;
    }
    onClose?.();
  };

  return (
    <div className={embedded ? "bg-transparent" : "bg-slate-200 p-5"}>
      <Card className={`flex flex-col overflow-hidden shadow-sm ${embedded ? "max-h-[82vh]" : "min-h-[calc(100vh-8.5rem)]"}`}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-slate-950">{isEditMode ? "Edit Item" : "Add Item"}</h1>
            <div className="flex items-center gap-3 text-sm font-semibold">
              <span className={isProduct ? "text-blue-600" : "text-slate-400"}>Product</span>
              <button
                type="button"
                onClick={toggleType}
                className="flex h-7 w-12 rounded-full bg-blue-600 p-1 transition"
              >
                <span className={`h-5 w-5 rounded-full bg-white transition ${!isProduct ? "translate-x-5" : ""}`} />
              </button>
              <span className={!isProduct ? "text-blue-600" : "text-slate-400"}>Service</span>
            </div>
          </div>
          <div className="flex items-center gap-5 text-slate-500">
            <FiSettings className="h-5 w-5" />
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-slate-100">
              <FiX className="h-6 w-6" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
            <div className="grid max-w-5xl gap-5 md:grid-cols-3">
              <Input value={form.itemName} onChange={(event) => setField("itemName", event.target.value)} placeholder={isProduct ? "Item Name *" : "Service Name *"} />
              <div className="relative">
                <Input value={form.hsn} onChange={(event) => setField("hsn", event.target.value)} placeholder={isProduct ? "Item HSN" : "Service HSN"} />
                <FiSearch className="absolute right-3 top-3 h-5 w-5 text-slate-400" />
              </div>
              <button
                type="button"
                onClick={() => setUnitModal(true)}
                className="h-11 rounded-md bg-blue-100 px-5 text-sm font-bold text-blue-700 transition hover:bg-blue-200"
              >
                {form.unit || "Select Unit"}
              </button>
              <CategoryPicker value={form.category} categories={categories} onSelect={(value) => setField("category", value)} onAddNew={() => setCategoryModal(true)} />
              <div className="relative">
                <Input value={form.itemCode} onChange={(event) => setField("itemCode", event.target.value)} placeholder={isProduct ? "Item Code" : "Service Code"} />
                <button
                  type="button"
                  onClick={() => setField("itemCode", `ITM-${Date.now().toString().slice(-4)}`)}
                  className="absolute right-3 top-2 rounded-full bg-blue-50 px-4 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100"
                >
                  Assign Code
                </button>
              </div>
            </div>

            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleImage(event.target.files?.[0])} />
              {image ? (
                <div className="rounded-lg border border-slate-200 p-3">
                  <img src={image} alt="Item preview" className="h-28 w-full rounded-md object-cover" />
                  <div className="mt-3 flex gap-3">
                    <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-semibold text-blue-600">Replace</button>
                    <button type="button" onClick={() => setImage("")} className="text-sm font-semibold text-rose-600">Remove</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="flex h-24 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50/40 text-sm font-semibold text-blue-600 hover:bg-blue-50">
                  <FiCamera className="h-5 w-5" /> Add Item Image
                </button>
              )}
            </div>
          </div>

          <div className="mt-8 border-b border-slate-200">
            <div className="flex gap-7">
              {(isProduct ? ["pricing", "stock"] : ["pricing"]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-4 py-3 text-sm font-bold capitalize transition ${
                    activeTab === tab ? "border-rose-600 text-rose-600" : "border-transparent text-slate-400 hover:text-slate-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 transition duration-300">
            {activeTab === "pricing" && (
              <PricingTab
                form={form}
                setField={setField}
                isProduct={isProduct}
                wholesaleVisible={wholesaleVisible}
                setWholesaleVisible={setWholesaleVisible}
                wholesale={wholesale}
                setWholesale={setWholesale}
              />
            )}
            {activeTab === "stock" && isProduct && <StockTab form={form} setField={setField} onBatch={() => setBatchModal(true)} />}
          </div>
        </div>

        <footer className="flex justify-end gap-4 border-t border-slate-100 bg-white px-5 py-4">
          {saveStatus && <p className="mr-auto self-center text-sm font-semibold text-emerald-600">{saveStatus}</p>}
          {!isEditMode && <Button onClick={() => saveItem(true)} className="rounded-md border border-slate-200 bg-white text-slate-400">Save & New</Button>}
          <Button onClick={() => saveItem()} className="rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</Button>
        </footer>
      </Card>

      {categoryModal && (
        <CategoryModal
          onClose={() => setCategoryModal(false)}
          onCreate={(name) => {
            setCategories((current) => [...current, name]);
            setField("category", name);
            setCategoryModal(false);
          }}
        />
      )}
      {unitModal && <UnitModal form={form} setField={setField} onClose={() => setUnitModal(false)} />}
      {batchModal && (
        <BatchModal
          rows={batchRows}
          setRows={setBatchRows}
          onSave={(total) => setField("openingQuantity", String(total))}
          onClose={() => setBatchModal(false)}
        />
      )}
    </div>
  );
}

export default AddItem;
