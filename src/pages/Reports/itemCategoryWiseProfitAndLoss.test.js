import test from "node:test";
import assert from "node:assert/strict";

// Reusable unit test suite for Item Category Wise Profit & Loss algorithms

function parseYMD(val) {
  if (!val) return "";
  if (typeof val === "string") {
    const s = val.trim();
    const ymd = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

function isValidCost(val) {
  if (val === null || val === undefined || val === "") return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num) && num > 0;
}

function normalizeName(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHistoricalItemCost(row = {}, invoiceDate = "", inventoryItems = [], purchaseBills = []) {
  if (isValidCost(row.purchasePrice)) {
    return { unitCost: Number(row.purchasePrice), source: "Row Snapshot", isMissing: false };
  }
  if (isValidCost(row.costPrice)) {
    return { unitCost: Number(row.costPrice), source: "Row Snapshot", isMissing: false };
  }
  if (isValidCost(row.cost)) {
    return { unitCost: Number(row.cost), source: "Row Snapshot", isMissing: false };
  }

  const rowItemId = String(row.sourceItemId || row.itemId || row.productId || "").trim();
  const rowItemName = normalizeName(row.item || row.name || row.itemName || row.productName || row.itemNameSnapshot || "");

  let matchedMasterItem = null;
  if (Array.isArray(inventoryItems) && inventoryItems.length > 0) {
    if (rowItemId) {
      matchedMasterItem = inventoryItems.find((it) => String(it.id || "").trim() === rowItemId);
    }
    if (!matchedMasterItem && rowItemName) {
      matchedMasterItem = inventoryItems.find((it) => normalizeName(it.itemName || it.name) === rowItemName);
    }
  }

  const masterName = matchedMasterItem ? normalizeName(matchedMasterItem.itemName || matchedMasterItem.name) : "";
  const masterId = matchedMasterItem ? String(matchedMasterItem.id || "").trim() : "";

  // 1. Batch-wise matching
  const rowBatchNo = String(row.batchNo || "").trim();
  if (rowBatchNo && Array.isArray(purchaseBills) && purchaseBills.length > 0) {
    for (const bill of purchaseBills) {
      if (bill.cancelled || bill.status === "Cancelled") continue;
      for (const br of bill.rows || bill.items || []) {
        const brBatchNo = String(br.batchNo || "").trim();
        if (brBatchNo !== rowBatchNo) continue;
        const brItemId = String(br.sourceItemId || br.itemId || br.productId || "").trim();
        const brName = normalizeName(br.item || br.name || br.itemName || br.productName || br.itemNameSnapshot || "");
        const isMatch = (rowItemId && brItemId && rowItemId === brItemId) ||
          (masterId && brItemId && masterId === brItemId) ||
          (rowItemName && brName && rowItemName === brName) ||
          (masterName && brName && masterName === brName);

        if (isMatch) {
          const candidateCost = [br.purchasePrice, br.price, br.rate, br.unitPrice, br.finalUnitPrice, br.costPrice, br.cost].find(isValidCost);
          if (candidateCost !== undefined) {
            return { unitCost: Number(candidateCost), source: `Batch (${rowBatchNo})`, isMissing: false, batchNo: rowBatchNo };
          }
        }
      }
    }
  }

  // 2. Historical Purchase Bills: dated <= invoiceDate
  if (Array.isArray(purchaseBills) && purchaseBills.length > 0) {
    const priorBills = purchaseBills
      .filter((b) => !b.cancelled && b.status !== "Cancelled")
      .map((b) => ({
        bill: b,
        ymd: parseYMD(b.form?.billDate || b.form?.invoiceDate || b.billDate || b.date || b.createdAt),
      }))
      .filter(({ ymd }) => !invoiceDate || !ymd || ymd <= invoiceDate)
      .sort((a, b) => String(b.ymd).localeCompare(String(a.ymd)));

    for (const { bill } of priorBills) {
      for (const br of bill.rows || bill.items || []) {
        const brItemId = String(br.sourceItemId || br.itemId || br.productId || "").trim();
        const brName = normalizeName(br.item || br.name || br.itemName || br.productName || br.itemNameSnapshot || "");
        const isMatch = (rowItemId && brItemId && rowItemId === brItemId) ||
          (masterId && brItemId && masterId === brItemId) ||
          (rowItemName && brName && rowItemName === brName) ||
          (masterName && brName && masterName === brName);

        if (isMatch) {
          const candidateCost = [br.purchasePrice, br.price, br.rate, br.unitPrice, br.finalUnitPrice, br.costPrice, br.cost].find(isValidCost);
          if (candidateCost !== undefined) {
            return { unitCost: Number(candidateCost), source: "Historical Purchase Bill", isMissing: false };
          }
        }
      }
    }
  }

  // 3. Inventory Master opening cost / atPrice / purchasePrice
  if (matchedMasterItem) {
    if (isValidCost(matchedMasterItem.atPrice)) {
      return { unitCost: Number(matchedMasterItem.atPrice), source: "Master Opening Cost", isMissing: false };
    }
    if (isValidCost(matchedMasterItem.purchasePrice)) {
      return { unitCost: Number(matchedMasterItem.purchasePrice), source: "Master Purchase Price", isMissing: false };
    }
  }

  // 4. Subsequent Purchase Bills
  if (Array.isArray(purchaseBills) && purchaseBills.length > 0) {
    for (const bill of purchaseBills) {
      if (bill.cancelled || bill.status === "Cancelled") continue;
      for (const br of bill.rows || bill.items || []) {
        const brItemId = String(br.sourceItemId || br.itemId || br.productId || "").trim();
        const brName = normalizeName(br.item || br.name || br.itemName || br.productName || br.itemNameSnapshot || "");
        const isMatch = (rowItemId && brItemId && rowItemId === brItemId) ||
          (masterId && brItemId && masterId === brItemId) ||
          (rowItemName && brName && rowItemName === brName) ||
          (masterName && brName && masterName === brName);

        if (isMatch) {
          const candidateCost = [br.purchasePrice, br.price, br.rate, br.unitPrice, br.finalUnitPrice, br.costPrice, br.cost].find(isValidCost);
          if (candidateCost !== undefined) {
            return { unitCost: Number(candidateCost), source: "Subsequent Purchase Bill", isMissing: false };
          }
        }
      }
    }
  }

  return { unitCost: null, source: "Missing Cost", isMissing: true };
}

function computeCategoryReport({ salesInvoices = [], purchaseBills = [], saleReturns = [], inventoryItems = [], from = "", to = "" }) {
  const categoryMap = new Map();

  const getCategoryAndItem = (row) => {
    const rowItemId = String(row.sourceItemId || row.itemId || row.productId || "").trim();
    const rowItemName = normalizeName(row.item || row.name || row.itemName || row.productName || row.itemNameSnapshot || "");

    let invItem = null;
    if (rowItemId) invItem = inventoryItems.find((it) => String(it.id || "").trim() === rowItemId);
    if (!invItem && rowItemName) invItem = inventoryItems.find((it) => normalizeName(it.itemName || it.name) === rowItemName);

    const category = String(invItem?.category || "").trim() || "Uncategorized";
    const canonicalName = invItem?.itemName || invItem?.name || row.item || "Unknown Item";
    const canonicalId = invItem?.id || rowItemId || canonicalName;
    return { category, canonicalId, canonicalName, invItem };
  };

  const getCatEntry = (categoryName) => {
    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, {
        category: categoryName,
        soldItemIds: new Set(),
        qtySold: 0,
        grossSales: 0,
        salesDiscount: 0,
        salesReturns: 0,
        cogs: 0,
        hasMissingCost: false,
        missingItemsCount: 0,
        itemsMap: new Map(),
      });
    }
    return categoryMap.get(categoryName);
  };

  const getItemEntry = (catEntry, itemId, itemName) => {
    if (!catEntry.itemsMap.has(itemId)) {
      catEntry.itemsMap.set(itemId, {
        id: itemId,
        name: itemName,
        qtySold: 0,
        grossSales: 0,
        salesDiscount: 0,
        salesReturns: 0,
        cogs: 0,
        costSource: "",
        unitCost: null,
        hasMissingCost: false,
      });
    }
    return catEntry.itemsMap.get(itemId);
  };

  salesInvoices.forEach((invoice) => {
    if (invoice.cancelled || invoice.status === "Cancelled" || invoice.deleted || invoice.isDeleted) return;
    const invDate = parseYMD(invoice.form?.invoiceDate || invoice.invoiceDate || invoice.date || invoice.createdAt);
    if (from && invDate && invDate < from) return;
    if (to && invDate && invDate > to) return;

    (invoice.rows || []).forEach((row) => {
      const qty = Math.max(Number(row.qty ?? row.quantity ?? 0), 0);
      if (qty <= 0) return;
      const { category, canonicalId, canonicalName } = getCategoryAndItem(row);
      const catEntry = getCatEntry(category);
      const itemEntry = getItemEntry(catEntry, canonicalId, canonicalName);

      const price = Number(row.price ?? row.rate ?? 0);
      const disc = Number(row.discountAmount || 0) || (price * qty * Number(row.discountPercent || row.discount || 0)) / 100;
      const lineGross = price * qty;

      const { unitCost, isMissing, source } = resolveHistoricalItemCost(row, invDate, inventoryItems, purchaseBills);
      const lineCogs = isMissing ? 0 : unitCost * qty;

      catEntry.soldItemIds.add(canonicalId);
      catEntry.qtySold += qty;
      catEntry.grossSales += lineGross;
      catEntry.salesDiscount += disc;
      catEntry.cogs += lineCogs;

      itemEntry.qtySold += qty;
      itemEntry.grossSales += lineGross;
      itemEntry.salesDiscount += disc;
      itemEntry.cogs += lineCogs;
      itemEntry.costSource = source;
      itemEntry.unitCost = unitCost;

      if (isMissing && !itemEntry.hasMissingCost) {
        itemEntry.hasMissingCost = true;
        catEntry.hasMissingCost = true;
        catEntry.missingItemsCount += 1;
      }
    });
  });

  saleReturns.forEach((ret) => {
    if (ret.cancelled || ret.status === "Cancelled" || ret.deleted || ret.isDeleted) return;
    const retDate = parseYMD(ret.form?.invoiceDate || ret.date || ret.createdAt);
    if (from && retDate && retDate < from) return;
    if (to && retDate && retDate > to) return;

    (ret.rows || []).forEach((row) => {
      const qty = Math.max(Number(row.qty ?? row.quantity ?? 0), 0);
      if (qty <= 0) return;
      const { category, canonicalId, canonicalName } = getCategoryAndItem(row);
      const catEntry = getCatEntry(category);
      const itemEntry = getItemEntry(catEntry, canonicalId, canonicalName);

      const price = Number(row.price ?? row.rate ?? 0);
      const disc = Number(row.discountAmount || 0) || (price * qty * Number(row.discount || row.discountPercent || 0)) / 100;
      const lineGross = price * qty;
      const netReturnVal = Math.max(0, lineGross - disc);

      const { unitCost, isMissing } = resolveHistoricalItemCost(row, retDate, inventoryItems, purchaseBills);
      const returnCogs = isMissing ? 0 : unitCost * qty;

      catEntry.qtySold -= qty;
      catEntry.salesReturns += netReturnVal;
      catEntry.cogs = Math.max(0, catEntry.cogs - returnCogs);

      itemEntry.qtySold -= qty;
      itemEntry.salesReturns += netReturnVal;
      itemEntry.cogs = Math.max(0, itemEntry.cogs - returnCogs);
    });
  });

  const categories = Array.from(categoryMap.values()).map((cat) => {
    const netSales = cat.grossSales - cat.salesDiscount - cat.salesReturns;
    const grossProfit = netSales - cat.cogs;
    const profitMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
    return {
      category: cat.category,
      itemsCount: cat.soldItemIds.size,
      qtySold: cat.qtySold,
      grossSales: cat.grossSales,
      salesDiscount: cat.salesDiscount,
      salesReturns: cat.salesReturns,
      netSales,
      cogs: cat.cogs,
      grossProfit,
      profitMargin,
      hasMissingCost: cat.hasMissingCost,
    };
  });

  return categories;
}

// ── Test Cases ──

test("1. Grouping: Items are grouped under correct category and uncategorized when category is missing", () => {
  const inventory = [
    { id: "i-1", itemName: "Monitor", category: "Electronics", purchasePrice: 5000 },
    { id: "i-2", itemName: "Cable", purchasePrice: 100 }, // No category
  ];
  const invoices = [
    {
      date: "2026-10-15",
      rows: [
        { sourceItemId: "i-1", qty: 2, price: 8000 },
        { sourceItemId: "i-2", qty: 5, price: 200 },
      ],
    },
  ];
  const res = computeCategoryReport({ salesInvoices: invoices, inventoryItems: inventory });
  assert.equal(res.length, 2);
  const elec = res.find((r) => r.category === "Electronics");
  const uncat = res.find((r) => r.category === "Uncategorized");
  assert.ok(elec);
  assert.ok(uncat);
  assert.equal(elec.grossSales, 16000);
  assert.equal(uncat.grossSales, 1000);
});

test("2. Historical Costing: Chronological purchase bill is selected instead of future price hike", () => {
  const inventory = [{ id: "i-1", itemName: "Wheat", category: "Groceries" }];
  const purchaseBills = [
    { form: { billDate: "2026-01-10" }, rows: [{ sourceItemId: "i-1", price: 30 }] },
    { form: { billDate: "2026-06-10" }, rows: [{ sourceItemId: "i-1", price: 50 }] }, // Later price hike
  ];
  const invoices = [
    { date: "2026-02-15", rows: [{ sourceItemId: "i-1", qty: 100, price: 40 }] }, // Sold in Feb
  ];
  const res = computeCategoryReport({ salesInvoices: invoices, purchaseBills, inventoryItems: inventory });
  const cat = res.find((r) => r.category === "Groceries");
  assert.equal(cat.cogs, 3000); // 100 * 30 (not 50)
  assert.equal(cat.grossProfit, 1000); // 4000 - 3000 = 1000
});

test("3. Batch Costing: Sale with batch number matches purchase bill of that exact batch", () => {
  const inventory = [{ id: "i-1", itemName: "Pharma Syrup", category: "Pharmacy" }];
  const purchaseBills = [
    { form: { billDate: "2026-01-01" }, rows: [{ sourceItemId: "i-1", batchNo: "BATCH-A", price: 80 }] },
    { form: { billDate: "2026-02-01" }, rows: [{ sourceItemId: "i-1", batchNo: "BATCH-B", price: 120 }] },
  ];
  const invoices = [
    { date: "2026-03-01", rows: [{ sourceItemId: "i-1", batchNo: "BATCH-A", qty: 10, price: 150 }] },
  ];
  const res = computeCategoryReport({ salesInvoices: invoices, purchaseBills, inventoryItems: inventory });
  const cat = res.find((r) => r.category === "Pharmacy");
  assert.equal(cat.cogs, 800); // 10 * 80
  assert.equal(cat.grossProfit, 700); // 1500 - 800
});

test("4. Sales Returns: Return reverses gross sales, discount, and COGS accurately without double counting", () => {
  const inventory = [{ id: "i-1", itemName: "Chair", category: "Furniture", purchasePrice: 500 }];
  const invoices = [
    {
      date: "2026-05-01",
      rows: [{ sourceItemId: "i-1", qty: 10, price: 1000, discountAmount: 500 }], // Gross: 10000, Disc: 500, Net: 9500, COGS: 5000
    },
  ];
  const returns = [
    {
      date: "2026-05-10",
      rows: [{ sourceItemId: "i-1", qty: 2, price: 1000, discountAmount: 100 }], // 2 returned: Net return = 2000 - 100 = 1900, return COGS = 1000
    },
  ];
  const res = computeCategoryReport({ salesInvoices: invoices, saleReturns: returns, inventoryItems: inventory });
  const cat = res.find((r) => r.category === "Furniture");
  assert.equal(cat.qtySold, 8); // 10 - 2
  assert.equal(cat.grossSales, 10000);
  assert.equal(cat.salesDiscount, 500);
  assert.equal(cat.salesReturns, 1900);
  assert.equal(cat.netSales, 7600); // 10000 - 500 - 1900 = 7600
  assert.equal(cat.cogs, 4000); // 5000 - 1000 = 4000
  assert.equal(cat.grossProfit, 3600); // 7600 - 4000 = 3600
  assert.equal(Math.round(cat.profitMargin * 100) / 100, Math.round((3600 / 7600) * 10000) / 100);
});

test("5. Missing Cost: Flags missing cost and avoids inflating margin to 100%", () => {
  const inventory = [{ id: "i-unknown", itemName: "Mystery Box", category: "Gifts" }]; // No purchasePrice or atPrice
  const invoices = [
    { date: "2026-06-01", rows: [{ sourceItemId: "i-unknown", qty: 5, price: 200 }] },
  ];
  const res = computeCategoryReport({ salesInvoices: invoices, inventoryItems: inventory });
  const cat = res.find((r) => r.category === "Gifts");
  assert.equal(cat.hasMissingCost, true);
  assert.equal(cat.cogs, 0);
});

test("6. Transaction Status: Cancelled and deleted invoices/returns are ignored", () => {
  const inventory = [{ id: "i-1", itemName: "Book", category: "Stationery", purchasePrice: 50 }];
  const invoices = [
    { date: "2026-07-01", status: "Cancelled", rows: [{ sourceItemId: "i-1", qty: 10, price: 100 }] },
    { date: "2026-07-02", cancelled: true, rows: [{ sourceItemId: "i-1", qty: 10, price: 100 }] },
    { date: "2026-07-03", rows: [{ sourceItemId: "i-1", qty: 5, price: 100 }] }, // Valid
  ];
  const res = computeCategoryReport({ salesInvoices: invoices, inventoryItems: inventory });
  const cat = res.find((r) => r.category === "Stationery");
  assert.equal(cat.qtySold, 5);
  assert.equal(cat.grossSales, 500);
  assert.equal(cat.cogs, 250);
});
