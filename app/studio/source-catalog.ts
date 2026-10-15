import { componentIds, type ComponentId } from "./tokens.ts";
import { SOURCE_MAX_BYTES, SOURCE_MAX_FILES, sha256, sourcePath, utf8 } from "./source-files.ts";

export type SourceCatalog = {
  format: "bambiui.source-catalog"; version: 1;
  generator: { name: "bambiui"; version: string };
  versions: Record<"react" | "react-dom" | "@base-ui/react", string>;
  entries: Record<ComponentId | "layout", string>;
  sources: Record<string, { content: string; bytes: number; sha256: string; imports: string[]; packages: string[] }>;
};
export function sourceRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Invalid ${label}`);
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field) || !field.enumerable) throw new Error(`Unknown or invalid ${label} key`);
  }
  if (keys.some((key) => !Object.hasOwn(value, key))) throw new Error(`Missing ${label} key`);
  return value as Record<string, unknown>;
}
export const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const isVersion = (value: unknown): value is string => typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
export function sourceStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string") || new Set(value).size !== value.length || value.some((item, index) => index > 0 && value[index - 1] >= item)) throw new Error(`Invalid sorted ${label}`);
  return [...value];
}

/** Detaches and verifies the allowlisted build artifact, including every source hash. */
export async function parseSourceCatalog(input: unknown): Promise<SourceCatalog> {
  const raw = sourceRecord(input, ["format", "version", "generator", "versions", "entries", "sources"], "source catalog");
  if (raw.format !== "bambiui.source-catalog" || raw.version !== 1) throw new Error("Unsupported source catalog");
  const generator = sourceRecord(raw.generator, ["name", "version"], "generator");
  if (generator.name !== "bambiui" || !isVersion(generator.version)) throw new Error("Invalid generator version");
  const packages = ["react", "react-dom", "@base-ui/react"] as const;
  const versions = sourceRecord(raw.versions, packages, "dependency versions");
  if (Object.values(versions).some((value) => !isVersion(value))) throw new Error("Invalid dependency version");
  const entries = sourceRecord(raw.entries, [...componentIds, "layout"], "source entries");
  for (const id of [...componentIds, "layout"]) if (entries[id] !== (id === "layout" ? "layout/index.tsx" : `components/${id}.tsx`)) throw new Error("Invalid source entry");
  if (!raw.sources || typeof raw.sources !== "object" || Array.isArray(raw.sources)) throw new Error("Invalid source records");
  const sources: SourceCatalog["sources"] = {};
  const paths = Object.keys(raw.sources), seen = new Set<string>();
  if (!paths.length || paths.length > SOURCE_MAX_FILES) throw new Error("Source catalog file limit exceeded");
  let bytes = 0;
  for (const path of paths.sort()) {
    sourcePath(path);
    if (!/\.(tsx?|module\.css)$/.test(path) || seen.has(path.toLowerCase())) throw new Error("Invalid source catalog path");
    seen.add(path.toLowerCase());
    const file = sourceRecord((raw.sources as Record<string, unknown>)[path], ["content", "bytes", "sha256", "imports", "packages"], "source file");
    if (typeof file.content !== "string" || !isHash(file.sha256) || file.bytes !== utf8(file.content).length) throw new Error("Invalid source content");
    bytes += file.bytes as number;
    if (bytes > SOURCE_MAX_BYTES) throw new Error("Source catalog exceeds 5 MiB");
    const imports = sourceStrings(file.imports, "local dependencies"), external = sourceStrings(file.packages, "external dependencies");
    if (external.some((pkg) => !packages.includes(pkg as typeof packages[number]))) throw new Error("Unapproved source dependency");
    for (const dependency of imports) { sourcePath(dependency); if (!paths.includes(dependency)) throw new Error("Missing source dependency"); }
    if (await sha256(utf8(file.content)) !== file.sha256) throw new Error("Source catalog integrity check failed");
    sources[path] = { content: file.content, bytes: file.bytes as number, sha256: file.sha256, imports, packages: external };
  }
  if (Object.values(entries).some((path) => !Object.hasOwn(sources, path as string))) throw new Error("Missing source entry");
  return { format: "bambiui.source-catalog", version: 1, generator: { name: "bambiui", version: generator.version }, versions: versions as SourceCatalog["versions"], entries: entries as SourceCatalog["entries"], sources };
}
