// Implements the dashboard page.
import { useEffect, useState } from "react";
import GraphPlaceholder from "../../components/Dashboard/GraphPlaceholder";
import QuickActions from "../../components/Dashboard/QuickActions";
import ReportsSection from "../../components/Dashboard/ReportsSection";
import StatCard from "../../components/Dashboard/StatCard";
import { dashboardData } from "../../constants/dashboardData";
import { formatCurrency } from "../../services/appSettingsStorage";
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
      setError("");
      loadBusinessSummary()
        .then((data) => {
          if (!active || currentRequest !== request) return;
          setSummary(data);
          setError("");
        })
        .catch((loadError) => {
          if (!active || currentRequest !== request) return;
          console.error("Could not load dashboard summary:", loadError);
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
      : formatCurrency(amount);

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
    <div className="bg-slate-200 p-3 sm:p-5">
      <div className="space-y-4 sm:space-y-5">
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Dashboard totals could not be loaded: {error}</p>}
        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[1fr_360px]">
          <div className="grid gap-3 sm:gap-5 md:grid-cols-2">
            {stats.map((stat) => (
              <StatCard key={stat.id} stat={stat} />
            ))}
          </div>

          <aside>
            <QuickActions actions={dashboardData.actions} />
          </aside>
        </div>

        <GraphPlaceholder summary={summary} loading={loading} />
        <ReportsSection reports={dashboardData.reports} />
      </div>
    </div>
  );
}

export default Dashboard;
