import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parsePageDocument } from "./model.ts";
import { applyPageCommand, applyPageCommands } from "./commands.ts";
import { createPageHistory, executePageCommands, undoPage, redoPage } from "./history.ts";

const text = (id) => ({ id, kind: "text", text: id });
const stack = (id, children) => ({ id, kind: "stack", children });
const fixture = () => parsePageDocument({
  version: 1, id: "commands-page", name: "Commands",
  root: { id: "root", kind: "container", children: [
    stack("left", [text("a"), text("b"), text("c")]),
    stack("right", [text("d")]),
  ] },
});
function find(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
}
const ids = (page, id) => find(page.root, id).children.map((node) => node.id);
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function rejectsWithoutMutation(page, commands) {
  const before = structuredClone(page);
  const commandsBefore = structuredClone(commands);
  assert.throws(() => applyPageCommands(freeze(page), freeze(commands)));
  assert.deepEqual(page, before);
  assert.deepEqual(commands, commandsBefore);
}

test("insert, update, delete and rename normalize results without mutating inputs", () => {
  const page = freeze(fixture());
  const before = structuredClone(page);
  const commands = freeze([
    { type: "insert", parentId: "left", index: 1, node: text("inserted") },
    { type: "update", nodeId: "inserted", props: { variant: "h2" }, text: "Edited" },
    { type: "delete", nodeId: "b" },
    { type: "rename", name: "Renamed" },
  ]);
  const commandsBefore = structuredClone(commands);
  const result = applyPageCommands(page, commands);
  assert.deepEqual(ids(result, "left"), ["a", "inserted", "c"]);
  assert.deepEqual(find(result.root, "inserted"), { id: "inserted", kind: "text", props: { variant: "h2" }, text: "Edited" });
  assert.equal(result.name, "Renamed");
  assert.deepEqual(result, parsePageDocument(result));
  assert.deepEqual(page, before);
  assert.deepEqual(commands, commandsBefore);
  const command = { type: "rename", name: "Single" };
  assert.deepEqual(applyPageCommand(page, command), applyPageCommands(page, [command]));
});

test("insert normalizes legacy props and preserves richer fixture props", () => {
  const account = JSON.parse(readFileSync(new URL("./account-settings.json", import.meta.url), "utf8"));
  const input = structuredClone(find(account.root, "email"));
  input.id = "new-email";
  const commands = freeze([
    { type: "insert", parentId: "left", index: 0, node: input },
    { type: "insert", parentId: "left", index: 1, node: { id: "submit", kind: "button", props: { buttonType: "submit" }, text: "Submit" } },
  ]);
  const result = applyPageCommands(fixture(), commands);
  assert.deepEqual(find(result.root, "new-email"), input);
  assert.deepEqual(find(result.root, "submit").props, { type: "submit" });
  assert.deepEqual(commands[1].node.props, { buttonType: "submit" });
});

test("update merges props, removes null props and preserves unspecified content", () => {
  const page = fixture();
  find(page.root, "left").props = { gap: "lg", direction: "row", wrap: true };
  const result = applyPageCommands(page, [
    { type: "update", nodeId: "left", props: { gap: null, wrap: false } },
    { type: "update", nodeId: "a", props: { variant: "caption" } },
  ]);
  assert.deepEqual(find(result.root, "left").props, { direction: "row", wrap: false });
  assert.equal(find(result.root, "a").text, "a");
  assert.deepEqual(ids(result, "left"), ["a", "b", "c"]);
  assert.equal(find(page.root, "left").props.gap, "lg");
});

test("same-parent move indexes address the target list after removal, including start and end", () => {
  const page = freeze(fixture());
  const end = applyPageCommand(page, { type: "move", nodeId: "a", parentId: "left", index: 2 });
  assert.deepEqual(ids(end, "left"), ["b", "c", "a"]);
  const start = applyPageCommand(end, { type: "move", nodeId: "a", parentId: "left", index: 0 });
  assert.deepEqual(start, page);
  const middle = applyPageCommand(page, { type: "move", nodeId: "a", parentId: "left", index: 1 });
  assert.deepEqual(ids(middle, "left"), ["b", "a", "c"]);
});

test("batch validates the final tree after moving the last child and deleting its empty parent", () => {
  const page = freeze(fixture());
  const commands = freeze([
    { type: "move", nodeId: "d", parentId: "left", index: 3 },
    { type: "delete", nodeId: "right" },
  ]);
  const result = applyPageCommands(page, commands);
  assert.deepEqual(ids(result, "left"), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(result, "root"), ["left"]);
  assert.deepEqual(result, parsePageDocument(result));
  assert.deepEqual(ids(applyPageCommand(fixture(), commands[0]), "right"), []);
});

test("empty page can be populated, cleared and restored with history", () => {
  const page = fixture();
  page.root.children = [];
  let history = createPageHistory(page);
  history = executePageCommands(history, [{ type: "insert", parentId: "root", index: 0, node: stack("empty", []) }]);
  history = executePageCommands(history, [{ type: "insert", parentId: "empty", index: 0, node: text("first") }]);
  history = executePageCommands(history, [{ type: "delete", nodeId: "first" }]);
  assert.deepEqual(ids(history.present, "empty"), []);
  assert.deepEqual(ids(undoPage(history).present, "empty"), ["first"]);
  history = executePageCommands(history, [{ type: "delete", nodeId: "empty" }]);
  assert.deepEqual(history.present, page);
  assert.deepEqual(redoPage(undoPage(history)).present, page);
});

test("duplicate insert IDs reject immediately even if a later delete would repair the tree", () => {
  rejectsWithoutMutation(fixture(), [
    { type: "insert", parentId: "left", index: 0, node: text("a") },
    { type: "delete", nodeId: "a" },
  ]);
  rejectsWithoutMutation(fixture(), [
    { type: "insert", parentId: "root", index: 0, node: stack("new-stack", [text("same"), text("same")]) },
    { type: "delete", nodeId: "new-stack" },
  ]);
});

test("root edits and moves into self or descendants reject without mutation", () => {
  for (const command of [
    { type: "delete", nodeId: "root" },
    { type: "move", nodeId: "root", parentId: "left", index: 0 },
    { type: "move", nodeId: "left", parentId: "left", index: 0 },
  ]) rejectsWithoutMutation(fixture(), [command]);
  const page = fixture();
  find(page.root, "left").children.push(stack("nested", [text("nested-text")]));
  rejectsWithoutMutation(page, [{ type: "move", nodeId: "left", parentId: "nested", index: 0 }]);
});

test("unknown commands, missing nodes and invalid indexes reject", () => {
  for (const command of [
    { type: "unknown" },
    { type: "delete", nodeId: "missing" },
    { type: "update", nodeId: "missing", text: "Changed" },
    { type: "move", nodeId: "missing", parentId: "left", index: 0 },
    { type: "move", nodeId: "a", parentId: "missing", index: 0 },
    { type: "insert", parentId: "missing", index: 0, node: text("new") },
    ...[-1, 4, 0.5].map((index) => ({ type: "insert", parentId: "left", index, node: text("new") })),
    { type: "move", nodeId: "a", parentId: "left", index: 3 },
  ]) rejectsWithoutMutation(fixture(), [command]);
});

test("final validator rejects invalid slots and missing required props", () => {
  for (const command of [
    { type: "insert", parentId: "left", index: 0, node: { id: "slot", kind: "gridItem", children: [text("slot-text")] } },
    { type: "insert", parentId: "left", index: 0, node: { id: "input", kind: "input", props: { name: "input" } } },
  ]) rejectsWithoutMutation(fixture(), [command]);
  const page = applyPageCommand(fixture(), { type: "insert", parentId: "left", index: 0, node: { id: "input", kind: "input", props: { name: "input", label: "Input" } } });
  rejectsWithoutMutation(page, [{ type: "update", nodeId: "input", props: { label: null } }]);
});

test("malicious and invalid updates reject atomically after an otherwise valid edit", () => {
  for (const props of [
    { style: "color:red" }, { onClick: "alert(1)" }, { variant: "invalid" },
    JSON.parse('{"__proto__":{"polluted":true}}'),
    { constructor: "malicious" },
  ]) rejectsWithoutMutation(fixture(), [
    { type: "rename", name: "Must not leak" },
    { type: "update", nodeId: "a", props },
  ]);
  rejectsWithoutMutation(fixture(), [{ type: "update", nodeId: "left", text: "Unexpected" }]);
  rejectsWithoutMutation(fixture(), [{ type: "update", nodeId: "a", text: "" }]);
  assert.equal(Object.hasOwn(Object.prototype, "polluted"), false);
});

test("each batch is one history step and undo/redo round trips the full document", () => {
  const initial = createPageHistory(fixture());
  assert.equal(initial.limit, 50);
  assert.deepEqual(initial.past, []);
  assert.deepEqual(initial.future, []);
  const before = structuredClone(initial);
  const commands = freeze([
    { type: "rename", name: "Edited" },
    { type: "update", nodeId: "a", text: "Edited text" },
    { type: "move", nodeId: "c", parentId: "right", index: 1 },
  ]);
  const edited = executePageCommands(freeze(initial), commands);
  assert.equal(edited.past.length, 1);
  assert.deepEqual(edited.past[0], initial.present);
  assert.deepEqual(edited.present, applyPageCommands(initial.present, commands));
  const undone = undoPage(freeze(edited));
  assert.deepEqual(undone.present, initial.present);
  assert.deepEqual(undone.past, []);
  assert.deepEqual(undone.future, [edited.present]);
  const redone = redoPage(freeze(undone));
  assert.deepEqual(redone, edited);
  assert.deepEqual(initial, before);
  assert.strictEqual(undoPage(initial), initial);
  assert.strictEqual(redoPage(edited), edited);
});

test("no-op batches preserve history reference and redo; real edits clear redo", () => {
  const initial = createPageHistory(fixture());
  const undone = freeze(undoPage(executePageCommands(initial, [{ type: "rename", name: "First edit" }])));
  for (const commands of [
    [], [{ type: "rename", name: undone.present.name }],
    [{ type: "update", nodeId: "a", text: "a" }],
    [{ type: "move", nodeId: "b", parentId: "left", index: 1 }],
    [{ type: "rename", name: "Temporary" }, { type: "rename", name: undone.present.name }],
  ]) assert.strictEqual(executePageCommands(undone, freeze(commands)), undone);
  const edited = executePageCommands(undone, [{ type: "rename", name: "New branch" }]);
  assert.deepEqual(edited.future, []);
  assert.equal(undone.future.length, 1);
});

test("history is bounded and creating history for a new page starts clean", () => {
  let history = createPageHistory(fixture(), 2);
  for (const name of ["One", "Two", "Three"]) history = executePageCommands(history, [{ type: "rename", name }]);
  assert.equal(history.limit, 2);
  assert.deepEqual(history.past.map((page) => page.name), ["One", "Two"]);
  history = undoPage(history);
  assert.equal(history.present.name, "Two");
  history = undoPage(history);
  assert.equal(history.present.name, "One");
  assert.strictEqual(undoPage(history), history);
  history = redoPage(redoPage(history));
  assert.equal(history.present.name, "Three");
  const page = fixture();
  page.id = "new-page";
  const fresh = createPageHistory(freeze(page));
  assert.deepEqual(fresh.present, parsePageDocument(page));
  assert.deepEqual(fresh.past, []);
  assert.deepEqual(fresh.future, []);
});

test("batch and history limit boundaries reject invalid configuration", () => {
  const page = fixture();
  const batch = Array.from({ length: 100 }, () => ({ type: "rename", name: page.name }));
  assert.deepEqual(applyPageCommands(page, batch), page);
  assert.throws(() => applyPageCommands(page, [...batch, batch[0]]), /batch limit/);
  for (const limit of [0, -1, 0.5, 101, Infinity, NaN]) assert.throws(() => createPageHistory(page, limit), /history: limit/);
  assert.equal(createPageHistory(page, 1).limit, 1);
  assert.equal(createPageHistory(page, 100).limit, 100);
});

test("equivalent prop key order does not create a history step or clear redo", () => {
  const page = fixture();
  find(page.root, "left").props = { gap: "md", direction: "row" };
  const history = undoPage(executePageCommands(createPageHistory(page), [{ type: "rename", name: "Redo" }]));
  const commands = [
    { type: "update", nodeId: "left", props: { gap: null } },
    { type: "update", nodeId: "left", props: { gap: "md" } },
  ];
  assert.strictEqual(executePageCommands(history, commands), history);
  assert.equal(history.future.length, 1);
});

test("history snapshots are detached from previous states and source documents", () => {
  const page = fixture();
  const history = createPageHistory(page);
  find(page.root, "a").text = "Outside change";
  assert.equal(find(history.present.root, "a").text, "a");
  const edited = executePageCommands(history, [{ type: "rename", name: "Edited" }]);
  find(edited.past[0].root, "a").text = "Past mutation";
  assert.equal(find(history.present.root, "a").text, "a");
  const undone = undoPage(edited);
  find(undone.future[0].root, "b").text = "Future mutation";
  assert.equal(find(edited.present.root, "b").text, "b");
});

test("invalid command batches leave present, history and redo untouched", () => {
  const initial = createPageHistory(fixture());
  const history = freeze(undoPage(executePageCommands(initial, [{ type: "rename", name: "Redo target" }])));
  const before = structuredClone(history);
  const commands = freeze([
    { type: "rename", name: "Must not leak" },
    { type: "delete", nodeId: "root" },
  ]);
  const commandsBefore = structuredClone(commands);
  assert.throws(() => executePageCommands(history, commands));
  assert.deepEqual(history, before);
  assert.deepEqual(commands, commandsBefore);
  assert.equal(history.past.length, 0);
  assert.equal(redoPage(history).present.name, "Redo target");
});
