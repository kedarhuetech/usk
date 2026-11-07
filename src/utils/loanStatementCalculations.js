/**
 * Loan Statement Calculations & Accounting Logic
 *
 * Implements strict accounting principles for Loan Accounts & Statements:
 * - Loan Received: Increases outstanding principal. (Does NOT count as sales income).
 * - Principal Repayment: Decreases outstanding principal. (Does NOT count as business expense).
 * - Interest Payment: Tracked separately. (Does NOT decrease outstanding principal).
 * - Additional Charges: Tracked separately. (Does NOT decrease outstanding principal).
 * - Closing Principal = Opening Principal + Additional Principal Received − Principal Repaid
 * - Opening Principal Balance: Calculated from all transactions prior to the selected `from` date.
 * - Outstanding Principal Balance: As of the selected end date `to`.
 */

export function parseYMD(val) {
  if (!val) return "";
  if (typeof val === "string") {
    const s = val.trim();
    // YYYY-MM-DD
    const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    }
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) {
      const first = Number(dmy[1]);
      const second = Number(dmy[2]);
      const year = dmy[3];
      if (second > 12 && first <= 12) {
        return `${year}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
      }
      return `${year}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    }
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return "";
}

export const roundMoney = (val) => Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;

/**
 * Builds raw transaction entries from an array of loan accounts.
 *
 * Each loan generates:
 * 1. A "Loan Received" transaction on its start date for the original loan amount.
 * 2. Individual "Principal Repayment" transactions for each repayment in loan.repayments.
 */
export function buildLoanStatementEntries(loans = [], loanIdFilter = "All") {
  const entries = [];
  const validLoans = Array.isArray(loans) ? loans : [];

  for (const loan of validLoans) {
    if (!loan || typeof loan !== "object") continue;
    if (loanIdFilter && loanIdFilter !== "All" && loan.id !== loanIdFilter) continue;

    const loanStartDate = parseYMD(loan.startDate || loan.createdAt?.slice(0, 10));
    const originalPrincipal = roundMoney(loan.originalAmount);

    // 1. Loan Received transaction
    if (originalPrincipal > 0 && loanStartDate) {
      entries.push({
        id: `loan-received-${loan.id}`,
        loanId: loan.id,
        loanName: loan.loanName || "Unnamed Loan",
        lenderName: loan.lenderName || "Unknown Lender",
        date: loanStartDate,
        rawDate: loan.startDate || loan.createdAt,
        reference: loan.reference || loan.loanNumber || `LOAN-${loan.id.slice(0, 6)}`,
        transactionType: "Loan Received",
        paymentType: loan.paymentType || loan.disbursementMethod || "Bank Transfer",
        principalAmount: originalPrincipal,
        interestAmount: 0,
        charges: 0,
        totalPaid: 0,
        notes: loan.notes || "",
        status: loan.status || "Active",
        store: loan.store || loan.firm || "",
        user: loan.user || loan.createdBy || "",
        sortOrder: 1, // Received appears before repayments on the same date
      });
    }

    // 2. Repayment transactions
    const repayments = Array.isArray(loan.repayments) ? loan.repayments : [];
    for (const repayment of repayments) {
      if (!repayment || typeof repayment !== "object") continue;
      const paymentDate = parseYMD(repayment.paymentDate || repayment.createdAt?.slice(0, 10));
      if (!paymentDate) continue;

      const principalPaid = roundMoney(repayment.principalPaid);
      const amountPaid = roundMoney(repayment.amountPaid);
      const interestPaid = roundMoney(
        repayment.interestPaid !== undefined
          ? repayment.interestPaid
          : Math.max(0, amountPaid - principalPaid)
      );
      const charges = roundMoney(repayment.charges || 0);

      entries.push({
        id: `repayment-${loan.id}-${repayment.id}`,
        repaymentId: repayment.id,
        loanId: loan.id,
        loanName: loan.loanName || "Unnamed Loan",
        lenderName: loan.lenderName || "Unknown Lender",
        date: paymentDate,
        rawDate: repayment.paymentDate || repayment.createdAt,
        reference: repayment.reference || `REP-${repayment.id.slice(0, 6)}`,
        transactionType: "Principal Repayment",
        paymentType: repayment.paymentType || repayment.paymentMethod || "Bank Transfer",
        principalAmount: principalPaid,
        interestAmount: interestPaid,
        charges: charges,
        totalPaid: amountPaid,
        notes: repayment.notes || "",
        status: "Paid",
        store: repayment.store || loan.store || loan.firm || "",
        user: repayment.user || loan.user || loan.createdBy || "",
        sortOrder: 2, // Repayments appear after received on the same date
      });
    }
  }

  // Sort chronologically ascending
  return entries.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Calculates the opening principal balance prior to a given `fromDate`.
 * Opening Balance = Sum of (Principal Received) − Sum of (Principal Repaid) strictly before fromDate.
 */
export function calculateLoanOpeningBalance(loans = [], fromDate = "", loanIdFilter = "All") {
  if (!fromDate) return 0;
  const targetDate = parseYMD(fromDate);
  if (!targetDate) return 0;

  const allEntries = buildLoanStatementEntries(loans, loanIdFilter);
  let openingBalance = 0;

  for (const entry of allEntries) {
    if (entry.date < targetDate) {
      if (entry.transactionType === "Loan Received") {
        openingBalance += entry.principalAmount;
      } else if (entry.transactionType === "Principal Repayment") {
        openingBalance -= entry.principalAmount;
      }
    }
  }

  return Math.max(0, roundMoney(openingBalance));
}

/**
 * Computes running principal balances for all entries.
 * Note: Interest and charges do not reduce or increase the principal balance!
 */
export function computeRunningBalances(entries = [], initialOpeningBalance = 0) {
  let running = roundMoney(initialOpeningBalance);

  return entries.map((entry) => {
    if (entry.transactionType === "Loan Received") {
      running = roundMoney(running + entry.principalAmount);
    } else if (entry.transactionType === "Principal Repayment") {
      running = Math.max(0, roundMoney(running - entry.principalAmount));
    }

    return {
      ...entry,
      balance: running,
    };
  });
}

/**
 * Filters entries by date range, store, user, loan account, and search keyword.
 */
export function filterLoanStatementEntries(entries = [], filters = {}) {
  const { from = "", to = "", store = "All Stores", user = "All Users", loanId = "All", search = "" } = filters;
  const fromYMD = parseYMD(from);
  const toYMD = parseYMD(to);
  const query = String(search || "").trim().toLowerCase();

  return entries.filter((row) => {
    // Loan filter
    if (loanId && loanId !== "All" && row.loanId !== loanId) return false;

    // Date range filter
    if (fromYMD && row.date < fromYMD) return false;
    if (toYMD && row.date > toYMD) return false;

    // Store filter
    if (store && store !== "All Stores" && row.store && row.store !== store) return false;

    // User filter
    if (user && user !== "All Users" && row.user && row.user !== user) return false;

    // Search query
    if (query) {
      const matchText = [
        row.loanName,
        row.lenderName,
        row.reference,
        row.transactionType,
        row.paymentType,
        row.notes,
        row.status,
        String(row.principalAmount),
        String(row.interestAmount),
        String(row.balance),
      ]
        .join(" ")
        .toLowerCase();

      if (!matchText.includes(query)) return false;
    }

    return true;
  });
}

/**
 * Calculates summary metrics for the loan statement.
 *
 * @param {Array} filteredEntries - Entries visible inside the selected date range.
 * @param {number} openingBalance - Principal balance prior to the start date.
 * @param {Array} allHistoricalEntries - All entries from inception up to end date `to`.
 */
export function calculateLoanStatementSummary(filteredEntries = [], openingBalance = 0, allHistoricalEntries = []) {
  let totalLoanReceived = 0;
  let totalPrincipalRepaid = 0;
  let totalInterestPaid = 0;
  let totalChargesPaid = 0;

  for (const entry of filteredEntries) {
    if (entry.transactionType === "Loan Received") {
      totalLoanReceived += entry.principalAmount;
    } else if (entry.transactionType === "Principal Repayment") {
      totalPrincipalRepaid += entry.principalAmount;
    }
    totalInterestPaid += entry.interestAmount || 0;
    totalChargesPaid += entry.charges || 0;
  }

  // Outstanding principal balance is a point-in-time balance as of the selected end date
  // Closing Principal = Opening Principal + Additional Principal Received in period − Principal Repaid in period
  const outstandingPrincipal = Math.max(
    0,
    roundMoney(openingBalance + totalLoanReceived - totalPrincipalRepaid)
  );

  return {
    openingPrincipalBalance: roundMoney(openingBalance),
    totalLoanReceived: roundMoney(totalLoanReceived),
    totalPrincipalRepaid: roundMoney(totalPrincipalRepaid),
    totalInterestPaid: roundMoney(totalInterestPaid),
    totalChargesPaid: roundMoney(totalChargesPaid),
    outstandingPrincipalBalance: outstandingPrincipal,
    transactionCount: filteredEntries.length,
  };
}
