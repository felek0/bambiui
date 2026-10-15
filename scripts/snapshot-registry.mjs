import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRegistryRelease } from "./generate-registry.mjs";
import { snapshotRegistryRelease } from "./registry-archive.mjs";

assert.equal(process.argv.length, 2, "registry:snapshot takes no arguments");
const release = await createRegistryRelease();
const record = await snapshotRegistryRelease(fileURLToPath(new URL("../registry/", import.meta.url)), release.text, release.sha256);
console.log(`PASS: archived immutable registry release ${record.sha256} (${record.bytes} bytes)`);
console.log("Keep registry/releases.json and this snapshot in Git. Do not edit or remove published snapshots.");
