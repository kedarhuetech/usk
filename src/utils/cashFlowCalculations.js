/**
 * Cash Flow Report Calculations & Accounting Logic
 *
 * Implements strict accounting principles for Cash & Bank movements:
 * - Unpaid sale invoices: ₹0 cash movement
 * - Partially paid sale invoices: Only the received amount is counted
 * - Fully paid cash sales: Full amount is counted as Cash/Bank In
 * - Unpaid purchase bills (e.g. Orbit Tech Distributors ₹53): ₹0 cash movement
 * - Partially paid purchase bills: Only the paid amount is counted
 * - Fully paid purchases: Full amount is counted as Cash/Bank Out
 * - Payment-In: Counts as Inflow
 * - Payment-Out: Counts as Outflow
 * - Paid Expenses: Counts as Outflow (Unpaid expenses: ₹0 movement)
 * - Cash Adjustments: Increase -> Inflow, Reduce -> Outflow
 * - Avoid double-counting linked payments
 * - Chronological running balance and accurate date-filtered opening balance
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
      // If second > 12, it must be MM/DD/YYYY
      if (second > 12 && first <= 12) {
        return `${year}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
      }
      // Standard DD/MM/YYYY
      return `${year}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    }
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

export function isVoided(record) {
  if (!record || typeof record !== "object") return true;
  if (record.cancelled || record.isCancelled || record.deleted || record.isDeleted || record.isReturn) return true;
  const status = String(record.status || "").trim().toLowerCase();
  return status === "cancelled" || status === "canceled" || status === "void" || status === "deleted";
}

/**
 * Extracts cash movement from a Sale Invoice.
 * Credit/unpaid sales contribute ₹0. Only actual received amounts count.
 */
export function extractSaleCashMovement(rawSale, saleUi = {}) {
  if (!rawSale || isVoided(rawSale)) return null;

  // Apply UI actions (deleted, cancelled, edits)
  const idStr = String(rawSale.id || rawSale.invoiceId || "");
  if (saleUi.deleted && Array.isArray(saleUi.deleted) && saleUi.deleted.map(String).includes(idStr)) {
    return null;
  }
  if (saleUi.cancelled && typeof saleUi.cancelled === "object" && saleUi.cancelled[idStr]) {
    return null;
  }
  const sale = (saleUi.edits && typeof saleUi.edits === "object" && saleUi.edits[idStr])
    ? { ...rawSale, ...saleUi.edits[idStr] }
    : rawSale;

  const total = Math.max(0, Number(sale.totals?.finalTotal ?? sale.totals?.grandTotal ?? sale.total ?? sale.amount ?? 0));
  const isCashSale = sale.saleType === "cash";
  const statusLower = String(sale.status || "").trim().toLowerCase();

  let received = 0;
  if (isCashSale) {
    if (statusLower === "unpaid") {
      received = Number(sale.totals?.received ?? sale.receivedAmount ?? sale.form?.receivedAmount ?? 0);
    } else if (sale.totals?.received != null || sale.receivedAmount != null) {
      received = Number(sale.totals?.received ?? sale.receivedAmount ?? 0);
    } else {
      // Standard cash sale paid at creation
      received = total;
    }
  } else {
    // Credit sale / default: only actual received amount counts
    received = Number(sale.totals?.received ?? sale.receivedAmount ?? sale.form?.receivedAmount ?? 0);
  }

  // Ensure bounded received amount
  received = Math.max(0, Math.min(received, total));
  const isUnpaid = received <= 0 && total > 0;
  const isPartial = received > 0 && received < total;

  const paymentMethod = sale.form?.paymentType || sale.paymentType || (isCashSale ? "Cash" : (isUnpaid ? "Credit (Unpaid)" : "Cash"));

  return {
    id: sale.id || `sale-${Math.random()}`,
    date: sale.form?.invoiceDate || sale.date || sale.createdAt || "",
    refNo: sale.form?.invoiceNumber || sale.invoiceNumber || sale.invoiceNo || sale.number || "—",
    name: sale.form?.customer || sale.party || sale.partyName || sale.customer || "Cash Sale",
    category: sale.category || sale.form?.category || "",
    type: sale.isPos || String(sale.invoiceNumber || "").includes("POS") ? "PoS Sale" : "Sale",
    paymentMethod,
    total,
    cashIn: received,
    cashOut: 0,
    isUnpaid,
    isPartial,
    raw: sale,
    storageKey: "ledgerly:saleInvoices.v1",
  };
}

/**
 * Extracts cash movement from a Purchase Bill.
 * Unpaid purchase bills (like Orbit Tech Distributors ₹53) contribute ₹0 cash out.
 */
export function extractPurchaseCashMovement(purchase) {
  if (!purchase || isVoided(purchase)) return null;

  const total = Math.max(0, Number(purchase.totals?.finalTotal ?? purchase.totals?.grandTotal ?? purchase.totalAmount ?? purchase.total ?? purchase.amount ?? 0));
  const statusLower = String(purchase.status || "").trim().toLowerCase();
  const isCashPurchase = purchase.purchaseType === "cash" || purchase.saleType === "cash";

  let paid = 0;
  if (statusLower === "unpaid") {
    // Explicitly marked unpaid in purchase bills
    paid = Number(purchase.totals?.received ?? purchase.paidAmount ?? purchase.form?.paidAmount ?? 0);
  } else if (isCashPurchase) {
    if (purchase.totals?.received != null || purchase.paidAmount != null) {
      paid = Number(purchase.totals?.received ?? purchase.paidAmount ?? 0);
    } else if (statusLower === "paid") {
      paid = total;
    } else {
      paid = Number(purchase.totals?.received ?? purchase.paidAmount ?? 0);
    }
  } else {
    // Credit purchase / default: only actual paid amount counts
    paid = Number(purchase.totals?.received ?? purchase.paidAmount ?? purchase.form?.paidAmount ?? 0);
  }

  paid = Math.max(0, Math.min(paid, total));
  const isUnpaid = paid <= 0 && total > 0;
  const isPartial = paid > 0 && paid < total;

  const paymentMethod = purchase.form?.paymentType || purchase.paymentType || (isCashPurchase ? "Cash" : (isUnpaid ? "Credit (Unpaid)" : "Cash"));

  return {
    id: purchase.id || `purch-${Math.random()}`,
    date: purchase.form?.invoiceDate || purchase.form?.billDate || purchase.date || purchase.createdAt || "",
    refNo: purchase.form?.invoiceNumber || purchase.invoiceNumber || purchase.billNumber || "—",
    name: purchase.form?.customer || purchase.form?.party || purchase.supplier || purchase.partyName || "Supplier",
    category: purchase.category || "",
    type: "Purchase",
    paymentMethod,
    total,
    cashIn: 0,
    cashOut: paid,
    isUnpaid,
    isPartial,
    raw: purchase,
    storageKey: "ledgerly:purchaseBills.v1",
  };
}

/**
 * Extracts cash movement from Payment-In receipt.
 */
export function extractPaymentInMovement(paymentIn) {
  if (!paymentIn || isVoided(paymentIn)) return null;

  let amt = 0;
  if (Array.isArray(paymentIn.payments) && paymentIn.payments.length > 0) {
    amt = paymentIn.payments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
  } else {
    amt = Math.max(0, Number(paymentIn.amount ?? paymentIn.received ?? paymentIn.total ?? 0));
  }

  const paymentMethod = (Array.isArray(paymentIn.payments) && paymentIn.payments.length > 0)
    ? [...new Set(paymentIn.payments.map((p) => p.type).filter(Boolean))].join(", ") || paymentIn.paymentType || "Cash"
    : paymentIn.paymentType || "Cash";

  return {
    id: paymentIn.id || `payin-${Math.random()}`,
    date: paymentIn.date || paymentIn.createdAt || "",
    refNo: paymentIn.number || paymentIn.refNo || "—",
    name: paymentIn.customer || paymentIn.partyName || paymentIn.party || "Party",
    category: "",
    type: "Payment-In",
    paymentMethod,
    total: amt,
    cashIn: amt,
    cashOut: 0,
    isUnpaid: false,
    linkedInvoiceId: paymentIn.linkedInvoiceId || "",
    raw: paymentIn,
    storageKey: "ledgerly:paymentIns.v1",
  };
}

/**
 * Extracts cash movement from Payment-Out payment.
 */
export function extractPaymentOutMovement(paymentOut) {
  if (!paymentOut || isVoided(paymentOut)) return null;

  let amt = 0;
  if (Array.isArray(paymentOut.payments) && paymentOut.payments.length > 0) {
    amt = paymentOut.payments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
  } else {
    amt = Math.max(0, Number(paymentOut.amount ?? paymentOut.paid ?? paymentOut.total ?? 0));
  }

  const paymentMethod = (Array.isArray(paymentOut.payments) && paymentOut.payments.length > 0)
    ? [...new Set(paymentOut.payments.map((p) => p.type).filter(Boolean))].join(", ") || paymentOut.paymentType || "Cash"
    : paymentOut.paymentType || "Cash";

  return {
    id: paymentOut.id || `payout-${Math.random()}`,
    date: paymentOut.date || paymentOut.createdAt || "",
    refNo: paymentOut.number || paymentOut.refNo || "—",
    name: paymentOut.customer || paymentOut.party || paymentOut.partyName || "Supplier",
    category: "",
    type: "Payment-Out",
    paymentMethod,
    total: amt,
    cashIn: 0,
    cashOut: amt,
    isUnpaid: false,
    linkedInvoiceId: paymentOut.linkedInvoiceId || paymentOut.linkedBillId || "",
    linkedCreditNoteId: paymentOut.linkedCreditNoteId || "",
    raw: paymentOut,
    storageKey: "ledgerly:paymentOuts.v1",
  };
}

/**
 * Extracts cash movement from Expense record.
 */
export function extractExpenseMovement(expense) {
  if (!expense || isVoided(expense)) return null;

  let total = Number(expense.amount || 0);
  if (!total && Array.isArray(expense.rows) && expense.rows.length > 0) {
    total = expense.rows.reduce((sum, r) => {
      const base = (Number(r.qty) || 0) * (Number(r.price) || 0);
      const discounted = base - (base * (Number(r.discount) || 0)) / 100;
      return sum + (discounted + (expense.gst ? (discounted * (Number(r.tax) || 0)) / 100 : 0) || Number(r.amount || 0));
    }, 0);
  }
  total = Math.max(0, total);

  const statusLower = String(expense.status || "").trim().toLowerCase();
  let paid = 0;

  if (Array.isArray(expense.payments) && expense.payments.length > 0) {
    paid = expense.payments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
  } else if (expense.paid != null) {
    paid = Number(expense.paid);
  } else if (statusLower === "unpaid") {
    paid = 0;
  } else {
    paid = total;
  }

  paid = Math.max(0, Math.min(paid, total || paid));
  const isUnpaid = paid <= 0 && total > 0;
  const isPartial = paid > 0 && paid < total;

  const paymentMethod = (Array.isArray(expense.payments) && expense.payments.length > 0)
    ? [...new Set(expense.payments.map((p) => p.type).filter(Boolean))].join(", ") || expense.paymentType || "Cash"
    : expense.paymentType || (isUnpaid ? "Unpaid" : "Cash");

  return {
    id: expense.id || `exp-${Math.random()}`,
    date: expense.date || expense.createdAt || "",
    refNo: expense.number || "—",
    name: expense.category || expense.party || "Expense",
    category: expense.category || "",
    type: "Expense",
    paymentMethod,
    total,
    cashIn: 0,
    cashOut: paid,
    isUnpaid,
    isPartial,
    raw: expense,
    storageKey: "ledgerly:expenses.v1",
  };
}

/**
 * Extracts cash movement from Cash Adjustment.
 */
export function extractCashAdjustmentMovement(adj) {
  if (!adj || (!adj.id && !adj.amount)) return null;
  const amt = Number(adj.amount || 0);
  if (amt === 0) return null;

  const isIncrease = amt >= 0;
  return {
    id: adj.id || `adj-${Math.random()}`,
    date: adj.date || adj.createdAt || "",
    refNo: adj.reference || "—",
    name: adj.reason || "Cash adjustment",
    category: "",
    type: isIncrease ? "Cash Increase" : "Cash Reduce",
    paymentMethod: "Cash",
    total: Math.abs(amt),
    cashIn: isIncrease ? Math.abs(amt) : 0,
    cashOut: !isIncrease ? Math.abs(amt) : 0,
    isUnpaid: false,
    raw: adj,
    storageKey: "ledgerly:cashAdjustments.v1",
  };
}

/**
 * Builds the complete list of cash flow entries, resolving duplicate payments.
 */
export function buildCashFlowEntries({
  sales = [],
  purchases = [],
  paymentIns = [],
  paymentOuts = [],
  expenses = [],
  adjustments = [],
  bankTransactions = [],
  saleInvoiceUi = {},
} = {}) {
  const list = [];

  // 1. Sales
  const processedSales = [];
  for (const s of sales) {
    const entry = extractSaleCashMovement(s, saleInvoiceUi);
    if (entry) {
      processedSales.push(entry);
      list.push(entry);
    }
  }

  // Also include duplicated sales from UI actions if present
  if (saleInvoiceUi.duplicates && Array.isArray(saleInvoiceUi.duplicates)) {
    for (const dup of saleInvoiceUi.duplicates) {
      const entry = extractSaleCashMovement(dup, {});
      if (entry) {
        processedSales.push(entry);
        list.push(entry);
      }
    }
  }

  // 2. Purchases
  const processedPurchases = [];
  for (const p of purchases) {
    const entry = extractPurchaseCashMovement(p);
    if (entry) {
      processedPurchases.push(entry);
      list.push(entry);
    }
  }

  // 3. Payment-Ins (with duplicate prevention for linked sales)
  for (const pi of paymentIns) {
    const entry = extractPaymentInMovement(pi);
    if (!entry) continue;

    // Check if this Payment-In is linked to a sale that already counted the cash at creation
    if (entry.linkedInvoiceId) {
      const linkedSale = processedSales.find(
        (s) => String(s.id) === String(entry.linkedInvoiceId) ||
               String(s.refNo) === String(entry.linkedInvoiceId) ||
               String(s.raw?.invoiceNumber || "") === String(entry.linkedInvoiceId)
      );

      // If the sale invoice already recorded cashIn > 0 for this receipt, prevent double counting
      if (linkedSale && linkedSale.cashIn > 0) {
        // Invoice already recorded the cash movement, avoid counting it twice
        entry.cashIn = 0;
        entry.isDuplicate = true;
        entry.duplicateReason = `Payment already recorded in Sale Invoice #${linkedSale.refNo}`;
      }
    }

    list.push(entry);
  }

  // 4. Payment-Outs (with duplicate prevention for linked purchases / credit notes)
  for (const po of paymentOuts) {
    const entry = extractPaymentOutMovement(po);
    if (!entry) continue;

    if (entry.linkedCreditNoteId) {
      // Credit note refund already handled elsewhere
      entry.cashOut = 0;
      entry.isDuplicate = true;
    } else if (entry.linkedInvoiceId) {
      const linkedPurch = processedPurchases.find(
        (p) => String(p.id) === String(entry.linkedInvoiceId) ||
               String(p.refNo) === String(entry.linkedInvoiceId) ||
               String(p.raw?.billNumber || "") === String(entry.linkedInvoiceId)
      );
      if (linkedPurch && linkedPurch.cashOut > 0) {
        entry.cashOut = 0;
        entry.isDuplicate = true;
        entry.duplicateReason = `Payment already recorded in Purchase Bill #${linkedPurch.refNo}`;
      }
    }

    list.push(entry);
  }

  // 5. Expenses
  for (const exp of expenses) {
    const entry = extractExpenseMovement(exp);
    if (entry) list.push(entry);
  }

  // 6. Cash Adjustments
  for (const adj of adjustments) {
    const entry = extractCashAdjustmentMovement(adj);
    if (entry) list.push(entry);
  }

  // 7. Bank Transactions (if any)
  for (const bt of bankTransactions) {
    if (!bt || isVoided(bt)) continue;
    const amt = Math.max(0, Number(bt.amount || 0));
    if (amt <= 0) continue;
    const isIn = bt.type === "money-in" || bt.type === "deposit";
    list.push({
      id: bt.id || `bt-${Math.random()}`,
      date: bt.date || bt.createdAt || "",
      refNo: bt.reference || "—",
      name: bt.partyName || bt.description || (isIn ? "Bank Deposit" : "Bank Withdrawal"),
      category: "",
      type: isIn ? "Bank In" : "Bank Out",
      paymentMethod: "Bank",
      total: amt,
      cashIn: isIn ? amt : 0,
      cashOut: !isIn ? amt : 0,
      isUnpaid: false,
      raw: bt,
      storageKey: "ledgerly:bankTransactions.v1",
    });
  }

  // Sort chronologically ascending
  return sortCashFlowEntries(list);
}

/**
 * Sorts cash flow entries chronologically ascending with stable secondary sort.
 */
export function sortCashFlowEntries(entries = []) {
  return [...entries].sort((a, b) => {
    const ymdA = parseYMD(a.date) || "";
    const ymdB = parseYMD(b.date) || "";
    const dateComp = ymdA.localeCompare(ymdB);
    if (dateComp !== 0) return dateComp;

    // Stable tie-breakers for same date:
    // Compare createdAt timestamps if available
    const timeA = a.raw?.createdAt ? new Date(a.raw.createdAt).getTime() : 0;
    const timeB = b.raw?.createdAt ? new Date(b.raw.createdAt).getTime() : 0;
    if (timeA && timeB && timeA !== timeB) return timeA - timeB;

    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

/**
 * Calculates Opening Balance (all cash movements strictly before fromDate).
 */
export function calculateOpeningBalance(entries = [], fromDate) {
  if (!fromDate) return 0;
  const fromYmd = parseYMD(fromDate);
  if (!fromYmd) return 0;

  let balance = 0;
  for (const entry of entries) {
    const ymd = parseYMD(entry.date);
    if (ymd && ymd < fromYmd) {
      balance += (entry.cashIn - entry.cashOut);
    }
  }
  return balance;
}

/**
 * Filters cash flow entries by date range, zero amounts, and search,
 * calculating accurate running balances and summary totals.
 */
export function filterAndCalculateCashFlow(
  entries = [],
  {
    from = "",
    to = "",
    showZeroAmount = false,
    search = "",
    firm = "ALL FIRMS",
    accountType = "ALL", // "ALL", "Cash", "Bank"
  } = {}
) {
  const fromYmd = parseYMD(from);
  const toYmd = parseYMD(to);
  const openingBalance = calculateOpeningBalance(entries, fromYmd);

  let running = openingBalance;
  let totalCashIn = 0;
  let totalCashOut = 0;
  const filteredRows = [];

  const q = search.trim().toLowerCase();

  for (const row of entries) {
    const ymd = parseYMD(row.date);

    // Date range filter
    if (fromYmd && ymd && ymd < fromYmd) continue;
    if (toYmd && ymd && ymd > toYmd) continue;

    // Firm filter
    if (firm && firm !== "ALL FIRMS" && firm !== "All Firms") {
      const rowFirm = row.raw?.firm || row.raw?.businessName || row.raw?.store || "";
      if (rowFirm && !rowFirm.toLowerCase().includes(firm.toLowerCase())) {
        continue;
      }
    }

    // Account type filter (Cash vs Bank)
    if (accountType && accountType !== "ALL") {
      const method = String(row.paymentMethod || "").toLowerCase();
      const isCash = method.includes("cash");
      if (accountType === "Cash" && !isCash) continue;
      if (accountType === "Bank" && isCash) continue;
    }

    // Zero amount filter
    if (!showZeroAmount && row.cashIn === 0 && row.cashOut === 0) {
      continue;
    }

    // Search query
    if (q) {
      const haystack = `${row.refNo} ${row.name} ${row.category} ${row.type} ${row.paymentMethod}`.toLowerCase();
      if (!haystack.includes(q)) continue;
    }

    running += (row.cashIn - row.cashOut);
    totalCashIn += row.cashIn;
    totalCashOut += row.cashOut;

    filteredRows.push({
      ...row,
      runningBalance: running,
    });
  }

  return {
    openingBalance,
    filteredRows,
    totalCashIn,
    totalCashOut,
    closingBalance: running,
  };
}
