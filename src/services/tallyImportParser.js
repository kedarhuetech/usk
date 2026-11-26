// Reads TallyPrime / Tally.ERP 9 XML Data Interchange exports and extracts supported masters plus metadata.
// Limit uploads to 10 MB so large XML files do not freeze the browser.
const MAX_XML_BYTES = 10 * 1024 * 1024;

// Returns a tag name without its XML namespace prefix.
function localName(node) {
  return String(node?.localName || node?.nodeName || "").split(":").pop().toUpperCase();
}

// Finds a named child directly inside this XML node.
function directChild(node, names) {
  const accepted = new Set(names.map((name) => name.toUpperCase()));
  return [...(node?.children || [])].find((child) => accepted.has(localName(child))) || null;
}

// Finds all named children directly inside this XML node.
function directChildren(node, names) {
  const accepted = new Set(names.map((name) => name.toUpperCase()));
  return [...(node?.children || [])].filter((child) => accepted.has(localName(child)));
}

// Reads trimmed text from the first matching direct child.
function childText(node, ...names) {
  const child = directChild(node, names);
  return String(child?.textContent || "").trim();
}

// Reads text from a matching tag nested deeper in the XML tree.
function descendantText(node, ...names) {
  const accepted = new Set(names.map((name) => name.toUpperCase()));
  const child = [...(node?.getElementsByTagName?.("*") || [])].find((entry) => accepted.has(localName(entry)));
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

// Extracts primary name and aliases from TallyPrime LANGUAGENAME.LIST / NAME.LIST / @NAME.
function extractNames(node) {
  const attrName = String(node.getAttribute("NAME") || "").trim();
  const directName = childText(node, "NAME");
  const langList = directChild(node, ["LANGUAGENAME.LIST"]);
  const nameListNode = langList ? directChild(langList, ["NAME.LIST"]) : directChild(node, ["NAME.LIST"]);
  const listNames = nameListNode
    ? [...nameListNode.children]
        .filter((c) => localName(c) === "NAME")
        .map((c) => String(c.textContent || "").trim())
        .filter(Boolean)
    : [];

  const primaryName = directName || listNames[0] || attrName;
  const aliasFromAttr = childText(node, "ALIAS");
  const aliases = [...new Set([
    ...listNames.slice(1),
    ...(aliasFromAttr ? [aliasFromAttr] : []),
  ])].filter((a) => a && a.toLowerCase() !== primaryName.toLowerCase());

  return { primaryName, alias: aliases.join(", ") };
}

// Extracts latest effective LEDMAILINGDETAILS.LIST entry (TallyPrime address/state/pincode).
function extractMailingDetails(node) {
  const mailingLists = directChildren(node, ["LEDMAILINGDETAILS.LIST", "LEDMAILINGDETAILS"]);
  if (!mailingLists.length) return {};
  // Take the last/most recent entry by APPLICABLEFROM if multiple exist
  const sorted = [...mailingLists].sort((a, b) =>
    childText(a, "APPLICABLEFROM").localeCompare(childText(b, "APPLICABLEFROM"))
  );
  const latest = sorted[sorted.length - 1];
  const address = listText(latest, "ADDRESS.LIST", "ADDRESS") || childText(latest, "ADDRESS");
  return {
    mailingName: childText(latest, "MAILINGNAME"),
    address,
    state: childText(latest, "STATE", "STATENAME"),
    country: childText(latest, "COUNTRY", "COUNTRYNAME"),
    pincode: childText(latest, "PINCODE"),
  };
}

// Extracts GST registration details from LEDGSTREGDETAILS.LIST or direct ledger tags.
function extractLedgerGstDetails(node) {
  const gstLists = directChildren(node, ["LEDGSTREGDETAILS.LIST", "LEDGSTREGDETAILS"]);
  const latest = gstLists.length
    ? [...gstLists].sort((a, b) => childText(a, "APPLICABLEFROM").localeCompare(childText(b, "APPLICABLEFROM")))[gstLists.length - 1]
    : null;
  return {
    gstin: childText(node, "PARTYGSTIN", "GSTIN", "GSTREGISTRATIONNUMBER") || (latest ? childText(latest, "GSTIN", "PARTYGSTIN") : ""),
    gstRegistrationType: childText(node, "GSTREGISTRATIONTYPE") || (latest ? childText(latest, "GSTREGISTRATIONTYPE") : ""),
    gstState: latest ? childText(latest, "STATE", "STATENAME") : "",
  };
}

// Extracts GST rate & HSN from TallyPrime STOCKITEM GSTDETAILS.LIST / STATEWISEDETAILS.LIST / RATEDETAILS.LIST.
function extractStockItemGstDetails(node) {
  const directHsn = childText(node, "HSNCODE", "HSN");
  const gstDetailsLists = directChildren(node, ["GSTDETAILS.LIST", "GSTDETAILS"]);
  const latestGst = gstDetailsLists.length
    ? [...gstDetailsLists].sort((a, b) => childText(a, "APPLICABLEFROM").localeCompare(childText(b, "APPLICABLEFROM")))[gstDetailsLists.length - 1]
    : null;

  const hsn = directHsn
    || (latestGst ? (childText(latestGst, "HSNCODE", "HSN") || descendantText(latestGst, "HSNCODE", "HSN")) : "")
    || descendantText(node, "HSNCODE", "HSN");

  const taxability = latestGst ? childText(latestGst, "TAXABILITY") : descendantText(node, "TAXABILITY");
  const gstApplicable = childText(node, "GSTAPPLICABLE");

  let gstRate = childText(node, "GSTRATE", "TAXRATE");
  if (!gstRate && latestGst) {
    const rateNodes = [...latestGst.getElementsByTagName("*")].filter((el) => localName(el) === "RATEDETAILS.LIST" || localName(el) === "RATEDETAILS");
    let igst = "";
    let cgst = 0;
    let sgst = 0;
    for (const rNode of rateNodes) {
      const head = childText(rNode, "GSTRATEDUTYHEAD").toLowerCase();
      const rateVal = childText(rNode, "GSTRATE");
      if (!rateVal) continue;
      if (head.includes("integrated") || head === "igst") {
        igst = rateVal;
      } else if (head.includes("central") || head === "cgst") {
        cgst = parseFloat(rateVal) || 0;
      } else if (head.includes("state") || head.includes("ut") || head === "sgst") {
        sgst = parseFloat(rateVal) || 0;
      }
    }
    if (igst) gstRate = igst;
    else if (cgst + sgst > 0) gstRate = String(cgst + sgst);
    else gstRate = descendantText(latestGst, "GSTRATE");
  }

  return { hsn, gstRate, taxability, gstApplicable };
}

// Checks whether a Tally record contains a named field anywhere inside it.
function hasDescendant(node, names) {
  const accepted = new Set(names.map((name) => name.toUpperCase()));
  return [...node.getElementsByTagName("*")].some((child) => accepted.has(localName(child)));
}

// Resolves a ledger/group's root ancestor group using the exported GROUP hierarchy.
function resolveRootGroup(parentName, groupMap) {
  const visited = new Set();
  let current = String(parentName || "").trim();
  while (current) {
    const key = current.toLowerCase().replace(/\s+/g, " ");
    if (["sundry debtors", "sundry creditors", "accounts receivable", "accounts payable"].includes(key)) {
      return current;
    }
    if (visited.has(key)) break;
    visited.add(key);
    const nextParent = groupMap.get(key);
    if (!nextParent) break;
    current = nextParent;
  }
  return parentName;
}

// Converts one Tally ledger or stock item node into a raw record.
function recordFromNode(node, type, groupMap) {
  const knownFields = new Set([
    "NAME", "NAME.LIST", "ALIAS", "MASTERID", "GUID", "PARENT", "LEDGERPHONE", "PHONENUMBER", "PHONE",
    "LEDGERMOBILE", "MOBILE", "LEDGERCONTACT", "EMAIL", "EMAILID", "STATENAME", "STATE", "LEDSTATENAME",
    "CITY", "PINCODE", "LEDGERPINCODE", "COUNTRYNAME", "COUNTRY", "INCOMETAXNUMBER", "PAN",
    "PARTYGSTIN", "GSTIN", "GSTREGISTRATIONNUMBER", "GSTREGISTRATIONTYPE", "LEDGSTREGDETAILS.LIST", "LEDGSTREGDETAILS",
    "LEDMAILINGDETAILS.LIST", "LEDMAILINGDETAILS", "ADDRESS.LIST", "ADDRESS", "OPENINGBALANCE",
    "CREDITLIMIT", "BILLCREDITPERIOD", "BASEUNITS", "BASEUNIT", "ADDITIONALUNITS", "PARTNUMBER", "PARTNO",
    "ITEMCODE", "DESCRIPTION", "NARRATION", "HSNCODE", "HSN", "OPENINGRATE", "OPENINGVALUE",
    "STANDARDPRICE", "STDSELLINGPRICE", "MRP", "GSTAPPLICABLE", "GSTTYPEOFSUPPLY", "GSTDETAILS.LIST", "GSTDETAILS",
    "LANGUAGENAME.LIST", "MAILINGNAME.LIST", "CONTACTDETAILS.LIST", "BILLINGDETAILS.LIST",
    "ISBILLWISEON", "ISCOSTCENTRESON", "AFFECTSSTOCK", "ISDELETED", "ISSECURITYONWHENENTERED",
    "ISUPDATINGTARGETID", "ALTERID", "OLDNAME", "GUID", "OBJECTUPDATEACTION",
  ]);
  const unmappedFields = [...new Set([...node.children].map(localName).filter((name) => !knownFields.has(name)))];
  const { primaryName, alias } = extractNames(node);
  const parent = childText(node, "PARENT");
  const resolvedGroup = type === "LEDGER" ? resolveRootGroup(parent, groupMap) : parent;
  const mailing = type === "LEDGER" ? extractMailingDetails(node) : {};
  const ledgerGst = type === "LEDGER" ? extractLedgerGstDetails(node) : {};
  const itemGst = type === "STOCKITEM" ? extractStockItemGstDetails(node) : {};

  const phone = childText(node, "LEDGERMOBILE", "MOBILE", "LEDGERPHONE", "PHONENUMBER", "PHONE");
  const address = mailing.address || listText(node, "ADDRESS.LIST", "ADDRESS") || childText(node, "ADDRESS");
  const state = mailing.state || ledgerGst.gstState || childText(node, "STATENAME", "LEDSTATENAME", "STATE");
  const pincode = mailing.pincode || childText(node, "PINCODE", "LEDGERPINCODE");
  const city = childText(node, "CITY");

  return {
    type,
    name: primaryName,
    alias,
    parent,
    resolvedGroup,
    masterId: childText(node, "MASTERID") || String(node.getAttribute("MASTERID") || "").trim(),
    guid: childText(node, "GUID") || String(node.getAttribute("GUID") || "").trim(),
    raw: {
      phone,
      email: childText(node, "EMAIL", "EMAILID"),
      contactPerson: childText(node, "LEDGERCONTACT") || mailing.mailingName || "",
      state,
      city,
      pincode,
      pan: childText(node, "INCOMETAXNUMBER", "PAN"),
      gstin: ledgerGst.gstin || "",
      gstType: ledgerGst.gstRegistrationType || "",
      address,
      openingBalance: childText(node, "OPENINGBALANCE"),
      creditLimit: childText(node, "CREDITLIMIT"),
      creditPeriod: childText(node, "BILLCREDITPERIOD"),
      unit: childText(node, "BASEUNITS", "BASEUNIT"),
      alternateUnit: childText(node, "ADDITIONALUNITS"),
      code: childText(node, "PARTNUMBER", "PARTNO", "ITEMCODE") || alias,
      description: childText(node, "DESCRIPTION", "NARRATION"),
      hsn: itemGst.hsn || "",
      gstRate: itemGst.gstRate || "",
      taxability: itemGst.taxability || "",
      gstApplicable: itemGst.gstApplicable || "",
      openingQuantity: childText(node, "OPENINGBALANCE"),
      openingRate: childText(node, "OPENINGRATE"),
      openingValue: childText(node, "OPENINGVALUE"),
      salePrice: childText(node, "STANDARDPRICE", "STDSELLINGPRICE", "MRP"),
      hasTax: hasDescendant(node, ["GSTDETAILS.LIST", "GSTDETAILS", "GSTRATE", "TAXRATE", "GSTREGISTRATIONTYPE"]),
      hasTallyIdentifier: Boolean(childText(node, "MASTERID", "GUID") || node.getAttribute("MASTERID") || node.getAttribute("GUID")),
      hasExtraAddressDetails: hasDescendant(node, ["MAILINGNAME.LIST", "CONTACTDETAILS.LIST", "BILLINGDETAILS.LIST"]),
      unmappedFields,
    },
  };
}

// Sanitizes XML 1.0 invalid control characters that Tally occasionally emits.
function sanitizeXmlControlChars(source) {
  // eslint-disable-next-line no-control-regex
  return source.replace(/^\uFEFF/, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").replace(/&#0*([1-8]|1[1-2]|1[4-9]|2[0-9]|3[01]);/gi, "").replace(/&#x0*([1-8bcef]|1[0-9a-f]);/gi, "");
}

// Checks the XML file and extracts supported masters plus unsupported types & metadata.
export function parseTallyXml(xmlText) {
  const rawSource = String(xmlText || "");
  if (new TextEncoder().encode(rawSource).byteLength > MAX_XML_BYTES) {
    throw new Error("XML files must be 10 MB or smaller.");
  }
  const source = sanitizeXmlControlChars(rawSource);
  if (!source.trim()) throw new Error("The selected XML file is empty.");
  // Block custom entities and document types to avoid XXE / entity expansion attacks.
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(source)) {
    throw new Error("XML document types and custom entities are not supported.");
  }

  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("This file contains malformed XML.");
  if (localName(document.documentElement) !== "ENVELOPE") {
    throw new Error("Expected a Tally XML ENVELOPE. Choose a Tally Data Interchange XML export.");
  }

  // Extract Tally export header metadata
  const companyName = descendantText(document.documentElement, "SVCURRENTCOMPANY", "COMPANYNAME");
  const reportName = descendantText(document.documentElement, "REPORTNAME", "ID");
  const tallyVersion = descendantText(document.documentElement, "VERSION");

  const messages = [...document.getElementsByTagName("*")].filter((node) => localName(node) === "TALLYMESSAGE");
  if (!messages.length) {
    throw new Error("No TALLYMESSAGE records were found. Choose a Tally XML data export, not a report or another XML format.");
  }

  // First pass: collect GROUP hierarchy so sub-groups of Sundry Debtors / Creditors resolve accurately.
  const groupMap = new Map();
  for (const message of messages) {
    for (const child of [...message.children]) {
      if (localName(child) === "GROUP") {
        const { primaryName } = extractNames(child);
        const parent = childText(child, "PARENT");
        if (primaryName && parent) {
          groupMap.set(primaryName.toLowerCase().replace(/\s+/g, " "), parent);
        }
      }
    }
  }

  // Second pass: extract LEDGER and STOCKITEM masters and count unsupported record types.
  const records = [];
  const unsupportedTypes = new Map();
  for (const message of messages) {
    for (const child of [...message.children]) {
      const type = localName(child);
      if (type === "LEDGER" || type === "STOCKITEM") {
        records.push(recordFromNode(child, type, groupMap));
      } else {
        unsupportedTypes.set(type, (unsupportedTypes.get(type) || 0) + 1);
      }
    }
  }

  if (!records.length && !unsupportedTypes.size) {
    throw new Error("No Tally ledger or stock item masters were found in this XML file.");
  }

  return {
    records,
    unsupportedTypes: [...unsupportedTypes].map(([type, count]) => ({ type, count })),
    metadata: {
      companyName,
      reportName,
      tallyVersion,
      groupCount: groupMap.size,
    },
  };
}

export const tallyXmlMaxBytes = MAX_XML_BYTES;
