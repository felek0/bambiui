import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "../page-document/parity-loader.mjs";
import { assetSelectionReason, createSelectionAsset, prepareAssetInsertion, assetIdAllocator } from "./assets.ts";
import { applyComposerCommand } from "./commands.ts";
import { COMPOSER_LIMITS, createComposerDocument, createComposerPage, createComposerFrame, parseComposerDocument } from "./model.ts";
import { flattenNodes, nodePath } from "./selection.ts";
import { serializeComposerEnvelope, deserializeComposerEnvelope } from "./storage.ts";
import { ComposerController } from "./controller.ts";

const input = () => ({ id: "email", kind: "input", props: { label: "Email", name: "email", size: "lg", radius: "sm", required: true, readOnly: false, defaultValue: "", error: "Check your address" },
  appearance: { paddingTop: 11.25, width: "fill", background: "#f1f2f3", shadow: "md" },
  parts: { label: { color: "#112233", fontSize: 13.5 }, control: { borderTopLeftRadius: 7.25 }, error: { marginTop: 2.5 } } });
const card = () => ({ id: "card", kind: "card", props: { variant: "filled", size: "sm", radius: "lg" }, appearance: { gap: 17.25 }, children: [
  { id: "header", kind: "cardHeader", children: [{ id: "title", kind: "cardTitle", text: "Join us", appearance: { fontWeight: 700 } }] },
  { id: "body", kind: "cardContent", children: [input()] },
] });
function fixture() {
  const document = createComposerDocument("project", "original");
  const page = createComposerPage("page");
  const frame = createComposerFrame("frame", "root");
  frame.root.children = [card(), { id: "grid", kind: "grid", children: [] }, { id: "form", kind: "form", props: { action: "/save" }, children: [] }];
  page.frames.push(frame); document.pages.push(page);
  return parseComposerDocument(document);
}
const select = (nodeId) => ({ projectId: "project", pageId: "page", frameId: "frame", nodeId });
const target = (parentId = "root", index = 0) => ({ projectId: "project", pageId: "page", frameId: "frame", parentId, index });
const root = (document) => document.pages[0].frames[0].root;
function save(document, nodeId = "card", id = "asset") {
  return applyComposerCommand(document, { type: "saveAsset", asset: createSelectionAsset(document, select(nodeId), id, "Custom component") });
}
const withoutIds = (node) => { const copy = structuredClone(node); for (const { node } of flattenNodes(copy)) delete node.id; return copy; };

function frozen(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}

test("selection eligibility explains roots/compound slots/missing selections and snapshots retain all overrides", () => {
  const document = frozen(fixture());
  assert.match(assetSelectionReason(null, null), /Open a project/);
  assert.match(assetSelectionReason(document, null), /Select a component/);
  assert.match(assetSelectionReason(document, select("root")), /Frame roots/);
  for (const node of ["header", "title", "body"]) assert.match(assetSelectionReason(document, select(node)), /Compound slots/);
  assert.match(assetSelectionReason(document, { ...select("email"), projectId: "other" }), /Select a component/);
  for (const node of ["email", "card", "grid", "form"]) assert.equal(assetSelectionReason(document, select(node)), null);
  const asset = createSelectionAsset(document, select("card"), "asset", "Named");
  assert.deepEqual(asset.root, card());
  asset.root.children[1].children[0].parts.label.color = "#ffffff";
  assert.equal(nodePath(root(document), "email").at(-1).parts.label.color, "#112233");
  const full = { ...document, assets: Array.from({ length: COMPOSER_LIMITS.assets }, (_, i) => ({ ...asset, id: `a${i}` })) };
  assert.match(assetSelectionReason(full, select("email")), /32 saved components/);
});

test("repeated insertions remap every descendant and preserve appearance/parts, never aliasing source or assets", () => {
  let document = save(fixture());
  const base = "n".repeat(64);
  document.pages[0].frames.push(createComposerFrame("other-frame", base));
  document.assets.push({ id: "reserved", name: "Reserved", root: { id: `${base.slice(0, 62)}-1`, kind: "text", text: "Reserved ID" } });
  const before = structuredClone(document), previous = new Set(document.assets.flatMap(asset => flattenNodes(asset.root).map(({ node }) => node.id)));
  for (const page of document.pages) for (const frame of page.frames) for (const { node } of flattenNodes(frame.root)) previous.add(node.id);
  for (let i = 0; i < 3; i++) {
    const proposal = prepareAssetInsertion(frozen(document), "asset", target(), () => base);
    const next = applyComposerCommand(document, proposal.command);
    const inserted = nodePath(root(next), proposal.selection.nodeId).at(-1);
    assert.deepEqual(withoutIds(inserted), withoutIds(card()));
    for (const { node } of flattenNodes(inserted)) {
      assert.equal(previous.has(node.id), false, `fresh ID: ${node.id}`);
      assert.match(node.id, /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/); previous.add(node.id);
    }
    assert.deepEqual(document.assets, before.assets);
    document = next;
  }
  const allLive = document.pages.flatMap(page => page.frames.flatMap(frame => flattenNodes(frame.root).map(({ node }) => node.id)));
  assert.equal(new Set(allLive).size, allLive.length);
  const inserted = root(document).children[0].children[1].children[0];
  inserted.parts.label.color = "#abcdef";
  assert.equal(document.assets[0].root.children[1].children[0].parts.label.color, "#112233");
  assert.equal(nodePath(root(document), "email").at(-1).parts.label.color, "#112233");
  assert.equal(root(document).children[1].children[1].children[0].parts.label.color, "#112233");
});

test("saved controls use the existing exact Container, Grid and Card body adapters", () => {
  const document = save(fixture(), "email");
  root(document).children.push({ id: "empty-card", kind: "card", children: [{ id: "empty-header", kind: "cardHeader", children: [{ id: "empty-title", kind: "cardTitle", text: "Header only" }] }] });
  for (const [parentId, wrapperKind, actualParent] of [["root", "stack", "root"], ["grid", "gridItem", "grid"], ["card", null, "body"], ["empty-card", "cardContent", "empty-card"]]) {
    let serial = 0;
    const proposal = prepareAssetInsertion(document, "asset", target(parentId), () => `copy${++serial}`);
    assert.deepEqual(proposal.wrappers.map(wrapper => wrapper.kind), wrapperKind ? [wrapperKind] : []);
    assert.equal(proposal.command.commands.length, 1);
    assert.equal(proposal.command.commands[0].parentId, actualParent);
    if (parentId === "card") { assert.equal(proposal.command.commands[0].index, 1); assert.match(proposal.hint, /existing Card.Content/); }
    const result = applyComposerCommand(document, proposal.command);
    assert.deepEqual(withoutIds(nodePath(root(result), proposal.selection.nodeId).at(-1)), withoutIds(input()));
    assert.deepEqual(result.assets, document.assets);
  }
});

test("asset insertion refuses exact invalid targets, nested forms, unsupported children and every applicable quota", () => {
  const document = save(fixture(), "email"), before = structuredClone(document);
  for (const invalid of [target("email"), target("header"), target("missing"), target("root", -1), target("root", 999), target("root", 0.5), { ...target(), projectId: "foreign" }, { ...target(), pageId: "foreign" }, { ...target(), frameId: "foreign" }]) {
    assert.throws(() => prepareAssetInsertion(document, "asset", invalid, () => "fresh"));
    assert.deepEqual(document, before);
  }
  assert.throws(() => prepareAssetInsertion(document, "missing", target(), () => "fresh"), /no longer available/);
  const formDocument = save(fixture(), "form");
  assert.throws(() => prepareAssetInsertion(formDocument, "asset", target("grid"), () => "fresh"), /Cannot insert/);
  assert.throws(() => prepareAssetInsertion(formDocument, "asset", target("card"), () => "fresh"), /Cannot insert/);
  root(formDocument).children.push({ id: "nested-form-layout", kind: "stack", children: [{ id: "inner-form", kind: "form", props: { action: "/save" }, children: [] }] });
  const nested = save(formDocument, "nested-form-layout", "nested");
  assert.throws(() => prepareAssetInsertion(nested, "nested", target("form"), () => "fresh"), /nested form/);
  const full = save(fixture(), "email");
  root(full).children = Array.from({ length: 99 }, (_, i) => ({ id: `text${i}`, kind: "text", text: "Filler" }));
  assert.throws(() => prepareAssetInsertion(full, "asset", target(), () => "fresh"), /limit/);
  const deep = save(fixture(), "email");
  let child = { id: "deepest", kind: "stack", children: [] };
  for (let i = 0; i < 11; i++) child = { id: `level${i}`, kind: "stack", children: [child] };
  root(deep).children = [child];
  assert.throws(() => prepareAssetInsertion(deep, "asset", target("deepest"), () => "fresh"), /limit/);
  const project = createComposerDocument("project", "original");
  project.pages = Array.from({ length: 2 }, (_, p) => ({ id: p ? "second-page" : "page", name: "Page", frames: Array.from({ length: 10 }, (_, f) => ({ ...createComposerFrame(p || f ? `f${p}-${f}` : "frame", p || f ? `root${p}-${f}` : "root"), root: { id: p || f ? `root${p}-${f}` : "root", kind: "container", children: Array.from({ length: 99 }, (_, i) => ({ id: `text${i}`, kind: "text", text: "Filler" })) } })) }));
  root(project).children.pop();
  project.assets = [{ id: "asset", name: "One", root: { id: "snapshot", kind: "text", text: "Saved" } }];
  assert.doesNotThrow(() => parseComposerDocument(project));
  assert.throws(() => prepareAssetInsertion(project, "asset", target(), () => "fresh"), /project: node limit/);
});

test("invalid allocator values fail instead of mutating snapshot IDs or accepting illegal node IDs", () => {
  const document = save(fixture()), before = structuredClone(document);
  for (const invalid of ["", "9starts-with-number", "a".repeat(65), "bad id", null, 4]) {
    assert.throws(() => prepareAssetInsertion(document, "asset", target(), () => invalid), /allocator/);
    assert.deepEqual(document, before);
  }
  const next = assetIdAllocator(document, () => "card");
  assert.equal(next(), "card-1"); assert.equal(next(), "card-2");
});

test("JSON backup and existing storage envelope preserve assets and omitted historical fields", () => {
  const document = save(fixture());
  assert.deepEqual(parseComposerDocument(JSON.parse(JSON.stringify(document, null, 2))), document);
  const raw = serializeComposerEnvelope({ version: 1, revision: 7, document }, document.id);
  const restored = deserializeComposerEnvelope(raw, document.id);
  assert.deepEqual(restored.document, document);
  restored.document.assets[0].root.children[1].children[0].parts.label.fontSize = 18;
  assert.equal(document.assets[0].root.children[1].children[0].parts.label.fontSize, 13.5);
  const old = createComposerDocument("old", "original");
  const oldRaw = serializeComposerEnvelope({ version: 1, revision: 1, document: old }, old.id);
  assert.equal(Object.hasOwn(deserializeComposerEnvelope(oldRaw, old.id).document, "assets"), false);
});

test("SavedAssetsPanel exports an accessible compact snapshot UI without requiring a new provider", async () => {
  const loader = installParityLoader();
  try {
    const { SavedAssetsPanel } = await import("./assets-panel.tsx");
    const controller = new ComposerController(() => ["original"], () => "generated");
    const empty = renderToStaticMarkup(createElement(SavedAssetsPanel, { composer: { controller, state: controller.getSnapshot(), project: null, document: null, page: null } }));
    assert.match(empty, /Saved components/); assert.match(empty, /Copies stay independently editable/);
    assert.match(empty, /No saved components yet/); assert.match(empty, /disabled=""/);
    assert.match(empty, /<label for="[^"]+-name">Component name<\/label>/);
    const document = save(fixture());
    const composer = { controller, document, page: document.pages[0], project: { error: "Invalid insertion target" }, state: { ...controller.getSnapshot(), ready: true, mode: "design" } };
    const populated = renderToStaticMarkup(createElement(SavedAssetsPanel, { composer }));
    assert.match(populated, /aria-label="Insert Custom component"/);
    assert.match(populated, /aria-label="Delete saved component Custom component"/);
    assert.match(populated, /role="status"[^>]*>Invalid insertion target/);
    assert.doesNotMatch(populated, /linked master/i);
  } finally { loader.cleanup(); }
});
