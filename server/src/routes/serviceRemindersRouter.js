/**
 * Service Reminders API Router
 * 
 * Scalability & System Design:
 * - Direct SQL Filtering for Due Dates: Indexes on (business_id, service_due_date) and
 *   (business_id, status) enable instantaneous querying of upcoming, due today, or overdue tasks.
 * - WhatsApp Tracking: Directly records delivery channel, dispatch timestamp, and send history
 *   in compact JSON format.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * GET /api/service-reminders
 * Retrieves service reminder records with status & date filters.
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

    return res.json({
      success: true,
      data: rows.map(mapReminderRow),
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
 * Creates or updates a service reminder record
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const customerName = (body.customerName || body.name || "").trim();
    if (!customerName) {
      return res.status(400).json({ success: false, message: "Customer name is required." });
    }

    const customerPhone = body.customerPhone || body.phone || null;
    const customerEmail = body.customerEmail || body.email || null;
    const serviceName = body.serviceName || body.service || "Maintenance Service";
    const serviceDate = body.serviceDate || new Date().toISOString().slice(0, 10);
    const serviceDueDate = body.serviceDueDate || body.dueDate;
    if (!serviceDueDate) {
      return res.status(400).json({ success: false, message: "Service due date is required." });
    }

    const status = body.status || "Active";
    const lastNotifiedAt = body.lastNotifiedAt ? new Date(body.lastNotifiedAt) : null;
    const lastNotifiedChannel = body.lastNotifiedChannel || null;
    const lastNotifiedDueDate = body.lastNotifiedDueDate || null;
    const notes = body.notes || null;
    const notificationHistory = JSON.stringify(body.notificationHistory || []);

    await pool.query(
      `INSERT INTO service_reminders (
        id, business_id, customer_name, customer_phone, customer_email,
        service_name, service_date, service_due_date, status,
        last_notified_at, last_notified_channel, last_notified_due_date,
        notes, notification_history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
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
        notification_history = VALUES(notification_history),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, customerName, customerPhone, customerEmail,
        serviceName, serviceDate, serviceDueDate, status,
        lastNotifiedAt, lastNotifiedChannel, lastNotifiedDueDate,
        notes, notificationHistory
      ]
    );

    return res.json({
      success: true,
      message: "Service reminder saved successfully.",
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
    console.error("[Service Reminders POST Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/service-reminders/:id
 * Deletes a reminder record
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const reminderId = req.params.id;

    await pool.query(
      `DELETE FROM service_reminders WHERE business_id = ? AND id = ?`,
      [businessId, reminderId]
    );

    return res.json({ success: true, message: "Reminder deleted successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

function mapReminderRow(row) {
  let history = [];
  try {
    history = typeof row.notification_history === "string" ? JSON.parse(row.notification_history) : row.notification_history || [];
  } catch {}

  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone || "",
    customerEmail: row.customer_email || "",
    serviceName: row.service_name,
    serviceDate: row.service_date,
    serviceDueDate: row.service_due_date,
    status: row.status || "Active",
    lastNotifiedAt: row.last_notified_at,
    lastNotifiedChannel: row.last_notified_channel,
    lastNotifiedDueDate: row.last_notified_due_date,
    notes: row.notes || "",
    notificationHistory: history,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
