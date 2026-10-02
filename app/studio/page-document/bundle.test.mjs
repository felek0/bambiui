import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPageBundle, parsePageBundle, serializePageBundle, PAGE_BUNDLE_MAX_BYTES } from "./bundle.ts";
import { defaultSystem, toCSSVariables } from "../tokens.ts";

const page = JSON.parse(readFileSync(new URL("./account-settings.json", import.meta.url), "utf8"));

test("page bundle preserves page and both themes through JSON round-trip", () => {
  const bundle = createPageBundle(page, defaultSystem);
  const text = serializePageBundle(bundle);
  assert.deepEqual(parsePageBundle(text), bundle);
  assert.equal(serializePageBundle(parsePageBundle(text)), text);
  assert.equal(bundle.designSystem.version, 3);
  assert.deepEqual(bundle.page, page);
});

test("snapshot normalization keeps colors independent and geometry shared without mutating inputs", () => {
  const system = structuredClone(defaultSystem);
  system.themes.light.global.background = "#fafafa";
  system.themes.dark.global.background = "#101010";
  system.themes.light.global.spacingSm = 7;
  system.themes.dark.global.spacingSm = 50;
  const before = structuredClone(system);
  const bundle = createPageBundle(page, system);
  assert.deepEqual(system, before);
  for (const mode of ["light", "dark"]) {
    assert.equal(bundle.designSystem.themes[mode].global.spacingSm, 7);
    assert.equal(toCSSVariables(bundle.designSystem.themes[mode], mode)["--ds-spacing-sm"], "7px");
  }
  assert.equal(bundle.designSystem.themes.light.global.background, "#fafafa");
  assert.equal(bundle.designSystem.themes.dark.global.background, "#101010");
  system.themes.light.global.spacingSm = 9;
  assert.equal(bundle.designSystem.themes.light.global.spacingSm, 7);
});

test("rejects unknown bundle keys, wrong versions/formats and invalid nested records", () => {
  const bundle = createPageBundle(page, defaultSystem);
  const cases = [
    { ...bundle, extra: true }, { ...bundle, version: 2 },
    { ...bundle, format: "bambiui.project" }, { ...bundle, page: null },
    { ...bundle, designSystem: null }, { ...bundle, designSystem: { version: 99 } },
    { ...bundle, page: { ...bundle.page, script: "alert(1)" } },
  ];
  for (const value of cases) assert.throws(() => parsePageBundle(JSON.stringify(value)));
  assert.throws(() => parsePageBundle(JSON.stringify(page)), /unknown key|unsupported format/);
  assert.throws(() => parsePageBundle(JSON.stringify(defaultSystem)), /unknown key|unsupported format/);
  assert.throws(() => parsePageBundle("{"));
});

test("enforces the UTF-8 byte limit, including exact boundary and multibyte input", () => {
  const text = serializePageBundle(createPageBundle(page, defaultSystem));
  const bytes = new TextEncoder().encode(text).byteLength;
  const boundary = text + " ".repeat(PAGE_BUNDLE_MAX_BYTES - bytes);
  assert.doesNotThrow(() => parsePageBundle(boundary));
  assert.throws(() => parsePageBundle(boundary + " "), /size limit exceeded/);
  const unicode = "€".repeat(Math.ceil(PAGE_BUNDLE_MAX_BYTES / 3));
  assert.ok(unicode.length < PAGE_BUNDLE_MAX_BYTES);
  assert.throws(() => parsePageBundle(unicode), /size limit exceeded/);
});

test("accepts older design-system snapshots through the existing migration contract", () => {
  const legacy = { version: 2, name: "Legacy", global: structuredClone(defaultSystem.themes.light.global), components: structuredClone(defaultSystem.themes.light.components) };
  const bundle = createPageBundle(page, legacy);
  assert.equal(bundle.designSystem.version, 3);
  assert.equal(bundle.designSystem.name, "Legacy");
  assert.equal(bundle.designSystem.themes.light.global.primary, legacy.global.primary);
  assert.equal(bundle.designSystem.themes.dark.global.primary, legacy.global.primary);
});
