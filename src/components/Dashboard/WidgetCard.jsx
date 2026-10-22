import Card from "../Common/Card";

function WidgetCard({ widget }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">{widget.title}</h3>
          <p className="mt-3 text-sm text-slate-500">{widget.text}</p>
        </div>
        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase text-rose-600">
          {widget.status}
        </span>
      </div>
    </Card>
  );
}

export default WidgetCard;
