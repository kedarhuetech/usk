const ADJUSTMENTS_KEY = "ledgerly:inventoryAdjustments.v1";

function readAdjustments() {
  try {
    const value = JSON.parse(window.localStorage.getItem(ADJUSTMENTS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function getInventoryAdjustments(itemId) {
  return readAdjustments().filter((adjustment) => adjustment.itemId === itemId);
}

export function saveInventoryAdjustment(adjustment) {
  const entry = { ...adjustment, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  window.localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify([...readAdjustments(), entry]));
  return entry;
}
