export const SOURCE_MAX_FILES = 128;
export const SOURCE_MAX_BYTES = 5 * 1024 * 1024;
export const utf8 = (text: string) => new TextEncoder().encode(text);

export function sourcePath(path: string): string {
  if (typeof path !== "string" || path.length > 240 || !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)*$/.test(path)) throw new Error("Invalid source file path");
  return path;
}

export function checkedSourceFiles(input: ReadonlyMap<string, string>): [string, Uint8Array][] {
  if (!(input instanceof Map) || !input.size || input.size > SOURCE_MAX_FILES) throw new Error("Source archive file limit exceeded");
  const seen = new Set<string>();
  let bytes = 0;
  return [...input].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, text]) => {
    sourcePath(path);
    if (seen.has(path.toLowerCase())) throw new Error("Duplicate source file path");
    seen.add(path.toLowerCase());
    if (typeof text !== "string") throw new Error("Source payload must be UTF-8 text");
    const data = utf8(text);
    bytes += data.length;
    if (bytes > SOURCE_MAX_BYTES) throw new Error("Source archive exceeds 5 MiB");
    return [path, data];
  });
}

/** Stable JSON identity independent of the caller's property insertion order. */
export function canonicalJSON(value: unknown): string {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, ordered(child)]));
    return value;
  }
  return JSON.stringify(ordered(value), null, 2) + "\n";
}

export async function sha256(data: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Source export requires a secure browser context with SHA-256 support.");
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
