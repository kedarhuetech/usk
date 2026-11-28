import { apiRequest } from "./apiClient.js";

// POS persistence boundary. These methods intentionally call the APIs directly
// instead of shared storage repositories, which mirror data into LocalStorage.
export const posRepository = {
  async loadProducts() {
    const rows = await apiRequest("/items?limit=all");
    return Array.isArray(rows) ? rows : rows?.data || [];
  },
  async loadCustomers() {
    const rows = await apiRequest("/parties?limit=all");
    return Array.isArray(rows) ? rows : rows?.data || [];
  },
  async saveCustomer(customer) {
    return apiRequest("/parties", { method: "POST", body: JSON.stringify(customer) });
  },
  async saveProduct(product) {
    return apiRequest("/items", { method: "POST", body: JSON.stringify(product) });
  },
  async loadDrafts() {
    const rows = await apiRequest("/pos/drafts");
    return Array.isArray(rows) ? rows : rows?.data || [];
  },
  async saveDraft(draft, expectedUpdatedAt = null) {
    if (!draft?.id) throw new Error("A draft ID is required.");
    return apiRequest(`/pos/drafts/${encodeURIComponent(draft.id)}`, {
      method: "PUT",
      headers: expectedUpdatedAt ? { "If-Match": String(expectedUpdatedAt) } : {},
      body: JSON.stringify(draft),
    });
  },
  async deleteDraft(id) {
    return apiRequest(`/pos/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async finalizeDraft(id, payload) {
    return apiRequest(`/pos/drafts/${encodeURIComponent(id)}/finalize`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async loadCompletedBills({ page = 1, limit = 50 } = {}) {
    const query = new URLSearchParams({ type: "sale", page: String(page), limit: String(limit) });
    const rows = await apiRequest(`/transactions?${query}`);
    return Array.isArray(rows) ? rows : rows?.data || [];
  },
  inspectLegacyData() {
    if (typeof window === "undefined") return [];
    const markers = [
      "pos_saved_bills_v1", "pos_open_bills_v1", "pos_active_bill_id_v1",
      "pos_draft_v1", "pos_customers_v1", "sale_invoices_v1", "saleinvoices.v1",
      "inventory_items_v1", "inventoryitems.v1", "parties.v1", "batchmovements.v1",
    ];
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key) => key && markers.some((marker) => key.toLowerCase().includes(marker)));
    return keys.flatMap((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      try {
        const value = JSON.parse(raw);
        const records = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
        return records.length ? [{ key, records }] : [];
      } catch {
        return [{ key, records: [], invalid: true }];
      }
    });
  },
  exportLegacyData(legacyRecords) {
    if (typeof document === "undefined") return;
    const blob = new Blob([JSON.stringify(legacyRecords, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pos-legacy-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
