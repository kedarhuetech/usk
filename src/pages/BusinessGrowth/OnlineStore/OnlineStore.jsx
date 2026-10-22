import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheck,
  FiCopy,
  FiEdit3,
  FiEye,
  FiImage,
  FiMail,
  FiMapPin,
  FiPackage,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiShare2,
  FiShoppingBag,
  FiTag,
  FiX,
} from "react-icons/fi";
import Button from "../../../components/Common/Button";
import Card from "../../../components/Common/Card";
import AddItem from "../../Items/AddItem";
import {
  calculateInventoryItemPricing,
  getInventoryItemAvailability,
} from "../../../services/itemsStorage";
import { getOnlineStoreState, saveOnlineStoreState } from "../../../services/onlineStoreStorage";
import { loadGrowthItems, saveGrowthItem, loadGrowthOrders, updateGrowthOrder } from "../../../services/businessGrowthData.js";

function formatCurrency(value, fallback = "Price not set") {
  const hasValue = value !== "" && value !== null && value !== undefined;
  const amount = Number(value || 0);
  return hasValue && Number.isFinite(amount) ? `Rs ${amount.toLocaleString("en-IN")}` : fallback;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function orderStatusLabel(status = "new") {
  const value = String(status || "new").toLowerCase();
  if (value === "accepted") return "Accepted";
  if (value === "rejected") return "Rejected";
  return "New";
}

function orderStatusClass(status = "new") {
  const value = String(status || "new").toLowerCase();
  if (value === "accepted") return "bg-emerald-50 text-emerald-700";
  if (value === "rejected") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

function unitSuffix(item) {
  return item.unit ? ` / ${item.unit}` : "";
}

function PriceSummary({ item, className = "", finalClassName = "text-lg font-black text-slate-950" }) {
  const pricing = calculateInventoryItemPricing(item);

  return (
    <div className={className}>
      {pricing.hasDiscount && (
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-400 line-through">{formatCurrency(pricing.originalPrice)}</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">{pricing.discountLabel}</span>
        </div>
      )}
      <p className={finalClassName}>
        {formatCurrency(pricing.finalPrice)}
        {unitSuffix(item) && <span className="text-xs font-bold text-slate-500">{unitSuffix(item)}</span>}
      </p>
    </div>
  );
}

function StockPill({ item }) {
  const availability = getInventoryItemAvailability(item);
  if (!availability.showStock) return null;

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${availability.inStock ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      {availability.label}
    </span>
  );
}

function TaxNote({ item, className = "" }) {
  if (!item.taxRate || item.taxRate === "None") return null;
  return <p className={`text-xs font-semibold text-slate-500 ${className}`}>{item.taxRate} - {item.saleTaxMode || "Without Tax"}</p>;
}

function prototypeStoreUrl(storeState) {
  if (typeof window === "undefined") return "";
  const id = storeState.prototypeStoreId || "preview";
  return `${window.location.origin}/store/${encodeURIComponent(id)}`;
}

function prototypeProductUrl(storeState, item) {
  const baseUrl = prototypeStoreUrl(storeState);
  return `${baseUrl}?product=${encodeURIComponent(item.id)}`;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  window.prompt("Copy this link", value);
  return true;
}

async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "Shared.";
    } catch (error) {
      if (error?.name === "AbortError") return "Share cancelled.";
    }
  }

  await copyText(url);
  return "Link copied.";
}

function AddItemModal({ item, onClose, onItemSaved }) {
  const editMode = Boolean(item?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <div className="w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
        <AddItem key={item?.id || "new-item"} embedded mode={editMode ? "edit" : "create"} initialItem={item} onClose={onClose} onSave={onItemSaved} />
      </div>
    </div>
  );
}

function EmptyOnlineStore({ onAddItem }) {
  return (
    <div className="grid min-h-[calc(100vh-9rem)] place-items-center p-4 sm:p-6">
      <Card className="w-full max-w-5xl overflow-hidden shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
          <section className="p-6 sm:p-8">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FiShoppingBag className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-2xl font-bold text-slate-950">Start your Online Store</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
              Add your first inventory item, then choose which existing items should appear online.
            </p>
            <Button onClick={onAddItem} className="mt-7 bg-rose-600 text-white shadow-sm hover:bg-rose-700">
              <FiPlus className="h-5 w-5" /> Add Item
            </Button>
          </section>

          <section className="border-t border-slate-200 bg-blue-50/70 p-6 lg:border-l lg:border-t-0">
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Store setup</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Ready</span>
              </div>
              {["Reuse inventory", "Select online items", "Preview storefront"].map((item) => (
                <div key={item} className="mb-3 flex items-center gap-3 rounded-lg border border-slate-100 p-3 text-sm font-semibold text-slate-700">
                  <FiCheck className="h-4 w-4 text-emerald-500" />
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </Card>
    </div>
  );
}

function AdminHeader({ title, subtitle, children }) {
  return (
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-bold text-[#1A1F71]">Business Growth</p>
          <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </header>
  );
}

function DashboardStat({ label, value }) {
  return (
    <Card className="p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </Card>
  );
}

function CompactOnlineItem({ item }) {
  return (
    <article className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-white">
        {item.imageUrl ? <img src={item.imageUrl} alt={item.itemName} className="h-full w-full object-cover" /> : <FiImage className="h-5 w-5 text-slate-300" />}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-bold text-slate-900">{item.itemName}</h3>
        <PriceSummary item={item} className="mt-1" finalClassName="text-xs font-bold text-blue-700" />
      </div>
    </article>
  );
}

function StoreDashboard({ items, onlineItems, orders, storeState, onPreview, onManageItems, onOrders, onEditDetails, onSettings, onCopyStoreLink, onShareStore, onRefresh }) {
  const orderCounts = {
    new: orders.filter((order) => order.status === "new").length,
    accepted: orders.filter((order) => order.status === "accepted").length,
    rejected: orders.filter((order) => order.status === "rejected").length,
    total: orders.length,
  };
  const metrics = [
    ["Store Status", storeState.created ? "Created" : "Not Created"],
    ["Online Items", onlineItems.length],
    ["Inventory Items", items.length],
    ["Accept Orders", storeState.acceptOnlineOrders ? "On" : "Off"],
  ];

  return (
    <div className="min-h-full bg-slate-100">
      <AdminHeader title="Online Store" subtitle="Manage your store draft and preview the customer experience.">
        <button type="button" onClick={onRefresh} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">
          <FiRefreshCw className="h-4 w-4" />
        </button>
        <Button onClick={onPreview} className="bg-[#1A1F71] text-white hover:bg-[#14185D]">
          <FiEye className="h-4 w-4" /> Preview Store
        </Button>
        <Button onClick={onManageItems} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
          <FiPackage className="h-4 w-4" /> Manage Items
        </Button>
        <Button onClick={onOrders} className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
          <FiShoppingBag className="h-4 w-4" /> Online Orders
        </Button>
        <Button onClick={onEditDetails} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
          <FiEdit3 className="h-4 w-4" /> Edit Store
        </Button>
        <Button onClick={onSettings} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
          <FiSettings className="h-4 w-4" /> Store Settings
        </Button>
        <Button onClick={onCopyStoreLink} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
          <FiCopy className="h-4 w-4" /> Copy Store Link
        </Button>
        <Button onClick={onShareStore} className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
          <FiShare2 className="h-4 w-4" /> Share Store
        </Button>
      </AdminHeader>

      <main className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardStat label="Store Name" value={storeState.storeName || "My Online Store"} />
          {metrics.map(([label, value]) => <DashboardStat key={label} label={label} value={value} />)}
        </div>

        <Card className="p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Online Orders</h2>
              <p className="mt-1 text-sm text-slate-500">Review incoming customer orders and update their status.</p>
            </div>
            <Button onClick={onOrders} className="w-fit bg-slate-950 text-white hover:bg-slate-800">
              <FiShoppingBag className="h-4 w-4" /> Open Orders
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ["New Orders", orderCounts.new],
              ["Accepted Orders", orderCounts.accepted],
              ["Rejected Orders", orderCounts.rejected],
              ["Total Orders", orderCounts.total],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden shadow-sm">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-blue-50 text-blue-600">
                {storeState.logoUrl ? <img src={storeState.logoUrl} alt={storeState.storeName} className="h-full w-full object-cover" /> : <FiShoppingBag className="h-7 w-7" />}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-slate-950">{storeState.storeName}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{storeState.description || "Add a short store description for customers."}</p>
              </div>
            </div>
            <div className="grid gap-1 text-sm text-slate-600">
              {storeState.gstin && <span className="font-semibold text-slate-700">GSTIN: {storeState.gstin}</span>}
              {storeState.contactNumber && <span><FiPhone className="mr-2 inline h-4 w-4" />{storeState.contactNumber}</span>}
              {storeState.email && <span><FiMail className="mr-2 inline h-4 w-4" />{storeState.email}</span>}
              {storeState.address && <span><FiMapPin className="mr-2 inline h-4 w-4" />{storeState.address}</span>}
            </div>
          </div>
        </Card>

        <Card className="p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Online item preview</h2>
            <button type="button" onClick={onManageItems} className="text-sm font-semibold text-blue-600 hover:text-blue-700">Change selection</button>
          </div>
          {onlineItems.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {onlineItems.slice(0, 4).map((item) => <CompactOnlineItem key={item.id} item={item} />)}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
              <FiPackage className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-600">No online items selected yet.</p>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

function ItemCard({ item, selected, onToggle, onEdit }) {
  return (
    <article className={`overflow-hidden rounded-lg border bg-white shadow-sm transition ${selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}>
      <div className="flex min-h-32 gap-3 p-3">
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.itemName} className="h-full w-full object-cover" /> : <FiImage className="h-6 w-6 text-slate-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-slate-900">{item.itemName}</h2>
              <p className="mt-1 text-xs font-semibold capitalize text-slate-500">{item.type}</p>
            </div>
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
                selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
              }`}
              aria-label={selected ? "Remove from online store" : "Add to online store"}
            >
              {selected ? <FiCheck className="h-4 w-4" /> : <FiPlus className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <div className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">
              <PriceSummary item={item} finalClassName="text-xs font-bold text-blue-700" />
            </div>
            <StockPill item={item} />
          </div>
          <div className="mt-3 grid gap-1 text-xs text-slate-500">
            {item.category && <span className="truncate"><FiTag className="mr-1 inline h-3.5 w-3.5" />{item.category}</span>}
            {item.itemCode && <span className="truncate">Code: {item.itemCode}</span>}
            <TaxNote item={item} />
          </div>
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="mt-3 inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <FiEdit3 className="h-3.5 w-3.5" /> Edit Item
          </button>
        </div>
      </div>
    </article>
  );
}

function StoreBuilder({ items, storeState, setStoreState, onAddItem, onEditItem, onRefresh, onBack, onStoreCreated }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const selectedIds = useMemo(() => storeState.selectedItemIds || [], [storeState.selectedItemIds]);
  const [draftSelectedIds, setDraftSelectedIds] = useState(selectedIds);
  const selectedItems = useMemo(() => items.filter((item) => draftSelectedIds.includes(item.id)), [draftSelectedIds, items]);
  const categories = useMemo(() => ["All", ...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) =>
      (category === "All" || item.category === category) &&
      (!normalizedQuery || [item.itemName, item.category, item.itemCode, item.type].some((value) => String(value || "").toLowerCase().includes(normalizedQuery)))
    );
  }, [category, items, query]);

  const updateStore = async (patch) => setStoreState(await saveOnlineStoreState({ ...storeState, ...patch }));
  const toggleItem = (id) => {
    setDraftSelectedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
  };
  const saveSelection = () => updateStore({ selectedItemIds: draftSelectedIds, created: storeState.created });
  const createStore = async () => {
    await updateStore({ created: true, selectedItemIds: draftSelectedIds });
    onStoreCreated?.();
  };

  return (
    <div className="min-h-full bg-slate-100">
      <AdminHeader title={storeState.created ? "Manage Store Items" : "Create Online Store"} subtitle="Choose items already saved in the Items system.">
        {storeState.created && (
          <Button onClick={onBack} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
            <FiArrowLeft className="h-4 w-4" /> Dashboard
          </Button>
        )}
        <button type="button" onClick={onRefresh} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">
          <FiRefreshCw className="h-4 w-4" />
        </button>
        <Button onClick={onAddItem} className="bg-rose-600 text-white hover:bg-rose-700">
          <FiPlus className="h-4 w-4" /> Add Item
        </Button>
      </AdminHeader>

      <main className="space-y-4 p-4 sm:p-5">
        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#1A1F71]/10 text-[#1A1F71]">
                <FiShoppingBag className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">Online selection</h2>
                <p className="text-sm text-slate-500">{storeState.created ? "Draft saved" : "Select inventory items"}</p>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-semibold text-slate-600">Store Name</span>
              <input
                value={storeState.storeName}
                onChange={(event) => updateStore({ storeName: event.target.value })}
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <div className="mt-5 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Selected Items</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{selectedItems.length}</p>
              {storeState.created && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  <FiCheck className="h-3.5 w-3.5" /> Store created
                </p>
              )}
            </div>

            <Button
              onClick={storeState.created ? saveSelection : createStore}
              disabled={!draftSelectedIds.length}
              className={`mt-5 w-full ${draftSelectedIds.length ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-white"}`}
            >
              {storeState.created ? "Save Changes" : "Create Store"}
            </Button>
          </Card>

          <section>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Inventory Items</h2>
                <p className="text-sm text-slate-500">No duplicate products are created here.</p>
              </div>
              <label className="flex h-10 min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 sm:w-80">
                <FiSearch className="h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search items"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-bold ${category === item ? "bg-[#1A1F71] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  selected={draftSelectedIds.includes(item.id)}
                  onToggle={toggleItem}
                  onEdit={onEditItem}
                />
              ))}
            </div>

            {!filteredItems.length && (
              <Card className="grid min-h-48 place-items-center p-6 text-center shadow-sm">
                <div>
                  <FiPackage className="mx-auto h-8 w-8 text-slate-300" />
                  <h3 className="mt-3 font-bold text-slate-800">No matching items</h3>
                  <p className="mt-1 text-sm text-slate-500">Try another search or add a new item.</p>
                  <Button onClick={onAddItem} className="mt-4 bg-rose-600 text-white hover:bg-rose-700">
                    <FiPlus className="h-4 w-4" /> Add Item
                  </Button>
                </div>
              </Card>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

function StoreDetailsModal({ storeState, onClose, onSave }) {
  const [form, setForm] = useState(storeState);
  const fileRef = useRef(null);
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleLogoUpload = (event) => {
    const [file] = event.target.files || [];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateField("logoUrl", reader.result || "");
    reader.readAsDataURL(file);
  };

  const save = () => onSave({
    storeName: form.storeName,
    businessName: form.businessName,
    gstin: form.gstin,
    logoUrl: form.logoUrl,
    contactNumber: form.contactNumber,
    email: form.email,
    address: form.address,
    description: form.description,
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" onClick={onClose}>
      <Card className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Edit Store Details</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><FiX className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-dashed border-blue-300 bg-blue-50/40 text-sm font-semibold text-blue-600 hover:bg-blue-50">
                {form.logoUrl ? <img src={form.logoUrl} alt="Store logo" className="h-full w-full object-cover" /> : <span className="grid place-items-center gap-2"><FiImage className="h-6 w-6" /> Add Logo</span>}
              </button>
              {form.logoUrl && <button type="button" onClick={() => updateField("logoUrl", "")} className="mt-2 text-sm font-semibold text-rose-600">Remove logo</button>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["storeName", "Store Name"],
                ["businessName", "Business Name"],
                ["gstin", "GSTIN"],
                ["contactNumber", "Contact Number"],
                ["email", "Email"],
              ].map(([field, label]) => (
                <label key={field} className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-600">{label}</span>
                  <input value={form[field] || ""} onChange={(event) => updateField(field, event.target.value)} className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
                </label>
              ))}
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-600">Address</span>
                <textarea value={form.address || ""} onChange={(event) => updateField("address", event.target.value)} className="h-20 w-full resize-none rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-600">Store Description</span>
                <textarea value={form.description || ""} onChange={(event) => updateField("description", event.target.value)} className="h-24 w-full resize-none rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500" />
              </label>
            </div>
          </div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <Button onClick={onClose} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</Button>
          <Button onClick={save} className="bg-blue-600 text-white hover:bg-blue-700">Save Details</Button>
        </footer>
      </Card>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex h-7 w-12 rounded-full p-1 transition ${checked ? "bg-blue-600" : "bg-slate-300"}`}
      aria-pressed={checked}
    >
      <span className={`h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

function StoreSettingsModal({ storeState, onClose, onSave }) {
  const [form, setForm] = useState(storeState);
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const save = () => onSave({
    acceptOnlineOrders: Boolean(form.acceptOnlineOrders),
    minimumOrderAmount: String(form.minimumOrderAmount || "").replace(/[^\d.]/g, ""),
    additionalChargesEnabled: Boolean(form.additionalChargesEnabled),
    additionalChargeName: form.additionalChargeName || "",
    additionalChargeAmount: String(form.additionalChargeAmount || "").replace(/[^\d.]/g, ""),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" onClick={onClose}>
      <Card className="w-full max-w-xl overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Store Settings</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><FiX className="h-5 w-5" /></button>
        </header>
        <div className="space-y-5 p-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
            <div>
              <p className="font-bold text-slate-900">Accept Online Orders</p>
              <p className="mt-1 text-sm text-slate-500">Stores the owner preference for the later order phase.</p>
            </div>
            <Toggle checked={Boolean(form.acceptOnlineOrders)} onChange={(value) => updateField("acceptOnlineOrders", value)} />
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Minimum Order Amount</span>
            <div className="flex h-11 items-center rounded-md border border-slate-300 bg-white px-3 focus-within:border-blue-500">
              <span className="mr-2 text-sm font-bold text-slate-500">Rs</span>
              <input
                value={form.minimumOrderAmount || ""}
                onChange={(event) => updateField("minimumOrderAmount", event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </label>

          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-slate-900">Additional Charges</p>
                <p className="mt-1 text-sm text-slate-500">Example: Delivery Charge - Rs 40.</p>
              </div>
              <Toggle checked={Boolean(form.additionalChargesEnabled)} onChange={(value) => updateField("additionalChargesEnabled", value)} />
            </div>
            {form.additionalChargesEnabled && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-600">Charge Name</span>
                  <input
                    value={form.additionalChargeName || ""}
                    onChange={(event) => updateField("additionalChargeName", event.target.value)}
                    placeholder="Delivery Charge"
                    className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-600">Charge Amount</span>
                  <div className="flex h-11 items-center rounded-md border border-slate-300 bg-white px-3 focus-within:border-blue-500">
                    <span className="mr-2 text-sm font-bold text-slate-500">Rs</span>
                    <input
                      value={form.additionalChargeAmount || ""}
                      onChange={(event) => updateField("additionalChargeAmount", event.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="40"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <Button onClick={onClose} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</Button>
          <Button onClick={save} className="bg-blue-600 text-white hover:bg-blue-700">Save Settings</Button>
        </footer>
      </Card>
    </div>
  );
}

function OrderStatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${orderStatusClass(status)}`}>
      {orderStatusLabel(status)}
    </span>
  );
}

function OrderDetailsModal({ order, onClose, onAccept, onReject, onConvert }) {
  const canUpdate = order.status === "new";
  const canConvert = order.status === "accepted" && !order.convertedToSale;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" onClick={onClose}>
      <Card className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-950">{order.id}</h2>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{formatDateTime(order.createdAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canUpdate && (
              <>
                <Button onClick={() => onAccept(order.id)} className="bg-emerald-600 text-white hover:bg-emerald-700">Accept Order</Button>
                <Button onClick={() => onReject(order.id)} className="bg-rose-600 text-white hover:bg-rose-700">Reject Order</Button>
              </>
            )}
            {canConvert && (
              <Button onClick={() => onConvert(order)} className="bg-blue-600 text-white hover:bg-blue-700">Convert to Sale Invoice</Button>
            )}
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-bold text-slate-900">Customer</h3>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <p><b className="text-slate-950">Name:</b> {order.customerName || "-"}</p>
                <p><b className="text-slate-950">Mobile:</b> {order.mobile || order.mobileNumber || "-"}</p>
                <p><b className="text-slate-950">Address:</b> {order.address || "-"}</p>
              </div>
              <h3 className="mt-5 font-bold text-slate-900">Order</h3>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <p><b className="text-slate-950">Order ID:</b> {order.id}</p>
                <p><b className="text-slate-950">Date:</b> {formatDateTime(order.createdAt)}</p>
                <p><b className="text-slate-950">Status:</b> {orderStatusLabel(order.status)}</p>
                {order.convertedToSale && (
                  <p className="rounded-lg bg-blue-50 px-3 py-2 font-semibold text-blue-700">
                    Converted to Sale Invoice: {order.invoiceNumber || order.saleId}
                  </p>
                )}
              </div>
            </section>

            <section className="min-w-0">
              <h3 className="mb-3 font-bold text-slate-900">Items</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[780px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      {["Item", "Qty", "Unit", "Unit Price", "Discount", "Final Price", "Line Total"].map((header) => (
                        <th key={header} className="border-b border-slate-200 px-3 py-3">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id || item.itemId} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-3 font-bold text-slate-900">{item.itemNameSnapshot || item.itemName}</td>
                        <td className="px-3 py-3 text-slate-600">{item.quantity}</td>
                        <td className="px-3 py-3 text-slate-600">{item.unit || "-"}</td>
                        <td className="px-3 py-3 text-slate-600">{formatCurrency(item.unitPrice, "Rs 0")}</td>
                        <td className="px-3 py-3 text-slate-600">{formatCurrency(item.discountAmount || 0, "Rs 0")}</td>
                        <td className="px-3 py-3 font-bold text-slate-900">{formatCurrency(item.finalUnitPrice, "Rs 0")}</td>
                        <td className="px-3 py-3 font-bold text-slate-900">{formatCurrency(item.lineTotal, "Rs 0")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 ml-auto max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <b className="text-slate-950">{formatCurrency(order.subtotal, "Rs 0")}</b>
                </div>
                {(order.additionalCharge || order.additionalChargeAmount) > 0 && (
                  <div className="mt-2 flex justify-between text-sm text-slate-600">
                    <span>{order.additionalChargeName || "Additional Charge"}</span>
                    <b className="text-slate-950">{formatCurrency(order.additionalChargeAmount || order.additionalCharge, "Rs 0")}</b>
                  </div>
                )}
                <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-black text-slate-950">
                  <span>Total</span>
                  <span>{formatCurrency(order.total, "Rs 0")}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </Card>
    </div>
  );
}

function OnlineOrdersView({ orders, storeState, onBack, onRefresh, onAccept, onReject, onConvert }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [activeOrderId, setActiveOrderId] = useState(null);
  const storeOrders = useMemo(() => orders.filter((order) => order.storeId === storeState.prototypeStoreId), [orders, storeState.prototypeStoreId]);
  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return storeOrders.filter((order) => {
      const statusMatch = statusFilter === "all" || order.status === statusFilter;
      const queryMatch = !normalizedQuery || [order.id, order.customerName, order.mobile, order.mobileNumber]
        .some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
      return statusMatch && queryMatch;
    });
  }, [query, statusFilter, storeOrders]);
  const activeOrder = useMemo(() => storeOrders.find((order) => order.id === activeOrderId), [activeOrderId, storeOrders]);
  const counts = {
    all: storeOrders.length,
    new: storeOrders.filter((order) => order.status === "new").length,
    accepted: storeOrders.filter((order) => order.status === "accepted").length,
    rejected: storeOrders.filter((order) => order.status === "rejected").length,
  };

  const acceptOrder = (orderId) => {
    onAccept(orderId);
    setActiveOrderId(orderId);
  };
  const rejectOrder = (orderId) => {
    onReject(orderId);
    setActiveOrderId(orderId);
  };

  return (
    <div className="min-h-full bg-slate-100">
      <AdminHeader title="Online Orders" subtitle="Review customer orders placed from the public storefront.">
        <Button onClick={onBack} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
          <FiArrowLeft className="h-4 w-4" /> Dashboard
        </Button>
        <button type="button" onClick={onRefresh} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">
          <FiRefreshCw className="h-4 w-4" />
        </button>
      </AdminHeader>

      <main className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["New Orders", counts.new],
            ["Accepted Orders", counts.accepted],
            ["Rejected Orders", counts.rejected],
            ["Total Orders", counts.all],
          ].map(([label, value]) => <DashboardStat key={label} label={label} value={value} />)}
        </div>

        <Card className="p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[
                ["all", "All"],
                ["new", "New"],
                ["accepted", "Accepted"],
                ["rejected", "Rejected"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-bold ${statusFilter === value ? "bg-[#1A1F71] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {label} ({counts[value]})
                </button>
              ))}
            </div>
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 lg:w-80">
              <FiSearch className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search order, customer, mobile"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </Card>

        <Card className="overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                <tr>
                  {["Order ID", "Customer", "Mobile", "Date/Time", "Total", "Status", ""].map((header) => (
                    <th key={header} className="border-b border-slate-200 px-4 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-3 font-bold text-slate-900">{order.id}</td>
                    <td className="px-4 py-3 text-slate-700">{order.customerName || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{order.mobile || order.mobileNumber || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(order.createdAt)}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{formatCurrency(order.total, "Rs 0")}</td>
                    <td className="px-4 py-3"><OrderStatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => setActiveOrderId(order.id)} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredOrders.length && (
            <div className="grid min-h-56 place-items-center p-8 text-center">
              <div>
                <FiShoppingBag className="mx-auto h-9 w-9 text-slate-300" />
                <h2 className="mt-3 font-bold text-slate-900">No orders found</h2>
                <p className="mt-1 text-sm text-slate-500">New customer orders will appear here.</p>
              </div>
            </div>
          )}
        </Card>
      </main>

      {activeOrder && (
        <OrderDetailsModal
          order={activeOrder}
          onClose={() => setActiveOrderId(null)}
          onAccept={acceptOrder}
          onReject={rejectOrder}
          onConvert={onConvert}
        />
      )}
    </div>
  );
}

function StorefrontPreview({ storeState, items, onBack, onShareProduct }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [activeProduct, setActiveProduct] = useState(null);
  const categories = useMemo(() => ["All", ...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatch = category === "All" || item.category === category;
      const queryMatch = !normalizedQuery || [item.itemName, item.category, item.itemCode].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
      return categoryMatch && queryMatch;
    });
  }, [category, items, query]);

  return (
    <div className="min-h-full bg-[#f8fafc]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <FiArrowLeft className="h-4 w-4" /> Back to dashboard
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Customer preview</span>
          </div>
        </div>
      </header>

      <main>
        <section className="bg-white">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-7 sm:px-5 lg:grid-cols-[1fr_360px] lg:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-slate-500">
                {storeState.logoUrl ? <img src={storeState.logoUrl} alt={storeState.storeName} className="h-full w-full object-cover" /> : <FiShoppingBag className="h-8 w-8" />}
              </div>
              <div className="min-w-0">
                <h1 className="break-words text-3xl font-black text-slate-950">{storeState.storeName}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{storeState.description || "Browse available products from our online catalogue."}</p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-bold text-slate-900">{storeState.businessName || storeState.storeName}</p>
              {storeState.gstin && <p className="mt-2 font-semibold text-slate-700">GSTIN: {storeState.gstin}</p>}
              {storeState.contactNumber && <p className="mt-2"><FiPhone className="mr-2 inline h-4 w-4" />{storeState.contactNumber}</p>}
              {storeState.email && <p className="mt-1"><FiMail className="mr-2 inline h-4 w-4" />{storeState.email}</p>}
              {storeState.address && <p className="mt-1"><FiMapPin className="mr-2 inline h-4 w-4" />{storeState.address}</p>}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-5">
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
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
                  className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-bold ${category === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visibleItems.map((item) => (
              <StorefrontProductCard key={item.id} item={item} onView={() => setActiveProduct(item)} onShare={() => onShareProduct(item)} />
            ))}
          </div>

          {!visibleItems.length && (
            <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
              <div>
                <FiPackage className="mx-auto h-8 w-8 text-slate-300" />
                <h2 className="mt-3 font-bold text-slate-900">No products found</h2>
                <p className="mt-1 text-sm text-slate-500">Try another search or category.</p>
              </div>
            </div>
          )}
        </section>
      </main>

      {activeProduct && <ProductDetailModal item={activeProduct} onShare={() => onShareProduct(activeProduct)} onClose={() => setActiveProduct(null)} />}
    </div>
  );
}

function StorefrontProductCard({ item, onView, onShare }) {
  const availability = getInventoryItemAvailability(item);
  const addDisabled = true;

  return (
    <article className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button type="button" onClick={onView} className="block w-full flex-1 text-left">
        <div className="grid aspect-[4/3] max-h-52 min-h-40 place-items-center overflow-hidden bg-slate-100 p-3">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.itemName} className="max-h-full max-w-full object-contain" /> : <FiImage className="h-10 w-10 text-slate-300" />}
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="line-clamp-2 min-h-10 text-base font-black leading-5 text-slate-950">{item.itemName}</h2>
            {item.category && <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{item.category}</span>}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <PriceSummary item={item} finalClassName="text-xl font-black text-slate-950" />
            <TaxNote item={item} className="mt-1" />
          </div>
          <div className="mt-3">
            <StockPill item={item} />
          </div>
        </div>
      </button>
      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 bg-slate-50/70 p-3">
        <button type="button" onClick={onView} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
          <FiEye className="h-4 w-4 shrink-0" />
          <span className="truncate">View</span>
        </button>
        <button type="button" onClick={onShare} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 text-sm font-bold text-blue-700 hover:bg-blue-100">
          <FiShare2 className="h-4 w-4 shrink-0" />
          <span className="truncate">Share</span>
        </button>
        <button
          type="button"
          disabled={addDisabled}
          className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-bold ${
            availability.inStock && !addDisabled ? "border border-blue-200 bg-white text-blue-700 hover:bg-blue-50" : "bg-slate-200 text-white"
          }`}
        >
          <FiPlus className="h-4 w-4 shrink-0" />
          <span className="truncate">Add</span>
        </button>
      </div>
    </article>
  );
}

function ProductDetailModal({ item, onShare, onClose }) {
  const availability = getInventoryItemAvailability(item);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" onClick={onClose}>
      <Card className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-slate-400">Product details</p>
            <h2 className="truncate text-sm font-bold text-slate-700">{item.itemName}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><FiX className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-5 lg:grid-cols-[42%_minmax(0,1fr)]">
            <div className="grid aspect-[4/3] max-h-[360px] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-4">
              {item.imageUrl ? <img src={item.imageUrl} alt={item.itemName} className="max-h-full max-w-full object-contain" /> : <FiImage className="h-12 w-12 text-slate-300" />}
            </div>
            <section className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{item.category || "Product"}</span>
                <StockPill item={item} />
              </div>
              <h3 className="mt-4 break-words text-2xl font-black leading-tight text-slate-950">{item.itemName}</h3>
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <PriceSummary item={item} finalClassName="text-3xl font-black text-blue-700" />
                <TaxNote item={item} className="mt-2 text-sm" />
              </div>
              {item.description && <p className="mt-4 text-sm leading-6 text-slate-600">{item.description}</p>}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {item.unit && (
                  <div className="rounded-lg border border-slate-100 bg-white p-3">
                    <p className="text-xs font-bold uppercase text-slate-400">Unit</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{item.unit}</p>
                  </div>
                )}
                {availability.showStock && (
                  <div className="rounded-lg border border-slate-100 bg-white p-3">
                    <p className="text-xs font-bold uppercase text-slate-400">Stock</p>
                    <p className={`mt-1 text-sm font-black ${availability.inStock ? "text-emerald-700" : "text-rose-700"}`}>{availability.label}</p>
                  </div>
                )}
                {item.itemCode && (
                  <div className="rounded-lg border border-slate-100 bg-white p-3">
                    <p className="text-xs font-bold uppercase text-slate-400">Item Code</p>
                    <p className="mt-1 break-words text-sm font-black text-slate-900">{item.itemCode}</p>
                  </div>
                )}
                {item.type && (
                  <div className="rounded-lg border border-slate-100 bg-white p-3">
                    <p className="text-xs font-bold uppercase text-slate-400">Type</p>
                    <p className="mt-1 text-sm font-black capitalize text-slate-900">{item.type}</p>
                  </div>
                )}
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
                  Add to cart is available on the customer storefront. This owner preview keeps the action read-only.
                </p>
                <Button onClick={onShare} className="w-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                  <FiShare2 className="h-4 w-4" /> Share Product
                </Button>
              </div>
            </section>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ShareToast({ message }) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] max-w-sm rounded-lg border border-emerald-100 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">
      <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-emerald-50 align-middle">
        <FiCheck className="h-3.5 w-3.5" />
      </span>
      {message}
    </div>
  );
}

function OnlineStore() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [storeState, setStoreState] = useState({ storeName: "My Online Store", selectedItemIds: [] });
  const [orders, setOrders] = useState([]);
  const [viewReady, setViewReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const shareStatusTimer = useRef(null);
  const [view, setView] = useState("manage");

  useEffect(() => {
    Promise.all([loadGrowthItems(), getOnlineStoreState(), loadGrowthOrders()]).then(([nextItems, nextStore, nextOrders]) => {
      setItems(nextItems); setStoreState(nextStore); setOrders(nextOrders); setView(nextStore.created ? "dashboard" : "manage");
    }).catch((error) => setLoadError(error.message)).finally(() => setViewReady(true));
  }, []);

  useEffect(() => () => {
    if (shareStatusTimer.current) window.clearTimeout(shareStatusTimer.current);
  }, []);

  useEffect(() => {
    const refreshOrders = () => loadGrowthOrders().then(setOrders).catch((error) => window.alert(error.message));
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshOrders();
    };
    const refreshWhenStorageChanges = (event) => {
      if (!event.key || event.key.includes("onlineStoreOrders")) refreshOrders();
    };

    window.addEventListener("focus", refreshOrders);
    window.addEventListener("storage", refreshWhenStorageChanges);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshOrders);
      window.removeEventListener("storage", refreshWhenStorageChanges);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const selectedOnlineItems = useMemo(() => {
    const selectedIds = new Set(storeState.selectedItemIds || []);
    return items.filter((item) => selectedIds.has(item.id));
  }, [items, storeState.selectedItemIds]);
  const storeOrders = useMemo(() => orders.filter((order) => order.storeId === storeState.prototypeStoreId), [orders, storeState.prototypeStoreId]);

  const refreshItems = () => loadGrowthItems().then(setItems).catch((error) => window.alert(error.message));
  const refreshOrders = () => loadGrowthOrders().then(setOrders).catch((error) => window.alert(error.message));

  const openNewItem = () => {
    setEditingItem(null);
    setAddItemOpen(true);
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setAddItemOpen(true);
  };

  const closeItemEditor = () => {
    setAddItemOpen(false);
    setEditingItem(null);
  };

  const handleItemSaved = async (itemForm) => {
    const item = await saveGrowthItem(itemForm);
    await refreshItems();
    if (!itemForm.id) {
      const updated = await saveOnlineStoreState({ ...storeState, selectedItemIds: [...new Set([...(storeState.selectedItemIds || []), item.id])] }); setStoreState(updated);
    }
    closeItemEditor();
    return item;
  };

  const showShareStatus = (message) => {
    if (shareStatusTimer.current) window.clearTimeout(shareStatusTimer.current);
    setShareStatus(message);
    shareStatusTimer.current = window.setTimeout(() => {
      setShareStatus("");
      shareStatusTimer.current = null;
    }, 2800);
  };

  const saveStoreDetails = async (details) => {
    setStoreState(await saveOnlineStoreState({ ...storeState, ...details }));
    setDetailsOpen(false);
  };

  const saveStoreSettings = async (settings) => {
    setStoreState(await saveOnlineStoreState({ ...storeState, ...settings }));
    setSettingsOpen(false);
  };

  const ensureShareReadyStore = async () => {
    const nextStoreState = await saveOnlineStoreState({ ...storeState });
    setStoreState(nextStoreState);
    return nextStoreState;
  };

  const copyStoreLink = async () => {
    const nextStoreState = await ensureShareReadyStore();
    await copyText(prototypeStoreUrl(nextStoreState));
    showShareStatus("Store link copied.");
  };

  const shareStore = async () => {
    const nextStoreState = await ensureShareReadyStore();
    const status = await shareLink({
      title: nextStoreState.storeName || "Online Store",
      text: `View ${nextStoreState.storeName || "my online store"}.`,
      url: prototypeStoreUrl(nextStoreState),
    });
    showShareStatus(status);
  };

  const shareProduct = async (item) => {
    const nextStoreState = await ensureShareReadyStore();
    const status = await shareLink({
      title: item.itemName,
      text: `View ${item.itemName} from ${nextStoreState.storeName || "my online store"}.`,
      url: prototypeProductUrl(nextStoreState, item),
    });
    showShareStatus(status);
  };

  const updateOrderStatus = async (orderId, status) => {
    await updateGrowthOrder(orderId, { status });
    await refreshOrders();
  };

  const convertOrderToSale = (order) => {
    if (order.status !== "accepted" || order.convertedToSale) return;
    navigate("/sales/sale-invoices/new", {
      state: {
        from: "/business-growth/online-store",
        onlineOrderConversion: order,
      },
    });
  };

  let content;
  if (!viewReady) {
    content = <div role="status" className="p-8 text-sm font-semibold text-slate-500">Loading your online store…</div>;
  } else if (loadError) {
    content = <div role="alert" className="m-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{loadError}</div>;
  } else if (!items.length) {
    content = <EmptyOnlineStore onAddItem={openNewItem} />;
  } else if (view === "orders" && storeState.created) {
    content = (
      <OnlineOrdersView
        orders={orders}
        storeState={storeState}
        onBack={() => setView("dashboard")}
        onRefresh={refreshOrders}
        onAccept={(orderId) => updateOrderStatus(orderId, "accepted")}
        onReject={(orderId) => updateOrderStatus(orderId, "rejected")}
        onConvert={convertOrderToSale}
      />
    );
  } else if (view === "preview" && storeState.created) {
    content = (
      <StorefrontPreview
        storeState={storeState}
        items={selectedOnlineItems}
        onBack={() => setView("dashboard")}
        onShareProduct={shareProduct}
      />
    );
  } else if (storeState.created && view !== "manage") {
    content = (
      <StoreDashboard
        items={items}
        onlineItems={selectedOnlineItems}
        orders={storeOrders}
        storeState={storeState}
        onPreview={() => setView("preview")}
        onManageItems={() => setView("manage")}
        onOrders={() => setView("orders")}
        onEditDetails={() => setDetailsOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onCopyStoreLink={copyStoreLink}
        onShareStore={shareStore}
        onRefresh={refreshItems}
      />
    );
  } else {
    content = (
      <StoreBuilder
        key={`${storeState.selectedItemIds?.join("|") || "none"}-${items.length}`}
        items={items}
        storeState={storeState}
        setStoreState={setStoreState}
        onAddItem={openNewItem}
        onEditItem={openEditItem}
        onRefresh={refreshItems}
        onBack={() => setView("dashboard")}
        onStoreCreated={() => setView("dashboard")}
      />
    );
  }

  return (
    <>
      {content}
      <ShareToast message={shareStatus} />
      {addItemOpen && <AddItemModal item={editingItem} onClose={closeItemEditor} onItemSaved={handleItemSaved} />}
      {detailsOpen && <StoreDetailsModal storeState={storeState} onClose={() => setDetailsOpen(false)} onSave={saveStoreDetails} />}
      {settingsOpen && <StoreSettingsModal storeState={storeState} onClose={() => setSettingsOpen(false)} onSave={saveStoreSettings} />}
    </>
  );
}

export default OnlineStore;
