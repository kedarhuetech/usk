import { useNavigate } from "react-router-dom";
import Card from "../Common/Card";

const widgetRouteMap = {
  whatsapp: "/parties/whatsapp-connect",
  google: "/business-growth/google-profile-manager",
};

// Renders the widget card interface.
function WidgetCard({ widget }) {
  const navigate = useNavigate();

  const handleClick = () => {
    const route = widgetRouteMap[widget.id];
    if (route) {
      navigate(route);
    }
  };

  return (
    <Card
      onClick={handleClick}
      className="p-5 hover:border-blue-300 hover:shadow-md transition cursor-pointer group select-none"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition">
            {widget.title}
          </h3>
          <p className="mt-3 text-sm text-slate-500">{widget.text}</p>
        </div>
        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase text-rose-600 shrink-0">
          {widget.status}
        </span>
      </div>
    </Card>
  );
}

export default WidgetCard;
