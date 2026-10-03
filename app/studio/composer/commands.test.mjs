import assert from "node:assert/strict";
import test from "node:test";
import { applyComposerCommand as apply, applyComposerCommands as batch, duplicateComposerProject } from "./commands.ts";
import { createComposerHistory as history, executeComposerCommands as execute, undoComposer as undo, redoComposer as redo } from "./history.ts";
import { COMPOSER_LIMITS, createComposerDocument, createComposerFrame, createComposerPage, parseComposerDocument } from "./model.ts";
import { applyPageCommands } from "../page-document/commands.ts";

const fixture = () => {
  const doc = createComposerDocument("project", "original");
  const page = createComposerPage("page");
  const frame = createComposerFrame("frame", "root");
  frame.root.children.push({ id: "text", kind: "text", text: "Hello" });
  page.frames.push(frame);
  doc.pages.push(page);
  return doc;
};
const frame = (doc) => doc.pages[0].frames[0];
const nodeBatch = (commands) => ({ type: "nodeCommands", pageId: "page", frameId: "frame", commands });
const geometry = (patch) => ({ type: "updateFrameGeometry", pageId: "page", frameId: "frame", geometry: patch });
const frameIds = () => ({ frameId: "copy-frame", nodeIds: { root: "copy-root", text: "copy-text" } });
const duplicateFrame = (ids = frameIds()) => ({ type: "duplicateFrame", pageId: "page", frameId: "frame", index: 1, ids });
const duplicatePage = (ids = { pageId: "copy-page", frames: { frame: frameIds() } }) => ({ type: "duplicatePage", pageId: "page", index: 1, ids });
const rename = (name) => ({ type: "renameProject", name });
const rebind = (systemId) => ({ type: "changeProjectSystem", systemId });
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function unchangedOnError(doc, commands, catalog) {
  const before = structuredClone(doc);
  const commandBefore = structuredClone(commands);
  assert.throws(() => batch(doc, commands, catalog));
  assert.deepEqual(doc, before);
  assert.deepEqual(commands, commandBefore);
}

test("atomic project batch supports page/frame CRUD and after-removal reorder", () => {
  const doc = freeze(fixture());
  const commands = freeze([
    rename("Project"),
    { type: "insertPage", index: 1, page: createComposerPage("second") },
    { type: "renamePage", pageId: "second", name: "Second" },
    { type: "reorderPage", pageId: "second", index: 0 },
    { type: "insertFrame", pageId: "page", index: 0, frame: createComposerFrame("phone", "phone-root", "mobile") },
    { type: "renameFrame", pageId: "page", frameId: "phone", name: "Phone" },
    { type: "reorderFrame", pageId: "page", frameId: "phone", index: 1 },
  ]);
  const result = batch(doc, commands);
  assert.equal(result.name, "Project");
  assert.deepEqual(result.pages.map((page) => [page.id, page.name]), [["second", "Second"], ["page", "Untitled page"]]);
  assert.deepEqual(result.pages[1].frames.map((frame) => frame.id), ["frame", "phone"]);
  assert.equal(result.pages[1].frames[1].name, "Phone");
  const deleted = batch(result, [
    { type: "deleteFrame", pageId: "page", frameId: "phone" },
    { type: "deleteFrame", pageId: "page", frameId: "frame" },
    { type: "deletePage", pageId: "second" },
    { type: "deletePage", pageId: "page" },
  ]);
  assert.deepEqual(deleted.pages, []);
  assert.equal(doc.name, "Untitled project");
});

test("errors at any batch position leave documents and commands untouched", () => {
  const doc = fixture();
  for (const invalid of [
    { type: "renamePage", pageId: "missing", name: "No" },
    { type: "deleteFrame", pageId: "page", frameId: "missing" },
    { type: "insertPage", index: 2, page: createComposerPage("second") },
    { type: "reorderPage", pageId: "page", index: 1 },
    { type: "reorderFrame", pageId: "page", frameId: "frame", index: -1 },
    { type: "insertFrame", pageId: "page", index: 0.5, frame: createComposerFrame("other", "other-root") },
    rename(" "), rename("n".repeat(121)), geometry({ width: 0 }),
  ]) unchangedOnError(doc, [rename("First"), invalid]);
  assert.deepEqual(batch(doc, []), doc);
  assert.notEqual(batch(doc, []), doc);
  assert.throws(() => batch(doc, Array.from({ length: 101 }, () => rename("Name"))), /batch limit/);
  assert.doesNotThrow(() => batch(doc, Array.from({ length: 100 }, () => rename("Name"))));
});

test("exact tagged allowlist rejects missing, unknown and executable command data", () => {
  const doc = fixture();
  for (const bad of [
    null, {}, { type: "unknown" }, { type: "renameProject" }, { type: "renameProject", name: "Yes", extra: 1 },
    { type: "renameProject", name: 7 }, { type: "deletePage", pageId: 7 },
    { ...geometry({}), preset: "web" }, geometry({ preset: "mobile" }),
    nodeBatch([{ type: "rename", name: "Temporary" }]),
    nodeBatch([{ type: "delete", nodeId: "text", extra: true }]),
    nodeBatch([{ type: "update", props: {} }]),
    nodeBatch([{ type: "update", nodeId: "text", props: { onClick: "evil" } }]),
    nodeBatch([{ type: "update", nodeId: "text", props: { onClick() {} } }]),
    { type: "renameProject", name: undefined },
  ]) assert.throws(() => apply(doc, bad));
  let calls = 0;
  const accessor = { type: "renameProject", get name() { calls++; return "No"; } };
  const inherited = Object.create({ type: "renameProject", name: "No" });
  const hidden = { ...rename("No") };
  Object.defineProperty(hidden, "hidden", { value: 1 });
  const symbol = { ...rename("No"), [Symbol("hidden")]: 1 };
  const propsAccessor = { type: "update", nodeId: "text", props: {} };
  Object.defineProperty(propsAccessor.props, "onClick", { enumerable: true, get() { calls++; return "No"; } });
  for (const bad of [accessor, inherited, hidden, symbol, nodeBatch([propsAccessor])]) assert.throws(() => apply(doc, bad));
  assert.equal(calls, 0);
  const sparse = new Array(1);
  assert.throws(() => batch(doc, sparse));
  const arrayWithExtra = [rename("No")];
  arrayWithExtra.extra = true;
  assert.throws(() => batch(doc, arrayWithExtra));
  const cycle = rename("No");
  cycle.extra = cycle;
  assert.throws(() => apply(doc, cycle), /limit/);
  const nullPrototype = Object.assign(Object.create(null), rename("Yes"));
  assert.equal(apply(doc, nullPrototype).name, "Yes");
});

test("duplicate frame remaps every node and preserves content, geometry and source", () => {
  const doc = fixture();
  const before = structuredClone(doc);
  const command = freeze(duplicateFrame());
  const result = apply(freeze(doc), command);
  const copy = result.pages[0].frames[1];
  assert.deepEqual(copy, { ...before.pages[0].frames[0], id: "copy-frame", root: {
    ...before.pages[0].frames[0].root, id: "copy-root", children: [{ id: "copy-text", kind: "text", text: "Hello" }],
  } });
  copy.root.children[0].text = "Changed";
  assert.equal(frame(result).root.children[0].text, "Hello");
  assert.deepEqual(doc, before);
  assert.deepEqual(apply(before, duplicateFrame()), apply(before, duplicateFrame()));
});

test("duplicate page remaps page, all frames and frame-scoped repeated node IDs", () => {
  const doc = fixture();
  doc.pages[0].frames.push(createComposerFrame("phone", "root", "mobile"));
  const ids = { pageId: "copy-page", frames: {
    frame: frameIds(), phone: { frameId: "copy-phone", nodeIds: { root: "copy-phone-root" } },
  } };
  const result = apply(freeze(doc), freeze(duplicatePage(ids)));
  assert.deepEqual(result.pages[1].frames.map((item) => [item.id, item.root.id]), [["copy-frame", "copy-root"], ["copy-phone", "copy-phone-root"]]);
  assert.equal(result.pages[1].id, "copy-page");
  assert.equal(result.pages[1].name, doc.pages[0].name);
  assert.deepEqual(result.pages[0], doc.pages[0]);
  const empty = createComposerDocument("empty", "missing");
  empty.pages.push(createComposerPage("page"));
  assert.deepEqual(apply(empty, duplicatePage({ pageId: "copy", frames: {} })).pages[1], { id: "copy", name: "Untitled page", frames: [] });
});

test("incomplete, extra, unchanged, malformed and colliding duplicate IDs are atomic errors", () => {
  const doc = fixture();
  for (const ids of [
    { frameId: "frame", nodeIds: { root: "copy-root", text: "copy-text" } },
    { frameId: "copy", nodeIds: { root: "root", text: "copy-text" } },
    { frameId: "copy", nodeIds: { root: "copy-root", text: "text" } },
    { frameId: "copy", nodeIds: { root: "same", text: "same" } },
    { frameId: "copy", nodeIds: { root: "copy-root" } },
    { frameId: "copy", nodeIds: { root: "copy-root", text: "copy-text", extra: "extra" } },
    { frameId: "copy", nodeIds: { root: "1numeric", text: "copy-text" } },
    { frameId: "bad id", nodeIds: { root: "copy-root", text: "copy-text" } },
    { ...frameIds(), extra: "No" },
  ]) unchangedOnError(doc, [rename("First"), duplicateFrame(ids)]);
  unchangedOnError(doc, [duplicatePage({ pageId: "page", frames: { frame: frameIds() } })]);
  unchangedOnError(doc, [duplicatePage({ pageId: "copy", frames: {} })]);
  doc.pages[0].frames.push(createComposerFrame("other", "other-root"));
  unchangedOnError(doc, [duplicateFrame({ frameId: "copy", nodeIds: { root: "other-root", text: "new-text" } })]);
  unchangedOnError(doc, [duplicatePage({ pageId: "copy", frames: {
    frame: frameIds(), other: { frameId: "copy-frame", nodeIds: { "other-root": "new-root" } },
  } })]);
  unchangedOnError(doc, [duplicatePage({ pageId: "copy", frames: {
    frame: frameIds(), other: { frameId: "new-frame", nodeIds: { "other-root": "copy-root" } },
  } })]);
});

test("geometry updates keep positions fractional and deterministically mark actual resizing custom", () => {
  const doc = fixture();
  assert.equal(frame(apply(doc, geometry({}))).preset, "web");
  assert.equal(frame(apply(doc, geometry({ width: 1440, height: 900 }))).preset, "web");
  const moved = apply(doc, geometry({ x: -100000, y: 0.25 }));
  assert.equal(frame(moved).preset, "web");
  assert.equal(frame(moved).x, -100000);
  assert.equal(frame(moved).y, 0.25);
  const resized = apply(moved, geometry({ width: 390, height: 844 }));
  assert.equal(frame(resized).preset, "custom"); // Never silently infer a new preset.
  assert.equal(frame(apply(resized, geometry({ width: 1440, height: 900 }))).preset, "custom");
  assert.equal(frame(apply(doc, geometry({ width: 1, height: 10000 }))).width, 1);
  for (const patch of [{ x: 100001 }, { y: -100001 }, { width: 10001 }, { height: 0 }, { width: -1 },
    { width: NaN }, { height: Infinity }, { width: "390" }, { width: undefined }]) assert.throws(() => apply(doc, geometry(patch)));
  assert.deepEqual(doc, fixture());
});

test("page/frame quotas and ID uniqueness apply to inserts and duplicates", () => {
  const pages = fixture();
  for (let i = 1; i < COMPOSER_LIMITS.pages; i++) pages.pages.push(createComposerPage(`page-${i}`));
  assert.doesNotThrow(() => parseComposerDocument(pages));
  unchangedOnError(pages, [{ type: "insertPage", index: 0, page: createComposerPage("excess") }]);
  unchangedOnError(pages, [duplicatePage()]);
  const frames = fixture();
  for (let i = 1; i < COMPOSER_LIMITS.framesPerPage; i++) frames.pages[0].frames.push(createComposerFrame(`frame-${i}`, `root-${i}`));
  unchangedOnError(frames, [{ type: "insertFrame", pageId: "page", index: 0, frame: createComposerFrame("excess", "excess-root") }]);
  unchangedOnError(frames, [duplicateFrame()]);
  unchangedOnError(fixture(), [{ type: "insertPage", index: 0, page: createComposerPage("page") }]);
  const other = createComposerPage("other");
  other.frames.push(createComposerFrame("frame", "root"));
  unchangedOnError(fixture(), [{ type: "insertPage", index: 0, page: other }]);
});

test("node adapter matches legacy updates, inserts, moves, deletes and prop removals", () => {
  const doc = fixture();
  frame(doc).root.props = { maxWidth: "narrow" };
  const commands = [
    { type: "update", nodeId: "root", props: { maxWidth: null } },
    { type: "insert", parentId: "root", index: 1, node: { id: "second", kind: "text", text: "Second" } },
    { type: "move", nodeId: "second", parentId: "root", index: 0 },
    { type: "update", nodeId: "text", text: "Updated" },
    { type: "delete", nodeId: "second" },
  ];
  const legacy = applyPageCommands({ version: 1, id: "legacy", name: "Legacy", root: frame(doc).root }, commands);
  const result = apply(freeze(doc), freeze(nodeBatch(commands)));
  assert.deepEqual(frame(result).root, legacy.root);
  assert.equal(result.id, "project");
  assert.equal(result.pages[0].id, "page");
  assert.equal(frame(result).id, "frame");
  assert.equal(frame(result).name, "Untitled frame");
});

test("node adapter protects roots, descendants, slots and built-in prop allowlists", () => {
  const doc = fixture();
  for (const commands of [
    [{ type: "delete", nodeId: "root" }],
    [{ type: "move", nodeId: "root", parentId: "root", index: 0 }],
    [{ type: "insert", parentId: "text", index: 0, node: { id: "nested", kind: "text", text: "No" } }],
    [{ type: "insert", parentId: "root", index: 0, node: { id: "text", kind: "text", text: "No" } }],
    [{ type: "update", nodeId: "root", props: { unknown: "No" } }],
    [{ type: "insert", parentId: "root", index: 0, node: { id: "custom", kind: "customWidget" } }],
    [{ type: "insert", parentId: "root", index: 0, node: { id: "panel", kind: "stack", children: [] } },
      { type: "move", nodeId: "panel", parentId: "panel", index: 0 }],
  ]) unchangedOnError(doc, [rename("First"), nodeBatch(commands)]);
  assert.throws(() => apply(doc, nodeBatch(Array.from({ length: 101 }, () => ({ type: "update", nodeId: "text" })))));
});

test("node adapter enforces frame node/depth limits and final node-batch validation", () => {
  const doc = fixture();
  frame(doc).root.children = Array.from({ length: 99 }, (_, i) => ({ id: `text-${i}`, kind: "text", text: "Text" }));
  const insert = { type: "insert", parentId: "root", index: 0, node: { id: "excess", kind: "text", text: "Text" } };
  unchangedOnError(doc, [nodeBatch([insert])]);
  assert.doesNotThrow(() => apply(doc, nodeBatch([insert, { type: "delete", nodeId: "text-0" }])));
  let root = { id: "deep-12", kind: "stack", children: [] };
  for (let i = 11; i >= 0; i--) root = { id: `deep-${i}`, kind: i === 0 ? "container" : "stack", children: [root] };
  assert.doesNotThrow(() => parseComposerDocument({ ...doc, pages: [{ ...doc.pages[0], frames: [{ ...frame(doc), root }] }] }));
  frame(doc).root = root;
  unchangedOnError(doc, [nodeBatch([{ ...insert, parentId: "deep-12" }])]);
});

test("total project node quota is enforced independently of per-frame quotas", () => {
  const doc = createComposerDocument("project", "original");
  for (let p = 0; p < 2; p++) {
    const page = createComposerPage(`page-${p}`);
    for (let f = 0; f < 10; f++) {
      const item = createComposerFrame(`frame-${p}-${f}`, "root");
      item.root.children = Array.from({ length: 99 }, (_, i) => ({ id: `text-${i}`, kind: "text", text: "Text" }));
      page.frames.push(item);
    }
    doc.pages.push(page);
  }
  unchangedOnError(doc, [{ type: "insertPage", index: 2, page: { id: "excess", name: "Excess", frames: [createComposerFrame("excess", "root")] } }]);
});

test("system rebind requires a supplied validated target and preserves all content and catalog", () => {
  const doc = fixture();
  const otherProject = structuredClone(doc);
  otherProject.id = "other-project";
  const catalog = freeze([{ id: "original", system: { marker: "original-tokens" } }, { id: "target", system: { marker: "target-tokens" } }]);
  const catalogBefore = structuredClone(catalog);
  const before = structuredClone(doc);
  assert.deepEqual(apply(freeze(doc), rebind("target"), catalog), { ...before, systemId: "target" });
  assert.deepEqual(otherProject, { ...before, id: "other-project" });
  assert.deepEqual(catalog, catalogBefore);
  unchangedOnError(before, [rename("First"), rebind("missing")], catalog);
  assert.throws(() => apply(doc, rebind("target")), /catalog required/);
  assert.throws(() => apply(doc, rebind("target"), []), /missing system/);
  assert.deepEqual(apply(doc, rebind("target"), ["target"]), { ...before, systemId: "target" });
});

test("missing existing system reference survives rename/layout but rebind target must exist", () => {
  const doc = fixture();
  doc.systemId = "missing";
  const result = batch(doc, [rename("Renamed"), geometry({ x: 25 })], ["original"]);
  assert.equal(result.systemId, "missing");
  assert.equal(result.name, "Renamed");
  assert.equal(frame(result).x, 25);
  assert.throws(() => apply(result, rebind("missing"), ["original"]), /missing system/);
  assert.equal(apply(result, rebind("original"), ["original"]).systemId, "original");
});

test("whole-project batch and rebind each form exactly one undo/redo step", () => {
  const doc = fixture();
  const catalog = freeze(["original", "target"]);
  const first = execute(history(doc), [rename("Renamed"), geometry({ x: 10 }), rebind("target")], catalog);
  assert.equal(first.past.length, 1);
  assert.deepEqual(first.past[0], doc);
  const reverted = undo(freeze(first), catalog);
  assert.deepEqual(reverted.present, doc);
  assert.equal(reverted.future.length, 1);
  assert.deepEqual(redo(reverted, catalog).present, first.present);
  const rebound = execute(history(doc), [rebind("target")], catalog);
  assert.deepEqual(undo(rebound, catalog).present, doc);
  assert.equal(redo(undo(rebound, catalog), catalog).present.systemId, "target");
});

test("history initialization and every returned snapshot are detached", () => {
  const doc = fixture();
  const initial = history(doc);
  const first = execute(initial, [rename("First")]);
  const second = execute(first, [geometry({ x: 10 })]);
  frame(second.past[0]).root.children[0].text = "Changed past";
  frame(second.present).root.children[0].text = "Changed present";
  assert.deepEqual(initial.present, doc);
  assert.equal(frame(first.present).root.children[0].text, "Hello");
  assert.equal(frame(second.past[1]).root.children[0].text, "Hello");
  const reverted = undo(first);
  frame(reverted.future[0]).root.children[0].text = "Changed future";
  assert.equal(frame(first.present).root.children[0].text, "Hello");
  assert.notEqual(reverted.present, first.past[0]);
  const restored = redo(undo(first));
  assert.notEqual(restored.present, first.present);
  assert.deepEqual(Object.keys(restored).sort(), ["future", "limit", "past", "present"]);
});

test("no-op commands and errors preserve redo and identity; real branch clears redo", () => {
  const state = undo(execute(history(fixture()), [rename("First")]), ["original"]);
  freeze(state);
  for (const commands of [[], [rename(state.present.name)], [geometry({})],
    [geometry({ width: 1440 })], [nodeBatch([{ type: "update", nodeId: "text", text: "Hello" }])],
    [rebind("original")], [rename("Temporary"), rename(state.present.name)]]) {
    assert.equal(execute(state, commands, ["original"]), state);
  }
  const before = structuredClone(state);
  for (const commands of [[rename("Temporary"), rebind("missing")], [geometry({ width: 0 })], [duplicateFrame({ frameId: "frame", nodeIds: {} })]]) {
    assert.throws(() => execute(state, commands, ["original"]));
    assert.deepEqual(state, before);
  }
  const next = execute(state, [geometry({ x: 1 })]);
  assert.deepEqual(next.future, []);
  assert.equal(next.past.length, 1);
  assert.equal(state.future.length, 1);
});

test("semantic prop ordering is a history no-op", () => {
  const doc = fixture();
  frame(doc).root.children.push({ id: "stack", kind: "stack", props: { gap: "md", direction: "row" }, children: [] });
  const state = history(doc);
  assert.equal(execute(state, [nodeBatch([
    { type: "update", nodeId: "stack", props: { gap: null } },
    { type: "update", nodeId: "stack", props: { gap: "md" } },
  ])]), state);
});

test("history default 50 and integer range 1..100 bound both stacks", () => {
  assert.equal(history(fixture()).limit, 50);
  assert.equal(history(fixture(), 100).limit, 100);
  for (const limit of [0, -1, 101, 1.5, NaN, Infinity, "50"]) assert.throws(() => history(fixture(), limit), /limit/);
  let state = history(fixture(), 2);
  for (const name of ["One", "Two", "Three"]) state = execute(state, [rename(name)]);
  assert.deepEqual(state.past.map((doc) => doc.name), ["One", "Two"]);
  state = undo(undo(state));
  assert.equal(state.present.name, "One");
  assert.equal(state.future.length, 2);
  assert.equal(undo(state), state);
  state = redo(redo(state));
  assert.equal(state.present.name, "Three");
  assert.equal(redo(state), state);
  let single = history(fixture(), 1);
  single = execute(execute(single, [rename("One")]), [rename("Two")]);
  assert.equal(single.past.length, 1);
  assert.equal(undo(single).present.name, "One");
});

test("undo/redo validate target existence in the CURRENT supplied catalog without fallback", () => {
  const doc = fixture();
  const rebound = execute(history(doc), [rebind("target")], ["original", "target"]);
  const before = structuredClone(rebound);
  assert.throws(() => undo(freeze(rebound), ["target"]), /missing system original/);
  assert.deepEqual(rebound, before);
  const reverted = undo(rebound, ["original"]); // Current reference need not exist; only restored target does.
  const revertedBefore = structuredClone(reverted);
  assert.throws(() => redo(freeze(reverted), ["original"]), /missing system target/);
  assert.deepEqual(reverted, revertedBefore);
  assert.throws(() => undo(rebound, []), /missing system/);
  assert.throws(() => redo(reverted, []), /missing system/);
  assert.deepEqual(undo(rebound).present, doc); // Explicit catalog omission is structural-only.
  assert.equal(redo(reverted, [{ id: "target" }]).present.systemId, "target");
  const missing = { ...doc, systemId: "missing" };
  const renamed = execute(history(missing), [rename("Renamed")]);
  assert.throws(() => undo(renamed, ["original"]), /missing system missing/);
  assert.equal(undo(renamed).present.systemId, "missing");
  const empty = history(missing);
  assert.equal(undo(empty, []), empty);
  assert.equal(redo(empty, []), empty);
});

test("duplication remaps nested descendants while preserving props, names and custom geometry", () => {
  const doc = fixture();
  const original = frame(doc);
  original.name = "Nested";
  original.preset = "custom";
  original.width = 100.5;
  original.x = -25.25;
  original.root.children = [{ id: "stack", kind: "stack", props: { gap: "lg", direction: "column" }, children: [
    { id: "button", kind: "button", props: { type: "button" }, text: "Action" },
    { id: "input", kind: "input", props: { label: "Email", name: "email", type: "email", required: true } },
  ] }];
  const result = apply(doc, duplicateFrame({ frameId: "copy-frame", nodeIds: {
    root: "copy-root", stack: "copy-stack", button: "copy-button", input: "copy-input",
  } }));
  const copy = result.pages[0].frames[1];
  assert.equal(copy.root.children[0].id, "copy-stack");
  assert.deepEqual(copy.root.children[0].children.map((node) => node.id), ["copy-button", "copy-input"]);
  assert.deepEqual(copy.root.children[0].props, original.root.children[0].props);
  assert.deepEqual(copy.root.children[0].children[1].props, original.root.children[0].children[1].props);
  assert.equal(copy.name, "Nested");
  assert.equal(copy.width, 100.5);
  assert.equal(copy.x, -25.25);
  assert.equal(copy.preset, "custom");
  assert.deepEqual(frame(result), original);
});

test("legacy final-tree rules retain unique card slots and atomic required-prop repairs", () => {
  const doc = fixture();
  frame(doc).root.children.push({ id: "card", kind: "card", children: [{ id: "content", kind: "cardContent", children: [] }] });
  unchangedOnError(doc, [nodeBatch([{ type: "insert", parentId: "card", index: 1, node: { id: "second-content", kind: "cardContent", children: [] } }])]);
  const commands = [
    { type: "insert", parentId: "content", index: 0, node: { id: "input", kind: "input", props: { label: "Name", name: "name" } } },
    { type: "update", nodeId: "input", props: { label: null } },
    { type: "update", nodeId: "input", props: { label: "Updated" } },
  ];
  const result = apply(doc, nodeBatch(commands));
  assert.equal(frame(result).root.children[1].children[0].children[0].props.label, "Updated");
  unchangedOnError(doc, [nodeBatch(commands.slice(0, 2))]);
});

test("restoration revalidates snapshot structure and default history caps at 50", () => {
  let state = history(fixture());
  for (let i = 0; i < 51; i++) state = execute(state, [rename(`Edit-${i}`)]);
  assert.equal(state.past.length, 50);
  assert.equal(state.past[0].name, "Edit-0");
  const corruptUndo = structuredClone(state);
  frame(corruptUndo.past[49]).width = 0;
  const beforeUndo = structuredClone(corruptUndo);
  assert.throws(() => undo(corruptUndo), /geometry/);
  assert.deepEqual(corruptUndo, beforeUndo);
  const corruptRedo = undo(state);
  corruptRedo.future[0].systemId = "bad id";
  const beforeRedo = structuredClone(corruptRedo);
  assert.throws(() => redo(corruptRedo, ["original"]), /invalid id/);
  assert.deepEqual(corruptRedo, beforeRedo);
});

const projectIds = () => ({ page: { pageId: "copy-page", frames: { frame: frameIds() } } });

test("whole-project duplication preserves every non-identity field with frame-scoped source node IDs", () => {
  const source = fixture();
  frame(source).preset = "custom";
  Object.assign(frame(source), { x: -12.75, y: 0.25, width: 321.5, height: 654.25 });
  frame(source).root.children.push({ id: "stack", kind: "stack", props: { gap: "lg", direction: "column" }, children: [
    { id: "button", kind: "button", text: "Action", props: { type: "button" } },
  ] });
  const second = structuredClone(source.pages[0]);
  second.id = "second-page";
  second.frames[0].id = "second-frame";
  source.pages.push(second, createComposerPage("empty"));
  const ids = projectIds();
  Object.assign(ids.page.frames.frame.nodeIds, { stack: "copy-stack", button: "copy-button" });
  ids["second-page"] = { pageId: "second-copy-page", frames: { "second-frame": { frameId: "second-copy-frame", nodeIds: {
    root: "second-copy-root", text: "second-copy-text", stack: "second-copy-stack", button: "second-copy-button",
  } } } };
  ids.empty = { pageId: "copy-empty", frames: {} };
  const before = structuredClone(source);
  const mappingBefore = structuredClone(ids);
  const copy = duplicateComposerProject(freeze(source), "copy-project", "Project copy", freeze(ids));
  const expected = structuredClone(before);
  expected.id = "copy-project"; expected.name = "Project copy";
  for (const page of expected.pages) {
    const map = ids[page.id]; page.id = map.pageId;
    for (const item of page.frames) {
      const frameMap = map.frames[item.id]; item.id = frameMap.frameId;
      const remap = (node) => { node.id = frameMap.nodeIds[node.id]; (node.children ?? []).forEach(remap); };
      remap(item.root);
    }
  }
  assert.deepEqual(copy, expected);
  assert.deepEqual(source, before); assert.deepEqual(ids, mappingBefore);
  copy.pages[0].frames[0].root.children[1].props.gap = "sm";
  assert.deepEqual(source, before);
});

test("whole-project duplicate rejects incomplete, extra, invalid, old and colliding IDs without mutation", () => {
  const source = fixture();
  const second = structuredClone(source.pages[0]); second.id = "second-page"; second.frames[0].id = "second-frame";
  source.pages.push(second);
  const valid = () => ({ ...projectIds(), "second-page": { pageId: "second-copy-page", frames: {
    "second-frame": { frameId: "second-copy-frame", nodeIds: { root: "second-root", text: "second-text" } },
  } } });
  const mutations = [
    (ids) => { delete ids.page; }, (ids) => { ids.extra = ids.page; },
    (ids) => { ids.page.extra = true; }, (ids) => { delete ids.page.frames.frame; },
    (ids) => { ids.page.frames.extra = frameIds(); },
    (ids) => { ids.page.frames.frame.nodeIds = { root: "copy-root" }; },
    (ids) => { ids.page.frames.frame.nodeIds.extra = "extra"; },
    (ids) => { ids.page.pageId = "second-page"; }, (ids) => { ids.page.pageId = "bad id"; },
    (ids) => { ids["second-page"].pageId = ids.page.pageId; },
    (ids) => { ids.page.frames.frame.frameId = "second-frame"; },
    (ids) => { ids["second-page"].frames["second-frame"].frameId = "copy-frame"; },
    (ids) => { ids.page.frames.frame.frameId = ""; },
    (ids) => { ids.page.frames.frame.nodeIds.root = "root"; },
    (ids) => { ids.page.frames.frame.nodeIds.text = "copy-root"; },
    (ids) => { ids["second-page"].frames["second-frame"].nodeIds.root = "copy-root"; },
    (ids) => { ids.page.frames.frame.nodeIds.root = "1-invalid-node"; },
  ];
  for (const mutate of mutations) {
    const ids = valid(); mutate(ids);
    const before = structuredClone(source); const mappingBefore = structuredClone(ids);
    assert.throws(() => duplicateComposerProject(source, "copy-project", "Copy", ids));
    assert.deepEqual(source, before); assert.deepEqual(ids, mappingBefore);
  }
  for (const [id, name] of [["project", "Copy"], ["bad id", "Copy"], ["copy-project", ""], ["copy-project", "x".repeat(121)]])
    assert.throws(() => duplicateComposerProject(source, id, name, valid()));
});

test("whole-project maps reject executable/inherited data without invoking accessors", () => {
  let calls = 0;
  const ids = projectIds();
  Object.defineProperty(ids.page.frames.frame.nodeIds, "root", { enumerable: true, get() { calls++; return "copy-root"; } });
  for (const mapping of [ids, Object.create(projectIds()), { ...projectIds(), [Symbol("extra")]: 1 }, { page: { ...projectIds().page, frames: [] } }])
    assert.throws(() => duplicateComposerProject(fixture(), "copy-project", "Copy", mapping));
  assert.equal(calls, 0);
});

test("whole-project duplication opens fresh history and never changes source history or system catalog", () => {
  const catalog = freeze([{ id: "original", system: { marker: "tokens" } }, { id: "other", system: { marker: "other tokens" } }]);
  const source = undo(execute(history(fixture()), [rename("Edit"), rebind("other")], catalog), catalog);
  const before = structuredClone(source); const catalogBefore = structuredClone(catalog);
  const copy = duplicateComposerProject(source.present, "copy-project", "Copy", projectIds());
  const opened = history(copy);
  assert.equal(opened.present.systemId, source.present.systemId);
  assert.deepEqual(opened.past, []); assert.deepEqual(opened.future, []);
  assert.deepEqual(source, before); assert.deepEqual(catalog, catalogBefore);
  assert.equal(undo(opened, catalog), opened);
  assert.throws(() => batch(source.present, [{ type: "duplicateProject", projectId: "copy-project" }]));
  const missing = { ...fixture(), systemId: "missing-system" };
  assert.equal(duplicateComposerProject(missing, "missing-copy", "Copy", projectIds()).systemId, "missing-system");
});

test("empty project duplication needs an exact empty map and no registration or source capacity", () => {
  const source = createComposerDocument("empty", "original");
  assert.deepEqual(duplicateComposerProject(source, "copy", "Copy", {}), { ...source, id: "copy", name: "Copy" });
  assert.throws(() => duplicateComposerProject(source, "copy", "Copy", projectIds()));
  source.pages = Array.from({ length: COMPOSER_LIMITS.pages }, (_, i) => createComposerPage(`page-${i}`));
  const ids = Object.fromEntries(source.pages.map((page) => [page.id, { pageId: `copy-${page.id}`, frames: {} }]));
  assert.equal(duplicateComposerProject(source, "copy", "Copy", ids).pages.length, COMPOSER_LIMITS.pages);
});
