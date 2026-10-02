import { PAGE_BUNDLE_MAX_BYTES, parsePageBundle, serializePageBundle, type PageBundle } from "../../studio/page-document/bundle.ts";

export const PAGE_EDITOR_STORAGE_KEY = "bambiui.examples.page-editor.bundle.v1";
export type BundleStorage = Pick<Storage, "getItem" | "setItem">;
export type LocalRead = { kind: "empty"; raw: null } | { kind: "valid"; raw: string; bundle: PageBundle } | { kind: "blocked"; message: string };

export function ioMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Unknown storage or file error";
}

export function readLocalBundle(storage: BundleStorage): LocalRead {
  try {
    const raw = storage.getItem(PAGE_EDITOR_STORAGE_KEY);
    return raw === null ? { kind: "empty", raw } : { kind: "valid", raw, bundle: parsePageBundle(raw) };
  } catch (reason) {
    return { kind: "blocked", message: `${ioMessage(reason)}. Stored data was not changed. Export your current page for safety; use Reset local copy to explicitly replace stored data.` };
  }
}

/** Validate before touching storage; compare the last observed bytes to avoid hidden overwrites. */
export function saveLocalBundle(storage: BundleStorage, bundle: PageBundle, expectedRaw: string | null): string {
  const text = serializePageBundle(bundle);
  if (storage.getItem(PAGE_EDITOR_STORAGE_KEY) !== expectedRaw) throw new Error("Local copy changed outside this editor. Reload to restore it, or export your page and explicitly reset the local copy.");
  storage.setItem(PAGE_EDITOR_STORAGE_KEY, text);
  return text;
}

/** Only for a user-confirmed reset, including recovery from corrupt storage. */
export function resetLocalBundle(storage: BundleStorage, bundle: PageBundle): string {
  const text = serializePageBundle(bundle);
  storage.setItem(PAGE_EDITOR_STORAGE_KEY, text);
  return text;
}

export async function readBundleFile(file: { size: number; text(): Promise<string> }): Promise<PageBundle> {
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > PAGE_BUNDLE_MAX_BYTES) throw new Error("Choose a page bundle JSON file no larger than 1 MiB.");
  return parsePageBundle(await file.text());
}
