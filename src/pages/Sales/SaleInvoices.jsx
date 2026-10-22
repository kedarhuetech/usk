import {
  FiCalendar,
  FiChevronDown,
  FiFileText,
  FiPlus,
  FiSettings,
  FiTrendingUp,
} from "react-icons/fi";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { getSaleInvoices } from "../../services/salesStorage";

const filters = [
  { id: "period", label: "This Quarter", icon: null },
  { id: "range", label: "01/07/2026 To 30/09/2026", icon: FiCalendar },
  { id: "company", label: "My Company", icon: null },
  { id: "users", label: "All Users", icon: null },
];

function FilterPill({ filter }) {
  const Icon = filter.icon;

  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center gap-2 rounded-full bg-blue-50 px-4 text-sm font-medium text-slate-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
    >
      {Icon && <Icon className="h-4 w-4 text-slate-500" />}
      <span>{filter.label}</span>
      <FiChevronDown className="h-4 w-4 text-slate-500" />
    </button>
  );
}

function EmptyState({ onAddSale }) {
  return (
    <div className="flex min-h-[420px] flex-1 items-center justify-center px-5 py-12 text-center">
      <div className="max-w-sm">
        <div className="relative mx-auto h-36 w-36">
          <div className="absolute inset-0 rounded-full bg-blue-100" />
          <div className="absolute left-6 top-8 rounded-2xl bg-blue-500 p-4 text-white shadow-lg shadow-blue-200">
            <FiFileText className="h-14 w-14" />
          </div>
          <div className="absolute bottom-5 right-4 h-11 w-24 rounded-xl bg-blue-300/70" />
          <div className="absolute right-1 top-8 h-2 w-2 rounded-full bg-blue-400" />
          <div className="absolute bottom-8 left-0 h-2 w-2 rounded-full bg-blue-300" />
        </div>
        <h2 className="mt-6 text-lg font-bold text-slate-800">No sales recorded yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Create your first sale invoice to get started.
        </p>
        <Button onClick={onAddSale} className="mt-6 bg-rose-600 text-white shadow-sm hover:bg-rose-700">
          <FiPlus className="h-5 w-5" /> Add Sale
        </Button>
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function InvoiceList({ invoices, onOpen }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
          <tr>
            {["Invoice No.", "Customer", "Date", "Amount", "Source", ""].map((header) => (
              <th key={header} className="border-b border-slate-200 px-4 py-3">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-b border-slate-100 last:border-b-0">
              <td className="px-4 py-3 font-bold text-slate-900">{invoice.form?.invoiceNumber || invoice.invoiceNumber}</td>
              <td className="px-4 py-3 text-slate-700">{invoice.form?.customer || "Cash Sale"}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(invoice.createdAt)}</td>
              <td className="px-4 py-3 font-bold text-slate-900">₹{Number(invoice.totals?.finalTotal || 0).toLocaleString("en-IN")}</td>
              <td className="px-4 py-3 text-slate-600">{invoice.sourceOnlineOrderId ? "Online Order" : "Manual"}</td>
              <td className="px-4 py-3 text-right">
                <button type="button" onClick={() => onOpen(invoice)} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">
                  Preview
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SaleInvoices() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [invoices, setInvoices] = useState(() => getSaleInvoices());
  const totalSales = useMemo(() => invoices.reduce((sum, invoice) => sum + Number(invoice.totals?.finalTotal || 0), 0), [invoices]);
  const openAddSale = () => navigate("/sales/sale-invoices/new", { state: { from: pathname } });
  const openPreview = (invoice) => navigate("/sales/sale-invoices/preview", { state: { invoice } });

  useEffect(() => {
    const refresh = () => setInvoices(getSaleInvoices());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  return (
    <div className="min-h-full bg-slate-200 p-1">
      <div className="mb-1 flex flex-col gap-4 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-left text-xl font-bold text-slate-800"
        >
          Sale Invoices
          <FiChevronDown className="h-5 w-5 text-slate-500" />
        </button>

        <div className="flex items-center gap-3">
          <Button onClick={openAddSale} className="bg-rose-600 text-white shadow-sm hover:bg-rose-700">
            <FiPlus className="h-5 w-5" /> Add Sale
          </Button>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <FiSettings className="h-5 w-5" />
          </button>
        </div>
      </div>

      <Card className="mb-1 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-slate-800">Filter by:</span>
          {filters.map((filter) => (
            <FilterPill key={filter.id} filter={filter} />
          ))}
        </div>
      </Card>

      <Card className="mb-1 p-4 shadow-sm">
        <div className="w-full max-w-md rounded-md bg-violet-50/40 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Sales Amount</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">₹{totalSales.toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
              0% <FiTrendingUp className="ml-1 inline h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
            <span>
              Received: <b className="text-slate-900">₹0</b>
            </span>
            <span className="hidden text-slate-300 sm:inline">|</span>
            <span>
              Balance: <b className="text-slate-900">₹{totalSales.toLocaleString("en-IN")}</b>
            </span>
            <span className="ml-auto text-xs text-slate-400">vs last quarter</span>
          </div>
        </div>
      </Card>

      <Card className="flex min-h-[calc(100vh-22rem)] flex-col shadow-sm">
        {invoices.length ? <InvoiceList invoices={invoices} onOpen={openPreview} /> : <EmptyState onAddSale={openAddSale} />}
      </Card>
    </div>
  );
}

export default SaleInvoices;
