// Implements the Party Settings Tab interface matching the Vyapar desktop settings.
import { useState } from "react";
import { FiCheck, FiChevronRight, FiInfo, FiX } from "react-icons/fi";

// Default party custom fields definition
const DEFAULT_CUSTOM_FIELDS = [
  { id: "field-1", enabled: true, name: "mrp", showInPrint: true, type: "text" },
  { id: "field-2", enabled: false, name: "", showInPrint: false, type: "text" },
  { id: "field-3", enabled: false, name: "", showInPrint: false, type: "text" },
  { id: "field-4", enabled: false, name: "", showInPrint: false, type: "date" },
];

export default function PartyTab({ settings, update }) {
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [tempReminderMessage, setTempReminderMessage] = useState(
    settings.paymentReminderAdditionalMessage || ""
  );

  const customFields = settings.partyCustomFields?.length === 4
    ? settings.partyCustomFields
    : DEFAULT_CUSTOM_FIELDS;

  // Handles updating a specific custom field
  const handleUpdateCustomField = (index, key, value) => {
    const updated = customFields.map((f, i) => (i === index ? { ...f, [key]: value } : f));
    update("partyCustomFields", updated);
  };

  const handleOpenReminderModal = () => {
    setTempReminderMessage(settings.paymentReminderAdditionalMessage || "");
    setIsReminderModalOpen(true);
  };

  const handleSaveReminderMessage = () => {
    update("paymentReminderAdditionalMessage", tempReminderMessage);
    setIsReminderModalOpen(false);
  };

  const handleResetDefaultReminder = () => {
    setTempReminderMessage("");
  };

  return (
    <div className="w-full rounded-2xl bg-white p-6 shadow-xs border border-slate-200/80">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* ============================================================ */}
        {/* COLUMN 1: Party Settings */}
        {/* ============================================================ */}
        <div className="space-y-5 border-b pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6 border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Party Settings</h2>

          <div className="space-y-4">
            {/* 1. Party Grouping */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.enablePartyGrouping ?? true}
                  onChange={(e) => update("enablePartyGrouping", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Party Grouping</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Categorize parties into groups like Retailers, Wholesalers, Distributors, etc."
              >
                i
              </span>
            </label>

            {/* 2. Shipping Address */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.enableShippingAddress ?? true}
                  onChange={(e) => update("enableShippingAddress", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Shipping Address</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Add a separate delivery/shipping address for parties."
              >
                i
              </span>
            </label>

            {/* 3. Print Shipping Address */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.printShippingAddress ?? true}
                  onChange={(e) => update("printShippingAddress", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Print Shipping Address</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Print shipping address on sales and purchase invoices alongside billing address."
              >
                i
              </span>
            </label>

            {/* 4. Manage Party Status */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.managePartyStatus ?? true}
                  onChange={(e) => update("managePartyStatus", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Manage Party Status</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Enable Active/Inactive status for parties to prevent billing to inactive accounts."
              >
                i
              </span>
            </label>

            {/* 5. Enable Payment Reminder */}
            <div className="pt-1">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={settings.enablePaymentReminder ?? true}
                    onChange={(e) => update("enablePaymentReminder", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Enable Payment Reminder</span>
                </div>
                <span
                  className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                  title="Get notified and send payment reminders for due/overdue invoices."
                >
                  i
                </span>
              </label>

              {(settings.enablePaymentReminder ?? true) && (
                <div className="mt-4 pl-6 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      Remind me for payment due in
                      <span
                        className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
                        title="Days before or on invoice due date to alert"
                      >
                        i
                      </span>
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={settings.paymentReminderDays ?? 1}
                      onChange={(e) => update("paymentReminderDays", Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-8 w-14 rounded border border-slate-300 bg-white px-2 text-center text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                    />
                    <span className="text-slate-400">(days)</span>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleOpenReminderModal}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Reminder Message &gt;
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* COLUMN 2: Additional Fields */}
        {/* ============================================================ */}
        <div className="space-y-5 border-b pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6 border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Additional fields</h2>
            <span
              className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
              title="Add custom fields to parties (e.g. MRP, Region, Registration No, etc.)"
            >
              i
            </span>
          </div>

          <div className="space-y-4">
            {customFields.map((field, index) => {
              const labelText = `Additional Field ${index + 1}`;
              return (
                <div key={field.id} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={field.enabled}
                      onChange={(e) => handleUpdateCustomField(index, "enabled", e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                    />

                    {/* Outlined field name box with floating border label */}
                    <div className="relative flex-1">
                      <label className="absolute -top-2 left-2.5 bg-white px-1 text-[10px] font-semibold text-slate-500">
                        {labelText}
                      </label>
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => handleUpdateCustomField(index, "name", e.target.value)}
                        placeholder={`e.g. Field ${index + 1}`}
                        disabled={!field.enabled}
                        className={`h-10 w-full rounded-md border px-3 text-xs font-semibold text-slate-800 outline-none transition ${
                          field.enabled
                            ? "border-slate-300 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                            : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                        }`}
                      />
                    </div>

                    {/* Field 4 Type dropdown */}
                    {index === 3 && (
                      <select
                        value={field.type || "date"}
                        onChange={(e) => handleUpdateCustomField(index, "type", e.target.value)}
                        disabled={!field.enabled}
                        className="h-10 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500"
                      >
                        <option value="date">dd/mm/yy</option>
                        <option value="text">Text</option>
                      </select>
                    )}
                  </div>

                  {/* Show In Print Toggle Switch */}
                  <div className="flex items-center justify-end gap-2.5 pr-1">
                    <span className="text-xs text-slate-600">Show In Print</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={field.showInPrint}
                      disabled={!field.enabled}
                      onClick={() => handleUpdateCustomField(index, "showInPrint", !field.showInPrint)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        !field.enabled
                          ? "bg-slate-200 cursor-not-allowed"
                          : field.showInPrint
                          ? "bg-blue-600"
                          : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                          field.showInPrint ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============================================================ */}
        {/* COLUMN 3: Enable Loyalty Point */}
        {/* ============================================================ */}
        <div className="space-y-5">
          <h2 className="text-base font-bold text-slate-800">Enable Loyalty Point</h2>

          <div className="space-y-4">
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.enableLoyaltyPoints ?? true}
                  onChange={(e) => update("enableLoyaltyPoints", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Enable Loyalty Point</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Award loyalty points on purchases and allow customer redemption."
              >
                i
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL: Add/Edit Reminder Message (Screenshot 2) */}
      {/* ============================================================ */}
      {isReminderModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs transition"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsReminderModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl transition animate-in fade-in zoom-in-95 duration-150"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-slate-800">Add/Edit Reminder Message</h3>
              <button
                type="button"
                onClick={() => setIsReminderModalOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-3.5">
              <div className="space-y-1 text-sm text-slate-800 font-medium">
                <p>Dear, [Party Name]</p>
                <p>Your payment of [Amount] is pending with [Business Name]</p>
              </div>

              {/* Textarea for additional message */}
              <textarea
                rows={4}
                value={tempReminderMessage}
                onChange={(e) => setTempReminderMessage(e.target.value)}
                placeholder="Type additional message"
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                autoFocus
              />

              <p className="text-xs text-slate-500">
                If you have already made the payment, kindly ignore this message.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setIsReminderModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 transition"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleResetDefaultReminder}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-98 transition"
              >
                RESET DEFAULT
              </button>
              <button
                type="button"
                onClick={handleSaveReminderMessage}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-98 transition"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
