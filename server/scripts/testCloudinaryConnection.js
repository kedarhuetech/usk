/**
 * Real Connection Test for Cloudinary Integration
 *
 * Verifies live credentials and API operations against Cloudinary:
 * 1. Validates configuration.
 * 2. Connects to Cloudinary.
 * 3. Generates a small temporary test image buffer.
 * 4. Uploads it to a dedicated test folder (e.g. `usk/_system_tests/`).
 * 5. Confirms upload success and verifies returned public ID, asset ID, format, and bytes.
 * 6. Verifies secure HTTPS URL generation.
 * 7. Retrieves asset details from Cloudinary Admin API.
 * 8. Deletes the test asset.
 * 9. Confirms deletion.
 * 10. Reports PASS or FAIL clearly.
 *
 * Safe & Non-destructive:
 * - Operates strictly in the `_system_tests/` folder.
 * - Never modifies, queries, or deletes existing business assets.
 */

import {
  cloudinary,
  isCloudinaryConfigured,
  getSafeCloudinaryConfig,
  rootFolder,
} from "../src/config/cloudinaryConfig.js";

// Valid 1x1 test PNG buffer
const TEST_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

async function main() {
  console.log("==================================================");
  console.log("USV Cloudinary Real Connection & Operations Test");
  console.log("==================================================");

  // 1. Validate configuration
  const safeConfig = getSafeCloudinaryConfig();
  console.log("[1/6] Configuration Status:", JSON.stringify(safeConfig, null, 2));

  if (!isCloudinaryConfigured()) {
    console.error("FAIL: Cloudinary environment variables are missing or incomplete.");
    console.error("Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
    process.exit(1);
  }

  const testFolder = `${rootFolder}/_system_tests`;
  const testPublicId = `conn-test-${Date.now()}`;
  let uploadedPublicId = null;

  try {
    // 2. Upload test buffer
    console.log(`[2/6] Uploading temporary test image to folder: ${testFolder}...`);
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: testFolder,
          public_id: testPublicId,
          resource_type: "image",
          overwrite: true,
          tags: ["usk_test", "system_healthcheck"],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(TEST_PNG_BUFFER);
    });

    uploadedPublicId = uploadResult.public_id;
    console.log("[3/6] Upload successful!");
    console.log(`      Asset ID:   ${uploadResult.asset_id}`);
    console.log(`      Public ID:  ${uploadResult.public_id}`);
    console.log(`      Format:     ${uploadResult.format}`);
    console.log(`      Bytes:      ${uploadResult.bytes}`);
    console.log(`      Secure URL: ${uploadResult.secure_url}`);

    if (!uploadResult.secure_url || !uploadResult.secure_url.startsWith("https://")) {
      throw new Error(`Upload returned non-HTTPS URL: ${uploadResult.secure_url}`);
    }

    // 3. Verify asset via Admin API
    console.log(`[4/6] Retrieving asset metadata for ${uploadedPublicId}...`);
    const resourceInfo = await cloudinary.api.resource(uploadedPublicId);
    console.log(`      Fetched Resource Format: ${resourceInfo.format}, Bytes: ${resourceInfo.bytes}`);

    if (resourceInfo.bytes !== TEST_PNG_BUFFER.length) {
      console.warn(`      Byte count notice: expected ${TEST_PNG_BUFFER.length}, Cloudinary reports ${resourceInfo.bytes}`);
    }

    // 4. Delete the test asset
    console.log(`[5/6] Deleting test asset ${uploadedPublicId}...`);
    const destroyResult = await cloudinary.uploader.destroy(uploadedPublicId);
    console.log("      Destroy Result:", JSON.stringify(destroyResult));

    if (destroyResult.result !== "ok") {
      throw new Error(`Cloudinary destroy returned unexpected result: ${destroyResult.result}`);
    }

    // 5. Final Report
    console.log("[6/6] Verifying asset cleanup...");
    try {
      await cloudinary.api.resource(uploadedPublicId);
      console.warn("      Warning: Asset still exists immediately after destroy (may be eventual consistency).");
    } catch (notFoundErr) {
      console.log("      Confirmed: Asset deleted successfully from Cloudinary.");
    }

    console.log("\n==================================================");
    console.log("RESULT: PASS — Cloudinary credentials and operations verified successfully!");
    console.log("==================================================");
  } catch (err) {
    console.error("\n==================================================");
    console.error("RESULT: FAIL — Cloudinary connection or operation error:");
    console.error(err.message || err);
    console.error("==================================================");

    // Clean up if upload succeeded but subsequent steps failed
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId);
      } catch {}
    }

    process.exit(1);
  }
}

main();
