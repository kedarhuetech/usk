# Online Store Phase 1

Purpose: start Online Store setup from existing inventory, without creating a second product system.

Flow:
1. Business Growth -> Online Store opens the Phase 1 setup page.
2. If inventory is empty, the page shows onboarding with Add Item.
3. Add Item opens the existing `AddItem` component in embedded mode.
4. Saved items appear in Online Store for selection.
5. Selected item ids are saved with a basic created-store state.

Files:
- `src/App.jsx`: adds the Online Store route.
- `src/pages/BusinessGrowth/OnlineStore/OnlineStore.jsx`: Phase 1 UI and item selection.
- `src/pages/Items/AddItem.jsx`: returns/persists reusable item payloads.
- `src/services/itemsStorage.js`: temporary inventory storage adapter.
- `src/services/onlineStoreStorage.js`: temporary store-selection storage adapter.

Data flow:
`AddItem` -> `saveInventoryItem` -> Online Store reads `getInventoryItems`.
Online Store saves only selected existing item ids, not duplicate products.
Storage adapters isolate localStorage so backend APIs can replace them later.

Manager summary:
Phase 1 lets a business create an Online Store draft from current inventory.
It reuses the existing Add Item workflow and item fields.
No cart, checkout, orders, payments, or storefront are included yet.
This prevents duplicate product maintenance in later phases.
