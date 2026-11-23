/**
 * Client-side Legacy Item Image Migration Helper
 *
 * Scans client-side localStorage inventory items for any legacy Base64 data URLs.
 * If found, uploads them to the backend filesystem storage via `itemsApi.uploadImage`,
 * updates the item record with the persistent endpoint URL, and clears the Base64 binary.
 */

import { readItems, writeItems } from "./itemsStorage.js";
import { itemsApi } from "./apiClient.js";
import { saveBusinessItem } from "./businessRecords.js";

/**
 * Converts a Base64 data URL to a File object.
 */
function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Migrates client-side Base64 item images to private filesystem storage.
 *
 * @returns {Promise<{ totalScanned: number, migratedCount: number, errors: Array }>}
 */
export async function migrateClientBase64ItemImages() {
  const items = readItems();
  const result = {
    totalScanned: items.length,
    migratedCount: 0,
    errors: [],
  };

  let hasUpdates = false;
  const updatedItems = [...items];

  for (let i = 0; i < updatedItems.length; i++) {
    const item = updatedItems[i];
    const rawImage = item.imageUrl || item.image || "";

    if (typeof rawImage === "string" && rawImage.startsWith("data:image/")) {
      try {
        const file = dataURLtoFile(rawImage, `item-${item.id || Date.now()}.png`);
        const uploadRes = await itemsApi.uploadImage(file);

        if (uploadRes?.id && uploadRes?.url) {
          updatedItems[i] = {
            ...item,
            imageUrl: uploadRes.url,
            image: uploadRes.url,
            imageId: uploadRes.id,
          };

          // Also persist back to backend relational database
          try {
            await saveBusinessItem(updatedItems[i]);
          } catch (syncErr) {
            console.warn(`[ClientMigration] Failed to remote-sync item ${item.id}:`, syncErr.message);
          }

          hasUpdates = true;
          result.migratedCount++;
        }
      } catch (err) {
        result.errors.push({ itemId: item.id, error: err.message });
      }
    }
  }

  if (hasUpdates) {
    writeItems(updatedItems);
  }

  return result;
}
