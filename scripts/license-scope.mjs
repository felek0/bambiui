import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { distributionLicense } from "../app/studio/distribution-license.ts";

const root = new URL("../", import.meta.url);
export async function checkDistributionLicense(paths) {
  const scope = JSON.parse(await readFile(new URL("distribution-license.json", root), "utf8"));
  assert.equal(scope.format, "bambiui.license-scope"); assert.equal(scope.version, 1); assert.equal(scope.license, "MIT");
  assert.equal(scope.licenseFile, "packages/cli/LICENSE");
  assert.ok(Array.isArray(scope.sources) && new Set(scope.sources).size === scope.sources.length);
  assert.equal(await readFile(new URL(scope.licenseFile, root), "utf8"), distributionLicense.text, "Distribution MIT notice differs from the approved package license");
  for (const path of paths) assert.ok(scope.sources.includes(path), `Source has no explicit MIT distribution grant: ${path}`);
  return distributionLicense;
}
