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
            className="flex items-center justify-between rounded-lg border border-[#D8CEBD] bg-[#EEEEEE] p-5 text-left text-sm font-semibold text-[#242C1D] hover:border-[#8B9A6E] hover:bg-[#8B9A6E]/15 transition cursor-pointer"
          >
            {report}
            <FiChevronRight className="h-5 w-5 text-[#8B9A6E]" />
          </button>
        ))}
      </div>
    </Card>
  );
}

export default ReportsSection;