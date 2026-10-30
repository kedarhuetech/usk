// Implements the dashboard page.
import { useEffect, useState } from "react";
import GraphPlaceholder from "../../components/Dashboard/GraphPlaceholder";
import QuickActions from "../../components/Dashboard/QuickActions";
import ReportsSection from "../../components/Dashboard/ReportsSection";
import StatCard from "../../components/Dashboard/StatCard";
import WidgetCard from "../../components/Dashboard/WidgetCard";
import { dashboardData } from "../../constants/dashboardData";
import { loadBusinessSummary } from "../../services/businessRecords";
import { businessDataChangedEvent } from "../../services/businessDataChanged.js";
import { purchaseBillsStorageKey } from "../../services/purchaseBillsStorage.js";
import { saleInvoicesStorageKey } from "../../services/salesStorage.js";
import { partiesStorageKey } from "../../services/partiesStorage.js";
import { saleInvoiceUiStorageKey } from "../../services/dashboardSummary.js";

// Renders the dashboard interface.
function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const currentRequest = ++request;
      setLoading(true);
      loadBusinessSummary()
        .then((data) => {
          if (!active || currentRequest !== request) return;
          setSummary(data);
          setError("");
        })
        .catch((loadError) => {
          if (!active || currentRequest !== request) return;
          console.error("Could not load local dashboard summary:", loadError);
          setError(loadError.message || "Could not load saved business totals.");
        })
        .finally(() => {
          if (active && currentRequest === request) setLoading(false);
        });
    };

    const onStorage = (event) => {
      if ([saleInvoicesStorageKey, purchaseBillsStorageKey, partiesStorageKey, saleInvoiceUiStorageKey].includes(event.key)) {
        refresh();
      }
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

  const stats = dashboardData.stats.map((stat) => {
    const amount = summary ? (stat.id === "receivable" ? summary.receivable : summary.payable) : null;
    const formatted = amount == null
      ? (loading ? "Loading…" : "—")
      : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

    return {
      ...stat,
      value: formatted,
      note: error
        ? "Could not read saved local data"
        : amount > 0
          ? "Calculated from saved transactions"
          : "No outstanding balance",
    };
  });

  return (
    <div className="bg-slate-200 p-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Dashboard totals could not be loaded: {error}</p>}
          <div className="grid gap-5 md:grid-cols-2">
            {stats.map((stat) => (
              <StatCard key={stat.id} stat={stat} />
            ))}
          </div>
          <GraphPlaceholder summary={summary} loading={loading} />
          <ReportsSection reports={dashboardData.reports} />
        </div>

        <aside className="space-y-5">
          <QuickActions actions={dashboardData.actions} />
          {dashboardData.widgets.map((widget) => (
            <WidgetCard key={widget.id} widget={widget} />
          ))}
        </aside>
      </div>
    </div>
  );
}

export default Dashboard;
