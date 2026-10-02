import { parseDesignSystem, type DesignSystem } from "../tokens.ts";
import { parsePageDocument, type PageDocument } from "./model.ts";

export type PageBundle = {
  format: "bambiui.page-bundle";
  version: 1;
  page: PageDocument;
  designSystem: DesignSystem;
};

// Limit untrusted UTF-8 input before JSON parsing; node/string limits still apply inside.
export const PAGE_BUNDLE_MAX_BYTES = 1024 * 1024;

export function parsePageBundle(text: string): PageBundle {
  if (typeof text !== "string" || text.length > PAGE_BUNDLE_MAX_BYTES || new TextEncoder().encode(text).byteLength > PAGE_BUNDLE_MAX_BYTES) throw new Error("bundle: invalid input or size limit exceeded");
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("bundle: expected object");
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) if (!["format", "version", "page", "designSystem"].includes(key)) throw new Error(`bundle: unknown key ${key}`);
  if (raw.format !== "bambiui.page-bundle") throw new Error("bundle: unsupported format");
  if (raw.version !== 1) throw new Error("bundle: unsupported version");
  if (!Object.hasOwn(raw, "designSystem")) throw new Error("bundle: missing designSystem");
  return {
    format: "bambiui.page-bundle", version: 1,
    page: parsePageDocument(raw.page),
    designSystem: parseDesignSystem(JSON.stringify(raw.designSystem)),
  };
}

/** A detached snapshot, not a live reference to a saved Studio system or a project. */
export function createPageBundle(page: unknown, designSystem: unknown): PageBundle {
  return parsePageBundle(JSON.stringify({ format: "bambiui.page-bundle", version: 1, page, designSystem }));
}

export function serializePageBundle(bundle: PageBundle): string {
  const normalized = parsePageBundle(JSON.stringify(bundle));
  const text = JSON.stringify(normalized, null, 2);
  // Pretty-printed output must also be acceptable to the importer.
  parsePageBundle(text);
  return text;
}
