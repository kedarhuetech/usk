import test from "node:test";
import assert from "node:assert/strict";
import { calculateBankBalances, maskAccountNumber, validateBankAccount, validateBankTransaction } from "./bankAccounts.js";

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

  assert.deepEqual(calculateBankBalances(accounts, transactions).map((account) => account.currentBalance), [1200.5, -2]);
});

test("accepts a zero opening balance and validates account fields", () => {
  assert.equal(validateBankAccount({
    accountName: "Current Account", bankName: "Example Bank", accountNumber: "123456789012",
    ifsc: "ABCD0123456", openingBalance: "0", openingBalanceDate: "2026-10-28",
  }), "");
  assert.match(validateBankAccount({ accountName: "", openingBalance: "-1" }), /Account name/);
});

test("requires a positive transaction amount and required transaction details", () => {
  const valid = { accountId: "bank-a", type: "money-in", amount: "0.01", date: "2026-10-28", description: "Cash deposit" };
  assert.equal(validateBankTransaction(valid), "");
  assert.match(validateBankTransaction({ ...valid, amount: 0 }), /greater than zero/);
  assert.match(validateBankTransaction({ ...valid, description: " " }), /Description/);
});

test("masks account numbers except the final four digits", () => {
  assert.equal(maskAccountNumber("1234 5678 9012"), "•••• 9012");
});
