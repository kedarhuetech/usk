// Starts the Express server and mounts its API routes.
/* global process */
import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import googleAuthRoutes from "./routes/googleAuth.js";
import businessAuthRoutes from "./routes/authRouter.js";
import { optionalAuth, requireAuth } from "./middleware/authMiddleware.js";
import googleDriveBackupRoutes from "./routes/googleDriveBackup.js";
import googleBusinessRoutes from "./routes/googleBusiness.js";
import marketingStudioRoutes from "./routes/marketingStudio.js";
import metaAdsRoutes from "./routes/metaAds.js";
import metaAuthRoutes from "./routes/metaAuth.js";
import metaBusinessRoutes from "./routes/metaBusiness.js";
import whatsappAuthRoutes from "./routes/whatsappAuth.js";
import whatsappBusinessRoutes from "./routes/whatsappBusiness.js";
import whatsappWebhookRoutes from "./routes/whatsappWebhook.js";
import businessGrowthRoutes from "./routes/businessGrowth.js";
import partiesRoutes from "./routes/partiesRouter.js";
import itemsRoutes from "./routes/itemsRouter.js";
import transactionsRoutes from "./routes/transactionsRouter.js";
import serviceRemindersRoutes from "./routes/serviceRemindersRouter.js";
import bankAccountsRoutes from "./routes/bankAccountsRouter.js";
import settingsRoutes from "./routes/settingsRouter.js";
import migrationRoutes from "./routes/migrationRouter.js";
import dashboardRoutes from "./routes/dashboardRouter.js";
import cashBankRoutes from "./routes/cashBankRouter.js";
import unitsRoutes from "./routes/unitsRouter.js";
import inventoryAdjustmentsRoutes from "./routes/inventoryAdjustmentsRouter.js";
import onlineStoreRoutes from "./routes/onlineStoreRouter.js";
import smartAdsRoutes from "./routes/smartAdsRouter.js";
import auditTrailRoutes from "./routes/auditTrailRouter.js";
import reportsRoutes from "./routes/reportsRouter.js";
import backupRoutes from "./routes/backupRouter.js";
import hsnRoutes from "./routes/hsn.js";
import purchaseJobWorksRoutes from "./routes/purchaseJobWorksRouter.js";
import balanceSheetRoutes from "./routes/balanceSheetRouter.js";
import expenseCategoriesRoutes from "./routes/expenseCategoriesRouter.js";
import expenseItemsRoutes from "./routes/expenseItemsRouter.js";
import maintenanceRoutes from "./routes/maintenanceRouter.js";
import tallyRoutes from "./routes/tallyRouter.js";
import { runDatabaseMaintenance } from "./services/dbMaintenanceService.js";
import { startSecurityCleanupScheduler } from "./services/rateLimiterService.js";
import { seedDefaultHsnCodes } from "./services/hsnService.js";
import { pool } from "./db/mysql.js";
import { initializeDatabaseSchema } from "./db/initSchema.js";
import { syncTransactionsFromGrowth } from "../scripts/syncTransactionsFromGrowth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true, quiet: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });
dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 5000;
const DEFAULT_CLIENT_ORIGINS = ["https://9hdxck8r-5173.inc1.devtunnels.ms", "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"];
const CLIENT_ORIGINS = [...(process.env.CLIENT_ORIGIN || "").split(","), ...DEFAULT_CLIENT_ORIGINS]
  .map((origin) => origin.trim())
  .map((origin) => origin.replace(/\/+$/, ""))
  .filter(Boolean)
  .filter((origin, index, origins) => origins.indexOf(origin) === index);

app.use(cors({ origin: CLIENT_ORIGINS, credentials: true }));
app.use(express.json({ limit: "35mb" }));
app.use(optionalAuth);
const requireAuthForBusinessGrowth = (req, res, next) => {
  if (
    req.method === "GET" &&
    (
      /^\/assets\/[^/]+$/.test(req.path) ||
      /^\/whatsapp-marketing\/templates(?:\/[^/]+\/image)?$/.test(req.path) ||
      /^\/(?:items|online-store)$/.test(req.path)
    )
  ) {
    return next();
  }
  if (req.method === "POST" && /^\/orders$/.test(req.path)) {
    return next();
  }
  return requireAuth(req, res, next);
};

const requireAuthForOnlineStore = (req, res, next) => {
  if ((req.method === "GET" && /^\/settings$/.test(req.path)) || (req.method === "POST" && /^\/orders$/.test(req.path))) {
    return next();
  }
  return requireAuth(req, res, next);
};

const requireAuthForHsn = (req, res, next) => {
  if (req.method === "POST" && /^\/(?:import|seed)$/.test(req.path)) {
    return requireAuth(req, res, next);
  }
  return next();
};

app.use("/api/auth", businessAuthRoutes);
app.use("/api/business-growth", requireAuthForBusinessGrowth, businessGrowthRoutes);
app.use("/api/business-data", requireAuth, businessGrowthRoutes);
app.use("/api/marketing-studio", requireAuth, marketingStudioRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/auth", googleDriveBackupRoutes);
app.use("/api/auth", metaAuthRoutes);
app.use("/api/auth", whatsappAuthRoutes);
app.use("/api/google-business", requireAuth, googleBusinessRoutes);
app.use("/api/meta-business", requireAuth, metaBusinessRoutes);
app.use("/api/meta/ads", requireAuth, metaAdsRoutes);
app.use("/api/whatsapp-business", requireAuth, whatsappBusinessRoutes);
app.use("/api/whatsapp", whatsappWebhookRoutes);
const requireAuthForSettings = (req, res, next) => {
  if (req.method === "GET" && /(?:^|\/)company-profile\/assets\/[^/]+$/.test(req.path)) {
    return next();
  }
  return requireAuth(req, res, next);
};

app.use("/api/parties", requireAuth, partiesRoutes);
app.use("/api/items", requireAuth, itemsRoutes);
app.use("/api/transactions", requireAuth, transactionsRoutes);
app.use("/api/service-reminders", requireAuth, serviceRemindersRoutes);
app.use("/api/bank-accounts", requireAuth, bankAccountsRoutes);
app.use("/api/settings", requireAuthForSettings, settingsRoutes);
app.use("/api/migration", requireAuth, migrationRoutes);
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/cash-bank", requireAuth, cashBankRoutes);
app.use("/api/units", requireAuth, unitsRoutes);
app.use("/api/inventory-adjustments", requireAuth, inventoryAdjustmentsRoutes);
app.use("/api/online-store", requireAuthForOnlineStore, onlineStoreRoutes);
app.use("/api/smart-ads", requireAuth, smartAdsRoutes);
app.use("/api/audit-trail", requireAuth, auditTrailRoutes);
app.use("/api/reports", requireAuth, reportsRoutes);
app.use("/api/backup", requireAuth, backupRoutes);
app.use("/api/hsn", requireAuthForHsn, hsnRoutes);
app.use("/api/purchase-job-works", requireAuth, purchaseJobWorksRoutes);
app.use("/api/balance-sheet", requireAuth, balanceSheetRoutes);
app.use("/api/expense-categories", requireAuth, expenseCategoriesRoutes);
app.use("/api/expense-items", requireAuth, expenseItemsRoutes);
app.use("/api/maintenance", requireAuth, maintenanceRoutes);
app.use("/api/database/maintenance", requireAuth, maintenanceRoutes);
app.use("/api/utilities/tally", requireAuth, tallyRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, message: "USK backend and MySQL are connected." });
  } catch {
    res.status(503).json({ success: false, message: "Backend is running but MySQL is unavailable." });
  }
});

app.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message: error.code === "LIMIT_FILE_SIZE" ? "Image must be 10 MB or smaller." : "Invalid image upload." });
  if (error.message === "File type not allowed") return res.status(400).json({ success: false, message: "Only JPG, PNG, WEBP, and GIF images are accepted." });
  return res.status(400).json({ success: false, message: "Invalid request." });
});

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`USK backend running on port ${PORT}`);
  try {
    await initializeDatabaseSchema();
    await seedDefaultHsnCodes();
    startSecurityCleanupScheduler();

    // Background automated database maintenance (15s after startup, then every 24h)
    setTimeout(async () => {
      try {
        await runDatabaseMaintenance({ businessId: "all" });
      } catch (maintErr) {
        console.warn("[Maintenance] Startup routine notice:", maintErr.message);
      }
    }, 15000);

    setInterval(async () => {
      try {
        await runDatabaseMaintenance({ businessId: "all" });
      } catch (maintErr) {
        console.warn("[Maintenance] Daily routine notice:", maintErr.message);
      }
    }, 24 * 60 * 60 * 1000);
    // syncTransactionsFromGrowth() backfill disabled on startup to prevent redundant synchronization
  } catch (err) {
    console.warn("Startup initialization warning:", err.message);
  }
});

server.on("error", (error) => {
  console.error("usv backend failed to start", {
    message: error.message,
  });
});
