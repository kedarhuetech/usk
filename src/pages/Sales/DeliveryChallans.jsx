import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiCalendar, FiChevronDown, FiFilter, FiMoreVertical, FiPlus, FiPrinter, FiSearch, FiX } from "react-icons/fi";
import * as XLSX from "xlsx";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import ReportPrintPreviewModal from "../../components/Common/ReportPrintPreviewModal";
import { getInventoryItems, saveInventoryItem } from "../../services/itemsStorage";
import { getParties } from "../../services/partiesStorage";
import { getCompanyProfile } from "../../services/companyProfileStorage";
import {
  buildUnifiedDocumentHtml,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";
import { getAppSettings } from "../../services/appSettingsStorage.js";
import {
  buildTransactionMessage,
  sendMetaWhatsAppMessage,
} from "../../services/transactionMessageService.js";
import { toast, ConfirmModal } from "../../components/Common/Toast.jsx";
import { transactionsDb } from "../../services/databaseRepository.js";
import { notifyBusinessDataChanged } from "../../services/businessDataChanged.js";
import { getScopedStorageKey } from "../../config/businessConfig.js";

const STORAGE_KEY = "ledgerly:deliveryChallans.v1";
const challanStorageKey = () => getScopedStorageKey(STORAGE_KEY);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const money = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB") : "—";
const freshRow = () => ({ id: crypto.randomUUID(), item: "", description: "", size: "", qty: "", unit: "NONE", price: "", discount: "", tax: "NONE", cess: "" });

function normalizeChallan(item) {
  if (!item) return item;
  const rawRows = (item.rows && item.rows.length > 0)
    ? item.rows
    : (item.items && item.items.length > 0)
    ? item.items
    : [];

  const rows = rawRows.length > 0
    ? rawRows.map((r) => ({
        id: r.id || crypto.randomUUID(),
        item: r.item || r.itemName || r.name || "",
        description: r.description || "",
        size: r.size || "",
        qty: String(r.qty ?? r.quantity ?? 1),
        returnedQty: Number(r.returnedQty || 0),
        unit: r.unit || "NONE",
        price: String(r.price ?? r.unitPrice ?? 0),
        discount: String(r.discount ?? 0),
        tax: String(r.tax ?? "NONE"),
        cess: r.cess || "",
        hsn: r.hsn || r.hsnCode || "",
      }))
    : [freshRow(), freshRow()];

  return {
    ...item,
    id: item.id,
    number: item.documentNumber || item.number || item.refNo || item.invoiceNumber || "",
    party: item.party || item.partyName || item.customerName || item.customer || "Party",
    phone: item.phone || item.partyPhone || "",
    date: item.date || item.transactionDate || (item.createdAt ? item.createdAt.slice(0, 10) : today()),
    dueDate: item.dueDate || item.date || item.transactionDate || today(),
    total: Number(item.total ?? item.totalAmount ?? item.amount ?? 0),
    status: item.status || "Open",
    state: item.state || item.stateOfSupply || "Select",
    billingAddress: item.billingAddress || item.partyAddress || item.address || "",
    shippingAddress: item.shippingAddress || "",
    description: item.description || item.notes || "",
    terms: item.terms || "",
    vehicleNumber: item.vehicleNumber || item.vehicleNo || item.vehicle_no || "",
    driverName: item.driverName || item.driver_name || "",
    ewayBillNo: item.ewayBillNo || item.eWayBillNo || item.e_way_bill_no || "",
    returnHistory: Array.isArray(item.returnHistory) ? item.returnHistory : [],
    rows,
  };
}

const readChallans = () => { try { const value = JSON.parse(localStorage.getItem(challanStorageKey()) || "[]"); return Array.isArray(value) ? value.map(normalizeChallan) : []; } catch { return []; } };
const parseRateNum = (val) => {
  if (val == null || val === "" || String(val).trim().toUpperCase() === "NONE") return 0;
  const m = String(val).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
};
const rowAmount = (row) => {
  const net = Math.max(0, Number(row.qty || 0) * Number(row.price || 0) - (Number(row.qty || 0) * Number(row.price || 0) * Number(row.discount || 0) / 100));
  return net + net * parseRateNum(row.tax) / 100 + net * parseRateNum(row.cess) / 100;
};

export default function DeliveryChallans() {
  const navigate = useNavigate();
  const location = useLocation();
  const [challans, setChallans] = useState(readChallans);
  const [editor, setEditor] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    confirmColor: "red",
    onConfirm: null,
  });
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState("");
  const [openItemRow, setOpenItemRow] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectorSearch, setSelectorSearch] = useState("");
  const [selectorParty, setSelectorParty] = useState("");
  const [selectorPreset, setSelectorPreset] = useState("This Month");
  const [selectorFrom, setSelectorFrom] = useState(() => `${today().slice(0, 7)}-01`);
  const [selectorTo, setSelectorTo] = useState(today);
  const [filterPreset, setFilterPreset] = useState("This Month");
  const [fromDate, setFromDate] = useState(() => `${today().slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(today);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const parties = useMemo(() => getParties(), []);
  const business = useMemo(() => getCompanyProfile(), []);
  const companyDisplayName = business.companyName || business.businessName || "Sai Kirana Stores";
  const companyPhone = business.phoneNumber || business.phone || "";
  const appSettings = getAppSettings();
  const goodsReturnEnabled = Boolean(appSettings.goodsReturnOnDeliveryChallan);

  const [returnModal, setReturnModal] = useState({
    isOpen: false,
    challan: null,
    returnDate: today(),
    returnNotes: "",
    returnItems: [],
  });

  const [previewChallan, setPreviewChallan] = useState(() => {
    if (location.state?.previewChallan) return location.state.previewChallan;
    try {
      const stored = sessionStorage.getItem("ledgerly:previewChallan");
      if (stored) return JSON.parse(stored);
    } catch {}
    if (location.pathname.endsWith("/preview")) {
      const all = readChallans();
      if (all.length > 0) return all[0];
    }
    return null;
  });

  useEffect(() => {
    if (location.state?.previewChallan) {
      setPreviewChallan(location.state.previewChallan);
    }
    if (location.state?.editChallan || location.state?.editInvoice) {
      const incoming = location.state.editChallan || location.state.editInvoice;
      setEditor({ mode: "edit", value: normalizeChallan(incoming) });
    }
  }, [location.state]);

  const closePreview = () => {
    setPreviewChallan(null);
    try { sessionStorage.removeItem("ledgerly:previewChallan"); } catch {}
    if (location.pathname.endsWith("/preview")) {
      if (location.state?.from) {
        navigate(location.state.from);
      } else {
        navigate("/sales/delivery-challan");
      }
    }
  };

  const isItemActive = (item) => item && item.isActive !== false && item.is_active !== 0;
  const inventory = useMemo(() => getInventoryItems().filter((item) => item.type !== "service" && isItemActive(item)), []);
  const filtered = challans.filter((challan) => `${challan.party} ${challan.number} ${challan.status}`.toLowerCase().includes(search.toLowerCase()) && (!fromDate || challan.date >= fromDate) && (!toDate || challan.date <= toDate));
  const conversionCandidates = challans.filter((challan) => challan.status !== "Converted to Sale"
    && (!selectorParty || challan.party.toLowerCase() === selectorParty.toLowerCase())
    && (!selectorFrom || challan.date >= selectorFrom) && (!selectorTo || challan.date <= selectorTo)
    && `${challan.number} ${challan.party}`.toLowerCase().includes(selectorSearch.toLowerCase()));
  const subtotal = editor?.value.rows.reduce((sum, row) => sum + rowAmount(row), 0) || 0;

  useEffect(() => {
    let isMounted = true;
    async function fetchChallans() {
      try {
        const list = await transactionsDb.listByType("delivery_challan");
        if (isMounted && Array.isArray(list)) {
          const normalized = list.map(normalizeChallan);
          setChallans(normalized);
          try {
            localStorage.setItem(challanStorageKey(), JSON.stringify(normalized));
          } catch {}
        }
      } catch {}
    }
    fetchChallans();
    const onDataChanged = () => fetchChallans();
    window.addEventListener("focus", onDataChanged);
    window.addEventListener("storage", onDataChanged);
    window.addEventListener("ledgerly:business-data-changed", onDataChanged);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", onDataChanged);
      window.removeEventListener("storage", onDataChanged);
      window.removeEventListener("ledgerly:business-data-changed", onDataChanged);
    };
  }, []);

  const persist = (next) => {
    setChallans(next);
    localStorage.setItem(challanStorageKey(), JSON.stringify(next));
    notifyBusinessDataChanged();
  };
  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const challanRows = filtered.map((challan) => ({
      Date: dateLabel(challan.date),
      "Challan No.": challan.number,
      Party: challan.party,
      Phone: challan.phone || "",
      "Due Date": dateLabel(challan.dueDate),
      Status: challan.status,
      "Total Amount": Number(challan.total || 0),
      Items: (challan.rows || []).length,
    }));
    const itemRows = filtered.flatMap((challan) => (challan.rows || []).map((row, index) => ({
      "Challan No.": challan.number,
      Date: dateLabel(challan.date),
      Party: challan.party,
      "Line No.": index + 1,
      Item: row.item || "",
      "HSN / SAC": row.hsn || row.sac || "",
      Quantity: Number(row.qty || 0),
      Unit: row.unit || "",
      "Price / Unit": Number(row.price || 0),
      "Discount %": Number(row.discount || 0),
      Amount: rowAmount(row),
    })));
    const challanSheet = XLSX.utils.json_to_sheet(challanRows.length ? challanRows : [{ Note: "No delivery challans match the current filters." }]);
    challanSheet["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 10 }];
    const itemSheet = XLSX.utils.json_to_sheet(itemRows.length ? itemRows : [{ Note: "No challan item rows to export." }]);
    itemSheet["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, challanSheet, "Delivery Challans");
    XLSX.utils.book_append_sheet(workbook, itemSheet, "Items");
    XLSX.writeFile(workbook, `Delivery_Challans_${today()}.xlsx`);
  };

  const printChallan = (challan, autoPrint = false) => {
    if (!challan) return;
    const showAmount = Boolean(appSettings.printAmountInDeliveryChallan);
    const hasAnyReturned = goodsReturnEnabled && (challan.rows || []).some((r) => Number(r.returnedQty || 0) > 0);
    const totalQty = (challan.rows || []).reduce((sum, row) => sum + (Number(row.qty) || 0), 0);

    const partyObj = parties.find(
      (p) => (p.partyName || "").trim().toLowerCase() === (challan.party || "").trim().toLowerCase()
    );
    const partyBillingAddress = challan.billingAddress || partyObj?.billingAddress || partyObj?.address || "";
    const partyShippingAddress = challan.shippingAddress || partyObj?.shippingAddress || "";
    const partyPhone = challan.phone || partyObj?.phone || "";
    const partyGstin = challan.gstin || partyObj?.gstin || "";

    const rows = (challan.rows || []).map((row) => ({
      item: row.item || "Item",
      hsn: row.hsn || row.sac || "—",
      qty: `${row.qty || 1} ${row.unit || ""}`.trim(),
      ...(hasAnyReturned
        ? {
            returnedQty: `${Number(row.returnedQty || 0)} ${row.unit || ""}`.trim(),
            netQty: `${Math.max(0, Number(row.qty || 0) - Number(row.returnedQty || 0))} ${row.unit || ""}`.trim(),
          }
        : {}),
      price: row.price || 0,
      discount: row.discount ? `${row.discount}%` : "—",
      amount: rowAmount(row),
    }));

    const columns = [
      { key: "index", label: "#", align: "center", width: "40px" },
      { key: "item", label: "Item Description", align: "left" },
      { key: "hsn", label: "HSN/SAC", align: "center", width: "90px" },
      { key: "qty", label: hasAnyReturned ? "Dispatched" : "Qty", align: "center", width: "90px" },
      ...(hasAnyReturned
        ? [
            { key: "returnedQty", label: "Returned", align: "center", width: "90px" },
            { key: "netQty", label: "Net Delivered", align: "center", width: "90px" },
          ]
        : []),
      ...(showAmount
        ? [
            { key: "price", label: "Rate", align: "right", width: "100px", formatMoney: true },
            { key: "discount", label: "Discount", align: "center", width: "80px" },
            { key: "amount", label: "Amount", align: "right", width: "120px", formatMoney: true },
          ]
        : []),
    ];

    const totals = showAmount
      ? {
          subtotal: challan.total,
          total: challan.total,
          received: 0,
          balance: challan.total,
        }
      : [
          { label: "Total Quantity", value: `${totalQty} Units`, isGrand: true },
        ];

    const html = buildUnifiedDocumentHtml({
      title: "Delivery Challan",
      documentNumber: challan.number || "",
      date: dateLabel(challan.date),
      dueDate: dateLabel(challan.dueDate),
      status: challan.status || "Open",
      partyName: challan.party || "",
      partyPhone,
      partyBillingAddress,
      partyShippingAddress,
      partyGstin,
      columns,
      rows,
      totals,
      notes: "Delivery Challan — Goods transported for delivery.",
      autoPrint,
    });

    openPrintWindow(html, autoPrint);
  };

  const getNetChallanForConversion = (challan) => {
    if (!goodsReturnEnabled) return challan;
    const netRows = (challan.rows || [])
      .map((row) => {
        const returned = Number(row.returnedQty || 0);
        const origQty = Number(row.qty || 0);
        const netQty = Math.max(0, origQty - returned);
        return {
          ...row,
          qty: String(netQty),
        };
      })
      .filter((r) => Number(r.qty) > 0);
    return {
      ...challan,
      rows: netRows,
    };
  };

  const openReturnGoodsModal = (challan) => {
    if (!challan) return;
    const items = (challan.rows || [])
      .map((row) => {
        const dispatched = Number(row.qty || 0);
        const alreadyReturned = Number(row.returnedQty || 0);
        const remaining = Math.max(0, dispatched - alreadyReturned);
        return {
          rowId: row.id,
          item: row.item,
          unit: row.unit || "Units",
          dispatched,
          alreadyReturned,
          remaining,
          returnQty: remaining > 0 ? remaining : 0,
        };
      })
      .filter((r) => r.remaining > 0);

    if (items.length === 0) {
      toast.error("All items on this delivery challan have already been returned.");
      return;
    }

    setReturnModal({
      isOpen: true,
      challan,
      returnDate: today(),
      returnNotes: "",
      returnItems: items,
    });
  };

  const handleConfirmReturn = async () => {
    const { challan, returnDate, returnNotes, returnItems } = returnModal;
    if (!challan) return;

    const activeReturns = returnItems.filter((item) => Number(item.returnQty) > 0);
    if (activeReturns.length === 0) {
      toast.error("Please specify a return quantity greater than 0.");
      return;
    }

    for (const item of activeReturns) {
      if (Number(item.returnQty) > item.remaining) {
        toast.error(`Return quantity for "${item.item}" cannot exceed remaining quantity (${item.remaining}).`);
        return;
      }
    }

    const returnMap = new Map(activeReturns.map((r) => [r.rowId, Number(r.returnQty)]));

    const updatedRows = (challan.rows || []).map((row) => {
      const addReturned = returnMap.get(row.id) || 0;
      const currentReturned = Number(row.returnedQty || 0);
      return {
        ...row,
        returnedQty: currentReturned + addReturned,
      };
    });

    const totalDelivered = updatedRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
    const totalReturned = updatedRows.reduce((sum, r) => sum + (Number(r.returnedQty) || 0), 0);
    const newStatus = totalReturned >= totalDelivered && totalDelivered > 0
      ? "Fully Returned"
      : totalReturned > 0
      ? "Partially Returned"
      : (challan.status || "Open");

    const newHistoryEntry = {
      id: crypto.randomUUID(),
      returnNumber: `GR-${Date.now().toString().slice(-6)}`,
      returnDate: returnDate || today(),
      notes: returnNotes || "",
      returnedAt: new Date().toISOString(),
      items: activeReturns.map((r) => ({
        item: r.item,
        returnedQty: Number(r.returnQty),
        unit: r.unit,
      })),
    };

    const updatedChallan = {
      ...challan,
      rows: updatedRows,
      status: newStatus,
      returnHistory: [...(challan.returnHistory || []), newHistoryEntry],
    };

    await transactionsDb.save({
      ...updatedChallan,
      transactionType: "delivery_challan",
      type: "delivery_challan",
    });

    // Update local inventory cache after backend confirms persistence
    try {
      const allInventory = getInventoryItems();
      activeReturns.forEach((ret) => {
        const match = allInventory.find(
          (it) => String(it.itemName || it.name || "").trim().toLowerCase() === String(ret.item || "").trim().toLowerCase()
        );
        if (match) {
          const prevStock = Number(match.currentStock ?? match.stock ?? 0);
          const updatedStock = prevStock + Number(ret.returnQty || 0);
          saveInventoryItem(
            {
              ...match,
              stock: updatedStock,
              currentStock: updatedStock,
              current_stock: updatedStock,
            },
            { skipRemoteSync: true }
          );
        }
      });
    } catch (e) {
      console.warn("Inventory cache update notice on goods return:", e);
    }

    persist(challans.map((c) => (c.id === updatedChallan.id ? updatedChallan : c)));
    if (previewChallan && previewChallan.id === updatedChallan.id) {
      setPreviewChallan(updatedChallan);
    }
    setReturnModal({ isOpen: false, challan: null, returnDate: today(), returnNotes: "", returnItems: [] });
    toast.success("Goods return recorded. Inventory stock restored.");
  };

  const convertOne = (challan) => {
    const netChallan = getNetChallanForConversion(challan);
    if (!netChallan.rows || netChallan.rows.length === 0) {
      toast.error("This challan has no remaining delivered items to bill.");
      return;
    }
    navigate("/sales/sale-invoices/new", { state: { from: "/sales/delivery-challan", deliveryChallansConversion: [netChallan] } });
  };

  const openBulkConvert = () => { setSelectedIds([]); setSelectorSearch(""); setSelectorParty(""); setSelectorPreset("This Month"); setSelectorFrom(`${today().slice(0, 7)}-01`); setSelectorTo(today()); setSelectorOpen(true); };
  const changeSelectorPreset = (preset) => {
    setSelectorPreset(preset);
    if (preset === "All Time") { setSelectorFrom(""); setSelectorTo(""); }
    else if (preset === "Today") { setSelectorFrom(today()); setSelectorTo(today()); }
    else { setSelectorFrom(`${today().slice(0, 7)}-01`); setSelectorTo(today()); }
  };
  const convertSelected = () => {
    const selected = conversionCandidates
      .filter((challan) => selectedIds.includes(challan.id))
      .map(getNetChallanForConversion)
      .filter((c) => c.rows && c.rows.length > 0);

    if (!selected.length) {
      toast.error("Selected challans have no remaining items to convert.");
      return;
    }
    const partiesInSelected = new Set(selected.map((c) => (c.party || "").trim().toLowerCase()).filter(Boolean));
    if (partiesInSelected.size > 1) {
      toast.error("Please select delivery challans belonging to the same customer for bulk conversion.");
      return;
    }
    setSelectorOpen(false);
    navigate("/sales/sale-invoices/new", { state: { from: "/sales/delivery-challan", deliveryChallansConversion: selected } });
  };
  const startNew = () => setEditor({ mode: "new", value: { id: "", number: String(Math.max(0, ...challans.map((entry) => Number(entry.number) || 0)) + 1), party: "", phone: "", date: today(), dueDate: today(), state: "Select", rows: [freshRow(), freshRow()], description: "", status: "Open" } });
  const change = (key, value) => setEditor((current) => ({ ...current, value: { ...current.value, [key]: value } }));
  const changeRow = (id, key, value) => setEditor((current) => ({ ...current, value: { ...current.value, rows: current.value.rows.map((row) => row.id === id ? { ...row, [key]: value } : row) } }));
  const save = async () => {
    if (!editor.value.party.trim()) {
      toast.error("Please enter or select a Party Name.");
      return;
    }

    const allInventory = getInventoryItems();
    const originalChallan = editor.mode === "edit" ? challans.find((c) => c.id === editor.value.id) : null;
    const originalRowItemNames = new Set(
      (originalChallan?.rows || []).map((r) => String(r.item || "").trim().toLowerCase()).filter(Boolean)
    );
    const inactiveRow = editor.value.rows.find((row) => {
      const name = String(row.item || "").trim().toLowerCase();
      if (!name) return false;
      if (originalRowItemNames.has(name)) return false;
      const match = allInventory.find((it) => (it.id && it.id === row.itemId) || String(it.itemName || it.name || "").trim().toLowerCase() === name);
      return match && (match.isActive === false || match.is_active === 0);
    });
    if (inactiveRow) {
      toast.error(`Item "${inactiveRow.item}" is inactive and cannot be added.`);
      return;
    }

    const saved = { ...editor.value, id: editor.value.id || crypto.randomUUID(), rows: editor.value.rows.filter((row) => row.item || row.qty), total: subtotal };

    try {
      // Save directly to MySQL transactions table
      await transactionsDb.save({
        ...saved,
        transactionType: "delivery_challan",
        type: "delivery_challan",
        documentNumber: saved.number,
        transactionDate: saved.date,
        dueDate: saved.dueDate,
        partyName: saved.party,
        totalAmount: Number(saved.total || 0),
        terms: saved.terms || "",
        notes: saved.description || "",
        description: saved.description || "",
        vehicleNo: saved.vehicleNumber || saved.vehicleNo || "",
        vehicleNumber: saved.vehicleNumber || saved.vehicleNo || "",
        driverName: saved.driverName || "",
        eWayBillNo: saved.ewayBillNo || saved.eWayBillNo || "",
        ewayBillNo: saved.ewayBillNo || saved.eWayBillNo || "",
        billingAddress: saved.billingAddress || "",
        shippingAddress: saved.shippingAddress || saved.billingAddress || "",
        items: (saved.rows || []).map((r) => ({
          itemName: r.item,
          description: r.description,
          quantity: Number(r.qty || 1),
          unitPrice: Number(r.price || 0),
          discountPercent: Number(r.discount || 0),
          totalAmount: rowAmount(r),
        })),
      });

      persist(editor.mode === "edit" ? challans.map((entry) => entry.id === saved.id ? saved : entry) : [saved, ...challans]);
      setEditor(null);
      toast.success(editor.mode === "edit" ? "Delivery challan updated." : "Delivery challan created.");
    } catch (err) {
      toast.error(err.message || "Failed to persist delivery challan.");
      return;
    }

    // Auto-dispatch Meta WhatsApp transaction message if enabled in settings
    try {
      const currentSettings = getAppSettings();
      if ((currentSettings.txnMsgSendToParty ?? true) && currentSettings.txnMsgAutoDeliveryChallan) {
        const phone = (saved.phone || "").trim();
        if (phone) {
          const msg = buildTransactionMessage({
            type: "deliveryChallan",
            number: saved.number,
            amount: saved.total || 0,
            balance: saved.total || 0,
            settings: currentSettings,
          });
          sendMetaWhatsAppMessage({ phone, message: msg }).catch(() => {});
        }
      }
    } catch {}
  };
  const act = (action, challan) => {
    setMenuId("");
    if (action === "View/Edit") setEditor({ mode: "edit", value: normalizeChallan(challan) });
    if (action === "Return Goods") openReturnGoodsModal(challan);
    if (action === "Delete") {
      setConfirmModal({
        isOpen: true,
        title: "Delete Delivery Challan",
        message: `Delete delivery challan ${challan.number}?`,
        confirmText: "Delete",
        confirmColor: "red",
        onConfirm: () => {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          persist(challans.filter((entry) => entry.id !== challan.id));
          transactionsDb.remove(challan.id).catch(() => {});
          toast.success(`Challan ${challan.number} deleted.`);
        },
      });
    }
    if (action === "Print") printChallan(challan, true);
    if (action === "Open PDF") printChallan(challan, false);
    if (action === "Preview") setPreviewChallan(challan);
  };

  return <main className="flex h-full min-h-0 flex-col gap-1.5 bg-slate-100 p-1.5 text-slate-700">
    <div className="flex h-[66px] shrink-0 items-center justify-center border-b-2 border-sky-500 bg-white text-lg font-bold text-slate-700">DELIVERY CHALLAN</div>
    <section className="flex shrink-0 flex-wrap items-center gap-4 bg-white px-6 py-5 shadow-sm">
      <label className="relative text-lg font-semibold"> <select value={filterPreset} onChange={(event) => setFilterPreset(event.target.value)} className="appearance-none bg-transparent pr-7 outline-none">{["This Month", "Today", "All Time", "Custom"].map((preset) => <option key={preset}>{preset}</option>)}</select><FiChevronDown className="pointer-events-none absolute right-0 top-1.5" /></label>
      <span className="flex items-center gap-2 rounded border px-3 py-2 text-sm text-slate-600"><span className="bg-slate-400 px-2 py-1 font-semibold text-white">Between</span><FiCalendar /><input aria-label="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="w-32 outline-none" />To<input aria-label="To date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="w-32 outline-none" /></span>
      <div className="ml-auto flex gap-6"><button type="button" onClick={exportExcel} className="flex flex-col items-center gap-1 text-sm"><span className="text-2xl text-emerald-700">▦</span>Excel Report</button><button type="button" onClick={() => setPrintModalOpen(true)} className="flex flex-col items-center gap-1 text-sm"><FiPrinter className="text-2xl" />Print</button></div>
    </section>
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-4"><div className="flex flex-wrap items-center justify-between gap-3 py-2"><h2 className="text-lg font-semibold">TRANSACTIONS</h2><div className="flex flex-wrap items-center gap-3"><label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search challans" className="h-10 w-56 rounded border border-slate-300 pl-9 pr-3 outline-none" /></label><Button onClick={openBulkConvert} className="border border-rose-500 text-rose-600">Bulk Convert To Sale</Button><Button onClick={startNew} className="rounded-md bg-blue-600 text-white"><FiPlus /> Add Delivery Challan</Button></div></div>
      {filtered.length ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[950px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs font-bold text-slate-500">
              <tr>
                {["DATE", "PARTY", "CHALLAN NO.", "DUE DATE", "TOTAL AMOUNT", "STATUS", "ACTION"].map((heading) => (
                  <th key={heading} className="border-y border-slate-200 px-3 py-4">
                    {heading}
                    {heading !== "ACTION" && <FiFilter className="ml-2 inline" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((challan) => (
                <tr key={challan.id} className="border-b border-slate-100 odd:bg-sky-100 even:bg-white">
                  <td className="px-3 py-4">{dateLabel(challan.date)}</td>
                  <td className="px-3 py-4 font-medium">{challan.party}</td>
                  <td className="px-3 py-4">{challan.number}</td>
                  <td className="px-3 py-4">
                    {dateLabel(challan.dueDate)} Due: {challan.dueDate === today() ? "Today" : "—"}
                  </td>
                  <td className="px-3 py-4 text-right">{money(challan.total)}</td>
                  <td className="px-3 py-4">
                    {challan.status === "Converted to Sale" && (
                      <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                        Converted to Sale
                      </span>
                    )}
                    {challan.status === "Fully Returned" && (
                      <span className="inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700">
                        Fully Returned
                      </span>
                    )}
                    {challan.status === "Partially Returned" && (
                      <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                        Partially Returned
                      </span>
                    )}
                    {!["Converted to Sale", "Fully Returned", "Partially Returned"].includes(challan.status) && (
                      <span className="font-semibold text-blue-600">
                        {challan.status || "Open"}
                      </span>
                    )}
                  </td>
                  <td className="relative px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={challan.status === "Converted to Sale" || challan.status === "Fully Returned"}
                        onClick={() => convertOne(challan)}
                        className="h-8 rounded-sm bg-slate-100 px-3 text-xs text-blue-600 shadow disabled:opacity-40"
                      >
                        Convert to Sale
                      </Button>
                      {goodsReturnEnabled && challan.status !== "Converted to Sale" && challan.status !== "Fully Returned" && (
                        <button
                          type="button"
                          onClick={() => openReturnGoodsModal(challan)}
                          className="h-8 rounded-sm bg-amber-50 border border-amber-300 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 shadow transition cursor-pointer"
                          title="Record returned goods for this challan"
                        >
                          Return Goods
                        </button>
                      )}
                      <button
                        aria-label="Challan actions"
                        onClick={() => setMenuId(menuId === challan.id ? "" : challan.id)}
                        className="p-2 text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        <FiMoreVertical />
                      </button>
                    </div>
                    {menuId === challan.id && (
                      <div className="absolute right-3 top-10 z-20 w-48 rounded-lg bg-white p-1 shadow-xl border border-slate-200">
                        {["View/Edit", "Delete", "Open PDF", "Preview", "Print"].map((action) => (
                          <button
                            key={action}
                            onClick={() => act(action, challan)}
                            className="block w-full rounded px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-blue-50"
                          >
                            {action}
                          </button>
                        ))}
                        {goodsReturnEnabled && challan.status !== "Converted to Sale" && challan.status !== "Fully Returned" && (
                          <button
                            onClick={() => act("Return Goods", challan)}
                            className="block w-full rounded px-3 py-2 text-left text-xs font-bold text-amber-700 hover:bg-amber-50 border-t border-slate-100"
                          >
                            Return Goods
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <div className="mb-5 grid h-36 w-36 place-items-center rounded-full bg-blue-50 text-6xl text-sky-500">
            ▤
          </div>
          <h3 className="text-lg font-semibold">No Transactions to show</h3>
          <p className="mt-2 text-slate-400">You haven't added any delivery challans yet.</p>
          <Button onClick={startNew} className="mt-7 rounded-full bg-rose-600 px-6 py-3 text-base text-white">
            <FiPlus /> Add Delivery Challan
          </Button>
        </div>
      )}
    </Card>

    {previewChallan && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-sm">
        <section className="flex max-h-[96vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-6 bg-slate-50">
            <div className="flex items-center gap-3">
              {location.state?.from && (
                <button
                  type="button"
                  onClick={closePreview}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                >
                  <FiArrowLeft className="h-4 w-4" /> Back to Invoices
                </button>
              )}
              <h2 className="text-lg font-bold text-slate-800">Delivery Challan Preview</h2>
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                #{previewChallan.number}
              </span>
            </div>
            <button
              onClick={closePreview}
              aria-label="Close preview"
              className="rounded-lg p-1.5 text-2xl text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            >
              ×
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4 sm:p-8">
            <div className="mx-auto max-w-[920px] rounded-lg border border-slate-300 bg-white p-6 sm:p-10 shadow-md text-slate-900">
              <div className="text-center pb-6 border-b border-slate-200">
                <h3 className="text-2xl font-black text-slate-900">{companyDisplayName}</h3>
                {companyPhone && <p className="mt-1 text-sm font-medium text-slate-500">Phone: {companyPhone}</p>}
                <h1 className="mt-4 inline-block rounded bg-sky-50 px-6 py-1.5 text-lg font-black tracking-wider text-sky-700 uppercase">
                  Delivery Challan Report
                </h1>
              </div>

              <div className="my-6 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-sm border border-slate-200">
                <div>
                  <p className="text-slate-500">Challan No:</p>
                  <p className="font-bold text-slate-900 text-base">{previewChallan.number}</p>
                  <p className="mt-2 text-slate-500">Date:</p>
                  <p className="font-semibold text-slate-800">{dateLabel(previewChallan.date)}</p>
                  {previewChallan.dueDate && (
                    <>
                      <p className="mt-2 text-slate-500">Due Date:</p>
                      <p className="font-semibold text-slate-800">{dateLabel(previewChallan.dueDate)}</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-slate-500">Party Name (Customer):</p>
                  <p className="font-bold text-slate-900 text-base">{previewChallan.party}</p>
                  {previewChallan.phone && (
                    <>
                      <p className="mt-2 text-slate-500">Phone:</p>
                      <p className="font-semibold text-slate-800">{previewChallan.phone}</p>
                    </>
                  )}
                  <p className="mt-2 text-slate-500">Status:</p>
                  <span className="inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-700">
                    {previewChallan.status || "Open"}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-xs font-bold uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-3 w-12 text-center">#</th>
                      <th className="px-3 py-3">Item Name</th>
                      <th className="px-3 py-3 text-center">HSN / SAC</th>
                      <th className="px-3 py-3 text-center">{goodsReturnEnabled ? "Dispatched" : "Qty"}</th>
                      {goodsReturnEnabled && (
                        <>
                          <th className="px-3 py-3 text-center text-amber-700">Returned</th>
                          <th className="px-3 py-3 text-center text-emerald-700">Net Retained</th>
                        </>
                      )}
                      <th className="px-3 py-3 text-center">Unit</th>
                      {Boolean(getAppSettings().printAmountInDeliveryChallan) && (
                        <>
                          <th className="px-3 py-3 text-right">Price / Unit</th>
                          <th className="px-3 py-3 text-right">Discount</th>
                          <th className="px-3 py-3 text-right">Amount</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(previewChallan.rows || []).map((row, index) => (
                      <tr key={row.id || index} className="hover:bg-slate-50/60">
                        <td className="px-3 py-3 text-center text-slate-500">{index + 1}</td>
                        <td className="px-3 py-3 font-semibold text-slate-800">{row.item || "—"}</td>
                        <td className="px-3 py-3 text-center text-slate-600">{row.hsn || row.sac || "—"}</td>
                        <td className="px-3 py-3 text-center font-medium text-slate-800">{row.qty || "0"}</td>
                        {goodsReturnEnabled && (
                          <>
                            <td className="px-3 py-3 text-center font-medium text-amber-700">
                              {row.returnedQty ? `${row.returnedQty}` : "0"}
                            </td>
                            <td className="px-3 py-3 text-center font-bold text-emerald-700">
                              {Math.max(0, Number(row.qty || 0) - Number(row.returnedQty || 0))}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-3 text-center text-slate-600">{row.unit || "—"}</td>
                        {Boolean(getAppSettings().printAmountInDeliveryChallan) && (
                          <>
                            <td className="px-3 py-3 text-right text-slate-700">{money(row.price)}</td>
                            <td className="px-3 py-3 text-right text-slate-600">
                              {money(Number(row.qty || 0) * Number(row.price || 0) * Number(row.discount || 0) / 100)} ({row.discount || 0}%)
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-slate-900">{money(rowAmount(row))}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {goodsReturnEnabled && previewChallan.returnHistory && previewChallan.returnHistory.length > 0 && (
                <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2">
                    Goods Return History
                  </h4>
                  <div className="space-y-2">
                    {previewChallan.returnHistory.map((ret, i) => (
                      <div
                        key={ret.id || i}
                        className="flex flex-wrap items-center justify-between border-b border-amber-200/60 pb-1.5 last:border-b-0 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{ret.returnNumber || `Return #${i + 1}`}</span>
                          <span className="text-slate-500 ml-2">({dateLabel(ret.returnDate)})</span>
                          {ret.notes && <span className="text-slate-600 ml-2 italic">— "{ret.notes}"</span>}
                        </div>
                        <div className="font-semibold text-amber-800">
                          {(ret.items || []).map((it) => `${it.item}: ${it.returnedQty} ${it.unit || ""}`).join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <div className="w-80 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Quantity</span>
                    <span className="font-semibold text-slate-800">
                      {(previewChallan.rows || []).reduce((sum, row) => sum + (Number(row.qty) || 0), 0)}
                    </span>
                  </div>
                  {Boolean(getAppSettings().printAmountInDeliveryChallan) && (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span className="font-semibold text-slate-800">{money(previewChallan.total)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-black text-sky-700">
                        <span>Total Amount</span>
                        <span>{money(previewChallan.total)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
            <button
              onClick={() => printChallan(previewChallan)}
              className="rounded-lg border border-rose-500 px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              Open PDF
            </button>
            <button
              onClick={() => printChallan(previewChallan, true)}
              className="rounded-lg border border-rose-500 px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              Print
            </button>
            <button
              onClick={() => printChallan(previewChallan, true)}
              className="rounded-lg border border-rose-500 px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              Save PDF
            </button>
            <button
              onClick={() => {
                window.location.href = `mailto:?subject=${encodeURIComponent(
                  `Delivery Challan ${previewChallan.number}`
                )}&body=${encodeURIComponent("Please find attached the delivery challan.")}`;
              }}
              className="rounded-lg border border-rose-500 px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              Email PDF
            </button>
            {goodsReturnEnabled && previewChallan.status !== "Converted to Sale" && previewChallan.status !== "Fully Returned" && (
              <button
                type="button"
                onClick={() => {
                  const target = previewChallan;
                  closePreview();
                  openReturnGoodsModal(target);
                }}
                className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 shadow"
              >
                Return Goods
              </button>
            )}
            <button
              onClick={closePreview}
              className="rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-rose-700"
            >
              Close
            </button>
          </footer>
        </section>
      </div>
    )}

    {selectorOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4"><section className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-6 py-5"><h2 className="text-xl font-semibold">Select delivery challans to convert</h2><button onClick={() => setSelectorOpen(false)} aria-label="Close"><FiX className="text-2xl"/></button></header><div className="space-y-5 overflow-auto px-6 py-5"><label className="block max-w-md text-sm text-slate-500">Customer<select value={selectorParty} onChange={(event) => setSelectorParty(event.target.value)} className="mt-1 h-12 w-full rounded border bg-white px-3"><option value="">All customers</option>{parties.map((party) => <option key={party.id} value={party.partyName}>{party.partyName}</option>)}</select></label><div className="flex flex-wrap items-center gap-3 border-y py-4"><span className="font-semibold">Filter By:</span><select value={selectorPreset} onChange={(event) => changeSelectorPreset(event.target.value)} className="rounded px-3 py-2">{["This Month", "Today", "All Time"].map((preset) => <option key={preset}>{preset}</option>)}</select><span>Between</span><input type="date" value={selectorFrom} onChange={(event) => { setSelectorFrom(event.target.value); setSelectorPreset("Custom"); }} className="rounded border p-2"/><span>To</span><input type="date" value={selectorTo} onChange={(event) => { setSelectorTo(event.target.value); setSelectorPreset("Custom"); }} className="rounded border p-2"/></div><div className="flex items-center justify-between gap-4"><label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400"/><input value={selectorSearch} onChange={(event) => setSelectorSearch(event.target.value)} placeholder="Search by challan no." className="h-10 w-80 rounded-full border pl-9 pr-3"/></label><span className="italic text-slate-400">{conversionCandidates.length} challans found</span></div><div className="max-h-[45vh] overflow-auto"><table className="w-full border-collapse text-left"><thead className="sticky top-0 bg-slate-100"><tr><th className="border p-3"><input type="checkbox" checked={conversionCandidates.length > 0 && conversionCandidates.every((challan) => selectedIds.includes(challan.id))} onChange={(event) => setSelectedIds(event.target.checked ? conversionCandidates.map((challan) => challan.id) : [])}/> Select All</th>{["DATE", "CHALLAN NO.", "DUE DATE", "TOTAL AMOUNT (₹)"].map((label) => <th key={label} className="border p-3">{label}</th>)}</tr></thead><tbody>{conversionCandidates.map((challan) => <tr key={challan.id}><td className="border p-3"><input type="checkbox" checked={selectedIds.includes(challan.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, challan.id] : ids.filter((id) => id !== challan.id))}/></td><td className="border p-3">{dateLabel(challan.date)}</td><td className="border p-3">{challan.number}</td><td className="border p-3">{dateLabel(challan.dueDate)}</td><td className="border p-3">{money(challan.total)}</td></tr>)}</tbody></table>{!conversionCandidates.length && <p className="p-12 text-center text-slate-400">No open delivery challans match the selected filters.</p>}</div></div><footer className="flex justify-end gap-3 border-t px-6 py-4"><Button onClick={() => setSelectorOpen(false)} className="bg-slate-100">Cancel</Button><Button disabled={!selectedIds.length} onClick={convertSelected} className="bg-blue-600 text-white">Convert {selectedIds.length} Challans To Sale</Button></footer></section></div>}

    {editor && <div className="fixed inset-0 z-50 flex flex-col bg-white"><div className="flex h-12 shrink-0 items-center gap-3 bg-slate-200 px-5"><div className="flex items-center gap-2 rounded-t-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800"><span>Delivery Challan #{editor.value.number}</span><button type="button" onClick={() => setEditor(null)} title="Close tab" aria-label="Close Delivery Challan" className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><FiX className="h-4 w-4" /></button></div><button onClick={startNew} className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-white"><FiPlus /></button><div className="ml-auto flex gap-5 text-xl text-slate-500"><button type="button" title="Settings" onClick={() => navigate("/settings?tab=transaction")} className="hover:text-slate-700">⚙</button><button onClick={() => setEditor(null)} title="Close"><FiX /></button></div></div><header className="flex h-[74px] shrink-0 items-center border-b px-7"><h1 className="text-xl font-bold">Delivery Challan</h1></header>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f3]"><section className="grid min-h-[345px] grid-cols-1 gap-8 px-7 py-8 lg:grid-cols-[1fr_420px]"><div className="grid content-start gap-5 sm:grid-cols-[minmax(280px,1fr)_225px]"><div><label className="block text-sm text-slate-500">Customer *</label><input list="challan-parties" value={editor.value.party} onChange={(event) => { const party = parties.find((entry) => entry.partyName === event.target.value); change("party", event.target.value); if (party) change("phone", party.phone || ""); }} placeholder="Search by Name/Phone *" className="mt-1 h-14 w-full rounded-md border bg-white px-4"/><datalist id="challan-parties">{parties.map((party) => <option key={party.id} value={party.partyName}>{party.phone}</option>)}</datalist><input value={editor.value.phone} onChange={(event) => change("phone", event.target.value)} placeholder="Phone No." className="mt-3 h-12 w-full rounded-md border bg-white px-4"/></div><div className="space-y-3"><label className="flex items-center justify-between gap-4 text-slate-500">Challan No.<input value={editor.value.number} onChange={(event) => change("number", event.target.value)} className="w-36 border-b bg-transparent p-2 text-slate-800"/></label><label className="flex items-center justify-between gap-4 text-slate-500">Invoice Date<input type="date" value={editor.value.date} onChange={(event) => change("date", event.target.value)} className="w-44 border-b bg-transparent p-2 text-slate-800"/></label><label className="flex items-center justify-between gap-4 text-slate-500">Due Date<input type="date" value={editor.value.dueDate} onChange={(event) => change("dueDate", event.target.value)} className="w-44 border-b bg-transparent p-2 text-slate-800"/></label><label className="flex items-center justify-between gap-4 text-slate-500">State of supply<select value={editor.value.state} onChange={(event) => change("state", event.target.value)} className="w-44 bg-transparent p-2 text-slate-800"><option>Select</option>{["Maharashtra", "Gujarat", "Karnataka", "Delhi", "Tamil Nadu", "Telangana"].map((state) => <option key={state}>{state}</option>)}</select></label></div></div></section>
        <div className="overflow-x-auto bg-white"><table className="w-full min-w-[1450px] border-collapse text-sm"><thead><tr className="h-14 bg-white text-center font-semibold">{["#", "ITEM", "DESCRIPTION", "SIZE", "QTY", "UNIT", "PRICE/UNIT", "DISCOUNT %", "DISCOUNT AMOUNT", "TAX %", "TAX AMOUNT", "ADD CESS", "AMOUNT"].map((heading) => <th key={heading} className="border border-slate-300 px-2">{heading}</th>)}</tr></thead><tbody>{editor.value.rows.map((row, index) => <tr key={row.id} className="h-14 odd:bg-slate-100 even:bg-slate-50"><td className="border px-3 text-center">{index + 1}</td><td className="border"><div className="relative h-full"><input value={row.item} onFocus={() => setOpenItemRow(row.id)} onChange={(event) => { changeRow(row.id, "item", event.target.value); setOpenItemRow(row.id); }} placeholder="Select item" className="h-full w-full bg-transparent px-3"/>{openItemRow === row.id && <div className="absolute left-0 top-full z-40 max-h-56 w-72 overflow-auto rounded border bg-white p-1 shadow-xl">{inventory.filter((item) => String(item.itemName || item.name).toLowerCase().includes(row.item.toLowerCase())).map((item) => <button type="button" key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { changeRow(row.id, "item", item.itemName || item.name); changeRow(row.id, "unit", item.unit || item.baseUnit || "NONE"); changeRow(row.id, "price", item.salePrice || item.price || ""); if (!row.qty) changeRow(row.id, "qty", "1"); setOpenItemRow(""); }} className="block w-full px-3 py-2 text-left hover:bg-blue-50">{item.itemName || item.name}</button>)}</div>}</div></td>{[["description", "text"], ["size", "text"], ["qty", "number"], ["unit", "text"], ["price", "number"], ["discount", "number"]].map(([key, type]) => <td key={key} className="border"><input type={type} value={row[key]} onChange={(event) => changeRow(row.id, key, event.target.value)} className="h-full w-full bg-transparent px-2 text-center"/></td>)}<td className="border text-right">{money(Number(row.qty || 0) * Number(row.price || 0) * Number(row.discount || 0) / 100)}</td><td className="border"><select value={row.tax} onChange={(event) => changeRow(row.id, "tax", event.target.value)} className="h-full w-full bg-transparent"><option value="NONE">Select</option>{[5, 12, 18, 28].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></td><td className="border text-right">{money(rowAmount(row) - rowAmount({ ...row, tax: 0, cess: 0 }))}</td><td className="border"><input type="number" value={row.cess} onChange={(event) => changeRow(row.id, "cess", event.target.value)} className="w-full px-2"/></td><td className="border px-2 text-right">{money(rowAmount(row))}</td></tr>)}</tbody><tfoot><tr className="h-14 font-semibold"><td className="border px-2"><button onClick={() => change("rows", [...editor.value.rows, freshRow()])} className="rounded border border-blue-400 px-3 py-2 text-blue-600">ADD ROW</button></td><td colSpan="3" className="border px-3 text-right">TOTAL</td><td className="border text-center">{editor.value.rows.reduce((sum, row) => sum + (Number(row.qty) || 0), 0)}</td><td colSpan="7" className="border"/><td className="border px-3 text-right">{money(subtotal)}</td></tr></tfoot></table></div>
        <section className="grid min-h-72 gap-6 px-7 py-8 lg:grid-cols-[1fr_1fr_1fr]"><button type="button" onClick={() => change("terms", "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.")} className="h-14 rounded border text-slate-500 hover:text-blue-600 hover:border-blue-300">☷ ADD TERMS &amp; CONDITIONS</button><textarea value={editor.value.description} onChange={(event) => change("description", event.target.value)} placeholder="Description" className="h-24 rounded border bg-white p-3"/><div className="flex items-start justify-end gap-3"><label className="flex items-center gap-2"><input type="checkbox" defaultChecked/>Round Off</label><b className="pt-2">Total</b><div className="grid h-12 min-w-48 place-items-center rounded border bg-white font-bold">{money(Math.round(subtotal))}</div></div></section>
      </div><footer className="flex shrink-0 justify-end gap-3 border-t bg-white px-5 py-3"><Button onClick={() => printChallan({ ...editor.value, total: Math.round(subtotal) }, false)} className="border border-blue-300 text-blue-600">Share</Button><Button onClick={save} className="min-w-40 bg-blue-600 text-white">Save</Button></footer></div>}
    <ReportPrintPreviewModal
      isOpen={printModalOpen}
      onClose={() => setPrintModalOpen(false)}
      title="Delivery Challans Report"
      dateFrom={fromDate}
      dateTo={toDate}
      user="All Users"
      records={filtered.map((challan) => ({
        ...challan,
        date: challan.date,
        invoiceNumber: challan.number,
        customer: challan.party,
        paymentType: "Delivery Challan",
        totalAmount: challan.total,
        receivedAmount: 0,
        balanceAmount: challan.total,
        status: challan.status,
        form: {
          invoiceNumber: challan.number,
          customer: challan.party,
          invoiceDate: challan.date,
          paymentType: "Delivery Challan",
        },
        rows: challan.rows || [],
      }))}
      totalLabel="Total Challan Amount:"
      totalAmount={filtered.reduce((sum, c) => sum + Number(c.total || 0), 0)}
    />
    {returnModal.isOpen && returnModal.challan && (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-amber-50/70">
            <div>
              <h3 className="text-base font-bold text-amber-900">Record Goods Return</h3>
              <p className="text-xs text-amber-700 mt-0.5">
                Delivery Challan #{returnModal.challan.number} · {returnModal.challan.party}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReturnModal({ isOpen: false, challan: null, returnDate: today(), returnNotes: "", returnItems: [] })}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-md text-xl cursor-pointer"
            >
              <FiX />
            </button>
          </header>

          <div className="flex-1 overflow-auto p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Return Date</label>
                <input
                  type="date"
                  value={returnModal.returnDate}
                  onChange={(e) => setReturnModal((prev) => ({ ...prev, returnDate: e.target.value }))}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Return Reason / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Returned after trial / rejected"
                  value={returnModal.returnNotes}
                  onChange={(e) => setReturnModal((prev) => ({ ...prev, returnNotes: e.target.value }))}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Items to Return</span>
                <button
                  type="button"
                  onClick={() => {
                    setReturnModal((prev) => ({
                      ...prev,
                      returnItems: prev.returnItems.map((it) => ({ ...it, returnQty: it.remaining })),
                    }));
                  }}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
                >
                  Return All Remaining Items
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2.5">Item</th>
                      <th className="p-2.5 text-center">Dispatched</th>
                      <th className="p-2.5 text-center">Already Returned</th>
                      <th className="p-2.5 text-center">Remaining</th>
                      <th className="p-2.5 text-right w-36">Qty to Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {returnModal.returnItems.map((item, idx) => (
                      <tr key={item.rowId} className="hover:bg-amber-50/30">
                        <td className="p-2.5 font-semibold text-slate-800">{item.item}</td>
                        <td className="p-2.5 text-center text-slate-600">{item.dispatchedQty} {item.unit}</td>
                        <td className="p-2.5 text-center text-amber-600">{item.alreadyReturned} {item.unit}</td>
                        <td className="p-2.5 text-center font-bold text-slate-700">{item.remaining} {item.unit}</td>
                        <td className="p-2.5 text-right">
                          <input
                            type="number"
                            min="0"
                            max={item.remaining}
                            value={item.returnQty}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(item.remaining, Number(e.target.value) || 0));
                              setReturnModal((prev) => ({
                                ...prev,
                                returnItems: prev.returnItems.map((it, i) => (i === idx ? { ...it, returnQty: val } : it)),
                              }));
                            }}
                            className="h-8 w-24 rounded border border-amber-300 px-2 text-right text-xs font-bold text-amber-900 focus:border-amber-500 outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4 bg-slate-50">
            <Button
              onClick={() => setReturnModal({ isOpen: false, challan: null, returnDate: today(), returnNotes: "", returnItems: [] })}
              className="bg-slate-200 text-slate-700 hover:bg-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReturn}
              className="bg-amber-600 text-white font-bold hover:bg-amber-700"
            >
              Confirm Goods Return
            </Button>
          </footer>
        </div>
      </div>
    )}
    <ConfirmModal
      isOpen={confirmModal.isOpen}
      title={confirmModal.title}
      message={confirmModal.message}
      confirmText={confirmModal.confirmText}
      confirmColor={confirmModal.confirmColor}
      onConfirm={confirmModal.onConfirm}
      onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
    />
  </main>;
}
