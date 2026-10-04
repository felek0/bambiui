import assert from "node:assert/strict";
import test from "node:test";
import { clipRect, draftCommand, resetLocalStylesCommand, nodePath, resolveSelection, flattenNodes } from "./selection.ts";
import { createComposerHistory, executeComposerCommands, undoComposer, redoComposer } from "./history.ts";
import { createComposerDocument, createComposerFrame, createComposerPage } from "./model.ts";
import { applyComposerCommands } from "./commands.ts";
const fixture = () => {
  const doc = createComposerDocument("project", "system");
  const page = createComposerPage("page");
  page.frames = ["web", "mobile"].map(id => { const frame = createComposerFrame(id, "root", id); frame.root.children = [{ id: "stack", kind: "stack", children: [{ id: "same", kind: "button", text: "Action" }, { id: "field", kind: "input", props: { label: "Email", name: "email", defaultValue: "Initial" } }] }]; return frame; });
  doc.pages = [page]; return doc;
};
const selection = { projectId: "project", pageId: "page", frameId: "mobile", nodeId: "same" };
test("node resolution is qualified by all four IDs, with ancestor and compact layers paths", () => {
  const doc = fixture();
  assert.equal(resolveSelection(doc, selection).frame.id, "mobile");
  assert.deepEqual(nodePath(doc.pages[0].frames[0].root, "same").map(node => node.id), ["root", "stack", "same"]);
  for (const key of Object.keys(selection)) assert.equal(resolveSelection(doc, { ...selection, [key]: "missing" }), null);
  assert.deepEqual(flattenNodes(doc.pages[0].frames[0].root).map(({ depth }) => depth), [0, 1, 2, 2]);
});
test("draft edits change only the selected frame and normalize through one node command", () => {
  const doc = fixture(), before = structuredClone(doc);
  const command = draftCommand(doc, selection, "text", "Mobile action");
  const next = applyComposerCommands(doc, [{ type: "nodeCommands", pageId: "page", frameId: "mobile", commands: [command] }]);
  assert.deepEqual(doc, before); assert.deepEqual(next.pages[0].frames[0], before.pages[0].frames[0]);
  assert.equal(resolveSelection(next, selection).node.text, "Mobile action");
  assert.deepEqual(draftCommand(doc, selection, "disabled", "false").props, { disabled: false });
  assert.deepEqual(draftCommand(doc, selection, "radius", "lg").props, { radius: "lg" });
  assert.deepEqual(draftCommand(doc, selection, "radius", null).props, { radius: null });
});
test("invalid drafts never mutate; required labels, names, text, enums and limits stay authoritative", () => {
  const doc = fixture(), before = structuredClone(doc), field = { ...selection, nodeId: "field" };
  for (const [scope, key, draft] of [[selection, "text", " "], [selection, "text", "x".repeat(2001)], [selection, "variant", "invented"], [selection, "unknown", "x"], [field, "label", ""], [field, "name", "bad name"], [field, "label", null], [field, "description", "x".repeat(201)]]) assert.throws(() => draftCommand(doc, scope, key, draft));
  assert.deepEqual(doc, before);
});
test("binding choices replace counterpart, optional clear differs from valid blank strings", () => {
  const doc = fixture(), field = { ...selection, nodeId: "field" };
  assert.deepEqual(draftCommand(doc, field, "value", "").props, { value: "", defaultValue: null });
  assert.deepEqual(draftCommand(doc, field, "defaultValue", null).props, { defaultValue: null });
  assert.deepEqual(draftCommand(doc, field, "description", "").props, { description: null });
  doc.pages[0].frames[1].root.children[0].children.push({ id: "choice", kind: "switch", props: { label: "Choice", name: "choice", defaultChecked: true } });
  assert.deepEqual(draftCommand(doc, { ...selection, nodeId: "choice" }, "checked", "false").props, { checked: false, defaultChecked: null });
});
test("legacy style reset clears appearance and every part atomically while keeping parameters and other layers", () => {
  const doc = fixture(), scope = { ...selection, nodeId: "field" }, field = resolveSelection(doc, scope).node;
  field.appearance = { paddingTop: 12.375, color: "#112233" };
  field.parts = { root: { gap: 17.25 }, control: { borderWidth: 2 }, label: { fontSize: 15 }, description: { color: "#445566" }, error: { fontWeight: 700 } };
  const before = structuredClone(doc), command = resetLocalStylesCommand(doc, scope);
  assert.deepEqual(command, { type: "update", nodeId: "field", appearance: null, parts: null });
  const history = executeComposerCommands(createComposerHistory(doc), [{ type: "nodeCommands", pageId: scope.pageId, frameId: scope.frameId, commands: [command] }]);
  assert.equal(history.past.length, 1);
  const reset = resolveSelection(history.present, scope).node;
  assert.deepEqual(reset.props, field.props); assert.equal(Object.hasOwn(reset, "appearance"), false); assert.equal(Object.hasOwn(reset, "parts"), false);
  assert.deepEqual(history.present.pages[0].frames[0], before.pages[0].frames[0]);
  assert.deepEqual(resolveSelection(history.present, selection).node, resolveSelection(before, selection).node);
  assert.deepEqual(undoComposer(history).present, before); assert.deepEqual(redoComposer(undoComposer(history)).present, history.present);
  assert.deepEqual(doc, before);
  assert.deepEqual(resetLocalStylesCommand(doc, selection), { type: "update", nodeId: "same", appearance: null });
  assert.throws(() => resetLocalStylesCommand(doc, { ...scope, frameId: "missing" }), /no longer available/);
});

test("measured outlines intersect frame bounds without implying fully visible overflow", () => {
  assert.deepEqual(clipRect({ x: -20, y: 80, width: 120, height: 80 }, 90, 100), { x: 0, y: 80, width: 90, height: 20 });
  assert.equal(clipRect({ x: 0, y: 100, width: 20, height: 20 }, 100, 100), null);
  assert.equal(clipRect({ x: 0, y: 0, width: 0, height: 20 }, 100, 100), null);
});
