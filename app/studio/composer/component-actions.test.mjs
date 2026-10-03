import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareNodeAction, nodeActionReason, NODE_ACTIONS } from './component-actions.ts';
import { applyComposerCommand } from './commands.ts';
import { createComposerDocument, createComposerPage, createComposerFrame, parseComposerDocument } from './model.ts';
import { flattenNodes } from './selection.ts';
import { createInsertionNode } from './insertion.ts';
import { composerShortcut } from './shortcuts.ts';

function fixture(children) {
  const doc=createComposerDocument('project','Actions','system'),page=createComposerPage('page','Page'),frame=createComposerFrame('frame','root','mobile','Frame');
  frame.root.children=children;page.frames=[frame];doc.pages=[page];
  return parseComposerDocument(doc);
}
const scope=nodeId=>({projectId:'project',pageId:'page',frameId:'frame',nodeId});
const badge={id:'badge',kind:'badge',text:'Keep me',props:{tone:'danger',dot:false,size:'lg'}};
function ids(){let n=0;return()=>`new${++n}`;}
function run(doc,id,action,nextId=ids()){const proposal=prepareNodeAction(doc,scope(id),action,nextId);return {proposal,doc:proposal.command?applyComposerCommand(doc,proposal.command):doc};}

test('duplicate inserts fresh subtree after source, retaining exact props/text and frame geometry without mutation',()=>{
  const doc=fixture([{id:'stack',kind:'stack',props:{gap:'lg',direction:'row'},children:[badge]}]),before=structuredClone(doc);
  const result=run(doc,'stack','duplicate'),children=result.doc.pages[0].frames[0].root.children;
  assert.equal(children[0].id,'stack');assert.deepEqual(children[1],{...before.pages[0].frames[0].root.children[0],id:'new1',children:[{...badge,id:'new2'}]});
  assert.equal(result.proposal.selection.nodeId,'new1');assert.deepEqual(doc,before);
  assert.deepEqual({...result.doc.pages[0].frames[0],root:null},{...doc.pages[0].frames[0],root:null});
  assert.equal(result.doc.systemId,doc.systemId);
});
test('factory subtrees all duplicate with fresh IDs when placed in a permissive Stack',()=>{
  for(const kind of ['button','input','switch','checkbox','badge','card','text','stack','grid']) {
    const original=createInsertionNode(kind,ids()),doc=fixture([{id:'host',kind:'stack',children:[original]}]);
    const result=run(doc,original.id,'duplicate',(()=>{let n=0;return()=>`copy${++n}`;})());
    const copy=result.doc.pages[0].frames[0].root.children[0].children[1];
    assert.equal(flattenNodes(copy).every(({node})=>!flattenNodes(original).some(entry=>entry.node.id===node.id)),true);
    const normalize=node=>({...node,id:'normalized',...(node.children?{children:node.children.map(normalize)}:{})});
    assert.deepEqual(normalize(copy),normalize(original));
  }
});
test('wrap replaces exact parent index, retains source ID/props and selects wrapper; Grid has explicit Item',()=>{
  for(const action of ['wrapStack','wrapGrid']) {
    const doc=fixture([{id:'first',kind:'text',text:'First'},badge,{id:'last',kind:'text',text:'Last'}]),before=structuredClone(doc);
    const result=run(doc,'badge',action),children=result.doc.pages[0].frames[0].root.children,wrapper=children[1];
    assert.equal(children[0].id,'first');assert.equal(children[2].id,'last');assert.equal(result.proposal.selection.nodeId,wrapper.id);
    if(action==='wrapGrid'){assert.equal(wrapper.kind,'grid');assert.equal(wrapper.children[0].kind,'gridItem');assert.deepEqual(wrapper.children[0].children,[badge]);}
    else {assert.equal(wrapper.kind,'stack');assert.deepEqual(wrapper.children,[badge]);}
    assert.deepEqual(doc,before);
  }
});
test('root, compound-slot uniqueness, required Card/header last child and incompatible wraps are denied without mutation',()=>{
  const doc=fixture([{id:'card',kind:'card',children:[{id:'header',kind:'cardHeader',children:[{id:'title',kind:'cardTitle',text:'Title'}]}]},{id:'grid',kind:'grid',children:[{id:'cell',kind:'gridItem',children:[]}]}]),before=structuredClone(doc);
  for(const action of NODE_ACTIONS) assert.ok(nodeActionReason(doc,scope('root'),action));
  for(const id of ['title','header']) assert.ok(nodeActionReason(doc,scope(id),'delete'));
  for(const id of ['title','header','cell']) {
    assert.ok(nodeActionReason(doc,scope(id),'wrapStack'));assert.ok(nodeActionReason(doc,scope(id),'wrapGrid'));
  }
  for(const id of ['header','title']) assert.ok(nodeActionReason(doc,scope(id),'duplicate'));
  assert.ok(nodeActionReason(doc,scope('grid'),'wrapGrid')); // Grid.Item cannot contain Grid; never flatten it.
  assert.deepEqual(doc,before);
});
test('delete removes only source, selects parent, allows empty layout; select-parent is a no-command no-op on data',()=>{
  const doc=fixture([{id:'host',kind:'stack',children:[badge]}]);
  const result=run(doc,'badge','delete');assert.deepEqual(result.doc.pages[0].frames[0].root.children[0].children,[]);assert.equal(result.proposal.selection.nodeId,'host');
  const parent=run(doc,'badge','selectParent');assert.equal(parent.proposal.command,null);assert.equal(parent.doc,doc);assert.equal(parent.proposal.selection.nodeId,'host');
  assert.ok(nodeActionReason(doc,{...scope('badge'),frameId:'foreign'},'delete'));
  assert.ok(nodeActionReason(doc,{...scope('badge'),projectId:'foreign'},'duplicate'));
});
test('node count/depth limits, reused source IDs and repeated generated IDs reject atomic proposal',()=>{
  const doc=fixture(Array.from({length:99},(_,i)=>({id:`text${i}`,kind:'text',text:'Text'}))),before=structuredClone(doc);
  for(const action of ['duplicate','wrapStack','wrapGrid']) assert.ok(nodeActionReason(doc,scope('text0'),action));
  assert.deepEqual(doc,before);
  let deep=badge;for(let i=0;i<11;i++)deep={id:`deep${i}`,kind:'stack',children:[deep]};
  const depth=fixture([deep]);assert.ok(nodeActionReason(depth,scope('badge'),'wrapStack'));
  assert.throws(()=>run(fixture([badge]),'badge','duplicate',()=> 'badge'),/fresh/);
  assert.throws(()=>run(fixture([{id:'host',kind:'stack',children:[badge]}]),'host','duplicate',()=> 'repeated'),/fresh/);
});
test('canvas shortcut policy preserves native editing/composition and unrelated modifier combinations',()=>{
  const event={key:'z',ctrlKey:false,metaKey:true,shiftKey:false,altKey:false,isComposing:false,defaultPrevented:false};
  assert.equal(composerShortcut(event,false),'undo');assert.equal(composerShortcut({...event,shiftKey:true},false),'redo');
  assert.equal(composerShortcut({...event,key:'d'},false),'duplicate');
  for(const key of ['Delete','Backspace'])assert.equal(composerShortcut({...event,key,metaKey:false},false),'delete');
  for(const key of ['z','d','Delete','Backspace']) {assert.equal(composerShortcut({...event,key},true),null);assert.equal(composerShortcut({...event,key,isComposing:true},false),null);}
  assert.equal(composerShortcut({...event,altKey:true},false),null);assert.equal(composerShortcut({...event,defaultPrevented:true},false),null);
});
