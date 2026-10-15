#!/usr/bin/env node
// Run against a coordinator-built production out/. Never builds or generates sources.
// Node 22.18+, Chrome (CHROME_PATH overrides macOS default), native CDP; synthetic data only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnDisposableBrowser, stopDisposableBrowser } from './disposable-browser-process.mjs';
import { keys, targetId, systemsFixture, projectFixture, recoveryFixture, recoveryRecords, projectRecords, deletionFixtures, otherId } from './studio-system-only-fixtures.mjs';

const root = fileURLToPath(new URL('../out/', import.meta.url));
const fixturePath = '/__system_only_fixture__.html';
const recoveryName = 'bambiui-local-recovery.json';
const forbiddenProject = '[aria-label="New project name"], [aria-label="Page canvas"], [aria-label="Interactive frame canvas"], #project-inspector, [aria-label="Project layers and assets"], [aria-label="Insert palette"]';
const studioNodes = '.studio-shell, .studio-header, #workspace-sidebar, #workspace-inspector, #token-editor';
const counts = { button: 18, input: 9, switch: 12, checkbox: 12, badge: 54, card: 9, text: 180 };
const q = selector => `document.querySelector(${JSON.stringify(selector)})`;
const named = (selector, name) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>(e.getAttribute('aria-label') || e.textContent.trim())===${JSON.stringify(name)})`;
const recoveryButton = named('button', 'Download local recovery data');
const deleteButton = q('[data-system-delete-trigger]');
const deletePopup = '#system-delete-dialog[data-system-delete-dialog]';
const deleteAccept = q(`${deletePopup} [data-system-delete-confirm]`);
const auditKey = 'bambiui.qa.system-only.audit';
let server, chrome, profile, origin, debuggingPort, mainSession, stage = 'startup', checks = 0, stopping = false;
let expectedDialog = false, dialog = null;
const sessions = new Set(), errors = [], failures = [], downloads = [], downloadNames = new Map(), requests = [];
const abort = new AbortController();
const deadline = Date.now() + 210_000;
const watchdog = setTimeout(() => {
  abort.abort();
  for (const session of sessions) session.fail(new Error(`Smoke exceeded 210 seconds during ${stage}`));
  chrome?.kill('SIGKILL');
}, 210_000);

// Installed before application hydration, in this disposable profile only. Fixture writes are
// performed on an inert document; sessionStorage retains the audit over full navigations.
const instrumentation = `(() => {
  if(location.pathname === ${JSON.stringify(fixturePath)}) return;
  const get=Storage.prototype.getItem, set=Storage.prototype.setItem, remove=Storage.prototype.removeItem, clear=Storage.prototype.clear;
  const log=(operation,key)=>{const entries=JSON.parse(get.call(sessionStorage,${JSON.stringify(auditKey)}) || '[]');entries.push({operation,key});set.call(sessionStorage,${JSON.stringify(auditKey)},JSON.stringify(entries));};
  Storage.prototype.getItem=function(key){if(this===localStorage){if(window.__qaReadFailure===String(key))throw new DOMException('QA controlled read failure','SecurityError');}return get.call(this,key);};
  Storage.prototype.setItem=function(key,value){if(this===localStorage)log('setItem',String(key));return set.call(this,key,value);};
  Storage.prototype.removeItem=function(key){if(this===localStorage)log('removeItem',String(key));return remove.call(this,key);};
  Storage.prototype.clear=function(){if(this===localStorage)log('clear',null);return clear.call(this);};
})()`;

async function bounded(promise, label, ms = 7000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out during ${stage}`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function connect(url) {
  const socket = new WebSocket(url), pending = new Map();
  let sequence = 0;
  const session = {
    socket,
    fail(error) { for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); } pending.clear(); },
    send(method, params = {}) {
      if (abort.signal.aborted || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`CDP unavailable: ${method}`));
      return new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method} during ${stage}`)); }, 7000);
        pending.set(id, { resolve, reject, timer });
        try { socket.send(JSON.stringify({ id, method, params })); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    },
    async evaluate(expression) {
      const { result, exceptionDetails } = await session.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    },
  };
  sessions.add(session);
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id); if (!task) return;
      pending.delete(message.id); clearTimeout(task.timer);
      if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    else if (message.method === 'Page.javascriptDialogOpening') {
      if (!expectedDialog) {
        errors.push(`Unexpected dialog: ${message.params.message}`);
        session.send('Page.handleJavaScriptDialog', { accept: false }).catch(error => errors.push(String(error)));
      } else dialog = message.params;
    } else if (message.method === 'Browser.downloadWillBegin') downloadNames.set(message.params.guid, message.params.suggestedFilename);
    else if (message.method === 'Browser.downloadProgress' && message.params.state !== 'inProgress') downloads.push({ ...message.params, filename: downloadNames.get(message.params.guid) });
    else if (message.method === 'Network.requestWillBeSent') requests.push({ url: message.params.request.url, method: message.params.request.method, type: message.params.type });
  });
  socket.addEventListener('close', () => { if (!stopping) session.fail(new Error(`CDP closed during ${stage}`)); });
  await bounded(new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); }), 'CDP connection');
  await session.send('Runtime.enable'); await session.send('Page.enable'); await session.send('Network.enable');
  return session;
}
async function wait(session, expression, label = expression) {
  const until = Math.min(deadline, Date.now() + 8000);
  do {
    assert.deepEqual(errors, [], `Browser errors during ${stage}`);
    if (await session.evaluate(`Boolean(${expression})`)) return;
    await delay(60);
  } while (!abort.signal.aborted && Date.now() < until);
  throw new Error(`Timed out during ${stage}: ${label}`);
}
async function waitUntil(predicate, label) {
  const until = Math.min(deadline, Date.now() + 8000);
  do { if (await predicate()) return; await delay(60); } while (!abort.signal.aborted && Date.now() < until);
  throw new Error(`Timed out during ${stage}: ${label}`);
}
async function click(session, expression) {
  await wait(session, expression, 'click target exists');
  await session.evaluate(`(()=>{const e=(${expression});for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.querySelector(':scope > summary')?.contains(e))p.open=true;e.scrollIntoView({block:'center',behavior:'instant'});})()`);
  await wait(session, `(()=>{const e=(${expression});if(!e||e.disabled)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`, 'enabled, visible and unobscured pointer target');
  const point = await session.evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
}
async function key(session, name, modifiers = 0, commands) {
  const windowsVirtualKeyCode = { Tab: 9, Enter: 13, Escape: 27, a: 65 }[name];
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name === 'a' ? 'KeyA' : name, windowsVirtualKeyCode, modifiers, ...(name === 'Enter' ? { text: '\r' } : {}), ...(commands ? { commands } : {}) });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode, modifiers });
}
async function fill(session, selector, value, commit = true) {
  await click(session, q(selector));
  await key(session, 'a', 4, ['selectAll']);
  await session.send('Input.insertText', { text: String(value) });
  if (commit) await key(session, 'Enter');
}
async function chooseCard(session, recipe = 'outlined.md') {
  const selector = `[data-component-matrix="card"] [data-recipe-example="${recipe}"] > button`;
  await wait(session, q(selector));
  await session.evaluate(`${q(selector)}.focus({preventScroll:true})`);
  await key(session, 'Enter');
  await wait(session, `${q('[data-system-recipe-controls]')}?.dataset.recipe===${JSON.stringify(recipe)}`);
}
async function exportTokens(session, format) {
  await click(session, q('[aria-label="Export tokens"]'));
  await click(session, named('[aria-label="Export format"] button', format));
  const text = await session.evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`);
  await click(session, q('[aria-label="Close export dialog"]'));
  return format === 'JSON' ? JSON.parse(text) : text;
}
async function navigate(session, path) {
  const before = await session.evaluate('performance.timeOrigin');
  const result = await session.send('Page.navigate', { url: origin + path });
  assert.equal(result.errorText, undefined);
  await wait(session, `performance.timeOrigin !== ${before} && document.readyState==='complete'`, `load ${path}`);
  assert.equal(await session.evaluate('location.pathname'), path);
}
async function snapshot(session) { return session.evaluate('Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]))'); }
async function audit(session) { return session.evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(auditKey)}) || '[]')`); }
async function noProjectMutation(session, entries) {
  assert.deepEqual(projectRecords(await snapshot(session)), projectRecords(entries), 'Project key set and raw strings must be unchanged');
  const writes = await audit(session);
  assert.deepEqual(writes.filter(({ operation, key }) => operation === 'clear' || key === keys.index || key === keys.pageEditor || key?.startsWith(keys.documents)), [], 'No Project writes, removals or clear, even if bytes were restored');
}
async function seed(session, entries = {}, path = '/') {
  await navigate(session, fixturePath);
  await session.evaluate(`localStorage.clear();sessionStorage.clear();for(const [key,raw] of Object.entries(${JSON.stringify(entries)}))localStorage.setItem(key,raw)`);
  await navigate(session, path);
}
async function systemReady(session, heading = 'Colors', view = 'design') {
  await wait(session, `${q('.editor-fields')} && !${q('.editor-fields')}.disabled && ${q('h1')}?.textContent.trim()===${JSON.stringify(heading)}`);
  assert.equal(await session.evaluate('document.querySelectorAll(".studio-shell").length'), 1, 'Exactly one mounted Studio');
  for (const selector of ['.studio-header', '#workspace-sidebar', '#workspace-inspector', '#token-editor']) {
    assert.equal(await session.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`), 1, `Unique ${selector}`);
  }
  assert.equal(await session.evaluate(`!!${q(forbiddenProject)}`), false, 'No hidden Project authoring DOM');
  assert.equal(await session.evaluate(`${q('.view-switch a[aria-current="page"]')}?.textContent.trim()`), view === 'design' ? 'Design' : 'Develop');
  assert.equal(await session.evaluate(`[...document.querySelectorAll('a,button')].some(e=>/^(Project|Create project|Create or open a project)$/.test(e.textContent.trim()))`), false, 'No Project CTA');
}
async function paused(session) {
  await wait(session, `[...document.querySelectorAll('h1')].filter(e=>e.textContent.trim()==='Project editing is paused').length===1 && ${recoveryButton} && !(${recoveryButton}).disabled`);
  assert.equal(await session.evaluate(`document.querySelectorAll(${JSON.stringify(studioNodes + ', ' + forbiddenProject)}).length`), 0, 'Suspension must not mount Studio or composer, including hidden DOM');
  assert.equal(await session.evaluate(`!!(${named('a', 'Open design system')})`), true);
}
async function manager(session) {
  const collection = await session.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.systems)}))`);
  assert.equal(collection.systems.length, 2, 'Deletion fixture must retain both Systems');
  assert.equal(collection.activeId, targetId);
  if (!await session.evaluate(`${q('.system-switcher')}.open`)) await click(session, q('.system-switcher summary'));
  await wait(session, `${q('.system-switcher')}.open && !!(${deleteButton})`, 'Open System manager with Delete current system action');
  assert.equal(await session.evaluate(`document.querySelectorAll('.system-switcher-list button').length`), collection.systems.length);
  assert.equal(await session.evaluate(`(${deleteButton}).textContent.trim()`), 'Delete current system');
}
async function openDeleteDialog(session) {
  await click(session, deleteButton);
  await wait(session, `${q(deletePopup)}?.checkVisibility() && !!(${deleteAccept})`, 'controlled System deletion dialog');
  assert.equal(await session.evaluate(`${q(deletePopup)}.getAttribute('role')`), 'dialog');
  const name = await session.evaluate(`(()=>{const e=${q(deletePopup)};return e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent.trim()).join(' ')})()`);
  assert.equal(name, 'Delete system?');
  assert.equal(await session.evaluate(`${q(deletePopup)}.dataset.systemId`), targetId);
  assert.equal(await session.evaluate(`document.querySelectorAll(${JSON.stringify(deletePopup)}).length`), 1);
  assert.equal(await session.evaluate(`(${deleteAccept}).textContent.trim()`), 'Delete system');
  assert.equal(await session.evaluate(`(${deleteButton}).disabled`), true, 'No second deletion request while the dialog is open');
  assert.equal(dialog, null, 'System deletion must not open a native dialog');
}
async function deleteDialogClosed(session) {
  await wait(session, `!${q(deletePopup)} || !${q(deletePopup)}.checkVisibility()`, 'deletion dialog closes');
  await wait(session, `document.activeElement===${q('.system-switcher summary')}`, 'focus returns to System summary');
}
async function nativeConfirm(session, action) {
  assert.equal(dialog, null); expectedDialog = true;
  // A native confirmation can hold the input command pending until handled.
  const actionTask = action(); actionTask.catch(() => {});
  try {
    await waitUntil(() => dialog !== null, 'native confirmation opens');
    assert.equal(dialog.type, 'confirm');
    await session.send('Page.handleJavaScriptDialog', { accept: true });
    await actionTask;
  } finally { expectedDialog = false; dialog = null; }
}
async function download() {
  await waitUntil(() => downloads.length > 0, 'genuine browser download completion');
  const completed = downloads.shift();
  assert.equal(completed.state, 'completed');
  assert.equal(completed.filename, recoveryName);
  const bytes = await readFile(resolve(profile, recoveryName));
  assert.equal(bytes.length, completed.totalBytes);
  assert.ok(bytes.length <= 64 * 1024 * 1024);
  await rm(resolve(profile, recoveryName));
  return JSON.parse(bytes.toString('utf8'));
}
async function check(name, run) {
  stage = name;
  try {
    await run(); assert.deepEqual(errors, [], `Browser errors during ${stage}`);
    checks++; console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name); process.exitCode = 1;
    console.error(`FAIL ${name}: ${error.stack || error}`);
    if (abort.signal.aborted) throw error;
  }
}

async function start() {
  assert.equal(process.argv.length, 2, 'No skip flags: run node scripts/studio-system-only-smoke.mjs');
  assert.equal(typeof WebSocket, 'function', 'Node 22.18+ with native TypeScript/WebSocket is required');
  for (const file of ['index.html', 'colors.html', 'pages.html', 'examples/page-editor.html', '404.html']) await stat(resolve(root, file));
  const realRoot = await realpath(root);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
  server = createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === fixturePath) { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end('<!doctype html><title>Disposable QA storage setup</title>'); return; }
      const path = resolve(realRoot, '.' + pathname);
      if (path !== realRoot && !path.startsWith(realRoot + sep)) { res.writeHead(403).end(); return; }
      // Exact pathname only: /pages/nested never falls back to pages.html.
      const candidates = extname(path) ? [path] : [path + '.html', resolve(path, 'index.html')];
      let body, chosen;
      for (const candidate of candidates) {
        try {
          const actual = await realpath(candidate);
          if (!actual.startsWith(realRoot + sep)) continue;
          body = await readFile(actual); chosen = actual; break;
        } catch (error) { if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) throw error; }
      }
      const status = chosen ? 200 : 404;
      if (!chosen) { chosen = resolve(realRoot, '404.html'); body = await readFile(chosen); }
      res.writeHead(status, { 'Content-Type': mime[extname(chosen)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(req.method === 'HEAD' ? undefined : body);
    } catch (error) { errors.push(`Static host: ${error.message}`); res.writeHead(500).end('QA host error'); }
  });
  await bounded(new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }), 'static host startup');
  origin = `http://127.0.0.1:${server.address().port}`;
  profile = await mkdtemp(resolve(tmpdir(), 'bambiui-system-only-'));
  chrome = spawnDisposableBrowser(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank']);
  let stderr = '', spawnError;
  chrome.once('error', error => { spawnError = error; }); chrome.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  await waitUntil(async () => {
    if (spawnError) throw spawnError;
    assert.equal(chrome.exitCode, null, stderr);
    try { debuggingPort = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { return false; }
    return !!debuggingPort;
  }, 'Chrome debugging port');
  const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  const target = targets.find(target => target.type === 'page'); assert.ok(target);
  const main = await connect(target.webSocketDebuggerUrl);
  mainSession = main;
  await main.send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
  await main.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profile, eventsEnabled: true });
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await main.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  return main;
}

try {
  const main = await start();
  await check('empty root hydrates Colors with one System shell and no Project storage writes', async () => {
    await seed(main); await systemReady(main);
    assert.equal(await main.evaluate(`${q('.studio-sidebar a[aria-current="page"]')}.getAttribute('href')`), '/colors');
    await noProjectMutation(main, {});
    assert.deepEqual(await audit(main), [], 'Empty hydration must not persist defaults');
  });
  await check('direct Design/Develop routes preserve seven canonical matrices and foundations', async () => {
    for (const [path, heading, view] of [['/colors', 'Colors', 'design'], ['/spacing', 'Shape & spacing', 'design'], ['/develop', 'Colors documentation', 'develop'], ['/develop/colors', 'Colors documentation', 'develop'], ['/develop/spacing', 'Shape & spacing documentation', 'develop'], ...Object.keys(counts).flatMap(id => [[`/${id}`, id[0].toUpperCase() + id.slice(1), 'design'], [`/develop/${id}`, id[0].toUpperCase() + id.slice(1) + ' documentation', 'develop']])]) {
      assert.equal((await fetch(origin + path, { signal: AbortSignal.timeout(5000) })).status, 200, path);
      await navigate(main, path); await systemReady(main, heading, view);
      if (view === 'design' && Object.hasOwn(counts, path.slice(1))) {
        assert.equal(await main.evaluate(`document.querySelectorAll('[data-component-matrix="${path.slice(1)}"] [data-recipe-example]').length`), counts[path.slice(1)]);
      }
    }
    await noProjectMutation(main, {});
  });
  await check('all legacy URLs are paused, not hidden Studio; keyboard System link works', async () => {
    for (const path of ['/pages', '/pages/', '/examples/page-editor']) {
      assert.equal((await fetch(origin + path, { signal: AbortSignal.timeout(5000) })).status, 200);
      await navigate(main, path); await paused(main);
      const link = named('a', 'Open design system');
      // Tab to the actual link, rather than substituting a scripted click for keyboard access.
      let reached = false;
      for (let i = 0; i < 16; i++) {
        await key(main, 'Tab');
        if (await main.evaluate(`document.activeElement===(${link})`)) { reached = true; break; }
      }
      assert.ok(reached, 'System link must be keyboard reachable');
      await key(main, 'Enter'); await systemReady(main);
      await noProjectMutation(main, {});
    }
  });
  await check('Back/Forward and actual static 404 never reopen Project or duplicate shell', async () => {
    await navigate(main, '/pages'); await paused(main);
    await click(main, named('a', 'Open design system')); await systemReady(main);
    await main.evaluate('history.back()'); await wait(main, 'location.pathname === "/pages"'); await paused(main);
    await main.evaluate('history.forward()'); await wait(main, 'location.pathname !== "/pages"'); await systemReady(main);
    const notFound = await readFile(resolve(root, '404.html'), 'utf8');
    for (const path of ['/qa-unknown-route', '/pages/nested', '/develop/qa-unknown-component']) {
      const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 404); assert.equal(await response.text(), notFound, 'Serve the exported not-found HTML, not plain text or parent route');
      await navigate(main, path);
      await wait(main, 'document.body.innerText.includes("404")');
      assert.equal(await main.evaluate('document.body.innerText.includes("Project editing is paused")'), false);
      assert.equal(await main.evaluate(`!!${q(forbiddenProject)}`), false);
      assert.equal(await main.evaluate(`document.querySelectorAll('.studio-shell').length`), 0, '404 must not mount a fallback Colors Studio');
    }
  });
  await check('legacy raw bytes survive System theme, edit, undo/redo/reset, navigation and reload', async () => {
    const entries = recoveryFixture(); await seed(main, entries); await systemReady(main);
    await click(main, q('[aria-label="Design theme"] button[aria-label="Dark"]'));
    await click(main, q('[aria-label="Design theme"] button[aria-label="Light"]'));
    await navigate(main, '/spacing'); await systemReady(main, 'Shape & spacing');
    await click(main, q('#token-radius'));
    await key(main, 'a', 4, ['selectAll']); await main.send('Input.insertText', { text: '19.375' }); await key(main, 'Enter');
    await wait(main, `JSON.parse(localStorage.getItem(${JSON.stringify(keys.systems)})).systems.find(e=>e.id===${JSON.stringify(targetId)}).system.themes.light.global.radius===19.375`);
    await click(main, q('[aria-label="Undo change"]')); await click(main, q('[aria-label="Redo change"]'));
    await nativeConfirm(main, () => click(main, named('button', 'Reset shared dimensions')));
    await navigate(main, '/develop/card'); await systemReady(main, 'Card documentation', 'develop');
    await navigate(main, '/'); await systemReady(main);
    const beforeReload = await main.evaluate('performance.timeOrigin');
    await main.send('Page.reload'); await wait(main, `performance.timeOrigin !== ${beforeReload}`);
    await systemReady(main); await noProjectMutation(main, entries);
  });
  await check('raw recovery completes a genuine allowlisted download; controlled read failure is retryable', async () => {
    const entries = recoveryFixture(); await seed(main, entries, '/pages'); await paused(main);
    const before = await snapshot(main), requestStart = requests.length;
    assert.deepEqual(downloads, [], 'No automatic recovery download');
    assert.deepEqual(await audit(main), [], 'Suspended mount is read-only');
    await main.evaluate(`window.__qaReadFailure=${JSON.stringify(keys.pageEditor)}`);
    await click(main, recoveryButton);
    await wait(main, `[...document.querySelectorAll('[role="alert"],[role="status"],[aria-live]')].some(e=>/fail|unable|cannot|unavailable|error|retry/i.test(e.textContent))`, 'accessible recovery read error');
    assert.deepEqual(downloads, [], 'Failed capture must not download a partial recovery');
    await main.evaluate('window.__qaReadFailure=undefined');
    assert.deepEqual(await snapshot(main), before);
    await click(main, recoveryButton);
    const envelope = await download();
    assert.deepEqual(Object.keys(envelope).sort(), ['format', 'records', 'version']);
    assert.equal(envelope.format, 'bambiui.local-recovery'); assert.equal(envelope.version, 1);
    assert.deepEqual(envelope.records, recoveryRecords(entries), 'Exact sorted allowlist and raw Unicode/malformed values');
    for (const { key, raw } of envelope.records) {
      assert.ok(Buffer.byteLength(key) + Buffer.byteLength(raw) <= 8 * 1024 * 1024);
      assert.deepEqual(Buffer.from(raw), Buffer.from(entries[key]));
    }
    assert.deepEqual(await snapshot(main), before); assert.deepEqual(await audit(main), [], 'Recovery must not write/remove/clear storage');
    assert.deepEqual(requests.slice(requestStart).filter(request => ['Fetch', 'XHR', 'Ping'].includes(request.type) || !['GET', 'HEAD'].includes(request.method)), [], 'Recovery must not fetch/upload stored data');
  });
  await check('empty recovery reports no records without producing a file or writing defaults', async () => {
    await seed(main, {}, '/pages'); await paused(main);
    await click(main, recoveryButton);
    await wait(main, `[...document.querySelectorAll('[role="alert"],[role="status"],[aria-live]')].some(e=>/no (local )?records/i.test(e.textContent))`, 'explicit empty capture status');
    assert.deepEqual(downloads, []); assert.deepEqual(await snapshot(main), {}); assert.deepEqual(await audit(main), []);
  });
  await check('linked/inactive/invalid/missing/future/orphan references fail closed without mutation', async () => {
    for (const [name, projects] of deletionFixtures()) {
      const entries = { ...systemsFixture(), ...projects };
      await seed(main, entries); await systemReady(main); await manager(main);
      await wait(main, `(${deleteButton}).disabled`, name);
      const explanation = await main.evaluate(`${q('.system-switcher-actions')}.textContent + ' ' + (${deleteButton}).title`);
      assert.match(explanation, /project|reference|inspect|recover|unavailable/i, name);
      assert.doesNotMatch(explanation, /change its system first|go to project|rebind/i);
      assert.deepEqual(await snapshot(main), entries, name); await noProjectMutation(main, entries);
    }
  });
  await check('inaccessible reference storage blocks deletion and does not mutate bytes', async () => {
    const entries = { ...systemsFixture(), ...projectFixture(otherId) };
    await seed(main, entries); await systemReady(main);
    await main.evaluate(`window.__qaReadFailure=${JSON.stringify(keys.index)};window.dispatchEvent(new Event('focus'))`);
    await manager(main); await wait(main, `(${deleteButton}).disabled`);
    await main.evaluate('window.__qaReadFailure=undefined');
    assert.deepEqual(await snapshot(main), entries); assert.deepEqual(await audit(main), []);
  });
  await check('valid unrelated project permits safe confirmed System deletion', async () => {
    const entries = { ...systemsFixture(), ...projectFixture(otherId) };
    await seed(main, entries); await systemReady(main); await manager(main);
    await wait(main, `!(${deleteButton}).disabled`, 'Unreferenced System must be deletable');
    await openDeleteDialog(main);
    await wait(main, `!(${deleteAccept}).disabled`);
    await click(main, deleteAccept);
    await wait(main, `!JSON.parse(localStorage.getItem(${JSON.stringify(keys.systems)})).systems.some(e=>e.id===${JSON.stringify(targetId)})`);
    await deleteDialogClosed(main);
    const collection = JSON.parse((await snapshot(main))[keys.systems]);
    assert.equal(collection.systems.length, 1); assert.equal(collection.activeId, otherId);
    await noProjectMutation(main, entries);
  });
  await check('deletion Cancel and Escape preserve both Systems and restore summary focus', async () => {
    const entries = { ...systemsFixture(), ...projectFixture(otherId) };
    await seed(main, entries); await systemReady(main);
    for (const dismissal of ['Cancel', 'Escape']) {
      await manager(main); await openDeleteDialog(main);
      if (dismissal === 'Cancel') await click(main, named(`${deletePopup} button`, 'Cancel'));
      else await key(main, 'Escape');
      await deleteDialogClosed(main);
      assert.deepEqual(await snapshot(main), entries, `${dismissal} must not mutate either System or Project bytes`);
      assert.deepEqual(await audit(main), [], `${dismissal} must not write storage`);
    }
  });
  await check('repeated deletion confirmation commits once and retains the remaining System', async () => {
    const entries = { ...systemsFixture(), ...projectFixture(otherId) };
    await seed(main, entries); await systemReady(main); await manager(main); await openDeleteDialog(main);
    await wait(main, `!(${deleteAccept}).disabled`);
    // Same-task synthetic re-entry complements the trusted-pointer positive test above.
    // Retain the element: a second event must not target another System after unmount.
    await main.evaluate(`(()=>{const button=(${deleteAccept});button.click();button.click();})()`);
    await deleteDialogClosed(main);
    const collection = JSON.parse((await snapshot(main))[keys.systems]);
    assert.deepEqual(collection.systems.map(entry => entry.id), [otherId]);
    assert.equal(collection.activeId, otherId);
    assert.equal((await audit(main)).filter(entry => entry.operation === 'setItem' && entry.key === keys.systems).length, 1, 'One authoritative collection save for repeated confirmation');
    await noProjectMutation(main, entries);
  });
  await check('same-origin second-tab reference changes block the open deletion dialog without auto-delete', async () => {
    const unrelated = projectFixture(otherId);
    const entries = { ...systemsFixture(), ...unrelated }; await seed(main, entries); await systemReady(main); await manager(main);
    await wait(main, `!(${deleteButton}).disabled`);
    const { targetId: secondTarget } = await main.send('Target.createTarget', { url: origin + fixturePath });
    let second;
    try {
      const list = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
      const target = list.find(target => target.id === secondTarget); assert.ok(target, 'Second tab CDP target');
      second = await connect(target.webSocketDebuggerUrl);
      await wait(second, `location.origin===${JSON.stringify(origin)} && document.readyState==='complete'`);
      const linked = projectFixture();
      await second.evaluate(`for(const [key,raw] of Object.entries(${JSON.stringify(linked)}))localStorage.setItem(key,raw)`);
      await main.send('Page.bringToFront');
      await wait(main, `(${deleteButton}).disabled`, 'storage event/focus refresh must see second-tab reference');
      await second.evaluate(`for(const [key,raw] of Object.entries(${JSON.stringify(unrelated)}))localStorage.setItem(key,raw)`);
      await main.send('Page.bringToFront');
      await wait(main, `!(${deleteButton}).disabled`, 'Restoring an unrelated reference refreshes the safe state');
      await openDeleteDialog(main);
      await wait(main, `!(${deleteAccept}).disabled`);
      // Same registered key/index: only the document value changes, avoiding partial creation.
      // The controlled dialog must keep processing real second-tab Storage API events.
      await second.evaluate(`for(const [key,raw] of Object.entries(${JSON.stringify(linked)}))localStorage.setItem(key,raw)`);
      assert.deepEqual(await second.evaluate(`Object.fromEntries(Object.keys(${JSON.stringify(linked)}).map(key=>[key,localStorage.getItem(key)]))`), linked);
      await wait(main, `Object.entries(${JSON.stringify(linked)}).every(([key,raw])=>localStorage.getItem(key)===raw)`, 'second-tab writes become visible while the app dialog stays open');
      await wait(main, `${q(deletePopup)}?.checkVisibility() && ${q(deletePopup)}.hasAttribute('data-delete-blocked') && (${deleteAccept}).disabled`, 'open dialog blocks acceptance of the newly referenced System');
      const status = `${deletePopup} [data-system-delete-status]`;
      await wait(main, `${q(status)}?.getAttribute('role')==='alert' && ${q(status)}.textContent.trim().length>0`, 'reference block is announced');
      assert.match(await main.evaluate(`${q(status)}.textContent`), /project|reference|inspect|unavailable/i);
      assert.equal(await main.evaluate(`${q(deletePopup)}.dataset.systemId`), targetId);
      const observed = await snapshot(main);
      assert.deepEqual(projectRecords(observed), projectRecords(linked), 'Main tab must observe the completed second-tab reference writes');
      assert.deepEqual(JSON.parse(observed[keys.systems]), JSON.parse(entries[keys.systems]), 'The open blocked dialog must preserve both Systems without auto-deleting');
      assert.deepEqual(await audit(main), [], 'Receiving references and blocking the open dialog must not write storage');
      // A disabled confirmation cannot activate, even through DOM click().
      await main.evaluate(`(${deleteAccept}).click()`);
      assert.deepEqual((await snapshot(main))[keys.systems], entries[keys.systems]);
      await click(main, named(`${deletePopup} button`, 'Cancel')); await deleteDialogClosed(main);
      assert.deepEqual((await snapshot(main))[keys.systems], entries[keys.systems]);
      await noProjectMutation(main, { ...entries, ...linked });
    } finally {
      if (second) { sessions.delete(second); second.fail(new Error('Second tab cleanup')); second.socket.close(); }
      await main.send('Target.closeTarget', { targetId: secondTarget });
    }
  });
  await check('Card size title edits share md variants and pointer target changes discard outgoing drafts', async () => {
    const entries = { ...systemsFixture(), ...projectFixture(otherId) };
    const collection = JSON.parse(entries[keys.systems]);
    const imported = collection.systems.find(entry => entry.id === targetId).system;
    for (const theme of Object.values(imported.themes)) {
      const card = (theme.componentRecipes ??= {}).card ??= {};
      card['elevated.md'] = { title: { fontSize: 17.625, fontWeight: 515 } };
      card['filled.md'] = { title: { fontSize: 22.125, fontWeight: 725 } };
    }
    entries[keys.systems] = JSON.stringify(collection);
    entries[keys.mirror] = JSON.stringify(imported);
    await seed(main, entries, '/card'); await systemReady(main, 'Card');
    const original = structuredClone(imported);
    const inspection = await snapshot(main), inspectionWrites = await audit(main);
    await chooseCard(main);
    await click(main, named('[data-system-recipe-controls] button', 'Select Title text'));
    assert.deepEqual(await snapshot(main), inspection, 'Inspecting a legacy record never harmonizes divergent same-size peers');
    assert.deepEqual(await audit(main), inspectionWrites, 'Inspection performs no storage writes');
    assert.deepEqual(await main.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.systems)})).systems.find(e=>e.id===${JSON.stringify(targetId)}).system`), original);
    const titleSize = '[id="system-recipe-card-outlined.md-title-text-fontSize"]';
    await fill(main, titleSize, '19.375');
    await fill(main, '[id="system-recipe-card-outlined.md-title-text-fontWeight"]', '635');
    await wait(main, `JSON.parse(localStorage.getItem(${JSON.stringify(keys.systems)})).systems.find(e=>e.id===${JSON.stringify(targetId)}).system.themes.light.componentRecipes?.card?.['outlined.md']?.title?.fontWeight===635`);
    const expected = structuredClone(original);
    for (const theme of Object.values(expected.themes)) {
      const card = (theme.componentRecipes ??= {}).card ??= {};
      for (const variant of ['outlined', 'elevated', 'filled']) {
        const title = (card[`${variant}.md`] ??= {}).title ??= {};
        title.fontSize = 19.375;
        title.fontWeight = 635;
      }
    }
    const saved = () => main.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.systems)})).systems.find(e=>e.id===${JSON.stringify(targetId)}).system`);
    assert.deepEqual(await saved(), expected, 'All three md titles share typography in both themes; other sizes and parts remain unchanged');
        for (const variant of ['outlined', 'elevated', 'filled']) {
          const title = `[data-component-matrix="card"] [data-recipe-example="${variant}.md"] [data-ds-component="card"][data-component-part="title"]`;
          assert.deepEqual(await main.evaluate(`(()=>{const s=getComputedStyle(${q(title)});return [s.fontSize,s.fontWeight]})()`), ['19.375px', '635']);
        }
    await click(main, q('[aria-label="Undo change"]'));
    const sizeOnly = structuredClone(expected);
    for (const mode of ['light', 'dark']) for (const variant of ['outlined', 'elevated', 'filled']) {
      const title = sizeOnly.themes[mode].componentRecipes.card[`${variant}.md`].title;
      const weight = original.themes[mode].componentRecipes?.card?.[`${variant}.md`]?.title?.fontWeight;
      if (weight === undefined) delete title.fontWeight; else title.fontWeight = weight;
    }
    assert.deepEqual(await saved(), sizeOnly, 'One undo restores every divergent peer weight');
    await click(main, q('[aria-label="Undo change"]'));
    assert.deepEqual(await saved(), original, 'A second undo restores the divergent imported records exactly');
    for (let i = 0; i < 2; i++) await click(main, q('[aria-label="Redo change"]'));
    assert.deepEqual(await saved(), expected);
    const before = await snapshot(main), writes = await audit(main);
    await fill(main, titleSize, '77.125', false);
    await click(main, named('[data-system-recipe-controls] button', 'Select Card frame'));
    await wait(main, `${q('[data-system-recipe-controls]')}?.dataset.part==='root'`);
    assert.deepEqual(await snapshot(main), before, 'Pointer blur cannot commit to the old or new layer');
    await click(main, named('[data-system-recipe-controls] button', 'Select Title text'));
    await wait(main, `${q(titleSize)}?.value==='19.375'`);
    await fill(main, titleSize, 'invalid-draft', false); await key(main, 'Enter');
    await wait(main, `${q(titleSize)}.getAttribute('aria-invalid')==='true'`);
    await click(main, named('[data-system-recipe-controls] button', 'Select Card frame'));
    await click(main, named('[data-system-recipe-controls] button', 'Select Title text'));
    assert.equal(await main.evaluate(`${q(titleSize)}.value`), '19.375');
    assert.deepEqual(await snapshot(main), before); assert.deepEqual(await audit(main), writes);
    await noProjectMutation(main, entries);
  });
  await check('Card filters clear hidden selection without writes; preview samples stay session-only', async () => {
    await seed(main, systemsFixture(), '/card'); await systemReady(main, 'Card');
    await chooseCard(main);
    const before = await snapshot(main), writes = await audit(main);
    const filter = '[data-component-matrix="card"] select[aria-label="Filter variant"]';
    await main.evaluate(`(()=>{const e=${q(filter)};e.value='filled';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await wait(main, `!${q('[data-system-recipe-controls]')} && document.querySelectorAll('[data-component-matrix="card"] [data-recipe-example]').length===3`);
    assert.equal(await main.evaluate(`document.querySelectorAll('[data-recipe-example][data-selected]').length`), 0);
    await main.evaluate(`(()=>{const e=${q(filter)};e.value='';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await wait(main, `document.querySelectorAll('[data-component-matrix="card"] [data-recipe-example]').length===9`);
    assert.equal(await main.evaluate(`!!${q('[data-system-recipe-controls]')}`), false, 'Clearing filter cannot select an implicit recipe');
    assert.deepEqual(await snapshot(main), before); assert.deepEqual(await audit(main), writes);
    await chooseCard(main);
    const css = await exportTokens(main, 'CSS'), json = await exportTokens(main, 'JSON');
    await click(main, named('[aria-label="Component editor"] [role="tab"]', 'Preview'));
    const previewTitle = '#system-default-card-title';
    const originalTitle = await main.evaluate(`${q(previewTitle)}.value`);
    await fill(main, previewTitle, 'QA temporary title — 雪 🦌');
    await wait(main, `[...document.querySelectorAll('[data-component-matrix="card"] [data-component-part="title"]')].some(e=>e.textContent.includes('QA temporary title'))`);
    assert.deepEqual(await snapshot(main), before); assert.deepEqual(await audit(main), writes);
    assert.equal(await exportTokens(main, 'CSS'), css);
    assert.deepEqual(await exportTokens(main, 'JSON'), json);
    await click(main, named('button', 'Reset preview'));
    await wait(main, `${q(previewTitle)}.value===${JSON.stringify(originalTitle)}`);
    await fill(main, previewTitle, 'QA discarded on reload');
    const time = await main.evaluate('performance.timeOrigin'); await main.send('Page.reload');
    await wait(main, `performance.timeOrigin!==${time}`); await systemReady(main, 'Card');
    await click(main, named('[aria-label="Component editor"] [role="tab"]', 'Preview'));
    assert.equal(await main.evaluate(`${q(previewTitle)}.value`), originalTitle);
    assert.deepEqual(await snapshot(main), before); assert.deepEqual(await audit(main), writes);
  });
  await check('390px System panels and suspended recovery are keyboard reachable without overflow', async () => {
    await seed(main, systemsFixture()); await systemReady(main);
    await main.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await click(main, q('[aria-label="Focus canvas"]'));
    await click(main, q('[aria-label="Show panels"]'));
    assert.equal(await main.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await navigate(main, '/pages'); await paused(main);
    assert.equal(await main.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    let reached = false;
    for (let i = 0; i < 16; i++) {
      await key(main, 'Tab');
      if (await main.evaluate(`document.activeElement===(${recoveryButton})`)) { reached = true; break; }
    }
    assert.ok(reached, 'Recovery button must be keyboard reachable');
    await key(main, 'Enter'); const envelope = await download();
    assert.deepEqual(envelope.records, recoveryRecords(systemsFixture()));
  });
  await check('no observed runtime/hydration errors or unexpected recovery downloads', async () => {
    await delay(150); assert.deepEqual(errors, []); assert.deepEqual(downloads, []);
  });
} catch (error) {
  process.exitCode = 1; console.error(`FAIL ${stage}: ${error.stack || error}`);
} finally {
  stopping = true; clearTimeout(watchdog);
  if (mainSession?.socket.readyState === WebSocket.OPEN && !abort.signal.aborted) {
    try { await bounded(mainSession.send('Browser.close'), 'graceful Browser.close', 1000); }
    catch (error) { console.log(`CLEANUP Browser.close response unavailable: ${error.message}`); }
  }
  abort.abort();
  for (const session of sessions) { session.fail(new Error('Smoke cleanup')); session.socket.close(); }
  try { await stopDisposableBrowser(chrome, 2000, true); }
  catch (error) { process.exitCode = 1; console.error(`FAIL browser cleanup: ${error.stack || error}`); }
  try {
    server?.closeAllConnections();
    if (server?.listening) await bounded(new Promise(resolve => server.close(resolve)), 'static host cleanup', 2000);
    if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
  } catch (error) { process.exitCode = 1; console.error(`FAIL fixture cleanup: ${error.stack || error}`); }
  console.log(`RESULT ${checks} checks passed, ${failures.length} checks failed; ${process.exitCode ? 'FAILED (no skips)' : 'PASS'}`);
  console.log('SCOPE Controlled Chromium fixtures, not human/VoiceOver/native zoom acceptance. Includes representative Card size-group/filter/pointer-draft/session-preview CSS/JSON isolation, not full seven-component acceptance. ZIP isolation is in studio-source-smoke; adapter limit/error matrix belongs to A unit tests. No build/generator is run by this script.');
}
