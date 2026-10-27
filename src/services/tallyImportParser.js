// Reads Tally XML masters and reports record types this importer cannot handle.
// Limit uploads to 10 MB so large XML files do not freeze the browser.
const MAX_XML_BYTES = 10 * 1024 * 1024;

// Returns a tag name without its XML namespace prefix.
function localName(node) {
  return String(node.localName || node.nodeName || "").split(":").pop().toUpperCase();
}

// Finds a named child directly inside this XML node.
function directChild(node, names) {
  const accepted = new Set(names.map((name) => name.toUpperCase()));
  return [...(node.children || [])].find((child) => accepted.has(localName(child))) || null;
}

// Reads trimmed text from the first matching direct child.
function childText(node, ...names) {
  const child = directChild(node, names);
  return String(child?.textContent || "").trim();
}

// Reads text from a matching tag nested deeper in the XML tree.
function descendantText(node, ...names) {
  const accepted = new Set(names.map((name) => name.toUpperCase()));
  const child = [...node.getElementsByTagName("*")].find((entry) => accepted.has(localName(entry)));
  return String(child?.textContent || "").trim();
}

// Reads and joins values from a Tally list such as ADDRESS.LIST.
function listText(node, listName, childName) {
  const list = directChild(node, [listName]);
  if (!list) return "";
  return [...list.children]
    .filter((child) => localName(child) === childName.toUpperCase())
    .map((child) => String(child.textContent || "").trim())
    .filter(Boolean)
    .join(", ");
}

// Checks whether a Tally record contains a named field anywhere inside it.
function hasDescendant(node, names) {
  const accepted = new Set(names.map((name) => name.toUpperCase()));
  return [...node.getElementsByTagName("*")].some((child) => accepted.has(localName(child)));
}

// Converts one Tally ledger or stock item node into a raw record.
function recordFromNode(node, type) {
  const knownFields = new Set([
    "NAME", "NAME.LIST", "MASTERID", "GUID", "PARENT", "LEDGERPHONE", "PHONENUMBER", "PHONE",
    "EMAIL", "EMAILID", "STATENAME", "STATE", "PARTYGSTIN", "GSTIN", "GSTREGISTRATIONNUMBER",
    "ADDRESS.LIST", "ADDRESS", "OPENINGBALANCE", "BASEUNITS", "BASEUNIT", "PARTNUMBER", "PARTNO",
    "ITEMCODE", "DESCRIPTION", "HSNCODE", "HSN", "LANGUAGENAME.LIST", "MAILINGNAME.LIST",
    "CONTACTDETAILS.LIST", "BILLINGDETAILS.LIST", "ISBILLWISEON", "ISCOSTCENTRESON", "AFFECTSSTOCK",
    "ISDELETED", "ISSECURITYONWHENENTERED", "ISUPDATINGTARGETID", "ALTERID", "OLDNAME",
  ]);
  // Keep unknown field names so the preview can warn before any data is dropped.
  const unmappedFields = [...new Set([...node.children].map(localName).filter((name) => !knownFields.has(name)))];
  return {
    type,
    // Tally may store a name as a child element, a name list, or an attribute.
    name: childText(node, "NAME") || listText(node, "NAME.LIST", "NAME") || String(node.getAttribute("NAME") || "").trim(),
    parent: childText(node, "PARENT"),
    // Keep source identifiers for preview only; USV assigns its own record IDs.
    masterId: childText(node, "MASTERID") || String(node.getAttribute("MASTERID") || "").trim(),
    guid: childText(node, "GUID") || String(node.getAttribute("GUID") || "").trim(),
    // Collect source values here; the validation layer decides how to map them.
    raw: {
      phone: childText(node, "LEDGERPHONE", "PHONENUMBER", "PHONE"),
      email: childText(node, "EMAIL", "EMAILID"),
      state: childText(node, "STATENAME", "STATE"),
      gstin: childText(node, "PARTYGSTIN", "GSTIN", "GSTREGISTRATIONNUMBER"),
      address: listText(node, "ADDRESS.LIST", "ADDRESS") || childText(node, "ADDRESS"),
      openingBalance: childText(node, "OPENINGBALANCE"),
      unit: childText(node, "BASEUNITS", "BASEUNIT"),
      code: childText(node, "PARTNUMBER", "PARTNO", "ITEMCODE"),
      description: childText(node, "DESCRIPTION"),
      hsn: childText(node, "HSNCODE", "HSN") || descendantText(node, "HSNCODE", "HSN"),
      openingQuantity: childText(node, "OPENINGBALANCE"),
      hasTax: hasDescendant(node, ["GSTDETAILS.LIST", "GSTDETAILS", "GSTRATE", "TAXRATE", "GSTREGISTRATIONTYPE"]),
      hasTallyIdentifier: Boolean(childText(node, "MASTERID", "GUID") || node.getAttribute("MASTERID") || node.getAttribute("GUID")),
      hasExtraAddressDetails: hasDescendant(node, ["MAILINGNAME.LIST", "CONTACTDETAILS.LIST", "BILLINGDETAILS.LIST"]),
      unmappedFields,
    },
  };
}

// Checks the XML file and extracts supported masters plus unsupported types.
export function parseTallyXml(xmlText) {
  const source = String(xmlText || "");
  // Reject oversized and empty files before parsing them in the browser.
  if (new TextEncoder().encode(source).byteLength > MAX_XML_BYTES) throw new Error("XML files must be 10 MB or smaller.");
  if (!source.trim()) throw new Error("The selected XML file is empty.");
  // Block custom entities and document types to avoid unsafe XML expansion.
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(source)) throw new Error("XML document types and custom entities are not supported.");

  // DOMParser reports invalid XML with a parsererror element.
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("This file contains malformed XML.");
  if (localName(document.documentElement) !== "ENVELOPE") throw new Error("Expected a Tally XML ENVELOPE. Choose a Tally Data Interchange XML export.");

  // Keep supported masters separate from record types that need manual handling.
  const records = [];
  const unsupportedTypes = new Map();
  const messages = [...document.getElementsByTagName("*")].filter((node) => localName(node) === "TALLYMESSAGE");
  for (const message of messages) {
    for (const child of [...message.children]) {
      const type = localName(child);
      // Only ledger and stock item masters have a safe USV model mapping.
      if (type === "LEDGER" || type === "STOCKITEM") {
        records.push(recordFromNode(child, type));
      } else {
        unsupportedTypes.set(type, (unsupportedTypes.get(type) || 0) + 1);
      }
    }
  }
  if (!messages.length) throw new Error("No TALLYMESSAGE records were found. Choose a Tally XML data export, not a report or another XML format.");
  if (!records.length && !unsupportedTypes.size) throw new Error("No Tally ledger or stock item masters were found in this XML file.");
  return { records, unsupportedTypes: [...unsupportedTypes].map(([type, count]) => ({ type, count })) };
}

export const tallyXmlMaxBytes = MAX_XML_BYTES;
