import { FiChevronRight } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Card from "../Common/Card";

// Renders the reports section interface.
function ReportsSection({ reports }) {
  const navigate = useNavigate();

  return (
    <Card className="p-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">
          Most Used Reports
        </h2>

        <button
          type="button"
          onClick={() => navigate("/reports")}
          className="text-sm font-medium text-blue-600"
        >
          View All
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {reports.map((report) => (
          <button
            key={report}
            type="button"
            onClick={() => navigate("/reports")}
            className="flex items-center justify-between rounded-lg border border-slate-200 p-5 text-left text-sm font-semibold text-slate-800 hover:border-blue-200 hover:bg-blue-50"
          >
            {report}
            <FiChevronRight className="h-5 w-5 text-blue-600" />
          </button>
        ))}
      </div>
    </Card>
  );
}

export default ReportsSection;