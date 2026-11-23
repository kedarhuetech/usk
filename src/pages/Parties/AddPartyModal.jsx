// Official Add Party Modal component from Parties section
import { useMemo, useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Input from "../../components/Common/Input";
import { gstTypes, indianStates, partyFormDefaults } from "../../constants/partiesData";
import { getParties } from "../../services/partiesStorage";

const tabs = ["GST & Address", "Credit & Balance", "Additional Fields"];

export const isPartyInactive = (p) => p?.status === "inactive" || p?.isActive === false;

// Renders the select field interface.
function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"
      >
        <option value="">Select {label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

// Renders the textarea field interface.
function TextareaField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-28 w-full resize-none rounded-md border border-slate-300 bg-white p-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500"
      />
    </label>
  );
}

// Renders the gst address tab interface.
function GstAddressTab({ form, setField, showShipping, setShowShipping, enableShippingAddress = true }) {
  const [showDetailedBilling, setShowDetailedBilling] = useState(Boolean(form.billingStreet || form.billingCity || form.billingPincode));
  const [showDetailedShipping, setShowDetailedShipping] = useState(Boolean(form.shippingStreet || form.shippingCity || form.shippingPincode));

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <SelectField label="GST Type" value={form.gstType} onChange={(value) => setField("gstType", value)} options={gstTypes} />
        <SelectField label="State" value={form.state} onChange={(value) => setField("state", value)} options={indianStates} />
        <Input label="Email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="Email ID" />
      </div>

      <div className={`grid gap-6 ${enableShippingAddress ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
        <div>
          <TextareaField label="Billing Address" value={form.billingAddress} onChange={(value) => setField("billingAddress", value)} placeholder="Billing Address" />
          {showDetailedBilling ? (
            <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
              <Input label="Street / Flat" value={form.billingStreet || ""} onChange={(e) => setField("billingStreet", e.target.value)} placeholder="Building, Street" />
              <div className="grid grid-cols-2 gap-2">
                <Input label="City" value={form.billingCity || ""} onChange={(e) => setField("billingCity", e.target.value)} placeholder="City" />
                <Input label="Pincode" value={form.billingPincode || ""} onChange={(e) => setField("billingPincode", e.target.value)} placeholder="Pincode" />
              </div>
              <button type="button" onClick={() => setShowDetailedBilling(false)} className="text-xs text-blue-600 hover:underline">Hide Detailed Fields</button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowDetailedBilling(true)} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
              Show Detailed Address
            </button>
          )}
        </div>
        {enableShippingAddress && (
          <div>
            {showShipping ? (
              <>
                <TextareaField label="Shipping Address" value={form.shippingAddress} onChange={(value) => setField("shippingAddress", value)} placeholder="Shipping Address" />
                {showDetailedShipping ? (
                  <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
                    <Input label="Shipping Street" value={form.shippingStreet || ""} onChange={(e) => setField("shippingStreet", e.target.value)} placeholder="Building, Street" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="City" value={form.shippingCity || ""} onChange={(e) => setField("shippingCity", e.target.value)} placeholder="City" />
                      <Input label="Pincode" value={form.shippingPincode || ""} onChange={(e) => setField("shippingPincode", e.target.value)} placeholder="Pincode" />
                    </div>
                    <button type="button" onClick={() => setShowDetailedShipping(false)} className="text-xs text-blue-600 hover:underline">Hide Detailed Fields</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowDetailedShipping(true)} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
                    Show Detailed Address
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowShipping(true)}
                className="mt-8 flex h-28 w-full items-center justify-center gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50/50 text-sm font-semibold text-blue-600 hover:bg-blue-50 cursor-pointer"
              >
                <FiPlus /> Add Shipping Address
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Renders the credit balance tab interface.
function CreditBalanceTab({ form, setField }) {
  return (
    <div className="grid max-w-3xl gap-5 md:grid-cols-2">
      <Input label="Opening Balance" prefix="Rs" value={form.openingBalance} onChange={(event) => setField("openingBalance", event.target.value)} placeholder="0.00" />
      <Input label="As Of Date" type="date" value={form.asOfDate} onChange={(event) => setField("asOfDate", event.target.value)} />
      <div className="flex flex-wrap items-center gap-6 md:col-span-2">
        {[{ value: "to-pay", label: "To Pay" }, { value: "to-receive", label: "To Receive" }].map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-3 text-base text-slate-700">
            <input type="radio" name="openingBalanceType" value={option.value} checked={form.openingBalanceType === option.value} onChange={() => setField("openingBalanceType", option.value)} className="h-5 w-5 accent-blue-600" />
            {option.label}
          </label>
        ))}
      </div>
      <div className="md:col-span-2 rounded-lg border border-slate-200 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-800">Credit Limit</p>
        <div className="flex flex-wrap gap-3">
          {["no-limit", "custom-limit"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setField("creditLimitType", type)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${form.creditLimitType === type ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {type === "no-limit" ? "No Limit" : "Custom Limit"}
            </button>
          ))}
        </div>
        {form.creditLimitType === "custom-limit" && (
          <div className="mt-4 max-w-sm">
            <Input prefix="Rs" value={form.creditLimit} onChange={(event) => setField("creditLimit", event.target.value)} placeholder="Credit Limit" />
          </div>
        )}
      </div>
    </div>
  );
}

// Renders the additional fields tab interface using configured settings.
function AdditionalFieldsTab({ form, setAdditionalField, customFieldSettings = [] }) {
  const activeSettings = (customFieldSettings?.length === 4 ? customFieldSettings : [])
    .filter((cf) => cf.enabled);

  if (activeSettings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
        <p className="text-sm font-medium text-slate-700">No additional party fields are currently enabled in Settings.</p>
        <p className="mt-1 text-xs text-slate-500">
          Go to <span className="font-semibold text-blue-600">Settings &gt; PARTY &gt; Additional fields</span> to enable custom fields (e.g. MRP, Route, Delivery Zone).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Active Additional Fields (Configured in Party Settings)
      </p>
      {activeSettings.map((setting) => {
        const fieldItem = (form.additionalFields || []).find((f) => f.id === setting.id) || {
          id: setting.id,
          fieldName: setting.name || "",
          value: "",
          showInPrint: setting.showInPrint ?? true,
          enabled: true,
          type: setting.type || "text",
        };
        const labelText = setting.name || `Field (${setting.id})`;

        return (
          <div
            key={setting.id}
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3.5 sm:grid-cols-[180px_1fr_140px] items-center shadow-xs"
          >
            <div>
              <span className="block text-xs font-bold text-slate-800">{labelText}</span>
              <span className="text-[11px] text-slate-400">
                {setting.type === "date" ? "Date (dd/mm/yy)" : "Text field"}
              </span>
            </div>

            <div>
              {setting.type === "date" ? (
                <input
                  type="date"
                  value={fieldItem.value || ""}
                  onChange={(e) => setAdditionalField(setting.id, "value", e.target.value, setting)}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                />
              ) : (
                <input
                  type="text"
                  value={fieldItem.value || ""}
                  onChange={(e) => setAdditionalField(setting.id, "value", e.target.value, setting)}
                  placeholder={`Enter ${labelText}`}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                />
              )}
            </div>

            <label className="flex items-center justify-end gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <span>Show In Print</span>
              <input
                type="checkbox"
                checked={fieldItem.showInPrint ?? setting.showInPrint ?? true}
                onChange={(e) => setAdditionalField(setting.id, "showInPrint", e.target.checked, setting)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

// Renders the add party modal interface.
export default function AddPartyModal({
  onClose,
  onSave,
  initialParty = null,
  appSettings = {},
  embedded = false,
  parties: externalParties = null,
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [showShipping, setShowShipping] = useState(Boolean(initialParty?.shippingAddress));
  const [form, setForm] = useState(() => ({
    ...partyFormDefaults,
    status: "active",
    loyaltyPoints: 0,
    ...(initialParty || {}),
    partyName: initialParty?.partyName || initialParty?.name || "",
    phone: initialParty?.phone || initialParty?.phoneNumber || "",
    billingAddress: initialParty?.billingAddress || initialParty?.address || "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditMode = Boolean(initialParty?.id);

  const allParties = useMemo(() => {
    if (Array.isArray(externalParties) && externalParties.length > 0) return externalParties;
    return getParties() || [];
  }, [externalParties]);

  const duplicateNameParty = useMemo(() => {
    const trimmed = (form.partyName || "").trim().toLowerCase();
    if (!trimmed) return null;
    return allParties.find(
      (p) =>
        String(p.id || "") !== String(initialParty?.id || "") &&
        String(p.partyName || p.name || "").trim().toLowerCase() === trimmed
    );
  }, [form.partyName, initialParty?.id, allParties]);

  const duplicateGstinParty = useMemo(() => {
    const trimmed = (form.gstin || "").trim().toUpperCase();
    if (!trimmed || trimmed.length < 5) return null;
    return allParties.find(
      (p) =>
        String(p.id || "") !== String(initialParty?.id || "") &&
        (p.gstin || "").trim().toUpperCase() === trimmed
    );
  }, [form.gstin, initialParty?.id, allParties]);

  const duplicatePhoneParty = useMemo(() => {
    const rawDigits = (form.phone || "").replace(/\D/g, "");
    if (!rawDigits || rawDigits.length < 10) return null;
    return allParties.find(
      (p) =>
        String(p.id || "") !== String(initialParty?.id || "") &&
        (p.phone || p.phoneNumber || "").replace(/\D/g, "") === rawDigits
    );
  }, [form.phone, initialParty?.id, allParties]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const setAdditionalField = (fieldId, prop, value, settingMeta = null) => {
    setForm((current) => {
      const existing = current.additionalFields || [];
      const idx = existing.findIndex((f) => f.id === fieldId);
      if (idx >= 0) {
        return {
          ...current,
          additionalFields: existing.map((f, i) => (i === idx ? { ...f, [prop]: value } : f)),
        };
      }
      return {
        ...current,
        additionalFields: [
          ...existing,
          {
            id: fieldId,
            fieldName: settingMeta?.name || fieldId,
            value: prop === "value" ? value : "",
            showInPrint: prop === "showInPrint" ? value : (settingMeta?.showInPrint ?? true),
            enabled: true,
            type: settingMeta?.type || "text",
            [prop]: value,
          },
        ],
      };
    });
  };

  const save = async (resetAfterSave = false) => {
    const trimmedName = form.partyName.trim();
    if (!trimmedName) {
      setError("Party name is required.");
      return;
    }
    if (duplicateNameParty) {
      setError(`A party with the name "${duplicateNameParty.partyName || duplicateNameParty.name}" already exists. Please choose a different party name.`);
      return;
    }
    const rawDigits = (form.phone || "").replace(/\D/g, "");
    if (form.phone && rawDigits.length > 0 && rawDigits.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (duplicateGstinParty) {
      const confirmSave = typeof window !== "undefined" && window.confirm
        ? window.confirm(`A party named "${duplicateGstinParty.partyName || duplicateGstinParty.name}" already has GSTIN "${form.gstin.trim().toUpperCase()}". Do you still want to proceed?`)
        : true;
      if (!confirmSave) return;
    }
    if (duplicatePhoneParty) {
      const confirmPhone = typeof window !== "undefined" && window.confirm
        ? window.confirm(`A party named "${duplicatePhoneParty.partyName || duplicatePhoneParty.name}" is already registered with phone "${form.phone.trim()}". Do you still want to proceed?`)
        : true;
      if (!confirmPhone) return;
    }
    setSaving(true);
    setError("");
    try {
      const isInactive = isPartyInactive(form);
      const partyData = {
        ...form,
        partyName: trimmedName,
        name: trimmedName,
        phone: form.phone?.trim() || "",
        phoneNumber: form.phone?.trim() || "",
        status: isInactive ? "inactive" : "active",
        isActive: !isInactive,
      };
      const result = await onSave(partyData);
      if (resetAfterSave) {
        setForm({ ...partyFormDefaults, status: "active", isActive: true, loyaltyPoints: 0 });
        setShowShipping(false);
      } else {
        onClose();
      }
      return result;
    } catch (saveError) {
      setError(saveError.message || "Could not save party.");
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <section className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-800">{isEditMode ? "Edit Party" : "Add Party"}</h2>
          {(appSettings.managePartyStatus ?? true) && (
            <button
              type="button"
              onClick={() => {
                const currentlyInactive = isPartyInactive(form);
                setField("status", currentlyInactive ? "active" : "inactive");
                setField("isActive", currentlyInactive);
              }}
              className={`rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                isPartyInactive(form)
                  ? "bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-200"
                  : "bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200"
              }`}
              title="Click to toggle Active / Inactive"
            >
              ● {isPartyInactive(form) ? "Inactive" : "Active"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-slate-100 cursor-pointer">
            <FiX className="h-6 w-6" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className={`grid gap-4 md:grid-cols-2 ${(appSettings.enablePartyGrouping ?? true) ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          <div>
            <Input
              label="Party Name *"
              value={form.partyName}
              onChange={(event) => {
                setField("partyName", event.target.value);
                if (error) setError("");
              }}
              placeholder="Party Name"
            />
            {duplicateNameParty && (
              <p className="mt-1 text-xs font-semibold text-rose-600 bg-rose-50 rounded px-2 py-1 border border-rose-200">
                A party named "{duplicateNameParty.partyName || duplicateNameParty.name}" already exists.
              </p>
            )}
          </div>
          <div>
            <Input label="GSTIN" value={form.gstin} onChange={(event) => setField("gstin", event.target.value)} placeholder="GSTIN" />
            {duplicateGstinParty && (
              <p className="mt-1 text-xs font-semibold text-amber-700 bg-amber-50 rounded px-2 py-1 border border-amber-200">
                Warning: GSTIN already used by "{duplicateGstinParty.partyName || duplicateGstinParty.name}".
              </p>
            )}
          </div>
          <Input label="Phone Number" value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="Phone Number" />
          {(appSettings.enablePartyGrouping ?? true) && (
            <Input label="Party Group" value={form.group || ""} onChange={(event) => setField("group", event.target.value)} placeholder="e.g. General, Retailers, Wholesalers" />
          )}
        </div>

        <div className="mt-8 border-b border-slate-200">
          <div className="flex gap-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-1 py-3 text-sm font-semibold ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          {activeTab === "GST & Address" && (
            <GstAddressTab
              form={form}
              setField={setField}
              showShipping={showShipping}
              setShowShipping={setShowShipping}
              enableShippingAddress={appSettings.enableShippingAddress ?? true}
            />
          )}
          {activeTab === "Credit & Balance" && <CreditBalanceTab form={form} setField={setField} />}
          {activeTab === "Additional Fields" && (
            <AdditionalFieldsTab
              form={form}
              setAdditionalField={setAdditionalField}
              customFieldSettings={appSettings.partyCustomFields}
            />
          )}
        </div>
      </div>

      <footer className="flex justify-end gap-4 border-t border-slate-200 bg-white px-6 py-4">
        {error && <p className="mr-auto self-center text-sm font-semibold text-red-600">{error}</p>}
        {!isEditMode && (
          <Button
            disabled={saving || Boolean(duplicateNameParty)}
            onClick={() => save(true)}
            className="border border-blue-600 bg-white text-blue-600 hover:bg-blue-50"
          >
            Save & New
          </Button>
        )}
        <Button
          disabled={saving || Boolean(duplicateNameParty)}
          onClick={() => save(false)}
          className="bg-blue-600 text-white shadow-sm hover:bg-blue-700"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </footer>
    </section>
  );

  if (embedded) return content;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {content}
    </div>
  );
}
