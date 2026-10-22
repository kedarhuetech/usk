import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiCamera,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiFile,
  FiGrid,
  FiMonitor,
  FiList,
  FiPlus,
  FiPrinter,
  FiSave,
  FiSearch,
  FiSettings,
  FiShare2,
  FiSmartphone,
  FiTrash2,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import DatePicker from "../../components/items/DatePicker";
import UnitSelector from "../../components/items/UnitSelector";
import AddItem from "../Items/AddItem";
import {
  paymentTypes,
  priceModes,
  saleSettings,
  saleTaxOptions,
  shareActions,
  stateOfSupplyOptions,
} from "../../constants/salesData";
import { getInventoryItems, saveInventoryItem } from "../../services/itemsStorage";
import { markOnlineStoreOrderConverted } from "../../services/onlineStoreOrdersStorage";
import { getNextSaleInvoiceNumber, saveSaleInvoice } from "../../services/salesStorage";
import { calculateInvoiceTotals, calculateRow, toNumber } from "../../utils/saleInvoice";

const termsAppliesTo = [
  "Sale Invoice",
  "Sale Order",
  "Delivery Challan",
  "Estimate / Quotation",
  "Purchase Bill",
  "Purchase Order",
  "Proforma Invoice",
];

const defaultTerms = [
  { title: "Payment Due On Receipt", text: "Payment is due on receipt of this invoice." },
  { title: "Standard Terms", text: "Goods once sold will not be taken back without approval." },
];

const purchaseShareActions = ["Share", "Print", "Save & New", "Save & Generate Barcode"];

const initialBusiness = {
  name: "My Company",
  gstin: "",
  phone: "8378089937",
  email: "",
  address: "",
  pincode: "",
  state: "None",
  type: "None",
  category: "Construction Materials & Equipment",
  description: "",
};

const transactionConfigs = {
  sale: {
    type: "sale",
    title: "Sale",
    tabPrefix: "Sale",
    partyLabel: "Customer *",
    partyPlaceholder: "Search by Name/Phone *",
    cashPartyLabel: "Billing Name(Optional)",
    cashPartyPlaceholder: "Billing Name(Optional)",
    numberLabel: "Invoice Number",
    dateLabel: "Invoice Date",
    storageKey: "ledgerly:lastSaleInvoice",
    backPath: "/sales/sale-invoices",
    saveMessage: "New transaction saved successfully.",
  },
  purchase: {
    type: "purchase",
    title: "Purchase",
    tabPrefix: "Purchase",
    partyLabel: "Party / Supplier *",
    partyPlaceholder: "Search by Name/Phone *",
    numberLabel: "Bill Number",
    dateLabel: "Bill Date",
    storageKey: "ledgerly:lastPurchaseBill",
    backPath: "/purchase-expense/purchase-bills",
    saveMessage: "Purchase saved successfully.",
  },
};

const demoPurchaseParties = [
  { id: "kartik", name: "kartik", phone: "7474858578", balance: 112 },
  { id: "sssnjskks", name: "sssnjskks", phone: "4444771774", balance: 0 },
];

function createRow() {
  return {
    id: crypto.randomUUID(),
    item: "",
    qty: "",
    unit: "",
    price: "",
    priceMode: priceModes[0],
    discountPercent: "",
    discountAmount: "",
    discountMode: "percent",
    taxRate: "NONE",
    sourceItemId: "",
  };
}

function formatMoneyInput(value) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "";
}

function sanitizeDecimal(value, allowNegative = false) {
  let next = String(value).replace(allowNegative ? /[^\d.-]/g : /[^\d.]/g, "");
  if (allowNegative) next = next.replace(/(?!^)-/g, "");
  const [whole, ...decimal] = next.split(".");
  return decimal.length ? `${whole}.${decimal.join("")}` : whole;
}

function clampNumber(value, min, max) {
  const number = toNumber(value);
  return Math.min(Math.max(number, min), max);
}

function rowBaseAmount(row) {
  return calculateRow({ ...row, discountPercent: "", discountAmount: "", discountMode: "percent" }).baseAmount;
}

function syncDiscount(row) {
  const baseAmount = rowBaseAmount(row);
  if (!baseAmount) return row;

  if (row.discountMode === "amount" && row.discountAmount !== "") {
    const discountAmount = Math.min(toNumber(row.discountAmount), baseAmount);
    return { ...row, discountAmount: formatMoneyInput(discountAmount), discountPercent: formatMoneyInput((discountAmount / baseAmount) * 100) };
  }

  if (row.discountPercent !== "") {
    const discountPercent = clampNumber(row.discountPercent, 0, 100);
    return { ...row, discountPercent: formatMoneyInput(discountPercent), discountAmount: formatMoneyInput((baseAmount * discountPercent) / 100) };
  }

  return row;
}

function saleTaxRateFromOrder(item = {}) {
  const taxRate = item.taxRate || item.taxRateSnapshot || "NONE";
  if (!taxRate || taxRate === "None") return "NONE";
  return saleTaxOptions.includes(taxRate) ? taxRate : "NONE";
}

function createRowFromOrderItem(item = {}) {
  const qty = Math.max(toNumber(item.quantity), 0);
  const originalPrice = Math.max(toNumber(item.unitPrice || item.itemPrice || item.finalUnitPrice), 0);
  const finalUnitPrice = Math.max(toNumber(item.finalUnitPrice || item.itemPrice || item.unitPrice), 0);
  const discountAmount = Math.max(toNumber(item.discountAmount || Math.max(originalPrice - finalUnitPrice, 0)) * qty, 0);

  return syncDiscount({
    ...createRow(),
    item: item.itemNameSnapshot || item.itemName || "Item",
    qty: qty ? formatMoneyInput(qty) : "",
    unit: item.unit || "",
    price: formatMoneyInput(originalPrice || finalUnitPrice),
    priceMode: item.priceMode || "Without Tax",
    discountMode: discountAmount > 0 ? "amount" : "percent",
    discountPercent: "",
    discountAmount: discountAmount > 0 ? formatMoneyInput(discountAmount) : "",
    taxRate: saleTaxRateFromOrder(item),
    sourceItemId: item.itemId || "",
  });
}

function orderAdditionalChargeNote(order) {
  const amount = toNumber(order?.additionalChargeAmount || order?.additionalCharge);
  if (!amount) return "";
  return `${order.additionalChargeName || "Additional Charge"} from Online Order: Rs ${formatMoneyInput(amount)}`;
}

function saleItemFromInventory(item = {}) {
  return {
    id: item.id,
    name: item.itemName || item.name || "Item",
    stock: item.openingQuantity || item.stock || "0",
    unit: item.unit || item.baseUnit || "",
    price: item.salePrice || item.price || "",
    priceMode: item.saleTaxMode || "Without Tax",
    taxRate: item.taxRate === "None" ? "NONE" : item.taxRate || "NONE",
  };
}

function useDismiss(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, ref, onClose]);
}

function TextInput({ error, className = "", ...props }) {
  return (
    <input
      className={`h-9 w-full rounded-md border bg-white px-2.5 text-[13px] outline-none transition placeholder:text-slate-400 focus:ring-2 sm:h-10 sm:px-3 sm:text-sm lg:h-9 lg:px-2.5 lg:text-[13px] ${
        error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-100" : "border-slate-300 focus:border-blue-500 focus:ring-blue-100"
      } ${className}`}
      {...props}
    />
  );
}

function SelectInput({ value, onChange, options, className = "" }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 pr-8 text-[13px] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:h-10 sm:px-3 sm:text-sm lg:h-9 lg:px-2.5 lg:text-[13px] ${className}`}
    >
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );
}

function TextArea({ error, className = "", ...props }) {
  return (
    <textarea
      className={`resize-none rounded-md border bg-white p-2.5 text-[13px] outline-none transition placeholder:text-slate-400 focus:ring-2 sm:p-3 sm:text-sm lg:p-2.5 lg:text-[13px] ${
        error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-100" : "border-slate-300 focus:border-blue-500 focus:ring-blue-100"
      } ${className}`}
      {...props}
    />
  );
}

function PartyPicker({ value, parties, error, onChange, onSelect, onAddParty }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const query = value.toLowerCase();
  const filtered = parties.filter((party) => `${party.name} ${party.phone}`.toLowerCase().includes(query));
  useDismiss(open, rootRef, () => setOpen(false));

  return (
    <div ref={rootRef} className="relative">
      <TextInput
        error={error}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Search by Name/Phone *"
        className="pr-10"
      />
      <FiChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-slate-600" />
      {open && (
        <div className="absolute left-0 top-10 z-40 w-[min(430px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          <button type="button" onClick={() => { setOpen(false); onAddParty(); }} className="mb-2 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50">
            <FiPlus /> Add Party
          </button>
          <div className="max-h-36 overflow-y-auto">
            {filtered.length ? (
              filtered.map((party) => (
                <button key={party.id} type="button" onClick={() => { onSelect(party); setOpen(false); }} className="grid w-full grid-cols-[1fr_80px] gap-3 rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-slate-50">
                  <span>
                    <span className="block font-medium text-slate-800">{party.name}</span>
                    <span className="text-xs text-slate-400">{party.phone}</span>
                  </span>
                  <span className="text-right font-semibold text-slate-700">{party.balance}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-1.5 text-[13px] text-slate-400">No parties available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionTabs({ tabs, activeTab, setActiveTab, addTab, closeTab }) {
  return (
    <div className="flex min-h-8 items-end gap-1 bg-slate-100 px-3 pt-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={`flex h-7 min-w-32 items-center justify-between gap-3 rounded-t-lg px-3 text-[13px] transition ${
            activeTab === tab.id ? "bg-white text-slate-900" : "bg-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {tab.label}
          <span
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
            className="rounded p-0.5 hover:bg-slate-200"
          >
            <FiX />
          </span>
        </button>
      ))}
      <button type="button" onClick={addTab} className="mb-1 grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white hover:bg-blue-700">
        <FiPlus />
      </button>
    </div>
  );
}

function TransactionHeader({ title, saleType, setSaleType, showSaleType, onSettings, onClose }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-slate-950">{title}</h1>
        {showSaleType && (
          <>
            <span className="h-7 w-px bg-slate-200" />
            <span className={saleType === "credit" ? "text-[13px] font-bold text-blue-600" : "text-[13px] font-bold text-slate-700"}>Credit</span>
            <button type="button" onClick={() => setSaleType(saleType === "credit" ? "cash" : "credit")} className="flex h-6 w-12 rounded-full bg-blue-100 p-0.5">
              <span className={`h-5 w-5 rounded-full bg-blue-600 shadow transition ${saleType === "cash" ? "translate-x-6" : ""}`} />
            </button>
            <span className={saleType === "cash" ? "text-[13px] font-bold text-blue-600" : "text-[13px] font-bold text-slate-700"}>Cash</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 text-slate-500">
        <FiGrid className="h-5 w-5" />
        <button type="button" onClick={onSettings} className="rounded-full p-2 hover:bg-slate-100">
          <FiSettings className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-100" aria-label="Close sale">
          <FiX className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function CustomerDetails({ saleType, form, errors, setField, config, parties = [], onAddParty }) {
  const isCredit = saleType === "credit";
  const isPurchase = config.type === "purchase";

  return (
    <section className="grid gap-4 bg-slate-50 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,300px)_180px] xl:max-w-2xl">
        <label>
          <span className="mb-1 block text-[13px] font-semibold text-slate-600">{isPurchase ? config.partyLabel : isCredit ? config.partyLabel : config.cashPartyLabel}</span>
          {isPurchase ? (
            <>
              <PartyPicker
                error={errors.customer}
                value={form.customer}
                parties={parties}
                onAddParty={onAddParty}
                onChange={(value) => {
                  setField("customer", value);
                  setField("partyBalance", "");
                }}
                onSelect={(party) => {
                  setField("customer", party.name);
                  setField("phone", party.phone);
                  setField("partyBalance", party.balance);
                }}
              />
              {form.partyBalance !== "" && <span className="mt-1 block text-xs font-semibold text-emerald-600">BAL: {form.partyBalance}</span>}
            </>
          ) : (
            <div className="relative">
              <TextInput
                error={errors.customer}
                value={form.customer}
                onChange={(event) => setField("customer", event.target.value)}
                placeholder={isCredit ? config.partyPlaceholder : config.cashPartyPlaceholder}
                className="pr-10"
              />
              {isCredit && <FiChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-slate-600" />}
            </div>
          )}
        </label>
        <label>
          <span className="mb-1 block text-[13px] font-semibold text-slate-600">Phone No.</span>
          <TextInput value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="Phone No." />
        </label>
        <div>
          <TextArea value={form.billingAddress} onChange={(event) => setField("billingAddress", event.target.value)} placeholder="Billing Address" className="h-20 w-full sm:h-24 lg:h-20" />
          {form.billingAddress && (
            <div className="mt-2 flex justify-end gap-4 text-xs">
              <button type="button" onClick={() => setField("billingAddress", "")} className="text-slate-500">Remove</button>
              <button type="button" className="text-blue-600">Change</button>
            </div>
          )}
        </div>
        {isCredit && (
          <div>
            <TextArea value={form.shippingAddress} onChange={(event) => setField("shippingAddress", event.target.value)} placeholder="Shipping Address" className="h-20 w-full sm:h-24 lg:h-20" />
            {form.shippingAddress && (
              <div className="mt-2 flex justify-end gap-4 text-xs">
                <button type="button" onClick={() => setField("shippingAddress", "")} className="text-slate-500">Remove</button>
                <button type="button" className="text-blue-600">Change</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-[124px_1fr] xl:self-start">
        <span className="pt-2 text-[13px] text-slate-500">{config.numberLabel}</span>
        <TextInput error={errors.invoiceNumber} value={form.invoiceNumber} onChange={(event) => setField("invoiceNumber", event.target.value)} />
        <span className="pt-2 text-[13px] text-slate-500">{config.dateLabel}</span>
        <DatePicker value={form.invoiceDate} onChange={(value) => setField("invoiceDate", value)} />
        <span className="pt-2 text-[13px] text-slate-500">State of Supply</span>
        <SelectInput value={form.stateOfSupply} onChange={(value) => setField("stateOfSupply", value)} options={stateOfSupplyOptions} />
      </div>
    </section>
  );
}

function ItemPicker({ value, items, onSelect, onChange, onAddItem }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const filtered = items.filter((item) => item.name.toLowerCase().includes((query || value).toLowerCase()));
  useDismiss(open, rootRef, () => setOpen(false));

  return (
    <div ref={rootRef} className="relative">
      <input
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") setOpen(false);
          if (event.key === "Escape") setOpen(false);
        }}
        className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] outline-none focus:border-blue-400 focus:bg-white"
      />
      {open && (
        <div className="absolute left-0 top-9 z-40 w-[min(440px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl">
          <label className="flex h-8 items-center gap-2 rounded-full border border-slate-200 px-3">
            <FiSearch className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Item" className="w-full bg-transparent text-[13px] outline-none" autoFocus />
          </label>
          <div className="mt-2 max-h-28 overflow-y-auto">
            {filtered.length ? (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  className="grid w-full grid-cols-[1fr_76px_58px] gap-2 rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-blue-50"
                >
                  <span>{item.name}</span>
                  <span className="text-slate-500">{item.price || "0"}</span>
                  <span className="text-right font-semibold text-slate-700">{item.stock}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-1.5 text-[13px] text-slate-400">No items available.</p>
            )}
          </div>
          <button type="button" onClick={() => { setOpen(false); onAddItem(); }} className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50">
            <FiPlus /> Add Item
          </button>
        </div>
      )}
    </div>
  );
}

function CellInput({ error, className = "", ...props }) {
  return (
    <input
      className={`h-8 w-full rounded-md border bg-transparent px-2 text-[13px] outline-none focus:bg-white ${
        error ? "border-rose-400" : "border-transparent focus:border-blue-400"
      } ${className}`}
      {...props}
    />
  );
}

function InvoiceTable({ rows, setRows, items, errors, onAddItem }) {
  const updateRow = (id, field, value) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;

        const numericFields = ["qty", "price", "discountPercent", "discountAmount"];
        let nextValue = numericFields.includes(field) ? sanitizeDecimal(value) : value;
        let nextRow = { ...row, [field]: nextValue };
        if (field === "item") nextRow = { ...nextRow, sourceItemId: "" };

        if (field === "discountPercent") {
          nextValue = nextValue === "" ? "" : formatMoneyInput(clampNumber(nextValue, 0, 100));
          nextRow = { ...nextRow, discountMode: "percent", discountPercent: nextValue };
        }

        if (field === "discountAmount") nextRow = { ...nextRow, discountMode: "amount" };

        if (["qty", "price", "priceMode", "taxRate", "discountPercent", "discountAmount"].includes(field)) {
          nextRow = syncDiscount(nextRow);
        }

        return nextRow;
      })
    );
  };

  const applyItem = (id, item) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? syncDiscount({
              ...row,
              item: item.name,
              unit: item.unit || row.unit,
              price: item.price || row.price,
              priceMode: item.priceMode || row.priceMode,
              taxRate: item.taxRate || row.taxRate,
              sourceItemId: item.id || "",
            })
          : row
      )
    );
  };

  const deleteRow = (id) => {
    setRows((current) => (current.length === 1 ? [createRow()] : current.filter((row) => row.id !== id)));
  };

  const totals = useMemo(() => calculateInvoiceTotals(rows, false, 0, 0), [rows]);

  return (
    <section className="overflow-x-auto overflow-y-visible border-y border-slate-200 bg-white">
      <table className="w-full min-w-[1080px] border-collapse text-[13px] xl:min-w-0">
        <thead>
          <tr className="bg-white text-left text-xs font-bold uppercase text-slate-700">
            <th rowSpan="2" className="w-10 border-r border-slate-200 px-2 py-1.5 text-center">#</th>
            <th rowSpan="2" className="w-[25%] min-w-[220px] border-r border-slate-200 px-2 py-1.5">Item</th>
            <th rowSpan="2" className="w-16 border-r border-slate-200 px-2 py-1.5">Qty</th>
            <th rowSpan="2" className="w-24 border-r border-slate-200 px-2 py-1.5">Unit</th>
            <th className="w-36 border-r border-slate-200 px-2 py-1.5 text-center">Price/Unit</th>
            <th colSpan="2" className="w-40 border-r border-slate-200 px-2 py-1.5 text-center">Discount</th>
            <th colSpan="2" className="w-44 border-r border-slate-200 px-2 py-1.5 text-center">Tax</th>
            <th rowSpan="2" className="w-24 px-2 py-1.5">Amount</th>
          </tr>
          <tr className="bg-white text-xs font-medium text-slate-600">
            <th className="border-r border-t border-slate-200 px-2 py-1">
              <span className="sr-only">Price tax mode</span>
            </th>
            <th className="w-16 border-r border-t border-slate-200 px-2 py-1.5 text-center">%</th>
            <th className="w-24 border-r border-t border-slate-200 px-2 py-1.5 text-center">Amount</th>
            <th className="w-24 border-r border-t border-slate-200 px-2 py-1.5 text-center">%</th>
            <th className="w-20 border-r border-t border-slate-200 px-2 py-1.5 text-center">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const calculated = calculateRow(row);
            const rowErrors = errors.rows?.[row.id] || {};

            return (
              <tr key={row.id} className={`group ${index % 2 === 0 ? "bg-slate-50" : "bg-white"}`}>
                <td className="border-r border-slate-200 px-1 py-1.5 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-1">
                    <span>{index + 1}</span>
                    <button type="button" onClick={() => deleteRow(row.id)} aria-label="Delete row" className="rounded p-1 text-slate-400 opacity-100 hover:bg-rose-50 hover:text-rose-600 md:opacity-0 md:group-hover:opacity-100">
                      <FiTrash2 />
                    </button>
                  </div>
                </td>
                <td className="border-r border-slate-200 p-1">
                  <ItemPicker value={row.item} items={items} onChange={(value) => updateRow(row.id, "item", value)} onSelect={(item) => applyItem(row.id, item)} onAddItem={() => onAddItem(row.id)} />
                </td>
                <td className="border-r border-slate-200 p-1"><CellInput inputMode="decimal" error={rowErrors.qty} value={row.qty} onChange={(event) => updateRow(row.id, "qty", event.target.value)} /></td>
                <td className="border-r border-slate-200 p-1"><UnitSelector value={row.unit} onChange={(value) => updateRow(row.id, "unit", value)} className="[&_button]:h-8 [&_button]:px-2 [&_button]:text-[13px]" /></td>
                <td className="border-r border-slate-200 p-1">
                  <div className="grid gap-1">
                    <SelectInput value={row.priceMode} onChange={(value) => updateRow(row.id, "priceMode", value)} options={priceModes} className="h-8 text-xs" />
                    <CellInput inputMode="decimal" error={rowErrors.price} value={row.price} onChange={(event) => updateRow(row.id, "price", event.target.value)} />
                  </div>
                </td>
                <td className="border-r border-slate-200 p-1"><CellInput inputMode="decimal" error={rowErrors.discountPercent} value={row.discountPercent} onChange={(event) => updateRow(row.id, "discountPercent", event.target.value)} /></td>
                <td className="border-r border-slate-200 p-1"><CellInput inputMode="decimal" error={rowErrors.discountAmount} value={row.discountAmount} onChange={(event) => updateRow(row.id, "discountAmount", event.target.value)} /></td>
                <td className="border-r border-slate-200 p-1"><SelectInput value={row.taxRate} onChange={(value) => updateRow(row.id, "taxRate", value)} options={saleTaxOptions} className="border-transparent bg-transparent focus:bg-white" /></td>
                <td className="border-r border-slate-200 px-2 py-1.5 text-right text-slate-700">{calculated.tax.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{calculated.amount.toFixed(2)}</td>
              </tr>
            );
          })}
          <tr className="bg-white font-bold text-slate-700">
            <td className="border-r border-slate-200 p-1" />
            <td className="border-r border-slate-200 p-1">
              <button type="button" onClick={() => setRows((current) => [...current, createRow()])} className="rounded-md border border-blue-300 px-3.5 py-1.5 text-[13px] font-bold text-blue-600 hover:bg-blue-50">
                Add Row
              </button>
            </td>
            <td className="border-r border-slate-200 px-2 text-right">{totals.qty}</td>
            <td className="border-r border-slate-200" />
            <td className="border-r border-slate-200 text-right">Total</td>
            <td className="border-r border-slate-200" />
            <td className="border-r border-slate-200 px-2 text-right">{totals.discount.toFixed(2)}</td>
            <td className="border-r border-slate-200" />
            <td className="border-r border-slate-200 px-2 text-right">{totals.tax.toFixed(2)}</td>
            <td className="px-2 text-right">{totals.amount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function TermsTitlePicker({ value, templates, onSelect, onAddNew }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useDismiss(open, rootRef, () => setOpen(false));

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2.5 text-left text-[13px] text-slate-700">
        <span>{value || "Select Title"}</span>
        <FiChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          {templates.map((template) => (
            <button key={template.title} type="button" onClick={() => { onSelect(template); setOpen(false); }} className="w-full rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-blue-50">
              {template.title}
            </button>
          ))}
          <button type="button" onClick={() => { setOpen(false); onAddNew(); }} className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50">
            <FiPlus /> Add Terms & Conditions
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useDismiss(open, rootRef, () => setOpen(false));

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2.5 text-left text-[13px] text-slate-700">
        {value}
        <FiChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1.5 w-full rounded-lg border border-slate-200 bg-white py-1.5 shadow-xl">
          <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50">
            <FiPlus /> Add Bank A/C
          </button>
          {paymentTypes.map((type) => (
          <button key={type} type="button" onClick={() => { onChange(type); setOpen(false); }} className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-slate-100">
              {type}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TermsModal({ onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <Card className="w-full max-w-xl overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-bold text-slate-800">Add Terms & Conditions</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <FiX className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 p-4">
          <label className="block">
            <span className="mb-1 block text-[13px] text-slate-600">Title</span>
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] text-slate-600">Terms</span>
            <TextArea value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="Paste/Write your terms and conditions here" className="h-40 w-full" />
          </label>
          <div>
            <p className="mb-2 text-[13px] text-slate-600">Applicable for:</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {termsAppliesTo.map((item) => (
                <label key={item} className="flex items-center gap-2 text-[13px] text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-blue-600" />
                  {item}
                </label>
              ))}
            </div>
          </div>
        </div>
        <footer className="flex justify-end gap-2.5 border-t border-slate-100 px-4 py-3">
          <Button onClick={onClose} className="rounded-md bg-slate-200 px-4 py-2 text-[13px] text-slate-600">Cancel</Button>
          <Button onClick={() => title.trim() && onSave({ title: title.trim(), text: terms })} className="rounded-md bg-blue-600 px-4 py-2 text-[13px] text-white hover:bg-blue-700">Save Changes</Button>
        </footer>
      </Card>
    </div>
  );
}

function AddOns({ form, setField, files, setFiles, templates, setTemplates, showPayment }) {
  const imageRef = useRef(null);
  const documentRef = useRef(null);
  const [termsModal, setTermsModal] = useState(false);

  return (
    <section className="grid gap-4 bg-slate-50 px-4 py-4 xl:grid-cols-[minmax(300px,480px)_minmax(240px,300px)_1fr]">
      <div>
        {!form.showTerms ? (
          <button type="button" onClick={() => setField("showTerms", true)} className="flex h-12 w-full max-w-xl items-center gap-3 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-bold uppercase text-slate-400 hover:border-blue-200 hover:text-blue-600">
            <FiList className="h-5 w-5" /> Add Terms & Conditions
          </button>
        ) : (
          <Card className="p-4">
            <h3 className="mb-3 text-base font-bold text-slate-700">Terms & Conditions</h3>
            <TermsTitlePicker
              value={form.termsTitle}
              templates={templates}
              onSelect={(template) => {
                setField("termsTitle", template.title);
                setField("terms", template.text);
              }}
              onAddNew={() => setTermsModal(true)}
            />
            <TextArea value={form.terms} onChange={(event) => setField("terms", event.target.value)} placeholder="Selected terms and conditions appear here" className="mt-3 h-24 w-full italic" />
          </Card>
        )}
      </div>

      <div className="space-y-3">
        {showPayment && (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[13px] text-slate-500">Payment Type</span>
              <PaymentSelector value={form.paymentType} onChange={(value) => setField("paymentType", value)} />
            </label>
            <button type="button" className="text-[13px] font-semibold text-blue-600">+ Add Payment type</button>
          </div>
        )}
        {!form.showDescription ? (
          <button type="button" onClick={() => setField("showDescription", true)} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-bold uppercase text-slate-400 hover:border-blue-200 hover:text-blue-600">
            <FiFile /> Add Description
          </button>
        ) : (
          <TextArea value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Description" className="h-24 w-full" />
        )}
        <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(event) => setFiles((current) => ({ ...current, image: event.target.files?.[0]?.name || "" }))} />
        <button type="button" onClick={() => imageRef.current?.click()} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-bold uppercase text-slate-400 hover:border-blue-200 hover:text-blue-600">
          <FiCamera /> {files.image || "Add Image"}
        </button>
        <input ref={documentRef} type="file" className="hidden" onChange={(event) => setFiles((current) => ({ ...current, document: event.target.files?.[0]?.name || "" }))} />
        <button type="button" onClick={() => documentRef.current?.click()} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-bold uppercase text-slate-400 hover:border-blue-200 hover:text-blue-600">
          <FiFile /> {files.document || "Add Document"}
        </button>
      </div>

      {termsModal && (
        <TermsModal
          onClose={() => setTermsModal(false)}
          onSave={(template) => {
            setTemplates((current) => [...current, template]);
            setField("termsTitle", template.title);
            setField("terms", template.text);
            setTermsModal(false);
          }}
        />
      )}
    </section>
  );
}

function TotalsPanel({ totals, roundOff, setRoundOff, roundOffValue, setRoundOffValue, receivedEnabled, setReceivedEnabled, receivedAmount, setReceivedAmount }) {
  const displayedRoundOff = roundOff ? (roundOffValue || formatMoneyInput(totals.roundOffAmount)) : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <label className="flex items-center gap-2 text-[13px] text-slate-500">
          <input type="checkbox" checked={roundOff} onChange={(event) => setRoundOff(event.target.checked)} className="h-4 w-4 accent-blue-600" />
          Round Off
        </label>
        <input inputMode="decimal" value={displayedRoundOff} onChange={(event) => setRoundOffValue(sanitizeDecimal(event.target.value, true))} className="h-9 w-20 rounded-md border border-slate-300 px-2 text-[13px] outline-none focus:border-blue-500" />
        <span className="text-sm font-bold text-slate-700">Total</span>
        <input readOnly value={totals.finalTotal.toFixed(2)} className="h-10 w-full max-w-56 rounded-md border border-slate-300 bg-white px-3 text-right text-[13px] font-bold outline-none" />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <input type="checkbox" checked={receivedEnabled} onChange={(event) => setReceivedEnabled(event.target.checked)} className="h-4 w-4 accent-blue-600" />
        <span className="text-sm font-bold text-slate-700">Received</span>
        <input inputMode="decimal" disabled={!receivedEnabled} value={receivedAmount} onChange={(event) => setReceivedAmount(sanitizeDecimal(event.target.value))} className="h-10 w-full max-w-56 rounded-md border border-slate-300 bg-white px-3 text-right text-[13px] outline-none disabled:bg-slate-100" />
      </div>
      <div className="flex justify-end gap-7 text-sm font-bold text-slate-700">
        <span>Balance</span>
        <span>{totals.balance.toFixed(2)}</span>
      </div>
    </div>
  );
}

function ShareMenu({ actions = shareActions, onAction }) {
  return (
    <div className="absolute bottom-12 right-0 z-30 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1.5 shadow-xl">
      {actions.map((action) => (
        <button key={action} type="button" onClick={() => onAction(action)} className="flex w-full items-center justify-between px-4 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100">
          {action}
          {action === "Share" && <FiShare2 />}
          {action === "Print" && <FiPrinter />}
          {action === "Save & Generate Barcode" && <span className="text-xs tracking-[-1px] text-slate-500">||||</span>}
        </button>
      ))}
    </div>
  );
}

function SettingsDrawer({ settings, setSettings, billingType, setBillingType, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55" onClick={onClose}>
      <aside className="h-full w-full max-w-sm bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-950">Settings</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><FiX className="h-5 w-5" /></button>
        </header>
        <div className="space-y-0.5 p-5">
          {saleSettings.map((setting) => (
            <div key={setting.id} className="flex min-h-11 items-center justify-between gap-3 text-[13px] text-slate-800">
              <span>{setting.label}</span>
              {setting.type === "link" ? <FiChevronRight className="h-4 w-4 text-slate-400" /> : <input type="checkbox" checked={settings[setting.id]} onChange={(event) => setSettings((current) => ({ ...current, [setting.id]: event.target.checked }))} className="h-4 w-4 accent-blue-600" />}
            </div>
          ))}
          <div className="pt-3">
            <p className="mb-2 text-sm font-medium text-slate-800">Billing Type</p>
            {["Lite Sale", "Full Sale"].map((type) => (
              <label key={type} className="mb-2 flex items-center gap-2.5 text-[13px] text-slate-800">
                <input type="radio" checked={billingType === type} onChange={() => setBillingType(type)} className="h-4 w-4 accent-blue-600" />
                {type}
              </label>
            ))}
          </div>
        </div>
        <footer className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" className="flex w-full items-center justify-center gap-2 text-[13px] font-bold text-blue-600"><FiSettings /> More Settings</button>
        </footer>
      </aside>
    </div>
  );
}

function BusinessModal({ mode, business, setBusiness, onClose }) {
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const setBusinessField = (field, value) => {
    setBusiness((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const save = () => {
    const nextErrors = {};
    if (!business.name.trim()) nextErrors.name = "Business Name is required";
    if (!business.gstin.trim()) nextErrors.gstin = "Please Enter GSTIN";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSuccess(`${mode} details saved for demo.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <Card className="max-h-[86vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{mode === "Generate E-Way Bill" ? "E-Way Bill Details" : "Edit Firm"}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><FiX className="h-5 w-5" /></button>
        </header>
        <div className="mb-5 rounded-md border border-rose-300 bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700">
          Please fill in the GSTIN to continue generating the e-Invoice/E-Way Bill.
        </div>
        {success && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] font-semibold text-emerald-700">{success}</div>}
        <div className="grid gap-5 md:grid-cols-[260px_1fr]">
          <button type="button" className="flex h-28 w-28 items-center justify-center justify-self-center rounded-lg border border-dashed border-slate-300 text-base font-semibold text-slate-400">Add Logo</button>
          <div className="grid gap-3">
            <label><span className="mb-1 block text-xs text-slate-500">Business Name *</span><TextInput error={errors.name} value={business.name} onChange={(event) => setBusinessField("name", event.target.value)} /></label>
            <label><span className="mb-1 block text-xs text-blue-600">GSTIN</span><TextInput error={errors.gstin} value={business.gstin} onChange={(event) => setBusinessField("gstin", event.target.value)} />{errors.gstin && <span className="mt-1 block text-xs text-rose-600">{errors.gstin}</span>}</label>
            <label><span className="mb-1 block text-xs text-slate-500">Phone No.</span><TextInput value={business.phone} onChange={(event) => setBusinessField("phone", event.target.value.slice(0, 30))} /></label>
            <TextInput value={business.email} onChange={(event) => setBusinessField("email", event.target.value)} placeholder="Email ID" />
          </div>
        </div>
        <div className="mt-5 border-b border-slate-200">
          <button type="button" className="border-b-2 border-blue-600 px-4 py-2.5 text-[13px] font-bold text-blue-600">Business Details</button>
          <button type="button" className="px-4 py-2.5 text-[13px] font-bold text-slate-400">Additional Fields</button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextArea value={business.address} onChange={(event) => setBusinessField("address", event.target.value)} placeholder="Business Address" className="h-24" />
          <label><span className="mb-1 block text-xs text-slate-500">Business Type</span><SelectInput value={business.type} onChange={(value) => setBusinessField("type", value)} options={["None", "Retail", "Wholesale", "Service"]} /></label>
          <TextInput value={business.pincode} onChange={(event) => setBusinessField("pincode", event.target.value)} placeholder="Pincode" />
          <TextInput value={business.category} onChange={(event) => setBusinessField("category", event.target.value)} placeholder="Business Category" />
          <label><span className="mb-1 block text-xs text-slate-500">State</span><SelectInput value={business.state} onChange={(value) => setBusinessField("state", value)} options={stateOfSupplyOptions} /></label>
          <button type="button" className="flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[13px] text-slate-400">Add Signature</button>
          <TextInput value={business.description} onChange={(event) => setBusinessField("description", event.target.value.slice(0, 160))} placeholder="Business Description" />
        </div>
        <footer className="mt-5 flex justify-end">
          <Button onClick={save} className="rounded-md bg-blue-600 px-9 py-2 text-[13px] text-white hover:bg-blue-700">Save</Button>
        </footer>
      </Card>
    </div>
  );
}

function UploadBillModal({ selectedFile, setSelectedFile, onClose }) {
  const fileRef = useRef(null);
  const [mobileDemo, setMobileDemo] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const benefits = {
    desktop: ["Quick when file is already on device", "No pairing required", "Suitable for single uploads"],
    mobile: ["Useful for phone or WhatsApp bills", "Simple mobile-to-desktop flow", "Suitable for multiple uploads"],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <Card className="w-full max-w-4xl overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex justify-end border-b border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><FiX className="h-5 w-5" /></button>
        </header>
        <div className="grid md:grid-cols-2">
          <section className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <FiMonitor className="h-8 w-8 text-slate-600" />
              <h2 className="text-lg font-bold text-slate-800">Upload From Desktop</h2>
            </div>
            <p className="text-sm text-slate-500">Directly upload a bill file from your computer.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-600">
              {benefits.desktop.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2"><FiCheckCircle className="h-4 w-4 text-emerald-500" /> {benefit}</li>
              ))}
            </ul>
            {selectedFile && <p className="mt-5 rounded-md bg-blue-50 px-3 py-2 text-[13px] font-medium text-blue-700">{selectedFile}</p>}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(event) => setSelectedFile(event.target.files?.[0]?.name || "")} />
            <Button onClick={() => fileRef.current?.click()} className="mt-8 rounded-full border border-rose-500 bg-white px-5 py-2 text-[13px] text-rose-600 hover:bg-rose-50">
              Upload From Desktop
            </Button>
          </section>
          <section className="border-t border-slate-200 bg-blue-50/70 p-6 md:border-l md:border-t-0">
            <div className="mb-4 flex items-center gap-3">
              <FiSmartphone className="h-8 w-8 text-slate-600" />
              <h2 className="text-lg font-bold text-slate-800">Import From Mobile</h2>
            </div>
            <p className="text-sm text-slate-500">Import a bill from your phone.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-600">
              {benefits.mobile.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2"><FiCheckCircle className="h-4 w-4 text-emerald-500" /> {benefit}</li>
              ))}
            </ul>
            {mobileDemo && <div className="mt-5 grid h-24 w-24 place-items-center rounded-lg border border-dashed border-blue-300 bg-white text-center text-xs font-semibold text-blue-600">Demo QR</div>}
            <Button onClick={() => setMobileDemo(true)} className="mt-8 rounded-full bg-rose-600 px-5 py-2 text-[13px] text-white hover:bg-rose-700">
              Import From Mobile
            </Button>
          </section>
        </div>
      </Card>
    </div>
  );
}

function UploadAttentionModal({ onClose }) {
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const close = () => {
    if (dontShow) localStorage.setItem("ledgerly:hidePurchaseUploadAttention", "true");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4" onClick={close}>
      <Card className="w-full max-w-md overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">Attention</h2>
          <button type="button" onClick={close} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><FiX className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 p-5 text-sm text-slate-600">
          <p>If you uploaded any bills, you'll find them on the Uploaded Bills screen.</p>
          <p className="font-medium text-orange-500">We'll notify you once they're ready to use.</p>
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={dontShow} onChange={(event) => setDontShow(event.target.checked)} className="h-4 w-4 accent-blue-600" />
            Don't show again
          </label>
        </div>
        <footer className="flex justify-end px-5 pb-5">
          <Button onClick={close} className="rounded-full bg-rose-600 px-5 py-2 text-[13px] text-white hover:bg-rose-700">Okay</Button>
        </footer>
      </Card>
    </div>
  );
}

function AddSale({ mode = "sale" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const config = transactionConfigs[mode] || transactionConfigs.sale;
  const isPurchase = config.type === "purchase";
  const onlineOrderConversion = !isPurchase ? location.state?.onlineOrderConversion : null;
  const returnPath = typeof location.state?.from === "string" && location.state.from !== location.pathname ? location.state.from : config.backPath;
  const [tabs, setTabs] = useState([{ id: `${config.type}-1`, label: `${config.tabPrefix} #1` }]);
  const [activeTab, setActiveTab] = useState(`${config.type}-1`);
  const [saleType, setSaleType] = useState("credit");
  const [rows, setRows] = useState(() => {
    if (!onlineOrderConversion?.items?.length) return [createRow(), createRow()];
    return onlineOrderConversion.items.map(createRowFromOrderItem);
  });
  const [items, setItems] = useState(() => getInventoryItems().map(saleItemFromInventory));
  const [addItemRowId, setAddItemRowId] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [businessMode, setBusinessMode] = useState("");
  const [roundOff, setRoundOff] = useState(true);
  const [roundOffValue, setRoundOffValue] = useState("");
  const [receivedEnabled, setReceivedEnabled] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [billingType, setBillingType] = useState("Full Sale");
  const [files, setFiles] = useState({ image: "", document: "" });
  const [toast, setToast] = useState("");
  const [errors, setErrors] = useState({ rows: {} });
  const [termsTemplates, setTermsTemplates] = useState(defaultTerms);
  const [business, setBusiness] = useState(initialBusiness);
  const [uploadBillOpen, setUploadBillOpen] = useState(false);
  const [uploadAttentionOpen, setUploadAttentionOpen] = useState(false);
  const [uploadedBillFile, setUploadedBillFile] = useState("");
  const shareRef = useRef(null);
  const [settings, setSettings] = useState(Object.fromEntries(saleSettings.filter((item) => item.type === "checkbox").map((item) => [item.id, item.enabled])));
  const [form, setForm] = useState(() => ({
    customer: onlineOrderConversion?.customerName || "",
    phone: onlineOrderConversion?.mobile || onlineOrderConversion?.mobileNumber || "",
    billingAddress: onlineOrderConversion?.address || "",
    shippingAddress: onlineOrderConversion?.address || "",
    invoiceNumber: isPurchase ? "1" : getNextSaleInvoiceNumber(),
    invoiceDate: "2026-08-10",
    stateOfSupply: "None",
    partyBalance: "",
    showTerms: false,
    termsTitle: "",
    terms: "",
    showDescription: Boolean(onlineOrderConversion),
    description: onlineOrderConversion
      ? [`Converted from Online Order ${onlineOrderConversion.id}.`, orderAdditionalChargeNote(onlineOrderConversion)].filter(Boolean).join("\n")
      : "",
    paymentType: "Cash",
  }));

  useDismiss(shareOpen, shareRef, () => setShareOpen(false));

  const totals = useMemo(() => calculateInvoiceTotals(rows, roundOff, roundOffValue, receivedEnabled ? receivedAmount : 0), [rows, roundOff, roundOffValue, receivedAmount, receivedEnabled]);
  const hasValidInvoiceItem = useMemo(() => rows.some((row) => row.item.trim() && toNumber(row.qty) > 0), [rows]);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "", rows: current.rows || {} }));
  };

  const addTab = () => {
    const nextIndex = tabs.length + 1;
    const nextTab = { id: `${config.type}-${Date.now()}`, label: `${config.tabPrefix} #${nextIndex}` };
    setTabs((current) => [...current, nextTab]);
    setActiveTab(nextTab.id);
    setField("invoiceNumber", String(nextIndex));
  };

  const closeTab = (id) => {
    if (tabs.length === 1) {
      navigate(returnPath);
      return;
    }
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    if (activeTab === id) setActiveTab(remaining[0].id);
  };

  const validate = () => {
    const nextErrors = { rows: {} };
    if ((isPurchase || saleType === "credit") && !form.customer.trim()) nextErrors.customer = isPurchase ? "Party is required" : "Customer is required";
    if (!form.invoiceNumber.trim()) nextErrors.invoiceNumber = `${config.numberLabel} is required`;

    const validRows = rows.filter((row) => row.item.trim() && toNumber(row.qty) > 0);
    if (!validRows.length) nextErrors.rows[rows[0].id] = { item: "Add at least one item" };

    rows.forEach((row) => {
      const rowErrors = {};
      if (row.item.trim() && toNumber(row.qty) <= 0) rowErrors.qty = "Qty is required";
      if (row.qty !== "" && toNumber(row.qty) < 0) rowErrors.qty = "Invalid qty";
      if (row.price !== "" && toNumber(row.price) < 0) rowErrors.price = "Invalid price";
      if (row.discountPercent !== "" && (toNumber(row.discountPercent) < 0 || toNumber(row.discountPercent) > 100)) rowErrors.discountPercent = "Invalid discount";
      if (row.discountAmount !== "" && toNumber(row.discountAmount) < 0) rowErrors.discountAmount = "Invalid discount";
      if (Object.keys(rowErrors).length) nextErrors.rows[row.id] = rowErrors;
    });

    setErrors(nextErrors);
    return !nextErrors.customer && !nextErrors.invoiceNumber && Object.keys(nextErrors.rows).length === 0;
  };

  const buildInvoice = () => ({
    saleType,
    transactionType: config.type,
    form,
    rows: rows.map((row, index) => ({ ...row, index: index + 1, calculated: calculateRow(row) })),
    totals,
    business,
    files,
    sourceOnlineOrderId: onlineOrderConversion?.id || "",
    createdAt: new Date().toISOString(),
  });

  const openPreview = (printAfterOpen = false) => {
    if (!validate()) return false;
    const invoice = buildInvoice();
    sessionStorage.setItem(config.storageKey, JSON.stringify(invoice));
    navigate("/sales/sale-invoices/preview", { state: { invoice, printAfterOpen } });
    return true;
  };

  const resetSale = () => {
    setRows([createRow(), createRow()]);
    setRoundOffValue("");
    setReceivedAmount("");
    setReceivedEnabled(false);
    setFiles({ image: "", document: "" });
    setForm((current) => ({ ...current, customer: "", phone: "", billingAddress: "", shippingAddress: "", partyBalance: "", showDescription: false, description: "", showTerms: false, termsTitle: "", terms: "", paymentType: "Cash" }));
    setToast(`Ready for a fresh ${config.title.toLowerCase()}.`);
  };

  const closeUploadBill = () => {
    setUploadBillOpen(false);
    if (!localStorage.getItem("ledgerly:hidePurchaseUploadAttention")) setUploadAttentionOpen(true);
  };

  const saveSale = () => {
    if (!validate()) {
      setToast("Please fix highlighted fields.");
      return;
    }
    const invoice = buildInvoice();
    const savedInvoice = isPurchase ? invoice : saveSaleInvoice(invoice);
    if (onlineOrderConversion?.id && !onlineOrderConversion.convertedToSale) {
      markOnlineStoreOrderConverted(onlineOrderConversion.id, {
        saleId: savedInvoice.id,
        invoiceId: savedInvoice.invoiceId,
        invoiceNumber: savedInvoice.form?.invoiceNumber || savedInvoice.invoiceNumber,
      });
    }
    sessionStorage.setItem(config.storageKey, JSON.stringify(savedInvoice));
    setToast(config.saveMessage);
    if (!isPurchase) navigate("/sales/sale-invoices/preview", { state: { invoice: savedInvoice } });
  };

  const handleShareAction = (action) => {
    setShareOpen(false);
    if (action === "Save & Generate Barcode" && isPurchase) {
      if (!validate()) return;
      const invoice = buildInvoice();
      const barcodeItems = invoice.rows
        .filter((row) => row.item.trim() && toNumber(row.qty) > 0)
        .map((row) => ({
          id: row.id,
          itemName: row.item,
          labels: Math.max(Math.round(toNumber(row.qty)), 1),
          itemCode: row.itemCode || "",
          companyName: business.name,
          salePrice: row.salePrice || "",
          purchasePrice: row.price || "",
          discount: row.calculated.discount ? formatMoneyInput(row.calculated.discount) : "",
          batchNo: row.batchNo || "",
          manufacturerName: row.manufacturerName || "",
          mfgDate: row.mfgDate || "",
          expDate: row.expDate || "",
        }));
      const payload = { items: barcodeItems, invoice, from: "/purchase-expense/purchase-bills/new" };
      sessionStorage.setItem(config.storageKey, JSON.stringify(invoice));
      sessionStorage.setItem("ledgerly:barcodePurchaseItems", JSON.stringify(payload));
      setToast(config.saveMessage);
      navigate("/utilities/barcode-generator", { state: payload });
      return;
    }
    if (action === "Save & New") {
      if (validate()) resetSale();
      return;
    }
    if ((action === "Print" || action === "Share") && !isPurchase) {
      openPreview(action === "Print");
      return;
    }
    if ((action === "Print" || action === "Share") && isPurchase) {
      if (validate()) setToast(`${action} is ready for frontend purchase state.`);
      return;
    }
    if (action === "Generate e-Invoice" || action === "Generate E-Way Bill") {
      setBusinessMode(action);
    }
  };

  const saveItemFromModal = (itemForm) => {
    const savedInventoryItem = saveInventoryItem(itemForm);
    const newItem = saleItemFromInventory(savedInventoryItem);
    setItems((current) => [...current.filter((item) => item.id !== newItem.id), newItem]);
    setRows((current) => current.map((row) => (row.id === addItemRowId ? syncDiscount({ ...row, item: newItem.name, unit: newItem.unit || row.unit, price: newItem.price || row.price, priceMode: newItem.priceMode || row.priceMode, taxRate: newItem.taxRate || row.taxRate, sourceItemId: newItem.id || "" }) : row)));
    setAddItemRowId(null);
  };

  return (
    <div className="min-h-full bg-slate-100">
      <TransactionTabs tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} addTab={addTab} closeTab={closeTab} />
      <TransactionHeader title={config.title} saleType={saleType} setSaleType={setSaleType} showSaleType={!isPurchase} onSettings={() => setSettingsOpen(true)} onClose={() => closeTab(activeTab)} />
      <CustomerDetails saleType={saleType} form={form} errors={errors} setField={setField} config={config} parties={demoPurchaseParties} onAddParty={() => navigate("/parties/party-details")} />
      <InvoiceTable rows={rows} setRows={setRows} items={items} errors={errors} onAddItem={(rowId) => setAddItemRowId(rowId)} />

      <div className="grid gap-3 bg-slate-50 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AddOns form={form} setField={setField} files={files} setFiles={setFiles} templates={termsTemplates} setTemplates={setTermsTemplates} showPayment={hasValidInvoiceItem} />
        <div className="px-4 py-4">
          <TotalsPanel totals={totals} roundOff={roundOff} setRoundOff={setRoundOff} roundOffValue={roundOffValue} setRoundOffValue={setRoundOffValue} receivedEnabled={receivedEnabled} setReceivedEnabled={setReceivedEnabled} receivedAmount={receivedAmount} setReceivedAmount={setReceivedAmount} />
          {toast && <p className="mt-2 text-right text-[13px] font-medium text-emerald-600">{toast}</p>}
        </div>
      </div>

      <footer className={`sticky bottom-0 z-20 flex gap-3 border-t border-slate-200 bg-white px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] ${isPurchase ? "justify-between" : "justify-end"}`}>
        {isPurchase && (
          <button type="button" onClick={() => setUploadBillOpen(true)} className="flex h-10 items-center gap-2 rounded-md border border-blue-300 px-4 text-[13px] font-semibold text-blue-600 hover:bg-blue-50">
            <FiUploadCloud className="h-4 w-4" /> Upload Bill
          </button>
        )}
        <div className="flex gap-3">
          <div ref={shareRef} className="relative">
            <button type="button" onClick={() => setShareOpen((current) => !current)} className="flex h-10 overflow-hidden rounded-md border border-blue-300 text-[13px] font-bold text-blue-600">
              <span className="px-4 py-2">Share</span>
              <span className="grid w-10 place-items-center border-l border-blue-200"><FiChevronDown /></span>
            </button>
            {shareOpen && <ShareMenu actions={isPurchase ? purchaseShareActions : shareActions} onAction={handleShareAction} />}
          </div>
          <Button onClick={saveSale} className="rounded-md bg-blue-600 px-10 py-2 text-[13px] text-white shadow-md hover:bg-blue-700"><FiSave /> Save</Button>
        </div>
      </footer>

      {addItemRowId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={() => setAddItemRowId(null)}>
          <div className="w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
            <AddItem embedded onClose={() => setAddItemRowId(null)} onSave={saveItemFromModal} />
          </div>
        </div>
      )}

      {businessMode && <BusinessModal mode={businessMode} business={business} setBusiness={setBusiness} onClose={() => setBusinessMode("")} />}

      {uploadBillOpen && <UploadBillModal selectedFile={uploadedBillFile} setSelectedFile={setUploadedBillFile} onClose={closeUploadBill} />}
      {uploadAttentionOpen && <UploadAttentionModal onClose={() => setUploadAttentionOpen(false)} />}

      {settingsOpen && (
        <SettingsDrawer settings={settings} setSettings={setSettings} billingType={billingType} setBillingType={setBillingType} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

export default AddSale;
