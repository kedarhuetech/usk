import test from "node:test";
import assert from "node:assert/strict";

test("Inactive item filtering logic: excludes items marked inactive across both schema formats", () => {
  const isItemActive = (item) =>
    Boolean(item && item.isActive !== false && item.is_active !== 0 && item.is_active !== "0");

  const sampleItems = [
    { id: "1", itemName: "Active Item A", isActive: true },
    { id: "2", itemName: "Active Item B", is_active: 1 },
    { id: "3", itemName: "Inactive Item A", isActive: false },
    { id: "4", itemName: "Inactive Item B", is_active: 0 },
    { id: "5", itemName: "Inactive Item C", is_active: "0" },
    { id: "6", itemName: "Active Item C" },
  ];

  const filtered = sampleItems.filter(isItemActive);

  assert.equal(filtered.length, 3);
  assert.deepEqual(filtered.map((i) => i.id), ["1", "2", "6"]);
});

test("Delivery Challan & Purchase Returns: service exclusion combined with inactive filtering", () => {
  const isItemActive = (item) =>
    Boolean(item && item.isActive !== false && item.is_active !== 0 && item.is_active !== "0");

  const items = [
    { id: "p1", itemName: "Active Product", type: "product", isActive: true },
    { id: "p2", itemName: "Inactive Product", type: "product", isActive: false },
    { id: "s1", itemName: "Active Service", type: "service", isActive: true },
    { id: "p3", itemName: "Active Product 2", type: "product", is_active: 1 },
    { id: "p4", itemName: "Inactive Product 2", type: "product", is_active: 0 },
  ];

  const allowedForChallan = items.filter((item) => item.type !== "service" && isItemActive(item));

  assert.equal(allowedForChallan.length, 2);
  assert.deepEqual(allowedForChallan.map((i) => i.id), ["p1", "p3"]);
});

test("Manual typing validation: detects inactive item names and rejects them for new rows/transactions", () => {
  const inventory = [
    { id: "item-101", itemName: "Active Widget", isActive: true },
    { id: "item-102", itemName: "Discontinued Widget", isActive: false },
  ];

  const validateRows = (rows, originalTransactionRows = []) => {
    const originalNames = new Set(
      originalTransactionRows.map((r) => String(r.item || "").trim().toLowerCase()).filter(Boolean)
    );
    const inactiveRow = rows.find((row) => {
      const name = String(row.item || "").trim().toLowerCase();
      if (!name) return false;
      if (originalNames.has(name)) return false;
      const match = inventory.find(
        (it) =>
          (it.id && (it.id === row.itemId || it.id === row.sourceItemId)) ||
          String(it.itemName || it.name || "").trim().toLowerCase() === name
      );
      return match && (match.isActive === false || match.is_active === 0);
    });
    return inactiveRow ? `Item "${inactiveRow.item}" is inactive and cannot be added.` : null;
  };

  // Case 1: Active item typed manually
  const resultActive = validateRows([{ item: "Active Widget", qty: 2 }]);
  assert.equal(resultActive, null);

  // Case 2: Inactive item typed manually on new transaction
  const resultInactive = validateRows([{ item: "Discontinued Widget", qty: 1 }]);
  assert.equal(resultInactive, 'Item "Discontinued Widget" is inactive and cannot be added.');

  // Case 3: Inactive item present on historical transaction
  const resultHistorical = validateRows(
    [{ item: "Discontinued Widget", qty: 1 }],
    [{ item: "Discontinued Widget", qty: 1 }]
  );
  assert.equal(resultHistorical, null, "Historical inactive item should not be blocked from viewing/saving");
});

test("AddSale buildInvoice & validation: rejects resolving manually typed inactive items for new rows", () => {
  const items = [
    { id: "item-1", name: "Paper", isActive: true },
    { id: "item-2", name: "Discontinued Ink", isActive: false },
  ];

  const buildInvoiceTest = (rows, editInvoice = null) => {
    const originalInvoiceItemIds = new Set(
      ((editInvoice?.items || editInvoice?.rows) || []).map((r) => String(r.sourceItemId || r.itemId || "").trim()).filter(Boolean)
    );
    const originalInvoiceItemNames = new Set(
      ((editInvoice?.items || editInvoice?.rows) || []).map((r) => String(r.item || r.name || r.itemName || "").trim().toLowerCase()).filter(Boolean)
    );

    return rows.map((row, index) => {
      const rowItemName = String(row.item || "").trim().toLowerCase();
      const isOriginalRow = editInvoice && (
        (row.sourceItemId && originalInvoiceItemIds.has(String(row.sourceItemId))) ||
        (row.itemId && originalInvoiceItemIds.has(String(row.itemId))) ||
        originalInvoiceItemNames.has(rowItemName)
      );
      const matchedItem = items.find((i) => {
        const isMatch =
          (row.sourceItemId && String(i.id) === String(row.sourceItemId)) ||
          (row.item && String(i.name || i.itemName || "").trim().toLowerCase() === rowItemName);
        if (!isMatch) return false;
        if (!isOriginalRow && (i.isActive === false || i.is_active === 0 || i.is_active === "0")) {
          return false;
        }
        return true;
      });
      const resolvedItemId = row.sourceItemId || row.itemId || matchedItem?.id || "";
      return { ...row, itemId: resolvedItemId, matched: Boolean(matchedItem) };
    });
  };

  // When creating a new invoice, manually typing "Discontinued Ink" should NOT resolve/link to item-2
  const newInvoiceRows = buildInvoiceTest([{ item: "Discontinued Ink", qty: 1 }]);
  assert.equal(newInvoiceRows[0].matched, false);
  assert.equal(newInvoiceRows[0].itemId, "");

  // When editing an invoice where "Discontinued Ink" was already an original line, it remains resolved
  const existingInvoice = { items: [{ item: "Discontinued Ink", itemId: "item-2" }] };
  const editedInvoiceRows = buildInvoiceTest([{ item: "Discontinued Ink", qty: 1 }], existingInvoice);
  assert.equal(editedInvoiceRows[0].matched, true);
  assert.equal(editedInvoiceRows[0].itemId, "item-2");
});
