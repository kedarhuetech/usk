import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("Smart Ads repository saves, updates, lists, and deletes drafts without duplicates", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: new MemoryStorage() };
  try {
    const repository = await import(`./smartAdsStorage.js?test=${Date.now()}`);
    const first = await repository.saveDraft({ id: "draft-a", name: "First", wizardStep: 2, selectedAssets: { pageId: "page-1" } });
    await repository.saveDraft({ ...first, name: "First updated" });
    await repository.saveDraft({ id: "draft-b", name: "Second" });
    const records = await repository.getSmartAdsCampaigns();
    assert.equal(records.length, 2);
    assert.equal(records.find((item) => item.id === "draft-a").name, "First updated");
    assert.equal(records.find((item) => item.id === "draft-a").wizardStep, 2);
    assert.equal(records.find((item) => item.id === "draft-a").selectedAssets.pageId, "page-1");
    assert.equal(await repository.deleteSmartAdsCampaign("draft-b"), true);
    assert.equal((await repository.getSmartAdsCampaigns()).length, 1);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("Smart Ads repository persists settings and Meta-sourced metrics separately", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: new MemoryStorage() };
  try {
    const repository = await import(`./smartAdsStorage.js?metrics-test=${Date.now()}`);
    repository.saveSmartAdsSettings({ adAccountId: "act-1" });
    repository.saveSmartAdsMetricsSnapshot("meta-1", { impressions: 12 });
    assert.equal(repository.getSmartAdsSettings().adAccountId, "act-1");
    assert.equal(repository.getSmartAdsMetricsSnapshot("meta-1").source, "meta");
    assert.equal(repository.getSmartAdsMetricsSnapshot("meta-1").impressions, 12);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
