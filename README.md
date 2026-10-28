# USV — Local Storage Testing

This project is being tested with browser-local Items and Parties. Start the frontend with `npm run dev` from the project root and use the same browser and local app address each time; `localStorage` is scoped to that browser origin.

## MySQL setup

1. Install MySQL Server and MySQL Workbench.
2. Open Workbench and connect to your local MySQL server.
3. Open `server/database/schema.sql` in Workbench and execute it. It creates and selects the `vyapaar` database.
4. If upgrading an existing database that has `business_growth_records.payload`, first run the schema to create the typed field table, then run `npm run migrate:growth-fields` from `server`. This copies each saved value into typed columns and nested field rows, and drops the old JSON payload column only after the copy succeeds. Back up the database before running the migration.
5. If your database predates the tenant pagination index, run `server/database/migrations/2026_09_growth_tenant_page_index.sql` once in Workbench.
6. The cleanup migration `server/database/migrations/2026_10_remove_unused_empty_tables.sql` removes legacy tables that the current backend does not use. Run it only after checking those tables have no data you need.
7. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and an appropriate `DB_CONNECTION_LIMIT` in `server/.env`. Never commit credentials. Total possible connections equal `DB_CONNECTION_LIMIT × number of API instances`, so size it against MySQL's connection capacity.
8. Demo and local runs use `demo-business` automatically when `VITE_BUSINESS_ID` is not set. All unauthenticated demo data is stored under that shared identifier. Before production, set a tenant-specific `VITE_BUSINESS_ID` and add authentication and authorization; do not use the shared demo identifier for unrelated tenants.

### Current storage and test workflow

| Data | Current storage behavior |
| --- | --- |
| Items | Browser `localStorage` via `src/services/itemsStorage.js`. The first Items load can copy legacy MySQL items into local storage once; normal create, read, update, delete, import, and stock changes use the local item service. |
| Parties | Browser `localStorage` via `src/services/partiesStorage.js`. Party imports use this same store. |
| Sales | Saved invoices are kept in browser storage and also use the existing database save flow. |
| Purchases | The database save flow remains active. Successful loads and saves mirror purchase bills to browser storage for local Tally export. |
| Export to Tally | Reads the browser-local sales and purchase records; it does not query the database. A database-only purchase that has not been mirrored locally will not appear. |

The Utilities item and party import, bulk update, export, and Tally master import features share the same local Items and Parties used by the regular app screens. Their data survives a page refresh in the same browser and origin. Clearing that browser's site data, changing browsers, or changing the app origin uses a different local store.

To try the sample item import:

1. Open **Utilities → Import Items**.
2. Choose `sample-items-import.xlsx` from the project root.
3. Review the rows and confirm the import.
4. Open **Items** and check the Products and Services tabs. Imported entries should remain after refreshing.

The sample contains seven dummy records with item codes, categories, units, sale and purchase prices, quantities, HSN/SAC, tax, discount, and descriptions. To move Items or Parties to a database later, replace persistence inside their storage services while keeping the existing CRUD callers.

Dashboard receivable and payable cards use saved transaction balances; its charts and report links remain placeholders. Other reports and some Utilities workflows are still placeholders.

### Verify My Data

**Utilities → Verify My Data** reads Items, Parties, Sales, and Purchases from the existing browser-local storage services through `src/services/dataVerificationRepository.js`. It does not call the database. Database-only sales or purchases that have not been copied into this browser are not included. To switch later, replace the repository methods with the existing company-scoped API reads; verification rules and the page can remain unchanged.

### Bank Accounts

**Cash & Bank → Bank Accounts** uses the existing company-scoped Business Growth API and typed-record tables. It stores bank account details under `bank-accounts` and append-only money-in/money-out entries under `bank-transactions`; no new database table or connection is required. The displayed book balance is calculated as opening balance plus saved money-in transactions minus saved money-out transactions. Account numbers are masked in the interface, and accounts are deactivated rather than deleted so their transaction history remains intact. Set up the backend and MySQL as described above to use this feature; persistence cannot be verified while the API or database is unavailable.

### Cash in Hand

**Cash & Bank → Cash in Hand** currently reads saved sales and purchase bills from the browser-local storage services and stores count adjustments under `ledgerly:cashAdjustments.v1`. Its service module contains the persistence boundary, so moving adjustments to the company-scoped API later can be done without changing the page or cash calculations. Cash sales and cash received on credit sales increase the balance; cash-paid purchases and count decreases lower it. Bank/non-cash transactions are excluded. Cash receipt, payment, and expense workflows are not yet available in this app.

### Cheques

**Cash & Bank → Cheques** is a tracking register stored in LocalStorage by `src/services/chequesRepository.js`, using the versioned `usv.cheques.v1` key (company-scoped when `VITE_BUSINESS_ID` is configured). Cheque metadata edits preserve the status history; status changes are manually recorded and cancellation retains the record. This browser-only register does not post to cash, bank accounts, sales, or purchases and does not verify bank clearance. To migrate it later, replace the repository methods with calls to the existing company-scoped API while keeping the current page and validation rules.

### Loan Accounts

**Cash & Bank → Loan Accounts** stores loans and nested repayment history in browser LocalStorage through `src/services/loanAccountsRepository.js`, using the versioned `usv.loanAccounts.v1` key (company-scoped when `VITE_BUSINESS_ID` is configured). Replace that repository implementation with the existing company-scoped API later; the page and EMI/repayment rules are independent of storage. EMI uses the standard reducing-balance formula (or an optional agreed EMI override). Outstanding principal is an estimate: original principal minus recorded principal portions. The next EMI date advances one month per repayment record. Interest accrual and lender balances are not verified, and repayments do not post to Cash in Hand or Bank Accounts. Local records are limited to this browser and origin.

### WhatsApp Marketing poster catalog

The WhatsApp Marketing poster catalog is stored centrally in the `whatsapp_marketing_templates` MySQL table. Each row holds its title, category, subcategory, personalization layout, original filename, MIME type, file size, and image binary. `server/database/schema.sql` creates the table for a new database. For an existing database, the seed command applies `server/database/migrations/2026_09_whatsapp_marketing_templates.sql` before importing the current eight posters:

```bash
cd server
npm run seed:whatsapp-marketing
```

The seed is safe to run again; it updates the existing catalog rows. The frontend then loads poster details from `GET /api/business-growth/whatsapp-marketing/templates` and retrieves the image bytes from the corresponding `/image` endpoint. The original files remain in the repository as seed inputs for setting up another database.

New catalog images can be stored in MySQL with Multer using `POST /api/business-growth/whatsapp-marketing/templates` as `multipart/form-data`. Send the image in the `file` field and include `title`, `category`, and `subcategory`; optional fields are `overlayConfig` (JSON object) and `displayOrder`. Images are limited to 10 MB and JPG, PNG, WEBP, or GIF. This upload route is currently unauthenticated because the project does not yet have admin accounts; keep it behind a trusted network until authentication is added.

## Backend

```bash
cd server
npm install
npm run dev
```

## Frontend

Set `VITE_API_BASE_URL=https://9hdxck8r-5000.inc1.devtunnels.ms//api` in `.env`. `VITE_BUSINESS_ID` is optional for the demo and defaults to `demo-business`; set it to the tenant identifier for production. Then run:

```bash
npm install
npm run dev
```

Expected local endpoints:

- Frontend: https://9hdxck8r-5173.inc1.devtunnels.ms/
- Backend: https://9hdxck8r-5000.inc1.devtunnels.ms/
- MySQL: localhost:3306
- Health: https://9hdxck8r-5000.inc1.devtunnels.ms//api/health

The health endpoint reports API process health. Business Growth records and user-uploaded image BLOBs are persisted through `/api/business-growth`; images are limited to 10 MB and JPG, PNG, WEBP, and GIF formats. Existing Google, Meta, and WhatsApp integrations remain configured through their current server environment variables. Google Profile Manager's editable profile is Vyapaar-local data and is not represented as synchronized Google data.

## Marketing Studio: Image to Layers

Image segmentation runs on the backend. The standard setup uses Python 3.10+, ISNet (`rembg`), OpenCV, and RapidOCR from `server/requirements-image-to-layers.txt`. It produces movable object cutouts and editable OCR text layers. On Windows, from the project root, run:

```powershell
py -3 -m venv server/.venv-image-to-layers
server/.venv-image-to-layers/Scripts/python.exe -m pip install -r server/requirements-image-to-layers.txt
```

Set `PYTHON_BIN` in `server/.env` to the venv interpreter path, for example `D:\vyapaar\server\.venv-image-to-layers\Scripts\python.exe`, then restart the backend. On first conversion, `rembg` downloads the ISNet model weights. The backend accepts PNG, JPG, and WebP images up to 8 MB. Without these dependencies the API returns a clear setup error instead of a successful empty conversion.

For more detailed, separate object masks, Image to Layers can optionally use Meta's SAM 2 automatic mask generator. SAM 2 is a larger model; install PyTorch for your CPU/GPU, install SAM 2 by following its [official repository instructions](https://github.com/facebookresearch/sam2), and download a SAM 2.1 tiny checkpoint from that repository's checkpoint links. Then add these settings to `server/.env` (adjust the checkpoint path):

```env
MAGIC_LAYERS_SAM2_CHECKPOINT=D:\\vyapaar\\server\\models\\sam2.1_hiera_tiny.pt
MAGIC_LAYERS_SAM2_CONFIG=configs/sam2.1/sam2.1_hiera_t.yaml
PYTHON_BIN=D:\\vyapaar\\server\\.venv-image-to-layers\\Scripts\\python.exe
```

Restart the backend after installing/configuring it. When the checkpoint is available, the conversion response identifies SAM 2 as the object segmenter; if it cannot load, the service falls back to ISNet and includes a warning. SAM 2 can propose many object masks, but no automatic model can perfectly separate every overlapping or visually merged element in every poster. RapidOCR remains responsible for text detection; replacing a detected text layer recreates its text and cannot guarantee an exact match for a decorative source font.

For large Business Growth collections, list endpoints support indexed keyset pagination with `GET /api/business-growth/:resource?limit=50` (limit 1–100) and the returned `nextCursor` on the following request. This avoids offset scans. The no-query-parameter list response remains available to preserve existing screen behavior.
