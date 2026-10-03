import assert from "node:assert/strict";
import test from "node:test";
import { ComposerController } from "./controller.ts";
import { isComposerRoute } from "./workspace-route.ts";
import { createComposerDocument, createComposerPage, createComposerFrame } from "./model.ts";
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
