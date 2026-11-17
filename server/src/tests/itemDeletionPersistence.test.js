import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "../db/mysql.js";
import itemsRouter from "../routes/itemsRouter.js";

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/items", itemsRouter);

  server = app.listen(0);
  await new Promise((resolve) => server.on("listening", resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api/items`;
});

after(async () => {
  if (server) server.close();
  await pool.end();
});

test("Item Deletion: Successfully deletes an unreferenced item and its batches from MySQL", async () => {
  const itemId = `test_del_unref_${Date.now()}`;
  const batchId = `test_batch_${Date.now()}`;
  const businessId = "demo-business";

  // 1. Insert unreferenced item and batch directly into MySQL
  await pool.query(
    `INSERT INTO inventory_items (id, business_id, name, item_code, current_stock, is_active)
     VALUES (?, ?, 'Unreferenced Test Item', 'UNREF-001', 0, 1)`,
    [itemId, businessId]
  );
  await pool.query(
    `INSERT INTO item_batches (id, item_id, business_id, batch_no, current_qty)
     VALUES (?, ?, ?, 'BATCH-001', 0)`,
    [batchId, itemId, businessId]
  );

  // Verify inserted
  const [beforeRows] = await pool.query("SELECT id FROM inventory_items WHERE id = ?", [itemId]);
  assert.equal(beforeRows.length, 1);

  // 2. Call DELETE /api/items/:id with business context
  const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: { "x-business-id": businessId },
  });
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.action, "deleted");

  // 3. Verify item and batch are physically deleted from MySQL
  const [afterItem] = await pool.query("SELECT id FROM inventory_items WHERE id = ?", [itemId]);
  assert.equal(afterItem.length, 0, "Item must be removed from inventory_items");

  const [afterBatch] = await pool.query("SELECT id FROM item_batches WHERE id = ?", [batchId]);
  assert.equal(afterBatch.length, 0, "Item batches must be removed from item_batches");
});

test("Item Deletion: Prevents physical deletion of a referenced item and returns 409 Conflict", async () => {
  const itemId = `test_del_ref_${Date.now()}`;
  const businessId = "demo-business";
  const dummyTxId = `test_tx_${Date.now()}`;
  const dummyTxItemId = `test_ti_${Date.now()}`;

  // 1. Insert item into MySQL
  await pool.query(
    `INSERT INTO inventory_items (id, business_id, name, item_code, current_stock, is_active)
     VALUES (?, ?, 'Referenced Test Item', 'REF-001', 5, 1)`,
    [itemId, businessId]
  );

  // 2. Insert dummy reference in transaction_items
  await pool.query(
    `INSERT INTO transaction_items (id, transaction_id, business_id, item_id, item_name, quantity, unit_price, total_amount)
     VALUES (?, ?, ?, ?, 'Referenced Test Item', 5, 100, 500)`,
    [dummyTxItemId, dummyTxId, businessId, itemId]
  );

  try {
    // 3. Attempt physical deletion without deactivate flag
    const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      headers: { "x-business-id": businessId },
    });
    const data = await res.json();

    assert.equal(res.status, 409, "Must return 409 Conflict for referenced items");
    assert.equal(data.success, false);
    assert.equal(data.code, "ITEM_REFERENCED");
    assert.equal(data.canDeactivate, true);
    assert.ok(data.message.includes("historical business record"));

    // 4. Verify item still physically exists in MySQL
    const [stillExists] = await pool.query("SELECT id, is_active FROM inventory_items WHERE id = ?", [itemId]);
    assert.equal(stillExists.length, 1, "Referenced item must NOT be physically deleted");
    assert.equal(stillExists[0].is_active, 1);

    // 5. Test safe deactivation via query param
    const deactRes = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}?deactivate=true`, {
      method: "DELETE",
      headers: { "x-business-id": businessId },
    });
    const deactData = await deactRes.json();

    assert.equal(deactRes.status, 200);
    assert.equal(deactData.success, true);
    assert.equal(deactData.action, "deactivated");

    // 6. Verify item is marked inactive (is_active = 0) in MySQL
    const [updatedRow] = await pool.query("SELECT id, is_active FROM inventory_items WHERE id = ?", [itemId]);
    assert.equal(updatedRow.length, 1);
    assert.equal(updatedRow[0].is_active, 0, "Item must be marked inactive");
  } finally {
    // Cleanup test artifacts
    await pool.query("DELETE FROM transaction_items WHERE id = ?", [dummyTxItemId]);
    await pool.query("DELETE FROM inventory_items WHERE id = ?", [itemId]);
  }
});

test("Item Deletion: Prevents deleting an item belonging to another business (Cross-Business Isolation)", async () => {
  const itemId = `test_other_biz_${Date.now()}`;
  const ownerBiz = "tenant-a";
  const intruderBiz = "tenant-b";

  // 1. Insert item under tenant-a
  await pool.query(
    `INSERT INTO inventory_items (id, business_id, name, item_code, is_active)
     VALUES (?, ?, 'Tenant A Confidential Item', 'CONF-001', 1)`,
    [itemId, ownerBiz]
  );

  try {
    // 2. Tenant B attempts to delete Tenant A's item
    const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      headers: { "x-business-id": intruderBiz },
    });
    const data = await res.json();

    assert.equal(res.status, 404, "Must return 404 when item does not belong to requesting business");
    assert.equal(data.success, false);

    // 3. Verify item still exists under tenant-a in MySQL
    const [item] = await pool.query(
      "SELECT id, business_id FROM inventory_items WHERE id = ?",
      [itemId]
    );
    assert.equal(item.length, 1);
    assert.equal(item[0].business_id, ownerBiz, "Item must remain untouched under its owner business");
  } finally {
    await pool.query("DELETE FROM inventory_items WHERE id = ?", [itemId]);
  }
});

test("Item Deactivation: PATCH /api/items/:id/deactivate and reactivate work as expected", async () => {
  const itemId = `test_patch_act_${Date.now()}`;
  const businessId = "demo-business";

  await pool.query(
    `INSERT INTO inventory_items (id, business_id, name, is_active)
     VALUES (?, ?, 'Toggle Active Test Item', 1)`,
    [itemId, businessId]
  );

  try {
    // Deactivate
    const deactRes = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/deactivate`, {
      method: "PATCH",
      headers: { "x-business-id": businessId },
    });
    assert.equal(deactRes.status, 200);

    const [deactRow] = await pool.query("SELECT is_active FROM inventory_items WHERE id = ?", [itemId]);
    assert.equal(deactRow[0].is_active, 0);

    // Reactivate
    const reactRes = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/reactivate`, {
      method: "PATCH",
      headers: { "x-business-id": businessId },
    });
    assert.equal(reactRes.status, 200);

    const [reactRow] = await pool.query("SELECT is_active FROM inventory_items WHERE id = ?", [itemId]);
    assert.equal(reactRow[0].is_active, 1);
  } finally {
    await pool.query("DELETE FROM inventory_items WHERE id = ?", [itemId]);
  }
});
