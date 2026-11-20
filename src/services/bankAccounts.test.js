import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBankBalances,
  deleteBankAccount,
  formatBankAmount,
  listBankAccounts,
  listBankTransactions,
  maskAccountNumber,
  saveBankAccount,
  saveBankTransaction,
  validateBankAccount,
  validateBankTransaction,
} from "./bankAccounts.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withMockFetch(handler, testFn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => handler(url, options);
  return Promise.resolve()
    .then(testFn)
    .finally(() => {
      globalThis.fetch = originalFetch;
    });
}

// ---------------------------------------------------------------------------
// 1. Calculations & Validation (Pure Domain Logic)
// ---------------------------------------------------------------------------

test("calculates book balances from opening balance plus incoming minus outgoing transactions", () => {
  const accounts = [
    { id: "bank-a", openingBalance: "1000.25" },
    { id: "bank-b", openingBalance: "0" },
  ];
  const transactions = [
    { accountId: "bank-a", type: "money-in", amount: 250.4 },
    { accountId: "bank-a", type: "money-out", amount: 50.15 },
    { accountId: "bank-b", type: "money-out", amount: 2 },
    { accountId: "missing-account", type: "money-in", amount: 800 },
  ];

  assert.deepEqual(
    calculateBankBalances(accounts, transactions).map((account) => account.currentBalance),
    [1200.5, -2]
  );
});

test("accepts a zero opening balance and validates account fields", () => {
  assert.equal(
    validateBankAccount({
      accountName: "Current Account",
      bankName: "Example Bank",
      accountNumber: "123456789012",
      ifsc: "ABCD0123456",
      openingBalance: "0",
      openingBalanceDate: "2026-10-28",
    }),
    ""
  );
  assert.match(validateBankAccount({ accountName: "", openingBalance: "-1" }), /Account name/);
  assert.match(validateBankAccount({ accountName: "Checking", bankName: "", openingBalance: "0", openingBalanceDate: "2026-10-28" }), /Bank name/);
  assert.match(validateBankAccount({ accountName: "Checking", bankName: "SBI", accountNumber: "123", openingBalance: "0", openingBalanceDate: "2026-10-28" }), /6 to 20 digits/);
  assert.match(validateBankAccount({ accountName: "Checking", bankName: "SBI", accountNumber: "1234567890", ifsc: "INVALID", openingBalance: "0", openingBalanceDate: "2026-10-28" }), /IFSC/);
});

test("requires a positive transaction amount and required transaction details", () => {
  const valid = { accountId: "bank-a", type: "money-in", amount: "0.01", date: "2026-10-28", description: "Cash deposit" };
  assert.equal(validateBankTransaction(valid), "");
  assert.match(validateBankTransaction({ ...valid, amount: 0 }), /greater than zero/);
  assert.match(validateBankTransaction({ ...valid, description: " " }), /Description/);
  assert.match(validateBankTransaction({ ...valid, accountId: "" }), /bank account/);
  assert.match(validateBankTransaction({ ...valid, type: "transfer" }), /Money In or Money Out/);
});

test("masks account numbers except the final four digits", () => {
  assert.equal(maskAccountNumber("1234 5678 9012"), "•••• 9012");
  assert.equal(maskAccountNumber(""), "—");
});

test("formatBankAmount formats currency accurately", () => {
  const formatted = formatBankAmount(1500.5);
  assert.ok(formatted.includes("1,500.50"), `Expected formatted string to contain 1,500.50, got ${formatted}`);
});

// ---------------------------------------------------------------------------
// 2. Relational MySQL API Integration
// ---------------------------------------------------------------------------

test("listBankAccounts calls relational API endpoint GET /api/bank-accounts", async () => {
  const calls = [];
  const mockAccounts = [
    {
      id: "acc-101",
      accountName: "HDFC Primary",
      accountHolderName: "Sai Enterprises",
      accountNumber: "123456789012",
      bankName: "HDFC Bank",
      openingBalance: 1000.5,
      currentBalance: 2500.75,
      status: "active",
    },
  ];

  await withMockFetch((url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ success: true, data: mockAccounts });
  }, async () => {
    const result = await listBankAccounts();
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/api/bank-accounts"), `Expected /api/bank-accounts, got ${calls[0].url}`);
    assert.equal(calls[0].options.method || "GET", "GET");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "acc-101");
    assert.equal(result[0].currentBalance, 2500.75);
  });
});

test("saveBankAccount calls relational API endpoint POST /api/bank-accounts with mapped payload", async () => {
  const calls = [];
  const payload = {
    id: "acc-102",
    accountName: "ICICI Operational",
    accountHolderName: "Sai Enterprises",
    accountNumber: "9876 5432 1098", // spaces to be trimmed
    bankName: "ICICI Bank",
    ifsc: "icic0001234", // lowercase to be uppercased
    branch: "MG Road",
    openingBalance: 5000,
    openingBalanceDate: "2026-11-01",
    accountType: "Current",
    notes: "Secondary account",
    status: "active",
  };

  const returnedFromBackend = {
    ...payload,
    accountNumber: "987654321098",
    ifsc: "ICIC0001234",
    currentBalance: 5000,
  };

  await withMockFetch((url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ success: true, data: returnedFromBackend });
  }, async () => {
    const saved = await saveBankAccount(payload);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/api/bank-accounts"), `Expected /api/bank-accounts, got ${calls[0].url}`);
    assert.equal(calls[0].options.method, "POST");

    const sentBody = JSON.parse(calls[0].options.body);
    assert.equal(sentBody.accountNumber, "987654321098", "Account number spaces should be stripped");
    assert.equal(sentBody.ifsc, "ICIC0001234", "IFSC should be uppercased");
    assert.equal(saved.id, "acc-102");
    assert.equal(saved.currentBalance, 5000);
  });
});

test("listBankTransactions calls relational API endpoint GET /api/bank-accounts/transactions", async () => {
  const calls = [];
  const mockTransactions = [
    {
      id: "tx-301",
      accountId: "acc-101",
      type: "money-in",
      amount: 1500.25,
      date: "2026-11-05",
      description: "Client invoice payment",
    },
  ];

  await withMockFetch((url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ success: true, data: mockTransactions });
  }, async () => {
    // 1. Without account filter
    const all = await listBankTransactions();
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/api/bank-accounts/transactions"));
    assert.equal(all.length, 1);

    // 2. With account filter
    await listBankTransactions("acc-101");
    assert.equal(calls.length, 2);
    assert.ok(calls[1].url.includes("/api/bank-accounts/transactions?accountId=acc-101"));
  });
});

test("saveBankTransaction calls relational API endpoint POST /api/bank-accounts/transactions", async () => {
  const calls = [];
  const txnPayload = {
    id: "tx-302",
    accountId: "acc-101",
    type: "money-out",
    amount: "750.50", // string to be converted to number
    date: "2026-11-06",
    description: "Office supplies payment",
    reference: "REF-889",
    relatedParty: "Stationery Mart",
  };

  const returnedFromBackend = {
    ...txnPayload,
    amount: 750.5,
    updatedAccountBalance: 1750.25,
  };

  await withMockFetch((url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ success: true, data: returnedFromBackend });
  }, async () => {
    const saved = await saveBankTransaction(txnPayload);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/api/bank-accounts/transactions"));
    assert.equal(calls[0].options.method, "POST");

    const sentBody = JSON.parse(calls[0].options.body);
    assert.equal(sentBody.amount, 750.5, "Amount should be passed as a number");
    assert.equal(sentBody.type, "money-out");
    assert.equal(saved.id, "tx-302");
  });
});

test("deleteBankAccount calls relational API endpoint DELETE /api/bank-accounts/:id", async () => {
  const calls = [];
  await withMockFetch((url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ success: true, message: "Bank account deleted." });
  }, async () => {
    await deleteBankAccount("acc-clean");
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/api/bank-accounts/acc-clean"));
    assert.equal(calls[0].options.method, "DELETE");
  });
});

test("Empty API responses return empty data without localStorage fallback", async () => {
  // Simulate stale data in localStorage
  const originalWindow = globalThis.window;
  const store = new Map();
  store.set("usv.bank_accounts.stale", JSON.stringify([{ id: "stale-1", name: "Old Stale Account" }]));
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, val) => store.set(key, val),
    },
  };

  try {
    await withMockFetch(() => jsonResponse({ success: true, data: [] }), async () => {
      const accounts = await listBankAccounts();
      assert.deepEqual(accounts, [], "Empty API response must return [] without reading localStorage");

      const transactions = await listBankTransactions();
      assert.deepEqual(transactions, [], "Empty API response must return [] without reading localStorage");
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("API failures are propagated, not swallowed", async () => {
  await withMockFetch(() => jsonResponse({ success: false, message: "Duplicate account number detected" }, 409), async () => {
    await assert.rejects(
      () => saveBankAccount({ accountName: "Dup", bankName: "Bank", accountNumber: "12345678" }),
      /Duplicate account number detected/
    );
  });

  await withMockFetch(() => jsonResponse({ success: false, message: "Account is inactive" }, 409), async () => {
    await assert.rejects(
      () => saveBankTransaction({ accountId: "acc-101", type: "money-in", amount: 100, date: "2026-11-01", description: "Test" }),
      /Account is inactive/
    );
  });

  await withMockFetch(() => {
    throw new TypeError("Failed to fetch");
  }, async () => {
    await assert.rejects(
      () => listBankAccounts(),
      /Cannot reach the Vyapaar backend/
    );
  });
});

test("Backend-returned balances are respected in calculateBankBalances and service models", () => {
  // Case A: When transactions are not yet loaded (or empty), preserve backend currentBalance
  const accountsFromBackend = [
    { id: "acc-1", openingBalance: "1000.00", currentBalance: 3250.75 },
    { id: "acc-2", openingBalance: "500.00", currentBalance: 500.00 },
  ];
  const balancedWithoutTxns = calculateBankBalances(accountsFromBackend, []);
  assert.equal(balancedWithoutTxns[0].currentBalance, 3250.75, "Must respect currentBalance from backend when txns are empty");
  assert.equal(balancedWithoutTxns[1].currentBalance, 500.00);

  // Case B: When transactions are provided, recalculate accurately
  const txns = [
    { accountId: "acc-1", type: "money-in", amount: 2000 },
    { accountId: "acc-1", type: "money-out", amount: 100 },
  ];
  const balancedWithTxns = calculateBankBalances(accountsFromBackend, txns);
  // Opening (1000) + 2000 - 100 = 2900
  assert.equal(balancedWithTxns[0].currentBalance, 2900);
});
