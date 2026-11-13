// Implements the Transaction Message settings interface matching Vyapar reference screenshots.
// Uses Meta WhatsApp Cloud API without requiring personal WhatsApp phone QR login.
import { useEffect, useState } from "react";
import {
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiInfo,
  FiLoader,
  FiPaperclip,
  FiRefreshCw,
  FiSend,
  FiStar,
  FiX,
  FiZap,
} from "react-icons/fi";
import {
  TRANSACTION_TYPES_CONFIG,
  buildTransactionMessage,
  sendMetaWhatsAppMessage,
} from "../../services/transactionMessageService.js";
import { toast as toastNotification } from "../../components/Common/Toast.jsx";

export default function TransactionMessageTab({ settings, update }) {
  const [selectedTxnType, setSelectedTxnType] = useState("sales");
  const [lastSyncedText, setLastSyncedText] = useState("now");
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);
  const [metaStatus, setMetaStatus] = useState({
    connected: false,
    loading: true,
    phoneNumber: "",
    templates: [],
    approvedCount: 0,
    pendingCount: 0,
  });
  const [requestingApproval, setRequestingApproval] = useState(false);

  const loadMetaConnection = () => {
    fetch("/api/whatsapp-business/connection")
      .then((r) => r.json())
      .then((data) => {
        const templates = data.assets?.templates || [];
        const approvedCount = templates.filter((t) => t.status === "APPROVED").length;
        const pendingCount = templates.filter((t) => t.status === "PENDING").length;
        setMetaStatus({
          connected: Boolean(data.connected || data.testModeConfigured),
          phoneNumber: data.selection?.phoneNumberId || data.assets?.phoneNumbers?.[0]?.display_phone_number || "",
          templates,
          approvedCount,
          pendingCount,
          loading: false,
        });
      })
      .catch(() => setMetaStatus({ connected: false, loading: false, phoneNumber: "", templates: [], approvedCount: 0, pendingCount: 0 }));
  };

  useEffect(() => {
    loadMetaConnection();
  }, []);

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
    loadMetaConnection();
    setTimeout(() => setLastSyncedText("now"), 3000);
  };

  const handleRequestTemplateApproval = async () => {
    setRequestingApproval(true);
    try {
      const response = await fetch("/api/whatsapp-business/templates/request-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const res = await response.json().catch(() => ({}));
      if (response.ok && res.success) {
        toastNotification.success(res.message || "All transaction templates submitted to Meta for approval!", {
          duration: 7000,
        });
        loadMetaConnection();
      } else {
        toastNotification.error(res.message || "Could not submit template approval request.");
      }
    } catch (err) {
      toastNotification.error(err.message || "Failed to submit template request.");
    } finally {
      setRequestingApproval(false);
    }
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
      const res = await sendMetaWhatsAppMessage({
        phone: testPhone,
        message: sampleMsg,
        type: selectedTxnType,
      });
      if (res.success && res.method === "meta_api") {
        setTestStatus(`✓ Test message delivered to ${testPhone} via Meta WhatsApp Cloud API!`);
        toastNotification.success(`✓ Message delivered via Meta WhatsApp Cloud API!`);
        setTimeout(() => {
          setTestModalOpen(false);
          setTestStatus("");
        }, 3000);
      } else {
        setTestStatus(`Meta API: ${res.error || "Not connected"}`);
        if (res.fallbackUrl) {
          toastNotification.info("Opening WhatsApp Web link...", {
            title: "Meta API Offline",
          });
          window.open(res.fallbackUrl, "_blank");
        } else {
          toastNotification.error(res.error || "Could not deliver message.");
        }
      }
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
              {/* Meta WhatsApp Delivery Button */}
              <div className={`relative flex items-center justify-between gap-3 rounded-lg border-2 ${metaStatus.connected ? "border-emerald-500 bg-emerald-50/40" : "border-amber-300 bg-amber-50/40"} p-3.5 shadow-xs w-full`}>
                <div className="flex items-center gap-3">
                  <div className={`grid h-8 w-8 place-items-center rounded-lg ${metaStatus.connected ? "bg-emerald-600" : "bg-amber-600"} text-white font-bold text-sm shadow-xs`}>
                    W
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-slate-900">Meta WhatsApp Cloud API</p>
                      {metaStatus.loading ? (
                        <span className="text-[10px] text-slate-400">Checking...</span>
                      ) : metaStatus.connected ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Connected {metaStatus.phoneNumber ? `(${metaStatus.phoneNumber})` : ""}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            Templates: {metaStatus.approvedCount} Approved{metaStatus.pendingCount > 0 ? `, ${metaStatus.pendingCount} Reviewing` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Offline / Not Connected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {metaStatus.connected
                        ? "Active Cloud Connection • Invoices and receipts deliver directly to customer WhatsApp phones in the background"
                        : "Connect Meta WhatsApp in WhatsApp Connect to enable official background cloud delivery without phone QR login"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!metaStatus.connected && !metaStatus.loading && (
                    <a
                      href="/parties/whatsapp-connect"
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-xs transition"
                    >
                      Connect Meta
                    </a>
                  )}
                  {metaStatus.connected && (
                    <button
                      type="button"
                      onClick={handleRequestTemplateApproval}
                      disabled={requestingApproval}
                      title="Request Meta approval for all transaction and reminder templates"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
                    >
                      {requestingApproval ? (
                        <><FiLoader className="h-3 w-3 animate-spin text-emerald-600" /> Requesting All Templates...</>
                      ) : (
                        <><FiCheck className="h-3 w-3 text-emerald-600" /> Request All Templates</>
                      )}
                    </button>
                  )}
                </div>
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

