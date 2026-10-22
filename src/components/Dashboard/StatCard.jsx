import { FiArrowDown, FiArrowUp } from "react-icons/fi";
import Card from "../Common/Card";

function StatCard({ stat }) {
  const Icon = stat.tone === "emerald" ? FiArrowDown : FiArrowUp;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{stat.label}</p>
          <p className="mt-3 text-2xl font-bold text-slate-950">{stat.value}</p>
          <p className="mt-6 text-sm text-slate-500">{stat.note}</p>
        </div>
        <span className={`rounded-full p-3 ${stat.tone === "emerald" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
          <Icon className="h-6 w-6" />
        </span>
      </div>
    </Card>
  );
}

export default StatCard;
