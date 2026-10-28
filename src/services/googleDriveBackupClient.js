import { API_BASE_URL, apiRequest } from "./apiClient.js";

async function driveRequest(path, options) {
  try {
    return await apiRequest(path, options);
  } catch (error) {
    if (/Request failed \(502\)/i.test(error.message || "")) {
      throw new Error("The USV backend returned HTTP 502. Start the backend and confirm Vite's API_PROXY_TARGET points to it; no backup was uploaded.", { cause: error });
    }
    throw error;
  }
}

export function getGoogleDriveBackupStatus() {
  return driveRequest("/auth/google-drive/status");
}

export function startGoogleDriveSignIn() {
  const startUrl = `${API_BASE_URL}/api/auth/google-drive/start`;
  window.location.assign(startUrl);
}

export function uploadBackupToGoogleDrive(payload) {
  return driveRequest("/auth/google-drive/upload", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function disconnectGoogleDrive() {
  return driveRequest("/auth/google-drive/disconnect", { method: "POST" });
}
