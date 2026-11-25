import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {
  requireAuth,
  optionalAuth,
  signAuthToken,
  JWT_SECRET,
} from "../middleware/authMiddleware.js";
import { pool, businessIdFromRequest } from "../db/mysql.js";
import backupRouter, { BACKUP_TABLES } from "../routes/backupRouter.js";

function createTestAppWithAuth() {
  const app = express();
  app.use(express.json());
  app.use(optionalAuth);

  const requireAuthForSettings = (req, res, next) => {
    if (req.method === "GET" && /(?:^|\/)company-profile\/assets\/[^/]+$/.test(req.path)) {
      return next();
    }
    return requireAuth(req, res, next);
  };

  // Protected business endpoints
  const protectedEcho = (req, res) => {
    const effectiveBiz = businessIdFromRequest(req);
    return res.json({ success: true, businessId: effectiveBiz });
  };

  app.get("/api/parties", requireAuth, protectedEcho);
  app.get("/api/items", requireAuth, protectedEcho);
  app.get("/api/transactions", requireAuth, protectedEcho);
  app.get("/api/cash-bank/cash-in-hand", requireAuth, protectedEcho);
  app.get("/api/expense-categories", requireAuth, protectedEcho);
  app.get("/api/expense-items", requireAuth, protectedEcho);
  app.get("/api/bank-accounts", requireAuth, protectedEcho);
  app.get("/api/units", requireAuth, protectedEcho);
  app.get("/api/dashboard", requireAuth, protectedEcho);
  app.get("/api/settings/company-profile", requireAuthForSettings, protectedEcho);
  app.get("/api/settings/company-profile/assets/:id", requireAuthForSettings, (req, res) => {
    return res.json({ success: true, assetId: req.params.id });
  });
  app.use("/api/backup", requireAuth, backupRouter);

  // Public health endpoint
  app.get("/api/health", (_req, res) => res.json({ success: true }));

  return app;
}

import { EventEmitter } from "node:events";

function dispatchRequest(app, { method = "GET", url = "/", headers = {}, body = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const req = new EventEmitter();
    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.headers = normalizedHeaders;
    req.body = body;
    req.get = (name) => normalizedHeaders[String(name).toLowerCase()];
    req.header = req.get;

    const resHeaders = {};
    let statusCode = 200;
    let settled = false;

    const res = {
      statusCode,
      setHeader(k, v) {
        resHeaders[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return resHeaders[k.toLowerCase()];
      },
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (!settled) {
          settled = true;
          resolve({ status: statusCode, headers: resHeaders, body: payload });
        }
        return this;
      },
      send(payload) {
        if (!settled) {
          settled = true;
          resolve({ status: statusCode, headers: resHeaders, body: payload });
        }
        return this;
      },
      end(payload) {
        if (!settled) {
          settled = true;
          resolve({ status: statusCode, headers: resHeaders, body: payload });
        }
        return this;
      },
    };

    app.handle(req, res, (err) => {
      if (err) return reject(err);
      if (!settled) {
        settled = true;
        resolve({ status: 404, headers: resHeaders, body: null });
      }
    });
  });
}

test("Protected business routes reject missing, invalid, and expired JWTs with 401", async () => {
  const app = createTestAppWithAuth();
  const protectedPaths = [
    "/api/parties",
    "/api/items",
    "/api/transactions",
    "/api/cash-bank/cash-in-hand",
    "/api/expense-categories",
    "/api/expense-items",
    "/api/bank-accounts",
    "/api/units",
    "/api/dashboard",
    "/api/settings/company-profile",
    "/api/backup/export",
  ];

  const expiredToken = jwt.sign({ userId: "u1", businessId: "biz-a" }, JWT_SECRET, { expiresIn: -10 });

  for (const p of protectedPaths) {
    // 1. Missing token (even with forged X-Business-Id)
    const resNoAuth = await dispatchRequest(app, {
      url: p,
      headers: { "X-Business-Id": "kedar-huetech" },
    });
    assert.equal(resNoAuth.status, 401, `${p} must reject unauthenticated requests`);

    // 2. Invalid token
    const resBad = await dispatchRequest(app, {
      url: p,
      headers: { Authorization: "Bearer invalid.jwt.token", "X-Business-Id": "kedar-huetech" },
    });
    assert.equal(resBad.status, 401, `${p} must reject invalid JWT`);

    // 3. Expired token
    const resExp = await dispatchRequest(app, {
      url: p,
      headers: { Authorization: `Bearer ${expiredToken}`, "X-Business-Id": "kedar-huetech" },
    });
    assert.equal(resExp.status, 401, `${p} must reject expired JWT`);
  }

  // Public routes remain accessible
  const healthRes = await dispatchRequest(app, { url: "/api/health" });
  assert.equal(healthRes.status, 200);
  const assetRes = await dispatchRequest(app, { url: "/api/settings/company-profile/assets/logo-1?businessId=biz-a" });
  assert.equal(assetRes.status, 200);
});

test("Authenticated JWT businessId cannot be overridden by forged X-Business-Id or query parameters", async () => {
  const app = createTestAppWithAuth();
  const tokenBizA = signAuthToken({ userId: "u-a", email: "a@test.com", businessId: "biz-a" });

  const res = await dispatchRequest(app, {
    url: "/api/parties?businessId=biz-b",
    headers: {
      Authorization: `Bearer ${tokenBizA}`,
      "X-Business-Id": "biz-b",
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.businessId, "biz-a", "Effective businessId must come strictly from verified JWT");
});

test("BACKUP_TABLES excludes global businesses table", () => {
  assert.equal(BACKUP_TABLES.includes("businesses"), false, "Global businesses table must NOT be in BACKUP_TABLES");
  assert.equal(BACKUP_TABLES.includes("users"), false, "Global users table must NOT be in BACKUP_TABLES");
});

test("GET /api/backup/export scopes every query to authenticated JWT businessId and never dumps global tables", async () => {
  const app = createTestAppWithAuth();
  const tokenBizA = signAuthToken({ userId: "u-a", businessId: "biz-a" });

  const origPoolQuery = pool.query.bind(pool);
  const executedQueries = [];

  pool.query = async (sql, params = []) => {
    const s = String(sql).trim();
    executedQueries.push({ sql: s, params });
    if (s.includes("information_schema.COLUMNS")) {
      return [[{ c: 1 }]];
    }
    if (s.includes("WHERE business_id = ?")) {
      const biz = params[0];
      if (s.includes("FROM `parties`")) {
        return [[{ id: "p-a", business_id: biz, party_name: "Biz A Party" }]];
      }
      return [[]];
    }
    throw new Error(`Unexpected unscoped query in backup export: ${s}`);
  };

  try {
    const res = await dispatchRequest(app, {
      url: "/api/backup/export",
      headers: {
        Authorization: `Bearer ${tokenBizA}`,
        "X-Business-Id": "biz-b", // Forged header must be ignored
      },
    });
    assert.equal(res.status, 200);
    const dump = res.body;
    assert.equal(dump.businessId, "biz-a");
    assert.equal(dump.tables.businesses, undefined, "Must not export businesses table");
    assert.deepEqual(dump.tables.parties, [{ id: "p-a", business_id: "biz-a", party_name: "Biz A Party" }]);

    const bizBQueries = executedQueries.filter((q) => q.params.includes("biz-b"));
    assert.equal(bizBQueries.length, 0, "Must never query biz-b");
  } finally {
    pool.query = origPoolQuery;
  }
});

test("POST /api/backup/restore-payload targets authenticated JWT businessId regardless of forged header or backup manifest", async () => {
  const app = createTestAppWithAuth();
  const tokenBizA = signAuthToken({ userId: "u-a", businessId: "biz-a" });

  const origGetConnection = pool.getConnection.bind(pool);
  const executed = [];
  pool.getConnection = async () => ({
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      executed.push({ sql: String(sql).trim(), params });
      return [[]];
    },
  });

  try {
    const payload = {
      format: "usv-backup",
      formatVersion: 1,
      manifest: { businessId: "source-demo-biz" },
      data: {
        "ledgerly:expenseCategories.v1": [{ id: "cat-1", categoryName: "Travel", expenseType: "indirect" }],
      },
    };
    const res = await dispatchRequest(app, {
      method: "POST",
      url: "/api/backup/restore-payload",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenBizA}`,
        "X-Business-Id": "biz-b", // Forged header
      },
      body: payload,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.businessId, "biz-a");

    const delCat = executed.find((q) => q.sql.includes("DELETE FROM expense_categories"));
    assert.deepEqual(delCat.params, ["biz-a"]);
    const insCat = executed.find((q) => q.sql.includes("INSERT INTO expense_categories"));
    assert.equal(insCat.params[1], "biz-a");
  } finally {
    pool.getConnection = origGetConnection;
  }
});
