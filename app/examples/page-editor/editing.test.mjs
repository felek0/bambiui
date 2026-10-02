import assert from "node:assert/strict";
import test from "node:test";
import { createEditorNode, allowedChildKinds, locateNode } from "./editing.ts";
import { nodeRegistry } from "../../studio/page-document/registry.ts";
import { parsePageDocument } from "../../studio/page-document/model.ts";
import { applyPageCommand } from "../../studio/page-document/commands.ts";

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
    const tree = parent.kind === "container" ? parent : parent.kind === "cardHeader" || parent.kind === "cardContent" ? root([{ id: "card", kind: "card", children: [parent] }]) : parent.kind === "gridItem" ? root([{ id: "grid", kind: "grid", children: [parent] }]) : root([parent]);
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
  assert.deepEqual(allowedChildKinds(tree, "card"), ["cardContent"]);
  assert.deepEqual(allowedChildKinds(tree, "header"), ["cardDescription"]);
  assert.deepEqual(allowedChildKinds(tree, "title"), []);
  assert.deepEqual(allowedChildKinds(tree, "missing"), []);
  assert.equal(locateNode(tree, "stack").ancestors[1].id, "form");
});

test("adjacent reorder uses destination index after removal", () => {
  const initial = page(root(["a", "b", "c"].map((id) => ({ id, kind: "text", text: id }))));
  const found = locateNode(initial.root, "b");
  const moved = applyPageCommand(initial, { type: "move", nodeId: "b", parentId: "root", index: found.index + 1 });
  assert.deepEqual(moved.root.children.map((node) => node.id), ["a", "c", "b"]);
  assert.deepEqual(initial.root.children.map((node) => node.id), ["a", "b", "c"]);
});
