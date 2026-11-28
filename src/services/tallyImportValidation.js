// Maps TallyPrime / Tally.ERP 9 records to Udyog (USV) Party and Item models.
import { getStateNameFromGstin } from "../utils/gstinUtils.js";
import { getCompanyProfile } from "./companyProfileStorage.js";

const text = (value) => String(value ?? "").trim();
const keyText = (value) => text(value).toLowerCase().replace(/\s+/g, " ");

// Converts a Tally debit or credit balance to Udyog's opening balance fields.
function parseOpeningBalance(value) {
  const match = text(value).replace(/,/g, "").match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(CR|DR)?$/i);
  if (!match) return null;
  const signed = Number(match[1]);
  if (!Number.isFinite(signed)) return null;
  const suffix = String(match[2] || "").toUpperCase();
  return {
    amount: String(Math.abs(signed)),
    type: suffix === "CR" || signed < 0 ? "to-pay" : "to-receive",
  };
}

// Accepts an opening quantity only when its unit matches the item's base unit.
function parseOpeningQuantity(value, baseUnit) {
  const match = text(value).replace(/,/g, "").match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s+([^@]+?))?(?:\s*@.*)?$/i);
  if (!match) return null;
  const quantity = Number(match[1]);
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const exportedUnit = text(match[2]).trim();
  if (exportedUnit && baseUnit && keyText(exportedUnit) !== keyText(baseUnit)) return null;
  return String(quantity);
}

// Extracts numeric rate from Tally OPENINGRATE (e.g. "150.00/Nos" or "150.00") if unit matches.
function parseOpeningRate(value, baseUnit) {
  const raw = text(value).replace(/,/g, "");
  if (!raw) return null;
  const match = raw.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*\/\s*(.+))?$/);
  if (!match) return null;
  const rate = Number(match[1]);
  if (!Number.isFinite(rate) || rate < 0) return null;
  const rateUnit = text(match[2]);
  if (rateUnit && baseUnit && keyText(rateUnit) !== keyText(baseUnit)) return null;
  return String(rate);
}

// Parses positive numeric price/limit fields safely.
function parseNonNegativeNumber(value) {
  const cleaned = text(value).replace(/,/g, "").match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))/);
  if (!cleaned) return null;
  const num = Number(cleaned[1]);
  if (!Number.isFinite(num) || num < 0) return null;
  return String(num);
}

// Maps Tally GST registration type string to Udyog gstType values.
function mapGstRegistrationType(rawType, gstin) {
  const t = keyText(rawType);
  if (t.includes("composition")) return "Composition";
  if (t.includes("regular")) return "Registered - Regular";
  if (t.includes("unregistered") || t.includes("consumer")) return "Unregistered / Consumer";
  if (gstin) return "Registered - Regular";
  return "";
}

// Maps Tally GST rate / taxability to Udyog taxOptions format.
function mapTallyTaxRate(gstRate, taxability, gstApplicable) {
  const taxabilityLower = keyText(taxability);
  if (taxabilityLower === "exempt" || taxabilityLower === "exempted") return "Exempt";
  if (taxabilityLower === "nil rated") return "GST 0%";
  const num = Number.parseFloat(String(gstRate || "").replace(/[^0-9.]/g, ""));
  if (Number.isFinite(num) && num >= 0) {
    const supported = [0, 5, 12, 18, 28, 40];
    if (supported.includes(num)) return `GST ${num}%`;
  }
  if (keyText(gstApplicable) === "not applicable") return "None";
  return "";
}

// Classifies customer vs supplier based on resolved Tally parent group.
function classifyPartyGroup(record) {
  const root = keyText(record.resolvedGroup || record.parent);
  if (["sundry debtors", "accounts receivable"].includes(root)) return "customer";
  if (["sundry creditors", "accounts payable"].includes(root)) return "supplier";
  return null;
}

// Maps supported Tally ledger fields into the existing Udyog party model.
function mapParty(record) {
  const raw = record.raw || {};
  const errors = [];
  const warnings = [];
  const partyType = classifyPartyGroup(record);

  if (!record.name) errors.push("Ledger name is required.");
  if (!partyType) {
    errors.push(`Ledger group “${record.parent || "(missing)"}” is not a supported customer/supplier group.`);
  }
  if (record.parent && record.resolvedGroup && keyText(record.parent) !== keyText(record.resolvedGroup)) {
    warnings.push(`Classified as ${partyType} via Tally parent group hierarchy (“${record.parent}” → “${record.resolvedGroup}”).`);
  }

  const balance = raw.openingBalance ? parseOpeningBalance(raw.openingBalance) : null;
  if (raw.openingBalance && !balance) {
    warnings.push(`Opening balance “${raw.openingBalance}” could not be mapped; it will not be imported.`);
  }

  const creditLimit = raw.creditLimit ? parseNonNegativeNumber(raw.creditLimit) : null;
  const gstType = mapGstRegistrationType(raw.gstType, raw.gstin);

  const additionalFields = [];
  if (record.alias) additionalFields.push({ label: "Tally Alias", value: record.alias });
  if (raw.contactPerson) additionalFields.push({ label: "Contact Person", value: raw.contactPerson });
  if (raw.creditPeriod) additionalFields.push({ label: "Credit Period", value: raw.creditPeriod });

  if (raw.hasTax && !raw.gstin && !gstType) {
    warnings.push("Additional ledger tax registration/details beyond GSTIN are not mapped by USV's party model.");
  }
  if (raw.hasExtraAddressDetails) {
    warnings.push("Extra mailing/contact details are present; primary address, state, pincode, phone, and email are mapped.");
  }
  if (raw.hasTallyIdentifier) {
    warnings.push("Tally MASTERID/GUID is shown for reference only; duplicate checks use party name and contact/GSTIN, and USV creates its own ID.");
  }
  if (raw.unmappedFields?.length) {
    warnings.push(`Tally fields not mapped: ${raw.unmappedFields.join(", ")}.`);
  }

  return {
    recordType: "party",
    partyType: partyType || "customer",
    sourceName: record.name,
    sourceGroup: record.parent,
    sourceReference: [record.masterId && `ID ${record.masterId}`, record.guid && `GUID ${record.guid}`].filter(Boolean).join(" · "),
    party: {
      partyName: record.name,
      ...(partyType ? { partyType } : {}),
      ...(record.parent ? { group: record.parent } : {}),
      gstin: text(raw.gstin),
      ...(text(raw.pan) ? { pan: text(raw.pan) } : {}),
      ...(gstType ? { gstType } : {}),
      phone: text(raw.phone),
      email: text(raw.email),
      state: text(raw.state) || getStateNameFromGstin(raw.gstin) || (typeof getCompanyProfile === "function" ? (getCompanyProfile()?.state || getCompanyProfile()?.businessState || "") : ""),
      ...(text(raw.city) ? { billingCity: text(raw.city) } : {}),
      ...(text(raw.pincode) ? { billingPincode: text(raw.pincode) } : {}),
      billingAddress: text(raw.address),
      ...(balance ? { openingBalance: balance.amount, openingBalanceType: balance.type } : {}),
      ...(creditLimit !== null ? { creditLimit, creditLimitType: Number(creditLimit) > 0 ? "custom" : "no-limit" } : {}),
      ...(additionalFields.length ? { additionalFields } : {}),
    },
    errors,
    warnings,
    status: "ready",
  };
}

// Maps supported Tally stock item fields into the existing Udyog item model.
function mapItem(record) {
  const raw = record.raw || {};
  const errors = [];
  const warnings = [];
  if (!record.name) errors.push("Stock item name is required.");

  const openingQuantity = raw.openingQuantity ? parseOpeningQuantity(raw.openingQuantity, raw.unit) : null;
  if (raw.openingQuantity && openingQuantity === null) {
    warnings.push(`Opening quantity “${raw.openingQuantity}” could not be safely mapped to base unit “${raw.unit || "(missing)"}”; quantity will not be imported.`);
  }
  const openingRate = raw.openingRate ? parseOpeningRate(raw.openingRate, raw.unit) : null;
  if (raw.openingRate && openingRate === null) {
    warnings.push(`Opening rate “${raw.openingRate}” could not be mapped to base unit “${raw.unit || "(missing)"}”.`);
  }
  const salePrice = raw.salePrice ? parseNonNegativeNumber(raw.salePrice) : null;
  const mappedTaxRate = mapTallyTaxRate(raw.gstRate, raw.taxability, raw.gstApplicable);

  if (!raw.unit) warnings.push("Base unit is missing; USV will save this item with no unit.");
  if (raw.alternateUnit && keyText(raw.alternateUnit) !== keyText(raw.unit)) {
    warnings.push(`Alternate unit “${raw.alternateUnit}” is not auto-converted; base unit “${raw.unit || "-"}” is preserved.`);
  }
  if (raw.hasTax && !mappedTaxRate) {
    warnings.push("GST/tax details are not mapped because Tally tax rules may not match USV's tax-rate model.");
  }
  if (raw.hasTallyIdentifier) {
    warnings.push("Tally MASTERID/GUID is shown for reference only; duplicate checks use item code or name and unit, and USV creates its own ID.");
  }
  if (raw.unmappedFields?.length) {
    warnings.push(`Tally fields not mapped: ${raw.unmappedFields.join(", ")}.`);
  }

  return {
    recordType: "item",
    sourceName: record.name,
    sourceGroup: record.parent,
    sourceReference: [record.masterId && `ID ${record.masterId}`, record.guid && `GUID ${record.guid}`].filter(Boolean).join(" · "),
    item: {
      type: "product",
      itemName: record.name,
      itemCode: text(raw.code),
      code: text(raw.code),
      category: text(record.parent),
      unit: text(raw.unit),
      description: text(raw.description),
      hsn: text(raw.hsn),
      ...(mappedTaxRate ? { taxRate: mappedTaxRate } : {}),
      ...(openingRate !== null ? { purchasePrice: openingRate, atPrice: openingRate } : {}),
      ...(salePrice !== null ? { salePrice } : {}),
      ...(openingQuantity !== null ? { openingQuantity, stock: openingQuantity } : {}),
    },
    errors,
    warnings,
    status: "ready",
  };
}

// Maps each parsed Tally master and checks required fields and file duplicates.
export function mapAndValidateTallyRecords(rawRecords) {
  const seen = [];
  return rawRecords.map((record, index) => {
    const mapped = record.type === "LEDGER" ? mapParty(record) : mapItem(record);
    mapped.sourceIndex = index + 1;
    const duplicate = seen.some((previous) => previous.recordType === mapped.recordType && (
      mapped.recordType === "party"
        ? partyMatches(mapped.party, previous.party)
        : (mapped.item.itemCode && keyText(mapped.item.itemCode) === keyText(previous.item.itemCode))
          || (keyText(mapped.item.itemName) === keyText(previous.item.itemName) && keyText(mapped.item.unit) === keyText(previous.item.unit))
    ));
    if (duplicate) mapped.errors.push("Duplicate record in this file.");
    seen.push(mapped);
    mapped.status = mapped.errors.length ? "invalid" : "ready";
    return mapped;
  });
}

// Matches parties by GSTIN or by name and available contact details.
function partyMatches(a, b) {
  const sameName = keyText(a.partyName) && keyText(a.partyName) === keyText(b.partyName || b.name);
  const aGstin = keyText(a.gstin);
  const bGstin = keyText(b.gstin);
  const aContact = text(a.phone).replace(/\D/g, "") || keyText(a.email);
  const bContact = text(b.phone).replace(/\D/g, "") || keyText(b.email);
  return (aGstin && aGstin === bGstin) || (sameName && (!aContact || !bContact || aContact === bContact));
}

// Marks records already saved in the active repository and attaches existingId for optional updates.
export function markStoredDuplicates(records, existingParties, existingItems) {
  return records.map((record) => {
    if (record.errors.length) return record;
    const matched = record.recordType === "party"
      ? existingParties.find((existing) => partyMatches(record.party, existing))
      : existingItems.find((existing) => (
        (record.item.itemCode && keyText(record.item.itemCode) === keyText(existing.itemCode || existing.code))
        || (keyText(record.item.itemName) === keyText(existing.itemName || existing.name)
          && keyText(record.item.unit) === keyText(existing.unit || existing.baseUnit))
      ));
    return matched
      ? {
          ...record,
          status: "duplicate",
          existingId: matched.id,
          warnings: [
            ...record.warnings,
            "A matching Udyog record already exists; it will be skipped by default unless you choose to update existing records.",
          ],
        }
      : record;
  });
}

// Returns the Udyog party or item object ready for the storage layer.
export function getTallyImportPayload(record) {
  return record.recordType === "party" ? record.party : record.item;
}
