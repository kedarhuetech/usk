/**
 * Transactions API Router (Sales, Purchases, Payments, Expenses, Returns, Orders, POS)
 * 
 * Strict Relational Architecture (ZERO JSON Data Types):
 * - Header: Stored in transactions table with pure SQL columns (DECIMAL, VARCHAR, DATE, TEXT).
 * - Line Items: Normalized into transaction_items child table with pure rows and columns.
 * - Atomic Multi-Table Consistency: ACID transactions (beginTransaction/commit/rollback)
 *   ensuring stock updates, party balance adjustments, and invoice lines commit or abort together.
 * - Lazy Loading: Indexed pagination (transaction_date DESC) with sub-millisecond execution.
 */

import { Router } from "express";
import multer from "multer";
import { pool, businessIdFromRequest, toSqlDate } from "../db/mysql.js";
import { storageService } from "../services/storage/storageService.js";
import { getFileMetadataById, deleteFileMetadata } from "../db/businessFilesRepository.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
      "application/pdf",
      "text/plain",
      "application/json",
      "application/zip",
      "application/octet-stream",
    ];
    if (allowed.includes(file.mimetype)) {
      done(null, true);
    } else {
      done(new Error("Unsupported file type for transaction attachment."));
    }
  },
});

/**
 * Safely persists a Base64 data URL into filesystem storage and returns the fileId and fileUrl.
 */
async function persistBase64Attachment(val, originalFilename, businessId, transactionId) {
  if (!val || typeof val !== "string" || !val.startsWith("data:")) {
    return null;
  }
  try {
    const matches = val.match(/^data:([A-Za-z-+/0-9.]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return null;
    const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
    const filename = originalFilename || `attachment-${transactionId || Date.now()}-${Date.now()}.${ext}`;

    const fileResult = await storageService.saveFileAndMetadata({
      businessId,
      category: "invoice-attachments",
      fileBuffer: buffer,
      originalFilename: filename,
      mimeType,
    });

    return {
      fileId: fileResult.id,
      fileUrl: `/api/transactions/attachments/${fileResult.id}`,
      originalFilename: filename,
    };
  } catch (err) {
    console.error("Failed to persist Base64 transaction attachment:", err.message);
    return null;
  }
}

/**
 * POST /api/transactions/attachments
 * Uploads a transaction attachment directly to private filesystem storage with metadata in business_files.
 */
router.post(
  "/attachments",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, message: "Attachment must be 10 MB or smaller." });
        }
        return res.status(400).json({ success: false, message: err.message || "File upload error." });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const businessId = businessIdFromRequest(req);
      if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ success: false, message: "An attachment file is required and cannot be empty." });
      }
      const originalFilename = (req.file.originalname || "").slice(0, 255) || "attachment";
      const mimeType = req.file.mimetype || "application/octet-stream";
      const sizeBytes = req.file.size;
      const fileBuffer = req.file.buffer;

      const fileResult = await storageService.saveFileAndMetadata({
        businessId,
        category: "invoice-attachments",
        fileBuffer,
        originalFilename,
        mimeType,
      });

      return res.status(201).json({
        success: true,
        data: {
          id: fileResult.id,
          fileId: fileResult.id,
          url: `/api/transactions/attachments/${fileResult.id}`,
          imageUrl: `/api/transactions/attachments/${fileResult.id}`,
          documentUrl: `/api/transactions/attachments/${fileResult.id}`,
          name: originalFilename,
          fileName: originalFilename,
          mimeType: fileResult.mimeType || mimeType,
          size: fileResult.sizeBytes || sizeBytes,
        },
      });
    } catch (error) {
      const status = error.status || (error.message && (error.message.includes("empty") || error.message.includes("limit") || error.message.includes("Invalid") || error.message.includes("Forbidden")) ? 400 : 500);
      return res.status(status).json({
        success: false,
        message: error.message || "Failed to upload transaction attachment.",
      });
    }
  }
);

/**
 * GET /api/transactions/attachments/:id
 * Streams transaction attachment binary from private filesystem storage.
 */
router.get("/attachments/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    if (!businessId) {
      return res.status(401).json({ success: false, message: "Unauthorized access: business ID required." });
    }

    const file = await getFileMetadataById(req.params.id, businessId);

    if (!file || file.business_id !== businessId) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }

    const exists = await storageService.fileExists(file.storage_key);
    if (!exists) {
      return res.status(404).json({ success: false, message: "Physical attachment file not found." });
    }

    res.type(file.mime_type || "application/octet-stream");
    if (file.size_bytes) {
      res.set("Content-Length", String(file.size_bytes));
    }
    res.set("Cache-Control", "private, max-age=86400");
    if (req.query.download === "true" || req.query.download === true) {
      res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(file.original_filename || "attachment")}"`);
    }
    const stream = storageService.createReadStream(file.storage_key);
    return stream.pipe(res);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to load attachment." });
  }
});

/**
 * DELETE /api/transactions/attachments/:id
 * Deletes a transaction attachment if not referenced by other transactions.
 */
router.delete("/attachments/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const fileId = req.params.id;

    const file = await getFileMetadataById(fileId, businessId);
    if (!file) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }

    // Check if any transaction in transactions is currently using this attachment
    const [referencingTxns] = await pool.query(
      `SELECT COUNT(*) AS count FROM transactions WHERE business_id = ? AND (image_id = ? OR document_id = ?)`,
      [businessId, fileId, fileId]
    );
    const refCount = referencingTxns[0]?.count || 0;
    if (refCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete attachment because it is referenced by ${refCount} transaction(s).`,
      });
    }

    await storageService.deleteFile(file.storage_key, businessId).catch((err) => {
      console.warn(`[TransactionsRouter] Failed to delete physical file ${file.storage_key}:`, err.message);
    });
    await deleteFileMetadata(fileId, businessId);

    return res.json({ success: true, message: "Attachment deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to delete attachment." });
  }
});

function formatSqlDate(val) {
  return toSqlDate(val);
}

/**
 * Calculates signed party balance impact for a transaction.
 * Positive = party current_balance increases
 * Negative = party current_balance decreases
 */
function getPartyBalanceImpact(type, balAmt, pdAmt) {
  const normType = String(type || "").toLowerCase();
  if (normType === "sale" || normType === "pos") {
    return Number(balAmt) || 0;
  }
  if (normType === "payment_in") {
    return -(Number(pdAmt) || 0);
  }
  if (normType === "purchase") {
    return -(Number(balAmt) || 0);
  }
  if (normType === "payment_out") {
    return Number(pdAmt) || 0;
  }
  if (normType === "sale_return" || normType === "credit note" || normType === "credit_note") {
    return -(Number(balAmt) || 0);
  }
  if (normType === "purchase_return" || normType === "debit note" || normType === "debit_note") {
    return Number(balAmt) || 0;
  }
  return 0;
}

/**
 * GET /api/transactions
 * Retrieves paginated list of transactions with normalized line items.
 */
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitParam = req.query.limit;
    const isAll = limitParam === "all" || req.query.all === "true" || limitParam === "0";
    const limit = isAll
      ? 5000
      : Math.min(1000, Math.max(1, parseInt(limitParam, 10) || 50));
    const offset = isAll ? 0 : (page - 1) * limit;
    const type = (req.query.type || "").trim().toLowerCase();
    const partyId = (req.query.partyId || "").trim();
    const search = (req.query.search || "").trim();
    const startDate = (req.query.startDate || "").trim();
    const endDate = (req.query.endDate || "").trim();

    const conditions = ["t.business_id = ?"];
    const params = [businessId];

    if (type && type !== "all") {
      if (type === "sale") {
        conditions.push("(t.transaction_type = 'sale' OR t.transaction_type = 'pos')");
      } else if (type === "credit_note" || type === "sale_return") {
        conditions.push("(t.transaction_type = 'credit_note' OR t.transaction_type = 'sale_return')");
      } else if (type === "debit_note" || type === "purchase_return") {
        conditions.push("(t.transaction_type = 'debit_note' OR t.transaction_type = 'purchase_return')");
      } else {
        conditions.push("t.transaction_type = ?");
        params.push(type);
      }
    }

    if (partyId) {
      conditions.push("t.party_id = ?");
      params.push(partyId);
    }

    if (search) {
      conditions.push("(t.document_number LIKE ? OR t.party_name LIKE ? OR p.party_name LIKE ? OR t.party_phone LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (startDate) {
      const match = startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        conditions.push("t.transaction_date >= ?");
        params.push(startDate);
      }
    }

    if (endDate) {
      const match = endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        conditions.push("t.transaction_date <= ?");
        params.push(endDate);
      }
    }

    const whereClause = conditions.join(" AND ");

    // Query 1: Total count for lazy loading
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM transactions t LEFT JOIN parties p ON t.party_id = p.id WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Query 2: Fetch transaction headers with resolved party fields
    let querySql = `SELECT t.id, t.business_id, t.transaction_type, t.document_number, t.transaction_date, t.due_date,
              t.party_id,
              COALESCE(NULLIF(TRIM(t.party_name), ''), p.party_name, IF(t.payment_mode = 'Cash' OR t.transaction_type = 'pos', 'Cash Sale', '')) AS party_name,
              COALESCE(NULLIF(TRIM(t.party_phone), ''), p.phone, '') AS party_phone,
              COALESCE(NULLIF(TRIM(t.party_gstin), ''), p.gstin, '') AS party_gstin,
              COALESCE(NULLIF(TRIM(t.billing_address), ''), p.billing_address, '') AS billing_address,
              COALESCE(NULLIF(TRIM(t.shipping_address), ''), p.shipping_address, '') AS shipping_address,
              t.subtotal, t.discount_percent, t.discount_amount, t.tax_amount, t.round_off, t.total_amount,
              t.paid_amount, t.balance_amount, t.payment_mode, t.payment_status, t.payment_ref_no,
              t.cash_tendered, t.change_returned, t.vehicle_no, t.e_way_bill_no, t.po_number, t.po_date,
              t.notes, t.terms, t.terms_title, t.driver_name, t.state_of_supply, t.reverse_charge, t.payment_terms,
              t.shipping_charges, t.packaging_charges, t.other_charges,
              t.image_id, t.image_url, t.image_name, t.document_id, t.document_url, t.document_name,
              t.created_at, t.updated_at
       FROM transactions t
       LEFT JOIN parties p ON t.party_id = p.id
       WHERE ${whereClause}
       ORDER BY t.transaction_date DESC, t.created_at DESC`;
    let queryParams = [...params];

    if (!isAll) {
      querySql += " LIMIT ? OFFSET ?";
      queryParams.push(limit, offset);
    }

    const [rows] = await pool.query(querySql, queryParams);

    // Query 3: Fetch normalized line items from transaction_items child table
    const txnIds = rows.map((r) => r.id);
    let itemsMap = new Map();
    if (txnIds.length > 0) {
      for (let i = 0; i < txnIds.length; i += 500) {
        const chunk = txnIds.slice(i, i + 500);
        const placeholders = chunk.map(() => "?").join(",");
        const [itemRows] = await pool.query(
          `SELECT id, transaction_id, item_id, item_name, item_code, barcode, hsn_code,
                  batch_no, serial_no, quantity, free_qty, unit, unit_price,
                  purchase_price, discount_percent, discount_amount, tax_rate,
                  tax_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
                  igst_rate, igst_amount, cess_rate, cess_amount, total_amount, is_active
           FROM transaction_items
           WHERE business_id = ? AND transaction_id IN (${placeholders})
           ORDER BY id ASC`,
          [businessId, ...chunk]
        );

        for (const item of itemRows) {
          if (!itemsMap.has(item.transaction_id)) {
            itemsMap.set(item.transaction_id, []);
          }
          itemsMap.get(item.transaction_id).push({
            id: item.id,
            itemId: item.item_id,
            sourceItemId: item.item_id,
            item: item.item_name,
            name: item.item_name,
            itemName: item.item_name,
            itemCode: item.item_code || "",
            barcode: item.barcode || item.item_code || "",
            size: item.item_code || "",
            hsn: item.hsn_code || "",
            hsnCode: item.hsn_code || "",
            batchNo: item.batch_no || "",
            serialNo: item.serial_no || "",
            description: item.serial_no || "",
            qty: parseFloat(item.quantity) || 0,
            quantity: parseFloat(item.quantity) || 0,
            freeQty: parseFloat(item.free_qty) || 0,
            unit: item.unit || "PCS",
            price: parseFloat(item.unit_price) || 0,
            unitPrice: parseFloat(item.unit_price) || 0,
            purchasePrice: parseFloat(item.purchase_price) || 0,
            discountPercent: parseFloat(item.discount_percent) || 0,
            discountAmount: parseFloat(item.discount_amount) || 0,
            taxRate: parseFloat(item.tax_rate) || 0,
            taxAmount: parseFloat(item.tax_amount) || 0,
            cgstAmount: parseFloat(item.cgst_amount) || 0,
            sgstAmount: parseFloat(item.sgst_amount) || 0,
            igstAmount: parseFloat(item.igst_amount) || 0,
            cessAmount: parseFloat(item.cess_amount) || 0,
            amount: parseFloat(item.total_amount) || 0,
            totalAmount: parseFloat(item.total_amount) || 0,
            isActive: item.is_active !== 0,
            is_active: item.is_active,
          });
        }
      }
    }

    const transactions = rows.map((row) => {
      const txnDate = formatSqlDate(row.transaction_date);
      const dueDate = formatSqlDate(row.due_date);
      const items = itemsMap.get(row.id) || [];
      const itemsTotal = items.reduce((s, it) => s + (parseFloat(it.totalAmount || it.amount) || 0), 0);
      const rawTotal = parseFloat(row.total_amount) || 0;
      const effectiveTotal = rawTotal > 0 ? rawTotal : itemsTotal;
      const party = row.party_name || (row.payment_mode === "Cash" || row.transaction_type === "pos" ? "Cash Sale" : "");
      const payments = items.length > 0
        ? items.map((it) => ({
            id: it.id,
            type: it.itemName || it.item || "Cash",
            amount: String(it.totalAmount || it.amount || 0),
            reference: it.itemCode || it.reference || "",
            chequeDate: it.serialNo || it.chequeDate || "",
          }))
        : [
            {
              id: `pay-${row.id}`,
              type: row.payment_mode || "Cash",
              amount: String(row.paid_amount || effectiveTotal),
              reference: row.payment_ref_no || "",
              chequeDate: "",
            },
          ];

      return {
        id: row.id,
        transactionType: row.transaction_type,
        type: row.transaction_type,
        documentNumber: row.document_number,
        number: row.document_number,
        invoiceNumber: row.document_number,
        billNumber: row.document_number,
        orderNumber: row.document_number,
        transactionDate: toSqlDate(row.transaction_date),
        invoiceDate: toSqlDate(row.transaction_date),
        billDate: toSqlDate(row.transaction_date),
        dueDate: toSqlDate(row.due_date),
        partyId: row.party_id,
        partyName: party,
        party: party,
        customer: party,
        customerName: party,
        supplierName: party,
        supplier: party,
        partyPhone: row.party_phone || "",
        phone: row.party_phone || "",
        partyGstin: row.party_gstin || "",
        billingAddress: row.billing_address || "",
        shippingAddress: row.shipping_address || "",
        subtotal: parseFloat(row.subtotal) || effectiveTotal,
        discountPercent: parseFloat(row.discount_percent) || 0,
        discountAmount: parseFloat(row.discount_amount) || 0,
        taxAmount: parseFloat(row.tax_amount) || 0,
        roundOff: parseFloat(row.round_off) || 0,
        roundOffValue: String(row.round_off ?? ""),
        totalAmount: effectiveTotal,
        total: effectiveTotal,
        amount: effectiveTotal,
        paidAmount: parseFloat(row.paid_amount) || 0,
        receivedAmount: parseFloat(row.paid_amount) || 0,
        received: parseFloat(row.paid_amount) || 0,
        balanceAmount: parseFloat(row.balance_amount) || 0,
        balance: parseFloat(row.balance_amount) || 0,
        paymentMode: row.payment_mode || "Cash",
        paymentType: row.payment_mode || "Cash",
        status: row.payment_status || "Completed",
        paymentRefNo: row.payment_ref_no || "",
        cashTendered: parseFloat(row.cash_tendered) || 0,
        changeReturned: parseFloat(row.change_returned) || 0,
        vehicleNo: row.vehicle_no || "",
        vehicleNumber: row.vehicle_no || "",
        driverName: row.driver_name || "",
        eWayBillNo: row.e_way_bill_no || "",
        ewayBillNo: row.e_way_bill_no || "",
        poNumber: row.po_number || "",
        linkedInvoiceId: row.po_number || "",
        poDate: toSqlDate(row.po_date),
        notes: row.notes || "",
        description: row.notes || "",
        terms: row.terms || "",
        termsTitle: row.terms_title || "",
        stateOfSupply: row.state_of_supply || "None",
        reverseCharge: Boolean(row.reverse_charge),
        paymentTerms: row.payment_terms || "Due on Receipt",
        shippingCharges: parseFloat(row.shipping_charges) || 0,
        packagingCharges: parseFloat(row.packaging_charges) || 0,
        otherCharges: parseFloat(row.other_charges) || 0,
        additionalCharges: {
          shipping: parseFloat(row.shipping_charges) || 0,
          packaging: parseFloat(row.packaging_charges) || 0,
          other: parseFloat(row.other_charges) || 0,
        },
        image: row.image_url || "",
        document: row.document_url || "",
        payments,
        items,
        rows: items.map((it) => ({
          ...it,
          item: it.itemName,
          name: it.itemName,
          sourceItemId: it.itemId,
        })),
        form: {
          customer: party,
          partyName: party,
          partyId: row.party_id,
          phone: row.party_phone || "",
          invoiceNumber: row.document_number,
          invoiceDate: txnDate,
          dueDate: dueDate,
          billingAddress: row.billing_address || "",
          shippingAddress: row.shipping_address || "",
          paymentType: row.payment_mode || "Cash",
          paymentTerms: row.payment_terms || "Due on Receipt",
          notes: row.notes || "",
          description: row.notes || "",
          showDescription: Boolean(row.notes),
          terms: row.terms || "",
          termsTitle: row.terms_title || "",
          showTerms: Boolean(row.terms),
          poNumber: row.po_number || "",
          poDate: toSqlDate(row.po_date) || "",
          vehicleNumber: row.vehicle_no || "",
          driverName: row.driver_name || "",
          ewayBillNo: row.e_way_bill_no || "",
          stateOfSupply: row.state_of_supply || "None",
          reverseCharge: Boolean(row.reverse_charge),
        },
        totals: {
          subtotal: parseFloat(row.subtotal) || effectiveTotal,
          discount: parseFloat(row.discount_amount) || 0,
          tax: parseFloat(row.tax_amount) || 0,
          roundOffAmount: parseFloat(row.round_off) || 0,
          finalTotal: effectiveTotal,
          received: parseFloat(row.paid_amount) || 0,
          balance: parseFloat(row.balance_amount) || 0,
        },
        customerPhone: row.party_phone || "",
        imageId: row.image_id || null,
        imageUrl: row.image_id ? `/api/transactions/attachments/${row.image_id}` : (row.image_url || null),
        imageName: row.image_name || "",
        documentId: row.document_id || null,
        documentUrl: row.document_id ? `/api/transactions/attachments/${row.document_id}` : (row.document_url || null),
        documentName: row.document_name || "",
        files: {
          image: row.image_id ? `/api/transactions/attachments/${row.image_id}` : (row.image_url || null),
          imageId: row.image_id || null,
          imageName: row.image_name || "",
          document: row.document_id ? `/api/transactions/attachments/${row.document_id}` : (row.document_url || null),
          documentId: row.document_id || null,
          documentName: row.document_name || "",
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return res.json({
      success: true,
      data: transactions,
      pagination: {
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        total,
        totalPages: isAll ? 1 : (Math.ceil(total / limit) || 1),
        hasMore: isAll ? false : (offset + rows.length < total),
      },
    });
  } catch (err) {
    console.error("[Transactions GET Error]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to fetch transactions." });
  }
});

/**
 * GET /api/transactions/stats
 * Aggregates summary statistics by transaction type
 */
router.get("/stats", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const [stats] = await pool.query(
      `SELECT transaction_type,
              COUNT(*) AS count,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              COALESCE(SUM(paid_amount), 0) AS paid_amount,
              COALESCE(SUM(balance_amount), 0) AS balance_amount
       FROM transactions
       WHERE business_id = ?
       GROUP BY transaction_type`,
      [businessId]
    );

    return res.json({ success: true, data: stats });
  } catch (err) {
    console.error("[Transactions Stats Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/transactions/:id
 * Fetches single transaction with its normalized transaction_items rows
 */
router.get("/:id", async (req, res) => {
  try {
    const businessId = businessIdFromRequest(req);
    const txnId = req.params.id;

    const [rows] = await pool.query(
      `SELECT t.*,
              COALESCE(NULLIF(TRIM(t.party_name), ''), p.party_name, IF(t.payment_mode = 'Cash' OR t.transaction_type = 'pos', 'Cash Sale', '')) AS resolved_party_name,
              COALESCE(NULLIF(TRIM(t.party_phone), ''), p.phone, '') AS resolved_party_phone,
              COALESCE(NULLIF(TRIM(t.party_gstin), ''), p.gstin, '') AS resolved_party_gstin,
              COALESCE(NULLIF(TRIM(t.billing_address), ''), p.billing_address, '') AS resolved_billing_address,
              COALESCE(NULLIF(TRIM(t.shipping_address), ''), p.shipping_address, '') AS resolved_shipping_address
       FROM transactions t
       LEFT JOIN parties p ON t.party_id = p.id
       WHERE t.business_id = ? AND t.id = ?
       LIMIT 1`,
      [businessId, txnId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Transaction not found." });
    }

    const row = rows[0];

    // Fetch line items from normalized transaction_items table
    const [itemRows] = await pool.query(
      `SELECT * FROM transaction_items WHERE business_id = ? AND transaction_id = ? ORDER BY id ASC`,
      [businessId, txnId]
    );

    const items = itemRows.map((item) => ({
      id: item.id,
      itemId: item.item_id,
      sourceItemId: item.item_id,
      item: item.item_name,
      name: item.item_name,
      itemName: item.item_name,
      itemCode: item.item_code || "",
      barcode: item.barcode || item.item_code || "",
      size: item.item_code || "",
      hsn: item.hsn_code || "",
      hsnCode: item.hsn_code || "",
      batchNo: item.batch_no || "",
      serialNo: item.serial_no || "",
      description: item.serial_no || "",
      qty: parseFloat(item.quantity) || 0,
      quantity: parseFloat(item.quantity) || 0,
      freeQty: parseFloat(item.free_qty) || 0,
      unit: item.unit || "PCS",
      price: parseFloat(item.unit_price) || 0,
      unitPrice: parseFloat(item.unit_price) || 0,
      purchasePrice: parseFloat(item.purchase_price) || 0,
      discountPercent: parseFloat(item.discount_percent) || 0,
      discountAmount: parseFloat(item.discount_amount) || 0,
      taxRate: parseFloat(item.tax_rate) || 0,
      taxAmount: parseFloat(item.tax_amount) || 0,
      cgstAmount: parseFloat(item.cgst_amount) || 0,
      sgstAmount: parseFloat(item.sgst_amount) || 0,
      igstAmount: parseFloat(item.igst_amount) || 0,
      cessAmount: parseFloat(item.cess_amount) || 0,
      amount: parseFloat(item.total_amount) || 0,
      totalAmount: parseFloat(item.total_amount) || 0,
      isActive: item.is_active !== 0,
      is_active: item.is_active,
    }));

    const txnDate = formatSqlDate(row.transaction_date);
    const dueDate = formatSqlDate(row.due_date);
    const itemsTotal = items.reduce((s, it) => s + (parseFloat(it.totalAmount || it.amount) || 0), 0);
    const rawTotal = parseFloat(row.total_amount) || 0;
    const effectiveTotal = rawTotal > 0 ? rawTotal : itemsTotal;
    const party = row.resolved_party_name || row.party_name || (row.payment_mode === "Cash" || row.transaction_type === "pos" ? "Cash Sale" : "");
    const phone = row.resolved_party_phone || row.party_phone || "";
    const billingAddress = row.resolved_billing_address || row.billing_address || "";
    const shippingAddress = row.resolved_shipping_address || row.shipping_address || billingAddress || "";

    const payments = items.length > 0
      ? items.map((it) => ({
          id: it.id,
          type: it.itemName || it.item || "Cash",
          amount: String(it.totalAmount || it.amount || 0),
          reference: it.itemCode || it.reference || "",
          chequeDate: it.serialNo || it.chequeDate || "",
        }))
      : [
          {
            id: `pay-${row.id}`,
            type: row.payment_mode || "Cash",
            amount: String(row.paid_amount || effectiveTotal),
            reference: row.payment_ref_no || "",
            chequeDate: "",
          },
        ];

    return res.json({
      success: true,
      data: {
        id: row.id,
        transactionType: row.transaction_type,
        type: row.transaction_type,
        documentNumber: row.document_number,
        number: row.document_number,
        invoiceNumber: row.document_number,
        transactionDate: toSqlDate(row.transaction_date),
        dueDate: toSqlDate(row.due_date),
        partyId: row.party_id,
        partyName: party,
        party,
        customer: party,
        customerName: party,
        supplierName: party,
        supplier: party,
        partyPhone: phone,
        phone,
        partyGstin: row.resolved_party_gstin || row.party_gstin || "",
        billingAddress,
        shippingAddress,
        subtotal: parseFloat(row.subtotal) || effectiveTotal,
        discountPercent: parseFloat(row.discount_percent) || 0,
        discountAmount: parseFloat(row.discount_amount) || 0,
        taxAmount: parseFloat(row.tax_amount) || 0,
        roundOff: parseFloat(row.round_off) || 0,
        roundOffValue: String(row.round_off ?? ""),
        totalAmount: effectiveTotal,
        paidAmount: parseFloat(row.paid_amount) || 0,
        receivedAmount: parseFloat(row.paid_amount) || 0,
        received: parseFloat(row.paid_amount) || 0,
        balanceAmount: parseFloat(row.balance_amount) || 0,
        paymentMode: row.payment_mode || "Cash",
        paymentType: row.payment_mode || "Cash",
        status: row.payment_status || "Completed",
        paymentRefNo: row.payment_ref_no || "",
        cashTendered: parseFloat(row.cash_tendered) || 0,
        changeReturned: parseFloat(row.change_returned) || 0,
        vehicleNo: row.vehicle_no || "",
        vehicleNumber: row.vehicle_no || "",
        driverName: row.driver_name || "",
        eWayBillNo: row.e_way_bill_no || "",
        ewayBillNo: row.e_way_bill_no || "",
        poNumber: row.po_number || "",
        linkedInvoiceId: row.po_number || "",
        poDate: toSqlDate(row.po_date),
        notes: row.notes || "",
        description: row.notes || "",
        terms: row.terms || "",
        termsTitle: row.terms_title || "",
        stateOfSupply: row.state_of_supply || "None",
        reverseCharge: Boolean(row.reverse_charge),
        paymentTerms: row.payment_terms || "Due on Receipt",
        shippingCharges: parseFloat(row.shipping_charges) || 0,
        packagingCharges: parseFloat(row.packaging_charges) || 0,
        otherCharges: parseFloat(row.other_charges) || 0,
        additionalCharges: {
          shipping: parseFloat(row.shipping_charges) || 0,
          packaging: parseFloat(row.packaging_charges) || 0,
          other: parseFloat(row.other_charges) || 0,
        },
        image: row.image_url || "",
        document: row.document_url || "",
        payments,
        items,
        rows: items.map((it) => ({
          ...it,
          item: it.itemName,
          name: it.itemName,
          sourceItemId: it.itemId,
        })),
        form: {
          customer: party,
          partyName: party,
          partyId: row.party_id,
          phone,
          invoiceNumber: row.document_number,
          invoiceDate: txnDate,
          dueDate: dueDate,
          billingAddress,
          shippingAddress,
          paymentType: row.payment_mode || "Cash",
          paymentTerms: row.payment_terms || "Due on Receipt",
          notes: row.notes || "",
          description: row.notes || "",
          showDescription: Boolean(row.notes),
          terms: row.terms || "",
          termsTitle: row.terms_title || "",
          showTerms: Boolean(row.terms),
          poNumber: row.po_number || "",
          poDate: toSqlDate(row.po_date) || "",
          vehicleNumber: row.vehicle_no || "",
          driverName: row.driver_name || "",
          ewayBillNo: row.e_way_bill_no || "",
          stateOfSupply: row.state_of_supply || "None",
          reverseCharge: Boolean(row.reverse_charge),
        },
        totals: {
          subtotal: parseFloat(row.subtotal) || effectiveTotal,
          discount: parseFloat(row.discount_amount) || 0,
          tax: parseFloat(row.tax_amount) || 0,
          roundOffAmount: parseFloat(row.round_off) || 0,
          finalTotal: effectiveTotal,
          received: parseFloat(row.paid_amount) || 0,
          balance: parseFloat(row.balance_amount) || 0,
        },
        imageId: row.image_id || null,
        imageUrl: row.image_id ? `/api/transactions/attachments/${row.image_id}` : (row.image_url || null),
        imageName: row.image_name || "",
        documentId: row.document_id || null,
        documentUrl: row.document_id ? `/api/transactions/attachments/${row.document_id}` : (row.document_url || null),
        documentName: row.document_name || "",
        files: {
          image: row.image_id ? `/api/transactions/attachments/${row.image_id}` : (row.image_url || null),
          imageId: row.image_id || null,
          imageName: row.image_name || "",
          document: row.document_id ? `/api/transactions/attachments/${row.document_id}` : (row.document_url || null),
          documentId: row.document_id || null,
          documentName: row.document_name || "",
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/transactions
 * Atomically saves transaction header and all transaction_items child rows in pure SQL columns
 */
const saveTransactionHandler = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const businessId = businessIdFromRequest(req);
    const body = req.body || {};

    const id = req.params?.id || body.id || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const transactionType = (body.transactionType || body.type || "sale").toLowerCase();
    const documentNumber = String(
      body.documentNumber ||
      body.invoiceNumber ||
      body.billNumber ||
      body.number ||
      body.form?.invoiceNumber ||
      body.form?.billNumber ||
      "0"
    ).trim();
    const rawTxnDate = body.transactionDate || body.invoiceDate || body.billDate || body.date || body.form?.invoiceDate || new Date();
    const transactionDate = formatSqlDate(rawTxnDate) || new Date().toISOString().slice(0, 10);
    const dueDate = formatSqlDate(body.dueDate || body.form?.dueDate);
    const rawPartyId = body.partyId || body.party_id || body.form?.partyId || body.customerId || null;
    const partyId = (rawPartyId && rawPartyId !== "null" && rawPartyId !== "undefined" && String(rawPartyId).trim()) ? String(rawPartyId).trim() : null;
    const partyName = (body.partyName || body.party || body.customerName || body.customer || body.supplierName || body.supplier || body.form?.customer || body.form?.supplier || body.form?.partyName || body.form?.party || "").trim() ||
      ((body.paymentMode === "Cash" || body.paymentType === "Cash" || body.form?.paymentType === "Cash" || transactionType === "pos") ? "Cash Sale" : null);
    const partyPhone = body.partyPhone || body.phone || body.mobile || body.customerPhone || body.form?.phone || null;
    const partyGstin = body.partyGstin || body.gstin || body.form?.gstin || null;
    const billingAddress = typeof (body.billingAddress || body.billing_address) === "object"
      ? JSON.stringify(body.billingAddress || body.billing_address)
      : (body.billingAddress || body.form?.billingAddress || body.billing_address || null);
    const shippingAddress = typeof (body.shippingAddress || body.shipping_address) === "object"
      ? JSON.stringify(body.shippingAddress || body.shipping_address)
      : (body.shippingAddress || body.form?.shippingAddress || body.shipping_address || billingAddress || null);

    // Party integrity validation: verify party exists under this business if partyId is provided
    if (partyId) {
      const [partyCheck] = await conn.query(
        `SELECT id, party_name FROM parties WHERE business_id = ? AND id = ? LIMIT 1`,
        [businessId, partyId]
      );
      if (!partyCheck.length) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Party validation failed: Party '${partyName || partyId}' (ID: ${partyId}) does not exist under business '${businessId}'.`,
        });
      }
    }

    const rawPayments = Array.isArray(body.payments) && body.payments.length > 0 ? body.payments : [];
    let rawItems = Array.isArray(body.items) && body.items.length
      ? body.items
      : (Array.isArray(body.rows) && body.rows.length
          ? body.rows
          : (Array.isArray(body.lineItems) && body.lineItems.length ? body.lineItems : []));

    if ((transactionType === "payment_in" || transactionType === "payment_out") && rawItems.length === 0) {
      if (rawPayments.length > 0) {
        rawItems = rawPayments.map((p, idx) => ({
          id: p.id || `${id}_pay_${idx + 1}`,
          itemName: p.type || "Cash",
          item: p.type || "Cash",
          unit: "TXN",
          quantity: 1,
          qty: 1,
          unitPrice: parseFloat(p.amount) || 0,
          price: parseFloat(p.amount) || 0,
          totalAmount: parseFloat(p.amount) || 0,
          amount: parseFloat(p.amount) || 0,
          itemCode: p.reference || "",
          serialNo: p.chequeDate || "",
        }));
      }
    }

    const itemsSum = rawItems.reduce((s, it) => s + (parseFloat(it.totalAmount ?? it.amount ?? (parseFloat(it.qty ?? it.quantity ?? 1) * parseFloat(it.price ?? it.unitPrice ?? 0))) || 0), 0);
    const parsedTotal = parseFloat(body.totalAmount ?? body.total ?? body.amount ?? body.totals?.finalTotal ?? body.totals?.grandTotal ?? 0) || 0;
    const totalAmount = parsedTotal > 0 ? parsedTotal : itemsSum;
    const parsedSubtotal = parseFloat(body.subtotal ?? body.totals?.subtotal ?? body.totals?.taxableAmount ?? 0) || 0;
    const subtotal = parsedSubtotal > 0 ? parsedSubtotal : (totalAmount > 0 ? totalAmount : itemsSum);
    const discountPercent = parseFloat(body.discountPercent ?? body.discount_percent ?? body.totals?.discountPercent ?? 0) || 0;
    const discountAmount = parseFloat(body.discountAmount ?? body.discount ?? body.totals?.discount ?? 0) || 0;
    const taxAmount = parseFloat(body.taxAmount ?? body.tax ?? body.totals?.totalTax ?? body.totals?.tax ?? 0) || 0;
    const roundOff = parseFloat(body.roundOffValue ?? (typeof body.roundOff === 'number' ? body.roundOff : null) ?? body.round_off ?? body.totals?.roundOffAmount ?? 0) || 0;
    const paidAmount = parseFloat(body.paidAmount ?? body.receivedAmount ?? body.received ?? body.paid ?? body.totals?.received ?? (transactionType === "payment_in" || transactionType === "payment_out" ? totalAmount : 0)) || 0;
    const balanceAmount = parseFloat(body.balanceAmount ?? body.balance ?? body.totals?.balance ?? (transactionType === "payment_in" || transactionType === "payment_out" ? 0 : (totalAmount - paidAmount))) || 0;

    const paymentMode = body.paymentMode || body.paymentType || body.form?.paymentType || "Cash";
    const paymentStatus = body.status || body.paymentStatus || (balanceAmount <= 0.001 ? "Paid" : (paidAmount > 0 ? "Partial" : "Unpaid"));
    const paymentRefNo = body.paymentRefNo || body.refNo || null;
    const cashTendered = parseFloat(body.cashTendered ?? body.tendered ?? 0) || 0;
    const changeReturned = parseFloat(body.changeReturned ?? body.change ?? 0) || 0;
    const vehicleNo = body.vehicleNo || body.vehicle_no || body.vehicleNumber || body.form?.vehicleNumber || null;
    const driverName = body.driverName || body.driver_name || body.form?.driverName || null;
    const eWayBillNo = body.eWayBillNo || body.e_way_bill_no || body.ewayBillNo || body.form?.ewayBillNo || null;
    const poNumber = body.poNumber || body.po_number || body.customerPoNumber || body.form?.poNumber || body.linkedInvoiceId || null;
    const poDate = toSqlDate(body.poDate || body.po_date || body.customerPoDate || body.form?.poDate);
    const notes = body.notes || body.description || body.form?.description || null;
    const terms = body.terms || body.form?.terms || null;
    const termsTitle = body.termsTitle || body.terms_title || body.form?.termsTitle || null;
    const stateOfSupply = body.stateOfSupply || body.state_of_supply || body.state || body.form?.stateOfSupply || null;
    const reverseCharge = (body.reverseCharge || body.reverse_charge || body.form?.reverseCharge) ? 1 : 0;
    const paymentTerms = body.paymentTerms || body.payment_terms || body.form?.paymentTerms || null;
    const shippingCharges = parseFloat(body.shippingCharges ?? body.shipping_charges ?? body.additionalCharges?.shipping ?? 0) || 0;
    const packagingCharges = parseFloat(body.packagingCharges ?? body.packaging_charges ?? body.additionalCharges?.packaging ?? 0) || 0;
    const otherCharges = parseFloat(body.otherCharges ?? body.other_charges ?? body.additionalCharges?.other ?? 0) || 0;

    // Extract and persist attachments
    const filesInput = (body.files && typeof body.files === "object") ? body.files : {};

    let rawImage = body.imageUrl || body.image_url || body.image || filesInput.image || filesInput.imageUrl || null;
    let imageName = body.imageName || body.image_name || filesInput.imageName || filesInput.image_name || (rawImage && typeof rawImage === "object" ? rawImage.name : null) || null;
    let imageId = body.imageId || body.image_id || filesInput.imageId || filesInput.image_id || (rawImage && typeof rawImage === "object" ? (rawImage.fileId || rawImage.id) : null) || null;
    let imageUrl = typeof rawImage === "string" ? rawImage : (rawImage && typeof rawImage === "object" ? (rawImage.url || rawImage.imageUrl) : null);

    let rawDoc = body.documentUrl || body.document_url || body.document || filesInput.document || filesInput.documentUrl || null;
    let documentName = body.documentName || body.document_name || filesInput.documentName || filesInput.document_name || (rawDoc && typeof rawDoc === "object" ? rawDoc.name : null) || null;
    let documentId = body.documentId || body.document_id || filesInput.documentId || filesInput.document_id || (rawDoc && typeof rawDoc === "object" ? (rawDoc.fileId || rawDoc.id) : null) || null;
    let documentUrl = typeof rawDoc === "string" ? rawDoc : (rawDoc && typeof rawDoc === "object" ? (rawDoc.url || rawDoc.documentUrl) : null);

    // Auto-persist Base64 image
    if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
      const persistedImg = await persistBase64Attachment(imageUrl, imageName, businessId, id);
      if (persistedImg) {
        imageId = persistedImg.fileId;
        imageUrl = persistedImg.fileUrl;
        imageName = imageName || persistedImg.originalFilename;
      }
    } else if (imageUrl && typeof imageUrl === "string" && imageUrl.includes("/api/transactions/attachments/")) {
      if (!imageId) {
        const parts = imageUrl.split("/");
        imageId = parts[parts.length - 1].split("?")[0];
      }
    }

    // Auto-persist Base64 document
    if (documentUrl && typeof documentUrl === "string" && documentUrl.startsWith("data:")) {
      const persistedDoc = await persistBase64Attachment(documentUrl, documentName, businessId, id);
      if (persistedDoc) {
        documentId = persistedDoc.fileId;
        documentUrl = persistedDoc.fileUrl;
        documentName = documentName || persistedDoc.originalFilename;
      }
    } else if (documentUrl && typeof documentUrl === "string" && documentUrl.includes("/api/transactions/attachments/")) {
      if (!documentId) {
        const parts = documentUrl.split("/");
        documentId = parts[parts.length - 1].split("?")[0];
      }
    }

    if ((transactionType === "payment_in" || transactionType === "payment_out") && rawItems.length === 0) {
      rawItems = [{
        id: `${id}_pay_1`,
        itemName: paymentMode || "Cash",
        item: paymentMode || "Cash",
        unit: "TXN",
        quantity: 1,
        qty: 1,
        unitPrice: totalAmount,
        price: totalAmount,
        totalAmount: totalAmount,
        amount: totalAmount,
        itemCode: paymentRefNo || "",
        serialNo: "",
      }];
    }

    // Check if transaction already exists in MySQL for safe differential accounting
    const [existingRows] = await conn.query(
      `SELECT id, transaction_type, party_id, total_amount, paid_amount, balance_amount, image_id, document_id
       FROM transactions
       WHERE business_id = ? AND id = ?
       FOR UPDATE`,
      [businessId, id]
    );
    const existingTxn = existingRows[0] || null;

    // Track replaced or removed attachments for cleanup after commit
    const filesToCleanup = [];
    if (existingTxn) {
      if (existingTxn.image_id && existingTxn.image_id !== imageId && existingTxn.image_id !== documentId) {
        const [refRows] = await conn.query(
          `SELECT COUNT(*) AS count FROM transactions WHERE business_id = ? AND (image_id = ? OR document_id = ?) AND id != ?`,
          [businessId, existingTxn.image_id, existingTxn.image_id, id]
        );
        if ((refRows[0]?.count || 0) === 0) {
          filesToCleanup.push(existingTxn.image_id);
        }
      }
      if (existingTxn.document_id && existingTxn.document_id !== documentId && existingTxn.document_id !== imageId && !filesToCleanup.includes(existingTxn.document_id)) {
        const [refRows] = await conn.query(
          `SELECT COUNT(*) AS count FROM transactions WHERE business_id = ? AND (image_id = ? OR document_id = ?) AND id != ?`,
          [businessId, existingTxn.document_id, existingTxn.document_id, id]
        );
        if ((refRows[0]?.count || 0) === 0) {
          filesToCleanup.push(existingTxn.document_id);
        }
      }
    }

    // Inactive items validation: prevent inactive items from being added to new transactions (or as new lines)
    if (transactionType !== "payment_in" && transactionType !== "payment_out") {
      let existingItemIds = new Set();
      let existingItemNames = new Set();
      if (existingTxn) {
        const [existingLines] = await conn.query(
          `SELECT item_id, item_name FROM transaction_items WHERE business_id = ? AND transaction_id = ?`,
          [businessId, id]
        );
        for (const line of existingLines) {
          if (line.item_id) existingItemIds.add(String(line.item_id));
          if (line.item_name) existingItemNames.add(String(line.item_name).trim().toLowerCase());
        }
      }

      for (const item of rawItems) {
        const itemId = item.itemId || item.sourceItemId || item.inventoryItemId || item.item_id || null;
        const itemName = (item.item || item.itemName || item.name || "").trim();

        // Allow existing line items on already-persisted transactions
        if (existingTxn) {
          if (itemId && existingItemIds.has(String(itemId))) continue;
          if (itemName && existingItemNames.has(itemName.toLowerCase())) continue;
        }

        let inactiveCheck = [];
        if (itemId) {
          [inactiveCheck] = await conn.query(
            `SELECT id, name, is_active FROM inventory_items WHERE business_id = ? AND id = ? AND is_active = 0 LIMIT 1`,
            [businessId, itemId]
          );
        }
        if (!inactiveCheck.length && itemName) {
          [inactiveCheck] = await conn.query(
            `SELECT id, name, is_active FROM inventory_items WHERE business_id = ? AND LOWER(TRIM(name)) = LOWER(?) AND is_active = 0 LIMIT 1`,
            [businessId, itemName]
          );
        }

        if (inactiveCheck.length > 0) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            code: "INACTIVE_ITEM_REJECTED",
            message: `Item '${inactiveCheck[0].name || itemName}' is inactive and cannot be added to a transaction.`,
          });
        }
      }
    }

    // 1. Upsert Transaction Header (Pure SQL columns)
    await conn.query(
      `INSERT INTO transactions (
        id, business_id, transaction_type, document_number, transaction_date, due_date,
        party_id, party_name, party_phone, party_gstin, billing_address, shipping_address,
        subtotal, discount_percent, discount_amount, tax_amount, round_off, total_amount,
        paid_amount, balance_amount, payment_mode, payment_status, payment_ref_no,
        cash_tendered, change_returned, vehicle_no, e_way_bill_no, po_number, po_date,
        notes, terms, terms_title, driver_name, state_of_supply, reverse_charge, payment_terms,
        shipping_charges, packaging_charges, other_charges,
        image_id, image_url, image_name, document_id, document_url, document_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        transaction_type = VALUES(transaction_type),
        document_number = VALUES(document_number),
        transaction_date = VALUES(transaction_date),
        due_date = VALUES(due_date),
        party_id = VALUES(party_id),
        party_name = VALUES(party_name),
        party_phone = VALUES(party_phone),
        party_gstin = VALUES(party_gstin),
        billing_address = VALUES(billing_address),
        shipping_address = VALUES(shipping_address),
        subtotal = VALUES(subtotal),
        discount_percent = VALUES(discount_percent),
        discount_amount = VALUES(discount_amount),
        tax_amount = VALUES(tax_amount),
        round_off = VALUES(round_off),
        total_amount = VALUES(total_amount),
        paid_amount = VALUES(paid_amount),
        balance_amount = VALUES(balance_amount),
        payment_mode = VALUES(payment_mode),
        payment_status = VALUES(payment_status),
        payment_ref_no = VALUES(payment_ref_no),
        cash_tendered = VALUES(cash_tendered),
        change_returned = VALUES(change_returned),
        vehicle_no = VALUES(vehicle_no),
        e_way_bill_no = VALUES(e_way_bill_no),
        po_number = VALUES(po_number),
        po_date = VALUES(po_date),
        notes = VALUES(notes),
        terms = VALUES(terms),
        terms_title = VALUES(terms_title),
        driver_name = VALUES(driver_name),
        state_of_supply = VALUES(state_of_supply),
        reverse_charge = VALUES(reverse_charge),
        payment_terms = VALUES(payment_terms),
        shipping_charges = VALUES(shipping_charges),
        packaging_charges = VALUES(packaging_charges),
        other_charges = VALUES(other_charges),
        image_id = VALUES(image_id),
        image_url = VALUES(image_url),
        image_name = VALUES(image_name),
        document_id = VALUES(document_id),
        document_url = VALUES(document_url),
        document_name = VALUES(document_name),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id, businessId, transactionType, documentNumber, transactionDate, dueDate,
        partyId, partyName, partyPhone, partyGstin, billingAddress, shippingAddress,
        subtotal, discountPercent, discountAmount, taxAmount, roundOff, totalAmount,
        paidAmount, balanceAmount, paymentMode, paymentStatus, paymentRefNo,
        cashTendered, changeReturned, vehicleNo, eWayBillNo, poNumber, poDate,
        notes, terms, termsTitle, driverName, stateOfSupply, reverseCharge, paymentTerms,
        shippingCharges, packagingCharges, otherCharges,
        imageId, imageUrl, imageName, documentId, documentUrl, documentName
      ]
    );

    // 2. Revert previous inventory movements if this is an update, then re-insert fresh lines
    if (existingTxn) {
      const [oldLines] = await conn.query(
        `SELECT item_id, batch_no, quantity, free_qty FROM transaction_items WHERE business_id = ? AND transaction_id = ?`,
        [businessId, id]
      );
      for (const line of oldLines) {
        if (line.item_id) {
          const qty = (parseFloat(line.quantity) || 0) + (parseFloat(line.free_qty) || 0);
          let revertStock = 0;
          const oldType = String(existingTxn.transaction_type || "").toLowerCase();
          if (oldType === "sale" || oldType === "pos" || oldType === "delivery_challan" || oldType === "purchase_return" || oldType === "debit note" || oldType === "debit_note") {
            revertStock = +qty;
          } else if (oldType === "purchase" || oldType === "sale_return" || oldType === "credit note" || oldType === "credit_note") {
            revertStock = -qty;
          }
          if (revertStock !== 0) {
            await conn.query(
              `UPDATE inventory_items SET current_stock = current_stock + ? WHERE business_id = ? AND id = ?`,
              [revertStock, businessId, line.item_id]
            );
            if (line.batch_no) {
              await conn.query(
                `UPDATE item_batches SET current_qty = current_qty + ? WHERE business_id = ? AND item_id = ? AND batch_no = ?`,
                [revertStock, businessId, line.item_id, line.batch_no]
              );
            }
          }
        }
      }
    }

    await conn.query(`DELETE FROM transaction_items WHERE business_id = ? AND transaction_id = ?`, [businessId, id]);

    let itemIdx = 0;
    for (const item of rawItems) {
      itemIdx++;
      const lineId = item.id || `${id}_item_${itemIdx}_${Math.random().toString(36).substring(2, 6)}`;
      const itemId = item.itemId || item.sourceItemId || item.inventoryItemId || item.item_id || null;
      const itemName = (item.item || item.itemName || item.name || "Item").trim();
      const itemCode = (item.itemCode || item.code || item.size || item.item_code || "").trim() || null;
      const barcode = (item.barcode || item.barCode || item.itemBarcode || itemCode || "").trim() || null;
      const hsnCode = item.hsnCode || item.hsn || item.hsn_code || null;
      const batchNo = item.batchNo || item.batch || item.batch_no || null;
      const serialNo = Array.isArray(item.serialNumbers)
        ? item.serialNumbers.join(",")
        : (item.serialNo || item.serial || item.description || null);
      const quantity = parseFloat(item.qty ?? item.quantity ?? 1) || 1;
      const freeQty = parseFloat(item.freeQty ?? 0) || 0;
      const unit = item.unit || "PCS";
      const unitPrice = parseFloat(item.price ?? item.unitPrice ?? item.rate ?? 0) || 0;
      const purchasePrice = parseFloat(item.purchasePrice ?? item.purchase_price ?? 0) || 0;
      const itemDiscountPercent = parseFloat(item.discountPercent ?? item.discount_percent ?? (item.discountMode !== "amount" && item.discountType !== "amount" ? item.discount : 0) ?? 0) || 0;
      const itemDiscountAmount = parseFloat(item.discountAmount ?? item.discount_amount ?? (item.discountMode === "amount" || item.discountType === "amount" ? item.discount : 0) ?? 0) || 0;
      const itemTaxRate = parseFloat(item.taxRate ?? item.tax_rate ?? (item.tax && item.tax !== "NONE" ? String(item.tax).replace(/[^0-9.]/g, "") : 0) ?? 0) || 0;
      const itemTaxAmount = parseFloat(item.taxAmount ?? item.tax_amount ?? 0) || 0;
      const cgstRate = parseFloat(item.cgstRate ?? (itemTaxRate / 2)) || 0;
      const cgstAmount = parseFloat(item.cgstAmount ?? (itemTaxAmount / 2)) || 0;
      const sgstRate = parseFloat(item.sgstRate ?? (itemTaxRate / 2)) || 0;
      const sgstAmount = parseFloat(item.sgstAmount ?? (itemTaxAmount / 2)) || 0;
      const igstRate = parseFloat(item.igstRate ?? 0) || 0;
      const igstAmount = parseFloat(item.igstAmount ?? 0) || 0;
      const cessRate = parseFloat(item.cessRate ?? item.cessPercent ?? 0) || 0;
      const cessAmount = parseFloat(item.cessAmount ?? item.cess ?? 0) || 0;
      const itemTotalAmount = parseFloat(item.calculated?.amount ?? item.amount ?? item.totalAmount ?? (quantity * unitPrice - itemDiscountAmount)) || 0;
      const itemIsActive = item.isActive !== undefined ? (item.isActive ? 1 : 0) : (item.is_active !== undefined ? (item.is_active ? 1 : 0) : 1);

      await conn.query(
        `INSERT INTO transaction_items (
          id, transaction_id, business_id, item_id, item_name, item_code, barcode, hsn_code,
          batch_no, serial_no, quantity, free_qty, unit, unit_price, purchase_price,
          discount_percent, discount_amount, tax_rate, tax_amount, cgst_rate, cgst_amount,
          sgst_rate, sgst_amount, igst_rate, igst_amount, cess_rate, cess_amount, total_amount, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId, id, businessId, itemId, itemName, itemCode, barcode, hsnCode,
          batchNo, serialNo, quantity, freeQty, unit, unitPrice, purchasePrice,
          itemDiscountPercent, itemDiscountAmount, itemTaxRate, itemTaxAmount, cgstRate, cgstAmount,
          sgstRate, sgstAmount, igstRate, igstAmount, cessRate, cessAmount, itemTotalAmount, itemIsActive
        ]
      );

      // 3. Atomically adjust stock if linked to inventory item
      if (itemId) {
        let stockDelta = 0;
        const normTxnType = String(transactionType || "").toLowerCase();
        if (normTxnType === "sale" || normTxnType === "pos" || normTxnType === "delivery_challan" || normTxnType === "purchase_return" || normTxnType === "debit note" || normTxnType === "debit_note") {
          stockDelta = -(quantity + freeQty);
        } else if (normTxnType === "purchase" || normTxnType === "sale_return" || normTxnType === "credit note" || normTxnType === "credit_note") {
          stockDelta = (quantity + freeQty);
        }

        if (stockDelta !== 0) {
          await conn.query(
            `UPDATE inventory_items
             SET current_stock = current_stock + ?
             WHERE business_id = ? AND id = ?`,
            [stockDelta, businessId, itemId]
          );

          if (batchNo) {
            await conn.query(
              `UPDATE item_batches
               SET current_qty = current_qty + ?
               WHERE business_id = ? AND item_id = ? AND batch_no = ?`,
              [stockDelta, businessId, itemId, batchNo]
            );
          }
        }
      }
    }

    // 4. Atomically update party ledger balance with strict differential accounting
    const newImpact = getPartyBalanceImpact(transactionType, balanceAmount, paidAmount);

    if (existingTxn) {
      const oldImpact = getPartyBalanceImpact(
        existingTxn.transaction_type,
        parseFloat(existingTxn.balance_amount) || 0,
        parseFloat(existingTxn.paid_amount) || 0
      );
      const oldPartyId = existingTxn.party_id;

      if (oldPartyId === partyId) {
        // Same party: apply only the difference between new impact and old impact
        const netDelta = newImpact - oldImpact;
        if (netDelta !== 0 && partyId) {
          await conn.query(
            `UPDATE parties SET current_balance = current_balance + ? WHERE business_id = ? AND id = ?`,
            [netDelta, businessId, partyId]
          );
        }
      } else {
        // Party changed: revert old impact from old party, apply new impact to new party
        if (oldPartyId && oldImpact !== 0) {
          await conn.query(
            `UPDATE parties SET current_balance = current_balance - ? WHERE business_id = ? AND id = ?`,
            [oldImpact, businessId, oldPartyId]
          );
        }
        if (partyId && newImpact !== 0) {
          await conn.query(
            `UPDATE parties SET current_balance = current_balance + ? WHERE business_id = ? AND id = ?`,
            [newImpact, businessId, partyId]
          );
        }
      }
    } else {
      // Brand new transaction: apply full impact
      if (partyId && newImpact !== 0) {
        await conn.query(
          `UPDATE parties SET current_balance = current_balance + ? WHERE business_id = ? AND id = ?`,
          [newImpact, businessId, partyId]
        );
      }
    }

    // Sync cash movement into cash_in_hand table
    const normPayMode = String(paymentMode || "").toLowerCase();
    if (normPayMode === "cash") {
      let entryType = "in";
      let cashAmt = parseFloat(paidAmount) || 0;
      if (cashAmt <= 0) cashAmt = parseFloat(totalAmount) || 0;
      if (["purchase", "expense", "payment_out", "payment-out", "sale_return", "credit note", "credit_note"].includes(transactionType.toLowerCase())) {
        entryType = "out";
      }
      if (cashAmt > 0) {
        await conn.query(
          `INSERT INTO cash_in_hand (
            id, business_id, entry_date, entry_type, amount,
            party_id, party_name, reference_type, reference_no, description, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            entry_date = VALUES(entry_date),
            entry_type = VALUES(entry_type),
            amount = VALUES(amount),
            party_id = VALUES(party_id),
            party_name = VALUES(party_name),
            reference_type = VALUES(reference_type),
            reference_no = VALUES(reference_no),
            description = VALUES(description)`,
          [
            id,
            businessId,
            toSqlDate(transactionDate) || new Date().toISOString().slice(0, 10),
            entryType,
            cashAmt,
            partyId || null,
            partyName || "Cash",
            transactionType,
            documentNumber || "",
            notes || `${transactionType.toUpperCase()} #${documentNumber || id.slice(0, 8)}`
          ]
        );
      }
    } else {
      await conn.query(
        `DELETE FROM cash_in_hand WHERE business_id = ? AND id = ? AND (reference_type IS NULL OR reference_type != 'adjustment')`,
        [businessId, id]
      );
    }

    await conn.commit();

    for (const fId of filesToCleanup) {
      try {
        const meta = await getFileMetadataById(fId, businessId);
        if (meta) {
          await storageService.deleteFile(meta.storage_key, businessId).catch(() => {});
          await deleteFileMetadata(fId, businessId).catch(() => {});
        }
      } catch (cleanupErr) {
        console.warn(`[Transactions] Failed to clean up replaced file ${fId}:`, cleanupErr.message);
      }
    }

    return res.json({
      success: true,
      message: "Transaction and line items saved successfully in pure relational rows and columns.",
      data: {
        id,
        transactionType,
        documentNumber,
        transactionDate,
        totalAmount,
        paidAmount,
        balanceAmount,
        imageId: imageId || null,
        imageUrl: imageUrl || null,
        imageName: imageName || "",
        documentId: documentId || null,
        documentUrl: documentUrl || null,
        documentName: documentName || "",
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("[Transactions POST Error]", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

router.post("/", saveTransactionHandler);
router.put("/:id", saveTransactionHandler);

/**
 * DELETE /api/transactions/:id
 * Removes a transaction and its normalized lines atomically, safely reverting party balance and inventory movements
 */
router.delete("/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const businessId = businessIdFromRequest(req);
    const txnId = req.params.id;

    const [existingRows] = await conn.query(
      `SELECT id, transaction_type, party_id, total_amount, paid_amount, balance_amount, image_id, document_id
       FROM transactions
       WHERE business_id = ? AND id = ?
       FOR UPDATE`,
      [businessId, txnId]
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      const impact = getPartyBalanceImpact(
        existing.transaction_type,
        parseFloat(existing.balance_amount) || 0,
        parseFloat(existing.paid_amount) || 0
      );

      // Revert party balance adjustment
      if (existing.party_id && impact !== 0) {
        await conn.query(
          `UPDATE parties SET current_balance = current_balance - ? WHERE business_id = ? AND id = ?`,
          [impact, businessId, existing.party_id]
        );
      }

      // Revert inventory stock adjustments
      const [oldLines] = await conn.query(
        `SELECT item_id, batch_no, quantity, free_qty FROM transaction_items WHERE business_id = ? AND transaction_id = ?`,
        [businessId, txnId]
      );
      for (const line of oldLines) {
        if (line.item_id) {
          const qty = (parseFloat(line.quantity) || 0) + (parseFloat(line.free_qty) || 0);
          let revertStock = 0;
          const delType = String(existing.transaction_type || "").toLowerCase();
          if (delType === "sale" || delType === "pos" || delType === "delivery_challan" || delType === "purchase_return" || delType === "debit note" || delType === "debit_note") {
            revertStock = +qty;
          } else if (delType === "purchase" || delType === "sale_return" || delType === "credit note" || delType === "credit_note") {
            revertStock = -qty;
          }
          if (revertStock !== 0) {
            await conn.query(
              `UPDATE inventory_items SET current_stock = current_stock + ? WHERE business_id = ? AND id = ?`,
              [revertStock, businessId, line.item_id]
            );
            if (line.batch_no) {
              await conn.query(
                `UPDATE item_batches SET current_qty = current_qty + ? WHERE business_id = ? AND item_id = ? AND batch_no = ?`,
                [revertStock, businessId, line.item_id, line.batch_no]
              );
            }
          }
        }
      }

      await conn.query(`DELETE FROM transaction_items WHERE business_id = ? AND transaction_id = ?`, [businessId, txnId]);
      await conn.query(`DELETE FROM cash_in_hand WHERE business_id = ? AND id = ? AND (reference_type IS NULL OR reference_type != 'adjustment')`, [businessId, txnId]);
      await conn.query(`DELETE FROM transactions WHERE business_id = ? AND id = ?`, [businessId, txnId]);
    }

    await conn.commit();

    // Safely clean up attachments if they are no longer referenced by any other transactions
    if (existingRows.length > 0) {
      const existing = existingRows[0];
      const attachedIds = [existing.image_id, existing.document_id].filter(Boolean);
      const uniqueAttachedIds = [...new Set(attachedIds)];
      for (const fId of uniqueAttachedIds) {
        try {
          const [refRows] = await pool.query(
            `SELECT COUNT(*) AS count FROM transactions WHERE business_id = ? AND (image_id = ? OR document_id = ?)`,
            [businessId, fId, fId]
          );
          if ((refRows[0]?.count || 0) === 0) {
            const meta = await getFileMetadataById(fId, businessId);
            if (meta) {
              await storageService.deleteFile(meta.storage_key, businessId).catch(() => {});
              await deleteFileMetadata(fId, businessId).catch(() => {});
            }
          }
        } catch (cleanupErr) {
          console.warn(`[Transactions DELETE] Cleanup warning for ${fId}:`, cleanupErr.message);
        }
      }
    }

    return res.json({ success: true, message: "Transaction deleted successfully." });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

export default router;
