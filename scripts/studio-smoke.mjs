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
let server, chrome, profile, socket, sequence = 0, acceptImportDialog = false;
const watchdog = setTimeout(() => { console.error('Smoke test exceeded 180 seconds'); process.exit(1); }, 180000);
const ids = ['button', 'input', 'card', 'badge', 'switch', 'checkbox', 'text'];
const foundations = ['colors', 'spacing'];
const href = (view, id = 'overview') => `${view === 'develop' ? '/develop' : ''}${id === 'overview' ? '' : `/${id}`}` || '/';
const canvas = '[aria-label="Component canvas"]';
const viewNav = '.studio-header nav.view-switch';
const themeControl = '[aria-label="Design theme"]';
const camera = '[data-canvas]';

const moved = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
async function wheel(point, deltaX, deltaY, modifiers = 0) {
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX,deltaY,modifiers});
}
async function canvasBackground() {
  // Locate a real empty hit target; specimen inputs and controls must remain interactive.
  return evaluate(`(()=>{const e=${q(canvas)},r=e.getBoundingClientRect();for(let y=r.top+12;y<Math.min(r.bottom,innerHeight)-12;y+=8)for(let x=r.left+12;x<Math.min(r.right,innerWidth)-12;x+=8){const t=document.elementFromPoint(x,y);if(t && e.contains(t) && !t.closest('[data-specimen],button,a,input,textarea,select,label'))return {x,y};}throw Error('No visible canvas background')})()`);
}
async function stableCamera() {
  await delay(500);
  return evaluate(cameraState);
}
async function route(view, id = 'overview') {
  const path = href(view, id);
  await wait(`location.pathname === ${JSON.stringify(path)} && ${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
  await wait(`${q('.workspace-panel--' + view)} && !${q('.workspace-panel--' + view)}.hidden`);
  assert.equal(await evaluate(`${q('.studio-sidebar a[aria-current="page"]')}.getAttribute('href')`), path);
  assert.equal(await evaluate(`${q(viewNav + ' a[aria-current="page"]')}.textContent.trim()`), view === 'design' ? 'Design' : 'Develop');
  assert.equal(await evaluate(`!!${q('.breadcrumbs')} || !!${q('.viewport-controls')}`), false);
  assert.equal(await evaluate(`${q('#token-editor')}.hidden`), view === 'develop');
  assert.equal(await evaluate(`!!${q('.editor-scope')}`),false);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-specimen]')].map(e=>e.dataset.specimen).sort()`), [...ids].sort());
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-foundation]')].map(e=>e.dataset.foundation).sort()`), ['colors', 'spacing', 'text']);
  assert.equal(await evaluate(`document.querySelectorAll('[data-specimen="text"]').length`),1);
  assert.equal(await evaluate(`${q('[data-specimen="text"]')}===${q('[data-foundation="text"]')}`),true);
}
async function navigate(view, id = 'overview') {
  const currentView = await evaluate(`location.pathname.startsWith('/develop') ? 'develop' : 'design'`);
  if (currentView !== view) await click(named(viewNav + ' a',view === 'design' ? 'Design' : 'Develop'));
  await click(q(`.studio-sidebar a[href="${href(view, id)}"], ${viewNav} a[href="${href(view, id)}"]`));
  await route(view, id);
}
async function key(key, code = key) {
  const windowsVirtualKeyCode = {ArrowDown:40,ArrowRight:39,Enter:13,Tab:9,' ':32}[key];
  await send('Input.dispatchKeyEvent', {type:'keyDown', key, code, windowsVirtualKeyCode, ...(key === 'Enter' ? {text:'\r'} : {})});
  await send('Input.dispatchKeyEvent', {type:'keyUp', key, code, windowsVirtualKeyCode});
}

function send(method, params = {}) {
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
  do { if (await evaluate(expression)) return; await delay(60); } while (Date.now() < until);
  throw new Error(`Timed out: ${expression}`);
}
const q = selector => `document.querySelector(${JSON.stringify(selector)})`;
const cameraState = `(() => {const view=${q(canvas)},layer=${q(camera)},matrix=new DOMMatrixReadOnly(getComputedStyle(layer).transform);return {x:matrix.m41,y:matrix.m42,scale:matrix.a,scrollLeft:view.scrollLeft,scrollTop:view.scrollTop,scrollWidth:view.scrollWidth,clientWidth:view.clientWidth,scrollHeight:view.scrollHeight,clientHeight:view.clientHeight}})()`;
const named = (selector, name) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => (e.textContent.trim() === ${JSON.stringify(name)} || (!e.textContent.trim() && e.getAttribute('aria-label') === ${JSON.stringify(name)})) && !e.closest('[hidden]'))`;
async function click(expression) {
  assert.ok(await evaluate(`!!(${expression})`), `Missing control: ${expression}`);
    const destination = await evaluate(`(${expression}).closest('a')?.getAttribute('href') || null`);
  await evaluate(`(${expression}).scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  const point = await evaluate(`(() => {const e=${expression},r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('Occluded: '+e.outerHTML);return {x,y};})()`);
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
  if(value) await send('Input.insertText',{text:value});
  await wait(`${q(selector)}.value === ${JSON.stringify(value)}`);
}
async function check(label, run) {
  try { await run(); console.log(`PASS ${label}`); }
  catch (error) { failures.push(label); console.error(`FAIL ${label}: ${error.stack || error}`); }
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
  if(chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const done = new Promise(resolve => chrome.once('exit',resolve));chrome.kill('SIGTERM');
    await Promise.race([done,delay(2000)]);
    if(chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  }
  if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(profile) await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200});
}
try {
  assert.equal(typeof WebSocket,'function','Node 22+ is required');
  await stat(resolve(root,'index.html'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await wait(`${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);

  await check('header navigation and theme, full-bleed Design canvas and one visible preview',async()=>{
    assert.equal(await evaluate(`${q(viewNav)}.closest('header') === ${q('.studio-header')}`),true);
    assert.equal(await evaluate(`${q(themeControl)}.closest('.canvas-theme') !== null`),true);
    assert.ok(await evaluate(`(()=>{const bar=${q('.canvas-theme')}.getBoundingClientRect(),preview=${q('.preview-frame')}.getBoundingClientRect();return bar.right<=preview.right && bar.top>=preview.top && bar.right>preview.right-130 && bar.top<preview.top+60})()`));
    assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(viewNav + ' a')})].map(e=>e.textContent.trim())`),['Design','Develop']);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(themeControl + ' button')})].map(e=>e.getAttribute('aria-label'))`),['Light','Dark']);
    assert.ok(await evaluate(`[...document.querySelectorAll(${JSON.stringify(themeControl + ' button')})].every(e=>!e.textContent.trim() && !!e.querySelector('svg'))`));
    assert.ok(await evaluate(`${q('.studio-header .brand')}.nextElementSibling === ${q(viewNav)}`),'view links should follow the brand');
    assert.ok(await evaluate(`${q('.studio-sidebar .sidebar-project input[aria-label="Design system name"]')}?.getClientRects().length > 0`),'editable name belongs to the project area');
    assert.equal(await evaluate(`!!${q('.studio-header input[aria-label="Design system name"]')}`),false);
    assert.ok(await evaluate(`!!${q('.preview-frame .canvas-history [aria-label="Undo change"] svg')} && !!${q('.preview-frame .canvas-history [aria-label="Redo change"] svg')}`));
    assert.ok(await evaluate(`(()=>{const bar=${q('.canvas-history')}.getBoundingClientRect(),preview=${q('.preview-frame')}.getBoundingClientRect();return bar.left>=preview.left && bar.top>=preview.top && bar.left<preview.left+90 && bar.top<preview.top+90})()`));
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
    assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--studio-color-border').trim()`),'#e4e4e7');
    assert.equal(await evaluate(`getComputedStyle(${q('.brand-mark')}).color`),'rgb(232, 103, 60)');
    assert.equal(await evaluate(`getComputedStyle(${q('.header-actions .studio-button[data-variant="primary"]')}).backgroundColor`),'rgb(63, 63, 70)');
    assert.equal(await evaluate(`getComputedStyle(${q('.header-actions .studio-button[data-variant="primary"]')}).color`),'rgb(255, 255, 255)');
    assert.equal(await evaluate(`${q('input[id$="-source"]')}.value`),'#e8673c');
    assert.equal(await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-primary').trim()`),'#e8673c');
    assert.notEqual(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--studio-color-accent').trim()`),await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-primary').trim()`));
    assert.equal(await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-on-primary').trim()`),'#291b15');
    assert.equal(await evaluate(`${q('#workspace-content')}.dataset.design`),'true');
    assert.equal(await evaluate(`${q('#workspace-content')}.style.getPropertyValue('--preview-background').trim()`),'#fff8f6');
    assert.equal(await evaluate(`${q('#workspace-content')}.style.getPropertyValue('--preview-background').trim()`),await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-background').trim()`));
    assert.equal(await evaluate(`${q('.canvas-label')}`),null);
    for(const foundation of ['colors','spacing','text']) assert.ok(await evaluate(`${q(`[data-foundation="${foundation}"]`)}.getBoundingClientRect().width > 0 && ${q(`[data-foundation="${foundation}"]`)}.getBoundingClientRect().height > 0`),`visible ${foundation} foundation`);
    assert.equal(await evaluate(`getComputedStyle(${q('.theme-pane:not([hidden]) section[aria-label="Button preview"]')}).borderTopWidth`),'0px');
    assert.equal(await evaluate(`getComputedStyle(${q('.theme-pane:not([hidden]) section[aria-label="Button preview"]')}).backgroundColor`),'rgba(0, 0, 0, 0)');
    assert.equal(await evaluate(`getComputedStyle(${q('.theme-pane:not([hidden]) section[aria-label="Card preview"] article')}).borderTopWidth`),'1px');
    assert.equal(await evaluate(`document.querySelectorAll('[data-palette-builder] button').length`),5);
    assert.equal(await evaluate(`${q('[data-palette-builder]')}.open`),false);
    await capture('studio-desktop-light');
  });
  await check('component typography consumes exported system constants',async()=>{
    const pane='[data-ds-theme="light"]';
    for(const [selector,property,constant] of [
      ['[data-specimen="button"] button[data-variant="primary"]','fontWeight','--ds-button-font-weight'],
      ['[data-specimen="card"] [class*="cardTitle"]','fontWeight','--ds-card-title-font-weight'],
      ['[data-specimen="badge"] [data-variant="outline"]','lineHeight','--ds-badge-line-height'],
    ]) {
      const computed=await evaluate(`getComputedStyle(${q(selector)})[${JSON.stringify(property)}]`);
      const value=await evaluate(`${q(pane)}.style.getPropertyValue(${JSON.stringify(constant)}).trim()`);
      if(property === 'lineHeight') {
        const fontSize=Number.parseFloat(await evaluate(`getComputedStyle(${q(selector)}).fontSize`));
        assert.ok(Math.abs(Number.parseFloat(computed)-fontSize*Number(value))<0.2,`${selector} uses ${constant}`);
      } else assert.equal(computed,value,`${selector} uses ${constant}`);
    }
  });
  await check('expanded specimens expose states and read-only choices resist pointer and keyboard input',async()=>{
    try {
      for(const [id,label] of [['switch','Read-only setting'],['checkbox','Read-only selection']]) {
        await navigate('design',id);
        await stableCamera();
        const specimen=`[data-specimen="${id}"]`;
        const control=`${specimen} [role="${id}"][aria-readonly="true"]`;
        assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(control)}).length`),1,`${id} read-only control`);
        assert.equal(await evaluate(`${q(control)}.getAttribute('aria-checked')`),'true');
        assert.equal(await evaluate(`${q(control)}.closest('label')?.textContent.trim()`),label);
        await click(q(control));
        assert.equal(await evaluate(`${q(control)}.getAttribute('aria-checked')`),'true',`${id} pointer click must not toggle`);
        await evaluate(`${q(control)}.focus({preventScroll:true})`);
        assert.equal(await evaluate(`document.activeElement===${q(control)}`),true,`${id} should be keyboard focusable`);
        await key(' ','Space');
        assert.equal(await evaluate(`${q(control)}.getAttribute('aria-checked')`),'true',`${id} Space must not toggle`);
        await key('Enter');
        assert.equal(await evaluate(`${q(control)}.getAttribute('aria-checked')`),'true',`${id} Enter must not toggle`);
        assert.equal(await evaluate(`${q(`${specimen} [role="${id}"][aria-disabled="true"]`)}.getAttribute('aria-checked')`),'true',`${id} disabled checked state`);
      }
      assert.equal(await evaluate(`${q('[data-specimen="switch"] [role="switch"][aria-invalid="true"]')}?.getAttribute('aria-checked')`),'false','switch error state');
      assert.equal(await evaluate(`${q('[data-specimen="checkbox"] [role="checkbox"][aria-checked="mixed"]')}?.closest('[data-size]')?.dataset.size`),'lg','large indeterminate checkbox');
      assert.ok(await evaluate(`${q('[data-specimen="checkbox"] [role="checkbox"][aria-checked="mixed"]')}?.getAttribute('aria-describedby')`),'indeterminate checkbox description');
      assert.equal(await evaluate(`${q('[data-specimen="checkbox"] [role="checkbox"][aria-invalid="true"]')}?.getAttribute('aria-required')`),'true','required checkbox error');
      await navigate('design','input');
      await stableCamera();
      const email='[data-specimen="input"] input[type="email"]';
      assert.equal(await evaluate(`${q(email)}.required && !${q(email)}.checkValidity()`),true,'empty required email');
      await fill(email,'not-an-email');
      assert.equal(await evaluate(`${q(email)}.validity.typeMismatch && !${q(email)}.checkValidity()`),true,'invalid email');
      assert.equal(await evaluate(`${q('[data-specimen="input"] input[type="url"][aria-invalid="true"]')}?.value`),'studio','URL error example');
      assert.ok(await evaluate(`!!${q('[data-specimen="input"] input[type="url"] + [aria-hidden="true"]')}`),'URL end icon');
      assert.equal(await evaluate(`${q('[data-specimen="input"] input:disabled')}?.closest('[data-size]')?.dataset.size`),'lg','disabled large input');
      assert.ok(await evaluate(`!!${q('[data-specimen="card"] article[data-variant="elevated"][data-size="lg"] [class*="cardContent"]')}`),'large card content');
      assert.ok(await evaluate(`!!${q('[data-specimen="badge"] [data-variant="outline"][data-tone="info"] [aria-hidden="true"]')}`),'info outline badge start icon');
      for(const [tone,size] of [['primary','lg'],['info','sm'],['danger','lg']])
        assert.ok(await evaluate(`!!${q(`[data-specimen="text"] [data-tone="${tone}"][data-size="${size}"]`)}`),`Text ${tone}/${size}`);
    } finally {
      if(await evaluate(`${q('[data-specimen="input"] input[type="email"]')}?.value`)) {
        await stableCamera();
        await click(q('[data-specimen="input"] input[type="email"]'));
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4});
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
        await wait(`${q('[data-specimen="input"] input[type="email"]')}.value === ''`);
      }
      await navigate('design','button');
    }
  });
  await check('loading action keeps focus and blocks repeated activation',async()=>{
    await navigate('design','button');
    await stableCamera();
    const demo='[data-save-demo]';
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
    assert.equal(await evaluate(`${q('#workspace-content')}.style.getPropertyValue('--preview-background').trim()`),await evaluate(`${q('[data-ds-theme="dark"]')}.style.getPropertyValue('--ds-background').trim()`));
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
    await click(q('[data-palette-builder] > summary'));
    const before=await stored();
    await click(q('[aria-label="Apply Iris to both themes"]'));
    const after=await stored();
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
  });
  await check('editing the selected global background recolors the grid without touching the other theme',async()=>{
    const before=await stored();
    await fill('#token-background','#123456');
    assert.equal(await evaluate(`${q('#workspace-content')}.style.getPropertyValue('--preview-background').trim()`),'#123456');
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
    await evaluate(`(()=>{const input=${q('#font-family-preset')};input.value='mono';input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-font-family').includes('Menlo')`);
    for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].fontFamily,'mono');
    assert.ok((await evaluate(`getComputedStyle(${q('[data-specimen="text"] [data-variant="paragraph"]')}).fontFamily`)).includes('Menlo'));
    await click(q('[aria-label="Export tokens"]'));
    assert.ok((await evaluate(`${q('[aria-label="Exported tokens"]')}.textContent`)).includes('--ds-font-family: ui-monospace'));
    await click(q('[aria-label="Close export dialog"]'));
    await navigate('develop','text');
    assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes('--ds-font-family')`));
    await navigate('design','text');
    for(const [preset,firstFont] of [['sans','Arial'],['humanist','Trebuchet MS'],['editorial','Palatino'],['typewriter','Courier New']]) {
      await evaluate(`(()=>{const input=${q('#font-family-preset')};input.value=${JSON.stringify(preset)};input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      await wait(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-font-family').includes(${JSON.stringify(firstFont)})`);
      for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].fontFamily,preset);
      assert.ok((await evaluate(`getComputedStyle(${q('[data-specimen="text"] [data-variant="paragraph"]')}).fontFamily`)).includes(firstFont));
      assert.ok((await evaluate(`getComputedStyle(${q('#font-family-tokens p[style]')}).fontFamily`)).includes(firstFont));
    }
    await send('Fetch.enable',{patterns:[{urlPattern:'https://fonts.googleapis.com/*',requestStage:'Request'}]});
    await evaluate(`(()=>{const input=${q('#font-family-preset')};input.value='google-inter';input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
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
    assert.equal(await evaluate(`getComputedStyle(${q('[data-specimen="text"] [data-variant="heading"][data-size="md"]')}).fontSize`),'42px');
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
    assert.equal(await evaluate(`getComputedStyle(${q('[data-specimen="text"] [data-variant="heading"][data-size="md"]')}).fontSize`),'42px');
  });
  await check('H1–H6 typography controls independently update the single Text canvas unit and Develop',async()=>{
    await navigate('design','text');
    for(const [variant,size] of [['h1',54],['h2',45],['h3',36],['h4',30],['h5',25],['h6',22]]) {
      const details=`.typography-variant:has(#typography-${variant}-fontSize)`;
      if(!await evaluate(`${q(details)}.open`)) await click(q(`${details} summary`));
      await fill(`#typography-${variant}-fontSize`,String(size));
      assert.equal(await evaluate(`getComputedStyle(${q(`[data-specimen="text"] [data-variant="${variant}"]`)}).fontSize`),`${size}px`);
      for(const mode of ['light','dark']) assert.equal((await stored()).themes[mode].typography[variant].fontSize,size);
      assert.equal(await evaluate(`${q('[data-ds-theme="light"]')}.style.getPropertyValue('--ds-typography-${variant}-font-size').trim()`),`${size}px`);
    }
    assert.equal(await evaluate(`${q('[data-foundation="text"] h2 a')}.getAttribute('aria-current')`),'page');
    assert.notEqual(await evaluate(`getComputedStyle(${q('[data-foundation="text"] h2 a')}).backgroundColor`),'rgba(0, 0, 0, 0)');
    await capture('studio-text');
    await navigate('develop','text');
    for(const variant of ['h1','h2','h3','h4','h5','h6']) assert.ok(await evaluate(`${q('.workspace-panel--develop')}.textContent.includes('--ds-typography-${variant}-font-size')`));
    await reload();
    assert.equal((await stored()).themes.dark.typography.h1.fontSize,54);
    await navigate('design','text');
  });
  await check('Text color applies to every canvas style, not only paragraph',async()=>{
    await navigate('design','text');
    const variants=['heading','h1','h2','h3','h4','h5','h6','paragraph','label','caption'];
    await fill('#token-foreground','#123456');
    for(const variant of variants) assert.equal(await evaluate(`getComputedStyle(${q(`[data-specimen="text"] [data-variant="${variant}"]`)}).color`),'rgb(18, 52, 86)',`${variant} should use the component color`);
    await click(q('[aria-label="Reset foreground override"]'));
    const original=(await stored()).themes.light.global.foreground;
    await navigate('design','colors');
    await fill('#token-foreground','#345678');
    await navigate('design','text');
    for(const variant of variants) assert.equal(await evaluate(`getComputedStyle(${q(`[data-specimen="text"] [data-variant="${variant}"]`)}).color`),'rgb(52, 86, 120)',`${variant} should inherit the global color`);
    await navigate('design','colors');
    await fill('#token-foreground',original);
  });
  await check('shape, component sizing and typography edits stay shared across Light and Dark',async()=>{
    await navigate('design');
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
    await click(named(themeControl + ' button','Light'));
    const original=await stored();
    const examples=[
      ['radius',24,'[class*="shapeVisual"]','borderTopLeftRadius'],
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
    for(const [size,token,value] of [['sm','spacingSm',6],['md','spacingMd',12],['lg','spacingLg',24]]) {
      const content=`[data-specimen="card"] [data-size="${size}"] [class*="cardContent"]`;
      assert.equal(await evaluate(`getComputedStyle(${q(content)}).gap`),`${value}px`,`${token} must reach Card.Content`);
      assert.equal(await evaluate(`${q(content)}.children.length`),2,'Card.Content must display multiple items');
    }
    assert.equal(await evaluate(`getComputedStyle(${q('[data-specimen="card"] [data-size="md"]')}).gap`),'18px','Card root still uses legacy gap');
    await capture('studio-spacing-live-light');
    await click(named(themeControl + ' button','Dark'));
    for(const [token,value,visual,property] of examples) assert.equal(await evaluate(`getComputedStyle(${q(`[data-spacing-token="${token}"] ${visual}`)})[${JSON.stringify(property)}]`),`${value}px`);
    await capture('studio-spacing-live-dark');
    assert.equal(await evaluate(`getComputedStyle(${q('[data-specimen="card"] [data-size="lg"] [class*="cardContent"]')}).gap`),'24px');
    await click(named(themeControl + ' button','Light'));
    for(const [token] of examples) await fill(`#token-${token}`,String(original.themes.light.global[token]));
  });
  await check('contrast warnings follow manual edits and exported CSS/JSON keep both themes',async()=>{
    await navigate('design','button');
    const fillColor = await evaluate(`${q('#token-background')}.value`);
    await fill('#token-foreground',fillColor);
    assert.equal(await evaluate(`${q('[aria-label="Current contrast checks"]')}.hasAttribute('data-failing')`),true);
    assert.ok(await evaluate(`${q('[aria-label="Current contrast checks"] summary')}.textContent.includes('warnings')`));
    await click(q('[aria-label="Current contrast checks"] summary'));
    assert.ok(await evaluate(`${q('[data-contrast-check="button.foreground"]')}?.textContent.includes('Below target')`));
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
  await check('same expanded demo tree survives theme, routes and history in the persistent layout',async()=>{
    await navigate('design','button');
    await click(named(themeControl + ' button','Light'));
    await click(named('[data-specimen="button"] button','Get started'));
    await navigate('design','input');
    await delay(500);
    await fill('[data-specimen="input"] input[type="email"]','retained@example.com');
    await route('design','input');
    await navigate('design','button');
    await evaluate(`window.__specimens=[...document.querySelectorAll('[data-specimen]')];window.__pane=${q('.theme-pane')};window.__layout=${q('.studio-sidebar')};window.__origin=performance.timeOrigin`);
    const retained = async () => {
      assert.equal(await evaluate(`window.__origin===performance.timeOrigin && window.__layout===${q('.studio-sidebar')} && window.__pane===${q('.theme-pane')} && window.__specimens.every(e=>e.isConnected && e===document.querySelector('[data-specimen="'+e.dataset.specimen+'"]'))`),true);
      assert.equal(await evaluate(`${q('[data-specimen="input"] input[type="email"]')}.value`),'retained@example.com');
      assert.ok(await evaluate(`${q('[data-specimen="button"]')}.textContent.includes('successfully (1)')`));
      assert.equal(await evaluate(`document.querySelectorAll('.theme-pane').length`),1);
      assert.equal(await evaluate(`document.querySelectorAll('[data-specimen="card"] article').length`),3);
      assert.ok(await evaluate(`${q('[data-specimen="text"]')}.isConnected`));
      assert.ok(await evaluate(`!!${q('[data-specimen="input"] input[readonly]')} && !!${q('[data-specimen="button"] [aria-busy="true"]')} && !!${q('[data-specimen="checkbox"] [aria-checked="mixed"]')}`));
      assert.equal(await evaluate(`${q('.theme-pane [data-ds-theme]')}.dataset.dsTheme`),'dark');
    };
    await click(named(themeControl + ' button','Dark'));
    await retained();
    await navigate('develop','button');
    await navigate('develop','input');
    await navigate('design','input');
    await retained();
    for (const [direction,view,id] of [['back','develop','input'],['back','develop','button'],['back','design','button'],['forward','develop','button'],['forward','develop','input'],['forward','design','input']]) {
      await evaluate(`history.${direction}()`);
      await route(view,id);
      await retained();
    }
    await navigate('design');
    await retained();
    await navigate('design','button');
  });
  await check('route selection animates camera unless reduced motion is requested',async()=>{
    try {
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      await navigate('design','button');
      const start=await stableCamera();
      await navigate('design','checkbox');
      const first=await evaluate(cameraState);
      const end=await stableCamera();
      assert.ok(moved(start,end)>80,'component navigation should move the camera');
      assert.ok(moved(first,end)>2,'camera should animate rather than jump to its final destination');
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await navigate('design','button');
      await wait(`${q('[data-specimen="button"]')}.getBoundingClientRect().bottom > ${q(canvas)}.getBoundingClientRect().top && ${q('[data-specimen="button"]')}.getBoundingClientRect().top < ${q(canvas)}.getBoundingClientRect().bottom`);
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
    assert.equal(await evaluate(`(()=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-80});${q(canvas)}.dispatchEvent(e);return e.defaultPrevented})()`),true,'desktop Ctrl+wheel over canvas should be consumed for canvas zoom');
    assert.equal(await evaluate(`(()=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-80});${q('.studio-sidebar')}.dispatchEvent(e);return e.defaultPrevented})()`),false,'modified wheel outside canvas must remain available to browser zoom');
    assert.equal(await evaluate(`${q(canvas)}.scrollLeft===0 && ${q(canvas)}.scrollTop===0`),true);
    await navigate('design','button');
    await evaluate(`(${named('[data-specimen="button"] button','All set')}).focus()`);
    assert.equal(await evaluate(`document.activeElement===(${named('[data-specimen="button"] button','All set')})`),true);
    await key('Enter');
    await wait(`${q('[data-specimen="button"]')}.textContent.includes('successfully (2)')`);
    await navigate('design','input');
    await delay(500);
    // The tall input specimen can place its first field just above the viewport after centering.
    const inputTop = await evaluate(`${q('[data-specimen="input"] input[type="email"]')}.getBoundingClientRect().top`);
    const viewportTop = await evaluate(`${q(canvas)}.getBoundingClientRect().top`);
    if (inputTop < viewportTop) await wheel(await canvasBackground(),0,-240);
    await wait(`(()=>{const e=${q('[data-specimen="input"] input[type="email"]')},r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`);
    await click(q('[data-specimen="input"] input[type="email"]'));
    await fill('[data-specimen="input"] input[type="email"]','camera-input@example.com');
    assert.equal(await evaluate(`${q('[data-specimen="input"] input[type="email"]')}.value`),'camera-input@example.com');
    assert.ok(!await evaluate(`${q(canvas)}.hasAttribute('data-dragging')`),'input activation must not start a camera drag');
    await fill('[data-specimen="input"] input[type="email"]','retained@example.com');
    await capture('studio-canvas');
  });
  await check('Design canvas units route to their own inspectors and Develop references',async()=>{
    await navigate('design');
    assert.equal(await evaluate(`!!${q('.breadcrumbs')}`),false);
    assert.equal(await evaluate(`${q('main h1')}.textContent.trim()`),'Your design system');
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
    await click(q('[data-foundation="text"] h2 a'));
    await route('design','text');
    await click(named(viewNav + ' a','Develop'));
    await route('develop','text');
    await click(named(viewNav + ' a','Design'));
    await route('design','text');
    assert.ok(await evaluate(`!!${q('#typography-heading-fontSize')}`));
    await click(named('[aria-label="Canvas zoom"] button','Fit'));
    await delay(450);
    await click(q('[data-specimen="card"] header a'));
    await route('design','card');
    assert.equal(await evaluate(`${q('[data-specimen="card"] header a')}.getAttribute('aria-current')`),'page');
    await click(named('[aria-label="Canvas zoom"] button','Fit'));
    await delay(450);
    await click(q('[data-specimen="input"] input[type="email"]'));
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
    await navigate('design','button');
  });
  await check('responsive layout, English accessible names and selectable preview themes',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
    for(const view of ['Design','Develop']) {
      await click(named(viewNav + ' a',view));
      await route(view.toLowerCase(),'button');


      const overflow = await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})');
      assert.ok(overflow.scrollWidth<=overflow.width,JSON.stringify(overflow));
      assert.ok(await evaluate(`${q(viewNav)}.getClientRects().length>0 && ${q(themeControl)}.getClientRects().length>0`));
      assert.ok(await evaluate(`${q('.studio-sidebar .sidebar-project input[aria-label="Design system name"]')}.getClientRects().length>0`));
      assert.equal(await evaluate(`!!${q('.breadcrumbs')} || !!${q('.viewport-controls')}`),false);
      await capture(`studio-375-${view.toLowerCase()}`);
    }
    await click(named(viewNav + ' a','Design'));
    for(const view of ['design','develop']) for(const id of [...foundations,...ids]) {
      await navigate(view,id);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`mobile overflow: ${view}/${id}`);
      assert.ok(await evaluate(`${q(viewNav)}.getBoundingClientRect().right <= innerWidth && ${q(themeControl)}.getBoundingClientRect().right <= innerWidth`),`view/theme controls overflow: ${view}/${id}`);
      if(view === 'design') assert.ok(await evaluate(`${q(`[data-canvas-unit="${id}"]`)}.getClientRects().length>0`));
      if(view === 'design' && id === 'spacing') {
        await evaluate(`${q('[data-foundation="spacing"]')}.scrollIntoView({block:'start',behavior:'instant'})`);
        await capture('studio-375-spacing');
      }
    }
    await navigate('design','button');
    assert.ok(await evaluate(`${q('.mobile-editor-link')}.getClientRects().length > 0`));
    await click(q('.mobile-editor-link'));
    assert.equal(await evaluate('location.hash'),'#token-editor');
    assert.equal(await evaluate('document.activeElement.id'),'token-editor');
    await capture('studio-375-inspector');
    await click(q('.mobile-preview-link'));
    assert.equal(await evaluate('document.activeElement.id'),'workspace-content');
    for(const mode of ['light','dark']) {
      await click(named(themeControl + ' button',mode === 'light' ? 'Light' : 'Dark'));
      assert.ok(await evaluate(`!!${q(`.theme-pane:not([hidden]) [data-ds-theme="${mode}"]`)}`));
      assert.equal(await evaluate(`[...document.querySelectorAll('.theme-pane')].filter(e=>e.getClientRects().length).length`),1);
    }
    await navigate('design','colors');
    if(!await evaluate(`${q('[data-palette-builder]')}.open`))await click(q('[data-palette-builder] > summary'));
    const {nodes}=await send('Accessibility.getFullAXTree');
    for(const name of ['Design theme','Light','Dark','Source brand color'])assert.ok(nodes.some(node=>!node.ignored && node.name?.value===name),`AX name: ${name}`);
  });
  await check('mobile document scroll and touch gestures remain native',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    try {
      await navigate('design');
      await navigate('design','button');
      assert.ok(await evaluate(`!document.querySelector('meta[name="viewport"]')?.content.includes('user-scalable=no')`),'mobile viewport must permit browser zoom');
      assert.ok(await evaluate(`getComputedStyle(${q(canvas)}).touchAction!=='none'`),'canvas must not disable native touch zoom/scroll');
      await evaluate('window.scrollTo(0,0)');
      assert.ok(await evaluate('document.documentElement.scrollHeight>innerHeight'),'mobile document should have scrollable content');
      await evaluate('window.scrollTo(0,180)');
      await wait('window.scrollY>0');
      assert.equal(await evaluate(`(()=>{const e=new Event('touchmove',{bubbles:true,cancelable:true});${q(canvas)}.dispatchEvent(e);return e.defaultPrevented})()`),false,'mobile touchmove must not be consumed by the camera');
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

    const disclosure='[data-specimen="input"] details';
    await evaluate(`${q(`${disclosure} summary`)}.focus({preventScroll:true})`);
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
    if(!await evaluate(`${q('[data-palette-builder]')}.open`)) await click(q('[data-palette-builder] > summary'));
    await click(q('[aria-label="Apply Ocean to both themes"]'));
    assert.equal((await stored()).themes.dark.source,'#247db3');
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
    await click(q('[aria-label="Redo change"]'));
    assert.equal((await stored()).themes.light.source,'#247db3');
    assert.equal((await stored()).themes.dark.source,'#247db3');
    await click(q('[aria-label="Undo change"]'));
    assert.deepEqual(await stored(),before);
  });
  await check('sidebar project name persists and remains undoable',async()=>{
    const selector='.studio-sidebar .sidebar-project input[aria-label="Design system name"]';
    const original=(await stored()).name;
    await fill(selector,'Updated system');
    assert.equal((await stored()).name,'Updated system');
    await click(q('[aria-label="Undo change"]'));
    assert.equal((await stored()).name,original);
    await click(q('[aria-label="Redo change"]'));
    assert.equal((await stored()).name,'Updated system');
    await reload();
    assert.equal(await evaluate(`${q(selector)}.value`),'Updated system');
    await fill(selector,original);
    assert.equal((await stored()).name,original);
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
  for(const view of ['design','develop']) for(const id of ['overview',...foundations,...ids]) {
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
      assert.equal(await evaluate(`${q('h1')}.textContent`),view==='develop'?(id==='overview'?'Token reference':id==='spacing'?'Shape & spacing documentation':`${name} documentation`):(id==='overview'?'Your design system':id==='spacing'?'Shape & spacing':name));
    });
  }
  await check('no runtime, browser console or resource errors',async()=>{await delay(200);assert.deepEqual(errors,[]);});
} catch(error) {failures.push('harness');console.error(`FAIL harness: ${error.stack || error}`);}
finally {
  try {await cleanup();}catch(error){failures.push('cleanup');console.error(`FAIL cleanup: ${error}`);}
  clearTimeout(watchdog);
  console.log(`RESULT: ${failures.length ? 'FAILED: '+failures.join(', ') : 'all smoke checks passed'}`);
  console.log('SCOPE: automated Chromium/CDP checks, not a real screen-reader or native browser-zoom session.');
  if(failures.length)process.exitCode=1;
}
