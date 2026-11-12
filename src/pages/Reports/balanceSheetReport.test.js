import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("BalanceSheetReport file exists and contains valid React export", () => {
  assert.ok(fs.existsSync("src/pages/Reports/BalanceSheetReport.jsx"), "BalanceSheetReport.jsx must exist");
  const content = fs.readFileSync("src/pages/Reports/BalanceSheetReport.jsx", "utf8");
  assert.ok(content.includes("export default function BalanceSheetReport"), "Must export default function BalanceSheetReport");
});

test("BalanceSheetReport communicates clear financial state with calculations", () => {
  const content = fs.readFileSync("src/pages/Reports/BalanceSheetReport.jsx", "utf8");

  // Required sections and real calculation integration
  assert.ok(content.includes("calculateBalanceSheet"), "Must import or use calculateBalanceSheet");
  assert.ok(content.includes("Current Assets"), "Must include Current Assets section");
  assert.ok(content.includes("Total Liabilities"), "Must include Total Liabilities section");
  assert.ok(content.includes("Equity") || content.includes("Owner"), "Must include Equity section");

  // Prohibit fabricated / hardcoded balances or dummy rupee figures
  assert.ok(!content.includes("₹ 1,00,000"), "Must not contain fabricated financial amounts");
  assert.ok(!content.includes("₹ 50,000"), "Must not contain fabricated financial amounts");
  assert.ok(!content.includes("dummy"), "Must not contain dummy markers");
});

test("BalanceSheet is registered cleanly in Reports navigation and routing", () => {
  const reportsContent = fs.readFileSync("src/pages/Reports/Reports.jsx", "utf8");
  const appContent = fs.readFileSync("src/App.jsx", "utf8");
  const topbarContent = fs.readFileSync("src/components/Topbar/Topbar.jsx", "utf8");

  // In Reports.jsx
  assert.ok(reportsContent.includes("BalanceSheetReport"), "Reports.jsx must import BalanceSheetReport");
  assert.ok(reportsContent.includes('"Balance Sheet"'), "Reports.jsx must list 'Balance Sheet' in report options");
  assert.ok(reportsContent.includes('<BalanceSheetReport />'), "Reports.jsx must render BalanceSheetReport when active");
  assert.ok(reportsContent.includes('location.pathname.includes("balance-sheet")'), "Reports.jsx must recognize balance-sheet path");

  // In App.jsx
  assert.ok(appContent.includes('path="reports/balance-sheet"'), "App.jsx must declare reports/balance-sheet route");

  // In Topbar.jsx
  assert.ok(topbarContent.includes('rep === "Balance Sheet" ? "/reports/balance-sheet"'), "Topbar.jsx must link Balance Sheet search to route");
});
