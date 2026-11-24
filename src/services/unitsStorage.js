// Provides the units storage application service.
import { units as defaultUnits } from "../constants/itemsData.js";
import { unitsDb } from "./databaseRepository.js";
import { isDatabaseMode } from "./dataStorageConfig.js";
import { getScopedStorageKey } from "../config/businessConfig.js";

const CUSTOM_UNITS_KEY = "ledgerly:customUnits.v1";
const UNIT_CONVERSIONS_KEY = "ledgerly:unitConversions.v1";

const getCustomUnitsKey = () => getScopedStorageKey(CUSTOM_UNITS_KEY);
const getUnitConversionsKey = () => getScopedStorageKey(UNIT_CONVERSIONS_KEY);

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
  return [...new Set([...defaultUnits, ...readList(getCustomUnitsKey()).map((unit) => String(unit).trim()).filter(Boolean)])];
}

// This helper handles custom unit logic.
export function addCustomUnit(value) {
  const name = String(value || "").trim().toUpperCase();
  if (!name) return getUnits();
  const current = readList(getCustomUnitsKey());
  if (!getUnits().some((unit) => unit.toLowerCase() === name.toLowerCase())) {
    window.localStorage.setItem(getCustomUnitsKey(), JSON.stringify([...current, name]));
    if (isDatabaseMode()) {
      unitsDb.save({ name, shortName: name }).catch((err) => console.warn("[MySQL] Units background sync:", err.message));
    }
  }
  return getUnits();
}

// Gets unit conversions.
export function getUnitConversions(unit) {
  const conversions = readList(getUnitConversionsKey());
  return conversions.filter((conversion) => conversion.unit === unit);
}

// Live fetch unit conversions directly from MySQL backend
export async function fetchUnitConversionsFromDb(unit) {
  if (isDatabaseMode()) {
    try {
      const remote = await unitsDb.listConversions(unit);
      if (Array.isArray(remote)) {
        window.localStorage.setItem(getUnitConversionsKey(), JSON.stringify(remote));
        return remote;
      }
    } catch (err) {
      console.warn("[Units] Failed to fetch conversions from MySQL:", err.message);
    }
  }
  return getUnitConversions(unit);
}

// This helper handles unit conversion logic.
export async function addUnitConversion(unit, conversion) {
  const entry = { id: crypto.randomUUID(), unit, ...conversion, createdAt: new Date().toISOString() };
  if (isDatabaseMode()) {
    try {
      await unitsDb.saveConversion(entry);
    } catch (err) {
      console.warn("[Units] Failed to persist conversion to MySQL:", err.message);
      throw err;
    }
  }
  const conversions = readList(getUnitConversionsKey());
  window.localStorage.setItem(getUnitConversionsKey(), JSON.stringify([...conversions, entry]));
  return entry;
}
