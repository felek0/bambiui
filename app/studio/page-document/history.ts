import { applyPageCommands, type PageCommand } from "./commands.ts";
import { parsePageDocument, type PageDocument } from "./model.ts";

export type PageHistory = {
  present: PageDocument;
  past: PageDocument[];
  future: PageDocument[];
  limit: number;
};

export function createPageHistory(page: unknown, limit = 50): PageHistory {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("history: limit must be an integer from 1 to 100");
  return { present: parsePageDocument(page), past: [], future: [], limit };
}

const fingerprint = (page: PageDocument) => JSON.stringify(page, (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    : value,
);

/** One validated batch is one session history step; failed/no-op edits preserve redo. */
export function executePageCommands(history: PageHistory, commands: readonly PageCommand[]): PageHistory {
  const present = applyPageCommands(history.present, commands);
  if (fingerprint(present) === fingerprint(history.present)) return history;
  const next = structuredClone(history);
  next.past.push(next.present);
  next.past = next.past.slice(-next.limit);
  next.present = present;
  next.future = [];
  return next;
}

export function undoPage(history: PageHistory): PageHistory {
  if (!history.past.length) return history;
  const next = structuredClone(history);
  next.future.unshift(next.present);
  next.future = next.future.slice(0, next.limit);
  next.present = next.past.pop()!;
  return next;
}

export function redoPage(history: PageHistory): PageHistory {
  if (!history.future.length) return history;
  const next = structuredClone(history);
  next.past.push(next.present);
  next.past = next.past.slice(-next.limit);
  next.present = next.future.shift()!;
  return next;
}
