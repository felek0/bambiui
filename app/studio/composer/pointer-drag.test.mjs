import assert from 'node:assert/strict';
import test from 'node:test';
import { startPointerDrag, pointerDragActive } from './pointer-drag.ts';

function environment(run) {
  const saved={window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const window=new EventTarget(), frames=new Map(); let serial=0;
  globalThis.window=window;
  globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  class Source extends EventTarget {
    capture=null;
    setPointerCapture(id){this.capture=id;}
    hasPointerCapture(id){return this.capture===id;}
    releasePointerCapture(){this.capture=null;this.dispatchEvent(pointer('lostpointercapture'));}
  }
  const source=new Source(), owner={}, moves=[], finishes=[];
  const options={owner,source,event:{pointerId:1,pointerType:'mouse',button:0,clientX:10,clientY:20},onMove:p=>moves.push(p),onFinish:(...args)=>finishes.push(args)};
  const dispatch=(type,props={})=>window.dispatchEvent(pointer(type,props));
  const paint=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());};
  try { run({source,owner,moves,finishes,frames,options,dispatch,paint}); }
  finally {Object.assign(globalThis,saved);}
}
function pointer(type,props={}) { const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,clientX:10,clientY:20,...props});return event; }

test('one drag owner, threshold, foreign pointers and rAF coalescing; final pointerup position commits once',()=>environment(({owner,source,options,moves,finishes,dispatch,paint,frames})=>{
  const abort=startPointerDrag(options); assert.equal(pointerDragActive(owner),true); assert.equal(source.capture,1);
  assert.equal(startPointerDrag(options),null);
  dispatch('pointermove',{clientX:12});paint();assert.equal(moves.length,0);
  dispatch('pointermove',{pointerId:2,clientX:50});dispatch('pointerup',{pointerId:2});assert.equal(finishes.length,0);
  dispatch('pointermove',{clientX:30});dispatch('pointermove',{clientX:40});assert.equal(frames.size,1);paint();assert.deepEqual(moves,[{x:40,y:20}]);
  dispatch('pointermove',{clientX:45});dispatch('pointerup',{clientX:55});
  assert.deepEqual(finishes,[[true,true,{x:55,y:20}]]);assert.equal(frames.size,0);assert.equal(source.capture,null);assert.equal(pointerDragActive(owner),false);
  abort();dispatch('pointermove',{clientX:80});dispatch('pointerup');assert.equal(finishes.length,1);assert.equal(frames.size,0);
}));
test('Escape, blur, matching cancellation and lost capture clean up without committing',()=>{
  for(const reason of ['keydown','blur','pointercancel','lostpointercapture','contextmenu']) environment(({owner,source,options,finishes,dispatch,frames})=>{
    startPointerDrag(options);dispatch('pointermove',{clientX:50});
    dispatch('pointercancel',{pointerId:2});assert.equal(finishes.length,0);
    if(reason==='lostpointercapture') source.dispatchEvent(pointer(reason));else dispatch(reason,{key:'Escape'});
    assert.deepEqual(finishes,[[false,true,{x:50,y:20}]]);assert.equal(pointerDragActive(owner),false);assert.equal(frames.size,0);
    dispatch('pointerup');assert.equal(finishes.length,1);
  });
});
test('edge-pan ticks share the motor rAF and stop on cancellation, even without another pointermove',()=>environment(({options,dispatch,paint,frames,finishes})=>{
  let ticks=0;startPointerDrag({...options,onMove:()=>{ticks++;return true;}});
  dispatch('pointermove',{clientX:30});paint();paint();assert.equal(ticks,2);assert.equal(frames.size,1);
  dispatch('keydown',{key:'Escape'});assert.equal(frames.size,0);paint();assert.equal(ticks,2);assert.equal(finishes[0][0],false);
}));
test('click remains a click and touch/secondary-button drags are not claimed',()=>environment(({owner,options,finishes,dispatch})=>{
  for(const event of [{...options.event,pointerType:'touch'},{...options.event,button:2}]) assert.equal(startPointerDrag({...options,event}),null);
  assert.equal(pointerDragActive(owner),false);startPointerDrag(options);dispatch('pointerup',{clientX:12});assert.deepEqual(finishes,[[true,false,{x:12,y:20}]]);
}));
