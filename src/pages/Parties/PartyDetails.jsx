// Implements the party details page.
import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  FiAlertCircle,
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiCopy,
  FiDownload,
  FiExternalLink,
  FiFileText,
  FiFilter,
  FiLoader,
  FiMail,
  FiMessageSquare,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiSend,
  FiShare2,
  FiStar,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import Button from "../../components/Common/Button";
import Input from "../../components/Common/Input";
import ImportPartiesModal from "./ImportPartiesModal";
import AddPartyModal from "./AddPartyModal";
import { gstTypes, indianStates, partyFormDefaults } from "../../constants/partiesData";
import { getPartyDeletionBlockReason, getParties, deduplicatePartyList } from "../../services/partiesStorage";
import { loadBusinessParties, saveBusinessParty, deleteBusinessParty, loadSalesInvoices, loadPurchaseBills } from "../../services/businessRecords";
import { transactionsDb } from "../../services/databaseRepository";
import { readTransactionValue, transactionStorageKeys } from "../../services/transactionRepository";
import { buildUnifiedStatementHtml } from "../../services/unifiedPrintService.js";
import { getSaleInvoices } from "../../services/salesStorage";
import { getPurchaseBills } from "../../services/purchaseBillsStorage";
import { getCompanyProfile } from "../../services/companyProfileStorage";
import { businessDataChangedEvent } from "../../services/businessDataChanged";
import { calculateInvoiceSettlement, calculatePartyBalances, transactionMatchesParty } from "../../services/partyBalances";
import useAppSettings from "../../hooks/useAppSettings";
import TransactionActionMenu from "../../components/Common/TransactionActionMenu.jsx";
import { toast } from "../../components/Common/Toast.jsx";
import ConfirmModal from "../../components/Common/ConfirmModal.jsx";

export const isPartyInactive = (p) => p?.status === "inactive" || p?.isActive === false;







// This helper handles result logic.
function money(value) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Escapes html.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// Builds statement document.
// Formats date as DD/MM/YYYY
function formatDateDMY(dateStr) {
  if (!dateStr) return "-";
  const s = String(dateStr).trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${dmy[3]}`;
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[3].padStart(2, "0")}/${ymd[2].padStart(2, "0")}/${ymd[1]}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return dateStr;
}

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Generates an official, clean, vector A4 PDF for Party Statement using jsPDF.
 */
function generatePartyStatementPdfBlob({
  companyName = "Company",
  companyPhone = "",
  companyEmail = "",
  companyGstin = "",
  party = {},
  rows = [],
  totals = {},
  appSettings = {},
  filename = "Party_Statement.pdf",
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2; // 190mm

  const drawHeader = (isFirstPage = false) => {
    let currentY = 12;
    if (isFirstPage) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text(companyName, pageWidth / 2, currentY, { align: "center" });
      currentY += 4.5;

      const metaParts = [];
      if (companyPhone) metaParts.push(`Phone no.: ${companyPhone}`);
      if (companyEmail) metaParts.push(`Email: ${companyEmail}`);
      if (companyGstin) metaParts.push(`GSTIN: ${companyGstin}`);
      if (metaParts.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(metaParts.join(" | "), pageWidth / 2, currentY, { align: "center" });
        currentY += 5;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("Party statement", pageWidth / 2, currentY, { align: "center" });
      const titleWidth = doc.getTextWidth("Party statement");
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.4);
      doc.line((pageWidth - titleWidth) / 2, currentY + 1, (pageWidth + titleWidth) / 2, currentY + 1);
      currentY += 7;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`Party name: ${party.partyName || "Cash Sale"}`, margin, currentY);
      currentY += 4.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      if (party.phone) {
        doc.text(`Contact No.: ${party.phone}`, margin, currentY);
        currentY += 4;
      }
      if (party.billingAddress) {
        doc.text(`Billing Address: ${party.billingAddress}`, margin, currentY);
        currentY += 4;
      }
      if (appSettings.printShippingAddress !== false && party.shippingAddress) {
        doc.text(`Shipping Address: ${party.shippingAddress}`, margin, currentY);
        currentY += 4;
      }
      (party.additionalFields || [])
        .filter((f) => f.showInPrint && f.value)
        .forEach((f) => {
          doc.text(`${f.fieldName || f.name}: ${f.value}`, margin, currentY);
          currentY += 4;
        });

      currentY += 2;
    } else {
      currentY = 12;
    }

    // Table Header
    doc.setFillColor(203, 213, 225);
    doc.rect(margin, currentY, contentWidth, 7, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");

    doc.text("Date", margin + 2, currentY + 4.8);
    doc.text("Txn Type", margin + 22, currentY + 4.8);
    doc.text("Ref No.", margin + 55, currentY + 4.8);
    doc.text("Payment Status", margin + 74, currentY + 4.8);
    doc.text("Total", margin + 114, currentY + 4.8, { align: "right" });
    doc.text("Received / Paid", margin + 134, currentY + 4.8, { align: "right" });
    doc.text("Txn Balance", margin + 152, currentY + 4.8, { align: "right" });
    doc.text("Receivable Bal", margin + 171, currentY + 4.8, { align: "right" });
    doc.text("Payable Bal", margin + 190, currentY + 4.8, { align: "right" });

    return currentY + 7;
  };

  let y = drawHeader(true);

  if (rows.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("No transactions to show", pageWidth / 2, y + 10, { align: "center" });
    y += 18;
  } else {
    rows.forEach((row, idx) => {
      if (y > 275) {
        doc.addPage();
        y = drawHeader(false);
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, "F");
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 6, margin + contentWidth, y + 6);

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);

      doc.text(formatDateDMY(row.date), margin + 2, y + 4.2);
      doc.text(String(row.source || "-").slice(0, 22), margin + 22, y + 4.2);
      doc.text(String(row.number || "-").slice(0, 12), margin + 55, y + 4.2);

      if (row.status === "Paid") {
        doc.setTextColor(16, 185, 129);
      } else {
        doc.setTextColor(225, 29, 72);
      }
      doc.setFont("helvetica", "bold");
      doc.text(String(row.status || "-"), margin + 74, y + 4.2);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(money(row.total), margin + 114, y + 4.2, { align: "right" });
      doc.text(money(row.received), margin + 134, y + 4.2, { align: "right" });
      doc.text(money(row.balance), margin + 152, y + 4.2, { align: "right" });

      if (row.receivableBalance > 0) {
        doc.setTextColor(16, 185, 129);
        doc.text(money(row.receivableBalance), margin + 171, y + 4.2, { align: "right" });
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text("-", margin + 171, y + 4.2, { align: "right" });
      }

      if (row.payableBalance > 0) {
        doc.setTextColor(225, 29, 72);
        doc.text(money(row.payableBalance), margin + 190, y + 4.2, { align: "right" });
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text("-", margin + 190, y + 4.2, { align: "right" });
      }

      y += 6;
    });

    if (y > 270) {
      doc.addPage();
      y = drawHeader(false);
    }
    doc.setFillColor(203, 213, 225);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + contentWidth, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);

    doc.text("Total", margin + 2, y + 4.8);
    doc.text(money(totals.totalAmount), margin + 114, y + 4.8, { align: "right" });
    doc.text(money(totals.totalReceived), margin + 134, y + 4.8, { align: "right" });
    doc.text(money(totals.totalBalance), margin + 152, y + 4.8, { align: "right" });

    doc.setTextColor(4, 120, 87);
    doc.text(money(totals.totalReceivable), margin + 171, y + 4.8, { align: "right" });

    doc.setTextColor(190, 18, 60);
    doc.text(money(totals.totalPayable), margin + 190, y + 4.8, { align: "right" });

    y += 9;
  }

  const now = new Date();
  const timestamp = `Generated on ${formatDateDMY(now)} at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(timestamp, margin, pageHeight - 6);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  const pdfBlob = doc.output("blob");
  const file = new File([pdfBlob], filename, { type: "application/pdf" });
  return { doc, blob: pdfBlob, file, filename };
}

function buildStatementDocument(party, invoices, activity = [], settings = {}) {
  const opening = Math.abs(Number(party?.openingBalance || 0));
  const openingType = party?.openingBalanceType || "to-receive";

  const rows = [
    ...(opening > 0 ? [{
      date: formatDateDMY(party?.asOfDate),
      source: `${openingType === "to-pay" ? "Payable" : "Receivable"} Opening Balance`,
      number: "-",
      status: "Unpaid",
      total: opening,
      received: 0,
      balance: opening,
      receivableBalance: openingType === "to-receive" ? opening : 0,
      payableBalance: openingType === "to-pay" ? opening : 0,
    }] : []),
    ...activity.map((entry) => ({
      date: formatDateDMY(entry.date),
      source: entry.source,
      number: entry.number || "-",
      status: entry.status || "Paid",
      total: Number(entry.total || 0),
      received: Number(entry.received || 0),
      balance: Number(entry.balance || 0),
      receivableBalance: Number(entry.receivableBalance || 0),
      payableBalance: Number(entry.payableBalance || 0),
    })),
  ];

  const totalAmount = rows.reduce((s, r) => s + r.total, 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
  const totalReceivable = rows.reduce((s, r) => s + r.receivableBalance, 0);
  const totalPayable = rows.reduce((s, r) => s + r.payableBalance, 0);

  const printShipping = (settings?.printShippingAddress !== false) && party?.shippingAddress;
  const printableFields = (party?.additionalFields || []).filter((f) => f.showInPrint && f.value);

  return buildUnifiedStatementHtml({
    party,
    company: { currencySymbol: "₹" },
    rows,
    totals: {
      amount: totalAmount,
      received: totalReceived,
      balance: totalBalance,
      receivable: totalReceivable,
      payable: totalPayable,
    },
    printableFields,
    printShipping: Boolean(printShipping),
    autoPrint: true,
  });
}

// Renders the party details interface.
function PartyDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const appSettings = useAppSettings() || {};

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [partyBeingEdited, setPartyBeingEdited] = useState(null);
  const [deletePartyConfirm, setDeletePartyConfirm] = useState(null);
  const [parties, setParties] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderExtraMessage, setReminderExtraMessage] = useState("");
  const [reminderNotice, setReminderNotice] = useState("");

  useEffect(() => {
    if (location.state?.openAddParty) {
      setIsModalOpen(true);
    }
  }, [location.state]);
  const [balanceFilter, setBalanceFilter] = useState(() => {
    const params = new URLSearchParams(location.search);
    const f = params.get("filter") || location.state?.filter;
    if (f === "receivable" || f === "to-receive") return "receivable";
    if (f === "payable" || f === "to-pay") return "payable";
    return "all";
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const f = params.get("filter") || location.state?.filter;
    if (f === "receivable" || f === "to-receive") {
      setBalanceFilter("receivable");
    } else if (f === "payable" || f === "to-pay") {
      setBalanceFilter("payable");
    }
  }, [location.search, location.state]);
  const [partyActivity, setPartyActivity] = useState({ estimates: [], proformas: [], payments: [], paymentsOut: [], creditNotes: [], debitNotes: [] });
  const [selectedPartyId, setSelectedPartyId] = useState("cash-sale");
  const [mobileView, setMobileView] = useState("list");
  const [search, setSearch] = useState("");
  const [statementOpen, setStatementOpen] = useState(false);
  const [printStatementOnOpen, setPrintStatementOnOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [gmailGuidanceOpen, setGmailGuidanceOpen] = useState(false);
  const [lastGmailUrl, setLastGmailUrl] = useState("");
  const [transactionSearchOpen, setTransactionSearchOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [importPartiesOpen, setImportPartiesOpen] = useState(false);
  const [importNotice, setImportNotice] = useState("");

  const handleImportParties = async (selectedContacts) => {
    if (!selectedContacts?.length) return;
    let existing;
    try {
      existing = await loadBusinessParties();
    } catch (err) {
      const msg = `Could not verify existing parties in MySQL before import: ${err.message}`;
      setLoadError(msg);
      toast.error(msg);
      return;
    }
    const seenNames = new Set(
      existing.map((p) => String(p.partyName || p.name || p.party_name || "").trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean)
    );
    const seenPhones = new Set(
      existing.map((p) => String(p.phone || p.mobile || "").replace(/\D/g, "")).filter((ph) => ph.length >= 10)
    );
    let firstSavedId = null;
    let importedCount = 0;
    let failedCount = 0;

    for (const c of selectedContacts) {
      const cName = String(c.name || "").trim().replace(/\s+/g, " ");
      if (!cName) continue;
      const normName = cName.toLowerCase();
      const cleanP = String(c.phone || "").replace(/\D/g, "");

      if (seenNames.has(normName) || (cleanP.length >= 10 && seenPhones.has(cleanP))) {
        const match = existing.find(
          (p) =>
            String(p.partyName || p.name || p.party_name || "").trim().toLowerCase().replace(/\s+/g, " ") === normName ||
            (cleanP.length >= 10 && String(p.phone || p.mobile || "").replace(/\D/g, "") === cleanP)
        );
        if (match && !firstSavedId) firstSavedId = match.id;
        continue;
      }

      try {
        const saved = await saveBusinessParty({
          ...partyFormDefaults,
          partyName: cName,
          phone: c.phone || "",
          email: c.email || "",
          billingAddress: c.address || "",
          openingBalance: "0",
          openingBalanceType: "to-receive",
          gstType: "Unregistered / Consumer",
        });
        if (saved?.id) {
          if (!firstSavedId) firstSavedId = saved.id;
          seenNames.add(normName);
          if (cleanP.length >= 10) seenPhones.add(cleanP);
          existing.push(saved);
          importedCount += 1;
        }
      } catch (e) {
        failedCount += 1;
        console.warn("[Party Import] Error saving contact:", c.name, e);
      }
    }

    await fetchAllFromDatabase();
    if (firstSavedId) setSelectedPartyId(firstSavedId);
    if (failedCount > 0 && importedCount === 0) {
      toast.error(`Failed to import ${failedCount} selected contact${failedCount === 1 ? "" : "s"} to MySQL.`);
      return;
    }
    setImportNotice(
      importedCount > 0
        ? `Imported ${importedCount} ${importedCount === 1 ? "party" : "parties"}${failedCount > 0 ? ` (${failedCount} failed)` : ""}!`
        : "Selected contacts already exist in Parties."
    );
    setTimeout(() => setImportNotice(""), 3500);
  };

  const fetchAllFromDatabase = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [partiesRes, salesRes, purchasesRes, txnsRes] = await Promise.allSettled([
        loadBusinessParties(),
        loadSalesInvoices(),
        loadPurchaseBills(),
        transactionsDb.listAll(),
      ]);

      if (partiesRes.status === "rejected") {
        throw new Error(partiesRes.reason?.message || "Failed to load parties from MySQL.");
      }

      const partiesList = partiesRes.value;
      if (Array.isArray(partiesList)) {
        setParties(deduplicatePartyList(partiesList));
      }

      const partialErrors = [];
      if (salesRes.status === "fulfilled" && Array.isArray(salesRes.value)) {
        setInvoices(salesRes.value);
      } else if (salesRes.status === "rejected") {
        partialErrors.push(`Sales (${salesRes.reason?.message || "error"})`);
      }

      if (purchasesRes.status === "fulfilled" && Array.isArray(purchasesRes.value)) {
        setPurchases(purchasesRes.value);
      } else if (purchasesRes.status === "rejected") {
        partialErrors.push(`Purchases (${purchasesRes.reason?.message || "error"})`);
      }

      if (txnsRes.status === "fulfilled") {
        const txns = Array.isArray(txnsRes.value) ? txnsRes.value : [];
        let saleUi = {};
        try {
          saleUi = readTransactionValue(transactionStorageKeys.saleInvoiceUi, {}) || {};
        } catch {}
        setPartyActivity({
          estimates: txns.filter((t) => t.transactionType === "estimate" || t.type === "estimate"),
          proformas: txns.filter((t) => t.transactionType === "proforma" || t.type === "proforma"),
          payments: txns.filter((t) => t.transactionType === "payment_in" || t.type === "payment_in"),
          paymentsOut: txns.filter((t) => t.transactionType === "payment_out" || t.type === "payment_out"),
          creditNotes: txns.filter((t) => t.transactionType === "credit_note" || t.type === "credit_note" || t.transactionType === "sale_return"),
          debitNotes: txns.filter((t) => t.transactionType === "debit_note" || t.type === "debit_note" || t.transactionType === "purchase_return"),
          saleOrders: txns.filter((t) => t.transactionType === "sale_order" || t.type === "sale_order"),
          purchaseOrders: txns.filter((t) => t.transactionType === "purchase_order" || t.type === "purchase_order"),
          saleUi,
        });
      } else if (txnsRes.status === "rejected") {
        partialErrors.push(`Transactions (${txnsRes.reason?.message || "error"})`);
      }

      if (partialErrors.length > 0) {
        setLoadError(`Some related transaction data could not be loaded: ${partialErrors.join("; ")}`);
      }
    } catch (error) {
      setLoadError(error.message || "Could not load data from database.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllFromDatabase();
  }, [fetchAllFromDatabase]);

  const reloadLocalData = useCallback(() => {
    fetchAllFromDatabase();
  }, [fetchAllFromDatabase]);

  useEffect(() => {
    window.addEventListener(businessDataChangedEvent, reloadLocalData);
    window.addEventListener("storage", reloadLocalData);
    return () => {
      window.removeEventListener(businessDataChangedEvent, reloadLocalData);
      window.removeEventListener("storage", reloadLocalData);
    };
  }, [reloadLocalData]);

  useEffect(() => {
    if (!statementOpen || !printStatementOnOpen) return undefined;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [statementOpen, printStatementOnOpen]);

  // Saves party directly to MySQL database
  const saveParty = async (party) => {
    try {
      const isInactive = isPartyInactive(party);
      const partyToSave = {
        ...party,
        status: isInactive ? "inactive" : "active",
        isActive: !isInactive,
      };
      const saved = await saveBusinessParty(partyToSave);
      const merged = {
        ...partyToSave,
        ...saved,
        status: isInactive ? "inactive" : "active",
        isActive: !isInactive,
      };
      setParties((current) => {
        const mergedNameNorm = String(merged.partyName || "").trim().toLowerCase();
        const filtered = current.filter(
          (item) => item.id !== merged.id && String(item.partyName || "").trim().toLowerCase() !== mergedNameNorm
        );
        return deduplicatePartyList([merged, ...filtered]);
      });
      setPartyBeingEdited(null);
      toast.success("Party saved successfully.");
      return merged;
    } catch (err) {
      toast.error(err.message || "Failed to save party.");
      throw err;
    }
  };

  const removeParty = () => {
    if (!selectedParty) return;
    const balanceInfo = getPartyBalanceInfo(selectedParty);
    const hasOutstanding = (balanceInfo?.receivable > 0) || (balanceInfo?.payable > 0) || (Math.abs(balanceInfo?.net || 0) > 0.01) || (Number(selectedParty.openingBalance || 0) !== 0);
    const hasHistory = partyTransactions.length > 0 || Boolean(getPartyDeletionBlockReason(selectedParty));
    setDeletePartyConfirm({
      ...selectedParty,
      willDeactivate: hasOutstanding || hasHistory,
      hasOutstanding,
      hasHistory,
    });
  };

  const partyBalanceResult = useMemo(() => calculatePartyBalances({
    parties,
    sales: invoices,
    purchases,
    paymentIns: partyActivity.payments,
    paymentOuts: partyActivity.paymentsOut,
    creditNotes: partyActivity.creditNotes,
    debitNotes: partyActivity.debitNotes,
    saleUi: partyActivity.saleUi,
  }), [parties, invoices, purchases, partyActivity]);
  const getPartyBalanceInfo = (party) => partyBalanceResult.parties.find((entry) => String(entry.id) === String(party.id)) || { receivable: 0, payable: 0, customerAdvances: 0, supplierAdvances: 0, net: 0 };

  const partyGroups = useMemo(() => {
    const set = new Set();
    parties.forEach((p) => {
      const g = (p.group || "General").trim();
      if (g) set.add(g);
    });
    return Array.from(set);
  }, [parties]);

  const filteredParties = parties.filter((party) => {
    const q = search.trim().toLowerCase().replace(/\s+/g, " ");
    if (q) {
      const normName = String(party.partyName || party.name || "").trim().toLowerCase().replace(/\s+/g, " ");
      const phone = String(party.phone || party.mobile || "").toLowerCase();
      const gstin = String(party.gstin || "").toLowerCase();
      if (!normName.includes(q) && !phone.includes(q) && !gstin.includes(q)) return false;
    }

    // Party Grouping setting check
    if ((appSettings.enablePartyGrouping ?? true) && groupFilter !== "all") {
      const g = (party.group || "General").toLowerCase();
      if (g !== groupFilter.toLowerCase()) return false;
    }

    // Party Status setting check
    if ((appSettings.managePartyStatus ?? true) && statusFilter !== "all") {
      const isInactive = isPartyInactive(party);
      if (statusFilter === "active" && isInactive) return false;
      if (statusFilter === "inactive" && !isInactive) return false;
    }

    const info = getPartyBalanceInfo(party);
    if (balanceFilter === "receivable") return info.receivable > 0;
    if (balanceFilter === "payable") return info.payable > 0;
    return true;
  });

  // When filtering, ensure selected party is valid
  useEffect(() => {
    if (balanceFilter !== "all" && filteredParties.length > 0) {
      const isCurrentInList = filteredParties.some((p) => String(p.id) === String(selectedPartyId));
      if (!isCurrentInList) {
        setSelectedPartyId(filteredParties[0].id);
      }
    }
  }, [balanceFilter, filteredParties]);
  const selectedParty = parties.find((party) => String(party.id) === String(selectedPartyId));
  const selectedPartyBalance = selectedParty ? getPartyBalanceInfo(selectedParty) : null;
  const partyInvoices = selectedParty ? invoices.filter((invoice) => transactionMatchesParty(invoice, selectedParty)) : [];
  const partyPurchases = selectedParty ? purchases.filter((bill) => transactionMatchesParty(bill, selectedParty)) : [];
  const belongsToSelectedParty = (entry) => selectedParty && transactionMatchesParty(entry, selectedParty);
  const partyTransactions = [
    ...partyInvoices.map((invoice) => {
      const settlement = calculateInvoiceSettlement(invoice, { kind: "sale", payments: partyActivity.payments, adjustments: partyActivity.creditNotes });
      const hasSeparatePayment = (partyActivity.payments || []).some((p) => String(p.linkedInvoiceId || p.invoiceId) === String(invoice.id));
      const directPaid = hasSeparatePayment ? 0 : settlement.paid;
      return { id: `sale:${invoice.id}`, source: "Sale", number: invoice.form?.invoiceNumber || invoice.invoiceNumber || invoice.number || "—", date: invoice.form?.invoiceDate || invoice.createdAt, total: settlement.total, received: directPaid, balance: settlement.outstanding, receivableBalance: settlement.outstanding, payableBalance: 0, status: settlement.status, raw: invoice };
    }),
    ...partyPurchases.map((bill) => {
      const settlement = calculateInvoiceSettlement(bill, { kind: "purchase", payments: partyActivity.paymentsOut, adjustments: partyActivity.debitNotes });
      const hasSeparatePayment = (partyActivity.paymentsOut || []).some((p) => String(p.linkedInvoiceId || p.linkedBillId || p.billId || p.purchaseId) === String(bill.id));
      const directPaid = hasSeparatePayment ? 0 : settlement.paid;
      return { id: `purchase:${bill.id}`, source: "Purchase", number: bill.form?.invoiceNumber || bill.invoiceNumber || bill.billNumber || bill.number || "—", date: bill.form?.invoiceDate || bill.form?.billDate || bill.date || bill.createdAt, total: settlement.total, received: directPaid, balance: settlement.outstanding, receivableBalance: 0, payableBalance: settlement.outstanding, status: settlement.status, raw: bill };
    }),
    ...partyActivity.estimates.filter(belongsToSelectedParty).map((entry) => ({ id: `estimate:${entry.id}`, source: "Estimate/Quotation", number: entry.number || entry.refNo || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: String(entry.status || "Open").startsWith("Converted") ? Number(entry.amount || 0) : 0, balance: String(entry.status || "Open").startsWith("Converted") ? 0 : Number(entry.amount || 0), status: entry.status || "Open", raw: entry })),
    ...partyActivity.proformas.filter(belongsToSelectedParty).map((entry) => ({ id: `proforma:${entry.id}`, source: "Proforma Invoice", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: String(entry.status || "Open").startsWith("Converted") ? Number(entry.amount || 0) : 0, balance: String(entry.status || "Open").startsWith("Converted") ? 0 : Number(entry.amount || 0), status: entry.status || "Open", raw: entry })),
    ...(partyActivity.saleOrders || []).filter(belongsToSelectedParty).map((entry) => ({ id: `sale-order:${entry.id}`, source: "Sale Order", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: entry.status === "Converted to Sale" ? Number(entry.amount || 0) : 0, balance: entry.status === "Converted to Sale" ? 0 : Number(entry.amount || 0), status: entry.status || "Open", raw: entry })),
    ...(partyActivity.purchaseOrders || []).filter(belongsToSelectedParty).map((entry) => ({ id: `purchase-order:${entry.id}`, source: "Purchase Order", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: entry.status === "Converted to Purchase" ? Number(entry.amount || 0) : 0, balance: entry.status === "Converted to Purchase" ? 0 : Number(entry.amount || 0), status: entry.status || "Open", raw: entry })),
    ...partyActivity.payments.filter(belongsToSelectedParty).map((entry) => { const unallocated = !entry.linkedInvoiceId && !entry.invoiceId && !(entry.allocations || []).length; const advance = unallocated ? Number(entry.amount || 0) : 0; return { id: `payment:${entry.id}`, source: "Payment-In", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: Number(entry.received ?? entry.amount ?? 0), balance: advance, receivableBalance: 0, payableBalance: advance, status: entry.status || "Unused", raw: entry }; }),
    ...partyActivity.paymentsOut.filter(belongsToSelectedParty).map((entry) => { const unallocated = !entry.linkedInvoiceId && !entry.linkedBillId && !entry.invoiceId && !entry.billId && !entry.purchaseId && !entry.linkedCreditNoteId && !(entry.allocations || []).length; const advance = unallocated ? Number(entry.amount || 0) : 0; return { id: `payment-out:${entry.id}`, source: entry.linkedCreditNoteId ? "Credit Note Refund" : "Payment-Out", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.amount || 0), received: Number(entry.amount || 0), balance: advance, receivableBalance: advance, payableBalance: 0, status: entry.status || "Paid", raw: entry }; }),
    ...partyActivity.creditNotes.filter((entry) => entry.type === "Credit Note" && !entry.cancelled && belongsToSelectedParty(entry)).map((entry) => { const credit = Number(entry.customerCreditAmount ?? entry.balance ?? 0); return { id: `credit-note:${entry.id}`, source: "Credit Note", number: entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.total || 0), received: Number(entry.received || 0), balance: credit, receivableBalance: 0, payableBalance: credit, status: entry.status || "Credit Available", raw: entry }; }),
    ...partyActivity.debitNotes.filter((entry) => !entry.cancelled && belongsToSelectedParty(entry)).map((entry) => { const linked = entry.billId || entry.purchaseId || entry.linkedInvoiceId; const credit = linked ? 0 : Number(entry.balance ?? Math.max(0, Number(entry.total || entry.amount || 0) - Number(entry.received || 0))); return { id: `debit-note:${entry.id}`, source: "Debit Note", number: entry.refNo || entry.returnNo || entry.number || "—", date: entry.date || entry.createdAt, total: Number(entry.total || entry.amount || 0), received: Number(entry.received || 0), balance: credit, receivableBalance: credit, payableBalance: 0, status: entry.status || "Supplier Credit", raw: entry }; }),
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const visiblePartyTransactions = partyTransactions.filter((entry) => [entry.source, entry.number, entry.date, entry.total, entry.received, entry.balance, entry.status, entry.raw?.paymentType, entry.raw?.description].join(" ").toLowerCase().includes(transactionSearch.toLowerCase()));
  const openingBalance = Math.abs(Number(selectedParty?.openingBalance || 0));
  const cashSaleName = selectedParty?.partyName || "Cash Sale";
  const selectedOpeningBalance = Math.abs(Number(selectedParty?.openingBalance || 0));
  const selectedBalanceType = selectedParty?.openingBalanceType || "to-receive";

  const statementRows = useMemo(() => [
    ...(selectedParty && selectedOpeningBalance > 0 && !transactionSearch.trim() ? [{
      id: "opening",
      date: selectedParty.asOfDate || "",
      source: `${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} Opening Balance`,
      number: "-",
      status: "Unpaid",
      total: selectedOpeningBalance,
      received: 0,
      balance: selectedOpeningBalance,
      receivableBalance: selectedBalanceType === "to-receive" ? selectedOpeningBalance : 0,
      payableBalance: selectedBalanceType === "to-pay" ? selectedOpeningBalance : 0,
    }] : []),
    ...visiblePartyTransactions.map((entry) => ({
      id: entry.id,
      date: entry.date,
      source: entry.source,
      number: entry.number || "-",
      status: entry.status || "Paid",
      total: Number(entry.total || 0),
      received: Number(entry.received || 0),
      balance: Number(entry.balance || 0),
      receivableBalance: Number(entry.receivableBalance || 0),
      payableBalance: Number(entry.payableBalance || 0),
    })),
  ], [selectedParty, selectedOpeningBalance, selectedBalanceType, visiblePartyTransactions, transactionSearch]);

  const statementTotals = useMemo(() => ({
    totalAmount: statementRows.reduce((sum, r) => sum + Number(r.total || 0), 0),
    totalReceived: statementRows.reduce((sum, r) => sum + Number(r.received || 0), 0),
    totalBalance: statementRows.reduce((sum, r) => sum + Number(r.balance || 0), 0),
    totalReceivable: statementRows.reduce((sum, r) => sum + Number(r.receivableBalance || 0), 0),
    totalPayable: statementRows.reduce((sum, r) => sum + Number(r.payableBalance || 0), 0),
  }), [statementRows]);

  const getStatementPdfDocument = () => {
    const company = getCompanyProfile();
    const companyName = company.businessName || company.companyName || "Company Name";
    const senderEmail = company.email || company.emailId || "";
    const partyName = selectedParty?.partyName || "Party";
    const cleanFileName = `${(partyName || "Party").replace(/[^a-z0-9-_]+/gi, "_")}_Statement.pdf`;

    return generatePartyStatementPdfBlob({
      companyName,
      companyPhone: company.phone || company.phoneNumber || "",
      companyEmail: senderEmail,
      companyGstin: (appSettings.enableGstin !== false && appSettings.printGstinOnSale !== false) ? (company.gstin || "") : "",
      party: selectedParty || {},
      rows: statementRows,
      totals: statementTotals,
      appSettings,
      filename: cleanFileName,
    });
  };

  const handleSaveStatementPdf = () => {
    try {
      const result = getStatementPdfDocument();
      downloadBlobFile(result.blob, result.filename);
      toast.success(`✓ ${result.filename} downloaded!`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF.");
    }
  };

  const handleOpenStatementPdf = () => {
    try {
      const result = getStatementPdfDocument();
      const url = URL.createObjectURL(result.blob);
      window.open(url, "_blank");
    } catch (e) {
      console.error(e);
      toast.error("Failed to open PDF view.");
    }
  };

  const buildPartyEmailBody = (channel = "gmail") => {
    const company = getCompanyProfile();
    const companyName = company.businessName || company.companyName || "Company";
    const senderEmail = company.email || company.emailId || "";
    const phone = company.phoneNumber || company.phone || "";
    const partyName = selectedParty?.partyName || "Customer";
    const pdfFileName = `${(partyName || "Party").replace(/[^a-z0-9-_]+/gi, "_")}_Statement.pdf`;

    return `Dear ${partyName},

Please find attached your Party Statement (PDF) from ${companyName}.

==================================================
PARTY STATEMENT
Company: ${companyName}
Party: ${partyName}
${selectedParty?.phone ? `Contact No.: ${selectedParty.phone}\n` : ""}Generated: ${new Date().toLocaleDateString("en-IN")}
==================================================

STATEMENT SUMMARY:
• Total Transactions: ${statementRows.length}
• Total Amount: ${money(statementTotals.totalAmount)}
• Total Received / Paid: ${money(statementTotals.totalReceived)}
• Net Balance: ${money(statementTotals.totalBalance)}
${statementTotals.totalReceivable > 0 ? `• Total Receivable: ${money(statementTotals.totalReceivable)}\n` : ""}${statementTotals.totalPayable > 0 ? `• Total Payable: ${money(statementTotals.totalPayable)}\n` : ""}
ATTACHED DOCUMENT:
📎 ${pdfFileName}

Thank you,
${companyName}
${phone ? `Phone: ${phone}\n` : ""}${senderEmail ? `Email: ${senderEmail}\n` : ""}`;
  };

  const handleSendViaEmailApp = async () => {
    const cleanTo = emailInput.trim();
    if (!cleanTo || !cleanTo.includes("@") || !cleanTo.includes(".")) {
      toast.error("Please enter a valid recipient email address.");
      return;
    }

    const company = getCompanyProfile();
    const senderEmail = company.email || company.emailId || "";
    if (!senderEmail) {
      toast.error("Please add your business email in the Company Profile first.");
      return;
    }

    setIsSendingEmail(true);
    try {
      const pdfFileName = `${(selectedParty?.partyName || "Party").replace(/[^a-z0-9-_]+/gi, "_")}_Statement.pdf`;
      const result = generatePartyStatementPdfBlob({
        companyName: company.businessName || company.companyName || "Company",
        companyPhone: company.phone || company.phoneNumber || "",
        companyEmail: senderEmail,
        companyGstin: (appSettings.enableGstin !== false && appSettings.printGstinOnSale !== false) ? (company.gstin || "") : "",
        party: selectedParty || {},
        rows: statementRows,
        totals: statementTotals,
        appSettings,
        filename: pdfFileName,
      });

      downloadBlobFile(result.blob, pdfFileName);

      const subject = emailSubject.trim() || `[${company.businessName || company.companyName || "Company"}] Party Statement - ${selectedParty?.partyName || "Party"}`;
      const body = buildPartyEmailBody("app");

      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [result.file] })
      ) {
        try {
          await navigator.share({
            title: subject,
            text: body,
            files: [result.file],
          });
          toast.success(`✓ ${pdfFileName} attached and opened in Mail App!`, { duration: 6000 });
          setEmailModalOpen(false);
          return;
        } catch (shareErr) {
          if (shareErr.name === "AbortError") return;
          console.warn("navigator.share failed, using mailto fallback:", shareErr);
        }
      }

      const mailtoUrl = `mailto:${encodeURIComponent(cleanTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoUrl;

      toast.success(`✓ ${pdfFileName} downloaded to your PC & Mail App opened for ${cleanTo}!`, { duration: 8000 });
      setEmailModalOpen(false);
    } catch (err) {
      console.error("Email send error:", err);
      toast.error("Failed to generate PDF for email.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendViaGmail = () => {
    const cleanTo = emailInput.trim();
    if (!cleanTo || !cleanTo.includes("@") || !cleanTo.includes(".")) {
      toast.error("Please enter a valid recipient email address.");
      return;
    }

    const company = getCompanyProfile();
    const senderEmail = company.email || company.emailId || "";
    if (!senderEmail) {
      toast.error("Please add your business email in the Company Profile first.");
      return;
    }

    try {
      const pdfFileName = `${(selectedParty?.partyName || "Party").replace(/[^a-z0-9-_]+/gi, "_")}_Statement.pdf`;
      const result = generatePartyStatementPdfBlob({
        companyName: company.businessName || company.companyName || "Company",
        companyPhone: company.phone || company.phoneNumber || "",
        companyEmail: senderEmail,
        companyGstin: (appSettings.enableGstin !== false && appSettings.printGstinOnSale !== false) ? (company.gstin || "") : "",
        party: selectedParty || {},
        rows: statementRows,
        totals: statementTotals,
        appSettings,
        filename: pdfFileName,
      });

      downloadBlobFile(result.blob, pdfFileName);

      const subject = emailSubject.trim() || `[${company.businessName || company.companyName || "Company"}] Party Statement - ${selectedParty?.partyName || "Party"}`;
      const body = buildPartyEmailBody("gmail");

      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(cleanTo)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      const win = window.open(gmailUrl, "_blank");
      if (!win) {
        window.location.href = `mailto:${encodeURIComponent(cleanTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }

      setLastGmailUrl(gmailUrl);

      toast.success(`✓ ${pdfFileName} downloaded! Please attach this downloaded file before sending in Gmail.`, { duration: 15000 });
      setGmailGuidanceOpen(true);
    } catch (err) {
      console.error("Gmail error:", err);
      toast.error("Failed to generate PDF for Gmail.");
    }
  };
  // Opens statement document.
  const openStatementDocument = (printWhenReady = false) => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setLoadError("Allow pop-ups to open the printable party statement.");
      return;
    }
    popup.document.open();
    popup.document.write(buildStatementDocument(selectedParty, partyInvoices, partyTransactions, appSettings));
    popup.document.close();
    if (printWhenReady) popup.addEventListener("load", () => popup.print(), { once: true });
  };
  // Downloads excel.
  const downloadExcel = () => {
    const tableRows = [
      ["Date", "Type", "Number", "Payment Status", "Total", "Received / Paid", "Balance"],
      ...(selectedParty && openingBalance > 0 ? [[selectedParty.asOfDate || "", `${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} Opening Balance`, "", "Unpaid", openingBalance, 0, openingBalance]] : []),
      ...partyTransactions.map((entry) => [entry.date || "", entry.source, entry.number, entry.status, entry.total, entry.received, entry.balance]),
    ];
    const excelDocument = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${tableRows.map((row, index) => `<tr>${row.map((value) => index === 0 ? `<th>${escapeHtml(value)}</th>` : `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    const url = URL.createObjectURL(new Blob([excelDocument], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(selectedParty?.partyName || "cash-sale").replace(/[^a-z0-9-_]+/gi, "-")}-transactions.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col bg-slate-200 overflow-hidden">
      <div className="flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-700">Parties</h1>
        <div className="flex items-center gap-4"><Button onClick={() => { setPartyBeingEdited(null); setIsModalOpen(true); }} className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"><FiPlus className="h-4 w-4" /> Add Party</Button></div>
      </div>
      {isLoading && (
        <div className="bg-blue-50 px-5 py-2 text-xs font-semibold text-blue-700 border-b border-blue-200">
          Loading parties from MySQL...
        </div>
      )}
      {loadError && (
        <div className="flex items-center justify-between bg-rose-50 px-5 py-2 text-sm text-rose-700 border-b border-rose-200">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={fetchAllFromDatabase}
            className="ml-4 rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      )}
      {/* Mobile Master-Detail View Switcher (< md) */}
      <div className="flex md:hidden border-b border-slate-200 bg-white p-1.5 gap-1.5 shrink-0 z-10 shadow-xs">
        <button
          type="button"
          onClick={() => setMobileView("list")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition cursor-pointer ${
            mobileView === "list"
              ? "bg-[#14171E] text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Parties List ({filteredParties.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileView("details")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition cursor-pointer truncate px-2 ${
            mobileView === "details"
              ? "bg-[#FF5A1F] text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {selectedParty ? selectedParty.partyName : "Cash Sale"} Details &amp; Txns
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-1 p-1 md:grid-cols-[minmax(260px,28%)_1fr]">
        <section className={`flex flex-col overflow-hidden rounded-md bg-white ${
          mobileView === "details" ? "hidden md:flex" : "flex"
        } min-h-[360px] md:min-h-0`}>
          <div className="p-4 pb-2"><label className="flex h-11 items-center gap-3 rounded-full border border-slate-200 px-4 text-slate-400"><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Party Name" className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" /></label></div>
          {/* Balance Filter Pills */}
          <div className="flex items-center gap-1.5 px-4 pb-2.5">
            {[
              { id: "all", label: "All" },
              { id: "receivable", label: "To Receive" },
              { id: "payable", label: "To Pay" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setBalanceFilter(f.id)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  balanceFilter === f.id
                    ? f.id === "receivable"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : f.id === "payable"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-[#14171E] text-white shadow-xs ring-1 ring-[#FF5A1F]/50"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Party Grouping Filter Dropdown */}
          {(appSettings.enablePartyGrouping ?? true) && partyGroups.length > 0 && (
            <div className="flex items-center gap-2 px-4 pb-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Group:</span>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="h-7 flex-1 rounded border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Groups ({parties.length})</option>
                {partyGroups.map((g) => {
                  const count = parties.filter((p) => (p.group || "General").toLowerCase() === g.toLowerCase()).length;
                  return (
                    <option key={g} value={g}>{g} ({count})</option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Party Status Filter Pills */}
          {(appSettings.managePartyStatus ?? true) && (
            <div className="flex items-center gap-1.5 px-4 pb-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Status:</span>
              {[
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "inactive", label: "Inactive" },
              ].map((sf) => (
                <button
                  key={sf.id}
                  type="button"
                  onClick={() => setStatusFilter(sf.id)}
                  className={`rounded px-2.5 py-0.5 text-[10px] font-bold transition cursor-pointer ${
                    statusFilter === sf.id
                      ? sf.id === "inactive"
                        ? "bg-rose-600 text-white shadow-xs"
                        : sf.id === "active"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-800 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {sf.label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-[1fr_130px] border-y border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
            <span className="flex items-center justify-between">Party Name <FiFilter className="text-rose-500" /></span>
            <span>Amount</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {balanceFilter === "all" && statusFilter !== "inactive" && groupFilter === "all" && (
              <button
                onClick={() => {
                  setSelectedPartyId("cash-sale");
                  setMobileView("details");
                }}
                className={`grid w-full grid-cols-[1fr_130px] px-4 py-4 text-left text-sm transition cursor-pointer ${
                  selectedPartyId === "cash-sale" ? "bg-sky-100 dark:bg-sky-950/40" : "hover:bg-slate-50"
                }`}
              >
                <span className="font-medium text-slate-800">Cash Sale</span>
                <span className="text-right font-medium text-emerald-500">0.00</span>
              </button>
            )}

            {filteredParties.map((party) => {
              const info = getPartyBalanceInfo(party);
              const isInactive = isPartyInactive(party);
              return (
                <button
                  key={party.id}
                  onClick={() => {
                    setSelectedPartyId(party.id);
                    setMobileView("details");
                  }}
                  className={`grid w-full grid-cols-[1fr_130px] items-center px-4 py-3.5 text-left text-sm transition cursor-pointer ${
                    String(selectedPartyId) === String(party.id)
                      ? "bg-sky-100 dark:bg-sky-950/40"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate font-medium ${isInactive ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {party.partyName}
                      </span>
                      {(appSettings.managePartyStatus ?? true) && isInactive && (
                        <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-700">
                          Inactive
                        </span>
                      )}
                    </div>
                    {(appSettings.enablePartyGrouping ?? true) && party.group && (
                      <span className="mt-0.5 inline-block truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {party.group}
                      </span>
                    )}
                  </div>
                  <span className="text-right">
                    {info.receivable > 0 && (
                      <span className="block text-xs font-semibold text-emerald-600">
                        {info.receivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })} To Receive
                      </span>
                    )}
                    {info.payable > 0 && (
                      <span className="block text-xs font-semibold text-rose-600">
                        {info.payable.toLocaleString("en-IN", { minimumFractionDigits: 2 })} To Pay
                      </span>
                    )}
                    {info.receivable <= 0 && info.payable <= 0 && (
                      <span className="text-xs text-slate-400">Settled</span>
                    )}
                  </span>
                </button>
              );
            })}

            {filteredParties.length === 0 && (
              <div className="py-12 text-center text-xs text-slate-400">
                {balanceFilter === "receivable" ? "No receivable parties found" : balanceFilter === "payable" ? "No payable parties found" : "No parties found"}
              </div>
            )}
          </div>

          {/* Left down side UI for adding parties through contacts using phone number and gmail */}
          <div className="border-t border-slate-200 p-2.5 bg-white">
            <button
              type="button"
              onClick={() => setImportPartiesOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-[#ecfdf5] p-2.5 text-left transition hover:bg-emerald-100/90 active:scale-[0.99] cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                  <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 2v20M6 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                    <circle cx="10" cy="10" r="2" />
                    <path d="M7 16a3 3 0 0 1 6 0" />
                  </svg>
                </div>
                <p className="text-xs leading-snug text-slate-700">
                  Use contacts from your <br />
                  Gmail to <span className="font-bold text-slate-900">quickly create parties.</span>
                </p>
              </div>
              <FiChevronRight className="h-4 w-4 shrink-0 text-emerald-700" />
            </button>
          </div>
        </section>

        {/* Right Section: Party Header & Transactions */}
        <section className={`min-w-0 overflow-hidden rounded-md bg-white flex flex-col ${
          mobileView === "list" ? "hidden md:flex" : "flex"
        }`}>
          {/* Mobile Back Button to Party List */}
          <div className="flex md:hidden items-center justify-between border-b border-slate-200 px-4 py-2.5 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={() => setMobileView("list")}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              ← Back to Parties List
            </button>
            <span className="text-xs font-semibold text-slate-500">
              {filteredParties.length} parties
            </span>
          </div>

          {/* Header */}
          <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 bg-white">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-bold text-slate-800 text-lg">{cashSaleName}</h2>
                {selectedParty && (appSettings.enablePartyGrouping ?? true) && selectedParty.group && (
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
                    {selectedParty.group}
                  </span>
                )}
                {selectedParty && (appSettings.managePartyStatus ?? true) && (
                  <button
                    type="button"
                    onClick={() => {
                      const wasInactive = isPartyInactive(selectedParty);
                      const nextStatus = wasInactive ? "active" : "inactive";
                      saveParty({ ...selectedParty, status: nextStatus, isActive: wasInactive });
                    }}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border transition cursor-pointer ${
                      isPartyInactive(selectedParty)
                        ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    }`}
                    title="Click to toggle Active / Inactive status"
                  >
                    ● {isPartyInactive(selectedParty) ? "Inactive" : "Active"}
                  </button>
                )}
                {selectedParty && (
                  <>
                    <button
                      aria-label="Edit party"
                      title="Edit party"
                      onClick={() => {
                        setPartyBeingEdited(selectedParty);
                        setIsModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 font-bold ml-1 cursor-pointer text-xs"
                    >
                      ✎ Edit
                    </button>
                    <button
                      type="button"
                      aria-label="Delete party"
                      title="Delete party"
                      onClick={removeParty}
                      className="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer"
                    >
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              {selectedPartyBalance && (
                <p className="mt-1 flex flex-wrap gap-x-4 text-xs">
                  {selectedPartyBalance.receivable > 0 && (
                    <span className="font-semibold text-emerald-700">
                      To Receive {money(selectedPartyBalance.receivable)}
                    </span>
                  )}
                  {selectedPartyBalance.payable > 0 && (
                    <span className="font-semibold text-rose-700">
                      To Pay {money(selectedPartyBalance.payable)}
                    </span>
                  )}
                  {selectedPartyBalance.receivable === 0 && selectedPartyBalance.payable === 0 && selectedOpeningBalance > 0 && (
                    <span className="text-slate-500">
                      Opening balance {money(selectedOpeningBalance)} {selectedBalanceType === "to-pay" ? "To Pay" : "To Receive"}
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Payment Reminder Action Button */}
              {selectedParty && (appSettings.enablePaymentReminder ?? true) && ((selectedPartyBalance?.receivable || 0) > 0.01) && (
                <button
                  type="button"
                  onClick={() => {
                    setReminderExtraMessage(appSettings.paymentReminderAdditionalMessage || "");
                    setReminderModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-98 transition cursor-pointer"
                  title="Send payment reminder to this party"
                >
                  <FiBell className="h-3.5 w-3.5" /> Send Reminder
                </button>
              )}
            </div>
          </div>

          {/* Party Metadata & Custom Fields Card */}
          {selectedParty && (
            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {selectedParty.phone && (
                  <div><strong className="text-slate-700">Phone:</strong> {selectedParty.phone}</div>
                )}
                {selectedParty.email && (
                  <div><strong className="text-slate-700">Email:</strong> {selectedParty.email}</div>
                )}
                {(appSettings.enableGstin !== false) && selectedParty.gstin && (
                  <div><strong className="text-slate-700">GSTIN:</strong> {selectedParty.gstin}</div>
                )}
                {selectedParty.billingAddress && (
                  <div className="truncate"><strong className="text-slate-700">Billing:</strong> {selectedParty.billingAddress}</div>
                )}
                {(appSettings.enableShippingAddress ?? true) && selectedParty.shippingAddress && (
                  <div className="truncate text-blue-700"><strong className="text-blue-800">Shipping:</strong> {selectedParty.shippingAddress}</div>
                )}
                {(selectedParty.additionalFields || [])
                  .filter((f) => f.value && f.enabled !== false)
                  .map((f) => (
                    <div key={f.id}><strong className="text-slate-700">{f.fieldName || f.name}:</strong> {f.value}</div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-700">Transactions</h2>
            <div className="flex items-center gap-3 text-slate-500">
              {transactionSearchOpen && (
                <input
                  autoFocus
                  value={transactionSearch}
                  onChange={(event) => setTransactionSearch(event.target.value)}
                  placeholder="Search transactions"
                  className="h-9 w-48 rounded-md border border-slate-300 px-3 text-xs text-slate-700 outline-none focus:border-blue-500"
                />
              )}
              <button
                type="button"
                aria-label="Search transactions"
                title="Search transactions"
                onClick={() => { setTransactionSearchOpen((open) => !open); setTransactionSearch(""); }}
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-slate-100 cursor-pointer"
              >
                <FiSearch className="text-lg" />
              </button>
              <button
                type="button"
                aria-label="Print party statement"
                title="Print party statement"
                onClick={() => { setPrintStatementOnOpen(false); setStatementOpen(true); }}
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-slate-100 cursor-pointer"
              >
                <FiPrinter className="text-lg" />
              </button>
              <button
                type="button"
                aria-label="Download Excel transactions"
                title="Download Excel-compatible transactions"
                onClick={downloadExcel}
                className="grid h-9 w-9 place-items-center rounded-md text-emerald-600 hover:bg-emerald-50 cursor-pointer"
              >
                <span className="rounded bg-emerald-600 px-1 py-0.5 text-[10px] font-bold text-white">XLS</span>
              </button>
              <button
                type="button"
                aria-label="Preview or download PDF"
                title="Preview or download PDF"
                onClick={() => { setPrintStatementOnOpen(false); setStatementOpen(true); }}
                className="grid h-9 w-9 place-items-center rounded-md text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                <FiFileText className="text-lg" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[580px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["Type", "Number", "Date", "Total", "Balance/ Unused", "Status", ""].map((label) => (
                    <th key={label} className="border-b border-r border-slate-200 px-3 py-3 font-semibold text-xs">
                      {label}{label && <FiFilter className="float-right mt-0.5 text-slate-400" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedParty && openingBalance > 0 && `${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} opening balance ${selectedParty.asOfDate || ""}`.toLowerCase().includes(transactionSearch.toLowerCase()) && (
                  <tr className="border-b border-slate-100 bg-sky-100 text-slate-800">
                    <td className="px-3 py-3.5 text-xs">{selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} Opening Balance</td>
                    <td className="px-3 py-3.5 text-xs">—</td>
                    <td className="px-3 py-3.5 text-xs">{selectedParty.asOfDate ? new Date(selectedParty.asOfDate).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-medium">₹ {openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-medium">₹ {openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-3.5 text-xs text-rose-500 font-semibold">Unpaid</td>
                    <td className="px-3 py-3.5 text-xs">—</td>
                  </tr>
                )}
                {visiblePartyTransactions.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 text-slate-800 hover:bg-slate-50/50">
                    <td className="px-3 py-3.5 text-xs font-medium">{entry.source}</td>
                    <td className="px-3 py-3.5 text-xs">{entry.number}</td>
                    <td className="px-3 py-3.5 text-xs text-slate-600">{entry.date ? new Date(entry.date).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-semibold">{money(entry.total)}</td>
                    <td className="px-3 py-3.5 text-xs text-right font-semibold">{(entry.source === "Payment-In" || entry.source === "Payment-Out") && !entry.balance ? "—" : money(entry.balance)}</td>
                    <td className={`px-3 py-3.5 text-xs font-semibold ${entry.status === "Paid" || entry.status === "Used" ? "text-emerald-500" : entry.status === "Partially Paid" ? "text-amber-600" : "text-rose-500"}`}>{entry.status}</td>
                    <td className="px-2 py-2 text-center">
                      <TransactionActionMenu
                        transaction={entry}
                        onRefresh={reloadLocalData}
                      />
                    </td>
                  </tr>
                ))}
                {!visiblePartyTransactions.length && (openingBalance <= 0 || !`${selectedBalanceType === "to-pay" ? "Payable" : "Receivable"} opening balance ${selectedParty?.asOfDate || ""}`.toLowerCase().includes(transactionSearch.toLowerCase())) && (
                  <tr>
                    <td colSpan="7" className="h-48 text-center text-xs text-slate-400">
                      {transactionSearch ? "No matching transactions" : "No transactions to show"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {statementOpen && (() => {
        const company = getCompanyProfile();
        const companyName = company.businessName || company.companyName || "Company Name";
        const companyPhone = company.phoneNumber || company.phone || "";
        const { totalAmount, totalReceived, totalBalance, totalReceivable, totalPayable } = statementTotals;

        return (
          <div className="party-statement-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6 backdrop-blur-xs">
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                .party-statement-print, .party-statement-print * { visibility: visible !important; }
                .party-statement-print {
                  position: fixed !important;
                  inset: 0 !important;
                  width: 100% !important;
                  max-height: none !important;
                  overflow: visible !important;
                  border: 0 !important;
                  box-shadow: none !important;
                  background: white !important;
                }
                .party-statement-actions, .party-statement-close { display: none !important; }
              }
            `}</style>
            <section className="party-statement-print flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
              {/* Header */}
              <header className="party-statement-close flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
                <h2 className="text-xl font-bold text-slate-800">Preview</h2>
                <button
                  type="button"
                  aria-label="Close preview"
                  onClick={() => { setStatementOpen(false); setPrintStatementOnOpen(false); }}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </header>

              {/* Main Content */}
              <main className="min-h-0 flex-1 overflow-auto px-6 py-6 text-sm text-black sm:px-12">
                {/* Company Title */}
                <div className="text-center">
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">{companyName}</h3>
                  {companyPhone && (
                    <p className="mt-1 text-xs text-slate-600">Phone no.: {companyPhone}</p>
                  )}
                </div>

                {/* Document Title */}
                <h1 className="mb-8 mt-6 text-center text-2xl sm:text-3xl font-extrabold text-slate-950 underline decoration-2 underline-offset-4">
                  Party statement
                </h1>

                {/* Party Info */}
                <div className="mb-4 space-y-1">
                  <h2 className="text-lg font-bold text-slate-900">
                    Party name: {selectedParty?.partyName || "Cash Sale"}
                  </h2>
                  {selectedParty?.phone && (
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      Contact No.: {selectedParty.phone}
                    </p>
                  )}
                  {selectedParty?.billingAddress && (
                    <p className="text-xs font-medium text-slate-600">
                      Billing Address: {selectedParty.billingAddress}
                    </p>
                  )}
                  {(appSettings.printShippingAddress !== false) && selectedParty?.shippingAddress && (
                    <p className="text-xs font-semibold text-blue-700">
                      Shipping Address: {selectedParty.shippingAddress}
                    </p>
                  )}
                  {(selectedParty?.additionalFields || [])
                    .filter((f) => f.showInPrint && f.value)
                    .map((f) => (
                      <p key={f.id} className="text-xs font-medium text-slate-700">
                        <strong>{f.fieldName || f.name}:</strong> {f.value}
                      </p>
                    ))}
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded border border-neutral-300">
                  <table className="w-full min-w-[850px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-[#cbd5e1] text-slate-900 font-bold border-b border-neutral-300">
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Txn Type</th>
                        <th className="px-3 py-2.5">Ref No.</th>
                        <th className="px-3 py-2.5">Payment Status</th>
                        <th className="px-3 py-2.5 text-right">Total</th>
                        <th className="px-3 py-2.5 text-right">Received / Paid</th>
                        <th className="px-3 py-2.5 text-right">Txn Balance</th>
                        <th className="px-3 py-2.5 text-right">Receivable Balance</th>
                        <th className="px-3 py-2.5 text-right">Payable Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {statementRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-500 font-medium">
                            No transactions to show
                          </td>
                        </tr>
                      ) : (
                        statementRows.map((row, idx) => (
                          <tr key={row.id || idx} className="hover:bg-slate-50 text-slate-800">
                            <td className="px-3 py-2.5 font-medium">{formatDateDMY(row.date)}</td>
                            <td className="px-3 py-2.5">{row.source}</td>
                            <td className="px-3 py-2.5">{row.number}</td>
                            <td className="px-3 py-2.5">
                              <span className={row.status === "Paid" ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
                                {row.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium">{money(row.total)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600">{money(row.received)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700">{money(row.balance)}</td>
                            <td className="px-3 py-2.5 text-right font-medium text-emerald-600">
                              {row.receivableBalance > 0 ? money(row.receivableBalance) : "-"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-rose-600">
                              {row.payableBalance > 0 ? money(row.payableBalance) : "-"}
                            </td>
                          </tr>
                        ))
                      )}

                      {/* Total Row */}
                      {statementRows.length > 0 && (
                        <tr className="bg-[#cbd5e1] font-bold text-slate-900 border-t-2 border-neutral-400">
                          <td className="px-3 py-2.5 font-bold" colSpan={4}>Total</td>
                          <td className="px-3 py-2.5 text-right font-bold">{money(totalAmount)}</td>
                          <td className="px-3 py-2.5 text-right font-bold">{money(totalReceived)}</td>
                          <td className="px-3 py-2.5 text-right font-bold">{money(totalBalance)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{money(totalReceivable)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-rose-700">{money(totalPayable)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </main>

              {/* Actions Footer */}
              <footer className="party-statement-actions flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={() => openStatementDocument(false)}
                  className="rounded-full border border-rose-500 px-5 py-2 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 transition"
                >
                  Open PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-full border border-rose-500 px-5 py-2 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 transition"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={handleSaveStatementPdf}
                  className="rounded-full border border-rose-500 px-5 py-2 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const partyEmail = selectedParty?.email || "";
                    const partyName = selectedParty?.partyName || "Party";
                    const company = getCompanyProfile();
                    const cName = company.businessName || company.companyName || "Company";
                    setEmailInput(partyEmail);
                    setEmailSubject(`[${cName}] Party Statement - ${partyName}`);
                    setGmailGuidanceOpen(false);
                    setEmailModalOpen(true);
                  }}
                  className="rounded-full border border-rose-500 px-5 py-2 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  Email PDF
                </button>
                <button
                  type="button"
                  onClick={() => { setStatementOpen(false); setPrintStatementOnOpen(false); }}
                  className="rounded-full bg-rose-600 px-7 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-rose-700 transition"
                >
                  Close
                </button>
              </footer>
            </section>
          </div>
        );
      })()}

      {/* Send Party Statement via Email Modal */}
      {emailModalOpen && (() => {
        const company = getCompanyProfile();
        const senderEmail = company.email || company.emailId || "";
        const partyName = selectedParty?.partyName || "Party";
        const pdfFileName = `${(partyName || "Party").replace(/[^a-z0-9-_]+/gi, "_")}_Statement.pdf`;

        return (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/10">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <FiMail className="text-rose-600 h-5 w-5" /> Send Party Statement via Email
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEmailModalOpen(false);
                    setGmailGuidanceOpen(false);
                  }}
                  className="text-slate-400 hover:text-slate-600 rounded-lg p-1 cursor-pointer"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              {gmailGuidanceOpen ? (
                <div className="py-3 space-y-4">
                  <div className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-xs">
                      <FiCheckCircle className="h-7 w-7" />
                    </div>
                    <h4 className="mt-2.5 text-base font-bold text-slate-900 tracking-tight">
                      Gmail Compose Opened!
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Your party statement file has been downloaded to your computer:
                    </p>
                    <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-900 shadow-2xs">
                      <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                        PDF
                      </span>
                      <span>{pdfFileName}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border-2 border-amber-400 bg-amber-50/95 p-4 text-xs text-amber-950 space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-amber-950 text-sm">
                      <span className="text-lg">📎</span>
                      <span>Action Required: Attach Downloaded File in Gmail</span>
                    </div>
                    <p className="text-xs text-amber-900 font-medium leading-relaxed">
                      When you send the email, <strong>please attach the downloaded file ({pdfFileName})</strong> which has just been downloaded to your computer:
                    </p>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-white p-2.5 shadow-2xs">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                          1
                        </span>
                        <span className="text-slate-800">
                          In your open Gmail tab, click the <strong>📎 Paperclip (Attach files) icon</strong> at the bottom of the compose window.
                        </span>
                      </div>
                      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-white p-2.5 shadow-2xs">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                          2
                        </span>
                        <span className="text-slate-800">
                          Select <strong>{pdfFileName}</strong> from your <strong>Downloads</strong> folder (or simply drag the file from your browser&apos;s download tray directly into Gmail).
                        </span>
                      </div>
                      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-white p-2.5 shadow-2xs">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                          3
                        </span>
                        <span className="text-slate-800">
                          Once attached, click <strong>Send</strong> in Gmail.
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (lastGmailUrl) window.open(lastGmailUrl, "_blank");
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                    >
                      <FiExternalLink className="h-3.5 w-3.5 text-rose-600" /> Re-open Gmail Tab
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveStatementPdf}
                      className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                    >
                      <FiDownload className="h-3.5 w-3.5" /> Re-download PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGmailGuidanceOpen(false);
                        setEmailModalOpen(false);
                        setEmailInput("");
                      }}
                      className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer shadow-sm"
                    >
                      Got it, Close
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-4 space-y-4">
                  {!senderEmail ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                      <div className="flex items-start gap-3">
                        <FiAlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-bold text-amber-900">
                            Sender Email Missing in Profile
                          </h4>
                          <p className="mt-1 text-xs text-amber-700 leading-relaxed">
                            Please add your business email address in the{" "}
                            <strong>Company Profile</strong> first before sending
                            emails. Once your email is saved in your profile, you
                            can easily send party statements to any recipient.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setEmailModalOpen(false);
                              setStatementOpen(false);
                              navigate("/company-profile");
                            }}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 cursor-pointer"
                          >
                            Go to Company Profile to Add Email →
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600">
                          Sender (From Company Profile)
                        </label>
                        <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
                          <span className="font-semibold text-slate-900 truncate">
                            {senderEmail}
                          </span>
                          <span className="shrink-0 flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            <FiCheck className="h-3 w-3" /> Profile Email
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600">
                          Recipient Email Address <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="email"
                          autoFocus
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="recipient@example.com"
                          className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-600"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSendViaGmail();
                          }}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600">
                          Subject
                        </label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          className="mt-1.5 h-9 w-full rounded-md border border-slate-300 px-3 text-xs outline-none focus:border-rose-600"
                        />
                      </div>

                      <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-600 text-white font-black text-xs tracking-wider shadow-xs">
                              PDF
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-slate-900 truncate max-w-[200px] sm:max-w-xs">
                                  {pdfFileName}
                                </p>
                                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                                  PDF Document
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                {statementRows.length} transactions • Total {money(statementTotals.totalAmount)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isSendingEmail}
                              onClick={handleOpenStatementPdf}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-xs cursor-pointer"
                              title="Preview PDF file in browser"
                            >
                              <FiExternalLink className="h-3 w-3" /> Preview
                            </button>
                            <button
                              type="button"
                              disabled={isSendingEmail}
                              onClick={handleSaveStatementPdf}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-xs cursor-pointer"
                              title="Download PDF to computer"
                            >
                              <FiDownload className="h-3 w-3" /> Download
                            </button>
                          </div>
                        </div>

                        <div className="rounded-md bg-amber-50/90 border border-amber-200 p-2.5 text-[11px] text-amber-950 leading-relaxed space-y-1">
                          <p className="font-bold flex items-center gap-1.5 text-amber-900">
                            <span>ℹ️ How PDF attachment works:</span>
                          </p>
                          <p>
                            • <strong>Auto-Attach via Email App:</strong> Automatically attaches <strong>{pdfFileName}</strong> directly into your draft in Windows Mail / Outlook.
                          </p>
                          <p>
                            • <strong>Gmail Web:</strong> <strong>{pdfFileName}</strong> is downloaded to your PC — simply drag the downloaded file into Gmail compose window or click 📎.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {!gmailGuidanceOpen && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    disabled={isSendingEmail}
                    onClick={() => {
                      setEmailModalOpen(false);
                      setEmailInput("");
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>

                  {senderEmail && (
                    <>
                      <button
                        type="button"
                        disabled={isSendingEmail}
                        onClick={handleSendViaEmailApp}
                        className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        title="Automatically attach PDF and compose in Mail App (Outlook / Windows Mail)"
                      >
                        {isSendingEmail ? (
                          <FiLoader className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FiShare2 className="h-3.5 w-3.5" />
                        )}
                        <span>⚡ Auto-Attach in Email App</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSendingEmail}
                        onClick={handleSendViaGmail}
                        className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        title="Download PDF and compose email in Gmail Web"
                      >
                        {isSendingEmail ? (
                          <FiLoader className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FiSend className="h-3.5 w-3.5" />
                        )}
                        <span>Send via Gmail</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {isModalOpen && (
        <AddPartyModal
          initialParty={partyBeingEdited}
          parties={parties}
          onClose={() => {
            setIsModalOpen(false);
            setPartyBeingEdited(null);
          }}
          onSave={saveParty}
          appSettings={appSettings}
        />
      )}
      <ImportPartiesModal
        isOpen={importPartiesOpen}
        onClose={() => setImportPartiesOpen(false)}
        onImportParties={handleImportParties}
        existingParties={parties}
      />
      {importNotice && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xl transition animate-in fade-in slide-in-from-bottom duration-200">
          <FiCheck className="h-4 w-4" />
          {importNotice}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: Send Payment Reminder (Screenshot 2) */}
      {/* ============================================================ */}
      {reminderModalOpen && selectedParty && (() => {
        const company = getCompanyProfile();
        const companyName = company.businessName || company.companyName || "My Business";
        const amount = selectedPartyBalance?.receivable > 0
          ? selectedPartyBalance.receivable
          : (selectedBalanceType === "to-receive" ? selectedOpeningBalance : 0);
        const formattedAmount = money(amount);
        const fullText = `Dear, ${selectedParty.partyName}\nYour payment of ${formattedAmount} is pending with ${companyName}\n${reminderExtraMessage ? reminderExtraMessage + "\n" : ""}If you have already made the payment, kindly ignore this message.`;

        const handleSendWhatsApp = () => {
          const rawPhone = (selectedParty.phone || "").replace(/[^0-9]/g, "");
          if (!rawPhone) {
            toast.error("This party has no phone number entered.");
            return;
          }
          const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
          const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullText)}`;
          window.open(url, "_blank");
        };

        const handleCopyMessage = async () => {
          try {
            await navigator.clipboard.writeText(fullText);
            setReminderNotice("Reminder message copied to clipboard!");
            setTimeout(() => setReminderNotice(""), 3000);
          } catch {
            setReminderNotice("Could not copy message automatically.");
          }
        };

        const handleEmailReminder = () => {
          const email = selectedParty.email || "";
          const subject = encodeURIComponent(`Payment Reminder - ${companyName}`);
          const body = encodeURIComponent(fullText);
          window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setReminderModalOpen(false);
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
                  onClick={() => setReminderModalOpen(false)}
                  className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition cursor-pointer"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 space-y-3.5">
                <div className="space-y-1 text-sm text-slate-800 font-medium">
                  <p>Dear, <span className="font-bold text-blue-600">{selectedParty.partyName}</span></p>
                  <p>Your payment of <span className="font-bold text-emerald-600">{formattedAmount}</span> is pending with <span className="font-bold text-slate-900">{companyName}</span></p>
                </div>

                <textarea
                  rows={4}
                  value={reminderExtraMessage}
                  onChange={(e) => setReminderExtraMessage(e.target.value)}
                  placeholder="Type additional message"
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                />

                <p className="text-xs text-slate-500">
                  If you have already made the payment, kindly ignore this message.
                </p>

                {reminderNotice && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    <FiCheck className="h-4 w-4" />
                    {reminderNotice}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setReminderModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-98 transition cursor-pointer"
                >
                  <FiCopy className="h-3.5 w-3.5" /> COPY
                </button>
                {selectedParty.email && (
                  <button
                    type="button"
                    onClick={handleEmailReminder}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-98 transition cursor-pointer"
                  >
                    <FiMail className="h-3.5 w-3.5" /> EMAIL
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-98 transition cursor-pointer"
                >
                  <FiMessageSquare className="h-3.5 w-3.5" /> SEND VIA WHATSAPP
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {deletePartyConfirm && (
        <ConfirmModal
          isOpen={Boolean(deletePartyConfirm)}
          title={deletePartyConfirm.willDeactivate ? "Deactivate Party" : "Delete Party"}
          message={
            deletePartyConfirm.willDeactivate
              ? `Party "${deletePartyConfirm.partyName}" has ${deletePartyConfirm.hasOutstanding ? "an outstanding balance" : "historical transaction records"} and will be marked Inactive instead of being permanently deleted. Historical records will be preserved.`
              : `Are you sure you want to permanently delete party "${deletePartyConfirm.partyName}"? Only parties with no linked records and zero balance are permanently deleted.`
          }
          confirmText={deletePartyConfirm.willDeactivate ? "Deactivate Party" : "Delete Party"}
          cancelText="Cancel"
          danger={true}
          onConfirm={async () => {
            try {
              const res = await deleteBusinessParty(deletePartyConfirm.id);
              if (res?.action === "deactivated") {
                setParties((current) =>
                  current.map((party) =>
                    String(party.id) === String(deletePartyConfirm.id)
                      ? { ...party, isActive: false, status: "inactive" }
                      : party
                  )
                );
                toast.success(res.message || `Party "${deletePartyConfirm.partyName}" has been deactivated.`);
              } else {
                setParties((current) => current.filter((party) => String(party.id) !== String(deletePartyConfirm.id)));
                setSelectedPartyId("cash-sale");
                toast.success(res?.message || `Party "${deletePartyConfirm.partyName}" deleted.`);
              }
              setLoadError("");
            } catch (err) {
              const msg = err.message || "Failed to delete party.";
              setLoadError(msg);
              toast.error(msg);
            } finally {
              setDeletePartyConfirm(null);
            }
          }}
          onCancel={() => setDeletePartyConfirm(null)}
        />
      )}
    </div>
  );
}

export default PartyDetails;
