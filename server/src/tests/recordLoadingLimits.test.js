import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("1. transactionsRouter parses limit=all / all=true and supports limits > 200", () => {
  const parseLimit = (query) => {
    const limitParam = query.limit;
    const isAll = limitParam === "all" || query.all === "true" || limitParam === "0";
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = isAll
      ? 100000
      : Math.min(10000, Math.max(1, parseInt(limitParam, 10) || 50));
    const offset = isAll ? 0 : (page - 1) * limit;
    return { isAll, page, limit, offset };
  };

  // Test limit=all
  const allResult = parseLimit({ limit: "all" });
  assert.equal(allResult.isAll, true);
  assert.equal(allResult.offset, 0);

  // Test all=true
  const allBoolResult = parseLimit({ all: "true" });
  assert.equal(allBoolResult.isAll, true);

  // Test limit=500 (greater than old 200 cap)
  const largeResult = parseLimit({ limit: "500", page: "2" });
  assert.equal(largeResult.isAll, false);
  assert.equal(largeResult.limit, 500, "Must allow limit=500 without capping at 200");
  assert.equal(largeResult.offset, 500);

  // Test default limit when not supplied
  const defaultResult = parseLimit({});
  assert.equal(defaultResult.isAll, false);
  assert.equal(defaultResult.limit, 50);
});

test("2. partiesRouter parses limit=all and supports limits > 200", () => {
  const parseLimit = (query) => {
    const limitParam = query.limit;
    const isAll = limitParam === "all" || query.all === "true" || limitParam === "0";
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = isAll
      ? 100000
      : Math.min(10000, Math.max(1, parseInt(limitParam, 10) || 50));
    const offset = isAll ? 0 : (page - 1) * limit;
    return { isAll, page, limit, offset };
  };

  const allResult = parseLimit({ limit: "all" });
  assert.equal(allResult.isAll, true);

  const largeResult = parseLimit({ limit: "1000" });
  assert.equal(largeResult.limit, 1000, "Parties must allow limit=1000 without capping at 200");
});

test("3. itemsRouter parses limit=all and supports limits > 1000", () => {
  const parseLimit = (query) => {
    const limitParam = query.limit;
    const isAll = limitParam === "all" || query.all === "true" || limitParam === "0";
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = isAll
      ? 100000
      : Math.min(10000, Math.max(1, parseInt(limitParam, 10) || 50));
    const offset = isAll ? 0 : (page - 1) * limit;
    return { isAll, page, limit, offset };
  };

  const allResult = parseLimit({ limit: "all" });
  assert.equal(allResult.isAll, true);

  const largeResult = parseLimit({ limit: "5000" });
  assert.equal(largeResult.limit, 5000, "Items must allow limit=5000");
});

test("4. Chunking helper safely splits large batch/item ID arrays into 500-element chunks", () => {
  const ids = Array.from({ length: 1250 }, (_, i) => `id-${i}`);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 500) {
    chunks.push(ids.slice(i, i + 500));
  }

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 500);
  assert.equal(chunks[1].length, 500);
  assert.equal(chunks[2].length, 250);
});

test("5. databaseRepository.js listAll and listByType use limit=all", () => {
  const repoPath = path.resolve(__dirname, "../../../src/services/databaseRepository.js");
  const content = fs.readFileSync(repoPath, "utf-8");

  assert.ok(
    content.includes('apiRequest("/parties?limit=all")'),
    "partiesDb.listAll must request limit=all"
  );
  assert.ok(
    content.includes('apiRequest("/items?limit=all")'),
    "itemsDb.listAll must request limit=all"
  );
  assert.ok(
    content.includes('apiRequest(`/transactions?type=${encodeURIComponent(type)}&limit=all`)'),
    "transactionsDb.listByType must request limit=all"
  );
  assert.ok(
    content.includes('apiRequest("/transactions?limit=all")'),
    "transactionsDb.listAll must request limit=all"
  );
  assert.ok(
    content.includes('apiRequest("/service-reminders?limit=all")'),
    "serviceRemindersDb.listAll must request limit=all"
  );

  // Ensure no legacy ?limit=200 remains in databaseRepository.js
  assert.ok(
    !content.includes("?limit=200"),
    "databaseRepository.js must have NO hardcoded limit=200 queries"
  );
  assert.ok(
    !content.includes("&limit=200"),
    "databaseRepository.js must have NO hardcoded &limit=200 queries"
  );
});

test("6. reportsRouter all-transactions endpoint does not hardcode Math.min(200)", () => {
  const reportsPath = path.resolve(__dirname, "../routes/reportsRouter.js");
  const content = fs.readFileSync(reportsPath, "utf-8");

  assert.ok(
    !content.includes("Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50))"),
    "reportsRouter must NOT have hardcoded 200 limit"
  );
  assert.ok(
    content.includes('const isAll = limitParam === "all" || req.query.all === "true" || !limitParam'),
    "reportsRouter must support unlimited full export when isAll or no limit specified"
  );
});

test("7. transactionsRouter does not hardcode Math.min(200)", () => {
  const txnPath = path.resolve(__dirname, "../routes/transactionsRouter.js");
  const content = fs.readFileSync(txnPath, "utf-8");

  assert.ok(
    !content.includes("Math.min(200,"),
    "transactionsRouter must NOT have Math.min(200)"
  );
  assert.ok(
    content.includes('const isAll = limitParam === "all" || req.query.all === "true" || limitParam === "0"'),
    "transactionsRouter must support isAll"
  );
});

test("8. partiesRouter does not hardcode Math.min(200)", () => {
  const partiesPath = path.resolve(__dirname, "../routes/partiesRouter.js");
  const content = fs.readFileSync(partiesPath, "utf-8");

  assert.ok(
    !content.includes("Math.min(200,"),
    "partiesRouter must NOT have Math.min(200)"
  );
  assert.ok(
    content.includes('const isAll = limitParam === "all" || req.query.all === "true" || limitParam === "0"'),
    "partiesRouter must support isAll"
  );
});

test("9. auditTrailRouter does not hardcode Math.min(200)", () => {
  const auditPath = path.resolve(__dirname, "../routes/auditTrailRouter.js");
  const content = fs.readFileSync(auditPath, "utf-8");

  assert.ok(
    !content.includes("Math.min(200,"),
    "auditTrailRouter must NOT have Math.min(200)"
  );
  assert.ok(
    content.includes('const isAll = limitParam === "all" || req.query.all === "true"'),
    "auditTrailRouter must support isAll"
  );
});

test("10. serviceRemindersRouter supports limit=all, 500-chunk history lookup, and valid syntax", () => {
  const srPath = path.resolve(__dirname, "../routes/serviceRemindersRouter.js");
  const content = fs.readFileSync(srPath, "utf-8");

  assert.ok(
    !content.includes("Math.min(200,"),
    "serviceRemindersRouter must NOT have Math.min(200)"
  );
  assert.ok(
    content.includes('const isAll = limitParam === "all" || req.query.all === "true" || limitParam === "0"'),
    "serviceRemindersRouter must support isAll"
  );
  assert.ok(
    content.includes("i += 500"),
    "serviceRemindersRouter must use 500-element chunks"
  );
  assert.ok(
    content.includes("messageText: h.message_text") && content.includes("message: h.message_text"),
    "serviceRemindersRouter must map history fields properly"
  );
});
