#!/usr/bin/env node
// Run only after the coordinator confirms out/ is build-ready; never builds or generates.
// Uses installed Chrome and a disposable browser profile.
// --screenshots writes review captures to .next/color-review; AX checks are not a screen-reader session.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../out/', import.meta.url));
const captureDir = fileURLToPath(new URL('../.next/color-review/', import.meta.url));
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json' };
const pending = new Map(), failures = [], errors = [];
let server, chrome, profile, socket, sequence = 0, passes = 0, acceptImportDialog = false, timedOut = false, currentCheck = 'startup', pressedPointer = null;
const watchdog = setTimeout(() => {
  timedOut = true;
  console.error(`Smoke test exceeded 300 seconds during ${currentCheck}`);
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Smoke watchdog expired')); }
  pending.clear(); socket?.close(); chrome?.kill('SIGKILL');
}, 300000);
const ids = ['button', 'input', 'card', 'badge', 'switch', 'checkbox', 'text'];
const foundations = ['colors', 'typography', 'spacing'];
const matrixCounts = { button:18, input:9, switch:12, checkbox:12, badge:54, card:9, text:180 };
const matrixVariants = {
  button:['primary','secondary','outline','ghost','destructive','link'], input:['default','invalid','readonly'],
  switch:['checked','unchecked','invalidChecked','invalidUnchecked'], checkbox:['checked','unchecked','invalidChecked','invalidUnchecked'],
  badge:['solid','subtle','outline'], card:['outlined','elevated','filled'], text:['heading','h1','h2','h3','h4','h5','h6','paragraph','label','caption'],
};
const tones = ['neutral','primary','success','warning','danger','info'];
const matrix = id => `[data-component-matrix="${id}"]`;
const example = (id, recipe) => `${matrix(id)} [data-recipe-example="${recipe}"]`;
const recipePart = (id, recipe, part, target) => `${example(id,recipe)} [data-ds-component="${id}"][data-component-part="${part}"]${target ? `[data-component-target="${target}"]` : ''}`;
const recipeField = (id, recipe, part, target, field) => `[id="system-recipe-${id}-${recipe}-${part}-${target}-${field}"]`;
const interactions = id => `[data-specimen="${id}"] [data-interaction-examples]`;
const textFields = ['fontSize','fontWeight','lineHeight','letterSpacing','textAlign','color'];
const frameFields = ['width','height','minWidth','minHeight','maxWidth','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius','gap','background','borderColor','borderWidth','shadow','opacity'];
const href = (view, id = 'colors') => `${view === 'develop' ? '/develop' : ''}/${id}`;
const canvas = '[aria-label="Component canvas"]';
const viewNav = '.studio-header nav.view-switch';
const workbenchToolbar = '[data-workbench-toolbar]';
const themeControl = `${workbenchToolbar} [aria-label="Design theme"]`;
const playgroundControls = id => `[data-playground-controls-for="${id}"]`;
const workbenchMode = mode => `${workbenchToolbar} [data-workbench-mode="${mode}"]`;
const camera = '[data-canvas]';
const matrixScroll = '[data-matrix-scroll]';

async function assertStudioSurfaces(mode) {
  const surface = mode === 'dark' ? 'rgb(32, 32, 32)' : 'rgb(250, 250, 250)';
  await wait(`getComputedStyle(${q('.studio-header')}).backgroundColor === ${JSON.stringify(surface)}`);
  for (const selector of ['.studio-header','#token-editor','.studio-sidebar',workbenchToolbar,'#workspace-inspector']) {
    assert.equal(await evaluate(`getComputedStyle(${q(selector)}).backgroundColor`),surface,`${selector} must retain the fixed editor surface`);
  }
  assert.equal(await evaluate(`getComputedStyle(${q('.preview-frame')}).backgroundColor`),mode === 'dark' ? 'rgb(25, 25, 29)' : 'rgb(241, 241, 244)','canvas chrome is independent of system tokens');
  assert.equal(await evaluate(`getComputedStyle(${q('.theme-pane')}).borderTopWidth`),'0px','the full-bleed workspace has no inset preview border');
}

async function assertWorkbenchToolbar(view, mode = 'variants') {
  assert.equal(await evaluate(`document.querySelectorAll('[data-workbench-toolbar]').length`),1);
  assert.ok(await evaluate(`(()=>{const bar=${q(workbenchToolbar)},theme=${q(themeControl)};return bar.checkVisibility() && theme?.checkVisibility() && !bar.closest('.studio-header,.preview-frame') && theme.closest('[data-workbench-toolbar]')===bar && getComputedStyle(${q('.canvas-theme')}).position==='static'})()`),'one shared theme control lives in the common toolbar');
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Design theme"]').length`),1);
  assert.equal(await evaluate(`!!${q('.studio-header [aria-controls="workspace-sidebar"], .studio-header [aria-controls="workspace-inspector"], .header-actions [aria-label="Import design system"], [aria-label="Focus canvas"], [aria-label="Show panels"], .preview-frame .canvas-history, .preview-frame .canvas-theme')}`),false,'obsolete header controls and floating history/theme must not return');
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Undo change"], [aria-label="Redo change"]').length`),view==='design' && mode==='variants' ? 2 : 0);
  if(view==='design' && mode==='variants') assert.ok(await evaluate(`(()=>{const h=${q('.canvas-history')};return h.closest('[data-workbench-toolbar]')===${q(workbenchToolbar)} && getComputedStyle(h).position==='static'})()`));
  assert.ok(await evaluate(`${q(`${workbenchToolbar} [aria-controls="workspace-sidebar"]`)}?.checkVisibility()`));
  if(view==='design') assert.equal(await evaluate(`${q(`${workbenchToolbar} [aria-controls="workspace-inspector"]`)}.textContent.trim()`),mode==='playground' ? 'Props' : 'Styles');
}
async function assertComponentMode(id, mode) {
  await wait(`${q('.studio-shell')}.dataset.componentMode===${JSON.stringify(mode)}`);
  for(const candidate of ['variants','playground']) {
    const pane=candidate==='variants'?'[data-matrix-pane]':'[data-playground-pane]';
    assert.ok(await evaluate(`${q(workbenchMode(candidate))} instanceof HTMLButtonElement`),'modes use native buttons');
    assert.equal(await evaluate(`${q(workbenchMode(candidate))}.getAttribute('aria-pressed')`),String(candidate===mode));
    assert.equal(await evaluate(`${q(workbenchMode(candidate))}.getAttribute('aria-controls')`),`component-${candidate}`);
    assert.equal(await evaluate(`${q(pane)}.id`),`component-${candidate}`);
    assert.equal(await evaluate(`${q(pane)}.hidden`),candidate!==mode);
    assert.equal(await evaluate(`${q(pane)}.checkVisibility()`),candidate===mode);
    if(candidate!==mode) assert.ok(await evaluate(`[...${q(pane)}.querySelectorAll('button,input,select,textarea,a,summary')].every(e=>!e.checkVisibility())`),'inactive pane exposes no visible controls');
  }
  assert.equal(await evaluate(`${q('#token-editor')}.hidden`),mode==='playground');
  assert.ok(await evaluate(`(()=>{const controls=${q(playgroundControls(id))},host=${q('[data-playground-host]')};return host.closest('#workspace-inspector') && host.contains(controls) && !${q(`[data-component-playground="${id}"]`)}.contains(controls) && controls.hidden===${mode!=='playground'} && host.hidden===${mode!=='playground'}})()`),'props are scoped by component in the inspector portal');
  await assertWorkbenchToolbar('design',mode);
}
async function setComponentMode(id, mode) {
  await click(q(workbenchMode(mode)));
  await assertComponentMode(id,mode);
}

const moved = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
async function wheel(point, deltaX, deltaY, modifiers = 0) {
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX,deltaY,modifiers});
}
async function canvasBackground() {
  // Locate a real empty hit target; specimen inputs and controls must remain interactive.
  return evaluate(`(()=>{const e=${q(canvas)},r=e.getBoundingClientRect();for(let y=r.top+12;y<Math.min(r.bottom,innerHeight)-12;y+=8)for(let x=r.left+12;x<Math.min(r.right,innerWidth)-12;x+=8){const safe=(px,py)=>{const t=document.elementFromPoint(px,py);return t && e.contains(t) && !t.closest('[data-specimen],[data-foundation],button,a,input,textarea,select,label,summary')};if(safe(x,y)&&safe(x+12,y+12))return {x,y};}throw Error('No visible canvas background')})()`);
}
async function stableCamera() {
  await delay(500);
  return evaluate(cameraState);
}
async function route(view, id = 'colors') {
  const path = href(view, id);
  await wait(`location.pathname === ${JSON.stringify(path)} && ${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
  await wait(`${q('.workspace-panel--' + view)} && !${q('.workspace-panel--' + view)}.hidden`);
  assert.equal(await evaluate(`${q('.studio-sidebar a[aria-current="page"]')}.getAttribute('href')`), path);
  assert.equal(await evaluate(`${q(viewNav + ' a[aria-current="page"]')}.textContent.trim()`), view === 'design' ? 'Design' : 'Develop');
  assert.equal(await evaluate(`!!${q('.breadcrumbs')} || !!${q('.viewport-controls')}`), false);
  assert.equal(await evaluate(`${q('#token-editor')}.hidden`), view === 'develop');
  assert.equal(await evaluate(`!!${q('.editor-scope')}`),false);
  const isFoundation = foundations.includes(id);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-specimen]')].map(e=>e.dataset.specimen)`),isFoundation ? [] : [id]);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-component-matrix]')].map(e=>e.dataset.componentMatrix)`),isFoundation ? [] : [id]);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-foundation]')].map(e=>e.dataset.foundation).sort()`),isFoundation ? [...foundations].sort() : []);
  assert.equal(await evaluate(`document.querySelectorAll('[data-recipe-example]').length`),isFoundation ? 0 : matrixCounts[id]);
  assert.equal(await evaluate(`document.querySelectorAll('[data-interaction-examples]').length`),isFoundation || id==='text' ? 0 : 1);
  assert.equal(await evaluate(`!!${q('[data-system-starter]')} || /Starting component/i.test(${q('.preview-frame')}.textContent)`),false,'Starting component must not be rendered');
  await assertWorkbenchToolbar(view);
  if (isFoundation) {
    assert.equal(await evaluate(`!!${q('[data-workbench-mode]')}`),false);
    assert.ok(await evaluate(`!!${q(canvas)} && !!${q(camera)} && !!${q('[aria-label="Canvas zoom"]')}`),'foundations retain the canvas and camera');
    assert.equal(await evaluate(`!!${q(matrixScroll)}`),false);
  } else {
    assert.ok(await evaluate(`(()=>{const s=${q(matrixScroll)},c=${q('[data-matrix-content]')},t=${q(workbenchToolbar)};return s?.getAttribute('role')==='region' && s.getAttribute('aria-label')==='Component examples' && s.contains(c) && c.contains(${q(`[data-specimen="${id}"]`)}) && getComputedStyle(c).transform==='none' && !s.contains(t) && !['absolute','fixed','sticky'].includes(getComputedStyle(t).position)})()`),'component routes use natural matrix content below the common toolbar');
    if(view==='design') await assertComponentMode(id,'variants');
    assert.equal(await evaluate(`!!${q('[data-canvas], [aria-label="Component canvas"], [aria-label="Canvas zoom"], [class*="canvasHelp"], [data-canvas-selection-hint]')}`),false,'component routes must not mount camera chrome or help');
  }
}
async function navigate(view, id = 'colors') {
  const currentView = await evaluate(`location.pathname.startsWith('/develop') ? 'develop' : 'design'`);
  if (currentView !== view) await click(named(viewNav + ' a',view === 'design' ? 'Design' : 'Develop'));
  await click(q(`.studio-sidebar a[href="${href(view, id)}"]`));
  await route(view, id);
  if (await evaluate('innerWidth<=800')) await hideMobilePanels();
}
async function openStatic(view, id) {
  const origin = await evaluate('performance.timeOrigin');
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${href(view,id)}`});
  await wait(`performance.timeOrigin!==${origin}`); await route(view,id);
}
async function key(key, code = key) {
  const windowsVirtualKeyCode = {ArrowDown:40,ArrowRight:39,Enter:13,Tab:9,Escape:27,Backspace:8,' ':32}[key];
  await send('Input.dispatchKeyEvent', {type:'keyDown', key, code, windowsVirtualKeyCode, ...(key === 'Enter' ? {text:'\r'} : {})});
  await send('Input.dispatchKeyEvent', {type:'keyUp', key, code, windowsVirtualKeyCode});
}

function send(method, params = {}) {
  if (timedOut || socket?.readyState !== 1) return Promise.reject(new Error('CDP unavailable'));
  if(method==='Input.dispatchMouseEvent') {
    if(params.type==='mousePressed') pressedPointer={x:params.x,y:params.y,button:params.button};
    else if(params.type==='mouseReleased') pressedPointer=null;
    else if(pressedPointer) Object.assign(pressedPointer,{x:params.x,y:params.y});
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 7000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}
async function wait(expression) {
  const until = Date.now() + 4500;
  do { if (await evaluate(`(async()=>!!(await (${expression})))()`)) return; await delay(60); } while (Date.now() < until && !timedOut);
  throw new Error(`Timed out: ${expression}`);
}
const q = selector => `document.querySelector(${JSON.stringify(selector)})`;
const cameraState = `(() => {const view=${q(canvas)},layer=${q(camera)},matrix=new DOMMatrixReadOnly(getComputedStyle(layer).transform);return {x:matrix.m41,y:matrix.m42,scale:matrix.a,scrollLeft:view.scrollLeft,scrollTop:view.scrollTop,scrollWidth:view.scrollWidth,clientWidth:view.clientWidth,scrollHeight:view.scrollHeight,clientHeight:view.clientHeight}})()`;
const named = (selector, name) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => (e.getAttribute('aria-label') || e.textContent.trim()) === ${JSON.stringify(name)} && !e.closest('[hidden]'))`;
async function assertRecipeSelection(id, recipe, part, target) {
  const controls = '[data-system-recipe-controls]';
  await wait(`${q(controls)}?.dataset.recipe===${JSON.stringify(recipe)} && ${q(controls)}?.dataset.part===${JSON.stringify(part)} && ${q(controls)}?.dataset.target===${JSON.stringify(target)}`);
  assert.equal(await evaluate('location.pathname'),href('design',id));
  assert.equal(await evaluate(`document.querySelectorAll('${controls}').length`),1);
  await stylesInspector();
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('${matrix(id)} [data-recipe-example][data-selected]')].map(e=>e.dataset.recipeExample)`),[recipe]);
  const prefix = `system-recipe-${id}-${recipe}-${part}-${target}-`;
  const gap = id!=='text' && ['root','header','content','footer','row','error'].includes(part) || id==='input' && part==='control';
  const expected = target==='text' ? (['switch','checkbox'].includes(id) && part==='control' || id==='card' && part==='icon' ? ['color'] : textFields) : frameFields.filter(field=>field!=='gap' || gap);
  assert.equal(await evaluate(`${q('[data-system-layer-select]')}.value`),part);
  assert.equal(await evaluate(`${q(`[data-system-style-target="${target}"]`)}.getAttribute('aria-pressed')`),'true');
  assert.deepEqual(await evaluate(`[...${q(controls)}.querySelectorAll('input,select,textarea')].filter(e=>!e.matches('[data-system-layer-select]')).map(e=>e.id.startsWith(${JSON.stringify(prefix)}) ? e.id.slice(${prefix.length}) : e.id).sort()`),[...expected].sort(),'only style controls consumed by this exact frame/text layer, plus the compact layer picker');
}
async function assertMeasuredRecipe(id, recipe, part, target, keys, elementSelector = recipePart(id,recipe,part,target)) {
  const fields = keys.map(key => ({key, selector:recipeField(id,recipe,part,target,key)}));
  const differences = `(()=>{const element=${q(elementSelector)};if(!element)return ['missing preview'];const style=getComputedStyle(element);return ${JSON.stringify(fields)}.flatMap(({key,selector})=>{const input=document.querySelector(selector);if(!input)return [key+': missing field'];const value=input.tagName==='SELECT' ? input.selectedOptions[0]?.textContent : input.value;let expected=style[key==='background' ? 'backgroundColor' : key==='shadow' ? 'boxShadow' : key];if(key==='lineHeight' && expected.endsWith('px'))expected=String(Number((parseFloat(expected)/parseFloat(style.fontSize)).toFixed(6)));else if(['letterSpacing','gap'].includes(key)&&expected==='normal')expected='0';else if(key==='textAlign'&&['start','end'].includes(expected))expected=(expected==='start')!==(style.direction==='rtl') ? 'left' : 'right';else if(expected.endsWith('px')&&!expected.includes(' '))expected=String(parseFloat(expected));if(['color','background','borderColor'].includes(key)){const rgb=expected.match(/^rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)$/);if(rgb)expected='#'+rgb.slice(1).map(channel=>Number(channel).toString(16).padStart(2,'0')).join('');if(expected==='rgba(0, 0, 0, 0)')expected='transparent';}return value===expected ? [] : [{key,value,expected}];});})()`;
  await wait(`(${differences}).length===0`);
  assert.deepEqual(await evaluate(differences),[],`${id}/${recipe}/${part}/${target} shows rendered values`);
}
async function commitRecipe(id, recipe, part, target, field, value) {
  await fill(recipeField(id,recipe,part,target,field),String(value));
  await key('Enter');
  await wait(`JSON.parse(localStorage.getItem('bambiui.design-system.v1')).themes[document.documentElement.dataset.studioTheme].componentRecipes?.[${JSON.stringify(id)}]?.[${JSON.stringify(recipe)}]?.[${JSON.stringify(part)}]?.[${JSON.stringify(field)}]===${JSON.stringify(value)}`);
}
function expectedRecipePatch(system, id, recipes, part, patch, modes = ['light','dark']) {
  const expected = structuredClone(system);
  for(const mode of modes) for(const recipe of recipes) {
    const component = ((expected.themes[mode].componentRecipes ??= {})[id] ??= {});
    Object.assign((component[recipe] ??= {})[part] ??= {},patch);
  }
  return expected;
}
const recipePaintExpression = (id, properties) => `[...document.querySelectorAll('${matrix(id)} [data-recipe-body] [data-component-part]')].map(e=>{const s=getComputedStyle(e);return {recipe:e.closest('[data-recipe-example]').dataset.recipeExample,component:e.dataset.dsComponent,part:e.dataset.componentPart,values:Object.fromEntries(${JSON.stringify(properties)}.map(key=>[key,s[key]]))}})`;
async function recipePaint(id, properties) {
  return evaluate(recipePaintExpression(id,properties));
}
async function assertSettledRecipePaint(id, properties, expected, message) {
  // Stored tokens update before CSS transitions finish; wait for the exact full-matrix paint.
  await wait(`JSON.stringify(${recipePaintExpression(id,properties)})===${JSON.stringify(JSON.stringify(expected))}`);
  assert.deepEqual(await recipePaint(id,properties),expected,message);
}
async function resetRecipeField(id, recipe, part, target, field) {
  await click(`${q(recipeField(id,recipe,part,target,field))}.closest('[data-appearance-field]').querySelector('button[aria-label^="Reset "]')`);
}
async function openInteractions(id) {
  const selector = interactions(id);
  if (!await evaluate(`${q(selector)}?.open`)) await click(q(`${selector} > summary`));
  assert.equal(await evaluate(`${q(selector)}.open`),true);
}
async function panel(id, open) {
  const hidden = await evaluate(`${q('#' + id)}.hidden`);
  if (hidden === open) await click(q(`[aria-controls="${id}"]`), false);
  await wait(`${q('#' + id)}.hidden===${!open}`);
}
async function hideMobilePanels() {
  if (!await evaluate('innerWidth<=800')) return;
  await panel('workspace-sidebar', false); await panel('workspace-inspector', false);
}
async function reveal(expression) {
  // Open every closed ancestor through its real summary, outermost first.
  for (let i = 0; i < 6; i++) {
    const summary = `(()=>{const e=(${expression});let closed=null;for(let p=e?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(e))closed=p;return closed?.querySelector(':scope > summary')})()`;
    if (!await evaluate(`!!(${summary})`)) return;
    await click(summary);
  }
  throw new Error(`Cannot reveal details for ${expression}`);
}
async function select(selector, value) {
  await reveal(q(selector));
  assert.equal(await evaluate(`(()=>{const e=${q(selector)};return !!e && e.checkVisibility() && !e.disabled && [...e.options].some(option=>option.value===${JSON.stringify(value)})})()`),true,`Visible enabled select with option: ${selector} = ${value}`);
  await evaluate(`(()=>{const e=${q(selector)};e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(`${q(selector)}.value===${JSON.stringify(value)}`);
}
async function stylesInspector() {
  await wait(`${q('#token-editor [data-style-inspector]')}`);
  assert.equal(await evaluate(`!!${q('#token-editor [role="tablist"]')}`),false,'style editing no longer shares tabs with sample args');
}
async function positionCanvas(expression) {
  if (await evaluate(`!!(${expression}).closest('[data-matrix-scroll]')`)) {
    // Scroll only the owning matrix; scrollIntoView would also move its ancestors.
    await evaluate(`(()=>{const e=(${expression}),s=e.closest('[data-matrix-scroll]'),r=e.getBoundingClientRect(),v=s.getBoundingClientRect(),t=s.querySelector('[data-matrix-toolbar]'),top=Math.max(v.top,t?.getBoundingClientRect().bottom??v.top);if(t?.contains(e))return;if(r.top<top+8 || r.bottom>v.bottom-8)s.scrollTop+=(r.top+r.bottom-top-v.bottom)/2;if(r.left<v.left+8 || r.right>v.right-8)s.scrollLeft+=(r.left+r.right-v.left-v.right)/2})()`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
    return;
  }
  if (!await evaluate(`innerWidth>760 && !!(${expression}).closest('[data-canvas]')`)) return;
  await wait(`new Promise(resolve=>{const before=getComputedStyle(${q(camera)}).transform;requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(before===getComputedStyle(${q(camera)}).transform)))})`);
  // Desktop uses a transform camera, not native scrolling. Pan using real wheel input.
  const offset = await evaluate(`(()=>{const r=(${expression}).getBoundingClientRect(),v=${q(canvas)}.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return x>=v.left+24 && x<=v.right-24 && y>=v.top+72 && y<=v.bottom-76 ? null : {x:v.x+v.width/2,y:v.y+v.height/2,dx:x-v.x-v.width/2,dy:y-v.y-v.height/2}})()`);
  if (!offset) return;
  assert.equal(await evaluate(`${q(canvas)}.contains(document.elementFromPoint(${offset.x},${offset.y}))`),true,'wheel pan must hit the canvas');
  await wheel({x:offset.x,y:offset.y},offset.dx,offset.dy);
  await wait(`(()=>{const r=(${expression}).getBoundingClientRect();return Math.abs(r.x+r.width/2-${offset.x})<3 && Math.abs(r.y+r.height/2-${offset.y})<3})()`);
}
async function click(expression, preparePanel = true, exact = false) {
  assert.ok(await evaluate(`!!(${expression})`), `Missing control: ${expression}`);
  if (preparePanel && await evaluate('innerWidth<=800')) {
    const target = await evaluate(`(${expression}).closest('#workspace-sidebar,#workspace-inspector,.studio-main')?.id || null`);
    if (target === 'workspace-sidebar' || target === 'workspace-inspector') await panel(target, true);
    else if (target === 'workspace') await hideMobilePanels();
  }
  await reveal(expression);
  const destination = await evaluate(`(${expression}).closest('a')?.getAttribute('href') || null`);
  if (!await evaluate(`!!(${expression}).closest('[data-matrix-scroll]')`)) await evaluate(`(${expression}).scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  if (await evaluate(`!!(${expression}).closest('[data-frame-size-editor]')`)) await evaluate(`(${expression}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})`);
  await positionCanvas(expression);
  const point = await evaluate(`(() => {const e=(${expression}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;const candidates=[{x,y},...[0.25,0.5,1,2,4,8].flatMap(inset=>[{x:r.left+inset,y},{x:r.right-inset,y},{x,y:r.top+inset},{x,y:r.bottom-inset}])];for(const point of candidates){const hit=document.elementFromPoint(point.x,point.y);if(${exact ? 'hit===e' : 'e.contains(hit)'})return point;}throw Error('No ${exact ? 'exact frame' : 'visible'} hit: '+e.outerHTML+'; rect: '+JSON.stringify(r.toJSON())+'; hit: '+document.elementFromPoint(x,y)?.outerHTML.slice(0,250));})()`);
  await send('Input.dispatchMouseEvent', { type:'mousePressed', ...point, button:'left', clickCount:1 });
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', ...point, button:'left', clickCount:1 });
  if (destination?.startsWith('/')) {
    await wait(`location.pathname === ${JSON.stringify(destination)}`);
    await wait(`${q('.workspace-panel--' + (destination.startsWith('/develop') ? 'develop' : 'design'))} && !${q('.workspace-panel--' + (destination.startsWith('/develop') ? 'develop' : 'design'))}.hidden`);
  }
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
}
async function fill(selector, value) {
  await click(q(selector));
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']});
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'a',code:'KeyA',modifiers:4});
  if(value) await send('Input.insertText',{text:value}); else await key('Backspace');
  await wait(`${q(selector)}.value === ${JSON.stringify(value)}`);
}
async function check(label, run) {
  if (timedOut) throw new Error('Smoke watchdog expired');
  currentCheck = label;
  try { await run(); passes++; console.log(`PASS ${label}`); }
  catch (error) {
    failures.push(label); console.error(`FAIL ${label}: ${error.stack || error}`);
    if (!timedOut) {
      try {
        console.error('EVIDENCE', await evaluate(`JSON.stringify({route:location.pathname,width:innerWidth,height:innerHeight,selected:document.querySelector('.studio-sidebar a[aria-current="page"]')?.getAttribute('href'),leftHidden:document.querySelector('#workspace-sidebar')?.hidden,rightHidden:document.querySelector('#workspace-inspector')?.hidden})`));
        await capture(`studio-failure-${label.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,100)}`);
        // A failed gesture/modal must not contaminate later System coverage.
        if(pressedPointer) await send('Input.dispatchMouseEvent',{type:'mouseReleased',...pressedPointer,clickCount:1});
        for (const label of ['Close color builder','Close color pair results','Close export dialog']) {
          const target = q(`[aria-label="${label}"]`);
          if (await evaluate(`!!(${target}) && ${target}.getClientRects().length>0`)) await click(target);
        }
      } catch (cleanupError) { console.error(`Check recovery: ${cleanupError.message}`); }
    }
  }
}
const stored = () => evaluate(`JSON.parse(localStorage.getItem('bambiui.design-system.v1'))`);
async function capture(label) {
  if (!process.argv.includes('--screenshots')) return;
  await mkdir(captureDir,{recursive:true});
  const {data} = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(resolve(captureDir,`${label}.png`),Buffer.from(data,'base64'));
}
async function reload() {
  const origin = await evaluate('performance.timeOrigin');
  await send('Page.reload');
  await wait(`performance.timeOrigin !== ${origin} && ${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
}
async function cleanup() {
  socket?.close();
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('CDP cleanup')); }
  pending.clear();
  if(chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const done = new Promise(resolve => chrome.once('exit',resolve));chrome.kill('SIGTERM');
    await Promise.race([done,delay(2000)]);
    if(chrome.exitCode === null && chrome.signalCode === null) { chrome.kill('SIGKILL'); await Promise.race([done,delay(2000)]); }
  }
  // Chrome helpers can retain the stderr pipe after the browser process exits.
  chrome?.stderr?.destroy();
  if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(profile) await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200});
}
try {
  assert.equal(typeof WebSocket,'function','Node 22+ is required');
  await stat(resolve(root,'colors.html'));
  server = createServer(async (req,res) => {
    try {
      const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      let path = resolve(root, `.${name}`);
      if(path !== resolve(root) && !path.startsWith(resolve(root)+sep)) {res.writeHead(403).end();return;}
      if (!extname(path)) {
        try { await stat(`${path}.html`); path += '.html'; }
        catch { path = resolve(path, 'index.html'); }
      }
      const body = await readFile(path);
            res.writeHead(200,{'Content-Type':mime[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'}).end(body);
    } catch {res.writeHead(404).end('Not found');}
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  profile = await mkdtemp(resolve(tmpdir(),'bambiui-smoke-'));
  chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
    '--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-networking','about:blank',
  ],{stdio:['ignore','ignore','pipe']});
  let stderr='', spawnError;
  chrome.on('error',error => {spawnError=error;});
  chrome.stderr.on('data',chunk => {stderr=(stderr+chunk).slice(-4000);});
  let port;
  for(let i=0;i<120 && !port;i++) {
    if(spawnError)throw spawnError;
    if(chrome.exitCode !== null)throw new Error(`Chrome exited: ${stderr}`);
    try {port=Number((await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch {await delay(100);}
  }
  assert.ok(port,`Chrome debugging port unavailable: ${stderr}`);
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(5000)})).json();
  socket=new WebSocket(targets.find(target => target.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',({data})=>{
    const message=JSON.parse(data);
    if(message.id) {
      const task=pending.get(message.id);if(!task)return;
      pending.delete(message.id);clearTimeout(task.timer);
      if(message.error)task.reject(new Error(JSON.stringify(message.error)));else task.resolve(message.result);
    } else if(message.method==='Page.javascriptDialogOpening') {
      if(!acceptImportDialog) errors.push(`Unexpected browser dialog: ${message.params.message}`);
      send('Page.handleJavaScriptDialog',{accept:acceptImportDialog}).catch(error=>errors.push(String(error)));
    } else if(message.method==='Fetch.requestPaused') {
      send('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/css'}],body:''}).catch(error=>errors.push(String(error)));
    } else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if(message.method==='Runtime.consoleAPICalled' && message.params.type==='error')errors.push(message.params.args.map(arg=>arg.value ?? arg.description).join(' '));
    else if(message.method==='Log.entryAdded' && message.params.entry.level==='error')errors.push(message.params.entry.text);
  });
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/colors`});
  await wait(`${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);

  await check('header navigation and theme, full-bleed Design canvas and one visible preview',async()=>{
    assert.equal(await evaluate(`${q(viewNav)}.closest('header') === ${q('.studio-header')}`),true);
    assert.equal(await evaluate(`${q(themeControl)}.closest('.canvas-theme') !== null`),true);
    await assertWorkbenchToolbar('design');
    assert.ok(await evaluate(`(()=>{const bar=${q(workbenchToolbar)}.getBoundingClientRect(),view=${q(canvas)}.getBoundingClientRect();return bar.bottom<=view.top+1 && bar.width>0})()`),'common toolbar is above, not floating over, the foundation canvas');
    assert.equal(await evaluate(`${q('#workspace-sidebar')}.getBoundingClientRect().width`),200);
    assert.equal(await evaluate(`${q('#workspace-inspector')}.getBoundingClientRect().width`),320);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(viewNav + ' a')})].map(e=>e.textContent.trim())`),['Design','Develop']);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(themeControl + ' button')})].map(e=>e.getAttribute('aria-label'))`),['Light','Dark']);
    assert.ok(await evaluate(`[...document.querySelectorAll(${JSON.stringify(themeControl + ' button')})].every(e=>!e.textContent.trim() && !!e.querySelector('svg'))`));
    assert.equal(await evaluate(`!!${q('.studio-header nav[aria-label="Workspace"]')}`),false,'Project/System workspace switch is suspended');
    assert.equal(await evaluate(`document.querySelectorAll('.studio-shell').length`),1,'only one System shell is mounted');
    assert.equal(await evaluate(`!!${q('[aria-label="New project name"], [aria-label="Page canvas"], #project-inspector')}`),false,'Project authoring must not mount');
    assert.ok(await evaluate(`${q('.studio-header .system-switcher summary')}?.getClientRects().length > 0`),'active system belongs in the header');
    assert.equal(await evaluate(`!!${q('.studio-sidebar #design-system-name')}`),false);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.component-group')].map(e=>[e.getAttribute('aria-label'),...[...e.querySelectorAll('a')].map(a=>a.textContent.trim())])`),[['Actions','Button'],['Forms','Input','Checkbox','Switch'],['Content','Text','Card','Badge']]);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.sidebar-navigation > a')].map(a=>a.textContent.trim())`),['Colors','Typography','Shape & spacing'],'foundations are real pages in design order');
    assert.equal(await evaluate(`document.querySelectorAll('.component-group-label').length`),3,'components are grouped by job');
    assert.ok(await evaluate(`!!${q('.system-switcher-actions [aria-label="Import design system"]')} && !!${q('.header-actions input[type="file"]')}`),'replace import is in the system menu; the file input remains in header actions');
    assert.equal(await evaluate(`${q('.sidebar-foundations-label')}.textContent`),'FOUNDATIONS');
    await fill('.search-field input','badge');
    await wait(`document.querySelectorAll('.component-group a').length === 1`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.component-group a')].map(a=>a.textContent.trim())`),['Badge']);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4});
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await wait(`document.querySelectorAll('.component-group a').length === 7`);
    assert.ok(await evaluate(`!!${q('[data-workbench-toolbar] .canvas-history [aria-label="Undo change"] svg')} && !!${q('[data-workbench-toolbar] .canvas-history [aria-label="Redo change"] svg')}`));
    assert.equal(await evaluate(`!!${q('.breadcrumbs')} || !!${q('.viewport-controls')} || !!${q('[aria-label="Preview width"]')}`),false);
    assert.ok(await evaluate(`(()=>{const content=${q('#workspace-content')}.getBoundingClientRect(),area=${q('.workspace-panel--design')}.getBoundingClientRect(),viewport=${q(canvas)}.getBoundingClientRect();return Math.abs(area.left-content.left)<2 && Math.abs(area.right-content.right)<2 && Math.abs(area.top-content.top)<2 && Math.abs(area.bottom-content.bottom)<2 && viewport.width>=area.width-80 && viewport.height>=area.height-80})()`));
    assert.ok(await evaluate(`(()=>{const area=${q('.workspace-panel--design')}.getBoundingClientRect(),zoom=${q('[aria-label="Canvas zoom"]')}.getBoundingClientRect(),position=getComputedStyle(${q('[aria-label="Canvas zoom"]')}).position;return ['absolute','fixed','sticky'].includes(position) && zoom.width<area.width/2 && zoom.left>=area.left && zoom.right<=area.right+2 && zoom.top>area.top+area.height/2 && zoom.bottom<=area.bottom+2})()`));
    assert.ok(await evaluate(`!!${q(camera)} && getComputedStyle(${q(canvas)}).overflowX==='clip' && getComputedStyle(${q(canvas)}).overflowY==='clip' && ${q(canvas)}.scrollLeft===0 && ${q(canvas)}.scrollTop===0`),'desktop camera viewport must not be natively scrollable');
    assert.ok(Number.isFinite((await evaluate(cameraState)).scale),'canvas camera must have a finite transform');
    assert.equal(await evaluate('document.documentElement.lang'),'en');
    assert.equal(await evaluate(`document.querySelector('.language-control,.editor-theme-control,.theme-toolbar') === null`),true);
    assert.equal(await evaluate(`[...document.querySelectorAll('.theme-pane')].filter(e=>e.getClientRects().length && !e.closest('[hidden]')).length`),1);
    assert.equal(await evaluate(`document.querySelector('[aria-label="Design preview context"]')`),null);
    assert.equal(await evaluate(`document.querySelectorAll('[data-ds-theme="light"]').length`),1);
    assert.equal(await evaluate(`document.querySelectorAll('[data-ds-theme="dark"]').length`),0);
    assert.equal(await evaluate(`getComputedStyle(document.documentElement).colorScheme`),'light');
    assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--studio-color-accent').trim()`),'#3f3f46');
    assert.equal(await evaluate(`document.documentElement.style.getPropertyValue('--studio-color-border')`),'');
    assert.equal(await evaluate(`getComputedStyle(${q('.brand-mark')}).color`),'rgb(232, 103, 60)');
    assert.equal(await evaluate(`getComputedStyle(${q('.header-actions .studio-button[data-variant="primary"]')}).backgroundColor`),'rgb(63, 63, 70)');
    assert.equal(await evaluate(`getComputedStyle(${q('.header-actions .studio-button[data-variant="primary"]')}).color`),'rgb(255, 255, 255)');
    await click(q('[aria-label="Open color builder"]'));
    await wait(`!!${q('[data-palette-builder][open]')}`);
    assert.equal(await evaluate(`${q('input[id$="-source"]')}.value`),'#e8673c');
    assert.equal(await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-primary').trim()`),'#e8673c');
    assert.notEqual(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--studio-color-accent').trim()`),await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-primary').trim()`));
    assert.equal(await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-on-primary').trim()`),'#291b15');
    assert.equal(await evaluate(`${q('#workspace-content')}.dataset.design`),'true');
    assert.equal(await evaluate(`${q('#workspace-content')}.style.getPropertyValue('--preview-background').trim()`),'');
    await assertStudioSurfaces('light');
    assert.equal(await evaluate(`getComputedStyle(${q(canvas)}).backgroundColor`),'rgb(255, 248, 246)');

    assert.ok(await evaluate(`(()=>{const area=${q('.preview-frame')}.getBoundingClientRect(),specimen=${q('.theme-pane')}.getBoundingClientRect();return ['left','right','top','bottom'].every(edge=>Math.abs(specimen[edge]-area[edge])<2)})()`),'preview fills the work area without an inset border');
    assert.equal(await evaluate(`${q('.canvas-label')}`),null);
    for(const foundation of foundations) assert.ok(await evaluate(`${q(`[data-foundation="${foundation}"]`)}.getBoundingClientRect().width > 0 && ${q(`[data-foundation="${foundation}"]`)}.getBoundingClientRect().height > 0`),`visible ${foundation} foundation`);
    await route('design','colors');
    assert.equal(await evaluate(`document.querySelectorAll('[data-palette-builder] button').length`),5);
    await click(q('[aria-label="Close color builder"]'));
    await wait(`!${q('[data-palette-builder]')}`);
    await capture('studio-desktop-light');
  });
  await check('component typography consumes exported system constants',async()=>{
    const pane='[data-ds-theme="light"]';
    for(const [id,selector,property,constant] of [
      ['button',recipePart('button','primary.md','text'),'fontWeight','--ds-button-font-weight'],
      ['card',recipePart('card','outlined.md','title'),'fontWeight','--ds-card-title-font-weight'],
      ['badge',recipePart('badge','outline.neutral.md','text'),'lineHeight','--ds-badge-line-height'],
    ]) {
      await navigate('design',id);
      const computed=await evaluate(`getComputedStyle(${q(selector)})[${JSON.stringify(property)}]`);
      const value=await evaluate(`${q(pane)}.style.getPropertyValue(${JSON.stringify(constant)}).trim()`);
      if(property === 'lineHeight') {
        const fontSize=Number.parseFloat(await evaluate(`getComputedStyle(${q(selector)}).fontSize`));
        assert.ok(Math.abs(Number.parseFloat(computed)-fontSize*Number(value))<0.2,`${selector} uses ${constant}`);
      } else assert.equal(computed,value,`${selector} uses ${constant}`);
    }
  });
  await check('System separates the style inspector from Playground and collapses shared/base defaults',async()=>{
    await navigate('design','button');
    await stylesInspector();
    assert.equal(await evaluate(`!!${q('[data-system-recipe-controls]')}`),false,'no recipe is selected by insertion defaults');
    assert.ok(await evaluate(`${q('#token-editor')}.textContent.includes('Select a component layer')`));
    for(const selector of ['[data-system-shared-defaults]','[data-system-base-tokens]']) assert.equal(await evaluate(`${q(selector)}.open`),false);
    assert.equal(await evaluate(`${q('#token-paddingX')}.checkVisibility()`),false,'base token controls start collapsed');
    assert.equal(await evaluate(`${q('#token-paddingX')}.closest('[data-system-base-tokens]')!==null`),true);
    await click(q('[data-system-base-tokens] > summary'));
    assert.equal(await evaluate(`${q('[data-system-base-tokens]')}.open && ${q('#token-paddingX')}.checkVisibility()`),true);
    await click(q('[data-system-base-tokens] > summary'));
    await assertComponentMode('button','variants');
    assert.equal(await evaluate(`${q(`${playgroundControls('button')} [aria-label="Playground Text"]`)}.value`),'Continue');
    assert.equal(await evaluate(`!!${q('#token-editor [aria-label^="Playground "]')}`),false,'args stay outside the style inspector');
    assert.ok(await evaluate(`!!${q(`${playgroundControls('button')} [aria-label="Playground Variant"]`)} && !!${q(`${playgroundControls('button')} [aria-label="Playground Size"]`)}`),'portalled Playground props expose independent public axes');
    await stylesInspector();
    assert.equal(await evaluate(`${q('[data-system-base-tokens]')}.open`),false);
    assert.equal(await evaluate(`!!${q('[aria-label="System component part"]')}`),false);
    await select('[aria-label="Shared default layer"]','root');
    assert.equal(await evaluate(`${q('[id="system-shared-button-root-paddingLeft"]')}.closest('[data-system-shared-defaults]')!==null`),true);
    await click(q('[data-system-shared-defaults] > summary'));
  });
  await check('semantic roles show current values and focus their own token without changing the saved system',async()=>{
    await navigate('design','colors');
    const before=await stored();
    const roles=await evaluate(`[...document.querySelectorAll('[data-semantic-role]')].map(e=>({key:e.dataset.semanticRole,value:e.querySelector('code').textContent}))`);
    assert.ok(roles.length>10);
    for(const role of roles) assert.equal(role.value,await evaluate(`${q('#token-' + role.key)}.value`));
    await evaluate(`${q('[data-semantic-role="primary"]')}.click()`);
    await wait(`document.activeElement?.id==='token-primary'`);
    assert.ok(await evaluate(`${q('#token-editor')}.textContent.includes('Semantic roles') && ${q('#token-editor')}.textContent.includes('Palette scales')`));
    assert.deepEqual(await stored(),before);
  });
  await check('Typography is a foundation page: canvas scale selects styles and Text links to it without saving',async()=>{
    const before=await stored();
    await click(named('.sidebar-navigation a','Typography'));
    await route('design','typography');
    assert.equal(await evaluate(`${q('.studio-sidebar a[href="/typography"]')}.getAttribute('aria-current')`),'page');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-type-scale] [data-typography-style]')].map(e=>e.dataset.typographyStyle)`),['h1','h2','h3','h4','h5','h6','heading','paragraph','label','caption']);
    assert.ok(await evaluate(`${q('#font-family-preset')}.checkVisibility() && ${q('#typography-tokens')}.textContent.includes('across sizes and tones') && !!${q('#token-fontSize')}`));
    await click(q('[data-type-scale] [data-typography-style="h3"]'));
    await wait(`${q('#typography-variant')}.value==='h3' && document.activeElement?.id==='typography-variant'`);
    assert.equal(await evaluate(`getComputedStyle(${q('[data-typography-style="h3"] span[aria-hidden]')}).fontSize`),`${await evaluate(`${q('#typography-h3-fontSize')}.value`)}px`,'canvas samples consume the edited style');
    await click(q('[data-typography-font]'));
    await wait(`document.activeElement?.id==='font-family-preset'`);
    await capture('studio-typography');
    assert.deepEqual(await stored(),before,'selecting styles and opening controls never writes');
    const base=await evaluate(`${q('#token-fontSize')}.value`);
    await fill('#token-fontSize','15');
    await wait(`${q('[data-typography-base] strong')}.textContent==='15px'`);
    for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].global.fontSize,15,'base size is shared');
    await click(named('button','Undo change'));
    for(const mode of ['light','dark']) assert.equal(String((await stored()).themes[mode].global.fontSize),base,'one undo restores the base size');
    await navigate('design','text');
    assert.equal(await evaluate(`!!${q('#font-family-preset')} || !!${q('#typography-variant')}`),false,'shared typography is edited once, in Typography');
    await click(named('[data-typography-link] a','Open Typography'));
    await route('design','typography');
  });

  for(const [id,count] of Object.entries(matrixCounts)) await check(`${id} matrix renders all ${count} exact combinations and no other component board`,async()=>{
    await navigate('design',id);
    const expected = matrixVariants[id].flatMap(variant=>(['badge','text'].includes(id) ? tones : [null]).flatMap(tone=>['sm','md','lg'].map(size=>[variant,tone,size].filter(Boolean).join('.'))));
    assert.equal(expected.length,count);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('${matrix(id)} [data-recipe-example]')].map(e=>e.dataset.recipeExample)`),expected);
    assert.equal(await evaluate(`document.querySelectorAll('${matrix(id)} [data-recipe-example] > button[aria-label^="Select "]').length`),count);
    assert.equal(await evaluate(`document.querySelectorAll('${matrix(id)} [data-recipe-body][aria-hidden="true"]').length`),count);
    await wait(`[...document.querySelectorAll('${matrix(id)} [data-recipe-body] :is(a,button,input,select,textarea,[tabindex])')].every(e=>e.tabIndex===-1)`);
    assert.ok(await evaluate(`[...document.querySelectorAll('${matrix(id)} [data-recipe-example]')].every(e=>{const root=e.querySelector('[data-ds-component="${id}"][data-component-part="root"]');return root && root.dataset.size===e.dataset.recipeExample.split('.').at(-1)})`),'each example uses its own public size');
    if(id!=='text') assert.equal(await evaluate(`${q(interactions(id))}.open`),false,'behavior examples start collapsed on a newly mounted component');
    assert.equal(await evaluate(`!!${q('[data-foundation="text"]')} || !!${q('[data-system-starter]')}`),false);
  });
  await check('Card exact frame/text hits expose only their own controls; nested Text and Button stay in Card scope',async()=>{
    await navigate('design','card');
    await click(q(recipePart('card','outlined.md','root')),true,true);
    await assertRecipeSelection('card','outlined.md','root','frame');
    await click(q(recipePart('card','outlined.md','title')));
    await assertRecipeSelection('card','outlined.md','title','text');
    assert.equal(await evaluate(`${q(recipePart('card','outlined.md','title'))}.dataset.systemSelectedPart`),'text');
    for(const [part,child] of [['content','[data-ds-component="text"][data-component-target="text"]'],['footer','[data-ds-component="button"][data-component-part="text"]']]) {
      await click(q(`${recipePart('card','outlined.md',part)} ${child}`));
      await assertRecipeSelection('card','outlined.md',part,'text');
      assert.equal(await evaluate(`${q(`${recipePart('card','outlined.md',part)} ${child}`)}.dataset.systemSelectedPart`),'text');
    }
    await capture('studio-matrix-card-footer');
    await setComponentMode('card','playground');
    await click(q(`${playgroundControls('card')} [aria-label="Playground Title"]`));
    await setComponentMode('card','variants');
    await click(q(recipePart('card','outlined.md','title')));
    await assertRecipeSelection('card','outlined.md','title','text');
  });
  await check('System values reflect the selected layer and theme across native scrolling without authoring overrides',async()=>{
    const bytes = () => evaluate(`localStorage.getItem('bambiui.design-system.v1')`);
    const before = await bytes();
    const historyState = () => evaluate(`[...document.querySelectorAll('.canvas-history button')].map(e=>({label:e.getAttribute('aria-label'),disabled:e.disabled}))`);
    const history = await historyState();
    await navigate('design','card');
    await click(q(recipePart('card','outlined.md','title')));
    await assertMeasuredRecipe('card','outlined.md','title','text',textFields);
    const input = recipeField('card','outlined.md','title','text','fontSize');
    const current = await evaluate(`${q(input)}.value`);
    await click(q(input)); await key('Enter'); await key('Tab');
    for(const value of [current,Number(current).toFixed(3),'']) { await fill(input,value); await key('Enter'); await key('Tab'); }
    await assertMeasuredRecipe('card','outlined.md','title','text',textFields);
    for(const label of ['Dark','Light']) {
      await click(named(themeControl+' button',label));
      await assertMeasuredRecipe('card','outlined.md','title','text',textFields);
    }
    for(const [part,child] of [['content','[data-ds-component="text"][data-component-target="text"]'],['footer','[data-ds-component="button"][data-component-part="text"]']]) {
      const childSelector = `${recipePart('card','outlined.md',part)} ${child}`;
      await click(q(childSelector));
      await assertMeasuredRecipe('card','outlined.md',part,'text',textFields,childSelector);
    }
    await click(q(`${example('card','outlined.md')} > button`));
    const geometry = ['width','height','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius','background','borderColor','borderWidth','shadow','gap'];
    await assertMeasuredRecipe('card','outlined.md','root','frame',geometry);
    const scrollBefore = await evaluate(`${q(matrixScroll)}.scrollTop`);
    await evaluate(`${q(matrixScroll)}.scrollTop=${scrollBefore}>80?${scrollBefore}-80:${scrollBefore}+80`);
    await wait(`${q(matrixScroll)}.scrollTop!==${scrollBefore}`);
    await assertMeasuredRecipe('card','outlined.md','root','frame',geometry);
    assert.equal(await evaluate(`getComputedStyle(${q('[data-matrix-content]')}).transform`),'none');
    await select('[aria-label="Shared default layer"]','root');
    await wait(`${q('[id="system-shared-card-root-paddingLeft"]')}.value==='Mixed'`);
    await fill('[id="system-shared-card-root-paddingLeft"]','Mixed'); await key('Enter'); await key('Tab');
    assert.doesNotMatch(await evaluate(`[...document.querySelectorAll('[data-system-recipe-controls],[data-system-shared-defaults],.variant-token-input')].map(e=>e.textContent).join(' ')`),/\bInherited\b/);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#token-editor input')].filter(e=>/Inherited/.test(e.placeholder)).map(e=>e.id)`),[]);
    await click(q('[data-system-shared-defaults] > summary'));
    await navigate('design','input');
    await click(q(`${example('input','invalid.md')} > button`));
    for(const [part,target] of [['error','text'],['control','text'],['control','frame']]) {
      await click(q(`[data-system-recipe-controls] [aria-label="Select ${part==='error'?'Error':'Control'} ${target}"]`));
      await assertMeasuredRecipe('input','invalid.md',part,target,target==='text'?textFields:['paddingTop','paddingRight','paddingBottom','paddingLeft','background','borderColor','shadow']);
    }
    await navigate('design','card'); await click(q(recipePart('card','outlined.md','title')));
    assert.equal(await bytes(),before,'reading, focusing, retyping and changing theme/selection never writes System tokens');
    assert.deepEqual(await historyState(),history,'no-op edits do not create history');
    await capture('studio-effective-card-title');
  });
  await check('scope and value sources are keyboard-readable, collapsed by default and never write tokens',async()=>{
    const bytes = await evaluate(`localStorage.getItem('bambiui.design-system.v1')`);
    const history = await evaluate(`[...document.querySelectorAll('.canvas-history button')].map(e=>e.disabled)`);
    const details = '[data-system-scope-details="recipe"]';
    const row = key => `${details} [data-style-source-field="${key}"]`;
    await navigate('design','card'); await click(q(recipePart('card','outlined.md','title')));
    assert.equal(await evaluate(`${q(details)}.open`),false);
    assert.deepEqual(await evaluate(`[...${q('[data-system-recipe-controls] [data-system-edit-scope="recipe"]')}.querySelectorAll('div')].map(e=>[e.querySelector('dt').textContent,e.querySelector('dd').textContent])`),[['Non-colors','Same size · both themes'],['Colors','This combination · Light']]);
    const themeName=await evaluate(`document.documentElement.dataset.studioTheme==='dark'?'Dark':'Light'`);
    for(const [group,hint] of [['typography','Medium · 3 combinations · both themes'],['surface',`This combination · ${themeName}`]]) {
      assert.ok(await evaluate(`(()=>{const e=${q(`[data-system-recipe-controls] [data-system-group-scope="${group}"]`)};return e.checkVisibility() && e.textContent.includes(${JSON.stringify(hint)})})()`),'group scope is visible without opening source details');
    }
    assert.ok(await evaluate(`(()=>{const controls=${q('[data-system-recipe-controls]')},sources=${q(details)},groups=[...controls.querySelectorAll('[data-system-style-group]')];return groups.length>0 && groups.every(e=>!!(e.compareDocumentPosition(sources)&Node.DOCUMENT_POSITION_FOLLOWING)) && [...controls.querySelectorAll('[data-appearance-field] input,[data-appearance-field] select')].every(e=>{const hint=document.getElementById(e.id+'-scope'),style=hint&&getComputedStyle(hint),r=hint?.getBoundingClientRect();return hint && (e.getAttribute('aria-describedby')||'').split(' ').includes(hint.id) && style.display!=='none' && style.visibility!=='hidden' && style.position==='absolute' && r.width<=1 && r.height<=1})})()`),'source details follow the fields; per-field scopes remain sr-only accessible descriptions');
    await click(q(`${details} > summary`));
    assert.equal(await evaluate(`${q(details)}.open`),true);
    assert.ok(await evaluate(`/Reset[^.]*\\b(size|group)\\b/i.test(${q(details)}.textContent) && ${q(details)}.textContent.includes('Sample content and other layers stay unchanged')`),'scope details explain grouped reset and preservation of sample content and other layers');
    assert.equal(await evaluate(`${q(row('fontSize'))}.dataset.styleSource`),'fallback');
    assert.ok(await evaluate(`${q(row('fontSize'))}.textContent.includes('--card-recipe-outlined-md-title-font-size') && ${q(row('fontSize'))}.textContent.includes('Reset → Component / parent CSS')`));
    assert.equal(await evaluate(`${q(details)}.querySelectorAll('input,select,button,textarea').length`),0,'details cannot change a value');
    await assertMeasuredRecipe('card','outlined.md','title','text',textFields);
    await evaluate(`${q(`${details} > summary`)}.focus({preventScroll:true})`); await key('Enter');
    assert.equal(await evaluate(`${q(details)}.open`),false,'native summary supports keyboard toggling');
    await click(q(recipePart('card','outlined.sm','title')));
    await assertRecipeSelection('card','outlined.sm','title','text');
    assert.equal(await evaluate(`${q(details)}.open`),false);
    await navigate('design','input'); await click(q(`${example('input','invalid.md')} > button`));
    await click(q('[data-system-recipe-controls] [aria-label="Select Error text"]'));
    await click(q(`${details} > summary`));
    assert.equal(await evaluate(`${q(row('color'))}.dataset.styleSource`),'fallback');
    assert.ok(await evaluate(`${q(row('color'))}.textContent.includes('Light') && ${q(row('fontSize'))}.textContent.includes('Both themes')`));
    await assertMeasuredRecipe('input','invalid.md','error','text',textFields);
    await navigate('design','button'); await click(q(`${example('button','secondary.md')} > button`));
    await click(q(`${details} > summary`));
    assert.ok(await evaluate(`${q(row('background'))}.textContent.includes('--button-recipe-secondary-md-root-background')`));
    await click(q('[data-system-base-tokens] > summary'));
    await click(q('[data-system-scope-details="base"] > summary'));
    assert.ok(await evaluate(`${q('[data-system-scope-details="base"]')}.textContent.includes('across all sizes') && ${q('[data-system-scope-details="base"]')}.textContent.includes('does not clear shared layer styles')`));
    assert.ok(await evaluate(`${q('[data-playground-controls-for]')}.textContent.includes('Not saved to your system.')`));
    await stylesInspector();
    await navigate('design','card'); await click(q(recipePart('card','outlined.md','title')));
    assert.equal(await evaluate(`localStorage.getItem('bambiui.design-system.v1')`),bytes);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.canvas-history button')].map(e=>e.disabled)`),history);
    await capture('studio-scope-card-title');
  });
  await check('selected Button live preview uses native hover/press/focus/loading/disabled without changing edit scope',async()=>{
    const bytes = await evaluate(`localStorage.getItem('bambiui.design-system.v1')`);
    const history = await evaluate(`[...document.querySelectorAll('.canvas-history button')].map(e=>e.disabled)`);
    await navigate('design','button'); await click(q(`${example('button','primary.md')} > button`));
    const preview = `${example('button','primary.md')} [data-interaction-preview="button"]`;
    const live = `${preview} [data-live-preview-recipe] [data-component-part="root"]`;
    const condition = `${preview} [aria-label="Preview condition"]`;
    assert.equal(await evaluate(`${q(preview)}.open`),false);
    assert.equal(await evaluate(`!!${q(live)}`),false,'closed sandbox mounts no hidden native control');
    await click(q(`${preview} > summary`)); await wait(q(live));
    assert.deepEqual(await evaluate(`[...${q(condition)}.options].map(e=>e.value)`),['normal','disabled','loading']);
    const baseline = await evaluate(`(()=>{const a=getComputedStyle(${q(live)}),b=getComputedStyle(${q(recipePart('button','primary.md','root'))});return ['fontFamily','fontSize','fontWeight','lineHeight'].map(key=>[key,a[key],b[key]])})()`);
    for(const [key,liveValue,matrixValue] of baseline) assert.equal(liveValue,matrixValue,`${key}: preview consumes real system typography, not editor chrome`);
    await positionCanvas(q(live));
    const point = await evaluate(`(()=>{const r=${q(live)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const paint = suffix => evaluate(`(()=>{const value=getComputedStyle(${q(live)}).getPropertyValue('--button-variant-primary-${suffix}-background').trim();return /^#[0-9a-f]{6}$/i.test(value) ? 'rgb('+value.slice(1).match(/../g).map(n=>parseInt(n,16)).join(', ')+')' : value})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point,buttons:0});
    await wait(`getComputedStyle(${q(live)}).backgroundColor===${JSON.stringify(await paint('hover'))}`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await wait(`getComputedStyle(${q(live)}).backgroundColor===${JSON.stringify(await paint('active'))}`);
    assert.equal(await evaluate(`${q(preview+' output')}.textContent`),'Ready · 0 activations','holding the real button does not activate until release');
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    await wait(`${q(live)}.getAttribute('aria-busy')==='true'`);
    assert.equal(await evaluate(`document.activeElement===${q(live)}`),true,'activation retains focus while loading');
    await click(q(live)); assert.equal(await evaluate(`${q(preview+' output')}.textContent`),'Loading · 1 activation');
    await select(condition,'disabled');
    assert.equal(await evaluate(`${q(live)}.disabled`),true);
    assert.ok(Number(await evaluate(`getComputedStyle(${q(live)}).opacity`))<1);
    await assertMeasuredRecipe('button','primary.md','root','frame',['opacity','paddingLeft','borderWidth','background']);
    await select(condition,'normal');
    const focus = named(preview+' button','Focus control');
    await evaluate(`${focus}.focus({preventScroll:true})`); await key('Tab');
    assert.equal(await evaluate(`document.activeElement===${q(live)} && ${q(live)}.matches(':focus-visible')`),true);
    assert.equal(await evaluate(`getComputedStyle(${q(live)}).outlineStyle`),'solid');
    assert.ok(parseFloat(await evaluate(`getComputedStyle(${q(live)}).outlineWidth`))>0,'real global focus outline stays separate from decorative border');
    await click(named(preview+' button','Reset preview'));
    assert.equal(await evaluate(`${q(preview+' output')}.textContent`),'Ready · 0 activations');
    await assertRecipeSelection('button','primary.md','root','frame');
    assert.equal(await evaluate(`${q(preview)}.dataset.editRecipe`),'primary.md');
    await capture('studio-live-button');
    await click(q(`${preview} > summary`)); await wait(`!${q(live)}`);
    assert.equal(await evaluate(`document.querySelectorAll('${matrix('button')} [data-recipe-example]').length`),18);
    assert.equal(await evaluate(`localStorage.getItem('bambiui.design-system.v1')`),bytes);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.canvas-history button')].map(e=>e.disabled)`),history);
  });
  await check('selected field live previews keep native values/states ephemeral and inspector measurements on the matrix',async()=>{
    const bytes = await evaluate(`localStorage.getItem('bambiui.design-system.v1')`);
    await navigate('design','input'); await click(q(`${example('input','invalid.md')} > button`));
    const preview = `${example('input','invalid.md')} [data-interaction-preview="input"]`;
    const live = `${preview} input`;
    const condition = `${preview} [aria-label="Preview condition"]`;
    await click(q(`${preview} > summary`)); await wait(q(live));
    await fill(live,'sandbox@example.com');
    await select(condition,'readonly');
    assert.equal(await evaluate(`${q(live)}.readOnly`),true);
    await wait(`${q(preview+' [data-live-preview-recipe]')}.dataset.livePreviewRecipe==='readonly.md'`);
    await assertRecipeSelection('input','invalid.md','root','frame');
    assert.equal(await evaluate(`${q(`${example('input','invalid.md')} [data-recipe-body] input`)}.readOnly`),false);
    await click(q('[data-system-recipe-controls] [aria-label="Select Control text"]'));
    await assertMeasuredRecipe('input','invalid.md','control','text',textFields);
    assert.equal(await evaluate(`${q(preview)}.open`),true,'changing layer in the same recipe preserves the live session');
    for(const mode of ['Dark','Light']) {
      await click(named(themeControl+' button',mode));
      assert.equal(await evaluate(`${q(live)}.value`),'sandbox@example.com');
      assert.equal(await evaluate(`${q(condition)}.value`),'readonly');
    }
    await click(named(preview+' button','Reset preview'));
    assert.equal(await evaluate(`${q(live)}.value`),'');
    await click(q(`${preview} > summary`));
    for(const component of ['switch','checkbox']) {
      await navigate('design',component); await click(q(`${example(component,'invalidUnchecked.md')} > button`));
      const box = `${example(component,'invalidUnchecked.md')} [data-interaction-preview="${component}"]`;
      const role = `${box} [role="${component}"]`;
      const choice = `${box} [aria-label="Preview condition"]`;
      await click(q(box+' > summary')); await wait(q(role));
      await click(q(role)); await wait(`${q(role)}.getAttribute('aria-checked')==='true'`);
      await wait(`${q(box+' [data-live-preview-recipe]')}.dataset.livePreviewRecipe==='invalidChecked.md'`);
      await assertRecipeSelection(component,'invalidUnchecked.md','root','frame');
      await select(choice,'readonly'); await click(q(role));
      assert.equal(await evaluate(`${q(role)}.getAttribute('aria-checked')`),'true');
      await select(choice,'disabled');
      assert.equal(await evaluate(`${q(role)}.hasAttribute('data-disabled')`),true);
      await select(choice,'normal');
      if(component==='checkbox') { await select(choice,'indeterminate'); assert.equal(await evaluate(`${q(role)}.getAttribute('aria-checked')`),'mixed'); }
      await click(named(box+' button','Reset preview'));
      assert.equal(await evaluate(`${q(role)}.getAttribute('aria-checked')`),'false');
      await click(q(box+' > summary'));
    }
    assert.equal(await evaluate(`localStorage.getItem('bambiui.design-system.v1')`),bytes,'native typing/toggles/preview conditions do not persist tokens or insertion defaults');
    await navigate('design','card'); await click(q(recipePart('card','outlined.md','title')));
  });
  await check('Card outlined.md title typography shares all md variants only, with undo/reset/export',async()=>{
    await navigate('design','card'); await click(q(recipePart('card','outlined.md','title')));
    // A pristine workspace intentionally has no persisted system until its first edit.
    await click(q('[aria-label="Export tokens"]'));
    await click(named('[aria-label="Export format"] button','JSON'));
    const before = JSON.parse(await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`));
    await click(named('[aria-label="Export format"] button','CSS'));
    await click(q('[aria-label="Close export dialog"]'));
    const snapshot = () => evaluate(`[...document.querySelectorAll('${matrix('card')} [data-recipe-body] [data-component-part]')].map(e=>{const s=getComputedStyle(e);return {recipe:e.closest('[data-recipe-example]').dataset.recipeExample,component:e.dataset.dsComponent,part:e.dataset.componentPart,fontSize:s.fontSize,fontWeight:s.fontWeight}})`);
    const original = await snapshot();
    assert.equal(await evaluate(`getComputedStyle(${q('[data-specimen="card"]')}).borderTopWidth`),'0px');
    assert.equal(await evaluate(`getComputedStyle(${q('[data-specimen="card"]')}).backgroundColor`),'rgba(0, 0, 0, 0)','matrix board does not paint another component surface');
    assert.equal(await evaluate(`getComputedStyle(${q(recipePart('card','outlined.md','root'))}).borderTopWidth`),'1px');
    await commitRecipe('card','outlined.md','title','text','fontSize',31);
    await commitRecipe('card','outlined.md','title','text','fontWeight',650);
    await wait(`${q('[data-system-scope-details="recipe"] [data-style-source-field="fontSize"]')}.dataset.styleSource==='recipe'`);
    assert.ok(await evaluate(`${q('[data-system-recipe-controls] [data-system-edit-scope="recipe"]')}.textContent.includes('Same size · both themes') && ${q('[data-system-recipe-controls] [data-system-edit-scope="recipe"]')}.textContent.includes('This combination')`));
    const expected = original.map(entry=>entry.recipe.endsWith('.md') && entry.component==='card' && entry.part==='title' ? {...entry,fontSize:'31px',fontWeight:'650'} : entry);
    assert.deepEqual(await snapshot(),expected,'all three md titles share typography; the other six recipes, Card slots and nested components retain typography');
    await capture('studio-matrix-card-title');
    const expectedStored = structuredClone(before);
        for(const mode of ['light','dark']) for(const variant of matrixVariants.card) {
          const card = ((expectedStored.themes[mode].componentRecipes ??= {}).card ??= {});
          ((card[`${variant}.md`] ??= {}).title ??= {}).fontSize = 31;
          card[`${variant}.md`].title.fontWeight = 650;
        }
        assert.deepEqual(await stored(),expectedStored,'only the three md title records change in both themes');
    const customized = await stored();
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await snapshot(),original.map(entry=>entry.recipe.endsWith('.md') && entry.component==='card' && entry.part==='title' ? {...entry,fontSize:'31px'} : entry),'one undo restores font weight across the entire md group');
    await click(q('[aria-label="Redo change"]'));
    assert.deepEqual(await stored(),customized);
    await click(q('[aria-label="Export tokens"]'));
    const css = await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`);
    assert.ok(css.includes('--card-recipe-outlined-md-title-font-size: 31px;') && css.includes('--card-recipe-outlined-md-title-font-weight: 650;'));
    await click(named('[aria-label="Export format"] button','JSON'));
    assert.deepEqual(JSON.parse(await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`)),customized);
    await click(named('[aria-label="Export format"] button','CSS'));
    await click(q('[aria-label="Close export dialog"]'));
    await navigate('develop','card');
    assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes('--card-recipe-outlined-md-title-font-size') && ${q('.workspace-panel--develop')}.textContent.includes('outlined.md')`));
    await navigate('design','card');
    await assertRecipeSelection('card','outlined.md','title','text');
    await click(named('[data-system-recipe-controls] button','Reset text styles'));
    const reset = structuredClone(before);
    for(const mode of ['light','dark']) reset.themes[mode].componentRecipes ??= {};
    assert.deepEqual(await stored(),reset,'reset prunes the authored entries without materializing inherited values');
    assert.deepEqual(await snapshot(),original);
    await wait(`${q('[data-system-scope-details="recipe"] [data-style-source-field="fontSize"]')}.dataset.styleSource==='fallback'`);
    await assertMeasuredRecipe('card','outlined.md','title','text',textFields);
    const beforeInspection = await stored();
    await click(q(recipeField('card','outlined.md','title','text','fontSize'))); await key('Enter'); await key('Tab');
    assert.deepEqual(await stored(),beforeInspection);
    assert.equal(await evaluate(`${q('[aria-label="Undo change"]')}.disabled`),false);
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),customized,'untouched inspection after reset did not add another undo entry');
    await click(q('[aria-label="Redo change"]'));
    assert.deepEqual(await stored(),reset);
    await assertMeasuredRecipe('card','outlined.md','title','text',textFields);
  });
  await check('Button outline.sm frame and text edits fan out to six sm variants in one history step per field',async()=>{
    await navigate('design','button');
    await click(named(themeControl + ' button','Light'));
    await click(q(`${example('button','outline.sm')} > button`));
    await assertRecipeSelection('button','outline.sm','root','frame');
    const before = await stored();
    const properties = ['paddingLeft','boxShadow','fontSize'];
    const original = await recipePaint('button',properties);
    const peers = matrixVariants.button.map(variant=>`${variant}.sm`);
    let expected = before;
    let painted = original;
    const assertPaint = async () => assert.deepEqual(await recipePaint('button',properties),painted,'all six sm variants paint the edited part; md/lg and other parts retain their styles');
    for(const [part,target,field,value,property] of [
      ['root','frame','paddingLeft',27.375,'paddingLeft'],
      ['root','frame','shadow','lg','boxShadow'],
      ['text','text','fontSize',23.625,'fontSize'],
    ]) {
      await click(q(`[data-system-recipe-controls] [aria-label="Select ${part==='root' ? 'Button frame' : 'Label text'}"]`));
      await assertRecipeSelection('button','outline.sm',part,target);
      const previous = expected, previousPaint = painted;
      if(field==='shadow') await select(recipeField('button','outline.sm',part,target,field),value);
      else await commitRecipe('button','outline.sm',part,target,field,value);
      expected = expectedRecipePatch(expected,'button',peers,part,{[field]:value});
      await wait(`JSON.parse(localStorage.getItem('bambiui.design-system.v1')).themes.light.componentRecipes.button['primary.sm']?.[${JSON.stringify(part)}]?.[${JSON.stringify(field)}]===${JSON.stringify(value)}`);
      assert.deepEqual(await stored(),expected,'only same-size same-part records change, shared across themes');
      const renderedValue = field==='shadow' ? await evaluate(`(()=>{const host=${q(recipePart('button','outline.sm','root'))},probe=document.createElement('span');probe.style.boxShadow='var(--ds-shadow-lg)';host.append(probe);const value=getComputedStyle(probe).boxShadow;probe.remove();return value})()`) : `${value}px`;
      if(field==='shadow') assert.notEqual(renderedValue,'none');
      painted = painted.map(entry=>peers.includes(entry.recipe) && entry.component==='button' && entry.part===part ? {...entry,values:{...entry.values,[property]:renderedValue}} : entry);
      await assertPaint();
      await click(q('[aria-label="Undo change"]'));
      assert.deepEqual(await stored(),previous,'one undo restores the whole group, not just the selected recipe');
      assert.deepEqual(await recipePaint('button',properties),previousPaint);
      await click(q('[aria-label="Redo change"]'));
      assert.deepEqual(await stored(),expected,'one redo reapplies the whole group');
      await assertPaint();
    }
    await click(q('[data-system-recipe-controls] [aria-label="Select Button frame"]'));
    for(const [field,property,value,rgb] of [
      ['background','backgroundColor','#123456','rgb(18, 52, 86)'],
      ['borderColor','borderTopColor','#345678','rgb(52, 86, 120)'],
    ]) {
      const originalColors = await recipePaint('button',[property]);
      await commitRecipe('button','outline.sm','root','frame',field,value);
      const colored = expectedRecipePatch(expected,'button',['outline.sm'],'root',{[field]:value},['light']);
      assert.deepEqual(await stored(),colored,'frame color edits remain exact-recipe and Light-only');
      const coloredPaint = originalColors.map(entry=>entry.recipe==='outline.sm' && entry.component==='button' && entry.part==='root' ? {...entry,values:{...entry.values,[property]:rgb}} : entry);
      await assertSettledRecipePaint('button',[property],coloredPaint,'only the selected frame paints the color');
      await click(q('[aria-label="Undo change"]')); assert.deepEqual(await stored(),expected);
      await assertSettledRecipePaint('button',[property],originalColors,'undo restores every frame color');
      await click(q('[aria-label="Redo change"]')); assert.deepEqual(await stored(),colored);
      await assertSettledRecipePaint('button',[property],coloredPaint,'redo repaints only the selected frame');
      await click(q('[aria-label="Undo change"]')); assert.deepEqual(await stored(),expected);
      await assertSettledRecipePaint('button',[property],originalColors,'cleanup undo restores every frame color');
    }
    await click(q('[data-system-recipe-controls] [aria-label="Select Label text"]'));
    await resetRecipeField('button','outline.sm','text','text','fontSize');
    const resetFont = structuredClone(expected);
    for(const mode of ['light','dark']) for(const recipe of peers) {
      const record = resetFont.themes[mode].componentRecipes.button[recipe];
      delete record.text.fontSize;
      if(!Object.keys(record.text).length) delete record.text;
    }
    assert.deepEqual(await stored(),resetFont,'field reset removes typography for all six sm variants and preserves frame styles');
    assert.deepEqual(await recipePaint('button',properties),painted.map((entry,index)=>({...entry,values:{...entry.values,fontSize:original[index].values.fontSize}})));
    await click(q('[aria-label="Undo change"]')); assert.deepEqual(await stored(),expected);
    await click(q('[aria-label="Redo change"]')); assert.deepEqual(await stored(),resetFont);
    // Reset and all three edits each occupy exactly one history entry.
    for(let i=0;i<4;i++) await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
    assert.deepEqual(await recipePaint('button',properties),original);
  });
  await check('Text paragraph.neutral.sm typography groups six tones only; color and reset remain exact and theme-specific',async()=>{
    await navigate('design','text');
    await click(named(themeControl + ' button','Light'));
    await click(q(recipePart('text','paragraph.neutral.sm','root')));
    await assertRecipeSelection('text','paragraph.neutral.sm','root','text');
    const before = await stored();
    const properties = ['fontSize','fontWeight','color'];
    const original = await recipePaint('text',properties);
    const peers = tones.map(tone=>`paragraph.${tone}.sm`);
    const fontSize = expectedRecipePatch(before,'text',peers,'root',{fontSize:25.375});
    await commitRecipe('text','paragraph.neutral.sm','root','text','fontSize',25.375);
    assert.deepEqual(await stored(),fontSize);
    let painted = original.map(entry=>peers.includes(entry.recipe) && entry.component==='text' && entry.part==='root' ? {...entry,values:{...entry.values,fontSize:'25.375px'}} : entry);
    assert.deepEqual(await recipePaint('text',properties),painted,'all six paragraph sm tones change; h1, caption, other variants and md/lg do not');
    await click(q('[aria-label="Undo change"]')); assert.deepEqual(await stored(),before);
    assert.deepEqual(await recipePaint('text',properties),original);
    await click(q('[aria-label="Redo change"]')); assert.deepEqual(await stored(),fontSize);
    await commitRecipe('text','paragraph.neutral.sm','root','text','fontWeight',675);
    const typography = expectedRecipePatch(fontSize,'text',peers,'root',{fontWeight:675});
    assert.deepEqual(await stored(),typography);
    painted = painted.map(entry=>peers.includes(entry.recipe) && entry.component==='text' && entry.part==='root' ? {...entry,values:{...entry.values,fontWeight:'675'}} : entry);
    assert.deepEqual(await recipePaint('text',properties),painted);
    await click(q('[aria-label="Undo change"]')); assert.deepEqual(await stored(),fontSize);
    await click(q('[aria-label="Redo change"]')); assert.deepEqual(await stored(),typography);
    await commitRecipe('text','paragraph.neutral.sm','root','text','color','#123456');
    const colored = expectedRecipePatch(typography,'text',['paragraph.neutral.sm'],'root',{color:'#123456'},['light']);
    assert.deepEqual(await stored(),colored,'only the selected tone and Light theme receive color');
    const colorPaint = painted.map(entry=>entry.recipe==='paragraph.neutral.sm' && entry.component==='text' && entry.part==='root' ? {...entry,values:{...entry.values,color:'rgb(18, 52, 86)'}} : entry);
    assert.deepEqual(await recipePaint('text',properties),colorPaint,'peer tones retain their painted colors');
    await click(named(themeControl + ' button','Dark'));
    assert.notEqual(await evaluate(`getComputedStyle(${q(recipePart('text','paragraph.neutral.sm','root'))}).color`),'rgb(18, 52, 86)');
    for(const recipe of peers) assert.equal(await evaluate(`getComputedStyle(${q(recipePart('text',recipe,'root'))}).fontSize`),'25.375px');
    await click(named(themeControl + ' button','Light'));
    await resetRecipeField('text','paragraph.neutral.sm','root','text','fontSize');
    const reset = structuredClone(colored);
    for(const mode of ['light','dark']) for(const recipe of peers) delete reset.themes[mode].componentRecipes.text[recipe].root.fontSize;
    assert.deepEqual(await stored(),reset,'reset removes one field across all six tones but retains weight and the exact Light color');
    const resetPaint = colorPaint.map((entry,index)=>({...entry,values:{...entry.values,fontSize:original[index].values.fontSize}}));
    assert.deepEqual(await recipePaint('text',properties),resetPaint);
    await click(q('[aria-label="Undo change"]')); assert.deepEqual(await stored(),colored);
    assert.deepEqual(await recipePaint('text',properties),colorPaint);
    await click(q('[aria-label="Redo change"]')); assert.deepEqual(await stored(),reset);
    await resetRecipeField('text','paragraph.neutral.sm','root','text','color');
    const resetColor = structuredClone(reset);
    delete resetColor.themes.light.componentRecipes.text['paragraph.neutral.sm'].root.color;
    assert.deepEqual(await stored(),resetColor,'color reset remains selected-combination and Light-only');
    assert.deepEqual(await recipePaint('text',properties),resetPaint.map((entry,index)=>({...entry,values:{...entry.values,color:original[index].values.color}})));
    await click(q('[aria-label="Undo change"]')); assert.deepEqual(await stored(),reset);
    await click(q('[aria-label="Redo change"]')); assert.deepEqual(await stored(),resetColor);
    for(let i=0;i<5;i++) await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before,'two resets and three edits are five history steps total');
    assert.deepEqual(await recipePaint('text',properties),original);
  });
  await check('style inspector units, inline errors, precision/reset and full shadows remain usable in narrow panels',async()=>{
    await navigate('design','card'); await click(q(recipePart('card','outlined.md','title')));
    const before = await stored();
    const font = recipeField('card','outlined.md','title','text','fontSize');
    const help = '[data-system-recipe-controls] [data-appearance-help="fontSize"]';
    const assertDescription = async selector => assert.ok(await evaluate(`${q(selector)}.getAttribute('aria-describedby').split(' ').every(id=>!!document.getElementById(id))`),'hint/error descriptions resolve to actual elements');
    await assertDescription(font);
    assert.ok(await evaluate(`${q(font)}.closest('[data-appearance-field]').querySelector('label small').textContent==='px'`));
    await fill(font,'513'); await key('Enter');
    assert.equal(await evaluate(`${q(font)}.getAttribute('aria-invalid')`),'true');
    assert.ok(await evaluate(`document.getElementById(${q(font)}.id+'-error')?.textContent.includes('1–512 px')`));
    await assertDescription(font);
    assert.deepEqual(await stored(),before);
    await key('Escape'); await key('Tab');
    await assertMeasuredRecipe('card','outlined.md','title','text',textFields);
    const precise = 31.123456789012;
    await commitRecipe('card','outlined.md','title','text','fontSize',precise);
    const authored = await stored();
    await click(q(help+' > summary'));
    assert.equal(await evaluate(`${q(help+' [data-appearance-full-value]')}.textContent`),String(precise));
    assert.equal(await evaluate(`${q(font)}.value`),String(precise));
    assert.deepEqual(await stored(),authored,'reading a long authored value never rounds or saves it');
    await capture('studio-inspector-field-help');
    await fill(font,'999');
    await click(q(`[aria-label="Reset Card / Outlined / Medium / Title Font size"]`));
    assert.deepEqual(await stored(),before,'reset cancels pending invalid text and removes only the authored override');
    await click(q('[aria-label="Undo change"]')); assert.deepEqual(await stored(),authored);
    await click(q('[aria-label="Redo change"]')); assert.deepEqual(await stored(),before);
    const line = recipeField('card','outlined.md','title','text','lineHeight');
    await fill(line,'50%'); await key('Enter');
    assert.ok(await evaluate(`${q(line)}.getAttribute('aria-describedby').split(' ').some(id=>document.getElementById(id)?.textContent.includes('unitless multiplier'))`));
    assert.deepEqual(await stored(),before); await key('Escape'); await key('Tab');
    await click(q(`${example('card','elevated.md')} > button`));
    const shadow = '[data-system-recipe-controls] [data-appearance-help="shadow"]';
    const selectShadow = recipeField('card','elevated.md','root','frame','shadow');
    await click(q(shadow+' > summary'));
    const raw = await evaluate(`getComputedStyle(${q(recipePart('card','elevated.md','root'))}).boxShadow`);
    assert.ok(raw.length>30);
    assert.equal(await evaluate(`${q(shadow+' [data-appearance-full-value]')}.textContent`),raw);
    assert.equal(await evaluate(`${q(selectShadow)}.value`),'','raw CSS is never an authored preset');
    const width = await evaluate('innerWidth'),height = await evaluate('innerHeight');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await panel('workspace-inspector',true);
    await click(q(shadow+' > summary')); await click(q(shadow+' > summary'));
    assert.ok(await evaluate(`(()=>{const e=${q(shadow+' [data-appearance-full-value]')},p=${q('#workspace-inspector')},r=e.getBoundingClientRect(),b=p.getBoundingClientRect();return r.width>0&&r.left>=b.left&&r.right<=b.right+1&&p.scrollWidth<=p.clientWidth+1&&getComputedStyle(e).overflowWrap==='anywhere'})()`),'full value wraps within the mobile overlay without horizontal overflow');
    await capture('studio-inspector-shadow-mobile');
    await evaluate(`${q(shadow+' > summary')}.focus({preventScroll:true})`); await key('Enter');
    assert.equal(await evaluate(`${q(shadow)}.open`),false,'field info works by keyboard');
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await panel('workspace-inspector',true);
    assert.deepEqual(await stored(),before);
    await click(q(recipePart('card','outlined.md','title')));
  });
  await check('keyboard example label selects a recipe, then inspector layers select frame/text without native activation',async()=>{
    await navigate('design','card');
    const label = q(`${example('card','outlined.md')} > button[aria-label="Select Card Outlined Medium frame"]`);
    await positionCanvas(label);
    await evaluate(`${label}.focus({preventScroll:true})`);
    await key('Enter');
    await assertRecipeSelection('card','outlined.md','root','frame');
    assert.equal(await evaluate(`document.activeElement===${label}`),true);
    assert.equal(await evaluate(`${q('[data-system-layers]')}.open`),false,'full Layers start collapsed');
    assert.equal(await evaluate(`${q('[data-system-layer-select]')}.getAttribute('aria-label')`),'Selected layer');
    await select('[data-system-layer-select]','title');
    await assertRecipeSelection('card','outlined.md','title','text');
    assert.equal(await evaluate(`${q('[data-system-layers]')}.open`),false,'compact selection does not expand full Layers');
    await evaluate(`${q('[data-system-style-target="frame"]')}.focus({preventScroll:true})`); await key(' ','Space');
    await assertRecipeSelection('card','outlined.md','title','frame');
    await evaluate(`${q('[data-system-style-target="text"]')}.focus({preventScroll:true})`); await key('Enter');
    await assertRecipeSelection('card','outlined.md','title','text');
    await select('[data-system-layer-select]','root');
    await assertRecipeSelection('card','outlined.md','root','frame');
    await reveal(q('[data-system-recipe-controls] [aria-label="Select Card frame"]'));
    const {nodes}=await send('Accessibility.getFullAXTree');
    for(const name of ['Select Card Outlined Medium frame','Selected layer','Select Title text','Select Title frame']) assert.ok(nodes.some(node=>!node.ignored && node.name?.value===name),`matrix/layer AX name: ${name}`);
    const first = q('[data-system-recipe-controls] [aria-label="Select Card frame"]');
    await evaluate(`${first}.focus({preventScroll:true})`);
    await key('ArrowDown');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Select Header frame');
    await key('ArrowDown');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Select Title text');
    await assertRecipeSelection('card','outlined.md','root','frame');
    await key('Enter');
    await assertRecipeSelection('card','outlined.md','title','text');
    await reveal(q('[data-system-recipe-controls] [aria-label="Select Title text"]'));
    await evaluate(`${q('[data-system-recipe-controls] [aria-label="Select Title text"]')}.focus({preventScroll:true})`);
    await key('ArrowDown');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Select Title frame');
    await key(' ','Space');
    await assertRecipeSelection('card','outlined.md','title','frame');
  });
  await check('Button and Badge label hits differ from their frames; design clicks never activate native controls',async()=>{
    for(const [id,recipe] of [['button','primary.md'],['badge','outline.info.md']]) {
      await navigate('design',id);
      const before = await stored();
      await click(q(recipePart(id,recipe,'root')),true,true);
      await assertRecipeSelection(id,recipe,'root','frame');
      await evaluate(`window.__matrixActivations=0;${q(recipePart(id,recipe,'root'))}.addEventListener('click',()=>window.__matrixActivations++)`);
      await click(q(recipePart(id,recipe,'text')));
      await assertRecipeSelection(id,recipe,'text','text');
      assert.equal(await evaluate('window.__matrixActivations'),0,'capture selection must stop native target handlers');
      assert.equal(await evaluate(`!!document.activeElement.closest('[data-recipe-body]')`),false,'design labels do not focus underlying buttons');
      assert.deepEqual(await stored(),before,'selection must not create style or default edits');
      await capture(`studio-matrix-${id}-text`);
    }
    for(const id of ['switch','checkbox']) {
      await navigate('design',id);
      const control = recipePart(id,'unchecked.md','control');
      await click(q(control));
      await assertRecipeSelection(id,'unchecked.md','control','frame');
      assert.equal(await evaluate(`${q(control)}.getAttribute('aria-checked')`),'false','selection must not toggle an unchecked choice');
      await click(q(recipePart(id,'checked.md','label')));
      await assertRecipeSelection(id,'checked.md','label','text');
      assert.equal(await evaluate(`${q(recipePart(id,'checked.md','control'))}.getAttribute('aria-checked')`),'true','label selection must not activate its native choice');
    }
  });
  await check('exact field recipes omit valid Error layers and expose real invalid Error layers',async()=>{
    const before = await stored();
    for(const [id,states] of [['input',['default','invalid']],['switch',['checked','unchecked','invalidChecked','invalidUnchecked']],['checkbox',['checked','unchecked','invalidChecked','invalidUnchecked']]]) {
      await navigate('design',id);
      for(const state of states) {
        const recipe = `${state}.md`;
        const invalid = state.startsWith('invalid');
        await click(q(`${example(id,recipe)} > button`));
        await assertRecipeSelection(id,recipe,'root','frame');
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-system-recipe-controls] [aria-label^="Select Error "]')].map(e=>e.getAttribute('aria-label')).sort()`),invalid ? ['Select Error frame','Select Error text'] : [],`${id}/${recipe}: only reachable Error targets appear`);
        assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(recipePart(id,recipe,'error'))}).length`),invalid ? 1 : 0,`${id}/${recipe}: layer list matches actual message anatomy`);
        if(invalid) {
          await click(q(recipePart(id,recipe,'error')));
          await assertRecipeSelection(id,recipe,'error','text');
          await wait(`${q(recipePart(id,recipe,'error'))}.dataset.systemSelectedPart==='text'`);
          assert.ok(await evaluate(`${q(recipePart(id,recipe,'error'))}.textContent.trim().length>0`));
        } else assert.equal(await evaluate(`!!${q(`[data-system-recipe-controls] [id^="system-recipe-${id}-${recipe}-error-"]`)}`),false,'valid recipes cannot expose Error token controls');
      }
    }
    assert.deepEqual(await stored(),before,'inspecting reachable layers must not author tokens or insertion defaults');
  });
  await check('Input invalid error and control have separate exact frame/text scopes and clicks do not focus inputs',async()=>{
    await navigate('design','input');
    const recipe = 'invalid.md';
    const native = `${example('input',recipe)} input`;
    const value = await evaluate(`${q(native)}.value`);
    await click(q(recipePart('input',recipe,'error')));
    await assertRecipeSelection('input',recipe,'error','text');
    await capture('studio-matrix-input-error');
    await click(q(recipePart('input',recipe,'control','frame')),true,true);
    await assertRecipeSelection('input',recipe,'control','frame');
    await click(q(native));
    await assertRecipeSelection('input',recipe,'control','text');
    await capture('studio-matrix-input-control');
    assert.equal(await evaluate(`${q(native)}.getAttribute('aria-invalid')`),'true');
    assert.equal(await evaluate(`${q(native)}.value`),value);
    assert.equal(await evaluate(`document.activeElement===${q(native)}`),false);
    await click(q(recipePart('input',recipe,'label')));
    await assertRecipeSelection('input',recipe,'label','text');
    assert.equal(await evaluate(`document.activeElement===${q(native)}`),false,'field label default activation must be prevented');
  });
  await check('readonly Input Error selection reveals and highlights its message without changing recipe or native readonly',async()=>{
    await navigate('design','input');
    const recipe = 'readonly.md';
    const error = recipePart('input',recipe,'error');
    const native = `${example('input',recipe)} input`;
    const readonlyErrors = `${matrix('input')} [data-recipe-example^="readonly."] [data-component-part="error"]`;
    const before = await stored();
    const value = await evaluate(`${q(native)}.value`);
    await click(q(`${example('input',recipe)} > button`));
    await assertRecipeSelection('input',recipe,'root','frame');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-system-recipe-controls] [aria-label^="Select Error "]')].map(e=>e.getAttribute('aria-label')).sort()`),['Select Error frame','Select Error text'],'readonly takes precedence over invalid, so its optional Error layer is reachable');
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(readonlyErrors)}).length`),0,'readonly messages stay absent until their Error layer is selected');
    await click(q('[data-system-recipe-controls] [aria-label="Select Error text"]'));
    await assertRecipeSelection('input',recipe,'error','text');
    const assertReadonlyError = async () => {
      await wait(`${q(error)}?.dataset.systemSelectedPart==='text'`);
      await positionCanvas(q(error));
      assert.equal(await evaluate(`${q(error)}.checkVisibility()`),true);
      assert.equal(await evaluate(`${q(error)}.textContent.trim()`),'Please check this field.');
      assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(readonlyErrors)}).length`),1,'only the selected readonly size reveals its message');
      assert.equal(await evaluate(`getComputedStyle(${q(error)}).outlineStyle`),'solid');
      assert.ok(await evaluate(`parseFloat(getComputedStyle(${q(error)}).outlineWidth)>0`));
      assert.equal(await evaluate(`${q(native)}.readOnly && ${q(native)}.hasAttribute('readonly') && !${q(native)}.disabled`),true);
      assert.equal(await evaluate(`${q(native)}.value`),value);
      assert.equal(await evaluate(`${q(native)}.getAttribute('aria-invalid')`),'true');
      assert.ok(await evaluate(`${q(error)}.id && (${q(native)}.getAttribute('aria-describedby') || '').split(/\\s+/).includes(${q(error)}.id)`),'actual error message stays associated with the readonly control');
    };
    await assertReadonlyError();
    await click(q(error));
    await assertRecipeSelection('input',recipe,'error','text');
    assert.equal(await evaluate(`document.activeElement===${q(native)}`),false,'message selection does not activate the native input');
    assert.deepEqual(await stored(),before,'revealing optional anatomy does not mutate insertion defaults');
    await commitRecipe('input',recipe,'error','text','color','#234567');
    assert.equal(await evaluate(`getComputedStyle(${q(error)}).color`),'rgb(35, 69, 103)','accepted readonly Error token is consumed by the visible message');
    await click(q('[data-system-recipe-controls] [aria-label="Select Label text"]'));
    await assertRecipeSelection('input',recipe,'label','text');
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(readonlyErrors)}).length`),0,'leaving Error hides its optional message even when its recipe has an authored token');
    assert.equal(await evaluate(`${q(native)}.readOnly`),true);
    await navigate('design','colors');
    await click(q('.editor-title-actions button[aria-label*="System color pairs"]'));
    await click(named('[data-contrast-check="input.recipe.readonly.md.error/text"] button','Edit Input / readonly md / error text color'));
    await wait(`location.pathname==='/input' && document.activeElement?.id==='system-recipe-input-readonly.md-error-text-color'`);
    await assertRecipeSelection('input',recipe,'error','text');
    assert.equal(await evaluate(`${q(recipeField('input',recipe,'error','text','color'))}.value`),'#234567');
    await assertReadonlyError();
    await capture('studio-matrix-input-readonly-error');
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
    await click(q('[data-system-recipe-controls] [aria-label="Select Label text"]'));
    await assertRecipeSelection('input',recipe,'label','text');
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(readonlyErrors)}).length`),0);
  });
  await check('recipe colors stay theme-specific while dimensions and typography stay shared',async()=>{
    await navigate('design','card');
    await click(named(themeControl + ' button','Light'));
    await click(q(recipePart('card','outlined.md','title')));
    const before = await stored();
    await commitRecipe('card','outlined.md','title','text','color','#123456');
    assert.deepEqual((await stored()).themes.dark,before.themes.dark);
    await click(named(themeControl + ' button','Dark'));
    await assertRecipeSelection('card','outlined.md','title','text');
    await assertMeasuredRecipe('card','outlined.md','title','text',['color']);
    assert.equal((await stored()).themes.dark.componentRecipes?.card?.['outlined.md']?.title?.color,undefined);
    assert.equal(await evaluate(`${q('[data-ds-theme]')}.style.getPropertyValue('--card-recipe-outlined-md-title-color')`),'');
    assert.notEqual(await evaluate(`getComputedStyle(${q(recipePart('card','outlined.md','title'))}).color`),'rgb(18, 52, 86)');
    await commitRecipe('card','outlined.md','title','text','color','#abcdef');
    await commitRecipe('card','outlined.md','title','text','fontSize',29);
    await click(q('[data-system-recipe-controls] [aria-label="Select Card frame"]'));
    await commitRecipe('card','outlined.md','root','frame','paddingLeft',23);
    const customized = await stored();
    let expected = expectedRecipePatch(before,'card',['outlined.md'],'title',{color:'#123456'},['light']);
    expected = expectedRecipePatch(expected,'card',['outlined.md'],'title',{color:'#abcdef'},['dark']);
    expected = expectedRecipePatch(expected,'card',matrixVariants.card.map(variant=>`${variant}.md`),'title',{fontSize:29});
    expected = expectedRecipePatch(expected,'card',matrixVariants.card.map(variant=>`${variant}.md`),'root',{paddingLeft:23});
    assert.deepEqual(customized,expected,'colors stay exact while geometry/type update only the three md peers; other six recipes and all other parts remain unchanged');
    for(const mode of ['light','dark']) {
      for(const variant of matrixVariants.card) {
        assert.equal(customized.themes[mode].componentRecipes.card[`${variant}.md`].title.fontSize,29);
        assert.equal(customized.themes[mode].componentRecipes.card[`${variant}.md`].root.paddingLeft,23);
      }
    }
    assert.equal(customized.themes.light.componentRecipes.card['outlined.md'].title.color,'#123456');
    assert.equal(customized.themes.dark.componentRecipes.card['outlined.md'].title.color,'#abcdef');
    for(const [label,color] of [['Light','rgb(18, 52, 86)'],['Dark','rgb(171, 205, 239)']]) {
      await click(named(themeControl + ' button',label));
      assert.equal(await evaluate(`getComputedStyle(${q(recipePart('card','outlined.md','title'))}).color`),color);
      assert.equal(await evaluate(`getComputedStyle(${q(recipePart('card','outlined.md','title'))}).fontSize`),'29px');
      assert.equal(await evaluate(`getComputedStyle(${q(recipePart('card','outlined.md','root'))}).paddingLeft`),'23px');
    }
    for(let i=0;i<4;i++) await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
    await click(named(themeControl + ' button','Light'));
  });
  await check('optional interaction previews retain real states and read-only choices resist pointer/keyboard input',async()=>{
    for(const [id,label] of [['switch','Read-only setting'],['checkbox','Read-only selection']]) {
      await navigate('design',id);
      await openInteractions(id);
      const specimen=interactions(id);
      const control=`${specimen} [role="${id}"][aria-readonly="true"]`;
      assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(control)}).length`),1,`${id} read-only control`);
      assert.equal(await evaluate(`${q(control)}.getAttribute('aria-checked')`),'true');
      assert.equal(await evaluate(`${q(control)}.closest('label')?.textContent.trim()`),label);
      await click(q(control));
      assert.equal(await evaluate(`${q(control)}.getAttribute('aria-checked')`),'true',`${id} pointer click must not toggle`);
      await evaluate(`${q(control)}.focus({preventScroll:true})`);
      assert.equal(await evaluate(`document.activeElement===${q(control)}`),true,`${id} should be keyboard focusable`);
      for(const [name,code] of [[' ','Space'],['Enter','Enter']]) {
        await key(name,code);
        assert.equal(await evaluate(`${q(control)}.getAttribute('aria-checked')`),'true',`${id} ${code} must not toggle`);
      }
      assert.equal(await evaluate(`${q(`${specimen} [role="${id}"][aria-disabled="true"]`)}.getAttribute('aria-checked')`),'true',`${id} disabled checked state`);
      if(id==='switch') assert.equal(await evaluate(`${q(`${specimen} [role="switch"][aria-invalid="true"]`)}.getAttribute('aria-checked')`),'false','switch error state');
      else {
        assert.equal(await evaluate(`${q(`${specimen} [aria-checked="mixed"]`)}.closest('[data-size]').dataset.size`),'lg','large indeterminate checkbox');
        assert.ok(await evaluate(`${q(`${specimen} [aria-checked="mixed"]`)}.getAttribute('aria-describedby')`));
        assert.equal(await evaluate(`${q(`${specimen} [role="checkbox"][aria-invalid="true"]`)}.getAttribute('aria-required')`),'true');
      }
    }
    await navigate('design','input');
    await openInteractions('input');
    const email=`${interactions('input')} input[type="email"]`;
    assert.equal(await evaluate(`${q(email)}.required && !${q(email)}.checkValidity()`),true,'empty required email');
    await fill(email,'not-an-email');
    assert.equal(await evaluate(`${q(email)}.validity.typeMismatch && !${q(email)}.checkValidity()`),true,'invalid email');
    assert.equal(await evaluate(`${q(`${interactions('input')} input[type="url"][aria-invalid="true"]`)}.value`),'studio','URL error example');
    assert.ok(await evaluate(`!!${q(`${interactions('input')} input[type="url"] + [aria-hidden="true"]`)}`),'URL end icon');
    assert.equal(await evaluate(`${q(`${interactions('input')} input:disabled`)}.closest('[data-size]').dataset.size`),'lg');
    await fill(email,'');
    await navigate('design','card');
    await openInteractions('card');
    assert.equal(await evaluate(`document.querySelectorAll('${interactions('card')} article:not([data-instance-specimen])').length`),3,'all three real Card variants remain available');
    assert.ok(await evaluate(`!!${q(`${interactions('card')} article[data-variant="elevated"][data-size="lg"] [data-component-part="content"]`)}`));
    await navigate('design','badge');
    await openInteractions('badge');
    assert.ok(await evaluate(`!!${q(`${interactions('badge')} [data-variant="outline"][data-tone="info"] [aria-hidden="true"]`)}`),'info outline badge start icon');
    await navigate('design','text');
    for(const [tone,size] of [['primary','lg'],['info','sm'],['danger','lg']]) assert.ok(await evaluate(`!!${q(recipePart('text',`paragraph.${tone}.${size}`,'root'))}`),`Text ${tone}/${size}`);
    await navigate('design','button');
  });
  await check('loading action keeps focus and blocks repeated activation',async()=>{
    await navigate('design','button');
    await openInteractions('button');
    const demo=`${interactions('button')} [data-save-demo]`;
    await click(q(`${demo} button`));
    await wait(`${q(`${demo} button`)}.getAttribute('aria-busy') === 'true'`);
    assert.equal(await evaluate(`${q(demo)}.dataset.saveCount`),'1');
    assert.ok(await evaluate(`document.activeElement === ${q(`${demo} button`)}`),'button retains focus while busy');
    await click(q(`${demo} button`));
    assert.equal(await evaluate(`${q(demo)}.dataset.saveCount`),'1','busy click cannot invoke handler again');
    await wait(`${q(`${demo} button`)}.getAttribute('aria-busy') !== 'true'`);
    assert.equal(await evaluate(`${q(`${demo} button`)}.textContent.trim()`),'Saved');
  });
  await check('common toolbar theme controls preview, inspector and Develop without changing the other theme',async()=>{
    await click(named(themeControl + ' button','Dark'));
    assert.ok(await evaluate(`${q('.editor-title')}.textContent.includes('Dark')`));
    assert.equal(await evaluate(`${q('.theme-pane:not([hidden])')}.getAttribute('aria-label')`),'Dark preview');
    await assertStudioSurfaces('dark');
    assert.equal(await evaluate(`getComputedStyle(document.documentElement).colorScheme`),'dark');
    assert.notEqual(await evaluate(`getComputedStyle(${q(matrixScroll)}).backgroundColor`),'rgb(255, 248, 246)');
    await click(q('[aria-label="Export tokens"]'));
    assert.equal(await evaluate(`getComputedStyle(${q('.export-dialog')}).backgroundColor`),await evaluate(`getComputedStyle(${q('.studio-header')}).backgroundColor`),'portals must use the same chrome theme');
    await click(q('[aria-label="Close export dialog"]'));
    assert.equal(await evaluate(`${q('.theme-pane [data-ds-theme]')}.dataset.dsTheme`),'dark');
    await capture('studio-desktop-dark');
    await navigate('design','button');
    await fill('#token-background','#234567');
    const before = await stored();
    await fill('#token-background','#123456');
    const after = await stored();
    assert.deepEqual(after.themes.light,before.themes.light);
    assert.equal(after.themes.dark.components.button.background,'#123456');
    await click(named(viewNav + ' a','Develop'));
    assert.equal(await evaluate(`${q('#workspace-content')}.hasAttribute('data-design')`),false);
    assert.ok(await evaluate(`${q('.workspace-panel:not([hidden])')}.textContent.includes('#123456')`));
    assert.equal(await evaluate(`!!${q('.breadcrumbs')} || !!${q('.viewport-controls')}`),false);
    assert.ok(await evaluate(`${q(themeControl)}.getClientRects().length > 0`));
    await assertWorkbenchToolbar('develop');
    await click(named(themeControl + ' button','Light'));
    assert.ok(await evaluate(`${q('.workspace-panel:not([hidden])')}.textContent.includes('light theme')`));
    await click(named(themeControl + ' button','Dark'));
    await click(named(viewNav + ' a','Design'));
  });
  await check('one preset applies both themes atomically and preserves geometry and overrides',async()=>{
    await navigate('design','colors');
    assert.equal(await evaluate(`!!${q('.editor-intro')}`),false,'Colors uses the compact inspector header');
    assert.equal(await evaluate(`!!${q('[aria-label="Current contrast checks"]')}`),false,'Colors report is not inline');
    assert.ok(await evaluate(`${q('.editor-title h2')}.textContent.startsWith('Global colors · ')`));
    assert.ok(await evaluate(`(()=>{const buttons=[...document.querySelectorAll('.editor-title-actions button')],header=${q('.editor-title')}.getBoundingClientRect();return buttons.length===2 && buttons.every(button=>button.getBoundingClientRect().right<=header.right)})()`),'color actions belong at the right edge of the title');
    await click(q('[aria-label="Open color builder"]'));
    await wait(`!!${q('[data-palette-builder][open]')}`);
    const before=await stored();
    await click(q('[aria-label="Apply Iris to both themes"]'));
    const after=await stored();
    await click(q('[aria-label="Close color builder"]'));
    for(const mode of ['light','dark']) {
      assert.equal(after.themes[mode].source,'#7660d5');
      assert.equal(after.themes[mode].global.radius,before.themes[mode].global.radius);
      assert.deepEqual(after.themes[mode].components,before.themes[mode].components);
      assert.notEqual(after.themes[mode].global.primary,before.themes[mode].global.primary);
      await click(named(themeControl + ' button',mode === 'light' ? 'Light' : 'Dark'));
      assert.equal(await evaluate(`${q(`[data-ds-theme="${mode}"]`)}.style.getPropertyValue('--ds-primary').trim()`),after.themes[mode].global.primary);
      await assertStudioSurfaces(mode);
    }
    assert.notEqual(after.themes.light.global.background,after.themes.dark.global.background);
  });
  await check('valid hex applies immediately; invalid input leaves persisted palettes unchanged',async()=>{
    await click(q('[aria-label="Open color builder"]'));
    await fill('input[id$="-source"]','#abc');
    assert.equal(await evaluate(`${q('input[id$="-source"]')}.getAttribute('aria-invalid')`),'true');
    const before=await stored();
    await fill('input[id$="-source"]','#287c60');
    const after=await stored();
    assert.equal(after.themes.light.source,'#287c60');assert.equal(after.themes.dark.source,'#287c60');
    assert.notDeepEqual(after,before);
    await fill('input[id$="-source"]','#gggggg');
    assert.deepEqual(await stored(),after);
    await fill('input[id$="-source"]','#287c60');
    await click(q('[aria-label="Close color builder"]'));
    await assertStudioSurfaces(await evaluate('document.documentElement.dataset.studioTheme'));
  });
  await check('editing the selected global background recolors the grid without touching the other theme',async()=>{
    const before=await stored();
    await fill('#token-background','#123456');
    assert.equal(await evaluate(`${q('[data-ds-theme="dark"]')}.style.getPropertyValue('--ds-background').trim()`),'#123456');
    await assertStudioSurfaces('dark');
    for (const [background, rendered] of [['#ffffff','rgb(255, 255, 255)'],['#000000','rgb(0, 0, 0)'],['#fafafa','rgb(250, 250, 250)']]) {
      await fill('#token-background',background);
      assert.equal(await evaluate(`getComputedStyle(${q(canvas)}).backgroundColor`),rendered);
      await assertStudioSurfaces('dark');
    }
    assert.deepEqual((await stored()).themes.light,before.themes.light);
    await fill('#token-background',before.themes.dark.global.background);
  });
  await check('direct frame padding drag previews without saving, commits the size group once and supports Undo',async()=>{
    await navigate('design','button');
    await click(q(`${example('button','outline.sm')} > button`));
    const handle='[data-spacing-handle="paddingLeft"]';
    await wait(`${q(handle)}?.checkVisibility()`);
    await positionCanvas(q(handle));
    await capture('studio-direct-frame-spacing');
    const before=await stored();
    const initial=Number(await evaluate(`${q(handle)}.getAttribute('aria-valuenow')`));
    await fill(recipeField('button','outline.sm','root','frame','paddingLeft'),'83.5');
    assert.deepEqual(await stored(),before,'uncommitted inspector draft remains transient');
    const point=await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+12,y:point.y,button:'left',buttons:1});
    await wait(`parseFloat(getComputedStyle(${q(recipePart('button','outline.sm','root','frame'))}).paddingLeft)===${initial+12}`);
    assert.deepEqual(await stored(),before,'gesture preview must not save intermediate values');
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+12,y:point.y,button:'left',buttons:0,clickCount:1});
    assert.equal(await evaluate(`!!${q('[data-spacing-value-editor]')}`),false,'drag release must not open the numeric editor');
    const peers=matrixVariants.button.map(variant=>`${variant}.sm`);
    assert.deepEqual(await stored(),expectedRecipePatch(before,'button',peers,'root',{paddingLeft:initial+12}));
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before,'one Undo restores the complete pre-drag snapshot');
    await wait(`${q(handle)}?.checkVisibility()`);
    await positionCanvas(q(handle));
    const cancelPoint=await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...cancelPoint,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cancelPoint.x+18,y:cancelPoint.y,button:'left',buttons:1});
    await key('Escape');
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:cancelPoint.x+18,y:cancelPoint.y,button:'left',buttons:0,clickCount:1});
    assert.deepEqual(await stored(),before,'Escape cancels without creating an override');
    await wait(`parseFloat(getComputedStyle(${q(recipePart('button','outline.sm','root','frame'))}).paddingLeft)===${initial}`);
    await click(q(handle));
    assert.deepEqual(await stored(),before,'click without movement does not materialize defaults');
    await wait(`${q('[data-spacing-value-editor] input[aria-label="Edit padding left"]')}?.checkVisibility()`);
    await key('Escape');
    await wait(`!${q('[data-spacing-value-editor]')}`);
  });
  await check('direct spacing numeric Apply and Enter preserve fractions, size scope and one Undo',async()=>{
    const handle='[data-spacing-handle="paddingLeft"]';
    const editor='[data-spacing-value-editor]';
    const input=`${editor} input[aria-label="Edit padding left"]`;
    const before=await stored();
    const peers=matrixVariants.button.map(variant=>`${variant}.sm`);
    for(const [activation,commit,value] of [['click','Apply',27.375],['Enter','Enter',31.625],['Space','Apply',19.125]]) {
      await wait(`${q(handle)}?.checkVisibility()`);
      if(activation==='click') await click(q(handle));
      else { await evaluate(`${q(handle)}.focus();true`); await key(activation==='Space' ? ' ' : 'Enter',activation==='Space' ? 'Space' : 'Enter'); }
      await wait(`${q(input)}?.checkVisibility() && document.activeElement===${q(input)}`);
      await fill(input,String(value));
      assert.deepEqual(await stored(),before,'typing a number is transient');
      if(commit==='Enter') await key('Enter'); else await click(named(`${editor} button`,'Apply'));
      await wait(`!${q(editor)}`);
      assert.deepEqual(await stored(),expectedRecipePatch(before,'button',peers,'root',{paddingLeft:value}),'only sm peers change, with identical geometry in both themes');
      await wait(`parseFloat(getComputedStyle(${q(recipePart('button','outline.sm','root','frame'))}).paddingLeft)===${value}`);
      await click(named('button','Undo change'));
      assert.deepEqual(await stored(),before,`${activation}/${commit}: one Undo restores the entire pre-entry snapshot`);
    }
  });
  await check('direct spacing unchanged, invalid and cancelled numbers never write or add history',async()=>{
    const handle='[data-spacing-handle="paddingLeft"]';
    const editor='[data-spacing-value-editor]';
    const input=`${editor} input[aria-label="Edit padding left"]`;
    const before=await stored();
    await click(q(handle)); await wait(`${q(input)}?.checkVisibility()`);
    await fill(input,'24.375'); await key('Enter'); await wait(`!${q(editor)}`);
    const authored=expectedRecipePatch(before,'button',matrixVariants.button.map(variant=>`${variant}.sm`),'root',{paddingLeft:24.375});
    assert.deepEqual(await stored(),authored);
    const bytes=await evaluate(`localStorage.getItem('bambiui.design-system.v1')`);
    const unchanged=async message=>{
      assert.deepEqual(await stored(),authored,message);
      assert.equal(await evaluate(`localStorage.getItem('bambiui.design-system.v1')`),bytes,message);
    };
    const open=async()=>{ await click(q(handle)); await wait(`${q(input)}?.checkVisibility()`); };
    for(const commit of ['Apply','Enter']) {
      await open();
      assert.equal(Number(await evaluate(`${q(input)}.value`)),24.375,'editor starts from the current fractional value');
      if(commit==='Enter') await key('Enter'); else await click(named(`${editor} button`,'Apply'));
      await wait(`!${q(editor)}`);
      await unchanged('unchanged submission is a no-op');
    }
    for(const value of ['', 'not-a-number', '-0.125', '1000.125']) {
      await open(); await fill(input,'');
      // A native numeric input may reject nonnumeric text; either rejection or validation must leave storage untouched.
      if(value) await send('Input.insertText',{text:value});
      await key('Enter');
      await unchanged(`invalid draft ${JSON.stringify(value)} cannot commit via Enter`);
      if(await evaluate(`!!${q(editor)}`)) {
        const apply=named(`${editor} button`,'Apply');
        if(await evaluate(`!!(${apply}) && !(${apply}).disabled`)) await click(apply);
        await unchanged(`invalid draft ${JSON.stringify(value)} cannot commit via Apply`);
        if(await evaluate(`!!${q(editor)}`)) await key('Escape');
      }
      await wait(`!${q(editor)}`);
    }
    for(const cancel of ['Escape','Cancel','blur']) {
      await open(); await fill(input,'72.625');
      if(cancel==='Escape') await key('Escape');
      else if(cancel==='Cancel') await click(named(`${editor} button`,'Cancel'));
      else await evaluate(`${q('[aria-label="Undo change"]')}.focus();true`);
      await wait(`!${q(editor)}`);
      await unchanged(`${cancel} discards the pending number`);
    }
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before,'all no-op, invalid and cancel attempts leave exactly the single authored edit to undo');
  });
  await check('direct spacing context changes discard pending numeric drafts',async()=>{
    const handle='[data-spacing-handle="paddingLeft"]';
    const editor='[data-spacing-value-editor]';
    const input=`${editor} input[aria-label="Edit padding left"]`;
    const before=await stored();
    for(const context of ['selection','playground']) {
      await click(q(`${example('button','outline.sm')} > button`));
      await wait(`${q(handle)}?.checkVisibility()`);
      await click(q(handle)); await wait(`${q(input)}?.checkVisibility()`);
      await fill(input,'86.375');
      if(context==='selection') await click(q(`${example('button','primary.md')} > button`));
      else await click(q(workbenchMode('playground')));
      await wait(`!${q(editor)}`);
      assert.deepEqual(await stored(),before,`${context} discards rather than blur-committing a draft`);
      if(context==='playground') await click(q(workbenchMode('variants')));
    }
    await click(q(`${example('button','outline.sm')} > button`));
    await wait(`${q(handle)}?.checkVisibility()`);
    assert.equal(await evaluate(`!!${q(editor)}`),false,'returning to the selected frame does not revive the draft');
  });
  await check('direct margin handles support keyboard and stay outside hidden sample bodies',async()=>{
    const before=await stored();
    await click(named('[data-frame-spacing-editor] button','Margin'));
    const handle='[data-spacing-handle="marginRight"]';
    await wait(`${q(handle)}?.checkVisibility()`);
    assert.equal(await evaluate(`!!${q(handle)}.closest('[aria-hidden="true"]')`),false);
    const initial=Number(await evaluate(`${q(handle)}.getAttribute('aria-valuenow')`));
    await evaluate(`${q(handle)}.focus();true`);
    await key('ArrowRight');
    assert.deepEqual(await stored(),expectedRecipePatch(before,'button',matrixVariants.button.map(variant=>`${variant}.sm`),'root',{marginRight:initial+1}));
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before);
    await click(q(workbenchMode('playground')));
    assert.equal(await evaluate(`!!${q('[data-spacing-handle]')}`),false,'no hidden editing controls or draft preview survive in Playground');
    await click(q(workbenchMode('variants')));
  });

  await check('direct corners default to independent and numeric edits preserve every other corner, size and part',async()=>{
    await navigate('design','button');
    await click(q(`${example('button','outline.sm')} > button`));
    const before=await stored();
    const bytes=await evaluate(`localStorage.getItem('bambiui.design-system.v1')`);
    await click(named('[data-frame-spacing-editor] button','Corners'));
    await wait(`${q('[data-spacing-overlay="radius"]')}?.checkVisibility()`);
    const link=named('[data-frame-spacing-editor] button','Link corners');
    assert.equal(await evaluate(`(${link}).getAttribute('aria-pressed')`),'false','corners are independent by default');
    const fields=['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'];
    const labels=['top left','top right','bottom right','bottom left'];
    const editor='[data-spacing-value-editor]';
    const original=await recipePaint('button',fields);
    for(const [index,field] of fields.entries()) {
      const handle=`[data-spacing-overlay="radius"] [data-spacing-handle="${field}"]`;
      const input=`${editor} input[aria-label="Edit ${labels[index]} radius"]`;
      await wait(`${q(handle)}?.checkVisibility()`);
      if(index%2===0) await click(q(handle));
      else { await evaluate(`${q(handle)}.focus();true`); await key('Enter'); }
      await wait(`${q(input)}?.checkVisibility() && document.activeElement===${q(input)}`);
      assert.equal(await evaluate(`localStorage.getItem('bambiui.design-system.v1')`),bytes,'opening a corner does not write defaults');
      const value=23.375+index;
      await fill(input,String(value));
      assert.deepEqual(await stored(),before,'numeric drafts do not save');
      if(index%2===0) await click(named(`${editor} button`,'Apply')); else await key('Enter');
      await wait(`!${q(editor)}`);
      assert.deepEqual(await stored(),expectedRecipePatch(before,'button',matrixVariants.button.map(variant=>`${variant}.sm`),'root',{[field]:value}),'only the selected corner changes across all sm variants in both themes');
      const painted=original.map(entry=>entry.component==='button' && entry.part==='root' && entry.recipe.endsWith('.sm') ? {...entry,values:{...entry.values,[field]:`${value}px`}} : entry);
      await assertSettledRecipePaint('button',fields,painted,'other corners, parts and sizes retain their paint');
      await click(named('button','Undo change'));
      // Undo changes workspaceRevision and remounts the contextual editor.
      await click(named('[data-frame-spacing-editor] button','Corners'));
      if((await evaluate(`(${link}).getAttribute('aria-pressed')`))!=='false') await click(link);
      assert.deepEqual(await stored(),before,'one Undo restores the entire independent edit');
      await assertSettledRecipePaint('button',fields,original,'Undo restores radius paint');
    }
  });
  await check('linked corners preserve divergent values on toggle and unchanged submission, cancel drafts and commit once',async()=>{
    await navigate('design','card');
    await click(q(recipePart('card','outlined.md','root','frame')),true,true);
    await select('[data-system-layer-select]','header');
    await assertRecipeSelection('card','outlined.md','header','frame');
    await click(named('[data-frame-spacing-editor] button','Corners'));
    const link=named('[data-frame-spacing-editor] button','Link corners');
    assert.equal(await evaluate(`(${link}).getAttribute('aria-pressed')`),'false');
    const handle='[data-spacing-overlay="radius"] [data-spacing-handle="borderTopLeftRadius"]';
    const editor='[data-spacing-value-editor]';
    const input=`${editor} input[aria-label="Edit top left radius"]`;
    const fields=['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'];
    const peers=matrixVariants.card.map(variant=>`${variant}.md`);
    const before=await stored();
    await click(q(handle)); await wait(`${q(input)}?.checkVisibility()`);
    await fill(input,'37.375'); await key('Enter'); await wait(`!${q(editor)}`);
    const authored=expectedRecipePatch(before,'card',peers,'header',{borderTopLeftRadius:37.375});
    assert.deepEqual(await stored(),authored);
    await wait(`parseFloat(getComputedStyle(${q(recipePart('card','outlined.md','header','frame'))}).borderTopLeftRadius)===37.375`);
    const original=await recipePaint('card',fields);
    assert.ok(original.some(entry=>entry.recipe==='outlined.md' && entry.component==='card' && entry.part==='header' && entry.values.borderTopLeftRadius!==entry.values.borderTopRightRadius),'fixture has divergent corners');
    const bytes=await evaluate(`localStorage.getItem('bambiui.design-system.v1')`);
    const unchanged=async message=>{
      assert.deepEqual(await stored(),authored,message);
      assert.equal(await evaluate(`localStorage.getItem('bambiui.design-system.v1')`),bytes,message);
      await assertSettledRecipePaint('card',fields,original,message);
    };
    for(const pressed of ['true','false','true']) {
      await click(link);
      assert.equal(await evaluate(`(${link}).getAttribute('aria-pressed')`),pressed);
      await unchanged('link toggle alone never normalizes divergent corners');
    }
    for(const commit of ['Apply','Enter']) {
      await click(q(handle)); await wait(`${q(input)}?.checkVisibility()`);
      assert.equal(Number(await evaluate(`${q(input)}.value`)),37.375);
      if(commit==='Enter') await key('Enter'); else await click(named(`${editor} button`,'Apply'));
      await wait(`!${q(editor)}`);
      await unchanged('unchanged linked submission preserves divergent corners');
    }
    for(const cancel of ['Cancel','Escape']) {
      await click(q(handle)); await wait(`${q(input)}?.checkVisibility()`);
      await fill(input,'54.625');
      assert.deepEqual(await stored(),authored,'linked numeric preview is not persisted');
      if(cancel==='Escape') await key('Escape'); else await click(named(`${editor} button`,'Cancel'));
      await wait(`!${q(editor)}`);
      await unchanged(`${cancel} discards all linked corner drafts`);
    }
    for(const commit of ['Apply','Enter']) {
      await click(q(handle)); await wait(`${q(input)}?.checkVisibility()`);
      await fill(input,'18.625');
      if(commit==='Enter') await key('Enter'); else await click(named(`${editor} button`,'Apply'));
      await wait(`!${q(editor)}`);
      const patch=Object.fromEntries(fields.map(field=>[field,18.625]));
      assert.deepEqual(await stored(),expectedRecipePatch(authored,'card',peers,'header',patch),'linked edit changes only md Card headers, all variants and both themes');
      const painted=original.map(entry=>entry.component==='card' && entry.part==='header' && entry.recipe.endsWith('.md') ? {...entry,values:Object.fromEntries(fields.map(field=>[field,'18.625px']))} : entry);
      await assertSettledRecipePaint('card',fields,painted,'linked paint leaves other Card parts, nested components and sizes intact');
      await click(named('button','Undo change'));
      await click(named('[data-frame-spacing-editor] button','Corners'));
      if((await evaluate(`(${link}).getAttribute('aria-pressed')`))!=='true') await click(link);
      await unchanged(`${commit} is one history entry and Undo restores divergent corners`);
    }
    await click(link);
    await unchanged('unlinking does not write');
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before,'no-op submissions, toggles and cancellations add no history above the seed edit');
  });
  await check('corner pointer drags preview only the selection, commit once and cancel without writes',async()=>{
    await navigate('design','button');
    await click(q(`${example('button','outline.sm')} > button`));
    await click(named('[data-frame-spacing-editor] button','Corners'));
    const link=named('[data-frame-spacing-editor] button','Link corners');
    const fields=['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'];
    const handle='[data-spacing-overlay="radius"] [data-spacing-handle="borderTopLeftRadius"]';
    const before=await stored();
    const original=await recipePaint('button',fields);
    for(const linked of [false,true]) {
      if((await evaluate(`(${link}).getAttribute('aria-pressed')`))!==String(linked)) await click(link);
      for(const finish of ['commit','Escape','pointercancel']) {
        await wait(`${q(handle)}?.checkVisibility()`);
        await positionCanvas(q(handle));
        const initial=Number(await evaluate(`${q(handle)}.getAttribute('aria-valuenow')`));
        const point=await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+12,y:point.y+12,button:'left',buttons:1});
        await wait(`Number(${q(handle)}.getAttribute('aria-valuenow'))>${initial}`);
        const value=Number(await evaluate(`${q(handle)}.getAttribute('aria-valuenow')`));
        const changed=linked ? fields : ['borderTopLeftRadius'];
        const values=Object.fromEntries(changed.map(field=>[field,`${value}px`]));
        const preview=original.map(entry=>entry.component==='button' && entry.part==='root' && entry.recipe==='outline.sm' ? {...entry,values:{...entry.values,...values}} : entry);
        await assertSettledRecipePaint('button',fields,preview,'drag preview affects only the selected frame, not sibling recipes');
        assert.deepEqual(await stored(),before,'actual pointer movement is transient');
        if(finish==='Escape') await key('Escape');
        else if(finish==='pointercancel') await evaluate(`${q(handle)}.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}));true`);
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+12,y:point.y+12,button:'left',buttons:0,clickCount:1});
        assert.equal(await evaluate(`!!${q('[data-spacing-value-editor]')}`),false,'drag release never opens numeric entry');
        if(finish==='commit') {
          const patch=Object.fromEntries(changed.map(field=>[field,value]));
          assert.deepEqual(await stored(),expectedRecipePatch(before,'button',matrixVariants.button.map(variant=>`${variant}.sm`),'root',patch),'pointer commit respects linked state, size, part and both themes');
          const painted=original.map(entry=>entry.component==='button' && entry.part==='root' && entry.recipe.endsWith('.sm') ? {...entry,values:{...entry.values,...values}} : entry);
          await assertSettledRecipePaint('button',fields,painted,'committed drag updates only same-size peers');
          await click(named('button','Undo change'));
          await click(named('[data-frame-spacing-editor] button','Corners'));
          if((await evaluate(`(${link}).getAttribute('aria-pressed')`))!==String(linked)) await click(link);
        }
        assert.deepEqual(await stored(),before,`${linked ? 'linked' : 'independent'} ${finish}: restore the complete snapshot`);
        await assertSettledRecipePaint('button',fields,original,'cancel or one Undo restores all corners');
      }
    }
    await click(link);
  });

  await check('Size modes preserve source intent, fractional values and same-size scope with one Undo',async()=>{
    await navigate('design','button');
    await click(q(`${example('button','outline.sm')} > button`));
    const open=async()=>{ await click(named('[data-frame-spacing-editor] button','Size')); await wait(`${q('[data-frame-size-editor]')}?.checkVisibility()`); };
    const before=await stored();
    const peers=matrixVariants.button.map(variant=>`${variant}.sm`);
    for(const mode of ['fixed','hug','fill']) {
      await open();
      assert.ok(await evaluate(`${q('[data-size-measured="width"]')}.textContent.startsWith('Rendered:')`));
      await select('[aria-label="Width mode"]',mode);
      if(mode==='fixed') await fill('[aria-label="Fixed width"]','143.125');
      assert.deepEqual(await stored(),before,'mode and pixel drafts do not save');
      await click(named('[data-frame-size-editor] button','Apply width'));
      const value=mode==='fixed'?143.125:mode;
      assert.deepEqual(await stored(),expectedRecipePatch(before,'button',peers,'root',{width:value}));
      await wait(`getComputedStyle(${q(recipePart('button','outline.sm','root','frame'))}).width !== ''`);
      if(mode==='fixed') await wait(`parseFloat(getComputedStyle(${q(recipePart('button','outline.sm','root','frame'))}).width)===143.125`);
      if(mode==='fill') assert.ok(await evaluate(`(()=>{const e=${q(recipePart('button','outline.sm','root','frame'))},p=e.parentElement,s=getComputedStyle(p);return Math.abs(e.getBoundingClientRect().width-(p.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)))<1})()`));
      await click(named('button','Undo change'));
      assert.deepEqual(await stored(),before);
    }
    await open();
    await select('[aria-label="Width mode"]','fixed');
    for(const invalid of ['', '-1', '10001', 'NaN']) {
      await fill('[aria-label="Fixed width"]',invalid);
      assert.equal(await evaluate(`${q('[aria-label="Fixed width"]')}.getAttribute('aria-invalid')`),'true');
      await key('Enter');
      assert.deepEqual(await stored(),before);
    }
    await fill('[aria-label="Fixed width"]','190.875');
    await key('Escape');
    await wait(`!${q('[data-frame-size-editor]')}`);
    assert.deepEqual(await stored(),before);
    await open();
    await select('[aria-label="Width mode"]','fill');
    await click(q(workbenchMode('playground')));
    assert.deepEqual(await stored(),before,'leaving Size discards mode drafts');
    assert.equal(await evaluate(`!!${q('[data-frame-size-editor]')}`),false);
    await click(q(workbenchMode('variants')));
  });
  await check('Size reset clears only its scoped axis and Text retains typography variant scope',async()=>{
    await navigate('design','text');
    await click(q(`${example('text','paragraph.neutral.sm')} > button`));
    await click(named(`${example('text','paragraph.neutral.sm')} button`,'Frame'));
    const open=async()=>{ if(!await evaluate(`!!${q('[data-frame-size-editor]')}`)) await click(named('[data-frame-spacing-editor] button','Size')); await wait(`${q('[data-frame-size-editor]')}?.checkVisibility()`); };
    const before=await stored();
    const peers=tones.map(tone=>`paragraph.${tone}.sm`);
    await open();
    await select('[aria-label="Width mode"]','fixed'); await fill('[aria-label="Fixed width"]','160.625'); await key('Enter');
    const widthSystem=expectedRecipePatch(before,'text',peers,'root',{width:160.625});
    assert.deepEqual(await stored(),widthSystem);
    await open();
    await select('[aria-label="Height mode"]','fixed'); await fill('[aria-label="Fixed height"]','61.125'); await key('Enter');
    const both=expectedRecipePatch(widthSystem,'text',peers,'root',{height:61.125});
    assert.deepEqual(await stored(),both);
    await open();
    assert.match(await evaluate(`${q('[data-size-source="width"]')}.textContent`),/Fixed 160.625px/);
    await select('[aria-label="Width mode"]','fixed'); await fill('[aria-label="Fixed width"]','160.625'); await key('Enter');
    assert.deepEqual(await stored(),both,'unchanged explicit mode/value is a no-op');
    await open();
    await click(named('[data-frame-size-editor] button','Reset height'));
    const expected=structuredClone(both);
    for(const mode of ['light','dark']) for(const recipe of peers) delete expected.themes[mode].componentRecipes.text[recipe].root.height;
    assert.deepEqual(await stored(),expected,'height reset preserves width, colors, layers, other sizes and variants');
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),both,'reset is one undo step');
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),widthSystem,'unchanged submission creates no extra undo');
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before);
  });

  await check('gap mode exposes a drag only for a visible single-axis gap; drag and numeric entry commit once per size',async()=>{
    const settle=(id,recipe)=>wait(`${q(example(id,recipe)+' [data-recipe-body]')}.getAnimations({subtree:true}).every(animation=>animation.playState!=='running')`);
    const openGap=async(id,recipe,part)=>{
      await navigate('design',id);
      await click(q(`${example(id,recipe)} > button`));
      if(part!=='root') await select('[data-system-layer-select]',part);
      // Text-first layers (e.g. Error) reach their frame through the canvas action.
      if(!await evaluate(`!!${q('[data-frame-spacing-editor]')}`)) await click(named(`${example(id,recipe)} button`,'Frame'));
      await click(named('[data-frame-spacing-editor] button','Gap'));
      await wait(`${q('[data-spacing-handle="gap"]')}?.checkVisibility()`);
      return evaluate(`${q('[data-spacing-handle="gap"]')}.dataset.gapAxis`);
    };
    const layers=[['button','outline.sm','root'],['badge','outline.primary.sm','root'],['input','invalid.sm','root'],['input','invalid.sm','control'],['input','invalid.sm','error'],['switch','checked.sm','root'],['switch','checked.sm','row'],['checkbox','unchecked.sm','row'],['card','filled.md','root'],['card','filled.md','header'],['card','filled.md','content'],['card','filled.md','footer']];
    const axes={};
    for(const [id,recipe,part] of layers) axes[`${id}/${part}`]=await openGap(id,recipe,part);
    for(const [layer,axis] of Object.entries(axes)) assert.ok(['x','y','none'].includes(axis),`${layer} has a gap handle`);
    assert.equal(axes['card/header'],'y','Card header stacks title and description');
    assert.equal(axes['switch/row'],'x','choice row places control and label side by side');
    assert.equal(axes['button/root'],'none','a text-only Button has one visible item inside its content wrapper');
    assert.match(await (async()=>{ await openGap('card','filled.md','footer'); return evaluate(`${q('[data-spacing-handle="gap"]')}.title`); })(),/Wrapping layout/,'a nested Button is an item of Card footer, not its content wrapper');
    await navigate('design','text');
    await click(q(`${example('text','paragraph.neutral.sm')} > button`));
    await click(named(`${example('text','paragraph.neutral.sm')} button`,'Frame'));
    assert.equal(await evaluate(`!!${named('[data-frame-spacing-editor] button','Gap')}`),false,'Text has no gap tool');

    // Drag along the visible axis: preview only on the selection, release writes once.
    for(const [id,recipe,part,dx,dy] of [['card','filled.md','header',0,10],['switch','checked.sm','row',9,0]]) {
      await openGap(id,recipe,part);
      const before=await stored();
      const handle='[data-spacing-handle="gap"]';
      const initial=Number(await evaluate(`${q(handle)}.getAttribute('aria-valuenow')`));
      await positionCanvas(q(handle));
      const element=recipePart(id,recipe,part,'frame');
      const spacing=()=>evaluate(`(()=>{const items=[...${q(element)}.children].filter(e=>!['fixed','absolute'].includes(getComputedStyle(e).position)&&e.getBoundingClientRect().width>0).map(e=>e.getBoundingClientRect()).sort((a,b)=>${dy?'a.top-b.top':'a.left-b.left'});const root=${q(element)},scale=root.getBoundingClientRect().width/root.offsetWidth;return (${dy?'items[1].top-items[0].bottom':'items[1].left-items[0].right'})/scale})()`);
      const distance=await spacing();
      const point=await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx,y:point.y+dy,button:'left',buttons:1});
      await wait(`parseFloat(getComputedStyle(${q(element)}).gap)===${initial+dx+dy}`);
      const grown=await spacing(); assert.ok(Math.abs(grown-distance-(dx+dy))<0.02,`${id}/${part} painted item distance grows by the drag delta`);
      assert.deepEqual(await stored(),before,`${id}/${part} gap preview never saves`);
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y+dy,button:'left',buttons:0,clickCount:1});
      await settle(id,recipe);
      const peers=await evaluate(`[...document.querySelectorAll('${matrix(id)} [data-recipe-example]')].map(e=>e.dataset.recipeExample).filter(key=>key.endsWith('.${recipe.split('.').at(-1)}'))`);
      assert.deepEqual(await stored(),expectedRecipePatch(before,id,peers,part,{gap:initial+dx+dy}),`${id}/${part} gap applies to the same size in both themes`);
      assert.equal(parseFloat(await evaluate(`getComputedStyle(${q(element)}).gap`)),initial+dx+dy,'committed CSS consumes the gap');
      assert.ok(Math.abs(await spacing()-distance-(dx+dy))<0.02,'committed paint equals the preview');
      assert.equal(await evaluate(`!!${q('[data-spacing-value-editor]')}`),false,'drag release does not open the numeric editor');
      await click(named('button','Undo change'));
      assert.deepEqual(await stored(),before,'gap drag is one undo step');
    }

    // Numeric entry works on every gap layer, including ones without a draggable gap.
    const [id,recipe,part]=layers.find(([id,,part])=>axes[`${id}/${part}`]==='none') ?? ['card','filled.md','header'];
    await openGap(id,recipe,part);
    const before=await stored();
    const handle='[data-spacing-handle="gap"]';
    if(await evaluate(`${q(handle)}.dataset.gapAxis`)==='none') {
      assert.match(await evaluate(`${q(handle)}.title`),/enter the gap value/i,'unavailable drag is explained');
      await positionCanvas(q(handle));
      const point=await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+20,y:point.y,button:'left',buttons:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+20,y:point.y,button:'left',buttons:0,clickCount:1});
      assert.deepEqual(await stored(),before,'no drag without a visible gap');
      await key('Escape'); await wait(`!${q('[data-spacing-value-editor]')}`);
    }
    const input='[data-spacing-value-editor] input[aria-label="Edit gap"]';
    await evaluate(`${q(handle)}.focus();true`); await key('Enter');
    await wait(`${q(input)}?.checkVisibility()`);
    await fill(input,'13.375'); await key('Enter');
    await wait(`!${q('[data-spacing-value-editor]')}`);
    const peers=await evaluate(`[...document.querySelectorAll('${matrix(id)} [data-recipe-example]')].map(e=>e.dataset.recipeExample).filter(key=>key.endsWith('.${recipe.split('.').at(-1)}'))`);
    assert.deepEqual(await stored(),expectedRecipePatch(before,id,peers,part,{gap:13.375}),`${id}/${part} numeric gap keeps fractions and size scope`);
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before);
  });
  await check('right and bottom resize preview matches committed CSS across all seven components',async()=>{
    for(const [id,recipe,part] of [['button','outline.sm','root'],['input','invalid.sm','control'],['switch','checked.sm','control'],['checkbox','unchecked.sm','control'],['badge','outline.primary.sm','root'],['card','filled.md','header'],['text','paragraph.neutral.sm','root']]) {
      await navigate('design',id);
      await click(q(`${example(id,recipe)} > button`));
      if(part!=='root') await select('[data-system-layer-select]',part);
      if(id==='text') await click(named(`${example(id,recipe)} button`,'Frame'));
      const before=await stored();
      const paint=()=>evaluate(`(()=>{const root=${q(example(id,recipe)+' [data-recipe-body]')},r=root.getBoundingClientRect();return [...root.querySelectorAll('*')].map(e=>{const s=getComputedStyle(e),b=e.getBoundingClientRect();return {tag:e.tagName,part:e.dataset.componentPart,w:b.width,h:b.height,x:b.x-r.x,y:b.y-r.y,minHeight:s.minHeight,boxSizing:s.boxSizing,display:s.display,transform:s.transform,margin:s.margin}})})()`);
      await wait(`${q(example(id,recipe)+' [data-recipe-body]')}.getAnimations({subtree:true}).every(animation=>animation.playState!=='running')`);
      const original=await paint();
      for(const axis of ['width','height']) {
        await click(named('[data-frame-spacing-editor] button','Size'));
        await click(named('[data-frame-size-editor] button','Resize on frame'));
        const handle=`[data-resize-handle="${axis}"]`;
        await wait(`${q(handle)}?.checkVisibility()`);
        await positionCanvas(q(handle));
        if(id==='button' && axis==='width') await capture('studio-frame-resize');
        const point=await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+(axis==='width'?12:0),y:point.y+(axis==='height'?12:0),button:'left',buttons:1});
        await wait(`${q('[data-frame-resize-editor]')}.hasAttribute('data-resize-pending-value')`);
        const value=Number(await evaluate(`${q('[data-frame-resize-editor]')}.dataset.resizePendingValue`));
        await wait(`${q(example(id,recipe)+' [data-recipe-body]')}.getAnimations({subtree:true}).every(animation=>animation.playState!=='running')`);
        const preview=await paint();
        assert.deepEqual(await stored(),before,`${id} ${axis} preview never saves`);
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+(axis==='width'?12:0),y:point.y+(axis==='height'?12:0),button:'left',buttons:0,clickCount:1});
        await wait(`${q(example(id,recipe)+' [data-recipe-body]')}.getAnimations({subtree:true}).every(animation=>animation.playState!=='running')`);
        assert.deepEqual(await paint(),preview,`${id}/${part}/${axis}: preview and commit include layout helpers and descendants`);
        const peers=await evaluate(`[...document.querySelectorAll('${matrix(id)} [data-recipe-example]')].map(e=>e.dataset.recipeExample).filter(key=>key.endsWith('.${recipe.split('.').at(-1)}')${id==='text'?" && key.startsWith('paragraph.')":""})`);
        assert.deepEqual(await stored(),expectedRecipePatch(before,id,peers,part,{[axis]:value}));
        await click(named('button','Undo change'));
        assert.deepEqual(await stored(),before,`${id} ${axis} is one undo step`);
        await wait(`${q(example(id,recipe)+' [data-recipe-body]')}.getAnimations({subtree:true}).every(animation=>animation.playState!=='running')`);
        assert.deepEqual(await paint(),original);
      }
    }
  });
  await check('corner resize fixes only moved axes, previews like commit and is one undo step',async()=>{
    await navigate('design','button');
    await click(q(`${example('button','outline.sm')} > button`));
    await click(named('[data-frame-spacing-editor] button','Size'));
    await select('[aria-label="Height mode"]','hug'); await click(named('[data-frame-size-editor] button','Apply height'));
    const before=await stored();
    const peers=await evaluate(`[...document.querySelectorAll('${matrix('button')} [data-recipe-example]')].map(e=>e.dataset.recipeExample).filter(key=>key.endsWith('.sm'))`);
    const body=q(example('button','outline.sm')+' [data-recipe-body]');
    const settle=()=>wait(`${body}.getAnimations({subtree:true}).every(animation=>animation.playState!=='running')`);
    const paint=()=>evaluate(`[...${body}.querySelectorAll('*')].map(e=>{const b=e.getBoundingClientRect();return [e.tagName,b.width,b.height]})`);
    const handle='[data-resize-handle="corner"]';
    for(const [dx,dy,axes] of [[14,0,['width']],[0,10,['height']],[16,9,['width','height']]]) {
      await click(named('[data-frame-spacing-editor] button','Size'));
      await click(named('[data-frame-size-editor] button','Resize on frame'));
      await wait(`${q(handle)}?.checkVisibility()`);
      assert.equal(await evaluate(`${q(handle)}.tabIndex`),-1,'corner is a pointer shortcut outside the tab order');
      await positionCanvas(q(handle));
      const point=await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx,y:point.y+dy,button:'left',buttons:1});
      await wait(`${q('[data-frame-resize-editor]')}.dataset.resizePendingAxis===${JSON.stringify(axes.join(' '))}`);
      const values=Object.fromEntries(axes.map(axis=>[axis,0]));
      for(const axis of axes) values[axis]=Number(await evaluate(`${q('[data-frame-resize-editor]')}.dataset.resizePending${axis==='width'?'Width':'Height'}`));
      await settle(); const preview=await paint();
      assert.deepEqual(await stored(),before,'corner preview never saves');
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y+dy,button:'left',buttons:0,clickCount:1});
      await settle();
      assert.deepEqual(await paint(),preview,`corner ${axes} preview equals commit`);
      assert.deepEqual(await stored(),expectedRecipePatch(before,'button',peers,'root',values),`corner ${axes} writes only moved axes; untouched Hug height is preserved`);
      await click(named('button','Undo change'));
      assert.deepEqual(await stored(),before,'corner gesture is one undo step');
    }
    await click(named('button','Undo change'));
  });
  await check('resize preserves Hug/Fill on click, Escape, pointercancel and mode exit; keyboard explicitly fixes an axis',async()=>{
    await navigate('design','button');
    await click(q(`${example('button','outline.sm')} > button`));
    await click(named('[data-frame-spacing-editor] button','Size'));
    await select('[aria-label="Width mode"]','hug'); await click(named('[data-frame-size-editor] button','Apply width'));
    const before=await stored();
    const open=async()=>{ await click(named('[data-frame-spacing-editor] button','Size')); await click(named('[data-frame-size-editor] button','Resize on frame')); await wait(`${q('[data-resize-handle="width"]')}?.checkVisibility()`); };
    for(const finish of ['click','Escape','pointercancel','mode']) {
      await open();
      const handle='[data-resize-handle="width"]';
      await positionCanvas(q(handle));
      const element=recipePart('button','outline.sm','root','frame');
      const originalStyle=await evaluate(`${q(element)}.getAttribute('style')`);
      const point=await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
      if(finish!=='click') {
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+15,y:point.y,button:'left',buttons:1});
        await wait(`${q('[data-frame-resize-editor]')}.hasAttribute('data-resize-pending-value')`);
        if(finish==='Escape') await key('Escape');
        if(finish==='pointercancel') await evaluate(`${q(handle)}.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}));true`);
        if(finish==='mode') await evaluate(`${q(workbenchMode('playground'))}.click();true`);
      }
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+15,y:point.y,button:'left',buttons:0,clickCount:1});
      assert.deepEqual(await stored(),before,finish+' does not convert Hug to Fixed');
      assert.equal(await evaluate(`${q(element)}.getAttribute('style')`),originalStyle,'all temporary recipe variables are restored');
      if(finish==='mode') await click(q(workbenchMode('variants')));
    }
    await open();
    const handle='[data-resize-handle="height"]';
    const initial=Number(await evaluate(`${q(handle)}.getAttribute('aria-valuenow')`));
    await evaluate(`${q(handle)}.focus();true`); await key('ArrowUp');
    const after=await stored();
    assert.equal(typeof after.themes.light.componentRecipes.button['outline.sm'].root.height,'number');
    assert.ok(Math.abs(after.themes.light.componentRecipes.button['outline.sm'].root.height-initial-1)<0.02);
    await click(named('button','Undo change')); assert.deepEqual(await stored(),before);
    await click(named('button','Undo change'));
  });

  await check('text tools: numeric, scrub, align, color and reset keep typography size-scoped and color exact/theme-only',async()=>{
    const recipe='paragraph.neutral.sm', peers=tones.map(tone=>`paragraph.${tone}.sm`);
    const element=recipePart('text',recipe,'root','text');
    const tool=key=>`[data-text-tools] [data-text-tool="${key}"]`;
    const open=async()=>{
      await wait(`${named(`${example('text',recipe)} button`,'Text')}?.checkVisibility()`);
      if(await evaluate(`${named(`${example('text',recipe)} button`,'Text')}.getAttribute('aria-expanded')`)!=='true') await click(named(`${example('text',recipe)} button`,'Text'));
      await wait(`${q(tool('fontSize'))}?.checkVisibility()`);
    };
    await navigate('design','text');
    await click(q(`${example('text',recipe)} > button`));
    const before=await stored();
    assert.equal(await evaluate(`${named(`${example('text',recipe)} button`,'Text')}.getAttribute('aria-expanded')`),'false','text tools start collapsed so the specimen stays selectable');
    await open();
    assert.deepEqual(await stored(),before,'opening text tools writes nothing');
    const mode=await evaluate('document.documentElement.dataset.studioTheme');
    assert.match(await evaluate(`${q('[data-text-tools]')}.textContent`),new RegExp(`6 combinations at sm · both themes.*color: this combination, ${mode==='dark'?'Dark':'Light'}`));
    assert.doesNotMatch(await evaluate(`${q(tool('textAlign'))}.textContent`),/leftpx/,'choices carry no unit');

    // Numeric entry: invalid and cancelled drafts never write; Enter writes once for the size/variant group.
    const size=`${tool('fontSize')} input[type="text"]`;
    await fill(size,'12px'); await key('Enter');
    assert.equal(await evaluate(`${q(size)}.getAttribute('aria-invalid')`),'true');
    await key('Escape');
    assert.equal(await evaluate(`${q(size)}.getAttribute('aria-invalid')`),'false','Escape discards an invalid draft');
    await fill(size,'15.375');
    assert.deepEqual(await stored(),before,'typing is transient');
    await key('Enter');
    assert.deepEqual(await stored(),expectedRecipePatch(before,'text',peers,'root',{fontSize:15.375}),'font size: same size and Text variant, both themes');
    await wait(`getComputedStyle(${q(element)}).fontSize==='15.375px'`);
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before,'numeric entry is one undo step');

    // Label scrubbing previews only the selected sample and commits once on release; Escape cancels.
    await open();
    const label=`${tool('fontSize')} label`;
    await positionCanvas(q(label));
    const initial=parseFloat(await evaluate(`getComputedStyle(${q(element)}).fontSize`));
    const neighbour=recipePart('text','paragraph.primary.sm','root','text');
    const neighbourSize=await evaluate(`getComputedStyle(${q(neighbour)}).fontSize`);
    for(const finish of ['Escape','release']) {
      const point=await evaluate(`(()=>{const r=${q(label)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+10,y:point.y,button:'left',buttons:1});
      await wait(`${q(tool('fontSize'))}.dataset.scrubValue==='${initial+5}'`);
      await wait(`getComputedStyle(${q(element)}).fontSize==='${initial+5}px'`);
      assert.equal(await evaluate(`getComputedStyle(${q(neighbour)}).fontSize`),neighbourSize,'preview stays on the selected sample');
      assert.deepEqual(await stored(),before,'scrub preview never saves');
      if(finish==='Escape') await key('Escape');
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+10,y:point.y,button:'left',buttons:0,clickCount:1});
      if(finish==='Escape') {
        assert.deepEqual(await stored(),before,'Escape cancels the scrub');
        await wait(`getComputedStyle(${q(element)}).fontSize==='${initial}px'`);
      }
    }
    assert.deepEqual(await stored(),expectedRecipePatch(before,'text',peers,'root',{fontSize:initial+5}));
    await wait(`getComputedStyle(${q(neighbour)}).fontSize==='${initial+5}px'`);
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before,'scrub is one undo step');

    // Choices apply immediately; reset removes only that field.
    await open();
    await click(named(`${tool('textAlign')} button`,'Center'));
    assert.deepEqual(await stored(),expectedRecipePatch(before,'text',peers,'root',{textAlign:'center'}));
    await click(q(`${tool('textAlign')} [aria-label="Reset align"]`));
    assert.deepEqual(await stored(),before,'reset removes the override from the whole group without copying inherited values');

    // Color: exact combination, active theme only.
    const color=`${tool('color')} input[type="text"]`;
    await fill(color,'#123456'); await key('Enter');
    assert.deepEqual(await stored(),expectedRecipePatch(before,'text',[recipe],'root',{color:'#123456'},[mode]),'color writes only this combination in the active theme');
    await wait(`getComputedStyle(${q(element)}).color==='rgb(18, 52, 86)'`);
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before);

    // Nested text layer: Card title weight keeps Card size scope.
    await navigate('design','card');
    await click(q(`${example('card','filled.md')} > button`));
    await select('[data-system-layer-select]','title');
    const cardBefore=await stored();
    await click(named(`${example('card','filled.md')} button`,'Text'));
    await fill(`${tool('fontWeight')} input[type="text"]`,'700'); await key('Enter');
    const cardPeers=await evaluate(`[...document.querySelectorAll('${matrix('card')} [data-recipe-example]')].map(e=>e.dataset.recipeExample).filter(key=>key.endsWith('.md'))`);
    assert.deepEqual(await stored(),expectedRecipePatch(cardBefore,'card',cardPeers,'title',{fontWeight:700}));
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),cardBefore);
  });
  await check('one contextual tool surface: toolbar keys, status scope below the specimen, group reset and target switch',async()=>{
    await navigate('design','button');
    await click(q(`${example('button','outline.sm')} > button`));
    const toolbar='[data-frame-spacing-editor] [role="toolbar"]';
    const status=q(`${example('button','outline.sm')} [data-tool-status]`);
    await wait(`${status}?.dataset.toolStatus==='Padding'`);
    assert.match(await evaluate(`${status}.textContent`),/6 combinations at sm · both themes/);
    assert.ok(await evaluate(`(()=>{const s=${status}.getBoundingClientRect(),b=${q(example('button','outline.sm')+' [data-recipe-body]')}.getBoundingClientRect();return s.top>=b.bottom-0.5 && s.left>=b.left-0.5 && s.right<=b.right+0.5})()`),'status sits under the specimen, never over it');
    for(const [tool,name] of [['Corners','Corners'],['Gap','Gap'],['Margin','Margin']]) {
      await click(named(`${toolbar} button`,tool));
      await wait(`${status}?.dataset.toolStatus===${JSON.stringify(name)}`);
    }
    assert.match(await evaluate(`${status}.textContent`),/negative/i,'mode hints follow the active tool');

    // Arrow/Home/End move between toolbar buttons only.
    await evaluate(`${named(`${toolbar} button`,'Size')}.focus();true`);
    await key('ArrowRight');
    assert.equal(await evaluate('document.activeElement.textContent'),'Padding');
    await key('End');
    assert.equal(await evaluate('document.activeElement.textContent'),'Text','Button root switches to its label text');
    await key('Home');
    assert.equal(await evaluate('document.activeElement.textContent'),'Size');
    await key('ArrowLeft');
    assert.equal(await evaluate('document.activeElement.textContent'),'Text','arrows wrap');

    // Group reset removes the group's overrides in the size group; it is disabled when nothing is stored and is one Undo step.
    await click(named(`${toolbar} button`,'Padding'));
    const before=await stored();
    const reset=named(`${example('button','outline.sm')} [data-tool-status] button`,'Reset padding');
    assert.equal(await evaluate(`${reset}.disabled`),true,'nothing to reset');
    const handle='[data-spacing-handle="paddingLeft"]';
    await evaluate(`${q(handle)}.focus();true`); await key('ArrowRight');
    const edited=await stored();
    assert.notDeepEqual(edited,before);
    await wait(`!${reset}.disabled`);
    await click(reset);
    assert.deepEqual(await stored(),before,'reset restores the defaults without copying inherited values');
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),edited,'reset is one undo step');
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before);

    // Resize hints live in the status line and describe the handles.
    await click(q(`${example('button','outline.sm')} > button`));
    await click(named(`${toolbar} button`,'Size'));
    await click(named('[data-frame-size-editor] button','Resize on frame'));
    await wait(`${q('[data-resize-handle="width"]')}?.checkVisibility()`);
    const described=await evaluate(`document.getElementById(${q('[data-resize-handle="width"]')}.getAttribute('aria-describedby'))?.textContent`);
    assert.match(described ?? '',/Drag right \/ bottom \/ corner/,'resize handles are described by the visible status hint');
    assert.equal(await evaluate(`${status}.dataset.toolStatus`),'Resize');

    // Frame ↔ Text switch on the same layer.
    await navigate('design','text');
    await click(q(`${example('text','paragraph.neutral.sm')} > button`));
    const textStatus=q(`${example('text','paragraph.neutral.sm')} [data-tool-status]`);
    await wait(`${textStatus}?.dataset.toolStatus==='Text'`);
    assert.match(await evaluate(`${textStatus}.textContent`),/6 combinations at sm · both themes · color: this combination/);
    await click(named(`${example('text','paragraph.neutral.sm')} [role="toolbar"] button`,'Frame'));
    await wait(`${textStatus}?.dataset.toolStatus==='Padding'`);
    await click(named('[data-frame-spacing-editor] [role="toolbar"] button','Text'));
    await wait(`${textStatus}?.dataset.toolStatus==='Text' && !!${named(`${example('text','paragraph.neutral.sm')} button`,'Text')}`);
  });
  await check('radius presets stay distinct after corner edits; preset views edit component presets per size',async()=>{
    await navigate('design','button');
    const radiusOf=(recipe)=>evaluate(`getComputedStyle(${q(recipePart('button',recipe,'root'))}).borderTopLeftRadius`);
    const view=async(value)=>{ await select('[data-radius-view]',value); await wait(`${q(recipePart('button','outline.sm','root'))}.dataset.radius===${JSON.stringify(value||undefined)} || (!${JSON.stringify(value)} && !${q(recipePart('button','outline.sm','root'))}.hasAttribute('data-radius'))`); };
    const editCorner=async(value)=>{
      await click(q(`${example('button','outline.sm')} > button`));
      await click(named('[data-frame-spacing-editor] [role="toolbar"] button','Corners'));
      const handle='[data-spacing-handle="borderTopLeftRadius"]';
      await wait(`${q(handle)}?.checkVisibility()`);
      await click(q(handle));
      await fill('[data-spacing-value-editor] input',String(value)); await key('Enter');
      await wait(`!${q('[data-spacing-value-editor]')}`);
    };
    const global=(await stored())?.themes?.light?.global ?? { radiusSm:4, radius:8, radiusLg:12 };
    // Default shape: a corner edit writes the size recipe only.
    await view('');
    await editCorner(20);
    assert.equal(await radiusOf('outline.sm'),'20px');
    const afterRecipe=await stored();
    assert.equal(afterRecipe.themes.light.componentRecipes.button['outline.sm'].root.borderTopLeftRadius,20);
    assert.equal(afterRecipe.themes.light.componentRadii,undefined,'default-shape edits never write presets');
    // Presets are not flattened by the recipe corner.
    for(const [preset,value] of [['sm',global.radiusSm],['md',global.radius],['lg',global.radiusLg]]) {
      await view(preset);
      for(const recipe of ['outline.sm','ghost.sm','outline.md']) assert.equal(await radiusOf(recipe),`${value}px`,`${recipe} radius=${preset} keeps the shared ${preset} step`);
    }
    // Preset view: the corner edits this component's lg preset at sm, for all variants and both themes.
    await view('lg');
    await editCorner(22);
    const status=q(`${example('button','outline.sm')} [data-tool-status]`);
    assert.match(await evaluate(`${status}.textContent`),/Radius lg preset · sm · all variants · both themes/);
    const preset=await stored();
    for(const mode of ['light','dark']) assert.deepEqual(preset.themes[mode].componentRadii,{button:{lg:{sm:{topLeft:22}}}});
    assert.deepEqual(preset.themes.light.componentRecipes,afterRecipe.themes.light.componentRecipes,'preset edits leave recipes untouched');
    for(const recipe of ['outline.sm','ghost.sm','destructive.sm']) assert.equal(await radiusOf(recipe),'22px');
    await capture('studio-radius-presets');
    assert.equal(await radiusOf('outline.md'),`${global.radiusLg}px`,'other sizes keep their own preset');
    await view('sm'); assert.equal(await radiusOf('outline.sm'),`${global.radiusSm}px`,'other presets stay distinct');
    await view(''); assert.equal(await radiusOf('outline.sm'),'20px','the default shape keeps its recipe corner');
    // Inspector overview: resolved values with sources, uniform quick edit, one Undo, reset.
    const cell=(key)=>q(`[data-radius-preset-cell="${key}"]`);
    assert.equal(await evaluate(`${cell('lg.sm')}.dataset.source`),'custom');
    assert.equal(await evaluate(`${q('[data-radius-preset-cell="lg.sm"] input')}.placeholder`),'Mixed','different corners are shown as mixed, not guessed');
    assert.equal(await evaluate(`${cell('md.lg')}.dataset.source`),'scale');
    assert.equal(await evaluate(`${q('[data-radius-preset-cell="md.lg"] input')}.value`),String(global.radius),'unset cells show the resolved shared step');
    await fill(`[data-radius-preset-cell="md.lg"] input`,'9.5'); await key('Enter');
    await wait(`(()=>{const s=JSON.parse(localStorage.getItem('bambiui.design-system.v1'));return s.themes.dark.componentRadii?.button?.md?.lg?.bottomRight===9.5})()`);
    assert.deepEqual((await stored()).themes.light.componentRadii.button.md.lg,{topLeft:9.5,topRight:9.5,bottomRight:9.5,bottomLeft:9.5});
    await click(named('button','Undo change'));
    assert.deepEqual((await stored()).themes.light.componentRadii,{button:{lg:{sm:{topLeft:22}}}},'quick edit is one undo step');
    await click(named('[data-radius-preset-row="sm"] button','sm'));
    await wait(`${q('[data-radius-view]')}.value==='sm'`);
    // Export and Develop expose the consumed variables.
    await click(q('[aria-label="Export tokens"]'));
    assert.ok((await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`)).includes('--button-radius-lg-sm-top-left: 22px;'));
    await click(q('[aria-label="Close export dialog"]'));
    await navigate('develop','button');
    assert.ok(await evaluate(`${q('[data-radius-preset-reference]')}.textContent.includes('--button-radius-lg-sm-top-left')`));
    await navigate('design','button');
    await click(q(`[aria-label="Reset radius lg at Small"]`));
    assert.equal((await stored()).themes.light.componentRadii,undefined,'reset prunes the preset without copying the scale');
    await view('');
  });
  await check('every shape-bearing component edits its own preset on its shape layer; Switch has no preset view',async()=>{
    for(const [id,recipe,part,size] of [['input','default.lg','control','lg'],['checkbox','checked.md','control','md'],['badge','solid.primary.sm','root','sm'],['card','outlined.md','root','md']]) {
      await navigate('design',id);
      await select('[data-radius-view]','md');
      await click(q(`${example(id,recipe)} > button`));
      if(part!=='root') await select('[data-system-layer-select]',part);
      if(!await evaluate(`!!${q('[data-frame-spacing-editor]')}`)) await click(named(`${example(id,recipe)} button`,'Frame'));
      const before=await stored();
      await click(named('[data-frame-spacing-editor] [role="toolbar"] button','Corners'));
      const handle='[data-spacing-handle="borderBottomRightRadius"]';
      await wait(`${q(handle)}?.checkVisibility()`);
      await click(q(handle));
      await fill('[data-spacing-value-editor] input','15.5'); await key('Enter');
      await wait(`!${q('[data-spacing-value-editor]')}`);
      const after=await stored();
      for(const mode of ['light','dark']) assert.deepEqual(after.themes[mode].componentRadii?.[id],{md:{[size]:{bottomRight:15.5}}},`${id}: ${mode} preset`);
      assert.deepEqual(after.themes.light.componentRecipes,before?.themes?.light?.componentRecipes,`${id}: recipes untouched`);
      const shape=recipePart(id,recipe,part,'frame');
      assert.equal(await evaluate(`getComputedStyle(${q(shape)}).borderBottomRightRadius`),'15.5px',`${id}: the real shape layer paints the preset`);
      await click(named('button','Undo change'));
      assert.equal((await stored()).themes.light.componentRadii,undefined,`${id}: one undo step`);
      await select('[data-radius-view]','');
    }
    await navigate('design','switch');
    assert.equal(await evaluate(`!!${q('[data-radius-view]')} || !!${q('[data-radius-preset-editor]')}`),false,'Switch keeps its pill and offers no presets');
  });
  await check('direct tools fit narrow viewports with usable hit targets',async()=>{
    try {
      for(const width of [700,390]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await navigate('design','button');
        await click(q(`${example('button','outline.sm')} > button`));
        const toolbar='[data-frame-spacing-editor] [role="toolbar"]';
        await wait(`${q(toolbar)}?.checkVisibility()`);
        await positionCanvas(q(toolbar));
        console.log('NARROWDBG',width,await evaluate(`JSON.stringify({toolbar:!!${q(toolbar)},status:document.querySelectorAll('[data-tool-status]').length,handle:!!${q('[data-spacing-handle="paddingLeft"]')},selected:[...document.querySelectorAll('[data-recipe-example][data-selected]')].map(e=>e.dataset.recipeExample)})`));//DEBUG
        const report=await evaluate(`(()=>{const buttons=[...${q(toolbar)}.querySelectorAll(':scope > button')].map(b=>b.getBoundingClientRect());const status=${q('[data-tool-status]')}.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth-innerWidth,minHeight:Math.min(...buttons.map(r=>r.height)),minWidth:Math.min(...buttons.map(r=>r.width)),left:Math.min(...buttons.map(r=>r.left),status.left),right:Math.max(...buttons.map(r=>r.right),status.right)}})()`);
        assert.ok(report.overflow<=0,`${width}px: no document overflow ${JSON.stringify(report)}`);
        assert.ok(report.minHeight>=24 && report.minWidth>=24,`${width}px: toolbar targets at least 24px ${JSON.stringify(report)}`);
        assert.ok(report.left>=0 && report.right<=width,`${width}px: toolbar and status stay inside the viewport ${JSON.stringify(report)}`);
        const handle='[data-spacing-handle="paddingLeft"]';
        assert.ok(await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return r.width>=20 && r.height>=20})()`),`${width}px: spacing handles stay usable`);
        await click(named(`${toolbar} button`,'Size'));
        await wait(`${q('[data-frame-size-editor]')}?.checkVisibility()`);
        assert.ok(await evaluate(`(()=>{const r=${q('[data-frame-size-editor]')}.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth})()`),`${width}px: size panel stays inside the viewport`);
        await key('Escape');
        if(width===390) await capture('studio-390-direct-tools');
      }
    } finally {
      await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    }
  });
  await check('Text frame spacing is reachable on canvas and preserves typographic variant scope',async()=>{
    await navigate('design','text');
    await click(q(`${example('text','paragraph.neutral.sm')} > button`));
    await click(named(`${example('text','paragraph.neutral.sm')} button`,'Frame'));
    const handle='[data-spacing-handle="paddingLeft"]';
    await wait(`${q(handle)}?.checkVisibility()`);
    const before=await stored();
    const initial=Number(await evaluate(`${q(handle)}.getAttribute('aria-valuenow')`));
    await evaluate(`${q(handle)}.focus();true`);
    await key('ArrowRight');
    assert.deepEqual(await stored(),expectedRecipePatch(before,'text',tones.map(tone=>`paragraph.${tone}.sm`),'root',{paddingLeft:initial+1}));
    await click(named('button','Undo change'));
    assert.deepEqual(await stored(),before);
    await positionCanvas(q(handle));
    const point=await evaluate(`(()=>{const r=${q(handle)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+15,y:point.y,button:'left',buttons:1});
    await evaluate(`${q(handle)}.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}));true`);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+15,y:point.y,button:'left',buttons:0,clickCount:1});
    assert.deepEqual(await stored(),before,'cancelled Text gesture leaves no overrides');
    await wait(`parseFloat(getComputedStyle(${q(recipePart('text','paragraph.neutral.sm','root'))}).paddingLeft)===${initial}`);
  });

  await check('scale stop edits update the live swatch, CSS and storage in only one theme',async()=>{
    await navigate('design');
    await click(named(themeControl + ' button','Light'));
    const before=await stored();
    const field=await evaluate(`${q('#scale-primary-500')}?.id`);
    assert.ok(field,'primary 500 scale input must have an id');
    await fill(`#${field}`,'#345678');
    await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-primary-500').trim()==='#345678'`);
    assert.equal((await stored()).themes.light.colorScales.primary[500],'#345678');
    assert.deepEqual((await stored()).themes.dark,before.themes.dark);
    assert.ok(await evaluate(`${q('[data-foundation="colors"]')}.textContent.includes('#345678')`),'live foundation must display the edited stop');
    await click(q('[aria-label="Export tokens"]'));
    const css=await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`);
    assert.ok(css.includes('--ds-primary-500: #345678;'));
    await click(q('[aria-label="Close export dialog"]'));
    await reload();
    assert.equal((await stored()).themes.light.colorScales.primary[500],'#345678');
    assert.deepEqual((await stored()).themes.dark,before.themes.dark);
    assert.equal(await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-primary-500').trim()`),'#345678');
  });
  await check('font preset is shared, visible, exported and reset independently',async()=>{
    await navigate('design','typography');
    assert.equal(await evaluate(`document.querySelectorAll('link[href^="https://fonts.googleapis.com/css2"]').length`),0,'local defaults must not fetch Google fonts');
    assert.equal(await evaluate(`${q('#font-family-preset')}.querySelectorAll('optgroup[label^="Google Fonts"] option').length`),12);
    await click(named(themeControl + ' button','Light'));
    await select('#font-family-preset','mono');
    await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-font-family').includes('Menlo')`);
    for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].fontFamily,'mono');
    assert.ok((await evaluate(`getComputedStyle(${q('[data-typography-style="paragraph"] span[aria-hidden]')}).fontFamily`)).includes('Menlo'));
    await navigate('design','text');
    assert.ok((await evaluate(`getComputedStyle(${q(recipePart('text','paragraph.neutral.md','root'))}).fontFamily`)).includes('Menlo'));
    assert.equal(await evaluate(`getComputedStyle(${q(workbenchToolbar)}).fontFamily`),await evaluate('getComputedStyle(document.body).fontFamily'),'workbench tools must not inherit the specimen font');
    await click(q('[aria-label="Export tokens"]'));
    assert.ok((await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`)).includes('--ds-font-family: ui-monospace'));
    await click(q('[aria-label="Close export dialog"]'));
    await navigate('develop','typography');
    assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes('--ds-font-family')`));
    await navigate('design','typography');
    for(const [preset,firstFont] of [['sans','Arial'],['humanist','Trebuchet MS'],['editorial','Palatino'],['typewriter','Courier New']]) {
      await select('#font-family-preset',preset);
      await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-font-family').includes(${JSON.stringify(firstFont)})`);
      for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].fontFamily,preset);
      assert.ok((await evaluate(`getComputedStyle(${q('[data-typography-style="paragraph"] span[aria-hidden]')}).fontFamily`)).includes(firstFont));
      assert.ok((await evaluate(`getComputedStyle(${q('#font-family-tokens p[style]')}).fontFamily`)).includes(firstFont));
    }
    await send('Fetch.enable',{patterns:[{urlPattern:'https://fonts.googleapis.com/*',requestStage:'Request'}]});
    await select('#font-family-preset','google-inter');
    await wait(`!!document.querySelector('link[href^="https://fonts.googleapis.com/css2?family=Inter"]')`);
    assert.equal((await stored()).themes.dark.fontFamily,'google-inter');
    await click(q('[aria-label="Export tokens"]'));
    assert.ok((await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`)).startsWith('@import url("https://fonts.googleapis.com/css2?family=Inter'));
    await click(q('[aria-label="Close export dialog"]'));
    await click(named('#font-family-tokens button','Reset font family'));
    await wait(`!document.querySelector('link[href^="https://fonts.googleapis.com/css2"]')`);
    await send('Fetch.disable');
    for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].fontFamily,'system');
  });
  await check('heading typography edits update Text, CSS, Docs and storage in both themes',async()=>{
    await navigate('design','typography');
    await select('#typography-variant','heading');
    const before=await stored();
    const field=await evaluate(`${q('#typography-heading-fontSize')}?.id`);
    assert.ok(field,'heading font size input must have an id');
    await fill(`#${field}`,'42');
    await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-typography-heading-font-size').trim()==='42px'`);
    assert.equal((await stored()).themes.light.typography.heading.fontSize,42);
    assert.equal((await stored()).themes.dark.typography.heading.fontSize,42);
    assert.deepEqual((await stored()).themes.dark.global,before.themes.dark.global);
    assert.equal(await evaluate(`getComputedStyle(${q('[data-typography-style="heading"] span[aria-hidden]')}).fontSize`),'42px');
    await navigate('design','text');
    assert.equal(await evaluate(`getComputedStyle(${q(recipePart('text','heading.neutral.md','root'))}).fontSize`),'42px');
    await click(q('[aria-label="Export tokens"]'));
    const css=await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`);
    assert.ok(css.includes('--ds-typography-heading-font-size: 42px;'));
    await click(q('[aria-label="Close export dialog"]'));
    await navigate('develop','text');
    assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes('--ds-typography-heading-font-size') && ${q('.workspace-panel--develop')}.textContent.includes('42px')`));
    await reload();
    assert.equal((await stored()).themes.light.typography.heading.fontSize,42);
    assert.equal((await stored()).themes.dark.typography.heading.fontSize,42);
    assert.deepEqual((await stored()).themes.dark.global,before.themes.dark.global);
    await navigate('design','text');
    assert.equal(await evaluate(`getComputedStyle(${q(recipePart('text','heading.neutral.md','root'))}).fontSize`),'42px');
  });
  await check('H1–H6 typography controls independently update the single Text canvas unit and Develop',async()=>{
    await navigate('design','typography');
    assert.equal(await evaluate(`${q('#typography-variant')}.options.length`),10,'all typography styles remain selectable');
    for(const [variant,size] of [['h1',54],['h2',45],['h3',36],['h4',30],['h5',25],['h6',22]]) {
      await select('#typography-variant',variant);
      await wait(`!!${q(`#typography-${variant}-fontSize`)}`);
      assert.equal(await evaluate(`document.querySelectorAll('.typography-control').length`),4,'only the selected style is editable at once');
      await fill(`#typography-${variant}-fontSize`,String(size));
      assert.equal(await evaluate(`getComputedStyle(${q(`[data-typography-style="${variant}"] span[aria-hidden]`)}).fontSize`),`${size}px`);
      for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].typography[variant].fontSize,size);
      assert.equal(await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-typography-${variant}-font-size').trim()`),`${size}px`);
    }
    await navigate('design','text');
    for(const [variant,size] of [['h1',54],['h2',45],['h3',36],['h4',30],['h5',25],['h6',22]]) assert.equal(await evaluate(`getComputedStyle(${q(recipePart('text',`${variant}.neutral.md`,'root'))}).fontSize`),`${size}px`);
    assert.equal(await evaluate(`${q(`${matrix('text')} h2`)}.textContent`),'Text variants');
    assert.equal(await evaluate(`${q('.studio-sidebar a[href="/text"]')}.getAttribute('aria-current')`),'page');
    assert.equal(await evaluate(`!!${q('[data-foundation="text"]')}`),false);
    await capture('studio-text');
    await navigate('develop','text');
    for(const variant of ['h1','h2','h3','h4','h5','h6']) assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes('--ds-typography-${variant}-font-size')`));
    await reload();
    assert.equal((await stored()).themes.dark.typography.h1.fontSize,54);
    await navigate('design','text');
  });
  await check('Text base color applies to every neutral style, not only paragraph, without overriding semantic tones',async()=>{
    await navigate('design','text');
    const variants=['heading','h1','h2','h3','h4','h5','h6','paragraph','label','caption'];
    const semanticColors = () => evaluate(`[...document.querySelectorAll('${matrix('text')} [data-ds-component="text"][data-component-part="root"]:not([data-tone="neutral"])')].map(e=>getComputedStyle(e).color)`);
    const semantic = await semanticColors();
    await fill('#token-foreground','#123456');
    for(const variant of variants) assert.equal(await evaluate(`getComputedStyle(${q(recipePart('text',`${variant}.neutral.md`,'root'))}).color`),'rgb(18, 52, 86)',`${variant} neutral should use the component color`);
    assert.deepEqual(await semanticColors(),semantic,'semantic tones retain their own ink');
    await click(q('[aria-label="Reset foreground override"]'));
    const original=(await stored()).themes.light.global.foreground;
    await navigate('design','colors');
    await fill('#token-foreground','#345678');
    await navigate('design','text');
    for(const variant of variants) assert.equal(await evaluate(`getComputedStyle(${q(recipePart('text',`${variant}.neutral.md`,'root'))}).color`),'rgb(52, 86, 120)',`${variant} neutral should inherit the global color`);
    await navigate('design','colors');
    await fill('#token-foreground',original);
  });
  await check('shape, component sizing and typography edits stay shared across Light and Dark',async()=>{
    await navigate('design','spacing');
    await fill('#token-radius','17');
    assert.equal((await stored()).themes.dark.global.radius,17);
    await click(named(themeControl + ' button','Dark'));
    assert.equal(await evaluate(`${q('#token-radius')}.value`),'17');
    await fill('#token-radius','19');
    assert.equal((await stored()).themes.light.global.radius,19);
    await fill('#token-radius','8');
    await navigate('design','button');
    await fill('#token-paddingX','27');
    assert.equal((await stored()).themes.light.components.button.paddingX,27);
    await click(named(themeControl + ' button','Light'));
    assert.equal(await evaluate(`${q('#token-paddingX')}.value`),'27');
    assert.equal((await stored()).themes.light.global.radius,8);
    await navigate('design','typography');
    await select('#typography-variant','heading');
    assert.equal(await evaluate(`${q('#typography-heading-fontSize')}.value`),'42');
    await click(named(themeControl + ' button','Dark'));
    assert.equal(await evaluate(`${q('#typography-heading-fontSize')}.value`),'42');
    await navigate('design','button');
    await click(q('[aria-label="Reset horizontal padding override"]'));
    assert.equal((await stored()).themes.light.components.button.paddingX,undefined);
    assert.equal((await stored()).themes.dark.components.button.paddingX,undefined);
    await click(named(themeControl + ' button','Light'));
  });
  await check('shape and spacing specimens visualize every shared dimension live',async()=>{
    await navigate('design','spacing');
    assert.ok(await evaluate(`${q('.editor-fields--spacing .section-heading span')}.textContent.includes('BOTH THEMES')`));
    assert.equal(await evaluate(`document.querySelectorAll('.editor-fields--spacing .number-fields .token-control').length`),14,'base font size moved to Typography');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-spacing-token]')].slice(0,3).map(e=>e.dataset.spacingToken)`),['radiusSm','radius','radiusLg'],'radius scale reads sm → md → lg');
    assert.equal(await evaluate(`document.body.textContent.includes('(legacy)')`),false,'no internal legacy labels');
    const radiusSlider=`${q('#token-radius')}.closest('.token-control').querySelector('.token-slider-trigger')`;
    assert.equal(await evaluate(`${radiusSlider}.getAttribute('aria-expanded')`),'false');
    await click(radiusSlider);
    assert.ok(await evaluate(`!!${q('#token-radius')}.closest('.token-control').querySelector('input[type="range"]')`),'shared dimension slider remains available');
    await click(named(themeControl + ' button','Light'));
    const original=await stored();
    const examples=[
      ['radius',24,'[class*="shapeVisual"]','borderTopLeftRadius'],
      ['radiusSm',3,'[class*="shapeVisual"]','borderTopLeftRadius'],
      ['radiusLg',32,'[class*="shapeVisual"]','borderTopLeftRadius'],
      ['paddingX',28,'[class*="paddingVisual"]','paddingLeft'],
      ['paddingY',22,'[class*="paddingVisual"]','paddingTop'],
      ['gap',18,'[class*="gapVisual"]','gap'],
      ['margin',20,'[class*="marginVisual"] > span','marginLeft'],
      ['spacingSm',6,'[class*="spacingScaleVisual"]','gap'],
      ['spacingMd',12,'[class*="spacingScaleVisual"]','gap'],
      ['spacingLg',24,'[class*="spacingScaleVisual"]','gap'],
      ['borderWidth',4,'[class*="shapeVisual"]','borderTopWidth'],
      ['controlHeightSm',40,'[class*="heightVisual"]','height'],
      ['controlHeightMd',48,'[class*="heightVisual"]','height'],
      ['controlHeightLg',56,'[class*="heightVisual"]','height'],
    ];
    for(const [token,value,visual,property] of examples) {
      await fill(`#token-${token}`,String(value));
      const sample=`[data-spacing-token="${token}"]`;
      assert.ok(await evaluate(`${q(sample)}.textContent.includes(${JSON.stringify(`${value}px`)})`),`${token} label should reflect the edit`);
      assert.equal(await evaluate(`getComputedStyle(${q(`${sample} ${visual}`)})[${JSON.stringify(property)}]`),`${value}px`,`${token} should change the visual example`);
      assert.equal((await stored()).themes.dark.global[token],value,`${token} should be shared`);
    }
    assert.equal((await stored()).themes.light.global.gap,18,'legacy gap must remain independent');
    await capture('studio-spacing-live-light');
    await click(named(themeControl + ' button','Dark'));
    for(const [token,value,visual,property] of examples) assert.equal(await evaluate(`getComputedStyle(${q(`[data-spacing-token="${token}"] ${visual}`)})[${JSON.stringify(property)}]`),`${value}px`);
    await capture('studio-spacing-live-dark');
    await navigate('design','card');
    for(const mode of ['Light','Dark']) {
      await click(named(themeControl + ' button',mode));
      for(const [size,value] of [['sm',6],['md',12],['lg',24]]) {
        assert.equal(await evaluate(`getComputedStyle(${q(recipePart('card',`outlined.${size}`,'content'))}).gap`),`${value}px`,`shared spacing reaches ${size} Card.Content in ${mode}`);
      }
      assert.equal(await evaluate(`getComputedStyle(${q(recipePart('card','outlined.md','root'))}).gap`),'18px','Card root still uses legacy gap');
    }
    await openInteractions('card');
    for(const size of ['sm','md','lg']) assert.equal(await evaluate(`${q(`${interactions('card')} article[data-size="${size}"]:not([data-instance-specimen]) [data-component-part="content"]`)}.children.length`),2,'interaction Card.Content still demonstrates multi-item spacing');
    await navigate('design','spacing');
    await click(named(themeControl + ' button','Light'));
    for(const [token] of examples) await fill(`#token-${token}`,String(original.themes.light.global[token]));
  });
  await check('contrast warnings follow manual edits and exported CSS/JSON keep both themes',async()=>{
    await navigate('design','colors');
    assert.equal(await evaluate(`!!${q('[aria-label="Current contrast checks"]')}`),false,'global checks are available through the Colors dialog, not inline');
    const globalPairs='.editor-title-actions button[aria-label*="System color pairs"]';
    await click(q(globalPairs));
    await wait(`!!${q('[aria-label="Contrast pair results"]')}`);
    assert.ok(await evaluate(`${q('[aria-label="Contrast pair results"]')}.children.length > 50`),'global dialog shows every checked pair');
    await click(q('[aria-label="Close color pair results"]'));
    const globalForeground=await evaluate(`${q('#token-foreground')}.value`);
    await fill('#token-foreground',await evaluate(`${q('#token-background')}.value`));
    await wait(`!!${q('.studio-sidebar a[href="/colors"] .nav-contrast-warning')}`);
    assert.ok((await evaluate(`${q('.studio-sidebar a[href="/colors"]')}.getAttribute('aria-label')`)).includes('need attention'));
    assert.equal(await evaluate(`${q(globalPairs)}.hasAttribute('data-failing')`),true,'Colors nav and modal use the same global pairs');
    await fill('#token-foreground',globalForeground);
    await navigate('design','button');
    const fillColor = await evaluate(`${q('#token-background')}.value`);
    await fill('#token-foreground',fillColor);
    const trigger='.editor-title-actions button[aria-label*="color pairs"]';
    assert.ok(await evaluate(`${q('.editor-title h2')}.textContent.startsWith('Button · ')`));
    assert.equal(await evaluate(`!!${q('.editor-intro')}`),false,'component inspector must not repeat its title or description');
    assert.equal(await evaluate(`${q('.editor-title > svg path')}.getAttribute('d') === ${q('.studio-sidebar a[href="/button"] svg path')}.getAttribute('d')`),true,'inspector title uses the component icon');
    assert.ok(await evaluate(`(()=>{const button=${q(trigger)}.getBoundingClientRect(),header=${q('.editor-title')}.getBoundingClientRect();return Math.abs(header.right-button.right-parseFloat(getComputedStyle(${q('.editor-title')}).paddingRight))<3})()`),'component color pair action aligns to the inspector right edge');
    assert.equal(await evaluate(`${q(trigger)}.hasAttribute('data-failing')`),true);
    assert.ok((await evaluate(`${q(trigger)}.getAttribute('aria-label')`)).includes('need attention'));
    const buttonLink='.studio-sidebar a[href="/button"]';
    await wait(`!!${q(`${buttonLink} .nav-contrast-warning`)}`);
    assert.ok((await evaluate(`${q(buttonLink)}.getAttribute('aria-label')`)).includes('need attention'));
    assert.ok(await evaluate(`!!${q(`${buttonLink} .override-dot`)}`),'contrast warning must coexist with the override marker');
    assert.equal(await evaluate(`!!${q('[aria-label="Current contrast checks"]')}`),false,'component checks must not occupy the inspector');
    await click(q(trigger));
    await wait(`!!${q('[aria-label="Contrast pair results"]')}`);
    assert.ok(await evaluate(`${q('[data-contrast-check="button.primary.text"]')}?.textContent.includes('Below target')`));
    assert.ok(await evaluate(`!!${q('[aria-label="Contrast pair results"] li:not([data-failing])')}`),'modal must show passing pairs too');
    assert.ok(await evaluate(`${q('[aria-label="Contrast pair results"]')}.children.length > 2`));

    await click(q('[aria-label="Close color pair results"]'));
    await wait(`!${q('[aria-label="Contrast pair results"]')}`);
    assert.equal(await evaluate(`document.activeElement===${q(trigger)}`),true,'closing the modal returns focus to the status icon');
    const initialMode=await evaluate(`document.documentElement.dataset.studioTheme`);
    await click(named(themeControl + ' button',initialMode === 'light' ? 'Dark' : 'Light'));
    assert.equal(await evaluate(`!!${q(`${buttonLink} .nav-contrast-warning`)}`),await evaluate(`${q(trigger)}.hasAttribute('data-failing')`),'sidebar warning follows the active theme');
    await click(named(themeControl + ' button',initialMode === 'light' ? 'Light' : 'Dark'));
    const data=await stored();
    await click(q('[aria-label="Export tokens"]'));
    await click(named('[aria-label="Export format"] button','JSON'));
    assert.deepEqual(JSON.parse(await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`)),data);
    await click(named('[aria-label="Export format"] button','CSS'));
    const css=await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`);
    assert.ok(css.includes('[data-ds-theme="light"]') && css.includes('[data-ds-theme="dark"]'));
    assert.ok(css.includes(`--button-foreground: ${fillColor};`));
    await click(q('[aria-label="Close export dialog"]'));
    await wait(`!${q('.export-dialog')}`);
  });
  await check('contrast pair actions open the correct component and highlight editable sources',async()=>{
    await navigate('design','colors');
    const globalBackground = await evaluate(`${q('#token-background')}.value`);
    await navigate('design','checkbox');
    const usage = `${q('#token-border')}.closest('.token-control').querySelector('.token-usage-trigger')`;
    assert.equal(await evaluate(`${usage}.getAttribute('aria-expanded')`),'false','usage guidance starts compact');
    await click(usage);
    assert.ok(await evaluate(`${usage}.getAttribute('aria-expanded')==='true' && ${q('#token-border')}.closest('.token-control').textContent.includes('Checked box only')`),'token usage guidance remains available');
    const slider = `${q('#token-radius')}.closest('.token-control').querySelector('.token-slider-trigger')`;
    assert.equal(await evaluate(`${slider}.getAttribute('aria-expanded')`),'false');
    await click(slider);
    assert.ok(await evaluate(`!!${q('#token-radius')}.closest('.token-control').querySelector('input[type="range"]')`),'numeric slider remains available');
    await fill('#variant-color-checkbox-checked-border',globalBackground);
    await navigate('design','colors');
    await click(q('.editor-title-actions button[aria-label*="System color pairs"]'));
    await wait(`!!${q('[data-contrast-check="checkbox.checked.boundary"]')}`);
    assert.ok(await evaluate(`!!${q('[data-contrast-check="checkbox.checked.boundary"][data-failing]')}`));
    await click(q('[data-contrast-check="checkbox.checked.boundary"] button'));
    await wait(`location.pathname==='/checkbox' && document.activeElement?.id==='variant-color-checkbox-checked-border' && !!${q('#variant-color-checkbox-checked-border')}.closest('[data-highlighted]')`);
    assert.ok(await evaluate(`!!${q('[data-specimen="checkbox"][data-selected]')}`));
    await click(q('.editor-title-actions button[aria-label*="Checkbox color pairs"]'));
    await click(named('[data-contrast-check="checkbox.checked.boundary"] button','Edit global background'));
    await wait(`location.pathname==='/colors' && document.activeElement?.id==='token-background' && !!${q('#token-background')}.closest('[data-highlighted]')`);
    await reload();
  });
  await check('contrast actions distinguish legacy shared layers from exact recipe text scopes',async()=>{
    await navigate('design','card');
    const before = await stored();
    await stylesInspector();
    await select('[aria-label="Shared default layer"]','title');
    const shared = '[id="system-shared-card-title-color"]';
    await fill(shared,'#123456'); await key('Enter');
    await wait(`JSON.parse(localStorage.getItem('bambiui.design-system.v1')).themes[document.documentElement.dataset.studioTheme].componentStyles?.card?.title?.color==='#123456'`);
    await select('[aria-label="Shared default layer"]','description');
    await setComponentMode('card','playground');
    await click(q(`${playgroundControls('card')} [aria-label="Playground Title"]`));
    await navigate('design','colors');
    await click(q('.editor-title-actions button[aria-label*="System color pairs"]'));
    await click(named('[data-contrast-check="card.outlined.title.text"] button','Edit Card shared title color'));
    await wait(`location.pathname==='/card' && document.activeElement?.id==='system-shared-card-title-color'`);
    assert.equal(await evaluate(`${q('[aria-label="Shared default layer"]')}.value`),'title','audit navigation must restore the addressed legacy sharedPart');
    assert.equal(await evaluate(`${q('[data-system-shared-defaults]')}.open && ${q(shared)}.checkVisibility()`),true);
    assert.equal(await evaluate(`!!${q('[data-system-recipe-controls]')}`),false,'a shared part must not masquerade as a recipe');
    await select('[aria-label="Shared default layer"]','description');
    assert.equal(await evaluate(`!!${q(shared)}`),false,'manually choosing another shared layer unmounts the title field');
    await click(q('.editor-title-actions button[aria-label*="Card color pairs"]'));
    await click(named('[data-contrast-check="card.outlined.title.text"] button','Edit Card shared title color'));
    await wait(`document.activeElement?.id==='system-shared-card-title-color' && ${q('[aria-label="Shared default layer"]')}.value==='title'`);
    assert.equal(await evaluate(`${q('[data-system-shared-defaults]')}.open && ${q(shared)}.checkVisibility()`),true,'repeat audit navigation restores the actual shared part without remounting the component route');
    assert.equal(await evaluate(`${q(shared)}.value`),'#123456');
    assert.equal(await evaluate(`!!${q('[data-system-recipe-controls]')}`),false);
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
    await click(q(recipePart('card','outlined.md','title')));
    await commitRecipe('card','outlined.md','title','text','color','#234567');
    await click(q(`${example('card','filled.sm')} > button`));
    await navigate('design','colors');
    await click(q('.editor-title-actions button[aria-label*="System color pairs"]'));
    await click(named('[data-contrast-check="card.recipe.outlined.md.title/text"] button','Edit Card / outlined md / title text color'));
    await wait(`location.pathname==='/card' && document.activeElement?.id==='system-recipe-card-outlined.md-title-text-color'`);
    await assertRecipeSelection('card','outlined.md','title','text');
    assert.equal(await evaluate(`${q(recipeField('card','outlined.md','title','text','color'))}.checkVisibility()`),true);
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
  });
  await check('component state colors, border widths and shadows stay aligned with CSS, export and history',async()=>{
    await navigate('design','input');
    const mode=await evaluate(`document.documentElement.dataset.studioTheme`);
    const other=mode==='light'?'dark':'light';
    const before=await stored();
    await select('#component-variant-style','invalid');
    await fill('#variant-color-input-invalid-border','#010101');
    await fill('#variant-style-input-invalid-borderWidth','2.5');
    await select('#variant-style-input-invalid-shadow','lg');
    await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--input-variant-invalid-border-width').trim()==='2.5px'`);
    const customized=await stored();
    assert.equal(customized.themes[mode].variantColors.input.invalid.border,'#010101');
    assert.equal(customized.themes[other].variantColors.input.invalid.border,undefined,'variant colors remain theme-specific');
    for(const theme of ['light','dark']) {
      assert.equal(customized.themes[theme].variantColors.input.invalid.borderWidth,2.5);
      assert.equal(customized.themes[theme].variantColors.input.invalid.shadow,'lg');
    }
    assert.equal(await evaluate(`getComputedStyle(${q(`${example('input','invalid.md')} input`)}).getPropertyValue('--input-state-border-width').trim()`),'2.5px','invalid Input CSS consumes the fractional state border width');
    await click(q('[aria-label="Export tokens"]'));
    await click(named('[aria-label="Export format"] button','JSON'));
    const exported=JSON.parse(await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`));
    assert.deepEqual(exported,customized);
    await click(q('[aria-label="Close export dialog"]'));
    await click(q('[aria-label="Undo change"]'));
    await click(q('[aria-label="Undo change"]'));
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
    await click(q('[aria-label="Redo change"]'));
    await click(q('[aria-label="Redo change"]'));
    await click(q('[aria-label="Redo change"]'));
    assert.deepEqual(await stored(),customized);
  });
  await check('selected demo survives theme/view changes; component navigation replaces the board but preserves shell/history',async()=>{
    await navigate('design','input');
    await click(named(themeControl + ' button','Light'));
    await openInteractions('input');
    const email=`${interactions('input')} input[type="email"]`;
    await fill(email,'retained@example.com');
    const before=await stored();
    await evaluate(`window.__board=${q('[data-specimen="input"]')};window.__pane=${q('.theme-pane')};window.__layout=${q('.studio-sidebar')};window.__origin=performance.timeOrigin`);
    const retainedShell = async () => {
      assert.equal(await evaluate(`window.__origin===performance.timeOrigin && window.__layout===${q('.studio-sidebar')} && window.__pane===${q('.theme-pane')}`),true);
      assert.equal(await evaluate(`document.querySelectorAll('.theme-pane').length`),1);
      assert.equal(await evaluate(`${q('.theme-pane [data-ds-theme]')}.dataset.dsTheme`),'dark');
      assert.deepEqual(await stored(),before);
    };
    const retainedInput = async () => {
      await retainedShell();
      assert.equal(await evaluate(`window.__board===${q('[data-specimen="input"]')} && window.__board.isConnected`),true);
      assert.equal(await evaluate(`${q(email)}.value`),'retained@example.com');
      assert.equal(await evaluate(`${q(interactions('input'))}.open`),true);
    };
    await click(named(themeControl + ' button','Dark'));
    await retainedInput();
    await navigate('develop','input'); await retainedInput();
    await navigate('design','input'); await retainedInput();
    await navigate('design','button');
    assert.equal(await evaluate('window.__board.isConnected'),false,'unselected components must unmount rather than keep every specimen alive');
    for(const [direction,view,id] of [['back','design','input'],['back','develop','input'],['forward','design','input'],['forward','design','button']]) {
      await evaluate(`history.${direction}()`);
      await route(view,id); await retainedShell();
    }
    await navigate('design','colors'); await retainedShell();
    await navigate('design','button');
  });
  await check('matrix scroll keeps filters sticky, samples full size and selection local without camera resets',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:650,deviceScaleFactor:1,mobile:false});
    try {
      await navigate('design','button');
      const scrollState = () => evaluate(`(()=>{const s=${q(matrixScroll)};return {matrix:[s.scrollLeft,s.scrollTop],playground:[${q('[data-playground-scroll]')}.scrollLeft,${q('[data-playground-scroll]')}.scrollTop],ancestors:[...function*(e){for(let p=e.parentElement;p;p=p.parentElement)yield [p.scrollLeft,p.scrollTop]}(s)],window:[scrollX,scrollY]}})()`);
      const outerState = async () => { const state=await scrollState();return {playground:state.playground,ancestors:state.ancestors,window:state.window}; };
      await evaluate(`${q(matrixScroll)}.scrollTop=0`);
      assert.ok(await evaluate(`(()=>{const s=${q(matrixScroll)},t=${q('[data-matrix-toolbar]')},h=${q(`${matrix('button')} h2`)};return s.scrollHeight>s.clientHeight && /^(auto|scroll)$/.test(getComputedStyle(s).overflowY) && s.contains(t) && getComputedStyle(t).position==='sticky' && !t.contains(h) && t.contains(${q('[aria-label="Filter variant"]')}) && t.contains(${q('[aria-label="Filter size"]')}) && /No layer selected|Selected:/.test(t.textContent)})()`),'filters and selection context share a sticky wrapper, not the heading');
      const headingTop = await evaluate(`${q(`${matrix('button')} > header`)}.getBoundingClientRect().top`);
      const toolsTop = await evaluate(`${q(workbenchToolbar)}.getBoundingClientRect().top`);
      const outer = await outerState();
      const point = await evaluate(`(()=>{const r=${q(matrixScroll)}.getBoundingClientRect();return {x:r.right-18,y:r.bottom-28}})()`);
      await wheel(point,0,260);
      await wait(`${q(matrixScroll)}.scrollTop>100`);
      assert.ok(await evaluate(`(()=>{const s=${q(matrixScroll)}.getBoundingClientRect(),t=${q('[data-matrix-toolbar]')}.getBoundingClientRect();return Math.abs(t.top-s.top)<=3 && t.bottom<s.bottom})()`),'toolbar pins to the matrix viewport');
      assert.ok(await evaluate(`${q(`${matrix('button')} > header`)}.getBoundingClientRect().top<${headingTop}-100`),'intro scrolls away rather than sticking');
      assert.equal(await evaluate(`${q(workbenchToolbar)}.getBoundingClientRect().top`),toolsTop);
      assert.deepEqual(await outerState(),outer,'matrix wheel cannot scroll Playground or shell ancestors');
      assert.ok(await evaluate(`(()=>{const s=${q(matrixScroll)};return [...s.querySelectorAll('[data-recipe-body] [data-component-part="root"]')].every(e=>{for(let p=e;p&&p!==s;p=p.parentElement)if(getComputedStyle(p).transform!=='none' || !['1','normal'].includes(getComputedStyle(p).zoom))return false;const r=e.getBoundingClientRect();return Math.abs(r.width-e.offsetWidth)<=1 && Math.abs(r.height-e.offsetHeight)<=1})})()`),'samples render at authored dimensions without scaled rows or ancestors');
      await select('[aria-label="Filter size"]','sm');
      await wait(`document.querySelectorAll('[data-recipe-example]').length===6`);
      assert.ok(await evaluate(`[...document.querySelectorAll('[data-recipe-example]')].every(e=>e.dataset.recipeExample.endsWith('.sm'))`));
      await click(named('[data-matrix-toolbar] button','Clear filters'));
      await wait(`document.querySelectorAll('[data-recipe-example]').length===18`);
      await evaluate(`${q(matrixScroll)}.scrollTop=0`);
      const target = example('button','link.lg');
      assert.ok(await evaluate(`${q(target)}.getBoundingClientRect().top>${q(matrixScroll)}.getBoundingClientRect().bottom`),'selection probe starts outside the matrix viewport');
      const beforeSelect = await outerState();
      // Keyboard activation deliberately bypasses click()/positionCanvas(): the application must reveal it.
      await evaluate(`${q(`${target} > button`)}.focus({preventScroll:true})`);
      await key('Enter');
      await wait(`(()=>{const r=${q(target)}.getBoundingClientRect(),s=${q(matrixScroll)}.getBoundingClientRect(),t=${q('[data-matrix-toolbar]')}.getBoundingClientRect();return r.top>=t.bottom-1 && r.bottom<=s.bottom+1})()`);
      assert.deepEqual(await outerState(),beforeSelect,'selection reveals only its example in the matrix container');
      await evaluate(`(()=>{const s=${q(matrixScroll)},r=${q(target)}.getBoundingClientRect(),v=s.getBoundingClientRect(),t=${q('[data-matrix-toolbar]')}.getBoundingClientRect();s.scrollTop+=r.top-t.bottom-(v.bottom-t.bottom-r.height)/3})()`);
      const beforeRepeat = await scrollState();
      await evaluate(`${q(`${target} > button`)}.focus({preventScroll:true})`);
      await key('Enter');
      await delay(100);
      assert.deepEqual(await scrollState(),beforeRepeat,'selecting an already visible example does not center it again');
      const beforePart = await scrollState();
      await click(q('[data-system-recipe-controls] [aria-label="Select Label text"]'));
      await assertRecipeSelection('button','link.lg','text','text');
      await delay(100);
      assert.deepEqual(await scrollState(),beforePart,'part selection does not reframe an already visible example');
      await evaluate(`${q(matrixScroll)}.scrollTop=0`);
      assert.ok(await evaluate(`${q(target)}.getBoundingClientRect().top>${q(matrixScroll)}.getBoundingClientRect().bottom`));
      const offscreen = await scrollState();
      await click(q('[data-system-recipe-controls] [aria-label="Select Button frame"]'));
      await delay(100);
      assert.deepEqual(await scrollState(),offscreen,'changing part must not reveal an offscreen selected recipe');
      await click(q('[data-system-recipe-controls] [aria-label="Select Label text"]'));
      const mode = await evaluate('document.documentElement.dataset.studioTheme');
      await click(named(themeControl+' button',mode==='light'?'Dark':'Light'));
      await delay(100);
      assert.deepEqual(await scrollState(),offscreen,'theme changes retain matrix scroll even when the selected recipe is offscreen');
      await click(named(themeControl+' button',mode==='light'?'Light':'Dark'));
      const beforeToken = await scrollState();
      await commitRecipe('button','link.lg','text','text','color','#345678');
      await delay(100);
      assert.deepEqual(await scrollState(),beforeToken,'token changes retain matrix scroll');
      await click(q('[aria-label="Undo change"]'));
      assert.deepEqual(await scrollState(),beforeToken,'undo retains matrix scroll');
      assert.equal(await evaluate(`(()=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-80});${q(matrixScroll)}.dispatchEvent(e);return e.defaultPrevented})()`),false,'matrix must not intercept browser zoom');
    } finally {
      await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    }
  });
  await check('foundation route selection animates camera unless reduced motion is requested',async()=>{
    try {
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      await navigate('design','colors');
      const start=await stableCamera();
      await navigate('design','spacing');
      const first=await evaluate(cameraState);
      const end=await stableCamera();
      assert.ok(moved(start,end)>80,'foundation navigation should frame the selected unit');
      assert.ok(moved(first,end)>2,'camera should animate rather than jump to its final destination');
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await navigate('design','colors');
      await wait(`(()=>{const h=${q('[data-foundation="colors"] h2')}.getBoundingClientRect(),v=${q(canvas)}.getBoundingClientRect();return h.top>=v.top+60 && h.bottom<v.bottom})()`);
      const immediate=await evaluate(cameraState);
      const settled=await stableCamera();
      assert.ok(moved(immediate,settled)<2,'reduced motion should position the camera without animation');
    } finally {
      await send('Emulation.setEmulatedMedia',{features:[]});
    }
  });
  await check('foundation camera controls, unbounded drag, wheel pan and pointer-anchored zoom',async()=>{
    await navigate('design','colors');
    await click(named('[aria-label="Canvas zoom"] button','Reset zoom'));
    await wait(`${q('[aria-label="Zoom level"]')}.textContent==='100%'`);
    await click(q('[aria-label="Zoom in"]'));
    assert.equal(await evaluate(`${q('[aria-label="Zoom level"]')}.textContent`),'110%');
    assert.ok(Math.abs((await evaluate(cameraState)).scale-1.1)<0.02);
    assert.ok(await evaluate(`(()=>{const v=${q(canvas)},s=getComputedStyle(v);return Math.abs(parseFloat(v.style.getPropertyValue('--canvas-dot-radius'))-1.1)<0.01 && Math.abs(parseFloat(s.backgroundSize)-17.6)<0.01 && s.backgroundImage.includes('1.1px')})()`),'grid dot radius and spacing should follow camera zoom');
    await click(q('[aria-label="Zoom out"]'));
    assert.equal(await evaluate(`${q('[aria-label="Zoom level"]')}.textContent`),'100%');
    await navigate('design','spacing');
    await wait(`(()=>{const a=${q(canvas)}.getBoundingClientRect(),b=${q('[data-foundation="spacing"]')}.getBoundingClientRect();return b.bottom>a.top && b.top<a.bottom && b.right>a.left && b.left<a.right})()`);
    await click(named('[aria-label="Canvas zoom"] button','Fit'));
    assert.ok(await evaluate(`parseInt(${q('[aria-label="Zoom level"]')}.textContent)<100`));
    assert.ok(await evaluate(`(()=>{const v=${q(canvas)},s=getComputedStyle(v),z=Number(v.dataset.cameraZoom);return Math.abs(parseFloat(v.style.getPropertyValue('--canvas-dot-radius'))-z)<0.01 && Math.abs(parseFloat(s.backgroundSize)-16*z)<0.01})()`),'fitting should shrink dots and grid spacing together');
    await click(named('[aria-label="Canvas zoom"] button','Reset zoom'));
    const reset=await stableCamera();
    assert.ok(Math.abs(reset.scale-1)<0.02);
    await evaluate(`${q(canvas)}.focus({preventScroll:true})`);
    await key('ArrowDown');
    await wait(`${cameraState}.y < ${reset.y}-10`);
    const arrow=await evaluate(cameraState);
    await key('ArrowRight');
    await wait(`${cameraState}.x < ${arrow.x}-10`);
    // Fit the foundations to expose real blank drag space.
    await click(named('[aria-label="Canvas zoom"] button','Fit'));
    await stableCamera();
    const point=await canvasBackground();
    const before=await evaluate(cameraState);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    assert.ok(!await evaluate(`${q(canvas)}.hasAttribute('data-dragging')`),'press alone must leave sections clickable');
    // Cross the drag threshold inside the viewport before travelling beyond its edge.
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+6,y:point.y+6,button:'left',buttons:1});
    await wait(`${q(canvas)}.dataset.dragging==='true'`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+130,y:point.y+110,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+130,y:point.y+110,button:'left',clickCount:1});
    const dragged=await evaluate(cameraState);
    assert.ok(dragged.x>before.x+100 && dragged.y>before.y+80,'pointer drag must pan in both directions');
    assert.ok(!await evaluate(`${q(canvas)}.hasAttribute('data-dragging')`));
    const middlePoint=await canvasBackground();
    const middleStart=await evaluate(cameraState);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...middlePoint,button:'middle',buttons:4,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:middlePoint.x+40,y:middlePoint.y+35,button:'middle',buttons:4});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:middlePoint.x+40,y:middlePoint.y+35,button:'middle',buttons:0,clickCount:1});
    const middleEnd=await evaluate(cameraState);
    assert.ok(middleEnd.x>middleStart.x+20 && middleEnd.y>middleStart.y+15,'foundations retain middle-button camera panning');
    assert.equal(await evaluate(`${q(canvas)}.hasAttribute('data-dragging')`),false);
    // A finite scroll extent would clamp here. Drag much farther than the old 2400px padding.
    for(let i=0;i<8;i++) {
      const p=await canvasBackground();
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+12,y:p.y+12,button:'left',buttons:1});
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+650,y:p.y+550,button:'left',buttons:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+650,y:p.y+550,button:'left',clickCount:1});
    }
    const far=await evaluate(cameraState);
    assert.ok(far.x>dragged.x+4000 && far.y>dragged.y+3500,'camera should not clamp to a scroll extent');
    assert.equal(far.scrollLeft,0);
    assert.equal(far.scrollTop,0);
    const wheelPoint=await canvasBackground();
    await wheel(wheelPoint,0,95);
    await wait(`${cameraState}.y < ${far.y}-50`);
    const vertical=await evaluate(cameraState);
    await wheel(wheelPoint,0,90,8);
    await wait(`${cameraState}.x < ${vertical.x}-50`);
    const horizontal=await evaluate(cameraState);
    assert.ok(Math.abs(horizontal.scale-vertical.scale)<0.001,'Shift+wheel should pan, not zoom');
    for(const modifier of [2,4]) {
      const anchor=await canvasBackground();
      const old=await evaluate(`(()=>{const r=${q(camera)}.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(${q(camera)}).transform);return {scale:m.a,worldX:( ${anchor.x}-r.left)/m.a,worldY:(${anchor.y}-r.top)/m.a}})()`);
      await wheel(anchor,0,-90,modifier);
      await wait(`${cameraState}.scale > ${old.scale}+0.01`);
      const next=await evaluate(`(()=>{const r=${q(camera)}.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(${q(camera)}).transform);return {scale:m.a,x:r.left+${old.worldX}*m.a,y:r.top+${old.worldY}*m.a}})()`);
      assert.ok(Math.abs(next.x-anchor.x)<4 && Math.abs(next.y-anchor.y)<4,'modified wheel zoom must preserve pointer anchor');
    }
    const pinchPoint=await canvasBackground();
    const pinchStart=await evaluate(`(()=>{const r=${q(camera)}.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(${q(camera)}).transform);return {scale:m.a,worldX:(${pinchPoint.x}-r.left)/m.a,worldY:(${pinchPoint.y}-r.top)/m.a}})()`);
    assert.ok(pinchStart.scale<2.5,'pinch burst should start below the zoom limit');
    for(let i=0;i<24;i++) await wheel(pinchPoint,0,-1,2);
    await wait(`${cameraState}.scale > ${pinchStart.scale}*1.08`);
    const pinchEnd=await evaluate(`(()=>{const r=${q(camera)}.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(${q(camera)}).transform);return {scale:m.a,x:r.left+${pinchStart.worldX}*m.a,y:r.top+${pinchStart.worldY}*m.a}})()`);
    assert.ok(Math.abs(pinchEnd.x-pinchPoint.x)<4 && Math.abs(pinchEnd.y-pinchPoint.y)<4,'small wheel deltas must preserve pointer anchor');
    await wait(`parseInt(${q('[aria-label="Zoom level"]')}.textContent) === Math.round(Number(${q(canvas)}.dataset.cameraZoom)*100)`);
    assert.equal(await evaluate(`parseInt(${q('[aria-label="Zoom level"]')}.textContent)`),Math.round(pinchEnd.scale*100));
    assert.equal(await evaluate(`(()=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-80});${q(canvas)}.dispatchEvent(e);return e.defaultPrevented})()`),true,'desktop Ctrl+wheel over canvas should be consumed for canvas zoom');
    assert.equal(await evaluate(`(()=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-80});${q('.studio-sidebar')}.dispatchEvent(e);return e.defaultPrevented})()`),false,'modified wheel outside canvas must remain available to browser zoom');
    assert.equal(await evaluate(`${q(canvas)}.scrollLeft===0 && ${q(canvas)}.scrollTop===0`),true);
    await navigate('design','button');
    await openInteractions('button');
    const action=named(`${interactions('button')} button`,'Get started');
    await positionCanvas(action);
    await evaluate(`(${action}).focus({preventScroll:true})`);
    assert.equal(await evaluate(`document.activeElement===(${action})`),true);
    await key('Enter');
    await wait(`${q(interactions('button'))}.textContent.includes('successfully (1)')`);
    await navigate('design','input');
    await openInteractions('input');
    const email=`${interactions('input')} input[type="email"]`;
    await fill(email,'camera-input@example.com');
    assert.equal(await evaluate(`${q(email)}.value`),'camera-input@example.com');
    assert.equal(await evaluate(`!!${q('[data-canvas], [data-dragging]')}`),false,'input activation must not mount or start a camera drag');
    await fill(email,'');
    await capture('studio-canvas');
  });
  await check('foundation hover/empty-area selection and precise matrix-layer hover remain discoverable',async()=>{
    await navigate('design');
    await delay(500);
    await click(named('[aria-label="Canvas zoom"] button','Fit'));
    await delay(500);
    const foundation = '[data-foundation="colors"]';
    const foundationPoint = await evaluate(`(()=>{const r=${q(foundation)}.getBoundingClientRect();return {x:r.right-12,y:r.top+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...foundationPoint,button:'none'});
    assert.ok(await evaluate(`${q(foundation)}.matches(':hover')`),JSON.stringify(await evaluate(`(()=>{const r=${q(foundation)}.getBoundingClientRect(),v=${q(canvas)}.getBoundingClientRect();return {r:{x:r.x,y:r.y,width:r.width,height:r.height},v:{x:v.x,y:v.y,width:v.width,height:v.height},hit:document.elementFromPoint(${foundationPoint.x},${foundationPoint.y})?.outerHTML.slice(0,180)}})()`)));
    assert.equal(await evaluate(`getComputedStyle(${q(foundation)}).outlineStyle`),'solid');
    assert.ok(await evaluate(`parseFloat(getComputedStyle(${q(foundation)}).outlineWidth) >= 2`),'section outline must remain visible at Fit zoom');
    await wait(`${q('[data-canvas-selection-hint]')}?.textContent.includes('Colors · Click to edit tokens') && ${q('[data-canvas-selection-hint]')}.dataset.visible === 'true'`);
    assert.equal(await evaluate(`getComputedStyle(${q('[data-canvas-selection-hint]')}).transitionDuration`),'0.12s, 0.12s, 0.12s');
    await delay(200);
    assert.equal(await evaluate(`getComputedStyle(${q('[data-canvas-selection-hint]')}).opacity`),'1');
    assert.equal(await evaluate(`getComputedStyle(${q(foundation)},'::after').opacity`),'1');
    await capture('studio-foundation-hover');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...foundationPoint,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...foundationPoint,button:'left',clickCount:1});
    await route('design','colors');
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:foundationPoint.x-100,y:foundationPoint.y,button:'none'});
    await evaluate(`${q(foundation+' h2 a')}.focus({preventScroll:true})`);
    await wait(`${q('[data-canvas-selection-hint]')}?.textContent.includes('Colors · Click to edit tokens')`);
    assert.equal(await evaluate(`getComputedStyle(${q(foundation)}).outlineStyle`),'solid','keyboard focus should reveal the same section');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await evaluate(`getComputedStyle(${q('[data-canvas-selection-hint]')}).transitionDuration`),'0s');
    await send('Emulation.setEmulatedMedia',{features:[]});
    await navigate('design','button');
    const specimen = recipePart('button','primary.md','text');
    await positionCanvas(q(specimen));
    const specimenPoint = await evaluate(`(()=>{const r=${q(specimen)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...specimenPoint,button:'none'});
    assert.equal(await evaluate(`getComputedStyle(${q(specimen)}).outlineStyle`),'solid');
    assert.equal(await evaluate(`!!${q('[data-canvas-selection-hint]')}`),false,'matrix hover needs no camera hint');
    const context = await evaluate(`${q('[data-matrix-toolbar]')}.textContent`);
    await delay(200);
    await send('Performance.enable');
    const taskTime = async () => (await send('Performance.getMetrics')).metrics.find(metric => metric.name === 'TaskDuration').value;
    const beforeTasks = await taskTime();
    for (let offset = 0; offset < 80; offset++) await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:specimenPoint.x-offset/5,y:specimenPoint.y,button:'none'});
    const hoverTaskMs = Math.round((await taskTime() - beforeTasks) * 1000);
    console.log(`HOVER PROFILE: 80 same-section pointer moves, ${hoverTaskMs}ms main-thread task time`);
    assert.equal(await evaluate(`${q('[data-matrix-toolbar]')}.textContent`),context,'moving within one example must not churn selection context');
    await capture('studio-component-hover');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...specimenPoint,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...specimenPoint,button:'left',clickCount:1});
    await route('design','button');
    await assertRecipeSelection('button','primary.md','text','text');
  });
  await check('Design canvas units route to their own inspectors and Develop references',async()=>{
    await navigate('design');
    assert.equal(await evaluate(`!!${q('.breadcrumbs')}`),false);
    assert.equal(await evaluate(`${q('main h1')}.textContent.trim()`),'Colors');
    await click(named('[aria-label="Canvas zoom"] button','Reset zoom'));
    await wait(`${q('[aria-label="Zoom level"]')}.textContent==='100%'`);
    await click(named('[aria-label="Canvas zoom"] button','Fit'));
    await delay(500);
    await click(q('[data-foundation="colors"] a[aria-label^="Edit success 500"]'));
    await route('design','colors');
    assert.ok(await evaluate(`getComputedStyle(${q('[data-foundation="colors"] h2 a')}).backgroundColor!=='rgba(0, 0, 0, 0)'`));
    assert.equal(await evaluate(`${q('#color-scale-role')}.value`),'success');
    assert.ok(await evaluate(`!!${q('#scale-success-500')} && !!${q('#token-background')} && !${q('#token-radius')}`));
    await wait(`document.activeElement?.id === 'scale-success-500'`);
    await click(q('[data-foundation="spacing"] a[class*="spacingSample"]'));
    await route('design','spacing');
    assert.ok(await evaluate(`getComputedStyle(${q('[data-foundation="spacing"] h2 a')}).backgroundColor!=='rgba(0, 0, 0, 0)'`));
    assert.ok(await evaluate(`!!${q('#token-radiusSm')} && !${q('#token-background')} && !${q('#scale-primary-500')}`));
    await wait(`document.activeElement?.id === 'token-radiusSm'`);
    await delay(450);
    await capture('studio-spacing');
    await navigate('design','text');
    await delay(450);
    assert.ok(await evaluate(`(()=>{const h=${q(`${matrix('text')} h2`)},t=${q('[data-matrix-toolbar]')},tools=${q(workbenchToolbar)}.getBoundingClientRect();return !t.contains(h) && h.getBoundingClientRect().top>=tools.bottom})()`),'matrix heading is outside the sticky filters and below the common toolbar');
    await click(q(`${example('text','heading.neutral.md')} > button`));
    await assertRecipeSelection('text','heading.neutral.md','root','text');
    await route('design','text');
    await click(named(viewNav + ' a','Develop'));
    await route('develop','text');
    await click(named(viewNav + ' a','Design'));
    await route('design','text');
    assert.ok(await evaluate(`!!${q('[data-typography-link] a[href="/typography"]')}`),'Text links to the shared Typography foundation');
    await navigate('design','card');
    await click(q(`${example('card','outlined.md')} > button`));
    await assertRecipeSelection('card','outlined.md','root','frame');
    await navigate('design','input');
    await click(q(`${example('input','default.md')} input`));
    await assertRecipeSelection('input','default.md','control','text');
    await route('design','input');
    await evaluate(`history.back()`);
    await route('design','card');
    await navigate('design','button');
  });
  await check('Develop separates docs from canvas and inspector; copy and theme token references',async()=>{
    await navigate('develop','button');
    assert.equal(await evaluate(`${q('.preview-canvas')}.getClientRects().length`),0);
    assert.equal(await evaluate(`${q('#token-editor')}.getClientRects().length`),0);
    assert.equal(await evaluate(`${q('.workspace-panel--develop [data-specimen]')}`),null);
    const source=await evaluate(`${q('.workspace-panel--develop [data-react-usage] pre code')}.textContent`);
    assert.ok(source.includes('Button'));
    await send('Browser.grantPermissions',{origin:await evaluate('location.origin'),permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
    await click(named('.workspace-panel--develop button','Copy React code'));
    await wait(`navigator.clipboard.readText().then(text=>text===${JSON.stringify(source)})`);
    for(const mode of ['light','dark']) {
      await click(named(themeControl + ' button',mode==='light'?'Light':'Dark'));
      assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes('${mode} theme')`));
      const data=await stored();
      assert.ok(await evaluate(`${q('.workspace-panel--develop table')}.textContent.length>0`));
      assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes(${JSON.stringify(data.themes[mode].components.button.background || data.themes[mode].global.primary)})`));
    }
    await capture('studio-develop-button');
    for(const id of foundations) {
      await navigate('develop',id);
      assert.equal(await evaluate(`${q('.preview-canvas')}.getClientRects().length`),0);
      assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes(${JSON.stringify(id === 'colors' ? '--ds-primary-500' : id === 'typography' ? '--ds-typography-h1-font-size' : '--ds-radius')})`));
      assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes(${JSON.stringify(id === 'colors' ? (await stored()).themes.dark.global.primary : id === 'typography' ? '--ds-font-family' : `${(await stored()).themes.dark.global.radius}px`)})`));
      const firstCopy=await evaluate(`${q('.workspace-panel--develop button[aria-label^="Copy --ds-"]')}.getAttribute('aria-label').slice(5)`);
      await click(q('.workspace-panel--develop button[aria-label^="Copy --ds-"]'));
      await wait(`navigator.clipboard.readText().then(text=>text===${JSON.stringify(firstCopy)})`);
      await capture(`studio-develop-${id}`);
    }
    for(const [id,variable] of [
      ['button','--button-variant-secondary-hover-background'],
      ['input','--input-variant-invalid-border'],
      ['switch','--switch-variant-invalid-checked-border'],
      ['checkbox','--checkbox-variant-invalid-unchecked-border-width'],
      ['badge','--badge-variant-solid-success-background'],
      ['card','--card-variant-elevated-shadow'],
    ]) {
      await navigate('develop',id);
      const content=await evaluate(`${q('.workspace-panel--develop')}.textContent`);
      assert.ok(content.includes(variable),`${id} Develop reference includes CSS-consumed variant style`);
      assert.ok(content.includes('Shared default') || content.includes('Shared component override'),`${id} Develop reference labels shared effects`);
    }
    await navigate('design','button');
  });
  await check('narrow desktop tools do not overlap or overflow',async()=>{
    await navigate('design','colors');
    for (const width of [1100,980,820]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await delay(100);
      assert.ok(await evaluate(`(()=>{const help=${q('[class*="canvasHelp"]')}.getBoundingClientRect(),zoom=${q('[aria-label="Canvas zoom"]')}.getBoundingClientRect();return help.right<=zoom.left || help.left>=zoom.right || help.bottom<=zoom.top || help.top>=zoom.bottom})()`),`canvas tools overlap at ${width}px`);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`overflow at ${width}px`);
    }
    await navigate('design','button');
    for (const width of [1100,980,820]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await delay(100);
      assert.ok(await evaluate(`(()=>{const a=${q('.canvas-history')}.getBoundingClientRect(),b=${q('.canvas-theme')}.getBoundingClientRect();return a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top})()`),`matrix tools overlap at ${width}px`);
      assert.equal(await evaluate(`!!${q('[aria-label="Canvas zoom"], [class*="canvasHelp"]')}`),false);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`matrix overflow at ${width}px`);
    }
  });
  await check('700px Library and Styles overlays are reachable without obsolete header panel controls',async()=>{
    await navigate('design','button');
    await send('Emulation.setDeviceMetricsOverride',{width:700,height:900,deviceScaleFactor:1,mobile:false});
    await delay(100); await hideMobilePanels();
    const main=await evaluate(`(()=>{const r=${q('.studio-main')}.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
    assert.deepEqual(main,{x:0,y:48,width:700,height:852});
    assert.equal(await evaluate(`${q('.studio-header')}.getBoundingClientRect().height`),48);
    await panel('workspace-sidebar',true);
    assert.equal(await evaluate(`${q('#workspace-inspector')}.hidden`),true);
    assert.equal(await evaluate(`${q('#workspace-sidebar')}.getBoundingClientRect().width`),224);
    await panel('workspace-inspector',true);
    assert.equal(await evaluate(`${q('#workspace-sidebar')}.hidden`),true);
    assert.equal(await evaluate(`${q('#workspace-inspector')}.getBoundingClientRect().width`),320);
    assert.ok(await evaluate(`(()=>{const editor=${q('#workspace-inspector')}.getBoundingClientRect(),workspace=${q('.studio-main')}.getBoundingClientRect();return Math.abs(editor.top-document.querySelector('[data-workbench-toolbar]').getBoundingClientRect().bottom)<2 && editor.bottom===workspace.bottom && workspace.width===700})()`),'inspector overlays rather than moving the canvas');
    await evaluate(`${q('#token-editor')}.focus({preventScroll:true})`); await key('Escape');
    await wait(`${q('#workspace-inspector')}.hidden`);
    assert.equal(await evaluate(`document.activeElement===${q(`${workbenchToolbar} [aria-controls="workspace-inspector"]`)}`),true,'Escape restores the Styles toggle');
    assert.equal(await evaluate(`${q('#workspace-sidebar')}.hidden && ${q('#workspace-inspector')}.hidden`),true);
    await assertWorkbenchToolbar('design');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'));
  });
  await check('responsive shell keeps view, theme and system controls accessible',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
    await navigate('design','button');
    for(const view of ['Design','Develop']) {
      await click(named(viewNav + ' a',view)); await route(view.toLowerCase(),'button');
      const overflow=await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})');
      assert.ok(overflow.scrollWidth<=overflow.width,JSON.stringify(overflow));
      assert.ok(await evaluate(`${q(viewNav)}.getClientRects().length>0 && ${q(themeControl)}.getClientRects().length>0`));
      assert.ok(await evaluate(`${q('.studio-header .system-switcher summary')}.getClientRects().length>0`));
      if(view==='Design') assert.ok(await evaluate(`(()=>{const main=${q('.studio-main')}.getBoundingClientRect();return ['.canvas-history','.canvas-theme'].every(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return r.top>=main.top && r.bottom<=main.bottom && r.left>=main.left && r.right<=main.right})})()`),'common toolbar controls stay in the visible work area');
      assert.equal(await evaluate(`!!${q('.breadcrumbs')} || !!${q('.viewport-controls')}`),false);
      await capture(`studio-375-${view.toLowerCase()}`);
    }
  });
  for(const view of ['design','develop']) for(const id of [...foundations,...ids]) await check(`mobile System navigation and inspector ${view}/${id}`,async()=>{
    await navigate(view,id);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`mobile overflow: ${view}/${id}`);
    assert.ok(await evaluate(`${q(viewNav)}.getBoundingClientRect().right<=innerWidth && ${q(themeControl)}.getBoundingClientRect().right<=innerWidth`),`view/theme controls overflow: ${view}/${id}`);
    if(view==='design') {
      assert.ok(await evaluate(`${q(foundations.includes(id) ? `[data-canvas-unit="${id}"]` : `[data-matrix-content] [data-specimen="${id}"]`)}.getClientRects().length>0`));
      await panel('workspace-inspector',true);
      if(id==='colors' || ids.includes(id)) assert.ok(await evaluate(`(()=>{const h=${q('.editor-title')}.getBoundingClientRect(),a=${q('.editor-title-actions')}.getBoundingClientRect();return a.left>=h.left && a.right<=h.right && Math.abs(h.right-a.right-parseFloat(getComputedStyle(${q('.editor-title')}).paddingRight))<3})()`),`inspector actions fit the overlay: ${id}`);
      assert.equal(await evaluate(`!!${q('.mobile-preview-link')} && ${q('.mobile-preview-link')}.getClientRects().length>0`),false,'panel toggles replace the old stacked-layout anchor');
      if(id==='typography') { await reveal(q('#typography-tokens')); await evaluate(`${q('#typography-tokens')}.scrollIntoView({block:'start',behavior:'instant'})`); await capture('studio-375-typography'); }
      if(id==='spacing') {
        await capture('studio-375-spacing-inspector'); await hideMobilePanels();
        await evaluate(`${q('[data-foundation="spacing"]')}.scrollIntoView({block:'start',behavior:'instant'})`); await capture('studio-375-spacing');
      }
    }
    await hideMobilePanels();
  });
  await check('mobile inspector toggle, compact hex field, themes and English accessibility names',async()=>{
    // Isolate this coverage from a failed mobile header view-switch hit test.
    await openStatic('design','button'); await panel('workspace-inspector',true);
    assert.equal(await evaluate(`${q('[aria-controls="workspace-inspector"]')}.getAttribute('aria-expanded')`),'true');
    assert.ok(await evaluate(`${q('#token-editor')}.getClientRects().length>0`));
    await reveal(q('#token-background')); await capture('studio-375-inspector');
    await send('Emulation.setDeviceMetricsOverride',{width:320,height:812,deviceScaleFactor:1,mobile:false});
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'compact component inspector must fit 320px');
    assert.ok(await evaluate(`(()=>{const row=${q('.color-fields .token-input')}.getBoundingClientRect(),input=${q('.color-fields .token-input input[type="text"]')}.getBoundingClientRect();return row.right<=innerWidth && input.width>=65})()`),'compact color field must keep its hex value editable');
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
    await click(q('#token-background')); await key('Escape');
    await wait(`${q('#workspace-inspector')}.hidden`);
    assert.equal(await evaluate(`document.activeElement.getAttribute('aria-controls')`),'workspace-inspector','Escape returns focus to the panel toggle');
    for(const mode of ['light','dark']) {
      await click(named(themeControl + ' button',mode==='light'?'Light':'Dark'));
      assert.ok(await evaluate(`!!${q(`.theme-pane:not([hidden]) [data-ds-theme="${mode}"]`)}`));
      assert.equal(await evaluate(`[...document.querySelectorAll('.theme-pane')].filter(e=>e.getClientRects().length).length`),1);
    }
    await navigate('design','colors'); await click(q('[aria-label="Open color builder"]'));
    const {nodes}=await send('Accessibility.getFullAXTree');
    for(const name of ['Source brand color','Close color builder']) assert.ok(nodes.some(node=>!node.ignored && node.name?.value===name),`AX name: ${name}`);
    await click(q('[aria-label="Close color builder"]')); await hideMobilePanels();
  });
  await check('mobile work-area scrolling and touch gestures remain native',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    try {
      await openStatic('design','button');
      assert.ok(await evaluate(`!document.querySelector('meta[name="viewport"]')?.content.includes('user-scalable=no')`),'mobile viewport must permit browser zoom');
      assert.ok(await evaluate(`getComputedStyle(${q(matrixScroll)}).touchAction!=='none'`),'matrix must not disable native touch zoom/scroll');
      assert.equal(await evaluate(`(()=>{const e=new Event('touchmove',{bubbles:true,cancelable:true});${q(matrixScroll)}.dispatchEvent(e);return e.defaultPrevented})()`),false,'mobile touchmove must remain native');
      await evaluate(`void(window.__mobileScroll=${q(matrixScroll)})`);
      assert.ok(await evaluate(`window.__mobileScroll.scrollHeight>window.__mobileScroll.clientHeight && /^(auto|scroll)$/.test(getComputedStyle(window.__mobileScroll).overflowY)`),'mobile matrix needs a natively scrollable region, not clipped content');
      await evaluate('window.__mobileScroll.scrollTop=0');
      await evaluate('window.__mobileScroll.scrollTop=180'); await wait('window.__mobileScroll.scrollTop>0');
      assert.equal(await evaluate('window.scrollY'),0,'scroll stays in the work area instead of pushing the shell offscreen');
    } finally {
      await send('Emulation.setTouchEmulationEnabled',{enabled:false});
      await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
    }
  });
  await check('controlled form validates required fields and submits native FormData',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await navigate('design','input');
    const form='[data-form-demo]';
    assert.ok(await evaluate(`!!${q(form)}`));

    await openInteractions('input');
    const disclosure=`${interactions('input')} details`;
    await positionCanvas(q(`${disclosure} > summary`));
    await evaluate(`${q(`${disclosure} > summary`)}.focus({preventScroll:true})`);
    await key('Enter');
    await wait(`${q(disclosure)}.open`);
    assert.equal(await evaluate(`${q(form)}.checkValidity()`),false,'required form cannot submit while empty');
    await evaluate(`${q(form)}.requestSubmit()`);
    assert.equal(await evaluate(`${q(`${form} [data-form-result]`)}.textContent`),'','invalid submit does not invoke handler');
    const email=`${form} input[name="contact"]`;
    await evaluate(`${q(email)}.focus({preventScroll:true})`);
    await send('Input.insertText',{text:'not-an-email'});
    await wait(`${q(email)}.value === 'not-an-email'`);
    assert.equal(await evaluate(`${q(email)}.validity.typeMismatch`),true);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4});
    await send('Input.insertText',{text:'form@example.com'});
    await wait(`${q(email)}.value === 'form@example.com'`);
    assert.equal(await evaluate(`${q(form)}.checkValidity()`),false,'required checkbox still prevents submission');
    for(const role of ['switch','checkbox']) {
      const control=`${form} [role="${role}"]`;
      await evaluate(`${q(control)}.focus({preventScroll:true})`);
      await key(' ','Space');
      await wait(`${q(control)}.getAttribute('aria-checked') === 'true'`);
    }
    assert.equal(await evaluate(`${q(form)}.checkValidity()`),true);
    assert.deepEqual(await evaluate(`Object.fromEntries(new FormData(${q(form)}))`),{contact:'form@example.com',updates:'yes',terms:'accepted'});
    await evaluate(`${q(`${form} button[type="submit"]`)}.focus({preventScroll:true})`);
    await key('Enter');
    await wait(`${q(`${form} [data-form-result]`)}.textContent.includes('form@example.com')`);
    assert.equal(await evaluate('location.pathname'),'/input');
  });
  await check('Undo and redo group edits and restore both themes after a palette preset',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await navigate('design','spacing');
    assert.ok(await evaluate(`${q('#token-editor')}.textContent.includes('SHARED · BOTH THEMES')`));
    const before = await stored();
    await fill('#token-radius','18');
    await fill('#token-radius','20');
    assert.equal((await stored()).themes.dark.global.radius,20);
    await click(q('[aria-label="Undo change"]'));
    assert.equal((await stored()).themes.light.global.radius,before.themes.light.global.radius);
    assert.equal((await stored()).themes.dark.global.radius,before.themes.dark.global.radius);
    await click(q('[aria-label="Redo change"]'));
    assert.equal((await stored()).themes.light.global.radius,20);
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
    await navigate('design','colors');
    await click(q('[aria-label="Open color builder"]'));
    await click(q('[aria-label="Apply Ocean to both themes"]'));
    await click(q('[aria-label="Close color builder"]'));
    assert.equal((await stored()).themes.dark.source,'#247db3');
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
    await click(q('[aria-label="Redo change"]'));
    assert.equal((await stored()).themes.light.source,'#247db3');
    assert.equal((await stored()).themes.dark.source,'#247db3');
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
  });
  await check('header system picker renames, duplicates and isolates histories',async()=>{
    const selector='.system-rename input';
    const original=await stored();
    await click(q('.system-switcher summary'));
    await fill(selector,'Updated system');
    await click(q('.system-rename button'));
    assert.equal((await stored()).name,'Updated system');
    await click(q('[aria-label="Undo change"]'));
    assert.equal((await stored()).name,original.name);
    await click(q('[aria-label="Redo change"]'));
    assert.equal((await stored()).name,'Updated system');
    await click(q('.system-switcher summary'));
    await click(named('.system-switcher-actions button','Duplicate current system'));
    assert.equal((await stored()).name,'Updated system copy');
    assert.equal(await evaluate(`${q('[aria-label="Undo change"]')}.disabled`),true,'new system must not inherit undo history');
    await navigate('design','spacing');
    const radius=original.themes.light.global.radius === 21 ? 22 : 21;
    await fill('#token-radius',String(radius));
    await reload();
    assert.equal((await stored()).name,'Updated system copy');
    assert.equal((await stored()).themes.light.global.radius,radius);
    await click(q('.system-switcher summary'));
    assert.equal(await evaluate(`document.querySelectorAll('.system-switcher-list button').length`),2);
    await click(named('.system-switcher-list button','Updated system'));
    assert.equal((await stored()).name,'Updated system');
    assert.equal((await stored()).themes.light.global.radius,original.themes.light.global.radius,'switching systems must restore its own tokens');
    assert.equal(await evaluate(`${q('[aria-label="Undo change"]')}.disabled`),true,'switching clears edit history');
    await click(q('.system-switcher summary'));
    await fill(selector,original.name);
    await click(q('.system-rename button'));
    assert.equal((await stored()).name,original.name);
    await click(q('.system-switcher summary'));
    await click(named('.system-switcher-actions button','New design system'));
    assert.equal((await stored()).name,'Untitled system');
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('bambiui.systems.v1')).systems.length`),3);
    await click(q('.system-switcher summary'));
    await click(named('.system-switcher-list button',original.name));
    assert.deepEqual(await stored(),original);
    await reload();
    assert.deepEqual(await stored(),original);
  });
  await check('import as new preserves the active system and exports only the selected system',async()=>{
    const original=await stored();
    const count=await evaluate(`JSON.parse(localStorage.getItem('bambiui.systems.v1')).systems.length`);
    await click(q('.system-switcher summary'));
    await click(named('.system-switcher-actions button','Import as new system'));
    await evaluate(`(() => {const e=${q('.header-actions input[type="file"]')},d=new DataTransfer();d.items.add(new File([${JSON.stringify(JSON.stringify({ ...original, name: 'Imported system' }))}],'import.json',{type:'application/json'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(`${q('.system-switcher summary')}.textContent.includes('Imported system')`);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('bambiui.systems.v1')).systems.length`),count+1);
    assert.deepEqual(await stored(),{ ...original, name: 'Imported system' });
    await click(q('[aria-label="Export tokens"]'));
    await click(named('[aria-label="Export format"] button','JSON'));
    assert.deepEqual(JSON.parse(await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`)),{ ...original, name: 'Imported system' });
    await click(q('[aria-label="Close export dialog"]'));
    await click(q('.system-switcher summary'));
    await click(named('.system-switcher-list button',original.name));
    assert.deepEqual(await stored(),original);
    await click(q('.system-switcher summary'));
    await click(named('.system-switcher-list button','Imported system'));
    await click(q('.system-switcher summary'));
    await click(named('.system-switcher-actions button','Delete current system'));
    await wait(`${q('[data-system-delete-dialog]')} && !${q('[data-system-delete-confirm]')}.disabled`);
    await click(q('[data-system-delete-confirm]'));
    await wait(`!${q('[data-system-delete-dialog]')}`);
    await wait(`${q('.system-switcher summary')}.textContent.includes(${JSON.stringify(original.name)})`);
    assert.deepEqual(await stored(),original);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('bambiui.systems.v1')).systems.length`),count);
  });
  await check('legacy single-system storage migrates without losing the saved collection',async()=>{
    const backup=await evaluate(`localStorage.getItem('bambiui.systems.v1')`);
    const active=await stored();
    await evaluate(`localStorage.removeItem('bambiui.systems.v1')`);
    await reload();
    assert.deepEqual(await stored(),active);
    assert.equal(await evaluate(`${q('.system-switcher-list button')}.textContent.trim()`),active.name);
    await evaluate(`localStorage.setItem('bambiui.systems.v1',${JSON.stringify(backup)})`);
    await reload();
    assert.deepEqual(await stored(),active);
  });
  await check('JSON re-import restores both sources; old v3 files without foundations normalize',async()=>{

    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});

    const backup=await stored();

    await click(named(themeControl + ' button','Light'));

    await navigate('design','spacing');

    await fill('#token-radius','19');

    assert.notDeepEqual(await stored(),backup);
    acceptImportDialog = true;
    try {
      await click(q('.system-switcher-actions [aria-label="Import design system"]'));
      await evaluate(`(() => {const e=${q('.header-actions input[type="file"]')},d=new DataTransfer();d.items.add(new File([${JSON.stringify(JSON.stringify(backup))}],'backup.json',{type:'application/json'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);

      await wait(`${q('#token-radius')}.value === ${JSON.stringify(String(backup.themes.light.global.radius))}`);
      assert.deepEqual(await stored(),backup);
      assert.deepEqual(Object.keys(backup).sort(),['name','themes','version']);
      await click(q('[aria-label="Undo change"]'));
      assert.equal((await stored()).themes.light.global.radius,19);
      await click(q('[aria-label="Redo change"]'));
      assert.deepEqual(await stored(),backup);
      await reload();
      assert.deepEqual(await stored(),backup);
      const oldV3=structuredClone(backup);
      oldV3.themes.light.global.radius=21;
      for(const mode of ['light','dark']) {
        delete oldV3.themes[mode].colorScales;
        delete oldV3.themes[mode].typography;
        delete oldV3.themes[mode].components.text;
      }
      await click(q('.system-switcher-actions [aria-label="Import design system"]'));
      await evaluate(`(() => {const e=${q('.header-actions input[type="file"]')},d=new DataTransfer();d.items.add(new File([${JSON.stringify(JSON.stringify(oldV3))}],'old-v3.json',{type:'application/json'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await wait(`JSON.parse(localStorage.getItem('bambiui.design-system.v1'))?.themes.light.global.radius === 21`);
      const normalized=await stored();
      for(const mode of ['light','dark']) {
        assert.deepEqual(normalized.themes[mode].global,{...oldV3.themes[mode].global,radius:21});
        assert.deepEqual(normalized.themes[mode].components,{...oldV3.themes[mode].components,text:{}});
        assert.deepEqual(normalized.themes[mode].colorScales,{});
        assert.equal(normalized.themes[mode].typography.heading.fontSize,32);
        assert.deepEqual(['h1','h2','h3','h4','h5','h6'].map(variant=>normalized.themes[mode].typography[variant].fontSize),[48,40,32,28,24,20]);
      }
      await reload();
      assert.deepEqual(await stored(),normalized);
    } finally {acceptImportDialog = false;}
  });
  for(const view of ['design','develop']) for(const id of [...foundations,...ids]) {
    await check(`direct static opening ${href(view,id)}`,async()=>{
      const url=`http://127.0.0.1:${server.address().port}${href(view,id)}`;
      const response=await fetch(url);
      assert.equal(response.status,200);
      assert.ok((await response.text()).includes('<html'));
      const origin=await evaluate('performance.timeOrigin');
      await send('Page.navigate',{url});
      await wait(`performance.timeOrigin!==${origin}`);
      await route(view,id);
      const name=id[0].toUpperCase()+id.slice(1);
      assert.equal(await evaluate(`${q(`${workbenchToolbar} h1`)}.textContent`),id==='spacing'?'Shape & spacing':name);
      assert.equal(await evaluate(`document.querySelectorAll('.studio-main h1').length`),1,'the common toolbar supplies one task heading in either view');
    });
  }
  for(const [view,path] of [['design','/colors'],['develop','/develop']]) {
    await check(`default ${view} entry opens Colors at ${path}`,async()=>{
      const url=`http://127.0.0.1:${server.address().port}${path}`;
      const response=await fetch(url);
      assert.equal(response.status,200);
      assert.ok((await response.text()).includes('<html'));
      const origin=await evaluate('performance.timeOrigin');
      await send('Page.navigate',{url});
      await wait(`performance.timeOrigin!==${origin} && location.pathname===${JSON.stringify(path)}`);
      await wait(`${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
      await wait(`${q(`.workspace-panel--${view}`)} && !${q(`.workspace-panel--${view}`)}.hidden`);
      assert.equal(await evaluate(`${q('.studio-sidebar a[aria-current="page"]')}.getAttribute('href')`),href(view,'colors'));
      assert.equal(await evaluate(`${q(`${workbenchToolbar} h1`)}.textContent`),'Colors');
      assert.equal(await evaluate(`document.querySelectorAll('.studio-main h1').length`),1);
    });
  }
  await check('/ opens System Colors without Project records or a hidden authoring shell',async()=>{
    const before=await stored(), origin=await evaluate('performance.timeOrigin');
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    await wait(`performance.timeOrigin!==${origin} && ${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
    assert.equal(await evaluate('location.pathname'),'/');
    assert.equal(await evaluate(`${q('h1')}.textContent`),'Colors');
    assert.equal(await evaluate(`${q('.studio-sidebar a[aria-current="page"]')}.getAttribute('href')`),'/colors');
    assert.equal(await evaluate(`${q(viewNav + ' a[aria-current="page"]')}.textContent.trim()`),'Design');
    assert.equal(await evaluate(`document.querySelectorAll('.studio-shell').length`),1);
    assert.equal(await evaluate(`!!${q('[aria-label="New project name"], [aria-label="Page canvas"], #project-inspector')}`),false);
    assert.equal(await evaluate(`localStorage.getItem('bambiui.composer.projects.v1')`),null);
    assert.deepEqual(await evaluate(`Object.keys(localStorage).filter(key=>key.startsWith('bambiui.composer.document.v1.'))`),[]);
    assert.deepEqual(await stored(),before);
  });
  await check('no runtime, browser console or resource errors',async()=>{await delay(200);assert.deepEqual(errors,[]);});
} catch(error) {failures.push('harness');console.error(`FAIL harness: ${error.stack || error}`);}
finally {
  try {await cleanup();}catch(error){failures.push('cleanup');console.error(`FAIL cleanup: ${error}`);}
  clearTimeout(watchdog);
  console.log(`RESULT: ${passes} passed, ${failures.length} failed${failures.length ? ': '+failures.join(', ') : ' — all smoke checks passed'}`);
  console.log('SCOPE: automated Chromium/CDP checks, not a real screen-reader or native browser-zoom session.');
  if(failures.length)process.exitCode=1;
}
