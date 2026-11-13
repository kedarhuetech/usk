import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { FiClock, FiMoreVertical, FiX } from "react-icons/fi";
import { deleteSaleInvoice, saveSaleInvoice } from "../../services/salesStorage.js";
import { savePurchaseBill } from "../../services/purchaseBillsStorage.js";
import {
  buildUnifiedDocumentHtml,
  openPrintWindow,
} from "../../services/unifiedPrintService.js";
import {
  getAuditTrailLogs,
  recordAuditTrail,
} from "../../services/auditTrailStorage.js";
import { notifyBusinessDataChanged } from "../../services/businessDataChanged.js";

/**
 * Builds printable unified document HTML for any transaction type.
 */
function getTransactionDocument(transaction) {
  const raw = transaction.raw || {};
  const source = transaction.source || "Transaction";
  const num = transaction.number || raw.invoiceNumber || raw.number || "—";
  const date = transaction.date ? new Date(transaction.date).toLocaleDateString("en-IN") : "";
  const total = Number(transaction.total || raw.totalAmount || raw.finalTotal || raw.amount || 0);
  const partyName =
    raw.customer ||
    raw.partyName ||
    raw.party ||
    raw.form?.customer ||
    transaction.partyName ||
    "Party";

  let rows = [];
  if (Array.isArray(raw.rows) && raw.rows.length > 0) {
    rows = raw.rows.map((r, i) => ({
      index: i + 1,
      item: r.item || r.name || r.itemName || "Item",
      description: r.description || "",
      qty: r.qty || r.quantity || 1,
      unit: r.unit || "PCS",
      price: Number(r.price || r.rate || 0),
      tax: Number(r.taxRate || r.tax || 0),
      amount: Number(r.amount || (Number(r.qty || 1) * Number(r.price || 0))),
    }));
  } else if (Array.isArray(raw.payments) && raw.payments.length > 0) {
    rows = raw.payments.map((p, i) => ({
      index: i + 1,
      item: p.type || "Payment",
      description: p.reference ? `Ref: ${p.reference}` : "Payment Entry",
      qty: 1,
      price: Number(p.amount || total),
      amount: Number(p.amount || total),
    }));
  } else {
    rows = [
      {
        index: 1,
        item: `${source} - Ref: ${num}`,
        description: raw.description || `Transaction for ${partyName}`,
        qty: 1,
        price: total,
        amount: total,
      },
    ];
  }

  let title = "Transaction Document";
  if (source.includes("Sale")) title = "Sale Invoice";
  else if (source.includes("Purchase")) title = "Purchase Bill";
  else if (source.includes("Payment-In")) title = "Payment-In Receipt";
  else if (source.includes("Payment-Out")) title = "Payment-Out Voucher";
  else if (source.includes("Estimate")) title = "Estimate / Quotation";
  else if (source.includes("Proforma")) title = "Proforma Invoice";
  else if (source.includes("Credit Note")) title = "Credit Note";
  else if (source.includes("Debit Note")) title = "Debit Note";

  return buildUnifiedDocumentHtml({
    title,
    documentNumber: num,
    date,
    partyName,
    partyPhone: raw.customerPhone || raw.phone || "",
    partyBillingAddress: raw.billingAddress || raw.address || "",
    partyGstin: raw.gstin || "",
    status: transaction.status || "Recorded",
    rows,
    totals: {
      subtotal: total,
      total,
      received: Number(transaction.received ?? total),
      balance: Number(transaction.balance ?? 0),
    },
    notes: raw.notes || raw.description || "",
  });
}

/**
 * Shared, robust Three-Dot Transaction Action Menu.
 * Reusable across Party Details, Sales, Purchases, Reports, etc.
 */
export default function TransactionActionMenu({
  transaction,
  onRefresh,
  customActions = null,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [historyOpen, setHistoryOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  // Default actions list strictly matching reference screenshot (Image 2)
  const defaultActions = [
    "View/Edit",
    "Delete",
    "Duplicate",
    "Open PDF",
    "Preview",
    "Print",
    "View History",
  ];

  const actions = customActions || defaultActions;

  // Toggle open and calculate position
  const handleToggle = (e) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuHeight = actions.length * 36 + 16;
      let top = rect.bottom + 4;
      if (top + menuHeight > window.innerHeight) {
        top = Math.max(8, rect.top - menuHeight - 4);
      }
      const right = Math.max(8, window.innerWidth - rect.right);
      setMenuPos({ top, right });
    }
    setIsOpen(true);
  };

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen]);

  // Execute Action
  const handleActionClick = (action, e) => {
    e.stopPropagation();
    setIsOpen(false);

    const raw = transaction.raw || {};
    const source = transaction.source || "Transaction";
    const num = transaction.number || "—";
    const rawId = raw.id || transaction.id?.replace(/^[a-z\-]+:/i, "");

    // 1. View / Edit
    if (action === "View/Edit") {
      if (source === "Sale Order") {
        navigate("/sales/sale-order", {
          state: { from: location.pathname, editOrder: raw },
        });
      } else if (source === "Purchase Order") {
        navigate("/purchase-expense/purchase-order", {
          state: { from: location.pathname, editOrder: raw },
        });
      } else if (source === "Sale") {
        navigate("/sales/sale-invoices/new", {
          state: { from: location.pathname, editInvoice: raw },
        });
      } else if (source === "Purchase") {
        navigate("/purchase-expense/purchase-bills/new", {
          state: { from: location.pathname, editPurchase: raw, editBill: raw, editInvoice: raw },
        });
      } else if (source === "Payment-In") {
        navigate("/sales/payment-in", {
          state: { from: location.pathname, editPayment: raw },
        });
      } else if (source === "Payment-Out" || source === "Credit Note Refund") {
        navigate("/purchase-expense/payment-out", {
          state: { from: location.pathname, editPayment: raw },
        });
      } else if (source.includes("Estimate")) {
        navigate("/sales/estimate-quotation", {
          state: { from: location.pathname, editEstimate: raw, editInvoice: raw },
        });
      } else if (source.includes("Proforma")) {
        navigate("/sales/proforma-invoice", {
          state: { from: location.pathname, editProforma: raw, editInvoice: raw },
        });
      } else if (source === "Credit Note") {
        navigate("/sales/sale-return-credit-note", {
          state: { from: location.pathname, editReturn: raw, editCreditNote: raw },
        });
      } else if (source === "Debit Note") {
        navigate("/purchase-expense/purchase-return-debit-note", {
          state: { from: location.pathname, editReturn: raw, editDebitNote: raw },
        });
      } else {
        navigate("/sales/sale-invoices/new", {
          state: { from: location.pathname, editInvoice: raw },
        });
      }
      return;
    }

    // 2. Delete with Safeguards
    if (action === "Delete") {
      const isPaid = Number(transaction.received || 0) > 0;
      const warning = isPaid
        ? `Delete ${source} #${num}? This transaction has ₹${transaction.received} settled. Are you sure you want to proceed?`
        : `Are you sure you want to delete ${source} #${num}?`;

      if (!window.confirm(warning)) return;

      const filterStorage = (key) => {
        try {
          const items = JSON.parse(window.localStorage.getItem(key) || "[]");
          if (Array.isArray(items)) {
            const next = items.filter(
              (it) => String(it.id) !== String(rawId) && String(it.invoiceId) !== String(rawId)
            );
            window.localStorage.setItem(key, JSON.stringify(next));
          }
        } catch {}
      };

      if (source === "Sale Order") {
        filterStorage("ledgerly:saleOrders.v1");
      } else if (source === "Purchase Order") {
        filterStorage("ledgerly:purchaseOrders.v1");
      } else if (source === "Sale") {
        deleteSaleInvoice(rawId);
        filterStorage("ledgerly:sales.v1");
      } else if (source === "Purchase") {
        filterStorage("ledgerly:purchaseBills.v1");
        filterStorage("ledgerly:purchases.v1");
      } else if (source === "Payment-In") {
        filterStorage("ledgerly:paymentIns.v1");
      } else if (source === "Payment-Out" || source === "Credit Note Refund") {
        filterStorage("ledgerly:paymentOuts.v1");
      } else if (source.includes("Estimate")) {
        filterStorage("ledgerly:estimateQuotations.v1");
      } else if (source.includes("Proforma")) {
        filterStorage("ledgerly:proformaInvoices.v1");
      } else if (source === "Credit Note") {
        filterStorage("ledgerly:saleReturns.v1");
      } else if (source === "Debit Note") {
        filterStorage("ledgerly:purchaseReturns.v1");
      }

      recordAuditTrail({
        action: "Transaction Deleted",
        entity: source,
        details: `${source} #${num} deleted`,
        user: "Current User",
      });

      notifyBusinessDataChanged();
      if (onRefresh) onRefresh();
      return;
    }

    // 3. Duplicate
    if (action === "Duplicate") {
      const now = new Date().toISOString();
      const copyId = `${source.toLowerCase().replace(/[^a-z0-9]/g, "-")}-copy-${Date.now()}`;
      const copyNum = `${num}-COPY`;

      const appendStorage = (key) => {
        try {
          const items = JSON.parse(window.localStorage.getItem(key) || "[]");
          if (Array.isArray(items)) {
            const clone = {
              ...raw,
              id: copyId,
              invoiceId: copyId,
              number: copyNum,
              refNo: copyNum,
              returnNo: copyNum,
              form: raw.form ? { ...raw.form, invoiceNumber: copyNum } : undefined,
              invoiceNumber: copyNum,
              date: now.slice(0, 10),
              createdAt: now,
              updatedAt: now,
            };
            items.unshift(clone);
            window.localStorage.setItem(key, JSON.stringify(items));
          }
        } catch {}
      };

      if (source === "Sale Order") {
        filterStorage("ledgerly:saleOrders.v1");
      } else if (source === "Purchase Order") {
        filterStorage("ledgerly:purchaseOrders.v1");
      } else if (source === "Sale") {
        const copy = {
          ...raw,
          id: copyId,
          invoiceNumber: copyNum,
          form: raw.form ? { ...raw.form, invoiceNumber: copyNum } : undefined,
          createdAt: now,
        };
        saveSaleInvoice(copy);
      } else if (source === "Purchase") {
        const copy = {
          ...raw,
          id: copyId,
          invoiceId: copyId,
          invoiceNumber: copyNum,
          form: raw.form ? { ...raw.form, invoiceNumber: copyNum } : undefined,
          createdAt: now,
        };
        savePurchaseBill(copy);
      } else if (source === "Payment-In") {
        appendStorage("ledgerly:paymentIns.v1");
      } else if (source === "Payment-Out" || source === "Credit Note Refund") {
        appendStorage("ledgerly:paymentOuts.v1");
      } else if (source.includes("Estimate")) {
        appendStorage("ledgerly:estimateQuotations.v1");
      } else if (source.includes("Proforma")) {
        appendStorage("ledgerly:proformaInvoices.v1");
      } else if (source === "Credit Note") {
        appendStorage("ledgerly:saleReturns.v1");
      } else if (source === "Debit Note") {
        appendStorage("ledgerly:purchaseReturns.v1");
      }

      recordAuditTrail({
        action: "Transaction Duplicated",
        entity: source,
        details: `${source} #${num} duplicated as #${copyNum}`,
        user: "Current User",
      });

      notifyBusinessDataChanged();
      if (onRefresh) onRefresh();
      return;
    }

    // 4. Open PDF & Preview
    if (action === "Open PDF" || action === "Preview") {
      if (source === "Sale Order") {
        filterStorage("ledgerly:saleOrders.v1");
      } else if (source === "Purchase Order") {
        filterStorage("ledgerly:purchaseOrders.v1");
      } else if (source === "Sale") {
        navigate("/sales/sale-invoices/preview", {
          state: { invoice: raw, printAfterOpen: false },
        });
      } else {
        const docHtml = getTransactionDocument(transaction);
        openPrintWindow(docHtml, false);
      }
      return;
    }

    // 5. Print
    if (action === "Print") {
      if (source === "Sale Order") {
        filterStorage("ledgerly:saleOrders.v1");
      } else if (source === "Purchase Order") {
        filterStorage("ledgerly:purchaseOrders.v1");
      } else if (source === "Sale") {
        navigate("/sales/sale-invoices/preview", {
          state: { invoice: raw, printAfterOpen: true },
        });
      } else {
        const docHtml = getTransactionDocument(transaction);
        openPrintWindow(docHtml, true);
      }
      return;
    }

    // 6. View History
    if (action === "View History") {
      setHistoryOpen(true);
      return;
    }
  };

  // Get matching audit trail logs
  const matchingLogs = (getAuditTrailLogs() || []).filter(
    (log) =>
      (log.details && (log.details.includes(transaction.number) || log.details.includes(transaction.id))) ||
      (log.entity === transaction.source && log.details && log.details.includes(transaction.number))
  );

  return (
    <>
      <div className="relative inline-block text-left">
        <button
          ref={buttonRef}
          type="button"
          onClick={handleToggle}
          aria-label={`Actions for ${transaction.source} ${transaction.number}`}
          title="More actions"
          className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
        >
          <FiMoreVertical className="h-4 w-4" />
        </button>

        {isOpen &&
          createPortal(
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: `${menuPos.top}px`,
                right: `${menuPos.right}px`,
                zIndex: 9999,
              }}
              className="w-40 rounded-lg border border-slate-200 bg-white py-1.5 shadow-xl transition-all select-none"
            >
              {actions.map((act) => (
                <button
                  key={act}
                  type="button"
                  onClick={(e) => handleActionClick(act, e)}
                  className="block w-full px-4 py-2 text-left text-xs font-normal text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  {act}
                </button>
              ))}
            </div>,
            document.body
          )}
      </div>

      {/* ── View History Modal ── */}
      {historyOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50">
              <div className="flex items-center gap-2">
                <FiClock className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-800">
                  Transaction History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Summary Card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Transaction:</span>
                  <span className="font-semibold text-slate-800">
                    {transaction.source} #{transaction.number}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span className="font-medium text-slate-700">
                    {transaction.date ? new Date(transaction.date).toLocaleDateString("en-GB") : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount:</span>
                  <span className="font-bold text-slate-900">
                    ₹ {Number(transaction.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Status:</span>
                  <span
                    className={`font-semibold ${
                      transaction.status === "Paid" || transaction.status === "Used"
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }`}
                  >
                    {transaction.status || "Recorded"}
                  </span>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                  Audit Events
                </h4>
                {matchingLogs.length > 0 ? (
                  <div className="space-y-2">
                    {matchingLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded border border-slate-100 bg-white p-2.5 shadow-2xs"
                      >
                        <div className="flex justify-between text-slate-700 font-semibold">
                          <span>{log.action}</span>
                          <span className="text-[10px] font-normal text-slate-400">
                            {new Date(log.timestamp).toLocaleString("en-GB")}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-500">{log.details}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-slate-200 p-3 text-center text-slate-400">
                    <p>Initial record created on {transaction.date ? new Date(transaction.date).toLocaleDateString("en-GB") : "recorded date"}.</p>
                    <p className="mt-1 text-[11px] text-slate-400">No subsequent modifications logged.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-2.5">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
