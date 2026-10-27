// Tests database reuse, local fallback, migration, and storage error handling.
import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  // A Map provides browser-like key/value storage for isolated unit tests.
  values = new Map();
  // Match the small localStorage interface used by the importer.
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const storage = new MemoryStorage();
globalThis.window = { localStorage: storage };
const MODE_KEY = "ledgerly:tallyImport.storageMode.v1:demo-business";
const RECORDS_KEY = "ledgerly:tallyImport.localDemoRecords.v1:demo-business";

// Simple canonical party and item rows used by storage adapter tests.
const demoRows = [
  { recordType: "party", sourceName: "Demo Customer", errors: [], warnings: [], status: "ready", party: { partyName: "Demo Customer", phone: "12345" } },
  { recordType: "item", sourceName: "Demo Bolt", errors: [], warnings: [], status: "ready", item: { type: "product", itemName: "Demo Bolt", unit: "Nos", itemCode: "B-100" } },
];

// This helper handles response logic.
function jsonResponse(data, status = 200) {
  // Format responses exactly as apiClient expects from the backend.
  return new Response(JSON.stringify(status >= 400 ? { success: false, message: "Backend unavailable" } : { success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("falls back to an isolated local demo repository and preserves records across a service reload", async () => {
  // A 502 during preview selects the local store before any import writes happen.
  let requestCount = 0;
  globalThis.fetch = async () => { requestCount += 1; return jsonResponse(null, 502); };
  const repository = await import("./tallyImportStorage.js?local-demo-test");
  const preview = await repository.previewImport(demoRows);
  assert.equal(preview.mode, "local-demo");
  assert.ok(preview.fallbackReason);
  assert.deepEqual(preview.records.map((record) => record.status), ["ready", "ready"]);

  // Importing locally must persist only in the dedicated feature storage key.
  const imported = await repository.importRecords(demoRows);
  assert.equal(imported.imported, 2);
  assert.equal(imported.failed, 0);
  assert.equal(requestCount, 2, "only the pre-import database read is attempted");

  const refreshed = await import("./tallyImportStorage.js?local-demo-refresh-test");
  assert.equal(refreshed.getTallyImportStorageMode(), "local-demo");
  const local = await refreshed.getImportedRecords();
  assert.equal(local.parties.length, 1);
  assert.equal(local.items.length, 1);
  const duplicateCheck = await refreshed.checkDuplicates(demoRows);
  assert.deepEqual(duplicateCheck.records.map((record) => record.status), ["duplicate", "duplicate"]);
});

test("uses the existing company-scoped business-data API when it is available", async () => {
  // Mock successful existing API responses and inspect company-scoped requests.
  storage.removeItem(MODE_KEY);
  storage.removeItem(RECORDS_KEY);
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", businessId: new Headers(options.headers).get("X-Business-Id") });
    if (options.method === "POST") return jsonResponse(JSON.parse(options.body));
    return jsonResponse([]);
  };
  const repository = await import("./tallyImportStorage.js?database-adapter-test");
  const summary = await repository.importRecords(demoRows);
  assert.equal(summary.mode, "database");
  assert.equal(summary.imported, 2);
  assert.deepEqual(requests.map((request) => request.method), ["GET", "GET", "POST", "POST"]);
  assert.ok(requests.every((request) => request.businessId === "demo-business"));
  assert.ok(requests.some((request) => request.url.endsWith("/api/business-data/items")));
  assert.ok(requests.some((request) => request.url.endsWith("/api/business-data/parties")));
  assert.equal(storage.getItem(RECORDS_KEY), null);
});

test("reports malformed local demo data rather than replacing it", async () => {
  // Corrupt saved data should fail closed instead of being replaced with an empty list.
  storage.setItem(MODE_KEY, "local-demo");
  storage.setItem(RECORDS_KEY, "{broken");
  const repository = await import("./tallyImportStorage.js?local-corrupt-test");
  await assert.rejects(repository.checkDuplicates(demoRows), SyntaxError);
  assert.equal(storage.getItem(RECORDS_KEY), "{broken");
  storage.removeItem(MODE_KEY);
  storage.removeItem(RECORDS_KEY);
});

test("reports partial database failures without switching to local storage", async () => {
  // A failed item save does not hide a successful party save or change repositories.
  storage.removeItem(MODE_KEY);
  storage.removeItem(RECORDS_KEY);
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "POST" && String(url).endsWith("/items")) return jsonResponse(null, 502);
    if (options.method === "POST") return jsonResponse(JSON.parse(options.body));
    return jsonResponse([]);
  };
  const repository = await import("./tallyImportStorage.js?partial-failure-test");
  const summary = await repository.importRecords(demoRows);
  assert.equal(summary.imported, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.mode, "database");
  assert.equal(storage.getItem(MODE_KEY), null);
  assert.equal(storage.getItem(RECORDS_KEY), null);
});

test("does not silently switch to local storage if the database fails at confirmation time", async () => {
  // If the second duplicate check fails, no write or fallback should happen.
  storage.removeItem(MODE_KEY);
  storage.removeItem(RECORDS_KEY);
  globalThis.fetch = async (_url, options = {}) => options.method === "POST" ? jsonResponse(JSON.parse(options.body)) : jsonResponse([], 502);
  const repository = await import("./tallyImportStorage.js?confirmation-outage-test");
  await assert.rejects(repository.importRecords(demoRows), /No records were saved/);
  assert.equal(storage.getItem(MODE_KEY), null);
  assert.equal(storage.getItem(RECORDS_KEY), null);
});

test("explicit local-to-database migration skips duplicates and retains local copies", async () => {
  // Migration saves only nonduplicates and keeps the local records for recovery.
  storage.setItem(MODE_KEY, "local-demo");
  storage.setItem(RECORDS_KEY, JSON.stringify([
    { recordType: "party", record: { id: "tally-demo-1", partyName: "Existing Customer", phone: "12345" } },
    { recordType: "item", record: { id: "tally-demo-2", itemName: "Migration Bolt", itemCode: "MB-1", unit: "Nos" } },
  ]));
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (String(url).endsWith("/parties")) return jsonResponse([{ partyName: "Existing Customer", phone: "12345" }]);
    if (options.method === "POST") return jsonResponse(JSON.parse(options.body));
    return jsonResponse([]);
  };
  const repository = await import("./tallyImportStorage.js?local-migration-test");
  const summary = await repository.migrateLocalDemoRecords();
  assert.deepEqual({ imported: summary.imported, duplicate: summary.duplicate, invalid: summary.invalid, failed: summary.failed }, {
    imported: 1, duplicate: 1, invalid: 0, failed: 0,
  });
  assert.equal(repository.getTallyImportStorageMode(), "database");
  assert.equal(storage.getItem(MODE_KEY), null);
  assert.equal((await repository.getImportedLocalDemoRecords()).length, 2, "migration retains the local source records");
  assert.equal(requests.filter((request) => request.method === "POST").length, 1);
  assert.ok(requests.some((request) => request.url.endsWith("/items")));
});
