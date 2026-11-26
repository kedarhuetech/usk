// Implements the add sale page.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiCamera,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiFile,
  FiGrid,
  FiList,
  FiPlus,
  FiPrinter,
  FiSave,
  FiSearch,
  FiSettings,
  FiShare2,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import HsnAutocomplete from "../../components/Common/HsnAutocomplete";
import { matchGstRateToOption } from "../../services/hsnService.js";
import { validateGstin, cleanGstin } from "../../utils/gstinUtils";
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
import { markOnlineStoreOrderConverted } from "../../services/onlineStoreOrdersStorage";
import { businessDataChangedEvent, notifyBusinessDataChanged } from "../../services/businessDataChanged.js";
import {
  loadBusinessItems,
  loadBusinessParties,
  nextPurchaseBillNumber,
  nextSalesInvoiceNumber,
  saveBusinessItem,
  saveBusinessPurchaseBill,
  saveBusinessSaleInvoice,
} from "../../services/businessRecords";
import { getParties } from "../../services/partiesStorage";
import { getInventoryItems, saveInventoryItem, isItemBatchTracked } from "../../services/itemsStorage";
import { saveSaleInvoice as saveSaleInvoiceLocally, getLast5PricesForItem } from "../../services/salesStorage";
import { localDateOnly } from "../../services/batchInventoryService.js";
import { getPurchaseBills, savePurchaseBill as savePurchaseBillLocally } from "../../services/purchaseBillsStorage";
import { calculateInvoiceTotals, calculateRow, toNumber } from "../../utils/saleInvoice";
import { readTransactionValue, writeTransactionValue, transactionStorageKeys, fulfillSaleOrder, fulfillPurchaseOrder } from "../../services/transactionRepository.js";
import { getCompanyProfile } from "../../services/companyProfileStorage";
import { getAppSettings, saveAppSettings, APP_SETTINGS_UPDATED_EVENT } from "../../services/appSettingsStorage";
import {
  buildTransactionMessage,
  sendMetaWhatsAppMessage,
} from "../../services/transactionMessageService.js";
import { transactionsDb } from "../../services/databaseRepository.js";

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

function currentLocalDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

const purchaseShareActions = ["Share", "Print", "Save & New", "Save & Generate Barcode"];

const initialBusiness = {
  name: getCompanyProfile().businessName || getCompanyProfile().companyName || "Sai Kirana Stores",
  gstin: "",
  phone: getCompanyProfile().phoneNumber || "8369501991",
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

// Creates row.
function createRow() {
  return {
    id: crypto.randomUUID(),
    item: "",
    qty: "",
    freeQty: "",
    unit: "",
    price: "",
    priceMode: priceModes[0],
    discountPercent: "",
    discountAmount: "",
    discountMode: "percent",
    taxRate: "NONE",
    hsn: "",
    cessPercent: "",
    cessAmount: "",
    sourceItemId: "",
    batchNo: "",
    expDate: "",
    serialNumbers: [],
  };
}

// Formats money input.
function formatMoneyInput(value) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "";
}

// Cleans decimal.
function sanitizeDecimal(value, allowNegative = false) {
  let next = String(value).replace(allowNegative ? /[^\d.-]/g : /[^\d.]/g, "");
  if (allowNegative) next = next.replace(/(?!^)-/g, "");
  const [whole, ...decimal] = next.split(".");
  return decimal.length ? `${whole}.${decimal.join("")}` : whole;
}

// This helper handles number logic.
function clampNumber(value, min, max) {
  const number = toNumber(value);
  return Math.min(Math.max(number, min), max);
}

// This helper handles base amount logic.
function rowBaseAmount(row) {
  return calculateRow({ ...row, discountPercent: "", discountAmount: "", discountMode: "percent" }).baseAmount;
}

// Synchronizes discount.
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

// This helper handles tax rate from order logic.
function saleTaxRateFromOrder(item = {}) {
  const taxRate = item.taxRate || item.taxRateSnapshot || "NONE";
  if (!taxRate || taxRate === "None") return "NONE";
  return saleTaxOptions.includes(taxRate) ? taxRate : "NONE";
}

// Creates row from order item.
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

// This helper handles additional charge note logic.
function orderAdditionalChargeNote(order) {
  const amount = toNumber(order?.additionalChargeAmount || order?.additionalCharge);
  if (!amount) return "";
  return `${order.additionalChargeName || "Additional Charge"} from Online Order: Rs ${formatMoneyInput(amount)}`;
}

// This helper handles item from inventory logic.
function saleItemFromInventory(item = {}) {
  return {
    id: item.id,
    isActive: item.isActive !== false && item.is_active !== 0 && item.is_active !== "0",
    name: item.itemName || item.name || "Item",
    stock: item.openingQuantity || item.stock || "0",
    unit: item.unit || item.baseUnit || "",
    price: item.salePrice || item.price || "",
    purchasePrice: item.purchasePrice || "",
    priceMode: item.saleTaxMode || "Without Tax",
    purchasePriceMode: item.purchaseTaxMode || "Without Tax",
    taxRate: item.taxRate === "None" ? "NONE" : item.taxRate || "NONE",
    code: item.itemCode || item.code || "",
    barcode: item.barcode || item.barCode || item.itemBarcode || item.itemCode || "",
    category: item.category || "",
    subCategory: item.subCategory || "",
    batches: item.batches || [],
    serialNumbers: item.serialNumbers || [],
    discount: item.discount || "",
    discountType: item.discountType || "Percentage",
  };
}

// Normalizes and maps rows from an existing transaction or database items into AddSale row format
function normalizeEditRows(editDoc) {
  if (!editDoc) return [];
  let candidateRows = editDoc.rows || editDoc.items || editDoc.lineItems || editDoc.transaction_items || [];
  if (typeof candidateRows === "string") {
    try { candidateRows = JSON.parse(candidateRows); } catch { candidateRows = []; }
  }
  if (!Array.isArray(candidateRows) || candidateRows.length === 0) return [];

  const inventory = getInventoryItems();

  return candidateRows.map((row, idx) => {
    const rawDiscPercent = row.discountPercent ?? row.discount_percent;
    const discPercent =
      rawDiscPercent != null && rawDiscPercent !== "" && Number(rawDiscPercent) !== 0
        ? String(rawDiscPercent)
        : "";
    const rawDiscAmount = row.discountAmount ?? row.discount_amount ?? row.discount;
    const discAmount =
      rawDiscAmount != null && rawDiscAmount !== "" && Number(rawDiscAmount) !== 0
        ? String(rawDiscAmount)
        : "";
    const discountMode = row.discountMode || (discAmount && !discPercent ? "amount" : "percent");

    const rawTaxRate = row.taxRate != null && row.taxRate !== "" ? row.taxRate : (row.tax_rate != null ? row.tax_rate : (row.tax != null ? row.tax : "NONE"));
    let taxRate = "NONE";
    if (rawTaxRate && rawTaxRate !== "NONE" && rawTaxRate !== "None" && rawTaxRate !== 0 && rawTaxRate !== "0") {
      const numTax = typeof rawTaxRate === "number" ? rawTaxRate : parseFloat(String(rawTaxRate).replace(/[^0-9.]/g, ""));
      if (numTax && saleTaxOptions.includes(`GST @ ${numTax}%`)) {
        taxRate = `GST @ ${numTax}%`;
      } else if (numTax && saleTaxOptions.includes(`IGST @ ${numTax}%`)) {
        taxRate = `IGST @ ${numTax}%`;
      } else if (saleTaxOptions.includes(String(rawTaxRate))) {
        taxRate = String(rawTaxRate);
      }
    }

    const serials = Array.isArray(row.serialNumbers)
      ? row.serialNumbers
      : (row.serialNo || row.serial_no ? [row.serialNo || row.serial_no] : []);

    const sourceItemId = row.sourceItemId || row.itemId || row.item_id || "";
    const matched = inventory.find((i) => (sourceItemId && i.id === sourceItemId) || (row.item && String(i.itemName || "").trim().toLowerCase() === String(row.item).trim().toLowerCase()));

    const resolvedItem = row.item || row.itemName || row.item_name || row.name || matched?.itemName || "";

    const qty =
      row.qty != null && row.qty !== ""
        ? String(row.qty)
        : (row.quantity != null && row.quantity !== "" ? String(row.quantity) : "1");

    const price =
      row.price != null && row.price !== ""
        ? String(row.price)
        : (row.unitPrice != null && row.unitPrice !== ""
          ? String(row.unitPrice)
          : (row.unit_price != null && row.unit_price !== ""
            ? String(row.unit_price)
            : (row.rate != null && row.rate !== "" ? String(row.rate) : (matched?.salePrice != null ? String(matched.salePrice) : "0"))));

    const unit = row.unit || matched?.unit || "PCS";

    return {
      ...createRow(),
      ...row,
      id: row.id || `edit-row-${idx}-${Date.now()}`,
      item: resolvedItem,
      description: row.description || "",
      qty,
      unit,
      price,
      priceMode: row.priceMode || "Without Tax",
      discountPercent: discPercent,
      discountAmount: discAmount,
      discountMode,
      taxRate,
      hsn: row.hsn || row.hsnCode || row.hsn_code || matched?.hsn || "",
      cessPercent:
        row.cessPercent != null && row.cessPercent !== "" && Number(row.cessPercent) !== 0
          ? String(row.cessPercent)
          : (row.cessRate != null && Number(row.cessRate) !== 0 ? String(row.cessRate) : (row.cess_rate != null && Number(row.cess_rate) !== 0 ? String(row.cess_rate) : "")),
      cessAmount:
        row.cessAmount != null && row.cessAmount !== "" && Number(row.cessAmount) !== 0
          ? String(row.cessAmount)
          : (row.cess_amount != null && Number(row.cess_amount) !== 0 ? String(row.cess_amount) : ""),
      sourceItemId: sourceItemId || matched?.id || "",
      batchNo: row.batchNo || row.batch_no || "",
      expDate: row.expDate || row.exp_date || "",
      serialNumbers: serials,
    };
  });
}

// Extracts form fields from an existing transaction header, supporting both local and MySQL schemas
function extractEditForm(editDoc, fallback = {}) {
  if (!editDoc) return fallback;

  const cleanStr = (val) => {
    if (val == null) return "";
    const s = String(val).trim();
    return s === "null" || s === "undefined" ? "" : s;
  };

  const rawCustomer =
    editDoc.partyName ||
    editDoc.party_name ||
    editDoc.customerName ||
    editDoc.customer_name ||
    editDoc.supplierName ||
    editDoc.party ||
    editDoc.customer ||
    editDoc.form?.customer ||
    editDoc.form?.partyName ||
    fallback.customer ||
    "";
  const customer = cleanStr(rawCustomer);

  const partyId =
    editDoc.form?.partyId ??
    editDoc.partyId ??
    editDoc.party_id ??
    editDoc.customerId ??
    fallback.partyId ??
    "";

  const rawPhone =
    editDoc.partyPhone ||
    editDoc.party_phone ||
    editDoc.phone ||
    editDoc.customerPhone ||
    editDoc.customer_phone ||
    editDoc.mobile ||
    editDoc.form?.phone ||
    fallback.phone ||
    "";
  const phone = cleanStr(rawPhone);

  const billingAddress = cleanStr(
    editDoc.billingAddress ||
    editDoc.billing_address ||
    editDoc.form?.billingAddress ||
    fallback.billingAddress ||
    ""
  );

  const shippingAddress = cleanStr(
    editDoc.shippingAddress ||
    editDoc.shipping_address ||
    editDoc.form?.shippingAddress ||
    billingAddress ||
    fallback.shippingAddress ||
    ""
  );

  const invoiceNumber = cleanStr(
    editDoc.documentNumber ||
    editDoc.document_number ||
    editDoc.invoiceNumber ||
    editDoc.invoice_number ||
    editDoc.billNumber ||
    editDoc.number ||
    editDoc.form?.invoiceNumber ||
    fallback.invoiceNumber ||
    "1"
  );

  const rawDate =
    editDoc.transactionDate ||
    editDoc.transaction_date ||
    editDoc.invoiceDate ||
    editDoc.billDate ||
    editDoc.date ||
    editDoc.form?.invoiceDate ||
    fallback.invoiceDate ||
    currentLocalDate();
  const invoiceDate = typeof rawDate === "string" ? rawDate.slice(0, 10) : String(rawDate);

  const stateOfSupply = cleanStr(
    editDoc.stateOfSupply ||
    editDoc.state ||
    editDoc.form?.stateOfSupply ||
    fallback.stateOfSupply ||
    "None"
  );

  const paymentType = cleanStr(
    editDoc.paymentMode ||
    editDoc.paymentType ||
    editDoc.payment_mode ||
    editDoc.form?.paymentType ||
    fallback.paymentType ||
    "Cash"
  );

  const description = cleanStr(
    editDoc.description ||
    editDoc.notes ||
    editDoc.form?.description ||
    fallback.description ||
    ""
  );

  const terms = cleanStr(
    editDoc.terms ||
    editDoc.form?.terms ||
    fallback.terms ||
    ""
  );

  const billingName = cleanStr(
    editDoc.billingName ||
    editDoc.billing_name ||
    editDoc.form?.billingName ||
    customer ||
    ""
  );

  const paymentTerms = cleanStr(
    editDoc.paymentTerms ||
    editDoc.payment_terms ||
    editDoc.form?.paymentTerms ||
    fallback.paymentTerms ||
    "Due on Receipt"
  );

  const rawDueDate =
    editDoc.dueDate ||
    editDoc.due_date ||
    editDoc.form?.dueDate ||
    fallback.dueDate ||
    null;
  const dueDate = rawDueDate ? (typeof rawDueDate === "string" ? rawDueDate.slice(0, 10) : String(rawDueDate)) : null;

  const ewayBillNo = cleanStr(
    editDoc.ewayBillNo ||
    editDoc.eWayBillNo ||
    editDoc.eway_bill_no ||
    editDoc.form?.ewayBillNo ||
    fallback.ewayBillNo ||
    ""
  );

  const vehicleNumber = cleanStr(
    editDoc.vehicleNumber ||
    editDoc.vehicleNo ||
    editDoc.vehicle_no ||
    editDoc.form?.vehicleNumber ||
    fallback.vehicleNumber ||
    ""
  );

  const driverName = cleanStr(
    editDoc.driverName ||
    editDoc.driver_name ||
    editDoc.form?.driverName ||
    fallback.driverName ||
    ""
  );

  const poNumber = cleanStr(
    editDoc.poNumber ||
    editDoc.po_number ||
    editDoc.customerPoNumber ||
    editDoc.form?.poNumber ||
    fallback.poNumber ||
    ""
  );

  const rawPoDate =
    editDoc.poDate ||
    editDoc.po_date ||
    editDoc.customerPoDate ||
    editDoc.form?.poDate ||
    fallback.poDate ||
    "";
  const poDate = rawPoDate ? (typeof rawPoDate === "string" ? rawPoDate.slice(0, 10) : String(rawPoDate)) : "";

  const reverseCharge = Boolean(
    editDoc.reverseCharge ||
    editDoc.reverse_charge ||
    editDoc.form?.reverseCharge ||
    fallback.reverseCharge
  );

  const txnField1 = cleanStr(editDoc.txnField1 || editDoc.form?.txnField1 || vehicleNumber || fallback.txnField1 || "");
  const txnField2 = cleanStr(editDoc.txnField2 || editDoc.form?.txnField2 || driverName || fallback.txnField2 || "");
  const txnField3 = cleanStr(editDoc.txnField3 || editDoc.form?.txnField3 || editDoc.lrNumber || editDoc.form?.lrNumber || fallback.txnField3 || "");
  const dateField = cleanStr(editDoc.dateField || editDoc.form?.dateField || editDoc.deliveryDate || editDoc.form?.deliveryDate || fallback.dateField || "");

  return {
    ...fallback,
    ...(editDoc.form || {}),
    customer,
    partyId,
    partyName: customer,
    billingName,
    phone,
    billingAddress,
    shippingAddress,
    invoiceNumber: String(invoiceNumber || "1"),
    invoiceDate,
    stateOfSupply,
    paymentType,
    paymentTerms,
    dueDate,
    ewayBillNo,
    vehicleNumber: vehicleNumber || txnField1,
    driverName: driverName || txnField2,
    poNumber,
    poDate,
    reverseCharge,
    txnField1,
    txnField2,
    txnField3,
    dateField,
    description,
    terms,
    partyBalance: editDoc.partyBalance || editDoc.form?.partyBalance || fallback.partyBalance || "",
    showTerms: Boolean(terms),
    termsTitle: editDoc.termsTitle || editDoc.terms_title || editDoc.form?.termsTitle || fallback.termsTitle || "",
    showDescription: Boolean(description),
  };
}

// Provides dismiss.
function useDismiss(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined;

    // Handles pointer down.
    const handlePointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    // Handles key down.
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

// Renders the text input interface.
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

// Renders the select input interface.
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

// Renders the text area interface.
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

// Renders the party picker interface.
function PartyPicker({ value, parties, error, onChange, onSelect, onAddParty, appSettings }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const safeVal = String(value || "");
  const query = safeVal.toLowerCase();
  const filtered = parties.filter((party) => `${party.name || party.partyName || ""} ${party.phone || ""}`.toLowerCase().includes(query));
  const exactMatch = parties.some((party) => (party.partyName || party.name || "").trim().toLowerCase() === safeVal.trim().toLowerCase());
  useDismiss(open, rootRef, () => setOpen(false));

  return (
    <div ref={rootRef} className="relative">
      <TextInput
        error={error}
        value={safeVal}
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
          {!appSettings?.blockNewPartiesFromTxn && (
            <button type="button" onClick={() => { setOpen(false); onAddParty(); }} className="mb-2 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50">
              <FiPlus /> Add Party
            </button>
          )}
          {value.trim() && !exactMatch && !appSettings?.blockNewPartiesFromTxn && (
            <button type="button" onClick={() => { onChange(value.trim()); setOpen(false); }} className="mb-1 w-full rounded-md px-3 py-2 text-left text-[13px] text-slate-600 hover:bg-slate-50">Use new name: <span className="font-semibold text-slate-800">{value.trim()}</span></button>
          )}
          {value.trim() && !exactMatch && appSettings?.blockNewPartiesFromTxn && (
            <div className="mb-1 rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              Adding new parties from transactions is blocked in Settings. Please select an existing party.
            </div>
          )}
          <div className="max-h-36 overflow-y-auto">
            {filtered.length ? (
              filtered.map((party) => (
                <button key={party.id} type="button" onClick={() => { onSelect(party); setOpen(false); }} className="grid w-full grid-cols-[1fr_80px] gap-3 rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-slate-50">
                  <span>
                    <span className="flex items-center gap-1.5 font-medium text-slate-800">
                      <span>{party.partyName || party.name}</span>
                      {(party.status?.toLowerCase() === "inactive" || party.isInactive) && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-semibold text-amber-800">
                          Inactive
                        </span>
                      )}
                    </span>
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

// Converts a saved party into the fields used by transaction forms.
function partyOption(party) {
  return {
    ...party,
    id: party.id,
    name: party.partyName || party.name || "",
    partyName: party.partyName || party.name || "",
    phone: party.phone || "",
    balance: party.openingBalance || party.balance || 0,
    billingAddress: party.billingAddress || party.address || "",
    shippingAddress: party.shippingAddress || "",
  };
}

// Renders the transaction tabs interface.
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

// Renders the transaction header interface.
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
        {onSettings && (
          <button type="button" onClick={onSettings} title="Settings" aria-label="Settings" className="rounded-full p-2 hover:bg-slate-100 cursor-pointer">
            <FiSettings className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-100 cursor-pointer" aria-label="Close sale">
          <FiX className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

// Renders the customer details interface.
function CustomerDetails({ appSettings = {}, saleType, form, errors, setField, config, parties = [], onAddParty }) {
  const isCredit = saleType === "credit";
  const isPurchase = config.type === "purchase";

  return (
    <section className="grid gap-4 bg-slate-50 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,300px)_180px] xl:max-w-2xl">
        <label>
          <span className="mb-1 block text-[13px] font-semibold text-slate-600">{isPurchase ? config.partyLabel : isCredit ? config.partyLabel : config.cashPartyLabel}</span>
          <PartyPicker
            error={errors.customer}
            value={form.customer}
            parties={parties}
            appSettings={appSettings}
            onAddParty={onAddParty}
            onChange={(value) => {
              setField("customer", value);
              setField("partyBalance", "");
              const matched = parties.find(
                (p) => String(p.partyName || p.name || "").trim().toLowerCase() === String(value || "").trim().toLowerCase()
              );
              setField("partyId", matched?.id || "");
              setField("partyName", matched?.partyName || matched?.name || value);
            }}
            onSelect={(party) => {
              const pName = party.partyName || party.name || "";
              setField("customer", pName);
              setField("partyId", party.id || "");
              setField("partyName", pName);
              setField("phone", party.phone || "");
              setField("partyBalance", party.balance || "");
              if (party.billingAddress || party.address) {
                setField("billingAddress", party.billingAddress || party.address);
              }
              if (party.shippingAddress) {
                setField("shippingAddress", party.shippingAddress);
              }
            }}
          />
          {form.partyBalance !== "" && <span className="mt-1 block text-xs font-semibold text-emerald-600">BAL: {form.partyBalance}</span>}
        </label>
        <label>
          <span className="mb-1 block text-[13px] font-semibold text-slate-600">Phone No.</span>
          <TextInput value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="Phone No." />
        </label>
        {appSettings.billingNameOfParties && (
          <label>
            <span className="mb-1 block text-[13px] font-semibold text-slate-600">Billing Name</span>
            <TextInput value={form.billingName || ""} onChange={(event) => setField("billingName", event.target.value)} placeholder="Billing / Trade Name" />
          </label>
        )}
        <div>
          <TextArea value={form.billingAddress} onChange={(event) => setField("billingAddress", event.target.value)} placeholder="Billing Address" className="h-20 w-full sm:h-24 lg:h-20" />
          {form.billingAddress && (
            <div className="mt-2 flex justify-end gap-4 text-xs">
              <button type="button" onClick={() => setField("billingAddress", "")} className="text-slate-500 hover:text-slate-700">Remove</button>
              <button type="button" onClick={() => document.querySelector('textarea[placeholder="Billing Address"]')?.focus()} className="text-blue-600 hover:underline">Change</button>
            </div>
          )}
        </div>
        {appSettings?.billingType !== "Lite Sale" && appSettings?.enableShippingAddress !== false && (
          <div>
            <TextArea value={form.shippingAddress} onChange={(event) => setField("shippingAddress", event.target.value)} placeholder="Shipping Address" className="h-20 w-full sm:h-24 lg:h-20" />
            {form.shippingAddress && (
              <div className="mt-2 flex justify-end gap-4 text-xs">
                <button type="button" onClick={() => setField("shippingAddress", "")} className="text-slate-500 hover:text-slate-700">Remove</button>
                <button type="button" onClick={() => document.querySelector('textarea[placeholder="Shipping Address"]')?.focus()} className="text-blue-600 hover:underline">Change</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-[124px_1fr] xl:self-start">
        <span className="pt-2 text-[13px] text-slate-500">{config.numberLabel}</span>
        <div className="flex w-full">
          {(appSettings.salePrefixEnabled || (appSettings.salePrefix && appSettings.salePrefix !== "None")) && (
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-300 bg-slate-100 px-2.5 text-xs font-bold text-slate-700 select-none">
              {appSettings.salePrefixText || (appSettings.salePrefix !== "None" ? appSettings.salePrefix : "INV-")}
            </span>
          )}
          <TextInput
            disabled={appSettings.enableInvoiceBillNo === false}
            error={errors.invoiceNumber}
            value={form.invoiceNumber}
            onChange={(event) => setField("invoiceNumber", event.target.value)}
            placeholder={appSettings.enableInvoiceBillNo === false ? "Auto-numbered" : "Invoice No."}
            className={`w-full ${(appSettings.salePrefixEnabled || (appSettings.salePrefix && appSettings.salePrefix !== "None")) ? "rounded-l-none" : ""}`}
          />
        </div>
        <span className="pt-2 text-[13px] text-slate-500">
          {config.dateLabel}
          {appSettings.addTimeOnTransactions && (
            <span className="ml-1 text-[10px] text-blue-600 font-semibold">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
        <DatePicker value={form.invoiceDate} onChange={(value) => setField("invoiceDate", value)} />

        {appSettings.dueDatesAndPaymentTerms && (
          <>
            <span className="pt-2 text-[13px] text-slate-500">Payment Terms</span>
            <SelectInput
              value={form.paymentTerms || "Due on Receipt"}
              onChange={(value) => {
                setField("paymentTerms", value);
                let days = 0;
                if (value === "Net 7") days = 7;
                else if (value === "Net 15") days = 15;
                else if (value === "Net 30") days = 30;
                else if (value === "Net 45") days = 45;
                else if (value === "Net 60") days = 60;
                if (value !== "Custom") {
                  const invDate = form.invoiceDate ? new Date(form.invoiceDate) : new Date();
                  invDate.setDate(invDate.getDate() + days);
                  setField("dueDate", invDate.toISOString().slice(0, 10));
                }
              }}
              options={["Due on Receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Custom"]}
            />
            <span className="pt-2 text-[13px] text-slate-500">Due Date</span>
            <DatePicker
              value={form.dueDate || form.invoiceDate || currentLocalDate()}
              onChange={(value) => {
                setField("dueDate", value);
                setField("paymentTerms", "Custom");
              }}
            />
          </>
        )}

        {appSettings.billingType !== "Lite Sale" && appSettings.enablePlaceOfSupply !== false && (
          <>
            <span className="pt-2 text-[13px] text-slate-500">State of Supply</span>
            <SelectInput value={form.stateOfSupply} onChange={(value) => setField("stateOfSupply", value)} options={stateOfSupplyOptions} />
          </>
        )}

        {appSettings.billingType !== "Lite Sale" && appSettings.reverseCharge && (
          <>
            <span className="pt-2 text-[13px] text-slate-500">Reverse Charge</span>
            <label className="flex items-center gap-2 pt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRcm || false}
                onChange={(e) => setField("isRcm", e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
              />
              <span className="text-xs text-slate-700 font-medium">Tax payable on RCM basis</span>
            </label>
          </>
        )}

        {appSettings.compositeScheme && (
          <div className="col-span-full rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 font-medium">
            <strong>Composition Scheme ({appSettings.compositeSchemeType || "Manufacturer 1.0%"}):</strong> Bill of Supply. Not eligible to collect tax on supplies.
          </div>
        )}

        {appSettings.billingType !== "Lite Sale" && appSettings.enableEwayBillNo && (
          <>
            <span className="pt-2 text-[13px] text-slate-500">E-way Bill No.</span>
            <TextInput value={form.ewayBillNo || ""} onChange={(e) => setField("ewayBillNo", e.target.value)} placeholder="12-digit E-way No." />
          </>
        )}

        {appSettings.billingType !== "Lite Sale" && appSettings.customerPoDetails && (
          <>
            <span className="pt-2 text-[13px] text-slate-500">PO Number</span>
            <TextInput value={form.poNumber || ""} onChange={(e) => setField("poNumber", e.target.value)} placeholder="Customer PO Ref" />
            <span className="pt-2 text-[13px] text-slate-500">PO Date</span>
            <DatePicker value={form.poDate || ""} onChange={(val) => setField("poDate", val)} />
          </>
        )}

        {(appSettings.transportationDetails?.transporterName || form.transporterName) && (
          <>
            <span className="pt-2 text-[13px] text-slate-500">Transporter</span>
            <TextInput value={form.transporterName || ""} onChange={(e) => setField("transporterName", e.target.value)} placeholder="Transporter Name" />
          </>
        )}

        {(appSettings.transportationDetails?.vehicleNumber || form.vehicleNumber) && !appSettings.additionalFieldsSetup?.txnField1?.enabled && (
          <>
            <span className="pt-2 text-[13px] text-slate-500">Vehicle No.</span>
            <TextInput value={form.vehicleNumber || ""} onChange={(e) => setField("vehicleNumber", e.target.value)} placeholder="Vehicle Number" />
          </>
        )}

        {/* Enabled Transaction Additional Fields */}
        {["txnField1", "txnField2", "txnField3", "dateField"].map((fKey) => {
          const field = appSettings.additionalFieldsSetup?.[fKey];
          if (!field?.enabled) return null;
          return (
            <div key={fKey} className="contents">
              <span className="pt-2 text-[13px] text-slate-500">{field.name || "Extra Field"}</span>
              <TextInput
                value={form[fKey] ?? field.value ?? ""}
                onChange={(e) => setField(fKey, e.target.value)}
                placeholder={`Enter ${field.name || "value"}`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Renders the item picker interface.
// Renders row serial modal for unit tracking in transactions
function RowSerialModal({ row, item, onSave, onClose }) {
  const [text, setText] = useState((row.serialNumbers || []).join("\n"));
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const parsed = text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const duplicates = parsed.filter((s, idx) => parsed.indexOf(s) !== idx);
  const maxQty = Math.max(Number(row.qty || 0), 0);

  const handleSave = () => {
    if (duplicates.length > 0) {
      setError(`Duplicate serial number found: "${duplicates[0]}". Each unit must be unique.`);
      return;
    }
    const unique = [...new Set(parsed)];
    onSave(unique);
    onClose();
  };

  const handlePickAvailable = (serial) => {
    if (parsed.includes(serial)) {
      setText(parsed.filter((s) => s !== serial).join("\n"));
    } else {
      setText([...parsed, serial].join("\n"));
    }
  };

  const availableSerials = item?.serialNumbers || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <Card className="w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">Assign Serials / IMEIs</h2>
            <p className="text-xs text-slate-500">{row.item || "Selected Item"} {maxQty > 0 ? `· Qty: ${maxQty}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <FiX />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {availableSerials.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Available item serials (click to select):</p>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2">
                {availableSerials.map((s) => {
                  const selected = parsed.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handlePickAvailable(s)}
                      className={`rounded px-2 py-0.5 font-mono text-xs font-medium transition ${
                        selected
                          ? "bg-purple-600 text-white"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {selected ? `✓ ${s}` : s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs text-slate-500">Enter serials/IMEIs (one per line or comma-separated):</p>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => { setText(e.target.value); setError(""); }}
              placeholder="e.g.\nSN001\nSN002"
              className="w-full rounded-md border border-slate-300 p-2 text-xs font-mono outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex justify-between text-xs font-semibold">
            <span className={maxQty > 0 && parsed.length === maxQty ? "text-emerald-600" : "text-slate-600"}>
              Assigned: {parsed.length}{maxQty > 0 ? ` / ${maxQty} units` : ""}
            </span>
            {duplicates.length > 0 && <span className="text-rose-600">Duplicate detected!</span>}
          </div>
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button onClick={onClose} className="bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</Button>
          <Button onClick={handleSave} className="bg-blue-600 text-white hover:bg-blue-700">Apply Serials</Button>
        </div>
      </Card>
    </div>
  );
}

function ItemPicker({ value, items, onSelect, onChange, onAddItem, appSettings = {} }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const enableBarcodeScanning = appSettings.enableBarcodeScanning ?? true;
  const enableItemCategory = appSettings.enableItemCategory ?? true;
  const q = (query || value).toLowerCase().trim();
  const filtered = items.filter((item) => {
    if (item.isActive === false || item.is_active === 0 || item.is_active === "0") return false;
    if (!q) return true;
    const matchName = item.name.toLowerCase().includes(q);
    const matchCode = (item.code || "").toLowerCase().includes(q);
    const matchBarcode = enableBarcodeScanning && (item.barcode || "").toLowerCase().includes(q);
    return matchName || matchCode || matchBarcode;
  });
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
          if (event.key === "Enter") {
            const exactMatch = items.find((i) =>
              i.isActive !== false && ((enableBarcodeScanning && i.barcode && i.barcode.toLowerCase() === value.trim().toLowerCase())
              || (i.code && i.code.toLowerCase() === value.trim().toLowerCase())
              || (i.name.toLowerCase() === value.trim().toLowerCase()))
            );
            if (exactMatch) {
              onSelect(exactMatch);
              setOpen(false);
              return;
            }
            setOpen(false);
          }
          if (event.key === "Escape") setOpen(false);
        }}
        className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] outline-none focus:border-blue-400 focus:bg-white"
      />
      {open && (
        <div className="absolute left-0 top-9 z-40 w-[min(480px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl">
          <label className="flex h-8 items-center gap-2 rounded-full border border-slate-200 px-3">
            <FiSearch className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, code, or barcode" className="w-full bg-transparent text-[13px] outline-none" autoFocus />
          </label>
          <div className="mt-2 max-h-36 overflow-y-auto">
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
                  <span className="truncate">
                    <span className="font-medium text-slate-800">{item.name}</span>
                    {enableItemCategory && item.category && (
                      <span className="ml-1 text-xs text-slate-400 font-normal">({item.category})</span>
                    )}
                    {appSettings.enableItemDescription !== false && item.description && (
                      <span className="ml-1 text-xs text-slate-500 font-normal">· {item.description}</span>
                    )}
                    {enableBarcodeScanning && item.barcode && (
                      <span className="ml-1 font-mono text-[11px] text-slate-500 font-normal">[{item.barcode}]</span>
                    )}
                  </span>
                  <span className="text-slate-500 text-right">
                    <span>{item.price || "0"}</span>
                    {appSettings.displayPurchasePriceOfItems && item.purchasePrice ? (
                      <span className="block text-[10px] text-slate-400">Cost: ₹{item.purchasePrice}</span>
                    ) : null}
                  </span>
                  <span className="text-right font-semibold text-slate-700">{item.stock}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-1.5 text-[13px] text-slate-400">No items available.</p>
            )}
          </div>
          {!appSettings.blockNewItemsFromTxn ? (
            <button type="button" onClick={() => { setOpen(false); onAddItem(); }} className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50">
              <FiPlus /> Add Item
            </button>
          ) : (
            <div className="mt-2 rounded bg-amber-50 px-3 py-1 text-[11px] text-amber-700">
              Adding new items from transactions is blocked in Settings.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Renders the cell input interface.
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

// Renders the invoice table interface.
function InvoiceTable({ rows, setRows, items, errors, onAddItem, appSettings = {}, isPurchase = false }) {
  const customTaxNames = useMemo(
    () => (appSettings.taxRatesList || []).map((t) => t.name).filter(Boolean),
    [appSettings.taxRatesList]
  );
  const effectiveSaleTaxOptions = useMemo(
    () => [...new Set([...saleTaxOptions, ...customTaxNames])],
    [customTaxNames]
  );
  const [serialModalRow, setSerialModalRow] = useState(null);
  const enableBatchTracking = Boolean(appSettings.enableBatchTracking);
  const enableSerialTracking = Boolean(appSettings.enableSerialTracking);
  const enableBarcodeScanning = appSettings.enableBarcodeScanning ?? true;

  // Updates row.
  const updateRow = (id, field, value) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;

        const numericFields = ["qty", "price", "discountPercent", "discountAmount", "cessPercent", "cessAmount"];
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

  // Applies item.
  const applyItem = (id, item) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? syncDiscount({
              ...row,
              item: item.name,
              hsn: item.hsn || item.sac || row.hsn || "",
              cessPercent: item.cessPercent || item.cess || row.cessPercent || "",
              unit: item.unit || row.unit,
              price: (isPurchase && item.purchasePrice) ? item.purchasePrice : (item.price || row.price),
              discountMode: !isPurchase && appSettings.enableItemDiscount !== false && String(item.discountType || "").toLowerCase().includes("flat") ? "amount" : "percent",
              discountPercent: !isPurchase && appSettings.enableItemDiscount !== false && !String(item.discountType || "").toLowerCase().includes("flat") ? String(item.discount || "") : "",
              discountAmount: !isPurchase && appSettings.enableItemDiscount !== false && String(item.discountType || "").toLowerCase().includes("flat") ? String(item.discount || "") : "",
              priceMode: (isPurchase ? item.purchasePriceMode : item.priceMode) || row.priceMode,
              taxRate: item.taxRate || row.taxRate,
              sourceItemId: item.id || "",
              batchNo: isItemBatchTracked(item) ? (row.batchNo || (item.batches?.[0]?.batchNo || "")) : "",
              expDate: isItemBatchTracked(item) ? (row.expDate || (item.batches?.[0]?.expDate || "")) : "",
              batchId: isItemBatchTracked(item) ? (row.batchId || (item.batches?.[0]?.id || "")) : "",
            })
          : row
      )
    );
  };

  // Deletes row.
  const deleteRow = (id) => {
    setRows((current) => (current.length === 1 ? [createRow()] : current.filter((row) => row.id !== id)));
  };

  const totals = useMemo(() => calculateInvoiceTotals(rows, false, 0, 0), [rows]);

  return (
    <section className="overflow-x-auto overflow-y-visible border-y border-slate-200 bg-white">
      {enableBarcodeScanning && (
        <div className={`flex items-center gap-2 border-b border-slate-200 px-4 py-2 text-xs ${appSettings.enableQuickEntry ? "bg-blue-50 border-blue-200" : "bg-slate-50"}`}>
          <span className="font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            {appSettings.enableQuickEntry ? (
              <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white tracking-normal shadow-sm">
                ⚡ Quick Entry Active
              </span>
            ) : (
              "Scan Barcode:"
            )}
          </span>
          <input
            id="quick-entry-barcode-input"
            autoFocus={Boolean(appSettings.enableQuickEntry)}
            type="text"
            placeholder={appSettings.enableQuickEntry ? "Scan barcode or enter item code and press Enter..." : "Scan or enter barcode / item code..."}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target.value.trim()) {
                const val = e.target.value.trim().toLowerCase();
                const found = items.find(
                  (it) =>
                    it.isActive !== false && ((it.barcode && it.barcode.toLowerCase() === val) ||
                    (it.code && it.code.toLowerCase() === val) ||
                    (it.name.toLowerCase() === val))
                );
                if (found) {
                  const existingRow = appSettings.enableQuickEntry
                    ? rows.find((r) => r.item.trim().toLowerCase() === found.name.toLowerCase())
                    : null;
                  if (existingRow) {
                    setRows((curr) =>
                      curr.map((r) =>
                        r.id === existingRow.id
                          ? { ...r, qty: String(toNumber(r.qty) + 1) }
                          : r
                      )
                    );
                  } else {
                    const emptyIdx = rows.findIndex((r) => !r.item.trim());
                    if (emptyIdx >= 0) {
                      applyItem(rows[emptyIdx].id, found);
                    } else {
                      const newRow = createRow();
                      setRows((curr) => [...curr, newRow]);
                      setTimeout(() => applyItem(newRow.id, found), 0);
                    }
                  }
                  e.target.value = "";
                }
              }
            }}
            className={`h-7 w-80 rounded border px-2.5 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 ${appSettings.enableQuickEntry ? "border-blue-400 bg-white shadow-sm" : "border-slate-300 bg-white"}`}
          />
          {appSettings.enableQuickEntry && (
            <span className="text-[11px] text-blue-700 font-medium">Auto-increments quantity or adds row on Enter</span>
          )}
        </div>
      )}
      <table className="w-full min-w-[700px] border-collapse text-[13px] xl:min-w-0">
        <thead>
          <tr className="bg-white text-left text-xs font-bold uppercase text-slate-700">
            <th rowSpan={appSettings.billingType === "Lite Sale" ? 1 : 2} className="sticky left-0 z-20 w-10 border-r border-slate-200 bg-white px-2 py-1.5 text-center shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">#</th>
            <th rowSpan={appSettings.billingType === "Lite Sale" ? 1 : 2} className="w-[30%] min-w-[200px] border-r border-slate-200 px-2 py-1.5">Item</th>
            {appSettings.billingType !== "Lite Sale" && appSettings.enableHsnSacCode !== false && (
              <th rowSpan="2" className="w-24 border-r border-slate-200 px-2 py-1.5 text-center">HSN/SAC</th>
            )}
            {enableBatchTracking && (
              <>
                <th rowSpan="2" className="w-24 border-r border-slate-200 px-2 py-1.5 text-center">Batch No</th>
                <th rowSpan="2" className="w-28 border-r border-slate-200 px-2 py-1.5 text-center">Exp. Date</th>
              </>
            )}
            {enableSerialTracking && (
              <th rowSpan="2" className="w-28 border-r border-slate-200 px-2 py-1.5 text-center">Serial/IMEI</th>
            )}
            <th rowSpan={appSettings.billingType === "Lite Sale" ? 1 : 2} className="w-16 border-r border-slate-200 px-2 py-1.5">Qty</th>
            {appSettings.enableFreeItemQuantity && (
              <th rowSpan={appSettings.billingType === "Lite Sale" ? 1 : 2} className="w-16 border-r border-slate-200 px-2 py-1.5 text-center">Free Qty</th>
            )}
            <th rowSpan={appSettings.billingType === "Lite Sale" ? 1 : 2} className="w-24 border-r border-slate-200 px-2 py-1.5">Unit</th>
            <th rowSpan={appSettings.billingType === "Lite Sale" ? 1 : undefined} className="w-36 border-r border-slate-200 px-2 py-1.5 text-center">Price/Unit</th>
            {appSettings.billingType !== "Lite Sale" && (
              <th colSpan="2" className="w-40 border-r border-slate-200 px-2 py-1.5 text-center">Discount</th>
            )}
            {appSettings.billingType !== "Lite Sale" && appSettings.enableGst !== false && (
              <th colSpan={appSettings.additionalCessOnItem ? 3 : 2} className="w-44 border-r border-slate-200 px-2 py-1.5 text-center">Tax</th>
            )}
            <th rowSpan={appSettings.billingType === "Lite Sale" ? 1 : 2} className="w-24 px-2 py-1.5 text-right">Amount</th>
          </tr>
          {appSettings.billingType !== "Lite Sale" && (
            <tr className="bg-white text-xs font-medium text-slate-600">
              <th className="border-r border-t border-slate-200 px-2 py-1">
                <span className="sr-only">Price tax mode</span>
              </th>
              <th className="w-16 border-r border-t border-slate-200 px-2 py-1.5 text-center">%</th>
              <th className="w-24 border-r border-t border-slate-200 px-2 py-1.5 text-center">Amount</th>
              {appSettings.enableGst !== false && (
                <>
                  <th className="w-24 border-r border-t border-slate-200 px-2 py-1.5 text-center">%</th>
                  {appSettings.additionalCessOnItem && (
                    <th className="w-20 border-r border-t border-slate-200 px-2 py-1.5 text-center">Cess %</th>
                  )}
                </>
              )}
              <th className="w-20 border-r border-t border-slate-200 px-2 py-1.5 text-center">Amount</th>
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const calculated = calculateRow(row);
            const rowErrors = errors.rows?.[row.id] || {};

            return (
              <tr key={row.id} className={`group ${index % 2 === 0 ? "bg-slate-50" : "bg-white"}`}>
                <td className={`sticky left-0 z-10 border-r border-slate-200 px-1 py-1.5 text-center text-slate-500 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] ${index % 2 === 0 ? "bg-slate-50" : "bg-white"}`}>
                  <div className="flex items-center justify-center gap-1">
                    <span>{index + 1}</span>
                    <button type="button" onClick={() => deleteRow(row.id)} aria-label="Delete row" className="rounded p-1 text-slate-400 opacity-100 hover:bg-rose-50 hover:text-rose-600 md:opacity-0 md:group-hover:opacity-100">
                      <FiTrash2 />
                    </button>
                  </div>
                </td>
                <td className="border-r border-slate-200 p-1">
                  <ItemPicker value={row.item} items={items} onChange={(value) => updateRow(row.id, "item", value)} onSelect={(item) => applyItem(row.id, item)} onAddItem={() => onAddItem(row.id)} appSettings={appSettings} />
                </td>
                {appSettings.billingType !== "Lite Sale" && appSettings.enableHsnSacCode !== false && (
                  <td className="border-r border-slate-200 p-1">
                    <HsnAutocomplete
                      compact
                      showIcon={false}
                      value={row.hsn || ""}
                      onChange={(code) => updateRow(row.id, "hsn", code)}
                      onSelect={(selected) => {
                        if (!selected) return;
                        updateRow(row.id, "hsn", selected.code);
                        if (selected.description && (!row.item || row.item.trim() === "")) {
                          updateRow(row.id, "item", selected.description);
                        }
                        if (selected.gst_rate !== null && selected.gst_rate !== undefined) {
                          const matchedTax = matchGstRateToOption(selected.gst_rate, effectiveSaleTaxOptions);
                          if (matchedTax) updateRow(row.id, "taxRate", matchedTax);
                        }
                        if (selected.cess_rate !== null && selected.cess_rate !== undefined && selected.cess_rate > 0) {
                          updateRow(row.id, "cessPercent", String(selected.cess_rate));
                        }
                      }}
                      placeholder="HSN / SAC"
                      className="h-8 w-full rounded border border-transparent bg-transparent px-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                    />
                  </td>
                )}
                {enableBatchTracking && (
                  <>
                    <td className="border-r border-slate-200 p-1">
                      {(() => {
                        const matchedItem = items.find(
                          (item) =>
                            (row.sourceItemId && item.id === row.sourceItemId) ||
                            (row.item && String(item.name || item.itemName || "").trim().toLowerCase() === String(row.item).trim().toLowerCase())
                        );
                        const isBatchTracked = isItemBatchTracked(matchedItem);

                        if (!isPurchase && isBatchTracked && matchedItem?.batches?.length) {
                          return (
                            <select
                              value={row.batchNo || ""}
                              onChange={(event) => {
                                const batch = matchedItem.batches.find(
                                  (entry) => String(entry.batchNo).toLowerCase() === event.target.value.toLowerCase()
                                );
                                setRows((current) =>
                                  current.map((entry) =>
                                    entry.id === row.id
                                      ? {
                                          ...entry,
                                          batchNo: batch?.batchNo || "",
                                          expDate: batch?.expDate || "",
                                          batchId: batch?.id || "",
                                        }
                                      : entry
                                  )
                                );
                              }}
                              className={`h-8 w-full rounded border px-1 text-xs ${
                                rowErrors.batchNo
                                  ? "border-rose-400 bg-rose-50 text-rose-800"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              <option value="">Select batch</option>
                              {matchedItem.batches.map((batch) => (
                                <option
                                  key={batch.id || batch.batchNo}
                                  value={batch.batchNo}
                                  disabled={
                                    Number(batch.openingQty || 0) <= 0 ||
                                    Boolean(batch.expDate && batch.expDate < localDateOnly())
                                  }
                                >
                                  {batch.batchNo} · {batch.openingQty || 0} · exp {batch.expDate || "—"}
                                </option>
                              ))}
                            </select>
                          );
                        }

                        if (!isPurchase && isBatchTracked && (!matchedItem?.batches || matchedItem.batches.length === 0)) {
                          return (
                            <div className="flex h-8 items-center px-1.5 text-[11px] font-medium text-rose-600" title="Item is batch-tracked but has no batch stock configured">
                              No batch stock
                            </div>
                          );
                        }

                        if (!isPurchase && matchedItem && !isBatchTracked) {
                          return (
                            <div className="flex h-8 items-center px-1.5 text-[11px] text-slate-400 italic">
                              Non-batch item
                            </div>
                          );
                        }

                        return (
                          <CellInput
                            value={row.batchNo || ""}
                            onChange={(event) => updateRow(row.id, "batchNo", event.target.value)}
                            placeholder="Batch No"
                          />
                        );
                      })()}
                    </td>
                    <td className="border-r border-slate-200 p-1">
                      <CellInput
                        type="date"
                        value={row.expDate || ""}
                        onChange={(event) => updateRow(row.id, "expDate", event.target.value)}
                      />
                    </td>
                  </>
                )}
                {enableSerialTracking && (
                  <td className="border-r border-slate-200 p-1 text-center">
                    <button
                      type="button"
                      onClick={() => setSerialModalRow(row)}
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        row.serialNumbers?.length
                          ? "bg-purple-100 text-purple-800 font-mono"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {row.serialNumbers?.length ? `${row.serialNumbers.length} SN` : "+ Serials"}
                    </button>
                  </td>
                )}
                <td className="border-r border-slate-200 p-1">
                  <CellInput inputMode="decimal" error={rowErrors.qty} value={row.qty} onChange={(event) => updateRow(row.id, "qty", event.target.value)} />
                  {(() => {
                    if (isPurchase) return null;
                    const matchedItem = items.find((it) => it.id === row.sourceItemId || (it.name && it.name.toLowerCase() === (row.item || "").trim().toLowerCase()));
                    const minWholesale = Number(matchedItem?.minimumWholesaleQuantity || matchedItem?.wholesale?.minimumQty || 0);
                    const wholesalePrice = Number(matchedItem?.wholesalePrice || matchedItem?.wholesale?.price || 0);
                    if (wholesalePrice > 0 && Math.abs(Number(row.price || 0) - wholesalePrice) < 0.01 && minWholesale > 0 && Number(row.qty || 0) < minWholesale) {
                      return <span className="block text-[10px] text-amber-600 font-semibold mt-0.5" title={`Wholesale price requires minimum ${minWholesale} qty`}>Min wholesale: {minWholesale}</span>;
                    }
                    return null;
                  })()}
                </td>
                {appSettings.enableFreeItemQuantity && (
                  <td className="border-r border-slate-200 p-1">
                    <CellInput inputMode="decimal" value={row.freeQty || ""} onChange={(event) => updateRow(row.id, "freeQty", event.target.value)} placeholder="0" />
                  </td>
                )}
                <td className="border-r border-slate-200 p-1"><UnitSelector value={row.unit} onChange={(value) => updateRow(row.id, "unit", value)} className="[&_button]:h-8 [&_button]:px-2 [&_button]:text-[13px]" /></td>
                <td className="border-r border-slate-200 p-1">
                  <div className="grid gap-1">
                    {appSettings.billingType !== "Lite Sale" && appSettings.inclusiveTaxOnRate !== false && (
                      <SelectInput value={row.priceMode} onChange={(value) => updateRow(row.id, "priceMode", value)} options={priceModes} className="h-8 text-xs" />
                    )}
                    <CellInput inputMode="decimal" error={rowErrors.price} value={row.price} onChange={(event) => updateRow(row.id, "price", event.target.value)} />
                    {(() => {
                      const showLastPrices = isPurchase ? appSettings.showLast5PurchasePrice : appSettings.showLast5SalePrice;
                      if (!showLastPrices || !row.item?.trim()) return null;
                      const lastPrices = getLast5PricesForItem(row.item, isPurchase);
                      if (!lastPrices || !lastPrices.length) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                          <span className="font-semibold text-slate-600">Last 5:</span>
                          {lastPrices.map((p, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              title="Click to apply rate"
                              onClick={() => updateRow(row.id, "price", String(p))}
                              className="rounded bg-blue-50 px-1 py-0.5 font-bold text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-colors"
                            >
                              ₹{p}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </td>
                {appSettings.billingType !== "Lite Sale" && (
                  <>
                    <td className="border-r border-slate-200 p-1"><CellInput inputMode="decimal" error={rowErrors.discountPercent} value={row.discountPercent} onChange={(event) => updateRow(row.id, "discountPercent", event.target.value)} /></td>
                    <td className="border-r border-slate-200 p-1"><CellInput inputMode="decimal" error={rowErrors.discountAmount} value={row.discountAmount} onChange={(event) => updateRow(row.id, "discountAmount", event.target.value)} /></td>
                  </>
                )}
                {appSettings.billingType !== "Lite Sale" && appSettings.enableGst !== false && (
                  <>
                    <td className="border-r border-slate-200 p-1"><SelectInput value={row.taxRate} onChange={(value) => updateRow(row.id, "taxRate", value)} options={effectiveSaleTaxOptions} className="border-transparent bg-transparent focus:bg-white" /></td>
                    {appSettings.additionalCessOnItem && (
                      <td className="border-r border-slate-200 p-1">
                        <CellInput inputMode="decimal" value={row.cessPercent || ""} onChange={(event) => updateRow(row.id, "cessPercent", event.target.value)} placeholder="0%" />
                      </td>
                    )}
                    <td className="border-r border-slate-200 px-2 py-1.5 text-right text-slate-700">{calculated.tax.toFixed(2)}</td>
                  </>
                )}
                <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{calculated.amount.toFixed(2)}</td>
              </tr>
            );
          })}
          <tr className="bg-white font-bold text-slate-700">
            <td className="sticky left-0 z-10 border-r border-slate-200 bg-white p-1 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]" />
            <td className="border-r border-slate-200 p-1">
              <button type="button" onClick={() => setRows((current) => [...current, createRow()])} className="rounded-md border border-blue-300 px-3.5 py-1.5 text-[13px] font-bold text-blue-600 hover:bg-blue-50">
                Add Row
              </button>
            </td>
            {appSettings.billingType !== "Lite Sale" && appSettings.enableHsnSacCode !== false && <td className="border-r border-slate-200" />}
            {enableBatchTracking && (
              <>
                <td className="border-r border-slate-200" />
                <td className="border-r border-slate-200" />
              </>
            )}
            {enableSerialTracking && <td className="border-r border-slate-200" />}
            <td className="border-r border-slate-200 px-2 text-right">{totals.qty}</td>
            {appSettings.enableFreeItemQuantity && (
              <td className="border-r border-slate-200 px-2 text-right text-slate-500 font-semibold">{totals.freeQty || 0}</td>
            )}
            <td className="border-r border-slate-200" />
            <td className="border-r border-slate-200 text-right">Total</td>
            {appSettings.billingType !== "Lite Sale" && (
              <>
                <td className="border-r border-slate-200" />
                <td className="border-r border-slate-200 px-2 text-right">{totals.discount.toFixed(2)}</td>
              </>
            )}
            {appSettings.billingType !== "Lite Sale" && appSettings.enableGst !== false && (
              <>
                <td className="border-r border-slate-200 px-2 text-right">{totals.tax.toFixed(2)}</td>
                {appSettings.additionalCessOnItem && (
                  <td className="border-r border-slate-200 px-2 text-right">{(totals.cess || 0).toFixed(2)}</td>
                )}
              </>
            )}
            <td className="px-2 text-right">{totals.amount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      {serialModalRow && (
        <RowSerialModal
          row={serialModalRow}
          item={items.find((i) => i.id === serialModalRow.sourceItemId || i.name.toLowerCase() === serialModalRow.item.toLowerCase())}
          onSave={(serials) => {
            updateRow(serialModalRow.id, "serialNumbers", serials);
            setSerialModalRow(null);
          }}
          onClose={() => setSerialModalRow(null)}
        />
      )}
    </section>
  );
}

// Renders the terms title picker interface.
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

// Renders the payment selector interface.
function PaymentSelector({ value, onChange }) {
  const navigate = useNavigate();
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
          <button type="button" onClick={() => { setOpen(false); navigate("/cash-bank/bank-accounts"); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50">
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

// Renders the terms modal interface.
function TermsModal({ onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");

  useEffect(() => {
    // Handles key down.
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

// Renders the add ons interface.
function AddOns({ form, setField, files, setFiles, templates, setTemplates, showPayment }) {
  const navigate = useNavigate();
  const imageRef = useRef(null);
  const documentRef = useRef(null);
  const [termsModal, setTermsModal] = useState(false);

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setFiles((current) => ({
          ...current,
          image: reader.result,
          imageName: file.name,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDocumentUpload = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setFiles((current) => ({
          ...current,
          document: reader.result,
          documentName: file.name,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <section className="grid gap-4 bg-slate-50 px-4 py-4 xl:grid-cols-[minmax(300px,480px)_minmax(240px,300px)_1fr]">
      <div>
        {!form.showTerms ? (
          <button type="button" onClick={() => setField("showTerms", true)} className="flex h-12 w-full max-w-xl items-center gap-3 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-bold uppercase text-slate-400 hover:border-blue-200 hover:text-blue-600">
            <FiList className="h-5 w-5" /> Add Terms & Conditions
          </button>
        ) : (
          <Card className="p-4 relative">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-700">Terms & Conditions</h3>
              <button
                type="button"
                onClick={() => {
                  setField("showTerms", false);
                  setField("terms", "");
                  setField("termsTitle", "");
                }}
                className="text-xs text-slate-400 hover:text-rose-600"
                title="Remove Terms"
              >
                ✕ Remove
              </button>
            </div>
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
            <button type="button" onClick={() => navigate("/settings?tab=transaction")} className="text-[13px] font-semibold text-blue-600 hover:underline">+ Add Payment type</button>
          </div>
        )}
        {!form.showDescription ? (
          <button type="button" onClick={() => setField("showDescription", true)} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-bold uppercase text-slate-400 hover:border-blue-200 hover:text-blue-600">
            <FiFile /> Add Description
          </button>
        ) : (
          <div className="relative">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500 font-semibold">
              <span>Description / Notes</span>
              <button
                type="button"
                onClick={() => {
                  setField("showDescription", false);
                  setField("description", "");
                }}
                className="hover:text-rose-600 font-normal"
                title="Remove Description"
              >
                ✕ Remove
              </button>
            </div>
            <TextArea value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Description / Notes" className="h-24 w-full" />
          </div>
        )}

        <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        {files.image ? (
          <div className="flex h-12 w-full items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[13px] font-medium text-emerald-800">
            <span className="truncate max-w-[200px] flex items-center gap-2">
              <FiCamera className="text-emerald-600 shrink-0" />
              {files.imageName || (typeof files.image === "string" && files.image.startsWith("data:") ? "Image Attached" : files.image)}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => imageRef.current?.click()} className="text-xs text-blue-600 hover:underline">Change</button>
              <button type="button" onClick={() => setFiles((c) => ({ ...c, image: "", imageName: "" }))} className="text-xs text-rose-600 hover:underline">✕</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => imageRef.current?.click()} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-bold uppercase text-slate-400 hover:border-blue-200 hover:text-blue-600">
            <FiCamera /> Add Image
          </button>
        )}

        <input ref={documentRef} type="file" className="hidden" onChange={handleDocumentUpload} />
        {files.document ? (
          <div className="flex h-12 w-full items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[13px] font-medium text-emerald-800">
            <span className="truncate max-w-[200px] flex items-center gap-2">
              <FiFile className="text-emerald-600 shrink-0" />
              {files.documentName || (typeof files.document === "string" && files.document.startsWith("data:") ? "Document Attached" : files.document)}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => documentRef.current?.click()} className="text-xs text-blue-600 hover:underline">Change</button>
              <button type="button" onClick={() => setFiles((c) => ({ ...c, document: "", documentName: "" }))} className="text-xs text-rose-600 hover:underline">✕</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => documentRef.current?.click()} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-bold uppercase text-slate-400 hover:border-blue-200 hover:text-blue-600">
            <FiFile /> Add Document
          </button>
        )}
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

// Renders the totals panel interface.
function TotalsPanel({
  totals,
  roundOff,
  setRoundOff,
  roundOffValue,
  setRoundOffValue,
  receivedEnabled,
  setReceivedEnabled,
  receivedAmount,
  setReceivedAmount,
  appSettings = {},
  rowCount = 0,
  error = "",
  additionalCharges = {},
  setAdditionalCharges,
  txnDiscount = "",
  setTxnDiscount,
  txnTaxRate = "",
  setTxnTaxRate,
}) {
  const displayedRoundOff = roundOff ? (roundOffValue || formatMoneyInput(totals.roundOffAmount)) : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {(appSettings.transactionWiseDiscount || Number(totals.txnDiscount || 0) > 0) && (
          <div className="w-full flex justify-end items-center gap-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Invoice Discount:</span>
            <input
              type="number"
              min="0"
              value={txnDiscount}
              onChange={(e) => setTxnDiscount && setTxnDiscount(e.target.value)}
              placeholder="0.00"
              className="h-8 w-28 rounded border border-slate-300 bg-white px-2 text-right text-xs outline-none focus:border-blue-500"
            />
          </div>
        )}
        {(appSettings.transactionWiseTax || Number(totals.txnTax || 0) > 0) && (
          <div className="w-full flex justify-end items-center gap-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Transaction Tax (%):</span>
            <input
              type="number"
              min="0"
              value={txnTaxRate}
              onChange={(e) => setTxnTaxRate && setTxnTaxRate(e.target.value)}
              placeholder="0%"
              className="h-8 w-20 rounded border border-slate-300 bg-white px-2 text-right text-xs outline-none focus:border-blue-500"
            />
            {Number(totals.txnTax || 0) > 0 && (
              <span className="font-semibold text-slate-700">+₹{totals.txnTax.toFixed(2)}</span>
            )}
          </div>
        )}
        {(() => {
          const isChargesEnabled = Boolean(appSettings.additionalChargesEnabled || appSettings.additionalChargesSetup?.enabled);
          const charge1 = appSettings.additionalChargesSetup?.charges?.[0] || { name: "Shipping / Freight" };
          const charge2 = appSettings.additionalChargesSetup?.charges?.[1] || { name: "Packaging Charges" };
          const charge3 = appSettings.additionalChargesSetup?.charges?.[2] || { name: "Other Charges" };

          return (
            <>
              {(isChargesEnabled || Number(additionalCharges?.shipping || 0) > 0) && (
                <div className="w-full flex justify-end items-center gap-3 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">{charge1.name || "Shipping / Freight"}:</span>
                  <input
                    type="number"
                    min="0"
                    value={additionalCharges?.shipping ?? ""}
                    onChange={(e) => setAdditionalCharges && setAdditionalCharges((prev) => ({ ...prev, shipping: Math.max(0, Number(e.target.value) || 0) }))}
                    placeholder="0.00"
                    className="h-8 w-28 rounded border border-slate-300 bg-white px-2 text-right text-xs outline-none focus:border-blue-500"
                  />
                </div>
              )}
              {(isChargesEnabled || Number(additionalCharges?.packaging || 0) > 0) && (
                <div className="w-full flex justify-end items-center gap-3 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">{charge2.name || "Packaging Charges"}:</span>
                  <input
                    type="number"
                    min="0"
                    value={additionalCharges?.packaging ?? ""}
                    onChange={(e) => setAdditionalCharges && setAdditionalCharges((prev) => ({ ...prev, packaging: Math.max(0, Number(e.target.value) || 0) }))}
                    placeholder="0.00"
                    className="h-8 w-28 rounded border border-slate-300 bg-white px-2 text-right text-xs outline-none focus:border-blue-500"
                  />
                </div>
              )}
              {(isChargesEnabled || Number(additionalCharges?.other || 0) > 0) && (
                <div className="w-full flex justify-end items-center gap-3 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">{charge3.name || "Other Charges"}:</span>
                  <input
                    type="number"
                    min="0"
                    value={additionalCharges?.other ?? ""}
                    onChange={(e) => setAdditionalCharges && setAdditionalCharges((prev) => ({ ...prev, other: Math.max(0, Number(e.target.value) || 0) }))}
                    placeholder="0.00"
                    className="h-8 w-28 rounded border border-slate-300 bg-white px-2 text-right text-xs outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </>
          );
        })()}
        <label className="flex items-center gap-2 text-[13px] text-slate-500">
          <input type="checkbox" checked={roundOff} onChange={(event) => setRoundOff(event.target.checked)} className="h-4 w-4 accent-blue-600" />
          Round Off
        </label>
        <input inputMode="decimal" value={displayedRoundOff} onChange={(event) => setRoundOffValue(sanitizeDecimal(event.target.value, true))} className="h-9 w-20 rounded-md border border-slate-300 px-2 text-[13px] outline-none focus:border-blue-500" />
        {totals.cess > 0 && (
          <div className="w-full flex justify-end items-center gap-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Cess Total:</span>
            <span className="font-bold text-slate-800">₹{totals.cess.toFixed(2)}</span>
          </div>
        )}
        {appSettings.enableTcs && totals.tcsAmount > 0 && (
          <div className="w-full flex justify-end items-center gap-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">TCS ({appSettings.tcsRate || 0.1}%):</span>
            <span className="font-bold text-slate-900">+₹{totals.tcsAmount.toFixed(2)}</span>
          </div>
        )}
        {appSettings.enableTds && totals.tdsAmount > 0 && (
          <div className="w-full flex justify-end items-center gap-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">TDS Deductible ({appSettings.tdsRate || 0.1}%):</span>
            <span className="font-bold text-rose-600">-₹{totals.tdsAmount.toFixed(2)}</span>
          </div>
        )}
        <span className="text-sm font-bold text-slate-700">Total</span>
        <input readOnly value={totals.finalTotal.toFixed(2)} className="h-10 w-full max-w-56 rounded-md border border-slate-300 bg-white px-3 text-right text-[13px] font-bold outline-none" />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <input type="checkbox" checked={receivedEnabled} onChange={(event) => { const checked = event.target.checked; setReceivedEnabled(checked); setReceivedAmount(checked ? totals.finalTotal.toFixed(2) : ""); }} className="h-4 w-4 accent-blue-600" />
        <span className="text-sm font-bold text-slate-700">Received</span>
        <input inputMode="decimal" disabled={!receivedEnabled} value={receivedAmount} onChange={(event) => setReceivedAmount(sanitizeDecimal(event.target.value))} className="h-10 w-full max-w-56 rounded-md border border-slate-300 bg-white px-3 text-right text-[13px] outline-none disabled:bg-slate-100" />
        {error && <span role="alert" className="text-xs font-medium text-rose-600">{error}</span>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-2 text-xs">
        <div className="flex items-center gap-3">
          {appSettings.enableItemCount && (
            <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">
              {appSettings.itemCountLabel || "Count"}: {rowCount}
            </span>
          )}
          {appSettings.showProfitWhileMakingSaleInvoice && totals.finalTotal > 0 && (
            <span className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
              Gross Profit: ₹{(totals.finalTotal * 0.22).toFixed(2)} (22%)
            </span>
          )}
        </div>
        <div className="flex items-center gap-7 text-sm font-bold text-slate-700">
          <span>Balance</span>
          <span>{totals.balance.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// Renders the share menu interface.
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

// Renders the settings drawer interface with full live reactivity and sub-settings panels
function SettingsDrawer({ appSettings, onUpdateSettings, additionalCharges, setAdditionalCharges, onClose }) {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState("main"); // "main" | "addFields" | "additionalCharges" | "printSettings"

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (activeView !== "main") setActiveView("main");
        else onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, activeView]);

  const prefixEnabled = Boolean(appSettings.salePrefixEnabled || (appSettings.salePrefix && appSettings.salePrefix !== "None"));
  const prefixText = appSettings.salePrefixText || (appSettings.salePrefix && appSettings.salePrefix !== "None" ? appSettings.salePrefix : "INV-");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55" onClick={onClose}>
      <aside className="h-full w-full max-w-sm bg-white shadow-2xl flex flex-col" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 shrink-0 bg-white">
          {activeView === "main" ? (
            <h2 className="text-lg font-bold text-slate-950">Settings</h2>
          ) : (
            <button
              type="button"
              onClick={() => setActiveView("main")}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              <FiChevronLeft className="h-4 w-4" /> Back to Settings
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><FiX className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {activeView === "main" && (
            <div className="space-y-1">
              {/* 1. Sale Prefix */}
              <div className="rounded-lg p-2.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between gap-3 text-[13px] text-slate-800">
                  <span className="font-medium">Sale Prefix</span>
                  <input
                    type="checkbox"
                    checked={prefixEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      onUpdateSettings({
                        salePrefixEnabled: enabled,
                        salePrefix: enabled ? prefixText : "None",
                      });
                    }}
                    className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>
                {prefixEnabled && (
                  <div className="mt-2.5 flex items-center gap-2 pl-1">
                    <span className="text-xs text-slate-500">Prefix text:</span>
                    <input
                      type="text"
                      value={prefixText}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        onUpdateSettings({
                          salePrefixEnabled: true,
                          salePrefixText: val,
                          salePrefix: val || "INV-",
                        });
                      }}
                      placeholder="INV-"
                      className="h-7 w-28 rounded border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 uppercase outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* 2. Transaction Message */}
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg p-2.5 text-[13px] text-slate-800 hover:bg-slate-50 transition-colors">
                <div>
                  <span className="font-medium">Transaction Message</span>
                  <p className="text-[11px] text-slate-400">Auto-prompt WhatsApp summary on save</p>
                </div>
                <input
                  type="checkbox"
                  checked={appSettings.txnMsgAutoSales ?? true}
                  onChange={(e) => onUpdateSettings({ txnMsgAutoSales: e.target.checked, txnMsgSendToParty: e.target.checked })}
                  className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* 3. Add fields to invoice */}
              <button
                type="button"
                onClick={() => setActiveView("addFields")}
                className="flex w-full min-h-11 items-center justify-between gap-3 rounded-lg p-2.5 text-left text-[13px] text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <span className="font-medium">Add fields to invoice</span>
                  <p className="text-[11px] text-slate-400">PO Ref, Vehicle No, Driver Name, E-way</p>
                </div>
                <FiChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              {/* 4. Quick Entry */}
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg p-2.5 text-[13px] text-slate-800 hover:bg-slate-50 transition-colors">
                <div>
                  <span className="font-medium">Quick Entry</span>
                  <p className="text-[11px] text-slate-400">Auto-add items & scanner fast mode</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(appSettings.enableQuickEntry)}
                  onChange={(e) => onUpdateSettings({ enableQuickEntry: e.target.checked })}
                  className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* 5. Due dates & payment terms */}
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg p-2.5 text-[13px] text-slate-800 hover:bg-slate-50 transition-colors">
                <div>
                  <span className="font-medium">Due dates & payment terms</span>
                  <p className="text-[11px] text-slate-400">Credit period (Net 15, Net 30, etc.)</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(appSettings.dueDatesAndPaymentTerms)}
                  onChange={(e) => onUpdateSettings({ dueDatesAndPaymentTerms: e.target.checked })}
                  className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* 6. Additional charges */}
              <button
                type="button"
                onClick={() => setActiveView("additionalCharges")}
                className="flex w-full min-h-11 items-center justify-between gap-3 rounded-lg p-2.5 text-left text-[13px] text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <span className="font-medium">Additional charges</span>
                  <p className="text-[11px] text-slate-400">Shipping, Packaging & other fees</p>
                </div>
                <FiChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              {/* 7. Print Settings */}
              <button
                type="button"
                onClick={() => setActiveView("printSettings")}
                className="flex w-full min-h-11 items-center justify-between gap-3 rounded-lg p-2.5 text-left text-[13px] text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <span className="font-medium">Print Settings</span>
                  <p className="text-[11px] text-slate-400">Paper size, theme color, logo & terms</p>
                </div>
                <FiChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              {/* 8. Billing Type */}
              <div className="border-t border-slate-100 pt-3 mt-2 px-2.5">
                <p className="mb-2 text-sm font-semibold text-slate-800">Billing Type</p>
                {["Lite Sale", "Full Sale"].map((type) => (
                  <label key={type} className="mb-2 flex items-center gap-2.5 text-[13px] text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="billingType"
                      checked={(appSettings.billingType || "Full Sale") === type}
                      onChange={() => onUpdateSettings({ billingType: type })}
                      className="h-4 w-4 accent-blue-600 cursor-pointer"
                    />
                    <div>
                      <span className="font-medium">{type}</span>
                      <p className="text-[11px] text-slate-400">
                        {type === "Lite Sale" ? "Fast counter sale (essential columns only)" : "Complete GST tax invoice with full details"}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Sub-view: Add fields to invoice */}
          {activeView === "addFields" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Custom Invoice Fields</h3>
              <p className="text-xs text-slate-500">Toggle custom metadata fields to display on the invoice header.</p>
              
              <div className="space-y-3 pt-2">
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                  <div>
                    <span className="text-[13px] font-semibold text-slate-800 block">Customer PO Details</span>
                    <span className="text-[11px] text-slate-500">PO Number and PO Date</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(appSettings.customerPoDetails)}
                    onChange={(e) => onUpdateSettings({ customerPoDetails: e.target.checked })}
                    className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                  <div>
                    <span className="text-[13px] font-semibold text-slate-800 block">Vehicle Number</span>
                    <span className="text-[11px] text-slate-500">Transport vehicle registration number</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(appSettings.additionalFieldsSetup?.txnField1?.enabled)}
                    onChange={(e) =>
                      onUpdateSettings({
                        additionalFieldsSetup: {
                          ...appSettings.additionalFieldsSetup,
                          txnField1: {
                            ...appSettings.additionalFieldsSetup?.txnField1,
                            enabled: e.target.checked,
                            name: "Vehicle No",
                          },
                        },
                      })
                    }
                    className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                  <div>
                    <span className="text-[13px] font-semibold text-slate-800 block">Driver Name</span>
                    <span className="text-[11px] text-slate-500">Delivery driver / courier handler name</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(appSettings.additionalFieldsSetup?.txnField2?.enabled)}
                    onChange={(e) =>
                      onUpdateSettings({
                        additionalFieldsSetup: {
                          ...appSettings.additionalFieldsSetup,
                          txnField2: {
                            ...appSettings.additionalFieldsSetup?.txnField2,
                            enabled: e.target.checked,
                            name: "Driver Name",
                          },
                        },
                      })
                    }
                    className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                  <div>
                    <span className="text-[13px] font-semibold text-slate-800 block">E-way Bill No.</span>
                    <span className="text-[11px] text-slate-500">Government 12-digit E-way bill number</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(appSettings.enableEwayBillNo)}
                    onChange={(e) => onUpdateSettings({ enableEwayBillNo: e.target.checked })}
                    className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Sub-view: Additional charges */}
          {activeView === "additionalCharges" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Additional Charges</h3>
              <p className="text-xs text-slate-500">Enable and configure extra shipping or packaging fees added to invoice total.</p>

              <label className="flex items-center justify-between gap-3 rounded-lg bg-blue-50 p-3 border border-blue-200 cursor-pointer">
                <div>
                  <span className="text-[13px] font-bold text-blue-900 block">Enable Additional Charges</span>
                  <span className="text-[11px] text-blue-700">Display additional charge lines in bill totals</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(appSettings.additionalChargesEnabled)}
                  onChange={(e) => onUpdateSettings({ additionalChargesEnabled: e.target.checked })}
                  className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>

              <div className="space-y-3 pt-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Shipping / Freight (₹)</span>
                    <input
                      type="number"
                      min="0"
                      value={additionalCharges?.shipping || ""}
                      onChange={(e) => setAdditionalCharges((prev) => ({ ...prev, shipping: Math.max(0, Number(e.target.value) || 0) }))}
                      placeholder="0.00"
                      className="h-8 w-28 rounded border border-slate-300 px-2 text-right text-xs outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Packaging Charges (₹)</span>
                    <input
                      type="number"
                      min="0"
                      value={additionalCharges?.packaging || ""}
                      onChange={(e) => setAdditionalCharges((prev) => ({ ...prev, packaging: Math.max(0, Number(e.target.value) || 0) }))}
                      placeholder="0.00"
                      className="h-8 w-28 rounded border border-slate-300 px-2 text-right text-xs outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Other / Insurance (₹)</span>
                    <input
                      type="number"
                      min="0"
                      value={additionalCharges?.other || ""}
                      onChange={(e) => setAdditionalCharges((prev) => ({ ...prev, other: Math.max(0, Number(e.target.value) || 0) }))}
                      placeholder="0.00"
                      className="h-8 w-28 rounded border border-slate-300 px-2 text-right text-xs outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-view: Print Settings */}
          {activeView === "printSettings" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Print Preferences</h3>
              <p className="text-xs text-slate-500">Configure paper size, colors, and headers for printed invoices.</p>

              <div className="space-y-3 pt-2">
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-700">Paper Size</span>
                  <select
                    value={appSettings.printPaperSize || "A4"}
                    onChange={(e) => onUpdateSettings({ printPaperSize: e.target.value })}
                    className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-xs outline-none focus:border-blue-500"
                  >
                    <option value="A4">A4 (Standard Sheet)</option>
                    <option value="A5">A5 (Half Page)</option>
                    <option value="Thermal">Thermal (3-inch / 80mm)</option>
                  </select>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Theme Color</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: "Navy Blue", color: "#1e3a8a" },
                      { name: "Emerald", color: "#047857" },
                      { name: "Indigo", color: "#4338ca" },
                      { name: "Burgundy", color: "#881337" },
                      { name: "Rose Red", color: "#b91c1c" },
                      { name: "Slate", color: "#334155" },
                    ].map((palette) => (
                      <button
                        key={palette.color}
                        type="button"
                        onClick={() => onUpdateSettings({ themeColor: palette.color })}
                        style={{ backgroundColor: palette.color }}
                        title={palette.name}
                        className={`h-7 w-7 rounded-full border-2 transition-transform ${appSettings.themeColor === palette.color ? "border-slate-900 scale-110 shadow-md ring-2 ring-blue-400" : "border-white"}`}
                      />
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                  <div>
                    <span className="text-[13px] font-semibold text-slate-800 block">Show Company Logo</span>
                    <span className="text-[11px] text-slate-500">Print business logo in invoice header</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={appSettings.printCompanyLogo ?? true}
                    onChange={(e) => onUpdateSettings({ printCompanyLogo: e.target.checked })}
                    className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                  <div>
                    <span className="text-[13px] font-semibold text-slate-800 block">Terms & Conditions</span>
                    <span className="text-[11px] text-slate-500">Print return policy and terms at footer</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={appSettings.enableTermsAndConditions ?? true}
                    onChange={(e) => onUpdateSettings({ enableTermsAndConditions: e.target.checked })}
                    className="h-4 w-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate("/settings?tab=print");
                  }}
                  className="mt-2 block w-full rounded-md border border-slate-200 bg-slate-50 py-2 text-center text-xs font-semibold text-blue-600 hover:bg-blue-50"
                >
                  Open Full Print Settings →
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate("/settings?tab=transaction");
            }}
            className="flex w-full items-center justify-center gap-2 text-[13px] font-bold text-blue-600 hover:underline cursor-pointer"
          >
            <FiSettings /> More Settings
          </button>
        </footer>
      </aside>
    </div>
  );
}

// Renders the business modal interface.
function BusinessModal({ mode, business, setBusiness, onClose }) {
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState("");
  const [firmTab, setFirmTab] = useState("business");
  const logoInputRef = useRef(null);
  const sigInputRef = useRef(null);

  useEffect(() => {
    // Handles key down.
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Sets business field.
  const setBusinessField = (field, value) => {
    setBusiness((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  // Saves result.
  const save = () => {
    const isGstinEnabled = getAppSettings().enableGstin !== false;
    const nextErrors = {};
    if (!business.name.trim()) nextErrors.name = "Business Name is required";
    if (isGstinEnabled) {
      if (!business.gstin.trim()) {
        nextErrors.gstin = "Please Enter GSTIN";
      } else {
        const gstinVal = validateGstin(business.gstin);
        if (!gstinVal.valid) {
          nextErrors.gstin = gstinVal.error;
        }
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSuccess(`${mode} details saved for demo.`);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setBusinessField("logo", reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSigUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setBusinessField("signature", reader.result);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <Card className="max-h-[86vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{mode === "Generate E-Way Bill" ? "E-Way Bill Details" : "Edit Firm"}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><FiX className="h-5 w-5" /></button>
        </header>
        {isGstinEnabled && (
          <div className="mb-5 rounded-md border border-rose-300 bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700">
            Please fill in the GSTIN to continue generating the e-Invoice/E-Way Bill.
          </div>
        )}
        {success && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] font-semibold text-emerald-700">{success}</div>}
        <div className="grid gap-5 md:grid-cols-[260px_1fr]">
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          <button type="button" onClick={() => logoInputRef.current?.click()} className="flex h-28 w-28 items-center justify-center justify-self-center overflow-hidden rounded-lg border border-dashed border-slate-300 text-base font-semibold text-slate-400 hover:border-blue-400 hover:text-blue-600">
            {business.logo ? <img src={business.logo} alt="Logo" className="h-full w-full object-contain" /> : "Add Logo"}
          </button>
          <div className="grid gap-3">
            <label><span className="mb-1 block text-xs text-slate-500">Business Name *</span><TextInput error={errors.name} value={business.name} onChange={(event) => setBusinessField("name", event.target.value)} /></label>
            {isGstinEnabled && (
              <label><span className="mb-1 block text-xs text-blue-600">GSTIN</span><TextInput error={errors.gstin} value={business.gstin} onChange={(event) => setBusinessField("gstin", event.target.value)} />{errors.gstin && <span className="mt-1 block text-xs text-rose-600">{errors.gstin}</span>}</label>
            )}
            <label><span className="mb-1 block text-xs text-slate-500">Phone No.</span><TextInput value={business.phone} onChange={(event) => setBusinessField("phone", event.target.value.slice(0, 30))} /></label>
            <TextInput value={business.email} onChange={(event) => setBusinessField("email", event.target.value)} placeholder="Email ID" />
          </div>
        </div>
        <div className="mt-5 border-b border-slate-200 flex gap-2">
          <button type="button" onClick={() => setFirmTab("business")} className={`px-4 py-2.5 text-[13px] font-bold ${firmTab === "business" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400 hover:text-slate-600"}`}>Business Details</button>
          <button type="button" onClick={() => setFirmTab("additional")} className={`px-4 py-2.5 text-[13px] font-bold ${firmTab === "additional" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400 hover:text-slate-600"}`}>Additional Fields</button>
        </div>
        {firmTab === "business" ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextArea value={business.address} onChange={(event) => setBusinessField("address", event.target.value)} placeholder="Business Address" className="h-24" />
            <label><span className="mb-1 block text-xs text-slate-500">Business Type</span><SelectInput value={business.type} onChange={(value) => setBusinessField("type", value)} options={["None", "Retail", "Wholesale", "Service"]} /></label>
            <TextInput value={business.pincode} onChange={(event) => setBusinessField("pincode", event.target.value)} placeholder="Pincode" />
            <TextInput value={business.category} onChange={(event) => setBusinessField("category", event.target.value)} placeholder="Business Category" />
            <label><span className="mb-1 block text-xs text-slate-500">State</span><SelectInput value={business.state} onChange={(value) => setBusinessField("state", value)} options={stateOfSupplyOptions} /></label>
            <div>
              <input ref={sigInputRef} type="file" accept="image/*" className="hidden" onChange={handleSigUpload} />
              <button type="button" onClick={() => sigInputRef.current?.click()} className="flex h-20 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 text-[13px] text-slate-400 hover:border-blue-400 hover:text-blue-600">
                {business.signature ? <img src={business.signature} alt="Signature" className="h-full w-full object-contain" /> : "Add Signature"}
              </button>
            </div>
            <TextInput value={business.description} onChange={(event) => setBusinessField("description", event.target.value.slice(0, 160))} placeholder="Business Description" />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <TextInput value={business.upiId || ""} onChange={(e) => setBusinessField("upiId", e.target.value)} placeholder="UPI ID (e.g. business@upi)" />
            <TextInput value={business.bankAccount || ""} onChange={(e) => setBusinessField("bankAccount", e.target.value)} placeholder="Default Bank Account" />
            <TextArea value={business.terms || ""} onChange={(e) => setBusinessField("terms", e.target.value)} placeholder="Default Terms & Conditions" className="h-24" />
          </div>
        )}
        <footer className="mt-5 flex justify-end">
          <Button onClick={save} className="rounded-md bg-blue-600 px-9 py-2 text-[13px] text-white hover:bg-blue-700">Save</Button>
        </footer>
      </Card>
    </div>
  );
}

// Renders the add sale interface.
function AddSale({ mode = "sale", localOnly = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const config = transactionConfigs[mode] || transactionConfigs.sale;
  const isPurchase = config.type === "purchase";
  const purchaseOrderConversion = isPurchase ? location.state?.purchaseOrderConversion || null : null;
  const quotationConversion = !isPurchase ? location.state?.quotationConversion || location.state?.proformaConversion || null : null;
  const saleOrderConversions = !isPurchase ? location.state?.saleOrdersConversion || [] : [];
  const saleOrderConversion = saleOrderConversions[0] || null;
  const conversionItems = location.state?.conversionItems || null;
  const deliveryChallanConversions = !isPurchase ? location.state?.deliveryChallansConversion || [] : [];
  const deliveryChallanConversion = deliveryChallanConversions[0] || null;
  const conversionStorageKey = location.state?.proformaConversion ? "ledgerly:proformaInvoices.v1" : "ledgerly:estimateQuotations.v1";
  const editInvoice = isPurchase
    ? (location.state?.editPurchase || location.state?.editBill || location.state?.editInvoice || null)
    : (location.state?.editInvoice || location.state?.editSale || null);
  const localOnlyPurchase = isPurchase && (localOnly || location.state?.localOnlyPurchase);
  const onlineOrderConversion = !isPurchase ? location.state?.onlineOrderConversion : null;
  const returnPath = typeof location.state?.from === "string" && location.state.from !== location.pathname ? location.state.from : config.backPath;
  const [tabs, setTabs] = useState([{ id: `${config.type}-1`, label: `${config.tabPrefix} #1` }]);
  const [activeTab, setActiveTab] = useState(`${config.type}-1`);
  const [saleType, setSaleType] = useState(() => {
    if (editInvoice?.saleType) return editInvoice.saleType;
    const mode = String(editInvoice?.paymentMode || editInvoice?.paymentType || editInvoice?.form?.paymentType || "").toLowerCase();
    if (mode === "cash") return "cash";
    return "credit";
  });
  const [rows, setRows] = useState(() => {
    const editRows = normalizeEditRows(editInvoice);
    if (editRows.length) return editRows;
    if (conversionItems?.length) {
      const inventory = getInventoryItems();
      return conversionItems.map((ci) => {
        const matched = inventory.find((i) =>
          (ci.itemId && i.id === ci.itemId) ||
          (ci.sourceItemId && i.id === ci.sourceItemId) ||
          (ci.item && String(i.itemName || "").trim().toLowerCase() === String(ci.item).trim().toLowerCase())
        );
        const resolvedId = matched?.id || ci.itemId || ci.sourceItemId || "";
        const isBatchTracked = isItemBatchTracked(matched);
        return {
          ...createRow(),
          item: ci.item || "",
          description: ci.description || "",
          qty: String(ci.qty ?? ""),
          unit: ci.unit || "",
          price: String(ci.price ?? ""),
          priceMode: "Without Tax",
          discountMode: ci.discountType === "amount" ? "amount" : "percent",
          discountPercent: ci.discountType === "amount" ? "" : String(ci.discount ?? ""),
          discountAmount: ci.discountType === "amount" ? String(ci.discount ?? "") : "",
          taxRate: ci.tax && ci.tax !== "NONE" ? String(ci.tax) : "NONE",
          cessPercent: String(ci.cess ?? ""),
          sourceItemId: resolvedId,
          sourceOrderId: ci.sourceOrderId || "",
          sourceOrderNumber: ci.sourceOrderNumber || "",
          sourceOrderRowId: ci.sourceOrderRowId || "",
          maxConvertibleQty: ci.maxConvertibleQty != null ? Number(ci.maxConvertibleQty) : null,
          batchNo: isBatchTracked ? (ci.batchNo || "") : "",
          expDate: isBatchTracked ? (ci.expDate || "") : "",
        };
      });
    }
    if (purchaseOrderConversion?.rows?.length) {
      const inventory = getInventoryItems();
      const activeRows = purchaseOrderConversion.rows.filter((row) => {
        const rem = row.remainingQty != null ? Number(row.remainingQty) : Math.max(0, Number(row.orderedQty ?? row.qty ?? 0) - Number(row.convertedQty || 0));
        return rem > 0;
      });
      const rowsToUse = activeRows.length ? activeRows : purchaseOrderConversion.rows;
      return rowsToUse.map((row) => {
        const rem = row.remainingQty != null ? Number(row.remainingQty) : Math.max(0, Number(row.orderedQty ?? row.qty ?? 0) - Number(row.convertedQty || 0));
        const matched = inventory.find((i) =>
          (row.itemId && i.id === row.itemId) ||
          (row.sourceItemId && i.id === row.sourceItemId) ||
          (row.item && String(i.itemName || "").trim().toLowerCase() === String(row.item).trim().toLowerCase())
        );
        const resolvedId = matched?.id || row.itemId || row.sourceItemId || "";
        const isBatchTracked = isItemBatchTracked(matched);
        return {
          ...createRow(),
          item: row.item || "",
          description: row.description || "",
          qty: String(rem > 0 ? rem : row.qty ?? ""),
          unit: row.unit || "",
          price: String(row.price ?? ""),
          priceMode: "Without Tax",
          discountMode: row.discountType === "amount" ? "amount" : "percent",
          discountPercent: row.discountType === "amount" ? "" : String(row.discount ?? ""),
          discountAmount: row.discountType === "amount" ? String(row.discount ?? "") : "",
          taxRate: row.tax && row.tax !== "NONE" ? String(row.tax) : "NONE",
          cessPercent: String(row.cess ?? ""),
          sourceItemId: resolvedId,
          sourceOrderId: purchaseOrderConversion.id,
          sourceOrderNumber: purchaseOrderConversion.number,
          sourceOrderRowId: row.id,
          maxConvertibleQty: rem,
          batchNo: isBatchTracked ? (row.batchNo || "") : "",
          expDate: isBatchTracked ? (row.expDate || "") : "",
        };
      });
    }
    if (quotationConversion?.rows?.length) return quotationConversion.rows.map((row) => ({ ...createRow(), ...row, priceMode: row.priceMode || "Without Tax" }));
    if (saleOrderConversions.some((order) => order.rows?.length)) {
      const inventory = getInventoryItems();
      return saleOrderConversions.flatMap((order) => {
        const activeRows = (order.rows || []).filter((row) => {
          const rem = row.remainingQty != null ? Number(row.remainingQty) : Math.max(0, Number(row.orderedQty ?? row.qty ?? 0) - Number(row.convertedQty || 0));
          return rem > 0;
        });
        const rowsToUse = activeRows.length ? activeRows : (order.rows || []);
        return rowsToUse.map((row) => {
          const rem = row.remainingQty != null ? Number(row.remainingQty) : Math.max(0, Number(row.orderedQty ?? row.qty ?? 0) - Number(row.convertedQty || 0));
          const matched = inventory.find((i) =>
            (row.itemId && i.id === row.itemId) ||
            (row.sourceItemId && i.id === row.sourceItemId) ||
            (row.item && String(i.itemName || "").trim().toLowerCase() === String(row.item).trim().toLowerCase())
          );
          const resolvedId = matched?.id || row.itemId || row.sourceItemId || "";
          const isBatchTracked = isItemBatchTracked(matched);
          return {
            ...createRow(),
            item: row.item || "",
            description: row.description || "",
            qty: String(rem > 0 ? rem : row.qty ?? ""),
            unit: row.unit || "",
            price: String(row.price ?? ""),
            priceMode: "Without Tax",
            discountMode: row.discountType === "amount" ? "amount" : "percent",
            discountPercent: row.discountType === "amount" ? "" : String(row.discount ?? ""),
            discountAmount: row.discountType === "amount" ? String(row.discount ?? "") : "",
            taxRate: row.tax && row.tax !== "NONE" ? String(row.tax) : "NONE",
            cessPercent: String(row.cess ?? ""),
            sourceItemId: resolvedId,
            sourceOrderId: order.id,
            sourceOrderNumber: order.number,
            sourceOrderRowId: row.id,
            maxConvertibleQty: rem,
            batchNo: isBatchTracked ? (row.batchNo || "") : "",
            expDate: isBatchTracked ? (row.expDate || "") : "",
          };
        });
      });
    }
    if (deliveryChallanConversions.some((challan) => challan.rows?.length)) return deliveryChallanConversions.flatMap((challan) => (challan.rows || []).map((row) => ({ ...createRow(), ...row, priceMode: row.priceMode || "Without Tax" })));
    if (!onlineOrderConversion?.items?.length) return [createRow(), createRow()];
    return onlineOrderConversion.items.map(createRowFromOrderItem);
  });
  const [items, setItems] = useState(() => (quotationConversion || saleOrderConversions.length || deliveryChallanConversions.length || conversionItems?.length) ? getInventoryItems().map(saleItemFromInventory) : []);
  const [parties, setParties] = useState(() => getParties().map(partyOption).filter((party) => party.name));
  const [addItemRowId, setAddItemRowId] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [businessMode, setBusinessMode] = useState("");
  const [roundOff, setRoundOff] = useState(true);
  const [roundOffValue, setRoundOffValue] = useState(() => {
    const raw = editInvoice?.totals?.roundOffAmount ?? editInvoice?.roundOff ?? editInvoice?.round_off;
    return raw != null && raw !== 0 && raw !== "0" ? String(raw) : "";
  });
  const [receivedEnabled, setReceivedEnabled] = useState(() => {
    const raw = editInvoice?.totals?.received ?? editInvoice?.receivedAmount ?? editInvoice?.paidAmount ?? editInvoice?.paid;
    return Number(raw || 0) > 0;
  });
  const [receivedAmount, setReceivedAmount] = useState(() => {
    const raw = editInvoice?.totals?.received ?? editInvoice?.receivedAmount ?? editInvoice?.paidAmount ?? editInvoice?.paid;
    return raw != null && raw !== "" ? String(raw) : "";
  });
  const [additionalCharges, setAdditionalCharges] = useState(() => {
    if (editInvoice?.additionalCharges) return editInvoice.additionalCharges;
    return {
      shipping: Number(editInvoice?.shippingCharges ?? editInvoice?.shipping_charges ?? 0),
      packaging: Number(editInvoice?.packagingCharges ?? editInvoice?.packaging_charges ?? 0),
      other: Number(editInvoice?.otherCharges ?? editInvoice?.other_charges ?? 0),
    };
  });
  const [txnDiscount, setTxnDiscount] = useState(() => {
    const raw = editInvoice?.totals?.txnDiscount ?? editInvoice?.txnDiscount;
    return raw != null && raw !== "" && Number(raw) > 0 ? String(raw) : "";
  });
  const [txnTaxRate, setTxnTaxRate] = useState(() => {
    const raw = editInvoice?.totals?.txnTaxRate ?? editInvoice?.txnTaxRate;
    return raw != null && raw !== "" && Number(raw) > 0 ? String(raw) : "";
  });
  const [billingType, setBillingType] = useState("Full Sale");
  const [transactionId, setTransactionId] = useState(() => editInvoice?.id || editInvoice?.invoiceId || crypto.randomUUID());
  const [files, setFiles] = useState(() => {
    if (editInvoice?.files) return editInvoice.files;
    return {
      image: editInvoice?.image || editInvoice?.image_url || "",
      document: editInvoice?.document || editInvoice?.document_url || "",
      imageName: editInvoice?.imageName || editInvoice?.image_name || "",
      documentName: editInvoice?.documentName || editInvoice?.document_name || "",
    };
  });
  const [toast, setToast] = useState("");
  const [errors, setErrors] = useState({ rows: {} });
  const [termsTemplates, setTermsTemplates] = useState(defaultTerms);
  const [appSettings, setAppSettings] = useState(getAppSettings);
  useEffect(() => {
    const handleUpdate = (e) => setAppSettings(e.detail || getAppSettings());
    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, handleUpdate);
  }, []);
  const [business, setBusiness] = useState(() => editInvoice?.business || initialBusiness);
  const shareRef = useRef(null);
  const [settings, setSettings] = useState(Object.fromEntries(saleSettings.filter((item) => item.type === "checkbox").map((item) => [item.id, item.enabled])));
  const [form, setForm] = useState(() => {
    const baseFallback = {
      customer: purchaseOrderConversion?.supplier || purchaseOrderConversion?.partyName || purchaseOrderConversion?.party || purchaseOrderConversion?.customer || quotationConversion?.customer || saleOrderConversion?.customer || deliveryChallanConversion?.party || onlineOrderConversion?.customerName || (getAppSettings().cashSaleByDefault ? "Cash Sale" : ""),
      phone: purchaseOrderConversion?.phone || purchaseOrderConversion?.partyPhone || quotationConversion?.phone || saleOrderConversion?.phone || deliveryChallanConversion?.phone || onlineOrderConversion?.mobile || onlineOrderConversion?.mobileNumber || "",
      billingAddress: quotationConversion?.billingAddress || saleOrderConversion?.billingAddress || deliveryChallanConversion?.billingAddress || onlineOrderConversion?.address || "",
      shippingAddress: quotationConversion?.billingAddress || saleOrderConversion?.billingAddress || deliveryChallanConversion?.billingAddress || onlineOrderConversion?.address || "",
      invoiceNumber: "1",
      invoiceDate: purchaseOrderConversion?.date || quotationConversion?.date || deliveryChallanConversion?.date || currentLocalDate(),
      stateOfSupply: purchaseOrderConversion?.state || quotationConversion?.state || deliveryChallanConversion?.state || "None",
      partyBalance: "",
      showTerms: false,
      termsTitle: "",
      terms: quotationConversion?.terms || (getAppSettings().enableTermsAndConditions ? (getAppSettings().termsAndConditions || "") : ""),
      showDescription: Boolean(purchaseOrderConversion || onlineOrderConversion || quotationConversion?.description || saleOrderConversion || deliveryChallanConversion),
      description: purchaseOrderConversion ? `Converted from Purchase Order ${purchaseOrderConversion.number}.` : quotationConversion?.description || (saleOrderConversion
        ? `Converted from Sale Order${saleOrderConversions.length > 1 ? "s" : ""} ${saleOrderConversions.map((order) => order.number).join(", ")}.`
        : deliveryChallanConversions.length
        ? `Converted from Delivery Challan${deliveryChallanConversions.length > 1 ? "s" : ""} ${deliveryChallanConversions.map((challan) => challan.number).join(", ")}. ${deliveryChallanConversion?.description || ""}`.trim()
        : onlineOrderConversion
        ? [`Converted from Online Order ${onlineOrderConversion.id}.`, orderAdditionalChargeNote(onlineOrderConversion)].filter(Boolean).join("\n")
        : ""),
      ewayBillNo: deliveryChallanConversion?.ewayBillNo || deliveryChallanConversion?.eWayBillNo || "",
      vehicleNumber: deliveryChallanConversion?.vehicleNumber || deliveryChallanConversion?.vehicleNo || (getAppSettings().transportationDetails?.vehicleNumber || ""),
      transporterName: deliveryChallanConversion?.transporterName || (getAppSettings().transportationDetails?.transporterName || ""),
      driverName: deliveryChallanConversion?.driverName || "",
      paymentType: "Cash",
    };
    return extractEditForm(editInvoice, baseFallback);
  });

  // If an edit invoice is loaded by ID, ensure all relational details and line items are fully hydrated from MySQL
  useEffect(() => {
    const targetId = editInvoice?.id || editInvoice?.invoiceId || editInvoice?._id;
    if (!targetId) return;
    let active = true;

    transactionsDb.getById(targetId)
      .then((fullDoc) => {
        if (!active || !fullDoc) return;
        setTransactionId(fullDoc.id || targetId);
        const mappedRows = normalizeEditRows(fullDoc);
        if (mappedRows.length > 0) {
          setRows(mappedRows);
        }
        setForm((current) => extractEditForm(fullDoc, current));
        if (fullDoc.paymentMode || fullDoc.paymentType) {
          setSaleType(String(fullDoc.paymentMode || fullDoc.paymentType).toLowerCase() === "cash" ? "cash" : "credit");
        }
        const rawRec = fullDoc.paidAmount ?? fullDoc.receivedAmount ?? fullDoc.totals?.received;
        if (rawRec != null && Number(rawRec) > 0) {
          setReceivedEnabled(true);
          setReceivedAmount(String(rawRec));
        }
        const rawRound = fullDoc.roundOff ?? fullDoc.round_off ?? fullDoc.totals?.roundOffAmount;
        if (rawRound != null && Number(rawRound) !== 0) {
          setRoundOffValue(String(rawRound));
        }
        if (fullDoc.files || fullDoc.image || fullDoc.document || fullDoc.image_url || fullDoc.document_url) {
          setFiles(fullDoc.files || {
            image: fullDoc.image || fullDoc.image_url || "",
            document: fullDoc.document || fullDoc.document_url || "",
            imageName: fullDoc.imageName || fullDoc.image_name || "",
            documentName: fullDoc.documentName || fullDoc.document_name || "",
          });
        }
        if (fullDoc.additionalCharges || fullDoc.shippingCharges != null || fullDoc.shipping_charges != null) {
          setAdditionalCharges(fullDoc.additionalCharges || {
            shipping: Number(fullDoc.shippingCharges ?? fullDoc.shipping_charges ?? 0),
            packaging: Number(fullDoc.packagingCharges ?? fullDoc.packaging_charges ?? 0),
            other: Number(fullDoc.otherCharges ?? fullDoc.other_charges ?? 0),
          });
        }
      })
      .catch((err) => console.warn("Could not load full transaction details from MySQL:", err.message));

    return () => { active = false; };
  }, [editInvoice?.id, editInvoice?.invoiceId]);

  useDismiss(shareOpen, shareRef, () => setShareOpen(false));

  useEffect(() => {
    let active = true;
    if (localOnlyPurchase) {
      setItems(getInventoryItems().map(saleItemFromInventory));
      setParties(getParties().map(partyOption).filter((party) => party.name));
      if (!editInvoice) setForm((current) => ({ ...current, invoiceNumber: String(getPurchaseBills().length + 1) }));
      return () => { active = false; };
    }
    if (quotationConversion || saleOrderConversions.length || deliveryChallanConversions.length) {
      setItems(getInventoryItems().map(saleItemFromInventory));
      return () => { active = false; };
    }
    loadBusinessItems()
      .then((records) => {
        if (active) setItems(records.map(saleItemFromInventory));
      })
      .catch((error) => {
        if (active) setToast(error.message || "Could not load items from MySQL.");
      });
    loadBusinessParties()
      .then((records) => {
        if (active) {
          const remoteParties = records.map(partyOption);
          const localParties = getParties().map(partyOption);
          const merged = new Map();
          [...remoteParties, ...localParties].filter((party) => party.name).forEach((party) => {
            const key = String(party.id || party.name).toLowerCase();
            merged.set(key, party);
          });
          setParties([...merged.values()]);
        }
      })
      .catch((error) => {
        if (active) setToast(error.message || "Could not load parties from MySQL.");
      });
    if (!editInvoice) (isPurchase ? nextPurchaseBillNumber() : nextSalesInvoiceNumber())
        .then((number) => {
          if (active) setForm((current) => ({ ...current, invoiceNumber: number }));
        })
        .catch((error) => {
          if (active) setToast(error.message || "Could not load invoice numbers from MySQL.");
        });
    return () => { active = false; };
  }, [isPurchase, localOnlyPurchase, editInvoice?.id, quotationConversion, deliveryChallanConversions.length]);

  useEffect(() => {
    const reloadLocalSelections = () => {
      setItems(getInventoryItems().map(saleItemFromInventory));
      setParties(getParties().map(partyOption).filter((party) => party.name));
    };
    window.addEventListener(businessDataChangedEvent, reloadLocalSelections);
    window.addEventListener("storage", reloadLocalSelections);
    return () => {
      window.removeEventListener(businessDataChangedEvent, reloadLocalSelections);
      window.removeEventListener("storage", reloadLocalSelections);
    };
  }, []);

  const totals = useMemo(
    () => calculateInvoiceTotals(rows, roundOff, roundOffValue, receivedEnabled ? receivedAmount : 0, additionalCharges, txnDiscount, txnTaxRate),
    [rows, roundOff, roundOffValue, receivedAmount, receivedEnabled, additionalCharges, txnDiscount, txnTaxRate]
  );
  const hasValidInvoiceItem = useMemo(() => rows.some((row) => row.item.trim() && toNumber(row.qty) > 0), [rows]);

  // Sets field.
  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "", rows: current.rows || {} }));
  };

  // Handles tab.
  const addTab = () => {
    const nextIndex = tabs.length + 1;
    const nextTab = { id: `${config.type}-${Date.now()}`, label: `${config.tabPrefix} #${nextIndex}` };
    setTabs((current) => [...current, nextTab]);
    setActiveTab(nextTab.id);
    setField("invoiceNumber", String(nextIndex));
  };

  // Closes tab.
  const closeTab = (id) => {
    if (tabs.length === 1) {
      navigate(returnPath);
      return;
    }
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    if (activeTab === id) setActiveTab(remaining[0].id);
  };

  // Validates result.
  const validate = () => {
    const nextErrors = { rows: {} };
    if ((isPurchase || saleType === "credit") && !form.customer.trim()) nextErrors.customer = isPurchase ? "Party is required" : "Customer is required";
    if (!form.invoiceNumber.trim()) nextErrors.invoiceNumber = `${config.numberLabel} is required`;

    const validRows = rows.filter((row) => row.item.trim() && toNumber(row.qty) > 0);
    if (!validRows.length) nextErrors.rows[rows[0].id] = { item: "Add at least one item" };

    const originalInvoiceItemIds = new Set(
      ((editInvoice?.items || editInvoice?.rows) || []).map((r) => String(r.sourceItemId || r.itemId || "").trim()).filter(Boolean)
    );
    const originalInvoiceItemNames = new Set(
      ((editInvoice?.items || editInvoice?.rows) || []).map((r) => String(r.item || r.name || r.itemName || "").trim().toLowerCase()).filter(Boolean)
    );

    rows.forEach((row) => {
      const rowErrors = {};
      const trimmedItem = (row.item || "").trim();
      if (trimmedItem) {
        const rowItemName = trimmedItem.toLowerCase();
        const matchedItem = items.find(
          (item) =>
            (row.sourceItemId && String(item.id) === String(row.sourceItemId)) ||
            (String(item.name || item.itemName || "").trim().toLowerCase() === rowItemName)
        );
        const isOriginalRow = editInvoice && (
          (row.sourceItemId && originalInvoiceItemIds.has(String(row.sourceItemId))) ||
          (row.itemId && originalInvoiceItemIds.has(String(row.itemId))) ||
          originalInvoiceItemNames.has(rowItemName)
        );
        if (matchedItem && (matchedItem.isActive === false || matchedItem.is_active === 0 || matchedItem.is_active === "0") && !isOriginalRow) {
          rowErrors.item = `"${matchedItem.name || trimmedItem}" is inactive and cannot be selected`;
        }
      }
      if (trimmedItem && toNumber(row.qty) <= 0) rowErrors.qty = "Qty is required";
      if (row.qty !== "" && toNumber(row.qty) < 0) rowErrors.qty = "Invalid qty";
      if (row.maxConvertibleQty != null && toNumber(row.qty) > Number(row.maxConvertibleQty)) {
        rowErrors.qty = `Cannot exceed remaining (${row.maxConvertibleQty})`;
      }
      if (row.price !== "" && toNumber(row.price) < 0) rowErrors.price = "Invalid price";
      if (row.discountPercent !== "" && (toNumber(row.discountPercent) < 0 || toNumber(row.discountPercent) > 100)) rowErrors.discountPercent = "Invalid discount";
      if (row.discountAmount !== "" && toNumber(row.discountAmount) < 0) rowErrors.discountAmount = "Invalid discount";

      // Wholesale minimum quantity validation
      if (!isPurchase && trimmedItem && toNumber(row.qty) > 0) {
        const matchedItem = items.find(
          (item) =>
            (row.sourceItemId && String(item.id) === String(row.sourceItemId)) ||
            (String(item.name || item.itemName || "").trim().toLowerCase() === trimmedItem)
        );
        const minWholesaleQty = Number(matchedItem?.minimumWholesaleQuantity || matchedItem?.wholesale?.minimumQty || 0);
        const itemWholesalePrice = Number(matchedItem?.wholesalePrice || matchedItem?.wholesale?.price || 0);
        if (itemWholesalePrice > 0 && Math.abs(toNumber(row.price) - itemWholesalePrice) < 0.01 && minWholesaleQty > 0 && toNumber(row.qty) < minWholesaleQty) {
          rowErrors.qty = `Min wholesale qty for ${matchedItem.name || trimmedItem} is ${minWholesaleQty}`;
        }
      }

      // Batch tracking validation for sales
      if (!isPurchase && appSettings.enableBatchTracking && row.item.trim() && toNumber(row.qty) > 0) {
        const matchedItem = items.find(
          (item) =>
            (row.sourceItemId && item.id === row.sourceItemId) ||
            (row.item && String(item.name || item.itemName || "").trim().toLowerCase() === String(row.item).trim().toLowerCase())
        );
        if (matchedItem && isItemBatchTracked(matchedItem)) {
          if (!(matchedItem.batches || []).length) {
            rowErrors.batchNo = `Batch tracking is enabled, but ${matchedItem.name || row.item} has no batch stock. Add stock with a batch before selling.`;
          } else if (!row.batchNo || !String(row.batchNo).trim()) {
            rowErrors.batchNo = `Select a valid batch for ${matchedItem.name || row.item}.`;
          } else {
            const batch = (matchedItem.batches || []).find(
              (b) => String(b.batchNo || "").trim().toLowerCase() === String(row.batchNo).trim().toLowerCase()
            );
            if (!batch) {
              rowErrors.batchNo = `Select a valid batch for ${matchedItem.name || row.item}.`;
            } else if (batch.expDate && batch.expDate < localDateOnly()) {
              rowErrors.batchNo = `Batch ${batch.batchNo} has expired.`;
            } else if (Number(batch.openingQty ?? batch.quantity ?? 0) < Number(row.qty)) {
              rowErrors.batchNo = `Batch ${batch.batchNo} has only ${batch.openingQty || 0} in stock.`;
            }
          }
        }
      }

      if (Object.keys(rowErrors).length) nextErrors.rows[row.id] = rowErrors;
    });

    if (receivedEnabled && toNumber(receivedAmount) > totals.finalTotal) {
      nextErrors.received = "Received amount cannot exceed the invoice total.";
    }

    setErrors(nextErrors);
    return !nextErrors.customer && !nextErrors.invoiceNumber && Object.keys(nextErrors.rows).length === 0;
  };

  // Builds invoice.
  const buildInvoice = () => {
    const isGenuineCash =
      saleType === "cash" &&
      (!form.customer || form.customer.trim().toLowerCase() === "cash sale");

    const resolvedParty = parties.find(
      (p) =>
        (form.partyId && String(p.id) === String(form.partyId)) ||
        (form.customer &&
          String(p.name || p.partyName || "").trim().toLowerCase() ===
            String(form.customer).trim().toLowerCase())
    );

    const finalPartyId = isGenuineCash ? null : (form.partyId || resolvedParty?.id || null);
    const finalPartyName = isGenuineCash
      ? "Cash Sale"
      : (form.customer || form.partyName || resolvedParty?.name || resolvedParty?.partyName || "");

    const activeRows = rows.filter((row) => String(row.item || "").trim() || Number(row.qty || 0) > 0 || Number(row.price || 0) > 0);
    const rowsToMap = activeRows.length > 0 ? activeRows : rows.slice(0, 1);

    const originalInvoiceItemIds = new Set(
      ((editInvoice?.items || editInvoice?.rows) || []).map((r) => String(r.sourceItemId || r.itemId || "").trim()).filter(Boolean)
    );
    const originalInvoiceItemNames = new Set(
      ((editInvoice?.items || editInvoice?.rows) || []).map((r) => String(r.item || r.name || r.itemName || "").trim().toLowerCase()).filter(Boolean)
    );

    const mappedRows = rowsToMap.map((row, index) => {
      const rowItemName = String(row.item || "").trim().toLowerCase();
      const isOriginalRow = editInvoice && (
        (row.sourceItemId && originalInvoiceItemIds.has(String(row.sourceItemId))) ||
        (row.itemId && originalInvoiceItemIds.has(String(row.itemId))) ||
        originalInvoiceItemNames.has(rowItemName)
      );
      const matchedItem = items.find(
        (i) => {
          const isMatch =
            (row.sourceItemId && String(i.id) === String(row.sourceItemId)) ||
            (row.item &&
              String(i.name || i.itemName || "").trim().toLowerCase() === rowItemName);
          if (!isMatch) return false;
          if (!isOriginalRow && (i.isActive === false || i.is_active === 0 || i.is_active === "0")) {
            return false;
          }
          return true;
        }
      );
      const resolvedItemId = row.sourceItemId || row.itemId || matchedItem?.id || "";
      const resolvedItemName = row.item || matchedItem?.name || matchedItem?.itemName || `Item ${index + 1}`;
      const calculated = calculateRow(row);
      const qtyNum = toNumber(row.qty);
      const priceNum = toNumber(row.price);

      return {
        ...row,
        index: index + 1,
        item: resolvedItemName,
        name: resolvedItemName,
        itemName: resolvedItemName,
        itemId: resolvedItemId,
        sourceItemId: resolvedItemId,
        qty: row.qty,
        quantity: qtyNum,
        price: row.price,
        unitPrice: priceNum,
        calculated,
      };
    });

    const prefix = (appSettings.salePrefixEnabled || (appSettings.salePrefix && appSettings.salePrefix !== "None"))
      ? (appSettings.salePrefixText || (appSettings.salePrefix !== "None" ? appSettings.salePrefix : "INV-"))
      : "";
    const rawNumber = form.invoiceNumber || "1";
    const docNumber = prefix && !rawNumber.startsWith(prefix) ? `${prefix}${rawNumber}` : rawNumber;
    const docDate = form.invoiceDate || currentLocalDate();
    const totalAmount = totals.finalTotal || totals.grandTotal || 0;
    const paidAmount = receivedEnabled
      ? (Number(receivedAmount) || 0)
      : (saleType === "cash" ? totalAmount : 0);
    const balanceAmount = Math.max(0, totalAmount - paidAmount);
    const paymentMode = form.paymentType || (saleType === "cash" ? "Cash" : "Credit");

    return {
      id: transactionId,
      saleType,
      transactionType: config.type,
      partyId: finalPartyId,
      partyName: finalPartyName,
      customer: finalPartyName,
      customerName: finalPartyName,
      phone: form.phone || resolvedParty?.phone || "",
      partyPhone: form.phone || resolvedParty?.phone || "",
      partyGstin: form.gstin || resolvedParty?.gstin || "",
      invoiceNumber: docNumber,
      documentNumber: docNumber,
      invoiceDate: docDate,
      transactionDate: docDate,
      date: docDate,
      dueDate: form.dueDate || null,
      paymentTerms: form.paymentTerms || "Due on Receipt",
      notes: form.description || "",
      description: form.description || "",
      terms: form.terms || "",
      termsTitle: form.termsTitle || "",
      transporterName: form.transporterName || appSettings.transportationDetails?.transporterName || "",
      vehicleNumber: form.vehicleNumber || form.txnField1 || "",
      vehicleNo: form.vehicleNumber || form.txnField1 || "",
      driverName: form.driverName || form.txnField2 || "",
      lrNumber: form.lrNumber || form.txnField3 || "",
      deliveryDate: form.deliveryDate || form.dateField || "",
      txnField1: form.txnField1 || form.vehicleNumber || "",
      txnField2: form.txnField2 || form.driverName || "",
      txnField3: form.txnField3 || form.lrNumber || "",
      dateField: form.dateField || form.deliveryDate || "",
      ewayBillNo: form.ewayBillNo || "",
      eWayBillNo: form.ewayBillNo || "",
      poNumber: form.poNumber || "",
      poDate: form.poDate || "",
      stateOfSupply: form.stateOfSupply || "None",
      reverseCharge: Boolean(form.reverseCharge),
      additionalCharges,
      shippingCharges: Number(additionalCharges?.shipping || 0),
      packagingCharges: Number(additionalCharges?.packaging || 0),
      otherCharges: Number(additionalCharges?.other || 0),
      image: files?.image || "",
      document: files?.document || "",
      imageName: files?.imageName || "",
      documentName: files?.documentName || "",
      imageUrl: files?.image || "",
      documentUrl: files?.document || "",
      billingAddress: form.billingAddress || resolvedParty?.billingAddress || resolvedParty?.address || "",
      shippingAddress: form.shippingAddress || form.billingAddress || "",
      paymentMode,
      paymentType: paymentMode,
      totalAmount,
      subtotal: totals.subtotal || totalAmount,
      paidAmount,
      balanceAmount,
      form: {
        ...form,
        customer: finalPartyName,
        partyId: finalPartyId,
        partyName: finalPartyName,
        invoiceNumber: docNumber,
        invoiceDate: docDate,
        paymentTerms: form.paymentTerms || "Due on Receipt",
        dueDate: form.dueDate || null,
        terms: form.terms || "",
        termsTitle: form.termsTitle || "",
        description: form.description || "",
        notes: form.description || "",
        showTerms: Boolean(form.terms),
        showDescription: Boolean(form.description),
        vehicleNumber: form.vehicleNumber || "",
        driverName: form.driverName || "",
        ewayBillNo: form.ewayBillNo || "",
        poNumber: form.poNumber || "",
        poDate: form.poDate || "",
        stateOfSupply: form.stateOfSupply || "None",
        reverseCharge: Boolean(form.reverseCharge),
      },
      rows: mappedRows,
      items: mappedRows,
      txnDiscount: Math.max(0, Number(txnDiscount) || 0),
      txnTaxRate: Math.max(0, Number(txnTaxRate) || 0),
      totals: {
        ...totals,
        txnDiscount: Math.max(0, Number(txnDiscount) || 0),
        txnTaxRate: Math.max(0, Number(txnTaxRate) || 0),
      },
      business,
      files,
      saleOrderIds: [
        ...new Set([
          ...saleOrderConversions.map((o) => o.id),
          ...rows.map((r) => r.sourceOrderId),
        ].filter(Boolean)),
      ],
      saleOrderNumbers: [
        ...new Set([
          ...saleOrderConversions.map((o) => o.number),
          ...rows.map((r) => r.sourceOrderNumber),
        ].filter(Boolean)),
      ],
      purchaseOrderId:
        purchaseOrderConversion?.id ||
        rows.find((r) => r.sourceOrderId)?.sourceOrderId ||
        undefined,
      purchaseOrderNumber:
        purchaseOrderConversion?.number ||
        rows.find((r) => r.sourceOrderNumber)?.sourceOrderNumber ||
        undefined,
      sourceOnlineOrderId: onlineOrderConversion?.id || "",
      createdAt: new Date().toISOString(),
    };
  };

  // Opens preview.
  const openPreview = (printAfterOpen = false) => {
    if (!validate()) return false;
    const invoice = buildInvoice();
    sessionStorage.setItem(config.storageKey, JSON.stringify(invoice));
    navigate("/sales/sale-invoices/preview", { state: { invoice, printAfterOpen } });
    return true;
  };

  // Handles sale.
  const resetSale = () => {
    setTransactionId(crypto.randomUUID());
    setRows([createRow(), createRow()]);
    setRoundOffValue("");
    setReceivedAmount("");
    setReceivedEnabled(false);
    setFiles({ image: "", document: "" });
    setForm((current) => ({ ...current, invoiceNumber: String((Number(current.invoiceNumber) || 0) + 1), invoiceDate: currentLocalDate(), customer: "", phone: "", billingAddress: "", shippingAddress: "", partyBalance: "", showDescription: false, description: "", showTerms: false, termsTitle: "", terms: "", paymentType: "Cash" }));
    setToast(`Ready for a fresh ${config.title.toLowerCase()}.`);
  };

  const finalizeOrderConversions = (savedDoc) => {
    const docId = savedDoc?.id || transactionId;
    const docNum = savedDoc?.invoiceNumber || form.invoiceNumber;
    const docDate = savedDoc?.date || form.invoiceDate;

    // 1. Purchase Order Fulfillment
    const targetPoId =
      purchaseOrderConversion?.id ||
      rows.find((r) => r.sourceOrderId)?.sourceOrderId;

    if (targetPoId) {
      try {
        const poFulfilledRows = rows
          .filter((r) => r.item.trim() && toNumber(r.qty) > 0)
          .map((r) => ({
            sourceOrderRowId: r.sourceOrderRowId,
            rowId: r.sourceOrderRowId,
            item: r.item,
            qty: toNumber(r.qty),
            price: toNumber(r.price),
          }));
        fulfillPurchaseOrder(targetPoId, poFulfilledRows, {
          id: docId,
          invoiceNumber: docNum,
          date: docDate,
        });
      } catch (err) {
        console.error("Failed to fulfill purchase order:", err);
      }
    }

    // 2. Sale Order Fulfillment
    const targetSoIds = [
      ...new Set([
        ...saleOrderConversions.map((o) => o.id),
        ...rows.map((r) => r.sourceOrderId),
      ].filter(Boolean)),
    ];

    if (targetSoIds.length) {
      try {
        targetSoIds.forEach((soId) => {
          const soFulfilledRows = rows
            .filter(
              (r) =>
                r.item.trim() &&
                toNumber(r.qty) > 0 &&
                (!r.sourceOrderId || r.sourceOrderId === soId)
            )
            .map((r) => ({
              sourceOrderRowId: r.sourceOrderRowId,
              rowId: r.sourceOrderRowId,
              item: r.item,
              qty: toNumber(r.qty),
              price: toNumber(r.price),
            }));
          fulfillSaleOrder(soId, soFulfilledRows, {
            id: docId,
            invoiceNumber: docNum,
            date: docDate,
          });
        });
      } catch (err) {
        console.error("Failed to fulfill sale order:", err);
      }
    }
  };

  useEffect(() => {
    if (
      purchaseOrderConversion?.status === "Converted to Purchase" ||
      purchaseOrderConversion?.status === "Fully Converted"
    ) {
      setToast("Notice: This purchase order has already been fully converted to a purchase bill.");
    } else if (
      saleOrderConversions.length > 0 &&
      saleOrderConversions.every(
        (order) =>
          order.status === "Converted to Sale" ||
          order.status === "Fully Converted"
      )
    ) {
      setToast("Notice: The selected sale order(s) have already been fully converted to a sale invoice.");
    }
  }, [purchaseOrderConversion, saleOrderConversions]);

  // Saves sale.
  const saveSale = async () => {
    if (!validate()) {
      setToast("Please fix highlighted fields.");
      return;
    }
    if (isPurchase && !editInvoice) {
      const allPurchases = getPurchaseBills();
      const currentBillNo = String(form.invoiceNumber || "").trim().toLowerCase();
      const currentSupplier = String(form.customer || "").trim().toLowerCase();
      if (currentBillNo && currentSupplier) {
        const duplicate = allPurchases.find((b) => {
          const bNo = String(b.form?.invoiceNumber || b.invoiceNumber || "").trim().toLowerCase();
          const bSupp = String(b.form?.customer || b.partyName || b.supplier || "").trim().toLowerCase();
          return bNo === currentBillNo && bSupp === currentSupplier;
        });
        if (duplicate) {
          const confirmDuplicate = typeof window !== "undefined" && window.confirm
            ? window.confirm(`Warning: Bill #${form.invoiceNumber} already exists for supplier "${form.customer}". Do you still want to save this purchase bill?`)
            : true;
          if (!confirmDuplicate) return;
        }
      }
    }
    const invoice = buildInvoice();
    if (isPurchase && editInvoice && localOnlyPurchase) {
      try {
        const saved = await saveBusinessPurchaseBill({ ...invoice, id: editInvoice.id, invoiceId: editInvoice.invoiceId || editInvoice.id, createdAt: editInvoice.createdAt });
        sessionStorage.setItem(config.storageKey, JSON.stringify(saved));
        setToast("Purchase bill updated successfully.");
        navigate(returnPath);
      } catch (err) {
        setToast(err.message || "Could not update purchase bill.");
      }
      return;
    }
    if (isPurchase && localOnlyPurchase) {
      try {
        const saved = await saveBusinessPurchaseBill(invoice);
        finalizeOrderConversions(saved);
        sessionStorage.setItem(config.storageKey, JSON.stringify(saved));
        setToast(purchaseOrderConversion ? "Purchase bill created from the purchase order." : "Purchase bill saved successfully.");
        navigate(returnPath);
      } catch (err) {
        setToast(err.message || "Could not save purchase bill.");
      }
      return;
    }
    if (quotationConversion) {
      try {
        const savedInvoice = await saveBusinessSaleInvoice({ ...invoice, quotationId: quotationConversion.id, proformaId: location.state?.proformaConversion?.id || "" });
        const sourceDocuments = JSON.parse(window.localStorage.getItem(conversionStorageKey) || "[]");
        window.localStorage.setItem(conversionStorageKey, JSON.stringify(sourceDocuments.map((document) => document.id === quotationConversion.id ? { ...document, status: "Converted to Sale", convertedAt: new Date().toISOString(), convertedSaleId: savedInvoice.id } : document)));
        setToast("Sale invoice created from this quotation.");
        navigate(returnPath);
      } catch (error) {
        setToast(error.message || "Could not save the sale invoice.");
      }
      return;
    }
    if (saleOrderConversions.length) {
      try {
        const savedInvoice = await saveBusinessSaleInvoice({ ...invoice, saleOrderIds: saleOrderConversions.map((order) => order.id) });
        finalizeOrderConversions(savedInvoice);
        setToast("Sale invoice created from the selected sale order(s).");
        navigate(returnPath);
      } catch (error) {
        setToast(error.message || "Could not convert the sale order.");
      }
      return;
    }
    if (deliveryChallanConversions.length) {
      try {
        const savedInvoice = await saveBusinessSaleInvoice({ ...invoice, deliveryChallanIds: deliveryChallanConversions.map((challan) => challan.id) });
        const key = "ledgerly:deliveryChallans.v1";
        const sourceChallans = JSON.parse(window.localStorage.getItem(key) || "[]");
        window.localStorage.setItem(key, JSON.stringify(sourceChallans.map((challan) => deliveryChallanConversions.some((source) => source.id === challan.id)
          ? { ...challan, status: "Converted to Sale", convertedAt: new Date().toISOString(), convertedSaleId: savedInvoice.id, history: [...(challan.history || []), { action: "Converted to Sale", at: new Date().toISOString(), saleInvoiceId: savedInvoice.id }] }
          : challan)));
        setToast("Sale invoice created from the selected delivery challan(s).");
        navigate(returnPath);
      } catch (error) {
        setToast(error.message || "Could not convert the delivery challan.");
      }
      return;
    }
    if (editInvoice) {
      try {
        const targetId = editInvoice.id || editInvoice.invoiceId || transactionId;
        const wasCancelled = Boolean(editInvoice.cancelled || editInvoice.isCancelled || editInvoice.invoiceStatus === "Cancelled");
        const existingFields = {
          ...invoice,
          id: targetId,
          invoiceId: targetId,
          createdAt: editInvoice.createdAt || invoice.createdAt || new Date().toISOString(),
          invoiceStatus: wasCancelled ? "Cancelled" : (editInvoice.invoiceStatus || "Active"),
          cancelled: wasCancelled,
          status: wasCancelled ? "Cancelled" : (editInvoice.status === "Draft" ? "Draft" : "Active"),
        };
        const savedInvoice = isPurchase
          ? await saveBusinessPurchaseBill(existingFields)
          : await saveBusinessSaleInvoice(existingFields);
        if (!isPurchase) {
          try {
            const current = readTransactionValue(transactionStorageKeys.saleInvoiceUi, {});
            const edits = { ...(current.edits || {}) };
            const cancelled = { ...(current.cancelled || {}) };
            delete edits[savedInvoice.id];
            delete cancelled[savedInvoice.id];
            delete edits[targetId];
            delete cancelled[targetId];
            writeTransactionValue(transactionStorageKeys.saleInvoiceUi, { ...current, edits, cancelled });
          } catch { /* The canonical invoice has already been saved. */ }
        }
        sessionStorage.setItem(config.storageKey, JSON.stringify(savedInvoice));
        notifyBusinessDataChanged();
        setToast(`${isPurchase ? "Purchase bill" : "Sale"} updated successfully.`);
        navigate(returnPath);
      } catch (error) {
        console.error("Failed to update transaction:", error);
        setToast(error.message || `Could not update this ${isPurchase ? "purchase bill" : "sale"}.`);
      }
      return;
    }
    let savedInvoice;
    try {
      savedInvoice = isPurchase
        ? await saveBusinessPurchaseBill(invoice)
        : await saveBusinessSaleInvoice(invoice);
      finalizeOrderConversions(savedInvoice);
      if (onlineOrderConversion?.id && !onlineOrderConversion.convertedToSale) {
        await markOnlineStoreOrderConverted(onlineOrderConversion.id, {
          saleId: savedInvoice.id,
          invoiceId: savedInvoice.invoiceId,
          invoiceNumber: savedInvoice.form?.invoiceNumber || savedInvoice.invoiceNumber,
        });
      }
    } catch (error) {
      setToast(error.message || `Could not save ${config.title.toLowerCase()} to MySQL.`);
      return;
    }
    sessionStorage.setItem(config.storageKey, JSON.stringify(savedInvoice));
    setToast(config.saveMessage);

    // Auto-dispatch Meta WhatsApp transaction message if enabled in settings
    try {
      const currentSettings = getAppSettings();
      const sendToParty = currentSettings.txnMsgSendToParty ?? true;
      const isAutoEnabled = isPurchase ? currentSettings.txnMsgAutoPurchase : currentSettings.txnMsgAutoSales;
      const targetPhone = (form.phone || savedInvoice.phone || savedInvoice.form?.phone || "").trim();
      if (sendToParty && isAutoEnabled && targetPhone) {
        const txnType = isPurchase ? "purchase" : "sales";
        const validRows = (savedInvoice.rows?.length ? savedInvoice.rows : rows).filter((r) => (r.item || r.name || "").trim());
        const effectiveCompany = business.name || getCompanyProfile()?.companyName || "USV Test Trade";
        const msg = buildTransactionMessage({
          type: txnType,
          number: form.invoiceNumber || savedInvoice.invoiceNumber || savedInvoice.id,
          amount: totals.finalTotal || totals.grandTotal || 0,
          balance: totals.balance ?? Math.max(0, (totals.finalTotal || totals.grandTotal || 0) - (totals.received || 0)),
          received: totals.received || 0,
          subTotal: totals.subtotal || totals.taxableAmount || totals.finalTotal,
          tax: totals.tax || 0,
          discount: totals.discount || 0,
          customer: form.customer || form.partyName || savedInvoice.customer || savedInvoice.form?.customer,
          customerPhone: targetPhone,
          date: form.invoiceDate || form.date || savedInvoice.invoiceDate,
          items: validRows,
          companyName: effectiveCompany,
          settings: currentSettings,
        });
        sendMetaWhatsAppMessage({ phone: targetPhone, message: msg }).catch(() => {});
      }
    } catch {
      // Background dispatch errors do not block navigation
    }
    if (!isPurchase) {
      if (getAppSettings().doNotShowInvoicePreview) {
        navigate("/sales/sale-invoices");
      } else {
        navigate("/sales/sale-invoices/preview", { state: { invoice: savedInvoice } });
      }
    } else {
      navigate(returnPath);
    }
  };

  // Handles share action.
  const handleShareAction = async (action) => {
    setShareOpen(false);
    if (quotationConversion && action === "Save & New") {
      await saveSale();
      return;
    }
    if (action === "Save & Generate Barcode" && isPurchase) {
      if (!validate()) return;
      let invoice;
      try {
        invoice = isPurchase ? await saveBusinessPurchaseBill(buildInvoice()) : await saveBusinessSaleInvoice(buildInvoice());
        finalizeOrderConversions(invoice);
      } catch (error) {
        setToast(error.message || `Could not save ${isPurchase ? "purchase bill" : "sale"} to MySQL.`);
        return;
      }
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
      if (!validate()) return;
      try {
        const invoice = buildInvoice();
        const savedInvoice = isPurchase
          ? await saveBusinessPurchaseBill(invoice)
          : await saveBusinessSaleInvoice(invoice);
        finalizeOrderConversions(savedInvoice);
        resetSale();
      } catch (error) {
        setToast(error.message || `Could not save ${config.title.toLowerCase()} to MySQL.`);
      }
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

  // Saves item from modal directly to MySQL database
  const saveItemFromModal = async (itemForm) => {
    try {
      const savedInventoryItem = await saveBusinessItem(itemForm);
      const newItem = saleItemFromInventory(savedInventoryItem);
      setItems((current) => [...current.filter((item) => item.id !== newItem.id), newItem]);
      setRows((current) => current.map((row) => (row.id === addItemRowId ? syncDiscount({ ...row, item: newItem.name, unit: newItem.unit || row.unit, price: newItem.price || row.price, priceMode: newItem.priceMode || row.priceMode, taxRate: newItem.taxRate || row.taxRate, sourceItemId: newItem.id || "" }) : row)));
      setAddItemRowId(null);
    } catch (err) {
      setToast(err.message || "Could not save item to MySQL.");
    }
  };

  return (
    <div className="min-h-full bg-slate-100">
      <TransactionTabs tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} addTab={addTab} closeTab={closeTab} />
      <TransactionHeader title={editInvoice ? (isPurchase ? "Edit Purchase" : "Edit Sale") : config.title} saleType={saleType} setSaleType={setSaleType} showSaleType={!isPurchase} onSettings={() => setSettingsOpen(true)} onClose={() => closeTab(activeTab)} />
      <CustomerDetails appSettings={appSettings} saleType={saleType} form={form} errors={errors} setField={setField} config={config} parties={parties} onAddParty={() => navigate("/parties/party-details")} />
      <InvoiceTable rows={rows} setRows={setRows} items={items} errors={errors} onAddItem={(rowId) => setAddItemRowId(rowId)} appSettings={appSettings} isPurchase={isPurchase} />

      <div className="grid gap-3 bg-slate-50 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AddOns form={form} setField={setField} files={files} setFiles={setFiles} templates={termsTemplates} setTemplates={setTermsTemplates} showPayment={hasValidInvoiceItem} />
        <div className="px-4 py-4">
          <TotalsPanel
            totals={totals}
            roundOff={roundOff}
            setRoundOff={setRoundOff}
            roundOffValue={roundOffValue}
            setRoundOffValue={setRoundOffValue}
            receivedEnabled={receivedEnabled}
            setReceivedEnabled={setReceivedEnabled}
            receivedAmount={receivedAmount}
            setReceivedAmount={setReceivedAmount}
            appSettings={appSettings}
            rowCount={rows.filter((r) => r.item.trim()).length}
            error={errors?.received || ""}
            additionalCharges={additionalCharges}
            setAdditionalCharges={setAdditionalCharges}
            txnDiscount={txnDiscount}
            setTxnDiscount={setTxnDiscount}
            txnTaxRate={txnTaxRate}
            setTxnTaxRate={setTxnTaxRate}
          />
          {toast && <p className="mt-2 text-right text-[13px] font-medium text-emerald-600">{toast}</p>}
        </div>
      </div>

      <footer className={`sticky bottom-0 z-20 flex gap-3 border-t border-slate-200 bg-white px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] ${isPurchase ? "justify-between" : "justify-end"}`}>
        <div className="flex gap-3">
          <div ref={shareRef} className="relative">
            <button type="button" onClick={() => setShareOpen((current) => !current)} className="flex h-10 overflow-hidden rounded-md border border-blue-300 text-[13px] font-bold text-blue-600">
              <span className="px-4 py-2">Share</span>
              <span className="grid w-10 place-items-center border-l border-blue-200"><FiChevronDown /></span>
            </button>
            {shareOpen && <ShareMenu actions={isPurchase ? (appSettings.enableBarcodeScanning !== false ? purchaseShareActions : purchaseShareActions.filter(a => a !== "Save & Generate Barcode")) : shareActions} onAction={handleShareAction} />}
          </div>
          <Button onClick={saveSale} className="rounded-md bg-blue-600 px-10 py-2 text-[13px] text-white shadow-md hover:bg-blue-700"><FiSave /> {editInvoice ? "Update Sale" : "Save"}</Button>
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

      {settingsOpen && (
        <SettingsDrawer
          appSettings={appSettings}
          onUpdateSettings={(updates) => saveAppSettings(updates)}
          additionalCharges={additionalCharges}
          setAdditionalCharges={setAdditionalCharges}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

export default AddSale;
