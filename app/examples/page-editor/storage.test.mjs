import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createPageBundle, serializePageBundle, PAGE_BUNDLE_MAX_BYTES } from "../../studio/page-document/bundle.ts";
import { defaultSystem } from "../../studio/tokens.ts";
import { PAGE_EDITOR_STORAGE_KEY, readLocalBundle, saveLocalBundle, resetLocalBundle, readBundleFile } from "./storage.ts";

const require = createRequire(import.meta.url);
const bundle = () => createPageBundle(require("../../studio/page-document/account-settings.json"), defaultSystem);
function storage(raw = null) {
  return { raw, writes: 0, getItem(key) { assert.equal(key, PAGE_EDITOR_STORAGE_KEY); return this.raw; }, setItem(key, value) { assert.equal(key, PAGE_EDITOR_STORAGE_KEY); this.raw = value; this.writes++; } };
}

test("empty and valid startup reads validate and never write", () => {
  const empty = storage();
  assert.deepEqual(readLocalBundle(empty), { kind: "empty", raw: null });
  const valid = storage(serializePageBundle(bundle()));
  assert.deepEqual(readLocalBundle(valid).bundle, bundle());
  assert.equal(valid.writes + empty.writes, 0);
});

test("corrupt, unsupported and oversized local copies remain untouched", () => {
  for (const raw of ["{", '{"format":"unknown","version":1}', " ".repeat(PAGE_BUNDLE_MAX_BYTES + 1)]) {
    const local = storage(raw);
    const result = readLocalBundle(local);
    assert.equal(result.kind, "blocked");
    assert.match(result.message, /Reset local copy/);
    assert.equal(local.raw, raw);
    assert.equal(local.writes, 0);
  }
});

test("invalid page and design-system data cannot restore", () => {
  for (const field of ["page", "designSystem"]) {
    const invalid = { ...bundle(), [field]: {} };
    const local = storage(JSON.stringify(invalid));
    assert.equal(readLocalBundle(local).kind, "blocked");
    assert.equal(local.writes, 0);
  }
});

test("read failures are actionable and do not trigger writes", () => {
  const local = storage();
  local.getItem = () => { throw new Error("Access denied"); };
  assert.match(readLocalBundle(local).message, /Access denied/);
  assert.equal(local.writes, 0);
});

test("save validates, round trips and refuses hidden overwrite", () => {
  const local = storage();
  const text = saveLocalBundle(local, bundle(), null);
  assert.equal(local.raw, text);
  assert.deepEqual(readLocalBundle(local).bundle, bundle());
  assert.throws(() => saveLocalBundle(local, bundle(), null), /changed outside/);
  assert.equal(local.writes, 1);
  assert.throws(() => saveLocalBundle(local, { ...bundle(), version: 2 }, text), /unsupported version/);
  assert.equal(local.writes, 1);
});

test("quota failure preserves the old copy and caller's in-memory bundle", () => {
  const old = serializePageBundle(bundle());
  const local = storage(old);
  const current = bundle();
  current.page.name = "Edited page";
  local.setItem = () => { throw new Error("Quota exceeded"); };
  assert.throws(() => saveLocalBundle(local, current, old), /Quota exceeded/);
  assert.equal(local.raw, old);
  assert.equal(current.page.name, "Edited page");
});

test("explicit reset can replace corrupt data, but validates first", () => {
  const local = storage("corrupt");
  assert.throws(() => resetLocalBundle(local, { ...bundle(), version: 2 }));
  assert.equal(local.raw, "corrupt");
  resetLocalBundle(local, bundle());
  assert.equal(readLocalBundle(local).kind, "valid");
});

test("failed explicit reset does not discard the existing bytes", () => {
  const local = storage("corrupt but recoverable externally");
  local.setItem = () => { throw new Error("Quota exceeded"); };
  assert.throws(() => resetLocalBundle(local, bundle()), /Quota exceeded/);
  assert.equal(local.raw, "corrupt but recoverable externally");
});

test("oversized file is rejected before reading; string parser also bounds UTF-8", async () => {
  let reads = 0;
  await assert.rejects(readBundleFile({ size: PAGE_BUNDLE_MAX_BYTES + 1, text: async () => { reads++; return "{}"; } }), /1 MiB/);
  assert.equal(reads, 0);
  await assert.rejects(readBundleFile({ size: 1, text: async () => "é".repeat(PAGE_BUNDLE_MAX_BYTES / 2 + 1) }), /size limit/);
});

test("file import round trips, rejects invalid content and permits retry", async () => {
  const text = serializePageBundle(bundle());
  const file = { size: text.length, text: async () => text };
  assert.deepEqual(await readBundleFile(file), bundle());
  assert.deepEqual(await readBundleFile(file), bundle());
  await assert.rejects(readBundleFile({ size: 1, text: async () => "{" }));
  await assert.rejects(readBundleFile({ size: 1, text: async () => { throw new Error("Read failed"); } }), /Read failed/);
});
