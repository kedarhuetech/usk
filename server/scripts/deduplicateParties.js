import { pool } from "../src/db/mysql.js";

/**
 * Deduplicates parties in MySQL database by (business_id, LOWER(TRIM(party_name))).
 * Preserves canonical party, re-links all transaction and related foreign keys,
 * merges missing contact details, and removes redundant duplicate entries.
 * Finally enforces UNIQUE KEY uq_parties_biz_name (business_id, party_name).
 */
export async function deduplicateParties() {
  console.log("[Deduplication] Checking for duplicate parties in MySQL...");

  const [duplicateGroups] = await pool.query(
    `SELECT business_id, LOWER(TRIM(party_name)) AS norm_name, COUNT(*) AS cnt
     FROM parties
     GROUP BY business_id, LOWER(TRIM(party_name))
     HAVING cnt > 1`
  );

  if (!duplicateGroups.length) {
    console.log("[Deduplication] No duplicate parties found.");
    return { cleanedGroups: 0, removedCount: 0 };
  }

  console.log(`[Deduplication] Found ${duplicateGroups.length} duplicate group(s) to resolve.`);
  let totalRemoved = 0;

  for (const group of duplicateGroups) {
    const [rows] = await pool.query(
      `SELECT id, business_id, party_name, phone, email, gstin, pan, party_type,
              opening_balance, current_balance, balance_type, credit_limit,
              billing_street, billing_city, billing_state, billing_pincode,
              shipping_street, shipping_city, shipping_state, shipping_pincode,
              is_active, created_at
       FROM parties
       WHERE business_id = ? AND LOWER(TRIM(party_name)) = ?
       ORDER BY
         (is_active = 1) DESC,
         (current_balance != 0 OR opening_balance != 0) DESC,
         created_at ASC`,
      [group.business_id, group.norm_name]
    );

    if (rows.length <= 1) continue;

    const canonical = rows[0];
    const duplicateRows = rows.slice(1);
    const duplicateIds = duplicateRows.map((r) => r.id);

    console.log(`[Deduplication] Merging ${duplicateIds.length} duplicate(s) for "${canonical.party_name}" (canonical ID: ${canonical.id})...`);

    // 1. Re-link foreign keys to canonical ID
    const tablesToRelink = [
      { name: "transactions", col: "party_id", hasBiz: true },
      { name: "service_reminders", col: "party_id", hasBiz: true },
      { name: "cheques", col: "party_id", hasBiz: true },
      { name: "loan_accounts", col: "party_id", hasBiz: true },
      { name: "loan_repayments", col: "party_id", hasBiz: true },
      { name: "whatsapp_campaign_logs", col: "party_id", hasBiz: false },
    ];

    for (const table of tablesToRelink) {
      try {
        if (table.hasBiz) {
          await pool.query(
            `UPDATE ${table.name} SET ${table.col} = ? WHERE business_id = ? AND ${table.col} IN (?)`,
            [canonical.id, group.business_id, duplicateIds]
          );
        } else {
          await pool.query(
            `UPDATE ${table.name} SET ${table.col} = ? WHERE ${table.col} IN (?)`,
            [canonical.id, duplicateIds]
          );
        }
      } catch {
        // Table might not exist or column might differ, ignore safely
      }
    }

    // 2. Merge non-null fields from duplicates into canonical if canonical was missing them
    for (const dup of duplicateRows) {
      await pool.query(
        `UPDATE parties SET
           phone = COALESCE(NULLIF(phone, ''), ?),
           email = COALESCE(NULLIF(email, ''), ?),
           gstin = COALESCE(NULLIF(gstin, ''), ?),
           pan = COALESCE(NULLIF(pan, ''), ?),
           billing_street = COALESCE(NULLIF(billing_street, ''), ?),
           billing_city = COALESCE(NULLIF(billing_city, ''), ?),
           billing_state = COALESCE(NULLIF(billing_state, ''), ?),
           billing_pincode = COALESCE(NULLIF(billing_pincode, ''), ?),
           shipping_street = COALESCE(NULLIF(shipping_street, ''), ?),
           shipping_city = COALESCE(NULLIF(shipping_city, ''), ?),
           shipping_state = COALESCE(NULLIF(shipping_state, ''), ?),
           shipping_pincode = COALESCE(NULLIF(shipping_pincode, ''), ?)
         WHERE business_id = ? AND id = ?`,
        [
          dup.phone, dup.email, dup.gstin, dup.pan,
          dup.billing_street, dup.billing_city, dup.billing_state, dup.billing_pincode,
          dup.shipping_street, dup.shipping_city, dup.shipping_state, dup.shipping_pincode,
          group.business_id, canonical.id
        ]
      );
    }

    // 3. Delete redundant duplicate party rows
    await pool.query(
      `DELETE FROM parties WHERE business_id = ? AND id IN (?)`,
      [group.business_id, duplicateIds]
    );

    totalRemoved += duplicateIds.length;
  }

  // 4. Ensure UNIQUE KEY constraint on (business_id, party_name)
  try {
    const [indexes] = await pool.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parties' AND INDEX_NAME = 'uq_parties_biz_name'`
    );
    if (!indexes.length) {
      try {
        await pool.query(`ALTER TABLE parties DROP INDEX idx_parties_name`);
      } catch {}
      await pool.query(
        `ALTER TABLE parties ADD UNIQUE KEY uq_parties_biz_name (business_id, party_name)`
      );
      console.log("[Deduplication] Added UNIQUE KEY uq_parties_biz_name (business_id, party_name) to parties table.");
    }
  } catch (idxErr) {
    console.warn("[Deduplication] Notice on unique index creation:", idxErr.message);
  }

  console.log(`[Deduplication] Complete. Removed ${totalRemoved} duplicate party row(s).`);
  return { cleanedGroups: duplicateGroups.length, removedCount: totalRemoved };
}

// Allow running standalone: node server/scripts/deduplicateParties.js
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").includes("server/scripts/deduplicateParties.js")) {
  deduplicateParties()
    .then((res) => {
      console.log("[Deduplication CLI] Result:", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Deduplication CLI] Error:", err);
      process.exit(1);
    });
}
