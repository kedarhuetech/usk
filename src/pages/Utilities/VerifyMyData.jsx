// Shows read-only consistency checks for the current company's saved records.
import { useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiRefreshCw, FiShield } from "react-icons/fi";
import { Link } from "react-router-dom";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { runDataVerification } from "../../services/dataVerification.js";

// Renders the Verify My Data utility.
function VerifyMyData() {
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);

  // Runs the check on demand and refreshes results from backend data.
  const startVerification = async () => {
    setChecking(true);
    setResult(await runDataVerification());
    setChecking(false);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <p className="text-sm font-semibold text-blue-700">Utilities</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Verify My Data</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Check locally saved USV records for transaction total mismatches and broken item or party ID references.
          Verification reads browser storage and never changes it.
        </p>
      </div>

      <Card className="p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <FiShield className="mt-1 h-5 w-5 shrink-0 text-blue-600" />
            <div>
              <h2 className="font-semibold text-slate-900">Read-only local verification</h2>
              <p className="mt-1 text-sm text-slate-600">USV checks items, parties, sales, and purchases saved in this browser. The check does not contact the database.</p>
            </div>
          </div>
          <Button onClick={startVerification} disabled={checking} className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
            <FiRefreshCw className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : result ? "Refresh Verification" : "Start Verification"}
          </Button>
        </div>
      </Card>

      {!result && (
        <Card className="p-5 text-sm text-slate-600">
          Stock movement reconciliation and party balance reconciliation are not available because USV does not currently store the complete movement, payment, and transaction-to-party history required for those checks. Sales and purchases saved only in the database and not copied to this browser are not included.
        </Card>
      )}

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Records checked" value={result.recordsChecked} />
            <SummaryCard label="Issues found" value={result.issues.length} />
            <SummaryCard label="Checks incomplete" value={result.incompleteChecks.length} />
          </div>

          {result.failed && <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No records were reported as checked because browser-local storage could not be read.</Card>}

          <Card className="p-5">
            <h2 className="font-semibold text-slate-900">Issues</h2>
            {!result.issues.length && !result.failed && <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><FiCheckCircle /> No issues were found in the checks that completed.</p>}
            {result.issues.length > 0 && <ul className="mt-3 divide-y divide-slate-100">{result.issues.map((issue) => (
              <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between" key={issue.id}>
                <div className="flex gap-3">
                  <FiAlertCircle className={issue.severity === "error" ? "mt-0.5 text-red-600" : "mt-0.5 text-amber-600"} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{issue.recordType} {issue.recordReference} <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">{issue.severity}</span></p>
                    <p className="mt-1 text-sm text-slate-600">{issue.explanation}</p>
                  </div>
                </div>
                <Link className="ml-8 text-sm font-semibold text-blue-700 hover:underline sm:ml-0" to={issue.path}>Inspect records</Link>
              </li>
            ))}</ul>}
          </Card>

          <Card className="grid gap-5 p-5 md:grid-cols-2">
            <CheckList title="Completed checks" entries={result.completedChecks} empty="No checks completed." />
            <CheckList title="Could not complete" entries={result.incompleteChecks} empty="All supported checks completed." />
            <p className="text-xs text-slate-500 md:col-span-2">Last checked: {new Date(result.checkedAt).toLocaleString()}</p>
          </Card>
        </>
      )}
    </div>
  );
}

// Shows one result count in the summary row.
function SummaryCard({ label, value }) {
  return <Card className="p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></Card>;
}

// Lists what the verifier did or could not do.
function CheckList({ title, entries, empty }) {
  return <div><h2 className="font-semibold text-slate-900">{title}</h2>{entries.length ? <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">{entries.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">{empty}</p>}</div>;
}

export default VerifyMyData;
