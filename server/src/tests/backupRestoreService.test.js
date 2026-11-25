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

test("restoreUsvToDatabase: handles cross-business ID collisions by allocating new IDs and remapping foreign references", async () => {
  const conflictingExistingIds = {
    inventory_adjustments: ["b34e4f18-b9e7-434b-aa16-f6b75b1490d"],
    inventory_items: ["item-colliding"],
    parties: ["party-colliding"],
    transactions: ["txn-colliding"],
    bank_accounts: ["bank-colliding"],
    loan_accounts: ["loan-colliding"],
    service_reminders: ["srv-colliding"],
  };

  const executed = [];
  const conn = {
    executed,
    async query(sql, params = []) {
      executed.push({ sql: sql.trim(), params });
      for (const [table, ids] of Object.entries(conflictingExistingIds)) {
        if (sql.includes(`FROM \`${table}\``) || sql.includes(`FROM ${table}`)) {
          // If query is selecting conflicting candidate IDs
          const matches = ids.filter((id) => params.includes(id));
          return [matches.map((id) => ({ id }))];
        }
      }
      return [[]];
    },
  };

  const targetBusinessId = "biz-target-new";
  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:parties.v1": [
        { id: "party-colliding", partyName: "Colliding Customer" },
        { id: "party-clean", partyName: "Clean Customer" },
      ],
      "ledgerly:inventoryItems.v1": [
        {
          id: "item-colliding",
          itemName: "Colliding Item",
          batches: [{ id: "batch-1", batchNo: "B-001" }],
        },
        {
          id: "item-clean",
          itemName: "Clean Item",
        },
      ],
      "ledgerly:inventoryAdjustments.v1": [
        {
          id: "b34e4f18-b9e7-434b-aa16-f6b75b1490d",
          itemId: "item-colliding",
          itemName: "Colliding Item Adjustment",
          quantity: 5,
        },
        {
          id: "adj-clean",
          itemId: "item-clean",
          itemName: "Clean Item Adjustment",
          quantity: 2,
        },
      ],
      "ledgerly:saleInvoices.v1": [
        {
          id: "txn-colliding",
          partyId: "party-colliding",
          form: { invoiceNumber: "INV-C1" },
          rows: [
            { id: "row-1", itemId: "item-colliding", qty: 1, price: 100 },
          ],
        },
      ],
      "ledgerly:bankAccounts.v1": [
        { id: "bank-colliding", accountName: "Colliding Bank" },
      ],
      "ledgerly:bankTransactions.v1": [
        { id: "btx-1", accountId: "bank-colliding", amount: 1000 },
      ],
      "usv.loanAccounts.v1": [
        {
          id: "loan-colliding",
          accountName: "Colliding Loan",
          repayments: [{ id: "repay-1", amountPaid: 500 }],
        },
      ],
      "ledgerly:serviceReminders.v1": [
        {
          id: "srv-colliding",
          partyId: "party-colliding",
          serviceName: "Inspection",
          history: [{ id: "hist-1", messageText: "Due" }],
        },
      ],
    },
  };

  const result = await restoreUsvToDatabase(conn, targetBusinessId, payload);
  assert.equal(result.success, true);
  assert.equal(result.businessId, targetBusinessId);

  // 1. Inventory adjustments: Conflicting ID must be remapped to a new UUID
  const adjInserts = executed.filter((q) => q.sql.includes("INSERT INTO inventory_adjustments"));
  assert.equal(adjInserts.length, 2);

  const collidingAdj = adjInserts.find((q) => q.params[3] === "Colliding Item Adjustment");
  assert.ok(collidingAdj, "Must insert colliding adjustment");
  assert.notEqual(collidingAdj.params[0], "b34e4f18-b9e7-434b-aa16-f6b75b1490d", "Conflicting ID must NOT be reused");
  assert.match(collidingAdj.params[0], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Must generate valid UUID");

  const cleanAdj = adjInserts.find((q) => q.params[3] === "Clean Item Adjustment");
  assert.ok(cleanAdj, "Must insert clean adjustment");
  assert.equal(cleanAdj.params[0], "adj-clean", "Non-conflicting ID must be preserved");

  // 2. Inventory Items: Conflicting item must have new UUID, clean item keeps ID
  const itemInserts = executed.filter((q) => q.sql.includes("INSERT INTO inventory_items"));
  const collidingItem = itemInserts.find((q) => q.params[2] === "Colliding Item");
  const cleanItem = itemInserts.find((q) => q.params[2] === "Clean Item");
  assert.notEqual(collidingItem.params[0], "item-colliding");
  assert.equal(cleanItem.params[0], "item-clean");

  const newItemId = collidingItem.params[0];
  // Verify adjustment referenced the remapped item ID!
  assert.equal(collidingAdj.params[2], newItemId, "Adjustment must reference remapped item_id");

  // Verify batch referenced the remapped item ID!
  const batchInsert = executed.find((q) => q.sql.includes("INSERT INTO item_batches"));
  assert.equal(batchInsert.params[1], newItemId, "Batch must reference remapped item_id");

  // 3. Parties & Transactions: Conflicting party has new UUID
  const partyInserts = executed.filter((q) => q.sql.includes("INSERT INTO parties"));
  const collidingParty = partyInserts.find((q) => q.params[2] === "Colliding Customer");
  const cleanParty = partyInserts.find((q) => q.params[2] === "Clean Customer");
  assert.notEqual(collidingParty.params[0], "party-colliding");
  assert.equal(cleanParty.params[0], "party-clean");

  const newPartyId = collidingParty.params[0];

  // Verify transaction remapped its ID and party_id
  const txnInsert = executed.find((q) => q.sql.includes("INSERT INTO transactions"));
  assert.notEqual(txnInsert.params[0], "txn-colliding", "Conflicting txn ID must be remapped");
  assert.equal(txnInsert.params[6], newPartyId, "Transaction must reference remapped party_id");

  // Verify line item remapped its transaction_id and item_id
  const lineInsert = executed.find((q) => q.sql.includes("INSERT INTO transaction_items"));
  assert.equal(lineInsert.params[1], txnInsert.params[0], "Line item must reference remapped transaction_id");
  assert.equal(lineInsert.params[3], newItemId, "Line item must reference remapped item_id");

  // 4. Bank account and transaction
  const bankInsert = executed.find((q) => q.sql.includes("INSERT INTO bank_accounts"));
  assert.notEqual(bankInsert.params[0], "bank-colliding");
  const newBankId = bankInsert.params[0];

  const btxInsert = executed.find((q) => q.sql.includes("INSERT INTO bank_transactions"));
  assert.equal(btxInsert.params[2], newBankId, "Bank transaction must reference remapped account_id");

  // 5. Loan and repayment
  const loanInsert = executed.find((q) => q.sql.includes("INSERT INTO loan_accounts"));
  assert.notEqual(loanInsert.params[0], "loan-colliding");
  const newLoanId = loanInsert.params[0];

  const repayInsert = executed.find((q) => q.sql.includes("INSERT INTO loan_repayments"));
  assert.equal(repayInsert.params[2], newLoanId, "Loan repayment must reference remapped loan_id");

  // 6. Service reminder and history
  const srvInsert = executed.find((q) => q.sql.includes("INSERT INTO service_reminders"));
  assert.notEqual(srvInsert.params[0], "srv-colliding");
  assert.equal(srvInsert.params[2], newPartyId, "Service reminder must reference remapped party_id");
  const newSrvId = srvInsert.params[0];

  const histInsert = executed.find((q) => q.sql.includes("INSERT INTO service_reminder_history"));
  assert.equal(histInsert.params[1], newSrvId, "Service reminder history must reference remapped reminder_id");
});

/**
 * Stateful in-memory transactional mock connection for expense_categories and expense_items.
 * Supports BEGIN, COMMIT, ROLLBACK, DELETE (scoped by business_id), SELECT id collision checks, and INSERT.
 */
function createStatefulExpenseMockConnection(initialState = {}) {
  const cloneState = (s) => ({
    expense_categories: (s.expense_categories || []).map((r) => ({ ...r })),
    expense_items: (s.expense_items || []).map((r) => ({ ...r })),
  });

  let state = cloneState(initialState);
  let snapshot = null;
  let failOnSqlSubstring = null;
  const executed = [];

  return {
    executed,
    getState: () => cloneState(state),
    setFailOnSql(substring) {
      failOnSqlSubstring = substring;
    },
    async beginTransaction() {
      snapshot = cloneState(state);
      executed.push({ sql: "BEGIN", params: [] });
    },
    async commit() {
      snapshot = null;
      executed.push({ sql: "COMMIT", params: [] });
    },
    async rollback() {
      if (snapshot) {
        state = snapshot;
        snapshot = null;
      }
      executed.push({ sql: "ROLLBACK", params: [] });
    },
    async query(sql, params = []) {
      const trimmed = sql.trim();
      executed.push({ sql: trimmed, params });

      if (failOnSqlSubstring && trimmed.includes(failOnSqlSubstring)) {
        const err = new Error(`Simulated DB failure on ${failOnSqlSubstring}`);
        err.code = "ER_SIMULATED_FAILURE";
        throw err;
      }

      if (trimmed.startsWith("DELETE FROM expense_categories WHERE business_id = ?")) {
        const bizId = params[0];
        state.expense_categories = state.expense_categories.filter((r) => r.business_id !== bizId);
        return [{ affectedRows: 1 }];
      }

      if (trimmed.startsWith("DELETE FROM expense_items WHERE business_id = ?")) {
        const bizId = params[0];
        state.expense_items = state.expense_items.filter((r) => r.business_id !== bizId);
        return [{ affectedRows: 1 }];
      }

      const selectMatch = trimmed.match(/^SELECT id FROM `(expense_categories|expense_items)` WHERE id IN \((.+)\)$/);
      if (selectMatch) {
        const table = selectMatch[1];
        const idSet = new Set(params.map(String));
        const rows = state[table].filter((r) => idSet.has(String(r.id))).map((r) => ({ id: r.id }));
        return [rows];
      }

      if (trimmed.startsWith("INSERT INTO expense_categories")) {
        const [id, business_id, category_name, expense_type, created_at] = params;
        if (state.expense_categories.some((r) => r.id === id)) {
          const err = new Error(`Duplicate entry '${id}' for key 'expense_categories.PRIMARY'`);
          err.code = "ER_DUP_ENTRY";
          throw err;
        }
        state.expense_categories.push({
          id,
          business_id,
          category_name,
          expense_type,
          created_at: created_at || "CURRENT_TIMESTAMP(3)",
        });
        return [{ affectedRows: 1 }];
      }

      if (trimmed.startsWith("INSERT INTO expense_items")) {
        const [id, business_id, item_name, price, tax_rate, hsn_code, description, category, created_at, updated_at] = params;
        if (state.expense_items.some((r) => r.id === id)) {
          const err = new Error(`Duplicate entry '${id}' for key 'expense_items.PRIMARY'`);
          err.code = "ER_DUP_ENTRY";
          throw err;
        }
        state.expense_items.push({
          id,
          business_id,
          item_name,
          price,
          tax_rate,
          hsn_code,
          description,
          category,
          created_at: created_at || "CURRENT_TIMESTAMP(3)",
          updated_at: updated_at || "CURRENT_TIMESTAMP(3)",
        });
        return [{ affectedRows: 1 }];
      }

      return [[]];
    },
    release() {},
  };
}

test("restoreUsvToDatabase: restores expense items using item, name, itemName, hsn, hsnCode, tax, and taxRate aliases", async () => {
  const conn = createStatefulExpenseMockConnection();
  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:expenseItems.v1": [
        {
          id: "exp_item_1",
          item: "ethanol",
          name: "ethanol",
          price: 80,
          tax: "0.00",
          taxRate: 0,
          hsn: "",
          description: "",
          category: "Expenses",
          createdAt: "2026-11-19 18:03:58.641",
          updatedAt: "2026-11-19 18:03:58.641",
        },
        {
          id: "exp_item_2",
          name: "rice india",
          price: "85.50",
          tax: "5.00",
          hsn: "1006",
          description: "Basmati",
          category: "Raw Material",
        },
        {
          id: "exp_item_3",
          itemName: "Office Rent",
          unitPrice: 12000,
          taxRate: 18,
          hsnCode: "9972",
          description: "Monthly rent",
          category: "Rent",
        },
      ],
    },
  };

  const result = await restoreUsvToDatabase(conn, "target-biz", payload);
  assert.equal(result.stats.expenseItems, 3);
  assert.ok(result.replacedStores.includes("Expense items"));

  const items = conn.getState().expense_items;
  assert.equal(items.length, 3);

  assert.deepEqual(items[0], {
    id: "exp_item_1",
    business_id: "target-biz",
    item_name: "ethanol",
    price: 80,
    tax_rate: 0,
    hsn_code: null,
    description: null,
    category: "Expenses",
    created_at: "2026-11-19 18:03:58.641",
    updated_at: "2026-11-19 18:03:58.641",
  });

  assert.equal(items[1].item_name, "rice india");
  assert.equal(items[1].price, 85.5);
  assert.equal(items[1].tax_rate, 5);
  assert.equal(items[1].hsn_code, "1006");
  assert.equal(items[1].description, "Basmati");
  assert.equal(items[1].category, "Raw Material");

  assert.equal(items[2].item_name, "Office Rent");
  assert.equal(items[2].price, 12000);
  assert.equal(items[2].tax_rate, 18);
  assert.equal(items[2].hsn_code, "9972");
});

test("restoreUsvToDatabase: restores expense categories with categoryName/expenseType and name/type aliases and deduplicates case-insensitively", async () => {
  const conn = createStatefulExpenseMockConnection();
  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:expenseCategories.v1": [
        { id: "exp_cat_1", categoryName: "Cash Sale", expenseType: "indirect", createdAt: "2026-11-19 11:27:57" },
        { id: "exp_cat_2", categoryName: "Office Supplies", expenseType: "indirect", createdAt: "2026-11-20 12:50:19" },
        { id: "exp_cat_3", categoryName: " office supplies ", expenseType: "direct", createdAt: "2026-11-20 12:50:25" },
        { id: "exp_cat_4", name: "Tea", type: "indirect" },
        { id: "exp_cat_5", categoryName: "TEA", expenseType: "indirect" },
        { id: "exp_cat_6", name: "Travel", type: "direct" },
      ],
    },
  };

  const result = await restoreUsvToDatabase(conn, "target-biz", payload);
  assert.equal(result.stats.expenseCategories, 4);
  assert.ok(result.replacedStores.includes("Expense categories"));

  const cats = conn.getState().expense_categories;
  assert.equal(cats.length, 4);
  assert.deepEqual(
    cats.map((c) => ({ id: c.id, name: c.category_name, type: c.expense_type, created_at: c.created_at })),
    [
      { id: "exp_cat_1", name: "Cash Sale", type: "indirect", created_at: "2026-11-19 11:27:57" },
      { id: "exp_cat_2", name: "Office Supplies", type: "indirect", created_at: "2026-11-20 12:50:19" },
      { id: "exp_cat_4", name: "Tea", type: "indirect", created_at: "CURRENT_TIMESTAMP(3)" },
      { id: "exp_cat_6", name: "Travel", type: "direct", created_at: "CURRENT_TIMESTAMP(3)" },
    ]
  );
});

test("restoreUsvToDatabase: handles empty expense datasets by clearing target business and preserving other businesses", async () => {
  const conn = createStatefulExpenseMockConnection({
    expense_categories: [
      { id: "cat-target", business_id: "target-biz", category_name: "Rent", expense_type: "indirect" },
      { id: "cat-other", business_id: "other-biz", category_name: "Rent", expense_type: "indirect" },
    ],
    expense_items: [
      { id: "item-target", business_id: "target-biz", item_name: "Old Item", price: 10 },
      { id: "item-other", business_id: "other-biz", item_name: "Other Item", price: 20 },
    ],
  });

  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:expenseCategories.v1": [],
      "ledgerly:expenseItems.v1": [],
    },
  };

  const result = await restoreUsvToDatabase(conn, "target-biz", payload);
  assert.equal(result.stats.expenseCategories, 0);
  assert.equal(result.stats.expenseItems, 0);

  const state = conn.getState();
  assert.deepEqual(state.expense_categories.map((c) => c.id), ["cat-other"]);
  assert.deepEqual(state.expense_items.map((i) => i.id), ["item-other"]);
});

test("restoreUsvToDatabase: rejects invalid expense records before deleting existing records", async () => {
  const initial = {
    expense_categories: [
      { id: "cat-existing", business_id: "target-biz", category_name: "Existing Cat", expense_type: "indirect" },
    ],
    expense_items: [
      { id: "item-existing", business_id: "target-biz", item_name: "Existing Item", price: 50 },
    ],
  };

  // Invalid expense category (missing name)
  {
    const conn = createStatefulExpenseMockConnection(initial);
    const payload = {
      format: SUPPORTED_BACKUP_FORMAT,
      formatVersion: SUPPORTED_BACKUP_VERSION,
      data: {
        "ledgerly:expenseCategories.v1": [{ id: "bad-cat-1", expenseType: "indirect" }],
        "ledgerly:expenseItems.v1": [{ id: "good-item", item: "Paper", price: 10 }],
      },
    };
    await assert.rejects(
      restoreUsvToDatabase(conn, "target-biz", payload),
      (err) => err.status === 400 && /Invalid expense category at index 0 \(id: bad-cat-1\): category name is required\./.test(err.message)
    );
    assert.equal(conn.executed.some((q) => q.sql.startsWith("DELETE")), false, "Must NOT delete before validation");
    assert.deepEqual(conn.getState(), initial);
  }

  // Invalid expense item (missing name)
  {
    const conn = createStatefulExpenseMockConnection(initial);
    const payload = {
      format: SUPPORTED_BACKUP_FORMAT,
      formatVersion: SUPPORTED_BACKUP_VERSION,
      data: {
        "ledgerly:expenseCategories.v1": [{ id: "good-cat", categoryName: "Utilities" }],
        "ledgerly:expenseItems.v1": [{ id: "bad-item-1", price: 10 }],
      },
    };
    await assert.rejects(
      restoreUsvToDatabase(conn, "target-biz", payload),
      (err) => err.status === 400 && /Invalid expense item at index 0 \(id: bad-item-1\): item name is required\./.test(err.message)
    );
    assert.equal(conn.executed.some((q) => q.sql.startsWith("DELETE")), false, "Must NOT delete before validation");
    assert.deepEqual(conn.getState(), initial);
  }

  // Invalid expense item (negative/non-numeric price)
  {
    const conn = createStatefulExpenseMockConnection(initial);
    const payload = {
      format: SUPPORTED_BACKUP_FORMAT,
      formatVersion: SUPPORTED_BACKUP_VERSION,
      data: {
        "ledgerly:expenseItems.v1": [{ id: "bad-price-1", name: "Fuel", price: "not-a-number" }],
      },
    };
    await assert.rejects(
      restoreUsvToDatabase(conn, "target-biz", payload),
      (err) => err.status === 400 && /Invalid expense item at index 0 \(id: bad-price-1\): price must be a non-negative number\./.test(err.message)
    );
    assert.equal(conn.executed.some((q) => q.sql.startsWith("DELETE")), false);
    assert.deepEqual(conn.getState(), initial);
  }
});

test("restoreUsvToDatabase: remaps primary-key collisions for expense categories and items across businesses without touching other business", async () => {
  const conn = createStatefulExpenseMockConnection({
    expense_categories: [
      { id: "exp_cat_shared", business_id: "source-biz", category_name: "Rent", expense_type: "indirect" },
      { id: "exp_cat_target_old", business_id: "target-biz", category_name: "Old", expense_type: "indirect" },
    ],
    expense_items: [
      { id: "exp_item_shared", business_id: "source-biz", item_name: "Ethanol", price: 80 },
      { id: "exp_item_target_old", business_id: "target-biz", item_name: "Old Item", price: 10 },
    ],
  });

  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:expenseCategories.v1": [
        { id: "exp_cat_shared", categoryName: "Rent", expenseType: "indirect" },
        { id: "exp_cat_unique", categoryName: "Cash Sale", expenseType: "indirect" },
      ],
      "ledgerly:expenseItems.v1": [
        { id: "exp_item_shared", item: "Ethanol", price: 80 },
        { id: "exp_item_unique", name: "Wheat", price: 30 },
      ],
    },
  };

  const result = await restoreUsvToDatabase(conn, "target-biz", payload);
  assert.equal(result.stats.expenseCategories, 2);
  assert.equal(result.stats.expenseItems, 2);

  const state = conn.getState();

  // Source business records must remain completely untouched
  assert.ok(state.expense_categories.some((c) => c.id === "exp_cat_shared" && c.business_id === "source-biz"));
  assert.ok(state.expense_items.some((i) => i.id === "exp_item_shared" && i.business_id === "source-biz"));

  // Target business must have remapped colliding IDs and preserved non-colliding IDs
  const targetCats = state.expense_categories.filter((c) => c.business_id === "target-biz");
  assert.equal(targetCats.length, 2);
  const remappedCat = targetCats.find((c) => c.category_name === "Rent");
  const cleanCat = targetCats.find((c) => c.category_name === "Cash Sale");
  assert.notEqual(remappedCat.id, "exp_cat_shared");
  assert.equal(cleanCat.id, "exp_cat_unique");

  const targetItems = state.expense_items.filter((i) => i.business_id === "target-biz");
  assert.equal(targetItems.length, 2);
  const remappedItem = targetItems.find((i) => i.item_name === "Ethanol");
  const cleanItem = targetItems.find((i) => i.item_name === "Wheat");
  assert.notEqual(remappedItem.id, "exp_item_shared");
  assert.equal(cleanItem.id, "exp_item_unique");
});

test("restoreUsvToDatabase: rolls back expense deletions and inserts when a simulated DB insertion failure occurs", async () => {
  const initial = {
    expense_categories: [
      { id: "cat-target-keep", business_id: "target-biz", category_name: "Keep Cat", expense_type: "indirect" },
      { id: "cat-other-keep", business_id: "other-biz", category_name: "Other Cat", expense_type: "indirect" },
    ],
    expense_items: [
      { id: "item-target-keep", business_id: "target-biz", item_name: "Keep Item", price: 99 },
    ],
  };

  const conn = createStatefulExpenseMockConnection(initial);
  conn.setFailOnSql("INSERT INTO expense_items");

  const payload = {
    format: SUPPORTED_BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_VERSION,
    data: {
      "ledgerly:expenseCategories.v1": [{ id: "new-cat", categoryName: "New Cat" }],
      "ledgerly:expenseItems.v1": [{ id: "new-item", item: "New Item", price: 25 }],
    },
  };

  await conn.beginTransaction();
  try {
    await restoreUsvToDatabase(conn, "target-biz", payload);
    await conn.commit();
    assert.fail("Expected restoreUsvToDatabase to reject on simulated DB failure");
  } catch (err) {
    await conn.rollback();
    assert.match(err.message, /Simulated DB failure on INSERT INTO expense_items/);
  }

  assert.deepEqual(conn.getState(), initial, "Rollback must restore target business and other business records intact");
});
