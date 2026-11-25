/**
 * IST-safe date utilities for USV frontend.
 * Standardizes calendar date parsing and Financial Year (Apr 1 - Mar 31) calculations
 * without UTC off-by-one shifts.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns today's YYYY-MM-DD calendar date in Asia/Kolkata (IST).
 */
export function getIstTodayYMD(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

/**
 * Parses a YYYY-MM-DD (or ISO / Date) string into a local Date at midnight
 * without UTC timezone shift. Matches YYYY-MM-DD regex first.
 */
export function parseYMD(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const str = String(value).trim();
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]) - 1;
    const day = Number(ymdMatch[3]);
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmyMatch = str.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  const istYmd = getIstTodayYMD(parsed);
  return istYmd ? parseYMD(istYmd) : null;
}

/**
 * Formats a Date or date-like value as YYYY-MM-DD in IST.
 */
export function formatYMD(value) {
  const d = parseYMD(value);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns the Indian Financial Year (Apr 1 to Mar 31) start/end YYYY-MM-DD
 * for the given reference date (defaults to today in IST).
 */
export function getFinancialYearRange(refDate = new Date()) {
  const d = parseYMD(refDate) || parseYMD(getIstTodayYMD());
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan, 3 = Apr
  const startYear = month >= 3 ? year : year - 1;
  return {
    startDate: `${startYear}-04-01`,
    endDate: `${startYear + 1}-03-31`,
  };
}
