# UDYOG (USV) — COMPLETE END-TO-END APPLICATION AUDIT

**Audit Date:** 2026-11-27 (Validated & Updated)  
**Workspace:** `c:\Users\PC\Desktop\usk`  
**Audit Scope:** Full-stack architecture, Frontend (React 19 + Vite 8 + Tailwind v4), Backend (Express 5 + Node.js), Database (MySQL2), Business Logic & Accounting, Security, and Test Verification.  
**Audit Rule Compliance:** Zero application code or database records were modified during this audit.

---

## 1. Executive Summary

Udyog (USV) is a feature-rich GST billing, inventory, accounting, and business-growth web application. It includes a React frontend (~28+ report routes, POS, invoicing, inventory/batch tracking, cash & bank, Tally import/export, backup/restore, and marketing studio) paired with an Express 5 + MySQL2 backend defining **41 unique MySQL tables** (**36** in `server/src/db/initSchema.js`, **4** additional EAV/catalog tables in `server/database/schema.sql`, and **1** in `server/database/migrations/2026_11_create_hsn_codes.sql`) plus **7 SQL views**, exposed across **32 mounted route modules (~202 endpoints)**.

However, the application is **currently NOT READY for production**. While a large amount of UI and backend code exists, the codebase suffers from **critical schema-to-query mismatches**, **severe multi-tenant authentication gaps**, **split-brain persistence between `localStorage` and MySQL**, **double-stock-mutation risks**, and **runtime crashes** in core flows.

### Weighted Project Completion Breakdown

Calculated using the specified project weights (Frontend 15%, Backend/API 15%, Database Integration 20%, Data Persistence & Integrity 15%, Business Logic & Accounting 15%, Module Integration & Workflows 10%, Testing & Reliability 5%, Security 5%):

| Dimension | Weight | Score | Weighted Contribution | Status / Basis |
| --- | :---: | :---: | :---: | --- |
| Frontend Functionality | 15% | 72% | 10.80% | Most screens built & `vite build` passes; `AddSale.jsx` has a runtime `ReferenceError` (`isGstinEnabled`), `USKNetwork` & `ComingSoon` & `subscriptionService` are stubs, `WhatsAppConnect` hardcodes `connected: true`; `Home.jsx` is orphaned/unused. |
| Backend / API Functionality | 15% | 64% | 9.60% | 32 route modules (~202 endpoints) mounted; 4 core routers (`dashboardRouter`, `transactionsRouter`, `reportsRouter`, `cashBankRouter`) reference non-existent `transactions.status` column; `partiesRouter` `/send-otp` is a stub. |
| Database Integration | 20% | 50% | 10.00% | 41 unique tables defined, but live MySQL (`100.78.67.69:3306`) was unreachable (`EACCES`) in sandbox; `transactions.status` missing from schema; `VerifyMyData`, `ExportToTally`, `AppPasscode`, `Cheques`/`Loans`/`CashInHand` still rely on `localStorage` or have local-first paths. |
| Data Persistence & Integrity | 15% | 45% | 6.75% | `purchaseBillsStorage.js` & `serviceRemindersDb.save` swallow MySQL errors; `saveBusinessSaleInvoice`/`saveBusinessPurchaseBill` mutate local stock *and* backend stock *and* re-push items; `BACKUP_TABLES` omits 12+ tables. |
| Business Logic & Accounting | 15% | 55% | 8.25% | Differential party balance & unit conversion logic exist, but `transactions.status` breaks P&L/Dashboard/CashSync SQL; double stock deduction risk on sales/purchases; `Cheques` & `LoanAccounts` don't post to cash/bank ledgers. |
| Module Integration & Workflows | 10% | 52% | 5.20% | `Verify My Data` and `Export to Tally` read `localStorage` instead of MySQL (`README.md`); Online Store admin endpoints lack auth; Business Growth modules partially decoupled. |
| Testing & Reliability | 5% | 58% | 2.90% | 809 tests exist; 659 passed offline (502/567 frontend, 157/242 backend), 150 failed (mostly sandboxed `EACCES` on MySQL/sockets, plus 5 stale-key failures in `transactionRecordsStorage.test.js`); ESLint has 3 errors. |
| Security | 5% | 25% | 1.25% | Hardcoded `JWT_SECRET` fallback in `authMiddleware.js`; 9+ sensitive API routers mounted without `requireAuth` allowing `X-Business-Id` spoofing; SQL column injection risk in `backupRouter.js`; in-memory token revocation & OTP stores. |
| **TOTAL PROJECT COMPLETION** | **100%** | — | **54.75%** | **Rounded: 55% — NOT READY FOR PRODUCTION** |

### Summary Metrics
- **Overall Project Completion:** **55%** (54.75% exact weighted)
- **Verified Working (Build + Offline Unit Tests):** **34%**
- **Implemented but Unverified (Blocked by Live MySQL `EACCES`):** **21%**
- **Partially Implemented / Split-Brain (`localStorage` + MySQL):** **24%**
- **Broken (Confirmed Schema/Runtime/Test Failures):** **12%**
- **Missing (Not Implemented / Stubs):** **9%**
- **Overall Application Health:** **AT RISK (Critical P0/P1 issues present)**

### Top 5 Biggest Risks
1. **P0 — Unauthenticated Multi-Tenant APIs + Spoofable `X-Business-Id`:** `/api/business-growth`, `/api/business-data`, `/api/smart-ads`, `/api/online-store`, `/api/google-business`, `/api/meta-business`, `/api/meta/ads`, `/api/whatsapp-business`, and `/api/marketing-studio` have **no `requireAuth`** in `server/src/index.js`, and `businessIdFromRequest` trusts `X-Business-Id` when unauthenticated.
2. **P0 — Hardcoded `JWT_SECRET` Fallback:** `server/src/middleware/authMiddleware.js` falls back to `"usk_production_jwt_secret_key_99882233_secure_auth_token"` if `process.env.JWT_SECRET` is unset, enabling JWT forgery.
3. **P0 — `transactions.status` Column Missing from Schema:** `initSchema.js` creates `transactions` with `payment_status` and **no `status` column**, while `dashboardRouter.js`, `transactionsRouter.js`, `reportsRouter.js`, and `cashBankRouter.js` all query `status`, causing SQL `Unknown column 'status'` errors on a fresh schema.
4. **P0 — Silent MySQL Failure & Split-Brain Persistence:** `purchaseBillsStorage.js` (`savePurchaseBill`, `deletePurchaseBill`, `applyDebitNoteToPurchaseBill`, `applyPaymentToPurchaseBill`) and `databaseRepository.js` (`serviceRemindersDb.save`) write locally or return success even when MySQL fails.
5. **P1 — Runtime `ReferenceError` in `AddSale.jsx`:** ESLint (`no-undef`) caught `isGstinEnabled` used at lines 2625 and 2638 without being defined, which crashes the Edit Firm / E-Way Bill modal at runtime.

---

## 2. Complete Module Inventory (38 Modules Verified)

Per-module completion uses the exact weighted formula:  
`Overall % = round(0.15×Frontend + 0.15×Backend + 0.25×Database + 0.20×BusinessLogic + 0.15×Integration + 0.10×Testing)`  
*Note: Zero modules are marked `COMPLETE` because live MySQL connectivity (`100.78.67.69:3306`) could not be verified from the sandbox (`EACCES`).*

| Module | Frontend (15%) | Backend (15%) | Database (25%) | Business Logic (20%) | Integration (15%) | Testing (10%) | Overall % | Status |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| **Authentication & Multi-Tenancy** | 85% | 75% | 80% | 70% | 75% | 40% | **73%** | PARTIAL |
| **App Lock / Passcode** | 90% | 0% (N/A) | 0% (Local) | 85% | 50% | 90% | **47%** | PARTIAL |
| **Company Profile** | 85% | 85% | 85% | 80% | 75% | 40% | **78%** | UNVERIFIED |
| **Dashboard** | 75% | 40% (SQL bug) | 50% | 60% | 65% | 60% | **58%** | BROKEN |
| **Parties (Customers & Suppliers)** | 85% | 75% | 80% | 75% | 70% | 50% | **74%** | PARTIAL |
| **Items & Inventory (+ Batches)** | 85% | 80% | 80% | 70% | 70% | 55% | **75%** | PARTIAL |
| **Inventory Adjustments** | 75% | 80% | 80% | 75% | 65% | 40% | **72%** | PARTIAL |
| **Units & Unit Conversions** | 80% | 80% | 80% | 75% | 75% | 40% | **74%** | UNVERIFIED |
| **HSN / SAC Master & Tax Calc** | 80% | 70% | 80% | 80% | 75% | 50% | **75%** | PARTIAL |
| **Sales Invoices & AddSale** | 70% (`isGstinEnabled`) | 55% (`status` col) | 65% | 60% | 60% | 50% | **61%** | BROKEN |
| **POS Billing** | 80% | 55% | 65% | 75% | 65% | 60% | **67%** | PARTIAL |
| **Estimates / Proforma / Orders / Challans** | 75% | 65% | 70% | 65% | 60% | 50% | **66%** | PARTIAL |
| **Sale Returns / Credit Notes** | 75% | 60% | 65% | 65% | 60% | 60% | **64%** | PARTIAL |
| **Payment In / Payment Out** | 75% | 60% | 65% | 65% | 60% | 50% | **64%** | PARTIAL |
| **Purchase Bills & AddPurchase** | 75% | 55% | 65% | 60% | 55% | 50% | **61%** | PARTIAL |
| **Purchase Orders / Returns / Job Work** | 70% | 70% | 75% | 65% | 60% | 60% | **68%** | PARTIAL |
| **Expenses & Categories** | 80% | 80% | 80% | 75% | 70% | 60% | **76%** | UNVERIFIED |
| **Bank Accounts** | 85% | 90% | 85% | 85% | 80% | 90% | **86%** | UNVERIFIED |
| **Cash In Hand** | 75% | 50% (`status` col) | 60% | 65% | 55% | 70% | **62%** | PARTIAL |
| **Cheques** | 75% | 75% | 65% | 70% | 40% | 75% | **66%** | PARTIAL |
| **Loan Accounts** | 75% | 75% | 65% | 75% | 40% | 75% | **67%** | PARTIAL |
| **Reports (28+ Report Views)** | 70% | 45% (`status` col) | 55% | 60% | 55% | 50% | **56%** | BROKEN |
| **Utilities (Import/Export/Barcode/Tally)** | 75% | 60% | 50% | 65% | 45% | 55% | **58%** | PARTIAL |
| **Verify My Data** | 75% | 0% | 10% (Local) | 70% | 25% | 70% | **38%** | PARTIAL |
| **Backup & Restore (Computer & Drive)** | 80% | 65% | 65% | 70% | 65% | 55% | **67%** | PARTIAL |
| **Settings (8 Tabs)** | 85% | 80% | 80% | 75% | 75% | 65% | **78%** | UNVERIFIED |
| **Service Reminders** | 80% | 75% | 75% | 70% | 55% | 40% | **68%** | PARTIAL |
| **Audit Trail** | 70% | 80% | 80% | 75% | 70% | 40% | **72%** | UNVERIFIED |
| **Data Migration Engine** | 70% | 75% | 75% | 70% | 65% | 50% | **69%** | UNVERIFIED |
| **DB Maintenance & File Storage** | 0% (N/A) | 85% | 85% | 80% | 75% | 40% | **65%** | UNVERIFIED |
| **Online Store & Storefront** | 75% | 50% (No auth) | 70% | 65% | 60% | 40% | **62%** | PARTIAL |
| **Smart Ads (Meta)** | 75% | 50% (No auth) | 70% | 65% | 60% | 65% | **65%** | PARTIAL |
| **Marketing Studio & Image-to-Layers** | 80% | 60% (No auth) | 65% | 70% | 60% | 50% | **65%** | PARTIAL |
| **WhatsApp Marketing & Connect** | 60% (Hardcoded) | 55% (No auth) | 70% | 60% | 50% | 20% | **56%** | PARTIAL |
| **Google Profile Manager** | 70% | 55% (No auth) | 60% | 55% | 50% | 30% | **55%** | PARTIAL |
| **Legal Pages** | 90% | 0% (N/A) | 0% (N/A) | 0% (N/A) | 0% (N/A) | 0% | **14%** | PARTIAL |
| **USK Business Network** | 20% (Empty UI) | 0% | 0% | 0% | 0% | 0% | **3%** | MISSING |
| **Subscription / Pricing** | 15% | 0% | 0% | 0% | 0% | 0% | **2%** | MISSING |

*(Orphaned/Unused Page: `src/pages/Home/Home.jsx` exists on disk, but `/home` in `src/App.jsx` redirects to `/dashboard`.)*

---

## 3. Database Audit

### 3.1 Connectivity & Environment
- **Configured Host:** `100.78.67.69:3306` (database `vyapaar` via `server/.env`).
- **Audit Limitation:** Direct MySQL connection from the audit sandbox failed with `connect EACCES 100.78.67.69:3306`, so live row counts and query execution plans could not be inspected. All database findings below are derived from `server/src/db/initSchema.js`, `server/database/schema.sql`, `server/database/migrations/*.sql`, and SQL queries in `server/src/routes/*.js`.

### 3.2 Discovered Tables (41 Unique Tables)
**36 Relational Tables in `server/src/db/initSchema.js`:**
1. `businesses` (tenant registry)
2. `company_profiles` (business details, GSTIN, PAN, bank info, logo/signature URLs)
3. `app_settings` (key-value `TEXT` settings per `business_id`)
4. `parties` (customers/suppliers, balances, addresses, GSTIN, PAN)
5. `units` (units of measurement)
6. `inventory_items` (products/services, stock, prices, tax, `image_id`/`image_url`)
7. `item_batches` (batch-level stock, mfg/exp dates)
8. `inventory_adjustments` (manual stock add/reduce)
9. `transactions` (unified header for sales, POS, purchases, returns, payments, expenses, orders, challans)
10. `transaction_items` (line items with GST split: CGST/SGST/IGST/CESS)
11. `service_reminders`
12. `service_reminder_history`
13. `bank_accounts`
14. `bank_transactions`
15. `cash_in_hand`
16. `cheques`
17. `loan_accounts`
18. `expense_categories`
19. `expense_items`
20. `online_store_settings`
21. `online_store_orders`
22. `online_store_order_items`
23. `smart_ads`
24. `audit_trails`
25. `unit_conversions`
26. `purchase_job_works`
27. `purchase_job_work_items`
28. `loan_repayments`
29. `balance_sheet_accounts`
30. `migration_logs`
31. `company_profile_assets`
32. `business_files` (filesystem/Cloudinary metadata + SHA-256 hash)
33. `users` (email, `password_hash`, `business_id`, `role`, `token_version`)
34. `email_verifications` (OTP codes)
35. `password_resets` (hashed reset tokens)
36. `tally_import_batches`

**4 Additional Unique Tables in `server/database/schema.sql`** *(note: `businesses` and `business_growth_assets` also appear in `initSchema.js`)*:
37. `whatsapp_marketing_templates` (shared poster catalog BLOBs; also in `2026_09_whatsapp_marketing_templates.sql`)
38. `business_growth_records`
39. `business_growth_record_fields`
40. `business_growth_attribute_fields`

**1 Table in `server/database/migrations/2026_11_create_hsn_codes.sql`:**
41. `hsn_codes`

**7 MySQL Views in `server/database/schema.sql`:**
`business_growth_record_values`, `business_data_parties`, `business_data_sales_invoices`, `business_data_purchase_bills`, `business_data_financial_summary`, `business_growth_inventory_items`, `business_growth_inventory_item_batches`.

### 3.3 Critical Schema & Persistence Problems
1. **Missing `transactions.status` Column (`initSchema.js` lines 380–435):** `transactions` only defines `payment_status`, not `status`. Yet `dashboardRouter.js` (lines 26, 111), `transactionsRouter.js` (lines 1051, 1463), `reportsRouter.js` (line 16), and `cashBankRouter.js` (line 32) all query `status`.
2. **Incomplete `BACKUP_TABLES` (`backupRouter.js` lines 15–22):** `BACKUP_TABLES` exports 24 tables and omits `unit_conversions`, `purchase_job_works`, `purchase_job_work_items`, `loan_repayments`, `balance_sheet_accounts`, `tally_import_batches`, `business_files`, `business_growth_records`, `business_growth_record_fields`, and `business_growth_assets`. Restoring a backup loses loan repayments, job works, unit conversions, and balance sheet chart of accounts.
3. **Missing Foreign Key Constraints on Core Relational Tables:** Unlike `business_growth_records`, core tables (`transactions`, `transaction_items`, `item_batches`, `bank_transactions`, `loan_repayments`, `purchase_job_work_items`) have indexes but **no `FOREIGN KEY` constraints**, allowing orphaned child rows if a delete bypasses router logic.
4. **Hardcoded Demo Seed in `initSchema.js` (lines 917–935):** Seeds `usr_demo_business_owner` (`prasad.huetech@gmail.com`) and a hardcoded party `rt fpharma` (`933f31db-61eb-4c2b-a3d1-2c862c8fc888`) on every server boot.
5. **LocalStorage Split-Brain:** `appPasscodeRepository.js` (App Lock), `VerifyMyData` (`dataVerificationRepository.js`), `ExportToTally`, and direct `saveInventoryItem`/`saveParty` calls in `ItemsDashboard.jsx`, `BatchExpiryReport.jsx`, `DeliveryChallans.jsx`, and `PurchaseReturns.jsx` still read/write `localStorage` instead of MySQL.

---

## 4. API Audit (32 Mounted Route Modules, ~202 Endpoints)

| Route Prefix | File(s) | Endpoints | Auth Middleware | DB Interaction | Verification Status | Key Problems |
| --- | --- | :---: | --- | --- | --- | --- |
| `/api/auth` | `authRouter.js`, `googleAuth.js`, `googleDriveBackup.js`, `metaAuth.js`, `whatsappAuth.js` | 29 | Public / `requireAuth` | `users`, `businesses`, `email_verifications`, `password_resets` | UNVERIFIED (DB blocked) | In-memory rate limit & lockout maps reset on restart. |
| `/api/parties` | `partiesRouter.js` | 8 | `requireAuth` | `parties`, `transactions` | UNVERIFIED | `/send-otp` is a **fake stub** (stores OTP in memory, sends no SMS). |
| `/api/items` | `itemsRouter.js` | 12 | `requireAuth` | `inventory_items`, `item_batches`, `business_files` | UNVERIFIED (Tests `EACCES`) | Image upload/stream well-structured. |
| `/api/transactions` | `transactionsRouter.js` | 9 | `requireAuth` | `transactions`, `transaction_items`, `inventory_items`, `item_batches`, `parties`, `cash_in_hand`, `business_files` | **BROKEN (Schema)** | Queries non-existent `transactions.status` at lines 1051 & 1463. |
| `/api/dashboard` | `dashboardRouter.js` | 2 | `requireAuth` | `transactions`, `parties`, `inventory_items`, `bank_accounts` | **BROKEN (Schema)** | Queries non-existent `transactions.status` at lines 26 & 111. |
| `/api/reports` | `reportsRouter.js` | 6 | `requireAuth` | `transactions`, `cash_in_hand`, `bank_accounts`, `parties`, `inventory_items`, `loan_accounts` | **BROKEN (Schema)** | `ACTIVE_TXN_FILTER` (line 16) queries non-existent `transactions.status`. |
| `/api/cash-bank` | `cashBankRouter.js` | 15 | `requireAuth` | `cash_in_hand`, `cheques`, `loan_accounts`, `loan_repayments`, `transactions` | **BROKEN (Schema)** | `syncCashTransactions` (line 32) queries `t.status`. |
| `/api/bank-accounts` | `bankAccountsRouter.js` | 8 | `requireAuth` | `bank_accounts`, `bank_transactions` | PARTIAL (Mocked tests pass) | 15/15 mocked suite tests pass; live DB unverified. |
| `/api/settings` | `settingsRouter.js` | 7 | `requireAuthForSettings` | `app_settings`, `company_profiles`, `company_profile_assets`, `business_files` | UNVERIFIED | `GET /company-profile/assets/:id` intentionally public for `<img>` tags. |
| `/api/backup` | `backupRouter.js` | 4 | `requireAuth` | 24 tables | PARTIAL / **SECURITY RISK** | Column names in `POST /restore` not allowlisted; missing 12+ tables. |
| `/api/service-reminders` | `serviceRemindersRouter.js` | 4 | `requireAuth` | `service_reminders`, `service_reminder_history` | UNVERIFIED | Frontend `serviceRemindersDb.save` swallows errors. |
| `/api/units` | `unitsRouter.js` | 6 | `requireAuth` | `units`, `unit_conversions` | UNVERIFIED | Normalized relational CRUD. |
| `/api/inventory-adjustments` | `inventoryAdjustmentsRouter.js` | 2 | `requireAuth` | `inventory_adjustments`, `inventory_items` | UNVERIFIED | Atomic stock update inside transaction. |
| `/api/expense-categories`, `/api/expense-items` | `expenseCategoriesRouter.js`, `expenseItemsRouter.js` | 6 | `requireAuth` | `expense_categories`, `expense_items` | UNVERIFIED | Normalized CRUD. |
| `/api/purchase-job-works`, `/api/balance-sheet` | `purchaseJobWorksRouter.js`, `balanceSheetRouter.js` | 6 | `requireAuth` | `purchase_job_works`, `purchase_job_work_items`, `balance_sheet_accounts` | UNVERIFIED | Normalized CRUD. |
| `/api/audit-trail`, `/api/utilities/tally`, `/api/migration` | `auditTrailRouter.js`, `tallyRouter.js`, `migrationRouter.js` | 12 | `requireAuth` | `audit_trails`, `tally_import_batches`, `migration_logs` | UNVERIFIED | `migrationRouter.js` interpolates `tableName` from fixed array. |
| `/api/maintenance`, `/api/database/maintenance` | `maintenanceRouter.js` | 3 | `requireAuth` | `audit_trails`, `business_files`, schema stats | UNVERIFIED | Mounted twice for compatibility. |
| `/api/business-growth`, `/api/business-data` | `businessGrowth.js` | 11 | **NONE** | `business_growth_*` | **BROKEN (Security)** | No `requireAuth`; trusts `X-Business-Id` header. |
| `/api/online-store` | `onlineStoreRouter.js` | 4 | **NONE** | `online_store_settings`, `online_store_orders`, `online_store_order_items` | **BROKEN (Security)** | Admin `POST /settings` and `GET /orders` are unauthenticated. |
| `/api/smart-ads` | `smartAdsRouter.js` | 4 | **NONE** | `smart_ads` | **BROKEN (Security)** | Unauthenticated CRUD on any `X-Business-Id`. |
| `/api/marketing-studio`, `/api/google-business`, `/api/meta-business`, `/api/meta/ads`, `/api/whatsapp-business` | 5 routers | 29 | **NONE** | `whatsapp_marketing_templates`, file stores, external APIs | **BROKEN (Security)** | No `requireAuth`; unauthenticated access to OAuth-backed actions. |
| `/api/whatsapp` | `whatsappWebhook.js` | 2 | Public (Webhook) | Webhook events | UNVERIFIED | Standard webhook endpoint. |
| `/api/hsn` | `hsn.js` | 5 | **NONE** | `hsn_codes` | UNVERIFIED | Read lookup can be public, but `POST /api/hsn/import` and `/seed` are unauthenticated. |
| `/api/health` | `index.js` | 1 | Public | `SELECT 1` | UNVERIFIED | Returns 503 if MySQL unavailable. |

---

## 5. Business Logic Audit

1. **Double Stock Mutation Risk (`src/services/businessRecords.js` lines 237–255 & 328–347):**
   - `saveBusinessSaleInvoice` calls `saveSaleInvoice(value, { skipRemoteSync: true })` (which deducts stock in `localStorage`), then calls `transactionsDb.save(localInvoice)` (which atomically deducts `current_stock` in MySQL in `transactionsRouter.js` lines 1299–1314), and **then** loops over touched items in `getInventoryItems()` and calls `saveBusinessItem(item)`. If `saveBusinessItem` fails or races, local and MySQL stock diverge; and if `saveSaleInvoice` is called directly elsewhere, MySQL stock is never updated.
2. **Silent Sync Failures (`src/services/purchaseBillsStorage.js` lines 70–80, 114–116, 199–207):**
   - `savePurchaseBill`, `deletePurchaseBill`, `applyDebitNoteToPurchaseBill`, and `applyPaymentToPurchaseBill` mutate `localStorage` first and fire `transactionsDb.save/remove` asynchronously with `.catch(() => {})` or `console.warn`. If MySQL fails, the user gets a false success.
3. **Silent Reminder Save Failure (`src/services/databaseRepository.js` lines 771–782):**
   - `serviceRemindersDb.save` catches API errors and returns the unsaved `reminder` object as if it succeeded.
4. **Disconnected Cash/Bank Sub-ledgers:**
   - `Cheques` and `LoanAccounts` repayments do not automatically post entries to `CashInHand` or `BankTransactions` (documented in `README.md` and confirmed in `cashBankRouter.js`).
5. **GSTIN / PAN & Tax Calculations:**
   - `gstinUtils.js` (Luhn Mod-36 checksum, state code, PAN extraction) and `hsnService.js` prefix-inheritance logic are implemented, though `AddSale.jsx` has an undefined `isGstinEnabled` variable in its Firm/E-Way Bill modal.

---

## 6. Critical Bugs

### P0 — Critical (Data Loss, Corruption, or Severe Security Risk)
1. **Unauthenticated Multi-Tenant Endpoints Allowing Cross-Business Access**
   - **File:** `server/src/index.js` (lines 69–80, 99–100, 104) & `server/src/db/mysql.js` (`businessIdFromRequest`, lines 30–61)
   - **Problem:** 9+ routers (`/api/business-growth`, `/api/business-data`, `/api/marketing-studio`, `/api/online-store`, `/api/smart-ads`, `/api/google-business`, `/api/meta-business`, `/api/meta/ads`, `/api/whatsapp-business`, `/api/hsn`) lack `requireAuth`. Unauthenticated callers can supply any `X-Business-Id` header and read/modify/delete another tenant's data.
   - **Fix:** Apply `requireAuth` to all tenant-mutating and private read routes; restrict public storefront/OAuth callbacks to explicit public sub-routes.
2. **Hardcoded Production `JWT_SECRET` Fallback**
   - **File:** `server/src/middleware/authMiddleware.js` (line 16)
   - **Problem:** `process.env.JWT_SECRET || "usk_production_jwt_secret_key_99882233_secure_auth_token"`. Anyone with source access can forge valid JWTs for any `businessId`.
   - **Fix:** Fail fast on startup if `process.env.JWT_SECRET` is missing in production; remove hardcoded secret.
3. **Missing `transactions.status` Column Causes SQL Failures Across 4 Core Routers**
   - **Files:** `server/src/db/initSchema.js` (lines 380–435), `server/src/routes/dashboardRouter.js` (lines 26, 111), `server/src/routes/transactionsRouter.js` (lines 1051, 1463), `server/src/routes/reportsRouter.js` (line 16), `server/src/routes/cashBankRouter.js` (line 32).
   - **Problem:** `transactions` table has `payment_status` but no `status` column, causing `Unknown column 'status'` errors on dashboard, reports, cash-in-hand sync, and transaction updates/deletes.
   - **Fix:** Add `status VARCHAR(50) DEFAULT 'Active'` to `transactions` in `initSchema.js` (with `addCol`) or remove `status` references and standardize on `payment_status`.
4. **SQL Column Injection & Incomplete Backup/Restore**
   - **File:** `server/src/routes/backupRouter.js` (lines 15–22, 99–112)
   - **Problem:** `POST /api/backup/restore` constructs `INSERT INTO` column names directly from `Object.keys(scopedRow)` without allowlisting against `information_schema.COLUMNS`. Also `BACKUP_TABLES` omits 12+ relational tables (`loan_repayments`, `unit_conversions`, `purchase_job_works`, `balance_sheet_accounts`, `tally_import_batches`, `business_files`, etc.).
   - **Fix:** Validate column names against `information_schema.COLUMNS` and include all tenant-scoped tables in `BACKUP_TABLES` in topological FK order.

### P1 — High (Major Functionality Broken)
5. **Runtime `ReferenceError: isGstinEnabled is not defined` in `AddSale.jsx`**
   - **File:** `src/pages/Sales/AddSale.jsx` (lines 2625, 2638)
   - **Problem:** Confirmed by `npx eslint src server/src --quiet` (`no-undef`). Opening the Edit Firm / E-Way Bill modal in `AddSale.jsx` crashes the component.
   - **Fix:** Pass `isGstinEnabled` as a prop or derive it from `getAppSettings().enableGstin`.
6. **Silent MySQL Write Failures in `purchaseBillsStorage.js` and `serviceRemindersDb.save`**
   - **Files:** `src/services/purchaseBillsStorage.js` (lines 70–80, 114–116, 199–207), `src/services/databaseRepository.js` (lines 771–782).
   - **Problem:** Failures are caught and logged/swallowed while returning success to the UI.
   - **Fix:** Remove fire-and-forget syncs; await MySQL APIs and surface errors to the user.
7. **Direct `localStorage`-Only Calls Bypassing MySQL in Pages**
   - **Files:** `src/pages/Items/ItemsDashboard.jsx` (lines 991, 1012, 1137, 1295, 1514, 1554), `src/pages/Purchase/PurchaseReturns.jsx` (line 16), `src/pages/Reports/BatchExpiryReport.jsx` (line 26), `src/pages/Sales/DeliveryChallans.jsx` (line 445).
   - **Problem:** Call synchronous `saveInventoryItem` / `saveParty` instead of `saveBusinessItem` / `saveBusinessParty`.

### P2 — Medium (Important Functionality Incomplete)
8. **`WhatsAppConnect.jsx` Hardcodes `connected: true` on API Error** (`src/pages/Parties/WhatsAppConnect.jsx` lines 39, 55–60).
9. **`partiesRouter.js` `/send-otp` is a Stub** (`server/src/routes/partiesRouter.js` lines 34–56) — never sends SMS.
10. **`VerifyMyData` and `ExportToTally` Read `localStorage` Only** — miss MySQL-only records (`README.md`, `src/services/dataVerificationRepository.js`).
11. **`optionalAuth` Doesn't Check Session Revocation** (`server/src/middleware/authMiddleware.js` lines 105–124) and `userRevocationMap` is in-memory only.
12. **AuthGuard Client-Only Check** (`src/components/Auth/AuthGuard.jsx`) only checks `localStorage` presence, not JWT expiry.
13. **Stale Test Setup in `transactionRecordsStorage.test.js`** (`src/services/transactionRecordsStorage.test.js` lines 5–8) mocks unscoped keys (`ledgerly:saleInvoices.v1`), causing 5 test failures against tenant-scoped `transactionRepository.js`.

### P3 — Low (Minor Bugs / Improvements)
14. **Unused Variable in `ProfitAndLossReport.jsx`** (line 358: `no-useless-assignment` reported by ESLint).
15. **Large Unsplit Production Bundle:** `vite build` outputs a single `5,027.42 kB` JS chunk (`1.25 MB` gzipped) with ineffective dynamic import warnings for `@zxing/browser` and `backupToComputer.js`.
16. **Hardcoded Branding & Unused Page:** `SidebarData.js` contains hardcoded `"Sai Kirana Stores"` and `"5 days free trial left"`; `src/pages/Home/Home.jsx` is orphaned (`/home` redirects to `/dashboard`).

---

## 7. Missing Features

- **USK Business Network (`src/pages/Parties/USKNetwork.jsx`):** UI shell only; `connectedUsers = []`, search and filter buttons have no handlers or backend.
- **Subscription & Billing (`src/services/subscriptionService.js`):** Returns `not_configured`; `startCheckout` throws an error; no payment gateway or plan enforcement.
- **SMS Gateway Integration:** `POST /api/parties/send-otp` has no SMS provider.
- **Cross-Module Accounting Links:** Cheque clearances and Loan repayments do not post to Cash/Bank ledgers.
- **Database-Backed App Lock:** `appPasscodeRepository.js` is browser-local only (`usv:appPasscode.v1`).

---

## 8. Technical Debt

- **Dual Persistence Architecture:** Parallel existence of `databaseRepository.js`, `businessRecords.js`, and legacy `localStorage` services (`itemsStorage.js`, `partiesStorage.js`, `salesStorage.js`, `purchaseBillsStorage.js`, `chequesRepository.js`, `loanAccountsRepository.js`) creates sync bugs.
- **Dual Schema Paradigms:** `schema.sql` uses EAV (`business_growth_records` + `business_growth_record_fields`) while `initSchema.js` uses 36 normalized tables.
- **In-Memory Security State:** `userRevocationMap`, `loginAttemptsMap`, `otpRateLimitMap`, and `otpStore` are process-local `Map`s that reset on restart and break horizontal scaling.

---

## 9. Testing Report

| Check / Suite | Command | Total | Passed | Failed | Notes / Root Cause |
| --- | --- | :---: | :---: | :---: | --- |
| **Production Build** | `npm run build` | 1 | 1 | 0 | Built 770 modules in 11.77s (`dist/assets/index-*.js` = 5,027.42 kB). |
| **ESLint** | `npx eslint src server/src --quiet` | — | — | **3 errors** | `AddSale.jsx` (2x `no-undef` `isGstinEnabled`), `ProfitAndLossReport.jsx` (1x `no-useless-assignment`). |
| **Frontend & Root Tests** | `node --test src/**/*.test.js test/*.test.js` | 567 | 502 | 65 | 60 failures due to backend `http://127.0.0.1:5000` unreachable in sandbox; 5 failures in `transactionRecordsStorage.test.js` due to stale unscoped mock keys. |
| **Backend Tests** | `node --test server/src/**/*.test.js` | 242 | 157 | 85 | Mocked suites (e.g., `bankAccountsRouter.test.js` 15/15) passed; DB/HTTP integration tests failed due to sandbox `EACCES 100.78.67.69:3306` and `EACCES 127.0.0.1:<port>`. |
| **Live MySQL Check** | `pool.query('SHOW TABLES')` | 1 | 0 | 1 | Blocked in sandbox: `connect EACCES 100.78.67.69:3306`. |

---

## 10. Prioritized Development Roadmap

| Phase | Task | Priority | Est. Effort | Dependencies | Files / Modules Affected | Expected Outcome |
| --- | --- | :---: | :---: | :---: | --- | --- |
| **A** | Add `transactions.status` column (or standardize on `payment_status`) | P0 | 2h | MySQL access | `initSchema.js`, `dashboardRouter.js`, `transactionsRouter.js`, `reportsRouter.js`, `cashBankRouter.js` | Eliminates SQL `Unknown column 'status'` crashes. |
| **A** | Fix `backupRouter.js` column allowlisting & complete `BACKUP_TABLES` | P0 | 4h | None | `server/src/routes/backupRouter.js` | Prevents SQL injection & ensures full-schema restore. |
| **B** | Fix `AddSale.jsx` `isGstinEnabled` `ReferenceError` & `ProfitAndLossReport.jsx` lint | P1 | 1h | None | `src/pages/Sales/AddSale.jsx`, `src/pages/Reports/ProfitAndLossReport.jsx` | Zero ESLint errors; Firm/E-Way modal stops crashing. |
| **C** | Eliminate silent MySQL fallbacks & double stock sync | P0 | 1–2d | Phase A | `businessRecords.js`, `purchaseBillsStorage.js`, `databaseRepository.js`, `ItemsDashboard.jsx`, `PurchaseReturns.jsx`, `DeliveryChallans.jsx` | MySQL is strict source of truth; errors surface clearly. |
| **C** | Migrate `VerifyMyData` & `ExportToTally` to MySQL APIs | P2 | 1d | Phase C | `dataVerificationRepository.js`, `ExportToTally.jsx` | Reports & exports reflect live DB records. |
| **D** | Link Cheques & Loan Repayments to Cash/Bank ledgers | P2 | 2d | Phase A | `cashBankRouter.js`, `chequesRepository.js`, `loanAccountsRepository.js` | Accurate Cash/Bank balances on clearance/EMI. |
| **E** | Implement or remove stubs (`USKNetwork`, `Subscription`, `WhatsAppConnect` status, SMS OTP) | P2–P3 | 3–5d | External APIs | `USKNetwork.jsx`, `subscriptionService.js`, `WhatsAppConnect.jsx`, `partiesRouter.js` | No misleading/dead UI or fake success messages. |
| **F** | Enforce `requireAuth` on all tenant routers & remove hardcoded `JWT_SECRET` | P0 | 4h | None | `server/src/index.js`, `server/src/middleware/authMiddleware.js`, `onlineStoreRouter.js` | Full multi-tenant isolation; no `X-Business-Id` spoofing. |
| **G** | Add route-level `React.lazy` code splitting & remove orphaned `Home.jsx` | P3 | 4h | None | `src/App.jsx`, `vite.config.js`, `src/pages/Home/Home.jsx` | Reduces 5 MB initial bundle. |
| **H** | Fix stale `transactionRecordsStorage.test.js` & run full live MySQL integration suite | P1 | 1d | Phases A–F + Live DB | `src/services/transactionRecordsStorage.test.js`, `server/src/tests/*.test.js` | 100% passing test suite against live MySQL. |

---

## 11. Final Completion Dashboard

- **Overall Completion:** **55%** (54.75% exact weighted)
- **Verified Functionality (Build + Offline Unit Tests):** **34%**
- **Implemented but Unverified (Blocked by Remote MySQL Access):** **21%**
- **Partially Implemented:** **24%**
- **Broken:** **12%**
- **Missing:** **9%**
- **Production Readiness:** **NOT READY**

**Completion vs. Production Readiness:**  
Completion measures how much of the planned surface area has been coded (~55% weighted across all 8 dimensions). **Production readiness** requires zero P0 security/data-loss defects, verified MySQL schema-query parity, and passing end-to-end tests against a live database. Because of unauthenticated multi-tenant endpoints, a hardcoded JWT secret fallback, the missing `transactions.status` column, and split-brain `localStorage` persistence, the application must complete **Phases A, B, C, F, and H** before any production deployment.
