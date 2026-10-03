import assert from "node:assert/strict";
import test from "node:test";
import { createComposerDocument, createComposerFrame, createComposerPage } from "./model.ts";
import {
  COMPOSER_INDEX_KEY, COMPOSER_DOCUMENT_PREFIX, COMPOSER_STORAGE_LIMITS,
  composerDocumentKey, serializeComposerEnvelope, deserializeComposerEnvelope,
  serializeComposerIndex, deserializeComposerIndex, readComposerIndex, readComposerProject,
  createStoredComposerProject, saveComposerProject, registerComposerProject, selectComposerProject,
} from "./storage.ts";

import { applyComposerCommand, duplicateComposerProject } from "./commands.ts";
import { createComposerHistory, executeComposerCommands, undoComposer } from "./history.ts";

const doc = (id = "project", system = "missing-system") => createComposerDocument(id, system);
const env = (id = "project", revision = 1) => ({ version: 1, revision, document: doc(id) });
const emptyIndex = () => ({ version: 1, activeProjectId: null, projectIds: [] });
function storage(entries = []) {
  return {
    data: new Map(entries), reads: [], writes: [], removes: [],
    getItem(key) { this.reads.push(key); return this.data.get(key) ?? null; },
    setItem(key, value) { this.writes.push([key, value]); this.data.set(key, value); },
    removeItem(key) { this.removes.push(key); throw new Error("Removal forbidden"); },
  };
}
function created(local = storage(), id = "project") {
  const index = readComposerIndex(local);
  const result = createStoredComposerProject(local, id, doc(id), index.raw);
  assert.equal(result.kind, "registered");
  return { local, result, expected: { raw: result.raw, revision: result.envelope.revision } };
}
function assertNoMutation(local, before) {
  assert.deepEqual([...local.data], before);
  assert.deepEqual(local.writes, []);
  assert.deepEqual(local.removes, []);
}

test("empty mount reads never write; empty collections are independently allocated", () => {
  const local = storage();
  const first = readComposerIndex(local);
  assert.deepEqual(first, { kind: "empty", raw: null, collection: emptyIndex() });
  first.collection.projectIds.push("memory-only");
  assert.deepEqual(readComposerIndex(local).collection, emptyIndex());
  assertNoMutation(local, []);
});

test("creation writes document before index, preserving null active selection", () => {
  const { local, result } = created();
  assert.deepEqual(local.writes.map(([key]) => key), [composerDocumentKey("project"), COMPOSER_INDEX_KEY]);
  assert.equal(result.envelope.revision, 1);
  const index = readComposerIndex(local);
  assert.deepEqual(index.collection, { ...emptyIndex(), projectIds: ["project"] });
  const writes = local.writes.length;
  assert.deepEqual(readComposerProject(local, "project", index.collection).envelope.document, doc());
  assert.equal(local.writes.length, writes);
  assert.deepEqual(local.removes, []);
});

test("project keys validate IDs and are independent of system references and other namespaces", () => {
  for (const id of ["", "../x", "a/b", "a.b", "%", "é", "a".repeat(65), null, 1]) assert.throws(() => composerDocumentKey(id));
  for (const id of ["original", "123e4567-e89b-12d3-a456-426614174000", "Z_9", "a".repeat(64)]) assert.equal(composerDocumentKey(id), COMPOSER_DOCUMENT_PREFIX + encodeURIComponent(id));
  const local = storage([["bambiui.systems.v1", "untouched"], ["bambiui.examples.page-editor.bundle.v1", "old"]]);
  const a = created(local, "a");
  const b = created(local, "b");
  const edited = doc("a", "other-missing-system");
  edited.name = "Renamed";
  const saved = saveComposerProject(local, "a", edited, a.expected, b.result.indexRaw);
  assert.equal(saved.kind, "saved");
  assert.equal(saved.envelope.revision, 2);
  assert.equal(local.data.get(composerDocumentKey("b")), b.result.raw);
  assert.equal(local.data.get(COMPOSER_INDEX_KEY), b.result.indexRaw);
  assert.equal(local.data.get("bambiui.systems.v1"), "untouched");
  assert.equal(local.data.get("bambiui.examples.page-editor.bundle.v1"), "old");
  assert.ok(local.reads.every((key) => key === COMPOSER_INDEX_KEY || key.startsWith(COMPOSER_DOCUMENT_PREFIX)));
});

test("strict envelope requires exactly version/revision/document and matching project ID", () => {
  assert.deepEqual(deserializeComposerEnvelope(serializeComposerEnvelope(env(), "project"), "project"), env());
  for (const value of [null, [], new Date(), { ...env(), extra: true }, { revision: 1, document: doc() }, { ...env(), version: 2 }, ...[0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "1"].map((revision) => env("project", revision))]) {
    assert.throws(() => serializeComposerEnvelope(value, "project"));
  }
  assert.throws(() => serializeComposerEnvelope(env(), "other"), /match/);
  assert.throws(() => deserializeComposerEnvelope(JSON.stringify(env()), "other"), /match/);
  for (const field of ["version", "revision", "document"]) {
    let invoked = false;
    const value = env();
    Object.defineProperty(value, field, { enumerable: true, get() { invoked = true; throw new Error("Getter executed"); } });
    assert.throws(() => serializeComposerEnvelope(value, "project"), /accessors/);
    assert.equal(invoked, false);
  }
  const inherited = Object.create(env());
  assert.throws(() => serializeComposerEnvelope(inherited, "project"));
  const symbol = env(); symbol[Symbol("extra")] = 1;
  assert.throws(() => serializeComposerEnvelope(symbol, "project"));
});

test("strict document and index validation reject accessors without executing them", () => {
  let invoked = false;
  const document = doc();
  Object.defineProperty(document, "name", { enumerable: true, get() { invoked = true; return "Unsafe"; } });
  const local = storage();
  assert.equal(createStoredComposerProject(local, "project", document, null).kind, "blocked");
  const index = emptyIndex();
  Object.defineProperty(index, "projectIds", { enumerable: true, get() { invoked = true; return []; } });
  assert.throws(() => serializeComposerIndex(index), /accessors/);
  const arrayIndex = emptyIndex(); arrayIndex.projectIds = ["project"];
  Object.defineProperty(arrayIndex.projectIds, "0", { enumerable: true, get() { invoked = true; return "project"; } });
  assert.throws(() => serializeComposerIndex(arrayIndex));
  const expected = { raw: "{}", revision: 1 };
  Object.defineProperty(expected, "revision", { enumerable: true, get() { invoked = true; return 1; } });
  assert.equal(saveComposerProject(local, "project", doc(), expected, null).kind, "blocked");
  assert.equal(invoked, false);
  assertNoMutation(local, []);
});

test("corrupt/unsupported index raw is preserved, actionable, and blocks creation", () => {
  for (const raw of ["{", '{"version":2,"activeProjectId":null,"projectIds":[]}', JSON.stringify({ ...emptyIndex(), extra: 1 }), JSON.stringify({ ...emptyIndex(), activeProjectId: "missing" }), JSON.stringify({ ...emptyIndex(), projectIds: ["p", "p"] })]) {
    const local = storage([[COMPOSER_INDEX_KEY, raw]]);
    const result = readComposerIndex(local);
    assert.equal(result.kind, "blocked"); assert.equal(result.raw, raw);
    assert.match(result.message, /preserve stored bytes.*inspect\/reload/);
    assert.equal(createStoredComposerProject(local, "project", doc(), raw).kind, "blocked");
    assertNoMutation(local, [[COMPOSER_INDEX_KEY, raw]]);
  }
});

test("project read requires index registration, preserves corrupt/mismatched data, missing records block", () => {
  const reference = { ...emptyIndex(), projectIds: ["project"] };
  for (const raw of ["{", JSON.stringify(env("other")), JSON.stringify({ ...env(), document: { ...doc(), pages: null } }), JSON.stringify({ ...env(), version: 2 })]) {
    const local = storage([[composerDocumentKey("project"), raw]]);
    const result = readComposerProject(local, "project", reference);
    assert.equal(result.kind, "blocked"); assert.equal(result.raw, raw);
    assertNoMutation(local, [[composerDocumentKey("project"), raw]]);
  }
  const local = storage();
  assert.match(readComposerProject(local, "project", reference).message, /missing/);
  assert.match(readComposerProject(local, "project", emptyIndex()).message, /not registered/);
  assert.equal(readComposerProject(local, "project", { ...reference, activeProjectId: "other" }).kind, "blocked");
  assertNoMutation(local, []);
});

test("UTF-8 read bounds are enforced before parsing with exact byte edges", () => {
  for (const [parse, raw, limit] of [
    [(s) => deserializeComposerEnvelope(s, "project"), JSON.stringify(env()), COMPOSER_STORAGE_LIMITS.documentBytes],
    [deserializeComposerIndex, JSON.stringify(emptyIndex()), COMPOSER_STORAGE_LIMITS.indexBytes],
  ]) {
    const exact = raw + " ".repeat(limit - Buffer.byteLength(raw));
    assert.doesNotThrow(() => parse(exact));
    assert.throws(() => parse(exact + " "), /size limit/);
    const multibyte = '"' + "é".repeat(limit / 2) + '"';
    assert.ok(multibyte.length < limit);
    assert.throws(() => parse(multibyte), /UTF-8 storage size limit/);
    assert.throws(() => parse("é".repeat(limit / 2 + 1)), /size limit/); // Not a JSON syntax error.
  }
  assert.equal(COMPOSER_STORAGE_LIMITS.documentBytes, 5 * 1024 * 1024);
});

test("oversized read results preserve raw with no writes", () => {
  const indexRaw = "é".repeat(COMPOSER_STORAGE_LIMITS.indexBytes / 2 + 1);
  const projectRaw = "é".repeat(COMPOSER_STORAGE_LIMITS.documentBytes / 2 + 1);
  const local = storage([[COMPOSER_INDEX_KEY, indexRaw], [composerDocumentKey("project"), projectRaw]]);
  assert.equal(readComposerIndex(local).raw, indexRaw);
  assert.equal(readComposerProject(local, "project", { ...emptyIndex(), projectIds: ["project"] }).raw, projectRaw);
  assert.equal(local.writes.length, 0);
});

test("serialized UTF-8 document size rejects structurally valid large data without I/O or mutation", () => {
  const document = doc();
  document.pages = Array.from({ length: 20 }, (_, p) => ({ id: `p${p}`, name: "Page", frames: Array.from({ length: 10 }, (_, f) => {
    const frame = createComposerFrame(`f${p}-${f}`, "root");
    frame.root.children = Array.from({ length: 9 }, (_, n) => ({ id: `n${n}`, kind: "text", text: "é".repeat(2000) }));
    return frame;
  }) }));
  const local = storage();
  assert.throws(() => serializeComposerEnvelope({ ...env(), document }, "project"), /size limit/);
  const result = createStoredComposerProject(local, "project", document, null);
  assert.equal(result.kind, "blocked"); assert.match(result.message, /size limit/);
  assert.equal(local.reads.length, 0);
  assert.equal(document.pages[0].frames[0].root.children[0].text.length, 2000);
});

test("index count bound accepts 1000, rejects 1001 and preflights creation", () => {
  const full = { ...emptyIndex(), projectIds: Array.from({ length: COMPOSER_STORAGE_LIMITS.projects }, (_, i) => `p${i}`) };
  const raw = serializeComposerIndex(full);
  assert.deepEqual(deserializeComposerIndex(raw), full);
  assert.throws(() => serializeComposerIndex({ ...full, projectIds: [...full.projectIds, "extra"] }), /count limit/);
  assert.throws(() => deserializeComposerIndex(JSON.stringify({ ...full, projectIds: [...full.projectIds, "extra"] })), /count limit/);
  const local = storage([[COMPOSER_INDEX_KEY, raw]]);
  assert.equal(createStoredComposerProject(local, "project", doc(), raw).kind, "blocked");
  assertNoMutation(local, [[COMPOSER_INDEX_KEY, raw]]);
});

test("save compares exact observed raw and revision and never mutates caller state", () => {
  const { local, result, expected } = created();
  const document = doc(); document.name = "In-memory edits";
  const before = structuredClone(document);
  for (const invalid of [{ ...expected, revision: 2 }, { ...expected, raw: "corrupt" }]) assert.equal(saveComposerProject(local, "project", document, invalid, result.indexRaw).kind, "blocked");
  assert.equal(saveComposerProject(local, "other", document, expected, result.indexRaw).kind, "blocked");
  const saved = saveComposerProject(local, "project", document, expected, result.indexRaw);
  assert.equal(saved.kind, "saved"); assert.equal(saved.envelope.revision, 2);
  assert.equal(saveComposerProject(local, "project", document, expected, result.indexRaw).code, "conflict");
  assert.deepEqual(document, before);
  saved.envelope.document.name = "Detached";
  assert.equal(document.name, "In-memory edits");
});

test("equivalent JSON with changed raw, changed index, corrupt current bytes all block save", () => {
  for (const change of ["whitespace", "index", "corrupt"]) {
    const { local, result, expected } = created();
    local.writes = [];
    if (change === "whitespace") local.data.set(composerDocumentKey("project"), expected.raw + " ");
    if (change === "corrupt") local.data.set(composerDocumentKey("project"), "{");
    if (change === "index") local.data.set(COMPOSER_INDEX_KEY, result.indexRaw + " ");
    const before = [...local.data];
    assert.equal(saveComposerProject(local, "project", doc(), expected, result.indexRaw).code, "conflict");
    assertNoMutation(local, before);
  }
});

test("registered creation and existing orphan creation never overwrite", () => {
  const { local, result } = created(); local.writes = [];
  assert.match(createStoredComposerProject(local, "project", doc(), result.indexRaw).message, /already registered/);
  assert.equal(local.writes.length, 0);
  const orphan = storage([[composerDocumentKey("project"), "corrupt orphan"]]);
  assert.match(createStoredComposerProject(orphan, "project", doc(), null).message, /orphan/);
  assertNoMutation(orphan, [[composerDocumentKey("project"), "corrupt orphan"]]);
  assert.equal(createStoredComposerProject(storage(), "wrong", doc(), null).kind, "blocked");
});

test("access failures return blocked on reads, create, save, and registration", () => {
  const local = storage(); local.getItem = () => { throw new Error("Access denied"); };
  for (const result of [readComposerIndex(local), readComposerProject(local, "project", { ...emptyIndex(), projectIds: ["project"] }), createStoredComposerProject(local, "project", doc(), null), saveComposerProject(local, "project", doc(), { raw: JSON.stringify(env()), revision: 1 }, null), registerComposerProject(local, "project", { raw: JSON.stringify(env()), revision: 1 }, null)]) {
    assert.equal(result.kind, "blocked"); assert.equal(result.code, "io"); assert.match(result.message, /Access denied/);
  }
  assertNoMutation(local, []);
});

test("document quota failure leaves index unchanged and in-memory edits independent", () => {
  const local = storage(); local.setItem = () => { throw new Error("Quota exceeded"); };
  assert.equal(createStoredComposerProject(local, "project", doc(), null).kind, "blocked");
  assertNoMutation(local, []);
  const saved = created(); saved.local.writes = [];
  const before = [...saved.local.data];
  const document = doc(); document.name = "Keep these edits";
  saved.local.setItem = () => { throw new Error("Quota exceeded"); };
  const result = saveComposerProject(saved.local, "project", document, saved.expected, saved.result.indexRaw);
  assert.equal(result.kind, "blocked"); assert.equal(result.code, "io");
  assert.equal(result.raw, saved.expected.raw);
  assert.equal(document.name, "Keep these edits");
  assertNoMutation(saved.local, before);
});

test("index quota failure preserves orphan evidence; explicit retry writes only the index", () => {
  const local = storage();
  const set = local.setItem;
  local.setItem = function (key, value) { if (key === COMPOSER_INDEX_KEY) throw new Error("Index quota exceeded"); set.call(this, key, value); };
  const result = createStoredComposerProject(local, "project", doc(), null);
  assert.equal(result.kind, "partial"); assert.equal(result.failure.code, "io");
  assert.match(result.message, /not a completed save/);
  assert.equal(local.data.get(composerDocumentKey("project")), result.evidence.raw);
  assert.equal(local.data.has(COMPOSER_INDEX_KEY), false);
  assert.equal(createStoredComposerProject(local, "project", doc(), null).kind, "blocked");
  local.setItem = set;
  const retried = registerComposerProject(local, "project", { raw: result.evidence.raw, revision: result.evidence.revision }, null);
  assert.equal(retried.kind, "registered");
  assert.deepEqual(local.writes.map(([key]) => key), [composerDocumentKey("project"), COMPOSER_INDEX_KEY]);
  assert.equal(registerComposerProject(local, "project", { raw: result.evidence.raw, revision: 1 }, retried.indexRaw).code, "conflict");
  assert.equal(local.removes.length, 0);
});

test("index change after document write returns partial; retry requires freshly observed index", () => {
  const local = storage(); const set = local.setItem;
  const changed = serializeComposerIndex({ ...emptyIndex(), projectIds: ["other"], activeProjectId: "other" });
  local.setItem = function (key, value) { set.call(this, key, value); if (key === composerDocumentKey("project")) this.data.set(COMPOSER_INDEX_KEY, changed); };
  const result = createStoredComposerProject(local, "project", doc(), null);
  assert.equal(result.kind, "partial"); assert.equal(result.failure.code, "conflict");
  assert.equal(local.data.get(COMPOSER_INDEX_KEY), changed);
  const expected = { raw: result.evidence.raw, revision: result.evidence.revision };
  assert.equal(registerComposerProject(local, "project", expected, null).kind, "blocked");
  const registered = registerComposerProject(local, "project", expected, changed);
  assert.equal(registered.kind, "registered");
  assert.deepEqual(deserializeComposerIndex(registered.indexRaw), { version: 1, activeProjectId: "other", projectIds: ["other", "project"] });
});

test("registration recheck detects intervening index/project changes without cleanup", () => {
  for (const target of ["index", "project", "access"]) {
    const raw = serializeComposerEnvelope(env(), "project");
    const local = storage([[composerDocumentKey("project"), raw]]);
    const get = local.getItem; let calls = 0;
    local.getItem = function (key) {
      calls++;
      if (calls === 3 && target === "index") this.data.set(COMPOSER_INDEX_KEY, serializeComposerIndex({ ...emptyIndex(), projectIds: ["other"] }));
      if (calls === 4 && target === "project") this.data.set(composerDocumentKey("project"), raw + " ");
      if (calls === 4 && target === "access") throw new Error("Access denied on recheck");
      return get.call(this, key);
    };
    const result = registerComposerProject(local, "project", { raw, revision: 1 }, null);
    assert.equal(result.kind, "blocked");
    assert.equal(result.code, target === "access" ? "io" : "conflict");
    assert.equal(local.writes.length, 0); assert.equal(local.removes.length, 0);
  }
});

test("post-document index corruption/access failure is partial, never a completed save", () => {
  for (const target of ["corrupt", "access"]) {
    const local = storage(); const set = local.setItem; const get = local.getItem;
    let documentWritten = false;
    local.setItem = function (key, value) {
      set.call(this, key, value);
      if (key === composerDocumentKey("project")) {
        documentWritten = true;
        if (target === "corrupt") this.data.set(COMPOSER_INDEX_KEY, "corrupt index");
      }
    };
    local.getItem = function (key) {
      if (documentWritten && key === COMPOSER_INDEX_KEY && target === "access") throw new Error("Index access denied");
      return get.call(this, key);
    };
    const result = createStoredComposerProject(local, "project", doc(), null);
    assert.equal(result.kind, "partial");
    assert.equal(result.failure.code, target === "corrupt" ? "invalid" : "io");
    assert.equal(local.data.get(composerDocumentKey("project")), result.evidence.raw);
    assert.equal(local.writes.length, 1);
    assert.equal(local.removes.length, 0);
    if (target === "corrupt") assert.equal(result.failure.raw, "corrupt index");
  }
});

test("registration rejects mismatched evidence, malformed orphan and stale creation index", () => {
  const raw = serializeComposerEnvelope(env(), "project");
  const local = storage([[composerDocumentKey("project"), raw]]);
  for (const [id, expected] of [["other", { raw, revision: 1 }], ["project", { raw, revision: 2 }], ["project", { raw: "{", revision: 1 }]]) {
    assert.equal(registerComposerProject(local, id, expected, null).kind, "blocked");
  }
  assertNoMutation(local, [[composerDocumentKey("project"), raw]]);
  const indexRaw = serializeComposerIndex(emptyIndex());
  const changed = storage([[COMPOSER_INDEX_KEY, indexRaw]]);
  assert.equal(createStoredComposerProject(changed, "project", doc(), null).code, "conflict");
  assertNoMutation(changed, [[COMPOSER_INDEX_KEY, indexRaw]]);
});

test("invalid save data is rejected before I/O and preserves both copies", () => {
  const { local, result, expected } = created();
  local.writes = []; local.reads = [];
  const before = [...local.data];
  const document = { ...doc(), pages: null };
  const blocked = saveComposerProject(local, "project", document, expected, result.indexRaw);
  assert.equal(blocked.kind, "blocked"); assert.equal(blocked.stage, "validation");
  assert.equal(document.pages, null);
  assert.equal(local.reads.length, 0);
  assertNoMutation(local, before);
});

test("save requires registered index, explicit expectations, and bounded revision", () => {
  const raw = serializeComposerEnvelope(env(), "project");
  const orphan = storage([[composerDocumentKey("project"), raw]]);
  assert.match(saveComposerProject(orphan, "project", doc(), { raw, revision: 1 }, null).message, /not registered/);
  assert.equal(createStoredComposerProject(storage(), "project", doc(), undefined).kind, "blocked");
  const { local, result } = created(); local.writes = [];
  const maxRaw = serializeComposerEnvelope(env("project", Number.MAX_SAFE_INTEGER), "project");
  local.data.set(composerDocumentKey("project"), maxRaw);
  assert.equal(saveComposerProject(local, "project", doc(), { raw: maxRaw, revision: Number.MAX_SAFE_INTEGER }, result.indexRaw).kind, "blocked");
  assert.equal(local.writes.length, 0);
});

const selectObserved = (local, id) => {
  const index = readComposerIndex(local);
  return selectComposerProject(local, id, index.collection, index.raw);
};

test("selection writes only the index, supports null, and preserves documents and caller collection", () => {
  const { local, result } = created();
  const index = readComposerIndex(local); const before = structuredClone(index.collection);
  local.writes = [];
  const selected = selectComposerProject(local, "project", index.collection, result.indexRaw);
  assert.equal(selected.kind, "selected"); assert.equal(selected.collection.activeProjectId, "project");
  assert.deepEqual(index.collection, before);
  assert.deepEqual(local.writes, [[COMPOSER_INDEX_KEY, selected.raw]]);
  assert.equal(local.data.get(composerDocumentKey("project")), result.raw);
  const cleared = selectObserved(local, null);
  assert.equal(cleared.kind, "selected"); assert.equal(cleared.collection.activeProjectId, null);
  assert.equal(local.data.get(composerDocumentKey("project")), result.raw);
  assert.deepEqual(local.removes, []);
});

test("selection no-ops preserve absent and noncanonical index bytes without writes", () => {
  const absent = storage();
  assert.deepEqual(selectObserved(absent, null), { kind: "unchanged", raw: null, collection: emptyIndex() });
  assertNoMutation(absent, []);
  for (const activeProjectId of [null, "project"]) {
    const raw = JSON.stringify({ projectIds: ["project"], activeProjectId, version: 1 }, null, 2) + "\n";
    const documentRaw = serializeComposerEnvelope(env(), "project");
    const local = storage([[COMPOSER_INDEX_KEY, raw], [composerDocumentKey("project"), documentRaw]]);
    assert.equal(selectObserved(local, activeProjectId).kind, "unchanged");
    assertNoMutation(local, [[COMPOSER_INDEX_KEY, raw], [composerDocumentKey("project"), documentRaw]]);
  }
});

test("selection rejects unregistered targets, invalid collections and mismatching supplied references", () => {
  const { local, result } = created(); local.writes = [];
  const reference = readComposerIndex(local).collection; const before = [...local.data];
  for (const [target, supplied] of [["missing", reference], [undefined, reference], ["bad id", reference],
    [null, { ...reference, extra: true }], [null, { ...reference, projectIds: ["project", "project"] }]]) {
    const blocked = selectComposerProject(local, target, supplied, result.indexRaw);
    assert.equal(blocked.kind, "blocked"); assert.equal(blocked.stage, "validation"); assert.equal(blocked.code, "invalid");
  }
  const mismatch = selectComposerProject(local, null, emptyIndex(), result.indexRaw);
  assert.equal(mismatch.kind, "blocked"); assert.equal(mismatch.stage, "index"); assert.equal(mismatch.code, "conflict");
  let invoked = false;
  const accessor = { ...reference };
  Object.defineProperty(accessor, "projectIds", { enumerable: true, get() { invoked = true; return []; } });
  assert.equal(selectComposerProject(local, null, accessor, result.indexRaw).kind, "blocked");
  assert.equal(invoked, false);
  assertNoMutation(local, before);
});

test("selection validates registered documents even for already-active no-ops; null can deselect broken targets", () => {
  for (const activeProjectId of [null, "project"]) for (const raw of [null, "{", JSON.stringify(env("other")), JSON.stringify({ ...env(), version: 2 })]) {
    const reference = { ...emptyIndex(), activeProjectId, projectIds: ["project"] };
    const indexRaw = serializeComposerIndex(reference);
    const entries = [[COMPOSER_INDEX_KEY, indexRaw]];
    if (raw !== null) entries.push([composerDocumentKey("project"), raw]);
    const local = storage(entries);
    const blocked = selectComposerProject(local, "project", reference, indexRaw);
    assert.equal(blocked.kind, "blocked"); assert.equal(blocked.stage, "document");
    assert.equal(blocked.code, "invalid"); assert.equal(blocked.raw, raw);
    assertNoMutation(local, entries);
    assert.equal(selectComposerProject(local, null, reference, indexRaw).kind, activeProjectId === null ? "unchanged" : "selected");
    assert.equal(local.data.get(composerDocumentKey("project")) ?? null, raw);
  }
});

test("stale expected bytes block selection and no-ops without overwrite or normalization", () => {
  const { local, result } = created(); local.writes = [];
  const reference = readComposerIndex(local).collection;
  const changed = result.indexRaw + " "; local.data.set(COMPOSER_INDEX_KEY, changed);
  const before = [...local.data];
  for (const target of [null, "project"]) {
    const blocked = selectComposerProject(local, target, reference, result.indexRaw);
    assert.equal(blocked.kind, "blocked"); assert.equal(blocked.code, "conflict"); assert.equal(blocked.raw, changed);
  }
  assert.equal(selectComposerProject(local, null, reference, undefined).stage, "validation");
  assertNoMutation(local, before);
});

test("selection preserves corrupt index bytes and reports index read/write access or quota failures", () => {
  const reference = { ...emptyIndex(), projectIds: ["project"] };
  for (const raw of ["{", JSON.stringify({ ...reference, version: 2 })]) {
    const local = storage([[COMPOSER_INDEX_KEY, raw]]);
    const blocked = selectComposerProject(local, "project", reference, raw);
    assert.equal(blocked.kind, "blocked"); assert.equal(blocked.stage, "index"); assert.equal(blocked.code, "invalid"); assert.equal(blocked.raw, raw);
    assertNoMutation(local, [[COMPOSER_INDEX_KEY, raw]]);
  }
  const denied = storage(); denied.getItem = () => { throw new Error("Denied"); };
  assert.equal(selectComposerProject(denied, null, emptyIndex(), null).code, "io");
  const { local, result } = created(); local.writes = []; const before = [...local.data];
  local.setItem = () => { throw new Error("Quota exceeded"); };
  const blocked = selectObserved(local, "project");
  assert.equal(blocked.kind, "blocked"); assert.equal(blocked.stage, "index"); assert.equal(blocked.code, "io"); assert.equal(blocked.raw, result.indexRaw);
  assertNoMutation(local, before);
  const get = local.getItem;
  local.getItem = function (key) { if (key === composerDocumentKey("project")) throw new Error("Document denied"); return get.call(this, key); };
  const documentBlocked = selectObserved(local, "project");
  assert.equal(documentBlocked.stage, "document"); assert.equal(documentBlocked.code, "io");
  assertNoMutation(local, before);
});

test("selection rechecks detect intervening index/document changes, corruption and access failures", () => {
  for (const target of ["index", "corrupt-index", "index-io", "document", "missing-document", "document-io"]) {
    const { local, result } = created(); local.writes = [];
    const reference = readComposerIndex(local).collection;
    const get = local.getItem; let calls = 0;
    local.getItem = function (key) {
      calls++;
      if (calls === 3 && target === "index") this.data.set(COMPOSER_INDEX_KEY, result.indexRaw + " ");
      if (calls === 3 && target === "corrupt-index") this.data.set(COMPOSER_INDEX_KEY, "{");
      if (calls === 3 && target === "index-io") throw new Error("Index denied");
      if (calls === 4 && target === "document") this.data.set(composerDocumentKey("project"), result.raw + " ");
      if (calls === 4 && target === "missing-document") this.data.delete(composerDocumentKey("project"));
      if (calls === 4 && target === "document-io") throw new Error("Document denied");
      return get.call(this, key);
    };
    const blocked = selectComposerProject(local, "project", reference, result.indexRaw);
    assert.equal(blocked.kind, "blocked");
    assert.equal(blocked.code, target.endsWith("io") ? "io" : target === "corrupt-index" ? "invalid" : "conflict");
    assert.equal(blocked.stage, target.includes("index") ? "index" : "document");
    if (target === "document") assert.equal(blocked.raw, result.raw + " ");
    if (target === "missing-document") assert.equal(blocked.raw, null);
    assert.deepEqual(local.writes, []); assert.deepEqual(local.removes, []);
  }
});

test("create/select/save/duplicate/register/switch isolates project histories, references and system tokens", () => {
  const catalog = [{ id: "original", system: { marker: "original tokens" } }, { id: "other", system: { marker: "other tokens" } }];
  const catalogBefore = structuredClone(catalog);
  const systemRaw = JSON.stringify(catalog);
  const local = storage([["bambiui.systems.v1", systemRaw]]);
  const source = doc("source", "original");
  const page = createComposerPage("page"); const frame = createComposerFrame("frame", "root");
  frame.root.children.push({ id: "text", kind: "text", text: "Source" }); page.frames.push(frame); source.pages.push(page);
  const created = createStoredComposerProject(local, "source", source, null);
  assert.equal(created.kind, "registered"); assert.equal(readComposerIndex(local).collection.activeProjectId, null);
  const selected = selectObserved(local, "source"); assert.equal(selected.kind, "selected");
  const sourceHistory = executeComposerCommands(createComposerHistory(source), [{ type: "renameProject", name: "Edited source" }]);
  const historyBefore = structuredClone(sourceHistory);
  const saved = saveComposerProject(local, "source", sourceHistory.present, { raw: created.raw, revision: 1 }, selected.raw);
  assert.equal(saved.kind, "saved"); assert.equal(saved.envelope.revision, 2);
  const copy = duplicateComposerProject(sourceHistory.present, "copy", "Copy", { page: { pageId: "copy-page", frames: {
    frame: { frameId: "copy-frame", nodeIds: { root: "copy-root", text: "copy-text" } },
  } } });
  assert.deepEqual(readComposerIndex(local).collection.projectIds, ["source"]);
  assert.equal(local.data.has(composerDocumentKey("copy")), false);
  const registered = createStoredComposerProject(local, "copy", copy, saved.indexRaw);
  assert.equal(registered.kind, "registered"); assert.equal(readComposerIndex(local).collection.activeProjectId, "source");
  assert.equal(local.data.get(composerDocumentKey("source")), saved.raw);
  const switched = selectObserved(local, "copy"); assert.equal(switched.kind, "selected");
  const opened = createComposerHistory(readComposerProject(local, "copy", switched.collection).envelope.document);
  assert.deepEqual(opened.past, []); assert.deepEqual(opened.future, []);
  const rebound = executeComposerCommands(opened, [{ type: "changeProjectSystem", systemId: "other" }], catalog);
  const copySaved = saveComposerProject(local, "copy", rebound.present, { raw: registered.raw, revision: 1 }, switched.raw);
  assert.equal(copySaved.kind, "saved"); assert.equal(copySaved.envelope.document.systemId, "other");
  assert.equal(undoComposer(rebound, catalog).present.systemId, "original");
  const back = selectObserved(local, "source"); assert.equal(back.kind, "selected");
  assert.deepEqual(readComposerProject(local, "source", back.collection).envelope.document, sourceHistory.present);
  assert.deepEqual(sourceHistory, historyBefore); assert.deepEqual(catalog, catalogBefore);
  assert.equal(local.data.get("bambiui.systems.v1"), systemRaw);
  assert.equal(local.data.get(composerDocumentKey("source")), saved.raw);
  assert.deepEqual(local.removes, []);
  // Editing a copy is independent of the detached source document, not token editing.
  const renamed = applyComposerCommand(copy, { type: "renameProject", name: "Another copy name" });
  assert.equal(renamed.systemId, "original"); assert.equal(source.name, "Untitled project");
});
