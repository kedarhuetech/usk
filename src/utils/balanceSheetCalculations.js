import { buildCashFlowEntries, parseYMD, isVoided } from "./cashFlowCalculations.js";

const n = (value) => { const amount = Number(value); return Number.isFinite(amount) ? amount : 0; };
const amount = (row) => n(row?.totals?.finalTotal ?? row?.totals?.grandTotal ?? row?.totalAmount ?? row?.total ?? row?.amount ?? 0);
const dateOf = (row) => parseYMD(row?.form?.invoiceDate || row?.form?.billDate || row?.date || row?.createdAt);
const live = (row) => !isVoided(row) && !["cancelled", "canceled", "void", "deleted"].includes(String(row?.status || "").toLowerCase());
const cents = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;

export function calculateBalanceSheet({ transactions = {}, accounts = [], bankAccounts = [], bankTransactions = [], bankUnavailable = false, loans = [], asOfDate }) {
  const asOf = parseYMD(asOfDate);
  const before = (row) => { const date = dateOf(row); return live(row) && date && (!asOf || date <= asOf); };
  const sales = (transactions.sales || []).filter(before);
  const purchases = (transactions.purchases || []).filter(before);
  const saleReturns = (transactions.saleReturns || []).filter(before);
  const purchaseReturns = [...(transactions.purchaseReturns || []), ...(transactions.purchaseDebitNotes || [])].filter(before);
  const paymentsIn = (transactions.paymentIns || []).filter(before);
  const paymentsOut = (transactions.paymentOuts || []).filter(before);
  const expenses = (transactions.expenses || []).filter(before);
  const receiptByInvoice = new Map();
  for (const p of paymentsIn) { const id = p.linkedInvoiceId || p.invoiceId; if (id) receiptByInvoice.set(String(id), (receiptByInvoice.get(String(id)) || 0) + amount(p)); }
  const paidByBill = new Map();
  for (const p of paymentsOut) { const id = p.linkedInvoiceId || p.billId || p.purchaseId; if (id && !p.linkedCreditNoteId) paidByBill.set(String(id), (paidByBill.get(String(id)) || 0) + amount(p)); }
  const ar = sales.reduce((sum, row) => {
    const total = amount(row), id = String(row.id || row.invoiceId || "");
    const receivedAtCreation = n(row.totals?.received ?? row.receivedAmount ?? (row.saleType === "cash" ? total : 0));
    const received = Math.max(receivedAtCreation, receiptByInvoice.get(id) || 0);
    return sum + Math.max(0, total - received - n(row.creditNoteAppliedAmount));
  }, 0);
  const customerCredits = saleReturns.reduce((sum, row) => sum + Math.max(0, n(row.customerCreditAmount ?? (amount(row) - n(row.received) - n(row.adjustedAmount)))), 0);
  const returnsByBill = new Map();
  for (const row of purchaseReturns) {
    const bill = String(row.billId || row.purchaseId || row.billNumber || row.invoiceNumber || "");
    if (bill) returnsByBill.set(bill, (returnsByBill.get(bill) || 0) + amount(row));
  }
  const ap = purchases.reduce((sum, row) => {
    const total = amount(row), id = String(row.id || "");
    const paid = Math.max(n(row.totals?.received ?? row.paidAmount ?? (row.form?.paymentType === "Cash" ? total : 0)), paidByBill.get(id) || 0);
    const ref = String(row.form?.invoiceNumber || row.invoiceNumber || row.billNumber || row.number || "");
    return sum + Math.max(0, total - paid - Math.max(returnsByBill.get(id) || 0, returnsByBill.get(ref) || 0));
  }, 0);
  const outstandingExpenses = expenses.reduce((sum, row) => {
    const total = amount(row);
    const paid = Array.isArray(row.payments) ? row.payments.reduce((value, payment) => value + n(payment.amount), 0) : n(row.paid ?? row.received);
    return sum + Math.max(0, total - paid);
  }, 0);
  const loanRows = loans.filter((loan) => loan.status === "Active" && (!asOf || !loan.startDate || loan.startDate <= asOf)).map((loan) => {
    const repaid = (loan.repayments || []).filter((repayment) => !asOf || repayment.paymentDate <= asOf).reduce((sum, repayment) => sum + n(repayment.principalPaid), 0);
    return { id: `loan:${loan.id}`, name: `Loan — ${loan.loanName || loan.lenderName || "Account"}`, amount: cents(Math.max(0, n(loan.originalAmount) - repaid)) };
  }).filter((loan) => loan.amount > 0);

  const cashEntries = buildCashFlowEntries({ sales: transactions.sales || [], purchases: transactions.purchases || [], paymentIns: transactions.paymentIns || [], paymentOuts: transactions.paymentOuts || [], expenses: transactions.expenses || [], adjustments: transactions.cashAdjustments || [], bankTransactions: [], saleInvoiceUi: transactions.saleUi || {} });
  const cashPortion = (entry) => {
    if (Array.isArray(entry.raw?.payments) && entry.raw.payments.length) return entry.raw.payments.filter((part) => String(part.type || "").toLowerCase() === "cash").reduce((sum, part) => sum + n(part.amount), 0);
    return String(entry.paymentMethod || "").trim().toLowerCase() === "cash" ? n(entry.cashIn) + n(entry.cashOut) : 0;
  };
  const cash = cents(cashEntries.filter((entry) => {
    const d = parseYMD(entry.date); return d && (!asOf || d <= asOf) && !entry.isDuplicate;
  }).reduce((sum, entry) => sum + (entry.cashIn > 0 ? cashPortion(entry) : 0) - (entry.cashOut > 0 ? cashPortion(entry) : 0), 0) - paymentsOut.filter((payment) => payment.linkedCreditNoteId).filter((payment) => !asOf || dateOf(payment) <= asOf).reduce((sum, payment) => {
    const cashRefund = Array.isArray(payment.payments)
      ? payment.payments.filter((part) => String(part.type || "").toLowerCase() === "cash").reduce((total, part) => total + n(part.amount), 0)
      : String(payment.paymentType || "").toLowerCase().includes("cash") ? amount(payment) : 0;
    return sum + cashRefund;
  }, 0));
  const bankRows = bankAccounts.map((account) => {
    const openingDate = parseYMD(account.openingBalanceDate);
    const opening = !openingDate || !asOf || openingDate <= asOf ? n(account.openingBalance) : 0;
    const movement = bankTransactions.filter((transaction) => transaction.accountId === account.id && parseYMD(transaction.date) && (!asOf || parseYMD(transaction.date) <= asOf))
      .reduce((sum, transaction) => sum + (transaction.type === "money-in" ? 1 : transaction.type === "money-out" ? -1 : 0) * n(transaction.amount), 0);
    return { id: `bank:${account.id}`, name: `Bank — ${account.accountName || account.bankName || "Account"}`, amount: cents(opening + movement) };
  });

  const inventoryRows = (transactions.items || []).filter((item) => String(item.type || "product").toLowerCase() === "product" && !item.deleted && !item.isDeleted);
  const missingCosts = [];
  const inventory = inventoryRows.reduce((sum, item) => {
    const qty = n(item.stock ?? item.openingQuantity ?? item.quantity);
    const cost = n(item.purchasePrice ?? item.atPrice);
    if (qty > 0 && cost <= 0) missingCosts.push(item.itemName || item.name || item.id || "Unnamed item");
    return sum + Math.max(0, qty) * Math.max(0, cost);
  }, 0);

  const custom = accounts.filter((account) => !account.openingBalanceDate || !asOf || account.openingBalanceDate <= asOf);
  const assets = [
    { id: "cash", name: "Cash in Hand", amount: cash },
    ...bankRows,
    { id: "receivable", name: "Accounts Receivable", amount: cents(ar) },
    { id: "inventory", name: "Inventory / Stock at recorded purchase cost", amount: cents(inventory) },
    ...custom.filter((account) => account.group === "currentAsset").map((account) => ({ id: account.id, name: account.name, amount: n(account.openingBalance), account: true })),
  ];
  const nonCurrentAssets = custom.filter((account) => account.group === "nonCurrentAsset").map((account) => ({ id: account.id, name: account.name, amount: n(account.openingBalance), account: true }));
  const liabilities = [
    { id: "payable", name: "Accounts Payable", amount: cents(ap) },
    { id: "expense-payable", name: "Outstanding Expenses", amount: cents(outstandingExpenses) },
    { id: "customer-credits", name: "Customer Credit Notes Payable", amount: cents(customerCredits) },
    ...custom.filter((account) => account.group === "currentLiability").map((account) => ({ id: account.id, name: account.name, amount: n(account.openingBalance), account: true })),
  ];
  const nonCurrentLiabilities = [...loanRows, ...custom.filter((account) => account.group === "nonCurrentLiability").map((account) => ({ id: account.id, name: account.name, amount: n(account.openingBalance), account: true }))];
  const equity = custom.filter((account) => account.group === "equity").map((account) => ({ id: account.id, name: account.name, amount: (account.balanceDirection === "debit" ? -1 : 1) * n(account.openingBalance), account: true }));
  const totalCurrentAssets = cents(assets.reduce((sum, row) => sum + row.amount, 0));
  const totalNonCurrentAssets = cents(nonCurrentAssets.reduce((sum, row) => sum + row.amount, 0));
  const totalCurrentLiabilities = cents(liabilities.reduce((sum, row) => sum + row.amount, 0));
  const totalNonCurrentLiabilities = cents(nonCurrentLiabilities.reduce((sum, row) => sum + row.amount, 0));
  const totalAssets = cents(totalCurrentAssets + totalNonCurrentAssets);
  const totalLiabilities = cents(totalCurrentLiabilities + totalNonCurrentLiabilities);
  const totalEquity = cents(equity.reduce((sum, row) => sum + row.amount, 0));
  const totalLiabilitiesAndEquity = cents(totalLiabilities + totalEquity);
  const difference = cents(totalAssets - totalLiabilitiesAndEquity);
  const hasEquityOpening = equity.length > 0;
  const warnings = [];
  if (!hasEquityOpening) warnings.push("Owner capital and retained earnings have not been entered. The report does not create a balancing adjustment.");
  if (missingCosts.length) warnings.push(`Purchase cost is missing for ${missingCosts.length} stocked item(s): ${missingCosts.slice(0, 6).join(", ")}${missingCosts.length > 6 ? "…" : ""}. These items are excluded from stock value.`);
  if (!inventoryRows.length) warnings.push("No product inventory records were found.");
  if (!sales.length && !purchases.length) warnings.push("No dated sales or purchase records were found by the selected date.");
  if (bankUnavailable) warnings.push("Bank balances could not be loaded from the bank account service.");
  if (loanRows.length) warnings.push("Loan balances are taken from recorded principal outstanding; the app does not classify each repayment’s next-12-month principal portion.");
  if (loanRows.length) warnings.push("Loan records do not link proceeds or repayments to a cash or bank account, so those movements are not included in cash balances.");
  if (sales.some((row) => n(row.totals?.received ?? row.receivedAmount) > 0) || purchases.some((row) => n(row.totals?.received ?? row.paidAmount) > 0)) warnings.push("Invoice paid-to-date fields do not retain dated allocation history; historical receivable and payable amounts may reflect later payments.");
  if (cashEntries.some((entry) => String(entry.paymentMethod || "").includes(",") && !Array.isArray(entry.raw?.payments))) warnings.push("Some mixed-payment records do not split cash from bank/card amounts; their totals are excluded from cash in hand until payment allocations are recorded.");
  warnings.push("Inventory uses the currently saved stock quantities; the app does not keep dated stock movement history for historical inventory balances.");
  warnings.push("Current-period profit or loss and retained earnings are not auto-posted: the Profit & Loss report estimates some missing inventory costs. Enter verified balances as Owner’s Equity accounts.");
  return { assets, nonCurrentAssets, liabilities, nonCurrentLiabilities, equity, totalCurrentAssets, totalNonCurrentAssets, totalAssets, totalCurrentLiabilities, totalNonCurrentLiabilities, totalLiabilities, totalEquity, totalLiabilitiesAndEquity, difference, reconciles: Math.abs(difference) < 0.01 && hasEquityOpening && missingCosts.length === 0, warnings, missingCosts, asOfDate: asOf };
}

export const balanceSheetAccountGroups = [
  { value: "currentAsset", label: "Other Current Asset" }, { value: "nonCurrentAsset", label: "Fixed / Long-Term Asset" },
  { value: "currentLiability", label: "Current Liability" }, { value: "nonCurrentLiability", label: "Long-Term Liability" }, { value: "equity", label: "Owner Capital / Drawings / Retained Earnings" },
];

export function validateBalanceSheetAccount(account) {
  if (!String(account.name || "").trim()) return "Enter an account name.";
  if (!balanceSheetAccountGroups.some((group) => group.value === account.group)) return "Select an account type.";
  if (!Number.isFinite(Number(account.openingBalance)) || Number(account.openingBalance) < 0) return "Opening balance must be zero or more.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(account.openingBalanceDate || ""))) return "Select the date this opening balance applies.";
  return "";
}
