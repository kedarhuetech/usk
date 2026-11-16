import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function restoreRecord(rows) {
  const root = {};
  const containers = new Map([["", root]]);
  const ordered = [...rows].sort((a, b) => a.field_path.length - b.field_path.length || a.ordinal - b.ordinal);
  for (const row of ordered) {
    let value;
    switch (row.value_type) {
      case "object": value = {}; break;
      case "array": value = []; break;
      case "number": value = row.value_number === null ? 0 : Number(row.value_number); break;
      case "boolean": value = Boolean(row.value_boolean); break;
      case "null": value = null; break;
      default: value = row.value_text ?? "";
    }
    const parent = containers.get(row.parent_path) || root;
    if (Array.isArray(parent)) parent[Number(row.field_name)] = value;
    else parent[row.field_name] = value;
    if (row.value_type === "object" || row.value_type === "array") containers.set(row.field_path, value);
  }
  return root;
}

export async function syncTransactionsFromGrowth() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "vyapaar",
    port: Number(process.env.DB_PORT) || 3306,
  });

  try {
    const [records] = await conn.query(
      "SELECT business_id, resource, record_id FROM business_growth_records WHERE resource IN ('sales-invoices', 'purchase-bills', 'orders')"
    );
    console.log(`[Sync] Found ${records.length} business growth transaction records.`);

    for (const rec of records) {
      const [fieldRows] = await conn.query(
        "SELECT record_id, field_path, parent_path, field_name, ordinal, value_type, value_text, value_number, value_boolean FROM business_growth_record_fields WHERE business_id = ? AND resource = ? AND record_id = ? ORDER BY record_id, CHAR_LENGTH(field_path), ordinal",
        [rec.business_id, rec.resource, rec.record_id]
      );
      const doc = restoreRecord(fieldRows);
      const id = rec.record_id;
      const type = (rec.resource === "purchase-bills" || doc.transactionType === "purchase") ? "purchase" : "sale";
      const partyName = doc.form?.customer || doc.partyName || doc.customerName || doc.party || doc.customer || doc.supplierName || null;
      const partyPhone = doc.form?.phone || doc.partyPhone || doc.phone || doc.mobile || null;
      const billingAddress = doc.form?.billingAddress || doc.billingAddress || null;
      const shippingAddress = doc.form?.shippingAddress || doc.shippingAddress || billingAddress || null;
      const docNumber = doc.form?.invoiceNumber || doc.documentNumber || doc.invoiceNumber || doc.billNumber || doc.number || "0";
      const txnDate = doc.form?.invoiceDate || doc.transactionDate || doc.invoiceDate || doc.billDate || doc.date || new Date().toISOString().slice(0, 10);
      const total = parseFloat(doc.totals?.finalTotal ?? doc.totalAmount ?? doc.amount ?? 0) || 0;
      const subtotal = parseFloat(doc.totals?.taxableAmount ?? doc.totals?.subtotal ?? doc.subtotal ?? total) || total;
      const paid = parseFloat(doc.totals?.received ?? doc.paidAmount ?? doc.paid ?? 0) || 0;
      const mode = doc.form?.paymentType || doc.paymentMode || (doc.saleType === "cash" ? "Cash" : "Credit") || "Cash";

      await conn.query(
        `INSERT INTO transactions (
          id, business_id, transaction_type, document_number, transaction_date,
          party_name, party_phone, billing_address, shipping_address,
          subtotal, total_amount, paid_amount, balance_amount, payment_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          party_name = COALESCE(party_name, VALUES(party_name)),
          party_phone = COALESCE(party_phone, VALUES(party_phone)),
          billing_address = COALESCE(billing_address, VALUES(billing_address)),
          shipping_address = COALESCE(shipping_address, VALUES(shipping_address)),
          payment_mode = COALESCE(payment_mode, VALUES(payment_mode))`,
        [
          id, rec.business_id, type, String(docNumber), txnDate,
          partyName, partyPhone, billingAddress, shippingAddress,
          subtotal, total, paid, Math.max(0, total - paid), mode
        ]
      );

      // Ingest line items into transaction_items table
      const rawItems = Array.isArray(doc.rows) && doc.rows.length ? doc.rows : (Array.isArray(doc.items) ? doc.items : []);
      if (rawItems.length > 0) {
        await conn.query("DELETE FROM transaction_items WHERE business_id = ? AND transaction_id = ?", [rec.business_id, id]);
        let itemIdx = 0;
        for (const item of rawItems) {
          itemIdx++;
          const lineId = `${id}_item_${itemIdx}_${Math.random().toString(36).substring(2, 6)}`;
          const itemName = (item.item || item.itemName || item.name || "Item").trim();
          const itemId = item.sourceItemId || item.itemId || item.item_id || null;
          const qty = parseFloat(item.qty ?? item.quantity ?? 1) || 1;
          const unit = item.unit || "PCS";
          const price = parseFloat(item.price ?? item.unitPrice ?? item.rate ?? 0) || 0;
          const discountAmt = parseFloat(item.discountAmount ?? (item.discountMode === "amount" ? item.discount : 0) ?? 0) || 0;
          const discountPct = parseFloat(item.discountPercent ?? (item.discountMode !== "amount" ? item.discount : 0) ?? 0) || 0;
          const itemTot = parseFloat(item.calculated?.amount ?? item.amount ?? (qty * price - discountAmt)) || 0;

          await conn.query(
            `INSERT INTO transaction_items (
              id, transaction_id, business_id, item_id, item_name, quantity, unit,
              unit_price, discount_percent, discount_amount, total_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              item_name = VALUES(item_name),
              quantity = VALUES(quantity),
              unit_price = VALUES(unit_price),
              total_amount = VALUES(total_amount)`,
            [
              lineId, id, rec.business_id, itemId, itemName, qty, unit,
              price, discountPct, discountAmt, itemTot
            ]
          );
        }
      }
    }

    // Also populate party names and phones from business_data_sales_invoices if still empty
    const [bRows] = await conn.query(
      "SELECT invoice_id, customer_name, customer_phone FROM business_data_sales_invoices WHERE customer_name IS NOT NULL AND customer_name != ''"
    );
    for (const b of bRows) {
      await conn.query(
        "UPDATE transactions SET party_name = COALESCE(party_name, ?), party_phone = COALESCE(party_phone, ?) WHERE id = ? AND (party_name IS NULL OR party_name = '')",
        [b.customer_name, b.customer_phone, b.invoice_id]
      );
    }

    console.log("[Sync] Successfully backfilled transactions and transaction_items!");
  } finally {
    await conn.end();
  }
}

if (process.argv[1] && process.argv[1].includes("syncTransactionsFromGrowth.js")) {
  syncTransactionsFromGrowth()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Sync Error]", err);
      process.exit(1);
    });
}
