import { deleteGrowthDesign, loadGrowthDesigns, loadRecentImageToLayersDesigns, saveGrowthDesign } from "../businessGrowthData.js";
const memorySessionDesigns = new Map();
const saveQueues = new Map();

export function saveSessionDesign(design) {
  if (!design?.id) return false;
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
      saved = await saveGrowthDesign(nextDesign);
      memorySessionDesigns.set(saved.id, saved);
    }
    return saved;
  })().finally(() => {
    if (saveQueues.get(design.id) === queue) saveQueues.delete(design.id);
  });
  saveQueues.set(design.id, queue);
  return queue.promise;
}

export async function getSessionDesignById(id) {
  if (!id) return null;
  if (memorySessionDesigns.has(id)) return memorySessionDesigns.get(id);
  const designs = await loadGrowthDesigns();
  designs.forEach((design) => memorySessionDesigns.set(design.id, design));
  return memorySessionDesigns.get(id) || null;
}

export async function getSessionDesigns() {
  const designs = await loadGrowthDesigns();
  designs.forEach((design) => memorySessionDesigns.set(design.id, design));
  return designs;
}

export async function getRecentImageToLayersDesigns() {
  const designs = await loadRecentImageToLayersDesigns();
  designs.forEach((design) => memorySessionDesigns.set(design.id, design));
  return designs;
}

export async function deleteSessionDesign(id) {
  if (!id) return false;
  await deleteGrowthDesign(id);
  memorySessionDesigns.delete(id);
  return true;
}
