import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiDollarSign,
  FiEdit2,
  FiFileText,
  FiInfo,
  FiPercent,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiSettings,
  FiTag,
  FiTrash2,
  FiUser,
  FiX,
} from "react-icons/fi";
import {
  getInventoryItems,
  saveInventoryItem,
  applySaleInvoiceStockUpdate,
} from "../../services/itemsStorage";
import { getParties, saveParty } from "../../services/partiesStorage";
import { saveSaleInvoice } from "../../services/salesStorage";

const STORAGE = {
  products: "pos_products_v1",
  customers: "pos_customers_v1",
  draft: "pos_draft_v1",
  bills: "pos_saved_bills_v1",
};

const DEFAULT_PRODUCTS = [
  { id: "p1", code: "A101", name: "Wheat Flour 5kg", price: 240, taxRate: 0, unit: "Kg", stock: 50 },
  { id: "p2", code: "A102", name: "Basmati Rice 1kg", price: 110, taxRate: 5, unit: "Kg", stock: 100 },
  { id: "p3", code: "A103", name: "Sunflower Oil 1L", price: 155, taxRate: 5, unit: "Litre", stock: 45 },
  { id: "p4", code: "A104", name: "Tata Salt 1kg", price: 28, taxRate: 0, unit: "Pcs", stock: 120 },
  { id: "p5", code: "A105", name: "Sugar 1kg", price: 48, taxRate: 5, unit: "Kg", stock: 80 },
  { id: "p6", code: "A106", name: "Toor Dal 1kg", price: 165, taxRate: 5, unit: "Kg", stock: 60 },
  { id: "p7", code: "A107", name: "Notebook 200 Pgs", price: 60, taxRate: 12, unit: "Pcs", stock: 150 },
  { id: "p8", code: "A108", name: "Ball Pen Blue", price: 10, taxRate: 12, unit: "Pcs", stock: 300 },
  { id: "p9", code: "A109", name: "Biscuits Pack", price: 35, taxRate: 18, unit: "Pcs", stock: 95 },
  { id: "p10", code: "A110", name: "Mineral Water 1L", price: 20, taxRate: 18, unit: "Pcs", stock: 110 },
];

const DEFAULT_CUSTOMERS = [
  { id: "c1", name: "Ramesh Sharma", phone: "9876543210" },
  { id: "c2", name: "Pooja Patel", phone: "9823456789" },
  { id: "c3", name: "Anil Kumar", phone: "9123456780" },
];

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Could not save POS data:", error);
  }
}

const money = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const makeDraft = () => ({
  invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
  date: new Date().toISOString().slice(0, 10),
  customer: "",
  customerPhone: "",
  items: [],
  paymentMode: "Cash",
  amountReceived: "",
  billDiscount: 0,
  additionalCharges: 0,
  remarks: "",
  loyaltyPointsRedeemed: 0,
});

function ActionButton({ children, primary = false, onClick, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[48px] rounded-md border px-3 py-2 text-sm font-semibold transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "border-emerald-500 bg-emerald-200 text-slate-800"
          : "border-blue-300 bg-blue-100 text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export default function PointOfSale() {
  const navigate = useNavigate();

  const handleClosePOS = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/sales/sale-invoices");
    }
  }, [navigate]);

  // Load products from localStorage (getInventoryItems)
  const loadProducts = useCallback(() => {
    const inventory = getInventoryItems();
    if (inventory && inventory.length > 0) {
      return inventory.map((item) => ({
        id: item.id,
        code: item.itemCode || item.code || `ITM-${item.id.slice(-4)}`,
        name: item.itemName || item.name || "Item",
        price: Number(item.salePrice || item.price || 0),
        taxRate: Number(String(item.taxRate || "0").replace("%", "").replace("None", "0")) || 0,
        unit: item.unit || item.baseUnit || "Pcs",
        stock: Number(item.stock || item.openingQuantity || 0),
        category: item.category || "",
      }));
    }

    const legacy = readStorage(STORAGE.products, null);
    if (legacy && legacy.length > 0) return legacy;

    // Seed defaults into localStorage so they are stored in localStorage
    DEFAULT_PRODUCTS.forEach((p) => {
      saveInventoryItem({
        id: p.id,
        itemName: p.name,
        itemCode: p.code,
        salePrice: p.price,
        taxRate: `${p.taxRate}%`,
        unit: p.unit,
        stock: p.stock,
      });
    });
    return DEFAULT_PRODUCTS;
  }, []);

  // Load customers from localStorage (getParties)
  const loadCustomers = useCallback(() => {
    const parties = getParties();
    if (parties && parties.length > 0) {
      return parties.map((p) => ({
        id: p.id,
        name: p.partyName || p.name || "Customer",
        phone: p.phoneNumber || p.phone || "",
        address: p.billingAddress || p.address || "",
      }));
    }

    const legacy = readStorage(STORAGE.customers, null);
    if (legacy && legacy.length > 0) return legacy;

    DEFAULT_CUSTOMERS.forEach((c) => {
      saveParty({ partyName: c.name, phoneNumber: c.phone });
    });
    return DEFAULT_CUSTOMERS;
  }, []);

  const [products, setProducts] = useState(loadProducts);
  const [customers, setCustomers] = useState(loadCustomers);
  const [bills, setBills] = useState(() => readStorage(STORAGE.bills, []));
  const [draft, setDraft] = useState(() => readStorage(STORAGE.draft, null) || makeDraft());

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);

  // Modal State Management
  const [modal, setModal] = useState(null); // { type: string, data?: any }
  const [toast, setToast] = useState(null); // { message: string, type: 'success' | 'warning' | 'info' }

  const searchRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Sync with storage changes
  useEffect(() => {
    const handleStorageChange = () => {
      setProducts(loadProducts());
      setCustomers(loadCustomers());
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [loadProducts, loadCustomers]);

  // Persist POS state to localStorage
  useEffect(() => persist(STORAGE.products, products), [products]);
  useEffect(() => persist(STORAGE.customers, customers), [customers]);
  useEffect(() => persist(STORAGE.bills, bills), [bills]);
  useEffect(() => persist(STORAGE.draft, draft), [draft]);

  const updateDraft = useCallback((changes) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  // Financial calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let itemDiscount = 0;
    let tax = 0;

    const lines = draft.items.map((item) => {
      const qty = Math.max(0.01, Number(item.qty) || 1);
      const price = Math.max(0, Number(item.price) || 0);
      const discount = Math.max(0, Math.min(Number(item.discount) || 0, price * qty));
      const taxable = Math.max(0, price * qty - discount);
      const itemTax = (taxable * (Number(item.taxRate) || 0)) / 100;
      const total = taxable + itemTax;

      subtotal += price * qty;
      itemDiscount += discount;
      tax += itemTax;

      return {
        ...item,
        qty,
        price,
        discount,
        taxable,
        itemTax,
        total,
      };
    });

    const billDiscount = Math.max(0, Number(draft.billDiscount) || 0);
    const charges = Math.max(0, Number(draft.additionalCharges) || 0);
    const loyaltyDiscount = Math.max(0, Number(draft.loyaltyPointsRedeemed) || 0);
    const total = Math.max(0, subtotal - itemDiscount + tax - billDiscount - loyaltyDiscount + charges);

    const receivedInput = draft.amountReceived === "" ? total : Number(draft.amountReceived);
    const received = Number.isFinite(receivedInput) ? Math.max(0, receivedInput) : total;

    return {
      lines,
      subtotal,
      itemDiscount,
      tax,
      billDiscount,
      loyaltyDiscount,
      charges,
      total,
      received,
      change: Math.max(0, received - total),
      due: Math.max(0, total - received),
    };
  }, [draft]);

  // Filter products for search
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products.slice(0, 10);

    return products
      .filter((product) =>
        [product.name, product.code, product.id, product.category]
          .some((val) => String(val || "").toLowerCase().includes(query))
      )
      .slice(0, 12);
  }, [products, search]);

  // Filter customers for dropdown
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return customers
      .filter((customer) =>
        [customer.name, customer.phone].some((val) =>
          String(val || "").toLowerCase().includes(query)
        )
      )
      .slice(0, 8);
  }, [customers, customerSearch]);

  // Get currently selected line item
  const selectedItem = useMemo(() => {
    if (!selectedId && draft.items.length === 1) {
      return draft.items[0];
    }
    return draft.items.find((item) => item.lineId === selectedId) || null;
  }, [draft.items, selectedId]);

  // Add product to bill
  function addProduct(product) {
    setDraft((current) => {
      const existing = current.items.find((item) => item.productId === product.id);

      if (existing) {
        return {
          ...current,
          items: current.items.map((item) =>
            item.productId === product.id
              ? { ...item, qty: Number(item.qty) + 1 }
              : item
          ),
        };
      }

      const item = {
        lineId: `${product.id}-${Date.now()}`,
        productId: product.id,
        code: product.code,
        name: product.name,
        qty: 1,
        unit: product.unit || "Pcs",
        price: Number(product.price) || 0,
        taxRate: Number(product.taxRate) || 0,
        discount: 0,
      };

      setSelectedId(item.lineId);
      return { ...current, items: [...current.items, item] };
    });

    setSearch("");
    setProductOpen(false);
    searchRef.current?.focus();
    showToast(`${product.name} added to bill`);
  }

  function updateItem(lineId, changes) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.lineId === lineId ? { ...item, ...changes } : item
      ),
    }));
  }

  // Button Action Handlers with Modal popups (No browser prompts)
  function handleQuantityClick() {
    const item = selectedItem;
    if (!item) {
      showToast("Please select an item row from the table first.", "warning");
      return;
    }
    setModal({
      type: "quantity",
      item,
      qty: String(item.qty),
    });
  }

  function handleDiscountClick() {
    const item = selectedItem;
    if (!item) {
      showToast("Please select an item row from the table first.", "warning");
      return;
    }
    setModal({
      type: "discount",
      item,
      discountType: "flat",
      discountValue: String(item.discount || 0),
    });
  }

  function handleUnitClick() {
    const item = selectedItem;
    if (!item) {
      showToast("Please select an item row from the table first.", "warning");
      return;
    }
    setModal({
      type: "unit",
      item,
      unit: item.unit || "Pcs",
    });
  }

  function handleRemoveItemClick() {
    const item = selectedItem;
    if (!item) {
      showToast("Please select an item row from the table first.", "warning");
      return;
    }
    setModal({
      type: "remove",
      item,
    });
  }

  function handleAdditionalChargesClick() {
    setModal({
      type: "additionalCharges",
      charges: String(draft.additionalCharges || 0),
    });
  }

  function handleBillDiscountClick() {
    setModal({
      type: "billDiscount",
      discountType: "flat",
      discountValue: String(draft.billDiscount || 0),
    });
  }

  function handleLoyaltyClick() {
    setModal({
      type: "loyalty",
      customer: draft.customer || "Walk-in Customer",
      availablePoints: 350,
      pointsToRedeem: String(draft.loyaltyPointsRedeemed || 0),
    });
  }

  function handleRemarksClick() {
    setModal({
      type: "remarks",
      remarks: draft.remarks || "",
    });
  }

  function handleBreakupClick() {
    setModal({
      type: "breakup",
    });
  }

  function handleOtherPaymentsClick() {
    setModal({
      type: "otherPayment",
      paymentMode: draft.paymentMode || "Cash",
      amountReceived: String(draft.amountReceived || calculations.total),
      reference: "",
      notes: "",
    });
  }

  function handleNewBillClick() {
    if (draft.items.length > 0) {
      setModal({ type: "confirmNewBill" });
    } else {
      executeNewBill();
    }
  }

  function executeNewBill() {
    setDraft(makeDraft());
    setSelectedId("");
    setSearch("");
    showToast("New bill started");
    searchRef.current?.focus();
    setModal(null);
  }

  function saveBill(print = false) {
    if (draft.items.length === 0) {
      showToast("Add at least one item before saving the bill.", "warning");
      return;
    }

    const bill = {
      ...draft,
      items: calculations.lines,
      subtotal: calculations.subtotal,
      itemDiscount: calculations.itemDiscount,
      tax: calculations.tax,
      total: calculations.total,
      amountReceived: calculations.received,
      change: calculations.change,
      due: calculations.due,
      savedAt: new Date().toISOString(),
    };

    // Save in POS bills
    setBills((current) => {
      const existingIndex = current.findIndex((b) => b.invoiceNo === bill.invoiceNo);
      if (existingIndex >= 0) {
        return current.map((b, idx) => (idx === existingIndex ? bill : b));
      }
      return [bill, ...current];
    });

    // Also persist into global sales records and update stock in localStorage
    try {
      saveSaleInvoice({
        invoiceNumber: bill.invoiceNo,
        party: bill.customer || "Walk-in Customer",
        phone: bill.customerPhone || "",
        total: bill.total,
        paymentType: bill.paymentMode,
        receivedAmount: bill.amountReceived,
        rows: bill.items.map((it) => ({
          itemId: it.productId,
          item: it.name,
          qty: it.qty,
          price: it.price,
          unit: it.unit,
          discount: it.discount,
        })),
      });
      applySaleInvoiceStockUpdate({
        transactionType: "sale",
        rows: bill.items.map((it) => ({
          itemId: it.productId,
          item: it.name,
          qty: it.qty,
        })),
      });
    } catch (e) {
      console.warn("Could not sync with sales records:", e);
    }

    showToast(`Bill ${bill.invoiceNo} saved to local storage!`);

    if (print) {
      window.setTimeout(() => window.print(), 150);
    }
  }

  function selectCustomer(customer) {
    updateDraft({ customer: customer.name, customerPhone: customer.phone || "" });
    setCustomerSearch("");
    setCustomerOpen(false);
    showToast(`Customer set to ${customer.name}`);
  }

  // Keyboard shortcut listener
  useEffect(() => {
    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

      if (event.key === "Escape") {
        if (modal) {
          setModal(null);
          return;
        }
        if (productOpen) {
          setProductOpen(false);
          return;
        }
        if (customerOpen) {
          setCustomerOpen(false);
          return;
        }
        handleClosePOS();
        return;
      }

      if (event.ctrlKey && key === "t") {
        event.preventDefault();
        handleNewBillClick();
        return;
      }

      if (event.ctrlKey && key === "p") {
        event.preventDefault();
        saveBill(true);
        return;
      }

      if (event.ctrlKey && key === "f") {
        event.preventDefault();
        handleBreakupClick();
        return;
      }

      if (event.ctrlKey && key === "m") {
        event.preventDefault();
        handleOtherPaymentsClick();
        return;
      }

      if (event.ctrlKey && key === "w") {
        event.preventDefault();
        handleNewBillClick();
        return;
      }

      if (typing || modal) return;

      switch (event.key) {
        case "F1":
          event.preventDefault();
          searchRef.current?.focus();
          setProductOpen(true);
          break;
        case "F2":
          event.preventDefault();
          handleQuantityClick();
          break;
        case "F3":
          event.preventDefault();
          handleDiscountClick();
          break;
        case "F4":
          event.preventDefault();
          handleRemoveItemClick();
          break;
        case "F6":
          event.preventDefault();
          handleUnitClick();
          break;
        case "F8":
          event.preventDefault();
          handleAdditionalChargesClick();
          break;
        case "F9":
          event.preventDefault();
          handleBillDiscountClick();
          break;
        case "F10":
          event.preventDefault();
          handleLoyaltyClick();
          break;
        case "F11":
          event.preventDefault();
          setCustomerOpen(true);
          break;
        case "F12":
          event.preventDefault();
          handleRemarksClick();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const shortcuts = [
    ["Change Quantity [F2]", handleQuantityClick],
    ["Item Discount [F3]", handleDiscountClick],
    ["Remove Item [F4]", handleRemoveItemClick],
    ["Change Unit [F6]", handleUnitClick],
    ["Additional Charges [F8]", handleAdditionalChargesClick],
    ["Bill Discount [F9]", handleBillDiscountClick],
    ["Loyalty Points [F10]", handleLoyaltyClick],
    ["Remarks [F12]", handleRemarksClick],
  ];

  return (
    <main className="flex h-screen w-screen min-h-[600px] flex-col overflow-hidden bg-[#e8edf5] text-[#41485d]">
      {/* Top Header Bar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 text-sm">
        <div className="flex items-center gap-5 text-slate-700">
          <button
            type="button"
            onClick={() => navigate("/company-profile")}
            className="font-semibold text-slate-800 hover:text-blue-600 transition"
          >
            Company
          </button>
          <button
            type="button"
            onClick={() => setModal({ type: "shortcuts" })}
            className="hover:text-blue-600 transition"
          >
            Help
          </button>
          <button
            type="button"
            onClick={() => setModal({ type: "settings" })}
            className="hover:text-blue-600 transition"
          >
            Versions
          </button>
          <button
            type="button"
            onClick={() => setModal({ type: "shortcuts" })}
            className="hover:text-blue-600 transition"
          >
            Shortcuts
          </button>
          <button
            type="button"
            onClick={handleNewBillClick}
            title="Start a new bill"
            className="hover:text-blue-600 transition"
          >
            ⟳
          </button>
        </div>

        <div className="hidden items-center gap-2 text-xs md:flex">
          <span>Customer Support:</span>
          <a className="text-blue-600 hover:underline" href="tel:+919333911911">
            +91-9333911911
          </a>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={() => showToast("Online Support is available 24/7 at support@vyapar.com")}
            className="text-blue-600 hover:underline"
          >
            Get Instant Online Support
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Settings"
            onClick={() => setModal({ type: "settings" })}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 transition"
          >
            <FiSettings size={18} />
          </button>
          <button
            type="button"
            title="Close POS (Esc)"
            aria-label="Close POS and return to previous page"
            onClick={handleClosePOS}
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition cursor-pointer shadow-sm"
          >
            <FiX className="h-4 w-4" />
            <span>Close</span>
          </button>
        </div>
      </header>

      {/* Bill Tabs & Actions Bar */}
      <nav className="flex h-[48px] shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
        <div className="flex h-full items-center gap-4 rounded-t-md bg-[#f8f9fc] px-4 border-t-2 border-blue-600">
          <span className="font-semibold text-slate-800">#{draft.invoiceNo}</span>
          <span className="text-xs text-slate-400">Ctrl+W</span>
          <button
            type="button"
            onClick={handleNewBillClick}
            aria-label="Close current bill"
            className="rounded p-0.5 hover:bg-slate-200 transition"
          >
            <FiX className="text-slate-500" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleNewBillClick}
          className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition"
        >
          <FiPlus className="text-blue-600" /> New Bill [Ctrl+T]
        </button>
        <div className="ml-auto hidden text-xs text-slate-500 sm:block">
          Saved bills: <span className="font-semibold text-slate-700">{bills.length}</span>
        </div>
      </nav>

      {/* Main Split Grid */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 overflow-auto p-1.5 lg:grid-cols-[minmax(0,1.82fr)_minmax(340px,1fr)]">
        {/* Left Section: Search, Table, Shortcuts Bar */}
        <section className="flex min-h-[500px] flex-col gap-1.5">
          {/* Item Search Bar */}
          <div className="relative shrink-0">
            <label className="flex h-[58px] items-center gap-3 rounded-md border-2 border-blue-500 bg-white px-3 shadow-sm">
              <input
                ref={searchRef}
                aria-label="Search items"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setProductOpen(true);
                }}
                onFocus={() => setProductOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (filteredProducts[0]) {
                      addProduct(filteredProducts[0]);
                    } else if (search.trim()) {
                      setModal({
                        type: "addProduct",
                        name: search.trim(),
                        price: "100",
                        unit: "Pcs",
                        taxRate: "0",
                        code: `ITEM-${Date.now().toString().slice(-4)}`,
                        stock: "100",
                      });
                      setProductOpen(false);
                    }
                  }
                  if (event.key === "ArrowDown" && filteredProducts[0]) {
                    event.preventDefault();
                    addProduct(filteredProducts[0]);
                  }
                }}
                placeholder="Search item name or code, or scan barcode... [F1]"
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:font-medium placeholder:text-slate-400 sm:text-lg"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="rounded p-1 text-slate-400 hover:text-slate-600"
                >
                  <FiX />
                </button>
              )}
              <FiSearch size={24} className="shrink-0 text-blue-500" />
            </label>

            {/* Product Dropdown Results */}
            {productOpen && (
              <div className="absolute left-0 right-0 top-full z-20 max-h-80 overflow-auto rounded-md border border-slate-300 bg-white shadow-xl">
                <div className="bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 border-b">
                  Stored Items in LocalStorage ({products.length} total)
                </div>
                {filteredProducts.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addProduct(product)}
                    className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2.5 text-left transition hover:bg-blue-50"
                  >
                    <div>
                      <span className="block font-semibold text-slate-800">{product.name}</span>
                      <span className="text-xs text-slate-500">
                        {product.code} · {product.unit} · GST {product.taxRate}%
                        {product.stock ? ` · Stock: ${product.stock}` : ""}
                      </span>
                    </div>
                    <span className="font-bold text-slate-900">₹{money(product.price)}</span>
                  </button>
                ))}

                {filteredProducts.length === 0 && (
                  <div className="p-4 text-sm text-slate-500">
                    No matching item found in local storage.
                    <button
                      type="button"
                      onClick={() => {
                        setModal({
                          type: "addProduct",
                          name: search.trim(),
                          price: "100",
                          unit: "Pcs",
                          taxRate: "0",
                          code: `ITEM-${Date.now().toString().slice(-4)}`,
                          stock: "100",
                        });
                        setProductOpen(false);
                      }}
                      className="ml-2 font-bold text-blue-600 hover:underline"
                    >
                      + Add this item to LocalStorage
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Items Table */}
          <div
            className="min-h-[220px] flex-1 overflow-auto rounded-md border border-slate-300 bg-white shadow-sm"
            onClick={() => setProductOpen(false)}
          >
            <table className="min-w-[900px] w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[#f3f4f6] text-left font-semibold text-slate-600">
                <tr className="h-[55px]">
                  <th className="border border-slate-200 px-3">#</th>
                  <th className="border border-slate-200 px-3">ITEM CODE</th>
                  <th className="border border-slate-200 px-3">ITEM NAME</th>
                  <th className="border border-slate-200 px-2 text-center">QTY</th>
                  <th className="border border-slate-200 px-2">UNIT</th>
                  <th className="border border-slate-200 px-2">PRICE/UNIT (₹)</th>
                  <th className="border border-slate-200 px-2">DISCOUNT (₹)</th>
                  <th className="border border-slate-200 px-2">TAX (₹)</th>
                  <th className="border border-slate-200 px-2">TOTAL (₹)</th>
                  <th className="border border-slate-200 px-2 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {calculations.lines.map((item, index) => {
                  const isSelected = selectedItem?.lineId === item.lineId;
                  return (
                    <tr
                      key={item.lineId}
                      onClick={() => setSelectedId(item.lineId)}
                      className={`h-[52px] cursor-pointer transition ${
                        isSelected
                          ? "bg-[#e3f1ff] ring-1 ring-blue-300"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="border border-slate-200 px-3 font-medium">{index + 1}</td>
                      <td className="border border-slate-200 px-3 text-slate-600">{item.code}</td>
                      <td className="border border-slate-200 px-3">
                        <div className="font-semibold text-slate-800">{item.name}</div>
                        <div className="text-xs text-slate-500">GST {item.taxRate}%</div>
                      </td>
                      <td className="border border-slate-200 p-1 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(item.lineId);
                            setModal({
                              type: "quantity",
                              item,
                              qty: String(item.qty),
                            });
                          }}
                          className="rounded border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold hover:border-blue-500 hover:text-blue-600 transition"
                          title="Click to change quantity"
                        >
                          {item.qty}
                        </button>
                      </td>
                      <td className="border border-slate-200 px-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(item.lineId);
                            setModal({
                              type: "unit",
                              item,
                              unit: item.unit,
                            });
                          }}
                          className="hover:text-blue-600 underline font-medium"
                          title="Click to change unit"
                        >
                          {item.unit}
                        </button>
                      </td>
                      <td className="border border-slate-200 px-2 font-medium">
                        ₹{money(item.price)}
                      </td>
                      <td className="border border-slate-200 px-2 text-slate-600">
                        {item.discount > 0 ? (
                          <span className="text-emerald-600 font-semibold">
                            −₹{money(item.discount)}
                          </span>
                        ) : (
                          "₹0.00"
                        )}
                      </td>
                      <td className="border border-slate-200 px-2 text-slate-600">
                        ₹{money(item.itemTax)}
                      </td>
                      <td className="border border-slate-200 px-2 font-bold text-slate-900">
                        ₹{money(item.total)}
                      </td>
                      <td className="border border-slate-200 px-2 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(item.lineId);
                            setModal({
                              type: "remove",
                              item,
                            });
                          }}
                          title="Remove item"
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        >
                          <FiTrash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {calculations.lines.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="h-48 border border-slate-200 text-center text-slate-400"
                    >
                      <FiFileText size={32} className="mx-auto mb-2 opacity-40" />
                      No items added. Search or scan a product above to add.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Action Buttons Bar */}
          <div className="grid shrink-0 grid-cols-2 gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-4">
            {shortcuts.map(([label, action]) => (
              <ActionButton key={label} onClick={action}>
                {label}
              </ActionButton>
            ))}
          </div>

          {/* Backup & Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              All products loaded directly from LocalStorage ({products.length} products).
            </span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setModal({
                    type: "addProduct",
                    name: "",
                    price: "",
                    unit: "Pcs",
                    taxRate: "0",
                    code: `ITEM-${Date.now().toString().slice(-4)}`,
                    stock: "100",
                  });
                }}
                className="font-semibold text-blue-600 hover:underline"
              >
                + Add New Product
              </button>
              <button
                type="button"
                className="font-semibold text-slate-600 hover:text-blue-600 hover:underline"
                onClick={() => {
                  const data = JSON.stringify({ products, customers, bills, draft }, null, 2);
                  const blob = new Blob([data], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                  showToast("POS backup exported successfully!");
                }}
              >
                Export backup
              </button>
            </div>
          </div>
        </section>

        {/* Right Section: Bill Details, Totals & Payment Controls */}
        <aside className="flex min-h-[500px] flex-col gap-1.5">
          {/* Customer & Date Selector */}
          <div className="shrink-0 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <label className="flex h-[52px] items-center justify-between rounded-xl border border-slate-300 px-4">
              <span className="text-sm font-semibold text-slate-700">Date</span>
              <input
                type="date"
                aria-label="Bill date"
                value={draft.date}
                onChange={(event) => updateDraft({ date: event.target.value })}
                className="max-w-[165px] bg-transparent text-sm font-medium text-slate-800 outline-none"
              />
              <FiCalendar className="text-blue-500" size={19} />
            </label>

            <div className="relative mt-3">
              <div className="flex h-[56px] items-center rounded-xl border border-slate-300 px-3">
                <FiUser className="mr-2 text-slate-400" />
                <input
                  value={customerOpen ? customerSearch : draft.customer}
                  onChange={(event) => {
                    setCustomerSearch(event.target.value);
                    setCustomerOpen(true);
                  }}
                  onFocus={() => {
                    setCustomerSearch(draft.customer);
                    setCustomerOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && customerSearch.trim()) {
                      event.preventDefault();
                      const existing = filteredCustomers[0];
                      if (existing) selectCustomer(existing);
                      else {
                        setModal({
                          type: "addCustomer",
                          name: customerSearch.trim(),
                          phone: "",
                          address: "",
                        });
                        setCustomerOpen(false);
                      }
                    }
                  }}
                  placeholder="Search customer name or phone [F11]"
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setCustomerOpen((open) => !open)}
                  aria-label="Show customers"
                  className="p-1"
                >
                  <FiChevronDown className="text-blue-500" />
                </button>
              </div>

              {/* Customer Dropdown */}
              {customerOpen && (
                <div className="absolute left-0 right-0 top-full z-20 max-h-56 overflow-auto rounded-md border border-slate-300 bg-white shadow-xl">
                  <div className="bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 border-b">
                    Customers in LocalStorage ({customers.length})
                  </div>
                  {filteredCustomers.map((customer) => (
                    <button
                      type="button"
                      key={customer.id}
                      onClick={() => selectCustomer(customer)}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-blue-50 transition"
                    >
                      <span className="block font-semibold text-slate-800">{customer.name}</span>
                      <span className="text-xs text-slate-500">{customer.phone || "No phone number"}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setModal({
                        type: "addCustomer",
                        name: customerSearch.trim(),
                        phone: "",
                        address: "",
                      });
                      setCustomerOpen(false);
                    }}
                    className="w-full px-3 py-2.5 text-left text-sm font-bold text-blue-600 hover:bg-blue-50 border-t"
                  >
                    <FiPlus className="mr-2 inline" /> + Add new customer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateDraft({ customer: "", customerPhone: "" });
                      setCustomerOpen(false);
                      showToast("Set as Walk-in Customer");
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-500 hover:bg-slate-50"
                  >
                    Walk-in customer (default)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Total & Breakup Card */}
          <button
            type="button"
            onClick={handleBreakupClick}
            className="flex shrink-0 items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-slate-50 transition"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-500">
                <FiFileText size={24} />
              </span>
              <span>
                <span className="block text-xl font-bold text-slate-900">
                  Total ₹ {money(calculations.total)}
                </span>
                <span className="block text-xs font-medium text-slate-500">
                  Items: {draft.items.length}, Quantity:{" "}
                  {calculations.lines.reduce((sum, item) => sum + item.qty, 0)}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-1 text-right text-xs font-bold leading-tight text-blue-600">
              <span>
                Full Breakup
                <br />
                [Ctrl+F]
              </span>
              <FiChevronRight size={20} />
            </span>
          </button>

          {/* Payment & Charges Box */}
          <div className="flex min-h-[210px] flex-1 flex-col rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                Payment Mode
                <select
                  value={draft.paymentMode}
                  onChange={(event) => updateDraft({ paymentMode: event.target.value })}
                  className="mt-1.5 h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-blue-500"
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Card</option>
                  <option>Bank Transfer</option>
                  <option>Credit</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Amount Received (₹)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.amountReceived}
                  onChange={(event) => updateDraft({ amountReceived: event.target.value })}
                  placeholder={money(calculations.total)}
                  className="mt-1.5 h-[48px] w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700 outline-blue-500"
                />
              </label>
            </div>

            <div className="flex-1 border-t border-slate-100 bg-[#fafafa] px-3 py-2.5">
              <div className="flex justify-between py-1 text-sm text-slate-600">
                <span>Subtotal</span>
                <span>₹ {money(calculations.subtotal)}</span>
              </div>
              <div className="flex justify-between py-1 text-sm text-slate-600">
                <span>Item discounts</span>
                <span className="text-emerald-600 font-medium">− ₹ {money(calculations.itemDiscount)}</span>
              </div>
              <div className="flex justify-between py-1 text-sm text-slate-600">
                <span>Tax (GST)</span>
                <span>₹ {money(calculations.tax)}</span>
              </div>
              <div className="flex justify-between py-1 text-sm text-slate-600">
                <span>Bill discount</span>
                <span className="text-emerald-600 font-medium">− ₹ {money(calculations.billDiscount)}</span>
              </div>
              {calculations.loyaltyDiscount > 0 && (
                <div className="flex justify-between py-1 text-sm text-purple-700 font-medium">
                  <span>Loyalty Redeemed</span>
                  <span>− ₹ {money(calculations.loyaltyDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between py-1 text-sm text-slate-600">
                <span>Additional charges</span>
                <span>₹ {money(calculations.charges)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-800">
                <span>Change to Return</span>
                <span className="text-emerald-700">₹ {money(calculations.change)}</span>
              </div>
              {calculations.due > 0 && (
                <div className="flex justify-between pt-1 font-bold text-rose-600">
                  <span>Balance Due</span>
                  <span>₹ {money(calculations.due)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Save / Print Buttons */}
          <div className="grid shrink-0 gap-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm">
            <ActionButton primary onClick={() => saveBill(true)}>
              Save &amp; Print Bill [Ctrl+P]
            </ActionButton>
            <ActionButton onClick={handleOtherPaymentsClick}>
              Other/Credit Payments [Ctrl+M]
            </ActionButton>
            <ActionButton onClick={() => saveBill(false)}>Save Bill</ActionButton>
          </div>

          {/* Saved Bills Accordion */}
          <details className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <summary className="cursor-pointer font-semibold text-slate-800">
              Saved bills ({bills.length})
            </summary>
            <div className="mt-2 max-h-48 space-y-2 overflow-auto">
              {bills.map((bill) => (
                <div
                  key={bill.invoiceNo}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({
                        ...makeDraft(),
                        ...bill,
                        items: (bill.items || []).map((item) => ({
                          ...item,
                          lineId: item.lineId || `${item.productId}-${Date.now()}-${Math.random()}`,
                        })),
                      });
                      setSelectedId("");
                      showToast(`Loaded ${bill.invoiceNo}`);
                    }}
                    className="min-w-0 text-left hover:text-blue-600"
                  >
                    <span className="block font-semibold">{bill.invoiceNo}</span>
                    <span className="block text-xs text-slate-500">
                      {bill.customer || "Walk-in"} · {bill.date}
                    </span>
                  </button>
                  <span className="shrink-0 font-bold text-slate-800">₹{money(bill.total)}</span>
                </div>
              ))}
              {bills.length === 0 && <p className="text-sm text-slate-400">No saved bills yet.</p>}
            </div>
            {bills.length > 0 && (
              <button
                type="button"
                onClick={() => setModal({ type: "clearBills" })}
                className="mt-3 text-xs font-semibold text-rose-600 underline"
              >
                Clear saved bills
              </button>
            )}
          </details>
        </aside>
      </div>

      {/* Floating Animated Toast Notifications */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-xl animate-bounce-in transition ${
            toast.type === "warning"
              ? "bg-amber-600"
              : toast.type === "info"
              ? "bg-blue-600"
              : "bg-emerald-600"
          }`}
        >
          {toast.type === "warning" ? (
            <FiAlertCircle size={18} />
          ) : (
            <FiCheck size={18} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* PROPER POPUP MODALS WITH RICH UI (ZERO PROMPT / ALERT DIALOGS) */}
      {/* ============================================================== */}

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          {/* 1. Change Quantity Modal */}
          {modal.type === "quantity" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiEdit2 className="text-blue-600" /> Change Quantity [F2]
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const qty = Number(modal.qty);
                  if (qty > 0) {
                    updateItem(modal.item.lineId, { qty });
                    showToast(`Updated quantity to ${qty} ${modal.item.unit}`);
                    setModal(null);
                  }
                }}
                className="p-5 space-y-4"
              >
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-slate-800">{modal.item.name}</span>
                    <span className="block text-xs text-slate-500">Code: {modal.item.code}</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">
                    ₹{money(modal.item.price)} / {modal.item.unit}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Quantity ({modal.item.unit})
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setModal((m) => ({
                          ...m,
                          qty: String(Math.max(1, Number(m.qty) - 1)),
                        }))
                      }
                      className="h-10 w-10 rounded-lg border bg-slate-100 font-bold text-lg hover:bg-slate-200"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      autoFocus
                      required
                      value={modal.qty}
                      onChange={(e) => setModal((m) => ({ ...m, qty: e.target.value }))}
                      className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-center text-lg font-bold text-slate-800 outline-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setModal((m) => ({
                          ...m,
                          qty: String(Number(m.qty || 0) + 1),
                        }))
                      }
                      className="h-10 w-10 rounded-lg border bg-slate-100 font-bold text-lg hover:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  {[1, 2, 5, 10].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setModal((m) => ({ ...m, qty: String(step) }))}
                      className="flex-1 rounded-md border border-slate-200 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {step} {modal.item.unit}
                    </button>
                  ))}
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Update Quantity
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 2. Item Discount Modal */}
          {modal.type === "discount" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiTag className="text-blue-600" /> Item Discount [F3]
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const rawVal = Number(modal.discountValue) || 0;
                  const maxAllowed = Number(modal.item.price) * Number(modal.item.qty);
                  let finalDiscount = rawVal;
                  if (modal.discountType === "percent") {
                    finalDiscount = (maxAllowed * rawVal) / 100;
                  }
                  finalDiscount = Math.min(maxAllowed, Math.max(0, finalDiscount));
                  updateItem(modal.item.lineId, { discount: finalDiscount });
                  showToast(`Applied discount of ₹${money(finalDiscount)}`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                  <span className="font-bold text-slate-800">{modal.item.name}</span>
                  <div className="text-xs text-slate-500 mt-1">
                    Qty: {modal.item.qty} × ₹{money(modal.item.price)} = ₹
                    {money(Number(modal.item.qty) * Number(modal.item.price))}
                  </div>
                </div>

                <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setModal((m) => ({ ...m, discountType: "flat" }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                      modal.discountType === "flat"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    Flat Amount (₹)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModal((m) => ({ ...m, discountType: "percent" }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                      modal.discountType === "percent"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    Percentage (%)
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {modal.discountType === "flat" ? "Discount in Rupees (₹)" : "Discount in Percent (%)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    autoFocus
                    required
                    value={modal.discountValue}
                    onChange={(e) => setModal((m) => ({ ...m, discountValue: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Apply Discount
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 3. Change Unit Modal */}
          {modal.type === "unit" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Change Unit [F6]</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (modal.unit?.trim()) {
                    updateItem(modal.item.lineId, { unit: modal.unit.trim() });
                    showToast(`Unit changed to ${modal.unit.trim()}`);
                    setModal(null);
                  }
                }}
                className="p-5 space-y-4"
              >
                <div className="text-sm font-semibold text-slate-800">{modal.item.name}</div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Select Standard Unit
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Pcs", "Kg", "Gm", "Litre", "Ml", "Box", "Pack", "Dozen", "Meter"].map(
                      (u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setModal((m) => ({ ...m, unit: u }))}
                          className={`rounded-lg border py-2 text-xs font-bold transition ${
                            modal.unit === u
                              ? "border-blue-500 bg-blue-50 text-blue-600"
                              : "border-slate-200 hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          {u}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Or Enter Custom Unit
                  </label>
                  <input
                    type="text"
                    value={modal.unit}
                    onChange={(e) => setModal((m) => ({ ...m, unit: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Update Unit
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 4. Remove Item Confirmation Modal */}
          {modal.type === "remove" && (
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-3">
                  <FiTrash2 size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">Remove Item?</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Are you sure you want to remove{" "}
                  <strong className="text-slate-700">{modal.item.name}</strong> from this bill?
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        items: current.items.filter((r) => r.lineId !== modal.item.lineId),
                      }));
                      setSelectedId("");
                      showToast(`Removed ${modal.item.name}`);
                      setModal(null);
                    }}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 shadow-sm"
                  >
                    Remove Item
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. Additional Charges Modal */}
          {modal.type === "additionalCharges" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Additional Charges [F8]</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = Math.max(0, Number(modal.charges) || 0);
                  updateDraft({ additionalCharges: val });
                  showToast(`Additional charges set to ₹${money(val)}`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Charges Amount (₹) (e.g. Delivery, Packing, Service)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    autoFocus
                    required
                    value={modal.charges}
                    onChange={(e) => setModal((m) => ({ ...m, charges: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  {[20, 50, 100, 150].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setModal((m) => ({ ...m, charges: String(c) }))}
                      className="flex-1 rounded-md border border-slate-200 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      +₹{c}
                    </button>
                  ))}
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Apply Charges
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 6. Bill Discount Modal */}
          {modal.type === "billDiscount" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Bill Discount [F9]</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const rawVal = Number(modal.discountValue) || 0;
                  let finalDiscount = rawVal;
                  if (modal.discountType === "percent") {
                    finalDiscount = (calculations.subtotal * rawVal) / 100;
                  }
                  finalDiscount = Math.min(calculations.subtotal, Math.max(0, finalDiscount));
                  updateDraft({ billDiscount: finalDiscount });
                  showToast(`Bill discount applied: ₹${money(finalDiscount)}`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div className="p-3 bg-slate-50 rounded-lg text-xs font-medium text-slate-600">
                  Subtotal: <strong className="text-slate-800">₹{money(calculations.subtotal)}</strong>
                </div>

                <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setModal((m) => ({ ...m, discountType: "flat" }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                      modal.discountType === "flat"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    Flat (₹)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModal((m) => ({ ...m, discountType: "percent" }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                      modal.discountType === "percent"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    Percentage (%)
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {modal.discountType === "flat" ? "Discount in Rupees (₹)" : "Discount in Percent (%)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    autoFocus
                    required
                    value={modal.discountValue}
                    onChange={(e) => setModal((m) => ({ ...m, discountValue: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Apply Bill Discount
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 7. Loyalty Points Modal */}
          {modal.type === "loyalty" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Loyalty Points [F10]</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const points = Math.max(0, Math.min(modal.availablePoints, Number(modal.pointsToRedeem) || 0));
                  updateDraft({ loyaltyPointsRedeemed: points });
                  showToast(`Redeemed ${points} points (₹${money(points)} discount)`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div className="rounded-lg bg-blue-50 p-3.5 border border-blue-100 text-sm">
                  <div className="font-semibold text-blue-900">
                    Customer: {modal.customer}
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    Available Balance: <strong>{modal.availablePoints} Points</strong> (1 Point = ₹1.00)
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Points to Redeem
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={modal.availablePoints}
                    autoFocus
                    value={modal.pointsToRedeem}
                    onChange={(e) => setModal((m) => ({ ...m, pointsToRedeem: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Redeem Points
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 8. Remarks Modal */}
          {modal.type === "remarks" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800">Bill Remarks [F12]</h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateDraft({ remarks: modal.remarks });
                  showToast("Remarks saved for this bill");
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Remarks / Terms for Receipt
                  </label>
                  <textarea
                    rows={4}
                    autoFocus
                    value={modal.remarks}
                    onChange={(e) => setModal((m) => ({ ...m, remarks: e.target.value }))}
                    placeholder="e.g. Delivery requested by 5 PM. Goods once sold will not be returned."
                    className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-blue-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Save Remarks
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 9. Add Customer Modal */}
          {modal.type === "addCustomer" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiUser className="text-blue-600" /> Add Customer to LocalStorage
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!modal.name?.trim()) return;
                  const newCust = {
                    id: `c-${Date.now()}`,
                    name: modal.name.trim(),
                    partyName: modal.name.trim(),
                    phone: modal.phone?.trim() || "",
                    phoneNumber: modal.phone?.trim() || "",
                    address: modal.address?.trim() || "",
                  };
                  saveParty(newCust);
                  setCustomers((current) => [...current, newCust]);
                  updateDraft({ customer: newCust.name, customerPhone: newCust.phone });
                  showToast(`Saved customer "${newCust.name}" to local storage!`);
                  setModal(null);
                }}
                className="p-5 space-y-3.5"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Customer Name*
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Enter customer name"
                    value={modal.name}
                    onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={modal.phone}
                    onChange={(e) => setModal((m) => ({ ...m, phone: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Address (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="City, Area"
                    value={modal.address}
                    onChange={(e) => setModal((m) => ({ ...m, address: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Save Customer
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 10. Add Custom Product to Inventory Modal */}
          {modal.type === "addProduct" && (
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiPlus className="text-blue-600" /> Add Product to LocalStorage Inventory
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!modal.name?.trim()) return;

                  const newProduct = {
                    id: `p-${Date.now()}`,
                    itemName: modal.name.trim(),
                    name: modal.name.trim(),
                    itemCode: modal.code?.trim() || `ITM-${Date.now().toString().slice(-4)}`,
                    code: modal.code?.trim() || `ITM-${Date.now().toString().slice(-4)}`,
                    salePrice: Number(modal.price) || 0,
                    price: Number(modal.price) || 0,
                    unit: modal.unit || "Pcs",
                    taxRate: `${Number(modal.taxRate) || 0}%`,
                    stock: Number(modal.stock) || 0,
                  };

                  saveInventoryItem(newProduct);
                  setProducts((curr) => [...curr, newProduct]);
                  addProduct(newProduct);
                  showToast(`Saved "${newProduct.name}" to inventory & added to bill!`);
                  setModal(null);
                }}
                className="p-5 space-y-3.5"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Product Name*
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Masala Tea 250g"
                    value={modal.name}
                    onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Selling Price (₹)*
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={modal.price}
                      onChange={(e) => setModal((m) => ({ ...m, price: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Unit
                    </label>
                    <select
                      value={modal.unit}
                      onChange={(e) => setModal((m) => ({ ...m, unit: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-blue-500"
                    >
                      <option>Pcs</option>
                      <option>Kg</option>
                      <option>Gm</option>
                      <option>Litre</option>
                      <option>Box</option>
                      <option>Pack</option>
                      <option>Dozen</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Item Code / Barcode
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. ITM-102"
                      value={modal.code}
                      onChange={(e) => setModal((m) => ({ ...m, code: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      GST Rate (%)
                    </label>
                    <select
                      value={modal.taxRate}
                      onChange={(e) => setModal((m) => ({ ...m, taxRate: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-blue-500"
                    >
                      <option value="0">0% (None)</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Opening Stock Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="100"
                    value={modal.stock}
                    onChange={(e) => setModal((m) => ({ ...m, stock: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Save &amp; Add to Bill
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 11. Bill Breakup Modal */}
          {modal.type === "breakup" && (
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiFileText className="text-blue-600" /> Bill Summary &amp; Breakup [Ctrl+F]
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Invoice Number:</span>
                    <strong className="text-slate-800">#{draft.invoiceNo}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Customer:</span>
                    <strong className="text-slate-800">{draft.customer || "Walk-in"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <strong className="text-slate-800">{draft.date}</strong>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>₹{money(calculations.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Item Discounts:</span>
                    <span>−₹{money(calculations.itemDiscount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Tax (GST):</span>
                    <span>₹{money(calculations.tax)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Bill Discount:</span>
                    <span>−₹{money(calculations.billDiscount)}</span>
                  </div>
                  {calculations.loyaltyDiscount > 0 && (
                    <div className="flex justify-between text-purple-700 font-medium">
                      <span>Loyalty Points Redeemed:</span>
                      <span>−₹{money(calculations.loyaltyDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Additional Charges:</span>
                    <span>₹{money(calculations.charges)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                    <span>Grand Total:</span>
                    <span>₹{money(calculations.total)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Amount Received:</span>
                    <span>₹{money(calculations.received)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Change to Return:</span>
                    <span>₹{money(calculations.change)}</span>
                  </div>
                  {calculations.due > 0 && (
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>Balance Due:</span>
                      <span>₹{money(calculations.due)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      saveBill(true);
                    }}
                    className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"
                  >
                    Save &amp; Print
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 12. Other / Credit Payments Modal */}
          {modal.type === "otherPayment" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiDollarSign className="text-blue-600" /> Other / Credit Payments [Ctrl+M]
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateDraft({
                    paymentMode: modal.paymentMode,
                    amountReceived: modal.amountReceived,
                  });
                  showToast(`Payment mode set to ${modal.paymentMode}`);
                  setModal(null);
                }}
                className="p-5 space-y-4"
              >
                <div className="rounded-lg bg-slate-50 p-3 border text-sm flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Bill Total Payable:</span>
                  <span className="text-lg font-bold text-slate-900">₹{money(calculations.total)}</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Select Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Cash", "UPI", "Card", "Bank Transfer", "Credit"].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setModal((m) => ({ ...m, paymentMode: mode }))}
                        className={`rounded-lg border py-2 text-xs font-bold transition ${
                          modal.paymentMode === mode
                            ? "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-300"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Amount Received (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={modal.amountReceived}
                    onChange={(e) => setModal((m) => ({ ...m, amountReceived: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Confirm Payment
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 13. Confirm Start New Bill Modal */}
          {modal.type === "confirmNewBill" && (
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-3">
                  <FiAlertCircle size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">Start a New Bill?</h3>
                <p className="mt-1 text-xs text-slate-500">
                  The current bill has{" "}
                  <strong>{draft.items.length} item(s)</strong>. Starting a new bill will clear the current draft.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={executeNewBill}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Discard &amp; Start New
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 14. Shortcuts / Help Modal */}
          {modal.type === "shortcuts" && (
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiInfo className="text-blue-600" /> POS Keyboard Shortcuts &amp; Help
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ["F1", "Search item or scan barcode"],
                    ["F2", "Change selected item quantity"],
                    ["F3", "Item discount"],
                    ["F4", "Remove selected item"],
                    ["F6", "Change unit"],
                    ["F8", "Additional charges"],
                    ["F9", "Bill discount"],
                    ["F10", "Loyalty points"],
                    ["F11", "Search / select customer"],
                    ["F12", "Bill remarks"],
                    ["Ctrl+T", "Start a new bill"],
                    ["Ctrl+F", "Full bill breakup"],
                    ["Ctrl+P", "Save and print bill"],
                    ["Ctrl+M", "Other & Credit payment options"],
                    ["Ctrl+W", "Close bill tab"],
                  ].map(([k, desc]) => (
                    <div
                      key={k}
                      className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100"
                    >
                      <kbd className="rounded bg-white px-2 py-0.5 font-bold shadow-sm border border-slate-200 text-slate-800">
                        {k}
                      </kbd>
                      <span className="text-slate-600 font-medium">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Got It
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 15. POS Settings Modal */}
          {modal.type === "settings" && (
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between border-b px-5 py-3.5 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FiSettings className="text-blue-600" /> POS Settings &amp; LocalStorage
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4 text-sm">
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Inventory Items (LocalStorage):</span>
                    <strong className="text-slate-900">{products.length} items</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Customers (LocalStorage):</span>
                    <strong className="text-slate-900">{customers.length} customers</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Saved POS Invoices:</span>
                    <strong className="text-slate-900">{bills.length} bills</strong>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      navigate("/items");
                    }}
                    className="w-full rounded-lg border border-slate-300 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Manage Full Inventory in Items Dashboard →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      navigate("/company-profile");
                    }}
                    className="w-full rounded-lg border border-slate-300 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Edit Company Profile &amp; Details →
                  </button>
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 16. Clear Saved Bills Confirmation */}
          {modal.type === "clearBills" && (
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-3">
                  <FiTrash2 size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">Clear All Saved Bills?</h3>
                <p className="mt-1 text-xs text-slate-500">
                  This will remove all {bills.length} saved POS bills from this browser.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBills([]);
                      showToast("All saved bills cleared");
                      setModal(null);
                    }}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 shadow-sm"
                  >
                    Clear Bills
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Print stylesheet */}
      <style>{`
        @media print {
          header, nav, aside, section > label, section > div:last-child,
          section > div:nth-last-child(2) { display: none !important; }
          main { height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; }
          main > div { display: block !important; overflow: visible !important; padding: 0 !important; }
          section { display: block !important; min-height: 0 !important; }
          section > div { overflow: visible !important; border: 0 !important; }
          table { min-width: 0 !important; width: 100% !important; }
          th, td { padding: 5px !important; border: 1px solid #ddd !important; color: black !important; }
          button { display: none !important; }
        }
      `}</style>
    </main>
  );
}
