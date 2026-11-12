// Implements the Multi-Currency settings interface matching reference screenshot.
// Displays the live exchange rate toggle, currency table, empty state, and currency management modals.
import { useState } from "react";
import {
  FiCheck,
  FiChevronDown,
  FiEdit2,
  FiInfo,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { STANDARD_CURRENCIES } from "../../constants/multiCurrencyData.js";
import { ConfirmModal } from "../../components/Common/Toast.jsx";

function getTodayFormatted() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function MultiCurrencyTab({ settings, update }) {
  const [modalMode, setModalMode] = useState(null); // 'base' | 'add' | 'edit' | null
  const [editingCurrency, setEditingCurrency] = useState(null);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [rateFeedback, setRateFeedback] = useState("");
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    tone: "primary",
    onConfirm: null,
  });

  // Base currency resolution
  const baseCurrency =
    typeof settings.baseCurrency === "object" && settings.baseCurrency?.code
      ? settings.baseCurrency
      : settings.multiCurrencyBase || null;

  const currencyList = settings.multiCurrencyList || [];
  const hasBaseCurrency = Boolean(baseCurrency && baseCurrency.code);
  const getLiveRate = Boolean(settings.multiCurrencyGetLiveRate);

  // Form states for modals
  const [formCode, setFormCode] = useState("INR");
  const [formName, setFormName] = useState("Indian Rupee");
  const [formSymbol, setFormSymbol] = useState("₹");
  const [formRate, setFormRate] = useState("1");
  const [formDate, setFormDate] = useState(getTodayFormatted());

  const handleToggleLiveRate = (nextVal) => {
    update("multiCurrencyGetLiveRate", nextVal);
  };

  const openAddBaseModal = () => {
    setModalMode("base");
    setFormCode("INR");
    setFormName("Indian Rupee");
    setFormSymbol("₹");
    setFormRate("1");
    setFormDate(getTodayFormatted());
    setRateFeedback("");
  };

  const openAddCurrencyModal = () => {
    if (!hasBaseCurrency) return;
    setModalMode("add");
    // Pick first currency not already in list or default to USD
    const existingCodes = new Set([
      baseCurrency.code,
      ...currencyList.map((c) => c.code),
    ]);
    const candidate =
      STANDARD_CURRENCIES.find((c) => !existingCodes.has(c.code)) ||
      STANDARD_CURRENCIES[1];

    setFormCode(candidate.code);
    setFormName(candidate.name);
    setFormSymbol(candidate.symbol);
    setFormRate(String(candidate.defaultRateToInr || 1));
    setFormDate(getTodayFormatted());
    setRateFeedback("");
  };

  const openEditCurrencyModal = (curr) => {
    setEditingCurrency(curr);
    setModalMode(curr.isBase ? "base" : "edit");
    setFormCode(curr.code);
    setFormName(curr.name);
    setFormSymbol(curr.symbol);
    setFormRate(String(curr.exchangeRate || 1));
    setFormDate(curr.setOnDate || getTodayFormatted());
    setRateFeedback("");
  };

  const handleCurrencySelect = (code) => {
    const found = STANDARD_CURRENCIES.find((c) => c.code === code);
    if (found) {
      setFormCode(found.code);
      setFormName(found.name);
      setFormSymbol(found.symbol);
      if (modalMode !== "base") {
        setFormRate(String(found.defaultRateToInr || 1));
      }
    } else {
      setFormCode(code);
    }
  };

  const fetchLiveExchangeRate = async (targetCode) => {
    if (!targetCode) return;
    setFetchingRate(true);
    setRateFeedback("");
    try {
      const baseCode = baseCurrency?.code || "INR";
      const res = await fetch(`https://open.er-api.com/v6/latest/${targetCode}`);
      if (!res.ok) throw new Error("Could not reach exchange rate service");
      const data = await res.json();
      if (data && data.rates && data.rates[baseCode]) {
        const liveRate = data.rates[baseCode];
        setFormRate(String(Number(liveRate.toFixed(4))));
        setRateFeedback(`Live rate updated: 1 ${targetCode} = ${Number(liveRate.toFixed(4))} ${baseCurrency?.symbol || baseCode}`);
      } else {
        throw new Error("Currency rate unavailable");
      }
    } catch {
      // Fallback
      const found = STANDARD_CURRENCIES.find((c) => c.code === targetCode);
      if (found) {
        setFormRate(String(found.defaultRateToInr || 1));
        setRateFeedback(`Market benchmark applied: 1 ${targetCode} = ${found.defaultRateToInr} ${baseCurrency?.symbol || ""}`);
      }
    } finally {
      setFetchingRate(false);
    }
  };

  const handleSaveModal = () => {
    if (modalMode === "base") {
      const newBase = {
        id: "base-" + formCode.toLowerCase(),
        code: formCode,
        name: formName,
        symbol: formSymbol,
        exchangeRate: 1,
        setOnDate: formDate,
        isBase: true,
      };

      // Set base currency and enable multi currency
      update("baseCurrency", newBase);
      update("multiCurrencyBase", newBase);
      update("multiCurrencyEnabled", true);
      update("currency", newBase.code);
      update("currencySymbol", newBase.symbol);

      // Ensure base currency is first in list or updated
      const remaining = currencyList.filter((c) => !c.isBase && c.code !== newBase.code);
      update("multiCurrencyList", [newBase, ...remaining]);
      setModalMode(null);
    } else if (modalMode === "add") {
      const newCurr = {
        id: "curr-" + Date.now(),
        code: formCode,
        name: formName,
        symbol: formSymbol,
        exchangeRate: parseFloat(formRate) || 1,
        setOnDate: formDate,
        isBase: false,
      };

      // Exclude if already exists and append
      const nextList = [
        ...currencyList.filter((c) => c.code !== newCurr.code),
        newCurr,
      ];
      update("multiCurrencyList", nextList);
      setModalMode(null);
    } else if (modalMode === "edit" && editingCurrency) {
      const updated = {
        ...editingCurrency,
        code: formCode,
        name: formName,
        symbol: formSymbol,
        exchangeRate: parseFloat(formRate) || 1,
        setOnDate: formDate,
      };
      const nextList = currencyList.map((c) =>
        c.id === editingCurrency.id ? updated : c
      );
      update("multiCurrencyList", nextList);
      setModalMode(null);
      setEditingCurrency(null);
    }
  };

  const handleDeleteCurrency = (id) => {
    const target = currencyList.find((c) => c.id === id);
    if (target?.isBase) {
      setConfirmModal({
        isOpen: true,
        title: "Reset Multi-Currency",
        message: "Remove Base Currency and reset Multi-Currency configuration to defaults?",
        confirmText: "Remove & Reset",
        tone: "danger",
        onConfirm: () => {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          update("baseCurrency", null);
          update("multiCurrencyBase", null);
          update("multiCurrencyEnabled", false);
          update("multiCurrencyList", []);
          update("currency", "INR");
          update("currencySymbol", "₹");
        },
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Remove Currency",
      message: `Remove currency ${target?.code || target?.name || id} from the active currency list?`,
      confirmText: "Remove",
      tone: "danger",
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        const nextList = currencyList.filter((c) => c.id !== id);
        update("multiCurrencyList", nextList);
      },
    });
  };

  return (
    <div className="w-full rounded-2xl bg-white p-6 shadow-xs border border-slate-200/80">
      {/* 1. Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-800">Multi-Currency</h1>
      </div>

      {/* 2. Banner matching screenshot with USV branding */}
      <div className="flex items-center gap-2 rounded-lg bg-[#fef7ea] px-4 py-3 text-xs text-slate-800 border border-amber-200/60 shadow-2xs">
        <span className="text-amber-500 text-sm">✨</span>
        <p>
          USV now supports{" "}
          <strong className="font-bold text-slate-900">Multi-Currency</strong>, so
          you can manage all your bills &amp; transactions in any{" "}
          <strong className="font-bold text-slate-900">currency</strong> you need!
        </p>
      </div>

      {/* 3. Controls Bar */}
      <div className="flex items-center justify-end gap-6 pt-4 pb-3">
        {/* Get Live Exchange Rate switch */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={getLiveRate}
            onClick={() => handleToggleLiveRate(!getLiveRate)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              getLiveRate ? "bg-blue-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                getLiveRate ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-xs font-semibold text-slate-700">
            Get Live Exchange Rate
          </span>
          <span
            className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
            title="Automatically fetches real-time market exchange rates for transactions"
          >
            i
          </span>
        </div>

        {/* Add New Currency Button */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!hasBaseCurrency}
            onClick={openAddCurrencyModal}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold shadow-xs transition-colors ${
              hasBaseCurrency
                ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <span className="text-sm font-bold">+</span>
            <span>Add New Currency</span>
          </button>
          <span
            className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
            title={
              hasBaseCurrency
                ? "Add an additional currency for invoicing"
                : "Add your Base currency first to start adding more currencies"
            }
          >
            i
          </span>
        </div>
      </div>

      {/* 4. Table Header */}
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-200/80 text-slate-500 font-semibold">
              <th className="py-3 pl-4 pr-3">Name</th>
              <th className="py-3 px-3">Symbol</th>
              <th className="py-3 px-3">Exchange Rate</th>
              <th className="py-3 px-3">Set on Date</th>
              <th className="py-3 pl-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>

          {/* 5. Table Body or Empty State */}
          <tbody>
            {hasBaseCurrency && currencyList.length > 0 ? (
              currencyList.map((curr) => {
                const isBase = curr.isBase || curr.code === baseCurrency?.code;
                return (
                  <tr
                    key={curr.id || curr.code}
                    className="border-b border-slate-100 transition-colors hover:bg-slate-50/60"
                  >
                    <td className="py-3.5 pl-4 pr-3 font-semibold text-slate-800">
                      <div className="flex items-center gap-2">
                        <span>{curr.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({curr.code})
                        </span>
                        {isBase && (
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            Base
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-700 font-semibold text-sm">
                      {curr.symbol}
                    </td>
                    <td className="py-3.5 px-3 text-slate-700">
                      {isBase ? (
                        <span className="text-slate-400 italic">1.00 (Base)</span>
                      ) : (
                        <span className="font-semibold text-slate-800 font-mono">
                          1 {curr.code} = {curr.exchangeRate}{" "}
                          {baseCurrency?.symbol || baseCurrency?.code}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-slate-500">
                      {curr.setOnDate || getTodayFormatted()}
                    </td>
                    <td className="py-3.5 pl-3 pr-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditCurrencyModal(curr)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition"
                          title="Edit Currency"
                        >
                          <FiEdit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCurrency(curr.id)}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title={isBase ? "Reset Base Currency" : "Delete Currency"}
                        >
                          <FiTrash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="py-16 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center justify-center space-y-3">
                    {/* Yellow Circular Illustration with Paper Plane matching screenshot */}
                    <div className="relative mb-2 flex h-24 w-24 items-center justify-center rounded-full bg-[#fcd34d] shadow-sm">
                      {/* Decorative Sparkles */}
                      <span className="absolute -top-1 right-2 text-amber-200 text-xs select-none">
                        ✦
                      </span>
                      <span className="absolute top-4 -left-1 text-amber-200 text-xs select-none">
                        ✦
                      </span>
                      <span className="absolute -bottom-1 -right-1 text-amber-200 text-xs select-none">
                        ✦
                      </span>

                      {/* Paper Airplane SVG */}
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-12 w-12 text-white -rotate-12 translate-x-0.5 drop-shadow-xs"
                      >
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </div>

                    <h3 className="text-base font-bold text-slate-800">
                      No Currencies to show
                    </h3>
                    <p className="text-xs text-slate-400">
                      Add your Base currency to start adding more currencies.
                    </p>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={openAddBaseModal}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#e11d48] px-6 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#be123c] cursor-pointer"
                      >
                        <span className="text-sm font-bold">+</span>
                        <span>Add Base Currency</span>
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ============================================================ */}
      {/* MODAL: Add/Edit Currency */}
      {/* ============================================================ */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                {modalMode === "base"
                  ? "Select Base Currency"
                  : modalMode === "add"
                  ? "Add New Currency"
                  : "Edit Currency"}
              </h2>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <div className="mt-4 space-y-4 text-xs">
              {/* Quick Preset Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Choose from Standard Currencies
                </label>
                <select
                  value={formCode}
                  onChange={(e) => handleCurrencySelect(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {STANDARD_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} - {c.name} ({c.symbol})
                    </option>
                  ))}
                  <option value="CUSTOM">Custom Currency...</option>
                </select>
              </div>

              {/* Currency Name & Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Currency Code
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. USD"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Symbol
                  </label>
                  <input
                    type="text"
                    value={formSymbol}
                    onChange={(e) => setFormSymbol(e.target.value)}
                    placeholder="e.g. $"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Currency Full Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. US Dollar"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              {/* Exchange Rate (only for secondary currencies) */}
              {modalMode !== "base" ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">
                      Exchange Rate (1 {formCode} = ? {baseCurrency?.symbol || baseCurrency?.code || "Base"})
                    </label>
                    {getLiveRate && (
                      <button
                        type="button"
                        onClick={() => fetchLiveExchangeRate(formCode)}
                        disabled={fetchingRate}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        <FiRefreshCw
                          className={`h-3 w-3 ${fetchingRate ? "animate-spin" : ""}`}
                        />
                        <span>{fetchingRate ? "Fetching..." : "Fetch Live Rate"}</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.0001"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                    placeholder="Exchange Rate"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-500"
                  />
                  {rateFeedback && (
                    <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                      {rateFeedback}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-blue-50 p-3 text-[11px] text-blue-800">
                  <p className="font-semibold">Base Currency Standard:</p>
                  <p className="mt-0.5 text-blue-700">
                    All book accounts, ledgers, and inventory valuations are maintained in your base currency. Its exchange rate is fixed at 1.00.
                  </p>
                </div>
              )}

              {/* Set on Date */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Set on Date
                </label>
                <input
                  type="text"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 cursor-pointer"
              >
                {modalMode === "base" ? "Save Base Currency" : "Save Currency"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        tone={confirmModal.tone}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
