import { Router } from "express";
import { getWhatsAppOAuthConfig } from "../config/whatsappOAuth.js";

const router = Router();

function countWebhookEvents(payload = {}) {
  let statuses = 0;
  let messages = 0;
  (payload.entry || []).forEach((entry) => {
    (entry.changes || []).forEach((change) => {
      const value = change.value || {};
      statuses += Array.isArray(value.statuses) ? value.statuses.length : 0;
      messages += Array.isArray(value.messages) ? value.messages.length : 0;
    });
  });
  return { statuses, messages };
}

router.get("/webhook", (req, res) => {
  const config = getWhatsAppOAuthConfig();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === config.webhookVerifyToken) {
    return res.status(200).send(String(challenge || ""));
  }

  return res.sendStatus(403);
});

router.post("/webhook", (req, res) => {
  const counts = countWebhookEvents(req.body || {});
  console.info("WhatsApp webhook event received", counts);
  return res.sendStatus(200);
});

export default router;
