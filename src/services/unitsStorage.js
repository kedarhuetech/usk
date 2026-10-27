// Provides the units storage application service.
import { units as defaultUnits } from "../constants/itemsData";

const CUSTOM_UNITS_KEY = "ledgerly:customUnits.v1";
const UNIT_CONVERSIONS_KEY = "ledgerly:unitConversions.v1";

// Reads list.
function readList(key) {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

// Gets units.
export function getUnits() {
  return [...new Set([...defaultUnits, ...readList(CUSTOM_UNITS_KEY).map((unit) => String(unit).trim()).filter(Boolean)])];
}

// This helper handles custom unit logic.
export function addCustomUnit(value) {
  const name = String(value || "").trim().toUpperCase();
  if (!name) return getUnits();
  const current = readList(CUSTOM_UNITS_KEY);
  if (!getUnits().some((unit) => unit.toLowerCase() === name.toLowerCase())) {
    window.localStorage.setItem(CUSTOM_UNITS_KEY, JSON.stringify([...current, name]));
  }
  return getUnits();
}

// Gets unit conversions.
export function getUnitConversions(unit) {
  const conversions = readList(UNIT_CONVERSIONS_KEY);
  return conversions.filter((conversion) => conversion.unit === unit);
}

// This helper handles unit conversion logic.
export function addUnitConversion(unit, conversion) {
  const conversions = readList(UNIT_CONVERSIONS_KEY);
  const entry = { id: crypto.randomUUID(), unit, ...conversion, createdAt: new Date().toISOString() };
  window.localStorage.setItem(UNIT_CONVERSIONS_KEY, JSON.stringify([...conversions, entry]));
  return entry;
}
