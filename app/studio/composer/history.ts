import { applyComposerCommands, type ComposerCommand, type ComposerSystemCatalog } from "./commands.ts";
import { parseComposerDocument, validateComposerSystemReference, type ComposerDocument } from "./model.ts";

/** Session-only whole-project snapshots; no nested page/frame or token histories. */
export type ComposerHistory = {
  present: ComposerDocument;
  past: ComposerDocument[];
  future: ComposerDocument[];
  limit: number;
};
function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("history: limit must be an integer from 1 to 100");
}

/** Structural initialization deliberately permits a missing system reference. */
export function createComposerHistory(document: unknown, limit = 50): ComposerHistory {
  validateLimit(limit);
  return { present: parseComposerDocument(document), past: [], future: [], limit };
}
const fingerprint = (document: ComposerDocument) => JSON.stringify(document, (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    : value,
);
function detached(history: ComposerHistory): ComposerHistory {
  validateLimit(history.limit);
  return {
    present: parseComposerDocument(history.present),
    past: history.past.slice(-history.limit).map(parseComposerDocument),
    future: history.future.slice(0, history.limit).map(parseComposerDocument),
    limit: history.limit,
  };
}

/** One successful, non-no-op batch is one step. No-ops return the same history; errors throw without mutation. */
export function executeComposerCommands(history: ComposerHistory, commands: readonly ComposerCommand[], systems?: ComposerSystemCatalog): ComposerHistory {
  validateLimit(history.limit);
  const present = applyComposerCommands(history.present, commands, systems);
  if (fingerprint(present) === fingerprint(history.present)) return history;
  const next = detached(history);
  next.past.push(next.present);
  next.past = next.past.slice(-next.limit);
  next.present = present;
  next.future = [];
  return next;
}

/**
 * Pass the caller's CURRENT validated catalog to check the snapshot being restored.
 * Missing targets throw before changing state; no fallback/rebind is performed.
 * Without a catalog, restoration checks structural validity only. Empty stacks are identity no-ops.
 */
export function undoComposer(history: ComposerHistory, systems?: ComposerSystemCatalog): ComposerHistory {
  validateLimit(history.limit);
  if (!history.past.length) return history;
  const target = parseComposerDocument(history.past[history.past.length - 1]);
  if (systems) validateComposerSystemReference(target, systems);
  const next = detached(history);
  next.future.unshift(next.present);
  next.future = next.future.slice(0, next.limit);
  next.past.pop();
  next.present = target;
  return next;
}

/** Same restore/catalog policy as undoComposer; no catalog is cached in history. */
export function redoComposer(history: ComposerHistory, systems?: ComposerSystemCatalog): ComposerHistory {
  validateLimit(history.limit);
  if (!history.future.length) return history;
  const target = parseComposerDocument(history.future[0]);
  if (systems) validateComposerSystemReference(target, systems);
  const next = detached(history);
  next.past.push(next.present);
  next.past = next.past.slice(-next.limit);
  next.future.shift();
  next.present = target;
  return next;
}
