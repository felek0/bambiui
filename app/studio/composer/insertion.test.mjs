import assert from "node:assert/strict";
import test from "node:test";
import { createInsertionNode, proposeInsertion, insertionProposalCache } from "./insertion.ts";
import { createComposerFrame, composerFrameToPageDocument, pageDocumentToComposerPage } from "./model.ts";
import { createPageHistory, executePageCommands, undoPage, redoPage } from "../page-document/history.ts";
import { parsePageDocument } from "../page-document/model.ts";
import { createComposerHistory, executeComposerCommands, undoComposer, redoComposer } from "./history.ts";
import { exportPageTSX } from "../page-document/export.ts";

const ids = () => { let count = 0; return () => `insert-${++count}`; };
const page = children => ({ version: 1, id: "page", name: "Page", root: { id: "root", kind: "container", props: { maxWidth: "full" }, children } });
const target = (parentId, index = 0) => ({ parentId, index });
const stack = (id, children = []) => ({ id, kind: "stack", children });

test("all component and layout factories have populated parameters and independent valid trees", () => {
  for (const kind of ["button", "input", "switch", "checkbox", "badge", "card", "text", "stack", "grid"]) {
    const node = createInsertionNode(kind, ids());
    assert.doesNotThrow(() => parsePageDocument(page([stack("slot", [node])])));
    assert.equal(node.appearance, undefined); assert.equal(node.parts, undefined);
    if (!["stack", "grid"].includes(kind)) assert.equal(node.props.size, "md");
    else assert.deepEqual(node.children, []);
    if (["input", "switch", "checkbox"].includes(kind)) { assert.ok(node.props.label); assert.ok(node.props.description); assert.equal(node.props.name, node.id); }
    if (kind === "card") assert.deepEqual(node.children.map(child => child.kind), ["cardHeader", "cardContent", "cardFooter"]);
    const other = createInsertionNode(kind, ids());
    node.text = "Changed"; node.children?.push(stack("extra"));
    assert.notEqual(other.text, "Changed"); assert.notEqual(other.children?.at(-1)?.id, "extra");
  }
});

test("root control wrappers are explicit, deterministic and one undoable atomic insertion", () => {
  for (const kind of ["button", "input", "switch", "checkbox"]) {
    const input = page([]), original = structuredClone(input);
    const result = proposeInsertion(input, target("root"), kind, ids());
    assert.equal(result.ok, true); assert.match(result.hint, /Stack/);
    assert.deepEqual(result.wrappers.map(wrapper => wrapper.kind), ["stack"]);
    assert.equal(result.commands.length, 1);
    assert.equal(result.page.root.children[0].children[0].id, result.nodeId);
    const history = executePageCommands(createPageHistory(input), result.commands);
    assert.equal(history.past.length, 1); assert.deepEqual(history.present, result.page);
    assert.deepEqual(undoPage(history).present, input);
    assert.deepEqual(redoPage(undoPage(history)).present, result.page);
    assert.deepEqual(input, original);
    assert.deepEqual(proposeInsertion(input, target("root"), kind, ids()), result);
  }
});

test("Grid Card uses Grid.Item with populated slots; further Card insertion still targets content, never header", () => {
  const grid = page([{ id: "grid", kind: "grid", children: [] }]);
  const result = proposeInsertion(grid, target("grid"), "card", ids());
  assert.equal(result.ok, true); assert.deepEqual(result.wrappers.map(w => w.kind), ["gridItem"]);
  const insertedCard = result.page.root.children[0].children[0].children[0];
  assert.deepEqual(insertedCard.children.map(child => child.kind), ["cardHeader", "cardContent", "cardFooter"]);
  assert.equal(insertedCard.children[1].children[0].kind, "text");
  const extra = proposeInsertion(result.page, target(insertedCard.id, 0), "input", () => "extra-input");
  assert.equal(extra.ok, true); assert.equal(extra.commands[0].parentId, insertedCard.children[1].id); assert.equal(extra.commands[0].index, 1);
  const card = page([{ id: "card", kind: "card", children: [{ id: "header", kind: "cardHeader", children: [{ id: "title", kind: "cardTitle", text: "Title" }] }] }]);
  const body = proposeInsertion(card, target("card", 1), "checkbox", ids());
  assert.equal(body.ok, true); assert.deepEqual(body.wrappers.map(w => w.kind), ["cardContent"]);
  assert.equal(body.page.root.children[0].children[1].children[0].kind, "checkbox");
  const append = proposeInsertion(body.page, target("card", 0), "button", () => "append-button");
  assert.equal(append.ok, true); assert.deepEqual(append.wrappers, []);
  assert.match(append.hint, /Append.*existing Card.Content/);
  assert.equal(append.commands[0].parentId, body.wrappers[0].id);
  assert.equal(append.commands[0].index, 1);
  assert.equal(proposeInsertion(card, target("header"), "button", ids()).ok, false);
  assert.equal(proposeInsertion(card, target("title"), "button", ids()).ok, false);
});

test("invalid targets, IDs, indices and limits never mutate or fall back to ancestors", () => {
  const input = page([stack("slot"), { id: "text", kind: "text", text: "Text" }]);
  const original = structuredClone(input);
  for (const destination of [target("missing"), target("text"), target("slot", -1), target("slot", 0.5), target("slot", 1)]) {
    const result = proposeInsertion(input, destination, "button", ids());
    assert.equal(result.ok, false); assert.ok(result.hint);
  }
  assert.equal(proposeInsertion(input, target("slot"), "card", () => "root").ok, false);
  assert.equal(proposeInsertion(input, target("slot"), "form", ids()).ok, false);
  const full = page(Array.from({ length: 99 }, (_, i) => ({ id: `text-${i}`, kind: "text", text: "Text" })));
  assert.equal(proposeInsertion(full, target("root"), "button", ids()).ok, false);
  let deep = stack("depth-12");
  for (let i = 11; i >= 1; i--) deep = stack(`depth-${i}`, [deep]);
  assert.equal(proposeInsertion(page([deep]), target("depth-12"), "button", ids()).ok, false);
  const nested = page([{ id: "form", kind: "form", props: { action: "/" }, children: [{ id: "inner", kind: "form", props: { action: "/" }, children: [] }] }]);
  assert.equal(proposeInsertion(nested, target("form"), "button", ids()).ok, false);
  assert.deepEqual(input, original);
});

test("proposal commits through composer nodeCommands as one whole-project history step", () => {
  const frame = createComposerFrame("frame", "root");
  const project = { version: 1, id: "project", name: "Project", systemId: "original", pages: [{ id: "page", name: "Page", frames: [frame] }] };
  const proposal = proposeInsertion(composerFrameToPageDocument(frame), target("root"), "button", ids());
  assert.equal(proposal.ok, true);
  const history = createComposerHistory(project);
  const command = { type: "nodeCommands", pageId: "page", frameId: "frame", commands: proposal.commands };
  const next = executeComposerCommands(history, [command]);
  assert.equal(next.past.length, 1);
  assert.deepEqual(next.present.pages[0].frames[0].root, proposal.page.root);
  assert.deepEqual(undoComposer(next).present, project);
  assert.deepEqual(redoComposer(undoComposer(next)).present, next.present);
  const before = structuredClone(next);
  assert.throws(() => executeComposerCommands(next, [command]), /duplicate/);
  assert.deepEqual(next, before);
});

test("candidate cache reuses valid/invalid proposals, avoids existing IDs and preserves the source", () => {
  const input = page([stack('insert1'), stack('slot')]), original = structuredClone(input);
  const cached = insertionProposalCache(input, 'card');
  const first = cached(target('slot'));
  assert.equal(first.ok, true); assert.notEqual(first.nodeId, 'insert1');
  for (let i = 0; i < 100; i++) assert.equal(cached(target('slot')), first);
  const invalid = cached(target('missing'));
  assert.equal(invalid.ok, false); assert.equal(cached(target('missing')), invalid);
  assert.notEqual(cached(target('root', 1)), first);
  assert.deepEqual(input, original);
  assert.deepEqual(insertionProposalCache(input, 'card')(target('slot')), first);
});

test("cached validity includes node/depth limits, not just registry slot compatibility", () => {
  const full = page(Array.from({ length: 99 }, (_, i) => ({ id: `t${i}`, kind: 'text', text: 'Text' })));
  const cache = insertionProposalCache(full, 'button');
  const result = cache(target('root', 99)); assert.equal(result.ok, false);
  assert.equal(cache(target('root', 99)), result);
  let deep = stack('depth12');
  for (let i = 11; i >= 1; i--) deep = stack(`depth${i}`, [deep]);
  assert.equal(insertionProposalCache(page([deep]), 'button')(target('depth12')).ok, false);
});

test("defaults are captured by candidate caches and applied only to newly inserted content", () => {
  const input = page([stack("slot", [{ id: "existing", kind: "button", text: "Keep my content", props: { variant: "link" }, appearance: { fontSize: 17.5 } }])]);
  const before = structuredClone(input), defaults = { button: { text: "System action", props: { variant: "secondary", size: "lg" } } };
  const cache = insertionProposalCache(input, "button", defaults);
  defaults.button.text = "Changed outside gesture";
  const proposal = cache(target("slot", 1));
  assert.equal(proposal.ok, true); assert.equal(proposal.commands[0].node.text, "System action");
  assert.equal(proposal.commands[0].node.props.variant, "secondary"); assert.equal(proposal.commands[0].node.props.size, "lg");
  assert.deepEqual(proposal.page.root.children[0].children[0], before.root.children[0].children[0]);
  assert.deepEqual(input, before);
  assert.equal(proposeInsertion(input, target("slot", 1), "button", ids(), defaults).commands[0].node.text, "Changed outside gesture");
  assert.equal(proposeInsertion(input, target("slot", 1), "button", ids(), { button: { props: { name: "no" } } }).ok, false);
});

test("populated Card proposals account for every descendant in node and depth quotas", () => {
  const nearLimit = count => page(Array.from({ length: count }, (_, i) => ({ id: `existing-${i}`, kind: "text", text: "Existing" })));
  assert.equal(insertionProposalCache(nearLimit(91), "card")(target("root", 91)).ok, true);
  assert.equal(insertionProposalCache(nearLimit(92), "card")(target("root", 92)).ok, false);
  let deep = stack("depth-10");
  for (let i = 9; i >= 1; i--) deep = stack(`depth-${i}`, [deep]);
  assert.equal(insertionProposalCache(page([deep]), "card")(target("depth-10")).ok, false);
  assert.equal(insertionProposalCache(page([deep]), "text")(target("depth-10")).ok, true);
});

test("new frame full-width root survives adapter/export; legacy root geometry stays unchanged", () => {
  const frame = createComposerFrame("frame", "root");
  assert.deepEqual(frame.root.props, { maxWidth: "full" });
  const doc = composerFrameToPageDocument(frame);
  assert.match(exportPageTSX(doc), /maxWidth=\{"full"\}/);
  for (const props of [undefined, { maxWidth: "wide" }, { maxWidth: "narrow" }]) {
    const legacy = page([]); if (props) legacy.root.props = props; else delete legacy.root.props;
    assert.deepEqual(pageDocumentToComposerPage(legacy, "page", "frame").frames[0].root, legacy.root);
  }
});
