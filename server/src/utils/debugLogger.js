import fs from "node:fs";
import path from "node:path";

export function appendDebugLog(data) {
  try {
    const logPath = path.resolve(process.cwd(), "debug.log");
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n`;
    fs.appendFileSync(logPath, entry, "utf8");
  } catch (e) {
    console.error("Failed to write debug log", e);
  }
}

