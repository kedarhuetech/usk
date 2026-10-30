import { calculateRow, toNumber } from "../utils/saleInvoice.js";
import { normalizeInventoryItem } from "./itemsStorage.js";

function cleanText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numericText(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function dateOnly(value) {
  if (value === null || value === undefined || value === "") return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return "";
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[1]) return "";
  return match[1];
}

function invoiceNumber(transaction) {
  const number = cleanText(transaction.txn_ref_number_char);
  const prefix = cleanText(transaction.txn_invoice_prefix);
  return `${prefix}${number}`;
}

function mapSaleLine(line, itemsBySourceId) {
  const product = itemsBySourceId.get(String(line.item_id));
  const row = {
    id: `vyapar-line-${line.lineitem_id}`,
    item: cleanText(line.item_name) || product?.itemName || "",
    description: cleanText(line.lineitem_description),
    qty: numericText(line.quantity),
    unit: cleanText(line.unit_short_name) || cleanText(line.unit_name),
    price: numericText(line.priceperunit),
    priceMode: "",
    discountMode: Number(line.lineitem_discount_amount) > 0 ? "amount" : "percent",
    discountPercent: numericText(line.lineitem_discount_percent),
    discountAmount: numericText(line.lineitem_discount_amount),
    taxRate: line.tax_rate === null || line.tax_rate === undefined ? "None" : `${numericText(line.tax_rate)}%`,
    sourceItemId: product?.id || "",
    sourceItemCode: cleanText(line.item_code),
    sourceItemHsn: cleanText(line.item_hsn_sac_code),
    sourceTaxCodeId: line.lineitem_tax_id,
    sourceTaxCodeName: cleanText(line.tax_code_name),
    sourceTaxAmount: line.lineitem_tax_amount,
    sourceDiscountAmount: line.lineitem_discount_amount,
    sourceTotalAmount: line.total_amount,
    sourceLineId: String(line.lineitem_id),
  };
  return { ...row, calculated: calculateRow(row) };
}

function mapSaleTransaction(transaction, firmId, itemsBySourceId, partyIdsBySourceId, lineItemsAvailable) {
  const recordId = `vyapar-sale-${firmId}-${transaction.txn_id}`;
  const date = dateOnly(transaction.txn_date);
  const dueDate = dateOnly(transaction.txn_due_date);
  const partyId = partyIdsBySourceId.get(String(transaction.txn_name_id))
    || (transaction.txn_name_id === null || transaction.txn_name_id === undefined ? "" : `vyapar-party-${transaction.txn_name_id}`);
  const rows = transaction.lineItems.map((line) => mapSaleLine(line, itemsBySourceId));
  const received = transaction.payments.length
    ? transaction.payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
    : toNumber(transaction.txn_cash_amount);
  const finalTotal = toNumber(transaction.txn_cash_amount) + toNumber(transaction.txn_balance_amount);
  const amountFromLines = transaction.lineItems.reduce((sum, line) => sum + toNumber(line.total_amount), 0);
  const invoice = {
    id: recordId,
    invoiceId: recordId,
    importSource: "vyapar",
    sourceId: String(transaction.txn_id),
    saleType: "credit",
    transactionType: "sale",
    form: {
      invoiceNumber: invoiceNumber(transaction),
      invoiceDate: date,
      dueDate,
      customer: cleanText(transaction.partyName),
      customerId: partyId,
      partyId,
      phone: cleanText(transaction.partyPhone),
      billingAddress: cleanText(transaction.partyAddress),
      shippingAddress: cleanText(transaction.partyShippingAddress),
      state: cleanText(transaction.partyState),
      pincode: cleanText(transaction.partyPincode),
      description: cleanText(transaction.txn_description),
      paymentType: cleanText(transaction.payments[0]?.paymentType_name),
      paymentReference: cleanText(transaction.payments[0]?.payment_reference || transaction.txn_payment_reference),
    },
    rows,
    totals: {
      qty: transaction.lineItems.reduce((sum, line) => sum + toNumber(line.quantity), 0),
      taxable: amountFromLines,
      discount: toNumber(transaction.txn_discount_amount),
      tax: toNumber(transaction.txn_tax_amount),
      amount: finalTotal,
      finalTotal,
      received,
      balance: toNumber(transaction.txn_balance_amount),
      roundOffAmount: toNumber(transaction.txn_round_off_amount),
    },
    sourceData: {
      transactionId: transaction.txn_id,
      typeCode: transaction.txn_type,
      subtypeCode: transaction.txn_sub_type,
      sourceTypeHeader: transaction.typeHeader,
      referenceNumber: transaction.txn_ref_number_char,
      invoicePrefix: transaction.txn_invoice_prefix,
      cashAmount: transaction.txn_cash_amount,
      balanceAmount: transaction.txn_balance_amount,
      taxAmount: transaction.txn_tax_amount,
      discountAmount: transaction.txn_discount_amount,
      roundOffAmount: transaction.txn_round_off_amount,
      paymentStatusCode: transaction.txn_payment_status,
      payments: transaction.payments,
      lineItemTotal: amountFromLines,
    },
    createdAt: date ? `${date}T00:00:00.000Z` : "",
  };

  const issues = [];
  if (!transaction.partyName || !partyId) issues.push("The linked customer is missing or could not be resolved.");
  if (!invoice.form.invoiceNumber) issues.push("The original invoice number is missing.");
  if (!date) issues.push("The transaction date is missing or invalid.");
  if (!lineItemsAvailable || !rows.length) issues.push("No supported invoice line items were found.");
  for (const line of transaction.lineItems) {
    if (!itemsBySourceId.has(String(line.item_id)) || !line.item_name) issues.push(`Line ${line.lineitem_id} refers to a missing product.`);
    if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) issues.push(`Line ${line.lineitem_id} has a missing or invalid quantity.`);
  }
  return { invoice, issues: [...new Set(issues)] };
}

export function mapVyaparData(parsed) {
  const skipped = [];
  const invalidRecords = [];
  const company = parsed.firm ? {
    companyName: cleanText(parsed.firm.firm_name),
    businessName: cleanText(parsed.firm.firm_name),
    phoneNumber: cleanText(parsed.firm.firm_phone),
    emailId: cleanText(parsed.firm.firm_email),
    gstin: cleanText(parsed.firm.firm_gstin_number),
    state: cleanText(parsed.firm.firm_state),
    pincode: cleanText(parsed.firm.firm_pincode),
    businessAddress: cleanText(parsed.firm.firm_address),
    businessType: cleanText(parsed.firm.firm_business_type),
    businessCategory: cleanText(parsed.firm.firm_business_category),
    businessDescription: cleanText(parsed.firm.firm_description),
    secondaryPhoneNumber: cleanText(parsed.firm.firm_phone_secondary),
    bankName: cleanText(parsed.firm.firm_bank_name),
    bankAccountNumber: cleanText(parsed.firm.firm_bank_account_number),
    bankIfscCode: cleanText(parsed.firm.firm_bank_ifsc_code),
    dispatchAddress: cleanText(parsed.firm.firm_dispatch_address),
    dispatchPincode: cleanText(parsed.firm.firm_dispatch_pincode),
  } : null;

  const items = [];
  const itemsBySourceId = new Map();
  let unsupportedItemTypes = 0;
  for (const row of parsed.items) {
    if (row.item_type !== 1) {
      unsupportedItemTypes += 1;
      continue;
    }
    if (!cleanText(row.item_name) || row.item_id === null || row.item_id === undefined) {
      invalidRecords.push({ category: "Items", sourceId: String(row.item_id ?? ""), reason: "A product is missing its ID or name." });
      continue;
    }
    const unit = cleanText(row.unit_short_name) || cleanText(row.unit_name);
    const normalized = normalizeInventoryItem({
      id: `vyapar-item-${row.item_id}`,
      type: "product",
      itemName: cleanText(row.item_name),
      itemCode: cleanText(row.item_code),
      salePrice: numericText(row.item_sale_unit_price),
      purchasePrice: numericText(row.item_purchase_unit_price),
      wholesalePrice: numericText(row.item_wholesale_price),
      minimumWholesaleQuantity: numericText(row.item_min_wholesale_qty),
      openingQuantity: numericText(row.item_stock_quantity),
      minimumStock: numericText(row.item_min_stock_quantity),
      unit,
      category: cleanText(row.item_category_name),
      hsn: cleanText(row.item_hsn_sac_code),
      description: cleanText(row.item_description),
      taxRate: row.item_tax_rate === null || row.item_tax_rate === undefined ? "None" : `${numericText(row.item_tax_rate)}%`,
      createdAt: row.item_date_created || undefined,
    });
    const item = {
      ...normalized,
      importSource: "vyapar",
      sourceId: String(row.item_id),
      sourceTaxId: row.item_tax_id,
      sourcePurchaseTaxRate: row.item_purchase_tax_rate,
      sourceWholesalePrice: row.item_wholesale_price,
      sourceMinimumWholesaleQuantity: row.item_min_wholesale_qty,
      sourceTaxType: row.item_tax_type,
      sourcePurchaseTaxType: row.item_tax_type_purchase,
      sourceTaxRate: row.item_tax_rate,
      minimumWholesaleQuantity: numericText(row.item_min_wholesale_qty),
      isActive: row.item_is_active !== 0,
    };
    items.push(item);
    itemsBySourceId.set(String(row.item_id), item);
  }
  if (unsupportedItemTypes) skipped.push({ category: "Items", count: unsupportedItemTypes, reason: "The Vyapar item type is not a product type currently mapped by USV." });

  const parties = [];
  const partyIdsBySourceId = new Map();
  const partyByIdentity = new Map();
  let unsupportedPartyTypes = 0;
  for (const row of parsed.parties) {
    if (row.name_type !== 1 && row.name_type !== 2) {
      unsupportedPartyTypes += 1;
      continue;
    }
    if (!cleanText(row.full_name) || row.name_id === null || row.name_id === undefined) {
      invalidRecords.push({ category: "Parties", sourceId: String(row.name_id ?? ""), reason: "A party is missing its ID or name." });
      continue;
    }
    const partyKind = row.name_type === 1 ? "customer" : "supplier";
    const balance = numericText(row.amount);
    const gstin = cleanText(row.name_gstin_number).replace(/\s/g, "").toLocaleUpperCase();
    const phone = cleanText(row.phone_number).replace(/\D/g, "");
    const nameKey = cleanText(row.full_name).toLocaleLowerCase();
    const partyAddress = cleanText(row.address).toLocaleLowerCase();
    const postalCode = cleanText(row.pincode).replace(/\s/g, "").toLocaleUpperCase();
    const identityKey = gstin ? `gstin:${gstin}`
      : phone ? `phone-name:${phone}|${nameKey}`
        : partyAddress || postalCode ? `name-address:${nameKey}|${partyAddress}|${postalCode}`
          : `source:${row.name_id}`;
    let party = partyByIdentity.get(identityKey);
    if (!party) {
      party = {
        id: `vyapar-party-${row.name_id}`,
      partyName: cleanText(row.full_name),
      name: cleanText(row.full_name),
      partyType: partyKind,
      partyTypes: [partyKind],
      sourceIds: [String(row.name_id)],
      sourceBalances: [{ partyType: partyKind, amount: balance, direction: partyKind === "supplier" ? "to-pay" : "to-receive" }],
      phone: cleanText(row.phone_number),
      email: cleanText(row.email),
      taxNumber: cleanText(row.name_tin_number),
      gstin: cleanText(row.name_gstin_number),
      state: cleanText(row.name_state),
      billingAddress: cleanText(row.address),
      address: cleanText(row.address),
      pincode: cleanText(row.pincode),
      shippingAddress: cleanText(row.name_shipping_address),
      shippingPincode: cleanText(row.name_shipping_pincode),
      country: cleanText(row.name_country),
      creditLimit: numericText(row.credit_limit),
      creditLimitEnabled: row.credit_limit_enabled === 1,
      billingName: cleanText(row.party_billing_name),
      openingBalance: balance,
      openingBalanceType: partyKind === "supplier" ? "to-pay" : "to-receive",
      importSource: "vyapar",
      sourceId: String(row.name_id),
      isActive: row.name_is_active !== 0,
      };
      partyByIdentity.set(identityKey, party);
      parties.push(party);
    } else {
      party.partyTypes = [...new Set([...party.partyTypes, partyKind])];
      party.partyType = party.partyTypes.length > 1 ? "both" : party.partyTypes[0];
      party.sourceIds.push(String(row.name_id));
      party.sourceBalances.push({ partyType: partyKind, amount: balance, direction: partyKind === "supplier" ? "to-pay" : "to-receive" });
    }
    partyIdsBySourceId.set(String(row.name_id), party.id);
  }
  if (unsupportedPartyTypes) skipped.push({ category: "Parties", count: unsupportedPartyTypes, reason: "The Vyapar party type code is not recognized by this importer." });

  const salesInvoices = [];
  let unsupportedTransactions = 0;
  let incompleteTransactions = 0;
  for (const transaction of parsed.transactions || []) {
    const header = cleanText(transaction.typeHeader).toLocaleLowerCase();
    // Accept code 1 only when its in-file message addresses a customer and its party link is customer type.
    const verifiedSale = Number(transaction.txn_type) === 1
      && Number(transaction.txn_sub_type) === 1
      && Number(transaction.partyTypeCode) === 1
      && header.includes("thanks for your purchase with us")
      && header.includes("purchase details");
    if (!verifiedSale) {
      unsupportedTransactions += 1;
      skipped.push({
        category: "Transactions",
        count: 1,
        reason: transaction.typeHeader
          ? `Transaction type ${transaction.txn_type} is not verified for import with this record's party relationship and type-specific backup label.`
          : `Transaction type ${transaction.txn_type} could not be verified because its type-specific label is unavailable.`,
        sourceId: String(transaction.txn_id),
      });
      continue;
    }
    const { invoice, issues } = mapSaleTransaction(transaction, parsed.firm?.firm_id ?? "company", itemsBySourceId, partyIdsBySourceId, parsed.databaseSummary.lineItemsAvailable);
    if (issues.length) {
      incompleteTransactions += 1;
      invalidRecords.push({ category: "Sales invoices", sourceId: String(transaction.txn_id), invoiceNumber: invoice.form.invoiceNumber, reason: issues.join(" ") });
      continue;
    }
    salesInvoices.push(invoice);
  }
  if (!parsed.databaseSummary.transactionSchemaSupported && parsed.databaseSummary.transactions) {
    unsupportedTransactions += parsed.databaseSummary.transactions;
    skipped.push({ category: "Transactions", count: parsed.databaseSummary.transactions, reason: "The transaction table has an unsupported schema version; no transaction rows were imported." });
  } else if (!parsed.databaseSummary.lineItemsAvailable && parsed.databaseSummary.transactions && !parsed.transactions?.length) {
    skipped.push({ category: "Transactions", count: parsed.databaseSummary.transactions, reason: "The transaction line-item table is missing or has an unsupported schema; invoices were not imported." });
  }
  if (parsed.databaseSummary.transactions && !parsed.transactions?.length && !skipped.some((entry) => entry.category === "Transactions")) {
    unsupportedTransactions = parsed.databaseSummary.transactions;
    skipped.push({ category: "Transactions", count: unsupportedTransactions, reason: "No verified transaction records were available from this backup." });
  }

  const otherReasons = [
    ["inventoryAdjustments", "Inventory adjustments are not mapped yet."],
    ["chequeStatuses", "Cheque records are not mapped yet."],
    ["loanAccounts", "Loan account records are not mapped yet."],
    ["loanTransactions", "Loan transaction records are not mapped yet."],
  ];
  for (const [key, reason] of otherReasons) {
    const count = parsed.databaseSummary.extraCounts[key] || 0;
    if (count) skipped.push({ category: "Other records", count, reason });
  }
  if (parsed.extraFirms) skipped.push({ category: "Company profiles", count: parsed.extraFirms, reason: "Only the first company profile is supported in this USV workspace." });

  return {
    company,
    counts: {
      company: company ? 1 : 0,
      customers: parsed.parties.filter((row) => row.name_type === 1).length,
      suppliers: parsed.parties.filter((row) => row.name_type === 2).length,
      items: items.length,
      salesInvoices: salesInvoices.length + incompleteTransactions,
      purchaseInvoices: 0,
      receipts: 0,
      payments: 0,
      returns: 0,
      unclassifiedTransactions: unsupportedTransactions,
    },
    readyCounts: { items: items.length, parties: parties.length, salesInvoices: salesInvoices.length, purchaseInvoices: 0, receipts: 0, payments: 0 },
    invalidRecords,
    items,
    parties,
    salesInvoices,
    purchaseInvoices: [],
    receipts: [],
    payments: [],
    skipped,
  };
}
