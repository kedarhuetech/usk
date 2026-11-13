import { deleteGrowthDesign, loadGrowthDesigns, loadRecentImageToLayersDesigns, saveGrowthDesign } from "../businessGrowthData.js";

const memorySessionDesigns = new Map();
const saveQueues = new Map();
const LOCAL_DESIGNS_KEY = "ledgerly:marketingStudioDesigns.v1";

// Safely reads local designs from localStorage
function getLocalDesigns() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_DESIGNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Safely writes a design into localStorage cache
function writeLocalDesign(design) {
  if (typeof window === "undefined" || !window.localStorage || !design?.id) return;
  try {
    const current = getLocalDesigns();
    const existingIndex = current.findIndex((item) => item.id === design.id);
    const updated = existingIndex >= 0
      ? current.map((item, idx) => (idx === existingIndex ? { ...item, ...design } : item))
      : [design, ...current];
    // Keep up to 30 recent designs locally
    window.localStorage.setItem(LOCAL_DESIGNS_KEY, JSON.stringify(updated.slice(0, 30)));
  } catch (error) {
    console.warn("Could not write design to local storage:", error);
  }
}

// Safely removes a design from localStorage cache
function removeLocalDesign(id) {
  if (typeof window === "undefined" || !window.localStorage || !id) return;
  try {
    const current = getLocalDesigns();
    window.localStorage.setItem(LOCAL_DESIGNS_KEY, JSON.stringify(current.filter((item) => item.id !== id)));
  } catch {}
}

// Saves session design.
export function saveSessionDesign(design) {
  if (!design?.id) return Promise.resolve(false);
  memorySessionDesigns.set(design.id, design);
  writeLocalDesign(design);

  let queue = saveQueues.get(design.id);
  if (queue) {
    queue.latest = design;
    return queue.promise;
  }

  queue = { latest: design, promise: null };
  queue.promise = (async () => {
    let saved = null;
    while (queue.latest) {
      const nextDesign = queue.latest;
      queue.latest = null;
      try {
        saved = await saveGrowthDesign(nextDesign);
        if (saved && saved.id) {
          memorySessionDesigns.set(saved.id, saved);
          writeLocalDesign(saved);
        }
      } catch (err) {
        console.warn("Could not save design to remote backend, stored in session & localStorage:", err);
        saved = nextDesign;
      }
    }
    return saved;
  })().finally(() => {
    if (saveQueues.get(design.id) === queue) saveQueues.delete(design.id);
  });
  saveQueues.set(design.id, queue);
  return queue.promise;
}

// Gets session design by id.
export async function getSessionDesignById(id) {
  if (!id) return null;
  if (memorySessionDesigns.has(id)) return memorySessionDesigns.get(id);

  const localList = getLocalDesigns();
  const localMatch = localList.find((item) => item.id === id);
  if (localMatch) memorySessionDesigns.set(id, localMatch);

  try {
    const designs = await loadGrowthDesigns();
    if (Array.isArray(designs)) {
      designs.forEach((design) => memorySessionDesigns.set(design.id, design));
    }
  } catch (err) {
    console.warn("Could not load designs from remote backend:", err);
  }

  return memorySessionDesigns.get(id) || localMatch || null;
}

// Gets session designs.
export async function getSessionDesigns() {
  try {
    const remoteDesigns = await loadGrowthDesigns();
    const list = Array.isArray(remoteDesigns) ? remoteDesigns : [];
    list.forEach((design) => memorySessionDesigns.set(design.id, design));

    // Merge with any offline/local designs
    const localDesigns = getLocalDesigns();
    localDesigns.forEach((local) => {
      if (!memorySessionDesigns.has(local.id)) {
        memorySessionDesigns.set(local.id, local);
      }
    });

    return Array.from(memorySessionDesigns.values()).sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    );
  } catch (err) {
    console.warn("Could not load designs from remote backend, falling back to local:", err);
    const localDesigns = getLocalDesigns();
    localDesigns.forEach((local) => memorySessionDesigns.set(local.id, local));
    return Array.from(memorySessionDesigns.values()).sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    );
  }
}

// Gets recent image to layers designs.
export async function getRecentImageToLayersDesigns() {
  try {
    const designs = await loadRecentImageToLayersDesigns();
    const list = Array.isArray(designs) ? designs : [];
    list.forEach((design) => memorySessionDesigns.set(design.id, design));
    return list;
  } catch (err) {
    console.warn("Could not load recent Image to Layers designs:", err);
    return [];
  }
}

// Deletes session design.
export async function deleteSessionDesign(id) {
  if (!id) return false;
  memorySessionDesigns.delete(id);
  removeLocalDesign(id);
  try {
    await deleteGrowthDesign(id);
  } catch (err) {
    console.warn("Could not delete design from remote backend:", err);
  }
  return true;
}
