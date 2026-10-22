import { useEffect, useState } from "react";
import GraphPlaceholder from "../../components/Dashboard/GraphPlaceholder";
import QuickActions from "../../components/Dashboard/QuickActions";
import ReportsSection from "../../components/Dashboard/ReportsSection";
import StatCard from "../../components/Dashboard/StatCard";
import WidgetCard from "../../components/Dashboard/WidgetCard";
import { dashboardData } from "../../constants/dashboardData";
import { loadBusinessSummary } from "../../services/businessRecords";

function Dashboard() {
  const [summary, setSummary] = useState({ receivable: 0, payable: 0 });
  useEffect(() => {
    let active = true;
    loadBusinessSummary()
      .then((data) => { if (active) setSummary(data); })
      .catch((error) => console.error("Could not load MySQL dashboard summary:", error));
    return () => { active = false; };
  }, []);
  const stats = dashboardData.stats.map((stat) => {
    const amount = stat.id === "receivable" ? summary.receivable : summary.payable;
    const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
    return {
      ...stat,
      value: formatted,
      note: amount ? "Calculated from saved invoices" : "No outstanding balance",
    };
  });

  return (
    <div className="bg-slate-200 p-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            {stats.map((stat) => (
              <StatCard key={stat.id} stat={stat} />
            ))}
          </div>
          <GraphPlaceholder />
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
