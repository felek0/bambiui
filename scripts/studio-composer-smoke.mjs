#!/usr/bin/env node
// Production static export, disposable Chrome profile, bounded CDP and process cleanup. No dependencies.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../out/', import.meta.url));
const indexKey = 'bambiui.composer.projects.v1';
const documentPrefix = 'bambiui.composer.document.v1.';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const errors = [], pending = new Map();
const firstDragOnly = process.argv.includes('--first-drag');
const smokeBudget = firstDragOnly ? 45000 : 120000;
let server, chrome, profile, socket, sequence = 0, checks = 0, timedOut = false, previewRequests = 0, stage = 'startup';
const watchdog = setTimeout(() => {
  timedOut = true; chrome?.kill('SIGKILL'); socket?.close();
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error(`Smoke exceeded ${smokeBudget / 1000} seconds`)); }
  pending.clear();
}, smokeBudget);
const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
const named = (selector, name, includeHidden = false) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim() === ${JSON.stringify(name)} && (${includeHidden} || !e.closest('[hidden]')))`;
const visible = expression => `(()=>{const e=(${expression});return !!e && e.getClientRects().length>0 && !e.closest('[hidden]') && getComputedStyle(e).visibility!=='hidden'})()`;
const modeButton = name => named('[aria-label="Canvas mode"] button', name);
const layer = (frameId, nodeId) => q(`[role="treeitem"][data-layer-id="${frameId}${nodeId ? '/' + nodeId : ''}"]`);
const instanceKind = () => `(()=>{const h=document.querySelector('[aria-label="Instance settings"] h3');return h?.firstChild?.textContent==='Parameters'?h.querySelector('small')?.textContent:h?.firstChild?.textContent})()`;
async function assertParameters(kind) {
  await wait(`${instanceKind()}===${JSON.stringify(kind)}`);
  assert.equal(await evaluate(`${q('[aria-label="Instance settings"] h3')}.firstChild.textContent`),'Parameters');
  assert.equal(await evaluate(`!!${q('[aria-label="Instance settings"] [aria-label="Local appearance"]')} || !!${q('[aria-label="Instance settings"] [data-appearance-key]')}`),false,'component parameters must not expose local style editing');
  assert.equal(await evaluate(`!!(${named('#project-inspector button','Edit styles in System')})`),true);
}
function send(method, params = {}, moveBeforePress = true) {
  // Move the real mouse to the target before pressing, not just on mouse-down.
  if (moveBeforePress && method === 'Input.dispatchMouseEvent' && params.type === 'mousePressed')
    return send(method, { type: 'mouseMoved', x: params.x, y: params.y, buttons: 0 }).then(() => send(method, params, false));
  if (timedOut || socket?.readyState !== 1) return Promise.reject(new Error('CDP unavailable'));
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 7000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}
async function wait(expression) {
  const until = Date.now() + 6500;
  do { if (await evaluate(`!!(${expression})`)) return; await delay(60); } while (Date.now() < until);
  throw new Error(`Timed out during ${stage}: ${expression}`);
}
async function reveal(expression) {
  // Resolve mounted, inactive sidebar panels through their actual Base UI tabs.
  const tab = await evaluate(`(()=>{const e=(${expression});return e?.closest('#workspace-sidebar [role="tabpanel"]')?.hidden ? (e.closest('[aria-label="Insert palette"]') || e.closest('section')?.textContent.includes('Saved components') ? 'Assets' : 'Layers') : null})()`);
  if (tab) await sidebar(tab);
  await wait(`!!(${expression})`);
  for (let i = 0; i < 6; i++) {
    const summary = `(()=>{const e=(${expression});let closed=null;for(let p=e?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(e))closed=p;return closed?.querySelector(':scope > summary')})()`;
    if (!await evaluate(`!!(${summary})`)) return;
    await click(summary);
  }
  throw new Error(`Cannot reveal details for ${expression}`);
}
async function sidebar(tab) {
  if (await evaluate(visible(q('[aria-label="Show left panel"]')))) await click(q('[aria-label="Show left panel"]'));
  const target = named('#workspace-sidebar [role="tab"]', tab);
  if (!await evaluate(`(${target})?.getAttribute('aria-selected')==='true'`)) await click(target);
  await wait(`(${target})?.getAttribute('aria-selected')==='true'`);
}
async function inspector(tab) {
  if (await evaluate(visible(q('[aria-label="Show inspector"]')))) await click(q('[aria-label="Show inspector"]'));
  const target = named('#project-inspector [role="tab"]', tab);
  if (!await evaluate(`(${target})?.getAttribute('aria-selected')==='true'`)) await click(target);
  await wait(`(${target})?.getAttribute('aria-selected')==='true'`);
}
async function fit(selection = false) {
  await click(q('[aria-label="Canvas tools"] [aria-label^="Canvas zoom "]'));
  await click(named('[role="menuitem"]', selection ? 'Fit selection' : 'Fit page'));
  await wait(`!${q('[role="menu"]')}`);
  // Fit covers the geometric viewport; the new floating chrome is above it. Leave
  // visible breathing room with the real toolbar, still focused outside the canvas.
  const titles = selection ? '[data-frame-id][data-selected] [data-frame-title]' : '[data-frame-title]';
  for (let i = 0; i < 4 && await evaluate(`[...document.querySelectorAll(${JSON.stringify(titles)})].some(e=>{const r=e.getBoundingClientRect();return !e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})`); i++) await click(q('[aria-label="Zoom out"]'));
}
async function addFrame(preset) {
  await inspector('Parameters');
  await click(q('[aria-label="Canvas tools"] [aria-label="Add frame"]'));
  await click(q(`[role="menuitem"][aria-label="Add ${preset} frame"]`));
  await wait(`!${q('[role="menu"]')}`);
}
async function canvasPoint(expression) {
  // Keep exact scene targets while panning around the floating notice/toolbar. This
  // uses the real wheel path and does not change zoom, selection or document data.
  for (let attempt = 0; attempt < 4; attempt++) {
    const point = await evaluate(expression);
    const shift = await evaluate(`(()=>{const v=${q('[aria-label="Interactive frame canvas"]')},r=v.getBoundingClientRect(),p=${JSON.stringify(point)},hit=document.elementFromPoint(p.x,p.y);if(p.x<r.left||p.x>r.right||p.y<r.top||p.y>r.bottom||hit?.closest('[data-camera-zoom]'))return null;const c=[...${q('[aria-label="Page canvas"]')}.children].find(e=>e.contains(hit)&&!e.contains(v));if(!c)return null;const b=c.getBoundingClientRect();return {dy:p.y<r.y+r.height/2?b.bottom-p.y+24:b.top-p.y-24,x:r.right-40,y:r.y+r.height/2,oldY:Number(v.dataset.cameraY)}})()`);
    if (!shift) return point;
    await evaluate(`${q('[aria-label="Interactive frame canvas"]')}.focus({preventScroll:true})`);
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:shift.x,y:shift.y,deltaX:0,deltaY:-shift.dy});
    await wait(`Math.abs(Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraY)-${shift.oldY + shift.dy})<.1`);
  }
  throw new Error(`Floating canvas chrome still covers ${expression}`);
}
async function chooseLayer(frameId, nodeId) {
  await sidebar('Layers'); await inspector('Parameters');
  const item = layer(frameId, nodeId);
  await reveal(item); await evaluate(`(${item}).scrollIntoView({block:'nearest',behavior:'instant'});(${item}).focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait(`(${item}).getAttribute('aria-selected')==='true'`);
}
async function systemWorkspace() {
  await click(named('[aria-label="Workspace"] a', 'System'));
  await wait(`${q('.studio-shell')}.dataset.workspace==='system'`);
}
async function projectWorkspace() {
  await click(named('[aria-label="Workspace"] a', 'Project')); await pages(); await sidebar('Layers');
}
async function click(expression) {
  await reveal(expression); await wait(visible(expression));
  // Floating notices/toolbars can cover a fitted frame title. Use real zoom controls,
  // never DOM clicks or CSS removal, to expose that canvas target before clicking it.
  for (let i = 0; i < 4 && await evaluate(`(()=>{const e=(${expression});if(!e.closest('[data-frame-id]'))return false;const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !e.contains(hit)&&!hit?.closest('[data-camera-zoom]')})()`); i++) await click(q('[aria-label="Zoom out"]'));
  await evaluate(`(()=>{const e=(${expression});if(!e.closest('[data-camera-zoom]'))e.scrollIntoView({block:'center',inline:'center',behavior:'instant'})})()`);
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  const point = await evaluate(`(()=>{const e=${expression},r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('Occluded: '+e.outerHTML+' at '+JSON.stringify({x,y,hit:document.elementFromPoint(x,y)?.outerHTML}));return {x,y}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  try { await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'); }
  catch (error) {
    if (!/Inspected target navigated|Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
    // A real route navigation can destroy the old RAF promise; the caller still verifies its destination.
    await wait('document.readyState === "complete"');
  }
}
async function fill(selector, text) {
  if (selector === '[aria-label="Project name"]') await inspector('Project');
  if (selector === '[aria-label="Page name"]' || selector.startsWith('[aria-label="Frame ') && selector !== '[aria-label="Frame theme"]') await inspector('Parameters');
  await click(q(selector));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
  if (text) await send('Input.insertText', { text });
  else { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, commands: ['deleteBackward'] }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace' }); }
  await wait(`${q(selector)}.value === ${JSON.stringify(text)}`);
}
async function select(selector, value) {
  if (selector === '[aria-label="Project design system"]') await inspector('Project');
  await reveal(q(selector)); await wait(visible(q(selector)));
  await evaluate(`(()=>{const e=${q(selector)};e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(`${q(selector)}.value === ${JSON.stringify(value)}`);
}
async function check(label, run) { stage = label; await run(); checks++; console.log(`PASS ${label}`); }
const index = () => evaluate(`JSON.parse(localStorage.getItem('${indexKey}'))`);
const project = (id) => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix + id)})).document`);
const catalog = () => evaluate(`localStorage.getItem('bambiui.systems.v1')`);
async function pages() { await wait(`['/', '/pages'].includes(location.pathname) && ${q('[aria-label="New project name"]')} && !${q('[aria-label="New project name"]')}.disabled && !${q('[data-project-status]')}?.textContent.includes('Loading')`); }
async function openManager() { if (!await evaluate(`${q('.studio-header details:has([aria-label="New project name"])')}.open`)) await click(q('.studio-header details:has([aria-label="New project name"]) summary')); }
async function createProject(name) {
  await openManager(); await fill('[aria-label="New project name"]', name);
  await click(named('button', 'Create project')); await pages();
  await wait(`${q('[aria-label="Page canvas"]')}?.dataset.projectId`);
  return (await index()).activeProjectId;
}
async function openProject(name, id) {
  await openManager(); await click(named('.studio-header details:has([aria-label="New project name"]) button', name));
  await pages(); await wait(`${q('[aria-label="Page canvas"]')}.dataset.projectId === ${JSON.stringify(id)}`);
}
async function reload() {
  const origin = await evaluate('performance.timeOrigin'); await send('Page.reload');
  await wait(`performance.timeOrigin !== ${origin}`); await pages();
}
async function cleanup() {
  socket?.close();
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('CDP cleanup')); }
  pending.clear();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const done = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGTERM');
    await Promise.race([done, delay(2000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) { chrome.kill('SIGKILL'); await Promise.race([done, delay(2000)]); }
  }
  // Chrome helpers can retain the stderr pipe after the browser process exits.
  chrome?.stderr?.destroy();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
}
// No source preselection or canvas focus transfer before mouse-down. Keep held-button
// moves explicit: this Chromium/CDP build drops capture when `button` defaults to none.
async function firstDragChecks() {
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await wait('innerWidth===1440');
  const id=await createProject('First drag regression');await click(q('[aria-label="Add page"]'));await addFrame('Mobile');await fit(true);
  await click(q('[data-insert-kind="stack"]'));await click(q('[data-insert-kind="badge"]'));await click(named('#project-inspector button','Select parent'));await click(q('[data-insert-kind="text"]'));
  let doc=await project(id),frame=doc.pages[0].frames[0],source=frame.root.children[0].children[0].id;
  const title=q(`[data-frame-title="${frame.id}"]`),node=id=>q(`[data-frame-id="${frame.id}"] [data-page-node="${id}"]`);
  await click(title);await click(q('[data-insert-kind="stack"]'));doc=await project(id);const target=doc.pages[0].frames[0].root.children[1].id;
  const revision=()=>evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix+id)})).revision`);
  for(const focus of ['toolbar','input']) for(const timing of ['immediate','settled']) await check(`first mouse drag of unselected node from ${focus} focus (${timing}): one move/save/undo`,async()=>{
    await click(title);await fit(true);
    if(focus==='input')await click(q('[aria-label="Frame width"]'));
    assert.equal(await evaluate('document.activeElement.tagName'),focus==='input'?'INPUT':'BUTTON','Focus starts outside canvas');
    assert.equal(await evaluate(`!!document.querySelector('[data-node-overlay="selected"]:not([hidden])')`),false,'No preselected node');
    const before=await project(id),rev=await revision();
    await evaluate(`(()=>{window.firstDragStop?.();window.firstDragTrace=[];const types=['pointerdown','gotpointercapture','lostpointercapture','pointermove','pointercancel','contextmenu'];const trace=e=>window.firstDragTrace.push({type:e.type,trusted:e.isTrusted,tag:e.target?.tagName,frameSurface:e.target?.hasAttribute?.('data-frame-surface'),buttons:e.buttons,capture:e.target?.hasPointerCapture?.(e.pointerId)});for(const type of types)window.addEventListener(type,trace,true);window.firstDragStop=()=>{for(const type of types)window.removeEventListener(type,trace,true)}})()`);
    const point=expression=>evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const start=await point(node(source)),end=await point(node(target));
    assert.equal(await evaluate(`document.elementFromPoint(${start.x},${start.y})?.closest('[data-page-node]')?.dataset.pageNode`),source,'Real mouse starts on source, not off-canvas');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
    if(timing==='settled')await delay(80);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});
    try {await wait(`document.querySelector('[data-node-move-valid="true"]')`);}catch(error){console.log('FIRST DRAG trace',await evaluate('window.firstDragTrace'));throw error;}
    const trace=await evaluate('window.firstDragTrace');assert.ok(trace.some(e=>e.type==='pointerdown'&&e.trusted));assert.ok(trace.some(e=>e.type==='pointermove'&&e.buttons===1&&e.trusted));assert.ok(trace.some(e=>e.type==='gotpointercapture'&&e.frameSurface&&e.capture));assert.equal(trace.some(e=>e.type==='lostpointercapture'||e.type==='contextmenu'),false,JSON.stringify(trace));
    await evaluate('window.firstDragStop()');
    assert.deepEqual(await project(id),before);assert.equal(await revision(),rev);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix+id)})).revision===${rev+1}`);
    const moved=await project(id);assert.equal(moved.pages[0].frames[0].root.children[1].children[0].id,source);
    await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(id),before);
  });
  await check('CDP held-button contract: omitted button loses plain DOM capture, explicit left retains it',async()=>{
    await evaluate(`window.captureProbe=document.createElement('div');Object.assign(window.captureProbe.style,{position:'fixed',left:'300px',top:'100px',width:'80px',height:'80px',zIndex:'20000'});document.body.append(window.captureProbe);window.captureProbe.addEventListener('pointerdown',e=>{window.captureProbe.pointerId=e.pointerId;window.captureProbe.setPointerCapture(e.pointerId);e.preventDefault()});window.captureProbe.addEventListener('lostpointercapture',()=>window.captureProbe.lost=true)`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(await evaluate('document.elementFromPoint(320,120)===window.captureProbe'),true);
    try {
      for(const button of [undefined,'left']) {
        await evaluate('window.captureProbe.lost=false');
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x:320,y:120,button:'left',clickCount:1});
        assert.equal(await evaluate('window.captureProbe.hasPointerCapture(window.captureProbe.pointerId)'),true,'Plain DOM capture established before move');
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:340,y:140,buttons:1,...(button?{button}:{})});
        const evidence=await evaluate(`({capture:window.captureProbe.hasPointerCapture(window.captureProbe.pointerId),lost:window.captureProbe.lost})`);
        assert.equal(evidence.capture,!!button,JSON.stringify({button:button??'omitted',...evidence}));
        if(button)assert.equal(evidence.lost,false);
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:340,y:140,button:'left',clickCount:1});
      }
    } finally {await evaluate('window.captureProbe.remove();delete window.captureProbe');}
  });
  await check('ContextMenu trigger right-click/left-click never activates Design Button, Switch, Checkbox or Input',async()=>{
    await click(title);await click(q('[data-insert-kind="stack"]'));
    for(const kind of ['button','switch','checkbox','input']) {await click(q(`[data-insert-kind="${kind}"]`));await click(named('#project-inspector button','Select parent'));}
    await fit(true);const before=await project(id),rev=await revision(),controls=before.pages[0].frames[0].root.children[2].children;
    const state=()=>evaluate(`Array.from(document.querySelectorAll('[data-frame-id="${frame.id}"] [data-frame-surface] input,[data-frame-id="${frame.id}"] [data-frame-surface] [role="switch"],[data-frame-id="${frame.id}"] [data-frame-surface] [role="checkbox"]')).map(e=>({value:e.value??null,checked:e.checked??null,aria:e.getAttribute('aria-checked')}))`);
    const original=await state();
    await evaluate(`(()=>{window.designActivations=[];window.designActivationStop?.();const root=document.querySelector('[data-frame-id="${frame.id}"] [data-frame-surface]');const types=['click','input','change','submit'];const record=e=>window.designActivations.push(e.type);for(const type of types)root.addEventListener(type,record);window.designActivationStop=()=>{for(const type of types)root.removeEventListener(type,record)}})()`);
    try {
      for(const control of controls) {
        const point=await evaluate(`(()=>{const root=${node(control.id)},e=root.matches('button,input,[role="switch"],[role="checkbox"]')?root:root.querySelector('button,input,[role="switch"],[role="checkbox"]'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'right',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'right',clickCount:1});await wait(`document.querySelector('[role="menu"]')`);
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait(`!document.querySelector('[role="menu"]')`);
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
        assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Interactive frame canvas');
      }
      assert.deepEqual(await evaluate('window.designActivations'),[]);assert.deepEqual(await state(),original);assert.deepEqual(await project(id),before);assert.equal(await revision(),rev);
    } finally {await evaluate('window.designActivationStop()');}
  });
}
try {
  await stat(resolve(root, 'pages.html'));
  server = createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            if (name === '/preview-blocked') previewRequests++;
      let path = resolve(root, `.${name}`);
      if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
      if (!extname(path)) { try { await stat(`${path}.html`); path += '.html'; } catch { path = resolve(path, 'index.html'); } }
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(await readFile(path));
    } catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  profile = await mkdtemp(resolve(tmpdir(), 'bambiui-composer-smoke-'));
  chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', spawnError, port;
  chrome.on('error', error => { spawnError = error; }); chrome.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  for (let i = 0; i < 120 && !port; i++) {
    if (spawnError) throw spawnError;
    if (chrome.exitCode !== null) throw new Error(`Chrome exited: ${stderr}`);
    try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { await delay(100); }
  }
  assert.ok(port, `Chrome unavailable: ${stderr}`);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { const task = pending.get(message.id); if (!task) return; pending.delete(message.id); clearTimeout(task.timer); if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` }); await pages();
  if(firstDragOnly) { await firstDragChecks(); }
  else {
  await check('initial Project workspace is blank, excludes system controls/Develop and does not write project storage', async () => {
    assert.equal(await index(), null); assert.equal(await evaluate(visible(q('#token-editor'))), false);
    assert.equal(await evaluate(`getComputedStyle(${q('.header-actions')}).display`), 'none');
    assert.equal(await evaluate(`${q('[aria-label="Workspace"] [aria-current]')}.textContent.trim()`), 'Project');
    assert.equal(await evaluate(`!!${q('.view-switch')}`), false);
    assert.equal(await evaluate(visible(named('button', 'Create or open a project'))), true);
  });
  let first, second, originalSystem, otherSystem, firstPage;
  await check('create/rename first project with two independent blank pages', async () => {
    first = await createProject('First'); await click(q('[aria-label="Add page"]')); await click(q('[aria-label="Add page"]'));
    await fill('[aria-label="Project name"]', 'Alpha'); await click(named('#project-inspector button', 'Rename project'));
    await fill('[aria-label="Page name"]', 'Second page'); await click(named('#project-inspector button', 'Rename page'));
    const doc = await project(first); assert.equal(doc.name, 'Alpha'); assert.equal(doc.pages.length, 2); assert.equal(doc.pages[1].name, 'Second page');
    assert.ok(doc.pages.every(page => page.frames.length === 0)); firstPage = doc.pages[0].id; originalSystem = doc.systemId;
    await click(named('[aria-label="Pages"] a', 'Page 1')); await wait(`${q('[aria-label="Page canvas"]')}.dataset.pageId === ${JSON.stringify(firstPage)}`);
  });
  await check('second project/page isolation and session selection restore', async () => {
    second = await createProject('Beta'); await click(q('[aria-label="Add page"]'));
    assert.equal((await project(second)).pages.length, 1); assert.equal((await project(first)).pages.length, 2);
    await openProject('Alpha', first); assert.equal(await evaluate(`${q('[aria-label="Page canvas"]')}.dataset.pageId`), firstPage);
    await openProject('Beta', second);
  });
  await check('project duplication opens an independent copy with fresh history', async () => {
    const before = await project(second);
    await openManager(); await click(named('.studio-header details:has([aria-label="New project name"]) button', 'Duplicate project'));
    const copyId = (await index()).activeProjectId, copy = await project(copyId);
    assert.notEqual(copyId, second); assert.equal(copy.name, 'Beta copy'); assert.equal(copy.systemId, before.systemId);
    assert.equal(copy.pages.length, before.pages.length); assert.notEqual(copy.pages[0].id, before.pages[0].id);
    assert.equal(await evaluate(`${q('[aria-label="Undo project edit"]')}.disabled`), true);
    assert.deepEqual(await project(second), before); await openProject('Beta', second);
  });
  await check('design-system manager browsing does not rebind either project', async () => {
    await systemWorkspace(); await click(q('.system-switcher:has(#design-system-name) summary'));
    await click(named('.system-switcher-actions button', 'New design system'));
    otherSystem = await evaluate(`JSON.parse(localStorage.getItem('bambiui.systems.v1')).activeId`);
    assert.notEqual(otherSystem, originalSystem);
    assert.equal((await project(second)).systemId, originalSystem); assert.equal((await project(first)).systemId, originalSystem);
    await projectWorkspace();
    assert.equal(await evaluate(`${q('[aria-label="Page canvas"]')}.dataset.systemId`), originalSystem);
  });
  await check('explicit project rebind confirms impact, preserves content, undo/redo saves and does not touch catalog', async () => {
    const before = await project(second), systemBytes = await catalog();
    await select('[aria-label="Project design system"]', otherSystem);
    await click(named('#project-inspector button', 'Preview system change'));
    await wait(`${q('[role="dialog"]')}`); assert.equal((await project(second)).systemId, originalSystem);
    assert.match(await evaluate(`${q('[role="dialog"]')}.textContent`), /instance overrides are preserved/);
    await click(named('[role="dialog"] button', 'Confirm system change'));
    await wait(`${q('[aria-label="Page canvas"]')}.dataset.systemId === ${JSON.stringify(otherSystem)}`);
    assert.deepEqual(await project(second), { ...before, systemId: otherSystem }); assert.equal(await catalog(), systemBytes);
    await click(q('[aria-label="Undo project edit"]')); assert.deepEqual(await project(second), before);
    await click(q('[aria-label="Redo project edit"]')); assert.equal((await project(second)).systemId, otherSystem);
    assert.equal(await catalog(), systemBytes); assert.equal((await project(first)).systemId, originalSystem);
  });
  await check('reload restores active project and system, fresh history and first page', async () => {
    const before = await project(second); await reload();
    assert.equal((await index()).activeProjectId, second); assert.deepEqual(await project(second), before);
    assert.equal(await evaluate(`${q('[aria-label="Page canvas"]')}.dataset.systemId`), otherSystem);
    assert.equal(await evaluate(`${q('[aria-label="Undo project edit"]')}.disabled`), true);
    await openProject('Alpha', first); await reload(); assert.equal(await evaluate(`${q('[aria-label="Page canvas"]')}.dataset.pageId`), firstPage);
  });
  await check('referenced system deletion is explicitly blocked, component tokens/Develop remain independent', async () => {
    await systemWorkspace(); await click(q('.system-switcher:has(#design-system-name) summary'));
    await click(q(`.system-switcher-list button[aria-current="true"]`));
    await click(q('.studio-sidebar a[href="/button"]')); await wait(`location.pathname === '/button' && !${q('#token-editor')}.hidden`);
    await wait(`${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
    await click(q('.system-switcher:has(#design-system-name) summary'));
    assert.equal(await evaluate(`${named('.system-switcher-actions button', 'Delete current system')}.disabled`), true);
    await click(q('.system-switcher:has(#design-system-name) summary'));
    const projectsBefore = [await project(first), await project(second)];
    await click(q('.view-switch a[href="/develop/button"]')); await wait(`location.pathname === '/develop/button' && ${q('#token-editor')}.hidden`);
    await click(q('.view-switch a[href="/button"]')); await wait(`location.pathname === '/button' && !${q('#token-editor')}.hidden`);
    assert.deepEqual([await project(first), await project(second)], projectsBefore);
    await projectWorkspace(); await click(named('[aria-label="Pages"] a', 'Page 1')); await pages();
  });
  await check('page history cannot travel token history; native draft undo remains independent', async () => {
    await systemWorkspace(); await click(q('.studio-sidebar a[href="/button"]')); await wait(`location.pathname === '/button' && !${q('#token-editor')}.hidden`);
    const systemBefore = await catalog(); await fill('#token-paddingX', '27');
    await wait(`JSON.parse(localStorage.getItem('bambiui.systems.v1')).systems.find(e=>e.id===${JSON.stringify(otherSystem)}).system.themes.light.components.button.paddingX === 27`);
    const systemEdited = await catalog(); assert.notEqual(systemEdited, systemBefore);
    await projectWorkspace(); await click(named('[aria-label="Pages"] a', 'Page 1')); await pages();
    const pageBefore = await project(first);
    await fill('[aria-label="Page name"]', 'Draft only');
    await send('Input.dispatchKeyEvent', {type:'keyDown',key:'z',code:'KeyZ',modifiers:4,commands:['undo']});
    await send('Input.dispatchKeyEvent', {type:'keyUp',key:'z',code:'KeyZ',modifiers:4});
    assert.deepEqual(await project(first), pageBefore); assert.equal(await catalog(), systemEdited);
    await fill('[aria-label="Page name"]', 'Renamed page'); await click(named('#project-inspector button', 'Rename page'));
    await click(q('[aria-label="Undo project edit"]')); assert.deepEqual(await project(first), pageBefore); assert.equal(await catalog(), systemEdited);
    await click(q('[aria-label="Redo project edit"]')); const pageAfter = await project(first);
    await systemWorkspace(); await click(q('.studio-sidebar a[href="/button"]')); await wait(`location.pathname === '/button' && !${q('#token-editor')}.hidden`);
    await click(q('[aria-label="Undo change"]')); assert.equal(await catalog(), systemBefore); assert.deepEqual(await project(first), pageAfter);
    await projectWorkspace(); await click(named('[aria-label="Pages"] a', 'Renamed page')); await pages();
  });
  let webFrame;
  const cameraState = () => evaluate(`(()=>{const e=${q('[aria-label="Interactive frame canvas"]')};return {zoom:Number(e.dataset.cameraZoom),x:Number(e.dataset.cameraX),y:Number(e.dataset.cameraY)}})()`);
  const revision = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix + first)})).revision`);
  const frameTitle = id => q(`[data-frame-title="${id}"]`);
  const framePoint = async id => evaluate(`(()=>{const r=${frameTitle(id)}.getBoundingClientRect();return {x:r.x+Math.min(60,r.width/2),y:r.y+r.height/2}})()`);
  const movePointer = async (point, dx, dy, button = 'left') => {
    await send('Input.dispatchMouseEvent', {type:'mousePressed',...point,button,buttons:button === 'middle' ? 4 : 1,clickCount:1});
    for (let step=1;step<=4;step++) await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:point.x+dx*step/4,y:point.y+dy*step/4,button,buttons:button === 'middle' ? 4 : 1});
    await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
  };
  await check('three independent real-width frames appear together at their stored scene positions', async () => {
    for (const preset of ['Web','Tablet','Mobile']) await addFrame(preset);
    const frames = (await project(first)).pages[0].frames; webFrame = frames[0].id;
    assert.deepEqual(frames.map(f=>[f.width,f.height,f.x]),[[1440,900,0],[768,1024,1520],[390,844,2368]]);
    assert.equal(new Set(frames.map(f=>f.root.id)).size,3); assert.ok(frames.every(f=>!f.root.children.length));
    await fit();
    await wait(`${q('[data-frame-surface]')} && Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraZoom) < .5`);
    const dom = await evaluate(`(()=>{const v=${q('[aria-label="Interactive frame canvas"]')},r=v.getBoundingClientRect(),z=Number(v.dataset.cameraZoom);return [...v.querySelectorAll('[data-frame-id]')].map(e=>{const s=e.querySelector('[data-frame-surface]'),b=s.getBoundingClientRect();return {width:parseFloat(getComputedStyle(s).width),height:parseFloat(getComputedStyle(s).height),x:parseFloat(e.style.left),scaled:b.width/z,visible:b.left>=r.left-1&&b.right<=r.right+1}})})()`);
    assert.deepEqual(dom.map(f=>[f.width,f.height,f.x]),[[1440,900,0],[768,1024,1520],[390,844,2368]]); assert.ok(dom.every(f=>f.visible));
    dom.forEach((f,i)=>assert.ok(Math.abs(f.scaled-frames[i].width)<.1));
    assert.ok(frames.every(f => f.root.props.maxWidth === 'full'));
    const roots = await evaluate(`(()=>{return [...document.querySelectorAll('[data-frame-surface]')].map(s=>{const e=s.querySelector('[data-page-node]'),r=e.getBoundingClientRect(),f=s.getBoundingClientRect(),c=getComputedStyle(e);return {fills:Math.abs(r.width-f.width)<.1&&Math.abs(r.x-f.x)<.1,max:c.maxWidth,padding:c.paddingInlineStart,paddingEnd:c.paddingInlineEnd}})})()`);
    assert.ok(roots.every(r=>r.fills&&r.max==='none'&&r.padding==='0px'&&r.paddingEnd==='0px'));
    assert.equal(await evaluate(`document.querySelectorAll('main:not([hidden])').length`),1);
  });
  await check('frame rename/valid geometry drafts/custom preset/duplicate preserve independent roots', async () => {
    await click(frameTitle(webFrame)); await fill('[aria-label="Frame name"]','Desktop'); await click(q('[aria-label="Frame width"]'));
        assert.equal((await project(first)).pages[0].frames[0].name,'Desktop');
    const before = await project(first); await fill('[aria-label="Frame width"]','-');
    await click(q('[aria-label="Frame height"]')); assert.deepEqual(await project(first),before);
    await fill('[aria-label="Frame width"]','1200.5'); await click(q('[aria-label="Frame height"]'));
    let doc = await project(first); assert.equal(doc.pages[0].frames[0].width,1200.5); assert.equal(doc.pages[0].frames[0].preset,'custom');
    assert.deepEqual(doc.pages[0].frames[0].root,before.pages[0].frames[0].root); assert.deepEqual(doc.pages[0].frames.slice(1),before.pages[0].frames.slice(1));
    await click(named('#project-inspector button','Duplicate frame')); doc = await project(first);
    const copy=doc.pages[0].frames[3]; assert.notEqual(copy.id,webFrame); assert.notEqual(copy.root.id,doc.pages[0].frames[0].root.id); assert.equal(copy.width,1200.5); assert.equal(copy.name,'Desktop copy');
    await addFrame('Custom'); assert.equal((await project(first)).pages[0].frames[4].preset,'custom');
    await click(q('[aria-label="Undo project edit"]')); await click(q('[aria-label="Undo project edit"]'));
    assert.equal((await project(first)).pages[0].frames.length,3); assert.equal(await evaluate(`!!${q('[aria-label="Frame name"]')}`),false);
  });
  await check('camera wheel pan/anchored zoom/Fit stay session-only and do not touch project bytes', async () => {
    const before=await project(first),rev=await revision(); await fit();
    await click(q('[aria-label="Interactive frame canvas"]')); const old=await cameraState();
    const point=await evaluate(`(()=>{const r=${q('[aria-label="Interactive frame canvas"]')}.getBoundingClientRect();return {x:Math.round(r.x+r.width*.7),y:Math.round(r.y+r.height*.5),left:r.left,top:r.top}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:30,deltaY:45});
    await wait(`Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraX) === ${old.x-30}`);
    const pan=await cameraState(); assert.equal(pan.y,old.y-45);
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:-80,modifiers:2});
    await wait(`Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraZoom) > ${pan.zoom}`);
    const next=await cameraState(),px=point.x-point.left,py=point.y-point.top;
    assert.ok(Math.abs((px-pan.x)/pan.zoom-(px-next.x)/next.zoom)<.01,JSON.stringify({point,pan,next})); assert.ok(Math.abs((py-pan.y)/pan.zoom-(py-next.y)/next.zoom)<.01,JSON.stringify({point,pan,next}));
    await fit(); await click(frameTitle(webFrame)); await fit(true);
    assert.deepEqual(await project(first),before); assert.equal(await revision(),rev);
    await reload(); assert.equal((await cameraState()).zoom,.5); assert.deepEqual(await project(first),before);
  });
  await check('title drag previews without writes, drop is one save/undo and reload retains geometry', async () => {
    await fit(); const before=await project(first),rev=await revision(),cam=await cameraState(),point=await framePoint(webFrame);
    await movePointer(point,40,30); assert.equal(await revision(),rev); assert.deepEqual(await project(first),before);
    const preview=await evaluate(`parseFloat(${q(`[data-frame-id="${webFrame}"]`)}.style.left)`); assert.ok(preview>before.pages[0].frames[0].x);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+40,y:point.y+30,button:'left',clickCount:1});
    await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix+first)})).revision === ${rev+1}`);
    const moved=await project(first); assert.ok(Math.abs(moved.pages[0].frames[0].x-before.pages[0].frames[0].x-40/cam.zoom)<.01);
    assert.deepEqual(moved.pages[0].frames[0].root,before.pages[0].frames[0].root); assert.deepEqual(moved.pages[0].frames.slice(1),before.pages[0].frames.slice(1));
    await click(q('[aria-label="Undo project edit"]')); assert.deepEqual(await project(first),before);
    await click(q('[aria-label="Redo project edit"]')); assert.deepEqual(await project(first),moved); await reload(); assert.deepEqual(await project(first),moved);
  });
  await check('click threshold, Escape/pointercancel/blur rollback and Space/middle pan never move frames', async () => {
    await fit(); const before=await project(first),rev=await revision();
    let point=await framePoint(webFrame); await movePointer(point,2,1); await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+2,y:point.y+1,button:'left',clickCount:1});
    for (const cancel of ['escape','pointercancel','blur']) {
      point=await framePoint(webFrame); await movePointer(point,25,20);
      if (cancel==='escape') await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
      else await evaluate(`${q('[aria-label="Interactive frame canvas"]')}${cancel==='pointercancel' ? ".dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1}))" : ";window.dispatchEvent(new Event('blur'))"}`);
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+25,y:point.y+20,button:'left',clickCount:1});
      await wait(`!${q('[aria-label="Interactive frame canvas"]')}.dataset.gesture`);
      assert.ok(Math.abs(await evaluate(`parseFloat(${q(`[data-frame-id="${webFrame}"]`)}.style.left)`)-before.pages[0].frames[0].x)<.001);
    }
    const panPoint=await evaluate(`(()=>{const r=${q('[aria-label="Interactive frame canvas"]')}.getBoundingClientRect();return {x:r.right-20,y:r.bottom-20}})()`);
    await click(q('[aria-label="Interactive frame canvas"]')); const cam=await cameraState();
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'}); await movePointer(panPoint,20,15); await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:panPoint.x+20,y:panPoint.y+15,button:'left'}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});
    await wait(`Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraX) === ${cam.x+20}`);
    const mid=await cameraState(); await movePointer(panPoint,-15,-10,'middle'); await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:panPoint.x-15,y:panPoint.y-10,button:'middle'});
    await wait(`Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraX) === ${mid.x-15}`);
    assert.deepEqual(await project(first),before); assert.equal(await revision(),rev);
  });
  await check('stored component fixture paints linked system and chosen theme, not editor activeId; rebind preserves roots', async () => {
    await evaluate(`(()=>{const key=${JSON.stringify(documentPrefix+first)},env=JSON.parse(localStorage.getItem(key)),f=env.document.pages[0].frames[0];f.root.children=[{id:'fixtureStack',kind:'stack',children:[{id:'fixtureText',kind:'text',text:'Stored component fixture'},{id:'fixtureInput',kind:'input',props:{label:'Fixture email',name:'email',type:'email'}},{id:'fixtureButton',kind:'button',text:'Fixture action'}]}];env.revision++;localStorage.setItem(key,JSON.stringify(env));const systems=JSON.parse(localStorage.getItem('bambiui.systems.v1'));const original=systems.systems.find(e=>e.id===${JSON.stringify(originalSystem)}),other=systems.systems.find(e=>e.id===${JSON.stringify(otherSystem)});original.system.themes.light.fontFamily=original.system.themes.dark.fontFamily='mono';other.system.themes.light.fontFamily=other.system.themes.dark.fontFamily='serif';original.system.themes.light.global.background='#fff1e0';original.system.themes.dark.global.background='#171a24';other.system.themes.light.global.background='#e2f4ee';other.system.themes.dark.global.background='#222b27';systems.activeId=${JSON.stringify(otherSystem)};localStorage.setItem('bambiui.systems.v1',JSON.stringify(systems))})()`);
    await reload(); await wait(`${q('[data-page-node="fixtureButton"]')}`);
    assert.equal(await evaluate(`${q('[data-frame-surface]')}.style.getPropertyValue('--ds-background')`),'#fff1e0');
    assert.equal(await evaluate(`getComputedStyle(${q('[data-frame-surface]')}).backgroundColor`),'rgb(255, 241, 224)');
        assert.match(await evaluate(`getComputedStyle(${q('[data-frame-surface]')}).fontFamily`),/monospace/);
        assert.match(await evaluate(`getComputedStyle(${q('[data-frame-title]')}).fontFamily`),/system-ui/);
    assert.equal(await evaluate(`getComputedStyle(${q('[data-page-node="'+(await project(first)).pages[0].frames[0].root.id+'"]')}).maxWidth`),'none');
    await select('[aria-label="Frame theme"]','dark'); await wait(`${q('[data-frame-surface]')}.dataset.dsTheme === 'dark'`);
    assert.ok(await evaluate(`[...document.querySelectorAll('[data-frame-surface]')].every(e=>e.style.getPropertyValue('--ds-background')==='#171a24')`));
    const before=await project(first); await select('[aria-label="Project design system"]',otherSystem); await click(named('#project-inspector button','Preview system change')); await click(named('[role="dialog"] button','Confirm system change'));
    assert.deepEqual(await project(first),{...before,systemId:otherSystem});
    assert.ok(await evaluate(`[...document.querySelectorAll('[data-frame-surface]')].every(e=>e.style.getPropertyValue('--ds-background')==='#222b27')`));
        assert.match(await evaluate(`getComputedStyle(${q('[data-frame-surface]')}).fontFamily`),/serif/);
    await click(q('[aria-label="Undo project edit"]')); assert.deepEqual(await project(first),before);
    assert.equal(await evaluate(`${q('[data-frame-surface]')}.style.getPropertyValue('--ds-background')`),'#171a24');
    await select('[aria-label="Frame theme"]','light');
  });
  let c06Frames, c06Tokens;
  const scoped = (frame, selector) => q(`[data-frame-id="${frame}"] ${selector}`);
  const instance = () => q('[aria-label="Instance settings"]');
  const enter = async () => { await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}); await delay(60); };
  const selectedOutline = (frame) => scoped(frame, '[data-node-overlay="selected"]');
  await check('C06 fixture seeds both full frames with seven real kinds and identical node IDs', async () => {
    await evaluate(`(()=>{const key=${JSON.stringify(documentPrefix+first)},env=JSON.parse(localStorage.getItem(key));env.document.pages[0].frames=env.document.pages[0].frames.slice(0,2);env.document.pages[0].frames.forEach((f,i)=>{f.x=i?1520:0;f.y=0;f.width=i?390:1440;f.height=844;f.preset='custom';f.root={id:'fixtureRoot',kind:'container',props:{maxWidth:'full'},children:[{id:'fixtureForm',kind:'form',props:{action:'/preview-blocked'},children:[{id:'fixtureStack',kind:'stack',props:{gap:'md'},children:[{id:'fixtureText',kind:'text',text:i?'Mobile heading':'Web heading'},{id:'fixtureInput',kind:'input',props:{label:'Fixture email',name:'email',defaultValue:'initial'}},{id:'fixtureSwitch',kind:'switch',props:{label:'Fixture switch',name:'choice',defaultChecked:false}},{id:'fixtureCheckbox',kind:'checkbox',props:{label:'Fixture checkbox',name:'check'}},{id:'fixtureButton',kind:'button',text:'Fixture action',props:{type:'submit'}},{id:'fixtureBadge',kind:'badge',text:'Fixture status'},{id:'fixtureCard',kind:'card',children:[{id:'fixtureHeader',kind:'cardHeader',children:[{id:'fixtureTitle',kind:'cardTitle',text:'Card title'}]},{id:'fixtureContent',kind:'cardContent',children:[{id:'fixtureBody',kind:'text',text:'Card body'}]}]}]}]}]}});env.revision++;localStorage.setItem(key,JSON.stringify(env))})()`);
    await reload(); await wait(`${q('[data-page-node="fixtureSwitch"]')}`); c06Frames=(await project(first)).pages[0].frames.map(f=>f.id); c06Tokens=await catalog();
    await fit();
    await click(scoped(c06Frames[1],'[data-frame-title]')); await fit(true);
    assert.equal(await evaluate(`document.querySelectorAll('[data-page-node="fixtureButton"]').length`),2);
  });
  await check('C06 Design selects real Input/Button/Switch without activation, typing or layout shift', async () => {
    const frame=c06Frames[1], before=await project(first);
    const bounds=await evaluate(`(()=>{const r=${scoped(frame,'[data-page-node="fixtureInput"]')}.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`);
    await click(scoped(frame,'input[data-page-node="fixtureInput"]')); await assertParameters('Input');
    assert.notEqual(await evaluate('document.activeElement.tagName'),'INPUT');
    await send('Input.insertText',{text:'blocked'}); assert.equal(await evaluate(`${scoped(frame,'input[data-page-node="fixtureInput"]')}.value`),'initial');
    await click(scoped(frame,'[data-page-node="fixtureSwitch"][role="switch"]')); await assertParameters('Switch');
    assert.equal(await evaluate(`${scoped(frame,'[role="switch"]')}.getAttribute('aria-checked')`),'false');
    await click(scoped(frame,'[data-page-node="fixtureButton"]')); await assertParameters('Button');
    assert.equal(await evaluate('location.pathname'),'/pages'); assert.deepEqual(await project(first),before);
    assert.deepEqual(await evaluate(`(()=>{const r=${scoped(frame,'[data-page-node="fixtureInput"]')}.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`),bounds);
    await evaluate(`${scoped(frame,'[data-page-node="fixtureButton"]')}.focus()`);
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Interactive frame canvas');
    await enter(); assert.equal(await evaluate('location.pathname'),'/pages');
  });
  await check('C06 hover and selection outlines stay aligned after zoom/pan without layout writes', async () => {
    const frame=c06Frames[1], before=await project(first);
    await click(q('[aria-label="Zoom in"]'));
    await evaluate(`${q('[aria-label="Interactive frame canvas"]')}.focus()`);
    const point=await evaluate(`(()=>{const r=${q('[aria-label="Interactive frame canvas"]')}.getBoundingClientRect();return{x:r.x+50,y:r.y+50}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:24,deltaY:12}); await delay(80);
    const target=await evaluate(`(()=>{const r=${scoped(frame,'[data-page-node="fixtureButton"]')}.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...target});
    await wait(`!${selectedOutline(frame)}.hidden`);
    const delta=await evaluate(`(()=>{const a=${scoped(frame,'[data-page-node="fixtureButton"]')}.getBoundingClientRect(),b=${selectedOutline(frame)}.getBoundingClientRect();return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.width-b.width),Math.abs(a.height-b.height))})()`);
    assert.ok(delta<1,`overlay mismatch ${delta}`); assert.deepEqual(await project(first),before);
    const hoverTarget=await evaluate(`(()=>{const r=${scoped(frame,'input[data-page-node="fixtureInput"]')}.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...hoverTarget}); await wait(`!${scoped(frame,'[data-node-overlay="hover"]')}.hidden`);
    assert.match(await evaluate(`${scoped(frame,'[data-node-overlay="hover"]')}.textContent`),/Input/);
  });
  await check('C06 mobile instance edits preserve web/shared IDs/tokens; drafts, radius, false and undo validate', async () => {
    const frame=c06Frames[1], before=await project(first), tokens=await catalog();
    await click(scoped(frame,'[data-page-node="fixtureButton"]'));
    await fill('[aria-label="Instance text"]',''); await enter();
    assert.ok(await evaluate(`!!${instance()}.querySelector('[role="alert"]')`)); assert.deepEqual(await project(first),before);
        assert.equal(await evaluate(`!!${q('[aria-label="Clear instance radius"]')}`),false,'No reset icon before a radius override exists');
    await fill('[aria-label="Instance text"]','Native draft');
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:4,commands:['undo']}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:4});
        assert.deepEqual(await project(first),before); assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Instance text');
        await fill('[aria-label="Instance text"]','Mobile only'); await enter();
    const edited=await project(first); assert.deepEqual(edited.pages[0].frames[0],before.pages[0].frames[0]);
    assert.equal(edited.pages[0].frames[1].root.children[0].children[0].children[4].text,'Mobile only');
    assert.equal(edited.pages[0].frames[1].root.children[0].children[0].children[4].id,'fixtureButton'); assert.equal(await catalog(),tokens);
    await select('[aria-label="Instance radius"]','lg'); await select('[aria-label="Instance disabled"]','false');
    assert.equal((await project(first)).pages[0].frames[1].root.children[0].children[0].children[4].props.disabled,false);
    assert.equal(await evaluate(`${scoped(frame,'[data-page-node="fixtureButton"]')}.dataset.radius`),'lg');
    await click(q('[aria-label="Clear instance radius"]')); assert.ok(!Object.hasOwn((await project(first)).pages[0].frames[1].root.children[0].children[0].children[4].props,'radius'));
        assert.equal(await evaluate(`!!${q('[aria-label="Clear instance radius"]')}`),false,'Clearing removes the reset icon');
    await click(q('[aria-label="Undo project edit"]')); assert.equal(await evaluate(`${scoped(frame,'[data-page-node="fixtureButton"]')}.dataset.radius`),'lg');
    assert.equal(await catalog(),tokens);
  });
  await check('C06 keyboard layers, parent/breadcrumb, Escape and undo fallback remain frame scoped', async () => {
    const frame=c06Frames[1];
    await click(named('#project-inspector button','Select parent')); assert.equal(await evaluate(`${q('[aria-label="Instance settings"] h3')}.textContent`),'StackLayout settings');
    assert.equal(await evaluate(`!!${q('[aria-label="Instance settings"] [aria-label="Local appearance"]')}`),true,'layouts retain appearance controls');
    await click(named('[aria-label="Selection path"] button','Container')); assert.equal(await evaluate(`${q('[aria-label="Instance settings"] h3')}.textContent`),'ContainerLayout settings');
    await chooseLayer(frame, 'fixtureInput'); await wait(`${instanceKind()}==='Input'`);
    await fill('[aria-label="Instance label"]',''); await enter(); assert.ok(await evaluate(`!!${instance()}.querySelector('[role="alert"]')`));
    await fill('[aria-label="Instance label"]','Mobile email'); await enter();
    await fill('[aria-label="Instance name"]','bad name'); await enter(); assert.ok(await evaluate(`!!${instance()}.querySelector('[role="alert"]')`));
    await fill('[aria-label="Instance name"]','mobile_email'); await enter();
    await evaluate(`${q('[aria-label="Interactive frame canvas"]')}.focus()`); await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
    await wait(`${instanceKind()}!=='Input'`);
    await fit(true); await click(scoped(frame,'[data-frame-title]')); await click(named('#project-inspector button','Duplicate frame'));
    const duplicate=(await project(first)).pages[0].frames.at(-1);
    await chooseLayer(duplicate.id, duplicate.root.id);
    assert.equal(await evaluate(`${q('[aria-label="Instance settings"] h3')}.textContent`),'ContainerLayout settings');
    await click(q('[aria-label="Undo project edit"]')); await wait(`${instanceKind()}!=='Container'`);
    assert.equal((await project(first)).pages[0].frames.length,2);
    await click(scoped(frame,'[data-frame-title]')); await fit(true);
  });
  await check('C06 binding drafts replace controlled/default pairs atomically and clearing removes only the override', async () => {
    await chooseLayer(c06Frames[1], 'fixtureInput');
    const before=await project(first), tokens=await catalog(), rev=await revision();
    await fill('[aria-label="Instance value"]','Snapshot'); await enter();
    let field=(await project(first)).pages[0].frames[1].root.children[0].children[0].children[1];
    assert.equal(field.props.value,'Snapshot'); assert.ok(!Object.hasOwn(field.props,'defaultValue')); assert.equal(await revision(),rev+1);
    await click(q('[aria-label="Undo project edit"]')); assert.deepEqual(await project(first),before);
    await fill('[aria-label="Instance defaultValue"]','Preview initial'); await enter();
    await click(q('[aria-label="Clear instance defaultValue"]'));
    field=(await project(first)).pages[0].frames[1].root.children[0].children[0].children[1]; assert.ok(!Object.hasOwn(field.props,'defaultValue')); assert.ok(!Object.hasOwn(field.props,'value'));
    await click(q('[aria-label="Undo project edit"]')); assert.equal((await project(first)).pages[0].frames[1].root.children[0].children[0].children[1].props.defaultValue,'Preview initial');
    assert.equal(await catalog(),tokens);
  });
  await check('C06 Preview enables native controls but prevents forms/navigation and never edits project data', async () => {
    const frame=c06Frames[1], before=await project(first), origin=await evaluate('performance.timeOrigin');
    await click(modeButton('Preview')); await wait(`${scoped(frame,'[data-frame-surface]')}.dataset.editorMode==='preview'`);
    await fill(`[data-frame-id="${frame}"] input[data-page-node="fixtureInput"]`,'preview edit');
    assert.equal(await evaluate(`${scoped(frame,'input[data-page-node="fixtureInput"]')}.value`),'preview edit');
    await click(scoped(frame,'[role="switch"]')); assert.equal(await evaluate(`${scoped(frame,'[role="switch"]')}.getAttribute('aria-checked')`),'true');
    await evaluate(`window.c06Submitted=[];document.addEventListener('submit',e=>setTimeout(()=>window.c06Submitted.push(e.defaultPrevented),0),true)`);
    await click(scoped(frame,'[data-page-node="fixtureButton"]')); await wait('window.c06Submitted.length===1');
    assert.deepEqual(await evaluate('window.c06Submitted'),[true]); assert.equal(previewRequests,0); assert.equal(await evaluate('location.pathname'),'/pages'); assert.equal(await evaluate('performance.timeOrigin'),origin);
    assert.deepEqual(await project(first),before); assert.equal(await catalog(),c06Tokens);
    assert.equal(await evaluate(`${scoped(frame,'[data-node-overlay="selected"]')}`),null);
    await click(modeButton('Design'));
  });
  await check('C06 clipped selection shows only the visible intersection, fully hidden layers show no outline', async () => {
    const frame=c06Frames[1]; await click(scoped(frame,'[data-frame-title]'));
    await fill('[aria-label="Frame height"]','160'); await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
    await chooseLayer(frame, 'fixtureStack'); await wait(`!${selectedOutline(frame)}.hidden`);
    assert.ok(await evaluate(`(()=>{const a=${selectedOutline(frame)}.getBoundingClientRect(),b=${scoped(frame,'[data-frame-surface]')}.getBoundingClientRect();return a.bottom<=b.bottom+.5&&a.top>=b.top-.5})()`));
    await chooseLayer(frame, 'fixtureTitle'); await wait(`${selectedOutline(frame)}.hidden`);
    await click(q('[aria-label="Undo project edit"]')); await wait(`!${selectedOutline(frame)}.hidden`);
  });
  await check('C06 instance system link activates the linked kind; shared color edit repaints both frames without project changes', async () => {
    const before=await project(first);
    await chooseLayer(c06Frames[1], 'fixtureButton');
    await click(named('#project-inspector button','Edit styles in System')); await wait(`location.pathname==='/button' && !${q('#token-editor')}.hidden`);
    assert.equal((JSON.parse(await catalog())).activeId,originalSystem);
    await click(q('.studio-sidebar a[href="/colors"]')); await wait(`location.pathname==='/colors' && ${q('#token-background')}`);
    await fill('#token-background','#e4edf2');
    await wait(`JSON.parse(localStorage.getItem('bambiui.systems.v1')).systems.find(e=>e.id===${JSON.stringify(originalSystem)}).system.themes.light.global.background==='#e4edf2'`);
    await projectWorkspace(); await click(q('[aria-label="Pages"] a')); await pages();
    await wait(`[...document.querySelectorAll('[data-frame-surface]')].every(e=>getComputedStyle(e).backgroundColor==='rgb(228, 237, 242)')`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-frame-surface]').length`),2); assert.deepEqual(await project(first),before);
  });
  let c07Project, c07Frame;
  const c07Revision = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix+c07Project)})).revision`);
  const palette = kind => q(`[data-insert-kind="${kind}"]`);
  const node = id => q(`[data-frame-id="${c07Frame}"] [data-page-node="${id}"]`);
  async function paletteDrag(kind, target, cancel) {
    await sidebar('Assets');
    await evaluate(`(${palette(kind)}).scrollIntoView({block:'nearest',behavior:'instant'})`);
    const start=await evaluate(`(()=>{const r=${palette(kind)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const end=await canvasPoint(`(()=>{const r=(${target}).getBoundingClientRect(),v=${q('[aria-label="Interactive frame canvas"]')}.getBoundingClientRect();return {x:Math.max(r.x,v.x)+Math.min(r.width,80)/2,y:Math.max(r.y,v.y)+Math.min(r.height,40)/2}})()`);
    const before=await project(c07Project), rev=await c07Revision();
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});
    await wait(`document.querySelector('[data-insertion-valid]')`);
    assert.deepEqual(await project(c07Project),before); assert.equal(await c07Revision(),rev);
    const valid=await evaluate(`document.querySelector('[data-insertion-valid]').dataset.insertionValid`);
        if (valid==='false' && !cancel) console.log('DROP rejected',kind,await evaluate(`document.querySelector('[data-insertion-valid]').textContent`));
    if(cancel==='escape') await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    if(cancel==='blur') await evaluate(`window.dispatchEvent(new Event('blur'))`);
    if(cancel==='pointercancel') await evaluate(`document.querySelector('[data-insert-kind="${kind}"]').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1}))`);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});
    await wait(`!document.querySelector('[data-insertion-valid]')`);
    if(cancel || valid==='false') { assert.deepEqual(await project(c07Project),before); assert.equal(await c07Revision(),rev); }
    else await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix+c07Project)})).revision===${rev+1}`);
    return {before,valid};
  }
  await check('C07 visible palette builds Button → Grid → Card cell from a blank project; each drop one save/undo',async()=>{
    c07Project=await createProject('Palette build'); await click(q('[aria-label="Add page"]')); await addFrame('Mobile');
    c07Frame=(await project(c07Project)).pages[0].frames[0].id;
    const surface=q(`[data-frame-id="${c07Frame}"] [data-frame-surface]`);
    const camera=await cameraState(); const result=await paletteDrag('button',surface);
    let root=(await project(c07Project)).pages[0].frames[0].root;
    assert.equal(root.children[0].kind,'stack'); assert.equal(root.children[0].children[0].kind,'button');
    await assertParameters('Button');
    assert.deepEqual(await cameraState(),camera);
    await click(q('[aria-label="Undo project edit"]')); assert.deepEqual(await project(c07Project),result.before); await click(q('[aria-label="Redo project edit"]'));
    // Blank root space remains a visible exact root slot, not a layer command.
    const rootArea=`({getBoundingClientRect(){const r=${surface}.getBoundingClientRect();return {x:r.x+10,y:r.y+100,width:80,height:40}}})`;
    await paletteDrag('grid',rootArea); root=(await project(c07Project)).pages[0].frames[0].root;
    const grid=root.children[1]; assert.equal(grid.kind,'grid');
    await paletteDrag('card',node(grid.id)); root=(await project(c07Project)).pages[0].frames[0].root;
    assert.equal(root.children[1].children[0].kind,'gridItem'); assert.equal(root.children[1].children[0].children[0].kind,'card');
    const card=root.children[1].children[0].children[0];
    assert.deepEqual(card.children.map(child=>child.kind),['cardHeader','cardContent','cardFooter']);
    const [header,content,footer]=card.children;
    assert.deepEqual(header.children.map(child=>child.kind),['cardTitle','cardDescription']);
    assert.equal(content.children[0].kind,'text'); assert.equal(footer.children[0].kind,'button');
    for(const child of [...header.children,...content.children,...footer.children]) assert.ok(child.text?.trim(),'starter copy is populated');
    await assertParameters('Card');
    for(const name of ['Card.Title','Card.Description','Text','Button']) assert.ok(await evaluate(`!!${q(`[aria-label="Select ${name} layer"]`)}`),`direct ${name} layer navigation`);
    await click(q('[aria-label="Select Card.Content layer"]'));await assertParameters('Card.Content');await click(palette('text'));
    const bodyBefore=(await project(c07Project)).pages[0].frames[0].root.children[1].children[0].children[0].children.find(child=>child.kind==='cardContent');
    assert.equal(bodyBefore.children.length,2);assert.deepEqual(bodyBefore.children[0],content.children[0]);
    // Drop on the actual Content gap, not either populated Text leaf.
    const bodyGap=`({getBoundingClientRect(){const a=${node(bodyBefore.children[0].id)}.getBoundingClientRect(),b=${node(bodyBefore.children[1].id)}.getBoundingClientRect();return {x:a.x+4,y:(a.bottom+b.top)/2,width:0,height:0}}})`;
    const bodyDrop=await paletteDrag('text',bodyGap); assert.equal(bodyDrop.valid,'true');
    const updated=(await project(c07Project)).pages[0].frames[0].root.children[1].children[0].children[0];
    const updatedContent=updated.children.find(child=>child.kind==='cardContent');
    assert.equal(updatedContent.children.length,3);
    assert.deepEqual(updatedContent.children[0],bodyBefore.children[0]);assert.deepEqual(updatedContent.children[2],bodyBefore.children[1]);assert.equal(updatedContent.children[1].kind,'text');
    assert.deepEqual(updated.children.find(child=>child.kind==='cardHeader'),header);
    assert.deepEqual(updated.children.find(child=>child.kind==='cardFooter'),footer);
  });
  await check('C07 invalid leaf, Escape/pointercancel/blur, foreign native drag and Preview preserve bytes',async()=>{
    const root=(await project(c07Project)).pages[0].frames[0].root, button=root.children[0].children[0];
    await click(node(button.id)); const invalid=await paletteDrag('card',node(button.id)); assert.equal(invalid.valid,'false');
    for(const cancel of ['escape','pointercancel','blur']) await paletteDrag('badge',node(root.id),cancel);
    const before=await project(c07Project), rev=await c07Revision();
    await evaluate(`(()=>{const dt=new DataTransfer();dt.setData('application/json',JSON.stringify({kind:'button'}));const e=${node(root.id)};e.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:dt}));e.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}))})()`);
    assert.deepEqual(await project(c07Project),before); assert.equal(await c07Revision(),rev);
    await click(modeButton('Preview')); assert.equal(await evaluate(`${palette('button')}.disabled`),true); await click(modeButton('Design'));
  });
  await check('C07 selected row slot and palette mouse drops at 50/100/150/400% after pan',async()=>{
    const root=(await project(c07Project)).pages[0].frames[0].root, stack=root.children[0];
    await click(node(stack.children[0].id)); await click(named('#project-inspector button','Select parent'));
    await select('[aria-label="Instance direction"]','row');
    // Visible keyboard insertion uses the selected exact slot; pointer drops never inherit it.
    await evaluate(`${palette('button')}.scrollIntoView({block:'nearest'});${palette('button')}.focus()`); await enter();
    assert.equal((await project(c07Project)).pages[0].frames[0].root.children[0].children.length,2);
    for(const zoom of [.5,1,1.5,4]) {
      await evaluate(`${q('[aria-label="Interactive frame canvas"]')}.focus({preventScroll:true})`);
      let cam=await cameraState(); const p=await evaluate(`(()=>{const r=${q('[aria-label="Interactive frame canvas"]')}.getBoundingClientRect();return {x:r.x+r.width*.7,y:r.y+r.height*.5}})()`);
      await send('Input.dispatchMouseEvent',{type:'mouseWheel',...p,deltaX:0,deltaY:-Math.log(zoom/cam.zoom)/.002,modifiers:2});
      await wait(`Math.abs(Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraZoom)-${zoom})<.001`);
      cam=await cameraState(); await send('Input.dispatchMouseEvent',{type:'mouseWheel',...p,deltaX:cam.x-20,deltaY:cam.y-140});
      await wait(`Math.abs(Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraX)-20)<.01`);
      const children=(await project(c07Project)).pages[0].frames[0].root.children[0].children;
      // The painted gap, not a child leaf or selected-ancestor fallback, is the exact Stack slot.
      const gap=`({getBoundingClientRect(){const a=${node(children[0].id)}.getBoundingClientRect(),b=${node(children[1].id)}.getBoundingClientRect();return {x:(a.right+b.left)/2,y:a.y,width:0,height:Math.min(a.height,20)}}})`;
      const result=await paletteDrag('badge',gap); assert.equal(result.valid,'true');
      assert.equal((await project(c07Project)).pages[0].frames[0].root.children[0].children[1].kind,'badge');
    }
    await openProject('Alpha',first);
  });
  await check('C07 all nine palette entries insert by real mouse into full empty-root geometry and select the inserted node',async()=>{
    c07Project=await createProject('All palette entries'); await click(q('[aria-label="Add page"]')); await addFrame('Mobile');
    // All populated starters fit with a real blank root drop area below the content.
    await fill('[aria-label="Frame height"]','1600'); await enter(); await fit(true);
    c07Frame=(await project(c07Project)).pages[0].frames[0].id;
    const surface=q(`[data-frame-id="${c07Frame}"] [data-frame-surface]`);
    const blank=`({getBoundingClientRect(){const r=${surface}.getBoundingClientRect();return {x:r.x+20,y:r.bottom-50,width:40,height:20}}})`;
    assert.equal(await evaluate(`Math.abs(${node((await project(c07Project)).pages[0].frames[0].root.id)}.getBoundingClientRect().height-${surface}.getBoundingClientRect().height)<1`),true);
    const tokenBytes=await catalog();
    for(const kind of ['button','input','switch','checkbox','badge','card','text','stack','grid']) {
      const result=await paletteDrag(kind,blank); assert.equal(result.valid,'true');
      const root=(await project(c07Project)).pages[0].frames[0].root;
      const last=root.children.at(-1), inserted=['button','input','switch','checkbox'].includes(kind)?last.children[0]:last;
      assert.equal(inserted.kind,kind);
      assert.equal(inserted.appearance,undefined); assert.equal(inserted.parts,undefined);
      if(['stack','grid'].includes(kind)) assert.deepEqual(inserted.children,[]);
      else {
        assert.equal(inserted.props.size,'md');
        if(['input','switch','checkbox'].includes(kind)) { assert.ok(inserted.props.label.trim()); assert.ok(inserted.props.description.trim()); assert.equal(inserted.props.name,inserted.id); }
        else if(kind==='card') assert.deepEqual(inserted.children.map(child=>child.kind),['cardHeader','cardContent','cardFooter']);
        else assert.ok(inserted.text.trim());
      }
      assert.equal(await evaluate(`${layer(c07Frame, inserted.id)}?.getAttribute('aria-selected')`),'true');
            assert.equal(await evaluate(`${layer(c07Frame, inserted.id)}?.tagName`),'LI');
      assert.equal(await catalog(),tokenBytes);
    }
  });
  await check('C07 explicit Card body hint, selected-leaf rejection and visible keyboard insertion are exact slots',async()=>{
    const root=(await project(c07Project)).pages[0].frames[0].root, card=root.children.find(n=>n.kind==='card'), stack=root.children.find(n=>n.kind==='stack');
    // Card border/padding addresses Card, not its Content; the adapter explicitly reports body append.
    const edge=`({getBoundingClientRect(){const r=${node(card.id)}.getBoundingClientRect();return {x:r.x+2,y:r.y+2,width:0,height:0}}})`;
    await paletteDrag('text',edge);
    assert.match(await evaluate(`${q('[aria-label="Page canvas"]')}.textContent`),/existing Card.Content/);
    const content=(await project(c07Project)).pages[0].frames[0].root.children.find(n=>n.id===card.id).children.find(n=>n.kind==='cardContent');
    const originalContent=card.children.find(n=>n.kind==='cardContent');
    assert.deepEqual(content.children.slice(0,-1),originalContent.children); assert.equal(content.children.length,originalContent.children.length+1); assert.equal(content.children.at(-1).kind,'text');
    await click(node(stack.children[0].id));await click(named('#project-inspector button','Select parent'));
    const invalid=await paletteDrag('badge',node(stack.children[0].id));assert.equal(invalid.valid,'false');
    const before=await project(c07Project),rev=await c07Revision();
    await evaluate(`${palette('input')}.scrollIntoView({block:'nearest'});${palette('input')}.focus()`);await enter();
    await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix+c07Project)})).revision===${rev+1}`);
    const updated=(await project(c07Project)).pages[0].frames[0].root.children.find(n=>n.id===stack.id);assert.equal(updated.children.at(-1).kind,'input');
    await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c07Project),before);await click(q('[aria-label="Redo project edit"]'));
  });
  await check('C07 page/project session interruption aborts captured palette drag without insertion or stored edits',async()=>{
    await click(q('[aria-label="Add page"]'));await click(named('[aria-label="Pages"] a','Page 1'));
    const before=await project(c07Project),rev=await c07Revision();
    const surface=q(`[data-frame-id="${c07Frame}"] [data-frame-surface]`);
    for(const reason of ['page','project']) {
      await sidebar('Assets');
      await evaluate(`${palette('badge')}.scrollIntoView({block:'nearest'})`);
      const start=await evaluate(`(()=>{const r=${palette('badge')}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      const end=await evaluate(`(()=>{const r=${surface}.getBoundingClientRect();return {x:r.x+30,y:r.bottom-50}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});await wait(`document.querySelector('[data-insertion-valid]')`);
      // Deliberate session interruption while the mouse is captured. The mounted page
            // link is inactive under Assets; switching tabs first would test tab-unmount cancellation instead.
            if(reason==='page') {await evaluate(`${named('[aria-label="Pages"] a','Page 2',true)}.click()`);await wait(`${q('[aria-label="Page canvas"]')}.dataset.pageId!==${JSON.stringify(before.pages[0].id)}`);await evaluate(`${named('[aria-label="Pages"] a','Page 1',true)}.click()`);}
      else {await evaluate(`${named('details button','Alpha')}.click()`);await wait(`${q('[aria-label="Page canvas"]')}.dataset.projectId===${JSON.stringify(first)}`);await evaluate(`${named('details button','All palette entries')}.click()`);await wait(`${q('[aria-label="Page canvas"]')}.dataset.projectId===${JSON.stringify(c07Project)}`);}
      await wait(`!document.querySelector('[data-insertion-valid]')`);
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});
      assert.deepEqual(await project(c07Project),before);assert.equal(await c07Revision(),rev);
    }
    await openProject('Alpha',first);
  });
  let c08Row, c08Other, c08Node, c08Second;

  const pointAt=(expression,x=.5,y=.75)=>`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width*${x},y:r.y+r.height*${y}}})()`;
  async function nodeDrag(id,endExpression,cancel) {
    const start=await evaluate(pointAt(node(id))),end=await evaluate(endExpression);
    const before=await project(c07Project),rev=await c07Revision();
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});
    await wait(`document.querySelector('[data-node-move-valid]')`);
    assert.deepEqual(await project(c07Project),before);assert.equal(await c07Revision(),rev);
    const valid=await evaluate(`document.querySelector('[data-node-move-valid]').dataset.nodeMoveValid`);

    if(cancel==='escape') await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    if(cancel==='blur') await evaluate(`window.dispatchEvent(new Event('blur'))`);
    if(cancel==='pointercancel') await evaluate(`window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}))`);
    if(cancel==='mode') await evaluate(`${modeButton('Preview')}.click()`);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});
    await wait(`!document.querySelector('[data-node-move-valid]')`);
    if(cancel||valid==='false'||JSON.stringify(await project(c07Project))===JSON.stringify(before)) {assert.deepEqual(await project(c07Project),before);assert.equal(await c07Revision(),rev);}
    else await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix+c07Project)})).revision===${rev+1}`);
    if(cancel==='mode') await click(modeButton('Design'));
    return {before,valid};
  }
  await check('C08 direct canvas threshold selects without editing; row/column reorder is one save/undo',async()=>{
    c07Project=await createProject('Canvas moves');await click(q('[aria-label="Add page"]'));await addFrame('Mobile');
    c07Frame=(await project(c07Project)).pages[0].frames[0].id;
    await click(palette('stack'));c08Row=(await project(c07Project)).pages[0].frames[0].root.children[0].id;
    await click(palette('badge'));await click(named('#project-inspector button','Select parent'));await click(palette('text'));
    let row=(await project(c07Project)).pages[0].frames[0].root.children[0];c08Node=row.children[0].id;
    await click(named('#project-inspector button','Select parent'));await select('[aria-label="Instance direction"]','row');
    await fit(true);
    const start=await evaluate(pointAt(node(c08Node))),before=await project(c07Project),rev=await c07Revision();
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+2,y:start.y,button:'left',buttons:1});await delay(50);
    assert.equal(await evaluate(`!!document.querySelector('[data-node-move-valid]')`),false);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+2,y:start.y,button:'left',clickCount:1});
    assert.deepEqual(await project(c07Project),before);assert.equal(await c07Revision(),rev);
    await assertParameters('Badge');
    const result=await nodeDrag(c08Node,pointAt(node(row.children[1].id),.9));assert.equal(result.valid,'true');
    row=(await project(c07Project)).pages[0].frames[0].root.children[0];assert.equal(row.children[1].id,c08Node);
    await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c07Project),result.before);await click(q('[aria-label="Redo project edit"]'));
    await click(named('#project-inspector button','Select parent'));await select('[aria-label="Instance direction"]','column');
    const column=await nodeDrag(c08Node,pointAt(node(row.children[0].id),.7,.15));assert.equal(column.valid,'true');
    assert.equal((await project(c07Project)).pages[0].frames[0].root.children[0].children[0].id,c08Node);
  });
  await check('C08 pointer reparent into another container preserves ID and immutable source until drop',async()=>{
    await click(frameTitle(c07Frame));await click(palette('stack'));
    c08Other=(await project(c07Project)).pages[0].frames[0].root.children[1].id;
    const result=await nodeDrag(c08Node,pointAt(node(c08Other)));assert.equal(result.valid,'true');
    const root=(await project(c07Project)).pages[0].frames[0].root;assert.equal(root.children[1].children[0].id,c08Node);assert.equal(root.children[0].children.length,1);
    await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c07Project),result.before);await click(q('[aria-label="Redo project edit"]'));
  });
  await check('C08 no-op, invalid self and Escape/pointercancel/blur/stale-mode leave storage/history untouched',async()=>{
    for(const cancel of ['escape','pointercancel','blur','mode']) await nodeDrag(c08Node,pointAt(node(c08Row)),cancel);
    const noop=await nodeDrag(c08Node,pointAt(node(c08Node),.8,.5));assert.equal(noop.valid,'true');assert.deepEqual(await project(c07Project),noop.before);
    const rev=await c07Revision(),before=await project(c07Project);
    const invalid=await nodeDrag(c08Other,pointAt(node(c08Node)));assert.equal(invalid.valid,'false');assert.deepEqual(await project(c07Project),before);assert.equal(await c07Revision(),rev);
  });
  await check('C08 cross-frame canvas move is atomic, retains ID and one Undo restores both frames',async()=>{
    await addFrame('Mobile');c08Second=(await project(c07Project)).pages[0].frames[1].id;await fit();
    const surface=q(`[data-frame-id="${c08Second}"] [data-frame-surface]`);
    const result=await nodeDrag(c08Node,pointAt(surface,.3,.2));assert.equal(result.valid,'true');
    const doc=await project(c07Project);assert.equal(doc.pages[0].frames[0].root.children[1].children.length,0);assert.equal(doc.pages[0].frames[1].root.children[0].id,c08Node);
    await assertParameters('Badge');
    await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c07Project),result.before);await click(q('[aria-label="Redo project edit"]'));assert.deepEqual(await project(c07Project),doc);
    await click(q('[aria-label="Undo project edit"]'));
  });
  await check('C08 zoom 50/100/150 reparent geometry uses painted/clipped client targets after pan',async()=>{
    for(const zoom of [.5,1,1.5]) {
      await evaluate(`${q('[aria-label="Interactive frame canvas"]')}.focus({preventScroll:true})`);
      let cam=await cameraState();const p=await evaluate(`(()=>{const r=${q('[aria-label="Interactive frame canvas"]')}.getBoundingClientRect();return {x:r.x+r.width*.7,y:r.y+r.height*.5}})()`);
      await send('Input.dispatchMouseEvent',{type:'mouseWheel',...p,deltaX:0,deltaY:-Math.log(zoom/cam.zoom)/.002,modifiers:2});await wait(`Math.abs(Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraZoom)-${zoom})<.001`);
      cam=await cameraState();await send('Input.dispatchMouseEvent',{type:'mouseWheel',...p,deltaX:cam.x-20,deltaY:cam.y-140});await wait(`Math.abs(Number(${q('[aria-label="Interactive frame canvas"]')}.dataset.cameraX)-20)<.01`);
      const result=await nodeDrag(c08Node,pointAt(node(c08Row),.8,.5));assert.equal(result.valid,'true');
      assert.equal((await project(c07Project)).pages[0].frames[0].root.children[0].children.some(n=>n.id===c08Node),true);
      await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c07Project),result.before);
    }
  });
  await check('C08 edge canvas pan refreshes target geometry, stops on Escape and never edits documents',async()=>{
    const before=await project(c07Project),rev=await c07Revision(),cam=await cameraState();
    const start=await evaluate(pointAt(node(c08Node))),end=await evaluate(`(()=>{const r=${q('[aria-label="Interactive frame canvas"]')}.getBoundingClientRect();return {x:r.right-4,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});await wait(`document.querySelector('[data-node-move-valid]')`);await delay(120);
    assert.notEqual((await cameraState()).x,cam.x);assert.deepEqual(await project(c07Project),before);assert.equal(await c07Revision(),rev);
    // The edge lies over the second frame at this zoom; its clipped highlight follows camera pan.
    assert.equal(await evaluate(`(()=>{const overlay=document.querySelector('[data-node-move-valid]'),highlight=overlay?.querySelector('[data-move-target]'),surface=document.querySelector('[data-frame-id="${c08Second}"] [data-frame-surface]'),v=${q('[aria-label="Interactive frame canvas"]')};if(!highlight||!surface)return false;return Math.abs(highlight.getBoundingClientRect().x-Math.max(surface.getBoundingClientRect().x,v.getBoundingClientRect().x))<10})()`),true);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});
    await wait(`!document.querySelector('[data-node-move-valid]')`);const stopped=await cameraState();await delay(80);assert.deepEqual(await cameraState(),stopped);
    await fit();
  });
  await check('C08 visible keyboard Move target/position uses same command; Preview disables drag',async()=>{
    await click(q(`[data-frame-id="${c07Frame}"] [data-node-move-handle="${c08Node}"]`));await reveal(q('[aria-label="Move target slot"]'));
    await select('[aria-label="Move target slot"]',JSON.stringify([c07Frame,c08Row]));await select('[aria-label="Move position"]','1');
    const before=await project(c07Project),rev=await c07Revision();await evaluate(`${named('#project-inspector button','Move here')}.scrollIntoView({block:'nearest'});${named('#project-inspector button','Move here')}.focus()`);await enter();
    await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix+c07Project)})).revision===${rev+1}`);assert.equal((await project(c07Project)).pages[0].frames[0].root.children[0].children[1].id,c08Node);
    await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c07Project),before);
    await click(modeButton('Preview'));const start=await evaluate(pointAt(node(c08Node))),end=await evaluate(pointAt(node(c08Row)));
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});assert.equal(await evaluate(`!!document.querySelector('[data-node-move-valid]')`),false);assert.deepEqual(await project(c07Project),before);
    await click(modeButton('Design'));
  });
  await check('C08 Grid and Card body moves expose wrappers/existing body and undo as single edits',async()=>{
    await click(frameTitle(c07Frame));await click(palette('grid'));await click(frameTitle(c07Frame));await click(palette('card'));await fit();
    const root=(await project(c07Project)).pages[0].frames[0].root,grid=root.children.find(n=>n.kind==='grid'),card=root.children.find(n=>n.kind==='card');
    const intoGrid=await nodeDrag(c08Node,pointAt(node(grid.id),.8,.7));assert.equal(intoGrid.valid,'true');
    const cell=(await project(c07Project)).pages[0].frames[0].root.children.find(n=>n.id===grid.id).children[0];assert.equal(cell.kind,'gridItem');assert.equal(cell.children[0].id,c08Node);
    await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c07Project),intoGrid.before);
    const edge=`(()=>{const r=${node(card.id)}.getBoundingClientRect();return {x:r.right-2,y:r.bottom-2}})()`;
    const intoCard=await nodeDrag(c08Node,edge);assert.equal(intoCard.valid,'true');
    const movedCard=(await project(c07Project)).pages[0].frames[0].root.children.find(n=>n.id===card.id);
    const movedContent=movedCard.children.find(n=>n.kind==='cardContent'),originalContent=card.children.find(n=>n.kind==='cardContent');
    assert.equal(movedContent.children.at(-1).id,c08Node);assert.deepEqual(movedContent.children.slice(0,-1),originalContent.children);
    assert.deepEqual(movedCard.children.filter(n=>n.kind!=='cardContent'),card.children.filter(n=>n.kind!=='cardContent'));
    await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c07Project),intoCard.before);
  });
  await check('C08 page away/back aborts a captured node drag without storage or history mutation',async()=>{
    await click(q('[aria-label="Add page"]'));await click(named('[aria-label="Pages"] a','Page 1'));
    await fit();
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const before=await project(c07Project),rev=await c07Revision(),start=await evaluate(pointAt(node(c08Node))),end=await evaluate(pointAt(node(c08Row),.8,.5));
    assert.equal(await evaluate(`(()=>{const e=document.elementFromPoint(${start.x},${start.y});return e?.closest('[data-node-move-handle]')?.dataset.nodeMoveHandle??e?.closest('[data-page-node]')?.dataset.pageNode})()`),c08Node,`Node drag start not on source: ${JSON.stringify(start)}`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});await wait(`document.querySelector('[data-node-move-valid]')`);
    await evaluate(`${named('[aria-label="Pages"] a','Page 2')}.click()`);await wait(`!document.querySelector('[data-node-move-valid]')`);await evaluate(`${named('[aria-label="Pages"] a','Page 1')}.click()`);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});assert.deepEqual(await project(c07Project),before);assert.equal(await c07Revision(),rev);
    await openProject('Alpha',first);
  });
  let c09Project, c09Frame, c09Badge, c09Text;
  const canvas = q('[aria-label="Interactive frame canvas"]');
  const menuItem = label => named('[role="menuitem"]',label);
  const flatten = root => [root,...(root.children??[]).flatMap(flatten)];
  async function key(key,code,modifiers=0) {
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode:key==='Delete'?46:key==='Backspace'?8:key==='Escape'?27:undefined});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  }
  async function context(expression) {
    const point=await evaluate(pointAt(expression));
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'right',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'right',clickCount:1});
    await wait(`document.querySelector('[role="menu"]')`);
  }
  await check('C09 right-click acts on target not previous selection; duplicate keeps props with fresh IDs and one Undo',async()=>{
    c09Project=await createProject('Context actions');await click(q('[aria-label="Add page"]'));await addFrame('Mobile');
    c09Frame=(await project(c09Project)).pages[0].frames[0].id;c07Frame=c09Frame;
    await click(palette('badge'));c09Badge=(await project(c09Project)).pages[0].frames[0].root.children[0].id;
    await select('[aria-label="Instance tone"]','danger');
    await click(frameTitle(c09Frame));await click(palette('text'));c09Text=(await project(c09Project)).pages[0].frames[0].root.children[1].id;
    await fit(true);
    const before=await project(c09Project),tokens=await catalog();
    await context(node(c09Badge));await assertParameters('Badge');
    await click(menuItem('Duplicate instance'));
    let doc=await project(c09Project),children=doc.pages[0].frames[0].root.children;
    assert.equal(children[0].id,c09Badge);assert.notEqual(children[1].id,c09Badge);assert.equal(children[2].id,c09Text);
    assert.deepEqual({...children[1],id:c09Badge},children[0]);assert.equal(children[1].props.tone,'danger');
    assert.equal(new Set(flatten(doc.pages[0].frames[0].root).map(n=>n.id)).size,flatten(doc.pages[0].frames[0].root).length);
    assert.equal(await catalog(),tokens);await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c09Project),before);
  });
  await check('C09 portal stays outside zoom transform, clamps, roves with arrows and Escape returns canvas focus',async()=>{
    for(const zoom of [.5,1.5]) {
      await evaluate(`${canvas}.focus()`);let cam=await cameraState();const point=await evaluate(pointAt(canvas,.7,.5));
      await send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:-Math.log(zoom/cam.zoom)/.002,modifiers:2});await wait(`Math.abs(Number(${canvas}.dataset.cameraZoom)-${zoom})<.001`);
      cam=await cameraState();await send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:cam.x-20,deltaY:cam.y-140});await wait(`Math.abs(Number(${canvas}.dataset.cameraX)-20)<.01`);
      await context(node(c09Badge));
      assert.equal(await evaluate(`(()=>{const e=document.querySelector('[role="menu"]'),r=e.getBoundingClientRect();return !e.closest('[data-camera-zoom]')&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&Math.abs(r.width-260)<2})()`),true);
      await key('ArrowDown','ArrowDown');await key('ArrowDown','ArrowDown');assert.equal(await evaluate(`document.activeElement?.getAttribute('role')==='menuitem'`),true);
      await key('Escape','Escape');await wait(`!document.querySelector('[role="menu"]')`);assert.equal(await evaluate(`document.activeElement===${canvas}`),true);
    }
  });
  await check('C09 visible Actions uses identical wrap commands and DOM has Stack / Grid.Item structure',async()=>{
    await fit(true);await context(node(c09Badge));await key('Escape','Escape');
    const before=await project(c09Project);
    for(const label of ['Wrap in Stack','Wrap in Grid']) {
      await click(named('[aria-label="Canvas tools"] button','… Actions'));await click(menuItem(label));
      const doc=await project(c09Project),wrapper=doc.pages[0].frames[0].root.children[0];
      assert.equal(wrapper.kind,label==='Wrap in Stack'?'stack':'grid');
      const ids=flatten(wrapper).map(n=>n.id);for(const id of ids)assert.equal(await evaluate(`!!(${node(id)})`),true);
      assert.equal(flatten(wrapper).find(n=>n.id===c09Badge).props.tone,'danger');
      await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c09Project),before);
      await context(node(c09Badge));await key('Escape','Escape');
    }
    await click(named('[aria-label="Canvas tools"] button','… Actions'));await key('Escape','Escape');
    assert.equal(await evaluate(`document.activeElement===${named('[aria-label="Canvas tools"] button','… Actions')}`),true);
  });
  await check('C09 Delete/Backspace and Cmd D/Z/Shift Z work only on focused canvas, selection falls back after delete',async()=>{
    await context(node(c09Badge));await key('Escape','Escape');const before=await project(c09Project);
    assert.equal(await evaluate(`document.activeElement===${canvas}`),true,'Shortcut canvas focus');
    await assertParameters('Badge'); // Shortcut selection survives menu Escape.
    await key('d','KeyD',4);let doc=await project(c09Project);assert.equal(doc.pages[0].frames[0].root.children.length,3);
    await key('z','KeyZ',4);assert.deepEqual(await project(c09Project),before);await key('z','KeyZ',12);assert.deepEqual(await project(c09Project),doc);
    await context(node(c09Badge));await key('Escape','Escape');const duplicate=await project(c09Project);
    await key('Delete','Delete');assert.equal((await project(c09Project)).pages[0].frames[0].root.children.some(n=>n.id===c09Badge),false);
    assert.equal(await evaluate(`${q('[aria-label="Instance settings"] h3')}.textContent`),'ContainerLayout settings');
    await key('z','KeyZ',4);assert.deepEqual(await project(c09Project),duplicate);
    await context(node(c09Badge));await click(menuItem('Delete instance'));assert.equal(await evaluate(`document.activeElement===${canvas}`),true);
    await key('z','KeyZ',4);assert.deepEqual(await project(c09Project),duplicate);
    await context(node(c09Badge));await key('Escape','Escape');await key('Backspace','Backspace');await key('z','KeyZ',4);assert.deepEqual(await project(c09Project),duplicate);
  });
  await check('C09 root and required compound slots show disabled actions; blank canvas never targets previous selection',async()=>{
    await click(frameTitle(c09Frame));await click(palette('card'));
    const doc=await project(c09Project),card=doc.pages[0].frames[0].root.children.find(n=>n.kind==='card');
    const header=card.children.find(n=>n.kind==='cardHeader'),title=header.children.find(n=>n.kind==='cardTitle'),description=header.children.find(n=>n.kind==='cardDescription');
    // Populated Cards can lose optional slots. Make Title the Header's sole child
    // through the UI to keep testing the non-empty compound-slot invariant.
    await chooseLayer(c09Frame,description.id);await click(named('[aria-label="Canvas tools"] button','… Actions'));await click(menuItem('Delete instance'));
    await wait(`!document.querySelector('[role="menu"]')`);
    await click(frameTitle(c09Frame));await fit(true);
    const titlePoint=await canvasPoint(pointAt(node(title.id)));
    assert.equal(await evaluate(`document.elementFromPoint(${titlePoint.x},${titlePoint.y})?.closest('[data-page-node]')?.dataset.pageNode`),title.id,'required slot context click must hit the real Title');
    await context(node(title.id));await assertParameters('Card.Title');
    for(const action of ['Delete instance','Duplicate instance','Wrap in Stack']) assert.equal(await evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.startsWith(${JSON.stringify(action)}))?.getAttribute('aria-disabled')`),'true',`${action} respects required/unique Header slots`);
    await key('Escape','Escape');
    await click(q('[aria-label="Undo project edit"]'));assert.deepEqual(await project(c09Project),doc);
    const rootId=doc.pages[0].frames[0].root.id;
    await click(named('[aria-label="Selection path"] button','Container'));await click(named('[aria-label="Canvas tools"] button','… Actions'));
    assert.equal(await evaluate(`[...document.querySelectorAll('[role="menuitem"]')].every(e=>e.getAttribute('aria-disabled')==='true')`),true);await key('Escape','Escape');
    assert.ok(rootId);
    // A blank point far from the fitted mobile frame clears both node and frame selection.
    const blank=await evaluate(`(()=>{const r=${canvas}.getBoundingClientRect();return {x:r.right-5,y:r.bottom-5}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...blank,button:'right',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...blank,button:'right',clickCount:1});await wait(`document.querySelector('[role="menu"]')`);
    assert.equal(await evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.startsWith('Duplicate frame'))?.getAttribute('aria-disabled')`),'true');await key('Escape','Escape');assert.deepEqual(await project(c09Project),doc);
  });
  await check('C09 native input Cmd Z/Delete never edits page history; Preview context/shortcut actions unavailable',async()=>{
    await context(node(c09Text));await key('Escape','Escape');const before=await project(c09Project);
    await click(q('[aria-label="Instance text"]'));await send('Input.insertText',{text:' draft'});
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:4,commands:['undo']});await key('Delete','Delete');assert.deepEqual(await project(c09Project),before);
    await fill('[aria-label="Instance text"]',flatten(before.pages[0].frames[0].root).find(n=>n.id===c09Text).text); // Restore draft before leaving the native field.
    await click(modeButton('Preview'));await wait(`document.querySelector('[data-editor-mode="preview"]')`);const preview=await project(c09Project),point=await evaluate(pointAt(node(c09Badge)));
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'right',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'right',clickCount:1});
    assert.equal(await evaluate(`!!document.querySelector('[role="menu"]')`),false);
    await evaluate(`${canvas}.focus()`);await key('Delete','Delete');await key('d','KeyD',4);await key('z','KeyZ',4);assert.deepEqual(await project(c09Project),preview);
    assert.equal(await evaluate(`${named('[aria-label="Canvas tools"] button','… Actions')}.disabled`),true);await click(modeButton('Design'));
  });
  await check('C09 frame right-click duplicates that frame and context capture cancels node gesture',async()=>{
    await addFrame('Mobile');const second=(await project(c09Project)).pages[0].frames[1].id;
    await fit();await context(frameTitle(c09Frame));await click(menuItem('Duplicate frame'));
    let doc=await project(c09Project);assert.equal(doc.pages[0].frames.length,3);assert.deepEqual(flatten(doc.pages[0].frames[2].root).map(n=>n.kind),flatten(doc.pages[0].frames[0].root).map(n=>n.kind));
    await click(q('[aria-label="Undo project edit"]'));doc=await project(c09Project);assert.equal(doc.pages[0].frames[1].id,second);
    const start=await evaluate(pointAt(node(c09Badge))),end={x:start.x+20,y:start.y+10};
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});await wait(`document.querySelector('[data-node-move-valid]')`);
    await evaluate(`${canvas}.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:${end.x},clientY:${end.y}}))`);
    await wait(`!document.querySelector('[data-node-move-valid]')`);await key('Escape','Escape');await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});assert.deepEqual(await project(c09Project),doc);
    await openProject('Alpha',first);
  });
  await check('375px Pages has no horizontal document overflow', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true }); await wait(`innerWidth === 375 && ${q('[aria-label="Page canvas"]')}.getBoundingClientRect().width <= 375`);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'document must not overflow');
    assert.ok(await evaluate(`${q('[aria-label="Page canvas"]')}.getBoundingClientRect().width <= innerWidth`));
  });
  await check('unresolved system recovery preserves content and does not fallback', async () => {
    await evaluate(`(()=>{const key=${JSON.stringify(documentPrefix + first)},env=JSON.parse(localStorage.getItem(key));env.document.systemId='missing-system';env.revision++;localStorage.setItem(key,JSON.stringify(env))})()`);
    await reload(); const before = await project(first);
    assert.equal(await evaluate(`${q('[aria-label="Page canvas"]')}.dataset.systemId`), 'missing-system');
    assert.match(await evaluate(`${q('[aria-label="Page canvas"]')}.textContent`), /no fallback system/);
    await select('[aria-label="Project design system"]', originalSystem); await click(named('#project-inspector button', 'Preview system change')); await click(named('[role="dialog"] button', 'Confirm system change'));
    assert.deepEqual(await project(first), { ...before, systemId: originalSystem });
    await click(q('[aria-label="Undo project edit"]')); assert.equal((await project(first)).systemId, originalSystem);
    assert.match(await evaluate(`${q('[aria-label="Page canvas"]')}.textContent`), /missing system/);
  });
  await check('corrupt project records survive reload without writes or auto-reset', async () => {
    await evaluate(`localStorage.setItem(${JSON.stringify(documentPrefix + first)},'corrupt-project-bytes')`); const indexBefore = await evaluate(`localStorage.getItem('${indexKey}')`);
    await reload(); assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(documentPrefix + first)})`), 'corrupt-project-bytes');
    assert.equal(await evaluate(`localStorage.getItem('${indexKey}')`), indexBefore); assert.equal(await evaluate(`${q('[aria-label="Add page"]')}.disabled`), true);
  });
  await firstDragChecks();
  await check('no observed runtime or hydration errors', async () => { assert.deepEqual(errors, []); });
  }
  assert.deepEqual(errors, []);
} catch (error) { console.error(`FAILED during ${stage}:`, error.stack || error); process.exitCode = 1; }
finally {
  try { await cleanup(); } catch (error) { console.error(`Cleanup failed: ${error}`); process.exitCode = 1; }
  clearTimeout(watchdog); console.log(`RESULT: ${checks} composer smoke groups passed${process.exitCode ? ', FAILED' : ''}`);
  console.log('SCOPE: Chromium/CDP only; no visual, screen-reader, cross-browser or native zoom acceptance.');
}
