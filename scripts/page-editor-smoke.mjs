#!/usr/bin/env node
// Run after npm run build. Node 22+ and installed Chrome; CHROME_PATH overrides the macOS default.
// Bounded 120-second smoke; disposable profile/server. No visual or accessibility claims.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
const node = (id) => q(`[data-page-node="${id}"]`);

import { fileURLToPath } from 'node:url';
const named = name => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(name)})`;
const storageKey = 'bambiui.examples.page-editor.bundle.v1';
const stored = `localStorage.getItem(${JSON.stringify(storageKey)})`;
const bodyHas = text => `document.body.textContent.includes(${JSON.stringify(text)})`;

async function smoke() {
  let server, chrome, profile, socket, origin, sequence = 0, stopped = false, expectedDialog;
  const dialogs = [];
  const pending = new Map(), timers = new Map(), errors = [], requests = new Map();
  const abort = new AbortController();
  const deadline = Date.now() + 115_000; // Reserve the last five seconds for cleanup.
  const pause = (ms) => new Promise((done, reject) => {
    const timer = setTimeout(() => { timers.delete(timer); done(); }, ms);
    timers.set(timer, reject);
  });
  function failPending(error) {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); }
    pending.clear();
    for (const [timer, reject] of timers) { clearTimeout(timer); reject(error); }
    timers.clear();
  }
  function send(method, params = {}) {
    if (stopped || socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`CDP unavailable: ${method}`));
    return new Promise((done, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, Math.max(1, Math.min(7000, deadline - Date.now())));
      pending.set(id, { resolve: done, reject, timer });
      try { socket.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  async function evaluate(expression) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  }
  function healthy() { assert.deepEqual(errors, [], 'Page editor runtime/network errors'); }
  async function wait(expression) {
    const until = Math.min(deadline, Date.now() + 4500);
    do {
      healthy();
      if (await evaluate(`Boolean(${expression})`)) return;
      await pause(60);
    } while (Date.now() < until);
    throw new Error(`Timed out waiting for ${expression}`);
  }
  async function click(expression) {
    // Let pending React focus effects settle before scrolling to the next control.
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await evaluate(`(${expression}).scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);
    const point = await evaluate(`(()=>{const e=${expression},r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!r.width||!r.height||!e.contains(document.elementFromPoint(x,y)))throw Error('Missing or occluded control');return {x,y}})()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  }
  async function key(key, code, windowsVirtualKeyCode, extra = {}) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...extra });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
  }
  async function fill(name, value) {
    const input = q(`input[name="${name}"], textarea[name="${name}"]`);
    await click(input);
    await key('a', 'KeyA', 65, { modifiers: 4, commands: ['selectAll'] });
    await key('Backspace', 'Backspace', 8);
    // Native browser text insertion, never value assignment or synthetic DOM events.
    if (value) await send('Input.insertText', { text: value });
    await wait(`${input}.value === ${JSON.stringify(value)}`);
  }
  const benignFavicon = (url, status) => {
    try { const parsed = new URL(url); return status === 404 && parsed.origin === origin && parsed.pathname === '/favicon.ico'; }
    catch { return false; }
  };
  const watchdog = setTimeout(() => {
    stopped = true;
    abort.abort(new Error('Page editor smoke exceeded its 120-second budget'));
    failPending(abort.signal.reason);
  }, 115_000);
  async function run() {
    assert.equal(typeof WebSocket, 'function', 'Node with built-in WebSocket (Node 22+) is required');
    const root = await realpath(fileURLToPath(new URL('../out/', import.meta.url)));
    await stat(resolve(root, 'index.html'));
    server = createServer(async (req, res) => {
      try {
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        let path = resolve(root, `.${pathname}`);
        const inside = (candidate) => candidate === root || candidate.startsWith(root + sep);
        if (!inside(path)) { res.writeHead(403).end(); return; }
        if (!extname(path)) {
          try { await stat(`${path}.html`); path += '.html'; }
          catch { path = resolve(path, 'index.html'); }
        }
        path = await realpath(path); // Reject symlinks escaping the export too.
        if (!inside(path)) { res.writeHead(403).end(); return; }
        const body = await readFile(path);
        res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch (error) {
        res.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
      }
    });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
    origin = `http://127.0.0.1:${server.address().port}`;
    profile = await mkdtemp(resolve(tmpdir(), 'bambiui-page-editor-'));
    chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
      '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '', spawnError, port;
    chrome.on('error', (error) => { spawnError = error; });
    chrome.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const startupDeadline = Date.now() + 12_000;
    while (!port && Date.now() < startupDeadline) {
      if (spawnError) throw spawnError;
      assert.equal(chrome.exitCode, null, `Chrome exited: ${stderr}`);
      try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
      catch { await pause(100); }
    }
    assert.ok(port, `Chrome debugging port unavailable: ${stderr}`);
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]) });
    assert.ok(response.ok, 'Cannot discover Chrome CDP target');
    const target = (await response.json()).find((item) => item.type === 'page');
    assert.ok(target?.webSocketDebuggerUrl, 'Missing Chrome page target');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, reject) => {
      const timer = setTimeout(() => { timers.delete(timer); reject(new Error('CDP socket open timed out')); }, 5000);
      timers.set(timer, reject);
      const finish = (error) => { clearTimeout(timer); timers.delete(timer); if (error) reject(error); else done(); };
      socket.addEventListener('open', () => finish(), { once: true });
      socket.addEventListener('error', () => finish(new Error('CDP socket error')), { once: true });
    });
    socket.addEventListener('close', () => { if (!stopped) failPending(new Error('CDP socket closed unexpectedly')); });
    socket.addEventListener('error', () => { if (!stopped) failPending(new Error('CDP socket error')); });
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data), p = message.params;
      if (message.id) {
        const task = pending.get(message.id);
        if (!task) return;
        pending.delete(message.id); clearTimeout(task.timer);
        if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
      } else if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(p.type)) {
        errors.push(`console.${p.type}: ${p.args.map((arg) => arg.value ?? arg.description).join(' ')}`);
      } else if (message.method === 'Network.requestWillBeSent') {
        requests.set(p.requestId, p.request.url);
      } else if (message.method === 'Network.responseReceived') {
        if (p.response.status >= 400 && !benignFavicon(p.response.url, p.response.status)) errors.push(`HTTP ${p.response.status}: ${p.response.url}`);
      } else if (message.method === 'Network.loadingFailed') {
        errors.push(`Network failure: ${requests.get(p.requestId) || p.requestId}: ${p.errorText}`);
        requests.delete(p.requestId);
      } else if (message.method === 'Network.loadingFinished') {
        requests.delete(p.requestId);
      } else if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(p.entry.level)) {
        // Only a same-origin favicon 404 is unrelated to this fixture. Never ignore
        // generic resource errors, hydration messages, aborted loads or chunk 404s.
        if (!(p.entry.source === 'network' && benignFavicon(p.entry.url, 404) && /\b404\b/.test(p.entry.text))) errors.push(`${p.entry.level}: ${p.entry.text}`);
      } else if (message.method === 'Page.javascriptDialogOpening') {
        dialogs.push({type: p.type, message: p.message});
        const expectation = expectedDialog; expectedDialog = undefined;
        if (!expectation || p.type !== expectation.type || !p.message.includes(expectation.message)) errors.push(`Unexpected dialog: ${p.type}: ${p.message}`);
        send('Page.handleJavaScriptDialog', { accept: expectation?.accept ?? false }).catch((error) => errors.push(String(error)));
      }
    });
    for (const domain of ['Runtime', 'Log', 'Network', 'Page']) await send(`${domain}.enable`);

    const enabled = name => `(${named(name)})?.matches(':enabled')`;
    const layer = id => q(`[data-editor-layer="${id}"]`);
    const layers = `[...document.querySelectorAll('[data-editor-layer]')].map(e=>e.dataset.editorLayer)`;
    let checkGroups = 0;
    const report = message => { checkGroups++; console.log(`PASS ${message}`); };
    async function ready() {
      await wait(`${q('#editor-workspace')}?.matches(':enabled') && !${bodyHas('Checking this browser’s local copy…')}`);
    }
    async function confirmReset(accept) {
      const count = dialogs.length;
      expectedDialog = {type:'confirm', message:'Replace the stored local copy', accept};
      await click(named('Reset local copy'));
      const until = Date.now() + 4500;
      while (dialogs.length === count && Date.now() < until) await pause(30);
      assert.equal(dialogs.length, count + 1);
      assert.equal(expectedDialog, undefined);
    }
    await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate', {url:origin+'/examples/page-editor'});
    await ready();
    await wait(bodyHas('Ready. Use Save locally'));
    assert.equal(await evaluate(stored), null);
    assert.equal(await evaluate(enabled('Undo')), false);
    assert.equal(await evaluate(enabled('Redo')), false);
    const initialLayers = await evaluate(layers);
    const rootId = initialLayers[0];
    report('initial readiness, empty storage, fresh history (no mount write)');

    // Save a baseline solely to obtain the actual validated demo bundle.
    await click(named('Save locally'));
    await wait(`${stored} !== null`);
    const baseline = JSON.parse(await evaluate(stored));
    const frame = q('[data-preview-width]');
    const preview = q('main[data-ds-theme]');
    for (const theme of ['Dark', 'Light']) {
      await click(named(theme));
      await wait(`${preview}.dataset.dsTheme === ${JSON.stringify(theme.toLowerCase())}`);
      assert.equal(await evaluate(`getComputedStyle(${preview}).backgroundColor`), `rgb(${baseline.designSystem.themes[theme.toLowerCase()].global.background.match(/\w\w/g).map(v => parseInt(v,16)).join(', ')})`);
      for (const width of ['Narrow', 'Wide']) {
        await click(named(width));
        await wait(`${frame}.dataset.previewWidth === ${JSON.stringify(width.toLowerCase())}`);
        assert.ok(await evaluate(`${frame}.getBoundingClientRect().width <= ${width === 'Narrow' ? 360 : 960} && ${frame}.getBoundingClientRect().width <= ${frame}.parentElement.clientWidth`));
      }
    }
    assert.deepEqual(JSON.parse(await evaluate(stored)), baseline);
    assert.equal(await evaluate(enabled('Undo')), false);
    report('both snapshot themes and both capped container widths; preferences leave storage/history unchanged');
    const flat = [];
    (function visit(n) { flat.push(n); for (const child of n.children || []) visit(child); })(baseline.page.root);
    const inputNode = flat.find(n => n.kind === 'input');
    const switchNode = flat.find(n => n.kind === 'switch');
    const buttonNode = flat.find(n => n.kind === 'button');
    assert.ok(inputNode && switchNode && buttonNode);
    const previewInput = `${node(inputNode.id)}.matches('input') ? ${node(inputNode.id)} : ${node(inputNode.id)}.querySelector('input')`;
    const previewSwitch = `${node(switchNode.id)}.matches('[role=switch]') ? ${node(switchNode.id)} : ${node(switchNode.id)}.querySelector('[role=switch]')`;
    const switchSize = await evaluate(`(()=>{const r=(${previewSwitch}).getBoundingClientRect();return [r.width,r.height]})()`);
    await click(named('Select layers'));
    const checked = await evaluate(`(${previewSwitch}).getAttribute('aria-checked')`);
    await click(`(${previewSwitch})`);
    await wait(`${layer(switchNode.id)}.getAttribute('aria-pressed') === 'true'`);
    assert.equal(await evaluate(`(${previewSwitch}).getAttribute('aria-checked')`), checked);
    assert.deepEqual(await evaluate(`(()=>{const r=(${previewSwitch}).getBoundingClientRect();return [r.width,r.height]})()`), switchSize);
    assert.ok(await evaluate(`getComputedStyle(${node(switchNode.id)}).boxShadow.includes('inset')`));
    await click(`(${previewInput})`);
    await wait(`${layer(inputNode.id)}.getAttribute('aria-pressed') === 'true'`);
    await click(node(buttonNode.id));
    await wait(`${layer(buttonNode.id)}.getAttribute('aria-pressed') === 'true'`);
    assert.equal(await evaluate(bodyHas('Demo submission prevented.')), false);
    assert.equal(await evaluate('location.pathname'), '/examples/page-editor');
    await evaluate(`${layer(rootId)}.focus()`);
    await key(' ', 'Space', 32);
    await wait(`${layer(rootId)}.getAttribute('aria-pressed') === 'true'`);
    assert.equal(await evaluate(`${node(rootId)}.dataset.editorSelected`), 'true');
    report('selection blocks switch/button activation and submission, resolves nested input/switch nodes, keyboard layer selection');
    await click(named('Interact'));
    await key('Tab', 'Tab', 9);
    await evaluate(`(${previewInput}).focus()`);
    assert.ok(await evaluate(`(()=>{let e=(${previewInput});while(e && e !== ${preview}){if(getComputedStyle(e).outlineStyle !== 'none')return true;e=e.parentElement}return false})()`), 'Native focus outline remains separate from selection');
    await click(`(${previewInput})`);
    await send('Input.insertText', {text:'Preview interaction'});
    await wait(`(${previewInput}).value.includes('Preview interaction')`);
    await click(`(${previewSwitch})`);
    await wait(`(${previewSwitch}).getAttribute('aria-checked') !== ${JSON.stringify(checked)}`);
    await evaluate(`document.querySelector('main[data-ds-theme] form').noValidate = true`);
    await click(node(buttonNode.id));
    await wait(bodyHas('Demo submission prevented.'));
    assert.equal(await evaluate(`${layer(rootId)}.getAttribute('aria-pressed')`), 'true');
    assert.deepEqual(JSON.parse(await evaluate(stored)), baseline);
    await click(named('Dark'));
    await click(named('Narrow'));
    report('interact preserves native typing/switch/button submission handling without selection or persistence');
    function textNode(node) { if (typeof node.text === 'string') return node; for (const child of node.children || []) { const found = textNode(child); if (found) return found; } }
    const editable = textNode(baseline.page.root);
    assert.ok(editable, 'Demo needs a text-bearing node');
    await click(layer(editable.id));
    await wait(`${layer(editable.id)}.getAttribute('aria-pressed') === 'true' && ${q('textarea[name="nodeText"]')}?.value === ${JSON.stringify(editable.text)}`);
    const changed = 'Browser smoke applied text';
    await fill('nodeText', changed);
    await click(named('Apply properties'));
    await wait(`${node(editable.id)}?.textContent.includes(${JSON.stringify(changed)})`);
    assert.deepEqual(JSON.parse(await evaluate(stored)), baseline, 'Applied edits must not autosave');
    await click(named('Undo'));
    await wait(`${q('textarea[name="nodeText"]')}?.value === ${JSON.stringify(editable.text)}`);
    await click(named('Redo'));
    await wait(`${q('textarea[name="nodeText"]')}?.value === ${JSON.stringify(changed)}`);
    report('selection, native text apply, undo/redo, no autosave');

    await click(layer(rootId));
    await wait(enabled('Add to selected layer'));
    await click(named('Add to selected layer'));
    await wait(`document.querySelectorAll('[data-editor-layer]').length > ${initialLayers.length}`);
    const added = (await evaluate(layers)).filter(id => !initialLayers.includes(id));
    const addedId = await evaluate(`document.querySelector('[data-editor-layer][aria-pressed="true"]').dataset.editorLayer`);
    assert.ok(added.includes(addedId));
    const beforeMove = await evaluate(layers);
    await click(named('Move up'));
    await wait(`${layers}.indexOf(${JSON.stringify(addedId)}) < ${beforeMove.indexOf(addedId)}`);
    await click(named('Move down'));
    await wait(`JSON.stringify(${layers}) === ${JSON.stringify(JSON.stringify(beforeMove))}`);
    const destinationId = await evaluate(`${q('select[aria-describedby="move-help"]')}.options[1]?.value`);
    assert.ok(destinationId, 'Inserted container needs a cross-parent destination');
    await evaluate(`(() => { const select = ${q('select[aria-describedby="move-help"]')}; select.value = ${JSON.stringify(destinationId)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await wait(enabled('Move'));
    await click(named('Move'));
    const relocated = `${node(addedId)}?.parentElement.closest('[data-page-node]')?.dataset.pageNode === ${JSON.stringify(destinationId)}`;
    await wait(relocated);
    await wait(`${layer(addedId)} === document.activeElement`);
    assert.equal(await evaluate(`${q('select[aria-describedby="move-help"]')}.value`), '');
    await click(named('Undo'));
    await wait(`${node(addedId)}?.parentElement.closest('[data-page-node]')?.dataset.pageNode === ${JSON.stringify(rootId)}`);
    await click(named('Redo'));
    await wait(relocated);
    assert.deepEqual(JSON.parse(await evaluate(stored)), baseline, 'Cross-parent moves must not autosave');
    report('cross-parent append, rendered relocation, focus, destination reset and single-step undo/redo');
    // Native dragstart comes from CDP mouse input; intercepted Chromium DragData
    // is delivered with CDP drag events, not a fabricated DOM DataTransfer.
    await click(named('Undo'));
    await wait(`${node(addedId)}?.parentElement.closest('[data-page-node]')?.dataset.pageNode === ${JSON.stringify(rootId)}`);
    assert.equal(await evaluate(q(`[data-drag-handle="${rootId}"]`)), null);
    const dragPoint = async selector => evaluate(`(()=>{const e=${selector};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.setInterceptDrags', {enabled:true});
    const intercepted = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('Native drag was not intercepted')); }, 4500);
      function listener(event) { const message = JSON.parse(event.data); if (message.method === 'Input.dragIntercepted') { clearTimeout(timer); socket.removeEventListener('message', listener); resolve(message.params.data); } }
      socket.addEventListener('message', listener);
    });
    const start = await dragPoint(q(`[data-drag-handle="${addedId}"]`));
    await send('Input.dispatchMouseEvent', {type:'mouseMoved', ...start});
    await send('Input.dispatchMouseEvent', {type:'mousePressed', ...start, button:'left', buttons:1, clickCount:1});
    await send('Input.dispatchMouseEvent', {type:'mouseMoved', x:start.x+15, y:start.y+10, button:'left', buttons:1});
    const dragData = await intercepted;
    assert.ok(dragData.items.some(item => item.mimeType === 'application/x-bambiui-layer-session'));
    const dropPoint = await dragPoint(q(`[data-drop-layer="${destinationId}"]`));
    for (const type of ['dragEnter', 'dragOver']) await send('Input.dispatchDragEvent', {type, ...dropPoint, data:dragData});
    await wait(`${q(`[data-drop-layer="${destinationId}"]`)}.dataset.dropTarget === 'valid'`);
    await send('Input.dispatchDragEvent', {type:'drop', ...dropPoint, data:dragData});
    await send('Input.dispatchMouseEvent', {type:'mouseReleased', ...dropPoint, button:'left', buttons:0, clickCount:1});
    await send('Input.setInterceptDrags', {enabled:false});
    await wait(relocated);
    await wait(`${layer(addedId)} === document.activeElement`);
    assert.equal(await evaluate(`${layer(addedId)}.getAttribute('aria-pressed')`), 'true');
    assert.equal(await evaluate(`document.querySelectorAll('[data-drop-target]').length`), 0);
    await click(named('Undo'));
    await wait(`${node(addedId)}?.parentElement.closest('[data-page-node]')?.dataset.pageNode === ${JSON.stringify(rootId)}`);
    await click(named('Redo'));
    await wait(relocated);
    assert.deepEqual(JSON.parse(await evaluate(stored)), baseline);
    report('native CDP mouse dragstart + intercepted DragData/CDP drop: append, focus, selection, cleanup, single-step undo/redo, no autosave');

    const unchangedLayers = await evaluate(layers);
    // Synthetic DOM events specifically probe hostile payloads and cancellation.
    await evaluate(`(()=>{const handle=${q(`[data-drag-handle="${addedId}"]`)};const invalid=${q(`[data-drop-layer="${addedId}"]`)};const valid=${q(`[data-drop-layer="${rootId}"]`)};const data=new DataTransfer();handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));invalid.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));invalid.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));const foreign=new DataTransfer();foreign.setData('application/x-bambiui-layer-session','forged');foreign.setData('application/json',JSON.stringify({nodeId:${JSON.stringify(addedId)},parentId:${JSON.stringify(rootId)}}));valid.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:foreign}));handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));valid.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:foreign}));handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));handle.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:data}));})()`);
    await wait(`document.querySelectorAll('[data-drop-target]').length === 0`);
    assert.deepEqual(await evaluate(layers), unchangedLayers);
    assert.equal(await evaluate(relocated), true);
    assert.equal(await evaluate(enabled('Redo')), false);
    assert.deepEqual(JSON.parse(await evaluate(stored)), baseline);
    await click(named('Undo'));
    await wait(`${node(addedId)}?.parentElement.closest('[data-page-node]')?.dataset.pageNode === ${JSON.stringify(rootId)}`);
    await click(named('Redo'));
    await wait(relocated);
    report('synthetic DOM DataTransfer: self/foreign/forged-session rejection, dragend cleanup, unchanged history/document/storage');
    await click(named('Delete'));
    await wait(`JSON.stringify(${layers}) === ${JSON.stringify(JSON.stringify(initialLayers))}`);
    report('add, selection of inserted node, move up/down, delete');

    await click(named('Save locally'));
    await wait(bodyHas('Applied page and detached design-system snapshot saved locally'));
    const savedRaw = await evaluate(stored);
    const savedBundle = JSON.parse(savedRaw);
    assert.equal(textNode(savedBundle.page.root).text, changed);
    await send('Page.reload');
    await ready();
    await wait(bodyHas('Local snapshot restored. History and drafts start fresh.'));
    assert.equal(await evaluate(stored), savedRaw);
    assert.equal(await evaluate(`${preview}.dataset.dsTheme`), 'light');
    assert.equal(await evaluate(`${frame}.dataset.previewWidth`), 'wide');
    assert.equal(await evaluate(`${frame}.dataset.selectionMode`), 'interact');
    assert.equal(await evaluate(enabled('Undo')), false);
    assert.equal(await evaluate(enabled('Redo')), false);
    assert.equal(await evaluate(`${layer(rootId)}.getAttribute('aria-pressed')`), 'true');
    await click(layer(editable.id));
    await wait(`${q('textarea[name="nodeText"]')}?.value === ${JSON.stringify(changed)}`);
    report('explicit save/reload restores content and root selection with fresh history');

    // Exercise a real file input change; no disk fixture or application internals.
    await evaluate(`(()=>{const input=document.querySelector('input[type=file]'),dt=new DataTransfer();dt.items.add(new File(['{"invalid":true}'],'invalid.json',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(bodyHas('Import rejected:'));
    await wait(enabled('Export JSON backup'));
    assert.equal(await evaluate(stored), savedRaw);
    assert.deepEqual(await evaluate(layers), initialLayers);
    assert.equal(await evaluate(`${q('textarea[name="nodeText"]')}.value`), changed);
    assert.equal(await evaluate(enabled('Undo')), false);
    report('invalid File/DataTransfer import preserves content, selection, storage and fresh history');

    // Capture the Blob handed to the browser, not the download outcome.
    await evaluate(`window.__smokeExport=null;window.__smokeCreateURL=URL.createObjectURL;URL.createObjectURL=function(blob){window.__smokeExport=blob.text();return window.__smokeCreateURL.call(this,blob)}`);
    await click(named('Export JSON backup'));
    await wait(bodyHas('JSON backup download requested'));
    const exported = JSON.parse(await evaluate('window.__smokeExport'));
    assert.deepEqual(exported, savedBundle);
    assert.equal(Object.hasOwn(exported,'history'), false);
    await evaluate('URL.createObjectURL=window.__smokeCreateURL;delete window.__smokeCreateURL;delete window.__smokeExport');
    report('export Blob JSON equals saved page + detached snapshot; download completion NOT tested');

    await send('Emulation.setDeviceMetricsOverride', {width:375,height:812,deviceScaleFactor:1,mobile:false});
    await pause(200);
    for (const theme of ['Light', 'Dark']) for (const width of ['Narrow', 'Wide']) {
      await click(named(theme));
      await click(named(width));
      assert.ok(await evaluate(`${frame}.getBoundingClientRect().width <= ${frame}.parentElement.clientWidth`));
      assert.ok(await evaluate('document.documentElement.scrollWidth <= 376'));
    }
    const layout = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth})');
    assert.equal(layout.width,375);
    assert.ok(Math.max(layout.scroll,layout.body) <= 376, JSON.stringify(layout));
    report('375px CSS viewport: no document horizontal overflow (not device/visual/a11y testing)');
    await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});

    const corrupt = '{corrupt smoke storage';
    await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)},${JSON.stringify(corrupt)})`);
    await send('Page.reload');
    await ready();
    await wait(bodyHas('Local storage blocked:'));
    assert.equal(await evaluate(stored),corrupt);
    assert.equal(await evaluate(enabled('Save locally')),false);
    assert.deepEqual(await evaluate(layers),initialLayers);
    await confirmReset(false);
    assert.equal(await evaluate(stored),corrupt);
    assert.equal(await evaluate(enabled('Save locally')),false);
    await confirmReset(true);
    await wait(bodyHas('Local copy reset to the default detached snapshot'));
    assert.deepEqual(JSON.parse(await evaluate(stored)),baseline);
    assert.equal(await evaluate(enabled('Save locally')),true);
    assert.equal(await evaluate(enabled('Undo')),false);
    assert.equal(await evaluate(enabled('Redo')),false);
    assert.equal(await evaluate(bodyHas('Local storage blocked:')),false);
    report('corrupt bytes preserved, warning + save blocked; reset cancel preserves, confirm recovers');
    await pause(300);
    healthy();
    report('no observed runtime, hydration, console warning/error or resource failures');
    console.log(`PASS ${checkGroups} browser smoke check groups`);
  }
  let failure;
  let abortListener;
  try {
    await Promise.race([run(), new Promise((_, reject) => {
      abortListener = () => reject(abort.signal.reason);
      abort.signal.addEventListener('abort', abortListener, { once: true });
    })]);
  } catch (error) { failure = error; }
  finally {
    stopped = true;
    clearTimeout(watchdog);
    abort.signal.removeEventListener('abort', abortListener);
    abort.abort(new Error('Browser check finished'));
    failPending(new Error('Browser check finished'));
    socket?.close();
    const cleanupErrors = [];
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
      try {
        const exited = new Promise((done) => chrome.once('exit', done));
        chrome.kill('SIGTERM');
        await new Promise((done) => {
          const timer = setTimeout(done, 1500);
          exited.then(() => { clearTimeout(timer); done(); });
        });
        if (chrome.exitCode === null && chrome.signalCode === null) {
          chrome.kill('SIGKILL');
          await new Promise((done, reject) => {
            const timer = setTimeout(() => reject(new Error('Chrome did not exit after SIGKILL')), 1000);
            exited.then(() => { clearTimeout(timer); done(); });
          });
        }
      } catch (error) { cleanupErrors.push(error); }
    }
    if (server) {
      try { server.closeAllConnections(); await new Promise((done, reject) => server.close((error) => error ? reject(error) : done())); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (profile) {
      try { await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) failure = new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], 'Browser check/cleanup failed');
  }
  if (failure) throw failure;
}

await smoke();
console.log("Page editor smoke passed; Chrome, server and temporary profile cleaned up.");
