import assert from "node:assert/strict";
import test, { after } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./page-document/parity-loader.mjs";
import { createComposerDocument } from "./composer/model.ts";
import { COMPOSER_INDEX_KEY, COMPOSER_DOCUMENT_PREFIX, composerDocumentKey, serializeComposerEnvelope, serializeComposerIndex } from "./composer/storage.ts";
import { captureLocalRecovery, readLegacyProjectReferences, legacySystemDeletionBlock, isRecoveryKey, RECOVERY_LIMITS, LEGACY_PAGE_EDITOR_KEY } from "./legacy-project-recovery.ts";

const nextResolution = registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === "next/link" ? "next/link.js" : specifier, context); } });
const loader = installParityLoader();
const { ProjectSuspended } = await import("./project-suspended.tsx");
after(() => { loader.cleanup(); nextResolution.deregister(); });

// Exercise the actual app-dialog handlers in memory. No Next mount or fixture writes;
// real cross-tab delivery, focus and Escape behavior remain D's browser gate.
const studioSource = readFileSync(new URL("./studio.tsx", import.meta.url), "utf8");
const deletionSource = studioSource.slice(studioSource.indexOf("  function openSystemDeletion()"), studioSource.indexOf("  function addSystem("));
assert.doesNotMatch(deletionSource, /window\.confirm|waitForLegacyReferenceRefresh/);
const { createDeletionProbe } = await loader.generated(`
export function createDeletionProbe({ collection, storage, block, read, save = true }) {
  const collectionRef = { current: collection };
  const currentSystem = { current: collection.systems.find(entry => entry.id === collection.activeId).system };
  const deletionAttempt = { current: null }, deletionRequestRef = { current: null };
  const switcherRef = { current: { removeAttribute() {} } };
  const pending = [], writes = [];
  let checks = 0, request = null, error = "";
  const setDeletionPending = value => pending.push(value);
  const setDeletionRequest = value => { request = value; };
  const setDeletionError = value => { error = value; };
  const refreshReferences = () => { checks++; return read(storage); };
  const legacySystemDeletionBlock = block;
  const t = { untitled: "Untitled" };
  const activate = next => { if (!save) return false; writes.push(next); collectionRef.current = next; return true; };
  ${deletionSource}
  return { openSystemDeletion, cancelSystemDeletion, confirmSystemDeletion, collectionRef, currentSystem, pending, writes,
    unmount: () => { deletionAttempt.current = null; deletionRequestRef.current = null; },
    get request() { return request; }, get error() { return error; }, get checks() { return checks; } };
}
`);
function deletionProbe(local, extra = {}) {
  return createDeletionProbe({
    collection: { version: 1, activeId: "linked", systems: [{ id: "linked", system: { name: "Target" } }, { id: "other", system: { name: "Other" } }] },
    storage: local, block: legacySystemDeletionBlock, read: readLegacyProjectReferences, ...extra,
  });
}

test("suspended SSR exposes recovery and System link without reading browser storage or rendering Studio", () => {
  const html = renderToStaticMarkup(createElement(ProjectSuspended));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /Project editing is paused/);
  assert.match(html, /href="\/colors"[^>]*>Open design system/);
  assert.match(html, /<button[^>]*>Download local recovery data<\/button>/);
  assert.match(html, /role="status"/);
  assert.match(html, /Unsaved work and history in other tabs cannot be read/);
  assert.doesNotMatch(html, /studio-shell|studio-header|workspace-inspector|Page canvas/);
});

function storage(entries = []) {
  const data = new Map(entries);
  return { data, get length() { return data.size; }, key(i) { return [...data.keys()][i] ?? null; }, getItem(key) { return data.get(key) ?? null; }, setItem() { assert.fail("read-only adapter wrote storage"); }, removeItem() { assert.fail("read-only adapter removed storage"); } };
}
function registered(systemId = "linked") {
  return [
    [COMPOSER_INDEX_KEY, serializeComposerIndex({ version: 1, activeProjectId: "project", projectIds: ["project"] })],
    [composerDocumentKey("project"), serializeComposerEnvelope({ version: 1, revision: 1, document: createComposerDocument("project", systemId) }, "project")],
  ];
}
test("empty references are read-only; registered unrelated records permit deletion", () => {
  assert.equal(legacySystemDeletionBlock(null, "target").length > 0, true);
  assert.deepEqual(readLegacyProjectReferences(storage()), { blocked: "", systemIds: [] });
  const local = storage(registered());
  const before = [...local.data];
  const refs = readLegacyProjectReferences(local);
  assert.equal(legacySystemDeletionBlock(refs, "other"), "");
  assert.match(legacySystemDeletionBlock(refs, "linked"), /referenced/);
  assert.doesNotMatch(legacySystemDeletionBlock(refs, "linked"), /rebind|change its system/i);
  assert.deepEqual([...local.data], before);
});
test("malformed, future, missing and orphan records fail closed, even without an index", () => {
  const index = registered()[0];
  const cases = [
    [index, [composerDocumentKey("project"), JSON.stringify({ version: 99, revision: 1, document: createComposerDocument("project", "linked") })]],
    [[COMPOSER_INDEX_KEY, "{"]], [[COMPOSER_INDEX_KEY, '{"version":99}']], [index],
    [index, [composerDocumentKey("project"), "{}"]],
    [[composerDocumentKey("orphan"), registered()[1][1]]],
    [...registered(), [COMPOSER_DOCUMENT_PREFIX, "partial"]],
    [...registered(), [composerDocumentKey("orphan"), "partial"]],
  ];
  for (const entries of cases) assert.ok(legacySystemDeletionBlock(readLegacyProjectReferences(storage(entries)), "unrelated"));
});
test("enumeration/getItem/length failures fail closed and recovery never returns partial data", () => {
  for (const method of ["key", "getItem", "length"]) {
    const local = storage(registered());
    Object.defineProperty(local, method, method === "length" ? { get() { throw new Error("denied"); } } : { value() { throw new Error("denied"); } });
    assert.ok(readLegacyProjectReferences(local).blocked);
    assert.throws(() => captureLocalRecovery(local));
  }
  const local = storage(registered());
  const original = local.getItem;
  local.getItem = key => key.startsWith(COMPOSER_DOCUMENT_PREFIX) ? null : original(key);
  assert.ok(readLegacyProjectReferences(local).blocked);
  assert.throws(() => captureLocalRecovery(local), /disappeared/);
});
test("a later record read failure does not return an earlier partial capture", () => {
  const local = storage([["bambiui.design-system.v1", "preserved"], [LEGACY_PAGE_EDITOR_KEY, "legacy"]]);
  const original = local.getItem;
  local.getItem = key => { if (key === LEGACY_PAGE_EDITOR_KEY) throw new Error("denied after first record"); return original(key); };
  assert.throws(() => captureLocalRecovery(local), /denied after first record/);
  assert.equal(local.data.get("bambiui.design-system.v1"), "preserved");
  assert.equal(local.data.get(LEGACY_PAGE_EDITOR_KEY), "legacy");
});

test("fresh checks observe a Project created during confirmation and preserve all bytes", () => {
  const local = storage();
  assert.equal(legacySystemDeletionBlock(readLegacyProjectReferences(local), "linked"), "");
  for (const [key, value] of registered()) local.data.set(key, value);
  const before = [...local.data];
  assert.ok(legacySystemDeletionBlock(readLegacyProjectReferences(local), "linked"));
  assert.deepEqual([...local.data], before);
});
test("app dialog opens without writing and final accept blocks an existing document rebind with unchanged keys", async () => {
  const local = storage(registered("other"));
  const beforeKeys = [...local.data.keys()];
  const probe = deletionProbe(local);
  probe.openSystemDeletion();
  assert.equal(probe.request.name, "Target");
  assert.equal(probe.checks, 1);
  assert.deepEqual(probe.writes, [], "Opening is never confirmation");
  local.data.set(composerDocumentKey("project"), registered("linked")[1][1]);
  const before = [...local.data];
  const deletion = probe.confirmSystemDeletion();
  await Promise.resolve();
  assert.equal(probe.checks, 1, "Final snapshot runs after the pending event turn");
  await deletion;
  assert.equal(probe.checks, 2);
  assert.match(probe.error, /referenced/);
  assert.ok(probe.request, "Blocked confirmation stays open with its reason");
  assert.deepEqual([...local.data.keys()], beforeKeys);
  assert.deepEqual([...local.data], before);
  assert.deepEqual(probe.writes, []);
  assert.deepEqual(probe.pending, [true, false]);
});
test("unreferenced deletion succeeds; duplicate opens/accepts never replace context or double-write", async () => {
  const probe = deletionProbe(storage(registered("other")));
  probe.openSystemDeletion();
  const request = probe.request;
  probe.openSystemDeletion();
  assert.equal(probe.request, request);
  const first = probe.confirmSystemDeletion();
  await probe.confirmSystemDeletion();
  assert.equal(probe.checks, 1);
  assert.deepEqual(probe.writes, []);
  await first;
  assert.equal(probe.checks, 2);
  assert.equal(probe.writes.length, 1);
  assert.equal(probe.writes[0].activeId, "other");
  assert.deepEqual(probe.writes[0].systems.map(entry => entry.id), ["other"]);
  assert.equal(probe.request, null);
  assert.deepEqual(probe.pending, [true, false]);
  await probe.confirmSystemDeletion();
  assert.equal(probe.writes.length, 1);
});
test("Cancel/Escape close path never deletes; linked precheck never opens confirmation", async () => {
  const cancelled = deletionProbe(storage(registered("other")));
  cancelled.openSystemDeletion();
  cancelled.cancelSystemDeletion();
  await cancelled.confirmSystemDeletion();
  assert.equal(cancelled.checks, 1);
  assert.equal(cancelled.request, null);
  assert.deepEqual(cancelled.writes, []);
  const linked = deletionProbe(storage(registered("linked")));
  linked.openSystemDeletion();
  assert.equal(linked.request, null);
  assert.deepEqual(linked.writes, []);
});
test("pending confirmation aborts on cancel, collection/System changes or Studio unmount", async () => {
  for (const change of ["cancel", "collection", "system", "unmount"]) {
    const probe = deletionProbe(storage(registered("other")));
    probe.openSystemDeletion();
    const deletion = probe.confirmSystemDeletion();
    if (change === "cancel") probe.cancelSystemDeletion();
    if (change === "collection") probe.collectionRef.current = { ...probe.collectionRef.current, activeId: "other" };
    if (change === "system") probe.currentSystem.current = { name: "Changed target" };
    if (change === "unmount") probe.unmount();
    await deletion;
    assert.deepEqual(probe.writes, [], change);
    if (change === "collection" || change === "system") assert.match(probe.error, /System changed/);
    assert.deepEqual(probe.pending, change === "unmount" ? [true] : [true, false], "No state update after unmount");
  }
});
test("final reference read errors fail closed; failed save keeps confirmation open", async () => {
  const local = storage(registered("other"));
  const probe = deletionProbe(local);
  probe.openSystemDeletion();
  local.getItem = () => { throw new Error("unreadable"); };
  await probe.confirmSystemDeletion();
  assert.match(probe.error, /Cannot safely inspect/);
  assert.ok(probe.request);
  assert.deepEqual(probe.writes, []);
  const failedSave = deletionProbe(storage(registered("other")), { save: false });
  failedSave.openSystemDeletion();
  await failedSave.confirmSystemDeletion();
  assert.match(failedSave.error, /saving failed/);
  assert.ok(failedSave.request);
  assert.deepEqual(failedSave.writes, []);
});
test("dialog source contract retains accessible labels, live reason, focus targets and context attributes", () => {
  const dialog = studioSource.slice(studioSource.indexOf('<Dialog.Root open={deletionRequest !== null}'), studioSource.indexOf('<div className={shell.headerSpacer} />'));
  assert.match(dialog, /<Dialog.Title[^>]*>Delete system\?<\/Dialog.Title>/);
  assert.match(dialog, /<Dialog.Description[\s\S]*deletionRequest\?\.name[\s\S]*irreversible[\s\S]*recovery copy/);
  assert.match(dialog, /initialFocus=\{deleteCancelRef\} finalFocus=\{systemSummaryRef\}/);
  assert.match(dialog, /<Dialog.Close ref=\{deleteCancelRef\} render=\{<Button \/>\}>Cancel<\/Dialog.Close>/);
  assert.match(dialog, /onClick=\{confirmSystemDeletion\}>Delete system/);
  assert.match(dialog, /data-system-delete-dialog data-system-id=/);
  assert.match(dialog, /role=\{deletionDialogBlock \|\| deletionError \? "alert" : "status"\}/);
  assert.match(dialog, /if \(!open\) cancelSystemDeletion\(\)/);
  assert.match(dialog, /disabled=\{deletionPending \|\| !!deletionDialogBlock \|\| !!deletionError\}/);
});

test("raw recovery allowlist, deterministic envelope, Unicode, malformed JSON and legacy bytes", () => {
  const included = [
    [COMPOSER_INDEX_KEY, " { broken JSON\n"], [composerDocumentKey("orphan"), "\u0000\n🌿 é \ud800"],
    [LEGACY_PAGE_EDITOR_KEY, "  legacy\r\n"], ["bambiui.systems.v1", "[]"], ["bambiui.design-system.v1", " raw "],
  ];
  const excluded = [["auth.secret", "private"], [COMPOSER_DOCUMENT_PREFIX, "empty suffix"], [COMPOSER_INDEX_KEY + ".other", "not allowed"], [LEGACY_PAGE_EDITOR_KEY + ".other", "not allowed"]];
  for (const [key] of included) assert.equal(isRecoveryKey(key), true);
  for (const [key] of excluded) assert.equal(isRecoveryKey(key), false);
  const local = storage([...included.reverse(), ...excluded]);
  const before = [...local.data];
  assert.deepEqual(JSON.parse(captureLocalRecovery(local)), { format: "bambiui.local-recovery", version: 1, records: included.map(([key, raw]) => ({ key, raw })).sort((a, b) => a.key < b.key ? -1 : 1) });
  assert.deepEqual([...local.data], before);
  assert.throws(() => captureLocalRecovery(storage(excluded)), /No local records/);
});
test("changed observed values or allowlisted key sets reject both reference and recovery snapshots", () => {
  for (const action of ["value", "key"]) {
    for (const capture of [captureLocalRecovery, readLegacyProjectReferences]) {
      const local = storage(registered());
      const original = local.getItem;
      let reads = 0;
      local.getItem = key => {
        const value = original(key);
        reads++;
        if (reads === 2) {
          if (action === "value") local.data.set(COMPOSER_INDEX_KEY, "changed");
          else local.data.set(composerDocumentKey("new"), "orphan");
        }
        return value;
      };
      if (capture === captureLocalRecovery) assert.throws(() => capture(local), /changed/);
      else assert.ok(capture(local).blocked);
    }
  }
});
test("duplicate/vanishing enumeration keys reject capture", () => {
  const local = storage(registered());
  local.key = () => COMPOSER_INDEX_KEY;
  assert.throws(() => captureLocalRecovery(local), /enumeration/);
  local.key = () => null;
  assert.throws(() => captureLocalRecovery(local), /enumeration/);
});
test("record count and combined UTF-8 key/raw byte limits are enforced", () => {
  const many = Array.from({ length: RECOVERY_LIMITS.records + 1 }, (_, i) => [COMPOSER_DOCUMENT_PREFIX + i, ""]);
  assert.throws(() => captureLocalRecovery(storage(many)), /Too many/);
  const key = LEGACY_PAGE_EDITOR_KEY;
  const maximum = "a".repeat(RECOVERY_LIMITS.recordBytes - Buffer.byteLength(key));
  assert.equal(JSON.parse(captureLocalRecovery(storage([[key, maximum]]))).records[0].raw.length, maximum.length);
  assert.throws(() => captureLocalRecovery(storage([[key, maximum + "a"]])), /combined key\/value/);
  assert.throws(() => captureLocalRecovery(storage([[key, "é".repeat(RECOVERY_LIMITS.recordBytes / 2)]])), /combined key\/value/);
  assert.throws(() => captureLocalRecovery(storage([[COMPOSER_DOCUMENT_PREFIX + "x".repeat(RECOVERY_LIMITS.recordBytes), ""]])), /combined key\/value/);
});
test("serialized JSON limit counts escaping before aggregate allocation", () => {
  const raw = "\u0000".repeat(3 * 1024 * 1024);
  const entries = Array.from({ length: 4 }, (_, i) => [COMPOSER_DOCUMENT_PREFIX + i, raw]);
  assert.throws(() => captureLocalRecovery(storage(entries)), /64 MiB/);
});
