import { units as defaultUnits } from "../constants/itemsData";

const CUSTOM_UNITS_KEY = "ledgerly:customUnits.v1";
const UNIT_CONVERSIONS_KEY = "ledgerly:unitConversions.v1";

function readList(key) {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function getUnits() {
  return [...new Set([...defaultUnits, ...readList(CUSTOM_UNITS_KEY).map((unit) => String(unit).trim()).filter(Boolean)])];
}

export function addCustomUnit(value) {
  const name = String(value || "").trim().toUpperCase();
  if (!name) return getUnits();
  const current = readList(CUSTOM_UNITS_KEY);
  if (!getUnits().some((unit) => unit.toLowerCase() === name.toLowerCase())) {
    window.localStorage.setItem(CUSTOM_UNITS_KEY, JSON.stringify([...current, name]));
  }
  return getUnits();
}

export function getUnitConversions(unit) {
  const conversions = readList(UNIT_CONVERSIONS_KEY);
  return conversions.filter((conversion) => conversion.unit === unit);
}

export function addUnitConversion(unit, conversion) {
  const conversions = readList(UNIT_CONVERSIONS_KEY);
  const entry = { id: crypto.randomUUID(), unit, ...conversion, createdAt: new Date().toISOString() };
  window.localStorage.setItem(UNIT_CONVERSIONS_KEY, JSON.stringify([...conversions, entry]));
  return entry;
}
