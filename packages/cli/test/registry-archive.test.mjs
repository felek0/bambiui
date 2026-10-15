import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRegistryRelease } from "../../../scripts/generate-registry.mjs";
import { publishRegistryArtifacts, readRegistryArchive, snapshotRegistryRelease, validateArchivedRelease } from "../../../scripts/registry-archive.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
let base, release;
before(async () => {
  await mkdir(join(root, ".next"), { recursive: true }); base = await mkdtemp(join(root, ".next/registry-archive-test-"));
  release = await createRegistryRelease();
});
after(async () => { await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
async function fixture() {
  const folder = await mkdtemp(join(base, "fixture-"));
  const archiveDirectory = join(folder, "archive"), outputDirectory = join(folder, "public/registry");
  await snapshotRegistryRelease(archiveDirectory, release.text, release.sha256);
  return { folder, archiveDirectory, outputDirectory };
}
function changedRelease(text) {
  const value = JSON.parse(text); value.catalog.generator.version = "0.1.1";
  const nextText = JSON.stringify(value, null, 2) + "\n", sha256 = createHash("sha256").update(nextText).digest("hex");
  const index = JSON.stringify({ format: "bambiui.registry-index", version: 1, release: { bytes: Buffer.byteLength(nextText), path: `releases/${sha256}/registry.json`, sha256 }, warnings: [] }, null, 2) + "\n";
  return { text: nextText, sha256, index };
}

test("Tracked archive contains the exact first production release and original resolver identity", async () => {
  const records = await readRegistryArchive(join(root, "registry"));
  const sha = "f8c9659b67ea08923f7300577db326c63baa61cad3b04e9576ae0b10c945a709";
  assert.ok(records.has(sha), "The first public release must never be pruned");
  assert.equal(validateArchivedRelease(records.get(sha), sha).bytes, 210376);
});

test("Clean output regenerates every archived URL even after the latest release changes", async () => {
  const f = await fixture(), next = changedRelease(release.text);
  assert.notEqual(next.sha256, release.sha256);
  await publishRegistryArtifacts(release, f);
  await rm(f.outputDirectory, { recursive: true });
  await publishRegistryArtifacts(next, f);
  assert.equal(await readFile(join(f.outputDirectory, "releases", release.sha256, "registry.json"), "utf8"), release.text);
  assert.equal(await readFile(join(f.outputDirectory, "releases", next.sha256, "registry.json"), "utf8"), next.text);
  assert.equal(JSON.parse(await readFile(join(f.outputDirectory, "index.json"), "utf8")).release.sha256, next.sha256);
  await publishRegistryArtifacts(next, { ...f, check: true });
});

test("Snapshots and repeated builds are no-ops; published JSON bytes are never normalized", async () => {
  const f = await fixture();
  const file = join(f.archiveDirectory, "releases", release.sha256, "registry.json"), ledger = join(f.archiveDirectory, "releases.json");
  const before = { file: (await stat(file)).mtimeMs, ledger: (await stat(ledger)).mtimeMs };
  await snapshotRegistryRelease(f.archiveDirectory, release.text, release.sha256);
  assert.equal((await stat(file)).mtimeMs, before.file); assert.equal((await stat(ledger)).mtimeMs, before.ledger);
  await publishRegistryArtifacts(release, f);
  const indexTime = (await stat(join(f.outputDirectory, "index.json"))).mtimeMs;
  await publishRegistryArtifacts(release, f);
  assert.equal((await stat(join(f.outputDirectory, "index.json"))).mtimeMs, indexTime);
  assert.equal(await readFile(file, "utf8"), release.text);
});

test("Historical component IDs and resolver hashes do not need to match today's engine", async () => {
  const f = await fixture(), value = JSON.parse(release.text);
  value.themeRuntimeSha256 = "a".repeat(64);
  value.catalog.entries.retiredComponent = value.catalog.entries.text;
  const text = JSON.stringify(value) + "\n", sha = createHash("sha256").update(text).digest("hex");
  await snapshotRegistryRelease(f.archiveDirectory, text, sha);
  await publishRegistryArtifacts(release, f);
  assert.equal(await readFile(join(f.outputDirectory, "releases", sha, "registry.json"), "utf8"), text);
});

test("Missing or corrupted tracked snapshots fail before the latest index is changed", async () => {
  for (const kind of ["missing", "corrupt"]) {
    const f = await fixture();
    await publishRegistryArtifacts(release, f);
    const file = join(f.archiveDirectory, "releases", release.sha256, "registry.json");
    if (kind === "missing") await rm(file); else await writeFile(file, release.text + "\n");
    const index = await readFile(join(f.outputDirectory, "index.json"), "utf8");
    await assert.rejects(publishRegistryArtifacts(changedRelease(release.text), f));
    assert.equal(await readFile(join(f.outputDirectory, "index.json"), "utf8"), index);
  }
});

test("Unknown archive folders, symlinks and tampered ledger byte records are refused", async () => {
  const extra = await fixture();
  await mkdir(join(extra.archiveDirectory, "releases", "unexpected"));
  await assert.rejects(readRegistryArchive(extra.archiveDirectory), /Unlisted or missing/);
  const link = await fixture(), file = join(link.archiveDirectory, "releases", release.sha256, "registry.json");
  await rm(file); await symlink(join(extra.archiveDirectory, "releases", release.sha256, "registry.json"), file);
  await assert.rejects(readRegistryArchive(link.archiveDirectory), /Invalid archive file/);
  const f = await fixture(), ledgerPath = join(f.archiveDirectory, "releases.json"), ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  ledger.releases[0].bytes++;
  await writeFile(ledgerPath, JSON.stringify(ledger)); await assert.rejects(readRegistryArchive(f.archiveDirectory));
});

test("A corrupted generated immutable target is not silently overwritten and check mode writes nothing", async () => {
  const f = await fixture();
  await assert.rejects(publishRegistryArtifacts(release, { ...f, check: true }));
  assert.deepEqual(await readdir(f.folder), ["archive"]);
  await publishRegistryArtifacts(release, f);
  await writeFile(join(f.outputDirectory, "releases", release.sha256, "registry.json"), "corrupt");
  await assert.rejects(publishRegistryArtifacts(release, f), /Refusing to replace immutable/);
});
