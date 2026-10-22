import GraphPlaceholder from "../../components/Dashboard/GraphPlaceholder";
import QuickActions from "../../components/Dashboard/QuickActions";
import ReportsSection from "../../components/Dashboard/ReportsSection";
import StatCard from "../../components/Dashboard/StatCard";
import WidgetCard from "../../components/Dashboard/WidgetCard";
import { dashboardData } from "../../constants/dashboardData";

function Dashboard() {
  return (
    <div className="bg-slate-200 p-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            {dashboardData.stats.map((stat) => (
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
