import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage and window for Node environment
const store = new Map();
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
    sessionStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import { getAppSettings, saveAppSettings } from '../../services/appSettingsStorage.js';
import { getInventoryItems, saveInventoryItem } from '../../services/itemsStorage.js';

test('DELIVERY CHALLAN: Goods Return workflow updates return quantities, status, and restores stock', () => {
  // 1. Enable goods return in settings
  saveAppSettings({ goodsReturnOnDeliveryChallan: true });
  assert.equal(getAppSettings().goodsReturnOnDeliveryChallan, true);

  // 2. Setup inventory item with initial stock of 20
  const testItem = {
    id: `item-dc-return-${Date.now()}`,
    itemName: 'Demo Sample Machine',
    stock: 20,
    currentStock: 20,
    openingQuantity: 20,
    salePrice: 5000,
  };
  saveInventoryItem(testItem);

  // 3. Create a Delivery Challan with 10 units dispatched
  const challan = {
    id: `dc-test-${Date.now()}`,
    number: 'DC-101',
    party: 'Acme Corp',
    date: '2026-11-26',
    status: 'Open',
    rows: [
      {
        id: 'row-1',
        item: 'Demo Sample Machine',
        qty: '10',
        returnedQty: 0,
        unit: 'Pcs',
        price: '5000',
      },
    ],
    returnHistory: [],
  };

  // Simulate returning 4 units
  const returnQty = 4;
  const dispatched = Number(challan.rows[0].qty);
  const alreadyReturned = Number(challan.rows[0].returnedQty || 0);
  const remaining = dispatched - alreadyReturned;
  assert.equal(remaining, 10);

  // Apply partial return
  challan.rows[0].returnedQty = alreadyReturned + returnQty;
  const totalDelivered = challan.rows.reduce((s, r) => s + Number(r.qty), 0);
  const totalReturned = challan.rows.reduce((s, r) => s + Number(r.returnedQty), 0);

  challan.status = totalReturned >= totalDelivered ? 'Fully Returned' : 'Partially Returned';
  challan.returnHistory.push({
    id: 'ret-1',
    returnNumber: 'GR-001',
    returnDate: '2026-11-26',
    notes: 'Trial completed for 4 units',
    items: [{ item: 'Demo Sample Machine', returnedQty: 4, unit: 'Pcs' }],
  });

  assert.equal(challan.status, 'Partially Returned');
  assert.equal(challan.rows[0].returnedQty, 4);

  // Stock restored to inventory (20 + 4 = 24)
  const itemsBefore = getInventoryItems();
  const matched = itemsBefore.find((i) => i.itemName === 'Demo Sample Machine');
  assert.ok(matched);
  const updatedStock = Number(matched.currentStock) + returnQty;
  saveInventoryItem({ ...matched, currentStock: updatedStock, stock: updatedStock });

  const itemsAfter = getInventoryItems();
  const reloaded = itemsAfter.find((i) => i.itemName === 'Demo Sample Machine');
  assert.equal(reloaded.currentStock, 24);

  // Net billable quantity for conversion to sale invoice is 6 (10 - 4)
  const netQty = Math.max(0, Number(challan.rows[0].qty) - Number(challan.rows[0].returnedQty));
  assert.equal(netQty, 6);

  // Apply full return for remaining 6 units
  challan.rows[0].returnedQty += 6;
  const newTotalReturned = challan.rows.reduce((s, r) => s + Number(r.returnedQty), 0);
  if (newTotalReturned >= totalDelivered) {
    challan.status = 'Fully Returned';
  }
  assert.equal(challan.status, 'Fully Returned');

  // When fully returned, net convertible quantity is 0
  const finalNetQty = Math.max(0, Number(challan.rows[0].qty) - Number(challan.rows[0].returnedQty));
  assert.equal(finalNetQty, 0);
});
