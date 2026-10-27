// Implements the sale preview page.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiDownload, FiMail, FiMessageCircle, FiPrinter, FiShare2, FiX } from "react-icons/fi";
import Button from "../../components/Common/Button";
import { calculateInvoiceTotals } from "../../utils/saleInvoice";
import { businessGrowthApi } from "../../services/apiClient.js";
import { normalizePersistedAssetUrls } from "../../services/businessGrowthData.js";

const colors = ["bg-indigo-400", "bg-sky-600", "bg-slate-400", "bg-zinc-500", "bg-lime-500", "bg-orange-500", "bg-rose-600", "bg-emerald-600"];

// Reads stored invoice.
function readStoredInvoice() {
  try {
    return JSON.parse(sessionStorage.getItem("ledgerly:lastSaleInvoice"));
  } catch {
    return null;
  }
}

// Renders the sale preview interface.
function SalePreview() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const invoice = state?.invoice || readStoredInvoice();
  const [savedBusiness, setSavedBusiness] = useState(null);
  const totals = useMemo(() => invoice?.totals || calculateInvoiceTotals(invoice?.rows || [], false, 0, 0), [invoice]);

  useEffect(() => {
    let active = true;
    businessGrowthApi.list("online-store")
      .then((rows) => { if (active && rows[0]) setSavedBusiness(normalizePersistedAssetUrls(rows[0])); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (state?.printAfterOpen) window.setTimeout(() => window.print(), 250);
  }, [state?.printAfterOpen]);

  if (!invoice) {
    return (
      <div className="grid min-h-full place-items-center bg-slate-100 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">No invoice preview available</h1>
          <Button onClick={() => navigate("/sales/sale-invoices/new")} className="mt-5 rounded-md bg-blue-600 text-white">
            Create Sale
          </Button>
        </div>
      </div>
    );
  }

  const rows = invoice.rows.filter((row) => row.item || row.qty || row.price);
  const formatDate = invoice.form.invoiceDate?.split("-").reverse().join("-") || "";
  const companyName = savedBusiness?.businessName || savedBusiness?.storeName || invoice.business.name || "My Company";
  const companyLogo = savedBusiness?.logoUrl || invoice.business.logoUrl || "";
  const companyPhone = savedBusiness?.contactNumber || invoice.business.phone || invoice.form.phone;
  const companyGstin = savedBusiness?.gstin || invoice.business.gstin;
  const companyAddress = savedBusiness?.address || invoice.business.address;

  return (
    <div className="min-h-full bg-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 print:hidden">
        <h1 className="text-xl font-bold text-slate-900">Preview</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-5 w-5 accent-blue-600" />
            Do not show invoice preview again
          </label>
          <button type="button" onClick={() => navigate("/sales/sale-invoices")} className="text-sm font-bold text-blue-600">
            Save & Close
          </button>
          <button type="button" onClick={() => navigate("/sales/sale-invoices/new")} className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
            <FiX />
          </button>
        </div>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_240px] print:block print:p-0">
        <aside className="rounded-lg border border-slate-200 bg-white p-3 print:hidden">
          <h2 className="mb-4 text-[13px] font-bold text-slate-700">Select Theme</h2>
          {["Classic Themes", "Tally Theme", "GST Theme 1", "GST Theme 3", "Double Divine", "French Elite"].map((theme, index) => (
            <button key={theme} type="button" className={`block w-full rounded-md px-3 py-2.5 text-left text-[13px] font-semibold ${index === 2 ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
              {theme}
            </button>
          ))}
          <h2 className="mb-3 mt-5 text-[13px] font-bold text-slate-700">Select Color</h2>
          <div className="grid grid-cols-4 gap-2.5">
            {colors.map((color) => (
              <button key={color} type="button" className={`h-8 rounded-md ${color}`} />
            ))}
          </div>
        </aside>

        <section className="min-w-0 print:block">
          <div className="mx-auto min-h-[680px] w-full max-w-[920px] bg-white p-5 text-[13px] shadow-lg print:min-h-0 print:max-w-none print:p-7 print:text-sm print:shadow-none">
            <div className="flex min-w-0 justify-between gap-4 border-b border-indigo-300 pb-4">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-bold text-slate-950 print:text-2xl">{companyName}</h2>
                {companyPhone && <p className="mt-1.5">Phone no.: {companyPhone}</p>}
                {companyGstin && <p>GSTIN: {companyGstin}</p>}
                {companyAddress && <p className="break-words">{companyAddress}</p>}
              </div>
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden bg-slate-400 text-xs font-bold text-white print:h-20 print:w-20 print:text-sm">
                {companyLogo ? <img src={companyLogo} alt={`${companyName} logo`} className="h-full w-full object-contain" /> : "LOGO"}
              </div>
            </div>

            <h3 className="my-4 text-center text-xl font-bold text-indigo-400 print:my-5 print:text-2xl">Tax Invoice</h3>

            <div className="grid min-w-0 gap-4 md:grid-cols-3">
              <div className="min-w-0">
                <p className="mb-2 font-bold">Bill To</p>
                <p className="font-semibold">{invoice.form.customer || "Cash Sale"}</p>
                <p className="break-words">{invoice.form.billingAddress}</p>
                {invoice.form.phone && <p>Contact No.: {invoice.form.phone}</p>}
              </div>
              <div className="min-w-0">
                <p className="mb-2 font-bold">Ship To</p>
                <p className="break-words">{invoice.form.shippingAddress || invoice.form.billingAddress}</p>
              </div>
              <div className="min-w-0 text-left md:text-right">
                <p className="mb-2 font-bold">Invoice Details</p>
                <p>Invoice No.: {invoice.form.invoiceNumber}</p>
                <p>Date: {formatDate}</p>
                <p>State of Supply: {invoice.form.stateOfSupply}</p>
              </div>
            </div>

            <table className="mt-6 w-full table-fixed border-collapse text-xs print:mt-7 print:text-sm">
              <thead>
                <tr className="bg-indigo-400 text-left text-white">
                  <th className="w-[5%] px-1.5 py-2">#</th>
                  <th className="w-[25%] px-1.5 py-2">Item name</th>
                  <th className="w-[11%] px-1.5 py-2 text-right">Quantity</th>
                  <th className="w-[10%] px-1.5 py-2">Unit</th>
                  <th className="w-[14%] px-1.5 py-2 text-right">Price/Unit</th>
                  <th className="w-[13%] px-1.5 py-2 text-right">Discount</th>
                  <th className="w-[10%] px-1.5 py-2 text-right">GST</th>
                  <th className="w-[12%] px-1.5 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-1.5 py-2.5">{index + 1}</td>
                    <td className="break-words px-1.5 py-2.5 font-semibold">{row.item}</td>
                    <td className="px-1.5 py-2.5 text-right">{row.calculated.qty}</td>
                    <td className="break-words px-1.5 py-2.5">{row.unit}</td>
                    <td className="px-1.5 py-2.5 text-right">Rs. {Number(row.price || 0).toFixed(2)}</td>
                    <td className="px-1.5 py-2.5 text-right">Rs. {row.calculated.discount.toFixed(2)}</td>
                    <td className="px-1.5 py-2.5 text-right">Rs. {row.calculated.tax.toFixed(2)}</td>
                    <td className="px-1.5 py-2.5 text-right">Rs. {row.calculated.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-400 font-bold">
                  <td className="px-1.5 py-2.5" colSpan="2">Total</td>
                  <td className="px-1.5 py-2.5 text-right">{totals.qty}</td>
                  <td colSpan="2" />
                  <td className="px-1.5 py-2.5 text-right">Rs. {totals.discount.toFixed(2)}</td>
                  <td className="px-1.5 py-2.5 text-right">Rs. {totals.tax.toFixed(2)}</td>
                  <td className="px-1.5 py-2.5 text-right">Rs. {totals.finalTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            {invoice.form.terms && (
              <div className="mt-6 rounded-md border border-slate-200 p-3 print:mt-8 print:p-4">
                <p className="font-bold">{invoice.form.termsTitle || "Terms & Conditions"}</p>
                <p className="mt-2 text-slate-600">{invoice.form.terms}</p>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2 xl:col-span-1 print:hidden">
          <div className="rounded-lg bg-blue-50 p-4 text-center">
            <p className="font-bold text-slate-800">Accept Online Payments</p>
            <Button className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-[13px] text-white">Start Now</Button>
          </div>
          <div>
            <h2 className="mb-3 font-bold text-slate-900">Share Invoice</h2>
            <div className="grid grid-cols-3 gap-2 text-center text-[13px]">
              <button type="button" className="rounded-md p-2 hover:bg-slate-50"><FiMessageCircle className="mx-auto mb-2 h-5 w-5 text-green-500" />Whatsapp</button>
              <button type="button" className="rounded-md p-2 hover:bg-slate-50"><FiMail className="mx-auto mb-2 h-5 w-5 text-red-500" />Gmail</button>
              <button type="button" className="rounded-md p-2 hover:bg-slate-50"><FiShare2 className="mx-auto mb-2 h-5 w-5 text-blue-500" />Message</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center text-[13px]">
            <button type="button" onClick={() => window.print()} className="rounded-md p-2 hover:bg-slate-50"><FiDownload className="mx-auto mb-2 h-5 w-5 text-blue-600" />Download PDF</button>
            <button type="button" onClick={() => window.print()} className="rounded-md p-2 hover:bg-slate-50"><FiPrinter className="mx-auto mb-2 h-5 w-5 text-blue-600" />Print Thermal</button>
            <button type="button" onClick={() => window.print()} className="rounded-md bg-blue-600 p-2 text-white"><FiPrinter className="mx-auto mb-2 h-5 w-5" />Print Normal</button>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default SalePreview;
