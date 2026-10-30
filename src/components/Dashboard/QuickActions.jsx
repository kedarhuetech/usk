import { useNavigate } from "react-router-dom";
import Card from "../Common/Card";

// Action route mappings
const actionRouteMap = {
  "Add Sale": {
    path: "/sales/sale-invoices/new",
  },
  "Add Purchase": {
    path: "/purchase-expense/purchase-bills/new",
  },
  "Add Party": {
    path: "/parties/party-details",
    state: { openAddParty: true },
  },
  "Add Item": {
    path: "/items",
    state: { openAddItem: true },
  },
};

// Renders the quick actions interface.
function QuickActions({ actions }) {
  const navigate = useNavigate();

  const handleActionClick = (action) => {
    const config = actionRouteMap[action];
    if (config) {
      navigate(config.path, config.state ? { state: config.state } : undefined);
    }
  };

  return (
    <Card className="p-5 select-none">
      <h2 className="mb-4 text-base font-semibold text-slate-800">
        Quick Actions
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => handleActionClick(action)}
            className="rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 hover:border-blue-500 hover:bg-blue-50 active:scale-98 transition cursor-pointer text-center"
          >
            {action}
          </button>
        ))}
      </div>
    </Card>
  );
}

export default QuickActions;
