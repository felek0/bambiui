import assert from "node:assert/strict";
import test from "node:test";
import { createEditorNode, allowedChildKinds, locateNode, eligibleMoveDestinations } from "./editing.ts";
import { nodeRegistry } from "../../studio/page-document/registry.ts";
import { parsePageDocument } from "../../studio/page-document/model.ts";
import { applyPageCommand } from "../../studio/page-document/commands.ts";

import { createPageHistory, executePageCommands, undoPage, redoPage } from "../../studio/page-document/history.ts";

const page = (root) => ({ version: 1, id: "demo", name: "Demo", root });
const root = (children) => ({ id: "root", kind: "container", children });
const nextId = () => { let count = 0; return () => `node-${++count}`; };

test("every registry kind gets a valid default subtree in an allowed slot", () => {
  for (const kind of Object.keys(nodeRegistry)) {
    const node = createEditorNode(kind, nextId());
    const seen = new Set();
    const visit = (node) => { assert.ok(!seen.has(node.id)); seen.add(node.id); node.children?.forEach(visit); };
    visit(node);
    const parentKind = Object.keys(nodeRegistry).find((parent) => nodeRegistry[parent].children.includes(kind));
    const parent = parentKind ? { id: "parent", kind: parentKind, children: [node] } : node;
    const tree = parent.kind === "container" ? parent : parent.kind === "cardHeader" || parent.kind === "cardContent" || parent.kind === "cardFooter" ? root([{ id: "card", kind: "card", children: [parent] }]) : parent.kind === "gridItem" ? root([{ id: "grid", kind: "grid", children: [parent] }]) : root([parent]);
    assert.doesNotThrow(() => parsePageDocument(page(tree)), kind);
  }
});

test("empty layout slots stay explicit; card and header get required children", () => {
  for (const kind of ["container", "stack", "grid", "gridItem", "form", "cardContent"]) assert.deepEqual(createEditorNode(kind, nextId()).children, []);
  const card = createEditorNode("card", nextId());
  assert.equal(card.children[0].kind, "cardHeader");
  assert.equal(card.children[0].children[0].kind, "cardTitle");
});

test("allowed children exclude occupied unique slots and nested forms through ancestors", () => {
  const tree = root([{ id: "form", kind: "form", props: { action: "/" }, children: [{ id: "stack", kind: "stack", children: [] }] }, { id: "card", kind: "card", children: [{ id: "header", kind: "cardHeader", children: [{ id: "title", kind: "cardTitle", text: "Title" }] }] }]);
  assert.ok(!allowedChildKinds(tree, "stack").includes("form"));
  assert.deepEqual(allowedChildKinds(tree, "card"), ["cardContent", "cardFooter"]);
  assert.deepEqual(allowedChildKinds(tree, "header"), ["cardDescription"]);
  assert.deepEqual(allowedChildKinds(tree, "title"), []);
  assert.deepEqual(allowedChildKinds(tree, "missing"), []);
  assert.equal(locateNode(tree, "stack").ancestors[1].id, "form");
});

const text = (id) => ({ id, kind: "text", text: "Same name" });
const stack = (id, children = []) => ({ id, kind: "stack", children });
const targets = (document, id) => eligibleMoveDestinations(document, id).map((target) => target.parentId);

test("destinations protect root, exclude current parent, self and descendants, and use unique stable paths", () => {
  const document = page(root([stack("a", [stack("child")]), stack("b"), stack("c")]));
  assert.deepEqual(targets(document, "root"), []);
  assert.deepEqual(targets(document, "missing"), []);
  assert.deepEqual(targets(document, "a"), ["b", "c"]);
  const options = eligibleMoveDestinations(document, "a");
  assert.equal(new Set(options.map((item) => item.label)).size, options.length);
  assert.match(options[0].label, /\[root\].*\[b\]/);
  assert.deepEqual(eligibleMoveDestinations(document, "a"), options);
});

test("slot kinds, unique slots and nonempty card/header sources are authoritative", () => {
  const header = (id, children) => ({ id, kind: "cardHeader", children });
  const title = (id) => ({ id, kind: "cardTitle", text: "Title" });
  const content = (id) => ({ id, kind: "cardContent", children: [] });
  const card = (id, children) => ({ id, kind: "card", children });
  const document = page(root([card("a", [header("ha", [title("ta")]), content("ca")]), card("b", [content("cb")])]));
  assert.deepEqual(targets(document, "ha"), ["b"]);
  assert.deepEqual(targets(document, "ca"), []);
  assert.deepEqual(targets(document, "ta"), []);
  assert.deepEqual(targets(document, "cb"), []);
  const expanded = structuredClone(document);
  expanded.root.children[1].children.unshift(header("hb", [{ id: "description", kind: "cardDescription", text: "Description" }]));
  assert.deepEqual(targets(expanded, "ha"), []);
  expanded.root.children[0].children[0].children.push({ id: "da", kind: "cardDescription", text: "Description" });
  assert.deepEqual(targets(expanded, "ta"), ["hb"]);
});

test("forms inside moved subtrees cannot enter form ancestors", () => {
  const form = (id, children) => ({ id, kind: "form", props: { action: "/" }, children });
  const document = page(root([stack("source", [form("inner", [])]), form("outer", [stack("inside")]), stack("safe")]));
  assert.deepEqual(targets(document, "source"), ["safe"]);
  assert.deepEqual(targets(document, "inner"), ["root", "safe"]);
});

test("depth limits reject destinations that overflow with a moved subtree", () => {
  let deep = stack("depth12");
  for (let depth = 11; depth >= 1; depth--) deep = stack(`depth${depth}`, [deep]);
  const document = page(root([stack("source", [text("leaf")]), deep]));
  parsePageDocument(document);
  assert.ok(targets(document, "source").includes("depth10"));
  assert.ok(!targets(document, "source").includes("depth11"));
  assert.ok(!targets(document, "source").includes("depth12"));
});

test("moves at the 100-node limit append after removal, roundtrip and take one history step", () => {
  const document = page(root([stack("source", [text("moved")]), stack("destination", Array.from({ length: 96 }, (_, i) => text(`text${i}`)))]));
  const original = structuredClone(document);
  const target = eligibleMoveDestinations(document, "moved").find((item) => item.parentId === "destination");
  assert.equal(target.command.index, 96);
  const history = createPageHistory(document);
  const moved = executePageCommands(history, [target.command]);
  assert.equal(moved.past.length, 1);
  assert.equal(locateNode(moved.present.root, "moved").index, 96);
  assert.deepEqual(undoPage(moved).present, document);
  assert.deepEqual(redoPage(undoPage(moved)).present, moved.present);
  assert.deepEqual(JSON.parse(JSON.stringify(moved.present)), parsePageDocument(moved.present));
  assert.deepEqual(document, original);
  const invalid = structuredClone(document);
  invalid.root.children.push(text("overflow"));
  assert.deepEqual(targets(invalid, "moved"), []);
  const before = structuredClone(moved);
  assert.throws(() => executePageCommands(moved, [{ type: "move", nodeId: "destination", parentId: "destination", index: 0 }]));
  assert.deepEqual(moved, before);
});

test("adjacent reorder uses destination index after removal", () => {
  const initial = page(root(["a", "b", "c"].map((id) => ({ id, kind: "text", text: id }))));
  const found = locateNode(initial.root, "b");
  const moved = applyPageCommand(initial, { type: "move", nodeId: "b", parentId: "root", index: found.index + 1 });
  assert.deepEqual(moved.root.children.map((node) => node.id), ["a", "c", "b"]);
  assert.deepEqual(initial.root.children.map((node) => node.id), ["a", "b", "c"]);
});
