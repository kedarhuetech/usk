import { Router } from "express";
import crypto from "node:crypto";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

/**
 * Seed items from transaction_items if expense_items is empty
 */
async function syncFromTransactionItems(businessId) {
  try {
    const [txItems] = await pool.query(
      `SELECT DISTINCT ti.item_name, ti.unit_price, ti.tax_rate, ti.hsn_code
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id AND ti.business_id = t.business_id
       WHERE t.business_id = ? AND t.transaction_type = 'expense'
         AND ti.item_name IS NOT NULL AND TRIM(ti.item_name) != ''`,
      [businessId]
    );

    for (const row of txItems) {
      const name = row.item_name.trim();
      const id = `exp_item_${crypto.randomUUID().slice(0, 8)}`;
      const price = Number(row.unit_price) || 0;
      const tax = Number(row.tax_rate) || 0;
      const hsn = row.hsn_code || null;

      await pool.query(
        `INSERT INTO expense_items (id, business_id, item_name, price, tax_rate, hsn_code, category)
         SELECT ?, ?, ?, ?, ?, ?, 'Expenses'
         WHERE NOT EXISTS (
           SELECT 1 FROM expense_items WHERE business_id = ? AND LOWER(item_name) = LOWER(?)
         )`,
        [id, businessId, name, price, tax, hsn, businessId, name]
      );
    }
  } catch (err) {
    console.warn("[ExpenseItems] Sync from transaction_items notice:", err.message);
  }
}

/**
 * GET /api/expense-items
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);

    const [rows] = await pool.query(
      `SELECT * FROM expense_items WHERE business_id = ? ORDER BY item_name ASC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        item: r.item_name,
        name: r.item_name,
        price: Number(r.price) || 0,
        tax: r.tax_rate !== null && r.tax_rate !== undefined ? String(r.tax_rate) : "",
        taxRate: Number(r.tax_rate) || 0,
        hsn: r.hsn_code || "",
        description: r.description || "",
        category: r.category || "Expenses",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/expense-items
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};
    const itemName = String(body.item || body.name || body.itemName || "").trim();
    if (!itemName) {
      return res.status(400).json({ success: false, message: "Item name is required." });
    }

    const id = body.id || `exp_item_${crypto.randomUUID().slice(0, 8)}`;
    const price = Number(body.price ?? body.unitPrice ?? 0) || 0;
    const taxRate = Number(body.tax ?? body.taxRate ?? 0) || 0;
    const hsnCode = String(body.hsn || body.hsnCode || "").trim() || null;
    const description = String(body.description || "").trim() || null;
    const category = String(body.category || "Expenses").trim();

    await pool.query(
      `INSERT INTO expense_items (id, business_id, item_name, price, tax_rate, hsn_code, description, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         item_name = VALUES(item_name),
         price = VALUES(price),
         tax_rate = VALUES(tax_rate),
         hsn_code = VALUES(hsn_code),
         description = VALUES(description),
         category = VALUES(category)`,
      [id, businessId, itemName, price, taxRate, hsnCode, description, category]
    );

    return res.json({
      success: true,
      message: "Expense item saved.",
      data: { id, item: itemName, name: itemName, price, tax: String(taxRate), taxRate, hsn: hsnCode || "", description: description || "", category },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/expense-items/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const target = req.params.id;

    await pool.query(
      `DELETE FROM expense_items WHERE business_id = ? AND (id = ? OR item_name = ?)`,
      [businessId, target, target]
    );

    return res.json({ success: true, message: "Expense item deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
