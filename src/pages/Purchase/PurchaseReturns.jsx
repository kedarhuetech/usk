import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiChevronDown,
  FiFilter,
  FiMoreVertical,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiSettings,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import * as XLSX from "xlsx";
import { getInventoryItems } from "../../services/itemsStorage";
import { getParties } from "../../services/partiesStorage";
import { getPurchaseBills, applyDebitNoteToPurchaseBill } from "../../services/purchaseBillsStorage";
import {
  loadBusinessItems,
  loadBusinessParties,
  loadPurchaseBills,
} from "../../services/businessRecords";
import { moveBatchRows, reverseBatchMovement } from "../../services/batchInventoryService.js";
import { useAppSettings } from "../../hooks/useAppSettings.js";
import {
  buildUnifiedDocumentHtml,
  getEffectiveCompanyInfo,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";
import { getAppSettings } from "../../services/appSettingsStorage.js";
import {
  buildTransactionMessage,
  sendMetaWhatsAppMessage,
} from "../../services/transactionMessageService.js";
import { toast } from "../../components/Common/Toast.jsx";
import ConfirmModal from "../../components/Common/ConfirmModal.jsx";
import { transactionsDb } from "../../services/databaseRepository.js";
import { notifyBusinessDataChanged } from "../../services/businessDataChanged.js";

const STORAGE_KEY = "ledgerly:purchaseReturns.v1";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDisplayDate = (val) => {
  if (!val) return "—";
  if (typeof val === "string" && val.includes("/")) return val;
  const str = String(val).slice(0, 10);
  const parts = str.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return str || "—";
};

const money = (value) =>
  `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const freshRow = () => ({
  id: crypto.randomUUID(),
  item: "",
  description: "",
  qty: "",
  unit: "NONE",
  price: "",
  discount: "",
  tax: "NONE",
  sourceItemId: "",
  batchNo: "",
});

function normalizePurchaseReturn(item) {
  if (!item) return item;
  const rawType = String(item.transactionType || item.type || item.source || "").toLowerCase().replace(/[\s_]+/g, "");
  const isReturn = rawType === "purchasereturn" || item.type === "Purchase Return" || item.category === "Purchase Return";
  const totalVal = Number(item.total ?? item.totalAmount ?? 0);
  const receivedVal = Number(item.received ?? item.paidAmount ?? 0);
  const balanceVal = Number(item.balance ?? item.balanceAmount ?? Math.max(0, totalVal - receivedVal));
  return {
    ...item,
    id: item.id,
    refNo: item.documentNumber || item.refNo || item.number || "",
    party: item.party || item.partyName || item.supplierName || item.supplier || "",
    partyId: item.partyId || item.party_id || "",
    date: item.date || item.transactionDate || (item.createdAt ? item.createdAt.slice(0, 10) : today()),
    total: totalVal,
    received: receivedVal,
    balance: balanceVal,
    type: isReturn ? "Purchase Return" : "Debit Note",
    status: item.status || (balanceVal <= 0 && totalVal > 0 ? "Paid" : "Unpaid"),
    category: item.category || (isReturn ? "Purchase Return" : "General"),
    description: item.description || item.notes || "",
    notes: item.notes || item.description || "",
    terms: item.terms || "",
    billNumber: item.billNumber || item.poNumber || item.linkedInvoiceId || "",
    phone: item.phone || item.partyPhone || "",
    rows: (item.rows || item.items || []).map((r) => ({
      id: r.id || crypto.randomUUID(),
      item: r.item || r.itemName || r.name || "",
      description: r.description || "",
      qty: String(r.qty ?? r.quantity ?? 1),
      unit: r.unit || "NONE",
      price: String(r.price ?? r.unitPrice ?? 0),
      discount: String(r.discount ?? r.discountPercent ?? 0),
      tax: r.tax || (r.taxPercent != null ? String(r.taxPercent) : "NONE"),
      sourceItemId: r.sourceItemId || r.itemId || "",
      batchNo: r.batchNo || "",
    })),
  };
}

function readReturns() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.map(normalizePurchaseReturn) : [];
  } catch {
    return [];
  }
}

const rowAmount = (row) => {
  const gross = (Number(row.qty) || 0) * (Number(row.price) || 0);
  const discountVal = Number(row.discount) || 0;
  const net = Math.max(0, gross - (gross * discountVal) / 100);
  const rawTax = String(row.tax || "").replace(/[^0-9.]/g, "");
  const taxVal = Number(rawTax) || 0;
  return net + (net * taxVal) / 100;
};

export default function PurchaseReturns() {
  const navigate = useNavigate();
  const location = useLocation();
  const [records, setRecords] = useState(readReturns);
  const [editor, setEditor] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState("");
  const [openItemRow, setOpenItemRow] = useState("");
  const appSettings = useAppSettings();
  const batchTracking = Boolean(appSettings.enableBatchTracking);

  // Filter state matching screenshot
  const [datePreset, setDatePreset] = useState("This Month");
  const [fromDate, setFromDate] = useState(() => `${today().slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(today);
  const [recordType, setRecordType] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All Payment");

  const isItemActive = (item) => item && item.isActive !== false && item.is_active !== 0;
  const [parties, setParties] = useState(getParties);
  const [bills, setBills] = useState(getPurchaseBills);
  const [items, setItems] = useState(() =>
    getInventoryItems().filter((item) => item.type !== "service" && isItemActive(item))
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      loadBusinessParties().catch(() => getParties()),
      loadPurchaseBills().catch(() => getPurchaseBills()),
      loadBusinessItems().catch(() => getInventoryItems()),
    ]).then(([liveParties, liveBills, liveItems]) => {
      if (!active) return;
      if (Array.isArray(liveParties)) setParties(liveParties);
      if (Array.isArray(liveBills)) setBills(liveBills);
      if (Array.isArray(liveItems)) {
        setItems(liveItems.filter((item) => item.type !== "service" && isItemActive(item)));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return records.filter((record) => {
      const matchType =
        recordType === "All" ||
        (record.type || "Debit Note") === recordType;
      const matchDate =
        (!fromDate || record.date >= fromDate) &&
        (!toDate || record.date <= toDate);
      const isPaid = (record.balance || 0) <= 0 && (record.total || 0) > 0;
      const matchPayment =
        paymentFilter === "All Payment" ||
        (paymentFilter === "Paid" ? isPaid : !isPaid);
      const text = `${record.party || ""} ${record.refNo || ""} ${
        record.billNumber || ""
      } ${record.category || ""}`.toLowerCase();
      const matchSearch = text.includes(search.toLowerCase().trim());
      return matchType && matchDate && matchPayment && matchSearch;
    });
  }, [records, recordType, fromDate, toDate, paymentFilter, search]);

  const totalAmount = useMemo(
    () => filtered.reduce((acc, row) => acc + (Number(row.total) || 0), 0),
    [filtered]
  );
  const totalBalance = useMemo(
    () => filtered.reduce((acc, row) => acc + (Number(row.balance) || 0), 0),
    [filtered]
  );

  useEffect(() => {
    let isMounted = true;
    async function fetchReturns() {
      try {
        const list = await transactionsDb.listByType("debit_note");
        if (isMounted && Array.isArray(list)) {
          setRecords(list.map(normalizePurchaseReturn));
        }
      } catch (err) {
        console.warn("[PurchaseReturns] Failed to fetch from DB:", err);
      }
    }
    fetchReturns();
    const onDataChanged = () => fetchReturns();
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("ledgerly:business-data-changed", onDataChanged);
      return () => {
        isMounted = false;
        window.removeEventListener("ledgerly:business-data-changed", onDataChanged);
      };
    }
  }, []);

  useEffect(() => {
    if (location.state?.editReturn || location.state?.editPurchase || location.state?.editDebitNote) {
      const target = location.state.editReturn || location.state.editPurchase || location.state.editDebitNote;
      setEditor({ mode: "edit", value: normalizePurchaseReturn(target) });
    }
  }, [location.state]);

  const persist = (next) => {
    const rollbackKeys = [STORAGE_KEY, "ledgerly:inventoryItems.v1", "ledgerly:batchMovements.v1"];
    const before = Object.fromEntries(rollbackKeys.map((key) => [key, localStorage.getItem(key)]));
    try {
    const tracking = appSettings.enableBatchTracking;
    let updated = next.map((record) => ({ ...record }));
    if (tracking) {
      for (const old of records.filter((entry) => entry.type === "Purchase Return" || entry.type === "Debit Note")) {
        const replacement = updated.find((entry) => entry.id === old.id);
        const changed = !replacement || JSON.stringify(old.rows) !== JSON.stringify(replacement.rows);
        if (!changed) continue;
        if (!old.batchMovementId) throw new Error("This historical purchase return has no batch allocation and cannot be safely edited or deleted while tracking is enabled.");
        reverseBatchMovement(old.batchMovementId, "purchase-return");
        if (replacement) { replacement.batchMovementId = ""; replacement.batchStockAdjustedAt = ""; }
      }
      updated = updated.map((record) => {
        const old = records.find((entry) => entry.id === record.id);
        const changed = !old || JSON.stringify(old.rows) !== JSON.stringify(record.rows);
        if ((record.type !== "Purchase Return" && record.type !== "Debit Note") || !changed) return record;
        const rows = (record.rows || []).filter((row) => Number(row.qty) > 0);
        if (rows.some((row) => !row.batchNo)) throw new Error("Select a batch for each purchase return item while batch tracking is enabled.");
        const movementId = `${record.id}:${Date.now()}:${crypto.randomUUID()}`;
        moveBatchRows(rows, "reduce", { referenceId: movementId, sourceType: "purchase-return" });
        return { ...record, batchMovementId: movementId, batchStockAdjustedAt: new Date().toISOString() };
      });
    }
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifyBusinessDataChanged();
    } catch (error) {
      for (const [key, value] of Object.entries(before)) { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); }
      throw error;
    }
  };

  const startNew = () => {
    const nextRef = String(
      Math.max(0, ...records.map((r) => Number(r.refNo) || 0)) + 1
    );
    const initialType = recordType === "Purchase Return" ? "Purchase Return" : "Debit Note";
    setEditor({
      mode: "new",
      value: {
        id: "",
        refNo: nextRef,
        type: initialType,
        party: "",
        partyId: "",
        phone: "",
        billNumber: "",
        billDate: "",
        category: initialType === "Purchase Return" ? "Purchase Return" : "General",
        date: today(),
        state: "Select",
        rows: [freshRow(), freshRow()],
        paymentType: "Cash",
        received: "",
        description: "",
      },
    });
  };

  const change = (key, value) =>
    setEditor((current) => ({
      ...current,
      value: { ...current.value, [key]: value },
    }));

  const changeRow = (id, key, value) =>
    setEditor((current) => ({
      ...current,
      value: {
        ...current.value,
        rows: current.value.rows.map((row) =>
          row.id === id ? { ...row, [key]: value } : row
        ),
      },
    }));

  const removeRow = (id) =>
    setEditor((current) => ({
      ...current,
      value: {
        ...current.value,
        rows: current.value.rows.filter((row) => row.id !== id),
      },
    }));

  const save = async () => {
    const value = editor.value;
    if (!value.party.trim()) {
      toast.error("Please enter or select a Party Name.");
      return;
    }

    const allInventory = items.length ? items : getInventoryItems();
    const originalRecord = editor.mode === "edit" ? records.find((r) => r.id === value.id) : null;
    const originalRowItemNames = new Set(
      ((originalRecord?.rows || originalRecord?.items) || []).map((r) => String(r.item || "").trim().toLowerCase()).filter(Boolean)
    );
    const inactiveRow = (value.rows || []).find((row) => {
      const name = String(row.item || "").trim().toLowerCase();
      if (!name) return false;
      if (originalRowItemNames.has(name)) return false;
      const match = allInventory.find((it) => (it.id && (it.id === row.itemId || it.id === row.sourceItemId)) || String(it.itemName || it.name || "").trim().toLowerCase() === name);
      return match && (match.isActive === false || match.is_active === 0);
    });
    if (inactiveRow) {
      toast.error(`Item "${inactiveRow.item}" is inactive and cannot be added to a purchase return.`);
      return;
    }

    const isReturn = value.type === "Purchase Return";
    const total = value.rows.reduce((sum, row) => sum + rowAmount(row), 0);
    const receivedVal = Number(value.received || 0);
    const balanceVal = Math.max(0, total - receivedVal);
    const saved = {
      ...value,
      id: value.id || crypto.randomUUID(),
      total,
      received: receivedVal,
      balance: balanceVal,
      type: isReturn ? "Purchase Return" : "Debit Note",
      category: value.category || (isReturn ? "Purchase Return" : "General"),
      status: balanceVal <= 0 && total > 0 ? "Paid" : "Unpaid",
      updatedAt: new Date().toISOString(),
    };

    try {
      // Save directly to MySQL transactions table
      await transactionsDb.save({
        ...saved,
        transactionType: isReturn ? "purchase_return" : "debit_note",
        type: isReturn ? "purchase_return" : "debit_note",
        category: saved.category,
        documentNumber: saved.refNo,
        transactionDate: saved.date,
        partyName: saved.party,
        partyId: saved.partyId || null,
        totalAmount: Number(saved.total || 0),
        paidAmount: Number(saved.received || 0),
        balanceAmount: Number(saved.balance || 0),
        notes: saved.description || saved.notes || (saved.billNumber ? `Debit Note for Bill ${saved.billNumber}` : ""),
        description: saved.description || saved.notes || "",
        terms: saved.terms || "",
        linkedInvoiceId: saved.billNumber || saved.billId || null,
        poNumber: saved.billNumber || saved.billId || null,
        items: (saved.rows || []).map((r) => ({
          itemName: r.item,
          quantity: Number(r.qty || 1),
          unitPrice: Number(r.price || 0),
          discountPercent: Number(r.discount || 0),
          taxPercent: Number(r.tax || 0),
          totalAmount: rowAmount(r),
        })),
      });

      persist(editor.mode === "edit" ? records.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...records]);

      // Adjust linked purchase bill balance and debitNoteAppliedAmount
      if (saved.billNumber || saved.billId) {
        try {
          await applyDebitNoteToPurchaseBill(saved.billNumber || saved.billId, total);
        } catch {}
      }

      setEditor(null);
      toast.success(
        editor.mode === "edit"
          ? `${saved.type} updated.`
          : `${saved.type} created.`
      );

      // Auto-dispatch Meta WhatsApp transaction message if enabled in settings
      try {
        const currentSettings = getAppSettings();
        if ((currentSettings.txnMsgSendToParty ?? true) && currentSettings.txnMsgAutoPurchaseReturn) {
          const party = parties.find((p) => (p.partyName || p.name) === saved.party);
          const phone = party?.phone || "";
          if (phone) {
            const msg = buildTransactionMessage({
              type: "purchaseReturn",
              number: saved.refNo,
              amount: total,
              balance: balanceVal,
              settings: currentSettings,
            });
            sendMetaWhatsAppMessage({ phone, message: msg }).catch(() => {});
          }
        }
      } catch {}
    } catch (error) { toast.error(error.message || "Could not save this purchase return."); }
  };

  const printRecord = (record) => {
    try {
      const info = getEffectiveCompanyInfo();
      const rowsList = record.rows || record.items || [];
      let items = rowsList
        .filter((r) => (r.item || r.itemName || r.name) && (r.item !== "Item" || Number(r.price ?? r.unitPrice ?? 0) > 0 || Number(r.qty ?? r.quantity ?? 0) > 0))
        .map((r, i) => {
          const itemQty = Number(r.qty ?? r.quantity ?? 1);
          const itemPrice = Number(r.price ?? r.unitPrice ?? 0);
          const itemDiscount = Number(r.discount ?? r.discountPercent ?? 0);
          const rawTax = String(r.tax || r.taxPercent || "").replace(/[^0-9.]/g, "");
          const itemTax = Number(rawTax || 0);
          const gross = itemQty * itemPrice;
          const net = Math.max(0, gross - (gross * itemDiscount) / 100);
          const calculatedAmount = net + (net * itemTax) / 100;
          const finalAmount = r.amount != null && !isNaN(Number(r.amount)) ? Number(r.amount) : calculatedAmount;

          return {
            index: i + 1,
            item: r.item || r.itemName || r.name || "Item",
            name: r.item || r.itemName || r.name || "Item",
            qty: itemQty,
            qtyUnit: `${itemQty} ${r.unit && r.unit !== "NONE" ? r.unit : ""}`.trim(),
            price: itemPrice,
            discount: itemDiscount,
            tax: itemTax,
            amount: finalAmount,
          };
        });

      if (items.length === 0) {
        items = [
          {
            index: 1,
            item: `${record.type || "Debit Note"} - Ref: ${record.refNo || "—"}`,
            name: `${record.type || "Debit Note"} - Ref: ${record.refNo || "—"}`,
            qty: 1,
            qtyUnit: "1",
            price: Number(record.total || 0),
            discount: 0,
            tax: 0,
            amount: Number(record.total || 0),
          },
        ];
      }

      const totalVal = Number(record.total ?? record.totalAmount ?? items.reduce((s, it) => s + it.amount, 0));
      const receivedVal = Number(record.received ?? record.paidAmount ?? 0);
      const balanceVal = Number(record.balance ?? record.balanceAmount ?? Math.max(0, totalVal - receivedVal));

      const html = buildUnifiedDocumentHtml({
        docType: record.type || "Debit Note",
        title: record.type || "Debit Note",
        documentNumber: String(record.refNo || ""),
        date: formatDisplayDate(record.date),
        partyName: record.party || record.partyName || "Supplier",
        partyPhone: record.phone || record.partyPhone || "",
        metadataRows: [
          { label: "Original Bill No.", value: record.billNumber || "—" },
          ...(record.billDate ? [{ label: "Bill Date", value: formatDisplayDate(record.billDate) }] : []),
          { label: "Category", value: record.category || "General" },
          { label: "Status", value: record.status || (balanceVal <= 0 && totalVal > 0 ? "Paid" : "Unpaid") },
        ],
        rows: items,
        columns: [
          { key: "index", label: "#", align: "center", width: "40px" },
          { key: "item", label: "Item Description", align: "left" },
          { key: "qtyUnit", label: "Return Qty", align: "center", width: "100px" },
          { key: "price", label: "Rate", align: "right", width: "110px", formatMoney: true },
          { key: "amount", label: "Amount", align: "right", width: "120px", formatMoney: true },
        ],
        totals: [
          { label: "Total Return Amount", value: money(totalVal), isGrand: true },
          { label: "Received / Adjusted", value: money(receivedVal) },
          { label: "Balance Due", value: money(balanceVal) },
        ],
        totalAmount: totalVal,
        notes: record.description || record.notes || "",
        terms: record.terms || "",
        company: info,
        autoPrint: true,
      });
      openPrintWindow(html, true);
    } catch (err) {
      console.error("[PurchaseReturns] Print failed:", err);
      toast.error("Could not generate print document.");
    }
  };

  const printReport = () => {
    if (!filtered.length) {
      toast.info("No purchase returns or debit notes to print.");
      return;
    }
    const info = getEffectiveCompanyInfo();
    const rows = filtered.map((r, idx) => ({
      index: idx + 1,
      date: formatDisplayDate(r.date),
      refNo: r.refNo,
      party: r.party,
      category: r.category || "General",
      type: r.type || "Debit Note",
      total: Number(r.total || 0),
      received: Number(r.received || 0),
      balance: Number(r.balance || 0),
      status: r.status || "Debit",
    }));

    const totalAmount = rows.reduce((acc, r) => acc + r.total, 0);
    const totalReceived = rows.reduce((acc, r) => acc + r.received, 0);
    const totalBalance = rows.reduce((acc, r) => acc + r.balance, 0);

    const dateRangeLabel = fromDate && toDate ? `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}` : datePreset;

    const html = buildUnifiedDocumentHtml({
      docType: "Purchase Returns & Debit Notes Report",
      title: "Purchase Returns & Debit Notes Report",
      documentNumber: `REP-${today().replace(/-/g, "")}`,
      date: formatDisplayDate(today()),
      metadataRows: [
        { label: "Period", value: dateRangeLabel },
        { label: "Filter Type", value: recordType },
        { label: "Total Records", value: String(rows.length) },
      ],
      partyName: "All Parties / Suppliers",
      rows,
      columns: [
        { label: "#", key: "index", align: "center", width: "35px" },
        { label: "Date", key: "date", width: "85px" },
        { label: "Ref No.", key: "refNo", width: "95px" },
        { label: "Party Name", key: "party" },
        { label: "Type", key: "type", width: "100px" },
        { label: "Status", key: "status", align: "center", width: "70px" },
        { label: "Total", key: "total", align: "right", render: (r) => money(r.total) },
        { label: "Received", key: "received", align: "right", render: (r) => money(r.received) },
        { label: "Balance", key: "balance", align: "right", render: (r) => money(r.balance) },
      ],
      totals: [
        { label: "Grand Total", value: money(totalAmount), isGrand: true },
        { label: "Total Received / Adjusted", value: money(totalReceived) },
        { label: "Total Balance Due", value: money(totalBalance) },
      ],
      totalAmount,
      company: info,
      autoPrint: true,
    });

    openPrintWindow(html, true);
  };

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const data = filtered.map((record) => ({
      Date: formatDisplayDate(record.date),
      "Ref No.": record.refNo,
      "Party Name": record.party,
      Category: record.category || "General",
      Type: record.type,
      Total: record.total,
      Received: record.received,
      Balance: record.balance,
      Status: record.status,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), "Debit Notes");
    XLSX.writeFile(workbook, `Debit_Notes_${today()}.xlsx`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f5f8] text-slate-800 text-xs select-none">
      {/* ================= 1. TOP FILTER BAR ================= */}
      <div className="bg-white px-4 py-3 border-b border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Period dropdown */}
          <div className="relative">
            <select
              value={datePreset}
              onChange={(e) => {
                const val = e.target.value;
                setDatePreset(val);
                if (val === "This Month") {
                  setFromDate(`${today().slice(0, 7)}-01`);
                  setToDate(today());
                } else if (val === "Today") {
                  setFromDate(today());
                  setToDate(today());
                } else if (val === "All Time") {
                  setFromDate("");
                  setToDate("");
                }
              }}
              className="appearance-none bg-transparent pr-5 py-1 text-sm font-bold text-gray-800 cursor-pointer focus:outline-none"
            >
              <option value="This Month">This Month</option>
              <option value="Today">Today</option>
              <option value="All Time">All Time</option>
              {datePreset === "Custom" && <option value="Custom">Custom</option>}
            </select>
            <FiChevronDown className="absolute right-0 top-2 pointer-events-none text-gray-600 text-xs" />
          </div>

          {/* Date range picker */}
          <div className="flex items-center border border-gray-300 rounded overflow-hidden text-xs bg-white h-[30px]">
            <span className="bg-[#9da8b6] text-white px-2.5 h-full flex items-center text-[11px] font-medium">
              Between
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset("Custom");
              }}
              className="px-2 text-center text-gray-700 outline-none text-xs w-28 h-full"
            />
            <span className="px-1.5 text-gray-500 text-[11px]">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset("Custom");
              }}
              className="px-2 text-center text-gray-700 outline-none text-xs w-28 h-full"
            />
          </div>


        </div>

        {/* Action icons on right */}
        <div className="flex items-center gap-4">
          <button
            onClick={exportExcel}
            className="flex flex-col items-center text-gray-600 hover:text-green-700 transition cursor-pointer"
            title="Excel Report"
          >
            <div className="text-[#107c41] font-bold text-lg leading-none">▦</div>
            <span className="text-[10px] text-gray-600 font-medium mt-0.5">Excel Report</span>
          </button>
          <button
            onClick={printReport}
            className="flex flex-col items-center text-gray-600 hover:text-blue-600 transition cursor-pointer"
            title="Print Report"
          >
            <FiPrinter className="text-lg text-gray-700" />
            <span className="text-[10px] text-gray-600 font-medium mt-0.5">Print</span>
          </button>
        </div>
      </div>

      {/* ================= 2. SUB-FILTERS ROW ================= */}
      <div className="bg-white px-4 py-2 border-b border-gray-200 flex items-center gap-3 shrink-0">
        <div className="relative">
          <select
            value={recordType}
            onChange={(e) => setRecordType(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded px-3 py-1 pr-7 text-xs text-gray-700 cursor-pointer focus:outline-none focus:border-blue-500 min-w-[160px] h-[30px]"
          >
            <option value="All">All Returns / Debit Notes</option>
            <option value="Debit Note">Debit Note</option>
            <option value="Purchase Return">Purchase Return</option>
          </select>
          <FiChevronDown className="absolute right-2 top-2.5 pointer-events-none text-gray-500 text-xs" />
        </div>

        <div className="relative">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded px-3 py-1 pr-7 text-xs text-gray-700 cursor-pointer focus:outline-none focus:border-blue-500 min-w-[140px] h-[30px]"
          >
            <option value="All Payment">All Payment</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
          <FiChevronDown className="absolute right-2 top-2.5 pointer-events-none text-gray-500 text-xs" />
        </div>
      </div>

      {/* ================= 3. SEARCH & ADD BUTTON ROW ================= */}
      <div className="bg-white px-4 py-2 flex items-center justify-between border-b border-gray-200 shrink-0">
        <div className="relative w-64">
          <FiSearch className="absolute left-2.5 top-2.5 text-gray-400 text-xs" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder=""
            className="w-full pl-8 pr-3 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-blue-500 h-[30px]"
          />
        </div>

        <button
          onClick={startNew}
          className="flex items-center gap-1.5 bg-[#0078d4] hover:bg-[#006abc] text-white font-medium px-4 py-1.5 rounded-full text-xs transition shadow-xs cursor-pointer"
        >
          <FiPlus className="text-sm stroke-[3]" />
          <span>Add {recordType === "Purchase Return" ? "Purchase Return" : "Debit Note"}</span>
        </button>
      </div>

      {/* ================= 4. TABLE & EMPTY STATE ================= */}
      <div className="flex-1 min-h-0 overflow-auto bg-white flex flex-col justify-between">
        <div>
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 bg-white text-gray-600 text-[11px] font-semibold">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>DATE</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>REF NO.</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>PARTY NAME</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>CATEGOR...</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2">
                  <div className="flex items-center justify-between">
                    <span>TYPE</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>TOTAL</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>RECEIV...</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>BALANCE</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span>STATUS</span> <FiFilter className="text-gray-400 text-[10px]" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-center">PRINT /...</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  className="border-b border-gray-100 hover:bg-blue-50 text-xs"
                >
                  <td className="py-2.5 px-3 text-center text-gray-500">{idx + 1}</td>
                  <td className="py-2.5 px-2">{formatDisplayDate(item.date)}</td>
                  <td className="py-2.5 px-2">{item.refNo}</td>
                  <td className="py-2.5 px-2 font-medium text-gray-900">{item.party}</td>
                  <td className="py-2.5 px-2 text-gray-600">{item.category || "General"}</td>
                  <td className="py-2.5 px-2 text-gray-600">{item.type || "Debit Note"}</td>
                  <td className="py-2.5 px-2 text-right font-medium">{money(item.total)}</td>
                  <td className="py-2.5 px-2 text-right text-gray-600">{money(item.received)}</td>
                  <td className="py-2.5 px-2 text-right text-gray-600">{money(item.balance)}</td>
                  <td className="py-2.5 px-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        item.status === "Paid"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {item.status || "Unpaid"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        printRecord(item);
                      }}
                      className="text-gray-500 hover:text-blue-600 mr-2 p-1.5 rounded hover:bg-gray-100 transition cursor-pointer inline-flex items-center justify-center"
                      title="Print Debit Note"
                    >
                      <FiPrinter className="text-sm" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId(menuId === item.id ? "" : item.id);
                      }}
                      className="text-gray-500 hover:text-gray-700 p-1.5 rounded hover:bg-gray-100 transition cursor-pointer inline-flex items-center justify-center"
                      title="More Options"
                    >
                      <FiMoreVertical className="text-sm" />
                    </button>
                    {menuId === item.id && (
                      <div className="absolute right-3 top-8 z-30 w-36 rounded bg-white p-1 shadow-lg border border-gray-200 text-left">
                        <button
                          onClick={() => {
                            setMenuId("");
                            printRecord(item);
                          }}
                          className="block w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 text-left cursor-pointer"
                        >
                          Print
                        </button>
                        <button
                          onClick={() => {
                            setMenuId("");
                            setEditor({ mode: "edit", value: normalizePurchaseReturn(item) });
                          }}
                          className="block w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 text-left cursor-pointer"
                        >
                          View / Edit
                        </button>
                        <button
                          onClick={() => {
                            setMenuId("");
                            setDeleteConfirm(item);
                          }}
                          className="block w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 text-left cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Screenshot-exact empty state */}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-24 pb-20 select-none">
              {/* Overlapping document illustration */}
              <div className="relative w-28 h-28 mb-3 flex items-center justify-center">
                {/* Back page (angled slightly left) */}
                <div
                  className="absolute w-20 h-24 bg-white border border-gray-300 rounded shadow-xs flex flex-col p-2 space-y-1.5"
                  style={{ transform: "rotate(-10deg) translate(-10px, 4px)" }}
                >
                  <div className="w-8 h-1 bg-gray-200 rounded"></div>
                  <div className="w-14 h-1 bg-gray-200 rounded"></div>
                  <div className="w-11 h-1 bg-gray-200 rounded"></div>
                  <div className="w-13 h-1 bg-gray-200 rounded"></div>
                </div>

                {/* Front page */}
                <div className="relative w-20 h-24 bg-white border border-gray-300 rounded shadow-xs flex flex-col p-2 space-y-1.5 z-10">
                  <div className="w-10 h-1.5 bg-gray-300 rounded mb-1"></div>
                  <div className="w-14 h-1 bg-gray-200 rounded"></div>
                  <div className="w-12 h-1 bg-gray-200 rounded"></div>
                  <div className="w-14 h-1 bg-gray-200 rounded"></div>
                  <div className="w-9 h-1 bg-gray-200 rounded"></div>
                  <div className="mt-auto self-end w-2.5 h-2.5 bg-[#0078d4] rounded-xs"></div>
                </div>
              </div>

              {/* Exact text from screenshot */}
              <h3 className="text-gray-500 font-medium text-xs mt-2 text-center">
                No data is available for {recordType === "All" ? "Debit Note / Purchase Return" : recordType}.
              </h3>
              <p className="text-gray-400 text-[11px] mt-0.5 text-center">
                Please try again after making relevant changes.
              </p>
              <button
                onClick={startNew}
                className="mt-3 flex items-center gap-1.5 bg-[#0078d4] hover:bg-[#006abc] text-white font-medium px-4 py-1.5 rounded-full text-xs transition cursor-pointer"
              >
                <FiPlus className="text-xs" />
                <span>Add {recordType === "Purchase Return" ? "Purchase Return" : "Debit Note"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ================= 5. BOTTOM STATUS / TOTALS FOOTER ================= */}
      <div className="bg-white border-t border-gray-300 px-5 py-2.5 flex items-center justify-between text-xs font-semibold shrink-0">
        <div className="text-gray-700">
          Total Amount:{" "}
          <span className="text-[#107c41] font-bold">
            ₹ {totalAmount.toFixed(2)}
          </span>
        </div>
        <div className="text-gray-700">
          Balance:{" "}
          <span className="font-bold text-gray-800">
            ₹ {totalBalance.toFixed(2)}
          </span>
        </div>
      </div>

      {/* ================= ADD / EDIT DEBIT NOTE MODAL ================= */}
      {editor && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex h-12 shrink-0 items-center justify-between bg-slate-200 px-5">
            <span className="rounded-t-lg bg-white px-5 py-3 font-semibold text-sm">
              {editor.value.type} #{editor.value.refNo}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                title="Settings"
                aria-label="Settings"
                onClick={() => navigate("/settings?tab=transaction")}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-300 hover:text-slate-800 transition cursor-pointer"
              >
                <FiSettings className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setEditor(null)}
                aria-label="Close"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-300 hover:text-slate-800 transition cursor-pointer"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-auto flex-1 bg-[#f8fafc]">
            <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg border border-gray-200 shadow-xs space-y-5">
              <h2 className="text-lg font-bold text-gray-800 border-b pb-2">
                {editor.mode === "edit" ? "Edit" : "New"} {editor.value.type}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Party Name *
                  </label>
                  <input
                    list="debit-parties"
                    value={editor.value.party}
                    onChange={(e) => {
                      const selected = parties.find(
                        (p) => p.partyName === e.target.value
                      );
                      change("party", e.target.value);
                      if (selected?.phone) change("phone", selected.phone);
                    }}
                    placeholder="Search or enter party"
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                  <datalist id="debit-parties">
                    {parties.map((p) => (
                      <option key={p.id} value={p.partyName}>
                        {p.phone}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Ref No.
                  </label>
                  <input
                    type="text"
                    value={editor.value.refNo}
                    onChange={(e) => change("refNo", e.target.value)}
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={editor.value.date}
                    onChange={(e) => change("date", e.target.value)}
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Original Bill No. (Optional)
                  </label>
                  <select
                    value={editor.value.billNumber}
                    onChange={(e) => {
                      const b = bills.find(
                        (item) =>
                          (item.form?.invoiceNumber || item.invoiceNumber) ===
                          e.target.value
                      );
                      change("billNumber", e.target.value);
                      if (b?.form?.customer || b?.partyName) {
                        change("party", b.form?.customer || b.partyName);
                      }
                    }}
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  >
                    <option value="">Select Purchase Bill</option>
                    {bills.map((b) => (
                      <option
                        key={b.id}
                        value={b.form?.invoiceNumber || b.invoiceNumber || ""}
                      >
                        Bill #{b.form?.invoiceNumber || b.invoiceNumber} -{" "}
                        {b.form?.customer || b.partyName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={editor.value.category}
                    onChange={(e) => change("category", e.target.value)}
                    className="w-full border rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Items table in modal */}
              <div className="border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="p-2 text-left w-8">#</th>
                      <th className="p-2 text-left">Item</th>
                      {batchTracking && <th className="p-2 text-left">Batch</th>}
                      <th className="p-2 text-center w-20">Qty</th>
                      <th className="p-2 text-center w-20">Unit</th>
                      <th className="p-2 text-right w-24">Price</th>
                      <th className="p-2 text-right w-28">Amount</th>
                      <th className="p-2 text-center w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(editor.value.rows || editor.value.items || []).map((row, i) => (
                      <tr key={row.id} className="border-b">
                        <td className="p-2 text-center text-gray-500">{i + 1}</td>
                        <td className="p-2 relative">
                          <input
                            type="text"
                            value={row.item}
                            onFocus={() => setOpenItemRow(row.id)}
                            onChange={(e) => {
                              changeRow(row.id, "item", e.target.value);
                              setOpenItemRow(row.id);
                            }}
                            placeholder="Enter or select item"
                            className="w-full border rounded px-2 py-1 text-xs"
                          />
                          {openItemRow === row.id && (
                            <div className="absolute left-2 top-full z-40 max-h-48 w-64 overflow-auto rounded border bg-white shadow-lg">
                              {items
                                .filter((it) =>
                                  String(it.itemName || it.name || "")
                                    .toLowerCase()
                                    .includes(row.item.toLowerCase())
                                )
                                .map((it) => (
                                  <button
                                    type="button"
                                    key={it.id}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      changeRow(row.id, "sourceItemId", it.id);
                                      changeRow(
                                        row.id,
                                        "item",
                                        it.itemName || it.name
                                      );
                                      changeRow(
                                        row.id,
                                        "price",
                                        it.purchasePrice || it.price || ""
                                      );
                                      changeRow(
                                        row.id,
                                        "unit",
                                        it.unit || it.baseUnit || "NONE"
                                      );
                                      if (!row.qty) changeRow(row.id, "qty", "1");
                                      setOpenItemRow("");
                                    }}
                                    className="block w-full px-3 py-1.5 text-left hover:bg-blue-50 text-xs"
                                  >
                                    {it.itemName || it.name}
                                  </button>
                                ))}
                            </div>
                          )}
                        </td>
                        {batchTracking && <td className="p-2"><select value={row.batchNo || ""} onChange={(e) => changeRow(row.id, "batchNo", e.target.value)} className="w-full rounded border px-1 py-1 text-xs"><option value="">Select batch</option>{(items.find((item) => item.id === row.sourceItemId)?.batches || []).map((batch) => <option key={batch.id || batch.batchNo} value={batch.batchNo}>{batch.batchNo} · {batch.openingQty || 0}</option>)}</select></td>}
                        <td className="p-2">
                          <input
                            type="number"
                            value={row.qty}
                            onChange={(e) => changeRow(row.id, "qty", e.target.value)}
                            className="w-full border rounded px-2 py-1 text-center text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.unit}
                            onChange={(e) => changeRow(row.id, "unit", e.target.value)}
                            className="w-full border rounded px-2 py-1 text-center text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={row.price}
                            onChange={(e) => changeRow(row.id, "price", e.target.value)}
                            className="w-full border rounded px-2 py-1 text-right text-xs"
                          />
                        </td>
                        <td className="p-2 text-right font-medium">
                          {money(rowAmount(row))}
                        </td>
                        <td className="p-2 text-center">
                          {(editor.value.rows || editor.value.items || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRow(row.id)}
                              className="text-gray-400 hover:text-red-600 transition cursor-pointer p-1"
                              title="Delete row"
                            >
                              <FiTrash2 className="text-xs" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() =>
                    change("rows", [...editor.value.rows, freshRow()])
                  }
                  className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-3 py-1 rounded text-xs cursor-pointer"
                >
                  + Add Row
                </button>
                <div className="text-right text-sm font-semibold">
                  Total:{" "}
                  {money(
                    editor.value.rows.reduce(
                      (sum, r) => sum + rowAmount(r),
                      0
                    )
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                {editor.mode === "edit" ? (
                  <button
                    type="button"
                    onClick={() => printRecord(editor.value)}
                    className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <FiPrinter className="text-sm" />
                    <span>Print</span>
                  </button>
                ) : <div />}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditor(null)}
                    className="px-4 py-2 border rounded text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    className="px-5 py-2 bg-[#0078d4] text-white rounded text-xs font-medium hover:bg-[#006abc] cursor-pointer"
                  >
                    Save {editor.value.type || "Debit Note"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {deleteConfirm && (
        <ConfirmModal
          isOpen={Boolean(deleteConfirm)}
          title={`Delete ${deleteConfirm.type || "Debit Note"}`}
          message={`Are you sure you want to delete ${deleteConfirm.type || "debit note"} ${deleteConfirm.refNo || ""} for ${deleteConfirm.party || "this party"}? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          danger={true}
          onConfirm={async () => {
            try {
              await transactionsDb.remove(deleteConfirm.id);
              persist(records.filter((r) => r.id !== deleteConfirm.id));
              toast.success("Debit note deleted.");
            } catch (error) {
              toast.error(error.message || "Could not delete this purchase return from database.");
            } finally {
              setDeleteConfirm(null);
            }
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

