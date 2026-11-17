import test from "node:test";
import assert from "node:assert/strict";
import { deleteBusinessItem } from "./businessRecords.js";
import { getInventoryItems, inventoryItemsStorageKey, saveInventoryItem } from "./itemsStorage.js";
import { deleteAllInventoryItems } from "./inventoryItemBulkDelete.js";
import { STORAGE_MODE_KEY } from "./dataStorageConfig.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function setupBrowserEnvironment({ storageMode = "database" } = {}) {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_MODE_KEY, storageMode);

  globalThis.window = {
    localStorage: storage,
    document: {},
    dispatchEvent: () => true,
    CustomEvent: class { constructor(type, detail) { this.type = type; this.detail = detail; } },
  };

  const initialItems = [
    { id: "item-1", itemName: "Item 1", type: "product", isActive: true },
    { id: "item-2", itemName: "Item 2", type: "product", isActive: true },
  ];
  storage.setItem(inventoryItemsStorageKey, JSON.stringify(initialItems));

  const previousFetch = globalThis.fetch;

  return {
    storage,
    restore: () => {
      globalThis.fetch = previousFetch;
      delete globalThis.window;
    },
  };
}

test("deleteBusinessItem: Awaited remote deletion succeeds and removes item from local storage", async () => {
  const env = setupBrowserEnvironment();
  let deleteCalledWithUrl = "";

  globalThis.fetch = async (url, options) => {
    deleteCalledWithUrl = url;
    assert.equal(options.method, "DELETE");
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true, action: "deleted" }),
    };
  };

  try {
    const result = await deleteBusinessItem("item-1");
    assert.equal(result.success, true);
    assert.ok(deleteCalledWithUrl.includes("/items/item-1"));

    const remaining = getInventoryItems();
    assert.equal(remaining.some((i) => i.id === "item-1"), false, "Item 1 must be removed from local storage");
    assert.equal(remaining.some((i) => i.id === "item-2"), true, "Item 2 must remain");
  } finally {
    env.restore();
  }
});

test("deleteBusinessItem: Network / backend failure halts deletion and preserves local item", async () => {
  const env = setupBrowserEnvironment();

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ success: false, message: "Database connection failed" }),
    };
  };

  try {
    await assert.rejects(
      async () => {
        await deleteBusinessItem("item-1");
      },
      /Database connection failed|Request failed/
    );

    // Verify item was NOT removed from local storage
    const items = getInventoryItems();
    assert.equal(items.some((i) => i.id === "item-1"), true, "Item 1 must NOT be deleted when backend fails");
  } finally {
    env.restore();
  }
});

test("deleteBusinessItem: Deactivation updates item in local storage to isActive = false", async () => {
  const env = setupBrowserEnvironment();

  globalThis.fetch = async (url, options) => {
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        success: true,
        action: "deactivated",
        message: "Item deactivated",
      }),
    };
  };

  try {
    const result = await deleteBusinessItem("item-1", { deactivate: true });
    assert.equal(result.action, "deactivated");

    const items = getInventoryItems();
    const item1 = items.find((i) => i.id === "item-1");
    assert.ok(item1, "Item 1 must still exist");
    assert.equal(item1.isActive, false, "Item 1 must be marked inactive");
  } finally {
    env.restore();
  }
});

test("Bulk Deletion: deleteAllInventoryItems throws error in database mode and preserves data", () => {
  const env = setupBrowserEnvironment({ storageMode: "database" });

  try {
    assert.throws(
      () => {
        deleteAllInventoryItems(2);
      },
      /Bulk deletion of items is disabled in database mode/
    );

    // Confirm local storage items were NOT cleared
    const items = getInventoryItems();
    assert.equal(items.length, 2, "Items must remain untouched in database mode");
  } finally {
    env.restore();
  }
});
