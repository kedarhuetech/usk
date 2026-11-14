/**
 * Service Reminders API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Reminders Header: Stored in service_reminders with pure SQL columns (DATE, VARCHAR, TEXT).
 * - Send History: Stored in service_reminder_history child table (one row per dispatch event).
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/service-reminders
 * Retrieves service reminder records with normalized history rows
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const filter = (req.query.filter || "").trim().toLowerCase();
    const search = (req.query.search || "").trim();

    const conditions = ["business_id = ?"];
    const params = [businessId];

    if (search) {
      conditions.push("(customer_name LIKE ? OR customer_phone LIKE ? OR service_name LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (filter === "completed") {
      conditions.push("status = 'Completed'");
    } else if (filter === "active") {
      conditions.push("status != 'Completed'");
    }

    const whereClause = conditions.join(" AND ");

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM service_reminders WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.query(
      `SELECT * FROM service_reminders
       WHERE ${whereClause}
       ORDER BY service_due_date ASC, created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Fetch history from normalized service_reminder_history table
    const reminderIds = rows.map((r) => r.id);
    let historyMap = new Map();
    if (reminderIds.length > 0) {
      const placeholders = reminderIds.map(() => "?").join(",");
      const [histRows] = await pool.query(
        `SELECT id, reminder_id, channel, recipient, message_text, status, sent_at
         FROM service_reminder_history
         WHERE business_id = ? AND reminder_id IN (${placeholders})
         ORDER BY sent_at DESC`,
        [businessId, ...reminderIds]
      );

      for (const h of histRows) {
        if (!historyMap.has(h.reminder_id)) {
          historyMap.set(h.reminder_id, []);
        }
        historyMap.get(h.reminder_id).push({
          id: h.id,
          channel: h.channel,
          recipient: h.recipient,
          message: h.message_text,
          status: h.status,
          sentAt: h.sent_at,
          at: h.sent_at,
          timestamp: h.sent_at,
        });
      }
    }

    const reminders = rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      name: row.customer_name,
      customerPhone: row.customer_phone || "",
      phone: row.customer_phone || "",
      customerEmail: row.customer_email || "",
      serviceName: row.service_name,
      service: row.service_name,
      serviceDate: row.service_date,
      serviceDueDate: row.service_due_date,
      dueDate: row.service_due_date,
      status: row.status || "Active",
      lastNotifiedAt: row.last_notified_at,
      lastNotifiedChannel: row.last_notified_channel,
      lastNotifiedDueDate: row.last_notified_due_date,
      notes: row.notes || "",
      notificationHistory: historyMap.get(row.id) || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return res.json({
      success: true,
      data: reminders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: offset + rows.length < total,
      },
    });
  } catch (err) {
    console.error("[Service Reminders GET Error]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to fetch reminders." });
  }
});

/**
 * POST /api/service-reminders
 * Atomically saves reminder header and normalized history rows in pure SQL columns
 */
router.post("/", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const partyId = body.partyId || body.party_id || null;
    const customerName = (body.customerName || body.name || "").trim();
    if (!customerName) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Customer name is required." });
    }

    const customerPhone = body.customerPhone || body.phone || null;
    const customerEmail = body.customerEmail || body.email || null;
    const serviceName = body.serviceName || body.service || "Maintenance Service";
    const serviceDate = body.serviceDate || new Date().toISOString().slice(0, 10);
    const serviceDueDate = body.serviceDueDate || body.dueDate;
    if (!serviceDueDate) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Service due date is required." });
    }

    const status = body.status || "Active";
    const lastNotifiedAt = body.lastNotifiedAt ? new Date(body.lastNotifiedAt) : null;
    const lastNotifiedChannel = body.lastNotifiedChannel || null;
    const lastNotifiedDueDate = body.lastNotifiedDueDate || null;
    const notes = body.notes || null;

    // 1. Upsert reminder header
    await conn.query(
      `INSERT INTO service_reminders (
        id, business_id, party_id, customer_name, customer_phone, customer_email,
        service_name, service_date, service_due_date, status,
        last_notified_at, last_notified_channel, last_notified_due_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        party_id = VALUES(party_id),
        customer_name = VALUES(customer_name),
        customer_phone = VALUES(customer_phone),
        customer_email = VALUES(customer_email),
        service_name = VALUES(service_name),
        service_date = VALUES(service_date),
        service_due_date = VALUES(service_due_date),
        status = VALUES(status),
        last_notified_at = VALUES(last_notified_at),
        last_notified_channel = VALUES(last_notified_channel),
        last_notified_due_date = VALUES(last_notified_due_date),
        notes = VALUES(notes),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, partyId, customerName, customerPhone, customerEmail,
        serviceName, serviceDate, serviceDueDate, status,
        lastNotifiedAt, lastNotifiedChannel, lastNotifiedDueDate, notes
      ]
    );

    // 2. Insert new history events into normalized service_reminder_history table
    if (Array.isArray(body.notificationHistory) && body.notificationHistory.length > 0) {
      for (const item of body.notificationHistory) {
        const histId = item.id || `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const channel = item.channel || "whatsapp";
        const recipient = item.recipient || customerPhone || "";
        const messageText = item.message || item.text || "";
        const hStatus = item.status || "Sent";
        const sentAt = item.sentAt || item.at || item.timestamp || new Date();

        await conn.query(
          `INSERT IGNORE INTO service_reminder_history (
            id, reminder_id, business_id, channel, recipient, message_text, status, sent_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [histId, id, businessId, channel, recipient, messageText, hStatus, new Date(sentAt)]
        );
      }
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Service reminder saved successfully in pure relational rows and columns.",
      data: {
        id,
        customerName,
        customerPhone,
        serviceName,
        serviceDueDate,
        status,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("[Service Reminders POST Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/service-reminders/:id
 */
router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const id = req.params.id;

    await conn.query(`DELETE FROM service_reminder_history WHERE business_id = ? AND reminder_id = ?`, [businessId, id]);
    await conn.query(`DELETE FROM service_reminders WHERE business_id = ? AND id = ?`, [businessId, id]);

    await conn.commit();
    return res.json({ success: true, message: "Reminder deleted successfully." });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;
