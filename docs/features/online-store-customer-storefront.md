# Online Store Customer Storefront

Purpose: add a standalone customer-facing storefront for a created Online Store.

Customer flow:
1. Owner copies/shares `/store/:storeId`.
2. Customer opens the clean storefront without admin layout.
3. Customer browses selected inventory items with search and category filters.
4. Product detail supports quantity selection and Add to Cart.
5. Cart collects customer details and places a prototype order.
6. Success screen shows order id, store name, and total.

Files:
- `src/App.jsx`: adds public `/store/:storeId` route outside `MainLayout`.
- `src/pages/BusinessGrowth/OnlineStore/OnlineStore.jsx`: share links now point to customer route.
- `src/pages/BusinessGrowth/OnlineStore/CustomerStorefront.jsx`: public catalogue, cart, checkout, success UI.
- `src/services/onlineStoreOrdersStorage.js`: local prototype order persistence.

Cart/order data flow:
Cart stores only inventory item ids and quantities.
Product details/prices are resolved from shared `getInventoryItems`.
Orders store customer details, item ids, quantities, prices at order time, totals, and `new` status.

Owner settings used:
Accept Online Orders controls cart/order availability.
Minimum Order Amount blocks checkout until reached.
Additional Charges add saved charge name/amount to total.

Stock sync:
Item `openingQuantity` is the canonical master stock value.
Batch opening qty totals sync into `openingQuantity` and its `stock` mirror.
The storefront refreshes shared inventory by item id, so stock status persists after reload.

Owner orders: saved customer orders appear in `docs/features/online-store-orders.md`.

Limitation: frontend prototype only; no backend, payments, stock deduction, or invoice conversion yet.

Manager summary:
Customers can now open a shared store link and shop selected published items.
The cart respects owner settings and creates a saved prototype order.
Inventory remains single-source, so storefront updates when items change.
