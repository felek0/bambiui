import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parsePageDocument } from "../page-document/model.ts";
import {
  COMPOSER_LIMITS, COMPOSER_PRESETS, createComposerDocument, createComposerPage,
  createComposerFrame, parseComposerDocument, parseComposerPage, parseComposerFrame,
  parseProjectCollection, resolveComposerSystem, validateComposerSystemReference,
  composerFrameToPageDocument, pageDocumentToComposerPage,
} from "./model.ts";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const fixture = () => {
  const doc = createComposerDocument("project", "original");
  const page = createComposerPage("page");
  page.frames.push(createComposerFrame("frame", "root"));
  doc.pages.push(page);
  return doc;
};
const frame = (doc) => doc.pages[0].frames[0];
const text = (id) => ({ id, kind: "text", text: "Text" });
const wideRoot = (nodes) => ({ id: "root", kind: "container", children: Array.from({ length: nodes - 1 }, (_, i) => text(`text-${i}`)) });
const levels = [
  { get: (doc) => doc, parse: parseComposerDocument },
  { get: (doc) => doc.pages[0], parse: parseComposerPage },
  { get: frame, parse: parseComposerFrame },
];
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test("factories have deterministic defaults and caller-supplied IDs", () => {
  assert.deepEqual(createComposerDocument(uuid, uuid), { version: 1, id: uuid, name: "Untitled project", systemId: uuid, pages: [] });
  assert.deepEqual(createComposerPage(uuid), { id: uuid, name: "Untitled page", frames: [] });
  for (const preset of ["web", "tablet", "mobile", "custom"]) {
    assert.deepEqual(createComposerFrame(uuid, "root", preset), {
      id: uuid, name: "Untitled frame", preset, x: 0, y: 0, ...COMPOSER_PRESETS[preset],
      root: { id: "root", kind: "container", props: { maxWidth: "full" }, children: [] },
    });
  }
  assert.equal(createComposerDocument("p", "original", "Project").name, "Project");
  assert.equal(createComposerPage("p", "Page").name, "Page");
  assert.equal(createComposerFrame("f", "r", "mobile", "Phone").name, "Phone");
  assert.throws(() => createComposerFrame("f", "r", "unknown"));
  assert.throws(() => createComposerFrame("f", uuid)); // Old node ID rules are unchanged.
});

test("factory arrays, roots, children and parsed props are independent", () => {
  const first = fixture();
  const second = fixture();
  frame(first).root.children.push(text("child"));
  assert.deepEqual(frame(second).root.children, []);
  first.pages.push(createComposerPage("extra"));
  assert.equal(second.pages.length, 1);
  frame(first).root.props = { maxWidth: "narrow" };
  const parsed = parseComposerDocument(first);
  frame(parsed).root.props.maxWidth = "wide";
  frame(parsed).root.children[0].text = "Changed";
  parsed.pages[0].name = "Changed";
  assert.equal(frame(first).root.props.maxWidth, "narrow");
  assert.equal(frame(first).root.children[0].text, "Text");
  assert.equal(first.pages[0].name, "Untitled page");
});

test("multi-page independent frame document round trips through JSON without mutation", () => {
  const doc = fixture();
  doc.pages[0].frames.push(createComposerFrame("mobile", "root", "mobile"));
  doc.pages.push({ id: "second", name: "Second", frames: [createComposerFrame("tablet", "root", "tablet")] });
  frame(doc).root.children.push(text("web-only"));
  const before = structuredClone(doc);
  const parsed = parseComposerDocument(freeze(doc));
  assert.deepEqual(parsed, before);
  assert.deepEqual(parseComposerDocument(JSON.parse(JSON.stringify(parsed))), before);
  assert.deepEqual(parsed.pages[0].frames[1].root.children, []);
  assert.notEqual(parsed.pages[0].frames[0].root, parsed.pages[0].frames[1].root);
});

test("every structural field is required and unknown fields are rejected at each level", () => {
  for (const { get, parse } of levels) {
    for (const key of Object.keys(get(fixture()))) {
      const value = get(fixture()); delete value[key];
      assert.throws(() => parse(value), /missing/);
    }
    for (const key of ["extra", "designSystem", "selection", "camera"]) {
      const value = get(fixture()); value[key] = {};
      assert.throws(() => parse(value), /unknown key/);
    }
  }
  for (const version of [0, 2, "1", null]) {
    const doc = fixture(); doc.version = version;
    assert.throws(() => parseComposerDocument(doc), /version/);
  }
});

test("rejects malformed objects, nulls and arrays at every structural level", () => {
  for (const { parse } of levels) for (const value of [null, [], 1, "document", true, new Date()]) assert.throws(() => parse(value));
  for (const mutate of [
    (d) => { d.pages = null; }, (d) => { d.pages = {}; }, (d) => { d.pages = [null]; },
    (d) => { d.pages[0].frames = null; }, (d) => { d.pages[0].frames = {}; },
    (d) => { d.pages[0].frames = [null]; }, (d) => { frame(d).root = null; },
    (d) => { frame(d).root = []; }, (d) => { frame(d).root.children = null; },
    (d) => { frame(d).root.props = null; }, (d) => { frame(d).root.props = []; },
  ]) { const doc = fixture(); mutate(doc); assert.throws(() => parseComposerDocument(doc)); }
});

test("own-key and prototype checks reject inherited fields, symbols, accessors and sparse arrays", () => {
  for (const { get, parse } of levels) {
    const raw = get(fixture());
    assert.throws(() => parse(Object.create(raw)), /plain object/);
    const inherited = { ...raw }; delete inherited.id; Object.setPrototypeOf(inherited, { id: raw.id });
    assert.throws(() => parse(inherited));
    const nullPrototype = Object.assign(Object.create(null), raw);
    assert.deepEqual(parse(nullPrototype), raw);
    for (const key of [Symbol("extra"), "extra"]) {
      const hidden = { ...raw }; Object.defineProperty(hidden, key, { value: 1 });
      assert.throws(() => parse(hidden), /data fields/);
    }
    const accessor = { ...raw };
    Object.defineProperty(accessor, "name", { enumerable: true, get() { assert.fail("getter must not run"); } });
    assert.throws(() => parse(accessor), /data fields/);
  }
  for (const mutate of [
    (d) => { frame(d).root = Object.create(frame(d).root); },
    (d) => { frame(d).root.props = Object.create({ padding: "md" }); },
    (d) => { frame(d).root.children = new Array(1); },
    (d) => { d.pages = new Array(1); },
    (d) => { d.pages.extra = 1; },
    (d) => { Object.setPrototypeOf(d.pages, null); },
    (d) => { Object.defineProperty(frame(d).root.children, "0", { enumerable: true, get() { assert.fail("getter must not run"); } }); },
  ]) { const doc = fixture(); mutate(doc); assert.throws(() => parseComposerDocument(doc)); }
  const polluted = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => parseComposerDocument({ ...fixture(), ...polluted }), /unknown key/);
  assert.equal(Object.prototype.polluted, undefined);
});

test("names enforce nonblank strings and exact 120-character boundary without trimming", () => {
  for (const { get, parse } of levels) {
    const value = get(fixture()); value.name = "n".repeat(120);
    assert.equal(parse(value).name, value.name);
    for (const invalid of ["n".repeat(121), "", " \n ", null, 3, []]) {
      value.name = invalid; assert.throws(() => parse(value), /name/);
    }
    value.name = " Name "; assert.equal(parse(value).name, " Name ");
  }
});

test("IDs support UUIDs, numeric starts and original with exact length bounds", () => {
  for (const { get, parse } of levels) {
    const value = get(fixture());
    for (const id of [uuid, "original", "1project", "a".repeat(64)]) { value.id = id; assert.equal(parse(value).id, id); }
    for (const id of ["", " a", "-a", "a/b", "a".repeat(65), null, 1]) { value.id = id; assert.throws(() => parse(value), /id/); }
  }
  for (const id of [uuid, "original", "1system", "a".repeat(64)]) assert.equal(createComposerDocument("p", id).systemId, id);
  for (const id of ["", null, "a".repeat(65), "../system"]) assert.throws(() => createComposerDocument("p", id));
});

test("geometry is finite, bounded, positive for dimensions and permits fractional values", () => {
  for (const key of ["x", "y", "width", "height"]) {
    for (const invalid of [NaN, Infinity, -Infinity, null, "10", true]) {
      const value = createComposerFrame("f", "root", "custom"); value[key] = invalid;
      assert.throws(() => parseComposerFrame(value), /geometry/);
    }
  }
  for (const key of ["width", "height"]) {
    for (const valid of [1, 1.5, 10000]) { const value = createComposerFrame("f", "r", "custom"); value[key] = valid; assert.equal(parseComposerFrame(value)[key], valid); }
    for (const invalid of [-1, 0, 0.5, 10000.1]) { const value = createComposerFrame("f", "r", "custom"); value[key] = invalid; assert.throws(() => parseComposerFrame(value)); }
  }
  for (const key of ["x", "y"]) {
    for (const valid of [-100000, -0.5, 0, 0.5, 100000]) { const value = createComposerFrame("f", "r"); value[key] = valid; assert.equal(parseComposerFrame(value)[key], valid); }
    for (const invalid of [-100000.1, 100000.1]) { const value = createComposerFrame("f", "r"); value[key] = invalid; assert.throws(() => parseComposerFrame(value)); }
  }
});

test("preset labels require canonical geometry; arbitrary geometry explicitly uses custom", () => {
  for (const invalid of [null, 1, "desktop", "WEB", "toString", "__proto__"]) {
    const value = frame(fixture()); value.preset = invalid;
    assert.throws(() => parseComposerFrame(value), /preset/);
  }
  for (const preset of ["web", "tablet", "mobile"]) for (const key of ["width", "height"]) {
    const value = createComposerFrame("f", "r", preset); value[key] += 1;
    assert.throws(() => parseComposerFrame(value), /preset dimensions mismatch/);
    value.preset = "custom";
    assert.equal(parseComposerFrame(value)[key], value[key]);
  }
});

test("duplicate scopes: pages per project, frames across project, nodes per frame", () => {
  const doc = fixture(); doc.pages.push(structuredClone(doc.pages[0]));
  assert.throws(() => parseComposerDocument(doc), /duplicate id/);
  doc.pages[1].id = "second";
  assert.throws(() => parseComposerDocument(doc), /duplicate id/); // Cross-page frame collision.
  doc.pages[1].frames[0].id = "second-frame";
  assert.doesNotThrow(() => parseComposerDocument(doc)); // Repeated root ID across frames is allowed.
  doc.pages[0].frames.push(structuredClone(frame(doc)));
  assert.throws(() => parseComposerPage(doc.pages[0]), /duplicate id/);
  doc.pages[0].frames.pop();
  frame(doc).root.children.push(text("root"));
  assert.throws(() => parseComposerDocument(doc), /duplicate id/);
  assert.doesNotThrow(() => parseComposerDocument(fixture())); // Other project may reuse all nested IDs.
  const sameNamespaces = fixture(); sameNamespaces.id = "root"; sameNamespaces.pages[0].id = "root"; frame(sameNamespaces).id = "root";
  assert.doesNotThrow(() => parseComposerDocument(sameNamespaces));
});

test("20 pages and 10 frames per page accepted; next entries rejected", () => {
  const doc = fixture();
  doc.pages = Array.from({ length: COMPOSER_LIMITS.pages }, (_, i) => ({
    id: `page-${i}`, name: "Page", frames: Array.from({ length: COMPOSER_LIMITS.framesPerPage }, (_, j) => createComposerFrame(`frame-${i}-${j}`, "root")),
  }));
  assert.equal(parseComposerDocument(doc).pages.length, 20);
  doc.pages.push(createComposerPage("overflow"));
  assert.throws(() => parseComposerDocument(doc), /limit/);
  doc.pages.pop(); doc.pages[0].frames.push(createComposerFrame("overflow", "root"));
  assert.throws(() => parseComposerDocument(doc), /limit/);
});

test("100 nodes per frame accepted, 101 rejected including through adapter", () => {
  const value = frame(fixture()); value.root = wideRoot(100);
  assert.equal(parseComposerFrame(value).root.children.length, 99);
  assert.doesNotThrow(() => composerFrameToPageDocument(value));
  value.root.children.push(text("overflow"));
  assert.throws(() => parseComposerFrame(value), /limit/);
  assert.throws(() => composerFrameToPageDocument(value), /limit/);
});

test("root-relative depth 12 accepted, depth 13 rejected, cycles bounded", () => {
  function nested(depth) {
    let node = text("leaf");
    for (let i = 1; i < depth; i++) node = { id: `stack-${i}`, kind: "stack", children: [node] };
    return { id: "root", kind: "container", children: [node] };
  }
  const value = frame(fixture()); value.root = nested(12);
  assert.doesNotThrow(() => parseComposerFrame(value));
  value.root = nested(13); assert.throws(() => parseComposerFrame(value), /limit/);
  value.root.children = [value.root]; assert.throws(() => parseComposerFrame(value), /limit/);
});

test("2000 total nodes accepted and 2001 rejected independently of frame quotas", () => {
  const doc = fixture();
  doc.pages = Array.from({ length: 2 }, (_, i) => ({ id: `p-${i}`, name: "Page", frames: Array.from({ length: 10 }, (_, j) => ({ ...createComposerFrame(`f-${i}-${j}`, "root"), root: wideRoot(100) })) }));
  assert.doesNotThrow(() => parseComposerDocument(doc));
  doc.pages.push({ id: "overflow", name: "Overflow", frames: [createComposerFrame("extra", "root")] });
  assert.throws(() => parseComposerDocument(doc), /project: node limit/);
});

test("existing root slot/prop/text rules and explicit empty container remain authoritative", () => {
  assert.doesNotThrow(() => parseComposerDocument(fixture()));
  for (const mutate of [
    (r) => { delete r.children; }, (r) => { r.extra = 1; },
    (r) => { r.kind = "stack"; }, (r) => { r.props = { style: "red" }; },
    (r) => { r.children = [{ id: "b", kind: "button", text: "Button" }]; },
    (r) => { r.children = [{ id: "t", kind: "text", text: "" }]; },
    (r) => { r.children = [{ id: "grid", kind: "grid", children: [text("bad-slot")] }]; },
  ]) { const doc = fixture(); mutate(frame(doc).root); assert.throws(() => parseComposerDocument(doc)); }
});

test("strict collection index stores IDs only and requires active ID membership", () => {
  for (const value of [
    { version: 1, activeProjectId: null, projectIds: [] },
    { version: 1, activeProjectId: null, projectIds: [uuid, "project"] },
    { version: 1, activeProjectId: uuid, projectIds: [uuid] },
  ]) {
    const before = structuredClone(value); const parsed = parseProjectCollection(freeze(value));
    assert.deepEqual(parsed, before); assert.notEqual(parsed.projectIds, value.projectIds);
  }
  const valid = { version: 1, activeProjectId: null, projectIds: [] };
  for (const key of Object.keys(valid)) { const value = { ...valid }; delete value[key]; assert.throws(() => parseProjectCollection(value), /missing/); }
  for (const value of [null, [], Object.create(valid), { ...valid, version: 2 }, { ...valid, extra: 1 }, { ...valid, designSystem: {} }, { ...valid, projects: [] }, { ...valid, activeProjectId: "missing" }, { ...valid, projectIds: ["p", "p"] }, { ...valid, projectIds: [null] }, { ...valid, projectIds: null }]) assert.throws(() => parseProjectCollection(value));
});

test("structural parsing preserves unresolved references; resolver has no fallback", () => {
  const doc = createComposerDocument("project", uuid);
  assert.deepEqual(parseComposerDocument(doc), doc);
  assert.equal(resolveComposerSystem(doc, ["original"]), null);
  assert.throws(() => validateComposerSystemReference(doc, ["original"]), /missing system/);
  assert.equal(resolveComposerSystem(doc, ["original", uuid]), uuid);
  const actualSystems = [{ id: "original", system: { marker: "not inspected" } }, { id: uuid, system: { marker: "not inspected" } }];
  assert.equal(resolveComposerSystem(doc, actualSystems), actualSystems[1]);
  assert.doesNotThrow(() => validateComposerSystemReference(doc, actualSystems));
  assert.deepEqual(doc, createComposerDocument("project", uuid));
});

test("two projects share a system and parsing another reference preserves identities and contents", () => {
  const source = fixture(); frame(source).root.children.push(text("preserved"));
  const before = structuredClone(source); freeze(source);
  const other = createComposerDocument("other", source.systemId);
  const changed = parseComposerDocument({ ...source, systemId: uuid });
  assert.equal(changed.id, source.id);
  assert.deepEqual(changed.pages, before.pages);
  assert.notEqual(changed.pages, source.pages);
  assert.notEqual(frame(changed).root, frame(source).root);
  assert.deepEqual(source, before);
  assert.equal(other.systemId, "original");
  assert.equal(changed.systemId, uuid);
});

test("explicit legacy conversion and temporary adapter preserve exact validated node tree", () => {
  const old = JSON.parse(readFileSync(new URL("../page-document/account-settings.json", import.meta.url), "utf8"));
  const before = structuredClone(old); freeze(old);
  const page = pageDocumentToComposerPage(old, uuid, "frame-id", "tablet");
  assert.equal(page.id, uuid); assert.equal(page.name, old.name);
  assert.equal(page.frames[0].id, "frame-id");
  assert.deepEqual(page.frames[0].root, old.root);
  assert.notEqual(page.frames[0].root, old.root);
  const temporary = composerFrameToPageDocument(page.frames[0]);
  assert.deepEqual(temporary, { version: 1, id: "composer-frame", name: "Frame", root: old.root });
  assert.deepEqual(parsePageDocument({ ...old, root: temporary.root }), before);
  assert.deepEqual(old, before);
  assert.deepEqual(pageDocumentToComposerPage(old, "p", "f").frames[0].root, parsePageDocument(old).root);
  temporary.root.children.length = 0;
  assert.deepEqual(page.frames[0].root, before.root);
  assert.throws(() => pageDocumentToComposerPage({ ...old, designSystem: {} }, "p", "f"), /unknown key/);
  assert.throws(() => pageDocumentToComposerPage(Object.create(old), "p", "f"));
});

test("explicit legacy conversion enforces old node/depth limits and preserves empty roots", () => {
  const old = (root) => ({ version: 1, id: "old", name: "Old page", root });
  for (const nodes of [1, 100]) {
    const source = old(wideRoot(nodes));
    const before = structuredClone(source);
    const page = pageDocumentToComposerPage(freeze(source), "page", "frame");
    assert.deepEqual(composerFrameToPageDocument(page.frames[0]).root, before.root);
    assert.deepEqual(source, before);
  }
  assert.throws(() => pageDocumentToComposerPage(old(wideRoot(101)), "p", "f"), /limit/);
  let node = text("leaf");
  for (let i = 1; i < 12; i++) node = { id: `stack-${i}`, kind: "stack", children: [node] };
  const source = old({ id: "root", kind: "container", children: [node] });
  const page = pageDocumentToComposerPage(source, "p", "f");
  assert.deepEqual(composerFrameToPageDocument(page.frames[0]).root, source.root);
  source.root.children = [{ id: "extra", kind: "stack", children: [node] }];
  const before = structuredClone(source);
  assert.throws(() => pageDocumentToComposerPage(source, "p", "f"), /limit/);
  assert.deepEqual(source, before);
});
