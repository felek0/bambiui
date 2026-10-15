import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { fileURLToPath } from "node:url";
import { createSourceCatalog } from "./generate-source-catalog.mjs";
import { cliRuntimeFiles, runtimeHash } from "./build-cli.mjs";
import { distributionLicense } from "../app/studio/distribution-license.ts";
import { canonicalJSON } from "../app/studio/source-files.ts";
import { publishRegistryArtifacts } from "./registry-archive.mjs";

export async function createRegistryRelease() {
  const catalog = await createSourceCatalog();
  const text = canonicalJSON({ format: "bambiui.registry", version: 1, license: distributionLicense, themeRuntimeSha256: runtimeHash(await cliRuntimeFiles()), catalog });
  const sha256 = createHash("sha256").update(text).digest("hex");
  const index = canonicalJSON({ format: "bambiui.registry-index", version: 1, release: { path: `releases/${sha256}/registry.json`, bytes: Buffer.byteLength(text), sha256 }, warnings: [] });
  return { text, sha256, index };
}
export async function generateRegistry(check = false) {
  const release = await createRegistryRelease();
  const count = await publishRegistryArtifacts(release, {
    archiveDirectory: fileURLToPath(new URL("../registry/", import.meta.url)),
    outputDirectory: fileURLToPath(new URL("../public/registry/", import.meta.url)),
    check,
  });
  console.log(`PASS: ${check ? "fresh" : "generated"} static CLI registry (${Buffer.byteLength(release.text)} bytes; ${count} retained release(s))`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every((arg) => arg === "--check"), "Only --check is supported");
  await generateRegistry(process.argv.includes("--check"));
}
