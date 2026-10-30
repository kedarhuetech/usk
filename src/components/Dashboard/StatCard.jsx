import { FiArrowDown, FiArrowUp } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Card from "../Common/Card";

// Renders the stat card interface.
function StatCard({ stat }) {
  const navigate = useNavigate();
  const Icon = stat.tone === "emerald" ? FiArrowDown : FiArrowUp;

  const handleClick = () => {
    if (stat.id === "receivable") {
      navigate("/sales/sale-invoices");
    } else if (stat.id === "payable") {
      navigate("/purchase-expense/purchase-bills");
    }
  };

  return (
    <Card
      onClick={handleClick}
      className="p-5 hover:border-blue-300 hover:shadow-md transition cursor-pointer select-none group"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 group-hover:text-blue-600 transition">
            {stat.label}
          </p>
          <p className="mt-3 text-2xl font-bold text-slate-950">{stat.value}</p>
          <p className="mt-6 text-sm text-slate-500">{stat.note}</p>
        </div>
        <span
          className={`rounded-full p-3 transition ${
            stat.tone === "emerald"
              ? "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200"
              : "bg-rose-100 text-rose-600 group-hover:bg-rose-200"
          }`}
        >
          <Icon className="h-6 w-6" />
        </span>
      </div>
    </Card>
  );
}

export default StatCard;
