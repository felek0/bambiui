import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const maxReleaseBytes = 8 * 1024 * 1024;
const maxArchiveBytes = 128 * 1024 * 1024;
const filePath = (value) => typeof value === "string" && value.length <= 240 && /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)*$/.test(value);

async function regularText(path, limit) {
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= limit, `Invalid archive file: ${path}`);
  const bytes = await readFile(path);
  assert.ok(bytes.length <= limit, `Archive byte limit exceeded: ${path}`);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function directory(path, create = false) {
  if (create) await mkdir(path, { recursive: true });
  const info = await lstat(path);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), `Invalid archive directory: ${path}`);
}

/** Validate frozen bytes, not today's component IDs, token resolver or normalization. */
export function validateArchivedRelease(text, sha256) {
  assert.ok(typeof text === "string" && Buffer.byteLength(text) <= maxReleaseBytes && isHash(sha256), "Invalid archived release");
  assert.equal(hash(text), sha256, "Archived release SHA-256 mismatch; never edit a published snapshot");
  const value = JSON.parse(text);
  assert.equal(value.format, "bambiui.registry"); assert.equal(value.version, 1);
  assert.ok(isHash(value.themeRuntimeSha256), "Invalid archived resolver identity");
  assert.equal(value.license?.spdx, "MIT");
  assert.ok(typeof value.license.text === "string" && value.license.text.startsWith("MIT License\n") && value.license.text.includes("Permission is hereby granted"), "Missing archived MIT notice");
  const catalog = value.catalog;
  assert.equal(catalog?.format, "bambiui.source-catalog"); assert.equal(catalog.version, 1);
  assert.ok(catalog.sources && typeof catalog.sources === "object" && !Array.isArray(catalog.sources), "Invalid archived source map");
  const sources = Object.entries(catalog.sources), seen = new Set();
  assert.ok(sources.length > 0 && sources.length <= 128, "Archived source file limit exceeded");
  let size = 0;
  for (const [path, file] of sources) {
    assert.ok(filePath(path) && /\.(tsx?|module\.css)$/.test(path) && !seen.has(path.toLowerCase()), "Invalid archived source path");
    seen.add(path.toLowerCase());
    assert.equal(typeof file.content, "string"); assert.equal(Buffer.byteLength(file.content), file.bytes);
    assert.equal(hash(file.content), file.sha256, `Archived source hash mismatch: ${path}`);
    size += file.bytes; assert.ok(size <= 5 * 1024 * 1024, "Archived source payload exceeds 5 MiB");
    assert.ok(Array.isArray(file.imports) && file.imports.every((path) => filePath(path) && Object.hasOwn(catalog.sources, path)), "Missing archived source dependency");
  }
  assert.ok(catalog.entries && Object.values(catalog.entries).every((path) => filePath(path) && Object.hasOwn(catalog.sources, path)), "Missing archived entry source");
  return { sha256, bytes: Buffer.byteLength(text) };
}
function parseLedger(text, allowEmpty = false) {
  const value = JSON.parse(text);
  assert.deepEqual(Object.keys(value).sort(), ["format", "releases", "version"]);
  assert.equal(value.format, "bambiui.registry-archive"); assert.equal(value.version, 1);
  assert.ok(Array.isArray(value.releases) && (allowEmpty || value.releases.length > 0), "Registry archive is empty");
  let bytes = 0;
  for (const [index, release] of value.releases.entries()) {
    assert.deepEqual(Object.keys(release).sort(), ["bytes", "sha256"]);
    assert.ok(isHash(release.sha256) && Number.isSafeInteger(release.bytes) && release.bytes > 0 && release.bytes <= maxReleaseBytes, "Invalid archived release record");
    if (index) assert.ok(value.releases[index - 1].sha256 < release.sha256, "Archive records must be sorted and unique");
    bytes += release.bytes; assert.ok(bytes <= maxArchiveBytes, "Registry archive exceeds 128 MiB; review storage without deleting existing pins");
  }
  return value;
}
async function ledgerAt(root, allowMissing = false) {
  await directory(root);
  try { return parseLedger(await regularText(join(root, "releases.json"), 1024 * 1024), allowMissing); }
  catch (error) {
    if (allowMissing && error.code === "ENOENT") return { format: "bambiui.registry-archive", version: 1, releases: [] };
    throw error;
  }
}
async function readRecord(root, record) {
  await directory(join(root, "releases")); await directory(join(root, "releases", record.sha256));
  const text = await regularText(join(root, "releases", record.sha256, "registry.json"), maxReleaseBytes);
  assert.deepEqual(validateArchivedRelease(text, record.sha256), record);
  const entries = await readdir(join(root, "releases", record.sha256));
  assert.deepEqual(entries, ["registry.json"], "Unexpected file in immutable release directory");
  return text;
}
export async function readRegistryArchive(root) {
  const ledger = await ledgerAt(root), files = new Map();
  for (const record of ledger.releases) files.set(record.sha256, await readRecord(root, record));
  const entries = (await readdir(join(root, "releases"))).sort();
  assert.deepEqual(entries, [...files.keys()], "Unlisted or missing release in registry archive");
  return files;
}
async function immutableFile(path, text) {
  try { await writeFile(path, text, { flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.equal(await regularText(path, maxReleaseBytes), text, `Refusing to replace immutable release: ${path}`);
  }
}
export async function snapshotRegistryRelease(root, text, sha256) {
  const record = validateArchivedRelease(text, sha256);
  await directory(root, true); await directory(join(root, "releases"), true);
  const ledger = await ledgerAt(root, true);
  for (const old of ledger.releases) await readRecord(root, old);
  const existing = ledger.releases.find((old) => old.sha256 === sha256);
  if (existing) assert.deepEqual(existing, record);
  else ledger.releases.push(record);
  ledger.releases.sort((a, b) => a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0);
  const content = JSON.stringify(ledger, null, 2) + "\n";
  parseLedger(content);
  await directory(join(root, "releases", sha256), true);
  await immutableFile(join(root, "releases", sha256, "registry.json"), text);
  assert.deepEqual((await readdir(join(root, "releases"))).sort(), ledger.releases.map((old) => old.sha256), "Unlisted archive release; inspect it before snapshotting");
  const path = join(root, "releases.json");
  try { if (await regularText(path, 1024 * 1024) === content) return record; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, content, { flag: "wx" }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
  return record;
}

/** All frozen snapshots are copied before the latest pointer; none is reserialized or pruned. */
export async function publishRegistryArtifacts(release, { archiveDirectory, outputDirectory, check = false }) {
  validateArchivedRelease(release.text, release.sha256);
  const files = await readRegistryArchive(archiveDirectory);
  if (files.has(release.sha256)) assert.equal(files.get(release.sha256), release.text);
  files.set(release.sha256, release.text);
  const index = JSON.parse(release.index);
  assert.equal(index.format, "bambiui.registry-index"); assert.equal(index.version, 1);
  assert.deepEqual(index.release, { bytes: Buffer.byteLength(release.text), path: `releases/${release.sha256}/registry.json`, sha256: release.sha256 });
  for (const [sha256, text] of files) {
    const folder = join(outputDirectory, "releases", sha256), path = join(folder, "registry.json");
    if (check) assert.equal(await regularText(path, maxReleaseBytes), text, `Missing/stale archived public release: ${sha256}`);
    else { await directory(outputDirectory, true); await directory(join(outputDirectory, "releases"), true); await directory(folder, true); await immutableFile(path, text); }
  }
  const path = join(outputDirectory, "index.json");
  try { if (await regularText(path, 64 * 1024) === release.index) return files.size; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  assert.ok(!check, "Registry index is stale");
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, release.index, { flag: "wx" }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
  return files.size;
}
