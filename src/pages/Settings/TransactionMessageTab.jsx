// Implements the Transaction Message settings interface matching Vyapar reference screenshots.
// Uses Meta WhatsApp Cloud API without requiring personal WhatsApp phone QR login.
import { useState } from "react";
import {
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiInfo,
  FiPaperclip,
  FiRefreshCw,
  FiSend,
  FiStar,
  FiX,
} from "react-icons/fi";
import {
  TRANSACTION_TYPES_CONFIG,
  buildTransactionMessage,
  sendMetaWhatsAppMessage,
} from "../../services/transactionMessageService.js";

export default function TransactionMessageTab({ settings, update }) {
  const [selectedTxnType, setSelectedTxnType] = useState("sales");
  const [lastSyncedText, setLastSyncedText] = useState("now");
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);

  const txnConfig = TRANSACTION_TYPES_CONFIG[selectedTxnType] || TRANSACTION_TYPES_CONFIG.sales;

  // Header template for current transaction type
  const currentHeader =
    settings.txnMsgTemplates?.[selectedTxnType] ?? txnConfig.defaultHeader;

  // Handle header change for current transaction type
  const handleHeaderChange = (newHeader) => {
    const nextTemplates = {
      ...(settings.txnMsgTemplates || {}),
      [selectedTxnType]: newHeader,
    };
    update("txnMsgTemplates", nextTemplates);
  };

  const handleSyncClick = () => {
    setLastSyncedText("just now");
    setTimeout(() => setLastSyncedText("now"), 3000);
  };

  const handleSendTestMessage = async () => {
    if (!testPhone.trim()) {
      setTestStatus("Please enter a valid phone number.");
      return;
    }
    setTestSending(true);
    setTestStatus("");
    try {
      const sampleMsg = buildTransactionMessage({
        type: selectedTxnType,
        number: "INV-792",
        amount: txnConfig.sampleAmount,
        balance: txnConfig.sampleBalance,
        settings,
      });
      await sendMetaWhatsAppMessage({
        phone: testPhone,
        message: sampleMsg,
      });
      setTestStatus("Test message sent successfully via Meta WhatsApp!");
      setTimeout(() => {
        setTestModalOpen(false);
        setTestStatus("");
      }, 2500);
    } catch (err) {
      setTestStatus(err.message || "Could not send test message.");
    } finally {
      setTestSending(false);
    }
  };

  // Compile live preview message
  const previewSignature = settings.txnMsgSignature || "sai kirana";
  const includeBalance = settings.txnMsgIncludePartyBalance ?? false;
  const includeWebLink = settings.txnMsgIncludeWebInvoiceLink ?? true;
  const includePayLink = settings.txnMsgIncludePaymentLink ?? false;

  return (
    <div className="w-full rounded-2xl bg-white p-6 shadow-xs border border-slate-200/80">
      {/* Top Header */}
      <div className="mb-6 border-b border-slate-100 pb-4">
        <h1 className="text-xl font-bold text-slate-800">Transaction Message</h1>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* ============================================================ */}
        {/* LEFT COLUMN: Settings & Checkboxes */}
        {/* ============================================================ */}
        <div className="space-y-6 lg:border-r lg:pr-8 border-slate-100">
          {/* 1. Select Message Type (Meta WhatsApp Official) */}
          <div className="space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Select Message Type:
            </h2>

            <div className="flex flex-wrap items-center gap-3">
              {/* Meta WhatsApp Delivery Button - Selected */}
              <div className="relative flex items-center gap-3 rounded-lg border-2 border-blue-600 bg-blue-50/40 px-4 py-2.5 shadow-xs">
                <div className="flex items-center gap-2">
                  {/* Meta / WhatsApp Icon */}
                  <div className="grid h-7 w-7 place-items-center rounded bg-emerald-600 text-white font-bold text-xs">
                    W
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-900">Send via Meta WhatsApp</p>
                    <p className="text-[10px] text-emerald-700 font-semibold">
                      Official Cloud API • Zero QR Code Login Required
                    </p>
                  </div>
                </div>

                {/* Selected Check Badge */}
                <span className="absolute -top-2 -right-2 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white shadow-xs">
                  <FiCheck className="h-3 w-3 stroke-[3]" />
                </span>
              </div>
            </div>
          </div>

          {/* 2. Message Recipient Settings */}
          <div className="space-y-3 pt-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Message Recipient Settings:
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
              {/* Send Message to Party */}
              <label className="flex cursor-pointer items-center justify-between gap-2 hover:text-slate-900">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgSendToParty ?? true}
                    onChange={(e) => update("txnMsgSendToParty", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Send Message to Party</span>
                </div>
                <span
                  className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
                  title="Automatically sends the invoice message to the customer's phone"
                >
                  i
                </span>
              </label>

              {/* Send Transaction Update Message with Red Dot */}
              <label className="flex cursor-pointer items-center justify-between gap-2 hover:text-slate-900">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgSendUpdateMessage ?? false}
                    onChange={(e) => update("txnMsgSendUpdateMessage", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Send Transaction Update Message</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                </div>
                <span
                  className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
                  title="Send message whenever a transaction is updated or edited"
                >
                  i
                </span>
              </label>

              {/* Send Message Copy to Self */}
              <label className="flex cursor-pointer items-center justify-between gap-2 hover:text-slate-900">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgSendCopyToSelf ?? false}
                    onChange={(e) => update("txnMsgSendCopyToSelf", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Send Message Copy to Self</span>
                </div>
                <span
                  className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
                  title="Receive a copy of every customer transaction on your business WhatsApp"
                >
                  i
                </span>
              </label>

              {/* Auto Share Invoices on USV Network */}
              <label className="flex cursor-pointer items-center justify-between gap-2 hover:text-slate-900">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoShareVyaparNetwork ?? false}
                    onChange={(e) => update("txnMsgAutoShareVyaparNetwork", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Auto Share Invoices on USV Network</span>
                </div>
                <span
                  className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
                  title="Share invoices digitally across USV business network"
                >
                  i
                </span>
              </label>
            </div>

            {/* Credits & Sync Status Row */}
            <div className="flex items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => setCreditsModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200 hover:bg-amber-100 transition cursor-pointer shadow-2xs"
              >
                <FiStar className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                <span>{settings.txnMsgCredits ?? 100} CREDITS</span>
                <FiChevronRight className="h-3.5 w-3.5 text-amber-600" />
              </button>

              <div className="flex items-center gap-1 text-xs text-slate-400">
                <span>Last synced: {lastSyncedText}</span>
                <button
                  type="button"
                  onClick={handleSyncClick}
                  title="Sync message status with Meta"
                  className="grid h-5 w-5 place-items-center rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                >
                  <FiRefreshCw className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          {/* 3. Message Content */}
          <div className="space-y-3 border-t border-slate-100 pt-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Message Content:
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
              {/* Party Current Balance */}
              <label className="flex cursor-pointer items-center justify-between gap-2 hover:text-slate-900">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgIncludePartyBalance ?? false}
                    onChange={(e) => update("txnMsgIncludePartyBalance", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Party Current Balance in Message</span>
                </div>
                <span
                  className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
                  title="Includes total outstanding balance of the customer in the message"
                >
                  i
                </span>
              </label>

              {/* Web invoice link */}
              <label className="flex cursor-pointer items-center justify-between gap-2 hover:text-slate-900">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgIncludeWebInvoiceLink ?? true}
                    onChange={(e) => update("txnMsgIncludeWebInvoiceLink", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Web invoice link in Message</span>
                </div>
                <span
                  className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
                  title="Includes a secure link to view and download PDF online"
                >
                  i
                </span>
              </label>

              {/* Send payment link */}
              <label className="flex cursor-pointer items-center justify-between gap-2 hover:text-slate-900">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgIncludePaymentLink ?? false}
                    onChange={(e) => update("txnMsgIncludePaymentLink", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Send payment link in Message</span>
                </div>
                <span
                  className="grid h-3.5 w-3.5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-400 cursor-help"
                  title="Includes direct UPI / payment gateway link for instant customer collection"
                >
                  i
                </span>
              </label>
            </div>
          </div>

          {/* 4. Send Automatic Message for: (12 Checkboxes in 3 Columns) */}
          <div className="space-y-3 border-t border-slate-100 pt-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Send Automatic Message for:
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs text-slate-700">
              {/* Column 1 */}
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoSales ?? true}
                    onChange={(e) => update("txnMsgAutoSales", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Sales</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoPurchaseReturn ?? true}
                    onChange={(e) => update("txnMsgAutoPurchaseReturn", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Purchase Return</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoSaleOrder ?? true}
                    onChange={(e) => update("txnMsgAutoSaleOrder", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Sale Order</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoProformaInvoice ?? false}
                    onChange={(e) => update("txnMsgAutoProformaInvoice", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Proforma Invoice</span>
                </label>
              </div>

              {/* Column 2 */}
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoPurchase ?? true}
                    onChange={(e) => update("txnMsgAutoPurchase", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Purchase</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoPaymentIn ?? true}
                    onChange={(e) => update("txnMsgAutoPaymentIn", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Payment In</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoPurchaseOrder ?? false}
                    onChange={(e) => update("txnMsgAutoPurchaseOrder", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Purchase Order</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoDeliveryChallan ?? false}
                    onChange={(e) => update("txnMsgAutoDeliveryChallan", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Delivery Challan</span>
                </label>
              </div>

              {/* Column 3 */}
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoSalesReturn ?? true}
                    onChange={(e) => update("txnMsgAutoSalesReturn", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Sales Return</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoPaymentOut ?? true}
                    onChange={(e) => update("txnMsgAutoPaymentOut", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Payment Out</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoEstimate ?? false}
                    onChange={(e) => update("txnMsgAutoEstimate", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Estimate</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={settings.txnMsgAutoCancelledInvoice ?? true}
                    onChange={(e) => update("txnMsgAutoCancelledInvoice", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Cancelled Invoice</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN: Edit Message & Live Preview */}
        {/* ============================================================ */}
        <div className="space-y-6">
          {/* Top Selector: Transaction Type */}
          <div className="flex items-center justify-end gap-2 text-xs font-semibold text-slate-700">
            <span>Transaction Type :</span>
            <div className="relative">
              <select
                value={selectedTxnType}
                onChange={(e) => setSelectedTxnType(e.target.value)}
                className="h-9 rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
              >
                {Object.entries(TRANSACTION_TYPES_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Edit Message Box */}
          <div className="space-y-2">
            <h2 className="text-center text-xs font-bold text-slate-700">Edit Message</h2>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
              {/* Editable Intro Header */}
              <div>
                <textarea
                  rows={2}
                  value={currentHeader}
                  onChange={(e) => handleHeaderChange(e.target.value)}
                  placeholder="Type opening message..."
                  className="w-full resize-none rounded-lg border border-slate-200 p-3 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                />
              </div>

              {/* Middle Transaction Data (Auto-Filled) */}
              <div className="rounded-lg bg-slate-50/70 p-3 text-xs text-slate-700 space-y-1 font-medium">
                <p className="font-semibold text-slate-900">{txnConfig.title}:</p>
                <p>Invoice Amount: {txnConfig.sampleAmount}</p>
                <p>Balance: {txnConfig.sampleBalance}</p>
                {includeBalance && <p>Party Current Balance: 1,250</p>}
                {includeWebLink && <p className="text-blue-600">Web Invoice: https://usk.app/i/792</p>}
                {includePayLink && <p className="text-emerald-600">Pay Now: https://pay.usk.app/i/792</p>}
              </div>

              {/* Editable Footer / Signature with Dashed Border */}
              <div className="relative">
                <input
                  type="text"
                  value={settings.txnMsgSignature ?? "sai kirana"}
                  onChange={(e) => update("txnMsgSignature", e.target.value)}
                  placeholder="Business signature (e.g. sai kirana)"
                  className="h-9 w-full rounded-md border-2 border-dashed border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                />
                <span className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-bold text-slate-400">
                  Signature
                </span>
              </div>
            </div>
          </div>

          {/* Message Preview Box */}
          <div className="space-y-2">
            <h2 className="text-center text-xs font-bold text-slate-500">Message Preview</h2>

            <div className="flex justify-center">
              <div className="w-full max-w-md rounded-2xl bg-[#e7fce3] p-4 text-xs text-slate-800 shadow-sm border border-emerald-100/80 space-y-3">
                {/* Image Attached Chip */}
                <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  <FiPaperclip className="h-3 w-3" />
                  <span>Transaction Image Attached</span>
                </div>

                {/* Message Body */}
                <div className="space-y-2 font-medium leading-relaxed">
                  <p className="whitespace-pre-line">{currentHeader}</p>
                  <div>
                    <p className="font-bold text-slate-900">{txnConfig.title}:</p>
                    <p>Invoice Amount: {txnConfig.sampleAmount}</p>
                    <p>Balance: {txnConfig.sampleBalance}</p>
                    {includeBalance && <p>Party Current Balance: 1,250</p>}
                    {includeWebLink && (
                      <p className="text-blue-600 font-semibold underline">
                        Web Invoice: https://usk.app/i/792
                      </p>
                    )}
                    {includePayLink && (
                      <p className="text-emerald-700 font-semibold underline">
                        Pay Now: https://pay.usk.app/i/792
                      </p>
                    )}
                  </div>
                  <p className="pt-1 font-bold text-slate-900">{previewSignature}</p>
                </div>

                <div className="flex items-center justify-end text-[10px] text-slate-400">
                  <span>12:45 PM ✓✓</span>
                </div>
              </div>
            </div>

            {/* Test Send Button */}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setTestModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-98 transition cursor-pointer"
              >
                <FiSend className="h-3.5 w-3.5" /> Test Send via Meta WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL: Test Send via Meta WhatsApp */}
      {/* ============================================================ */}
      {testModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTestModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl transition animate-in fade-in zoom-in-95 duration-150"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-bold text-slate-800">Test Send Meta WhatsApp</h3>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition cursor-pointer"
              >
                <FiX className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recipient WhatsApp Number:
                </label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="e.g. 9823012345"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Sends current preview template using Meta WhatsApp Cloud API.
                </p>
              </div>

              {testStatus && (
                <p
                  className={`text-xs font-semibold ${
                    testStatus.includes("success") ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {testStatus}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={testSending}
                onClick={handleSendTestMessage}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-98 transition cursor-pointer"
              >
                {testSending ? "Sending…" : "Send Test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: Credits Info */}
      {/* ============================================================ */}
      {creditsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreditsModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl p-5 space-y-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FiStar className="h-5 w-5 text-amber-500 fill-amber-400" />
                <h3 className="text-sm font-bold text-slate-800">Meta Messaging Credits</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreditsModalOpen(false)}
                className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition cursor-pointer"
              >
                <FiX className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Available Balance</span>
              <p className="mt-1 text-3xl font-extrabold text-amber-900">{settings.txnMsgCredits ?? 100} <span className="text-sm font-semibold text-amber-700">Credits</span></p>
              <p className="text-xs text-amber-700 mt-0.5">1 Credit = 1 Automated Meta WhatsApp Transaction Invoice</p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCreditsModalOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer"
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

