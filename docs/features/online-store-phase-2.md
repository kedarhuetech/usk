# Online Store Phase 2

Purpose: give created stores a compact owner dashboard and customer-style preview.

Flow:
1. Business Growth -> Online Store opens setup if no store exists.
2. Once created, Online Store opens the Store Dashboard.
3. Dashboard actions: Preview Store, Manage Items, Edit Store Details.
4. Manage Items reuses the Phase 1 selected inventory item flow.
5. Preview Store shows only selected inventory items.

Files:
- `src/pages/BusinessGrowth/OnlineStore/OnlineStore.jsx`: dashboard, details modal, storefront preview, product modal.
- `src/services/onlineStoreStorage.js`: adds store detail fields to existing prototype state.
- `src/services/itemsStorage.js`: normalizes shared inventory records and storefront pricing.
- `src/pages/Items/AddItem.jsx`: passes complete existing Add Item payload to shared storage.

Data flow:
Inventory still comes from `getInventoryItems`.
Online Store stores selected item ids, not copied products.
Preview filters current shared inventory by saved selected ids.
Store details are saved in `ledgerly:onlineStore.v1`.

Phase 2.1:
Shared items now preserve type, HSN/SAC, code, unit, image, sale price, discount, wholesale, tax, and stock fields.
Discount calculation supports percentage and fixed amount, with original/final price shown consistently.
Products show stock status; services skip physical stock.
Tax mode/rate and unit display without adding cart, checkout, or invoice logic.

Phase 3:
Purpose: make the dashboard the owner-side store management screen.
Owner flow: Edit Store, Store Settings, Manage Items, Preview Store, Share Store/Product.
Store settings persist accept orders, minimum order amount, and optional additional charge.
Share actions use prototype links with Web Share support and copy-link fallback.
Files changed: `OnlineStore.jsx`, `onlineStoreStorage.js`, and this doc.

Item edit update:
Manage Items has an Edit Item action on owner-side item cards.
It opens the existing Add/Edit Item editor prefilled from shared inventory.
Saving updates the same inventory id, so published selection remains intact.
Copy/share feedback now appears as a temporary auto-dismiss toast.

Customer storefront:
Owner share links now open the standalone `/store/:storeId` customer storefront.
See `docs/features/online-store-customer-storefront.md`.

Inventory batch update:
Batch fields are now universal and optional: lot, brand, dates, remarks, opening qty.
The old Dosage field is replaced by Remarks and restored from legacy rows.
Batch total updates from opening qty rows and syncs to item opening stock.
Online Store reads that same shared item stock, with no duplicate inventory field.

Product UI polish:
Preview product grid now uses responsive equal-height cards with smaller contained images.
Product detail modal now uses a balanced image/details layout and compact read-only actions.
Pricing, discount, tax, stock, item data, and share flow remain unchanged.
Files changed: `OnlineStore.jsx` and this doc.

Manager summary:
Created stores now open to a management dashboard instead of setup.
Owners can edit basic store details and preview the customer catalogue.
Customers see searchable, category-filtered selected products only.
Cart, checkout, orders, payments, and public URLs remain later phases.
