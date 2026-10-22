import { buildWhatsAppReadiness } from "./whatsappConnectionStore.js";
import { extractTemplateVariables, normalizeRecipient } from "./whatsappBusinessService.js";

function templateHeaderFormat(template = {}) {
  const header = (template.components || []).find((component) => String(component.type || "").toUpperCase() === "HEADER");
  return String(header?.format || "").toUpperCase();
}

export function normalizeApprovedTemplate(template = {}) {
  const headerFormat = templateHeaderFormat(template);
  return {
    id: template.id,
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    headerFormat,
    friendlyName: headerFormat === "IMAGE" ? "Poster image message" : headerFormat ? `${headerFormat.toLowerCase()} message` : "Text message",
    variables: extractTemplateVariables(template).map((variable) => ({
      key: `${variable.componentType}:${variable.index}`,
      componentType: variable.componentType,
      index: variable.index,
    })),
  };
}

export function approvedTemplatesForConnection(connection = {}) {
  return (connection.assets?.templates || []).filter((template) => template.status === "APPROVED").map(normalizeApprovedTemplate);
}

export function validateCampaignPayload({ connection, payload = {} }) {
  const readiness = buildWhatsAppReadiness(connection);
  const errors = [];
  const selectedTemplate = (connection.assets?.templates || []).find((template) => template.id === payload.templateId);
  const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
  const validRecipients = [];

  if (!readiness.readyToSend) {
    errors.push({
      code: readiness.blockingCode || "WHATSAPP_NOT_READY",
      message: readiness.blockingReason || "Connect WhatsApp Business before preparing a campaign.",
    });
  }

  if (connection.source === "test_env") {
    errors.push({
      code: "PRODUCTION_CONNECTION_REQUIRED",
      message: "Connect a production WhatsApp Business account before preparing customer campaigns.",
    });
  }

  if (!payload.creative?.id) {
    errors.push({ code: "CREATIVE_REQUIRED", message: "Select a poster creative." });
  }

  if (!selectedTemplate || selectedTemplate.status !== "APPROVED") {
    errors.push({ code: "TEMPLATE_REQUIRED", message: "Choose an approved WhatsApp template." });
  }

  recipients.forEach((recipient, index) => {
    try {
      const normalizedPhone = normalizeRecipient(recipient.countryCode || "", recipient.phone || "");
      validRecipients.push({
        id: recipient.id || `recipient-${index + 1}`,
        name: recipient.name || `Recipient ${index + 1}`,
        phone: normalizedPhone,
        source: recipient.source || "customer",
      });
    } catch {
      errors.push({ code: "INVALID_RECIPIENT", message: `Recipient ${index + 1} has an invalid phone number.` });
    }
  });

  if (!validRecipients.length) {
    errors.push({ code: "RECIPIENTS_REQUIRED", message: "Select at least one customer." });
  }

  if (!payload.consentConfirmed) {
    errors.push({ code: "CONSENT_REQUIRED", message: "Confirm WhatsApp consent before sending." });
  }

  if (selectedTemplate) {
    extractTemplateVariables(selectedTemplate).forEach((variable) => {
      const key = `${variable.componentType}:${variable.index}`;
      if (!String(payload.variables?.[key] || "").trim()) {
        errors.push({ code: "TEMPLATE_VARIABLE_REQUIRED", message: `Fill message field ${variable.index}.` });
      }
    });
  }

  const selectedTemplateSummary = selectedTemplate ? normalizeApprovedTemplate(selectedTemplate) : null;
  const mediaCompatible = !payload.creative?.image || selectedTemplateSummary?.headerFormat === "IMAGE";

  if (payload.creative?.image && selectedTemplateSummary && !mediaCompatible) {
    errors.push({
      code: "MEDIA_TEMPLATE_REQUIRED",
      message: "Poster sending needs an approved image-header WhatsApp template.",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
    template: selectedTemplateSummary,
    recipientCount: validRecipients.length,
    mediaCompatible,
  };
}

export function prepareCampaignPayload({ connection, payload = {} }) {
  const validation = validateCampaignPayload({ connection, payload });
  if (!validation.valid) return { validation, campaign: null };

  return {
    validation,
    campaign: {
      id: `preview-${Date.now()}`,
      status: "PREPARED_ONLY",
      creative: {
        id: payload.creative.id,
        title: payload.creative.title || "WhatsApp poster",
        category: payload.creative.category || "",
      },
      template: validation.template,
      recipientCount: validation.recipientCount,
      messagePreview: payload.messagePreview || "",
      preparedAt: new Date().toISOString(),
      persistence: "NOT_CONFIGURED",
      delivery: "NOT_CONFIGURED",
    },
  };
}

export function bulkDeliveryNotConfiguredResponse() {
  return {
    success: false,
    error: {
      category: "BULK_DELIVERY_NOT_CONFIGURED",
      message: "Bulk WhatsApp delivery needs PostgreSQL campaign storage and a queue worker.",
    },
  };
}

export function schedulingNotConfiguredResponse() {
  return {
    success: false,
    error: {
      category: "SCHEDULING_NOT_CONFIGURED",
      message: "WhatsApp campaign scheduling needs PostgreSQL campaign storage and a queue worker.",
    },
  };
}
