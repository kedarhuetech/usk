import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateUsvPayload,
  restoreUsvToDatabase,
  SUPPORTED_BACKUP_FORMAT,
  SUPPORTED_BACKUP_VERSION,
} from "../services/backupRestoreService.js";

/**
 * Mock connection to test SQL statement emission and parameter binding in an ACID transaction.
 */
function createMockConnection() {
  const executed = [];
  let inTransaction = false;

  return {
    executed,
    inTransaction: () => inTransaction,
    async beginTransaction() {
      inTransaction = true;
      executed.push({ sql: "BEGIN", params: [] });
    },
    async commit() {
      inTransaction = false;
      executed.push({ sql: "COMMIT", params: [] });
    },
    async rollback() {
      inTransaction = false;
      executed.push({ sql: "ROLLBACK", params: [] });
    },
    async query(sql, params = []) {
      executed.push({ sql: sql.trim(), params });
      return [[]];
    },
    release() {},
  };
}

test("validateUsvPayload: validates valid USV backup payload", () => {
  const valid = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    data: {
      "ledgerly:companyProfile.v1": { companyName: "Test Co" },
      "ledgerly:parties.v1": [{ id: "p1", partyName: "Customer A" }],
    },
  };
  assert.equal(validateUsvPayload(valid), true);
});

test("validateUsvPayload: rejects invalid payload formats and versions", () => {
  assert.throws(() => validateUsvPayload(null), /JSON object/);
  assert.throws(() => validateUsvPayload([]), /JSON object/);
  assert.throws(() => validateUsvPayload({ format: "vyb-backup" }), /Unsupported backup format/);
  assert.throws(() => validateUsvPayload({ format: SUPPORTED_BACKUP_FORMAT, formatVersion: 99 }), /Unsupported backup version/);
  assert.throws(() => validateUsvPayload({ format: SUPPORTED_BACKUP_FORMAT, formatVersion: 1, data: "not-an-object" }), /missing the required data object/);
});

test("restoreUsvToDatabase: requires valid business ID", async () => {
  const conn = createMockConnection();
  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {},
  };
  await assert.rejects(
    restoreUsvToDatabase(conn, "", payload),
    /A valid business ID is required/
  );
});

test("restoreUsvToDatabase: restores company profile, parties, items, and transactions with correct business isolation", async () => {
  const conn = createMockConnection();
  const testBusinessId = "biz-test-123";

  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    createdAt: "2026-11-20T10:00:00.000Z",
    data: {
      "ledgerly:companyProfile.v1": {
        companyName: "Sai Trading Co",
        phone: "9876543210",
        gstin: "27AADCS1234F1Z5",
        state: "Maharashtra",
        pincode: "400001",
        bankName: "HDFC Bank",
        bankAccountNumber: "50100234567890",
        bankIfscCode: "HDFC0000123",
      },
      "ledgerly:parties.v1": [
        {
          id: "party-1",
          partyName: "ABC Corp",
          phone: "9123456780",
          partyType: "customer",
          openingBalance: 5000,
          currentBalance: 5000,
          balanceType: "to_receive",
          billingAddress: "Shop 1, MG Road",
          pincode: "400001",
        },
      ],
      "ledgerly:inventoryItems.v1": [
        {
          id: "item-1",
          itemName: "Wheat Flour 10kg",
          salePrice: 450,
          purchasePrice: 400,
          openingQuantity: 50,
          currentStock: 50,
          unit: "BAG",
          taxRate: 5,
        },
      ],
      "ledgerly:saleInvoices.v1": [
        {
          id: "inv-1",
          form: {
            invoiceNumber: "INV-001",
            invoiceDate: "2026-11-20",
            customerId: "party-1",
            customer: "ABC Corp",
          },
          totals: {
            finalTotal: 900,
            received: 900,
            balance: 0,
          },
          rows: [
            {
              id: "row-1",
              itemId: "item-1",
              item: "Wheat Flour 10kg",
              qty: 2,
              price: 450,
              totalAmount: 900,
            },
          ],
        },
      ],
    },
  };

  const result = await restoreUsvToDatabase(conn, testBusinessId, payload);

  assert.equal(result.success, true);
  assert.equal(result.businessId, testBusinessId);
  assert.equal(result.stats.companyProfile, 1);
  assert.equal(result.stats.parties, 1);
  assert.equal(result.stats.items, 1);
  assert.equal(result.stats.transactions, 1);
  assert.equal(result.stats.transactionItems, 1);
  assert.ok(result.totalRestoredCount >= 4);

  // Verify that all queries strictly include the businessId parameter
  const bizScopedQueries = conn.executed.filter(
    (q) => q.params && q.params.includes(testBusinessId)
  );
  assert.ok(bizScopedQueries.length >= 6, "All database writes must be scoped to the active businessId");

  // Verify replacement order: parties and items delete previous records for businessId before insert
  const partyDelete = conn.executed.find(
    (q) => q.sql.includes("DELETE FROM parties WHERE business_id = ?") && q.params[0] === testBusinessId
  );
  assert.ok(partyDelete, "Parties must delete existing business records before inserting restored records");

  const itemDelete = conn.executed.find(
    (q) => q.sql.includes("DELETE FROM inventory_items WHERE business_id = ?") && q.params[0] === testBusinessId
  );
  assert.ok(itemDelete, "Items must delete existing business records before inserting restored records");

  const txnDelete = conn.executed.find(
    (q) => q.sql.includes("DELETE FROM transactions WHERE business_id = ?") && q.params[0] === testBusinessId
  );
  assert.ok(txnDelete, "Transactions must delete existing business records of matching types before inserting restored records");
});

test("restoreUsvToDatabase: preserves datasets omitted from the backup", async () => {
  const conn = createMockConnection();
  const testBusinessId = "biz-partial";

  // Backup contains only company profile and parties (no items, no transactions, no bank accounts)
  const partialPayload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:companyProfile.v1": { companyName: "Partial Test" },
      "ledgerly:parties.v1": [{ id: "p2", partyName: "Only Party" }],
    },
  };

  const result = await restoreUsvToDatabase(conn, testBusinessId, partialPayload);

  assert.equal(result.success, true);
  assert.equal(result.stats.parties, 1);
  assert.equal(result.stats.items, 0);
  assert.equal(result.stats.transactions, 0);

  // Verify that inventory_items or transactions tables were NEVER deleted because they were not in the backup
  const itemDelete = conn.executed.find((q) => q.sql.includes("inventory_items"));
  assert.equal(itemDelete, undefined, "Datasets omitted from backup must NOT be deleted");

  const txnDelete = conn.executed.find((q) => q.sql.includes("DELETE FROM transactions"));
  assert.equal(txnDelete, undefined, "Transactions must NOT be deleted if not included in backup");
});

test("restoreUsvToDatabase: restores bank accounts, bank transactions, cash in hand, cheques, and loans", async () => {
  const conn = createMockConnection();
  const testBusinessId = "biz-financial";

  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:bankAccounts.v1": [
        { id: "bank-1", accountName: "Current Account", bankName: "SBI", openingBalance: 10000 },
      ],
      "ledgerly:bankTransactions.v1": [
        {
          id: "btx-1",
          accountId: "bank-1",
          type: "money-in",
          amount: 5000,
          date: "2026-11-20",
          reference: "CHQ-123",
          description: "Customer Payment",
          relatedParty: "ABC Corp",
        },
      ],
      "ledgerly:cashAdjustments.v1": [
        { id: "cash-1", entryType: "in", amount: 5000, description: "Opening Cash" },
      ],
      "usv.cheques.v1:other-biz": [
        {
          id: "chq-1",
          partyName: "XYZ Traders",
          chequeNumber: "987654",
          bankName: "HDFC Bank",
          amount: 15000,
          date: "2026-11-22",
          type: "received",
          status: "pending",
        },
      ],
      "usv.loanAccounts.v1:other-biz": [
        {
          id: "loan-1",
          accountName: "Mudra Loan",
          lenderName: "SBI",
          principalAmount: 50000,
          repayments: [
            {
              id: "repay-1",
              paymentDate: "2026-11-21",
              amountPaid: 2500,
              principalPaid: 2000,
              interestPaid: 500,
              paymentMode: "bank",
              reference: "NEFT-001",
            },
          ],
        },
      ],
    },
  };

  const result = await restoreUsvToDatabase(conn, testBusinessId, payload);
  assert.equal(result.stats.bankAccounts, 1);
  assert.equal(result.stats.bankTransactions, 1);
  assert.equal(result.stats.cashAdjustments, 1);
  assert.equal(result.stats.cheques, 1);
  assert.equal(result.stats.loanAccounts, 1);
  assert.equal(result.stats.loanRepayments, 1);

  // 1. Verify bank transaction INSERT and parameters
  const btxInsert = conn.executed.find((q) => q.sql.includes("INSERT INTO bank_transactions"));
  assert.ok(btxInsert, "Must emit INSERT INTO bank_transactions");
  assert.equal(btxInsert.params[0], "btx-1");
  assert.equal(btxInsert.params[1], testBusinessId);
  assert.equal(btxInsert.params[2], "bank-1");
  assert.equal(btxInsert.params[3], "money-in");
  assert.equal(btxInsert.params[4], 5000);
  assert.equal(btxInsert.params[5], "2026-11-20");
  assert.equal(btxInsert.params[6], "CHQ-123");
  assert.equal(btxInsert.params[7], "Customer Payment");
  assert.equal(btxInsert.params[8], "ABC Corp");

  // 2. Verify cheque INSERT and parameters
  const chqInsert = conn.executed.find((q) => q.sql.includes("INSERT INTO cheques"));
  assert.ok(chqInsert, "Must emit INSERT INTO cheques");
  assert.equal(chqInsert.params[0], "chq-1");
  assert.equal(chqInsert.params[1], testBusinessId);
  assert.equal(chqInsert.params[3], "XYZ Traders");
  assert.equal(chqInsert.params[4], "987654");
  assert.equal(chqInsert.params[5], "HDFC Bank");
  assert.equal(chqInsert.params[6], 15000);

  // 3. Verify loan account INSERT and parameters
  const loanInsert = conn.executed.find((q) => q.sql.includes("INSERT INTO loan_accounts"));
  assert.ok(loanInsert, "Must emit INSERT INTO loan_accounts");
  assert.equal(loanInsert.params[0], "loan-1");
  assert.equal(loanInsert.params[1], testBusinessId);
  assert.equal(loanInsert.params[2], "Mudra Loan");
  assert.equal(loanInsert.params[3], "SBI");
  assert.equal(loanInsert.params[6], 50000);

  // 4. Verify loan repayment INSERT and parameters
  const repayInsert = conn.executed.find((q) => q.sql.includes("INSERT INTO loan_repayments"));
  assert.ok(repayInsert, "Must emit INSERT INTO loan_repayments");
  assert.equal(repayInsert.params[0], "repay-1");
  assert.equal(repayInsert.params[1], testBusinessId);
  assert.equal(repayInsert.params[2], "loan-1");
  assert.equal(repayInsert.params[4], 2500);
  assert.equal(repayInsert.params[5], 2000);
  assert.equal(repayInsert.params[6], 500);

  // 5. Verify deletion order: child repayments before parent loans
  const repayDeleteIdx = conn.executed.findIndex((q) => q.sql.includes("DELETE FROM loan_repayments"));
  const loanDeleteIdx = conn.executed.findIndex((q) => q.sql.includes("DELETE FROM loan_accounts"));
  assert.ok(repayDeleteIdx !== -1 && loanDeleteIdx !== -1, "Both loan tables must have DELETE executed");
  assert.ok(repayDeleteIdx < loanDeleteIdx, "Child loan_repayments must be deleted BEFORE parent loan_accounts");

  // 6. Verify insertion order: parent loans before child repayments
  const loanInsertIdx = conn.executed.findIndex((q) => q.sql.includes("INSERT INTO loan_accounts"));
  const repayInsertIdx = conn.executed.findIndex((q) => q.sql.includes("INSERT INTO loan_repayments"));
  assert.ok(loanInsertIdx < repayInsertIdx, "Parent loan_accounts must be inserted BEFORE child loan_repayments");
});

test("restoreUsvToDatabase: restores service reminders and notification history with correct parent-child order", async () => {
  const conn = createMockConnection();
  const testBusinessId = "biz-reminders";

  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:serviceReminderRecords.v1": [
        {
          id: "srv-1",
          customerName: "Ramesh Sharma",
          customerPhone: "9876543210",
          serviceName: "AC Maintenance",
          serviceDate: "2026-11-01",
          serviceDueDate: "2026-11-25",
          status: "Due Soon",
          notificationHistory: [
            {
              id: "hist-1",
              channel: "whatsapp",
              recipient: "9876543210",
              messageText: "Your AC service is due on 25 Nov.",
              dueDate: "2026-11-25",
              status: "Sent",
            },
          ],
        },
      ],
    },
  };

  const result = await restoreUsvToDatabase(conn, testBusinessId, payload);
  assert.equal(result.stats.serviceReminders, 1);
  assert.equal(result.stats.serviceReminderHistory, 1);

  // 1. Verify deletion order: child history before parent reminders
  const histDeleteIdx = conn.executed.findIndex((q) => q.sql.includes("DELETE FROM service_reminder_history"));
  const srvDeleteIdx = conn.executed.findIndex((q) => q.sql.includes("DELETE FROM service_reminders"));
  assert.ok(histDeleteIdx < srvDeleteIdx, "Child history must be deleted BEFORE parent reminders");

  // 2. Verify insertion order: parent reminders before child history
  const srvInsertIdx = conn.executed.findIndex((q) => q.sql.includes("INSERT INTO service_reminders"));
  const histInsertIdx = conn.executed.findIndex((q) => q.sql.includes("INSERT INTO service_reminder_history"));
  assert.ok(srvInsertIdx < histInsertIdx, "Parent reminders must be inserted BEFORE child history");

  // 3. Verify parameters
  const srvInsert = conn.executed[srvInsertIdx];
  assert.equal(srvInsert.params[0], "srv-1");
  assert.equal(srvInsert.params[1], testBusinessId);
  assert.equal(srvInsert.params[3], "Ramesh Sharma");
  assert.equal(srvInsert.params[4], "9876543210");
  assert.equal(srvInsert.params[6], "AC Maintenance");

  const histInsert = conn.executed[histInsertIdx];
  assert.equal(histInsert.params[0], "hist-1");
  assert.equal(histInsert.params[1], "srv-1");
  assert.equal(histInsert.params[2], testBusinessId);
  assert.equal(histInsert.params[3], "whatsapp");
  assert.equal(histInsert.params[4], "9876543210");
  assert.equal(histInsert.params[5], "Your AC service is due on 25 Nov.");
});

test("restoreUsvToDatabase: empty array clears dataset; missing dataset preserves existing records", async () => {
  const conn = createMockConnection();
  const testBusinessId = "biz-empty-vs-missing";

  // Payload explicitly contains empty cheques array (intent to clear), but omits bank_transactions completely
  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "usv.cheques.v1": [],
    },
  };

  const result = await restoreUsvToDatabase(conn, testBusinessId, payload);
  assert.equal(result.stats.cheques, 0);

  // Cheques was present as empty array -> DELETE must be executed
  const chqDelete = conn.executed.find((q) => q.sql.includes("DELETE FROM cheques"));
  assert.ok(chqDelete, "Explicitly empty dataset must execute DELETE to clear records");

  // Bank transactions was missing completely -> DELETE must NOT be executed
  const btxDelete = conn.executed.find((q) => q.sql.includes("bank_transactions"));
  assert.equal(btxDelete, undefined, "Missing dataset must NOT execute DELETE, preserving existing DB rows");

  // Loan accounts was missing completely -> DELETE must NOT be executed
  const loanDelete = conn.executed.find((q) => q.sql.includes("loan_accounts"));
  assert.equal(loanDelete, undefined, "Missing loan dataset must NOT execute DELETE");
});
