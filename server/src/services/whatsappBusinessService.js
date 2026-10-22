import { graphGet, normalizeMetaError } from "./metaOAuthService.js";
import { graphJsonPost } from "./whatsappOAuthService.js";

const BUSINESS_FIELDS = "id,name,verification_status";
const WABA_FIELDS = "id,name,currency,timezone_id,message_template_namespace";
const PHONE_NUMBER_FIELDS = "id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status";
const TEMPLATE_FIELDS = "id,name,language,category,status,components";
const TEMPLATE_COMPONENT_TYPES = new Set(["HEADER", "BODY"]);

function createWhatsAppError(message, code = "WHATSAPP_API_ERROR", meta = null, stage = "") {
  const error = new Error(message);
  error.code = code;
  if (meta) error.meta = meta;
  if (stage) error.stage = stage;
  return error;
}

export function normalizeWhatsAppError(error, fallback = "WhatsApp request failed") {
  const normalized = normalizeMetaError(error, fallback);
  const rawErrorCode = error?.code;
  const errorCodeString = typeof rawErrorCode === "string" ? rawErrorCode : rawErrorCode !== undefined && rawErrorCode !== null ? String(rawErrorCode) : "";
  const metaCode = String(error?.metaCode || normalized.code || "");
  const subcode = String(normalized.subcode || "");
  const text = [normalized.type, normalized.userTitle, normalized.userMessage, normalized.message].filter(Boolean).join(" ").toLowerCase();
  let category = error?.whatsappCategory || "WHATSAPP_API_ERROR";
  let stage = error?.stage || "";
  let message = normalized.message;
  let userTitle = normalized.userTitle;
  let userMessage = normalized.userMessage;

  if (errorCodeString.startsWith("WHATSAPP_") || errorCodeString === "NO_WABA" || errorCodeString === "NO_PHONE_NUMBER" || errorCodeString === "INVALID_RECIPIENT" || errorCodeString === "TEMPLATE_NOT_APPROVED") {
    category = errorCodeString;
  } else if (metaCode === "190") {
    category = "TOKEN_EXPIRED";
    stage = stage || "TOKEN_VALIDATION";
    userTitle = "Reconnect WhatsApp Business";
    message = "WhatsApp token expired or was revoked.";
    userMessage = "Reconnect WhatsApp Business, grant the requested permissions, then try again.";
  } else if (["4", "17", "32", "613", "80004"].includes(metaCode) || text.includes("rate limit") || text.includes("too many")) {
    category = "RATE_LIMITED";
    userTitle = "Rate limited";
    message = "WhatsApp API rate limit reached.";
    userMessage = "Wait and try again later. Bulk sending needs a queued sender in a later phase.";
  } else if (["10", "200", "294", "299"].includes(metaCode) || /\b(permission|permissions|access|authorized|authorization|insufficient|revoked)\b/.test(text)) {
    category = "INSUFFICIENT_PERMISSION";
    userTitle = "WhatsApp permission required";
    message = "You do not have permission to use this WhatsApp Business asset.";
    userMessage = "Ask the business admin for WhatsApp Business access, then reconnect.";
  } else if (["131026", "131030", "131047", "131051"].includes(metaCode) || subcode === "2494010") {
    category = "INVALID_RECIPIENT";
    userTitle = "Invalid or unreachable recipient";
    message = "WhatsApp could not accept this recipient.";
    userMessage = "Check the country code, phone number, and test-recipient eligibility.";
  } else if (text.includes("template")) {
    category = "TEMPLATE_NOT_APPROVED";
    userTitle = "Template problem";
    message = "WhatsApp template is not ready for sending.";
    userMessage = "Select an approved WhatsApp message template and complete any required variables.";
  }

  return {
    category,
    message,
    originalMessage: normalized.message,
    code: error?.metaCode || normalized.code,
    subcode: normalized.subcode,
    type: normalized.type,
    stage,
    userTitle,
    userMessage,
    fbtraceId: normalized.fbtraceId,
    httpStatus: normalized.httpStatus,
  };
}

function addUniqueById(map, item) {
  if (!item?.id) return;
  map.set(item.id, { ...(map.get(item.id) || {}), ...item });
}

async function fetchAllEdge(path, accessToken, params = {}) {
  const records = [];
  let payload = await graphGet(path, accessToken, params);
  records.push(...(payload.data || []));

  while (payload.paging?.next) {
    payload = await graphGet(payload.paging.next, accessToken);
    records.push(...(payload.data || []));
  }

  return records;
}

function throwStagedWhatsAppError(error, stage, fallback) {
  const normalized = normalizeWhatsAppError(error, fallback);
  const staged = new Error(normalized.message || fallback);
  staged.stage = normalized.stage || stage;
  staged.whatsappCategory = normalized.category;
  staged.metaCode = normalized.code;
  staged.subcode = normalized.subcode;
  staged.type = normalized.type;
  staged.userTitle = normalized.userTitle;
  staged.userMessage = normalized.userMessage;
  staged.fbtraceId = normalized.fbtraceId;
  staged.httpStatus = normalized.httpStatus;
  throw staged;
}

async function fetchRequiredObject(path, accessToken, params, stage, label) {
  try {
    return await graphGet(path, accessToken, params);
  } catch (error) {
    throwStagedWhatsAppError(error, stage, `${label} fetch failed`);
  }
}

async function fetchRequiredEdge(path, accessToken, params, stage, label) {
  try {
    return await fetchAllEdge(path, accessToken, params);
  } catch (error) {
    throwStagedWhatsAppError(error, stage, `${label} fetch failed`);
  }
}

async function safeFetchEdge(path, accessToken, params, warnings, label) {
  try {
    return await fetchAllEdge(path, accessToken, params);
  } catch (error) {
    const normalized = normalizeWhatsAppError(error, `${label} fetch failed`);
    warnings.push({
      area: label,
      category: normalized.category,
      message: normalized.message,
      code: normalized.code,
      subcode: normalized.subcode,
    });
    return [];
  }
}

function normalizeBusiness(business = {}) {
  return {
    id: business.id,
    name: business.name || "Business Portfolio",
    verificationStatus: business.verification_status || "",
  };
}

function normalizeWaba(waba = {}, business = null, source = "") {
  return {
    id: waba.id,
    name: waba.name || "WhatsApp Business Account",
    currency: waba.currency || "",
    timezoneId: waba.timezone_id || "",
    messageTemplateNamespace: waba.message_template_namespace || "",
    businessId: waba.businessId || business?.id || "",
    businessName: waba.businessName || business?.name || "",
    source,
  };
}

function normalizePhoneNumber(phone = {}, wabaId = "") {
  return {
    id: phone.id,
    wabaId,
    displayPhoneNumber: phone.display_phone_number || "",
    verifiedName: phone.verified_name || "",
    qualityRating: phone.quality_rating || "",
    codeVerificationStatus: phone.code_verification_status || "",
    nameStatus: phone.name_status || "",
    status: phone.status || "",
  };
}

function normalizeTemplate(template = {}, wabaId = "") {
  return {
    id: template.id,
    wabaId,
    name: template.name || "",
    language: template.language || "",
    category: template.category || "",
    status: template.status || "",
    components: Array.isArray(template.components) ? template.components : [],
  };
}

async function fetchBusinessWabas(business, accessToken, warnings, wabasById) {
  const [ownedWabas, clientWabas] = await Promise.all([
    safeFetchEdge(`/${business.id}/owned_whatsapp_business_accounts`, accessToken, { fields: WABA_FIELDS }, warnings, `${business.name || business.id} owned WABAs`),
    safeFetchEdge(`/${business.id}/client_whatsapp_business_accounts`, accessToken, { fields: WABA_FIELDS }, warnings, `${business.name || business.id} client WABAs`),
  ]);

  ownedWabas.map((waba) => normalizeWaba(waba, business, "owned")).forEach((waba) => addUniqueById(wabasById, waba));
  clientWabas.map((waba) => normalizeWaba(waba, business, "client")).forEach((waba) => addUniqueById(wabasById, waba));
}

async function fetchRequiredConfiguredPhoneNumber(accessToken, phoneNumberId, selectedWabaId) {
  try {
    const phone = await graphGet(`/${phoneNumberId}`, accessToken, { fields: PHONE_NUMBER_FIELDS });
    return normalizePhoneNumber(phone, selectedWabaId);
  } catch (error) {
    throwStagedWhatsAppError(error, "PHONE_FETCH", "Configured WhatsApp test phone number fetch failed");
  }
}

export async function fetchWhatsAppAssets(accessToken, options = {}) {
  const warnings = [];
  const businessesById = new Map();
  const wabasById = new Map();
  const selectedBusinessId = options.businessId || "";
  const selectedWabaId = options.wabaId || "";
  const selectedPhoneNumberId = options.phoneNumberId || "";

  const businesses = await safeFetchEdge("/me/businesses", accessToken, { fields: BUSINESS_FIELDS }, warnings, "businesses");
  businesses.map(normalizeBusiness).forEach((business) => addUniqueById(businessesById, business));
  const normalizedBusinesses = Array.from(businessesById.values());
  const selectedBusiness = normalizedBusinesses.find((business) => business.id === selectedBusinessId);
  const businessesToFetch = selectedBusiness ? [selectedBusiness] : normalizedBusinesses;

  await Promise.all(businessesToFetch.map((business) => fetchBusinessWabas(business, accessToken, warnings, wabasById)));
  if (selectedWabaId && !wabasById.has(selectedWabaId)) {
    try {
      addUniqueById(wabasById, normalizeWaba(await graphGet(`/${selectedWabaId}`, accessToken, { fields: WABA_FIELDS }), selectedBusinessId ? { id: selectedBusinessId, name: "" } : null, "selected"));
    } catch (error) {
      const normalized = normalizeWhatsAppError(error, "Selected WhatsApp Business Account fetch failed");
      warnings.push({
        area: "selected WABA",
        category: normalized.category,
        message: normalized.message,
        code: normalized.code,
        subcode: normalized.subcode,
      });
    }
  }

  const normalizedWabas = Array.from(wabasById.values());
  const effectiveSelectedWabaId = selectedWabaId || (normalizedWabas.length === 1 ? normalizedWabas[0].id : "");
  const selectedWaba = normalizedWabas.find((waba) => waba.id === effectiveSelectedWabaId);
  const phoneNumbers = selectedWaba
    ? (await safeFetchEdge(`/${selectedWaba.id}/phone_numbers`, accessToken, { fields: PHONE_NUMBER_FIELDS }, warnings, `${selectedWaba.name || selectedWaba.id} phone numbers`)).map((phone) =>
        normalizePhoneNumber(phone, selectedWaba.id),
      )
    : [];
  const templates = selectedWaba
    ? (await safeFetchEdge(`/${selectedWaba.id}/message_templates`, accessToken, { fields: TEMPLATE_FIELDS, limit: 100 }, warnings, `${selectedWaba.name || selectedWaba.id} message templates`)).map((template) =>
        normalizeTemplate(template, selectedWaba.id),
      )
    : [];

  const effectiveSelectedPhoneNumberId = selectedPhoneNumberId && phoneNumbers.some((phone) => phone.id === selectedPhoneNumberId) ? selectedPhoneNumberId : phoneNumbers.length === 1 ? phoneNumbers[0].id : "";

  return {
    businesses: normalizedBusinesses,
    wabas: normalizedWabas,
    phoneNumbers,
    templates,
    warnings,
    selectedBusinessId: selectedBusiness?.id || "",
    selectedWabaId: selectedWaba?.id || "",
    selectedPhoneNumberId: effectiveSelectedPhoneNumberId,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchWhatsAppTestAssets(accessToken, options = {}) {
  const warnings = [];
  const selectedWabaId = options.wabaId || "";
  const selectedPhoneNumberId = options.phoneNumberId || "";
  const businessId = options.businessId || "";
  const businessName = options.businessName || "Meta Test Business";

  if (!accessToken || !selectedWabaId || !selectedPhoneNumberId) {
    throw createWhatsAppError("WhatsApp test access token, WABA ID, and phone number ID are required.", "WHATSAPP_TEST_CONFIG_MISSING", null, "CONFIG");
  }

  const waba = normalizeWaba(
    await fetchRequiredObject(`/${selectedWabaId}`, accessToken, { fields: WABA_FIELDS }, "WABA_FETCH", "Configured WhatsApp test WABA"),
    businessId ? { id: businessId, name: businessName } : null,
    "test",
  );
  const discoveredPhoneNumbers = (
    await fetchRequiredEdge(`/${selectedWabaId}/phone_numbers`, accessToken, { fields: PHONE_NUMBER_FIELDS }, "PHONE_FETCH", `${waba.name || selectedWabaId} phone numbers`)
  ).map((phone) => normalizePhoneNumber(phone, selectedWabaId));
  const configuredPhoneNumber = discoveredPhoneNumbers.find((phone) => phone.id === selectedPhoneNumberId) || (await fetchRequiredConfiguredPhoneNumber(accessToken, selectedPhoneNumberId, selectedWabaId));
  const phoneNumbersById = new Map();
  discoveredPhoneNumbers.forEach((phone) => addUniqueById(phoneNumbersById, phone));
  addUniqueById(phoneNumbersById, configuredPhoneNumber);

  const templates = (
    await fetchRequiredEdge(`/${selectedWabaId}/message_templates`, accessToken, { fields: TEMPLATE_FIELDS, limit: 100 }, "TEMPLATE_FETCH", `${waba.name || selectedWabaId} message templates`)
  ).map((template) => normalizeTemplate(template, selectedWabaId));
  if (!templates.some((template) => template.status === "APPROVED")) {
    throw createWhatsAppError("No approved WhatsApp message template found for the configured test WABA.", "TEMPLATE_NOT_APPROVED", null, "TEMPLATE_FETCH");
  }

  return {
    businesses: businessId ? [{ id: businessId, name: businessName, verificationStatus: "" }] : [],
    wabas: [waba],
    phoneNumbers: Array.from(phoneNumbersById.values()),
    templates,
    warnings,
    selectedBusinessId: businessId,
    selectedWabaId,
    selectedPhoneNumberId,
    fetchedAt: new Date().toISOString(),
  };
}

export function extractTemplateVariables(template = {}) {
  const variables = [];
  (template.components || []).forEach((component) => {
    const type = String(component.type || "").toUpperCase();
    const text = String(component.text || "");
    if (!TEMPLATE_COMPONENT_TYPES.has(type) || !text) return;
    const matches = text.match(/\{\{\d+\}\}/g) || [];
    const indexes = [...new Set(matches.map((match) => Number(match.replace(/[{}]/g, ""))).filter(Boolean))];
    indexes.forEach((index) => variables.push({ componentType: type.toLowerCase(), index }));
  });
  return variables.sort((a, b) => a.componentType.localeCompare(b.componentType) || a.index - b.index);
}

export function normalizeRecipient(countryCode = "", phoneNumber = "") {
  const code = String(countryCode || "").replace(/[^\d]/g, "");
  const number = String(phoneNumber || "").replace(/[^\d]/g, "");
  const combined = `${code}${number}`;
  if (!code || !number || combined.length < 8 || combined.length > 15) {
    throw createWhatsAppError("Enter a valid country code and phone number.", "INVALID_RECIPIENT");
  }
  return combined;
}

function buildTemplateComponents(template, variables = {}) {
  const requiredVariables = extractTemplateVariables(template);
  const grouped = new Map();

  requiredVariables.forEach((variable) => {
    const key = `${variable.componentType}:${variable.index}`;
    const value = String(variables[key] || "").trim();
    if (!value) {
      throw createWhatsAppError("Fill all required template variables before sending.", "TEMPLATE_NOT_APPROVED");
    }
    if (!grouped.has(variable.componentType)) grouped.set(variable.componentType, []);
    grouped.get(variable.componentType).push({ type: "text", text: value });
  });

  return Array.from(grouped.entries()).map(([type, parameters]) => ({ type, parameters }));
}

export async function sendWhatsAppTemplateMessage({ accessToken, phoneNumberId, template, recipient, variables = {} }) {
  if (!phoneNumberId) throw createWhatsAppError("Select a WhatsApp business phone number before sending.", "NO_PHONE_NUMBER");
  if (!template?.name || template.status !== "APPROVED") throw createWhatsAppError("Select an approved WhatsApp message template.", "TEMPLATE_NOT_APPROVED");
  if (!recipient) throw createWhatsAppError("Enter a valid recipient phone number.", "INVALID_RECIPIENT");

  const components = buildTemplateComponents(template, variables);
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: template.name,
      language: {
        code: template.language,
      },
      ...(components.length ? { components } : {}),
    },
  };

  const response = await graphJsonPost(`/${phoneNumberId}/messages`, accessToken, payload);
  return {
    accepted: true,
    messageId: response.messages?.[0]?.id || "",
    contacts: (response.contacts || []).map((contact) => ({
      waId: contact.wa_id || "",
      input: contact.input ? `***${String(contact.input).slice(-4)}` : "",
    })),
    rawStatus: "accepted",
    acceptedAt: new Date().toISOString(),
  };
}
