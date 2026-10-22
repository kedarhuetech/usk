import { useState } from "react";
import { FiMapPin, FiPlus, FiSettings, FiUsers, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import Input from "../../components/Common/Input";
import { gstTypes, indianStates, partyFormDefaults } from "../../constants/partiesData";

const tabs = ["GST & Address", "Credit & Balance", "Additional Fields"];

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

function PartyIllustration() {
  return (
    <div className="relative mx-auto h-56 w-72">
      <div className="absolute left-8 top-8 h-40 w-52 rounded-lg border border-slate-200 bg-white shadow-sm" />
      <div className="absolute left-2 top-12 h-32 w-44 rounded-lg bg-amber-400 shadow-lg">
        <div className="h-7 rounded-t-lg bg-slate-700" />
        <div className="space-y-3 p-4">
          <div className="h-4 w-28 rounded bg-white/80" />
          <div className="h-3 w-36 rounded bg-white/70" />
          <div className="h-3 w-32 rounded bg-white/70" />
        </div>
      </div>
      <div className="absolute bottom-6 right-2 flex h-24 w-24 items-center justify-center rounded-full border-8 border-amber-400 bg-white text-[#1A1F71] shadow-md">
        <FiUsers className="h-10 w-10" />
      </div>
      <div className="absolute bottom-8 left-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 text-white shadow-md">
        <FiPlus className="h-7 w-7" />
      </div>
    </div>
  );
}

function GstAddressTab({ form, setField, showShipping, setShowShipping }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <SelectField label="GST Type" value={form.gstType} onChange={(value) => setField("gstType", value)} options={gstTypes} />
        <SelectField label="State" value={form.state} onChange={(value) => setField("state", value)} options={indianStates} />
        <Input label="Email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="Email ID" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <TextareaField label="Billing Address" value={form.billingAddress} onChange={(value) => setField("billingAddress", value)} placeholder="Billing Address" />
          <button type="button" className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
            Show Detailed Address
          </button>
        </div>
        <div>
          {showShipping ? (
            <>
              <TextareaField label="Shipping Address" value={form.shippingAddress} onChange={(value) => setField("shippingAddress", value)} placeholder="Shipping Address" />
              <button type="button" className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
                Show Detailed Address
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowShipping(true)}
              className="mt-8 flex h-28 w-full items-center justify-center gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50/50 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              <FiPlus /> Add New Address
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreditBalanceTab({ form, setField }) {
  return (
    <div className="grid max-w-3xl gap-5 md:grid-cols-2">
      <Input label="Opening Balance" prefix="Rs" value={form.openingBalance} onChange={(event) => setField("openingBalance", event.target.value)} placeholder="0.00" />
      <Input label="As Of Date" type="date" value={form.asOfDate} onChange={(event) => setField("asOfDate", event.target.value)} />
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

function AdditionalFieldsTab({ form, setAdditionalField }) {
  return (
    <div className="space-y-3">
      {form.additionalFields.map((field, index) => (
        <div key={field.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[40px_1fr_1fr_150px]">
          <label className="flex items-center">
            <input type="checkbox" checked={field.enabled} onChange={(event) => setAdditionalField(index, "enabled", event.target.checked)} className="h-4 w-4 accent-blue-600" />
          </label>
          <Input value={field.fieldName} onChange={(event) => setAdditionalField(index, "fieldName", event.target.value)} placeholder="Field Name" />
          <Input type={field.type} value={field.value} onChange={(event) => setAdditionalField(index, "value", event.target.value)} placeholder="Value" />
          <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-600">
            Show In Print
            <input type="checkbox" checked={field.showInPrint} onChange={(event) => setAdditionalField(index, "showInPrint", event.target.checked)} className="h-4 w-4 accent-blue-600" />
          </label>
        </div>
      ))}
    </div>
  );
}

function AddPartyModal({ onClose }) {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [showShipping, setShowShipping] = useState(false);
  const [form, setForm] = useState(partyFormDefaults);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setAdditionalField = (index, field, value) => {
    setForm((current) => ({
      ...current,
      additionalFields: current.additionalFields.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <section className="ml-60 flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Add Party</h2>
          <div className="flex items-center gap-4 text-slate-500">
            <FiSettings className="h-5 w-5" />
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-slate-100">
              <FiX className="h-6 w-6" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Input label="Party Name *" value={form.partyName} onChange={(event) => setField("partyName", event.target.value)} placeholder="Party Name" />
            <Input label="GSTIN" value={form.gstin} onChange={(event) => setField("gstin", event.target.value)} placeholder="GSTIN" />
            <Input label="Phone Number" value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="Phone Number" />
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
              <GstAddressTab form={form} setField={setField} showShipping={showShipping} setShowShipping={setShowShipping} />
            )}
            {activeTab === "Credit & Balance" && <CreditBalanceTab form={form} setField={setField} />}
            {activeTab === "Additional Fields" && <AdditionalFieldsTab form={form} setAdditionalField={setAdditionalField} />}
          </div>
        </div>

        <footer className="flex justify-end gap-4 border-t border-slate-200 bg-white px-6 py-4">
          <Button className="border border-blue-600 bg-white text-blue-600 hover:bg-blue-50">Save & New</Button>
          <Button className="bg-blue-600 text-white shadow-sm hover:bg-blue-700">Save</Button>
        </footer>
      </section>
    </div>
  );
}

function PartyDetails() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="bg-slate-200 p-1">
      <Card className="flex min-h-[calc(100vh-7rem)] items-center justify-center p-6">
        <div className="max-w-2xl text-center">
          <h1 className="text-2xl font-bold text-slate-800">Party Details</h1>
          <p className="mt-4 text-base leading-7 text-slate-500">
            Add your customers and suppliers to manage your business easily.
            <br />
            Track payments and grow your business without any hassle.
          </p>
          <PartyIllustration />
          <Button onClick={() => setIsModalOpen(true)} className="bg-rose-600 text-white shadow-sm hover:bg-rose-700">
            <FiPlus className="h-5 w-5" /> Add Your First Party
          </Button>
        </div>
      </Card>
      {isModalOpen && <AddPartyModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}

export default PartyDetails;
