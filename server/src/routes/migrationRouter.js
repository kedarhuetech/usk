/**
 * Migration API Router
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * Ingests existing browser localStorage data into MySQL with:
 * - Atomic Transaction safety
 * - Normalization of nested line items into transaction_items child table
 * - Normalization of item batches into item_batches child table
 * - Normalization of reminder logs into service_reminder_history child table
 * - Pure relational rows and columns across all entities
 */

import { Router } from "express";
import { pool, businessIdFromRequest } from "../db/mysql.js";

const router = Router();

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
          current_stock = VALUES(current_stock)`,
        [
          id, businessId, name, code, barcode, cat, hsn, unit,
          itemType, sale, purchase, tax, cess,
          openStock, stock, minStock, isBatch,
          isSerial, desc
        ]
      );

      // Ingest Batches into item_batches (pure rows)
      if (Array.isArray(item.batches) && item.batches.length > 0) {
        await conn.query(`DELETE FROM item_batches WHERE business_id = ? AND item_id = ?`, [businessId, id]);
        for (const b of item.batches) {
          const bNo = String(b.batchNo || b.batch_no || "").trim();
          if (!bNo) continue;
          const bId = b.id || `batch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await conn.query(
            `INSERT INTO item_batches (
              id, item_id, business_id, batch_no, mfg_date, exp_date,
              opening_qty, current_qty, sale_price, purchase_price, mrp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              bId, id, businessId, bNo, b.mfgDate || null, b.expDate || null,
              parseFloat(b.openingQty ?? b.quantity ?? 0) || 0,
              parseFloat(b.currentQty ?? b.openingQty ?? 0) || 0,
              parseFloat(b.salePrice ?? sale) || 0,
              parseFloat(b.purchasePrice ?? purchase) || 0,
              parseFloat(b.mrp ?? 0) || 0
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
      const date = txn.transactionDate || txn.invoiceDate || txn.billDate || txn.date || new Date().toISOString().slice(0, 10);
      const dueDate = txn.dueDate || null;
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
      const poDate = txn.poDate || null;
      const notes = txn.notes || null;
      const terms = txn.terms || null;

      await conn.query(
        `INSERT INTO transactions (
          id, business_id, transaction_type, document_number, transaction_date, due_date,
          party_id, party_name, party_phone, party_gstin, billing_address, shipping_address,
          subtotal, discount_percent, discount_amount, tax_amount, round_off, total_amount,
          paid_amount, balance_amount, payment_mode, payment_status, payment_ref_no,
          cash_tendered, change_returned, vehicle_no, e_way_bill_no, po_number, po_date,
          notes, terms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_amount = VALUES(total_amount),
          balance_amount = VALUES(balance_amount),
          payment_status = VALUES(payment_status)`,
        [
          id, businessId, type, docNo, date, dueDate,
          pId, pName, pPhone, pGstin, bAddr, sAddr,
          subtotal, discountPercent, discount, tax, roundOff, total,
          paid, bal, mode, status, refNo,
          cashTendered, changeReturned, vehicleNo, eWayBillNo, poNumber, poDate,
          notes, terms
        ]
      );

      // Ingest Line Items into transaction_items (pure rows)
      const rawItems = Array.isArray(txn.items) ? txn.items : (Array.isArray(txn.rows) ? txn.rows : []);
      if (rawItems.length > 0) {
        await conn.query(`DELETE FROM transaction_items WHERE business_id = ? AND transaction_id = ?`, [businessId, id]);
        for (const it of rawItems) {
          const lId = it.id || `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await conn.query(
            `INSERT INTO transaction_items (
              id, transaction_id, business_id, item_id, item_name, item_code, hsn_code,
              batch_no, serial_no, quantity, free_qty, unit, unit_price, purchase_price,
              discount_percent, discount_amount, tax_rate, tax_amount, cgst_rate, cgst_amount,
              sgst_rate, sgst_amount, igst_rate, igst_amount, cess_rate, cess_amount, total_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              lId, id, businessId, it.itemId || null, it.name || it.itemName || "Item",
              it.itemCode || null, it.hsnCode || null, it.batchNo || null, it.serialNo || null,
              parseFloat(it.qty ?? it.quantity ?? 1) || 1,
              parseFloat(it.freeQty ?? 0) || 0,
              it.unit || "PCS",
              parseFloat(it.price ?? it.unitPrice ?? 0) || 0,
              parseFloat(it.purchasePrice ?? 0) || 0,
              parseFloat(it.discountPercent ?? 0) || 0,
              parseFloat(it.discountAmount ?? 0) || 0,
              parseFloat(it.taxRate ?? 0) || 0,
              parseFloat(it.taxAmount ?? 0) || 0,
              parseFloat(it.cgstRate ?? 0) || 0,
              parseFloat(it.cgstAmount ?? 0) || 0,
              parseFloat(it.sgstRate ?? 0) || 0,
              parseFloat(it.sgstAmount ?? 0) || 0,
              parseFloat(it.igstRate ?? 0) || 0,
              parseFloat(it.igstAmount ?? 0) || 0,
              parseFloat(it.cessRate ?? 0) || 0,
              parseFloat(it.cessAmount ?? 0) || 0,
              parseFloat(it.amount ?? it.totalAmount ?? 0) || 0
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
      const sDate = s.serviceDate || new Date().toISOString().slice(0, 10);
      const sDueDate = s.serviceDueDate || s.dueDate || sDate;
      const status = s.status || "Active";
      const lastNotifiedAt = s.lastNotifiedAt ? new Date(s.lastNotifiedAt) : null;
      const lastChannel = s.lastNotifiedChannel || null;
      const lastDueDate = s.lastNotifiedDueDate || null;
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
    if (companyProfile && typeof companyProfile === "object") {
      const bDetails = companyProfile.bankDetails || {};
      await conn.query(
        `INSERT INTO company_profiles (
          business_id, company_name, trade_name, phone, email, gstin, pan,
          street_address, city, state, pincode, country,
          bank_name, account_number, ifsc_code, branch_name, upi_id,
          signature_url, logo_url, terms_and_conditions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          company_name = VALUES(company_name),
          phone = VALUES(phone)`,
        [
          businessId,
          companyProfile.companyName || companyProfile.businessName || "Sai Kirana Stores",
          companyProfile.tradeName || null,
          companyProfile.phone || null,
          companyProfile.email || null,
          companyProfile.gstin || null,
          companyProfile.pan || null,
          companyProfile.streetAddress || companyProfile.address || null,
          companyProfile.city || null,
          companyProfile.state || null,
          companyProfile.pincode || null,
          companyProfile.country || "India",
          companyProfile.bankName || bDetails.bankName || null,
          companyProfile.accountNumber || bDetails.accountNumber || null,
          companyProfile.ifscCode || bDetails.ifscCode || null,
          companyProfile.branchName || bDetails.branchName || null,
          companyProfile.upiId || bDetails.upiId || null,
          companyProfile.signatureUrl || null,
          companyProfile.logoUrl || null,
          companyProfile.termsAndConditions || null
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
