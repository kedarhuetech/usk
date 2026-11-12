import React, { useState } from "react";
import { FiHelpCircle, FiPlus, FiTrash2, FiX, FiUploadCloud, FiFileText, FiCheckCircle, FiAlertCircle, FiLoader } from "react-icons/fi";
import HsnAutocomplete from "../../components/Common/HsnAutocomplete.jsx";
import { uploadHsnMasterFile, lookupHsnCode } from "../../services/hsnService.js";

function InfoTooltip({ text }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-flex items-center ml-1.5"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <button
        type="button"
        aria-label="Info"
        className="inline-flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-help focus:outline-none"
      >
        <FiHelpCircle className="h-4 w-4" />
      </button>

      {visible && (
        <div
          role="tooltip"
          className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 z-50 w-max max-w-xs rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-medium leading-snug text-white shadow-xl pointer-events-none transition-all duration-150 animate-in fade-in"
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
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
  const [showHsnModal, setShowHsnModal] = useState(false);
  const [uploadingHsn, setUploadingHsn] = useState(false);
  const [hsnUploadResult, setHsnUploadResult] = useState(null);
  const [testHsnCode, setTestHsnCode] = useState("");
  const [testHsnDetails, setTestHsnDetails] = useState(null);
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

  const handleHsnFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHsn(true);
    setHsnUploadResult(null);
    try {
      const res = await uploadHsnMasterFile(file);
      setHsnUploadResult({ success: true, message: res.message, count: res.count });
    } catch (err) {
      setHsnUploadResult({ success: false, message: err.message });
    } finally {
      setUploadingHsn(false);
      e.target.value = "";
    }
  };

  const handleTestHsnSelect = async (item) => {
    setTestHsnCode(item.code);
    try {
      const details = await lookupHsnCode(item.code);
      setTestHsnDetails(details);
    } catch {
      setTestHsnDetails({ valid: true, data: item });
    }
  };

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
          <InfoTooltip text="Enables GST tax calculations and tax invoice generation." />
        </div>

        {/* 2. Enable HSN/SAC Code */}
        <div className="flex items-center justify-between">
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
            <InfoTooltip text="Shows HSN/SAC code column on invoices and items." />
          </div>
          <button
            type="button"
            onClick={() => setShowHsnModal(true)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline flex items-center gap-1 cursor-pointer"
          >
            Manage HSN Master / Upload &gt;
          </button>
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
          <InfoTooltip text="Allows adding GST compensation cess to items." />
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
          <InfoTooltip text="Enables Reverse Charge (RCM) where recipient pays tax." />
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
          <InfoTooltip text="Shows state of supply to calculate CGST/SGST vs IGST." />
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
          <InfoTooltip text="For composition dealers; generates Bill of Supply with 0% tax." />

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
          <InfoTooltip text="Tax Collected at Source (Sec 206C) on sale of goods." />
        </div>

        {/* 8. Enable TDS */}
        <div className="flex items-center">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enableTds ?? false}
              onChange={(e) => handleToggle("enableTds", e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800">Enable TDS</span>
          </label>
          <InfoTooltip text="Tax Deducted at Source (Sec 194Q) deductible by customer." />
        </div>

        {/* 9. Action Buttons: Tax List & HSN Master */}
        <div className="pt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowTaxListModal(true)}
            className="inline-flex items-center justify-center rounded-lg bg-[#FF5A1F]/10 px-4 py-2 text-xs font-semibold text-[#FF5A1F] border border-[#FF5A1F]/30 hover:bg-[#FF5A1F] hover:text-white hover:border-[#FF5A1F] transition cursor-pointer shadow-xs"
          >
            Tax List &gt;
          </button>
          <button
            type="button"
            onClick={() => setShowHsnModal(true)}
            className="inline-flex items-center justify-center rounded-lg bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-600 hover:text-white transition cursor-pointer shadow-xs"
          >
            HSN/SAC Master &gt;
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

      {/* ─────────────────── HSN / SAC MASTER & UPLOAD MODAL ─────────────────── */}
      {showHsnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">HSN & SAC Master Management</h3>
                <p className="text-xs text-slate-500">
                  Self-hosted official GST tariff lookup, bulk import, and instant code inspector
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowHsnModal(false);
                  setHsnUploadResult(null);
                  setTestHsnDetails(null);
                  setTestHsnCode("");
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-6 text-xs text-slate-700">
              {/* Section 1: Bulk Excel / CSV Upload */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FiUploadCloud className="h-4 w-4 text-blue-600" />
                  <h4 className="font-bold text-slate-900 text-sm">Bulk Import Master File</h4>
                </div>
                <p className="text-slate-500 mb-3">
                  Upload official GST Portal Excel or CSV master list (.xlsx, .xls, .csv). Supports auto-detecting headers like HSN/SAC, Description, and GST Rate with fast batch upsert.
                </p>

                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-xs hover:bg-blue-700 cursor-pointer transition">
                    {uploadingHsn ? (
                      <>
                        <FiLoader className="h-4 w-4 animate-spin" />
                        <span>Uploading & Processing...</span>
                      </>
                    ) : (
                      <>
                        <FiFileText className="h-4 w-4" />
                        <span>Choose Excel / CSV File</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      disabled={uploadingHsn}
                      onChange={handleHsnFileUpload}
                      className="sr-only"
                    />
                  </label>
                  <span className="text-[11px] text-slate-400">Max file size: 50 MB</span>
                </div>

                {hsnUploadResult && (
                  <div
                    className={`mt-3 p-3 rounded-lg flex items-start gap-2.5 ${
                      hsnUploadResult.success
                        ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                        : "bg-red-50 border border-red-200 text-red-800"
                    }`}
                  >
                    {hsnUploadResult.success ? (
                      <FiCheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <FiAlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-semibold">{hsnUploadResult.message}</p>
                      {hsnUploadResult.count && (
                        <p className="text-[11px] opacity-90 mt-0.5">
                          {hsnUploadResult.count} HSN/SAC codes are now searchable across your entire workspace.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Live Search & Inspector Test */}
              <div className="rounded-xl border border-slate-200 p-4 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <FiCheckCircle className="h-4 w-4 text-emerald-600" />
                  <h4 className="font-bold text-slate-900 text-sm">Test Live HSN & SAC Autocomplete</h4>
                </div>
                <p className="text-slate-500 mb-3">
                  Search Goods (HSN e.g. 8471, 6109, 1006) or Services (SAC e.g. 998314, 9965, 998433), or type any keyword (e.g. transport, software, rice):
                </p>

                <HsnAutocomplete
                  value={testHsnCode}
                  placeholder="Search Goods (HSN) or Services (SAC) by code or name..."
                  onChange={(code) => setTestHsnCode(code)}
                  onSelect={handleTestHsnSelect}
                />

                {testHsnDetails && testHsnDetails.data && (
                  <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs">
                          {testHsnDetails.data.code}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                            testHsnDetails.data.type === "SAC" || testHsnDetails.data.code.startsWith("99")
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {testHsnDetails.data.type || "HSN"}
                        </span>
                        {testHsnDetails.data.gst_rate !== null && (
                          <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            {testHsnDetails.data.gst_rate}% GST
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                        <FiCheck className="h-3.5 w-3.5" /> Verified in DB
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {testHsnDetails.data.description}
                    </p>

                    {testHsnDetails.chapterContext && (
                      <div className="border-t border-slate-200 pt-2 text-[11px] text-slate-500 space-y-1">
                        {testHsnDetails.chapterContext.chapterCode && (
                          <p>
                            <strong className="text-slate-700">Chapter {testHsnDetails.chapterContext.chapterCode}:</strong>{" "}
                            {testHsnDetails.chapterContext.chapterDescription || "Official GST Chapter"}
                          </p>
                        )}
                        {testHsnDetails.chapterContext.headingCode && (
                          <p>
                            <strong className="text-slate-700">Heading {testHsnDetails.chapterContext.headingCode}:</strong>{" "}
                            {testHsnDetails.chapterContext.headingDescription || "Tariff Heading"}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setShowHsnModal(false);
                  setHsnUploadResult(null);
                  setTestHsnDetails(null);
                }}
                className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer shadow-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
