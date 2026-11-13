export const DEFAULT_EXPENSE_CATEGORIES = Object.freeze([
  "Petrol",
  "Rent",
  "Salary",
  "Tea",
  "Transport",
]);

export function parseYMD(val) {
  if (!val) return "";
  if (typeof val === "string") {
    const s = val.trim();
    const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmySlash) {
      return `${dmySlash[3]}-${dmySlash[2].padStart(2, "0")}-${dmySlash[1].padStart(2, "0")}`;
    }
    const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmyDash) {
      return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
    }
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    }
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

export function formatDateDMY(val) {
  const ymd = parseYMD(val);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export function getPresetDateRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (preset) {
    case "Today":
      return { from: fmt(now), to: fmt(now) };
    case "This Month":
      return {
        from: `${y}-${pad(m + 1)}-01`,
        to: fmt(new Date(y, m + 1, 0)),
      };
    case "Last Month": {
      const prevM = m === 0 ? 11 : m - 1;
      const prevY = m === 0 ? y - 1 : y;
      return {
        from: `${prevY}-${pad(prevM + 1)}-01`,
        to: fmt(new Date(prevY, prevM + 1, 0)),
      };
    }
    case "This Quarter": {
      const qStartMonth = Math.floor(m / 3) * 3;
      return {
        from: `${y}-${pad(qStartMonth + 1)}-01`,
        to: fmt(new Date(y, qStartMonth + 3, 0)),
      };
    }
    case "This Year": {
      const fyStartYear = m >= 3 ? y : y - 1;
      return {
        from: `${fyStartYear}-04-01`,
        to: `${fyStartYear + 1}-03-31`,
      };
    }
    case "All Time":
      return { from: "", to: "" };
    default:
      return {
        from: `${y}-${pad(m + 1)}-01`,
        to: fmt(new Date(y, m + 1, 0)),
      };
  }
}

export function rowAmount(row, gst = false) {
  const base = (Number(row.qty) || 0) * (Number(row.price) || 0);
  const discount = base * ((Number(row.discount) || 0) / 100);
  const discounted = Math.max(0, base - discount);
  const tax = gst ? discounted * ((Number(row.tax) || 0) / 100) : 0;
  return discounted + tax;
}

/**
 * Normalizes an expense record from storage.
 */
export function normalizeExpense(record, index = 0) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const rows = Array.isArray(record.rows) ? record.rows : [];
  const payments = Array.isArray(record.payments) ? record.payments : [];

  const calculatedAmount = rows.reduce(
    (sum, r) => sum + rowAmount(r, Boolean(record.gst)),
    0
  );

  const amount = Number(
    record.amount ?? record.total ?? calculatedAmount ?? 0
  );

  const sumEnteredPayments = payments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );

  let paidAmount = 0;
  if (record.paid !== undefined && record.paid !== null && record.paid !== "") {
    paidAmount = Number(record.paid);
  } else if (sumEnteredPayments > 0) {
    paidAmount = sumEnteredPayments;
  } else if (record.status === "Paid") {
    paidAmount = amount;
  } else if (record.status === "Unpaid") {
    paidAmount = 0;
  } else {
    paidAmount = amount;
  }

  const balance = Math.max(0, amount - paidAmount);

  let status = "Paid";
  if (record.status === "Cancelled" || record.cancelled) {
    status = "Cancelled";
  } else if (balance === 0) {
    status = "Paid";
  } else if (paidAmount > 0 && balance > 0) {
    status = "Partially Paid";
  } else {
    status = "Unpaid";
  }

  const paymentModesList = payments
    .map((p) => p.type || p.mode)
    .filter(Boolean);

  const paymentMode =
    paymentModesList.join(", ") ||
    record.paymentType ||
    record.paymentMode ||
    "Cash";

  const number = String(
    record.number || record.expenseNo || record.refNo || index + 1
  );

  const rawDate = record.date || record.createdAt || record.form?.date || "";
  const date = parseYMD(rawDate);

  const category = String(
    record.category || record.categoryName || "Uncategorized"
  ).trim();

  const party = String(
    record.party || record.partyName || record.paidTo || ""
  ).trim();

  const description = String(
    record.description ||
      rows
        .map((r) => r.description || r.item)
        .filter(Boolean)
        .join("; ") ||
      ""
  ).trim();

  return {
    id: record.id || `exp-${index}-${number}`,
    number,
    date,
    category: category || "Uncategorized",
    party,
    description,
    amount,
    paid: paidAmount,
    balance,
    status,
    paymentMode,
    paymentModesList:
      paymentModesList.length > 0 ? paymentModesList : [paymentMode],
    payments,
    rows,
    gst: Boolean(record.gst),
    roundOff: Boolean(record.roundOff),
    createdAt: record.createdAt || "",
    deleted: Boolean(record.deleted || record.isDeleted),
    cancelled: Boolean(record.cancelled || record.status === "Cancelled"),
    raw: record,
  };
}

/**
 * Filters a list of normalized expenses by date range, category, party, payment mode, and search.
 */
export function filterExpenses(expenses, filters = {}) {
  const {
    from = "",
    to = "",
    category = "All",
    party = "All",
    paymentMode = "All",
    status = "All",
    search = "",
  } = filters;

  const q = search.trim().toLowerCase();

  return expenses
    .filter((exp) => {
      if (!exp || exp.deleted) return false;

      // Date range filter
      if (from && (!exp.date || exp.date < from)) return false;
      if (to && (!exp.date || exp.date > to)) return false;

      // Category filter
      if (
        category !== "All" &&
        exp.category.toLowerCase() !== category.toLowerCase()
      ) {
        return false;
      }

      // Party filter
      if (party !== "All" && exp.party.toLowerCase() !== party.toLowerCase()) {
        return false;
      }

      // Payment Mode filter
      if (paymentMode !== "All") {
        const matchesMode =
          exp.paymentModesList.some(
            (m) => m.toLowerCase() === paymentMode.toLowerCase()
          ) || exp.paymentMode.toLowerCase().includes(paymentMode.toLowerCase());
        if (!matchesMode) return false;
      }

      // Status filter
      if (status !== "All") {
        if (exp.status.toLowerCase() !== status.toLowerCase()) {
          return false;
        }
      }

      // Search filter
      if (q) {
        const rowItems = exp.rows
          .map((r) => `${r.item || ""} ${r.description || ""}`)
          .join(" ")
          .toLowerCase();

        const matches =
          exp.number.toLowerCase().includes(q) ||
          exp.category.toLowerCase().includes(q) ||
          exp.party.toLowerCase().includes(q) ||
          exp.description.toLowerCase().includes(q) ||
          exp.paymentMode.toLowerCase().includes(q) ||
          exp.status.toLowerCase().includes(q) ||
          String(exp.amount).includes(q) ||
          rowItems.includes(q);

        if (!matches) return false;
      }

      return true;
    })
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

/**
 * Calculates summary metrics and breakdowns from a list of filtered expenses.
 */
export function calculateExpenseMetrics(filteredExpenses = []) {
  let totalExpenses = 0;
  let paidTotal = 0;
  let balanceTotal = 0;
  let highestExpense = 0;

  const categoryMap = new Map();
  const paymentModeMap = new Map();
  const partyMap = new Map();

  filteredExpenses.forEach((exp) => {
    if (!exp || exp.status === "Cancelled" || exp.cancelled || exp.deleted) {
      return;
    }

    const amt = Number(exp.amount || 0);
    const paid = Number(exp.paid || 0);
    const bal = Number(exp.balance || 0);

    totalExpenses += amt;
    paidTotal += paid;
    balanceTotal += bal;

    if (amt > highestExpense) {
      highestExpense = amt;
    }

    // Category aggregation
    const cat = exp.category || "Uncategorized";
    const existingCat = categoryMap.get(cat) || { count: 0, total: 0 };
    categoryMap.set(cat, {
      count: existingCat.count + 1,
      total: existingCat.total + amt,
    });

    // Party aggregation
    if (exp.party) {
      const existingParty = partyMap.get(exp.party) || { count: 0, total: 0 };
      partyMap.set(exp.party, {
        count: existingParty.count + 1,
        total: existingParty.total + amt,
      });
    }

    // Payment Mode aggregation
    const validPayments = Array.isArray(exp.payments)
      ? exp.payments.filter((p) => Number(p.amount) > 0)
      : [];

    if (validPayments.length > 0) {
      const sumItemized = validPayments.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0
      );
      if (Math.abs(sumItemized - amt) < 0.01) {
        // Multi-payment sums to total expense
        validPayments.forEach((p) => {
          const mode = p.type || p.mode || "Cash";
          const pAmt = Number(p.amount) || 0;
          const ex = paymentModeMap.get(mode) || { count: 0, total: 0 };
          paymentModeMap.set(mode, {
            count: ex.count + 1,
            total: ex.total + pAmt,
          });
        });
      } else if (bal > 0) {
        // Partial payment: allocate paid amount to its payment mode(s), and remaining balance to Unpaid
        validPayments.forEach((p) => {
          const mode = p.type || p.mode || "Cash";
          const pAmt = Number(p.amount) || 0;
          const ex = paymentModeMap.get(mode) || { count: 0, total: 0 };
          paymentModeMap.set(mode, {
            count: ex.count + 1,
            total: ex.total + pAmt,
          });
        });
        const unallocated = amt - sumItemized;
        if (unallocated > 0) {
          const ex = paymentModeMap.get("Unpaid (Due)") || { count: 0, total: 0 };
          paymentModeMap.set("Unpaid (Due)", {
            count: ex.count + 1,
            total: ex.total + unallocated,
          });
        }
      } else {
        const mode = exp.paymentMode || "Cash";
        const ex = paymentModeMap.get(mode) || { count: 0, total: 0 };
        paymentModeMap.set(mode, {
          count: ex.count + 1,
          total: ex.total + amt,
        });
      }
    } else {
      const mode = exp.paymentMode || "Cash";
      const ex = paymentModeMap.get(mode) || { count: 0, total: 0 };
      paymentModeMap.set(mode, {
        count: ex.count + 1,
        total: ex.total + amt,
      });
    }
  });

  const activeTransactions = filteredExpenses.filter(
    (e) => e && e.status !== "Cancelled" && !e.cancelled && !e.deleted
  );
  const transactionCount = activeTransactions.length;
  const averageExpense =
    transactionCount > 0 ? totalExpenses / transactionCount : 0;

  // Format category breakdown
  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      total: data.total,
      percentage: totalExpenses > 0 ? (data.total / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Format payment mode breakdown
  const paymentModeBreakdown = Array.from(paymentModeMap.entries())
    .map(([mode, data]) => ({
      mode,
      count: data.count,
      total: data.total,
      percentage: totalExpenses > 0 ? (data.total / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Format party breakdown
  const partyBreakdown = Array.from(partyMap.entries())
    .map(([party, data]) => ({
      party,
      count: data.count,
      total: data.total,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalExpenses,
    transactionCount,
    highestExpense,
    averageExpense,
    paidTotal,
    balanceTotal,
    categoryBreakdown,
    paymentModeBreakdown,
    partyBreakdown,
  };
}
