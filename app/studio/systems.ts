import { defaultSystem, parseDesignSystem, STORAGE_KEY, type DesignSystem } from "./tokens";

export const SYSTEMS_KEY = "bambiui.systems.v1";
export type StoredSystem = { id: string; system: DesignSystem };
export type SystemCollection = { version: 1; activeId: string; systems: StoredSystem[] };

export function loadSystems(storage: Storage): SystemCollection {
  const raw = storage.getItem(SYSTEMS_KEY);
  if (raw) {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error("Invalid system collection");
    const data = value as Partial<SystemCollection>;
    if (data.version !== 1 || !Array.isArray(data.systems) || !data.systems.length || typeof data.activeId !== "string")
      throw new Error("Invalid system collection");
    const ids = new Set<string>();
    const systems = data.systems.map((entry) => {
      if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id)) throw new Error("Invalid system ID");
      ids.add(entry.id);
      return { id: entry.id, system: parseDesignSystem(JSON.stringify(entry.system)) };
    });
    if (!ids.has(data.activeId)) throw new Error("Missing active system");
    return { version: 1, activeId: data.activeId, systems };
  }
  const legacy = storage.getItem(STORAGE_KEY);
  return { version: 1, activeId: "original", systems: [{ id: "original", system: legacy ? parseDesignSystem(legacy) : defaultSystem }] };
}

export function saveSystems(storage: Storage, collection: SystemCollection) {
  // The collection is authoritative; the old key remains a mirror for existing single-system consumers.
  storage.setItem(SYSTEMS_KEY, JSON.stringify(collection));
  const active = collection.systems.find((entry) => entry.id === collection.activeId);
  if (active) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(active.system)); } catch { /* The collection is already saved. */ }
  }
}
