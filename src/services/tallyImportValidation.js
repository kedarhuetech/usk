// Maps Tally records to USV fields and flags missing, unsupported, or duplicate data.
const text = (value) => String(value ?? "").trim();
// This helper handles text logic.
const keyText = (value) => text(value).toLowerCase().replace(/\s+/g, " ");

// Converts a Tally debit or credit balance to USV's opening balance fields.
function parseOpeningBalance(value) {
  // Accept a number with an optional Tally CR/DR suffix; reject other formats.
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

// Allows only ledger groups that represent customers or suppliers.
function partySupported(record) {
  const parent = keyText(record.parent);
  return ["sundry debtors", "sundry creditors", "accounts receivable", "accounts payable"].includes(parent);
}

// Maps supported Tally ledger fields into the existing USV party model.
function mapParty(record) {
  const raw = record.raw || {};
  const errors = [];
  const warnings = [];
  // A ledger is a party only when its parent group identifies a debtor or creditor.
  if (!record.name) errors.push("Ledger name is required.");
  if (!partySupported(record)) errors.push(`Ledger group “${record.parent || "(missing)"}” is not a supported customer/supplier group.`);
  if (record.parent) warnings.push("The Tally ledger group is used for filtering, but USV stores a generic party and does not retain the customer/supplier group.");
  // Store a balance only when the amount and debit/credit direction are clear.
  const balance = raw.openingBalance ? parseOpeningBalance(raw.openingBalance) : null;
  if (raw.openingBalance && !balance) warnings.push(`Opening balance “${raw.openingBalance}” could not be mapped; it will not be imported.`);
  if (raw.hasTax) warnings.push("Additional ledger tax registration/details beyond GSTIN are not mapped by USV's party model.");
  if (raw.hasExtraAddressDetails) warnings.push("Extra mailing/contact details are present; USV only stores the primary address, phone, and email.");
  if (raw.hasTallyIdentifier) warnings.push("Tally MASTERID/GUID is shown for reference only; duplicate checks use party name and contact/GSTIN, and USV creates its own ID.");
  if (raw.unmappedFields?.length) warnings.push(`Tally fields not mapped: ${raw.unmappedFields.join(", ")}.`);
  // Use only fields the existing USV party model already understands.
  return {
    recordType: "party",
    sourceName: record.name,
    sourceGroup: record.parent,
    sourceReference: [record.masterId && `ID ${record.masterId}`, record.guid && `GUID ${record.guid}`].filter(Boolean).join(" · "),
    party: {
      partyName: record.name,
      gstin: text(raw.gstin),
      phone: text(raw.phone),
      email: text(raw.email),
      state: text(raw.state),
      billingAddress: text(raw.address),
      ...(balance ? { openingBalance: balance.amount, openingBalanceType: balance.type } : {}),
    },
    errors,
    warnings,
    status: "ready",
  };
}

// Maps supported Tally stock item fields into the existing USV item model.
function mapItem(record) {
  const raw = record.raw || {};
  const errors = [];
  const warnings = [];
  if (!record.name) errors.push("Stock item name is required.");
  // Import stock quantity only when it matches the item's base unit.
  const openingQuantity = raw.openingQuantity ? parseOpeningQuantity(raw.openingQuantity, raw.unit) : null;
  if (raw.openingQuantity && openingQuantity === null) warnings.push(`Opening quantity “${raw.openingQuantity}” could not be safely mapped to base unit “${raw.unit || "(missing)"}”; quantity will not be imported.`);
  if (!raw.unit) warnings.push("Base unit is missing; USV will save this item with no unit.");
  if (raw.hasTax) warnings.push("GST/tax details are not mapped because Tally tax rules may not match USV's tax-rate model.");
  if (raw.hasTallyIdentifier) warnings.push("Tally MASTERID/GUID is shown for reference only; duplicate checks use item code or name and unit, and USV creates its own ID.");
  if (raw.unmappedFields?.length) warnings.push(`Tally fields not mapped: ${raw.unmappedFields.join(", ")}.`);
  // Keep product fields aligned with the existing inventory item model.
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
      ...(openingQuantity !== null ? { openingQuantity, stock: openingQuantity } : {}),
    },
    errors,
    warnings,
    status: "ready",
  };
}

// Maps each parsed Tally master and checks required fields and file duplicates.
export function mapAndValidateTallyRecords(rawRecords) {
  // Compare each mapped row with earlier rows in the same XML file.
  const seen = [];
  return rawRecords.map((record, index) => {
    const mapped = record.type === "LEDGER" ? mapParty(record) : mapItem(record);
    mapped.sourceIndex = index + 1;
    // Parties match by GSTIN or name/contact; items match by code or name/unit.
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
  const sameName = keyText(a.partyName) && keyText(a.partyName) === keyText(b.partyName);
  const aGstin = keyText(a.gstin);
  const bGstin = keyText(b.gstin);
  const aContact = text(a.phone).replace(/\D/g, "") || keyText(a.email);
  const bContact = text(b.phone).replace(/\D/g, "") || keyText(b.email);
  // A GSTIN is unique; otherwise use the name with any available contact.
  return (aGstin && aGstin === bGstin) || (sameName && (!aContact || !bContact || aContact === bContact));
}

// Marks records already saved in the active repository without overwriting them.
export function markStoredDuplicates(records, existingParties, existingItems) {
  return records.map((record) => {
    // Invalid rows cannot be imported, so leave their original validation errors.
    if (record.errors.length) return record;
    const duplicate = record.recordType === "party"
      ? existingParties.some((existing) => partyMatches(record.party, existing))
      : existingItems.some((existing) => (
        (record.item.itemCode && keyText(record.item.itemCode) === keyText(existing.itemCode || existing.code))
        || (keyText(record.item.itemName) === keyText(existing.itemName || existing.name)
          && keyText(record.item.unit) === keyText(existing.unit || existing.baseUnit))
      ));
    return duplicate ? { ...record, status: "duplicate", warnings: [...record.warnings, "A matching USV record already exists; this import will skip it and will not overwrite it."] } : record;
  });
}

// Returns the USV party or item object ready for the storage layer.
export function getTallyImportPayload(record) {
  // Strip preview metadata before passing the canonical model to storage.
  return record.recordType === "party" ? record.party : record.item;
}
