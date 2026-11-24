import { Router } from "express";
import crypto from "node:crypto";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

const DEFAULT_CATEGORIES = [
  { name: "Petrol", type: "indirect" },
  { name: "Rent", type: "indirect" },
  { name: "Salary", type: "indirect" },
  { name: "Tea", type: "indirect" },
  { name: "Transport", type: "indirect" },
];

/**
 * Seed default categories for a business if table has no categories for it
 */
async function seedDefaultCategories(businessId) {
  try {
    const [existing] = await pool.query(
      `SELECT COUNT(*) as count FROM expense_categories WHERE business_id = ?`,
      [businessId]
    );

    if (existing[0]?.count === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        const id = `exp_cat_${crypto.randomUUID().slice(0, 8)}`;
        await pool.query(
          `INSERT IGNORE INTO expense_categories (id, business_id, category_name, expense_type)
           VALUES (?, ?, ?, ?)`,
          [id, businessId, cat.name, cat.type]
        );
      }
    }

    // Also harvest any category names actively used in transactions table
    const [txCategories] = await pool.query(
      `SELECT DISTINCT notes, party_name FROM transactions 
       WHERE business_id = ? AND transaction_type = 'expense' 
         AND (notes IS NOT NULL OR party_name IS NOT NULL)`,
      [businessId]
    );

    for (const tx of txCategories) {
      const candidate = (tx.notes || tx.party_name || "").trim();
      if (!candidate || candidate.length > 100) continue;
      const id = `exp_cat_${crypto.randomUUID().slice(0, 8)}`;
      await pool.query(
        `INSERT INTO expense_categories (id, business_id, category_name, expense_type)
         SELECT ?, ?, ?, 'indirect'
         WHERE NOT EXISTS (
           SELECT 1 FROM expense_categories WHERE business_id = ? AND LOWER(category_name) = LOWER(?)
         )`,
        [id, businessId, candidate, businessId, candidate]
      );
    }
  } catch (err) {
    console.error("[ExpenseCategories] Error seeding categories:", err);
  }
}

/**
 * GET /api/expense-categories
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    await seedDefaultCategories(businessId);

    const [rows] = await pool.query(
      `SELECT * FROM expense_categories WHERE business_id = ? ORDER BY category_name ASC`,
      [businessId]
    );

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        categoryName: r.category_name,
        expenseType: r.expense_type || "indirect",
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/expense-categories
 */
router.post("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const body = req.body || {};
    const categoryName = String(body.categoryName || body.name || "").trim();
    if (!categoryName) {
      return res.status(400).json({ success: false, message: "Category name is required." });
    }

    const expenseType = body.expenseType || body.type || "indirect";

    const [existing] = await pool.query(
      `SELECT id FROM expense_categories WHERE business_id = ? AND LOWER(category_name) = LOWER(?) LIMIT 1`,
      [businessId, categoryName]
    );

    if (existing.length > 0) {
      const existingId = existing[0].id;
      await pool.query(
        `UPDATE expense_categories SET expense_type = ? WHERE id = ? AND business_id = ?`,
        [expenseType, existingId, businessId]
      );
      return res.json({
        success: true,
        message: "Expense category updated.",
        data: { id: existingId, categoryName, expenseType },
      });
    }

    const id = body.id || `exp_cat_${crypto.randomUUID().slice(0, 8)}`;

    await pool.query(
      `INSERT INTO expense_categories (id, business_id, category_name, expense_type)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category_name = VALUES(category_name),
         expense_type = VALUES(expense_type)`,
      [id, businessId, categoryName, expenseType]
    );

    return res.json({
      success: true,
      message: "Expense category saved.",
      data: { id, categoryName, expenseType },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/expense-categories/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const target = req.params.id;

    await pool.query(
      `DELETE FROM expense_categories WHERE business_id = ? AND (id = ? OR category_name = ?)`,
      [businessId, target, target]
    );

    return res.json({ success: true, message: "Expense category deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
