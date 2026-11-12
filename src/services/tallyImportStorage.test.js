// Tests local storage adapter, duplicate detection, and import execution for Tally masters.
import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const storage = new MemoryStorage();
globalThis.window = { localStorage: storage, dispatchEvent: () => true };

const demoRows = [
  { recordType: "party", sourceName: "Demo Customer", errors: [], warnings: [], status: "ready", party: { partyName: "Demo Customer", phone: "12345" } },
  { recordType: "item", sourceName: "Demo Bolt", errors: [], warnings: [], status: "ready", item: { type: "product", itemName: "Demo Bolt", unit: "Nos", itemCode: "B-100" } },
];

test("returns local-demo storage mode and rejects remote activation cleanly", async () => {
  const repository = await import("./tallyImportStorage.js");
  assert.equal(repository.getTallyImportStorageMode(), "local-demo");
  await assert.rejects(
    repository.activateDatabaseTallyImportStorage(),
    /Tally imports use local storage/
  );
});

test("previews import records and checks duplicate status", async () => {
  const repository = await import("./tallyImportStorage.js");
  const preview = await repository.previewImport(demoRows);
  assert.equal(preview.mode, "local-demo");
  assert.equal(preview.records.length, 2);
  assert.deepEqual(preview.records.map((r) => r.status), ["ready", "ready"]);
});

test("imports tally records into local inventory items and parties", async () => {
  const repository = await import("./tallyImportStorage.js");
  const result = await repository.importRecords(demoRows);
  assert.equal(result.imported, 2);
  assert.equal(result.failed, 0);

  // Subsequent check detects them as duplicates
  const duplicateCheck = await repository.checkDuplicates(demoRows);
  assert.deepEqual(duplicateCheck.records.map((r) => r.status), ["duplicate", "duplicate"]);
});

test("getImportedRecords returns current items and parties", async () => {
  const repository = await import("./tallyImportStorage.js");
  const records = await repository.getImportedRecords();
  assert.ok(Array.isArray(records.items));
  assert.ok(Array.isArray(records.parties));
});

test("migrateLocalDemoRecords skips duplicate entries gracefully", async () => {
  const repository = await import("./tallyImportStorage.js");
  const summary = await repository.migrateLocalDemoRecords();
  assert.equal(summary.failed, 0);
  assert.equal(typeof summary.imported, "number");
});
