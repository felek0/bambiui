import { COMPOSER_INDEX_KEY, COMPOSER_DOCUMENT_PREFIX, composerDocumentKey, deserializeComposerIndex, deserializeComposerEnvelope } from "./composer/storage.ts";

export type ReadOnlyLocalStorage = Pick<Storage, "length" | "key" | "getItem">;
export class LocalRecoveryError extends Error {}
export const RECOVERY_LIMITS = Object.freeze({ records: 1005, recordBytes: 8 * 1024 * 1024, jsonBytes: 64 * 1024 * 1024 });
export const LEGACY_PAGE_EDITOR_KEY = "bambiui.examples.page-editor.bundle.v1";
const exactKeys = new Set([COMPOSER_INDEX_KEY, LEGACY_PAGE_EDITOR_KEY, "bambiui.systems.v1", "bambiui.design-system.v1"]);
export function isRecoveryKey(key: string): boolean {
  return exactKeys.has(key) || (key.startsWith(COMPOSER_DOCUMENT_PREFIX) && key.length > COMPOSER_DOCUMENT_PREFIX.length);
}
function keys(storage: ReadOnlyLocalStorage, include: (key: string) => boolean): string[] {
  const count = storage.length;
  const seen = new Set<string>();
  const found: string[] = [];
  for (let i = 0; i < count; i++) {
    const key = storage.key(i);
    if (key === null || seen.has(key)) throw new LocalRecoveryError("Local storage changed during enumeration. Retry without clearing any records.");
    seen.add(key);
    if (include(key)) {
      found.push(key);
      if (found.length > RECOVERY_LIMITS.records) throw new LocalRecoveryError("Too many local records for recovery. No file was created.");
    }
  }
  if (storage.length !== count) throw new LocalRecoveryError("Local storage changed during enumeration. Retry without clearing any records.");
  return found.sort();
}
function sameKeys(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((key, i) => key === right[i]);
}
const alternative = " Duplicate or export the System to continue safely. Project editing is paused; no stored records were changed.";
export type LegacyProjectReferences = { blocked: string; systemIds: string[] };
export function readLegacyProjectReferences(storage: ReadOnlyLocalStorage): LegacyProjectReferences {
  try {
    const relevant = (key: string) => key === COMPOSER_INDEX_KEY || key.startsWith(COMPOSER_DOCUMENT_PREFIX);
    const observedKeys = keys(storage, relevant);
    const indexRaw = storage.getItem(COMPOSER_INDEX_KEY);
    const index = indexRaw === null ? { projectIds: [] } : deserializeComposerIndex(indexRaw);
    const expected = index.projectIds.map(composerDocumentKey).sort();
    const documents = observedKeys.filter(key => key !== COMPOSER_INDEX_KEY);
    if (!sameKeys(expected, documents)) throw new Error("Missing or orphan Project record");
    const observed = new Map<string, string | null>([[COMPOSER_INDEX_KEY, indexRaw]]);
    const systemIds = new Set<string>();
    for (const id of index.projectIds) {
      const key = composerDocumentKey(id);
      const raw = storage.getItem(key);
      if (raw === null) throw new Error("Missing Project record");
      observed.set(key, raw);
      systemIds.add(deserializeComposerEnvelope(raw, id).document.systemId);
    }
    if (!sameKeys(observedKeys, keys(storage, relevant))) throw new Error("Project records changed");
    for (const [key, raw] of observed) if (storage.getItem(key) !== raw) throw new Error("Project records changed");
    return { blocked: "", systemIds: [...systemIds] };
  } catch {
    return { blocked: "Cannot safely inspect local Project references (missing, orphan, unreadable, changed or unsupported records). System deletion is unavailable." + alternative, systemIds: [] };
  }
}

export function legacySystemDeletionBlock(references: LegacyProjectReferences | null, systemId: string): string {
  if (!references) return "Local Project references are still loading. System deletion is unavailable.";
  if (references.blocked) return references.blocked;
  return references.systemIds.includes(systemId) ? "This System is referenced by a stored Project and cannot be deleted." + alternative : "";
}
// Count JSON string bytes without allocating an escaped copy of a potentially large record.
function jsonStringBytes(text: string): number {
  let bytes = 2;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) bytes += 2;
    else if (code < 32) bytes += 6;
    else if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else if (code >= 0xd800 && code <= 0xdfff) bytes += 6;
    else bytes += 3;
  }
  return bytes;
}
export type LocalRecovery = { format: "bambiui.local-recovery"; version: 1; records: { key: string; raw: string }[] };
/** Explicit user action only. Best-effort observation, not a multi-key atomic backup. Never writes storage. */
export function captureLocalRecovery(storage: ReadOnlyLocalStorage): string {
  const observedKeys = keys(storage, isRecoveryKey);
  if (!observedKeys.length) throw new LocalRecoveryError("No local records were found for recovery. No backup file was created.");
  const recovery: LocalRecovery = { format: "bambiui.local-recovery", version: 1, records: [] };
  let bytes = JSON.stringify(recovery).length;
  const encoder = new TextEncoder();
  for (const key of observedKeys) {
    const raw = storage.getItem(key);
    if (raw === null) throw new LocalRecoveryError("A local record disappeared. Retry; no backup file was created.");
    // Reject oversized inputs before allocating UTF-8 buffers or escaped JSON.
    if (key.length + raw.length > RECOVERY_LIMITS.recordBytes || encoder.encode(key).byteLength + encoder.encode(raw).byteLength > RECOVERY_LIMITS.recordBytes)
      throw new LocalRecoveryError("A local record exceeds the 8 MiB combined key/value limit. No backup file was created.");
    bytes += jsonStringBytes(key) + jsonStringBytes(raw) + 15 + (recovery.records.length ? 1 : 0);
    if (bytes > RECOVERY_LIMITS.jsonBytes) throw new LocalRecoveryError("Local recovery exceeds the 64 MiB JSON limit. No backup file was created.");
    recovery.records.push({ key, raw });
  }
  if (!sameKeys(observedKeys, keys(storage, isRecoveryKey))) throw new LocalRecoveryError("Local records changed. Retry; no backup file was created.");
  for (const { key, raw } of recovery.records) if (storage.getItem(key) !== raw) throw new LocalRecoveryError("A local record changed or disappeared. Retry; no backup file was created.");
  return JSON.stringify(recovery);
}
