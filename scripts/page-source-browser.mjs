import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
const node = (id) => q(`[data-page-node="${id}"]`);

/**
 * Check an already built static consumer. expectedThemes is
 * { light: { background, foreground, spacingLg, spacingMd }, dark: { ... } }.
 * Colors are CSS colors; spacing values are finite numbers in CSS pixels.
 * Resolves with no value; rejects on any failed assertion or browser error.
 * Uses desktop CSS viewports, not device emulation, browser zoom or a screen reader.
 */
export async function checkPageSourceBrowser({ outDir, expectedThemes }) {
  let server, chrome, profile, socket, origin, sequence = 0, stopped = false;
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
  function healthy() { assert.deepEqual(errors, [], 'Consumer runtime/network errors'); }
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
    const input = q(`input[name="${name}"]`);
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
    abort.abort(new Error('Page source browser check exceeded its 120-second budget'));
    failPending(abort.signal.reason);
  }, 115_000);
  async function run() {
    assert.equal(typeof WebSocket, 'function', 'Node with built-in WebSocket (Node 22+) is required');
    for (const mode of ['light', 'dark']) {
      const tokens = expectedThemes?.[mode];
      assert.ok(tokens, `Missing expectedThemes.${mode}`);
      for (const name of ['background', 'foreground']) assert.equal(typeof tokens[name], 'string', `${mode}.${name} must be a CSS color`);
      for (const name of ['spacingLg', 'spacingMd']) assert.ok(Number.isFinite(tokens[name]) && tokens[name] >= 0, `${mode}.${name} must be CSS pixels`);
    }
    const root = await realpath(resolve(outDir));
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
    profile = await mkdtemp(resolve(tmpdir(), 'bambiui-page-source-'));
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
        errors.push(`Unexpected dialog: ${p.message}`);
        send('Page.handleJavaScriptDialog', { accept: false }).catch((error) => errors.push(String(error)));
      }
    });
    for (const domain of ['Runtime', 'Log', 'Network', 'Page']) await send(`${domain}.enable`);
    for (const [mode, path] of [['light', '/'], ['dark', '/dark']]) {
      const tokens = expectedThemes[mode];
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      const navigation = await send('Page.navigate', { url: origin + path });
      assert.ok(!navigation.errorText, navigation.errorText);
      await wait(`${q('.consumer-hydration-marker[data-hydrated="true"]')} && ${q(`[data-ds-theme="${mode}"]`)}`);
      const colors = await evaluate(`(()=>{const e=${q(`[data-ds-theme="${mode}"]`)},s=getComputedStyle(e),probe=document.createElement('span');e.append(probe);const normalize=v=>{if(!CSS.supports('color',v))throw Error('Invalid expected color: '+v);probe.style.color=v;return getComputedStyle(probe).color};const result={background:s.backgroundColor,foreground:s.color,expectedBackground:normalize(${JSON.stringify(tokens.background)}),expectedForeground:normalize(${JSON.stringify(tokens.foreground)})};probe.remove();return result})()`);
      assert.equal(colors.background, colors.expectedBackground, `${mode} painted background`);
      assert.equal(colors.foreground, colors.expectedForeground, `${mode} painted foreground`);
      for (const width of [1440, 375]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
        const layout = await evaluate(`(()=>{const grid=${node('profile-grid')},s=getComputedStyle(grid),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {display:s.display,columns:s.gridTemplateColumns.split(/\\s+/).filter(Boolean),rowGap:parseFloat(s.rowGap),columnGap:parseFloat(s.columnGap),md:parseFloat(getComputedStyle(${q('[data-ds-theme]')}).getPropertyValue('--ds-spacing-md')),grid:rect(grid),first:rect(${node('first-cell')}),last:rect(${node('last-cell')}),email:rect(${node('email-cell')}),overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth}})()`);
        const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${mode}/${width} ${label}: ${actual} != ${expected}`);
        assert.equal(layout.display, 'grid');
        assert.equal(layout.columns.length, width === 1440 ? 2 : 1, `${mode}/${width} computed columns`);
        near(layout.rowGap, tokens.spacingLg, 'row gap'); near(layout.columnGap, tokens.spacingLg, 'column gap');
        near(layout.md, tokens.spacingMd, 'spacingMd CSS token');
        assert.ok(layout.first.width > 0 && layout.first.height > 0 && layout.last.height > 0, 'Visible grid cells');
        near(layout.email.x, layout.grid.x, 'email left'); near(layout.email.width, layout.grid.width, 'email full span');
        if (width === 1440) {
          near(layout.first.y, layout.last.y, 'shared row');
          near(layout.last.x - layout.first.right, tokens.spacingLg, 'horizontal geometry gap');
          near(layout.first.width, layout.last.width, 'equal columns');
          near(layout.email.y - Math.max(layout.first.bottom, layout.last.bottom), tokens.spacingLg, 'email row gap');
        } else {
          near(layout.first.x, layout.last.x, 'single column');
          near(layout.first.width, layout.grid.width, 'first full width');
          near(layout.last.y - layout.first.bottom, tokens.spacingLg, 'vertical geometry gap');
          near(layout.email.y - layout.last.bottom, tokens.spacingLg, 'email row gap');
        }
        assert.ok(layout.overflow <= 1, `${mode}/${width} document horizontal overflow: ${layout.overflow}`);
      }
      const toggle = `(()=>{const input=${q('input[name="notifications"]')};return ${q('[role="switch"][name="notifications"]')} || input?.closest('[role="switch"]') || (${node('notifications')}?.matches('[role="switch"]') ? ${node('notifications')} : ${node('notifications')}?.querySelector('[role="switch"]'))})()`;
      const checked = `(${toggle}).getAttribute('aria-checked')`;
      assert.ok(await evaluate(`!!(${toggle})`), 'Missing notifications switch');
      const initial = await evaluate(checked);
      assert.ok(['true', 'false'].includes(initial), 'Switch must expose aria-checked');
      await click(toggle); await wait(`${checked} === ${JSON.stringify(initial === 'true' ? 'false' : 'true')}`);
      await click(toggle); await wait(`${checked} === ${JSON.stringify(initial)}`);
      assert.ok(await evaluate(`(${toggle}) === document.activeElement || (${toggle}).contains(document.activeElement)`), 'Pointer must focus switch before Space');
      await key(' ', 'Space', 32, { text: ' ' }); await wait(`${checked} === ${JSON.stringify(initial === 'true' ? 'false' : 'true')}`);
      await key(' ', 'Space', 32, { text: ' ' }); await wait(`${checked} === ${JSON.stringify(initial)}`);
      const email = q('input[name="email"]');
      const form = `${email}.form`;
      const button = `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Formu dene')`;
      assert.equal(await evaluate(`(${form}).method.toLowerCase()`), 'get', 'Fixture must submit GET, not save a form');
      assert.ok(await evaluate(`(${button}).form === (${form}) && (${button}).type === 'submit' && !(${form}).noValidate && !(${button}).formNoValidate`), 'Native validating submit button');
      await fill('firstName', 'Ada'); await fill('lastName', 'Lovelace'); await fill('email', '');
      const before = await evaluate('location.href');
      const action = new URL(await evaluate(`(${form}).action`));
      assert.ok(await evaluate(`${email}.required && ${email}.validity.valueMissing && !(${form}).checkValidity()`), 'Empty email must be invalid');
      await click(button);
      assert.equal(await evaluate('location.href'), before, 'Empty email must block navigation');
      assert.ok(await evaluate(`document.activeElement === ${email}`), 'Native validation focuses empty email');
      await fill('email', 'invalid-email');
      assert.ok(await evaluate(`${email}.validity.typeMismatch && !(${form}).checkValidity()`), 'Malformed email must be invalid');
      await click(button);
      assert.equal(await evaluate('location.href'), before, 'Invalid email must block navigation');
      assert.ok(await evaluate(`document.activeElement === ${email}`), 'Native validation focuses invalid email');
      await fill('email', 'ada@example.com');
      const values = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };
      if (await evaluate(checked) === 'true') { await click(toggle); await wait(`${checked} === 'false'`); }
      let data = await evaluate(`[...new FormData(${form}).entries()]`);
      for (const [name, value] of Object.entries(values)) assert.deepEqual(data.filter(([key]) => key === name), [[name, value]], `FormData ${name}`);
      assert.equal(data.some(([name]) => name === 'notifications'), false, 'Unchecked switch excluded from FormData');
      await click(toggle); await wait(`${checked} === 'true'`);
      data = await evaluate(`[...new FormData(${form}).entries()]`);
      const notifications = data.filter(([name]) => name === 'notifications');
      assert.equal(notifications.length, 1, 'Checked switch included once in FormData');
      assert.ok(notifications[0][1], 'Checked switch has a nonempty form value');
      assert.ok(await evaluate(`(${form}).checkValidity()`), 'Filled form valid');
      await click(button);
      await wait(`location.search.length > 0 && ${q('.consumer-hydration-marker[data-hydrated="true"]')}`);
      const submitted = new URL(await evaluate('location.href'));
      assert.equal(submitted.origin, origin, 'Submission stays in local consumer');
      assert.equal(submitted.pathname.replace(/\/$/, '') || '/', action.pathname.replace(/\/$/, '') || '/', 'Submission preserves the exported form action');
      assert.deepEqual([...submitted.searchParams.entries()].sort(), data.sort(), 'GET query matches native FormData');
      healthy();
      console.log(`PASS: page source browser ${mode}: CSS, responsive geometry, switch, native inputs/validation and GET FormData`);
    }
    healthy();
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
