# Vyapaar

## MySQL setup

1. Install MySQL Server and MySQL Workbench.
2. Open Workbench and connect to your local MySQL server.
3. Open `server/database/schema.sql` in Workbench and execute it. It creates and selects the `vyapaar` database.
4. If upgrading an existing database that has `business_growth_records.payload`, first run the schema to create the typed field table, then run `npm run migrate:growth-fields` from `server`. This copies each saved value into typed columns and nested field rows, and drops the old JSON payload column only after the copy succeeds. Back up the database before running the migration.
5. If your database predates the tenant pagination index, run `server/database/migrations/2026_09_growth_tenant_page_index.sql` once in Workbench.
6. The cleanup migration `server/database/migrations/2026_10_remove_unused_empty_tables.sql` removes legacy tables that the current backend does not use. Run it only after checking those tables have no data you need.
7. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and an appropriate `DB_CONNECTION_LIMIT` in `server/.env`. Never commit credentials. Total possible connections equal `DB_CONNECTION_LIMIT × number of API instances`, so size it against MySQL's connection capacity.
8. Demo and local runs use `demo-business` automatically when `VITE_BUSINESS_ID` is not set. All unauthenticated demo data is stored under that shared identifier. Before production, set a tenant-specific `VITE_BUSINESS_ID` and add authentication and authorization; do not use the shared demo identifier for unrelated tenants.

### Current database coverage

MySQL persists Sale Invoices, Purchase Bills, and the active Business Growth records and poster catalog. Inventory Items and Parties currently use browser localStorage through `src/services/itemsStorage.js` and `src/services/partiesStorage.js`. On first load after the local-only switch, any legacy MySQL items are copied into localStorage once to preserve existing records; subsequent item CRUD uses local storage. The Utilities item and party import, bulk update, export, and Tally master import tools use those same shared local records, so imported or edited entries appear in the regular Items and Parties screens. To move them to a database later, replace persistence in their two storage services and keep the existing normalization and CRUD callers. Dashboard receivable and payable cards use saved transaction balances; its charts and report links remain placeholders. Cash & Bank, Reports, and most Utilities workflows are coming soon and have no implemented records to save yet.

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
