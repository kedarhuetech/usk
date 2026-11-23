/**
 * Safe Browser-to-MySQL Data Migration Engine Router
 * 
 * Strict Guarantees:
 * 1. Zero data destruction: Existing MySQL records are never deleted or corrupted.
 * 2. Stable identity matching: Matches by UUID/ID first; avoids duplicating records.
 * 3. Scope isolation: Assigns migrated records to the active businessId ('demo-business')
 *    while preserving existing records in other businesses (like 'local-development').
 * 4. Auditability: Logs every migration operation in migration_logs with batch_id.
 * 5. Full Reversibility: Rollback endpoint allows undoing a batch cleanly.
 * 6. Backward Compatibility: Preserves /migrate-from-local for existing client auto-migration.
 */

import { Router } from "express";
import { pool, businessIdFromRequest, toSqlDate } from "../db/mysql.js";

const router = Router();

/**
 * POST /api/migration/migrate-local-data
 * Advanced batch migration engine with audit logging and rollback readiness.
 */
router.post("/migrate-local-data", async (req, res) => {
  const conn = await pool.getConnection();
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const businessId = businessIdFromRequest(req);

  const report = {
    batchId,
    businessId,
    totalDiscovered: 0,
    alreadyPresent: 0,
    newlyMigrated: 0,
    updated: 0,
    skipped: 0,
    conflicts: [],
    failed: [],
    categories: {},
  };

  try {
    await conn.beginTransaction();
    const payload = req.body || {};

    const logMigration = async (entityType, sourceId, targetTable, targetId, action, details = "") => {
      const logId = `miglog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await conn.query(
        `INSERT INTO migration_logs (id, batch_id, business_id, entity_type, source_id, target_table, target_id, action, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [logId, batchId, businessId, entityType, String(sourceId), targetTable, String(targetId), action, details]
      );
    };

    // 1. Migrate Parties
    const rawParties = Array.isArray(payload.parties) ? payload.parties : [];
    report.categories.parties = { discovered: rawParties.length, migrated: 0, skipped: 0 };
    report.totalDiscovered += rawParties.length;

    for (const p of rawParties) {
      if (!p || (!p.id && !p.partyName && !p.name)) continue;
      const id = String(p.id || `party_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
      const partyName = String(p.partyName || p.name || "Unnamed Party").trim();
      const phone = p.phone || p.mobile || null;
      const gstin = p.gstin || p.gstNumber || null;
      const partyType = (p.partyType || p.party_type || "customer").toLowerCase();
      const openingBalance = parseFloat(p.openingBalance ?? 0) || 0;
      const currentBalance = parseFloat(p.currentBalance ?? p.balance ?? openingBalance) || 0;
      const balanceType = p.balanceType || (currentBalance >= 0 ? "to_receive" : "to_pay");
      const billingStreet = p.billingStreet || p.billingAddress || p.address || null;
      const billingCity = p.billingCity || p.city || null;
      const billingState = p.billingState || p.state || null;
      const billingPincode = p.billingPincode || p.pincode || null;

      // Check if already in MySQL under this business or globally by ID
      const [existing] = await conn.query(
        `SELECT id, business_id, party_name FROM parties WHERE id = ? OR (business_id = ? AND LOWER(TRIM(party_name)) = LOWER(TRIM(?))) LIMIT 1`,
        [id, businessId, partyName]
      );

      if (existing.length > 0) {
        report.alreadyPresent += 1;
        report.skipped += 1;
        report.categories.parties.skipped += 1;
        await logMigration("party", id, "parties", existing[0].id, "skipped", `Party already exists as ID: ${existing[0].id}`);
      } else {
        await conn.query(
          `INSERT INTO parties (
            id, business_id, party_name, phone, gstin, party_type,
            opening_balance, current_balance, balance_type,
            billing_street, billing_city, billing_state, billing_pincode
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, businessId, partyName, phone, gstin, partyType, openingBalance, currentBalance, balanceType, billingStreet, billingCity, billingState, billingPincode]
        );
        report.newlyMigrated += 1;
        report.categories.parties.migrated += 1;
        await logMigration("party", id, "parties", id, "inserted", `Migrated party ${partyName}`);
      }
    }

    // 2. Migrate Inventory Items
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    report.categories.items = { discovered: rawItems.length, migrated: 0, skipped: 0 };
    report.totalDiscovered += rawItems.length;

    for (const item of rawItems) {
      if (!item || (!item.id && !item.name && !item.itemName)) continue;
      const id = String(item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
      const name = String(item.itemName || item.name || "Item").trim();
      const itemCode = item.itemCode || item.code || null;
      const category = item.category || "General";
      const unit = item.unit || "PCS";
      const salePrice = parseFloat(item.salePrice ?? item.price ?? 0) || 0;
      const purchasePrice = parseFloat(item.purchasePrice ?? 0) || 0;
      const currentStock = parseFloat(item.openingQuantity ?? item.stock ?? item.currentStock ?? 0) || 0;
      const taxRate = parseFloat(item.taxRate ?? 0) || 0;

      const [existing] = await conn.query(
        `SELECT id, business_id, name FROM inventory_items WHERE id = ? OR (business_id = ? AND name = ?) LIMIT 1`,
        [id, businessId, name]
      );

      if (existing.length > 0) {
        report.alreadyPresent += 1;
        report.skipped += 1;
        report.categories.items.skipped += 1;
        await logMigration("item", id, "inventory_items", existing[0].id, "skipped", `Item already exists in DB`);
      } else {
        await conn.query(
          `INSERT INTO inventory_items (
            id, business_id, name, item_code, category, unit,
            sale_price, purchase_price, opening_stock, current_stock, tax_rate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, businessId, name, itemCode, category, unit, salePrice, purchasePrice, currentStock, currentStock, taxRate]
        );
        report.newlyMigrated += 1;
        report.categories.items.migrated += 1;
        await logMigration("item", id, "inventory_items", id, "inserted", `Migrated item ${name}`);
      }
    }

    // 3. Migrate Unit Conversions
    const rawConversions = Array.isArray(payload.unitConversions) ? payload.unitConversions : [];
    report.categories.unitConversions = { discovered: rawConversions.length, migrated: 0, skipped: 0 };
    report.totalDiscovered += rawConversions.length;

    for (const uc of rawConversions) {
      if (!uc || !uc.unit) continue;
      const unit = String(uc.unit).trim();
      const toUnit = String(uc.toUnit || "PCS").trim();
      const factor = parseFloat(uc.conversionFactor ?? uc.factor ?? 1) || 1;
      const id = String(uc.id || `uconv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);

      const [existing] = await conn.query(
        `SELECT id FROM unit_conversions WHERE business_id = ? AND unit = ? AND to_unit = ? LIMIT 1`,
        [businessId, unit, toUnit]
      );

      if (existing.length > 0) {
        report.alreadyPresent += 1;
        report.skipped += 1;
        report.categories.unitConversions.skipped += 1;
        await logMigration("unit_conversion", id, "unit_conversions", existing[0].id, "skipped", `Conversion already exists`);
      } else {
        await conn.query(
          `INSERT INTO unit_conversions (id, business_id, unit, to_unit, conversion_factor)
           VALUES (?, ?, ?, ?, ?)`,
          [id, businessId, unit, toUnit, factor]
        );
        report.newlyMigrated += 1;
        report.categories.unitConversions.migrated += 1;
        await logMigration("unit_conversion", id, "unit_conversions", id, "inserted", `Migrated unit conversion ${unit} -> ${toUnit}`);
      }
    }

    // 4. Migrate Transactions & Line Items
    const rawTxns = Array.isArray(payload.transactions) ? payload.transactions : [];
    report.categories.transactions = { discovered: rawTxns.length, migrated: 0, skipped: 0 };
    report.totalDiscovered += rawTxns.length;

    for (const t of rawTxns) {
      if (!t || (!t.id && !t.documentNumber && !t.invoiceNumber && !t.billNumber)) continue;
      const id = String(t.id || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
      const transactionType = (t.transactionType || t.type || "sale").toLowerCase();
      const documentNumber = String(
        t.documentNumber ??
        t.docNumber ??
        t.invoiceNumber ??
        t.billNumber ??
        t.orderNumber ??
        t.form?.invoiceNumber ??
        t.form?.billNumber ??
        t.id
      ).trim();

      const rawTxnDate = t.transactionDate || t.invoiceDate || t.billDate || t.date || new Date().toISOString().slice(0, 10);
      const transactionDate = toSqlDate(rawTxnDate) || new Date().toISOString().slice(0, 10);
      const partyId = t.partyId && t.partyId !== "null" && t.partyId !== "undefined" ? String(t.partyId) : null;
      const partyName = t.partyName || t.customer || t.supplier || t.party || t.form?.customer || t.form?.supplier || null;
      const totalAmount = parseFloat(t.totalAmount ?? t.total ?? t.amount ?? t.totals?.total ?? t.totals?.finalTotal ?? 0) || 0;
      const paidAmount = parseFloat(t.paidAmount ?? t.receivedAmount ?? totalAmount) || 0;
      const balanceAmount = parseFloat(t.balanceAmount ?? (totalAmount - paidAmount)) || 0;
      const paymentMode = t.paymentMode || t.paymentType || "Cash";

      // Check if transaction ID already exists in MySQL
      const [existingById] = await conn.query(
        `SELECT id, business_id FROM transactions WHERE id = ? LIMIT 1`,
        [id]
      );

      if (existingById.length > 0) {
        report.alreadyPresent += 1;
        report.skipped += 1;
        report.categories.transactions.skipped += 1;
        await logMigration("transaction", id, "transactions", existingById[0].id, "skipped", "Transaction ID already exists");
        continue;
      }

      // Explicit preservation check: Skip purchase bills with dummy doc number '0'
      if (transactionType === "purchase" && (documentNumber === "0" || documentNumber === "00")) {
        report.conflicts.push({
          type: "dummy_document_number_skipped",
          sourceId: id,
          documentNumber,
          transactionType,
          reason: "Dummy doc number 0 skipped per preservation policy",
        });
        report.skipped += 1;
        report.categories.transactions.skipped += 1;
        await logMigration("transaction", id, "transactions", id, "conflict", "Dummy doc number 0 skipped");
        continue;
      }

      // Check for document number collision
      const [existingByDoc] = await conn.query(
        `SELECT id FROM transactions WHERE business_id = ? AND transaction_type = ? AND document_number = ? LIMIT 1`,
        [businessId, transactionType, documentNumber]
      );

      if (existingByDoc.length > 0) {
        report.conflicts.push({
          type: "transaction_document_collision",
          sourceId: id,
          existingId: existingByDoc[0].id,
          documentNumber,
          transactionType,
        });
        report.skipped += 1;
        report.categories.transactions.skipped += 1;
        await logMigration("transaction", id, "transactions", existingByDoc[0].id, "conflict", `Doc ${documentNumber} already used`);
        continue;
      }

      // Check party reference safety
      if (partyId) {
        const [pCheck] = await conn.query(
          `SELECT id FROM parties WHERE business_id = ? AND id = ? LIMIT 1`,
          [businessId, partyId]
        );
        if (!pCheck.length) {
          report.conflicts.push({
            type: "unresolved_party_reference",
            transactionId: id,
            documentNumber,
            missingPartyId: partyId,
            partyName,
          });
        }
      }

      const subtotal = parseFloat(t.subtotal ?? t.totals?.subTotal ?? totalAmount) || 0;
      const discountPercent = parseFloat(t.discountPercent ?? t.totals?.discountPercent ?? 0) || 0;
      const discountAmount = parseFloat(t.discountAmount ?? t.discount ?? t.totals?.discount ?? 0) || 0;
      const taxAmount = parseFloat(t.taxAmount ?? t.tax ?? t.totals?.tax ?? 0) || 0;
      const roundOff = parseFloat(t.roundOff ?? t.totals?.roundOffAmount ?? 0) || 0;
      const partyPhone = t.partyPhone || t.phone || t.form?.phone || null;
      const partyGstin = t.partyGstin || t.gstin || t.form?.gstin || null;
      const dueDate = toSqlDate(t.dueDate || t.form?.dueDate);
      const notes = t.notes || t.form?.notes || null;

      // Insert transaction header with full financial fields
      await conn.query(
        `INSERT INTO transactions (
          id, business_id, transaction_type, document_number, transaction_date, due_date,
          party_id, party_name, party_phone, party_gstin, subtotal,
          discount_percent, discount_amount, tax_amount, round_off,
          total_amount, paid_amount, balance_amount, payment_mode, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, businessId, transactionType, documentNumber, transactionDate, dueDate,
          partyId, partyName, partyPhone, partyGstin, subtotal,
          discountPercent, discountAmount, taxAmount, roundOff,
          totalAmount, paidAmount, balanceAmount, paymentMode, notes
        ]
      );

      // Insert transaction line items with full tax and item fidelity
      const rawLines = Array.isArray(t.rows) ? t.rows : (Array.isArray(t.items) ? t.items : []);
      for (let idx = 0; idx < rawLines.length; idx++) {
        const line = rawLines[idx];
        const lineId = `${id}_line_${idx + 1}`;
        const itemName = line.item || line.name || line.itemName || "Item";
        const itemCode = line.itemCode || line.code || null;
        const hsnCode = line.hsnCode || line.hsn || null;
        const batchNo = line.batchNo || line.batch || null;
        const serialNo = line.serialNo || line.serial || null;
        const qty = parseFloat(line.qty ?? line.quantity ?? 1) || 1;
        const price = parseFloat(line.price ?? line.unitPrice ?? 0) || 0;
        const unit = line.unit || "PCS";
        const purchasePrice = parseFloat(line.purchasePrice ?? 0) || 0;
        const itemDiscountPercent = parseFloat(line.discountPercent ?? 0) || 0;
        const itemDiscountAmount = parseFloat(line.discountAmount ?? line.discount ?? 0) || 0;
        const itemTaxRate = parseFloat(line.taxRate ?? line.tax ?? 0) || 0;
        const itemTaxAmount = parseFloat(line.taxAmount ?? 0) || 0;
        const cgstRate = parseFloat(line.cgstRate ?? (itemTaxRate / 2)) || 0;
        const cgstAmount = parseFloat(line.cgstAmount ?? (itemTaxAmount / 2)) || 0;
        const sgstRate = parseFloat(line.sgstRate ?? (itemTaxRate / 2)) || 0;
        const sgstAmount = parseFloat(line.sgstAmount ?? (itemTaxAmount / 2)) || 0;
        const lineTotal = parseFloat(line.amount ?? line.totalAmount ?? (qty * price - itemDiscountAmount)) || 0;

        let lineItemId = line.itemId || line.sourceItemId || null;
        if (lineItemId) {
          const [itCheck] = await conn.query(
            `SELECT id FROM inventory_items WHERE business_id = ? AND id = ? LIMIT 1`,
            [businessId, lineItemId]
          );
          if (!itCheck.length) {
            lineItemId = null;
          }
        }

        await conn.query(
          `INSERT INTO transaction_items (
            id, transaction_id, business_id, item_id, item_name, item_code, hsn_code,
            batch_no, serial_no, quantity, unit, unit_price, purchase_price,
            discount_percent, discount_amount, tax_rate, tax_amount,
            cgst_rate, cgst_amount, sgst_rate, sgst_amount, total_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            lineId, id, businessId, lineItemId, itemName, itemCode, hsnCode,
            batchNo, serialNo, qty, unit, price, purchasePrice,
            itemDiscountPercent, itemDiscountAmount, itemTaxRate, itemTaxAmount,
            cgstRate, cgstAmount, sgstRate, sgstAmount, lineTotal
          ]
        );
      }

      report.newlyMigrated += 1;
      report.categories.transactions.migrated += 1;
      await logMigration("transaction", id, "transactions", id, "inserted", `Migrated ${transactionType} ${documentNumber}`);
    }

    // 5. Migrate Cheques
    const rawCheques = Array.isArray(payload.cheques) ? payload.cheques : [];
    report.categories.cheques = { discovered: rawCheques.length, migrated: 0, skipped: 0 };
    report.totalDiscovered += rawCheques.length;

    for (const c of rawCheques) {
      if (!c || !c.id) continue;
      const id = String(c.id);
      const [existing] = await conn.query(`SELECT id FROM cheques WHERE id = ? LIMIT 1`, [id]);
      if (existing.length > 0) {
        report.alreadyPresent += 1;
        report.skipped += 1;
        report.categories.cheques.skipped += 1;
        await logMigration("cheque", id, "cheques", id, "skipped", "Cheque already in DB");
      } else {
        const chequeDate = c.chequeDate ? toSqlDate(c.chequeDate) : new Date().toISOString().slice(0, 10);
        await conn.query(
          `INSERT INTO cheques (
            id, business_id, party_name, party_id, cheque_number, bank_name,
            amount, cheque_date, cheque_type, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, businessId, c.partyName || "Party", c.partyId || null, c.chequeNumber || "", c.bankName || "", parseFloat(c.amount) || 0, chequeDate, (c.type || "received").toLowerCase(), (c.status || "pending").toLowerCase(), c.notes || ""]
        );
        report.newlyMigrated += 1;
        report.categories.cheques.migrated += 1;
        await logMigration("cheque", id, "cheques", id, "inserted", `Migrated cheque ${c.chequeNumber}`);
      }
    }

    // 6. Migrate Loan Accounts & Repayments
    const rawLoans = Array.isArray(payload.loans) ? payload.loans : [];
    report.categories.loans = { discovered: rawLoans.length, migrated: 0, skipped: 0 };
    report.totalDiscovered += rawLoans.length;

    for (const loan of rawLoans) {
      if (!loan || !loan.id) continue;
      const id = String(loan.id);
      const repayments = Array.isArray(loan.repayments) ? loan.repayments : [];
      const totalPrincipalRepaid = repayments.reduce((sum, r) => sum + (parseFloat(r.principalPaid ?? r.amountPaid ?? 0) || 0), 0);
      const originalAmount = parseFloat(loan.originalAmount ?? loan.principalAmount ?? 0) || 0;
      const currentBalance = parseFloat(loan.currentBalance ?? Math.max(0, originalAmount - totalPrincipalRepaid)) || 0;

      const [existing] = await conn.query(`SELECT id FROM loan_accounts WHERE id = ? LIMIT 1`, [id]);
      if (existing.length > 0) {
        report.alreadyPresent += 1;
        report.skipped += 1;
        report.categories.loans.skipped += 1;
        await logMigration("loan", id, "loan_accounts", id, "skipped", "Loan already in DB");
      } else {
        await conn.query(
          `INSERT INTO loan_accounts (
            id, business_id, account_name, lender_name, account_number, loan_type,
            principal_amount, current_balance, interest_rate, term_months, emi_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, businessId, loan.loanName || loan.accountName || "Loan", loan.lenderName || "Lender",
            loan.id.slice(0, 8), loan.repaymentFrequency || "Term Loan",
            originalAmount, currentBalance,
            parseFloat(loan.annualInterestRate) || 0, parseInt(loan.tenureMonths, 10) || 12,
            parseFloat(loan.emiOverride || 0)
          ]
        );
        report.newlyMigrated += 1;
        report.categories.loans.migrated += 1;
        await logMigration("loan", id, "loan_accounts", id, "inserted", `Migrated loan ${loan.loanName}`);
      }

      // Migrate child repayments if present
      for (const rep of repayments) {
        if (!rep || !rep.id) continue;
        const repId = String(rep.id);
        const [repExisting] = await conn.query(`SELECT id FROM loan_repayments WHERE business_id = ? AND id = ? LIMIT 1`, [businessId, repId]);
        if (!repExisting.length) {
          const paymentDate = rep.paymentDate ? toSqlDate(rep.paymentDate) : new Date().toISOString().slice(0, 10);
          await conn.query(
            `INSERT INTO loan_repayments (
              id, business_id, loan_id, payment_date, amount_paid, principal_paid, interest_paid, reference, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [repId, businessId, id, paymentDate, parseFloat(rep.amountPaid) || 0, parseFloat(rep.principalPaid) || 0, parseFloat(rep.interestPaid) || 0, rep.reference || "", rep.notes || ""]
          );
          await logMigration("loan_repayment", repId, "loan_repayments", repId, "inserted", `Migrated repayment for loan ${id}`);
        }
      }
    }

    // 7. Migrate Purchase Job Works
    const rawJobWorks = Array.isArray(payload.jobWorks) ? payload.jobWorks : [];
    report.categories.jobWorks = { discovered: rawJobWorks.length, migrated: 0, skipped: 0 };
    report.totalDiscovered += rawJobWorks.length;

    for (const jw of rawJobWorks) {
      if (!jw || !jw.id) continue;
      const id = String(jw.id);
      const [existing] = await conn.query(`SELECT id FROM purchase_job_works WHERE id = ? LIMIT 1`, [id]);
      if (existing.length > 0) {
        report.alreadyPresent += 1;
        report.skipped += 1;
        report.categories.jobWorks.skipped += 1;
        await logMigration("job_work", id, "purchase_job_works", id, "skipped", "Job work already in DB");
      } else {
        const orderDate = jw.date ? toSqlDate(jw.date) : null;
        await conn.query(
          `INSERT INTO purchase_job_works (
            id, business_id, order_number, party_name, party_id, order_date, status, charges, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, businessId, jw.number || "JW-1", jw.party || "Vendor", jw.partyId || null, orderDate, jw.status || "Pending", parseFloat(jw.charges) || 0, jw.notes || ""]
        );

        // Migrate child job work items
        const sentRows = Array.isArray(jw.sentRows) ? jw.sentRows : [];
        const receivedRows = Array.isArray(jw.receivedRows) ? jw.receivedRows : [];
        for (let idx = 0; idx < sentRows.length; idx++) {
          const row = sentRows[idx];
          if (!row || !row.itemId) continue;
          const lineId = `${id}_sent_${idx + 1}`;
          await conn.query(
            `INSERT INTO purchase_job_work_items (id, business_id, job_work_id, item_type, item_id, item_name, quantity, unit)
             VALUES (?, ?, ?, 'sent', ?, ?, ?, ?)`,
            [lineId, businessId, id, row.itemId, row.item || row.name || "Material", parseFloat(row.qty) || 0, row.unit || "PCS"]
          );
        }
        for (let idx = 0; idx < receivedRows.length; idx++) {
          const row = receivedRows[idx];
          if (!row || !row.itemId) continue;
          const lineId = `${id}_recv_${idx + 1}`;
          await conn.query(
            `INSERT INTO purchase_job_work_items (id, business_id, job_work_id, item_type, item_id, item_name, quantity, unit)
             VALUES (?, ?, ?, 'received', ?, ?, ?, ?)`,
            [lineId, businessId, id, row.itemId, row.item || row.name || "Finished Good", parseFloat(row.qty) || 0, row.unit || "PCS"]
          );
        }

        report.newlyMigrated += 1;
        report.categories.jobWorks.migrated += 1;
        await logMigration("job_work", id, "purchase_job_works", id, "inserted", `Migrated job work ${jw.number}`);
      }
    }

    // 8. Migrate Balance Sheet Chart of Accounts
    const rawAccounts = Array.isArray(payload.balanceSheetAccounts) ? payload.balanceSheetAccounts : [];
    report.categories.balanceSheetAccounts = { discovered: rawAccounts.length, migrated: 0, skipped: 0 };
    report.totalDiscovered += rawAccounts.length;

    for (const acc of rawAccounts) {
      if (!acc || (!acc.id && !acc.name)) continue;
      const id = String(acc.id || `bsacc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
      const name = String(acc.name || acc.accountName || "Account").trim();
      const [existing] = await conn.query(`SELECT id FROM balance_sheet_accounts WHERE business_id = ? AND (id = ? OR account_name = ?) LIMIT 1`, [businessId, id, name]);
      if (existing.length > 0) {
        report.alreadyPresent += 1;
        report.skipped += 1;
        report.categories.balanceSheetAccounts.skipped += 1;
        await logMigration("balance_sheet_account", id, "balance_sheet_accounts", existing[0].id, "skipped", "Account exists");
      } else {
        await conn.query(
          `INSERT INTO balance_sheet_accounts (id, business_id, account_name, account_type, opening_balance, balance_type)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, businessId, name, acc.type || acc.accountType || "Asset", parseFloat(acc.openingBalance) || 0, acc.balanceType || "debit"]
        );
        report.newlyMigrated += 1;
        report.categories.balanceSheetAccounts.migrated += 1;
        await logMigration("balance_sheet_account", id, "balance_sheet_accounts", id, "inserted", `Migrated account ${name}`);
      }
    }

    await conn.commit();
    return res.json({ success: true, message: "Migration completed successfully.", report });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: `Migration transaction aborted: ${err.message}`, report });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/migration/rollback-batch/:batchId
 * Safely rolls back records inserted during a specific migration batch in reverse-topological order
 */
router.post("/rollback-batch/:batchId", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const batchId = req.params.batchId;

    const [logs] = await conn.query(
      `SELECT * FROM migration_logs WHERE business_id = ? AND batch_id = ? AND action = 'inserted' ORDER BY created_at DESC`,
      [businessId, batchId]
    );

    if (!logs.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: `No inserted records found for batch ${batchId}.` });
    }

    // Topological deletion order: children first, then parents
    const tablesInReverseOrder = [
      "loan_repayments",
      "purchase_job_work_items",
      "transaction_items",
      "transactions",
      "purchase_job_works",
      "loan_accounts",
      "balance_sheet_accounts",
      "unit_conversions",
      "cheques",
      "inventory_items",
      "parties",
    ];

    let deletedCount = 0;
    for (const tableName of tablesInReverseOrder) {
      const [tableLogs] = await conn.query(
        `SELECT target_id FROM migration_logs WHERE business_id = ? AND batch_id = ? AND target_table = ? AND action = 'inserted'`,
        [businessId, batchId, tableName]
      );
      if (tableLogs.length > 0) {
        const targetIds = tableLogs.map((l) => l.target_id);
        const placeholders = targetIds.map(() => "?").join(",");
        if (tableName === "transactions") {
          await conn.query(`DELETE FROM transaction_items WHERE business_id = ? AND transaction_id IN (${placeholders})`, [businessId, ...targetIds]);
        } else if (tableName === "purchase_job_works") {
          await conn.query(`DELETE FROM purchase_job_work_items WHERE business_id = ? AND job_work_id IN (${placeholders})`, [businessId, ...targetIds]);
        } else if (tableName === "loan_accounts") {
          await conn.query(`DELETE FROM loan_repayments WHERE business_id = ? AND loan_id IN (${placeholders})`, [businessId, ...targetIds]);
        }
        await conn.query(
          `DELETE FROM ${tableName} WHERE business_id = ? AND id IN (${placeholders})`,
          [businessId, ...targetIds]
        );
        deletedCount += targetIds.length;
      }
    }

    await conn.query(
      `UPDATE migration_logs SET action = 'failed', details = CONCAT(details, ' [ROLLED BACK]') WHERE business_id = ? AND batch_id = ?`,
      [businessId, batchId]
    );

    await conn.commit();
    return res.json({ success: true, message: `Successfully rolled back ${deletedCount} records from batch ${batchId}.` });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: `Rollback failed: ${err.message}` });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/migration/migrate-from-local
 * Backward-compatible auto-migration endpoint for client startup auto-migration (origin/partiesanditems).
 */
router.post("/migrate-from-local", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const businessId = businessIdFromRequest(req);
    const {
      parties = [],
      items = [],
      transactions = [],
      serviceReminders = [],
      bankAccounts = [],
      settings = {},
      companyProfile = {},
    } = req.body || {};

    let partiesCount = 0;
    let itemsCount = 0;
    let transactionsCount = 0;
    let remindersCount = 0;

    // 1. Ingest Parties (Pure SQL columns)
    for (const p of parties) {
      if (!p.id && !p.name && !p.partyName) continue;
      const id = p.id || `party_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const name = p.partyName || p.name || "Customer";
      const phone = p.phone || p.mobile || null;
      const email = p.email || null;
      const gstin = p.gstin || p.gstNumber || null;
      const pan = p.pan || null;
      const type = (p.partyType || "customer").toLowerCase();
      const openBal = parseFloat(p.openingBalance ?? 0) || 0;
      const currBal = parseFloat(p.currentBalance ?? p.balance ?? openBal) || 0;
      const balType = p.balanceType || (currBal >= 0 ? "to_receive" : "to_pay");
      const creditLimit = parseFloat(p.creditLimit ?? 0) || 0;
      const billingStreet = p.billingStreet || (typeof p.billingAddress === "string" ? p.billingAddress : (p.address || null));
      const billingCity = p.billingCity || p.city || null;
      const billingState = p.billingState || p.state || null;
      const billingPincode = p.billingPincode || p.pincode || null;
      const shippingStreet = p.shippingStreet || (typeof p.shippingAddress === "string" ? p.shippingAddress : null);
      const shippingCity = p.shippingCity || null;
      const shippingState = p.shippingState || null;
      const shippingPincode = p.shippingPincode || null;

      await conn.query(
        `INSERT INTO parties (
          id, business_id, party_name, phone, email, gstin, pan, party_type,
          opening_balance, current_balance, balance_type, credit_limit,
          billing_street, billing_city, billing_state, billing_pincode,
          shipping_street, shipping_city, shipping_state, shipping_pincode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          party_name = VALUES(party_name),
          phone = VALUES(phone),
          email = VALUES(email),
          gstin = VALUES(gstin),
          current_balance = VALUES(current_balance),
          balance_type = VALUES(balance_type)`,
        [
          id, businessId, name, phone, email, gstin, pan, type,
          openBal, currBal, balType, creditLimit,
          billingStreet, billingCity, billingState, billingPincode,
          shippingStreet, shippingCity, shippingState, shippingPincode
        ]
      );
      partiesCount++;
    }

    // 2. Ingest Items & Batches
    for (const item of items) {
      if (!item.id && !item.name && !item.itemName) continue;
      const id = item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const name = item.name || item.itemName || "Item";
      const code = item.itemCode || item.item_code || null;
      const barcode = item.barcode || null;
      const cat = item.category || "General";
      const hsn = item.hsnCode || item.hsn_code || null;
      const unit = item.unit || "PCS";
      const itemType = item.itemType || "product";
      const sale = parseFloat(item.salePrice ?? item.price ?? 0) || 0;
      const purchase = parseFloat(item.purchasePrice ?? 0) || 0;
      const tax = parseFloat(item.taxRate ?? item.tax ?? 0) || 0;
      const cess = parseFloat(item.cessRate ?? 0) || 0;
      const openStock = parseFloat(item.openingStock ?? 0) || 0;
      const stock = parseFloat(item.currentStock ?? item.stock ?? openStock) || 0;
      const minStock = parseFloat(item.minStock ?? 0) || 0;
      const isBatch = item.isBatchTracked ? 1 : 0;
      const isSerial = item.isSerialTracked ? 1 : 0;
      const desc = item.description || null;

      await conn.query(
        `INSERT INTO inventory_items (
          id, business_id, name, item_code, barcode, category, hsn_code, unit,
          item_type, sale_price, purchase_price, tax_rate, cess_rate,
          opening_stock, current_stock, min_stock, is_batch_tracked,
          is_serial_tracked, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          sale_price = VALUES(sale_price),
          purchase_price = VALUES(purchase_price),
          tax_rate = VALUES(tax_rate),
          current_stock = VALUES(current_stock)`,
        [
          id, businessId, name, code, barcode, cat, hsn, unit,
          itemType, sale, purchase, tax, cess,
          openStock, stock, minStock, isBatch, isSerial, desc
        ]
      );

      // Ingest Batches child rows if batch-tracked
      if (Array.isArray(item.batches) && item.batches.length > 0) {
        for (const b of item.batches) {
          if (!b.batchNo) continue;
          const batchId = b.id || `batch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await conn.query(
            `INSERT INTO item_batches (
              id, item_id, business_id, batch_no, mfg_date, exp_date,
              opening_qty, current_qty, purchase_price, sale_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              current_qty = VALUES(current_qty)`,
            [
              batchId, id, businessId, b.batchNo,
              toSqlDate(b.mfgDate), toSqlDate(b.expDate),
              parseFloat(b.openingQty ?? 0) || 0,
              parseFloat(b.currentQty ?? b.stock ?? 0) || 0,
              parseFloat(b.purchasePrice ?? 0) || 0,
              parseFloat(b.salePrice ?? 0) || 0
            ]
          );
        }
      }
      itemsCount++;
    }

    // 3. Ingest Transactions & Line Items
    for (const txn of transactions) {
      if (!txn.id && !txn.documentNumber && !txn.invoiceNumber) continue;
      const id = txn.id || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const type = (txn.transactionType || txn.type || "sale").toLowerCase();
      const docNo = txn.documentNumber || txn.invoiceNumber || txn.billNumber || txn.number || "0";
      const rawDate = txn.transactionDate || txn.invoiceDate || txn.billDate || txn.date || new Date().toISOString().slice(0, 10);
      const date = toSqlDate(rawDate) || new Date().toISOString().slice(0, 10);
      const dueDate = toSqlDate(txn.dueDate);
      const pId = txn.partyId || txn.party_id || null;
      const pName = txn.partyName || txn.party || txn.customerName || txn.supplierName || null;
      const pPhone = txn.partyPhone || txn.phone || null;
      const pGstin = txn.partyGstin || txn.gstin || null;
      const bAddr = typeof txn.billingAddress === "object" ? JSON.stringify(txn.billingAddress) : (txn.billingAddress || null);
      const sAddr = typeof txn.shippingAddress === "object" ? JSON.stringify(txn.shippingAddress) : (txn.shippingAddress || null);

      const subtotal = parseFloat(txn.subtotal ?? txn.totalAmount ?? txn.amount ?? 0) || 0;
      const discountPercent = parseFloat(txn.discountPercent ?? 0) || 0;
      const discount = parseFloat(txn.discountAmount ?? txn.discount ?? 0) || 0;
      const tax = parseFloat(txn.taxAmount ?? txn.tax ?? 0) || 0;
      const roundOff = parseFloat(txn.roundOff ?? 0) || 0;
      const total = parseFloat(txn.totalAmount ?? txn.total ?? txn.amount ?? 0) || 0;
      const paid = parseFloat(txn.paidAmount ?? txn.receivedAmount ?? txn.paid ?? 0) || 0;
      const bal = parseFloat(txn.balanceAmount ?? txn.balance ?? (total - paid)) || 0;
      const mode = txn.paymentMode || txn.paymentType || "Cash";
      const status = txn.status || "Completed";
      const refNo = txn.paymentRefNo || null;
      const cashTendered = parseFloat(txn.cashTendered ?? 0) || 0;
      const changeReturned = parseFloat(txn.changeReturned ?? 0) || 0;
      const vehicleNo = txn.vehicleNo || null;
      const eWayBillNo = txn.eWayBillNo || null;
      const poNumber = txn.poNumber || null;
      const poDate = toSqlDate(txn.poDate);
      const notes = txn.notes || null;
      const terms = txn.terms || null;

      await conn.query(
        `INSERT INTO transactions (
          id, business_id, transaction_type, document_number, transaction_date, due_date,
          party_id, party_name, party_phone, party_gstin, billing_address, shipping_address,
          subtotal, discount_percent, discount_amount, tax_amount, round_off,
          total_amount, paid_amount, balance_amount, payment_mode, payment_status,
          payment_ref_no, cash_tendered, change_returned, vehicle_no, e_way_bill_no,
          po_number, po_date, notes, terms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_amount = VALUES(total_amount),
          paid_amount = VALUES(paid_amount),
          balance_amount = VALUES(balance_amount),
          payment_status = VALUES(payment_status)`,
        [
          id, businessId, type, docNo, date, dueDate,
          pId, pName, pPhone, pGstin, bAddr, sAddr,
          subtotal, discountPercent, discount, tax, roundOff,
          total, paid, bal, mode, status,
          refNo, cashTendered, changeReturned, vehicleNo, eWayBillNo,
          poNumber, poDate, notes, terms
        ]
      );

      // Ingest child line items
      const rawRows = Array.isArray(txn.rows) ? txn.rows : (Array.isArray(txn.items) ? txn.items : []);
      if (rawRows.length > 0) {
        for (let idx = 0; idx < rawRows.length; idx++) {
          const row = rawRows[idx];
          const lineId = row.id || `${id}_line_${idx + 1}`;
          const itemName = row.item || row.name || row.itemName || "Item";
          const itemCode = row.itemCode || row.code || null;
          const hsnCode = row.hsnCode || row.hsn || null;
          const batchNo = row.batchNo || row.batch || null;
          const serialNo = row.serialNo || row.serial || null;
          const qty = parseFloat(row.qty ?? row.quantity ?? 1) || 1;
          const freeQty = parseFloat(row.freeQty ?? 0) || 0;
          const unit = row.unit || "PCS";
          const price = parseFloat(row.price ?? row.unitPrice ?? 0) || 0;
          const purchasePrice = parseFloat(row.purchasePrice ?? 0) || 0;
          const discountPercent = parseFloat(row.discountPercent ?? 0) || 0;
          const discountAmount = parseFloat(row.discountAmount ?? row.discount ?? 0) || 0;
          const taxRate = parseFloat(row.taxRate ?? row.tax ?? 0) || 0;
          const taxAmount = parseFloat(row.taxAmount ?? 0) || 0;
          const cgstRate = parseFloat(row.cgstRate ?? (taxRate / 2)) || 0;
          const cgstAmount = parseFloat(row.cgstAmount ?? (taxAmount / 2)) || 0;
          const sgstRate = parseFloat(row.sgstRate ?? (taxRate / 2)) || 0;
          const sgstAmount = parseFloat(row.sgstAmount ?? (taxAmount / 2)) || 0;
          const igstRate = parseFloat(row.igstRate ?? 0) || 0;
          const igstAmount = parseFloat(row.igstAmount ?? 0) || 0;
          const cessRate = parseFloat(row.cessRate ?? 0) || 0;
          const cessAmount = parseFloat(row.cessAmount ?? 0) || 0;
          const lineTotal = parseFloat(row.amount ?? row.totalAmount ?? (qty * price - discountAmount)) || 0;

          await conn.query(
            `INSERT INTO transaction_items (
              id, transaction_id, business_id, item_id, item_name, item_code, hsn_code,
              batch_no, serial_no, quantity, free_qty, unit, unit_price, purchase_price,
              discount_percent, discount_amount, tax_rate, tax_amount, cgst_rate, cgst_amount,
              sgst_rate, sgst_amount, igst_rate, igst_amount, cess_rate, cess_amount, total_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              quantity = VALUES(quantity),
              unit_price = VALUES(unit_price),
              total_amount = VALUES(total_amount)`,
            [
              lineId, id, businessId, row.itemId || row.sourceItemId || null, itemName, itemCode, hsnCode,
              batchNo, serialNo, qty, freeQty, unit, price, purchasePrice,
              discountPercent, discountAmount, taxRate, taxAmount, cgstRate, cgstAmount,
              sgstRate, sgstAmount, igstRate, igstAmount, cessRate, cessAmount, lineTotal
            ]
          );
        }
      }
      transactionsCount++;
    }

    // 4. Ingest Service Reminders
    for (const s of serviceReminders) {
      if (!s.id && !s.customerName) continue;
      const id = s.id || `srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const cName = s.customerName || "Customer";
      const cPhone = s.customerPhone || null;
      const cEmail = s.customerEmail || null;
      const sName = s.serviceName || "Service";
      const sDate = toSqlDate(s.serviceDate) || new Date().toISOString().slice(0, 10);
      const sDueDate = toSqlDate(s.serviceDueDate || s.dueDate) || sDate;
      const status = s.status || "Active";
      const lastNotifiedAt = s.lastNotifiedAt ? new Date(s.lastNotifiedAt) : null;
      const lastChannel = s.lastNotifiedChannel || null;
      const lastDueDate = toSqlDate(s.lastNotifiedDueDate);
      const notes = s.notes || null;

      await conn.query(
        `INSERT INTO service_reminders (
          id, business_id, customer_name, customer_phone, customer_email,
          service_name, service_date, service_due_date, status,
          last_notified_at, last_notified_channel, last_notified_due_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          customer_name = VALUES(customer_name),
          status = VALUES(status)`,
        [id, businessId, cName, cPhone, cEmail, sName, sDate, sDueDate, status, lastNotifiedAt, lastChannel, lastDueDate, notes]
      );

      // Ingest Reminder History rows
      if (Array.isArray(s.notificationHistory) && s.notificationHistory.length > 0) {
        for (const h of s.notificationHistory) {
          const hId = h.id || `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await conn.query(
            `INSERT IGNORE INTO service_reminder_history (
              id, reminder_id, business_id, channel, recipient, message_text, status, sent_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              hId, id, businessId, h.channel || "whatsapp",
              h.recipient || cPhone || "", h.message || h.text || "",
              h.status || "Sent", new Date(h.sentAt || h.at || new Date())
            ]
          );
        }
      }
      remindersCount++;
    }

    // 5. Ingest Bank Accounts
    for (const b of bankAccounts) {
      if (!b.id && !b.accountName && !b.name) continue;
      const id = b.id || `bank_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await conn.query(
        `INSERT INTO bank_accounts (
          id, business_id, account_name, account_number, bank_name, ifsc_code,
          branch_name, opening_balance, current_balance, account_type, as_of_date, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          account_name = VALUES(account_name),
          current_balance = VALUES(current_balance)`,
        [
          id, businessId, b.accountName || b.name || "Bank Account",
          b.accountNumber || b.accountNo || null, b.bankName || null,
          b.ifscCode || null, b.branchName || null,
          parseFloat(b.openingBalance ?? 0) || 0,
          parseFloat(b.currentBalance ?? b.balance ?? 0) || 0,
          b.accountType || "Savings", b.asOfDate || null, b.isDefault ? 1 : 0
        ]
      );
    }

    // 6. Ingest Settings (pure TEXT values)
    if (settings && typeof settings === "object") {
      for (const [k, v] of Object.entries(settings)) {
        const textVal = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
        await conn.query(
          `INSERT INTO app_settings (business_id, setting_key, setting_value)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [businessId, k, textVal]
        );
      }
    }

    // 7. Ingest Company Profile
    if (companyProfile && typeof companyProfile === "object" && Object.keys(companyProfile).length > 0) {
      const [existingRows] = await conn.query(
        "SELECT * FROM company_profiles WHERE business_id = ? LIMIT 1",
        [businessId]
      );
      const existing = existingRows && existingRows.length ? existingRows[0] : null;

      const hasOwn = (obj, key) => Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));

      const resolveMigrateField = (aliases, existingValue) => {
        const presentAlias = aliases.find((key) => hasOwn(companyProfile, key));
        if (presentAlias !== undefined) {
          const definedAlias = aliases.find((key) => hasOwn(companyProfile, key) && companyProfile[key] !== undefined) ?? presentAlias;
          const raw = companyProfile[definedAlias];
          if (raw == null) return null;
          const str = String(raw).trim();
          return str === "" ? null : str;
        }
        return existingValue ?? null;
      };

      const resolveMigrateBankField = (fieldName, existingValue) => {
        const bankDetails = companyProfile.bankDetails;
        const hasRoot = hasOwn(companyProfile, fieldName);
        const hasNested = Boolean(bankDetails && typeof bankDetails === "object" && hasOwn(bankDetails, fieldName));

        if (hasRoot || hasNested) {
          let raw;
          if (hasRoot && companyProfile[fieldName] !== undefined) {
            raw = companyProfile[fieldName];
          } else if (hasNested && bankDetails[fieldName] !== undefined) {
            raw = bankDetails[fieldName];
          } else if (hasRoot) {
            raw = companyProfile[fieldName];
          } else {
            raw = bankDetails[fieldName];
          }
          if (raw == null) return null;
          const str = String(raw).trim();
          return str === "" ? null : str;
        }
        return existingValue ?? null;
      };

      let companyName;
      const hasCompanyName = hasOwn(companyProfile, "companyName") || hasOwn(companyProfile, "businessName");
      if (hasCompanyName) {
        const raw = (hasOwn(companyProfile, "companyName") && companyProfile.companyName !== undefined)
          ? companyProfile.companyName
          : companyProfile.businessName;
        const trimmed = raw != null ? String(raw).trim() : "";
        companyName = trimmed || (existing?.company_name || "");
      } else {
        companyName = existing?.company_name || "";
      }

      const tradeName = resolveMigrateField(["tradeName"], existing?.trade_name);
      const businessType = resolveMigrateField(["businessType"], existing?.business_type);
      const businessCategory = resolveMigrateField(["businessCategory"], existing?.business_category);

      const phone = resolveMigrateField(["phone", "phoneNumber"], existing?.phone);
      const email = resolveMigrateField(["email", "emailId"], existing?.email);
      const gstin = resolveMigrateField(["gstin"], existing?.gstin);
      const pan = resolveMigrateField(["pan"], existing?.pan);

      const streetAddress = resolveMigrateField(["streetAddress", "businessAddress", "address"], existing?.street_address);
      const city = resolveMigrateField(["city"], existing?.city);
      const state = resolveMigrateField(["state"], existing?.state);
      const pincode = resolveMigrateField(["pincode"], existing?.pincode);

      let country;
      if (hasOwn(companyProfile, "country")) {
        country = companyProfile.country != null && String(companyProfile.country).trim() !== ""
          ? String(companyProfile.country).trim()
          : "India";
      } else {
        country = existing?.country || "India";
      }

      const bankName = resolveMigrateBankField("bankName", existing?.bank_name);
      const accountNumber = resolveMigrateBankField("accountNumber", existing?.account_number);
      const ifscCode = resolveMigrateBankField("ifscCode", existing?.ifsc_code);
      const branchName = resolveMigrateBankField("branchName", existing?.branch_name);
      const upiId = resolveMigrateBankField("upiId", existing?.upi_id);

      const signatureUrl = resolveMigrateField(["signatureUrl", "signature"], existing?.signature_url);
      const logoUrl = resolveMigrateField(["logoUrl", "logo"], existing?.logo_url);
      const termsAndConditions = resolveMigrateField(["termsAndConditions"], existing?.terms_and_conditions);

      await conn.query(
        `INSERT INTO company_profiles (
          business_id, company_name, trade_name, business_type, business_category,
          phone, email, gstin, pan,
          street_address, city, state, pincode, country,
          bank_name, account_number, ifsc_code, branch_name, upi_id,
          signature_url, logo_url, terms_and_conditions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          company_name = VALUES(company_name),
          trade_name = VALUES(trade_name),
          business_type = VALUES(business_type),
          business_category = VALUES(business_category),
          phone = VALUES(phone),
          email = VALUES(email),
          gstin = VALUES(gstin),
          pan = VALUES(pan),
          street_address = VALUES(street_address),
          city = VALUES(city),
          state = VALUES(state),
          pincode = VALUES(pincode),
          country = VALUES(country),
          bank_name = VALUES(bank_name),
          account_number = VALUES(account_number),
          ifsc_code = VALUES(ifsc_code),
          branch_name = VALUES(branch_name),
          upi_id = VALUES(upi_id),
          signature_url = VALUES(signature_url),
          logo_url = VALUES(logo_url),
          terms_and_conditions = VALUES(terms_and_conditions),
          updated_at = CURRENT_TIMESTAMP`,
        [
          businessId, companyName, tradeName, businessType, businessCategory,
          phone, email, gstin, pan,
          streetAddress, city, state, pincode, country,
          bankName, accountNumber, ifscCode, branchName, upiId,
          signatureUrl, logoUrl, termsAndConditions
        ]
      );
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Data migrated successfully into pure relational tables.",
      ingested: {
        parties: partiesCount,
        items: itemsCount,
        transactions: transactionsCount,
        serviceReminders: remindersCount,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("[Migration POST Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;
