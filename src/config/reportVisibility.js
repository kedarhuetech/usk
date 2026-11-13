// Temporary V1 visibility controls for report navigation.
const HIDDEN_REPORT_GROUPS = new Set(["GST reports"]);

const HIDDEN_REPORTS = new Set([
  "GSTR 3 B",
  "GSTR 4",
  "GSTR 9A",
  "Sale Summary By HSN",
  "TCS Receivable",
  "TDS Receivable",
  "TDS Payable",
  "Form No. 27EQ"
]);

export function isReportGroupVisible(groupHeading) {
  return !HIDDEN_REPORT_GROUPS.has(groupHeading);
}

export function isReportVisible(reportName) {
  return !HIDDEN_REPORTS.has(reportName);
}
