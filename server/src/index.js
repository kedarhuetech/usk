// Starts the Express server and mounts its API routes.
/* global process */
import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import googleAuthRoutes from "./routes/googleAuth.js";
import googleBusinessRoutes from "./routes/googleBusiness.js";
import marketingStudioRoutes from "./routes/marketingStudio.js";
import metaAdsRoutes from "./routes/metaAds.js";
import metaAuthRoutes from "./routes/metaAuth.js";
import metaBusinessRoutes from "./routes/metaBusiness.js";
import whatsappAuthRoutes from "./routes/whatsappAuth.js";
import whatsappBusinessRoutes from "./routes/whatsappBusiness.js";
import whatsappWebhookRoutes from "./routes/whatsappWebhook.js";
import businessGrowthRoutes from "./routes/businessGrowth.js";
import { pool } from "./db/mysql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });
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
app.use("/api/business-growth", businessGrowthRoutes);
app.use("/api/business-data", businessGrowthRoutes);
app.use("/api/marketing-studio", marketingStudioRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/auth", metaAuthRoutes);
app.use("/api/auth", whatsappAuthRoutes);
app.use("/api/google-business", googleBusinessRoutes);
app.use("/api/meta-business", metaBusinessRoutes);
app.use("/api/meta/ads", metaAdsRoutes);
app.use("/api/whatsapp-business", whatsappBusinessRoutes);
app.use("/api/whatsapp", whatsappWebhookRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, message: "Vyapaar backend and MySQL are connected." });
  } catch {
    res.status(503).json({ success: false, message: "Backend is running but MySQL is unavailable." });
  }
});

app.use((error, _req, res) => {
  if (error instanceof multer.MulterError) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message: error.code === "LIMIT_FILE_SIZE" ? "Image must be 10 MB or smaller." : "Invalid image upload." });
  if (error.message === "File type not allowed") return res.status(400).json({ success: false, message: "Only JPG, PNG, WEBP, and GIF images are accepted." });
  return res.status(400).json({ success: false, message: "Invalid request." });
});

const server = app.listen(PORT, () => {
  console.log(`Vyapar backend running on port ${PORT}`);
});

server.on("error", (error) => {
  console.error("Vyapar backend failed to start", {
    message: error.message,
  });
});
