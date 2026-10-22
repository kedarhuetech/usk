import Card from "../Common/Card";

function QuickActions({ actions }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-800">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <button key={action} type="button" className="rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
            {action}
          </button>
        ))}
      </div>
    </Card>
  );
}

export default QuickActions;
