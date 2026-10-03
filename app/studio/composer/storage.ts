import { parseComposerDocument, parseProjectCollection, type ComposerDocument, type ProjectCollection } from "./model.ts";

export type ComposerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const COMPOSER_INDEX_KEY = "bambiui.composer.projects.v1";
export const COMPOSER_DOCUMENT_PREFIX = "bambiui.composer.document.v1.";
// Technical prototype limits, independent of the legacy single-page 1 MiB limit.
export const COMPOSER_STORAGE_LIMITS = Object.freeze({ documentBytes: 5 * 1024 * 1024, indexBytes: 256 * 1024, projects: 1000 });
export type ComposerEnvelope = { version: 1; revision: number; document: ComposerDocument };
export type ExpectedProject = { raw: string; revision: number };
export type StorageBlocked = { kind: "blocked"; message: string; raw: string | null; stage: "validation" | "index" | "document"; code: "invalid" | "conflict" | "io" };
export type IndexRead = { kind: "empty"; raw: null; collection: ProjectCollection } | { kind: "valid"; raw: string; collection: ProjectCollection } | StorageBlocked;
export type ProjectRead = { kind: "valid"; raw: string; envelope: ComposerEnvelope } | StorageBlocked;
export type RegistrationEvidence = { projectId: string; raw: string; revision: number; expectedIndexRaw: string | null };
export type ProjectWrite = { kind: "saved"; raw: string; envelope: ComposerEnvelope; indexRaw: string | null } | StorageBlocked;
export type RegistrationWrite = { kind: "registered"; raw: string; envelope: ComposerEnvelope; indexRaw: string } | StorageBlocked;
export type CreateWrite = RegistrationWrite | { kind: "partial"; message: string; evidence: RegistrationEvidence; failure: StorageBlocked };
export type SelectionWrite = { kind: "selected" | "unchanged"; raw: string | null; collection: ProjectCollection } | StorageBlocked;

function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error("Expected plain record");
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== "string" || !keys.includes(key))) throw new Error("Unexpected or missing fields");
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error("Expected own data fields, not accessors");
  }
  return value as Record<string, unknown>;
}
function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Revision must be a positive safe integer");
  return value;
}
export function composerDocumentKey(projectId: string): string {
  if (typeof projectId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(projectId)) throw new Error("Invalid projectId");
  return COMPOSER_DOCUMENT_PREFIX + encodeURIComponent(projectId);
}
function bounded(raw: string, bytes: number): string {
  if (typeof raw !== "string" || raw.length > bytes || new TextEncoder().encode(raw).byteLength > bytes) throw new Error(`UTF-8 storage size limit exceeded (${bytes} bytes)`);
  return raw;
}
function envelope(value: unknown, projectId: string): ComposerEnvelope {
  composerDocumentKey(projectId);
  const data = fields(value, ["version", "revision", "document"]);
  if (data.version !== 1) throw new Error("Unsupported document envelope version");
  const document = parseComposerDocument(data.document);
  if (document.id !== projectId) throw new Error("ProjectId does not match document/key");
  return { version: 1, revision: revision(data.revision), document };
}
export function serializeComposerEnvelope(value: unknown, projectId: string): string {
  return bounded(JSON.stringify(envelope(value, projectId)), COMPOSER_STORAGE_LIMITS.documentBytes);
}
export function deserializeComposerEnvelope(raw: string, projectId: string): ComposerEnvelope {
  return envelope(JSON.parse(bounded(raw, COMPOSER_STORAGE_LIMITS.documentBytes)), projectId);
}
function collection(value: unknown): ProjectCollection {
  // Bound before the model traverses an arbitrarily large in-memory array.
  const data = fields(value, ["version", "activeProjectId", "projectIds"]);
  const descriptor = Object.getOwnPropertyDescriptor(data.projectIds ?? {}, "length");
  if (!Array.isArray(data.projectIds) || !descriptor || descriptor.value > COMPOSER_STORAGE_LIMITS.projects) throw new Error(`Index project count limit exceeded (${COMPOSER_STORAGE_LIMITS.projects})`);
  return parseProjectCollection(value);
}
export function serializeComposerIndex(value: unknown): string {
  return bounded(JSON.stringify(collection(value)), COMPOSER_STORAGE_LIMITS.indexBytes);
}
export function deserializeComposerIndex(raw: string): ProjectCollection {
  return collection(JSON.parse(bounded(raw, COMPOSER_STORAGE_LIMITS.indexBytes)));
}
function blocked(reason: unknown, stage: StorageBlocked["stage"], raw: string | null, code: StorageBlocked["code"] = "invalid"): StorageBlocked {
  return { kind: "blocked", stage, raw, code, message: `${reason instanceof Error ? reason.message : "Storage operation failed"}. Keep the in-memory project and preserve stored bytes; inspect/reload the stored copy before an explicit retry. No reset or replacement was performed.` };
}
export function readComposerIndex(storage: ComposerStorage): IndexRead {
  let raw: string | null;
  try { raw = storage.getItem(COMPOSER_INDEX_KEY); } catch (reason) { return blocked(reason, "index", null, "io"); }
  if (raw === null) return { kind: "empty", raw, collection: { version: 1, activeProjectId: null, projectIds: [] } };
  try { return { kind: "valid", raw, collection: deserializeComposerIndex(raw) }; } catch (reason) { return blocked(reason, "index", raw); }
}
/** A supplied validated index reference is required; system existence is deliberately not checked. */
export function readComposerProject(storage: ComposerStorage, projectId: string, reference: ProjectCollection): ProjectRead {
  let key: string;
  try {
    key = composerDocumentKey(projectId);
    if (!collection(reference).projectIds.includes(projectId)) throw new Error("Project is not registered in the supplied index");
  } catch (reason) { return blocked(reason, "validation", null); }
  let raw: string | null;
  try { raw = storage.getItem(key); } catch (reason) { return blocked(reason, "document", null, "io"); }
  if (raw === null) return blocked(new Error("Registered project document is missing"), "document", raw);
  try { return { kind: "valid", raw, envelope: deserializeComposerEnvelope(raw, projectId) }; } catch (reason) { return blocked(reason, "document", raw); }
}
function observedIndex(storage: ComposerStorage, expectedRaw: string | null): Exclude<IndexRead, StorageBlocked> | StorageBlocked {
  if (expectedRaw !== null && typeof expectedRaw !== "string") return blocked(new Error("Expected explicit index raw bytes or null"), "validation", null);
  const read = readComposerIndex(storage);
  if (read.kind === "blocked") return read;
  if (read.raw !== expectedRaw) return blocked(new Error("Index changed outside this editor"), "index", read.raw, "conflict");
  return read;
}
function observedProject(storage: ComposerStorage, projectId: string, expected: ExpectedProject): { kind: "valid"; raw: string; envelope: ComposerEnvelope } | StorageBlocked {
  let raw: string | null = null;
  try {
    const data = fields(expected, ["raw", "revision"]);
    const previous = deserializeComposerEnvelope(data.raw as string, projectId);
    if (previous.revision !== revision(data.revision)) throw new Error("Expected raw/revision mismatch");
  } catch (reason) { return blocked(reason, "validation", raw); }
  try { raw = storage.getItem(composerDocumentKey(projectId)); } catch (reason) { return blocked(reason, "document", raw, "io"); }
  if (raw !== expected.raw) return blocked(new Error("Project changed outside this editor"), "document", raw, "conflict");
  try {
    const parsed = deserializeComposerEnvelope(raw!, projectId);
    if (parsed.revision !== expected.revision) throw new Error("Observed revision mismatch");
    return { kind: "valid", raw: raw!, envelope: parsed };
  } catch (reason) { return blocked(reason, "document", raw); }
}
/**
 * Explicit selection only: registration does not activate a project. Writes only the index.
 * The supplied collection must match the observed index; non-null targets must have a valid registered document.
 * No-ops preserve original bytes (including an absent index), but still validate the target.
 * Bounded rechecks are not an atomic transaction/lock against another tab.
 */
export function selectComposerProject(storage: ComposerStorage, activeProjectId: string | null, reference: ProjectCollection, expectedIndexRaw: string | null): SelectionWrite {
  let supplied: ProjectCollection;
  let next: ProjectCollection;
  let nextRaw: string;
  try {
    supplied = collection(reference);
    next = collection({ ...supplied, activeProjectId });
    nextRaw = serializeComposerIndex(next);
  } catch (reason) { return blocked(reason, "validation", null); }
  const index = observedIndex(storage, expectedIndexRaw);
  if (index.kind === "blocked") return index;
  if (serializeComposerIndex(supplied) !== serializeComposerIndex(index.collection))
    return blocked(new Error("Supplied collection does not match the stored index"), "index", index.raw, "conflict");
  const project = activeProjectId === null ? null : readComposerProject(storage, activeProjectId, index.collection);
  if (project?.kind === "blocked") return project;
  const rechecked = observedIndex(storage, expectedIndexRaw);
  if (rechecked.kind === "blocked") return rechecked;
  if (project?.kind === "valid") {
    const checked = observedProject(storage, activeProjectId!, { raw: project.raw, revision: project.envelope.revision });
    if (checked.kind === "blocked") return checked;
  }
  if (index.collection.activeProjectId === activeProjectId) return { kind: "unchanged", raw: index.raw, collection: next };
  try { storage.setItem(COMPOSER_INDEX_KEY, nextRaw); } catch (reason) { return blocked(reason, "index", index.raw, "io"); }
  return { kind: "selected", raw: nextRaw, collection: next };
}

/** Save-time comparisons are NOT an atomic transaction/lock: another tab can write after a check. */
export function saveComposerProject(storage: ComposerStorage, projectId: string, document: ComposerDocument, expected: ExpectedProject, expectedIndexRaw: string | null): ProjectWrite {
  let raw: string;
  let parsed: ComposerEnvelope;
  try {
    const data = fields(expected, ["raw", "revision"]);
    parsed = envelope({ version: 1, revision: revision(data.revision) + 1, document }, projectId);
    raw = serializeComposerEnvelope(parsed, projectId);
  } catch (reason) { return blocked(reason, "validation", null); }
  const index = observedIndex(storage, expectedIndexRaw);
  if (index.kind === "blocked") return index;
  if (!index.collection.projectIds.includes(projectId)) return blocked(new Error("Project is not registered"), "index", index.raw, "conflict");
  const previous = observedProject(storage, projectId, expected);
  if (previous.kind === "blocked") return previous;
  try { storage.setItem(composerDocumentKey(projectId), raw); } catch (reason) { return blocked(reason, "document", previous.raw, "io"); }
  return { kind: "saved", raw, envelope: parsed, indexRaw: index.raw };
}
/** Only registers the exact preserved orphan; never rewrites its document or replaces an index. */
export function registerComposerProject(storage: ComposerStorage, projectId: string, expected: ExpectedProject, expectedIndexRaw: string | null): RegistrationWrite {
  let key: string;
  try { key = composerDocumentKey(projectId); } catch (reason) { return blocked(reason, "validation", null); }
  const index = observedIndex(storage, expectedIndexRaw);
  if (index.kind === "blocked") return index;
  if (index.collection.projectIds.includes(projectId)) return blocked(new Error("Project is already registered"), "index", index.raw, "conflict");
  const project = observedProject(storage, projectId, expected);
  if (project.kind === "blocked") return project;
  let indexRaw: string;
  try { indexRaw = serializeComposerIndex({ ...index.collection, projectIds: [...index.collection.projectIds, projectId] }); }
  catch (reason) { return blocked(reason, "validation", index.raw); }
  // Bounded recheck, no automatic merge/retry/rollback. Preserve any orphan on failure.
  const rechecked = observedIndex(storage, expectedIndexRaw);
  if (rechecked.kind === "blocked") return rechecked;
  try {
    if (storage.getItem(key) !== project.raw) return blocked(new Error("Orphan changed before registration"), "document", project.raw, "conflict");
  } catch (reason) { return blocked(reason, "document", project.raw, "io"); }
  try { storage.setItem(COMPOSER_INDEX_KEY, indexRaw); } catch (reason) { return blocked(reason, "index", index.raw, "io"); }
  return { kind: "registered", raw: project.raw, envelope: project.envelope, indexRaw };
}
/** New IDs only. Write document first, then index; failed registration leaves explicit recovery evidence. */
export function createStoredComposerProject(storage: ComposerStorage, projectId: string, document: ComposerDocument, expectedIndexRaw: string | null): CreateWrite {
  let key: string;
  let raw: string;
  try {
    key = composerDocumentKey(projectId);
    raw = serializeComposerEnvelope({ version: 1, revision: 1, document }, projectId);
  } catch (reason) { return blocked(reason, "validation", null); }
  const index = observedIndex(storage, expectedIndexRaw);
  if (index.kind === "blocked") return index;
  if (index.collection.projectIds.includes(projectId)) return blocked(new Error("Project is already registered"), "index", index.raw, "conflict");
  try { serializeComposerIndex({ ...index.collection, projectIds: [...index.collection.projectIds, projectId] }); }
  catch (reason) { return blocked(reason, "validation", index.raw); }
  let observed: string | null;
  try { observed = storage.getItem(key); } catch (reason) { return blocked(reason, "document", null, "io"); }
  if (observed !== null) return blocked(new Error("Project key already exists; preserve and inspect the orphan before explicit registration"), "document", observed, "conflict");
  try { storage.setItem(key, raw); } catch (reason) { return blocked(reason, "document", null, "io"); }
  const result = registerComposerProject(storage, projectId, { raw, revision: 1 }, expectedIndexRaw);
  if (result.kind !== "blocked") return result;
  return { kind: "partial", message: "Document written, but index registration failed. The orphan was preserved; this is not a completed save. Inspect the index and retry registerComposerProject explicitly with the evidence and freshly observed index bytes.", evidence: { projectId, raw, revision: 1, expectedIndexRaw }, failure: result };
}
