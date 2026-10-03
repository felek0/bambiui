import assert from 'node:assert/strict';
import test from 'node:test';
import { contains, insertionGeometry, clientToScene, slotHint } from './drop-target.ts';
const rect = (x,y,width=100,height=40) => ({x,y,width,height});
test('Stack orientation indexes and empty slots are geometric, not DOM order guesses', () => {
  const parent=rect(10,20,400,300), children=[rect(10,20),rect(120,20)];
  assert.equal(insertionGeometry(parent,children,{x:80,y:25},'row').index,1);
  assert.equal(insertionGeometry(parent,children,{x:200,y:25},'row').index,2);
  assert.equal(insertionGeometry(parent,[rect(10,20),rect(10,70)],{x:100,y:60},'column').index,1);
  assert.equal(insertionGeometry(parent,[],{x:50,y:50},'column').index,0);
});
test('Grid chooses row then cell midpoint and never invents a missing slot', () => {
  const children=[rect(0,0),rect(110,0),rect(0,50)];
  assert.equal(insertionGeometry(rect(0,0,220,100),children,{x:140,y:20},'grid').index,1);
  assert.equal(insertionGeometry(rect(0,0,220,100),children,{x:10,y:70},'grid').index,2);
  assert.equal(slotHint({id:'b',kind:'button',text:'Button'},'card'),null);
  assert.equal(slotHint({id:'h',kind:'cardHeader',children:[]},'button'),null);
  assert.match(slotHint({id:'g',kind:'grid',children:[]},'card'),/Grid.Item/);
  assert.match(slotHint({id:'c',kind:'card',children:[]},'button'),/Card.Content/);
});
test('client rectangles preserve row/column/grid indexes under translation and scale', () => {
  for (const zoom of [.5, 1, 1.5, 4]) {
    const transform = r => rect(83 + r.x * zoom, -27 + r.y * zoom, r.width * zoom, r.height * zoom);
    const point = (x,y) => ({x:83+x*zoom,y:-27+y*zoom});
    const parent=transform(rect(0,0,300,200));
    const row=[rect(0,0),rect(120,0)].map(transform);
    const column=[rect(0,0),rect(0,60)].map(transform);
    assert.equal(insertionGeometry(parent,row,point(110,20),'row').index,1);
    assert.equal(insertionGeometry(parent,column,point(20,50),'column').index,1);
    assert.equal(insertionGeometry(parent,[...row,transform(rect(0,60))],point(10,80),'grid').index,2);
    assert.deepEqual(insertionGeometry(parent,[],point(10,10),'column').line,{x:parent.x,y:parent.y,width:parent.width,height:2});
  }
});
test('missing DOM children do not compact model indexes or invent append positions', () => {
  const result=insertionGeometry(rect(0,0,400,100),[null,rect(100,0),null],{x:110,y:10},'row');
  assert.equal(result.index,1); assert.equal(result.line.x,100);
  const append=insertionGeometry(rect(0,0,400,100),[null,rect(100,0),null],{x:300,y:10},'row');
  assert.equal(append.index,3); assert.equal(append.line.x,200);
});
test('client camera inverse handles scroll offsets, pan and 50/100/150/400% zoom; clipped boundary excludes outside', () => {
  for(const zoom of [.5,1,1.5,4]) {
    const viewport=rect(80,-30,400,300), camera={x:25,y:60,zoom};
    assert.deepEqual(clientToScene({x:80+25+120*zoom,y:-30+60+90*zoom},viewport,camera),{x:120,y:90});
  }
  assert.equal(contains(rect(20,30,100,100),{x:120,y:40}),false);
  assert.equal(contains(rect(20,30,100,100),{x:20,y:30}),true);
  assert.equal(contains(rect(20,30,100,100),{x:50,y:131}),false);
});
