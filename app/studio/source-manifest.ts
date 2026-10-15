import { componentIds, type ComponentId } from "./tokens.ts";
import { isHash, isVersion, sourceRecord, sourceStrings } from "./source-catalog.ts";
import { SOURCE_MAX_BYTES, SOURCE_MAX_FILES, sourcePath } from "./source-files.ts";

export const sourceWarningCodes = ["remote-font", "controlled-snapshot", "form-action", "explicit-local-styles", "licensing-unresolved"] as const;
export type SourceWarning = typeof sourceWarningCodes[number];
export type SystemSourceManifest = {
  format: "bambiui.source-delivery"; version: 1; kind: "system";
  generator: { name: "bambiui"; version: string };
  snapshot: { systemSchemaVersion: 3; systemSha256: string; scopeId: string };
  requestedComponents: ComponentId[]; includedComponents: ComponentId[];
  includesLayout: boolean; entry: "Example.tsx";
  dependencies: Record<string, string>; peerDependencies: Record<string, string>;
  files: { path: string; bytes: number; sha256: string }[];
  warnings: SourceWarning[];
};

export function parseSystemSourceManifest(input: unknown): SystemSourceManifest {
  const raw = sourceRecord(input, ["format", "version", "kind", "generator", "snapshot", "requestedComponents", "includedComponents", "includesLayout", "entry", "dependencies", "peerDependencies", "files", "warnings"], "source manifest");
  if (raw.format !== "bambiui.source-delivery" || raw.version !== 1 || raw.kind !== "system" || raw.entry !== "Example.tsx" || typeof raw.includesLayout !== "boolean") throw new Error("Unsupported system source manifest");
  const generator = sourceRecord(raw.generator, ["name", "version"], "generator");
  if (generator.name !== "bambiui" || !isVersion(generator.version)) throw new Error("Invalid generator");
  const snapshot = sourceRecord(raw.snapshot, ["systemSchemaVersion", "systemSha256", "scopeId"], "snapshot");
  if (snapshot.systemSchemaVersion !== 3 || !isHash(snapshot.systemSha256) || snapshot.scopeId !== `bambiui-${snapshot.systemSha256}`) throw new Error("Invalid snapshot identity");
  const requested = sourceStrings(raw.requestedComponents, "requested components"), included = sourceStrings(raw.includedComponents, "included components");
  if (!requested.length || [...requested, ...included].some((id) => !componentIds.includes(id as ComponentId)) || requested.some((id) => !included.includes(id))) throw new Error("Invalid component selection");
  function dependencies(value: unknown, allowed: string[], required: string[]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid dependencies");
    const fields = Object.keys(value);
    const record = sourceRecord(value, fields, "dependencies");
    if (fields.some((key) => !allowed.includes(key) || !isVersion(record[key])) || required.some((key) => !fields.includes(key))) throw new Error("Unapproved dependency version");
    return { ...record } as Record<string, string>;
  }
  const runtime = dependencies(raw.dependencies, ["@base-ui/react"], []), peers = dependencies(raw.peerDependencies, ["react", "react-dom"], ["react", "react-dom"]);
  if (!Array.isArray(raw.files) || !raw.files.length || raw.files.length >= SOURCE_MAX_FILES) throw new Error("Invalid source file list");
  let size = 0;
  const seen = new Set<string>();
  const files = raw.files.map((input, index) => {
    const file = sourceRecord(input, ["path", "bytes", "sha256"], "manifest file");
    if (typeof file.path !== "string" || !Number.isSafeInteger(file.bytes) || (file.bytes as number) < 0 || !isHash(file.sha256)) throw new Error("Invalid manifest file");
    sourcePath(file.path);
    if (file.path === "manifest.json" || seen.has(file.path.toLowerCase()) || index && (raw.files as { path: string }[])[index - 1].path >= file.path) throw new Error("Invalid manifest file order");
    seen.add(file.path.toLowerCase()); size += file.bytes as number;
    if (size > SOURCE_MAX_BYTES) throw new Error("Source file size limit exceeded");
    return { path: file.path, bytes: file.bytes as number, sha256: file.sha256 };
  });
  if (!files.some((file) => file.path === "Example.tsx")) throw new Error("Missing source entry file");
  const warnings = sourceStrings(raw.warnings, "warnings");
  if (warnings.some((code) => !sourceWarningCodes.includes(code as SourceWarning))) throw new Error("Unknown source warning");
  return { format: "bambiui.source-delivery", version: 1, kind: "system", generator: { name: "bambiui", version: generator.version },
    snapshot: { systemSchemaVersion: 3, systemSha256: snapshot.systemSha256, scopeId: snapshot.scopeId as string }, requestedComponents: requested as ComponentId[], includedComponents: included as ComponentId[],
    includesLayout: raw.includesLayout, entry: "Example.tsx", dependencies: runtime, peerDependencies: peers, files, warnings: warnings as SourceWarning[] };
}
