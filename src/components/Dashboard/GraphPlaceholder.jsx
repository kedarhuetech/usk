import Card from "../Common/Card";

function GraphPlaceholder() {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Total Sale</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">Rs 0</p>
        </div>
        <button type="button" className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-[#1A1F71]">
          This Month
        </button>
      </div>
      <div className="mt-10 h-72 border-l border-b border-slate-200 bg-[linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[length:100%_58px]">
        <div className="relative h-full">
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
          <div className="absolute bottom-3 left-1/2 rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-white">
            19 Jul<br />Rs 0
          </div>
        </div>
      </div>
    </Card>
  );
}

export default GraphPlaceholder;
