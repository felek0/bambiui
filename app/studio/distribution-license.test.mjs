import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { checkDistributionLicense } from "../../scripts/license-scope.mjs";
import { distributionLicense } from "./distribution-license.ts";

test("MIT grant matches package text and covers explicit shared sources, not the private Studio", async () => {
  assert.equal(await readFile(new URL("../../packages/cli/LICENSE", import.meta.url), "utf8"), distributionLicense.text);
  await checkDistributionLicense(["app/studio/components/button.tsx", "app/studio/tokens.ts", "app/studio/distribution-license.ts"]);
  await assert.rejects(checkDistributionLicense(["app/studio/studio.tsx"]), /no explicit MIT distribution grant/);
  await assert.rejects(checkDistributionLicense(["app/studio/composer/model.ts"]), /no explicit MIT distribution grant/);
  const notice = await readFile(new URL("../../LICENSE", import.meta.url), "utf8");
  assert.match(notice, /No license to other repository files is granted/);
});
