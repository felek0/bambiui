import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { cliRuntimeSha256, digest, parseRegistryPin } from "./registry.mjs";
import { sourceRecord, isHash, sourceStrings } from "../dist/system/source-catalog.mjs";
import { canonicalJSON, sourcePath } from "../dist/system/source-files.mjs";

export const itemIds = ["badge", "button", "card", "checkbox", "input", "layout", "switch", "text"];
export function outputDirectory(value) {
  sourcePath(value);
  if (value.split("/").some((part) => ["node_modules", "public", "out", "dist", "build"].includes(part))) throw new Error("Choose a source directory, not dependencies or generated output.");
  return value;
}
export async function safePath(root, name) {
  sourcePath(name);
  let current = root;
  const segments = name.split("/");
  for (let index = 0; index < segments.length; index++) {
    current = join(current, segments[index]);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || index < segments.length - 1 && !info.isDirectory()) throw new Error(`Refusing symlink or non-directory path: ${name}`);
      if (index === segments.length - 1 && !info.isFile()) throw new Error(`Refusing non-file target: ${name}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return current;
}
export async function existing(root, name, limit = 8 * 1024 * 1024) {
  const path = await safePath(root, name);
  try {
    const info = await lstat(path); if (info.size > limit) throw new Error(`File exceeds byte limit: ${name}`);
    const content = await readFile(path); if (content.length > limit) throw new Error(`File exceeds byte limit: ${name}`);
    return content;
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export function parseConfig(input) {
  const config = sourceRecord(input, ["format", "version", "directory", "registry", "components", "systemSha256", "themeRuntimeSha256", "files"], "bambiui.json");
  if (config.format !== "bambiui.project" || config.version !== 1 || !isHash(config.systemSha256)) throw new Error("Unsupported bambiui.json format or system identity.");
  if (config.themeRuntimeSha256 !== cliRuntimeSha256) throw new Error("This project requires the matching CLI theme resolver; no automatic registry upgrade was attempted.");
  const directory = outputDirectory(config.directory), components = sourceStrings(config.components, "installed components");
  if (components.some((id) => !itemIds.includes(id))) throw new Error("Unknown installed component.");
  if (!config.files || typeof config.files !== "object" || Array.isArray(config.files) || Object.keys(config.files).length > 128) throw new Error("Invalid tracked files.");
  const files = sourceRecord(config.files, Object.keys(config.files), "tracked files");
  for (const [path, hash] of Object.entries(files)) if (!sourcePath(path).startsWith(`${directory}/`) || !isHash(hash)) throw new Error("Invalid tracked file path/hash.");
  return { ...config, directory, registry: parseRegistryPin(config.registry), components, files: { ...files } };
}
export async function readConfig(root) {
  const content = await existing(root, "bambiui.json", 256 * 1024);
  if (!content) throw new Error("Run bambiui init first.");
  return parseConfig(JSON.parse(content));
}
export async function hostPackage(root) {
  const bytes = await existing(root, "package.json", 1024 * 1024);
  if (!bytes) throw new Error("Run bambiui inside an existing React project with package.json.");
  const manifest = JSON.parse(bytes);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Invalid host package.json.");
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) if (manifest[field] !== undefined && (!manifest[field] || typeof manifest[field] !== "object" || Array.isArray(manifest[field]))) throw new Error(`Invalid package.json ${field}.`);
  for (const pkg of ["react", "react-dom"]) {
    const version = manifest.dependencies?.[pkg] ?? manifest.devDependencies?.[pkg] ?? manifest.peerDependencies?.[pkg];
    if (typeof version !== "string" || !/^[~^]?19(?:\.(?:\d+|x|\*)){0,2}$/.test(version)) throw new Error(`This CLI targets React 19. Declare compatible ${pkg} in the host; the CLI will not upgrade it automatically.`);
  }
  return { manifest, bytes };
}
export async function withProjectLock(root, dryRun, action) {
  root = await realpath(resolve(root));
  if (dryRun) return action(root);
  const path = join(root, ".bambiui.lock");
  let lock;
  try { lock = await open(path, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") throw new Error("Another bambiui command or interrupted operation holds .bambiui.lock. Check it before removing the lock."); throw error; }
  try { return await action(root); }
  finally { await lock.close(); await unlink(path); }
}

/** Validate the whole plan before writing. Atomic per-file replacement; rollback on caught errors, not crash-atomic. */
export async function applyPlan(root, planned, tracked, { overwrite = false, dryRun = false, expected = new Map() } = {}) {
  const entries = [...planned].sort(([a], [b]) => a === "bambiui.json" ? 1 : b === "bambiui.json" ? -1 : a < b ? -1 : a > b ? 1 : 0);
  const original = new Map(), changes = [];
  for (const [path, content] of entries) {
    const bytes = await existing(root, path); original.set(path, bytes);
    if (expected.has(path) && !Buffer.from(expected.get(path)).equals(bytes ?? Buffer.alloc(0))) throw new Error(`File changed while preparing the command: ${path}`);
    if (bytes?.equals(Buffer.from(content))) continue;
    if (bytes && !expected.has(path) && (!tracked[path] || digest(bytes) !== tracked[path]) && !overwrite) throw new Error(`Local file conflict: ${path}. No files changed. Review it first; --overwrite explicitly replaces conflicting target files.`);
    changes.push([path, content]);
  }
  if (dryRun) return changes.map(([path]) => path);
  const written = [], directories = [], temporary = new Set();
  async function ensureDirectory(path) {
    if (path === root) return;
    try { const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe directory during write"); }
    catch (error) { if (error.code !== "ENOENT") throw error; await ensureDirectory(dirname(path)); await mkdir(path); directories.push(path); }
  }
  try {
    for (const [path, content] of changes) {
      const target = await safePath(root, path);
      await ensureDirectory(dirname(target));
      const now = await existing(root, path), before = original.get(path);
      if (before ? !now?.equals(before) : now !== null) throw new Error(`Concurrent edit detected: ${path}`);
      const temp = `${target}.bambiui-${randomUUID()}.tmp`; temporary.add(temp);
      const mode = before ? (await lstat(target)).mode & 0o777 : undefined;
      await writeFile(temp, content, { flag: "wx", ...(mode === undefined ? {} : { mode }) });
      await rename(temp, target); temporary.delete(temp); written.push([path, content]);
    }
  } catch (error) {
    const recovery = [];
    for (const [path, content] of written.reverse()) {
      try {
        const current = await existing(root, path);
        if (!current?.equals(Buffer.from(content))) throw new Error("File changed externally");
        const before = original.get(path);
        if (before === null) await rm(join(root, path)); else await writeFile(join(root, path), before);
      } catch { recovery.push(path); }
    }
    for (const directory of directories.reverse()) { try { await rmdir(directory); } catch { /* Preserve any nonempty directory. */ } }
    if (recovery.length) error.message += ` Manual recovery required for: ${recovery.join(", ")}.`;
    throw error;
  } finally { for (const path of temporary) await rm(path, { force: true }); }
  return changes.map(([path]) => path);
}
export function encodeConfig(config) { return canonicalJSON(parseConfig(config)); }
