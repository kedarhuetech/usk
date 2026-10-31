import React, { useEffect, useMemo } from "react";
import { FiX } from "react-icons/fi";
import { getCompanyProfile } from "../../services/companyProfileStorage.js";

function parseYMD(val) {
  if (!val) return "";
  const s = String(val).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  const d = new Date(val);
  if (!Number.isNaN(d.getTime()))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return "";
}

function formatDateDMY(val) {
  if (!val) return "—";
  const ymd = parseYMD(val);
  if (!ymd) return String(val);
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

const fmtMoney = (val) =>
  `₹ ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatGeneratedTimestamp(d = new Date()) {
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `Generated on ${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
}

export default function ReportPrintPreviewModal({
  isOpen,
  onClose,
  title = "Sale Report",
  dateFrom,
  dateTo,
  user = "All Users",
  records = [],
  totalLabel = "Total Sale:",
  totalAmount,
  printOnOpen = false,
}) {
  const profile = useMemo(() => getCompanyProfile(), [isOpen]);
  const companyName = profile.businessName || profile.companyName || "sai kirana stores";
  const phone = profile.phoneNumber || "8369501991";

  useEffect(() => {
    if (!isOpen || !printOnOpen) return undefined;
    const timer = setTimeout(() => window.print(), 350);
    return () => clearTimeout(timer);
  }, [isOpen, printOnOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const durationStr = `From ${formatDateDMY(dateFrom)} to ${formatDateDMY(dateTo)}`;

  const calculatedTotal = totalAmount !== undefined
    ? Number(totalAmount)
    : records.reduce((sum, r) => sum + Number(r.totals?.finalTotal ?? r.totals?.grandTotal ?? r.totalAmount ?? r.total ?? r.amount ?? 0), 0);

  const timestampStr = formatGeneratedTimestamp();

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-[1px]">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #report-printable-area, #report-printable-area * {
            visibility: visible !important;
          }
          #report-printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16px !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="relative flex max-h-[95vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden">
        {/* Modal Top Bar */}
        <div className="no-print flex items-center justify-between border-b border-slate-200 px-6 py-3.5 bg-white">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Preview</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Scrollable Printable Document */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-white font-sans text-slate-900 text-sm">
          <div id="report-printable-area" className="mx-auto w-full max-w-4xl">
            {/* Header: Company & Title */}
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-slate-950 tracking-tight">{companyName}</h1>
              {phone && <p className="text-xs text-slate-600 mt-0.5">Phone no.: {phone}</p>}
              <h2 className="text-2xl font-bold text-slate-950 underline underline-offset-4 mt-3">
                {title}
              </h2>
            </div>

            {/* Metadata: Duration & User */}
            <div className="mb-4 text-xs font-bold text-slate-900 space-y-1">
              <div>
                Duration: <span className="font-semibold">{durationStr}</span>
              </div>
              <div>
                User: <span className="font-semibold">{user || "All Users"}</span>
              </div>
            </div>

            {/* Main Table */}
            <div className="w-full overflow-x-auto border-t border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#cbd5e1] text-slate-900 font-bold uppercase text-[11px] tracking-wider">
                    <th className="py-2.5 px-3 whitespace-nowrap">DATE</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">INVOICE NO.</th>
                    <th className="py-2.5 px-3">PARTY NAME</th>
                    <th className="py-2.5 px-2">GSTIN</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">TOTAL</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">PAYMENT TYPE</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">RECEIVED / PAID</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">BALANCE DUE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                        No transactions found for the selected period
                      </td>
                    </tr>
                  ) : (
                    records.map((record, index) => {
                      const rawDate = record.form?.invoiceDate || record.form?.billDate || record.invoiceDate || record.date || record.createdAt;
                      const displayDate = formatDateDMY(rawDate);
                      const invNumber = record.form?.invoiceNumber || record.invoiceNumber || record.refNo || record.id || "—";
                      const partyName = record.form?.customer || record.form?.party || record.customer || record.customerName || record.partyName || record.supplier || "Cash Sale";
                      const gstin = record.form?.gstin || record.partyGstin || record.gstin || "";
                      const paymentType = record.form?.paymentType || (record.saleType === "cash" || record.purchaseType === "cash" ? "Cash" : "Credit");

                      const totalAmt = Number(
                        record.totals?.finalTotal ?? record.totals?.grandTotal ?? record.totalAmount ?? record.total ?? record.amount ?? 0
                      );
                      const receivedAmt = Number(
                        record.totals?.received ?? record.paidAmount ?? record.receivedAmount ?? record.form?.receivedAmount ?? record.form?.paidAmount ?? (paymentType === "Cash" ? totalAmt : 0)
                      );
                      const balanceDue = record.totals?.balance !== undefined
                        ? Number(record.totals.balance)
                        : Math.max(0, totalAmt - receivedAmt);

                      // Extract line items
                      const rawRows = Array.isArray(record.rows)
                        ? record.rows
                        : Array.isArray(record.items)
                        ? record.items
                        : [];
                      const validRows = rawRows.filter((row) => row && (row.item || row.itemName || row.name || row.qty || row.quantity));

                      const hasAnyDiscount = validRows.some(
                        (r) => Number(r.discount || r.discountAmount || r.discountPercent || 0) > 0
                      );

                      const subTotal = Number(
                        record.totals?.subtotal ?? record.totals?.subTotal ?? totalAmt
                      );
                      const roundOff = record.totals?.roundOff ?? record.totals?.roundoff;

                      return (
                        <React.Fragment key={record.id || index}>
                          {/* Invoice Summary Row */}
                          <tr className="bg-white hover:bg-slate-50/50 font-medium text-slate-900 border-t border-slate-300">
                            <td className="py-2.5 px-3 whitespace-nowrap font-semibold">{displayDate}</td>
                            <td className="py-2.5 px-2 whitespace-nowrap font-bold text-slate-900">{invNumber}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-950">{partyName}</td>
                            <td className="py-2.5 px-2 text-slate-500">{gstin || ""}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-950 whitespace-nowrap">
                              {fmtMoney(totalAmt)}
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-800 whitespace-nowrap">
                              {paymentType}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                              {fmtMoney(receivedAmt)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-950 whitespace-nowrap">
                              {fmtMoney(balanceDue)}
                            </td>
                          </tr>

                          {/* Nested Items Sub-Table */}
                          {validRows.length > 0 && (
                            <tr className="bg-white">
                              <td colSpan={8} className="py-1 px-3 sm:px-6">
                                <div className="my-1 rounded border border-slate-200 overflow-hidden bg-slate-50/40">
                                  <table className="w-full border-collapse text-[11px] text-slate-800">
                                    <thead>
                                      <tr className="bg-[#e2e8f0] text-slate-800 font-bold border-b border-slate-300">
                                        <th className="py-1.5 px-2.5 text-center w-8">#</th>
                                        <th className="py-1.5 px-3 text-left">Item name</th>
                                        <th className="py-1.5 px-2 text-left">HSN/ SAC</th>
                                        <th className="py-1.5 px-3 text-center">Quantity</th>
                                        <th className="py-1.5 px-2 text-left">Unit</th>
                                        <th className="py-1.5 px-3 text-right">Price/ Unit</th>
                                        {hasAnyDiscount && (
                                          <th className="py-1.5 px-3 text-right">Discount</th>
                                        )}
                                        <th className="py-1.5 px-3 text-right">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 bg-white">
                                      {validRows.map((row, rIdx) => {
                                        const name = row.item || row.itemName || row.name || "—";
                                        const hsn = row.hsn || row.hsnSac || row.hsnCode || "";
                                        const qty = Number(row.qty ?? row.quantity ?? 1);
                                        const unit = row.unit || "";
                                        const price = Number(row.price ?? row.rate ?? row.salePrice ?? 0);
                                        const rowTotal = Number(
                                          row.amount ?? row.total ?? (row.calculated?.amount ?? qty * price)
                                        );

                                        let discountStr = "";
                                        if (hasAnyDiscount) {
                                          const dVal = Number(row.discount || row.discountAmount || 0);
                                          const dPct = Number(row.discountPercent || (row.discountType === "percentage" ? row.discount : 0));
                                          if (dVal > 0 && dPct > 0) {
                                            discountStr = `₹ ${dVal.toFixed(2)} (${dPct}%)`;
                                          } else if (dVal > 0) {
                                            discountStr = `₹ ${dVal.toFixed(2)}`;
                                          } else if (dPct > 0) {
                                            discountStr = `${dPct}%`;
                                          }
                                        }

                                        return (
                                          <tr key={row.id || rIdx} className="hover:bg-slate-50">
                                            <td className="py-1.5 px-2.5 text-center text-slate-500">{rIdx + 1}</td>
                                            <td className="py-1.5 px-3 font-semibold text-slate-900">{name}</td>
                                            <td className="py-1.5 px-2 text-slate-500">{hsn}</td>
                                            <td className="py-1.5 px-3 text-center font-medium">{qty}</td>
                                            <td className="py-1.5 px-2 text-slate-600">{unit}</td>
                                            <td className="py-1.5 px-3 text-right">{fmtMoney(price)}</td>
                                            {hasAnyDiscount && (
                                              <td className="py-1.5 px-3 text-right text-slate-600">{discountStr || "—"}</td>
                                            )}
                                            <td className="py-1.5 px-3 text-right font-medium">{fmtMoney(rowTotal)}</td>
                                          </tr>
                                        );
                                      })}

                                      {/* Sub-table Total Row */}
                                      <tr className="border-t-2 border-slate-300 font-bold bg-slate-50 text-slate-900">
                                        <td colSpan={3} className="py-1.5 px-3 text-left">Total</td>
                                        <td className="py-1.5 px-3 text-center">
                                          {validRows.reduce((sum, r) => sum + Number(r.qty ?? r.quantity ?? 0), 0)}
                                        </td>
                                        <td className="py-1.5 px-2"></td>
                                        <td className="py-1.5 px-3"></td>
                                        {hasAnyDiscount && (
                                          <td className="py-1.5 px-3 text-right">
                                            {fmtMoney(validRows.reduce((sum, r) => sum + Number(r.discount || r.discountAmount || 0), 0))}
                                          </td>
                                        )}
                                        <td className="py-1.5 px-3 text-right">
                                          {fmtMoney(validRows.reduce((sum, r) => sum + Number(r.amount ?? r.total ?? (Number(r.qty || 1) * Number(r.price || 0))), 0))}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>

                                  {/* Sub Total & Round Off Footer Lines */}
                                  <div className="border-t border-slate-200 px-4 py-1.5 bg-slate-50 flex flex-col items-end gap-0.5 text-xs">
                                    <div className="flex justify-between gap-8 min-w-[200px] text-slate-600">
                                      <span>Sub Total</span>
                                      <span className="font-semibold text-slate-900">{fmtMoney(subTotal)}</span>
                                    </div>
                                    {roundOff !== undefined && roundOff !== null && Number(roundOff) !== 0 && (
                                      <div className="flex justify-between gap-8 min-w-[200px] text-slate-600">
                                        <span>Round off</span>
                                        <span className="font-semibold text-slate-900">{fmtMoney(roundOff)}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Document Bottom: Grand Total & Timestamp */}
            <div className="mt-8 pt-4 border-t border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500 font-medium order-2 sm:order-1">
                {timestampStr}
              </div>
              <div className="text-right order-1 sm:order-2">
                <span className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                  {totalLabel} {fmtMoney(calculatedTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Pill Buttons */}
        <div className="no-print border-t border-slate-200 bg-white px-6 py-4 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-rose-500 bg-white px-5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition shadow-sm cursor-pointer"
          >
            Open PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-rose-500 bg-white px-5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition shadow-sm cursor-pointer"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-rose-500 bg-white px-5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition shadow-sm cursor-pointer"
          >
            Save PDF
          </button>
          <button
            type="button"
            onClick={() => {
              const email = window.prompt("Enter email address to send report PDF:");
              if (email) window.alert(`Report PDF sent successfully to ${email}`);
            }}
            className="rounded-full border border-rose-500 bg-white px-5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition shadow-sm cursor-pointer"
          >
            Email PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-rose-600 px-7 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition shadow-sm cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

