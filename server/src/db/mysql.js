// Creates the shared MySQL connection pool and reads the business ID.
/* global process */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env"), override: true, quiet: true }); 



export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "vyapaar",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  // Keep this configurable per API instance so horizontally scaled app servers
  // do not exceed MySQL's global connection budget.
  connectionLimit: Math.max(1, Number.parseInt(process.env.DB_CONNECTION_LIMIT || "10", 10) || 10),
  queueLimit: 0,
  charset: "utf8mb4",
  dateStrings: true,
});

// This helper handles id from request logic.
export function businessIdFromRequest(req) {
  const imageRead = req.method === "GET" && /^\/assets\/[^/]+$/.test(req.path);
  const demoBusinessId = process.env.DEMO_BUSINESS_ID || "demo-business";
  const id = String(
    req.get("x-business-id") ||
    (imageRead ? req.query.businessId : "") ||
    (process.env.NODE_ENV !== "production" ? demoBusinessId : "") ||
    ""
  ).trim();
  if (!id || id.length > 64) throw Object.assign(new Error("A valid X-Business-Id header is required."), { status: 400 });
  return id;
}

/**
 * Converts any date representation (ISO 8601 string, Date object, DD-MM-YYYY)
 * to a clean MySQL DATE column formatted string (YYYY-MM-DD) or null.
 */
export function toSqlDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  if (!str) return null;
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}
