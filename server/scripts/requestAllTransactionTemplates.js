import dotenv from "dotenv";
dotenv.config();
import {
  PREDEFINED_TEMPLATES,
  requestWhatsAppTemplateApproval,
  fetchWhatsAppAssets,
} from "../src/services/whatsappBusinessService.js";
import {
  getWhatsAppConnection,
  updateWhatsAppConnectionSnapshot,
} from "../src/services/whatsappConnectionStore.js";

async function main() {
  console.log("Starting batch template approval request to Meta WhatsApp...");
  const connection = getWhatsAppConnection();
  if (!connection?.connected || !connection?.token?.accessToken) {
    console.error("Meta WhatsApp is not connected in .whatsapp_connection_store.json!");
    process.exit(1);
  }

  const wabaId = connection.selection?.wabaId || connection.assets?.wabas?.[0]?.id;
  const accessToken = connection.token.accessToken;
  console.log(`Using WABA ID: ${wabaId}`);

  const templatesToRequest = Object.entries(PREDEFINED_TEMPLATES).filter(([key]) => key !== "marketing_promo");
  console.log(`Found ${templatesToRequest.length} transaction & reminder templates to submit.`);

  const summary = [];
  for (const [key, templateDef] of templatesToRequest) {
    try {
      console.log(`Submitting "${templateDef.name}" (${key})...`);
      const res = await requestWhatsAppTemplateApproval({
        accessToken,
        wabaId,
        template: templateDef,
      });
      console.log(`✓ Result for "${templateDef.name}": ${res.status || (res.alreadyExists ? "EXISTS" : "SUCCESS")} - ${res.message}`);
      summary.push({ name: templateDef.name, status: res.status || (res.alreadyExists ? "EXISTS" : "PENDING"), success: true });
    } catch (err) {
      console.error(`✗ Error submitting "${templateDef.name}":`, err.message, err.userTitle || "", err.userMessage || "", err.code || "", err.subcode || "");
      summary.push({ name: templateDef.name, error: err.userMessage || err.message, success: false });
    }
  }

  // Refresh assets from Meta
  try {
    console.log("Refreshing templates list from Meta Graph API...");
    const assets = await fetchWhatsAppAssets(accessToken, { wabaId });
    updateWhatsAppConnectionSnapshot({ assets });
    console.log(`✓ Successfully updated local snapshot. Current templates on Meta: ${assets.templates?.length || 0}`);
    (assets.templates || []).forEach((t) => {
      console.log(`  - [${t.status}] ${t.name} (${t.category})`);
    });
  } catch (refreshErr) {
    console.warn("Could not refresh assets:", refreshErr.message);
  }

  console.log("\n--- Batch Submission Complete ---");
  console.table(summary);
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
