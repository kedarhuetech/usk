// Implements the customer storefront page.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  FiCheck,
  FiImage,
  FiMapPin,
  FiMinus,
  FiPackage,
  FiPhone,
  FiPlus,
  FiSearch,
  FiShoppingCart,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { calculateInventoryItemPricing, getInventoryItemAvailability } from "../../../services/itemsStorage";
import { getOnlineStoreState } from "../../../services/onlineStoreStorage";
import { saveOnlineStoreOrder } from "../../../services/onlineStoreOrdersStorage";
import { loadGrowthItems } from "../../../services/businessGrowthData.js";

// Formats currency.
function formatCurrency(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? `Rs ${amount.toLocaleString("en-IN")}` : "Rs 0";
}

// This helper handles amount logic.
function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

// This helper handles max quantity logic.
function itemMaxQuantity(item) {
  const availability = getInventoryItemAvailability(item);
  return availability.showStock ? Math.max(availability.quantity || 0, 0) : 999;
}

// Checks whether add item.
function canAddItem(item, storeState) {
  if (!storeState.acceptOnlineOrders) return false;
  return itemMaxQuantity(item) > 0;
}

// Cleans phone.
function sanitizePhone(value = "") {
  return String(value).replace(/[^\d]/g, "");
}

// Renders the quantity control interface.
function QuantityControl({ value, onChange, max = 999, disabled = false }) {
  const canDecrease = !disabled && value > 1;
  const canIncrease = !disabled && value < max;

  return (
    <div className="inline-flex h-10 items-center overflow-hidden rounded-full border border-slate-200 bg-white">
      <button
        type="button"
        disabled={!canDecrease}
        onClick={() => onChange(value - 1)}
        className="grid h-10 w-10 place-items-center text-slate-600 disabled:text-slate-300"
        aria-label="Decrease quantity"
      >
        <FiMinus className="h-4 w-4" />
      </button>
      <span className="min-w-10 text-center text-sm font-black text-slate-900">{value}</span>
      <button
        type="button"
        disabled={!canIncrease}
        onClick={() => onChange(value + 1)}
        className="grid h-10 w-10 place-items-center text-slate-600 disabled:text-slate-300"
        aria-label="Increase quantity"
      >
        <FiPlus className="h-4 w-4" />
      </button>
    </div>
  );
}

// Renders the price block interface.
function PriceBlock({ item, size = "normal" }) {
  const pricing = calculateInventoryItemPricing(item);
  const finalClass = size === "large" ? "text-2xl" : "text-lg";

  return (
    <div>
      {pricing.hasDiscount && (
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-400 line-through">{formatCurrency(pricing.originalPrice)}</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">{pricing.discountLabel}</span>
        </div>
      )}
      <p className={`${finalClass} font-black text-slate-950`}>
        {formatCurrency(pricing.finalPrice)}
        {item.unit && <span className="text-xs font-bold text-slate-500"> / {item.unit}</span>}
      </p>
    </div>
  );
}

// Renders the stock badge interface.
function StockBadge({ item }) {
  const availability = getInventoryItemAvailability(item);
  if (!availability.showStock) return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Service</span>;

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${availability.inStock ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      {availability.label}
    </span>
  );
}

// Renders the store unavailable interface.
function StoreUnavailable() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <FiPackage className="mx-auto h-10 w-10 text-slate-300" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">Store not available</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">This store link is not active on this device yet.</p>
      </section>
    </main>
  );
}

// Renders the product card interface.
function ProductCard({ item, storeState, onView, onAdd }) {
  const canAdd = canAddItem(item, storeState);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button type="button" onClick={onView} className="block w-full text-left">
        <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-slate-100">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.itemName} className="h-full w-full object-cover" /> : <FiImage className="h-10 w-10 text-slate-300" />}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-h-10 text-sm font-black text-slate-950">{item.itemName}</h2>
            {item.category && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{item.category}</span>}
          </div>
          <div className="mt-3"><PriceBlock item={item} /></div>
          <div className="mt-3"><StockBadge item={item} /></div>
        </div>
      </button>
      <div className="border-t border-slate-100 p-3">
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => onAdd(item, 1)}
          className={`h-10 w-full rounded-full text-sm font-black ${canAdd ? "bg-slate-950 text-white hover:bg-slate-800" : "bg-slate-200 text-white"}`}
        >
          {storeState.acceptOnlineOrders ? "Add to Cart" : "Orders Closed"}
        </button>
      </div>
    </article>
  );
}

// Renders the product detail modal interface.
function ProductDetailModal({ item, storeState, quantity, setQuantity, onAdd, onClose }) {
  const max = itemMaxQuantity(item);
  const canAdd = canAddItem(item, storeState);
  const availability = getInventoryItemAvailability(item);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex justify-end border-b border-slate-100 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <FiX className="h-5 w-5" />
          </button>
        </header>
        <div className="grid max-h-[82vh] overflow-y-auto md:grid-cols-[340px_1fr]">
          <div className="grid min-h-80 place-items-center bg-slate-100">
            {item.imageUrl ? <img src={item.imageUrl} alt={item.itemName} className="h-full max-h-[520px] w-full object-cover" /> : <FiImage className="h-14 w-14 text-slate-300" />}
          </div>
          <div className="p-6">
            <p className="text-xs font-black uppercase text-slate-400">{item.category || item.type}</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">{item.itemName}</h2>
            <div className="mt-4"><PriceBlock item={item} size="large" /></div>
            {item.description && <p className="mt-4 text-sm leading-6 text-slate-600">{item.description}</p>}
            <div className="mt-5 grid gap-2 text-sm text-slate-600">
              {item.unit && <p><b className="text-slate-950">Unit:</b> {item.unit}</p>}
              <p><b className="text-slate-950">Availability:</b> {availability.showStock ? availability.label : "Available as service"}</p>
              {item.taxRate && item.taxRate !== "None" && <p><b className="text-slate-950">Tax:</b> {item.taxRate} - {item.saleTaxMode || "Without Tax"}</p>}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <QuantityControl value={quantity} onChange={setQuantity} max={max} disabled={!canAdd} />
              <button
                type="button"
                disabled={!canAdd}
                onClick={() => onAdd(item, quantity)}
                className={`h-11 rounded-full px-6 text-sm font-black ${canAdd ? "bg-slate-950 text-white hover:bg-slate-800" : "bg-slate-200 text-white"}`}
              >
                {storeState.acceptOnlineOrders ? "Add to Cart" : "Orders Closed"}
              </button>
            </div>
            {!storeState.acceptOnlineOrders && <p className="mt-3 text-sm font-semibold text-rose-600">This store is currently not accepting online orders.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

// Renders the cart panel interface.
function CartPanel({
  open,
  storeState,
  cartLines,
  totals,
  customer,
  errors,
  orderError,
  isPlacingOrder,
  setCustomer,
  onClose,
  onQuantity,
  onRemove,
  onPlaceOrder,
}) {
  if (!open) return null;

  const minimum = toAmount(storeState.minimumOrderAmount);
  const remaining = Math.max(minimum - totals.subtotal, 0);
  const canPlaceOrder =
    storeState.acceptOnlineOrders && cartLines.length > 0 && remaining <= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">Your Cart</h2>
            <p className="text-sm text-slate-500">
              {cartLines.length} item{cartLines.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
          >
            <FiX className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!storeState.acceptOnlineOrders && (
            <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              This store is currently not accepting online orders.
            </div>
          )}

          {cartLines.length ? (
            <div className="space-y-3">
              {cartLines.map((line) => (
                <article
                  key={line.item.id}
                  className="flex gap-3 rounded-xl border border-slate-200 p-3"
                >
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
                    {line.item.imageUrl ? (
                      <img
                        src={line.item.imageUrl}
                        alt={line.item.itemName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <FiImage className="h-5 w-5 text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black text-slate-950">
                          {line.item.itemName}
                        </h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {formatCurrency(line.unitPrice)}
                          {line.item.unit ? ` / ${line.item.unit}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(line.item.id)}
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <QuantityControl
                        value={line.quantity}
                        onChange={(value) => onQuantity(line.item, value)}
                        max={itemMaxQuantity(line.item)}
                      />
                      <p className="text-sm font-black text-slate-950">
                        {formatCurrency(line.lineTotal)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-200 text-center">
              <div>
                <FiShoppingCart className="mx-auto h-9 w-9 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-500">
                  Your cart is empty.
                </p>
              </div>
            </div>
          )}

          <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <b className="text-slate-950">
                {formatCurrency(totals.subtotal)}
              </b>
            </div>
            {totals.additionalCharge > 0 && (
              <div className="mt-2 flex justify-between text-sm text-slate-600">
                <span>
                  {storeState.additionalChargeName || "Additional Charge"}
                </span>
                <b className="text-slate-950">
                  {formatCurrency(totals.additionalCharge)}
                </b>
              </div>
            )}
            <div className="mt-3 border-t border-slate-200 pt-3">
              <div className="flex justify-between text-base font-black text-slate-950">
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
            {remaining > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                Add {formatCurrency(remaining)} more to place your order.
              </p>
            )}
          </section>

          <section className="mt-5 grid gap-3">
            <h3 className="font-black text-slate-950">Customer Details</h3>
            {[
              ["name", "Customer Name"],
              ["mobile", "Mobile Number"],
              ["address", "Address"],
            ].map(([field, label]) => (
              <label key={field} className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-600">
                  {label}
                </span>
                {field === "address" ? (
                  <textarea
                    value={customer[field]}
                    onChange={(event) =>
                      setCustomer((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    className="h-20 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-500"
                  />
                ) : (
                  <input
                    value={customer[field]}
                    onChange={(event) =>
                      setCustomer((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                  />
                )}
                {errors[field] && (
                  <span className="mt-1 block text-xs font-bold text-rose-600">
                    {errors[field]}
                  </span>
                )}
              </label>
            ))}
          </section>
        </div>

        <footer className="border-t border-slate-200 p-5">
          {orderError && (
            <p
              role="alert"
              className="mb-3 text-sm font-semibold text-rose-600"
            >
              {orderError}
            </p>
          )}

          <button
            type="button"
            disabled={!canPlaceOrder || isPlacingOrder}
            onClick={onPlaceOrder}
            className={`h-12 w-full rounded-full text-sm font-black ${
              canPlaceOrder && !isPlacingOrder
                ? "bg-slate-950 text-white hover:bg-slate-800"
                : "bg-slate-200 text-white"
            }`}
          >
            {isPlacingOrder ? "Placing Order…" : "Place Order"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

// Renders the order success interface.
function OrderSuccess({ order, storeState, onContinue }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <section className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <FiCheck className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-2xl font-black text-slate-950">Order Placed Successfully</h1>
        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-600">
          <p><b className="text-slate-950">Order ID:</b> {order.id}</p>
          <p className="mt-2"><b className="text-slate-950">Store:</b> {storeState.storeName}</p>
          <p className="mt-2"><b className="text-slate-950">Total:</b> {formatCurrency(order.total)}</p>
        </div>
        <button type="button" onClick={onContinue} className="mt-6 h-11 rounded-full bg-slate-950 px-6 text-sm font-black text-white hover:bg-slate-800">
          Continue Shopping
        </button>
      </section>
    </main>
  );
}

// Renders the customer storefront interface.
function CustomerStorefront() {
  const { storeId } = useParams();
  const [storeState, setStoreState] = useState({ selectedItemIds: [] });
  const [inventoryItems, setInventoryItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [activeProductId, setActiveProductId] = useState(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [customer, setCustomer] = useState({ name: "", mobile: "", address: "" });
  const [errors, setErrors] = useState({});
  const [successOrder, setSuccessOrder] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");

  const storeMatches = storeState.created && storeState.prototypeStoreId === storeId;
  const publishedItems = useMemo(() => {
    const selectedIds = new Set(storeState.selectedItemIds || []);
    return inventoryItems.filter((item) => selectedIds.has(item.id));
  }, [inventoryItems, storeState.selectedItemIds]);
  const activeProduct = useMemo(() => (
    activeProductId ? publishedItems.find((item) => item.id === activeProductId) : null
  ), [activeProductId, publishedItems]);
  const categories = useMemo(() => ["All", ...new Set(publishedItems.map((item) => item.category).filter(Boolean))], [publishedItems]);
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return publishedItems.filter((item) => {
      const categoryMatch = category === "All" || item.category === category;
      const queryMatch = !normalizedQuery || [item.itemName, item.category, item.itemCode].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
      return categoryMatch && queryMatch;
    });
  }, [category, publishedItems, query]);
  const cartLines = useMemo(() => cart
    .map((row) => {
      const item = inventoryItems.find((current) => current.id === row.itemId);
      if (!item) return null;
      const max = itemMaxQuantity(item);
      if (max <= 0) return null;
      const unitPrice = calculateInventoryItemPricing(item).finalPrice;
      const quantity = Math.min(Math.max(Number(row.quantity) || 1, 1), max);
      return { item, quantity, unitPrice, lineTotal: unitPrice * quantity };
    })
    .filter(Boolean), [cart, inventoryItems]);
  const totals = useMemo(() => {
    const subtotal = cartLines.reduce((sum, line) => sum + line.lineTotal, 0);
    const additionalCharge = storeState.additionalChargesEnabled ? toAmount(storeState.additionalChargeAmount) : 0;
    return { subtotal, additionalCharge, total: subtotal + additionalCharge };
  }, [cartLines, storeState.additionalChargeAmount, storeState.additionalChargesEnabled]);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const phone = sanitizePhone(storeState.contactNumber);

  useEffect(() => {
    // Refreshes shared data.
    const refreshSharedData = () =>
      Promise.all([getOnlineStoreState(), loadGrowthItems()])
        .then(([store, items]) => {
          setStoreState(store);
          setInventoryItems(items);
          setLoadError("");
        })
        .catch((error) => {
          setLoadError(
            error?.message || "Unable to load this store. Please try again.",
          );
        });

    refreshSharedData();

    // Refreshes when visible.
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshSharedData();
    };

    // Refreshes when storage changes.
    const refreshWhenStorageChanges = (event) => {
      if (
        !event.key ||
        event.key.includes("inventoryItems") ||
        event.key.includes("onlineStore")
      ) {
        refreshSharedData();
      }
    };

    window.addEventListener("focus", refreshSharedData);
    window.addEventListener("storage", refreshWhenStorageChanges);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshSharedData);
      window.removeEventListener("storage", refreshWhenStorageChanges);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  // Persists cart.
  const persistCart = (nextCart) => {
    setCart(nextCart);
  };

  // Handles to cart.
  const addToCart = (item, quantity) => {
    if (!canAddItem(item, storeState)) return;
    const max = itemMaxQuantity(item);
    const safeQuantity = Math.min(Math.max(Number(quantity) || 1, 1), max);
    const nextCart = cart.some((row) => row.itemId === item.id)
      ? cart.map((row) => row.itemId === item.id ? { ...row, quantity: Math.min(row.quantity + safeQuantity, max) } : row)
      : [...cart, { itemId: item.id, quantity: safeQuantity }];
    persistCart(nextCart);
    setCartOpen(true);
    setActiveProductId(null);
  };

  // Updates cart quantity.
  const updateCartQuantity = (item, quantity) => {
    const max = itemMaxQuantity(item);
    if (quantity < 1) {
      persistCart(cart.filter((row) => row.itemId !== item.id));
      return;
    }
    persistCart(cart.map((row) => row.itemId === item.id ? { ...row, quantity: Math.min(quantity, max) } : row));
  };

  // Removes cart item.
  const removeCartItem = (itemId) => persistCart(cart.filter((row) => row.itemId !== itemId));

  // Opens product.
  const openProduct = (item) => {
    setActiveProductId(item.id);
    setDetailQuantity(itemMaxQuantity(item) > 0 ? 1 : 0);
  };

  // Validates customer.
  const validateCustomer = () => {
    const nextErrors = {};
    if (!customer.name.trim()) nextErrors.name = "Name is required.";
    if (!customer.mobile.trim()) nextErrors.mobile = "Mobile number is required.";
    if (!customer.address.trim()) nextErrors.address = "Address is required.";
    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  // Handles order.
  const placeOrder = async () => {
    if (isPlacingOrder) return;

    const minimum = toAmount(storeState.minimumOrderAmount);
    if (
      !storeState.acceptOnlineOrders ||
      !cartLines.length ||
      totals.subtotal < minimum ||
      !validateCustomer()
    ) {
      return;
    }

    setIsPlacingOrder(true);
    setOrderError("");

    try {
      const order = await saveOnlineStoreOrder({
        storeId,
        customerName: customer.name.trim(),
        mobile: customer.mobile.trim(),
        mobileNumber: customer.mobile.trim(),
        address: customer.address.trim(),
        items: cartLines.map((line) => {
          const pricing = calculateInventoryItemPricing(line.item);
          return {
            itemId: line.item.id,
            itemName: line.item.itemName,
            itemNameSnapshot: line.item.itemName,
            quantity: line.quantity,
            unitPrice: pricing.originalPrice,
            itemPrice: pricing.finalPrice,
            discountAmount: pricing.discountAmount,
            finalUnitPrice: pricing.finalPrice,
            unit: line.item.unit || "",
            priceMode: line.item.saleTaxMode || "Without Tax",
            taxRate:
              line.item.taxRate && line.item.taxRate !== "None"
                ? line.item.taxRate
                : "NONE",
            taxRateSnapshot:
              line.item.taxRate && line.item.taxRate !== "None"
                ? line.item.taxRate
                : "NONE",
            lineTotal: line.lineTotal,
          };
        }),
        subtotal: totals.subtotal,
        additionalCharge: totals.additionalCharge,
        additionalChargeAmount: totals.additionalCharge,
        additionalChargeName: storeState.additionalChargesEnabled
          ? storeState.additionalChargeName || "Additional Charge"
          : "",
        total: totals.total,
        status: "new",
      });

      persistCart([]);
      setCartOpen(false);
      setSuccessOrder(order);
    } catch (error) {
      setOrderError(
        error?.message || "Your order couldn’t be placed. Please try again.",
      );
    } finally {
      setIsPlacingOrder(false);
    }
  };

 if (loadError) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-center">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Couldn’t load this store
        </h1>
        <p className="mt-2 text-sm text-slate-600">{loadError}</p>
      </div>
    </main>
  );
}

if (!storeMatches) return <StoreUnavailable />;
  if (successOrder) return <OrderSuccess order={successOrder} storeState={storeState} onContinue={() => setSuccessOrder(null)} />;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100">
              {storeState.logoUrl ? <img src={storeState.logoUrl} alt={storeState.storeName} className="h-full w-full object-cover" /> : <FiPackage className="h-6 w-6 text-slate-400" />}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black text-slate-950">{storeState.storeName}</h1>
              {storeState.address && <p className="truncate text-xs font-semibold text-slate-500"><FiMapPin className="mr-1 inline h-3.5 w-3.5" />{storeState.address}</p>}
            </div>
          </div>
          <button type="button" onClick={() => setCartOpen(true)} className="relative grid h-11 w-11 place-items-center rounded-full bg-slate-950 text-white">
            <FiShoppingCart className="h-5 w-5" />
            {cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-black">{cartCount}</span>}
          </button>
        </div>
      </header>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-7 sm:px-5 lg:grid-cols-[1fr_340px] lg:items-center">
          <div className="flex min-w-0 gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-100">
              {storeState.logoUrl ? <img src={storeState.logoUrl} alt={storeState.storeName} className="h-full w-full object-cover" /> : <FiPackage className="h-9 w-9 text-slate-400" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-3xl font-black text-slate-950">{storeState.storeName}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{storeState.description || "Browse our available products and services."}</p>
              {!storeState.acceptOnlineOrders && <p className="mt-3 inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">Online orders are currently closed</p>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-black text-slate-950">{storeState.businessName || storeState.storeName}</p>
            {storeState.contactNumber && <p className="mt-2"><FiPhone className="mr-2 inline h-4 w-4" />{storeState.contactNumber}</p>}
            {storeState.address && <p className="mt-1"><FiMapPin className="mr-2 inline h-4 w-4" />{storeState.address}</p>}
            {phone && (
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`tel:${phone}`} className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Call Store</a>
                <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">Send WhatsApp</a>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-slate-100 px-4 md:max-w-md">
            <FiSearch className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-black ${category === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleItems.map((item) => (
            <ProductCard key={item.id} item={item} storeState={storeState} onView={() => openProduct(item)} onAdd={addToCart} />
          ))}
        </div>

        {!visibleItems.length && (
          <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <div>
              <FiPackage className="mx-auto h-8 w-8 text-slate-300" />
              <h2 className="mt-3 font-black text-slate-900">No products found</h2>
              <p className="mt-1 text-sm text-slate-500">Try another search or category.</p>
            </div>
          </div>
        )}
      </section>

      <button type="button" onClick={() => setCartOpen(true)} className="fixed bottom-4 left-4 right-4 z-30 h-12 rounded-full bg-slate-950 text-sm font-black text-white shadow-xl sm:hidden">
        View Cart ({cartCount})
      </button>

      {activeProduct && (
        <ProductDetailModal
          item={activeProduct}
          storeState={storeState}
          quantity={detailQuantity}
          setQuantity={setDetailQuantity}
          onAdd={addToCart}
          onClose={() => setActiveProductId(null)}
        />
      )}
      <CartPanel
        open={cartOpen}
        storeState={storeState}
        cartLines={cartLines}
        totals={totals}
        customer={customer}
        errors={errors}
        setCustomer={setCustomer}
        onClose={() => setCartOpen(false)}
        onQuantity={updateCartQuantity}
        onRemove={removeCartItem}
        onPlaceOrder={placeOrder}
        orderError={orderError}
        isPlacingOrder={isPlacingOrder}
      />
    </main>
  );
}

export default CustomerStorefront;
