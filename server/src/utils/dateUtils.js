/**
 * India Standard Time (+05:30) date utilities for backend routes and services.
 * Prevents UTC midnight rollbacks between 00:00 and 05:30 IST.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function getIstDateString(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    const now = new Date(Date.now() + IST_OFFSET_MS);
    return now.toISOString().slice(0, 10);
  }
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

export function toIstSqlDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    return getIstDateString(val);
  }
  const str = String(val).trim();
  if (!str) return null;

  // Exact calendar date YYYY-MM-DD (no time component)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  }

  // Timestamp with time / Z / offset -> convert to IST calendar date
  if (/[T\sZ]/.test(str)) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return getIstDateString(parsed);
    }
  }

  const isoPrefix = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) return `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`;

  return null;
}
