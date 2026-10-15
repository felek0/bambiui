import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createSourceCatalog } from "./generate-source-catalog.mjs";
import { cliRuntimeFiles, runtimeHash } from "./build-cli.mjs";
import { distributionLicense } from "../app/studio/distribution-license.ts";
import { canonicalJSON } from "../app/studio/source-files.ts";

export async function createRegistryRelease() {
  const catalog = await createSourceCatalog();
  const text = canonicalJSON({ format: "bambiui.registry", version: 1, license: distributionLicense, themeRuntimeSha256: runtimeHash(await cliRuntimeFiles()), catalog });
  const sha256 = createHash("sha256").update(text).digest("hex");
  const index = canonicalJSON({ format: "bambiui.registry-index", version: 1, release: { path: `releases/${sha256}/registry.json`, bytes: Buffer.byteLength(text), sha256 }, warnings: [] });
  return { text, sha256, index };
}
async function writeIfChanged(path, content, check) {
  try { if (await readFile(path, "utf8") === content) return; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  assert.ok(!check, `Registry is stale: ${path}`);
  await writeFile(path, content);
}
export async function generateRegistry(check = false) {
  const release = await createRegistryRelease(), directory = new URL("../public/registry/", import.meta.url);
  const immutable = new URL(`releases/${release.sha256}/`, directory);
  if (!check) await mkdir(immutable, { recursive: true });
  await writeIfChanged(new URL("registry.json", immutable), release.text, check);
  await writeIfChanged(new URL("index.json", directory), release.index, check);
  // Retain older local immutable releases. Deployment must retain pinned releases too.
  console.log(`PASS: ${check ? "fresh" : "generated"} static CLI registry (${Buffer.byteLength(release.text)} bytes)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every((arg) => arg === "--check"), "Only --check is supported");
  await generateRegistry(process.argv.includes("--check"));
}
