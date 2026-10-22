/* global process */
import dotenv from "dotenv";
import path from "node:path";
import mysql from "mysql2/promise";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

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
});

export function businessIdFromRequest(req) {
  const imageRead = req.method === "GET" && /^\/assets\/[^/]+$/.test(req.path);
  const id = String(req.get("x-business-id") || (imageRead ? req.query.businessId : "") || "").trim();
  if (!id || id.length > 64) throw Object.assign(new Error("A valid X-Business-Id header is required."), { status: 400 });
  return id;
}
