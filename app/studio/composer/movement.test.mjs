import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareMove, moveIndex, moveProposalCache } from './movement.ts';
import { applyComposerCommand } from './commands.ts';
import { createComposerDocument, createComposerPage, createComposerFrame, parseComposerDocument } from './model.ts';
import { createComposerHistory, executeComposerCommands, undoComposer, redoComposer } from './history.ts';

const text = id => ({id,kind:'text',text:id});
const stack = (id,children=[],props) => ({id,kind:'stack',children,...(props?{props}:{})});
function fixture(a=[stack('row',[text('a'),text('b'),text('c')],{direction:'row'}),stack('other')],b=[]) {
  const document=createComposerDocument('project','system','Move');
  const page=createComposerPage('page','Page');
  const source=createComposerFrame('source','rootA','mobile','Source'), target=createComposerFrame('target','rootB','mobile','Target');
  source.root.children=a;target.root.children=b;page.frames=[source,target];document.pages=[page];return parseComposerDocument(document);
}
const scope = {pageId:'page',sourceFrameId:'source',nodeId:'a',frameId:'source',parentId:'row',index:2};
const command = target => ({type:'moveNode',...scope,wrapperIds:[],...target});

test('row/column reorder indexes are authoritative after removal; painted gaps convert once',()=>{
  for(const direction of ['row','column']) {
    const document=fixture([stack('row',[text('a'),text('b'),text('c')],{direction})]);
    assert.equal(moveIndex(document,{...scope,index:3}),2);assert.equal(moveIndex(document,{...scope,index:1}),0);
    assert.equal(moveIndex(document,{...scope,nodeId:'c',index:0}),0);
    const moved=applyComposerCommand(document,command({}));
    assert.deepEqual(moved.pages[0].frames[0].root.children[0].children.map(n=>n.id),['b','c','a']);
    assert.deepEqual(document.pages[0].frames[0].root.children[0].children.map(n=>n.id),['a','b','c']);
    assert.throws(()=>applyComposerCommand(document,command({index:3})),/range/);
  }
});
test('reparent preserves IDs/props and permits empty source Stack; no hidden ancestor',()=>{
  const document=fixture([stack('row',[{id:'a',kind:'button',text:'A',props:{disabled:true}}]),stack('other')]);
  const moved=applyComposerCommand(document,command({parentId:'other',index:0}));
  assert.deepEqual(moved.pages[0].frames[0].root.children[0].children,[]);
  assert.deepEqual(moved.pages[0].frames[0].root.children[1].children[0],document.pages[0].frames[0].root.children[0].children[0]);
  assert.throws(()=>applyComposerCommand(document,command({parentId:'a',index:0})),/self|descendant/);
});
test('self, descendant and root moves reject without mutation',()=>{
  const document=fixture([stack('row',[stack('nested',[text('a')])])]), before=structuredClone(document);
  for(const parentId of ['row','nested','a']) assert.throws(()=>applyComposerCommand(document,command({nodeId:'row',parentId,index:0})),/self|descendant/);
  assert.throws(()=>applyComposerCommand(document,command({nodeId:'rootA'})),/root/);
  assert.deepEqual(document,before);
});
test('Grid, root control and Card body wrappers are explicit, atomic and select the actual node',()=>{
  for(const [parent,index,kind] of [[{id:'grid',kind:'grid',children:[]},0,'gridItem'],[{id:'card',kind:'card',children:[{id:'header',kind:'cardHeader',children:[{id:'title',kind:'cardTitle',text:'Title'}]}]},1,'cardContent']]) {
    const document=fixture([stack('row',[{id:'a',kind:'button',text:'A'}]),parent]);
    const proposal=prepareMove(document,{...scope,parentId:parent.id,index},()=> 'wrapper');
    assert.equal(proposal.wrappers[0].kind,kind);assert.match(proposal.hint,/explicit/);
    const moved=applyComposerCommand(document,command({parentId:parent.id,index,wrapperIds:['wrapper']}));
    assert.equal(moved.pages[0].frames[0].root.children[1].children.at(-1).children[0].id,'a');
  }
  const document=fixture([stack('row',[{id:'a',kind:'button',text:'A'}])]);
  assert.equal(prepareMove(document,{...scope,parentId:'rootA',index:1},()=> 'wrapper').wrappers[0].kind,'stack');
  const card={id:'card',kind:'card',children:[{id:'body',kind:'cardContent',children:[text('existing')]}]};
  const result=prepareMove(fixture(undefined,[card]),{...scope,frameId:'target',parentId:'card',index:0},()=> 'unused');
  assert.equal(result.parentId,'body');assert.equal(result.index,1);assert.equal(result.wrappers.length,0);assert.match(result.hint,/existing Card.Content/);
});
test('required source Card/Header emptiness, duplicate slots and incomplete destinations reject atomically',()=>{
  const card=id=>({id,kind:'card',children:[{id:`${id}body`,kind:'cardContent',children:[]}]});
  const document=fixture([card('one')],[card('two')]),before=structuredClone(document);
  assert.throws(()=>applyComposerCommand(document,command({nodeId:'onebody',frameId:'target',parentId:'two',index:1})),/missing children|duplicate slot/);
  const withHeader=fixture([{id:'one',kind:'card',children:[{id:'header',kind:'cardHeader',children:[{id:'title',kind:'cardTitle',text:'Title'}]}]}],[{id:'two',kind:'card',children:[{id:'header2',kind:'cardHeader',children:[{id:'title2',kind:'cardTitle',text:'Title2'}]}]}]);
  assert.throws(()=>applyComposerCommand(withHeader,command({nodeId:'title',frameId:'target',parentId:'header2',index:1})),/missing children|duplicate slot/);
  assert.deepEqual(document,before);
});
test('nested forms and unsupported exact slots reject final trees without source deletion',()=>{
  const form={id:'form',kind:'form',props:{action:'/submit'},children:[stack('inside')]};
  const document=fixture([stack('row',[form])],[{id:'outer',kind:'form',props:{action:'/submit'},children:[stack('targetStack')]}]);
  const before=structuredClone(document);
  assert.throws(()=>applyComposerCommand(document,command({nodeId:'form',frameId:'target',parentId:'targetStack',index:0})),/nested form/);
  assert.deepEqual(document,before);
});
test('cross-frame collisions anywhere in subtree are safe failures, never copies/remaps',()=>{
  const document=fixture(undefined,[stack('targetStack',[text('a')])]), before=structuredClone(document);
  assert.throws(()=>applyComposerCommand(document,command({frameId:'target',parentId:'targetStack',index:0})),/collision/);
  const nested=fixture([stack('row',[stack('sub',[text('a')])])],[text('a')]);
  assert.throws(()=>applyComposerCommand(nested,command({nodeId:'sub',frameId:'target',parentId:'rootB',index:1})),/collision/);
  assert.deepEqual(document,before);
});
test('cross-frame final source and destination validate together, single history step/undo/redo',()=>{
  const document=fixture(undefined,[stack('targetStack')]), before=structuredClone(document);
  const history=createComposerHistory(document);
  const next=executeComposerCommands(history,[command({frameId:'target',parentId:'targetStack',index:0})]);
  assert.equal(next.past.length,1);assert.equal(next.present.pages[0].frames[1].root.children[0].children[0].id,'a');
  assert.deepEqual(undoComposer(next,['system']).present,document);assert.deepEqual(redoComposer(undoComposer(next,['system']),['system']).present,next.present);
  assert.deepEqual(document,before);assert.equal(history.past.length,0);
  assert.throws(()=>undoComposer(next,[]),/system/);
});
test('identity moves preserve history/redo branch; proposal cache does not mutate snapshots',()=>{
  const document=fixture(), history=createComposerHistory(document);
  assert.equal(executeComposerCommands(history,[command({index:0})]),history);
  const cache=moveProposalCache(document,{pageId:'page',sourceFrameId:'source',nodeId:'a'});
  const target={frameId:'source',parentId:'row',index:3},first=cache(target);
  assert.equal(cache({...target,rect:{x:100,y:100,width:20,height:20},line:null}),first);assert.deepEqual(Object.keys(first.target).sort(),Object.keys(scope).sort());
  assert.equal(cache(target),first);assert.equal(first.target.index,2);assert.deepEqual(document,history.present);
  assert.equal(cache({...target,parentId:'a'}).ok,false);
});
test('destination duplicate slots reject even when source remains complete; source required emptiness independently rejects',()=>{
  const card=(id,header=false)=>({id,kind:'card',children:[...(header?[{id:`${id}Header`,kind:'cardHeader',children:[{id:`${id}Title`,kind:'cardTitle',text:'Title'}]}]:[]),{id:`${id}Content`,kind:'cardContent',children:[]}]});
  const complete=fixture([card('one',true)],[card('two')]),before=structuredClone(complete);
  assert.throws(()=>applyComposerCommand(complete,command({nodeId:'oneContent',frameId:'target',parentId:'two',index:1})),/duplicate slot/);assert.deepEqual(complete,before);
  const sourceRequired=fixture([card('one')],[{id:'two',kind:'card',children:[{id:'twoHeader',kind:'cardHeader',children:[{id:'twoTitle',kind:'cardTitle',text:'Title'}]}]}]);
  assert.throws(()=>applyComposerCommand(sourceRequired,command({nodeId:'oneContent',frameId:'target',parentId:'two',index:1})),/missing children/);
});
test('wrapper IDs reject collisions/missing/unused and unknown command keys',()=>{
  const document=fixture(undefined,[{id:'grid',kind:'grid',children:[]}]);
  const target={frameId:'target',parentId:'grid',index:0};
  assert.throws(()=>applyComposerCommand(document,command(target)),/missing wrapper/);
  assert.throws(()=>applyComposerCommand(document,command({...target,wrapperIds:['rootB']})),/duplicate/);
  assert.throws(()=>applyComposerCommand(document,command({...target,wrapperIds:['new','unused']})),/unused/);
  assert.throws(()=>applyComposerCommand(document,{...command({}),projectId:'foreign'}),/unknown key/);
});
test('project-wide node quota includes move wrappers; failure does not mutate either frame',()=>{
  const document=fixture();document.pages=[];
  for(let p=0;p<2;p++) {
    const page=createComposerPage(`page${p}`);
    for(let f=0;f<10;f++) {
      const frame=createComposerFrame(`frame${p}-${f}`,`root${p}-${f}`,'mobile');
      frame.root.children=[stack(`stack${p}-${f}`,Array.from({length:93},(_,i)=>text(`text${p}-${f}-${i}`)))];page.frames.push(frame);
    }
    document.pages.push(page);
  }
  const extra=createComposerPage('extra'),frame=createComposerFrame('extraFrame','extraRoot','mobile');frame.root.children=[stack('extraStack',Array.from({length:98},(_,i)=>text(`extra${i}`)))];extra.frames=[frame];document.pages.push(extra);
  document.pages[0].frames[0].root.children[0].children[0]={id:'text0-0-0',kind:'button',text:'Move'};
  const parsed=parseComposerDocument(document),before=structuredClone(parsed);
  assert.throws(()=>applyComposerCommand(parsed,{type:'moveNode',pageId:'page0',sourceFrameId:'frame0-0',nodeId:'text0-0-0',frameId:'frame0-1',parentId:'root0-1',index:1,wrapperIds:['wrapper']}),/limit/);
  assert.deepEqual(parsed,before);
});
test('node count, depth and foreign-page boundaries are authoritative with immutable failures',()=>{
  const document=fixture(undefined,[stack('full',Array.from({length:98},(_,i)=>text(`n${i}`)))]);
  assert.throws(()=>applyComposerCommand(document,command({frameId:'target',parentId:'full',index:0})),/limit/);
  let deep=stack('deep');for(let i=0;i<11;i++) deep=stack(`depth${i}`,[deep]);
  const depth=fixture(undefined,[deep]);
  assert.throws(()=>applyComposerCommand(depth,command({frameId:'target',parentId:'deep',index:0})),/limit|depth/);
  assert.throws(()=>applyComposerCommand(fixture(),command({pageId:'foreign',frameId:'target',parentId:'rootB',index:0})),/current page/);
});
