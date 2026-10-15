import metadata from "./source-catalog-meta.json" with { type: "json" };
import { SOURCE_MAX_BYTES, sha256 } from "./source-files.ts";
import { createSystemSourceFiles, captureSystemSource } from "./source-delivery.ts";
import { createSourceZIP } from "./source-zip.ts";
import type { ComponentId } from "./tokens.ts";

async function loadCatalog(): Promise<unknown> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(metadata.url, { signal: controller.signal, credentials: "same-origin", redirect: "error" });
    if (!response.ok || !response.body) throw new Error("Source catalog is unavailable. Reconnect and retry; no files were downloaded.");
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > SOURCE_MAX_BYTES || size > metadata.bytes) { await reader.cancel(); throw new Error("Source catalog size is invalid. Reload the application and retry."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (size !== metadata.bytes || await sha256(bytes) !== metadata.sha256) throw new Error("Source catalog does not match this application build. Reload and retry.");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally { clearTimeout(timer); }
}

export async function downloadSystemSource(input: unknown, selection: readonly ComponentId[]): Promise<void> {
  const { system, requested } = captureSystemSource(input, selection);
  const catalog = await loadCatalog();
  const files = await createSystemSourceFiles(system, requested, catalog);
  const blob = new Blob([createSourceZIP(files)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  let link: HTMLAnchorElement | undefined;
  try {
    link = document.createElement("a");
    link.href = url; link.download = "bambiui-system-source.zip"; link.hidden = true;
    document.body.append(link); link.click();
  } finally {
    link?.remove();
    // Defer revocation so the browser can begin reading the download, including Safari.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
