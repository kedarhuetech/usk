/**
 * Online Store API Router (Settings, Orders, Order Items)
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Orders Header: online_store_orders with pure SQL columns.
 * - Order Items: online_store_order_items child table with pure rows and columns.
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

// ==================== STORE SETTINGS ====================

/**
 * GET /api/online-store/settings
 */
router.get("/settings", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [rows] = await pool.query(
      `SELECT * FROM online_store_settings WHERE business_id = ? LIMIT 1`,
      [businessId]
    );

    if (!rows.length) {
      return res.json({
        success: true,
        data: {
          storeName: "My Online Store",
          subdomain: "my-store",
          currency: "INR",
          isStoreEnabled: true,
          deliveryCharges: 0,
          minOrderAmount: 0,
        },
      });
    }

    const r = rows[0];
    return res.json({
      success: true,
      data: {
        storeName: r.store_name,
        subdomain: r.subdomain || "",
        contactPhone: r.contact_phone || "",
        contactEmail: r.contact_email || "",
        address: r.address || "",
        currency: r.currency || "INR",
        isStoreEnabled: Boolean(r.is_store_enabled),
        deliveryCharges: parseFloat(r.delivery_charges) || 0,
        minOrderAmount: parseFloat(r.min_order_amount) || 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/online-store/settings
 */
router.post("/settings", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const storeName = (body.storeName || "My Store").trim();
    const subdomain = body.subdomain || null;
    const contactPhone = body.contactPhone || null;
    const contactEmail = body.contactEmail || null;
    const address = body.address || null;
    const currency = body.currency || "INR";
    const isStoreEnabled = body.isStoreEnabled !== false ? 1 : 0;
    const deliveryCharges = parseFloat(body.deliveryCharges ?? 0) || 0;
    const minOrderAmount = parseFloat(body.minOrderAmount ?? 0) || 0;

    await pool.query(
      `INSERT INTO online_store_settings (
        business_id, store_name, subdomain, contact_phone, contact_email,
        address, currency, is_store_enabled, delivery_charges, min_order_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        store_name = VALUES(store_name),
        subdomain = VALUES(subdomain),
        contact_phone = VALUES(contact_phone),
        contact_email = VALUES(contact_email),
        address = VALUES(address),
        currency = VALUES(currency),
        is_store_enabled = VALUES(is_store_enabled),
        delivery_charges = VALUES(delivery_charges),
        min_order_amount = VALUES(min_order_amount),
        updated_at = CURRENT_TIMESTAMP`,
      [businessId, storeName, subdomain, contactPhone, contactEmail, address, currency, isStoreEnabled, deliveryCharges, minOrderAmount]
    );

    return res.json({ success: true, message: "Store settings saved." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== STORE ORDERS ====================

/**
 * GET /api/online-store/orders
 */
router.get("/orders", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [orders] = await pool.query(
      `SELECT * FROM online_store_orders WHERE business_id = ? ORDER BY order_date DESC`,
      [businessId]
    );

    const orderIds = orders.map((o) => o.id);
    let itemsMap = new Map();
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => "?").join(",");
      const [itemRows] = await pool.query(
        `SELECT * FROM online_store_order_items WHERE business_id = ? AND order_id IN (${placeholders})`,
        [businessId, ...orderIds]
      );
      for (const it of itemRows) {
        if (!itemsMap.has(it.order_id)) itemsMap.set(it.order_id, []);
        itemsMap.get(it.order_id).push({
          id: it.id,
          itemId: it.item_id,
          name: it.item_name,
          quantity: parseFloat(it.quantity) || 0,
          price: parseFloat(it.price) || 0,
          totalAmount: parseFloat(it.total_amount) || 0,
        });
      }
    }

    return res.json({
      success: true,
      data: orders.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        deliveryAddress: o.delivery_address || "",
        totalAmount: parseFloat(o.total_amount) || 0,
        itemCount: o.item_count,
        orderStatus: o.order_status,
        paymentStatus: o.payment_status,
        paymentMethod: o.payment_method,
        orderDate: o.order_date,
        items: itemsMap.get(o.id) || [],
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/online-store/orders
 */
router.post("/orders", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = body.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const orderNumber = body.orderNumber || `ORD-${Date.now().toString().slice(-6)}`;
    const customerName = (body.customerName || "Customer").trim();
    const customerPhone = (body.customerPhone || "").trim();
    const deliveryAddress = body.deliveryAddress || null;
    const totalAmount = parseFloat(body.totalAmount ?? 0) || 0;
    const orderStatus = body.orderStatus || "pending";
    const paymentStatus = body.paymentStatus || "unpaid";
    const paymentMethod = body.paymentMethod || "cod";
    const items = Array.isArray(body.items) ? body.items : [];

    await conn.query(
      `INSERT INTO online_store_orders (
        id, business_id, order_number, customer_name, customer_phone,
        delivery_address, total_amount, item_count, order_status,
        payment_status, payment_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, businessId, orderNumber, customerName, customerPhone,
        deliveryAddress, totalAmount, items.length || 1, orderStatus,
        paymentStatus, paymentMethod
      ]
    );

    for (const item of items) {
      const lineId = item.id || `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const itemId = item.itemId || null;
      const itemName = item.name || item.itemName || "Item";
      const quantity = parseFloat(item.quantity ?? item.qty ?? 1) || 1;
      const price = parseFloat(item.price ?? 0) || 0;
      const lineTotal = parseFloat(item.totalAmount ?? (quantity * price)) || 0;

      await conn.query(
        `INSERT INTO online_store_order_items (
          id, order_id, business_id, item_id, item_name, quantity, price, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [lineId, id, businessId, itemId, itemName, quantity, price, lineTotal]
      );
    }

    await conn.commit();
    return res.json({ success: true, message: "Order placed successfully.", data: { id, orderNumber } });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;

