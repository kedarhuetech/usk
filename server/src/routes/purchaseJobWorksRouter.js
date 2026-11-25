/**
 * Purchase Job Works API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Header: purchase_job_works
 * - Lines: purchase_job_work_items (sent & received items with foreign key indexing)
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";
import { getIstDateString } from "../utils/dateUtils.js";

const router = Router();

/**
 * GET /api/purchase-job-works
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [headerRows] = await pool.query(
      `SELECT * FROM purchase_job_works WHERE business_id = ? ORDER BY order_date DESC, created_at DESC`,
      [businessId]
    );

    if (!headerRows.length) {
      return res.json({ success: true, data: [] });
    }

    const jobWorkIds = headerRows.map((r) => r.id);
    const placeholders = jobWorkIds.map(() => "?").join(",");
    const [itemRows] = await pool.query(
      `SELECT * FROM purchase_job_work_items WHERE business_id = ? AND job_work_id IN (${placeholders})`,
      [businessId, ...jobWorkIds]
    );

    const itemsMap = new Map();
    for (const item of itemRows) {
      if (!itemsMap.has(item.job_work_id)) itemsMap.set(item.job_work_id, { sentRows: [], receivedRows: [] });
      const group = itemsMap.get(item.job_work_id);
      const mappedItem = {
        id: item.id,
        itemId: item.item_id,
        item: item.item_name,
        qty: parseFloat(item.quantity) || 0,
        unit: item.unit,
      };
      if (item.item_type === "sent") group.sentRows.push(mappedItem);
      else group.receivedRows.push(mappedItem);
    }

    const fullRecords = headerRows.map((r) => {
      const items = itemsMap.get(r.id) || { sentRows: [], receivedRows: [] };
      return {
        id: r.id,
        number: r.order_number,
        party: r.party_name,
        partyId: r.party_id,
        date: r.order_date,
        status: r.status,
        charges: parseFloat(r.charges) || 0,
        notes: r.notes || "",
        sentRows: items.sentRows,
        receivedRows: items.receivedRows,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    return res.json({ success: true, data: fullRecords });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/purchase-job-works
 */
router.post("/", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `jobwork_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const orderNumber = String(body.number || body.orderNumber || "").trim();
    const partyName = String(body.party || body.partyName || "").trim();
    const partyId = body.partyId || null;
    const orderDate = body.date || body.orderDate || getIstDateString();
    const status = body.status || "Pending";
    const charges = parseFloat(body.charges) || 0;
    const notes = body.notes || null;

    if (!orderNumber || !partyName) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Order number and vendor are required." });
    }

    // Insert or update header
    await conn.query(
      `INSERT INTO purchase_job_works (
        id, business_id, order_number, party_name, party_id, order_date, status, charges, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        party_name = VALUES(party_name),
        party_id = VALUES(party_id),
        order_date = VALUES(order_date),
        status = VALUES(status),
        charges = VALUES(charges),
        notes = VALUES(notes),
        updated_at = CURRENT_TIMESTAMP`,
      [id, businessId, orderNumber, partyName, partyId, orderDate, status, charges, notes]
    );

    // Replace items
    await conn.query(`DELETE FROM purchase_job_work_items WHERE business_id = ? AND job_work_id = ?`, [businessId, id]);

    const sentRows = Array.isArray(body.sentRows) ? body.sentRows : [];
    const receivedRows = Array.isArray(body.receivedRows) ? body.receivedRows : [];

    for (const row of sentRows) {
      if (!row.itemId) continue;
      const itemId = row.itemId;
      const itemName = row.item || row.name || "Material";
      const quantity = parseFloat(row.qty ?? row.quantity ?? 0) || 0;
      const unit = row.unit || "PCS";
      const lineId = row.id || `jwline_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      await conn.query(
        `INSERT INTO purchase_job_work_items (id, business_id, job_work_id, item_type, item_id, item_name, quantity, unit)
         VALUES (?, ?, ?, 'sent', ?, ?, ?, ?)`,
        [lineId, businessId, id, itemId, itemName, quantity, unit]
      );
    }

    for (const row of receivedRows) {
      if (!row.itemId) continue;
      const itemId = row.itemId;
      const itemName = row.item || row.name || "Finished Good";
      const quantity = parseFloat(row.qty ?? row.quantity ?? 0) || 0;
      const unit = row.unit || "PCS";
      const lineId = row.id || `jwline_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      await conn.query(
        `INSERT INTO purchase_job_work_items (id, business_id, job_work_id, item_type, item_id, item_name, quantity, unit)
         VALUES (?, ?, ?, 'received', ?, ?, ?, ?)`,
        [lineId, businessId, id, itemId, itemName, quantity, unit]
      );
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Job work record saved successfully.",
      data: { id, orderNumber, partyName, status },
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/purchase-job-works/:id
 */
router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    await conn.query(`DELETE FROM purchase_job_work_items WHERE business_id = ? AND job_work_id = ?`, [businessId, req.params.id]);
    await conn.query(`DELETE FROM purchase_job_works WHERE business_id = ? AND id = ?`, [businessId, req.params.id]);
    await conn.commit();
    return res.json({ success: true, message: "Job work record deleted." });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;
