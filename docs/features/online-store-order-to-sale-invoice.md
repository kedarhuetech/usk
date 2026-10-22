# Online Order To Sale Invoice

Purpose: convert accepted Online Store orders through the existing Add Sale flow.

Flow:
Accepted Online Order -> Existing Add Sale -> Save -> Sales/Sale Invoices.

Files:
- `src/pages/BusinessGrowth/OnlineStore/OnlineStore.jsx`: convert action and converted reference.
- `src/pages/Sales/AddSale.jsx`: reads order handoff, preloads customer/items, saves normally.
- `src/pages/Sales/SaleInvoices.jsx`: lists saved sale invoices.
- `src/services/salesStorage.js`: shared frontend sale invoice persistence and sale stock update.
- `src/services/itemsStorage.js`: canonical inventory stock sync for saved sale invoices.
- `src/services/onlineStoreOrdersStorage.js`: stores converted sale reference.

Order -> Sale mapping:
Customer name, mobile, and address map to Add Sale customer fields.
Order item snapshots map to sale rows: name, qty, unit, price, discount, tax, line total.
Current inventory prices are not used for historical conversion pricing.

Reuse:
No separate Online Store invoice form is created.
Totals continue through `saleInvoice.js` and Add Sale validation.
Additional charges are preserved in the sale description note for now.

Link protection:
Order is marked converted only after Add Sale Save succeeds.
Converted orders store sale id, invoice id/number, and converted time.
Converted, New, and Rejected orders cannot be converted again.

Stock note:
Manual sales and converted online orders now use the same `saveSaleInvoice` stock path.
Product stock deducts from inventory `openingQuantity`, mirrored to `stock`, after sale save only.
Batch rows are preserved; there is no FIFO/batch-wise sale allocation yet.
Storefront stock reads shared inventory, so refresh/focus shows the updated availability.

Limitation: frontend localStorage prototype only; no backend API, payment, or SQL migration yet.

Manager summary:
Accepted online orders now become normal sale invoices after owner review.
The invoice lands in the existing Sales list, not a separate store invoice area.
This prepares the later backend model without duplicating invoice logic.
