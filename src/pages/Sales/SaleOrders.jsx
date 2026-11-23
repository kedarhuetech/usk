import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiCalendar, FiChevronDown, FiFilter, FiMoreVertical, FiPlus, FiSearch, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { getInventoryItems } from "../../services/itemsStorage";
import { getParties } from "../../services/partiesStorage";
import { saveBusinessParty } from "../../services/businessRecords";
import { businessDataApi } from "../../services/apiClient";
import { getAppSettings } from "../../services/appSettingsStorage";
import { getSaleOrders, saveSaleOrders, getOrderFulfillmentSummary } from "../../services/transactionRepository.js";
import { transactionsDb, saleOrdersDb } from "../../services/databaseRepository.js";
import { businessDataChangedEvent, notifyBusinessDataChanged } from "../../services/businessDataChanged.js";
import OrderPartialConvertModal from "../../components/Common/OrderPartialConvertModal.jsx";
import {
  buildTransactionMessage,
  sendMetaWhatsAppMessage,
} from "../../services/transactionMessageService.js";
import {
  buildUnifiedDocumentHtml,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";
import { toast, ConfirmModal } from "../../components/Common/Toast.jsx";

const KEY = "ledgerly:saleOrders.v1";
const money = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const newRow = () => ({ id: crypto.randomUUID(), item: "", description: "", size: "", qty: "", unit: "NONE", price: "", discount: "", tax: "NONE", cess: "" });
const newPayment = () => ({ id: crypto.randomUUID(), type: "Cash", amount: "" });

function normalizeSaleOrder(order) {
  if (!order) return order;
  const rawRows = (order.rows && order.rows.length > 0)
    ? order.rows
    : (order.items && order.items.length > 0)
    ? order.items
    : [];

  const rows = rawRows.length > 0
    ? rawRows.map((r) => ({
        id: r.id || crypto.randomUUID(),
        item: r.item || r.itemName || r.name || "",
        description: r.description || "",
        size: r.size || "",
        qty: String(r.qty ?? r.quantity ?? ""),
        unit: r.unit || "NONE",
        price: String(r.price ?? r.unitPrice ?? ""),
        discount: String(r.discount ?? r.discountPercent ?? ""),
        tax: String(r.tax ?? r.taxRate ?? "NONE"),
        cess: String(r.cess ?? ""),
      }))
    : [newRow(), newRow()];

  return {
    ...order,
    id: order.id,
    number: order.number || order.documentNumber || order.refNo || "",
    customer: order.customer || order.partyName || order.party || order.customerName || order.form?.customer || "",
    phone: order.phone || order.partyPhone || order.form?.phone || "",
    date: order.date || order.transactionDate || (order.createdAt ? order.createdAt.slice(0, 10) : localDate()),
    dueDate: order.dueDate || order.date || order.transactionDate || localDate(),
    state: order.state || order.stateOfSupply || "Select",
    amount: Number(order.amount ?? order.totalAmount ?? 0),
    status: order.status || "Open",
    rows,
    payments: order.payments || [newPayment()],
    roundOff: order.roundOff ?? true,
    roundOffValue: order.roundOffValue || "",
    terms: order.terms || "",
    description: order.description || order.notes || "",
    linkedOrderIds: order.linkedOrderIds || [],
  };
}

function readOrders() { try { const data = getSaleOrders(); return Array.isArray(data) ? data.map(normalizeSaleOrder) : []; } catch { return []; } }
function rowAmount(row) { const gross = (Number(row.qty) || 0) * (Number(row.price) || 0); const discount = row.discountType === "amount" ? Number(row.discount || 0) : gross * (Number(row.discount || 0) / 100); const net = Math.max(0, gross - discount); return net + net * (Number(row.tax) || 0) / 100 + net * (Number(row.cess) || 0) / 100; }
const displayDate = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-GB") : "—";

function printSaleOrderDoc(order) {
  if (!order) return;
  const summary = getOrderFulfillmentSummary(order);
  const rows = (summary.rows || []).map((row, idx) => ({
    index: idx + 1,
    item: row.item || "-",
    description: [row.hsn ? `HSN: ${row.hsn}` : "", row.unit ? `Unit: ${row.unit}` : ""].filter(Boolean).join(" | "),
    qty: `${row.orderedQty || 0}${row.convertedQty > 0 ? ` (Conv: ${row.convertedQty}, Rem: ${row.remainingQty})` : ""}`,
    price: row.price,
    amount: (Number(row.orderedQty || row.qty || 0)) * (Number(row.price) || 0),
  }));
  const subtotal = summary.originalAmount;
  const tax = Number(order.tax) || 0;
  const grandTotal = subtotal + tax;

  const html = buildUnifiedDocumentHtml(
    {
      id: order.id,
      invoiceNumber: order.number,
      date: displayDate(order.date),
      dueDate: displayDate(order.dueDate),
      status: summary.status,
      partyName: order.customer || "",
      partyPhone: order.phone || "",
      partyBillingAddress: order.billingAddress || "",
      partyShippingAddress: order.shippingAddress || "",
      columns: [
        { key: "index", label: "#", align: "center", width: "40px" },
        { key: "item", label: "Item Description", align: "left" },
        { key: "description", label: "Details", align: "left" },
        { key: "qty", label: "Qty Details", align: "center", width: "120px" },
        { key: "price", label: "Rate", align: "right", width: "100px", formatMoney: true },
        { key: "amount", label: "Amount", align: "right", width: "120px", formatMoney: true },
      ],
      rows,
      totals: {
        subtotal,
        taxTotal: tax,
        grandTotal,
        convertedValue: summary.convertedAmount,
        balanceDue: summary.remainingAmount,
      },
      notes: order.notes,
      terms: order.terms,
    },
    {
      documentType: "Sale Order",
      title: "Sale Order",
    }
  );
  openPrintWindow(html);
}

const isItemActive = (item) => item && item.isActive !== false && item.is_active !== 0;

export default function SaleOrders() {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState(readOrders);
  const [inventory, setInventory] = useState(() => getInventoryItems().filter(isItemActive));
  const [openItemRow, setOpenItemRow] = useState("");
  const [tab, setTab] = useState("orders");
  const [editorTabs, setEditorTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const editor = editorTabs.find((t) => t.tabId === activeTabId) || null;

  const closeTab = (tabIdToClose, force = false) => {
    const targetTab = editorTabs.find((t) => t.tabId === tabIdToClose);
    if (targetTab && !force) {
      const val = targetTab.value;
      const isDirty = Boolean(val?.customer?.trim() || val?.rows?.some((r) => r.item?.trim() || Number(r.price) > 0));
      if (isDirty) {
        const discard = typeof window !== "undefined" && window.confirm
          ? window.confirm(`Discard unsaved order #${val.number || ""} for ${val.customer || "customer"}?`)
          : true;
        if (!discard) return;
      }
    }
    setEditorTabs((current) => {
      const remaining = current.filter((t) => t.tabId !== tabIdToClose);
      if (!remaining.length) {
        setActiveTabId(null);
      } else if (activeTabId === tabIdToClose) {
        const nextActive = remaining[remaining.length - 1];
        setActiveTabId(nextActive ? nextActive.tabId : null);
      }
      return remaining;
    });
  };

  const openEditor = (newEditor) => {
    if (!newEditor) {
      setEditorTabs([]);
      setActiveTabId(null);
      return;
    }
    const tabId = newEditor.tabId || (newEditor.value?.id ? `so-${newEditor.value.id}` : `so-tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const tabObj = { ...newEditor, tabId };
    setEditorTabs((current) => {
      const existingIdx = current.findIndex((t) => (newEditor.value?.id && t.value?.id === newEditor.value.id) || t.tabId === tabId);
      if (existingIdx >= 0) {
        const updated = [...current];
        updated[existingIdx] = tabObj;
        return updated;
      }
      return [...current, tabObj];
    });
    setActiveTabId(tabId);
  };

  const setEditor = (action) => {
    if (action === null) {
      if (activeTabId) {
        closeTab(activeTabId);
      } else {
        setEditorTabs([]);
        setActiveTabId(null);
      }
      return;
    }
    if (typeof action === "function") {
      setEditorTabs((current) => {
        const activeTab = current.find((t) => t.tabId === activeTabId);
        if (!activeTab) return current;
        const updated = action(activeTab);
        return current.map((t) => (t.tabId === activeTabId ? { ...updated, tabId: t.tabId } : t));
      });
      return;
    }
    openEditor(action);
  };
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState("");
  const [selector, setSelector] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectorSearch, setSelectorSearch] = useState("");
  const [selectorParty, setSelectorParty] = useState("");
  const [selectorFrom, setSelectorFrom] = useState(() => localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [selectorTo, setSelectorTo] = useState(() => localDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)));
  const [selectorPreset, setSelectorPreset] = useState("This Month");
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    confirmColor: "red",
    onConfirm: null,
  });
  const [historyModal, setHistoryModal] = useState(null);
  const parties = useMemo(() => getParties(), []);

  // Synchronize with MySQL backend and safely migrate local orders
  useEffect(() => {
    let active = true;
    const syncRemote = async () => {
      try {
        const remote = await transactionsDb.listByType("sale_order");
        if (!active) return;
        const local = readOrders();

        if (Array.isArray(remote) && remote.length > 0) {
          const remoteNormalized = remote.map(normalizeSaleOrder);
          const remoteIdSet = new Set(remoteNormalized.map((r) => String(r.id || r.number)));

          // Check for any unmigrated local records
          const unmigrated = local.filter((l) => !remoteIdSet.has(String(l.id)) && !remoteIdSet.has(String(l.number)));
          if (unmigrated.length > 0) {
            for (const order of unmigrated) {
              try {
                await transactionsDb.save({
                  ...order,
                  transactionType: "sale_order",
                  type: "sale_order",
                  documentNumber: String(order.number || "").trim(),
                  number: String(order.number || "").trim(),
                  transactionDate: order.date || localDate(),
                  partyName: order.customer,
                  customer: order.customer,
                  amount: order.amount,
                  totalAmount: order.amount,
                  status: order.status || "Open",
                  rows: order.rows,
                  items: order.rows,
                });
              } catch (saveErr) {
                console.warn("[SaleOrders] Unmigrated order sync warning:", saveErr?.message);
              }
            }
          }

          const mergedMap = new Map();
          remoteNormalized.forEach((r) => mergedMap.set(String(r.id || r.number), r));
          unmigrated.forEach((u) => {
            const key = String(u.id || u.number);
            if (!mergedMap.has(key)) mergedMap.set(key, u);
          });
          const merged = [...mergedMap.values()];
          setOrders(merged);
          saveSaleOrders(merged);
        } else if (local.length > 0) {
          // One-time migration of existing local orders to MySQL
          for (const order of local) {
            try {
              await transactionsDb.save({
                ...order,
                transactionType: "sale_order",
                type: "sale_order",
                documentNumber: String(order.number || "").trim(),
                number: String(order.number || "").trim(),
                transactionDate: order.date || localDate(),
                partyName: order.customer,
                customer: order.customer,
                amount: order.amount,
                totalAmount: order.amount,
                status: order.status || "Open",
                rows: order.rows,
                items: order.rows,
              });
            } catch (saveErr) {
              console.warn("[SaleOrders] Initial migration notice:", saveErr?.message);
            }
          }
        }
      } catch (err) {
        console.warn("[SaleOrders] Falling back to local cache:", err?.message);
      }
    };
    syncRemote();

    const handleUpdate = () => setOrders(readOrders());
    window.addEventListener(businessDataChangedEvent, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      active = false;
      window.removeEventListener(businessDataChangedEvent, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Handle incoming navigation state (e.g. from All Transactions report, Quotations, Proformas)
  useEffect(() => {
    if (location.state?.editOrder || location.state?.editInvoice) {
      const target = location.state.editOrder || location.state.editInvoice;
      setEditor({ mode: "edit", value: normalizeSaleOrder(target) });
    } else if (location.state?.printOrder) {
      printSaleOrderDoc(location.state.printOrder);
    } else if (location.state?.quotationConversion || location.state?.proformaConversion) {
      const source = location.state.quotationConversion || location.state.proformaConversion;
      const isQuotation = Boolean(location.state.quotationConversion);
      const rawRows = (source.rows && source.rows.length > 0)
        ? source.rows
        : (source.items && source.items.length > 0)
        ? source.items
        : (source.rawPayload?.rows || source.rawPayload?.items || []);
      const rows = rawRows.map((r) => ({
        id: crypto.randomUUID(),
        item: r.item || r.itemName || r.name || r.description || "",
        description: r.description || "",
        size: r.size || "",
        qty: String(r.qty ?? r.quantity ?? 1),
        unit: r.unit || r.baseUnit || "NONE",
        price: String(r.price ?? r.unitPrice ?? r.rate ?? 0),
        discount: String(r.discount ?? r.discountPercent ?? r.discountPercentage ?? ""),
        tax: String(r.tax ?? r.taxRate ?? r.taxPercent ?? "NONE"),
        cess: String(r.cess ?? ""),
      }));
      const existingOrders = readOrders();
      const existingNumbers = [
        ...existingOrders.map((o) => Number(o.number) || 0),
        ...editorTabs.map((t) => Number(t.value?.number) || 0),
      ];
      const nextNumber = String(Math.max(0, ...existingNumbers) + 1);
      const customerName = source.customer || source.partyName || source.customerName || source.party || source.rawPayload?.partyName || source.rawPayload?.customer || "";
      const customerPhone = source.phone || source.partyPhone || source.customerPhone || source.rawPayload?.phone || "";
      const tabId = `so-tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setEditor({
        tabId,
        mode: "new",
        value: {
          id: "",
          number: nextNumber,
          customer: customerName,
          phone: customerPhone,
          date: localDate(),
          dueDate: source.dueDate || localDate(),
          state: source.state || source.stateOfSupply || "Select",
          billingAddress: source.billingAddress || source.partyAddress || "",
          shippingAddress: source.shippingAddress || "",
          rows: rows.length > 0 ? rows : [newRow(), newRow()],
          payments: [newPayment()],
          roundOff: true,
          roundOffValue: "",
          terms: source.terms || "",
          description: `Converted from ${isQuotation ? "Quotation" : "Proforma"} ${source.number || ""}. ${source.description || ""}`.trim(),
          status: "Open",
          linkedOrderIds: [],
          convertedFromQuotationId: isQuotation ? source.id : undefined,
          convertedFromProformaId: !isQuotation ? source.id : undefined,
          convertedFromNumber: source.number,
        },
      });
    }
  }, [location.state]);

  useEffect(() => {
    let active = true;
    businessDataApi.list("items").then((remoteItems) => {
      if (!active || !Array.isArray(remoteItems)) return;
      const merged = new Map();
      [...getInventoryItems(), ...remoteItems]
        .filter(isItemActive)
        .forEach((item) => merged.set(String(item.id || item.itemCode || item.itemName), item));
      setInventory([...merged.values()]);
    }).catch(() => { /* Keep the browser's saved inventory available when the server is offline. */ });
    return () => { active = false; };
  }, []);
  const persist = (next) => {
    setOrders(next);
    saveSaleOrders(next);
  };
  const visible = orders.filter((order) => `${order.customer} ${order.number} ${order.status}`.toLowerCase().includes(search.toLowerCase()));
  const amount = (order) => Number(order.amount || (order.rows || []).reduce((sum, row) => sum + rowAmount(row), 0));
  const beginNew = () => {
    const existingOrders = readOrders();
    const existingNumbers = [
      ...existingOrders.map((order) => Number(order.number) || 0),
      ...editorTabs.map((tabItem) => Number(tabItem.value?.number) || 0),
    ];
    const nextNumber = String(Math.max(0, ...existingNumbers) + 1);
    const tabId = `so-tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTab = {
      tabId,
      mode: "new",
      value: {
        id: "",
        number: nextNumber,
        customer: "",
        phone: "",
        date: localDate(),
        dueDate: localDate(),
        state: "Select",
        rows: [newRow(), newRow()],
        payments: [newPayment()],
        roundOff: true,
        roundOffValue: "",
        terms: "",
        description: "",
        status: "Open",
        linkedOrderIds: [],
      },
    };
    setEditorTabs((current) => [...current, newTab]);
    setActiveTabId(tabId);
  };
  const save = async () => {
    const value = editor.value;
    if (!value.customer.trim()) { toast.error("Select or enter a customer."); return; }
    if (!(value.rows || []).some((row) => row.item.trim() && Number(row.qty) > 0)) { toast.error("Add at least one item and quantity."); return; }

    const allInventory = getInventoryItems();
    const originalOrder = editor.mode === "edit" ? orders.find((o) => o.id === value.id) : null;
    const originalRowItemNames = new Set(
      (originalOrder?.rows || []).map((r) => String(r.item || "").trim().toLowerCase()).filter(Boolean)
    );
    const inactiveRow = (value.rows || []).find((row) => {
      const name = String(row.item || "").trim().toLowerCase();
      if (!name) return false;
      if (originalRowItemNames.has(name)) return false;
      const match = allInventory.find((it) => (it.id && (it.id === row.itemId || it.id === row.sourceItemId)) || String(it.itemName || it.name || "").trim().toLowerCase() === name);
      return match && (match.isActive === false || match.is_active === 0);
    });
    if (inactiveRow) {
      toast.error(`Item "${inactiveRow.item}" is inactive and cannot be added to a sale order.`);
      return;
    }

    const subtotal = value.rows.reduce((sum, row) => sum + rowAmount(row), 0);
    const amount = value.roundOff ? Math.round(subtotal) + (Number(value.roundOffValue) || 0) : subtotal;
    if (!parties.some((party) => (party.partyName || "").trim().toLowerCase() === value.customer.trim().toLowerCase())) {
      try {
        await saveBusinessParty({ partyName: value.customer.trim(), phone: value.phone.trim(), openingBalance: "0", openingBalanceType: "to-receive" });
      } catch (partyErr) {
        console.warn("[SaleOrders] Auto-create party notice:", partyErr?.message);
      }
    }
    const orderId = value.id || `sale-order-${Date.now()}`;
    const saved = { ...value, id: orderId, amount, updatedAt: new Date().toISOString(), createdAt: value.createdAt || new Date().toISOString(), history: [...(value.history || []), { action: editor.mode === "edit" ? "Updated sale order" : "Created sale order", at: new Date().toISOString() }] };

    // Persist to MySQL backend FIRST with strict fail-fast validation
    try {
      await transactionsDb.save({
        ...saved,
        transactionType: "sale_order",
        type: "sale_order",
        documentNumber: String(saved.number || "").trim(),
        number: String(saved.number || "").trim(),
        transactionDate: saved.date || localDate(),
        date: saved.date || localDate(),
        dueDate: saved.dueDate || saved.date || localDate(),
        partyId: saved.partyId || null,
        partyName: saved.customer,
        customer: saved.customer,
        customerName: saved.customer,
        phone: saved.phone || "",
        partyPhone: saved.phone || "",
        billingAddress: saved.billingAddress || null,
        shippingAddress: saved.shippingAddress || null,
        subtotal,
        totalAmount: amount,
        total: amount,
        amount,
        paidAmount: 0,
        receivedAmount: 0,
        balanceAmount: amount,
        status: saved.status || "Open",
        paymentMode: "Credit",
        paymentType: "Credit",
        notes: saved.description || "",
        description: saved.description || "",
        terms: saved.terms || "",
        roundOff: saved.roundOff,
        roundOffValue: saved.roundOffValue,
        rows: saved.rows,
        items: saved.rows,
      });
    } catch (err) {
      console.error("[SaleOrders] Database save failed:", err?.message);
      toast.error(err?.message || "Failed to save sale order to MySQL database.");
      return;
    }

    // Update the source quotation or proforma status if converted
    if (value.convertedFromQuotationId) {
      ["ledgerly:estimateQuotations.v1", "ledgerly:estimates.v1"].forEach((k) => {
        try {
          const list = JSON.parse(window.localStorage.getItem(k) || "[]");
          window.localStorage.setItem(
            k,
            JSON.stringify(list.map((item) => item.id === value.convertedFromQuotationId ? { ...item, status: "Converted to Sale Order", convertedAt: new Date().toISOString(), conversionType: "Sale Order", convertedSaleOrderId: orderId } : item))
          );
        } catch {}
      });
      transactionsDb.save({
        id: value.convertedFromQuotationId,
        status: "Converted to Sale Order",
        convertedAt: new Date().toISOString(),
        conversionType: "Sale Order",
        convertedSaleOrderId: orderId,
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent("ledgerly:business-data-changed"));
    } else if (value.convertedFromProformaId) {
      ["ledgerly:proformaInvoices.v1", "ledgerly:proformas.v1"].forEach((k) => {
        try {
          const list = JSON.parse(window.localStorage.getItem(k) || "[]");
          window.localStorage.setItem(
            k,
            JSON.stringify(list.map((item) => item.id === value.convertedFromProformaId ? { ...item, status: "Converted to Sale Order", convertedAt: new Date().toISOString(), conversionType: "Sale Order", convertedSaleOrderId: orderId } : item))
          );
        } catch (e) {}
      });
      transactionsDb.save({
        id: value.convertedFromProformaId,
        status: "Converted to Sale Order",
        convertedAt: new Date().toISOString(),
        conversionType: "Sale Order",
        convertedSaleOrderId: orderId,
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent("ledgerly:business-data-changed"));
    }

    persist(editor.mode === "edit" ? orders.map((order) => order.id === saved.id ? saved : order) : [saved, ...orders]);
    setEditor(null);
    toast.success(editor.mode === "edit" ? "Sale order updated in database." : "Sale order saved to database.");

    // Auto-dispatch Meta WhatsApp transaction message if enabled in settings
    try {
      const currentSettings = getAppSettings();
      if (currentSettings.txnMsgSendToParty && currentSettings.txnMsgAutoSaleOrder) {
        const targetPhone = (value.phone || "").trim();
        if (targetPhone) {
          const msg = buildTransactionMessage({
            type: "saleOrder",
            number: saved.number,
            amount: saved.amount,
            settings: currentSettings,
          });
          sendMetaWhatsAppMessage({ phone: targetPhone, message: msg }).catch(() => {});
        }
      }
    } catch {
      // Non-blocking
    }
  };
  const openSelector = (mode) => {
    setSelectedIds([]); setSelectorSearch(""); setSelectorParty(editor?.value.customer || ""); setSelectorPreset("This Month"); setSelectorFrom(localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))); setSelectorTo(localDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))); setSelector(mode);
  };
  const [convertModalOrder, setConvertModalOrder] = useState(null);

  const candidates = orders.filter((order) => {
    const summary = getOrderFulfillmentSummary(order);
    return (
      !summary.isFullyConverted &&
      (!selectorParty || order.customer.toLowerCase() === selectorParty.toLowerCase()) &&
      (!selectorFrom || order.date >= selectorFrom) &&
      (!selectorTo || order.date <= selectorTo) &&
      `${order.number} ${order.customer}`.toLowerCase().includes(selectorSearch.toLowerCase())
    );
  });
  const attachSelected = () => {
    const selected = candidates.filter((order) => selectedIds.includes(order.id));
    if (!selected.length) return;
    setSelector(null);
    if (editor) {
      const added = selected.flatMap((order) => order.rows || []);
      setEditor((current) => ({ ...current, value: { ...current.value, rows: [...current.value.rows.filter((row) => row.item || row.qty), ...added.map((row) => ({ ...newRow(), ...row, id: crypto.randomUUID() }))], linkedOrderIds: [...new Set([...(current.value.linkedOrderIds || []), ...selected.map((order) => order.id)])] } }));
      return;
    }
    navigate("/sales/sale-invoices/new", { state: { from: "/sales/sale-order", saleOrdersConversion: selected } });
  };
  const convertOne = (order) => {
    const summary = getOrderFulfillmentSummary(order);
    if (summary.isFullyConverted) {
      toast.info("This sale order has already been fully converted to a sale invoice.");
      return;
    }
    setConvertModalOrder(order);
  };
  const handleProceedConversion = (selectedItems) => {
    const order = convertModalOrder;
    setConvertModalOrder(null);
    navigate("/sales/sale-invoices/new", {
      state: {
        from: "/sales/sale-order",
        saleOrdersConversion: [order],
        conversionItems: selectedItems,
      },
    });
  };
  const act = (action, order) => {
    setMenuId("");
    if (action === "View/Edit") setEditor({ mode: "edit", value: normalizeSaleOrder(order) });
    if (action === "Delete") {
      setConfirmModal({
        isOpen: true,
        title: "Delete Sale Order",
        message: `Delete sale order ${order.number}?`,
        confirmText: "Delete",
        confirmColor: "red",
        onConfirm: async () => {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          try {
            await transactionsDb.remove(order.id);
            persist(orders.filter((entry) => entry.id !== order.id));
            toast.success(`Sale order ${order.number} deleted.`);
          } catch (err) {
            console.error("[SaleOrders] Remote delete failed:", err?.message);
            toast.error(err?.message || `Could not delete sale order ${order.number}.`);
          }
        },
      });
    }
    if (["Preview", "Open PDF", "Print"].includes(action)) {
      const rows = (order.rows || []).map((row) => ({
        item: row.item || "Item",
        description: row.description || "",
        qty: `${row.qty || 1} ${row.unit || ""}`.trim(),
        price: row.price || 0,
        amount: rowAmount(row),
      }));

      const html = buildUnifiedDocumentHtml({
        title: "Sale Order",
        documentNumber: order.number || "",
        date: displayDate(order.date),
        dueDate: displayDate(order.dueDate),
        status: order.status || "Open",
        partyName: order.customer || "",
        partyPhone: order.phone || "",
        partyBillingAddress: order.billingAddress || "",
        partyShippingAddress: order.shippingAddress || "",
        columns: [
          { key: "index", label: "#", align: "center", width: "40px" },
          { key: "item", label: "Item Description", align: "left" },
          { key: "description", label: "Details", align: "left" },
          { key: "qty", label: "Qty", align: "center", width: "90px" },
          { key: "price", label: "Rate", align: "right", width: "100px", formatMoney: true },
          { key: "amount", label: "Amount", align: "right", width: "120px", formatMoney: true },
        ],
        rows,
        totals: {
          subtotal: amount(order),
          total: amount(order),
          received: 0,
          balance: amount(order),
        },
        terms: order.terms || "",
        notes: order.description || "",
        autoPrint: action === "Print",
      });

      openPrintWindow(html, action === "Print");
    }
    if (action === "View History") {
      const historyList = order.history || [];
      if (!historyList.length) {
        toast.info("No history recorded yet for this order.");
      } else {
        setHistoryModal({
          isOpen: true,
          orderNumber: order.number,
          history: historyList,
        });
      }
    }
  };
  const change = (key, value) => setEditor((current) => ({ ...current, value: { ...current.value, [key]: value } }));
  // Use a functional update so several field updates from one item selection
  // (name, unit, and price) are applied together instead of overwriting each other.
  const changeRow = (id, key, value) => setEditor((current) => current ? ({
    ...current,
    value: {
      ...current.value,
      rows: current.value.rows.map((row) => row.id === id ? { ...row, [key]: value } : row),
    },
  }) : current);
  const subtotal = editor?.value.rows.reduce((sum, row) => sum + rowAmount(row), 0) || 0;
  const total = editor ? (editor.value.roundOff ? Math.round(subtotal) + (Number(editor.value.roundOffValue) || 0) : subtotal) : 0;

  return <main className="flex h-full min-h-0 flex-col bg-slate-100 p-1.5 text-slate-700">
    <div className="flex h-[66px] shrink-0 border-b-2 border-sky-500 bg-white">{[{ id: "orders", label: "SALE ORDERS" }, { id: "online", label: "ONLINE ORDERS" }].map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`flex-1 font-bold ${tab === item.id ? "text-slate-700" : "text-slate-400"}`}>{item.label}</button>)}</div>
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">{tab === "orders" && <div className="flex flex-wrap items-center justify-between gap-3 py-2"><h2 className="text-lg font-semibold">Transactions</h2><div className="flex flex-wrap items-center gap-3"><label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sale orders" className="h-10 w-56 rounded-md border border-slate-300 pl-9 pr-3 outline-none focus:border-blue-500" /></label>{tab === "orders" && <><Button onClick={() => openSelector("bulk")} className="border border-rose-500 text-rose-600">Bulk Convert To Sale</Button><Button onClick={beginNew} className="rounded-md bg-blue-600 text-white"><FiPlus /> Add Sale Order</Button></>}</div></div>}
      {tab === "online" ? <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-8 text-center"><svg aria-hidden="true" viewBox="0 0 300 210" className="mb-5 h-52 w-72 max-w-full"><rect x="40" y="32" width="212" height="82" rx="17" fill="#fff0d9" transform="rotate(-7 40 32)"/><rect x="76" y="52" width="48" height="53" rx="10" fill="#fff"/><rect x="87" y="64" width="25" height="31" rx="5" fill="#f9a8d4"/><path d="M91 70h17v18H91z" fill="#7f1d35"/><path d="M94 76h11v8H94z" fill="#fbbf24"/><rect x="142" y="46" width="100" height="8" rx="4" fill="#f7d49e"/><rect x="142" y="65" width="72" height="8" rx="4" fill="#f7d49e"/><rect x="142" y="84" width="35" height="17" rx="8" fill="#f7d49e"/><rect x="25" y="100" width="250" height="90" rx="18" fill="#c9e9e5"/><rect x="38" y="111" width="70" height="66" rx="12" fill="#fff"/><path d="M57 126h33l-5 39H62z" fill="#ffe66d"/><path d="M61 132h25v25H61z" fill="#ffd84d"/><text x="73" y="148" text-anchor="middle" font-size="10" font-weight="700" fill="#5262a8" transform="rotate(-12 73 148)">chips</text><rect x="126" y="114" width="125" height="11" rx="6" fill="#a4d8d1"/><rect x="126" y="136" width="92" height="11" rx="6" fill="#a4d8d1"/><rect x="126" y="159" width="42" height="20" rx="10" fill="#a4d8d1"/></svg><h3 className="text-xl font-semibold text-slate-800">No Online Orders</h3><p className="mt-2 text-base text-slate-400">Create your online store to get orders online</p><button type="button" disabled className="mt-9 inline-flex h-[60px] items-center gap-2 rounded-full bg-rose-600 px-6 text-lg font-semibold text-white opacity-100"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7M3 10h18"/></svg>Create Store</button></div> : visible.length ? <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[1000px] border-collapse text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs font-bold text-slate-500"><tr>{["Party", "No.", "Date", "Due Date", "Total Amount", "Balance", "Type", "Status", "Action"].map((name) => <th key={name} className="border-y border-slate-200 px-3 py-4">{name}{name !== "Action" && <FiFilter className="ml-2 inline" />}</th>)}</tr></thead><tbody>{visible.map((order) => {
        const summary = getOrderFulfillmentSummary(order);
        const isOverdue = new Date(`${order.dueDate}T23:59:59`) < new Date() && summary.remainingAmount > 0;
        const statusDisplay = summary.isFullyConverted
          ? "Fully Converted"
          : isOverdue
          ? "Order Overdue"
          : summary.status;

        const statusColor = summary.isFullyConverted
          ? "text-emerald-600 font-semibold"
          : summary.isPartiallyConverted
          ? "text-amber-600 font-semibold"
          : isOverdue
          ? "text-rose-500 font-semibold"
          : "text-slate-600";

        return (
          <tr key={order.id} className="border-b border-slate-100 odd:bg-sky-100 even:bg-white">
            <td className="px-3 py-4 font-medium">{order.customer}</td>
            <td className="px-3 py-4 font-mono font-medium">{order.number}</td>
            <td className="px-3 py-4">{displayDate(order.date)}</td>
            <td className="px-3 py-4">{displayDate(order.dueDate)}</td>
            <td className="px-3 py-4 text-right font-medium">{money(summary.originalAmount)}</td>
            <td className="px-3 py-4 text-right font-bold text-slate-800">{money(summary.remainingAmount)}</td>
            <td className="px-3 py-4 text-xs text-slate-500">
              <div>Sale Order</div>
              <div className="text-[11px] text-slate-400">
                Rem: {summary.totalRemainingQty} / {summary.totalOrderedQty}
              </div>
            </td>
            <td className={`px-3 py-4 ${statusColor}`}>{statusDisplay}</td>
            <td className="relative px-3 py-3">
              <div className="flex items-center gap-2">
                {summary.isFullyConverted ? (
                  <Button disabled className="h-8 rounded-sm px-3 text-xs bg-slate-100 text-slate-400 cursor-not-allowed opacity-60">
                    Fully Converted
                  </Button>
                ) : summary.isPartiallyConverted ? (
                  <Button onClick={() => convertOne(order)} className="h-8 rounded-sm px-3 text-xs bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 font-semibold shadow-xs">
                    Convert Remaining
                  </Button>
                ) : (
                  <Button onClick={() => convertOne(order)} className="h-8 rounded-sm px-3 text-xs bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 font-semibold shadow-xs">
                    Convert to Sale
                  </Button>
                )}
                <button aria-label="Sale order actions" onClick={() => setMenuId(menuId === order.id ? "" : order.id)} className="p-2 text-slate-500 hover:text-slate-700">
                  <FiMoreVertical />
                </button>
              </div>
              {menuId === order.id && (
                <div className="absolute right-3 top-12 z-20 w-48 rounded-lg bg-white p-1 shadow-xl">
                  {["View/Edit", "Delete", "Open PDF", "Preview", "Print", "View History"].map((action) => (
                    <button key={action} onClick={() => act(action, order)} className="block w-full rounded px-3 py-2.5 text-left text-xs hover:bg-blue-50">
                      {action}
                    </button>
                  ))}
                </div>
              )}
            </td>
          </tr>
        );
      })}</tbody></table></div> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"><div className="grid h-56 w-72 place-items-center rounded-full bg-blue-50 text-7xl text-amber-500">▤</div><p className="mt-4 text-lg text-slate-500">Make &amp; share sale orders &amp; convert them to sale invoice instantly.</p><Button onClick={beginNew} className="mt-7 rounded-md bg-amber-500 px-6 py-3 text-base text-white shadow">Add Your First Sale Order</Button></div>}</Card>

    {editor && (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <div className="flex h-12 shrink-0 items-end gap-1.5 bg-slate-200 px-4 pt-1 overflow-x-auto">
          {editorTabs.map((tabItem) => {
            const isActive = tabItem.tabId === activeTabId;
            return (
              <div
                key={tabItem.tabId}
                onClick={() => setActiveTabId(tabItem.tabId)}
                className={`flex h-10 min-w-36 cursor-pointer items-center justify-between gap-3 rounded-t-lg px-4 text-sm font-semibold transition select-none ${
                  isActive
                    ? "bg-white text-slate-800 shadow-xs"
                    : "bg-slate-300/80 text-slate-600 hover:bg-slate-100/90"
                }`}
              >
                <span>Sale Order #{tabItem.value?.number || ""}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tabItem.tabId);
                  }}
                  title="Close tab"
                  aria-label={`Close Sale Order #${tabItem.value?.number}`}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={beginNew}
            title="Add Sale Order"
            aria-label="Add new sale order"
            className="mb-1.5 ml-1 grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-white shadow-xs hover:opacity-90 transition"
          >
            <FiPlus className="h-4 w-4" />
          </button>
          <div className="ml-auto flex items-center gap-4 pb-1.5 pr-1 text-xl text-slate-500">
            <button
              type="button"
              title="Settings"
              onClick={() => navigate("/settings?tab=transaction")}
              className="p-1 hover:text-slate-700 transition"
            >
              ⚙
            </button>
            <button
              type="button"
              onClick={() => closeTab(activeTabId)}
              title="Close"
              aria-label="Close"
              className="p-1 hover:text-slate-700 transition"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </div>
        <header className="flex h-[74px] shrink-0 items-center border-b px-7">
          <h1 className="text-xl font-bold">Sale Order</h1>
          <Button onClick={() => openSelector("attach")} className="ml-auto border border-blue-300 text-blue-600">
            Attach Orders
          </Button>
        </header>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f3]"><section className="grid min-h-[345px] grid-cols-1 gap-8 px-7 py-8 lg:grid-cols-[1fr_420px]"><div className="grid content-start gap-5 sm:grid-cols-[minmax(280px,1fr)_225px]"><div><label className="block text-sm text-slate-500">Customer *</label><input list="sale-order-parties" value={editor.value.customer} onChange={(event) => { const party = parties.find((entry) => entry.partyName === event.target.value); change("customer", event.target.value); if (party) change("phone", party.phone || ""); }} placeholder="Search by Name/Phone *" className="mt-1 h-14 w-full rounded-md border bg-white px-4"/><datalist id="sale-order-parties">{parties.map((party) => <option key={party.id} value={party.partyName}>{party.phone}</option>)}</datalist><input value={editor.value.phone} onChange={(event) => change("phone", event.target.value)} placeholder="Phone No." className="mt-3 h-12 w-full rounded-md border bg-white px-4"/></div><div className="space-y-3"><label className="flex items-center justify-between gap-4 text-slate-500">Order No.<input value={editor.value.number} onChange={(event) => change("number", event.target.value)} className="w-36 border-b bg-transparent p-2 text-slate-800"/></label><label className="flex items-center justify-between gap-4 text-slate-500">Order Date<input type="date" value={editor.value.date} onChange={(event) => change("date", event.target.value)} className="w-44 border-b bg-transparent p-2 text-slate-800"/></label><label className="flex items-center justify-between gap-4 text-slate-500">Due Date<input type="date" value={editor.value.dueDate} onChange={(event) => change("dueDate", event.target.value)} className="w-44 border-b bg-transparent p-2 text-slate-800"/></label><label className="flex items-center justify-between gap-4 text-slate-500">State of supply<select value={editor.value.state} onChange={(event) => change("state", event.target.value)} className="w-44 bg-transparent p-2 text-slate-800"><option>Select</option>{["Andhra Pradesh", "Delhi", "Gujarat", "Karnataka", "Maharashtra", "Tamil Nadu", "Telangana"].map((state) => <option key={state}>{state}</option>)}</select></label></div></div></section>
      <div className="overflow-x-auto bg-white"><table className="w-full min-w-[1350px] border-collapse text-sm"><thead><tr className="h-14 bg-white text-center font-semibold">{["#", "ITEM", "DESCRIPTION", "SIZE", "QTY", "UNIT", "PRICE/UNIT", "DISCOUNT %", "DISCOUNT AMOUNT", "TAX %", "TAX AMOUNT", "ADD CESS", "AMOUNT"].map((label) => <th key={label} className="border border-slate-300 px-2">{label}</th>)}</tr></thead><tbody>{editor.value.rows.map((row, index) => <tr key={row.id} className="h-14 odd:bg-slate-100 even:bg-slate-50"> <td className="border px-3 text-center">{index + 1}</td><td className="border"><div className="relative h-full"><input value={row.item} onFocus={() => setOpenItemRow(row.id)} onChange={(event) => { changeRow(row.id, "item", event.target.value); setOpenItemRow(row.id); }} className="h-full w-full bg-transparent px-3" placeholder="Select item" />{openItemRow === row.id && <div className="absolute left-0 top-full z-40 max-h-56 w-72 overflow-auto rounded-md border border-slate-200 bg-white p-1 text-left shadow-xl">{inventory.filter((item) => String(item.itemName || item.name || "").toLowerCase().includes(row.item.toLowerCase())).map((item) => <button type="button" key={item.id || item.itemCode || item.itemName} onMouseDown={(event) => event.preventDefault()} onClick={() => { changeRow(row.id, "item", item.itemName || item.name || ""); changeRow(row.id, "itemId", item.id || ""); changeRow(row.id, "sourceItemId", item.id || ""); changeRow(row.id, "unit", item.unit || item.baseUnit || "NONE"); changeRow(row.id, "price", item.salePrice || item.price || ""); if (!row.qty) changeRow(row.id, "qty", "1"); setOpenItemRow(""); }} className="block w-full rounded px-3 py-2 text-left hover:bg-blue-50">{item.itemName || item.name}<span className="ml-2 text-xs text-slate-400">{item.itemCode || item.code || ""}</span></button>)}{!inventory.filter((item) => String(item.itemName || item.name || "").toLowerCase().includes(row.item.toLowerCase())).length && <p className="px-3 py-2 text-sm text-slate-500">No matching saved items.</p>}</div>}</div></td>{[["description",""],["size",""],["qty","number"],["unit",""],["price","number"],["discount","number"]].map(([key,type]) => <td key={key} className="border"><input type={type || "text"} value={row[key]} onChange={(event) => changeRow(row.id,key,event.target.value)} className="h-full w-full bg-transparent px-2 text-center"/></td>)}<td className="border px-2 text-right">{money(rowAmount({ ...row, tax: 0, cess: 0 }) * Number(row.discount || 0) / 100)}</td><td className="border"><select value={row.tax} onChange={(event) => changeRow(row.id,"tax",event.target.value)} className="h-full w-full bg-transparent"><option value="NONE">Select</option>{[5,12,18,28].map((rate)=><option key={rate} value={rate}>{rate}%</option>)}</select></td><td className="border px-2 text-right">{money(rowAmount(row) - rowAmount({ ...row, tax: 0, cess: 0 }))}</td><td className="border"><input type="number" value={row.cess} onChange={(event)=>changeRow(row.id,"cess",event.target.value)} className="h-full w-full px-2"/></td><td className="border px-2 text-right">{money(rowAmount(row))}</td></tr>)}</tbody><tfoot><tr className="h-14 font-semibold"><td className="border px-2"><button onClick={()=>change("rows",[...editor.value.rows,newRow()])} className="rounded border border-blue-400 px-3 py-2 text-blue-600">ADD ROW</button></td><td colSpan="3" className="border px-3 text-right">TOTAL</td><td className="border text-center">{editor.value.rows.reduce((sum,row)=>sum+(Number(row.qty)||0),0)}</td><td colSpan="7" className="border"/><td className="border px-3 text-right">{money(subtotal)}</td></tr></tfoot></table></div>
      <section className="grid min-h-72 gap-6 px-7 py-8 lg:grid-cols-[1fr_1fr_1fr]"><div><button className="mb-2 rounded-md border bg-white px-5 py-3 text-slate-500" onClick={()=>change("terms",editor.value.terms ? "" : "Payment due as agreed.")}>☷ ADD TERMS &amp; CONDITIONS</button><textarea value={editor.value.terms} onChange={(event)=>change("terms",event.target.value)} placeholder="Terms and conditions" className="h-20 w-full rounded border bg-white p-3"/></div><div className="space-y-3"><label className="block text-sm text-slate-500">Payment Type<select value={editor.value.payments[0]?.type || "Cash"} onChange={(event)=>change("payments",[{...editor.value.payments[0],type:event.target.value}])} className="mt-1 block h-12 w-full rounded border bg-white px-3">{["Cash","Cheque","UPI","Card","Bank Transfer"].map((method)=><option key={method}>{method}</option>)}</select></label><button onClick={()=>change("payments",[...editor.value.payments,newPayment()])} className="text-blue-600"><FiPlus className="inline"/> Add Payment type</button><textarea value={editor.value.description} onChange={(event)=>change("description",event.target.value)} placeholder="Description" className="h-20 w-full rounded border bg-white p-3"/></div><div className="flex flex-wrap items-start justify-end gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={editor.value.roundOff} onChange={(event)=>change("roundOff",event.target.checked)}/>Round Off</label><input type="number" value={editor.value.roundOffValue} onChange={(event)=>change("roundOffValue",event.target.value)} disabled={!editor.value.roundOff} className="h-10 w-20 rounded border px-2"/><b className="pt-2">Total</b><div className="grid h-12 min-w-48 place-items-center rounded border bg-white font-bold">{money(total)}</div></div></section></div><footer className="flex shrink-0 justify-end gap-3 border-t bg-white px-5 py-3"><Button onClick={()=>act("Print", editor.value)} className="border border-blue-300 text-blue-600">Print / Share</Button><Button onClick={save} className="min-w-40 bg-blue-600 text-white">Save</Button></footer></div>
      )}

    {selector && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4"><section className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-6 py-5"><h2 className="text-xl font-semibold">Select orders to attach</h2><button onClick={()=>setSelector(null)}><FiX className="text-2xl"/></button></header><div className="space-y-5 overflow-auto px-6 py-5"><label className="block max-w-md text-sm text-slate-500">Customer *<select value={selectorParty} onChange={(event)=>setSelectorParty(event.target.value)} className="mt-1 h-12 w-full rounded border bg-white px-3"><option value="">All customers</option>{parties.map((party)=><option key={party.id}>{party.partyName}</option>)}</select></label><div className="flex flex-wrap items-center gap-3 border-y py-4"><span className="font-semibold">Filter By:</span><select className="rounded px-3 py-2" defaultValue="This Month"><option>This Month</option><option>All Time</option><option>Custom</option></select><span>Between</span><input type="date" value={selectorFrom} onChange={(event)=>setSelectorFrom(event.target.value)} className="rounded border p-2"/><span>To</span><input type="date" value={selectorTo} onChange={(event)=>setSelectorTo(event.target.value)} className="rounded border p-2"/></div><div className="flex items-center justify-between gap-4"><label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400"/><input value={selectorSearch} onChange={(event)=>setSelectorSearch(event.target.value)} placeholder="Search By order No." className="h-10 w-80 rounded-full border pl-9 pr-3"/></label><span className="italic text-slate-400">{candidates.length} Orders found</span></div><div className="max-h-[45vh] overflow-auto"><table className="w-full border-collapse text-left"><thead className="sticky top-0 bg-slate-100"><tr><th className="border p-3"><input type="checkbox" checked={candidates.length>0 && candidates.every((order)=>selectedIds.includes(order.id))} onChange={(event)=>setSelectedIds(event.target.checked?candidates.map((order)=>order.id):[])}/> Select All</th>{["DATE","ORDER NO.","DUE DATE","TOTAL AMOUNT (₹)"].map((label)=><th key={label} className="border p-3">{label}</th>)}</tr></thead><tbody>{candidates.map((order)=><tr key={order.id}><td className="border p-3"><input type="checkbox" checked={selectedIds.includes(order.id)} onChange={(event)=>setSelectedIds((ids)=>event.target.checked?[...ids,order.id]:ids.filter((id)=>id!==order.id))}/></td><td className="border p-3">{displayDate(order.date)}</td><td className="border p-3">{order.number}</td><td className="border p-3">{displayDate(order.dueDate)}</td><td className="border p-3">{money(amount(order))}</td></tr>)}</tbody></table>{!candidates.length&&<p className="p-12 text-center text-slate-400">No open sale orders match the selected filters.</p>}</div></div><footer className="flex justify-end gap-3 border-t px-6 py-4"><Button onClick={()=>setSelector(null)} className="bg-slate-100">Cancel</Button><Button disabled={!selectedIds.length} onClick={attachSelected} className="bg-blue-600 text-white">{selector === "attach" ? "Attach" : "Convert"} {selectedIds.length} Orders</Button></footer></section></div>}
    {historyModal && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setHistoryModal(null)}>
        <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-bold text-slate-800">Order #{historyModal.orderNumber} History</h3>
            <button onClick={() => setHistoryModal(null)} className="rounded p-1 text-slate-400 hover:text-slate-600"><FiX /></button>
          </div>
          <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
            {historyModal.history.map((h, i) => (
              <div key={i} className="rounded bg-slate-50 p-2.5 text-xs">
                <p className="font-semibold text-slate-800">{h.action}</p>
                <p className="text-slate-400">{new Date(h.at).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setHistoryModal(null)} className="bg-blue-600 text-white">Close</Button>
          </div>
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
    <OrderPartialConvertModal
      isOpen={Boolean(convertModalOrder)}
      order={convertModalOrder}
      type="sale"
      onClose={() => setConvertModalOrder(null)}
      onProceed={handleProceedConversion}
    />
  </main>;
}
