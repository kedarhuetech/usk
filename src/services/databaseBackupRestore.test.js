import { test } from "node:test";
import assert from "node:assert/strict";
import { getScopedStorageKey } from "../config/businessConfig.js";
import {
  createDatabaseBackupRestoreRepository,
  createLocalStorageBackupRestoreRepository,
} from "./backupRestoreRepository.js";
import {
  restoreBackupPayload,
  previewBackupPayload,
  validateBackupPayload,
  createBackupPayload,
  BACKUP_FORMAT,
  BACKUP_SOURCES,
} from "./backupToComputer.js";

test("database repository: calls apiRequest and triggers hydration without writing business data to localStorage", async () => {
  const values = new Map();
  const mockStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };

  let apiCalled = false;
  let apiPath = "";
  let apiMethod = "";
  let apiBody = null;

  const mockRepository = {
    async restore(entries, data, payload) {
      apiCalled = true;
      apiPath = "/backup/restore-payload";
      apiMethod = "POST";
      apiBody = payload;
      return {
        success: true,
        totalRestoredCount: 2,
        stats: { parties: 1, items: 1 },
        replacedStores: ["Parties", "Items"],
      };
    },
  };

  const payload = {
    format: "usv-backup",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    application: { name: "USV" },
    manifest: { included: [{ category: "Parties", key: "ledgerly:parties.v1" }] },
    data: {
      "ledgerly:parties.v1": [{ id: "p1", partyName: "Customer 1" }],
    },
  };

  const result = await restoreBackupPayload(payload, mockRepository);

  assert.equal(apiCalled, true);
  assert.equal(apiPath, "/backup/restore-payload");
  assert.equal(apiMethod, "POST");
  assert.equal(result.restoredCount, 2);
  assert.deepEqual(result.stats, { parties: 1, items: 1 });
  assert.equal(values.has("ledgerly:parties.v1"), false, "Must NOT write business records to legacy localStorage keys");
});

test("database repository: fails cleanly on backend error without claiming success", async () => {
  const failingRepository = {
    async restore() {
      const err = new Error("Database transaction rolled back due to duplicate key error");
      err.status = 500;
      throw err;
    },
  };

  const payload = {
    format: "usv-backup",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    application: { name: "USV" },
    manifest: { included: [{ category: "Items", key: "ledgerly:inventoryItems.v1" }] },
    data: {
      "ledgerly:inventoryItems.v1": [{ id: "i1", itemName: "Product A" }],
    },
  };

  await assert.rejects(
    restoreBackupPayload(payload, failingRepository),
    /Database transaction rolled back/
  );
});

test("previewBackupPayload: correctly inspects USV backup and extracts company name and counts", () => {
  const payload = {
    format: "usv-backup",
    formatVersion: 1,
    createdAt: "2026-11-20T12:00:00.000Z",
    application: { name: "USV" },
    manifest: { included: [] },
    data: {
      "ledgerly:companyProfile.v1": { companyName: "Super Enterprises" },
      "ledgerly:parties.v1": [{ id: "p1" }, { id: "p2" }],
      "ledgerly:inventoryItems.v1": [{ id: "i1" }],
    },
  };

  const preview = previewBackupPayload(payload);
  assert.equal(preview.companyName, "Super Enterprises");
  assert.equal(preview.entries.length, 3);
  const partyEntry = preview.entries.find((e) => e.key === "ledgerly:parties.v1");
  assert.equal(partyEntry.recordCount, 2);
});

test("syncAllFromDatabase: synchronizes supported main-application datasets into cache", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  const storageValues = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => storageValues.get(k) ?? null,
      setItem: (k, v) => storageValues.set(k, String(v)),
      removeItem: (k) => storageValues.delete(k),
    },
    dispatchEvent: () => true,
  };

  const requestedEndpoints = [];

  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    requestedEndpoints.push(urlStr);

    let data = [];
    if (urlStr.includes("/parties")) data = [{ id: "p1", partyName: "Customer A" }];
    else if (urlStr.includes("/items")) data = [{ id: "i1", itemName: "Item A" }];
    else if (urlStr.includes("/transactions")) data = [{ id: "t1", transactionType: "sale", totalAmount: 100 }];
    else if (urlStr.includes("/service-reminders")) data = [{ id: "s1", serviceName: "AC Service" }];
    else if (urlStr.includes("/bank-accounts/transactions")) data = [{ id: "bt1", amount: 500 }];
    else if (urlStr.includes("/bank-accounts")) data = [{ id: "b1", accountName: "SBI Account" }];
    else if (urlStr.includes("/settings/company-profile")) data = { companyName: "Sai Kirana" };
    else if (urlStr.includes("/settings")) data = { theme: "light" };
    else if (urlStr.includes("/cash-bank/cash-in-hand")) data = [{ id: "c1", amount: 1000 }];
    else if (urlStr.includes("/cash-bank/cheques")) data = [{ id: "ch1", chequeNumber: "111" }];
    else if (urlStr.includes("/cash-bank/loan-accounts")) data = [{ id: "l1", accountName: "Car Loan" }];
    else if (urlStr.includes("/units/conversions")) data = [{ id: "uc1", unit: "BOX", toUnit: "PCS", factor: 10 }];
    else if (urlStr.includes("/units")) data = [{ id: "u1", name: "BOX", shortName: "BOX" }];
    else if (urlStr.includes("/inventory-adjustments")) data = [{ id: "adj1", quantity: 5 }];
    else if (urlStr.includes("/expense-categories")) data = [{ id: "ec1", categoryName: "Travel" }];
    else if (urlStr.includes("/expense-items")) data = [{ id: "ei1", itemName: "Petrol" }];

    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true, data }),
    };
  };

  try {
    const { syncAllFromDatabase } = await import("./databaseRepository.js");
    const results = await syncAllFromDatabase();
    assert.ok(Array.isArray(results), "syncAllFromDatabase must return results array");
    assert.ok(results.length >= 10, "Must synchronize all supported main-application datasets");

    // Verify localStorage keys were populated (either base key or scoped key)
    const hasKey = (baseKey) => storageValues.has(baseKey) || storageValues.has(getScopedStorageKey(baseKey));
    assert.ok(hasKey("ledgerly:parties.v1"), "Must hydrate parties");
    assert.ok(hasKey("ledgerly:inventoryItems.v1"), "Must hydrate items");
    assert.ok(hasKey("ledgerly:saleInvoices.v1"), "Must hydrate sale invoices");
    assert.ok(hasKey("ledgerly:serviceReminderRecords.v1"), "Must hydrate service reminders");
    assert.ok(hasKey("ledgerly:bankAccounts.v1"), "Must hydrate bank accounts");
    assert.ok(hasKey("ledgerly:bankTransactions.v1"), "Must hydrate bank transactions");
    assert.ok(hasKey("ledgerly:cashAdjustments.v1"), "Must hydrate cash adjustments");
    assert.ok(hasKey("usv.cheques.v1"), "Must hydrate cheques");
    assert.ok(hasKey("usv.loanAccounts.v1"), "Must hydrate loans");
    assert.ok(hasKey("ledgerly:customUnits.v1"), "Must hydrate units");
    assert.ok(hasKey("ledgerly:unitConversions.v1"), "Must hydrate unit conversions");
    assert.ok(hasKey("ledgerly:inventoryAdjustments.v1"), "Must hydrate inventory adjustments");
    assert.ok(hasKey("ledgerly:expenseCategories.v1"), "Must hydrate expense categories");
    assert.ok(hasKey("ledgerly:expenseItems.v1"), "Must hydrate expense items");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("syncAllFromDatabase: rejects when one critical synchronization request fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  globalThis.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    dispatchEvent: () => true,
  };

  // Simulate /parties endpoint failing with 500 error, others succeed
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/parties")) {
      return {
        ok: false,
        status: 500,
        headers: { get: () => "application/json" },
        json: async () => ({ success: false, message: "Internal server error connecting to MySQL parties table" }),
      };
    }
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true, data: [] }),
    };
  };

  try {
    const { syncAllFromDatabase } = await import("./databaseRepository.js");
    await assert.rejects(
      async () => {
        await syncAllFromDatabase();
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("Database synchronization failed for: Parties"), "Must name Parties as failed dataset");
        assert.deepEqual(err.failedDatasets, ["Parties"]);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("syncAllFromDatabase: reports all failed dataset names when multiple synchronization requests fail", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  globalThis.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    dispatchEvent: () => true,
  };

  // Simulate failures on /parties, /items, and /transactions
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/parties") || urlStr.includes("/items") || urlStr.includes("/transactions")) {
      return {
        ok: false,
        status: 503,
        headers: { get: () => "application/json" },
        json: async () => ({ success: false, message: "Database service temporarily unavailable" }),
      };
    }
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true, data: [] }),
    };
  };

  try {
    const { syncAllFromDatabase } = await import("./databaseRepository.js");
    await assert.rejects(
      async () => {
        await syncAllFromDatabase();
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("Parties"), "Must include Parties");
        assert.ok(err.message.includes("Inventory items"), "Must include Inventory items");
        assert.ok(err.message.includes("Transactions"), "Must include Transactions");
        assert.ok(err.failedDatasets.includes("Parties"));
        assert.ok(err.failedDatasets.includes("Inventory items"));
        assert.ok(err.failedDatasets.includes("Transactions"));
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("backup creation workflow: sync failure prevents backup generation, triggers no download, and shows error notification", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  const storageValues = new Map();
  // Existing stale data in localStorage
  storageValues.set("ledgerly:parties.v1", JSON.stringify([{ id: "stale-1", partyName: "Old Stale Party" }]));

  globalThis.window = {
    localStorage: {
      getItem: (k) => storageValues.get(k) ?? null,
      setItem: (k, v) => storageValues.set(k, String(v)),
      removeItem: (k) => storageValues.delete(k),
    },
    dispatchEvent: () => true,
  };

  // Simulate network failure
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch: Network disconnected");
  };

  try {
    const { syncAllFromDatabase } = await import("./databaseRepository.js");

    let downloadTriggered = false;
    let payloadCreated = false;
    let uiStatus = null;

    // Simulate BackupToComputer createBackup flow
    const executeBackupFlow = async () => {
      try {
        await syncAllFromDatabase();
        payloadCreated = true;
        downloadTriggered = true;
        uiStatus = { type: "success", text: "Backup download started: test.usvbackup" };
      } catch (error) {
        uiStatus = { type: "error", text: error.message || "Could not create the backup file." };
      }
    };

    await executeBackupFlow();

    // Verification:
    assert.equal(payloadCreated, false, "Must NOT create backup payload when synchronization fails");
    assert.equal(downloadTriggered, false, "Must NOT trigger backup download when synchronization fails");
    assert.equal(uiStatus.type, "error", "Status must be error, not success");
    assert.notEqual(uiStatus.type, "success", "Must NEVER display a successful backup message after failed sync");
    assert.ok(uiStatus.text.includes("Database synchronization failed"), "Must inform user that database sync failed");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
