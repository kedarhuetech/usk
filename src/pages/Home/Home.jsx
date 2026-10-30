// Implements the home page.
import { useEffect, useState } from "react";
import {
  FiArrowRight,
  FiBarChart2,
  FiBookOpen,
  FiFileText,
  FiGlobe,
  FiPlus,
  FiShoppingCart,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Common/Card";
import Button from "../../components/Common/Button";
import { loadBusinessSummary } from "../../services/businessRecords";
import { businessDataChangedEvent } from "../../services/businessDataChanged.js";
import { purchaseBillsStorageKey } from "../../services/purchaseBillsStorage.js";
import { saleInvoicesStorageKey } from "../../services/salesStorage.js";
import { partiesStorageKey } from "../../services/partiesStorage.js";
import { saleInvoiceUiStorageKey } from "../../services/dashboardSummary.js";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const quickActions = [
  { label: "Add Sale", path: "/sales/sale-invoices/new", icon: FiPlus, tone: "rose" },
  { label: "Add Purchase", path: "/purchase-expense/purchase-bills/new", icon: FiShoppingCart, tone: "blue" },
  { label: "Party Details", path: "/parties/party-details", icon: FiUsers, tone: "violet" },
  { label: "Sale Invoices", path: "/sales/sale-invoices", icon: FiFileText, tone: "emerald" },
];

const growthLinks = [
  { label: "Google Profile Manager", path: "/business-growth/google-profile-manager", icon: FiGlobe },
  { label: "WhatsApp Marketing", path: "/business-growth/whatsapp-marketing", icon: FiBookOpen },
  { label: "Online Store", path: "/business-growth/online-store", icon: FiShoppingCart },
  { label: "Smart Ads", path: "/business-growth/smart-ads", icon: FiTrendingUp },
];

// Renders the summary card interface.
function SummaryCard({ label, value, note, icon: Icon, tone }) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">{note}</p>
    </Card>
  );
}

const actionTones = {
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

// Renders the home interface.
function Home() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    let request = 0;

    const refresh = () => {
      const currentRequest = ++request;
      setIsLoading(true);
      setLoadError("");
      setSummary(null);
      loadBusinessSummary()
        .then((data) => {
          if (!active || currentRequest !== request) return;
          setSummary(data);
        })
        .catch((error) => {
          if (!active || currentRequest !== request) return;
          setSummary(null);
          setLoadError(error.message || "Could not load saved business data.");
        })
        .finally(() => {
          if (active && currentRequest === request) setIsLoading(false);
        });
    };
    const onStorage = (event) => {
      if ([saleInvoicesStorageKey, purchaseBillsStorageKey, partiesStorageKey, saleInvoiceUiStorageKey].includes(event.key)) refresh();
    };

    refresh();
    window.addEventListener(businessDataChangedEvent, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      window.removeEventListener(businessDataChangedEvent, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const totalSales = summary?.totalSales;

  const summaryCards = [
    {
      label: "Total Sales",
      value: isLoading && !summary ? "Loading…" : summary ? currencyFormatter.format(totalSales) : "—",
      note: summary ? `${summary.activeSales.length} active saved invoice${summary.activeSales.length === 1 ? "" : "s"}` : loadError ? "Saved sales are unavailable" : "No sales recorded yet",
      icon: FiTrendingUp,
      tone: "blue",
    },
    {
      label: "Total Receivable",
      value: isLoading && !summary ? "Loading…" : summary ? currencyFormatter.format(Number(summary.receivable || 0)) : "—",
      note: summary ? "Outstanding from saved sales and opening balances" : loadError ? "Summary unavailable" : "No outstanding balance",
      icon: FiArrowRight,
      tone: "emerald",
    },
    {
      label: "Total Payable",
      value: isLoading && !summary ? "Loading…" : summary ? currencyFormatter.format(Number(summary.payable || 0)) : "—",
      note: summary ? "Outstanding from saved purchases and opening balances" : loadError ? "Summary unavailable" : "No outstanding balance",
      icon: FiShoppingCart,
      tone: "rose",
    },
  ];

  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="flex flex-col gap-4 rounded-xl bg-gradient-to-r from-[#1A1F71] to-[#343B9A] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-white/70">Business overview</p>
            <h1 className="mt-1 text-2xl font-bold">Welcome back</h1>
            <p className="mt-2 max-w-xl text-sm text-white/75">
              Keep track of your sales, balances, and everyday business work from one place.
            </p>
          </div>
          <Button
            onClick={() => navigate("/dashboard")}
            className="shrink-0 bg-white text-[#1A1F71] hover:bg-blue-50"
          >
            Open Dashboard
            <FiArrowRight className="h-4 w-4" />
          </Button>
        </section>

        {loadError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Dashboard totals could not be loaded from saved browser data: {loadError}
          </div>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">Business Summary</h2>
            {isLoading && <span className="text-xs text-slate-500">Loading...</span>}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {summaryCards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Quick Actions</h2>
                <p className="mt-1 text-sm text-slate-500">Open the tasks you use most.</p>
              </div>
              <FiBarChart2 className="h-5 w-5 text-slate-400" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickActions.map(({ label, path, icon: Icon, tone }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => navigate(path, { state: { from: "/" } })}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                >
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${actionTones[tone]}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-slate-700">{label}</span>
                  <FiArrowRight className="h-4 w-4 text-slate-400" />
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-slate-800">Most Used Reports</h2>
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Reports are not available yet</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                No report destination is currently registered in the application, so no broken shortcut was added.
              </p>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-800">Business Growth</h2>
            <p className="mt-1 text-sm text-slate-500">Continue working with your existing growth tools.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {growthLinks.map(({ label, path, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => navigate(path)}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-slate-700">{label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Home;
