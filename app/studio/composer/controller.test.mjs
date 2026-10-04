import assert from "node:assert/strict";
import test from "node:test";
import { ComposerController } from "./controller.ts";
import { isComposerRoute } from "./workspace-route.ts";
import { flattenNodes, nodePath, resetLocalStylesCommand } from "./selection.ts";
import { insertionProposalCache } from "./insertion.ts";
import { createComposerDocument, createComposerPage, createComposerFrame, composerFrameToPageDocument } from "./model.ts";
import { COMPOSER_INDEX_KEY, composerDocumentKey, createStoredComposerProject, readComposerIndex, selectComposerProject } from "./storage.ts";

function fixture() {
  let serial = 0;
  const local = { data: new Map(), writes: [], fail: null,
    getItem(key) { return this.data.get(key) ?? null; },
    setItem(key, value) { if (this.fail?.(key, value)) throw new Error("quota"); this.writes.push([key, value]); this.data.set(key, value); },
    removeItem() { throw new Error("Removal forbidden"); },
  };
  const systems = [{ id: "a" }, { id: "b" }];
  const controller = new ComposerController(() => systems, () => `id${++serial}`);
  return { local, systems, controller };
}
function assetFixture() {
  const setup = fixture(), document = createComposerDocument("asset-project", "a"), page = createComposerPage("asset-page"), frame = createComposerFrame("asset-frame", "asset-root");
  frame.root.children = [
    { id: "stack", kind: "stack", children: [{ id: "email", kind: "input", props: { label: "Email", name: "email", readOnly: false, size: "lg" }, appearance: { paddingTop: 10.25, shadow: "sm" }, parts: { label: { fontSize: 13.5, color: "#112233" } } }] },
    { id: "grid", kind: "grid", children: [] },
    { id: "card", kind: "card", children: [{ id: "body", kind: "cardContent", children: [] }] },
  ];
  page.frames.push(frame); document.pages.push(page); seed(setup.local, document, true); setup.controller.hydrate(setup.local);
  const selection = { projectId: document.id, pageId: page.id, frameId: frame.id, nodeId: "email" };
  setup.controller.selectNode(selection);
  return { ...setup, document, page, frame, selection, target: { projectId: document.id, pageId: page.id, frameId: frame.id, parentId: frame.root.id, index: frame.root.children.length } };
}

test("save selected asset is one history/save step, supports undo to old records and restores overrides on redo/reload", () => {
  const { local, controller, document, frame } = assetFixture();
  assert.equal(controller.saveSelectionAsAssetReason(), null);
  const before = activeDocument(controller), selected = controller.active().selection;
  local.writes = [];
  assert.equal(controller.saveSelectionAsAsset("Custom input"), true);
  assert.equal(local.writes.length, 1); assert.equal(controller.active().history.past.length, 1);
  const saved = activeDocument(controller), asset = saved.assets[0];
  assert.equal(asset.name, "Custom input"); assert.deepEqual(asset.root, frame.root.children[0].children[0]);
  assert.deepEqual(controller.active().selection, selected); assert.deepEqual(stored(local, document.id), saved);
  assert.equal(controller.travel("undo"), true); assert.deepEqual(activeDocument(controller), before);
  assert.equal(Object.hasOwn(stored(local, document.id), "assets"), false);
  assert.equal(controller.travel("redo"), true); assert.deepEqual(activeDocument(controller), saved);
  const reload = new ComposerController(() => ["a", "b"], () => "reload-id"); local.writes = []; reload.hydrate(local);
  assert.deepEqual(activeDocument(reload), saved); assert.equal(local.writes.length, 0);
  assert.equal(reload.active().selection, null); assert.equal(reload.active().history.past.length, 0);
});

test("saved insertion targets selected frame/container exactly, includes adapters atomically and selects the real copy", () => {
  const { local, controller, selection, target } = assetFixture();
  controller.saveSelectionAsAsset("Input");
  const saved = activeDocument(controller), assetId = saved.assets[0].id, before = controller.active().history;
  local.writes = [];
  assert.equal(controller.insertAsset(assetId), false); // The selected input is not an insertion slot.
  assert.match(controller.getSnapshot().message, /insertion slot/); assert.equal(controller.active().history, before); assert.equal(local.writes.length, 0);
  controller.selectFrame(selection.pageId, selection.frameId);
  assert.equal(controller.insertAsset(assetId), true);
  assert.equal(local.writes.length, 1); assert.equal(controller.active().history.past.length, before.past.length + 1);
  const inserted = activeDocument(controller), wrapper = inserted.pages[0].frames[0].root.children.at(-1);
  assert.equal(wrapper.kind, "stack"); assert.notEqual(wrapper.children[0].id, "email");
  assert.deepEqual(controller.active().selection, { ...selection, nodeId: wrapper.children[0].id });
  assert.deepEqual(wrapper.children[0].parts, saved.assets[0].root.parts);
  assert.deepEqual(inserted.assets, saved.assets);
  assert.equal(controller.travel("undo"), true); assert.deepEqual(activeDocument(controller), saved);
  assert.equal(controller.active().selection, null);
  assert.equal(controller.travel("redo"), true); assert.deepEqual(activeDocument(controller), inserted);
  for (const [parentId, expectedKind] of [["grid", "gridItem"], ["card", "input"]]) {
    controller.selectNode({ ...selection, nodeId: parentId }); local.writes = [];
    const previous = controller.active().history;
    assert.equal(controller.insertAsset(assetId), true);
    assert.equal(local.writes.length, 1); assert.equal(controller.active().history.past.length, previous.past.length + 1);
    const tree = activeDocument(controller).pages[0].frames[0].root;
    const parent = nodePath(tree, parentId === "card" ? "body" : parentId).at(-1);
    assert.equal(parent.children.at(-1).kind, expectedKind);
    controller.travel("undo"); assert.deepEqual(activeDocument(controller), previous.present);
  }
  local.writes = []; const history = controller.active().history;
  for (const invalid of [{ ...target, projectId: "foreign" }, { ...target, pageId: "foreign" }, { ...target, frameId: "foreign" }, { ...target, parentId: "email", index: 0 }, { ...target, parentId: "missing", index: 0 }]) {
    assert.equal(controller.insertAsset(assetId, invalid), false); assert.ok(controller.getSnapshot().message);
  }
  assert.equal(controller.insertAsset("missing", target), false);
  assert.equal(controller.active().history, history); assert.equal(local.writes.length, 0);
});

test("asset controller allocator handles repeated IDs for saves and insertions without cross-frame collisions", () => {
  const { local, controller, systems, selection, target } = assetFixture();
  controller.saveSelectionAsAsset("Input");
  const repeated = new ComposerController(() => systems, () => "email"); repeated.hydrate(local); repeated.selectNode(selection);
  assert.equal(repeated.saveSelectionAsAsset("Second"), true); assert.equal(repeated.saveSelectionAsAsset("Third"), true);
  const assets = activeDocument(repeated).assets;
  assert.equal(new Set(assets.map(asset => asset.id)).size, 3);
  const reserved = new Set(assets.flatMap(asset => [asset.id, asset.root.id]));
  for (let i = 0; i < 3; i++) {
    assert.equal(repeated.insertAsset(assets[0].id, { ...target, parentId: "grid", index: 0 }), true);
    const selected = repeated.active().selection;
    assert.equal(reserved.has(selected.nodeId), false); reserved.add(selected.nodeId);
  }
  const ids = flattenNodes(activeDocument(repeated).pages[0].frames[0].root).map(({ node }) => node.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("assets and local appearance/parts survive source resets, system switches, catalog browsing, deletion and project copy", () => {
  const { local, systems, controller, selection } = assetFixture();
  const catalog = structuredClone(systems);
  controller.saveSelectionAsAsset("Input"); const saved = structuredClone(activeDocument(controller).assets);
  assert.equal(controller.execute({ type: "nodeCommands", pageId: selection.pageId, frameId: selection.frameId, commands: [{ type: "update", nodeId: "email", appearance: null, parts: null, props: { size: null } }] }), true);
  const source = activeDocument(controller).pages[0].frames[0].root.children[0].children[0];
  assert.equal(Object.hasOwn(source, "appearance"), false); assert.equal(Object.hasOwn(source, "parts"), false);
  assert.deepEqual(activeDocument(controller).assets, saved);
  const before = activeDocument(controller), history = controller.active().history;
  assert.equal(controller.execute({ type: "changeProjectSystem", systemId: "b" }), true);
  assert.deepEqual(activeDocument(controller), { ...before, systemId: "b" });
  assert.equal(controller.active().history.past.length, history.past.length + 1);
  controller.travel("undo"); assert.deepEqual(activeDocument(controller), before);
  controller.travel("redo"); assert.deepEqual(activeDocument(controller).assets, saved);
  assert.deepEqual(systems, catalog); systems.reverse(); assert.equal(activeDocument(controller).systemId, "b");
  controller.execute({ type: "deletePage", pageId: selection.pageId }); assert.deepEqual(activeDocument(controller).assets, saved);
  const original = structuredClone(activeDocument(controller));
  assert.equal(controller.duplicate(), true); assert.deepEqual(activeDocument(controller).assets, saved);
  assert.notEqual(activeDocument(controller).id, original.id); assert.equal(controller.active().history.past.length, 0);
  assert.equal(controller.execute({ type: "renameAsset", assetId: saved[0].id, name: "Copy-only name" }), true);
  assert.deepEqual(stored(local, original.id), original);
  assert.equal(controller.execute({ type: "deleteAsset", assetId: saved[0].id }), true);
  assert.deepEqual(activeDocument(controller).assets, []);
  controller.travel("undo"); assert.equal(activeDocument(controller).assets[0].name, "Copy-only name");
  controller.travel("undo"); assert.deepEqual(activeDocument(controller).assets, saved);
  assert.equal(controller.create("Empty", "a"), true); assert.equal(Object.hasOwn(activeDocument(controller), "assets"), false);
});

test("invalid save selections/names, Preview, unavailable targets and stale asset IDs never write or create history", () => {
  const { local, controller, selection, target } = assetFixture();
  const initial = controller.active().history;
  local.writes = [];
  for (const name of ["", " ", "n".repeat(121)]) assert.equal(controller.saveSelectionAsAsset(name), false);
  for (const nodeId of ["asset-root", "body"]) {
    controller.selectNode({ ...selection, nodeId }); assert.ok(controller.saveSelectionAsAssetReason());
    assert.equal(controller.saveSelectionAsAsset("No"), false);
  }
  controller.selectFrame(selection.pageId, null); assert.equal(controller.saveSelectionAsAsset("No selection"), false);
  assert.equal(controller.insertAsset("missing"), false); assert.match(controller.getSnapshot().message, /Select a container or frame/);
  assert.equal(controller.active().history, initial); assert.equal(local.writes.length, 0);
  controller.selectNode(selection); controller.saveSelectionAsAsset("Input"); const saved = controller.active().history, assetId = saved.present.assets[0].id;
  controller.setMode("preview"); local.writes = [];
  assert.match(controller.saveSelectionAsAssetReason(), /Switch to Design/);
  assert.equal(controller.saveSelectionAsAsset("No"), false); assert.equal(controller.insertAsset(assetId, target), false);
  assert.equal(controller.active().history, saved); assert.equal(local.writes.length, 0);
  controller.setMode("design"); controller.execute({ type: "deleteAsset", assetId });
  const deleted = controller.active().history; local.writes = [];
  assert.equal(controller.insertAsset(assetId, target), false); assert.match(controller.getSnapshot().message, /no longer available/);
  assert.equal(controller.active().history, deleted); assert.equal(local.writes.length, 0);
});

test("asset save storage failure preserves in-memory snapshot and retry, without overwriting the old record", () => {
  const { local, controller, document } = assetFixture();
  const old = local.getItem(composerDocumentKey(document.id)), expected = controller.active().expected;
  local.fail = key => key === composerDocumentKey(document.id);
  assert.equal(controller.saveSelectionAsAsset("Unsaved input"), true);
  assert.equal(controller.active().status, "unsaved"); assert.ok(controller.active().error);
  assert.equal(activeDocument(controller).assets.length, 1);
  assert.equal(local.getItem(composerDocumentKey(document.id)), old); assert.deepEqual(controller.active().expected, expected);
  assert.equal(Object.hasOwn(JSON.parse(old).document, "assets"), false);
  local.fail = null; assert.equal(controller.save(), true);
  assert.equal(controller.active().status, "saved"); assert.deepEqual(stored(local, document.id).assets, activeDocument(controller).assets);
});

test('instance actions target scoped source rather than selection, save once, undo once and never change catalog',()=>{
  const {local,systems,controller}=fixture();controller.hydrate(local);controller.create('Actions','a');controller.addPage();controller.addFrame('mobile');
  let doc=controller.active().history.present;const pageId=doc.pages[0].id,frame=doc.pages[0].frames[0];
  controller.insert({projectId:doc.id,pageId,frameId:frame.id,parentId:frame.root.id,index:0},'badge');
  controller.insert({projectId:doc.id,pageId,frameId:frame.id,parentId:frame.root.id,index:1},'text');
  doc=controller.active().history.present;const source=doc.pages[0].frames[0].root.children[0],scope={projectId:doc.id,pageId,frameId:frame.id,nodeId:source.id},catalog=structuredClone(systems);
  for(const action of ['duplicate','wrapStack','wrapGrid','delete']) {
    const history=controller.active().history, expected=history.present;local.writes=[];
    assert.equal(controller.nodeAction(scope,action,expected),true);assert.equal(local.writes.length,1);assert.equal(controller.active().history.past.length,history.past.length+1);
    assert.equal(controller.active().selection.frameId,frame.id);
    assert.notEqual(controller.active().selection.nodeId,source.id);
    const changed=controller.active().history.present;
    assert.equal(controller.nodeAction(scope,action,expected),false);assert.equal(controller.active().history.present,changed);
    controller.travel('undo');assert.deepEqual(controller.active().history.present,doc);
    assert.equal(controller.active().selection===null||!!controller.active().selection.nodeId,true);
  }
  local.writes=[];const history=controller.active().history;
  assert.equal(controller.nodeAction(scope,'selectParent'),true);assert.equal(controller.active().selection.nodeId,frame.root.id);
  assert.equal(controller.active().history,history);assert.equal(local.writes.length,0);
  assert.equal(controller.nodeAction({...scope,nodeId:frame.root.id},'delete'),false);
  assert.equal(controller.nodeAction({...scope,frameId:'foreign'},'duplicate'),false);
  assert.equal(controller.active().history,history);assert.equal(local.writes.length,0);
  controller.setMode('preview');assert.equal(controller.nodeAction(scope,'duplicate'),false);assert.equal(controller.duplicateFrame(),false);assert.equal(local.writes.length,0);
  assert.deepEqual(systems,catalog);
});

test('move command saves/history once, scopes destination selection and rejects no-op/stale/Preview/foreign drops',()=>{
  const {local,controller}=fixture();controller.hydrate(local);controller.create('Move','a');controller.addPage();controller.addFrame('mobile');
  let doc=controller.active().history.present;const pageId=doc.pages[0].id,source=doc.pages[0].frames[0];
  controller.insert({projectId:doc.id,pageId,frameId:source.id,parentId:source.root.id,index:0},'button');
  controller.addFrame('mobile');doc=controller.active().history.present;
  const node=doc.pages[0].frames[0].root.children[0].children[0],stack=doc.pages[0].frames[0].root.children[0],target=doc.pages[0].frames[1];
  const scope={projectId:doc.id,pageId,sourceFrameId:source.id,nodeId:node.id,frameId:source.id,parentId:stack.id,index:0};
  const history=controller.active().history;local.writes=[];
  assert.equal(controller.move(scope,doc),true);assert.equal(controller.active().history,history);assert.equal(local.writes.length,0);
  const token=controller.insertionSession();
  const move={...scope,frameId:target.id,parentId:target.root.id};
  assert.equal(controller.move(move,doc,token),true);assert.equal(local.writes.length,1);assert.equal(controller.active().history.past.length,history.past.length+1);
  assert.deepEqual(controller.active().selection,{projectId:doc.id,pageId,frameId:target.id,nodeId:node.id});
  const moved=controller.active().history.present;local.writes=[];assert.equal(controller.move(scope,doc,token),false);assert.equal(local.writes.length,0);
  controller.travel('undo');assert.deepEqual(controller.active().history.present,doc);assert.equal(controller.active().selection,null);assert.equal(controller.active().frameId,target.id);
  controller.travel('redo');assert.deepEqual(controller.active().history.present,moved);
  controller.setMode('preview');local.writes=[];assert.equal(controller.move(move),false);assert.equal(local.writes.length,0);
  controller.setMode('design');assert.equal(controller.move({...move,projectId:'foreign'}),false);
  assert.equal(controller.move({...move,pageId:'foreign'}),false);assert.equal(local.writes.length,0);
});

test("palette insertion is atomic, selects real child, saves once and rejects stale or invalid drops", () => {
  const { local, controller } = fixture(); controller.hydrate(local); controller.create("Insert", "a"); controller.addPage(); controller.addFrame("web");
  const active = controller.active(), before = active.history.present, page = before.pages[0], frame = page.frames[0];
  const scope = { projectId: before.id, pageId: page.id, frameId: frame.id, parentId: frame.root.id, index: 0 };
  local.writes = []; const count = active.history.past.length;
  assert.equal(controller.insert(scope, "button", before), true);
  const wrapper = controller.active().history.present.pages[0].frames[0].root.children[0];
  assert.equal(wrapper.kind, "stack"); assert.equal(controller.active().selection.nodeId, wrapper.children[0].id);
  assert.equal(controller.active().history.past.length, count + 1); assert.equal(local.writes.length, 1);
  const inserted = controller.active().history.present, selected = controller.active().selection;
  local.writes = []; assert.equal(controller.insert(scope, "button", before), false);
  assert.equal(controller.insert({ ...scope, parentId: wrapper.children[0].id }, "grid"), false);
  assert.equal(controller.active().history.present, inserted); assert.deepEqual(controller.active().selection, selected); assert.equal(local.writes.length, 0);
  controller.travel("undo"); assert.deepEqual(controller.active().history.present, before);
  controller.setMode("preview"); local.writes = []; assert.equal(controller.insert(scope, "card"), false); assert.equal(local.writes.length, 0);
});
test("new insertions snapshot the current linked System defaults, never catalog order or old content", () => {
  const { local, systems, controller } = fixture();
  systems[0].system = { name: "A", componentDefaults: { button: { text: "From A", props: { variant: "secondary", size: "sm" } } } };
  systems[1].system = { name: "B", componentDefaults: { button: { text: "From B", props: { variant: "outline" } } } };
  controller.hydrate(local); controller.create("Defaults", "a"); controller.addPage(); controller.addFrame("web");
  const initial = activeDocument(controller), page = initial.pages[0], frame = page.frames[0];
  const scope = { projectId: initial.id, pageId: page.id, frameId: frame.id, parentId: frame.root.id, index: 0 };
  systems.reverse();
  const beforeCatalog = structuredClone(systems);
  assert.equal(controller.insert(scope, "button"), true);
  const first = activeDocument(controller).pages[0].frames[0].root.children[0].children[0];
  assert.equal(first.text, "From A"); assert.equal(first.props.variant, "secondary"); assert.equal(first.props.size, "sm");
  assert.deepEqual(systems, beforeCatalog);
  const a = systems.find(system => system.id === "a");
  a.system.componentDefaults.button = { text: "Updated A", props: { variant: "ghost", loading: true } };
  assert.equal(controller.insert({ ...scope, index: 1 }, "button"), true);
  const inserted = activeDocument(controller), second = inserted.pages[0].frames[0].root.children[1].children[0];
  assert.equal(second.text, "Updated A"); assert.equal(second.props.variant, "ghost"); assert.equal(second.props.loading, true);
  assert.deepEqual(inserted.pages[0].frames[0].root.children[0].children[0], first);
  a.system.componentDefaults.button.text = "Later default";
  controller.travel("undo"); controller.travel("redo"); assert.deepEqual(activeDocument(controller), inserted);
  assert.equal(controller.execute({ type: "changeProjectSystem", systemId: "b" }), true);
  assert.equal(controller.insert({ ...scope, index: 2 }, "button"), true);
  const switched = activeDocument(controller).pages[0].frames[0].root.children;
  assert.equal(switched[2].children[0].text, "From B"); assert.deepEqual(switched[0].children[0], first);
  const reload = new ComposerController(() => systems, () => "reload"); local.writes = []; reload.hydrate(local);
  assert.deepEqual(activeDocument(reload), activeDocument(controller)); assert.equal(local.writes.length, 0);
});

test("drag proposals and commits share a defaults snapshot; Card insertion is populated in one save/undo step", () => {
  const { local, systems, controller } = fixture();
  systems[0].system = { componentDefaults: { card: { props: { variant: "filled" }, slots: { title: "Plan a launch", action: "Start planning" } }, button: { props: { variant: "outline" } } } };
  controller.hydrate(local); controller.create("Drag", "a"); controller.addPage(); controller.addFrame("web");
  const history = controller.active().history, expected = history.present, page = expected.pages[0], frame = page.frames[0];
  const scope = { projectId: expected.id, pageId: page.id, frameId: frame.id, parentId: frame.root.id, index: 0 };
  const defaults = controller.insertionDefaults(), session = controller.insertionSession();
  const proposal = insertionProposalCache(composerFrameToPageDocument(frame), "card", defaults)(scope);
  assert.equal(proposal.ok, true); local.writes = [];
  assert.equal(controller.insert(scope, "card", expected, session, defaults), true);
  const inserted = activeDocument(controller), card = inserted.pages[0].frames[0].root.children[0];
  const withoutIds = node => { const copy = { ...node }; delete copy.id; if (copy.children) copy.children = copy.children.map(withoutIds); return copy; };
  assert.deepEqual(withoutIds(card), withoutIds(proposal.page.root.children[0]));
  assert.equal(card.children[0].children[0].text, "Plan a launch"); assert.equal(card.children[2].children[0].text, "Start planning");
  assert.equal(card.children[2].children[0].props.variant, "outline");
  assert.equal(controller.active().selection.nodeId, card.id); assert.equal(local.writes.length, 1);
  assert.equal(controller.active().history.past.length, history.past.length + 1);
  controller.travel("undo"); assert.deepEqual(activeDocument(controller), expected);
  systems[0].system.componentDefaults.card.slots.title = "Changed later";
  controller.travel("redo"); assert.deepEqual(activeDocument(controller), inserted);
});

test("defaults changed during a drag reject the stale insertion without writes, history or selection changes", () => {
  const { local, systems, controller } = fixture();
  systems[0].system = { componentDefaults: { input: { props: { label: "First label", type: "text" } } } };
  controller.hydrate(local); controller.create("Guard", "a"); controller.addPage(); controller.addFrame("mobile");
  const history = controller.active().history, expected = history.present, page = expected.pages[0], frame = page.frames[0];
  const scope = { projectId: expected.id, pageId: page.id, frameId: frame.id, parentId: frame.root.id, index: 0 };
  const defaults = controller.insertionDefaults(), session = controller.insertionSession(), selection = controller.active().selection;
  systems[0].system.componentDefaults.input.props.label = "Changed label"; local.writes = [];
  assert.equal(controller.insert(scope, "input", expected, session, defaults), false);
  assert.match(controller.getSnapshot().message, /System insertion defaults changed/);
  assert.equal(controller.active().history, history); assert.deepEqual(controller.active().selection, selection); assert.equal(local.writes.length, 0);
  assert.equal(defaults.input.props.label, "First label");
  const current = controller.insertionDefaults();
  systems[0].system.componentDefaults = { input: { props: { type: "text", label: "Changed label" } } };
  assert.equal(controller.insert(scope, "input", expected, session, current), true);
  const first = activeDocument(controller).pages[0].frames[0].root.children[0].children[0];
  assert.equal(first.props.label, "Changed label"); assert.equal(first.props.name, first.id);
  assert.equal(controller.insert({ ...scope, index: 1 }, "input"), true);
  const second = activeDocument(controller).pages[0].frames[0].root.children[1].children[0];
  assert.notEqual(first.props.name, second.props.name);
});

test("invalid System insertion defaults fail closed without rewriting existing content", () => {
  const { local, systems, controller } = fixture(); controller.hydrate(local); controller.create("Invalid", "a"); controller.addPage(); controller.addFrame("web");
  const history = controller.active().history, document = history.present, page = document.pages[0], frame = page.frames[0];
  const scope = { projectId: document.id, pageId: page.id, frameId: frame.id, parentId: frame.root.id, index: 0 };
  for (const componentDefaults of [{ input: { props: { name: "shared" } } }, { button: { props: { size: "bad" } } }, { button: { appearance: { color: "#ffffff" } } }, null]) {
    systems[0].system = { componentDefaults }; local.writes = [];
    assert.equal(controller.insert(scope, "button"), false); assert.ok(controller.getSnapshot().message);
    assert.equal(controller.active().history, history); assert.equal(local.writes.length, 0);
  }
  delete systems[0].system;
  assert.equal(controller.insert(scope, "button"), true);
  assert.equal(activeDocument(controller).pages[0].frames[0].root.children[0].children[0].text, "Continue");
});

test("legacy style reset saves once, undoes once, and leaves parameter values and saved assets untouched", () => {
  const { local, controller, selection } = assetFixture(); controller.saveSelectionAsAsset("Original field");
  const history = controller.active().history, before = history.present;
  local.writes = [];
  const command = resetLocalStylesCommand(before, selection);
  assert.equal(controller.execute({ type: "nodeCommands", pageId: selection.pageId, frameId: selection.frameId, commands: [command] }), true);
  const reset = activeDocument(controller), field = reset.pages[0].frames[0].root.children[0].children[0];
  assert.equal(local.writes.length, 1); assert.equal(controller.active().history.past.length, history.past.length + 1);
  assert.equal(field.appearance, undefined); assert.equal(field.parts, undefined);
  assert.deepEqual(field.props, before.pages[0].frames[0].root.children[0].children[0].props);
  assert.deepEqual(reset.assets, before.assets);
  controller.travel("undo"); assert.deepEqual(activeDocument(controller), before);
  controller.travel("redo"); assert.deepEqual(activeDocument(controller), reset);
});

test("insertion IDs avoid imported node IDs and repeated allocator values", () => {
  const {local,systems,controller}=fixture();controller.hydrate(local);controller.create('Insert','a');controller.addPage();controller.addFrame('web');
  const document=controller.active().history.present, page=document.pages[0],frame=page.frames[0];
  const imported=new ComposerController(()=>systems,()=>frame.root.id);imported.hydrate(local);
  const scope={projectId:document.id,pageId:page.id,frameId:frame.id,parentId:frame.root.id,index:0};
  assert.equal(imported.insert(scope,'button'),true);
  const wrapper=imported.active().history.present.pages[0].frames[0].root.children[0];
  assert.equal(wrapper.children[0].id,`${frame.root.id}-1`);assert.equal(wrapper.id,`${frame.root.id}-2`);
  assert.equal(imported.insert({...scope,index:1},'card'),true);
  const card=imported.active().history.present.pages[0].frames[0].root.children[1];
  assert.equal(card.id,`${frame.root.id}-3`);assert.equal(card.children[0].id,`${frame.root.id}-4`);
});

test("insertion session rejects away-and-back page/project/mode switches without writes", () => {
  const {local,controller}=fixture(); controller.hydrate(local); controller.create('Insert','a'); controller.addPage(); controller.addFrame('mobile');
  const first=controller.active().history.present, page=first.pages[0], frame=page.frames[0];
  controller.addPage(); const otherPage=controller.active().pageId; controller.selectPage(page.id);
  const expected=controller.active().history.present;
  const scope={projectId:first.id,pageId:page.id,frameId:frame.id,parentId:frame.root.id,index:0};
  let token=controller.insertionSession();
  controller.selectPage(otherPage); controller.selectPage(page.id); local.writes=[];
  assert.equal(controller.insert(scope,'button',expected,token),false); assert.equal(local.writes.length,0);
  token=controller.insertionSession(); controller.setMode('preview'); controller.setMode('design'); local.writes=[];
  assert.equal(controller.insert(scope,'button',expected,token),false); assert.equal(local.writes.length,0);
  controller.create('Other','b'); controller.open(first.id); token=controller.insertionSession();
  const other=controller.getSnapshot().collection.projectIds.find(id=>id!==first.id);
  controller.open(other); controller.open(first.id); local.writes=[];
  const history=controller.active().history;
  assert.equal(controller.insert(scope,'button',expected,token),false);
  assert.equal(controller.active().history,history); assert.equal(local.writes.length,0);
});

test("frame creation, duplicate and geometry commit are independent single-save undo steps", () => {
  const { local, controller } = fixture(); controller.hydrate(local); controller.create("Frames", "a"); controller.addPage();
  for (const preset of ["web", "tablet", "mobile"]) assert.equal(controller.addFrame(preset), true);
  const page = activeDocument(controller).pages[0];
  assert.deepEqual(page.frames.map(frame => [frame.width, frame.height, frame.x]), [[1440, 900, 0], [768, 1024, 1520], [390, 844, 2368]]);
  assert.equal(new Set(page.frames.map(frame => frame.root.id)).size, 3);
  const source = page.frames[0]; controller.selectFrame(page.id, source.id);
  const before = structuredClone(activeDocument(controller)), steps = controller.active().history.past.length;
  local.writes = []; assert.equal(controller.duplicateFrame(), true);
  const copy = activeDocument(controller).pages[0].frames[3];
  assert.notEqual(copy.id, source.id); assert.notEqual(copy.root.id, source.root.id); assert.equal(copy.name, "Web 1 copy");
  assert.equal(controller.active().history.past.length, steps + 1); assert.equal(local.writes.length, 1);
  controller.travel("undo"); assert.deepEqual(activeDocument(controller), before); assert.equal(controller.active().frameId, null);
  controller.travel("redo"); controller.selectFrame(page.id, source.id); local.writes = [];
  const root = structuredClone(source.root);
  controller.execute({ type: "updateFrameGeometry", pageId: page.id, frameId: source.id, geometry: { x: 125.25, y: -17, width: 1200 } });
  assert.equal(local.writes.length, 1);
  assert.equal(activeDocument(controller).pages[0].frames[0].preset, "custom");
  assert.deepEqual(activeDocument(controller).pages[0].frames[0].root, root);
  assert.deepEqual(activeDocument(controller).pages[0].frames[1], before.pages[0].frames[1]);
  controller.travel("undo"); assert.equal(activeDocument(controller).pages[0].frames[0].preset, "web");
});
test("frame selection is page/project qualified and reconciles undo/deletion without persistence", () => {
  const { local, controller } = fixture(); controller.hydrate(local); controller.create("One", "a"); controller.addPage(); controller.addFrame("web");
  const first = activeDocument(controller).id, pageId = controller.active().pageId, frameId = controller.active().frameId;
  local.writes = []; assert.equal(controller.selectFrame("wrong", frameId), false); assert.equal(controller.selectFrame(pageId, "missing"), false);
  assert.equal(controller.selectFrame(pageId, frameId), true); assert.equal(local.writes.length, 0);
  controller.addPage(); assert.equal(controller.active().frameId, null);
  controller.selectPage(pageId); assert.equal(controller.active().frameId, null); controller.selectFrame(pageId, frameId);
  controller.create("Two", "b"); controller.addPage(); assert.equal(controller.active().frameId, null);
  controller.open(first); assert.equal(controller.active().frameId, frameId);
  controller.execute({ type: "deleteFrame", pageId, frameId }); assert.equal(controller.active().frameId, null);
  controller.travel("undo"); assert.equal(controller.active().frameId, null);
  const reload = new ComposerController(() => ["a", "b"], () => "unused"); reload.hydrate(local); assert.equal(reload.active().frameId, null);
});
test("node selection is transient and frame scoped; undo deletion/page switches reconcile without stale IDs", () => {
  const { local, controller } = fixture(); controller.hydrate(local); controller.create("Scoped", "a"); controller.addPage();
  const pageId = controller.active().pageId;
  const frames = ["web", "mobile"].map(id => { const frame = createComposerFrame(id, "root", id); frame.root.children = [{ id: "same", kind: "text", text: id }]; return frame; });
  for (const frame of frames) controller.execute({ type: "insertFrame", pageId, index: 0, frame });
  const projectId = activeDocument(controller).id, selected = { projectId, pageId, frameId: "mobile", nodeId: "same" };
  local.writes = []; assert.equal(controller.selectNode(selected), true); assert.equal(local.writes.length, 0);
  assert.deepEqual(controller.active().selection, selected); assert.equal(controller.active().frameId, "mobile");
  assert.equal(controller.selectNode({ ...selected, projectId: "wrong" }), false);
  controller.selectParent(); assert.equal(controller.active().selection.nodeId, "root"); controller.selectParent(); assert.equal(controller.active().selection, null);
  controller.selectNode(selected); controller.setMode("preview"); assert.equal(controller.active().selection, null); assert.equal(controller.selectNode(selected), false); controller.setMode("design");
  controller.selectNode(selected); controller.execute({ type: "nodeCommands", pageId, frameId: "mobile", commands: [{ type: "delete", nodeId: "same" }] });
  assert.equal(controller.active().selection, null); assert.equal(controller.active().frameId, "mobile");
  controller.travel("undo"); assert.equal(controller.active().selection, null);
  controller.selectNode(selected); controller.create("Other", "b"); assert.equal(controller.active().selection, null); controller.open(projectId); assert.deepEqual(controller.active().selection, selected);
  controller.addPage(); assert.equal(controller.active().selection, null); controller.selectPage(pageId); assert.equal(controller.active().selection, null);
  const reload = new ComposerController(() => ["a", "b"], () => "unused"); reload.hydrate(local); assert.equal(reload.active().selection, null); assert.equal(reload.getSnapshot().mode, "design");
});
const activeDocument = (controller) => controller.active().history.present;
const stored = (local, id) => JSON.parse(local.getItem(composerDocumentKey(id))).document;
function seed(local, document, active = false) {
  const index = readComposerIndex(local);
  const created = createStoredComposerProject(local, document.id, document, index.raw);
  assert.equal(created.kind, "registered");
  if (active) { const next = readComposerIndex(local); selectComposerProject(local, document.id, next.collection, next.raw); }
}

test("hydration is read-only, restores active project and first page; repeated hydration does not reset a session", () => {
  const { local, controller } = fixture();
  const document = createComposerDocument("existing", "missing"); document.pages = [createComposerPage("first"), createComposerPage("second")];
  seed(local, document, true); local.writes = [];
  controller.hydrate(local);
  assert.deepEqual(activeDocument(controller), document);
  assert.equal(controller.active().pageId, "first");
  controller.selectPage("second"); controller.hydrate(local);
  assert.equal(controller.active().pageId, "second"); assert.equal(local.writes.length, 0);
});
test("empty hydration does not register, select or save anything", () => {
  const { local, controller } = fixture(); controller.hydrate(local);
  assert.equal(controller.getSnapshot().ready, true); assert.equal(controller.active(), null); assert.equal(local.writes.length, 0);
});
test("corrupt index is preserved and blocks all creation/mutation", () => {
  const { local, controller } = fixture(); local.data.set(COMPOSER_INDEX_KEY, "broken"); controller.hydrate(local);
  assert.equal(controller.create("New", "a"), false); assert.equal(controller.execute({ type: "renameProject", name: "No" }), false);
  assert.equal(local.getItem(COMPOSER_INDEX_KEY), "broken"); assert.equal(local.writes.length, 0); assert.equal(controller.getSnapshot().indexBlocked, true);
});
test("corrupt active document stays unavailable with no fallback/reset, other valid projects may explicitly open", () => {
  const { local, controller } = fixture(); seed(local, createComposerDocument("bad", "a"), true); seed(local, createComposerDocument("good", "a"));
  local.data.set(composerDocumentKey("bad"), "bad bytes"); local.writes = []; controller.hydrate(local);
  assert.equal(controller.active(), null); assert.equal(controller.getSnapshot().collection.activeProjectId, "bad"); assert.equal(local.writes.length, 0);
  assert.equal(controller.open("good"), true); assert.equal(local.getItem(composerDocumentKey("bad")), "bad bytes");
});
test("two projects isolate pages, selection, save keys and session history", () => {
  const { local, controller } = fixture(); controller.hydrate(local);
  assert.equal(controller.create("One", "a"), true); const first = activeDocument(controller).id;
  controller.addPage(); const page = controller.active().pageId; controller.addPage();
  assert.equal(controller.create("Two", "a"), true); const second = activeDocument(controller).id; controller.addPage();
  assert.equal(controller.open(first), true); controller.selectPage(page);
  assert.equal(activeDocument(controller).pages.length, 2); assert.equal(controller.active().history.past.length, 2);
  assert.equal(controller.open(second), true); assert.equal(activeDocument(controller).pages.length, 1); assert.equal(controller.active().history.past.length, 1);
  assert.equal(controller.open(first), true); assert.equal(controller.active().pageId, page);
  assert.equal(stored(local, first).pages.length, 2); assert.equal(stored(local, second).pages.length, 1);
});
test("rebind preserves content and catalog, one undo/redo step; editor catalog browsing never rebinds", () => {
  const { local, systems, controller } = fixture(); controller.hydrate(local); controller.create("One", "a"); controller.addPage();
  const before = structuredClone(activeDocument(controller)), catalog = structuredClone(systems), historyCount = controller.active().history.past.length;
  assert.equal(controller.execute({ type: "changeProjectSystem", systemId: "b" }), true);
  assert.deepEqual(activeDocument(controller), { ...before, systemId: "b" }); assert.deepEqual(systems, catalog);
  assert.equal(controller.active().history.past.length, historyCount + 1);
  controller.travel("undo"); assert.deepEqual(activeDocument(controller), before); assert.deepEqual(stored(local, before.id), before);
  controller.travel("redo"); assert.equal(stored(local, before.id).systemId, "b");
  systems.reverse(); assert.equal(activeDocument(controller).systemId, "b");
});
test("history always uses current catalog: missing restore fails without changes or writes; explicit rebind recovers unresolved content", () => {
  const { local, systems, controller } = fixture(); controller.hydrate(local); controller.create("One", "a"); controller.execute({ type: "changeProjectSystem", systemId: "b" });
  systems.splice(systems.findIndex((entry) => entry.id === "a"), 1); const history = controller.active().history; local.writes = [];
  assert.equal(controller.travel("undo"), false); assert.equal(controller.active().history, history); assert.equal(local.writes.length, 0);
  systems.splice(0, 1, { id: "c" }); assert.equal(controller.execute({ type: "changeProjectSystem", systemId: "c" }), true);
  assert.equal(activeDocument(controller).systemId, "c");
});
test("quota retains valid edits as unsaved, prevents project switch, explicit retry retains expected raw/revision", () => {
  const { local, controller } = fixture(); controller.hydrate(local); controller.create("One", "a"); const one = activeDocument(controller).id;
  controller.create("Two", "a"); const two = activeDocument(controller).id; controller.open(one);
  const expected = controller.active().expected; local.fail = (key) => key === composerDocumentKey(one);
  controller.addPage(); assert.equal(controller.active().status, "unsaved"); assert.equal(activeDocument(controller).pages.length, 1); assert.equal(stored(local, one).pages.length, 0);
  assert.deepEqual(controller.active().expected, expected); assert.equal(controller.open(two), false); assert.equal(activeDocument(controller).id, one);
  local.fail = null; assert.equal(controller.save(), true); assert.equal(controller.active().status, "saved"); assert.equal(controller.active().expected.revision, expected.revision + 1);
  assert.equal(controller.open(two), true);
});
test("cross-tab document and index conflicts never silently refresh expected bytes or overwrite stored values", () => {
  for (const key of ["document", "index"]) {
    const { local, controller } = fixture(); controller.hydrate(local); controller.create("One", "a"); const id = activeDocument(controller).id; const expected = controller.active().expected;
    const target = key === "document" ? composerDocumentKey(id) : COMPOSER_INDEX_KEY;
    const external = JSON.parse(local.getItem(target)); if (key === "document") { external.revision++; external.document.name = "External"; } else external.activeProjectId = null;
    const raw = JSON.stringify(external); local.data.set(target, raw); local.writes = [];
    controller.execute({ type: "renameProject", name: "Memory" }); assert.equal(controller.active().status, "unsaved");
    assert.deepEqual(controller.active().expected, expected); assert.equal(controller.save(), false); assert.equal(local.getItem(target), raw); assert.equal(local.writes.length, 0);
  }
});
test("partial registration preserves orphan and exposes explicit retry, with no new document write", () => {
  const { local, controller } = fixture(); controller.hydrate(local); local.fail = (key) => key === COMPOSER_INDEX_KEY;
  assert.equal(controller.create("Partial", "a"), false); const evidence = controller.getSnapshot().partial;
  assert.ok(evidence); assert.equal(controller.active(), null); assert.equal(local.getItem(composerDocumentKey(evidence.projectId)), evidence.raw);
  assert.equal(controller.create("No more", "a"), false); local.fail = null; local.writes = [];
  assert.equal(controller.retryRegistration(), true); assert.equal(controller.active().status, "saved"); assert.equal(activeDocument(controller).name, "Partial");
  assert.ok(local.writes.every(([key]) => key === COMPOSER_INDEX_KEY));
});
test("create succeeds but selection fails: registered project remains recoverable and is not reported as selected", () => {
  const { local, controller } = fixture(); controller.hydrate(local);
  local.fail = (key, raw) => key === COMPOSER_INDEX_KEY && JSON.parse(raw).activeProjectId !== null;
  assert.equal(controller.create("Registered", "a"), false); assert.equal(controller.active(), null); assert.equal(controller.getSnapshot().partial, null);
  assert.match(controller.getSnapshot().message, /created and registered, but could not be selected/);
  const id = controller.getSnapshot().collection.projectIds[0]; assert.equal(stored(local, id).name, "Registered");
  local.fail = null; assert.equal(controller.open(id), true);
});
test("duplicate uses pure full-ID mapping, same system, new fresh history, leaving source and frame trees unchanged", () => {
  const { local, controller } = fixture(); const source = createComposerDocument("source", "a");
  const page = createComposerPage("page"); page.frames.push(createComposerFrame("frame", "root")); source.pages.push(page); seed(local, source, true); controller.hydrate(local);
  assert.equal(controller.duplicate(), true); const copy = activeDocument(controller);
  assert.notEqual(copy.id, source.id); assert.notEqual(copy.pages[0].id, "page"); assert.notEqual(copy.pages[0].frames[0].id, "frame"); assert.notEqual(copy.pages[0].frames[0].root.id, "root");
  assert.equal(copy.systemId, "a"); assert.equal(controller.active().history.past.length, 0); assert.deepEqual(stored(local, source.id), source);
});
test("system deletion safety scans inactive stored projects, histories, corruption and partial registration", () => {
  const { local, controller } = fixture(); controller.hydrate(local);
  assert.equal(controller.systemDeletionBlock("a"), ""); controller.create("One", "a"); controller.create("Two", "b");
  assert.match(controller.systemDeletionBlock("a"), /One/); controller.execute({ type: "changeProjectSystem", systemId: "a" }); controller.travel("undo");
  assert.match(controller.systemDeletionBlock("a"), /Used/);
  local.data.set(composerDocumentKey(controller.getSnapshot().collection.projectIds[0]), "corrupt"); assert.match(controller.systemDeletionBlock("other"), /cannot be inspected/);
});
test("no-op mutations preserve revision, redo and writes; invalid edits do not mutate history", () => {
  const { local, controller } = fixture(); controller.hydrate(local); controller.create("One", "a"); controller.addPage(); controller.travel("undo");
  const history = controller.active().history, expected = controller.active().expected; local.writes = [];
  controller.execute({ type: "renameProject", name: "One" }); assert.equal(controller.active().history, history); assert.deepEqual(controller.active().expected, expected); assert.equal(local.writes.length, 0);
  assert.equal(controller.execute({ type: "changeProjectSystem", systemId: "missing" }), false); assert.equal(controller.active().history, history);
});
test("project switching checks external bytes before reopening cached history", () => {
  const { local, controller } = fixture(); controller.hydrate(local); controller.create("One", "a"); const one = activeDocument(controller).id; controller.create("Two", "a"); const two = activeDocument(controller).id;
  const envelope = JSON.parse(local.getItem(composerDocumentKey(one))); envelope.revision++; envelope.document.name = "External"; local.data.set(composerDocumentKey(one), JSON.stringify(envelope)); local.writes = [];
  assert.equal(controller.open(one), false); assert.equal(activeDocument(controller).id, two); assert.equal(local.writes.length, 0); assert.equal(controller.getSnapshot().sessions[one].history.present.name, "One");
});
test("valid prototype-named IDs cannot masquerade as loaded sessions or errors", () => {
  const { local, controller } = fixture();
  const source = createComposerDocument("constructor", "a");
  const page = createComposerPage("toString"); page.frames.push(createComposerFrame("constructor", "valueOf")); source.pages.push(page);
  seed(local, source, true); controller.hydrate(local);
  assert.equal(controller.getSnapshot().message, ""); assert.deepEqual(activeDocument(controller), source);
  assert.equal(controller.duplicate(), true); assert.equal(activeDocument(controller).pages[0].frames.length, 1);
});
test("corrupt prototype-named project is unavailable, not an inherited session", () => {
  const { local, controller } = fixture(); seed(local, createComposerDocument("constructor", "a"), true);
  local.data.set(composerDocumentKey("constructor"), "broken"); controller.hydrate(local);
  assert.equal(controller.active(), null); assert.equal(typeof controller.getSnapshot().unavailable.constructor, "string");
  assert.equal(controller.create("Valid", "a"), true); assert.equal(controller.open("constructor"), false);
});
test("Pages route marker is exact; component and Develop routes cannot leak into composer", () => {
  for (const path of ["/pages", "/pages/"]) assert.equal(isComposerRoute(path), true);
  for (const path of ["/", "/button", "/develop", "/develop/pages", "/pages/project", "/pagesx"]) assert.equal(isComposerRoute(path), false);
});
