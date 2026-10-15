import { createHash } from "node:crypto";
import { distributionLicense } from "../dist/system/distribution-license.mjs";
import runtime from "../dist/runtime.json" with { type: "json" };
import { parseSourceCatalog, sourceRecord, isHash } from "../dist/system/source-catalog.mjs";

export const DEFAULT_REGISTRY_URL = "https://bambiui.com/registry/index.json";
export const cliRuntimeSha256 = runtime.sha256;
export const digest = (content) => createHash("sha256").update(content).digest("hex");
export const MAX_REGISTRY_BYTES = 8 * 1024 * 1024;
export function registryURL(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Registry URL must use HTTPS (HTTP is allowed only on loopback), without credentials, query or fragment.");
  return url;
}
async function fetchText(url, maxBytes, expected) {
  const response = await fetch(registryURL(url), { redirect: "error", signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json" } });
  if (!response.ok || !response.body) throw new Error(`Registry unavailable (${response.status}). No project files were changed.`);
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maxBytes || expected && size > expected.bytes) { await reader.cancel(); throw new Error("Registry exceeds its byte limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (expected && (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256)) throw new Error("Registry integrity mismatch. No project files were changed.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export function parseRegistryPin(input) {
  const pin = sourceRecord(input, ["url", "sha256", "bytes"], "registry pin");
  const url = registryURL(pin.url);
  if (!isHash(pin.sha256) || !Number.isSafeInteger(pin.bytes) || pin.bytes <= 0 || pin.bytes > MAX_REGISTRY_BYTES || !url.pathname.endsWith(`/releases/${pin.sha256}/registry.json`)) throw new Error("Invalid immutable registry pin.");
  return { url: url.href, sha256: pin.sha256, bytes: pin.bytes };
}
export async function resolveRegistry(indexURL) {
  const url = registryURL(indexURL);
  const index = sourceRecord(JSON.parse(await fetchText(url, 64 * 1024)), ["format", "version", "release", "warnings"], "registry index");
  if (index.format !== "bambiui.registry-index" || index.version !== 1 || JSON.stringify(index.warnings) !== '[]') throw new Error("Unsupported registry index.");
  const release = sourceRecord(index.release, ["path", "sha256", "bytes"], "registry release");
  if (!isHash(release.sha256) || release.path !== `releases/${release.sha256}/registry.json`) throw new Error("Invalid registry release path.");
  return parseRegistryPin({ url: new URL(release.path, url).href, sha256: release.sha256, bytes: release.bytes });
}
export async function loadRegistry(input) {
  const pin = parseRegistryPin(input);
  const release = sourceRecord(JSON.parse(await fetchText(pin.url, MAX_REGISTRY_BYTES, pin)), ["format", "version", "license", "themeRuntimeSha256", "catalog"], "registry");
  if (release.format !== "bambiui.registry" || release.version !== 1) throw new Error("Unsupported registry format.");
  const license = sourceRecord(release.license, ["spdx", "text"], "registry license");
  if (license.spdx !== distributionLicense.spdx || license.text !== distributionLicense.text) throw new Error("Registry must carry the approved MIT license and notice.");
  if (release.themeRuntimeSha256 !== runtime.sha256) throw new Error("This registry requires a different CLI theme resolver. Use the matching CLI release; no fallback or migration was attempted.");
  return parseSourceCatalog(release.catalog);
}
