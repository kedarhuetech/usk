# Online Store Orders

Purpose: let owners review customer orders from the Online Store prototype.

Flow:
1. Customer places an order on `/store/:storeId`.
2. Customer Storefront saves it through the order storage service.
3. Owner opens Business Growth -> Online Store -> Online Orders.
4. Owner views order details and accepts or rejects new orders.

Files:
- `src/services/onlineStoreOrdersStorage.js`: normalized order storage and status updates.
- `src/pages/BusinessGrowth/OnlineStore/CustomerStorefront.jsx`: saves order-time item snapshots.
- `src/pages/BusinessGrowth/OnlineStore/OnlineStore.jsx`: owner dashboard entry, orders list, details, accept/reject.
- `docs/features/online-store-customer-storefront.md`: cross-reference to owner orders.

Status flow:
New orders can become Accepted or Rejected.
Rejected orders stay in history and are not deleted.
Accepted orders can convert through the existing Add Sale flow; see `online-store-order-to-sale-invoice.md`.

Order-time snapshots:
Each order item stores item id plus item name, unit, unit price, discount, final unit price, and line total.
Owner details read saved order totals, not current inventory prices.

Prototype storage:
Orders use `ledgerly:onlineStoreOrders.v1` in localStorage.
This maps later to `orders` and `order_items` API/database tables.

Manager summary:
Owners can now see incoming Online Store orders in one place.
Order details preserve the customer and pricing context at purchase time.
Accept/reject gives a simple operations workflow before invoice conversion.
