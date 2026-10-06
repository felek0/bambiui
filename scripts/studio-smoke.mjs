#!/usr/bin/env node
// Run after `npm run build`; uses installed Chrome and a disposable browser profile.
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
  console.error(`Smoke test exceeded 180 seconds during ${currentCheck}`);
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Smoke watchdog expired')); }
  pending.clear(); socket?.close(); chrome?.kill('SIGKILL');
}, 180000);
const ids = ['button', 'input', 'card', 'badge', 'switch', 'checkbox', 'text'];
const foundations = ['colors', 'spacing'];
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
const themeControl = '[aria-label="Design theme"]';
const camera = '[data-canvas]';

async function assertStudioSurfaces(mode) {
  const surface = mode === 'dark' ? 'rgb(32, 32, 32)' : 'rgb(250, 250, 250)';
  await wait(`getComputedStyle(${q('.studio-header')}).backgroundColor === ${JSON.stringify(surface)}`);
  for (const selector of ['.studio-header','#token-editor','.studio-sidebar']) {
    assert.equal(await evaluate(`getComputedStyle(${q(selector)}).backgroundColor`),surface,`${selector} must retain the fixed editor surface`);
  }
  assert.equal(await evaluate(`getComputedStyle(${q('.preview-frame')}).backgroundColor`),mode === 'dark' ? 'rgb(25, 25, 29)' : 'rgb(241, 241, 244)','canvas chrome is independent of system tokens');
  assert.equal(await evaluate(`getComputedStyle(${q('.theme-pane')}).borderTopWidth`),'0px','the full-bleed workspace has no inset preview border');
}

const moved = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
async function wheel(point, deltaX, deltaY, modifiers = 0) {
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX,deltaY,modifiers});
}
async function canvasBackground() {
  // Locate a real empty hit target; specimen inputs and controls must remain interactive.
  return evaluate(`(()=>{const e=${q(canvas)},r=e.getBoundingClientRect();for(let y=r.top+12;y<Math.min(r.bottom,innerHeight)-12;y+=8)for(let x=r.left+12;x<Math.min(r.right,innerWidth)-12;x+=8){const t=document.elementFromPoint(x,y);if(t && e.contains(t) && !t.closest('[data-specimen],[data-foundation],button,a,input,textarea,select,label,summary'))return {x,y};}throw Error('No visible canvas background')})()`);
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
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-foundation]')].map(e=>e.dataset.foundation).sort()`),isFoundation ? foundations : []);
  assert.equal(await evaluate(`document.querySelectorAll('[data-recipe-example]').length`),isFoundation ? 0 : matrixCounts[id]);
  assert.equal(await evaluate(`document.querySelectorAll('[data-interaction-examples]').length`),isFoundation || id==='text' ? 0 : 1);
  assert.equal(await evaluate(`!!${q('[data-system-starter]')} || /Starting component/i.test(${q('.preview-canvas')}.textContent)`),false,'Starting component must not be rendered');
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
  assert.equal(await evaluate(`${named('[aria-label="Component editor"] [role="tab"]','Styles')}.getAttribute('aria-selected')`),'true');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('${matrix(id)} [data-recipe-example][data-selected]')].map(e=>e.dataset.recipeExample)`),[recipe]);
  const prefix = `system-recipe-${id}-${recipe}-${part}-${target}-`;
  const gap = id!=='text' && ['root','header','content','footer','row','error'].includes(part) || id==='input' && part==='control';
  const expected = target==='text' ? (['switch','checkbox'].includes(id) && part==='control' || id==='card' && part==='icon' ? ['color'] : textFields) : frameFields.filter(field=>field!=='gap' || gap);
  assert.deepEqual(await evaluate(`[...${q(controls)}.querySelectorAll('input,select,textarea')].map(e=>e.id.startsWith(${JSON.stringify(prefix)}) ? e.id.slice(${prefix.length}) : e.id).sort()`),[...expected].sort(),'only controls consumed by this exact frame/text layer');
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
async function componentTab(tab) {
  const target=named('[aria-label="Component editor"] [role="tab"]',tab);
  if (!await evaluate(`(${target})?.getAttribute('aria-selected')==='true'`)) await click(target);
  await wait(`(${target})?.getAttribute('aria-selected')==='true'`);
}
async function positionCanvas(expression) {
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
  await evaluate(`(${expression}).scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
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
    assert.ok(await evaluate(`(()=>{const bar=${q('.canvas-theme')}.getBoundingClientRect(),view=${q(canvas)}.getBoundingClientRect();return bar.right<=view.right && bar.top>=view.top && bar.right>view.right-130 && bar.bottom<view.bottom})()`));
    assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(viewNav + ' a')})].map(e=>e.textContent.trim())`),['Design','Develop']);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(themeControl + ' button')})].map(e=>e.getAttribute('aria-label'))`),['Light','Dark']);
    assert.ok(await evaluate(`[...document.querySelectorAll(${JSON.stringify(themeControl + ' button')})].every(e=>!e.textContent.trim() && !!e.querySelector('svg'))`));
    assert.ok(await evaluate(`${q('.studio-header .brand')}.nextElementSibling === ${q('.studio-header nav[aria-label="Workspace"]')}`),'workspace switch follows the brand');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.studio-header nav[aria-label="Workspace"] a')].map(e=>e.textContent.trim())`),['Project','System']);
    assert.equal(await evaluate(`${q('.studio-header nav[aria-label="Workspace"] [aria-current]')}.textContent`),'System');
    assert.ok(await evaluate(`${q('.studio-header .system-switcher summary')}?.getClientRects().length > 0`),'active system belongs in the header');
    assert.equal(await evaluate(`!!${q('.studio-sidebar #design-system-name')}`),false);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.component-group')].map(e=>[e.querySelector('.component-group-label').textContent,...[...e.querySelectorAll('a')].map(a=>a.textContent.trim())])`),[['Actions','Button'],['Forms','Input','Switch','Checkbox'],['Content','Card','Badge','Text']]);
    assert.equal(await evaluate(`${q('.sidebar-foundations-label')}.textContent`),'FOUNDATIONS');
    await fill('.search-field input','badge');
    await wait(`document.querySelectorAll('.component-group a').length === 1`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.component-group a')].map(a=>a.textContent.trim())`),['Badge']);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4});
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await wait(`document.querySelectorAll('.component-group a').length === 7`);
    assert.ok(await evaluate(`!!${q('.preview-frame .canvas-history [aria-label="Undo change"] svg')} && !!${q('.preview-frame .canvas-history [aria-label="Redo change"] svg')}`));
    assert.ok(await evaluate(`(()=>{const bar=${q('.canvas-history')}.getBoundingClientRect(),view=${q(canvas)}.getBoundingClientRect();return bar.left>=view.left && bar.top>=view.top && bar.left<view.left+90 && bar.bottom<view.bottom})()`));
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
  await check('System puts exact Styles first, with Parameters and collapsed shared/base defaults separate',async()=>{
    await navigate('design','button');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[aria-label="Component editor"] [role="tab"]')].map(e=>e.textContent.trim())`),['Styles','Parameters']);
    assert.equal(await evaluate(`${named('[aria-label="Component editor"] [role="tab"]','Styles')}.getAttribute('aria-selected')`),'true');
    assert.equal(await evaluate(`!!${q('[data-system-recipe-controls]')}`),false,'no recipe is selected by insertion defaults');
    assert.ok(await evaluate(`${q('#token-editor')}.textContent.includes('Select a frame or text')`));
    for(const selector of ['[data-system-shared-defaults]','[data-system-base-tokens]']) assert.equal(await evaluate(`${q(selector)}.open`),false);
    assert.equal(await evaluate(`${q('#token-paddingX')}.checkVisibility()`),false,'base token controls start collapsed');
    assert.equal(await evaluate(`${q('#token-paddingX')}.closest('[data-system-base-tokens]')!==null`),true);
    await click(q('[data-system-base-tokens] > summary'));
    assert.equal(await evaluate(`${q('[data-system-base-tokens]')}.open && ${q('#token-paddingX')}.checkVisibility()`),true);
    await click(q('[data-system-base-tokens] > summary'));
    await componentTab('Parameters');
    assert.equal(await evaluate(`${q('[aria-label="Default Text"]')}.value`),'Continue');
    assert.equal(await evaluate(`${q('[aria-label="Default Variant"]')}.value`),'primary');
    assert.equal(await evaluate(`${q('[aria-label="Default Size"]')}.value`),'md');
    assert.equal(await evaluate(`!!${q('#token-editor [data-system-recipe-controls], #token-editor [data-system-shared-defaults], #token-editor [data-system-base-tokens]')}`),false,'Parameters does not expose style controls');
    await componentTab('Styles');
    assert.equal(await evaluate(`${q('[data-system-base-tokens]')}.open`),false);
    assert.equal(await evaluate(`!!${q('[aria-label="System component part"]')}`),false);
    await select('[aria-label="Shared default layer"]','root');
    assert.equal(await evaluate(`${q('[id="system-shared-button-root-paddingLeft"]')}.closest('[data-system-shared-defaults]')!==null`),true);
    await click(q('[data-system-shared-defaults] > summary'));
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
    await stableCamera();
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
    await componentTab('Parameters');
    await click(q(recipePart('card','outlined.md','title')));
    await assertRecipeSelection('card','outlined.md','title','text');
  });
  await check('System values reflect the selected layer, theme and zoom without authoring overrides',async()=>{
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
    await click(q('[aria-label="Zoom in"]'));
    await assertMeasuredRecipe('card','outlined.md','root','frame',geometry);
    await click(q('[aria-label="Zoom out"]'));
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
  await check('Card outlined.md title font size/weight affect only that combination and title, with undo/reset/export',async()=>{
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
    const expected = original.map(entry=>entry.recipe==='outlined.md' && entry.component==='card' && entry.part==='title' ? {...entry,fontSize:'31px',fontWeight:'650'} : entry);
    assert.deepEqual(await snapshot(),expected,'other sizes, variants, Card slots and nested components retain typography');
    await capture('studio-matrix-card-title');
    for(const mode of ['light','dark']) assert.deepEqual((await stored()).themes[mode].componentRecipes.card['outlined.md'].title,{fontSize:31,fontWeight:650});
    const customized = await stored();
    await click(q('[aria-label="Undo change"]'));
    assert.equal(await evaluate(`getComputedStyle(${q(recipePart('card','outlined.md','title'))}).fontWeight`),original.find(entry=>entry.recipe==='outlined.md' && entry.part==='title').fontWeight);
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
  await check('keyboard example label selects a recipe, then inspector layers select frame/text without native activation',async()=>{
    await navigate('design','card');
    const label = q(`${example('card','outlined.md')} > button[aria-label="Select Card Outlined Medium frame"]`);
    await positionCanvas(label);
    await evaluate(`${label}.focus({preventScroll:true})`);
    await key('Enter');
    await assertRecipeSelection('card','outlined.md','root','frame');
    assert.equal(await evaluate(`document.activeElement===${label}`),true);
    const {nodes}=await send('Accessibility.getFullAXTree');
    for(const name of ['Select Card Outlined Medium frame','Select Title text','Select Title frame']) assert.ok(nodes.some(node=>!node.ignored && node.name?.value===name),`matrix/layer AX name: ${name}`);
    const first = q('[data-system-recipe-controls] [aria-label="Select Card frame"]');
    await evaluate(`${first}.focus({preventScroll:true})`);
    await key('ArrowDown');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Select Header frame');
    await key('ArrowDown');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Select Title text');
    await assertRecipeSelection('card','outlined.md','root','frame');
    await key('Enter');
    await assertRecipeSelection('card','outlined.md','title','text');
    await evaluate(`${q('[data-system-recipe-controls] [aria-label="Select Title text"]')}.focus({preventScroll:true})`);
    await key('ArrowDown');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Select Title frame');
    await key(' ','Space');
    await assertRecipeSelection('card','outlined.md','title','frame');
  });
  await check('Button and Badge label hits differ from their frames; design clicks never activate native controls',async()=>{
    for(const [id,recipe] of [['button','primary.md'],['badge','outline.info.md']]) {
      await navigate('design',id);
      await stableCamera();
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
    await stableCamera();
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
    for(const mode of ['light','dark']) {
      assert.equal(customized.themes[mode].componentRecipes.card['outlined.md'].title.fontSize,29);
      assert.equal(customized.themes[mode].componentRecipes.card['outlined.md'].root.paddingLeft,23);
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
    await stableCamera();
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
  await check('header theme controls preview, inspector and Develop without changing the other theme',async()=>{
    await click(named(themeControl + ' button','Dark'));
    assert.ok(await evaluate(`${q('.editor-title')}.textContent.includes('Dark')`));
    assert.equal(await evaluate(`${q('.theme-pane:not([hidden])')}.getAttribute('aria-label')`),'Dark preview');
    await assertStudioSurfaces('dark');
    assert.equal(await evaluate(`getComputedStyle(document.documentElement).colorScheme`),'dark');
    assert.notEqual(await evaluate(`getComputedStyle(${q(canvas)}).backgroundColor`),'rgb(255, 248, 246)');
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
    assert.equal(await evaluate(`${q(themeControl)}.closest('header') === ${q('.studio-header')}`),true,'Develop keeps theme access in its header');
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
    await navigate('design','text');
    assert.equal(await evaluate(`document.querySelectorAll('link[href^="https://fonts.googleapis.com/css2"]').length`),0,'local defaults must not fetch Google fonts');
    assert.equal(await evaluate(`${q('#font-family-preset')}.querySelectorAll('optgroup[label^="Google Fonts"] option').length`),12);
    await click(named(themeControl + ' button','Light'));
    await select('#font-family-preset','mono');
    await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-font-family').includes('Menlo')`);
    for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].fontFamily,'mono');
    assert.ok((await evaluate(`getComputedStyle(${q(recipePart('text','paragraph.neutral.md','root'))}).fontFamily`)).includes('Menlo'));
    assert.equal(await evaluate(`getComputedStyle(${q('[aria-label="Canvas zoom"]')}).fontFamily`),await evaluate('getComputedStyle(document.body).fontFamily'),'canvas tools must not inherit the specimen font');
    await click(q('[aria-label="Export tokens"]'));
    assert.ok((await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`)).includes('--ds-font-family: ui-monospace'));
    await click(q('[aria-label="Close export dialog"]'));
    await navigate('develop','text');
    assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes('--ds-font-family')`));
    await navigate('design','text');
    for(const [preset,firstFont] of [['sans','Arial'],['humanist','Trebuchet MS'],['editorial','Palatino'],['typewriter','Courier New']]) {
      await select('#font-family-preset',preset);
      await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-font-family').includes(${JSON.stringify(firstFont)})`);
      for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].fontFamily,preset);
      assert.ok((await evaluate(`getComputedStyle(${q(recipePart('text','paragraph.neutral.md','root'))}).fontFamily`)).includes(firstFont));
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
    await navigate('design','text');
    const before=await stored();
    const field=await evaluate(`${q('#typography-heading-fontSize')}?.id`);
    assert.ok(field,'heading font size input must have an id');
    await fill(`#${field}`,'42');
    await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-typography-heading-font-size').trim()==='42px'`);
    assert.equal((await stored()).themes.light.typography.heading.fontSize,42);
    assert.equal((await stored()).themes.dark.typography.heading.fontSize,42);
    assert.deepEqual((await stored()).themes.dark.global,before.themes.dark.global);
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
    await navigate('design','text');
    assert.equal(await evaluate(`${q('#typography-variant')}.options.length`),10,'all typography styles remain selectable');
    for(const [variant,size] of [['h1',54],['h2',45],['h3',36],['h4',30],['h5',25],['h6',22]]) {
      await select('#typography-variant',variant);
      await wait(`!!${q(`#typography-${variant}-fontSize`)}`);
      assert.equal(await evaluate(`document.querySelectorAll('.typography-control').length`),4,'only the selected style is editable at once');
      await fill(`#typography-${variant}-fontSize`,String(size));
      assert.equal(await evaluate(`getComputedStyle(${q(recipePart('text',`${variant}.neutral.md`,'root'))}).fontSize`),`${size}px`);
      for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].typography[variant].fontSize,size);
      assert.equal(await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-typography-${variant}-font-size').trim()`),`${size}px`);
    }
    assert.equal(await evaluate(`${q(`${matrix('text')} h2`)}.textContent`),'Text');
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
    await navigate('design','text');
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
    assert.equal(await evaluate(`document.querySelectorAll('.editor-fields--spacing .number-fields .token-control').length`),15);
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
      ['fontSize',20,'[class*="fontVisual"]','fontSize'],
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
    await componentTab('Styles');
    await select('[aria-label="Shared default layer"]','title');
    const shared = '[id="system-shared-card-title-color"]';
    await fill(shared,'#123456'); await key('Enter');
    await wait(`JSON.parse(localStorage.getItem('bambiui.design-system.v1')).themes[document.documentElement.dataset.studioTheme].componentStyles?.card?.title?.color==='#123456'`);
    await select('[aria-label="Shared default layer"]','description');
    await componentTab('Parameters');
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
  await check('camera controls, unbounded drag, wheel pan and pointer-anchored zoom',async()=>{
    await navigate('design','button');
    await click(named('[aria-label="Canvas zoom"] button','Reset zoom'));
    await wait(`${q('[aria-label="Zoom level"]')}.textContent==='100%'`);
    await click(q('[aria-label="Zoom in"]'));
    assert.equal(await evaluate(`${q('[aria-label="Zoom level"]')}.textContent`),'110%');
    assert.ok(Math.abs((await evaluate(cameraState)).scale-1.1)<0.02);
    assert.ok(await evaluate(`(()=>{const v=${q(canvas)},s=getComputedStyle(v);return Math.abs(parseFloat(v.style.getPropertyValue('--canvas-dot-radius'))-1.1)<0.01 && Math.abs(parseFloat(s.backgroundSize)-17.6)<0.01 && s.backgroundImage.includes('1.1px')})()`),'grid dot radius and spacing should follow camera zoom');
    await click(q('[aria-label="Zoom out"]'));
    assert.equal(await evaluate(`${q('[aria-label="Zoom level"]')}.textContent`),'100%');
    await navigate('design','checkbox');
    await wait(`(()=>{const a=${q(canvas)}.getBoundingClientRect(),b=${q('[data-specimen="checkbox"]')}.getBoundingClientRect();return b.bottom>a.top && b.top<a.bottom && b.right>a.left && b.left<a.right})()`);
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
    assert.ok(!await evaluate(`${q(canvas)}.hasAttribute('data-dragging')`),'input activation must not start a camera drag');
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
    await stableCamera();
    const specimen = recipePart('button','primary.md','text');
    await positionCanvas(q(specimen));
    const specimenPoint = await evaluate(`(()=>{const r=${q(specimen)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...specimenPoint,button:'none'});
    assert.equal(await evaluate(`getComputedStyle(${q(specimen)}).outlineStyle`),'solid');
    await wait(`${q('[data-canvas-selection-hint]')}?.textContent.includes('Button · Click to edit tokens')`);
    const hint = await evaluate(`${q('[data-canvas-selection-hint]')}.textContent`);
    await delay(200);
    await send('Performance.enable');
    const taskTime = async () => (await send('Performance.getMetrics')).metrics.find(metric => metric.name === 'TaskDuration').value;
    const beforeTasks = await taskTime();
    for (let offset = 0; offset < 80; offset++) await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:specimenPoint.x-offset/5,y:specimenPoint.y,button:'none'});
    const hoverTaskMs = Math.round((await taskTime() - beforeTasks) * 1000);
    console.log(`HOVER PROFILE: 80 same-section pointer moves, ${hoverTaskMs}ms main-thread task time`);
    assert.equal(await evaluate(`${q('[data-canvas-selection-hint]')}.textContent`),hint,'moving within one section must not churn the hint');
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
    assert.ok(await evaluate(`!!${q('#token-radius')} && !${q('#token-background')} && !${q('#scale-primary-500')}`));
    await wait(`document.activeElement?.id === 'token-radius'`);
    await delay(450);
    await capture('studio-spacing');
    await navigate('design','text');
    await delay(450);
    assert.ok(await evaluate(`(()=>{const heading=${q(`${matrix('text')} h2`)}.getBoundingClientRect(),view=${q(canvas)}.getBoundingClientRect();return heading.top>=view.top+60})()`),'selected matrix headings must stay below the floating tools');
    await click(q(`${example('text','heading.neutral.md')} > button`));
    await assertRecipeSelection('text','heading.neutral.md','root','text');
    await route('design','text');
    await click(named(viewNav + ' a','Develop'));
    await route('develop','text');
    await click(named(viewNav + ' a','Design'));
    await route('design','text');
    assert.ok(await evaluate(`!!${q('#typography-heading-fontSize')}`));
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
    const source=await evaluate(`${q('.workspace-panel--develop pre code')}.textContent`);
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
      assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes(${JSON.stringify(id === 'colors' ? '--ds-primary-500' : '--ds-radius')})`));
      assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes(${JSON.stringify(id === 'colors' ? (await stored()).themes.dark.global.primary : `${(await stored()).themes.dark.global.radius}px`)})`));
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
    for (const width of [1100,980,820]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await delay(100);
      assert.ok(await evaluate(`(()=>{const help=${q('[class*="canvasHelp"]')}.getBoundingClientRect(),zoom=${q('[aria-label="Canvas zoom"]')}.getBoundingClientRect();return help.right<=zoom.left || help.left>=zoom.right || help.bottom<=zoom.top || help.top>=zoom.bottom})()`),`canvas tools overlap at ${width}px`);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`overflow at ${width}px`);
    }
  });
  await check('700px uses overlay panels and focus canvas, never stacked navigation',async()=>{
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
    assert.equal(await evaluate(`${q('#workspace-inspector')}.getBoundingClientRect().width`),272);
    assert.ok(await evaluate(`(()=>{const editor=${q('#workspace-inspector')}.getBoundingClientRect(),workspace=${q('.studio-main')}.getBoundingClientRect();return editor.top===workspace.top && editor.bottom===workspace.bottom && workspace.width===700})()`),'inspector overlays rather than moving the canvas');
    await click(q('[aria-label="Focus canvas"]'));
    assert.equal(await evaluate(`${q('#workspace-sidebar')}.hidden && ${q('#workspace-inspector')}.hidden`),true);
    await click(q('[aria-label="Show panels"]')); await hideMobilePanels();
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
      if(view==='Design') assert.ok(await evaluate(`(()=>{const main=${q('.studio-main')}.getBoundingClientRect();return ['.canvas-history','.canvas-theme'].every(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return r.top>=main.top && r.bottom<=main.bottom && r.left>=main.left && r.right<=main.right})})()`),'floating controls stay in the visible work area');
      assert.equal(await evaluate(`!!${q('.breadcrumbs')} || !!${q('.viewport-controls')}`),false);
      await capture(`studio-375-${view.toLowerCase()}`);
    }
  });
  for(const view of ['design','develop']) for(const id of [...foundations,...ids]) await check(`mobile System navigation and inspector ${view}/${id}`,async()=>{
    await navigate(view,id);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`mobile overflow: ${view}/${id}`);
    assert.ok(await evaluate(`${q(viewNav)}.getBoundingClientRect().right<=innerWidth && ${q(themeControl)}.getBoundingClientRect().right<=innerWidth`),`view/theme controls overflow: ${view}/${id}`);
    if(view==='design') {
      assert.ok(await evaluate(`${q(`[data-canvas-unit="${id}"]`)}.getClientRects().length>0`));
      await panel('workspace-inspector',true);
      if(id==='colors' || ids.includes(id)) assert.ok(await evaluate(`(()=>{const h=${q('.editor-title')}.getBoundingClientRect(),a=${q('.editor-title-actions')}.getBoundingClientRect();return a.left>=h.left && a.right<=h.right && Math.abs(h.right-a.right-parseFloat(getComputedStyle(${q('.editor-title')}).paddingRight))<3})()`),`inspector actions fit the overlay: ${id}`);
      assert.equal(await evaluate(`!!${q('.mobile-preview-link')} && ${q('.mobile-preview-link')}.getClientRects().length>0`),false,'panel toggles replace the old stacked-layout anchor');
      if(id==='text') { await reveal(q('#typography-tokens')); await evaluate(`${q('#typography-tokens')}.scrollIntoView({block:'start',behavior:'instant'})`); await capture('studio-375-text'); }
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
      assert.ok(await evaluate(`getComputedStyle(${q(canvas)}).touchAction!=='none'`),'canvas must not disable native touch zoom/scroll');
      assert.equal(await evaluate(`(()=>{const e=new Event('touchmove',{bubbles:true,cancelable:true});${q(canvas)}.dispatchEvent(e);return e.defaultPrevented})()`),false,'mobile touchmove must not be consumed by the camera');
      // The shell no longer scrolls as a document; long specimens still need an accessible native scroll region.
      await evaluate(`void(window.__mobileScroll=(()=>{for(let e=${q('[data-canvas]')}.parentElement;e;e=e.parentElement)if(e.scrollHeight>e.clientHeight+4 && /^(auto|scroll)$/.test(getComputedStyle(e).overflowY))return e;return null})())`);
      console.log('MOBILE SCROLL',await evaluate(`JSON.stringify((()=>{const result=[];for(let e=${q('[data-canvas]')}.parentElement;e;e=e.parentElement)result.push({element:e.id||e.className,overflow:getComputedStyle(e).overflowY,height:e.clientHeight,scrollHeight:e.scrollHeight});return result})())`));
      assert.ok(await evaluate('!!window.__mobileScroll'),'mobile preview needs a natively scrollable work area, not clipped content');
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
    acceptImportDialog = true;
    try {
      await click(named('.system-switcher-actions button','Delete current system'));
    } finally { acceptImportDialog = false; }
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
      assert.equal(await evaluate(`${q('h1')}.textContent`),view==='develop'?(id==='spacing'?'Shape & spacing documentation':`${name} documentation`):(id==='spacing'?'Shape & spacing':name));
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
      assert.equal(await evaluate(`${q('h1')}.textContent`),view==='design'?'Colors':'Colors documentation');
    });
  }
  await check('/ opens Project without creating records and System switch restores Colors',async()=>{
    const before=await stored(), origin=await evaluate('performance.timeOrigin');
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    await wait(`performance.timeOrigin!==${origin} && ${q('[aria-label="New project name"]')} && !${q('[aria-label="New project name"]')}.disabled`);
    assert.equal(await evaluate(`${q('[aria-label="Workspace"] [aria-current]')}.textContent`),'Project');
    assert.equal(await evaluate(`localStorage.getItem('bambiui.composer.projects.v1')`),null);
    assert.deepEqual(await evaluate(`Object.keys(localStorage).filter(key=>key.startsWith('bambiui.composer.document.v1.'))`),[]);
    assert.deepEqual(await stored(),before);
    await click(named('[aria-label="Workspace"] a','System'));
    await route('design','colors'); assert.deepEqual(await stored(),before);
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
