#!/usr/bin/env node
// No packages, app build, fixture injection, or persistent browser state. Evidence goes to stdout.
// Run after the parent finishes the static export: node scripts/studio-workspace-smoke.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const usage = `Usage: node scripts/studio-workspace-smoke.mjs [--shell-only] [--skip-input] [--skip-assets]
Requires Node 22+ (native fetch/WebSocket), Chrome, and a fresh out/ export. Never builds the app.
CHROME_PATH overrides the macOS Chrome executable. All browser data is disposable.
Default: shell, frame/Card appearance, compound layers, Input parts/ownership, saved assets, themes, history, reload.
--shell-only   Only project/page/frame creation, Layers, sizing, panels, menu, and reload.
--skip-input   Explicitly omit Input part/owner checks while that UI is under development.
--skip-assets  Explicitly omit saved-component checks. Missing controls otherwise FAIL, never silently skip.
120-second full / 45-second shell watchdog; individual CDP commands and waits are also bounded.`;
const args = new Set(process.argv.slice(2));
if (args.has('--help')) { console.log(usage); process.exit(0); }
for (const arg of args) if (!['--shell-only', '--skip-input', '--skip-assets'].includes(arg)) {
  console.error(`Unknown option: ${arg}\n${usage}`); process.exit(2);
}
const shellOnly = args.has('--shell-only');
const skipInput = shellOnly || args.has('--skip-input');
const skipAssets = shellOnly || args.has('--skip-assets');
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(projectRoot, 'out');
const indexKey = 'bambiui.composer.projects.v1';
const documentPrefix = 'bambiui.composer.document.v1.';
const budget = shellOnly ? 45000 : 120000;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const pending = new Map(), errors = [];
let server, chrome, profile, socket, sequence = 0, checks = 0, aborted = false, stage = 'preflight';
let projectId, frameId, rootId, cardId, titleId, copyId, inputId;
const started = Date.now();
const evidence = (label, data) => console.log(`EVIDENCE ${label} ${JSON.stringify(data)}`);
function abort(reason) {
  aborted = true;
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error(reason)); }
  pending.clear(); socket?.close(); chrome?.kill('SIGKILL');
}
const watchdog = setTimeout(() => abort(`Workspace smoke exceeded ${budget / 1000}s during ${stage}`), budget);
const interrupt = () => { process.exitCode = 130; abort('Workspace smoke interrupted'); };
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);

async function bounded(promise, label, ms = 7000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms); })]); }
  finally { clearTimeout(timer); }
}
function send(method, params = {}, moveBeforePress = true) {
  // Real hover precedes mouse-down; do not synthesize DOM click/input events for text fields.
  if (moveBeforePress && method === 'Input.dispatchMouseEvent' && params.type === 'mousePressed')
    return send(method, { type: 'mouseMoved', x: params.x, y: params.y, buttons: 0 }).then(() => send(method, params, false));
  if (aborted || socket?.readyState !== 1) return Promise.reject(new Error(`CDP unavailable during ${stage}`));
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
const q = selector => `document.querySelector(${JSON.stringify(selector)})`;
const visible = expression => `(()=>{const e=(${expression});return !!e && e.getClientRects().length>0 && !e.closest('[hidden]') && getComputedStyle(e).visibility!=='hidden'})()`;
const named = (selector, name) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(name)} && e.getClientRects().length>0 && !e.closest('[hidden]'))`;
const labelled = name => `(()=>{const label=[...document.querySelectorAll('#workspace-sidebar label')].find(e=>e.textContent.trim()===${JSON.stringify(name)});return label && document.getElementById(label.htmlFor)})()`;
const group = name => `[...document.querySelectorAll('#project-inspector details')].find(e=>e.querySelector(':scope > summary')?.firstChild?.textContent.trim()===${JSON.stringify(name)})`;
async function wait(expression, label = expression) {
  const until = Date.now() + 6500;
  // Always coerce predicates: serializing a DOM node with returnByValue can overflow CDP.
  do { if (await evaluate(`!!(${expression})`)) return; await delay(50); } while (Date.now() < until && !aborted);
  throw new Error(`Timed out during ${stage}: ${label}`);
}
const settle = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
async function click(expression, scroll = true) {
  await wait(visible(expression), `visible target ${expression}`);
  if (scroll) await evaluate(`(${expression}).scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);
  await settle();
  const point = await evaluate(`(()=>{const e=(${expression}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(e.disabled)throw Error('Disabled: '+e.outerHTML);if(!e.contains(document.elementFromPoint(x,y)))throw Error('Occluded: '+e.outerHTML);return {x,y}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await settle();
}
async function press(key) {
  const windowsVirtualKeyCode = { Enter: 13, Tab: 9, Escape: 27, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Backspace: 8 }[key];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode });
  await settle();
}
async function reveal(expression) {
  await wait(expression);
  // Open authored details through their summary, never interact with hidden inspector controls.
  for (let i = 0; i < 5; i++) {
    const summary = `(()=>{const e=(${expression});for(let p=e?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)return p.querySelector(':scope > summary');return null})()`;
    if (!await evaluate(`!!(${summary})`)) return;
    await click(summary);
  }
  throw new Error(`Too many closed details around ${expression}`);
}
async function fill(expression, text, commit) {
  await reveal(expression); await click(expression);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
  if (text) await send('Input.insertText', { text }); else await press('Backspace');
  await wait(`(${expression}).value===${JSON.stringify(text)}`, `React text entry ${text}`);
  if (commit) await press(commit === 'blur' ? 'Tab' : 'Enter');
}
async function select(selector, value) {
  const expression = q(selector);
  await reveal(expression); await wait(visible(expression));
  await evaluate(`(()=>{const e=${expression};if(e.disabled || ![...e.options].some(o=>o.value===${JSON.stringify(value)}))throw Error('Unavailable select option');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(`${expression}.value===${JSON.stringify(value)}`); await settle();
}
async function check(label, run) {
  stage = label; await run(); checks++; console.log(`PASS ${label}`);
}
const stored = () => `JSON.parse(localStorage.getItem(${JSON.stringify(documentPrefix + projectId)}))`;
const record = () => evaluate(stored());
const project = async () => (await record()).document;
const nodes = node => [node, ...(node.children ?? []).flatMap(nodes)];
const frame = async () => (await project()).pages.flatMap(page => page.frames).find(entry => entry.id === frameId);
const node = async id => nodes((await frame()).root).find(entry => entry.id === id);
const shape = entry => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'id').map(([key, value]) => [key, key === 'children' ? value.map(shape) : value]));
const nodeSelector = id => `[data-frame-id="${frameId}"] [data-page-node="${id}"]`;
const partSelector = part => `[data-frame-id="${frameId}"] [data-page-owner="${inputId}"]${part === 'root' ? '' : ` [data-appearance-part="${part}"]`}`;
const layerSelector = id => `[role="treeitem"][data-layer-id="${id ? frameId + '/' + id : frameId}"]`;
async function sidebar(tab) {
  if (await evaluate(visible(q('[aria-label="Show left panel"]')))) await click(q('[aria-label="Show left panel"]'));
  const target = named('#workspace-sidebar [role="tab"]', tab);
  await click(target); await wait(`(${target}).getAttribute('aria-selected')==='true'`);
}
async function chooseLayer(id) {
  await sidebar('Layers');
  const selector = layerSelector(id);
  await click(q(`${selector} > div`)); await wait(`${q(selector)}.getAttribute('aria-selected')==='true'`);
}
async function fitPage() {
  await click(q('[aria-label="Canvas tools"] [aria-label^="Canvas zoom "]'));
  await click(named('[role="menuitem"]', 'Fit page')); await wait(`!${q('[role="menu"]')}`);
}
async function history(direction, expected) {
  await click(q(`[aria-label="${direction} project edit"]`));
  await wait(`JSON.stringify(${stored()}.document)===${JSON.stringify(JSON.stringify(expected))}`, `${direction} restores the exact document`);
}
async function computed(selector, keys) {
  return evaluate(`(()=>{const e=${q(selector)};if(!e)throw Error('Missing painted element: '+${JSON.stringify(selector)});const s=getComputedStyle(e);return Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,s[k]]))})()`);
}
async function styleIs(selector, expected) {
  await wait(`${q(selector)} && Object.entries(${JSON.stringify(expected)}).every(([key,value])=>getComputedStyle(${q(selector)})[key]===value)`, `computed style ${selector} = ${JSON.stringify(expected)}`);
  assert.deepEqual(await computed(selector, Object.keys(expected)), expected);
}
const labels = {
  paddingTop: 'Padding top', paddingRight: 'Padding right', paddingBottom: 'Padding bottom', paddingLeft: 'Padding left',
  borderTopLeftRadius: 'Top Left radius', borderTopRightRadius: 'Top Right radius', borderBottomRightRadius: 'Bottom Right radius', borderBottomLeftRadius: 'Bottom Left radius',
  fontSize: 'Font size', color: 'Color', gap: 'Gap',
};
async function appearance(target, key, value, commit = 'enter') {
  const selector = `#project-inspector [data-appearance-key="${key}"]`;
  await wait(q(selector));
  assert.equal(await evaluate(`${q(selector)}.getAttribute('aria-label')`), `${target} ${labels[key]}`);
  const before = (await record()).revision;
  await fill(q(selector), String(value), commit);
  await wait(`${stored()}.revision===${before + 1}`, `one persisted ${target} ${key} edit`);
  assert.notEqual(await evaluate(`${q(selector)}.getAttribute('aria-invalid')`), 'true');
}
async function content(key, value, commit = 'enter') {
  await fill(q(`#project-inspector [aria-label="Instance ${key}"]`), value, commit);
}
const cardAppearance = { borderTopLeftRadius: 7, borderTopRightRadius: 13, borderBottomRightRadius: 19, borderBottomLeftRadius: 25, paddingTop: 9, paddingRight: 15, paddingBottom: 21, paddingLeft: 27 };
const cardCSS = Object.fromEntries(Object.entries(cardAppearance).map(([key, value]) => [key, `${value}px`]));
async function paintedOverrides() {
  await styleIs(nodeSelector(rootId), { paddingTop: '8px', paddingLeft: '12px' });
  await styleIs(nodeSelector(cardId), cardCSS);
  await styleIs(nodeSelector(titleId), { fontSize: '31px' });
  if (copyId) await styleIs(nodeSelector(copyId), { ...cardCSS, borderTopLeftRadius: '37px' });
  if (inputId) {
    await styleIs(partSelector('root'), { gap: '9px' });
    await styleIs(partSelector('control'), { fontSize: '17px', borderTopLeftRadius: '5px' });
    await styleIs(nodeSelector(inputId), { fontSize: '17px' });
    await styleIs(partSelector('label'), { fontSize: '15px', color: 'rgb(48, 74, 138)' });
    await styleIs(partSelector('description'), { fontSize: '12px' });
    await styleIs(partSelector('error'), { fontSize: '13px', color: 'rgb(180, 35, 24)' });
  }
}
async function viewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await wait(`innerWidth===${width} && innerHeight===${height}`); await settle();
}
async function shellSnapshot() {
  return evaluate(`(()=>{const box=selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,visible:!!e.getClientRects().length}};return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,header:box('.studio-header'),left:box('#workspace-sidebar'),right:box('#workspace-inspector'),main:box('.studio-main'),canvas:box('[aria-label="Interactive frame canvas"]'),toolbar:box('[aria-label="Canvas tools"]')}})()`);
}
function boundedShell(s) {
  assert.equal(s.header.height, 48); assert.equal(s.main.y, 48); assert.equal(s.main.height, s.height - 48);
  assert.equal(s.canvas.height, s.main.height); assert.equal(s.canvas.width, s.main.width);
  assert.ok(s.scrollWidth <= s.width && s.scrollHeight <= s.height, `Document overflow: ${JSON.stringify(s)}`);
  assert.ok(s.toolbar.x >= s.main.x - 1 && s.toolbar.x + s.toolbar.width <= s.main.x + s.main.width + 1, `Toolbar overflow: ${JSON.stringify(s)}`);
  assert.ok(s.toolbar.y >= 48 && s.toolbar.y + s.toolbar.height <= s.height, 'Toolbar stays inside the work area');
}
async function newestSource(directory) {
  let newest = { path: directory, mtimeMs: 0 };
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const value = entry.isDirectory() ? await newestSource(path) : /\.(tsx?|css|json)$/.test(entry.name) ? { path, mtimeMs: (await stat(path)).mtimeMs } : null;
    if (value && value.mtimeMs > newest.mtimeMs) newest = value;
  }
  return newest;
}
async function start() {
  assert.equal(typeof WebSocket, 'function', 'Use Node 22+ with native WebSocket support');
  const exported = await stat(resolve(root, 'index.html'));
  await stat(resolve(root, 'pages.html'));
  const newest = await newestSource(resolve(projectRoot, 'app'));
  evidence('export', { exportedAt: exported.mtime.toISOString(), newestSource: newest.path, sourceAt: new Date(newest.mtimeMs).toISOString() });
  assert.ok(exported.mtimeMs >= newest.mtimeMs, `Stale out/: ${newest.path} is newer. Rebuild after the parent finishes; this script never builds.`);
  server = createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let path = resolve(root, `.${name}`);
      if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      if (!extname(path)) { try { await stat(`${path}.html`); path += '.html'; } catch { path = resolve(path, 'index.html'); } }
      const data = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
    } catch { res.writeHead(404).end('Not found'); }
  });
  await bounded(new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }), 'static server');
  profile = await mkdtemp(resolve(tmpdir(), 'bambiui-workspace-smoke-'));
  chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', spawnError, port;
  chrome.on('error', error => { spawnError = error; }); chrome.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  for (let i = 0; i < 100 && !port && !aborted; i++) {
    if (spawnError) throw spawnError;
    if (chrome.exitCode !== null) throw new Error(`Chrome exited: ${stderr}`);
    try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { await delay(100); }
  }
  assert.ok(port && !aborted, `Chrome unavailable: ${stderr}`);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  const target = targets.find(entry => entry.type === 'page'); assert.ok(target, 'Chrome page target exists');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await bounded(new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); socket.addEventListener('close', () => reject(new Error('CDP closed before connection')), { once: true }); }), 'CDP connection');
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id); if (!task) return;
      pending.delete(message.id); clearTimeout(task.timer);
      if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await viewport(1440, 900);
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await wait(`${q('[aria-label="New project name"]')} && !${q('[aria-label="New project name"]')}.disabled`, 'project hydration');
}
async function cleanup() {
  socket?.close();
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('CDP cleanup')); }
  pending.clear();
  if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGTERM'); await Promise.race([exited, delay(2000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) { chrome.kill('SIGKILL'); await bounded(exited, 'Chrome cleanup', 2000); }
  }
  if (server?.listening) { server.closeAllConnections(); await bounded(new Promise(resolve => server.close(resolve)), 'server cleanup', 2000); }
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
}

try {
  await start();
  await check('/ opens Project without silently creating project records', async () => {
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(indexKey)})`), null);
    assert.deepEqual(await evaluate(`Object.keys(localStorage).filter(key=>key.startsWith(${JSON.stringify(documentPrefix)}))`), []);
    assert.equal(await evaluate(`${q('[aria-label="Workspace"] [aria-current]')}.textContent`), 'Project');
    assert.ok(await evaluate(visible(named('button', 'Create or open a project'))));
  });
  await check('header manager → Add page in Layers → Add Mobile frame menuitem', async () => {
    await click(q('.studio-header details:has([aria-label="New project name"]) summary'));
    await fill(q('[aria-label="New project name"]'), 'Workspace acceptance');
    await click(named('.studio-header button', 'Create project'));
    await wait(`${q('[aria-label="Page canvas"]')}?.dataset.projectId`);
    projectId = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(indexKey)})).activeProjectId`);
    assert.equal((await project()).pages.length, 0);
    await sidebar('Layers'); await click(q('[aria-label="Add page"]'));
    await wait(q('[aria-label="Interactive frame canvas"]'));
    assert.equal((await project()).pages[0].frames.length, 0);
    await click(q('[aria-label="Canvas tools"] [aria-label="Add frame"]'));
    await wait(q('[role="menuitem"][aria-label="Add Mobile frame"]'));
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[role="menuitem"][aria-label^="Add "]')].map(e=>e.getAttribute('aria-label'))`), ['Add Web frame', 'Add Tablet frame', 'Add Mobile frame', 'Add Custom frame']);
    await click(q('[role="menuitem"][aria-label="Add Mobile frame"]'));
    await wait(q('[data-frame-id]'));
    const created = (await project()).pages[0].frames[0]; frameId = created.id; rootId = created.root.id;
    assert.equal(created.width, 390); assert.equal(created.height, 844); assert.equal(created.root.children.length, 0);
    await fitPage(); evidence('created', { projectId, frameId, width: created.width, height: created.height });
  });
  const originalSystems = await evaluate(`localStorage.getItem('bambiui.systems.v1')`);
  await check('1440×900 shell, focus canvas, and independent panel toggles', async () => {
    let s = await shellSnapshot(); boundedShell(s);
    assert.equal(s.left.width, 224); assert.equal(s.right.width, 272); assert.equal(s.main.width, 944); evidence('desktop', s);
    await click(q('[aria-label="Focus canvas"]')); s = await shellSnapshot(); boundedShell(s);
    assert.equal(s.main.width, 1440); assert.equal(s.left.visible, false); assert.equal(s.right.visible, false);
    await click(q('[aria-label="Show panels"]')); await click(q('[aria-label="Hide left panel"]'));
    s = await shellSnapshot(); assert.equal(s.main.width, 1168); assert.equal(s.right.visible, true);
    await click(q('[aria-label="Show left panel"]')); await click(q('[aria-label="Hide inspector"]'));
    s = await shellSnapshot(); assert.equal(s.main.width, 1216); assert.equal(s.left.visible, true);
    await click(q('[aria-label="Show inspector"]')); assert.equal((await shellSnapshot()).main.width, 944);
  });
  await check('Layers keyboard collapse/expand, roving focus, and frame/root selection', async () => {
    await chooseLayer(); await press('ArrowLeft');
    await wait(`${q(layerSelector())}.getAttribute('aria-expanded')==='false'`);
    assert.equal(await evaluate(`document.querySelectorAll('[role="treeitem"]').length`), 1);
    await press('ArrowRight'); await press('ArrowRight'); await press('Enter');
    await wait(`${q(layerSelector(rootId))}.getAttribute('aria-selected')==='true'`);
    assert.equal(await evaluate(`document.querySelectorAll('[role="treeitem"][tabindex="0"]').length`), 1);
    await press('Home'); await press('Enter'); await wait(`${q(layerSelector())}.getAttribute('aria-selected')==='true'`);
    await fitPage(); await click(q(`[data-frame-title="${frameId}"]`), false);
    assert.equal(await evaluate(`${q(layerSelector())}.getAttribute('aria-selected')`), 'true');
  });

  if (!shellOnly) {
    await check('selected frame only: generic root appearance commits by Enter and blur', async () => {
      await chooseLayer(); await wait(visible(q('[aria-label="Frame settings"]')));
      assert.equal(await evaluate(visible(q('[aria-label="Instance settings"]'))), false);
      assert.equal(await evaluate(visible(q('[aria-label="Project name"]'))), false);
      await appearance('Frame', 'paddingTop', 8);
      await appearance('Frame', 'paddingLeft', 12, 'blur');
      assert.deepEqual((await node(rootId)).appearance, { paddingTop: 8, paddingLeft: 12 });
      await styleIs(nodeSelector(rootId), { paddingTop: '8px', paddingLeft: '12px' });
    });
    await check('Assets inserts Content-only Card; Component layers explicitly adds Header', async () => {
      await sidebar('Assets'); await click(q('[data-insert-kind="card"]'));
      await wait(`${stored()}.document.pages[0].frames[0].root.children.some(n=>n.kind==='card')`);
      const card = (await frame()).root.children.find(entry => entry.kind === 'card'); cardId = card.id;
      assert.deepEqual(card.children.map(entry => entry.kind), ['cardContent']);
      await wait(visible(q('[aria-label="Instance settings"]')));
      assert.equal(await evaluate(visible(q('[aria-label="Frame settings"]'))), false);
      const headerButton = `([...(${group('Component layers')}).querySelectorAll('button')].find(e=>e.firstChild.textContent.trim()==='Header' && e.querySelector('span')?.textContent.trim()==='+ Add'))`;
      await reveal(headerButton); await click(headerButton);
      const header = (await node(cardId)).children.find(entry => entry.kind === 'cardHeader'); assert.ok(header);
      const title = header.children.find(entry => entry.kind === 'cardTitle'); assert.ok(title); titleId = title.id;
      await sidebar('Layers'); await wait(q(layerSelector(titleId)));
      assert.match(await evaluate(`${q(layerSelector(header.id))}.getAttribute('aria-label')`), /^Card\.Header/);
      assert.match(await evaluate(`${q(layerSelector(titleId))}.getAttribute('aria-label')`), /^Card\.Title/);
    });
    await check('Card four independent corners and padding sides paint and persist exactly', async () => {
      await chooseLayer(cardId);
      assert.equal(await evaluate(`${q('[aria-label="Link corners"]')}.getAttribute('aria-pressed')`), 'false');
      assert.equal(await evaluate(`${q('[aria-label="Link padding sides"]')}.getAttribute('aria-pressed')`), 'false');
      for (const [key, value] of Object.entries(cardAppearance)) await appearance('Component', key, value);
      assert.deepEqual((await node(cardId)).appearance, cardAppearance); await styleIs(nodeSelector(cardId), cardCSS);
      evidence('card', { id: cardId, stored: (await node(cardId)).appearance, painted: await computed(nodeSelector(cardId), Object.keys(cardCSS)) });
    });
    await check('Card.Title typography, one-step undo/redo, and canvas selection reveal collapsed ancestry', async () => {
      await chooseLayer(titleId); await content('text', 'Workspace card', 'blur');
      assert.equal((await node(titleId)).text, 'Workspace card');
      const before = await project(), previous = await computed(nodeSelector(titleId), ['fontSize']);
      await appearance('Component', 'fontSize', 31); const after = await project();
      await styleIs(nodeSelector(titleId), { fontSize: '31px' });
      await history('Undo', before); await styleIs(nodeSelector(titleId), previous);
      await history('Redo', after); await styleIs(nodeSelector(titleId), { fontSize: '31px' });
      await chooseLayer(cardId); await click(q('[aria-label="Collapse Card.Header"]'));
      await chooseLayer(); await fitPage(); await click(q(nodeSelector(titleId)), false);
      await wait(`${q(layerSelector(titleId))}?.getAttribute('aria-selected')==='true'`);
      assert.equal(await evaluate(`!!${q('[aria-label="Collapse Card.Header"]')}`), true);
      evidence('title', { id: titleId, text: (await node(titleId)).text, fontSize: await computed(nodeSelector(titleId), ['fontSize']) });
    });
  } else console.log('SKIP frame/Card appearance and compound layers (--shell-only)');

  if (!skipAssets) await check('save Card in Assets, insert from selected frame, and edit an independent copy', async () => {
    await chooseLayer(cardId); await sidebar('Assets');
    await fill(labelled('Component name'), 'Workspace card snapshot');
    await click(named('#workspace-sidebar button', 'Save selection'));
    const saved = await project(), asset = saved.assets.find(entry => entry.name === 'Workspace card snapshot');
    assert.ok(asset); assert.deepEqual(asset.root, await node(cardId));
    await chooseLayer(); await sidebar('Assets');
    await click(q('[aria-label="Insert Workspace card snapshot"]'));
    const after = await project(), cards = after.pages[0].frames[0].root.children.filter(entry => entry.kind === 'card');
    assert.equal(cards.length, 2); const copy = cards.find(entry => entry.id !== cardId); copyId = copy.id;
    assert.deepEqual(shape(copy), shape(asset.root));
    const sourceIds = new Set(nodes(asset.root).map(entry => entry.id));
    assert.ok(nodes(copy).every(entry => !sourceIds.has(entry.id)), 'Every copied node receives a fresh ID');
    await styleIs(nodeSelector(copyId), cardCSS);
    await history('Undo', saved); assert.equal(await evaluate(`!!${q(nodeSelector(copyId))}`), false);
    await history('Redo', after); await styleIs(nodeSelector(copyId), cardCSS);
    await chooseLayer(copyId); await appearance('Component', 'borderTopLeftRadius', 37);
    assert.equal((await node(cardId)).appearance.borderTopLeftRadius, 7);
    assert.equal((await project()).assets[0].root.appearance.borderTopLeftRadius, 7);
    await styleIs(nodeSelector(cardId), cardCSS); await styleIs(nodeSelector(copyId), { ...cardCSS, borderTopLeftRadius: '37px' });
    evidence('asset', { assetId: asset.id, originalId: cardId, copyId, originalCorner: 7, copyCorner: 37 });
  }); else console.log(`SKIP saved components (${shellOnly ? '--shell-only' : '--skip-assets'})`);

  if (!skipInput) {
    await check('Input content, error placement/icon, and independent Control/Label/Error parts', async () => {
      await chooseLayer(); await sidebar('Assets'); await click(q('[data-insert-kind="input"]'));
      const input = nodes((await frame()).root).find(entry => entry.kind === 'input'); assert.ok(input); inputId = input.id;
      await content('label', 'Email address'); await content('description', 'Use your work address', 'blur');
      await content('error', 'Enter a valid email');
      await select('#project-inspector [aria-label="Instance errorIcon"]', 'warning');
      await select('#project-inspector [aria-label="Instance errorPosition"]', 'above');
      assert.equal((await node(inputId)).props.errorPosition, 'above');
      assert.equal((await node(inputId)).props.errorIcon, 'warning');
      assert.equal(await evaluate(`${q(partSelector('error'))}.textContent.trim()`), 'Enter a valid email');
      assert.equal(await evaluate(`${q(partSelector('root'))}.firstElementChild.getAttribute('data-appearance-part')`), 'error');
      assert.ok(await evaluate(`!!${q(partSelector('error') + '[data-error-icon="warning"] svg[aria-hidden="true"]')}`));
      const parts = '#project-inspector [aria-label="Edit component part"]';
      assert.deepEqual(await evaluate(`[...${q(parts)}.options].map(e=>e.value)`), ['element', 'root', 'label', 'description', 'error']);
      await select(parts, 'element'); await appearance('Control', 'fontSize', 17); await appearance('Control', 'borderTopLeftRadius', 5);
      await select(parts, 'root'); await appearance('Field layout', 'gap', 9);
      await select(parts, 'label'); await appearance('Label', 'fontSize', 15); await appearance('Label', 'color', '#304a8a');
      await select(parts, 'description'); await appearance('Description', 'fontSize', 12);
      await select(parts, 'error'); await appearance('Error', 'fontSize', 13); await appearance('Error', 'color', '#b42318', 'blur');
      const authored = await node(inputId);
      assert.deepEqual(authored.appearance, { fontSize: 17, borderTopLeftRadius: 5 });
      assert.deepEqual(authored.parts, { root: { gap: 9 }, label: { fontSize: 15, color: '#304a8a' }, description: { fontSize: 12 }, error: { fontSize: 13, color: '#b42318' } });
      await paintedOverrides(); evidence('input', { id: inputId, props: authored.props, appearance: authored.appearance, parts: authored.parts });
    });
    await check('canvas label and error clicks select the owning Input, not the frame/layout', async () => {
      await fitPage();
      for (const part of ['label', 'error']) {
        await chooseLayer(); await click(q(partSelector(part)), false);
        await wait(`${q(layerSelector(inputId))}?.getAttribute('aria-selected')==='true'`, `${part} click selects Input owner`);
        await wait(visible(q('[aria-label="Instance settings"]')));
        assert.equal(await evaluate(`${q('#project-inspector [aria-label="Instance label"]')}.value`), 'Email address');
        assert.equal(await evaluate(visible(q('[aria-label="Frame settings"]'))), false);
      }
    });
  } else console.log(`SKIP Input parts and field-owner selection (${shellOnly ? '--shell-only' : '--skip-input'})`);

  if (!shellOnly) await check('Light/Dark keep authored styles without editing shared system records', async () => {
    const saved = await project(), backgrounds = {};
    for (const mode of ['light', 'dark']) {
      await select('[aria-label="Frame theme"]', mode);
      await wait(`${q('[data-frame-surface]')}.dataset.dsTheme===${JSON.stringify(mode)}`);
      await paintedOverrides(); assert.deepEqual(await project(), saved);
      backgrounds[mode] = (await computed('[data-frame-surface]', ['backgroundColor'])).backgroundColor;
    }
    assert.notEqual(backgrounds.light, backgrounds.dark, 'The linked theme actually changes, not just the select');
    assert.equal(await evaluate(`localStorage.getItem('bambiui.systems.v1')`), originalSystems);
    evidence('themes', backgrounds);
  });

  await check('reload restores the exact authored document and painted overrides', async () => {
    const before = await record(), origin = await evaluate('performance.timeOrigin');
    await send('Page.reload'); await wait(`performance.timeOrigin!==${origin}`);
    await wait(`${q('[aria-label="Page canvas"]')}?.dataset.projectId===${JSON.stringify(projectId)} && ${q('[data-frame-id]')}`);
    assert.deepEqual(await record(), before);
    if (!shellOnly) {
      await paintedOverrides();
      for (const mode of ['light', 'dark']) { await select('[aria-label="Frame theme"]', mode); await paintedOverrides(); }
    }
    if (copyId) { await sidebar('Assets'); await wait(visible(q('[aria-label="Insert Workspace card snapshot"]'))); }
    assert.equal(await evaluate(`localStorage.getItem('bambiui.systems.v1')`), originalSystems);
    evidence('reload', { projectId, revision: before.revision, frames: before.document.pages[0].frames.length, assets: before.document.assets?.length ?? 0 });
  });
  await check('390×844 stays full-canvas with exclusive overlay panels and working focus toggle', async () => {
    await viewport(390, 844);
    if (await evaluate(visible(q('[aria-label="Hide left panel"]')))) await click(q('[aria-label="Hide left panel"]'));
    if (await evaluate(visible(q('[aria-label="Hide inspector"]')))) await click(q('[aria-label="Hide inspector"]'));
    let s = await shellSnapshot(); boundedShell(s); assert.equal(s.main.width, 390); evidence('mobile', s);
    await click(q('[aria-label="Show left panel"]')); s = await shellSnapshot(); boundedShell(s);
    assert.equal(s.left.visible, true); assert.equal(s.right.visible, false); assert.equal(s.left.width, 224); assert.equal(s.main.width, 390);
    await click(q('[aria-label="Show inspector"]')); s = await shellSnapshot(); boundedShell(s);
    assert.equal(s.left.visible, false); assert.equal(s.right.visible, true); assert.equal(s.right.width, 272); assert.equal(s.main.width, 390);
    await click(q('[aria-label="Focus canvas"]')); s = await shellSnapshot(); assert.equal(s.left.visible, false); assert.equal(s.right.visible, false);
    await click(q('[aria-label="Show panels"]')); assert.equal((await shellSnapshot()).left.visible, true);
    await click(q('[aria-label="Hide left panel"]'));
  });
  await check('mobile Add frame menu fits the viewport and Escape dismisses it without edits', async () => {
    const before = await record();
    await click(q('[aria-label="Canvas tools"] [aria-label="Add frame"]'));
    await wait(q('[role="menuitem"][aria-label="Add Mobile frame"]'));
    const bounds = await evaluate(`(()=>{const r=${q('[role="menu"]')}.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()`);
    assert.ok(bounds.x >= 0 && bounds.right <= 390 && bounds.y >= 48 && bounds.bottom <= 844, JSON.stringify(bounds));
    await press('Escape'); await wait(`!${q('[role="menu"]')}`); assert.deepEqual(await record(), before);
  });
  await check('no browser runtime, console, or resource errors', async () => { await settle(); assert.deepEqual(errors, []); });
  console.log(`PASS workspace smoke: ${checks} checks in ${((Date.now() - started) / 1000).toFixed(1)}s (${shellOnly ? 'shell-only' : 'full'}; explicit skips printed above)`);
} catch (error) {
  console.error(`FAIL ${stage}: ${error.stack || error}`);
  process.exitCode = process.exitCode || 1;
  if (!aborted && socket?.readyState === 1) {
    try {
      evidence('failure', await evaluate(`({url:location.href,viewport:[innerWidth,innerHeight],selected:[...document.querySelectorAll('[role="treeitem"][aria-selected="true"]')].map(e=>({id:e.dataset.layerId,label:e.getAttribute('aria-label')})),inspector:[...document.querySelectorAll('#project-inspector input,#project-inspector select')].filter(e=>e.getClientRects().length).map(e=>({label:e.getAttribute('aria-label'),value:e.value})).slice(0,24),notices:[...document.querySelectorAll('[role="alert"]')].filter(e=>e.getClientRects().length).map(e=>e.textContent)})`));
    } catch (diagnosticError) { console.error(`Failure evidence unavailable: ${diagnosticError.message}`); }
  }
  if (errors.length) evidence('browser-errors', errors);
} finally {
  try { await cleanup(); console.log('CLEANUP disposable Chrome/profile/server removed; no app or smoke files changed by the run'); }
  catch (error) { console.error(`FAIL cleanup: ${error.message}`); process.exitCode = process.exitCode || 1; }
  clearTimeout(watchdog); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
}
