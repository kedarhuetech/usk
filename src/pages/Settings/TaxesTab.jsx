import React, { useState } from "react";
import { FiInfo, FiPlus, FiTrash2, FiX } from "react-icons/fi";

function InfoTooltip({ text }) {
  return (
    <span
      className="inline-flex cursor-help items-center text-slate-400 hover:text-slate-600 ml-1.5 shrink-0"
      title={text}
      aria-label={text}
    >
      <FiInfo className="h-4 w-4" />
    </span>
  );
}

const COMPOSITE_SCHEME_TYPES = [
  "Manufacturer 1.0%",
  "Trader 1.0%",
  "Restaurant 5.0%",
  "Other Service Provider 6.0%",
];

export default function TaxesTab({ settings, update }) {
  const [showTaxListModal, setShowTaxListModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [taxRates, setTaxRates] = useState(
    () =>
      settings.taxRatesList || [
        { id: "tax-0", name: "Exempt (0%)", rate: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, isDefault: false },
        { id: "tax-0.25", name: "GST @ 0.25%", rate: 0.25, igst: 0.25, cgst: 0.125, sgst: 0.125, cess: 0, isDefault: false },
        { id: "tax-3", name: "GST @ 3%", rate: 3, igst: 3, cgst: 1.5, sgst: 1.5, cess: 0, isDefault: false },
        { id: "tax-5", name: "GST @ 5%", rate: 5, igst: 5, cgst: 2.5, sgst: 2.5, cess: 0, isDefault: false },
        { id: "tax-12", name: "GST @ 12%", rate: 12, igst: 12, cgst: 6, sgst: 6, cess: 0, isDefault: false },
        { id: "tax-18", name: "GST @ 18%", rate: 18, igst: 18, cgst: 9, sgst: 9, cess: 0, isDefault: true },
        { id: "tax-28", name: "GST @ 28%", rate: 28, igst: 28, cgst: 14, sgst: 14, cess: 0, isDefault: false },
        { id: "tax-28-cess12", name: "GST @ 28% + Cess 12%", rate: 28, igst: 28, cgst: 14, sgst: 14, cess: 12, isDefault: false },
      ]
  );

  // New tax rate form state
  const [newTaxName, setNewTaxName] = useState("");
  const [newTaxRate, setNewTaxRate] = useState("");
  const [newTaxCess, setNewTaxCess] = useState("");
  const [addingTax, setAddingTax] = useState(false);

  const handleToggle = (key, value) => {
    update(key, value);
    if (key === "reverseCharge") {
      update("reverseChargeApplicable", value);
    }
  };

  const handleAddTaxRate = (e) => {
    e.preventDefault();
    if (!newTaxName || newTaxRate === "") return;
    const rateNum = parseFloat(newTaxRate) || 0;
    const cessNum = parseFloat(newTaxCess) || 0;
    const newEntry = {
      id: `tax-custom-${Date.now()}`,
      name: newTaxName.trim(),
      rate: rateNum,
      igst: rateNum,
      cgst: rateNum / 2,
      sgst: rateNum / 2,
      cess: cessNum,
      isDefault: false,
    };
    const nextList = [...taxRates, newEntry];
    setTaxRates(nextList);
    update("taxRatesList", nextList);
    setNewTaxName("");
    setNewTaxRate("");
    setNewTaxCess("");
    setAddingTax(false);
  };

  const handleDeleteTaxRate = (id) => {
    const nextList = taxRates.filter((t) => t.id !== id);
    setTaxRates(nextList);
    update("taxRatesList", nextList);
  };

  const handleSetDefaultRate = (id, rateName) => {
    const nextList = taxRates.map((t) => ({
      ...t,
      isDefault: t.id === id,
    }));
    setTaxRates(nextList);
    update("taxRatesList", nextList);
    update("defaultTaxRate", rateName);
  };

  return (
    <div className="max-w-4xl bg-white p-6 rounded-lg font-sans">
      {/* Header */}
      <h2 className="text-base font-bold text-slate-900 tracking-tight">GST Settings</h2>
      <div className="border-b border-slate-200 mt-2 mb-6" />

      {/* Vertical list of settings matching user screenshot */}
      <div className="space-y-5 text-sm text-slate-800">
        {/* 1. Enable GST */}
        <div className="flex items-center">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enableGst ?? true}
              onChange={(e) => handleToggle("enableGst", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800">Enable GST</span>
          </label>
          <InfoTooltip text="Enable GST calculations, HSN reporting, and statutory tax invoices" />
        </div>

        {/* 2. Enable HSN/SAC Code */}
        <div className="flex items-center">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enableHsnSacCode ?? true}
              onChange={(e) => handleToggle("enableHsnSacCode", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800">Enable HSN/SAC Code</span>
          </label>
          <InfoTooltip text="Show HSN/SAC code columns in invoice items table and item masters" />
        </div>

        {/* 3. Additional Cess On Item */}
        <div className="flex items-center">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.additionalCessOnItem ?? true}
              onChange={(e) => handleToggle("additionalCessOnItem", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800">Additional Cess On Item</span>
          </label>
          <InfoTooltip text="Allow specifying GST Compensation Cess percentage or amount on item rows" />
        </div>

        {/* 4. Reverse Charge */}
        <div className="flex items-center">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.reverseCharge ?? true}
              onChange={(e) => handleToggle("reverseCharge", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800">Reverse Charge</span>
          </label>
          <InfoTooltip text="Enable Reverse Charge Mechanism (RCM) where recipient is liable to pay tax to government" />
        </div>

        {/* 5. Enable Place of Supply */}
        <div className="flex items-center">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enablePlaceOfSupply ?? true}
              onChange={(e) => handleToggle("enablePlaceOfSupply", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800">Enable Place of Supply</span>
          </label>
          <InfoTooltip text="Show Place of Supply (State) on transactions to determine CGST+SGST vs IGST" />
        </div>

        {/* 6. Composite Scheme + inline dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.compositeScheme ?? true}
              onChange={(e) => handleToggle("compositeScheme", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800">Composite Scheme</span>
          </label>
          <InfoTooltip text="For Composition Scheme dealers (ineligible to collect tax on supplies; Bill of Supply issued)" />

          {/* Inline dropdown right next to info tooltip */}
          {settings.compositeScheme && (
            <div className="inline-flex items-center ml-1">
              <select
                value={settings.compositeSchemeType || "Manufacturer 1.0%"}
                onChange={(e) => update("compositeSchemeType", e.target.value)}
                className="h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 outline-none hover:border-slate-400 focus:border-blue-500 shadow-2xs"
              >
                {COMPOSITE_SCHEME_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 7. Enable TCS */}
        <div className="flex items-center">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enableTcs ?? false}
              onChange={(e) => handleToggle("enableTcs", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800">Enable TCS</span>
          </label>
          <InfoTooltip text="Tax Collected at Source (Section 206C) on high value sales of goods" />
        </div>

        {/* 8. Enable TDS with YouTube video icon */}
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enableTds ?? false}
              onChange={(e) => handleToggle("enableTds", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800">Enable TDS</span>
          </label>
          <InfoTooltip text="Tax Deducted at Source (Section 194Q) deductible by customer on purchase invoices" />

          {/* Red YouTube Video Icon */}
          <button
            type="button"
            onClick={() => setShowVideoModal(true)}
            title="Watch TDS guide video"
            className="inline-flex items-center justify-center text-red-600 hover:text-red-700 ml-1 cursor-pointer transition transform hover:scale-110"
          >
            <span className="inline-flex items-center justify-center h-4 w-6 rounded bg-red-600 text-white shadow-2xs text-[9px] font-bold">
              ▶
            </span>
          </button>
        </div>

        {/* 9. Tax List > Button */}
        <div className="pt-3">
          <button
            type="button"
            onClick={() => setShowTaxListModal(true)}
            className="inline-flex items-center justify-center rounded-lg bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-600 border border-sky-100 hover:bg-sky-100 hover:border-sky-200 transition cursor-pointer shadow-2xs"
          >
            Tax List &gt;
          </button>
        </div>
      </div>

      {/* ─────────────────── TAX LIST MODAL ─────────────────── */}
      {showTaxListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">GST Tax Rates List</h3>
                <p className="text-xs text-slate-500">Configure standard tax slabs and custom GST rates</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTaxListModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold">
                    <th className="p-2.5">Tax Name</th>
                    <th className="p-2.5 text-center">Rate</th>
                    <th className="p-2.5 text-center">CGST</th>
                    <th className="p-2.5 text-center">SGST</th>
                    <th className="p-2.5 text-center">IGST</th>
                    <th className="p-2.5 text-center">Cess</th>
                    <th className="p-2.5 text-center">Default</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {taxRates.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-2.5 font-medium text-slate-900">{t.name}</td>
                      <td className="p-2.5 text-center font-bold text-blue-600">{t.rate}%</td>
                      <td className="p-2.5 text-center text-slate-600">{t.cgst}%</td>
                      <td className="p-2.5 text-center text-slate-600">{t.sgst}%</td>
                      <td className="p-2.5 text-center text-slate-600">{t.igst}%</td>
                      <td className="p-2.5 text-center text-slate-600">{t.cess ? `${t.cess}%` : "-"}</td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleSetDefaultRate(t.id, t.name)}
                          className={`text-[11px] font-bold px-2 py-0.5 rounded cursor-pointer ${
                            t.isDefault
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {t.isDefault ? "Default" : "Set Default"}
                        </button>
                      </td>
                      <td className="p-2.5 text-right">
                        {t.id.startsWith("tax-custom-") ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteTaxRate(t.id)}
                            className="text-rose-500 hover:text-rose-700 cursor-pointer"
                            title="Delete custom tax rate"
                          >
                            <FiTrash2 className="h-4 w-4 inline" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">System</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add Custom Tax Form */}
              {addingTax ? (
                <form onSubmit={handleAddTaxRate} className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">Add New Tax Rate</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tax Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. GST @ 10%"
                        value={newTaxName}
                        onChange={(e) => setNewTaxName(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs rounded border border-slate-300 bg-white outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">GST Rate (%) *</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="10"
                        value={newTaxRate}
                        onChange={(e) => setNewTaxRate(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs rounded border border-slate-300 bg-white outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cess (%) (Optional)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        value={newTaxCess}
                        onChange={(e) => setNewTaxCess(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs rounded border border-slate-300 bg-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setAddingTax(false)}
                      className="px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer shadow-2xs"
                    >
                      Save Tax Rate
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setAddingTax(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    <FiPlus className="h-4 w-4" /> Add Custom Tax Rate
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowTaxListModal(false)}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── VIDEO MODAL ─────────────────── */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-4 w-6 rounded bg-red-600 text-white text-[9px] font-bold">
                  ▶
                </span>
                <h3 className="text-base font-bold text-slate-900">How TDS works under GST / Income Tax</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-slate-600 leading-relaxed">
              <p className="font-semibold text-slate-800">
                Understanding Section 194Q &amp; GST TDS:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>TDS (Tax Deducted at Source):</strong> When enabled, buyers deduct TDS (e.g. 0.1% or 1%) when purchasing goods exceeding threshold limits.
                </li>
                <li>
                  The deductible TDS amount is subtracted from the total receivable balance from the customer.
                </li>
                <li>
                  The buyer deposits this TDS to the government on your behalf, reflected in Form 26AS / AIS.
                </li>
              </ul>
              <div className="rounded-lg bg-blue-50 p-3 border border-blue-100 text-[11px] text-blue-800">
                You can configure default TDS percentage or override on individual transaction invoices.
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
