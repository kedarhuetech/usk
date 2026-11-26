// Tests Tally import storage adapter, duplicate detection, update mode, and partial failures.
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

const dbParties = [];
const dbItems = [];
const dbBatches = [];

globalThis.fetch = async (url, options = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;

  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

  if (path.startsWith("/api/parties")) {
    if (method === "GET") return json({ data: dbParties });
    if (method === "POST") {
      const idx = body?.id ? dbParties.findIndex((p) => p.id === body.id) : -1;
      const saved = { ...body, id: body?.id || `party-${dbParties.length + 1}` };
      if (idx >= 0) dbParties[idx] = saved;
      else dbParties.push(saved);
      return json({ data: saved }, 201);
    }
  }

  if (path.startsWith("/api/items")) {
    if (method === "GET") return json({ data: dbItems });
    if (method === "POST") {
      const idx = body?.id ? dbItems.findIndex((i) => i.id === body.id) : -1;
      const saved = { ...body, id: body?.id || `item-${dbItems.length + 1}` };
      if (idx >= 0) dbItems[idx] = saved;
      else dbItems.push(saved);
      return json({ data: saved }, 201);
    }
  }

  if (path.startsWith("/api/utilities/tally/batches/check-hash")) {
    return json({ alreadyImported: false, match: null });
  }

  if (path.startsWith("/api/utilities/tally/batches")) {
    if (method === "GET") return json({ data: dbBatches });
    if (method === "POST") {
      const saved = { ...body, id: dbBatches.length + 1 };
      dbBatches.unshift(saved);
      return json({ data: saved }, 201);
    }
  }

  return json({ data: [] });
};

const demoRows = [
  { recordType: "party", partyType: "customer", sourceName: "Demo Customer", errors: [], warnings: [], status: "ready", party: { partyName: "Demo Customer", partyType: "customer", phone: "9876543210" } },
  { recordType: "item", sourceName: "Demo Bolt", errors: [], warnings: [], status: "ready", item: { type: "product", itemName: "Demo Bolt", unit: "Nos", itemCode: "B-100" } },
];

test("reports active storage mode cleanly", async () => {
  const repository = await import("./tallyImportStorage.js");
  const mode = repository.getTallyImportStorageMode();
  assert.ok(["database", "local"].includes(mode));
});

test("previews import records and checks duplicate status", async () => {
  const repository = await import("./tallyImportStorage.js");
  const preview = await repository.previewImport(demoRows);
  assert.ok(["database", "local"].includes(preview.mode));
  assert.equal(preview.records.length, 2);
  assert.deepEqual(preview.records.map((r) => r.status), ["ready", "ready"]);
});

test("imports tally records, detects duplicates on repeat, and supports explicit update", async () => {
  const repository = await import("./tallyImportStorage.js");
  const result = await repository.importRecords(demoRows);
  assert.equal(result.imported, 2);
  assert.equal(result.failed, 0);

  // Subsequent check detects them as duplicates with existingId
  const duplicateCheck = await repository.checkDuplicates(demoRows);
  assert.deepEqual(duplicateCheck.records.map((r) => r.status), ["duplicate", "duplicate"]);
  assert.ok(duplicateCheck.records[0].existingId);
  assert.ok(duplicateCheck.records[1].existingId);

  // Default skip mode skips duplicates
  const skipped = await repository.importRecords(demoRows, { duplicateAction: "skip" });
  assert.equal(skipped.imported, 0);
  assert.equal(skipped.duplicate, 2);

  // Explicit update mode updates existing records
  const updated = await repository.importRecords(demoRows, { duplicateAction: "update" });
  assert.equal(updated.updated, 2);
  assert.equal(updated.failed, 0);
});

test("getImportedRecords returns current items and parties", async () => {
  const repository = await import("./tallyImportStorage.js");
  const records = await repository.getImportedRecords();
  assert.ok(Array.isArray(records.items));
  assert.ok(Array.isArray(records.parties));
});
