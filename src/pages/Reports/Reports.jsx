import { useMemo, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AllTransactionsReport from "./AllTransactionsReport";
import ProfitAndLossReport from "./ProfitAndLossReport";
import CashFlowReport from "./CashFlowReport";
import AllPartiesReport from "./AllPartiesReport";
import PartyReportByItem from "./PartyReportByItem";
import SalePurchaseByPartyReport from "./SalePurchaseByPartyReport";
import {
  FiBarChart2,
  FiPrinter,
  FiSearch,
  FiShare2,
  FiMoreVertical,
  FiFilter,
} from "react-icons/fi";

const reportGroups = [
  {
    heading: "Transaction report",
    reports: [
      "Sale",
      "Purchase",
      "Day book",
      "All Transactions",
      "Profit And Loss",
      "Bill Wise Profit",
      "Cash flow",
      "Trial Balance Report",
      "Balance Sheet",
    ],
  },
  {
    heading: "Party report",
    reports: [
      "Party Statement",
      "Party wise Profit & Loss",
      "All parties",
      "Party Report By Item",
      "Sale Purchase By Party",
      "Sale Purchase By Party Group",
    ],
  },
  {
    heading: "GST reports",
    reports: ["GSTR 3 B", "GSTR 4", "GSTR 9A", "Sale Summary By HSN", "SAC Report"],
  },
  {
    heading: "Item/ Stock report",
    reports: [
      "Stock summary",
      "Item Batch Report",
      "Item Report By Party",
      "Item Wise Profit And Loss",
      "Item Category Wise Profit And Loss",
      "Low Stock Summary",
      "Stock Detail",
      "Item Detail",
      "Sale/Purchase Report By Item Category",
      "Stock Summary Report By Item Category",
      "Item Wise Discount",
    ],
  },
  { heading: "Business Status", reports: ["Bank Statement", "Discount Report"] },
  {
    heading: "Taxes",
    reports: [
      "GST Report",
      "GST Rate Report",
      "Form No. 27EQ",
      "TCS Receivable",
      "TDS Payable",
      "TDS Receivable",
    ],
  },
  {
    heading: "Expense report",
    reports: ["Expense", "Expense Category Report", "Expense Item Report"],
  },
  {
    heading: "Sale/ Purchase Order report",
    reports: ["Sale/Purchase Orders", "Sale/Purchase Order Item"],
  },
  { heading: "Loan Accounts", reports: ["Loan Statement"] },
];

const reportTitle = (name) =>
  ({
    Sale: "Sale Invoices",
    Purchase: "Purchase Bills",
    "All Transactions": "All Transactions",
    "Day book": "Day book",
  }[name] || name);

const money = (value) =>
  `₹ ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const dateOf = (row) =>
  row.form?.invoiceDate ||
  row.form?.billDate ||
  row.date ||
  row.createdAt?.slice(0, 10) ||
  "";

const storeOf = (row) =>
  row.form?.firm ||
  row.form?.store ||
  row.form?.businessName ||
  row.firmName ||
  row.storeName ||
  "";

const userOf = (row) =>
  row.form?.user || row.form?.createdBy || row.createdBy || row.userName || "";

const amountOf = (row) =>
  Number(
    row.totals?.finalTotal ??
      row.totals?.grandTotal ??
      row.totalAmount ??
      row.amount ??
      (row.rows || []).reduce(
        (sum, line) =>
          sum +
          Number(
            line.amount ||
              Number(line.qty || line.quantity || 0) *
                Number(line.price || line.rate || 0)
          ),
        0
      )
  );

const receivedOf = (row) =>
  Number(
    row.totals?.received ??
      row.received ??
      row.paid ??
      (row.payments || []).reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      )
  );

const partyOf = (row) =>
  row.form?.customer ||
  row.form?.party ||
  row.supplier ||
  row.party ||
  row.partyName ||
  row.name ||
  "Cash Sale";

const referenceOf = (row) =>
  row.form?.invoiceNumber ||
  row.form?.billNumber ||
  row.invoiceNumber ||
  row.billNumber ||
  row.referenceNumber ||
  row.number ||
  row.id ||
  "";

const paymentTypeOf = (row) =>
  row.form?.paymentType ||
  row.paymentType ||
  row.payments?.map((payment) => payment.type).filter(Boolean).join(", ") ||
  "Cash";

const localList = (key) => readLocal(key);

const readLocal = (...keys) => {
  for (const key of keys) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (Array.isArray(value)) return value;
    } catch {
      // Ignore malformed local data.
    }
  }

  return [];
};

function Reports({ defaultReport }) {
  const navigate = useNavigate();
  const location = useLocation();

  const getInitialReport = () => {
    if (defaultReport) return defaultReport;
    if (location.pathname.includes("profit-and-loss")) return "Profit And Loss";
    if (location.pathname.includes("all-transactions")) return "All Transactions";
    if (location.pathname.includes("cash-flow")) return "Cash flow";
    if (location.pathname.includes("all-parties")) return "All parties";
    if (location.pathname.includes("party-report-by-item")) return "Party Report By Item";
    if (location.pathname.includes("sale-purchase-by-party")) return "Sale Purchase By Party";
    return "Sale";
  };

  const [activeReport, setActiveReport] = useState(getInitialReport);

  useEffect(() => {
    if (defaultReport) {
      setActiveReport(defaultReport);
    } else if (location.pathname.includes("profit-and-loss")) {
      setActiveReport("Profit And Loss");
    } else if (location.pathname.includes("all-transactions")) {
      setActiveReport("All Transactions");
    } else if (location.pathname.includes("cash-flow")) {
      setActiveReport("Cash flow");
    } else if (location.pathname.includes("all-parties")) {
      setActiveReport("All parties");
    } else if (location.pathname.includes("party-report-by-item")) {
      setActiveReport("Party Report By Item");
    } else if (location.pathname.includes("sale-purchase-by-party")) {
      setActiveReport("Sale Purchase By Party");
    }
  }, [defaultReport, location.pathname]);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("This Month");

  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-01`;
  });

  const [to, setTo] = useState(() => localDate());
  const [store, setStore] = useState("All Stores");
  const [user, setUser] = useState("All Users");
  const [chartOpen, setChartOpen] = useState(false);
  const [transactionType, setTransactionType] = useState("All Transaction");
  const [paymentFilter, setPaymentFilter] = useState("All Payment");

  const isDayBook = activeReport === "Day book";
  const isAllTransactions = activeReport === "All Transactions";
  const isPurchase = ["Purchase", "Purchase Bills"].includes(activeReport);

  const sales = useMemo(
    () => readLocal("ledgerly:saleInvoices.v1"),
    []
  );

  const purchases = useMemo(
    () => readLocal("ledgerly:purchaseBills.v1"),
    []
  );

  const allLocalTransactions = useMemo(
    () => [
      ...sales.map((row) => ({ ...row, reportType: "Sale" })),
      ...purchases.map((row) => ({ ...row, reportType: "Purchase" })),
      ...localList("ledgerly:saleOrders.v1").map((row) => ({
        ...row,
        reportType: "Sale Order",
      })),
      ...localList("ledgerly:purchaseOrders.v1").map((row) => ({
        ...row,
        reportType: "Purchase Order",
      })),
      ...localList("ledgerly:deliveryChallans.v1").map((row) => ({
        ...row,
        reportType: "Delivery Challan",
      })),
      ...localList("ledgerly:saleReturns.v1").map((row) => ({
        ...row,
        reportType: "Credit Note",
      })),
      ...localList("ledgerly:paymentIns.v1").map((row) => ({
        ...row,
        reportType: "Payment-In",
      })),
      ...localList("ledgerly:paymentOuts.v1").map((row) => ({
        ...row,
        reportType: "Payment-Out",
      })),
      ...localList("ledgerly:expenses.v1").map((row) => ({
        ...row,
        reportType: "Expense",
      })),
      ...localList("ledgerly:cashAdjustments.v1").map((row) => ({
        ...row,
        reportType: row.type || "Cash Adjustment",
      })),
      ...localList("ledgerly:estimateQuotations.v1").map((row) => ({
        ...row,
        reportType: "Estimate",
      })),
    ],
    [sales, purchases]
  );

  const records = useMemo(() => {
    if (["Purchase", "Purchase Bills"].includes(activeReport)) {
      return purchases.map((row) => ({
        ...row,
        reportType: "Purchase",
      }));
    }

    if (["Sale", "Sale Invoices"].includes(activeReport)) {
      return sales.map((row) => ({
        ...row,
        reportType: "Sale",
      }));
    }

    if (
      [
        "All Transactions",
        "Day book",
        "Profit And Loss",
        "Cash flow",
      ].includes(activeReport)
    ) {
      return allLocalTransactions;
    }

    if (
      [
        "All parties",
        "Party Statement",
        "Party wise Profit & Loss",
      ].includes(activeReport)
    ) {
      return readLocal("ledgerly:parties.v1").map((party) => ({
        ...party,
        reportType: "Party",
        createdAt: party.createdAt || party.updatedAt,
      }));
    }

    return [];
  }, [activeReport, purchases, sales, allLocalTransactions]);

  const storeOptions = useMemo(
    () => [...new Set(records.map(storeOf).filter(Boolean))],
    [records]
  );

  const userOptions = useMemo(
    () => [...new Set(records.map(userOf).filter(Boolean))],
    [records]
  );

  const visible = useMemo(
    () =>
      records
        .filter((row) => {
          const date = dateOf(row);
          const amount = amountOf(row);
          const party = partyOf(row);
          const no = referenceOf(row);

          const typeMatches =
            transactionType === "All Transaction" ||
            row.reportType === transactionType;

          const paymentMatches =
            paymentFilter === "All Payment" ||
            paymentTypeOf(row) === paymentFilter;

          const dateMatches = isDayBook
            ? !to || !date || date === to
            : (!from || !date || date >= from) &&
              (!to || !date || date <= to);

          return (
            dateMatches &&
            (store === "All Stores" || storeOf(row) === store) &&
            (user === "All Users" || userOf(row) === user) &&
            (activeReport !== "All Transactions" ||
              (typeMatches && paymentMatches)) &&
            `${party} ${no} ${row.reportType} ${amount}`
              .toLowerCase()
              .includes(search.trim().toLowerCase())
          );
        })
        .sort((a, b) => dateOf(b).localeCompare(dateOf(a))),
    [
      records,
      from,
      to,
      search,
      store,
      user,
      activeReport,
      transactionType,
      paymentFilter,
      isDayBook,
    ]
  );

  const totals = visible.reduce(
    (sum, row) => {
      const amount = amountOf(row);
      const received = receivedOf(row);

      sum.amount += amount;
      sum.received += received;
      sum.balance += Math.max(0, amount - received);

      return sum;
    },
    { amount: 0, received: 0, balance: 0 }
  );

  const paidTotal = visible.reduce(
    (sum, row) => sum + Math.min(amountOf(row), receivedOf(row)),
    0
  );

  const unpaidTotal = visible.reduce(
    (sum, row) => sum + Math.max(0, amountOf(row) - receivedOf(row)),
    0
  );

  const moneyIn = visible.reduce(
    (sum, row) =>
      sum +
      (["Sale", "Sale Order", "Payment-In", "Cash Increase"].includes(
        row.reportType
      )
        ? row.reportType === "Payment-In"
          ? amountOf(row)
          : receivedOf(row)
        : 0),
    0
  );

  const moneyOut = visible.reduce(
    (sum, row) =>
      sum +
      ([
        "Purchase",
        "Purchase Order",
        "Payment-Out",
        "Expense",
        "Credit Note",
        "Cash Decrease",
      ].includes(row.reportType)
        ? ["Payment-Out", "Expense"].includes(row.reportType)
          ? amountOf(row)
          : receivedOf(row)
        : 0),
    0
  );

  const netMoney = moneyIn - moneyOut;

  const exportCsv = () => {
    const headings = [
      "Date",
      "Invoice no",
      "Party Name",
      "Transaction",
      "Payment Type",
      "Amount",
      "Balance",
      "Status",
    ];

    const lines = visible.map((row) => {
      const amount = amountOf(row);
      const received = receivedOf(row);

      return [
        dateOf(row),
        referenceOf(row),
        partyOf(row),
        row.reportType || activeReport,
        paymentTypeOf(row),
        amount,
        Math.max(0, amount - received),
        received >= amount ? "Paid" : "Partial",
      ];
    });

    const csv = [headings, ...lines]
      .map((line) =>
        line
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], {
        type: "text/csv;charset=utf-8",
      })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeReport
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")}-report.csv`;

    link.click();
    URL.revokeObjectURL(url);
  };

  const columns =
    activeReport === "All parties" || activeReport === "Party Statement"
      ? ["Party Name", "Phone", "Amount", "Updated"]
      : isDayBook
        ? [
            "Name",
            "Ref. No.",
            "Type",
            "Payment Type",
            "Total",
            "Money In",
            "Money Out",
            "Print / Share",
          ]
        : isAllTransactions
          ? [
              "#",
              "Date",
              "Ref. No.",
              "Party Name",
              "Category",
              "Type",
              "Total",
              "Received",
              "Balance",
              "Print / Share",
              "Status",
              "Actions",
            ]
          : isPurchase
            ? [
                "Date",
                "Invoice No.",
                "Party Name",
                "Payment Type",
                "Amount",
                "Balance Due",
                "Status",
                "Actions",
              ]
            : [
                "Date",
                "Invoice no",
                "Party Name",
                "Transaction",
                "Payment Type",
                "Amount",
                "Balance",
                "Status",
                "Actions",
              ];

  const getStatus = (row, amount, received) => {
    if (
      ["Cancelled", "Unused", "Unpaid", "Partial", "Paid"].includes(
        row.status
      )
    ) {
      return row.status;
    }

    if (amount > 0) {
      if (received >= amount) return "Paid";
      if (received > 0) return "Partial";
      return "Unpaid";
    }

    return row.status || "—";
  };

  const statusClass = (status) => {
    if (status === "Paid") return "text-emerald-600";
    if (status === "Cancelled") return "text-rose-500";
    if (status === "Unused") return "text-sky-600";
    if (status === "Partial") return "text-blue-600";
    return "text-orange-500";
  };

  const handleShare = (invoiceNo, party, amount) => {
    const text = `${invoiceNo} | ${party} | ${money(amount)}`;

    if (navigator.share) {
      navigator
        .share({
          title: `Transaction ${invoiceNo}`,
          text: `${party} - ${money(amount)}`,
        })
        .catch(() => {});
    } else {
      window.prompt("Copy transaction details", text);
    }
  };

  const cell = (content, className = "") => (
    <td
      className={`border-b border-slate-100 px-3 py-3 ${className}`}
    >
      {content}
    </td>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[#eaf0f6] text-[#263b57]">
      {/* Report sidebar */}
      <aside className="hidden h-full min-h-0 w-[248px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white md:block">
        {reportGroups.map((group) => (
          <section key={group.heading}>
            <h2 className="sticky top-0 z-10 bg-[#eff8f7] px-3 py-3 text-sm font-medium text-slate-500">
              {group.heading}
            </h2>

            {group.reports.map((report) => (
              <button
                key={report}
                type="button"
                onClick={() => {
                  setActiveReport(report);
                  setSearch("");
                  setStore("All Stores");
                  setUser("All Users");
                  if (report === "All Transactions") {
                    navigate("/reports/all-transactions", { replace: true });
                  } else if (report === "Profit And Loss") {
                    navigate("/reports/profit-and-loss", { replace: true });
                  } else if (report === "Cash flow") {
                    navigate("/reports/cash-flow", { replace: true });
                  } else if (report === "All parties") {
                    navigate("/reports/all-parties", { replace: true });
                  } else if (report === "Party Report By Item") {
                    navigate("/reports/party-report-by-item", { replace: true });
                  } else if (report === "Sale Purchase By Party") {
                    navigate("/reports/sale-purchase-by-party", { replace: true });
                  } else {
                    navigate("/reports", { replace: true });
                  }
                }}
                className={`w-full border-l-4 px-4 py-3 text-left text-sm transition-colors ${
                  activeReport === report
                    ? "border-sky-600 bg-slate-100 font-semibold text-[#263b57]"
                    : "border-transparent text-[#313b50] hover:bg-slate-50"
                }`}
              >
                {report}
              </button>
            ))}
          </section>
        ))}
      </aside>

      {/* Main content */}
      {activeReport === "All Transactions" ? (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <AllTransactionsReport />
        </div>
      ) : activeReport === "Profit And Loss" ? (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <ProfitAndLossReport />
        </div>
      ) : activeReport === "Cash flow" ? (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <CashFlowReport />
        </div>
      ) : activeReport === "All parties" ? (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <AllPartiesReport />
        </div>
      ) : activeReport === "Party Report By Item" ? (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <PartyReportByItem />
        </div>
      ) : activeReport === "Sale Purchase By Party" ? (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <SalePurchaseByPartyReport />
        </div>
      ) : (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden p-1.5">
        <header className="flex min-h-[64px] items-center justify-between gap-3 rounded-md bg-white px-4">
          <h1 className="text-xl font-semibold">
            {reportTitle(activeReport)}
          </h1>

          {activeReport === "Sale" && (
            <button
              type="button"
              onClick={() => navigate("/sales/sale-invoices/new")}
              className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            >
              ＋ Add Sale
            </button>
          )}

          {isPurchase && (
            <div className="flex gap-3">
              <button
                type="button"
                className="rounded-full border border-rose-500 px-5 py-2 font-medium text-rose-600"
              >
                Upload Purchase Bills　⌄
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate("/purchase-expense/purchase-bills/new")
                }
                className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white"
              >
                ＋ Add Purchase
              </button>
            </div>
          )}
        </header>

        {/* Filters */}
        <section
          className={`flex flex-wrap items-center gap-3 rounded-md bg-white px-4 py-4 ${
            isAllTransactions ? "min-h-[174px] content-start" : ""
          }`}
        >
          {!isDayBook && (
            <>
              <span className="text-sm font-medium">
                {isPurchase ? "Filter by:" : ""}
              </span>

              <label className="rounded-full bg-sky-100 px-4 py-2 text-sm">
                <select
                  aria-label="Report period"
                  value={period}
                  onChange={(event) => {
                    const selected = event.target.value;
                    setPeriod(selected);

                    const now = new Date();

                    if (selected === "This Month") {
                      const last = new Date(
                        now.getFullYear(),
                        now.getMonth() + 1,
                        0
                      );

                      setFrom(
                        `${now.getFullYear()}-${String(
                          now.getMonth() + 1
                        ).padStart(2, "0")}-01`
                      );

                      setTo(
                        `${last.getFullYear()}-${String(
                          last.getMonth() + 1
                        ).padStart(2, "0")}-${String(
                          last.getDate()
                        ).padStart(2, "0")}`
                      );
                    } else if (selected === "This Year") {
                      setFrom(`${now.getFullYear()}-01-01`);
                      setTo(`${now.getFullYear()}-12-31`);
                    } else {
                      setFrom("");
                      setTo("");
                    }
                  }}
                  className="bg-transparent outline-none"
                >
                  <option>This Month</option>
                  <option>This Year</option>
                  <option>All Time</option>
                  <option>Custom</option>
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-2 rounded-full bg-sky-100 px-4 py-2 text-sm">
                <span>▦</span>

                <input
                  aria-label="Start date"
                  type="date"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setPeriod("Custom");
                  }}
                  className="w-[132px] bg-transparent outline-none"
                />

                <span>To</span>

                <input
                  aria-label="End date"
                  type="date"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setPeriod("Custom");
                  }}
                  className="w-[132px] bg-transparent outline-none"
                />
              </div>
            </>
          )}

          {isDayBook && (
            <label className="rounded border border-slate-300 px-4 py-2 text-sm">
              <span className="mr-3 text-slate-500">Date</span>

              <input
                aria-label="Day book date"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setFrom(event.target.value);
                }}
                className="bg-transparent outline-none"
              />
            </label>
          )}

          <label className="rounded-full bg-sky-100 px-4 py-2 text-sm">
            <select
              aria-label="Firm filter"
              value={store}
              onChange={(event) => setStore(event.target.value)}
              className="bg-transparent outline-none"
            >
              <option>All Stores</option>
              {storeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          {!isDayBook && (
            <label className="rounded-full bg-sky-100 px-4 py-2 text-sm">
              <select
                aria-label="User filter"
                value={user}
                onChange={(event) => setUser(event.target.value)}
                className="bg-transparent outline-none"
              >
                <option>All Users</option>
                {userOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          )}

          {isAllTransactions && (
            <div className="basis-full h-0" aria-hidden="true" />
          )}

          {isAllTransactions && (
            <>
              <label className="rounded border border-slate-300 px-4 py-2 text-sm">
                <select
                  aria-label="Transaction type"
                  value={transactionType}
                  onChange={(event) =>
                    setTransactionType(event.target.value)
                  }
                  className="bg-transparent outline-none"
                >
                  <option>All Transaction</option>

                  {[...new Set(records.map((row) => row.reportType))].map(
                    (type) => (
                      <option key={type}>{type}</option>
                    )
                  )}
                </select>
              </label>

              <label className="rounded border border-slate-300 px-4 py-2 text-sm">
                <select
                  aria-label="Payment filter"
                  value={paymentFilter}
                  onChange={(event) => setPaymentFilter(event.target.value)}
                  className="bg-transparent outline-none"
                >
                  <option>All Payment</option>

                  {[...new Set(records.map(paymentTypeOf).filter(Boolean))].map(
                    (type) => (
                      <option key={type}>{type}</option>
                    )
                  )}
                </select>
              </label>
            </>
          )}

          {isDayBook && (
            <div className="ml-auto flex items-center gap-4 text-sm">
              <button type="button" onClick={exportCsv}>
                ▣ Excel Report
              </button>

              <button type="button" onClick={() => window.print()}>
                ▣ Print
              </button>
            </div>
          )}
        </section>

        {/* Summary cards: hidden for All Transactions */}
        {!isDayBook && !isAllTransactions && (
          <section className="min-h-[145px] rounded-md bg-white p-4">
            {isPurchase ? (
              <div className="flex flex-wrap items-center gap-4">
                {[
                  ["Paid", paidTotal, "bg-emerald-100"],
                  ["Unpaid", unpaidTotal, "bg-blue-100"],
                  ["Total", totals.amount, "bg-orange-200"],
                ].map(([label, amount, color], index) => (
                  <div
                    key={label}
                    className="flex items-center gap-4"
                  >
                    <div
                      className={`min-w-[190px] rounded-xl ${color} px-5 py-4`}
                    >
                      <p>{label}</p>
                      <strong className="text-xl">{money(amount)}</strong>
                    </div>

                    {index === 0 && <b className="text-2xl">+</b>}
                    {index === 1 && <b className="text-2xl">=</b>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="inline-block min-w-[340px] rounded-lg border border-violet-200 bg-[#fcf9ff] px-4 py-3">
                <p className="text-sm text-slate-500">
                  {activeReport === "Sale"
                    ? "Total Sales Amount"
                    : `Total ${reportTitle(activeReport)}`}
                </p>

                <p className="text-2xl font-bold">
                  {money(totals.amount)}
                </p>

                <p className="mt-4 text-sm text-slate-500">
                  Received:{" "}
                  <strong className="text-slate-700">
                    {money(totals.received)}
                  </strong>

                  <span className="mx-3 text-slate-300">|</span>

                  Balance:{" "}
                  <strong className="text-slate-700">
                    {money(totals.balance)}
                  </strong>
                </p>
              </div>
            )}
          </section>
        )}

        {/* Transactions table */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-white">
          <div
            className={`flex min-h-[64px] flex-wrap items-center justify-between gap-3 px-4 ${
              isAllTransactions ? "min-h-[54px]" : ""
            }`}
          >
            <h2 className="text-lg font-semibold">Transactions</h2>

            <div className="flex items-center gap-4 text-slate-500">
              <label
                className={`flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 ${
                  isAllTransactions ? "w-[280px]" : ""
                }`}
              >
                <FiSearch />

                <input
                  aria-label="Search report"
                  placeholder={
                    isAllTransactions
                      ? "Search"
                      : `Search ${activeReport.toLowerCase()}`
                  }
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>

              <button
                type="button"
                title="Toggle chart"
                aria-label="Toggle chart"
                onClick={() => setChartOpen((value) => !value)}
                className={`text-xl ${
                  chartOpen ? "text-sky-600" : ""
                }`}
              >
                <FiBarChart2 />
              </button>

              <button
                type="button"
                title="Download Excel-compatible CSV"
                aria-label="Download report"
                onClick={exportCsv}
                className="rounded bg-emerald-600 px-1.5 py-1 text-xs font-bold text-white"
              >
                xls
              </button>

              <button
                type="button"
                title="Print report"
                aria-label="Print report"
                onClick={() => window.print()}
                className="text-xl"
              >
                <FiPrinter />
              </button>
            </div>
          </div>

          {chartOpen && (
            <div className="mx-4 mb-3 rounded-md border border-slate-100 bg-slate-50 p-3">
              <p className="mb-2 text-sm text-slate-500">
                {reportTitle(activeReport)} overview
              </p>

              <div className="flex h-20 items-end gap-2">
                {visible.slice(0, 12).map((row, index) => {
                  const amount = amountOf(row);

                  const max = Math.max(
                    1,
                    ...visible.map((item) => amountOf(item))
                  );

                  return (
                    <div
                      key={row.id || index}
                      title={money(amount)}
                      className="min-w-3 flex-1 rounded-t bg-sky-500"
                      style={{
                        height: `${Math.max(5, (amount / max) * 100)}%`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            <table
              className={`w-full ${
                isAllTransactions
                  ? "min-w-[1180px]"
                  : isDayBook
                    ? "min-w-[900px]"
                    : "min-w-[760px]"
              } border-collapse text-left text-sm`}
            >
              <thead className="sticky top-0 z-[1] bg-slate-50 text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-semibold"
                    >
                      {column}

                      {!["Actions", "Print / Share"].includes(column) && (
                        <span className="ml-2 inline-flex text-slate-400">
                          {isAllTransactions ? (
                            <FiFilter size={13} />
                          ) : (
                            "▽"
                          )}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visible.map((row, index) => {
                  const amount = amountOf(row);
                  const received = receivedOf(row);
                  const party = partyOf(row);
                  const invoiceNo = referenceOf(row) || index + 1;
                  const balance = Math.max(0, amount - received);
                  const type = row.reportType || activeReport;

                  const isIncoming = [
                    "Sale",
                    "Sale Order",
                    "Payment-In",
                    "Cash Increase",
                  ].includes(type);

                  const isOutgoing = [
                    "Purchase",
                    "Purchase Order",
                    "Payment-Out",
                    "Expense",
                    "Credit Note",
                    "Cash Decrease",
                  ].includes(type);

                  const incomingAmount = isIncoming
                    ? ["Payment-In", "Cash Increase"].includes(type)
                      ? amount
                      : received
                    : 0;

                  const outgoingAmount = isOutgoing
                    ? [
                        "Payment-Out",
                        "Expense",
                        "Credit Note",
                        "Cash Decrease",
                      ].includes(type)
                      ? amount
                      : received
                    : 0;

                  const status = getStatus(row, amount, received);

                  return (
                    <tr
                      key={`${row.id || invoiceNo}-${index}`}
                      className="odd:bg-white even:bg-slate-50/70 hover:bg-sky-50"
                    >
                      {activeReport === "All parties" ||
                      activeReport === "Party Statement" ? (
                        <>
                          {cell(party)}
                          {cell(row.phone || "—")}
                          {cell(money(row.openingBalance || 0))}
                          {cell(row.updatedAt?.slice(0, 10) || "—")}
                        </>
                      ) : isDayBook ? (
                        <>
                          {cell(party)}
                          {cell(invoiceNo, "text-right")}
                          {cell(type)}
                          {cell(paymentTypeOf(row))}
                          {cell(money(amount), "text-right")}

                          {cell(
                            incomingAmount ? money(incomingAmount) : "—",
                            "text-right text-emerald-700"
                          )}

                          {cell(
                            outgoingAmount ? money(outgoingAmount) : "—",
                            "text-right text-rose-600"
                          )}

                          {cell(
                            <button
                              type="button"
                              onClick={() => window.print()}
                              className="text-slate-500 hover:text-sky-600"
                              title="Print day book"
                            >
                              Print
                            </button>
                          )}
                        </>
                      ) : isAllTransactions ? (
                        <>
                          {cell(index + 1)}
                          {cell(
                            dateOf(row) || "—",
                            "whitespace-nowrap"
                          )}
                          {cell(invoiceNo, "text-right")}
                          {cell(party)}
                          {cell(row.category || row.form?.category || "—")}
                          {cell(type)}

                          {cell(
                            amount ? money(amount) : "—",
                            "whitespace-nowrap text-right"
                          )}

                          {cell(
                            received ? money(received) : "—",
                            "whitespace-nowrap text-right"
                          )}

                          {cell(
                            amount ? money(balance) : "—",
                            "whitespace-nowrap text-right"
                          )}

                          {cell(
                            <div className="flex items-center gap-3 text-slate-500">
                              <button
                                type="button"
                                onClick={() => window.print()}
                                title="Print transaction"
                                aria-label="Print transaction"
                                className="hover:text-sky-600"
                              >
                                <FiPrinter size={19} />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleShare(invoiceNo, party, amount)
                                }
                                title="Share transaction"
                                aria-label="Share transaction"
                                className="hover:text-sky-600"
                              >
                                <FiShare2 size={18} />
                              </button>
                            </div>
                          )}

                          {cell(
                            status,
                            `font-medium ${statusClass(status)}`
                          )}

                          {cell(
                            <button
                              type="button"
                              title="More actions"
                              aria-label="More actions"
                              onClick={() => window.print()}
                              className="text-slate-500 hover:text-sky-600"
                            >
                              <FiMoreVertical size={18} />
                            </button>
                          )}
                        </>
                      ) : isPurchase ? (
                        <>
                          {cell(dateOf(row) || "—")}
                          {cell(invoiceNo, "text-right")}
                          {cell(party)}
                          {cell(paymentTypeOf(row))}
                          {cell(
                            amount ? money(amount) : "—",
                            "text-right"
                          )}
                          {cell(
                            amount ? money(balance) : "—",
                            "text-right"
                          )}
                          {cell(
                            status,
                            `font-medium ${statusClass(status)}`
                          )}
                          {cell(
                            <button
                              type="button"
                              onClick={() => window.print()}
                              className="text-slate-500 hover:text-sky-600"
                              title="Print purchase bill"
                            >
                              Print
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {cell(dateOf(row) || "—")}
                          {cell(invoiceNo, "text-right")}
                          {cell(party)}
                          {cell(type)}
                          {cell(paymentTypeOf(row))}
                          {cell(
                            amount ? money(amount) : "—",
                            "text-right"
                          )}
                          {cell(
                            amount ? money(balance) : "—",
                            "text-right"
                          )}
                          {cell(
                            status,
                            `font-medium ${statusClass(status)}`
                          )}
                          {cell(
                            type === "Sale" && (
                              <button
                                type="button"
                                onClick={() =>
                                  navigate("/sales/sale-invoices/new", {
                                    state: { editInvoice: row },
                                  })
                                }
                                className="text-slate-500 hover:text-sky-600"
                              >
                                View/Edit
                              </button>
                            )
                          )}
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {visible.length === 0 && (
              <div className="grid min-h-40 place-items-center text-sm text-slate-500">
                {records.length
                  ? "No transactions match these filters."
                  : "No report data to show yet."}
              </div>
            )}
          </div>

          {isDayBook && visible.length > 0 && (
            <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 px-4 py-4 text-sm font-semibold">
              <span className="text-emerald-600">
                Total Money-In: {money(moneyIn)}
              </span>

              <span className="text-rose-500">
                Total Money-Out: {money(moneyOut)}
              </span>

              <span
                className={
                  netMoney >= 0 ? "text-emerald-600" : "text-rose-500"
                }
              >
                Money In - Money Out: {money(netMoney)}
              </span>
            </footer>
          )}
        </section>
      </div>
      )}
    </div>
  );
}

export default Reports;