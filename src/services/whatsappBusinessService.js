import { apiRequest, API_BASE_URL } from "./apiClient.js";

async function readJsonResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || fallbackMessage);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function getWhatsAppConnectionStatus() {
  const response = await fetch(`${API_BASE_URL}/api/auth/whatsapp/status`);
  return readJsonResponse(response, "Unable to load WhatsApp Business connection status.");
}

export async function getWhatsAppConnection() {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp-business/connection`);
  return readJsonResponse(response, "Unable to load WhatsApp Business connection.");
}

export function startWhatsAppConnection() {
  window.location.assign(`${API_BASE_URL}/api/auth/whatsapp`);
}

export async function connectWhatsAppTestMode() {
  const response = await fetch(`${API_BASE_URL}/api/auth/whatsapp/test-connect`, {
    method: "POST",
  });
  return readJsonResponse(response, "Unable to connect WhatsApp test setup.");
}

export async function completeWhatsAppEmbeddedSignup(payload) {
  const response = await fetch(`${API_BASE_URL}/api/auth/whatsapp/embedded-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Unable to complete WhatsApp Embedded Signup.");
}

export async function getWhatsAppAssets({ businessId, wabaId } = {}) {
  const url = new URL(`${API_BASE_URL}/api/whatsapp-business/assets`);
  if (businessId) url.searchParams.set("businessId", businessId);
  if (wabaId) url.searchParams.set("wabaId", wabaId);
  const response = await fetch(url.toString());
  return readJsonResponse(response, "Unable to load WhatsApp Business assets.");
}

export async function getWhatsAppMarketingTemplates() {
  const templates = await apiRequest("/business-growth/whatsapp-marketing/templates");
  // With the same-origin Vite proxy API_BASE_URL is empty; use the page's
  // origin as the base for relative image paths returned by the backend.
  const imageBaseUrl = API_BASE_URL || window.location.origin;
  return (templates || []).map((template) => ({
    ...template,
    image: new URL(template.image, imageBaseUrl).toString(),
  }));
}

export async function getApprovedWhatsAppTemplates() {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp-business/templates`);
  return readJsonResponse(response, "Unable to load approved WhatsApp templates.");
}

export async function getWhatsAppCustomers() {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp-business/customers`);
  return readJsonResponse(response, "Unable to load WhatsApp customers.");
}

export async function saveWhatsAppSelection(selection) {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp-business/selection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selection),
  });
  return readJsonResponse(response, "Unable to save WhatsApp Business selection.");
}

export async function validateWhatsAppCampaign(payload) {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp-business/campaigns/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Unable to validate WhatsApp campaign.");
}

export async function prepareWhatsAppCampaign(payload) {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp-business/campaigns/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Unable to prepare WhatsApp campaign.");
}

export async function sendWhatsAppCampaign(payload) {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp-business/campaigns/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "WhatsApp bulk delivery is not configured.");
}

export async function scheduleWhatsAppCampaign(payload) {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp-business/campaigns/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "WhatsApp scheduling is not configured.");
}

export async function disconnectWhatsAppBusiness() {
  const response = await fetch(`${API_BASE_URL}/api/auth/whatsapp/disconnect`, {
    method: "POST",
  });
  return readJsonResponse(response, "Unable to disconnect WhatsApp Business.");
}

export async function sendWhatsAppTestMessage(payload) {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp-business/send-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Unable to send WhatsApp test message.");
}
