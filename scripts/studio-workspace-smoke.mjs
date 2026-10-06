#!/usr/bin/env node
// No packages, app build, fixture injection, or persistent browser state. Evidence goes to stdout.
// Run after the parent finishes the static export: node scripts/studio-workspace-smoke.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const usage = `Usage: node scripts/studio-workspace-smoke.mjs [--shell-only] [--skip-input] [--skip-assets]
Requires Node 22.18+ (native fetch/WebSocket/TypeScript), Chrome, and a fresh out/ export. Never builds the app.
CHROME_PATH overrides the macOS Chrome executable. All browser data is disposable.
WORKSPACE_SMOKE_SCREENSHOT optionally saves the selected Card title as PNG (parent directory must exist).
Default: shell, frame styles, populated matrices, exact Card/Input recipes, insertion/instance parameters, history, snapshots, themes, reload/export/schema.
--shell-only   Only project/page/frame creation, Layers, sizing, panels, menu, and reload.
--skip-input   Explicitly omit Input part/owner checks while that UI is under development.
--skip-assets  Explicitly omit saved-component checks. Missing controls otherwise FAIL, never silently skip.
210-second full / 45-second shell watchdog; individual CDP commands and waits are also bounded.`;
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
const screenshotPath = process.env.WORKSPACE_SMOKE_SCREENSHOT ? resolve(projectRoot, process.env.WORKSPACE_SMOKE_SCREENSHOT) : null;
const indexKey = 'bambiui.composer.projects.v1';
const documentPrefix = 'bambiui.composer.document.v1.';
const systemKey = 'bambiui.systems.v1';
const budget = shellOnly ? 45000 : 210000;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const pending = new Map(), errors = [];
let server, chrome, profile, socket, sequence = 0, checks = 0, aborted = false, stage = 'preflight';
let projectId, frameId, rootId, cardId, titleId, newCardId, copyId, inputId;
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
// Chromium can retain layout boxes inside closed details; checkVisibility also checks painting.
const visible = expression => `(()=>{const e=(${expression});return !!e && e.checkVisibility({visibilityProperty:true}) && !e.closest('[hidden]')})()`;
const named = (selector, name) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(name)} && e.checkVisibility({visibilityProperty:true}) && !e.closest('[hidden]'))`;
const labelled = name => `(()=>{const label=[...document.querySelectorAll('#workspace-sidebar label')].find(e=>e.textContent.trim()===${JSON.stringify(name)});return label && document.getElementById(label.htmlFor)})()`;

async function wait(expression, label = expression) {
  const until = Date.now() + 6500;
  // Always coerce predicates: serializing a DOM node with returnByValue can overflow CDP.
  do { if (await evaluate(`!!(${expression})`)) return; await delay(50); } while (Date.now() < until && !aborted);
  throw new Error(`Timed out during ${stage}: ${label}`);
}
const settle = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
async function click(expression, scroll = true, exact = false) {
  await wait(visible(expression), `visible target ${expression}`);
  if (scroll) await evaluate(`(${expression}).scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);
  await settle();
  const point = await evaluate(`(()=>{const e=(${expression});if(e.disabled)throw Error('Disabled: '+e.outerHTML);const fractions=${exact ? '[0.5,0.01,0.99,0.1,0.9,0.25,0.75,0.4,0.6]' : '[0.5]'};for(const r of e.getClientRects())for(const fy of fractions)for(const fx of fractions){const x=r.x+r.width*fx,y=r.y+r.height*fy,hit=document.elementFromPoint(x,y);if(${exact ? 'hit===e' : 'e.contains(hit)'})return {x,y}}throw Error('Occluded or no ${exact ? 'bare frame' : 'element'} hit: '+e.outerHTML)})()`);
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
    const summary = `(()=>{const e=(${expression});let closed;for(let p=e?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)closed=p;return closed?.querySelector(':scope > summary')})()`;
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
const storedSystems = () => `JSON.parse(localStorage.getItem(${JSON.stringify(systemKey)}))`;
const storedSystem = () => `${storedSystems()}.systems.find(entry=>entry.id===${stored()}.document.systemId).system`;
const systemBytes = () => evaluate(`localStorage.getItem(${JSON.stringify(systemKey)})`);
async function system() {
  if (await systemBytes() !== null) return evaluate(storedSystem());
  // Fresh sessions intentionally keep the built-in System in memory until the first edit.
  const { defaultSystem, STORAGE_KEY } = await import('../app/studio/tokens.ts');
  assert.equal((await project()).systemId, 'original');
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`), null, 'Only an untouched default draft may lack the collection');
  return structuredClone(defaultSystem);
}
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
  const systems = await systemBytes();
  await click(q(`[aria-label="${direction} project edit"]`));
  await wait(`JSON.stringify(${stored()}.document)===${JSON.stringify(JSON.stringify(expected))}`, `${direction} restores the exact document`);
  assert.equal(await systemBytes(), systems, 'Project history cannot edit System');
}
async function projectWorkspace() {
  await click(named('[aria-label="Workspace"] a', 'Project'));
  await wait(`${q('.studio-shell')}?.dataset.workspace==='project' && ${q('[aria-label="Page canvas"]')}?.dataset.projectId===${JSON.stringify(projectId)}`);
  await wait(q(nodeSelector(rootId)));
}
async function systemTab(tab) {
  const target = named('[aria-label="Component editor"] [role="tab"]', tab);
  await click(target); await wait(`(${target}).getAttribute('aria-selected')==='true'`);
}
async function systemComponent(component, tab = 'Styles') {
  if (await evaluate(`${q('.studio-shell')}.dataset.workspace!=='system'`)) await click(named('[aria-label="Workspace"] a', 'System'));
  await wait(`${q('.studio-shell')}.dataset.workspace==='system'`);
  if (await evaluate(visible(q('[aria-label="Show left panel"]')))) await click(q('[aria-label="Show left panel"]'));
  if (await evaluate(`location.pathname!==${JSON.stringify('/' + component)}`)) await click(q(`#workspace-sidebar a[href="/${component}"]`));
  await wait(`location.pathname===${JSON.stringify('/' + component)} && ${q('[aria-label="Component editor"]')}`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[aria-label="Component editor"] [role="tab"]')].map(e=>e.textContent.trim())`), ['Styles', 'Parameters']);
  await wait(q(`[data-component-matrix="${component}"]`));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-component-matrix]')].map(e=>e.dataset.componentMatrix)`), [component], 'Only the selected component matrix is mounted');
  assert.equal(await evaluate(`document.querySelectorAll('[data-system-starter]').length`), 0, 'No separate starting-component UI');
  assert.equal(await evaluate(`!!(${named('h2,h3', 'Starting component')})`), false);
  const interactions = `[data-specimen="${component}"] [data-interaction-examples]`;
  assert.equal(await evaluate(`${q(interactions)}?.open ?? false`), false, 'Optional interaction examples stay collapsed');
  await systemTab(tab);
}
async function systemTheme(mode) {
  const selector = `.canvas-theme [aria-label="${mode === 'light' ? 'Light' : 'Dark'}"]`;
  await click(q(selector));
  await wait(`${q(selector)}.getAttribute('aria-pressed')==='true' && document.documentElement.dataset.studioTheme===${JSON.stringify(mode)}`);
}
const recipeControls = '[data-system-recipe-controls]';
const recipeInput = (component, recipe, part, target, key) => `[id="system-recipe-${component}-${recipe}-${part}-${target}-${key}"]`;
const matrixExample = (component, recipe) => `[data-component-matrix="${component}"] [data-recipe-example="${recipe}"]`;
const matrixPart = (component, recipe, part, target) => `${matrixExample(component, recipe)} [data-ds-component="${component}"][data-component-part="${part}"]${target ? `[data-component-target="${target}"]` : ''}`;
const cardTextSelector = (root, part) => `${root} [data-ds-component="card"][data-component-part="${part}"] [data-component-target="text"]`;
async function selectedRecipe(recipe, part, target) {
  await wait(`${q(recipeControls)}?.dataset.recipe===${JSON.stringify(recipe)} && ${q(recipeControls)}?.dataset.part===${JSON.stringify(part)} && ${q(recipeControls)}?.dataset.target===${JSON.stringify(target)}`, `selected ${recipe}/${part}/${target}`);
}
async function matrixClick(component, recipe, part, target) {
  const selector = component === 'card' && target === 'text' && ['content', 'footer'].includes(part)
    ? cardTextSelector(matrixPart(component, recipe, 'root'), part) : matrixPart(component, recipe, part, target);
  await wait(q(selector)); await settle();
  // The canvas is transformed, not a scroll container. Pan with a real wheel before hit testing.
  const pan = await evaluate(`(()=>{const r=${q(selector)}.getBoundingClientRect(),v=${q('[aria-label="Component canvas"]')}.getBoundingClientRect();return {x:v.x+v.width/2,y:v.y+v.height/2,deltaX:r.x+r.width/2-v.x-v.width/2,deltaY:r.y+r.height/2-v.y-v.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...pan }); await settle();
  await click(q(selector), false, target === 'frame');
  await selectedRecipe(recipe, part, target);
  assert.equal(await evaluate(`${q(selector)}.getAttribute('data-system-selected-part')`), target);
}
async function recipeLayer(recipe, part, target, label) {
  await click(q(`${recipeControls} [aria-label="Select ${label} ${target}"]`));
  await selectedRecipe(recipe, part, target);
}
async function recipeStyle(component, recipe, part, target, key, value, commit = 'enter', linkedKeys = [key]) {
  const selector = recipeInput(component, recipe, part, target, key), before = await record(), expected = await system();
  const mode = await evaluate('document.documentElement.dataset.studioTheme');
  await selectedRecipe(recipe, part, target);
  await fill(q(selector), String(value), commit);
  await wait(`${storedSystem()}.themes.${mode}.componentRecipes?.[${JSON.stringify(component)}]?.[${JSON.stringify(recipe)}]?.[${JSON.stringify(part)}]?.[${JSON.stringify(key)}]===${JSON.stringify(value)}`, `persisted ${component}.${recipe}.${part}.${key}`);
  assert.notEqual(await evaluate(`${q(selector)}.getAttribute('aria-invalid')`), 'true');
  for (const theme of ['background', 'color', 'borderColor'].includes(key) ? [mode] : ['light', 'dark']) {
    const recipes = expected.themes[theme].componentRecipes ??= {};
    const values = ((recipes[component] ??= {})[recipe] ??= {})[part] ??= {};
    for (const field of linkedKeys) values[field] = value;
  }
  assert.deepEqual(await system(), expected, 'Only the exact recipe fields may change: no globals, shared defaults, other combinations or content edits');
  assert.deepEqual(await record(), before, 'Recipe styles must not rewrite Project records');
}
async function systemDefault(component, source, key, value, commit = 'enter') {
  const selector = `#system-default-${component}-${key}`, before = await record(), systems = await systemBytes();
  await wait(q(selector));
  const unchanged = await evaluate(`${q(selector)}.value===${JSON.stringify(String(value))}`);
  if (await evaluate(`${q(selector)}.tagName==='SELECT'`)) await select(selector, String(value));
  else {
    assert.equal(await evaluate(`${q(selector)}.tagName`), 'TEXTAREA', 'Insertion content uses a textarea');
    await fill(q(selector), String(value), commit);
    assert.notEqual(await evaluate(`${q(selector)}.getAttribute('aria-invalid')`), 'true');
  }
  if (unchanged) assert.equal(await systemBytes(), systems, 'Reselecting an effective default does not author a redundant override');
  else await wait(`${storedSystem()}.componentDefaults?.${component}?.${source}?.${key}===${JSON.stringify(value)}`, `persisted default ${component}.${key}`);
  assert.deepEqual(await record(), before, 'Starting parameters must not rewrite existing content');
}
async function systemHistory(direction, expected) {
  const before = await record();
  await click(q(`[aria-label="Edit history"] [aria-label="${direction} change"]`));
  await wait(`JSON.stringify(${storedSystem()})===${JSON.stringify(JSON.stringify(expected))}`, `${direction} restores the exact System`);
  assert.deepEqual(await record(), before, 'System history must not edit Project');
}
async function parameterInspector() {
  await wait(visible(q('[aria-label="Instance settings"]')));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[aria-label="Inspector view"] [role="tab"]')].map(e=>e.textContent.trim())`), ['Parameters', 'Project']);
  assert.equal(await evaluate(`document.querySelectorAll('#project-inspector [data-appearance-key],#project-inspector [aria-label="Edit component part"]').length`), 0, 'Components have parameters, not local style editors');
  assert.equal(await evaluate(`!!${q('#project-inspector [aria-label="Legacy local styles"]')}`), false, 'New components have no legacy style status');
  assert.equal(await evaluate(`!!(${named('#project-inspector button', 'Reset local styles')})`), false);
  assert.ok(await evaluate(visible(named('#project-inspector button', 'Edit styles in System'))));
}
function noLocalStyles(root) {
  for (const entry of nodes(root)) {
    assert.equal(Object.hasOwn(entry, 'appearance'), false, `${entry.kind} must inherit System styles`);
    assert.equal(Object.hasOwn(entry, 'parts'), false, `${entry.kind} must inherit System part styles`);
  }
}
function cardSlots(card) {
  assert.deepEqual(card.children.map(entry => entry.kind), ['cardHeader', 'cardContent', 'cardFooter']);
  const [header, content, footer] = card.children;
  assert.deepEqual(header.children.map(entry => entry.kind), ['cardTitle', 'cardDescription']);
  assert.deepEqual(content.children.map(entry => entry.kind), ['text']);
  assert.deepEqual(footer.children.map(entry => entry.kind), ['button']);
  const slots = { title: header.children[0].text, description: header.children[1].text, content: content.children[0].text, action: footer.children[0].text };
  for (const text of Object.values(slots)) assert.ok(text?.trim(), 'Every Card slot has meaningful content');
  return slots;
}
const cardRecipe = 'outlined.md', inputRecipe = 'invalid.md';
const matrixCard = matrixPart('card', cardRecipe, 'root', 'frame');
const matrixTitle = matrixPart('card', cardRecipe, 'title', 'text');
const matrixInputPart = (part, target) => matrixPart('input', inputRecipe, part, target);
const cardThemeBaselines = {};
async function matrixCards(copy) {
  const cards = await evaluate(`(()=>{const parts={title:'title',description:'description',content:'content',action:'footer'};return [...document.querySelectorAll('[data-component-matrix="card"] [data-recipe-example]')].map(example=>{const card=example.querySelector('[data-ds-component="card"][data-component-part="root"]');return {recipe:example.dataset.recipeExample,variant:card.dataset.variant,size:card.dataset.size,copy:Object.fromEntries(Object.entries(parts).map(([key,part])=>[key,card.querySelector('[data-ds-component="card"][data-component-part="'+part+'"]').textContent]))}})})()`);
  assert.deepEqual(cards.map(entry => entry.recipe), ['outlined.sm', 'outlined.md', 'outlined.lg', 'elevated.sm', 'elevated.md', 'elevated.lg', 'filled.sm', 'filled.md', 'filled.lg']);
  for (const entry of cards) {
    assert.equal(entry.recipe, `${entry.variant}.${entry.size}`, 'Matrix axes override insertion parameters');
    assert.deepEqual(entry.copy, copy, `${entry.recipe} has identical populated Card copy`);
  }
  return cards;
}
async function matrixInputs(label, description, error) {
  const fields = await evaluate(`(()=>{return [...document.querySelectorAll('[data-component-matrix="input"] [data-recipe-example]')].map(example=>{const root=example.querySelector('[data-component-part="root"]'),input=example.querySelector('input'),part=name=>root.querySelector('[data-component-part="'+name+'"]');return {recipe:example.dataset.recipeExample,size:root.dataset.size,invalid:root.hasAttribute('data-invalid'),readOnly:input.readOnly,disabled:input.disabled,label:part('label')?.textContent,hidden:part('label')?.hasAttribute('data-hide-label'),description:part('description')?.textContent,error:part('error')?.textContent ?? null}})})()`);
  assert.deepEqual(fields.map(entry => entry.recipe), ['default.sm', 'default.md', 'default.lg', 'invalid.sm', 'invalid.md', 'invalid.lg', 'readonly.sm', 'readonly.md', 'readonly.lg']);
  for (const entry of fields) {
    const [variant, size] = entry.recipe.split('.');
    assert.deepEqual(entry, { recipe: entry.recipe, size, invalid: variant === 'invalid', readOnly: variant === 'readonly', disabled: false, label, hidden: false, description, error: variant === 'invalid' ? error : null }, `${entry.recipe} exposes its own state/size and populated field anatomy`);
  }
  return fields;
}
const recipeCSSKeys = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'color', 'backgroundColor', 'borderColor', 'borderWidth', 'boxShadow', 'opacity', 'gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'];
async function matrixSnapshot(component) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 20, buttons: 0 }); await settle();
  return evaluate(`Object.fromEntries([...document.querySelectorAll('[data-component-matrix="${component}"] [data-recipe-example]')].map(example=>[example.dataset.recipeExample,[...example.querySelectorAll('[data-recipe-body] [data-component-part]')].map(e=>{const s=getComputedStyle(e);return {component:e.dataset.dsComponent,part:e.dataset.componentPart,target:e.dataset.componentTarget,cardPart:e.closest('[data-ds-component="card"][data-component-part]')?.dataset.componentPart ?? null,text:e.textContent,styles:Object.fromEntries(${JSON.stringify(recipeCSSKeys)}.map(key=>[key,s[key]]))}})]))`);
}
async function matrixUnchangedExcept(component, baseline, recipe, parts) {
  const current = await matrixSnapshot(component);
  assert.deepEqual(Object.keys(current), Object.keys(baseline));
  for (const key of Object.keys(baseline)) {
    const untouched = entries => key !== recipe || !parts ? entries : entries.filter(entry => !(entry.component === component && parts.includes(entry.part) || component === 'card' && parts.includes(entry.cardPart)));
    if (key !== recipe || parts) assert.deepEqual(untouched(current[key]), untouched(baseline[key]), `${component} ${key}: other combinations/layers retain text and computed styles`);
  }
}
async function downloaded(name) {
  const until = Date.now() + 6500;
  do {
    try { return await readFile(resolve(profile, name), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(50);
  } while (Date.now() < until && !aborted);
  throw new Error(`Timed out downloading ${name}`);
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
  const systems = await systemBytes();
  await fill(q(`#project-inspector [aria-label="Instance ${key}"]`), value, commit);
  assert.equal(await systemBytes(), systems, 'Project content edits must not edit System');
}
const cardStyles = { borderTopLeftRadius: 7, borderTopRightRadius: 13, borderBottomRightRadius: 19, borderBottomLeftRadius: 25, paddingTop: 9, paddingRight: 15, paddingBottom: 21, paddingLeft: 27 };
const cardCSS = Object.fromEntries(Object.entries(cardStyles).map(([key, value]) => [key, `${value}px`]));
const titleFrameStyles = { paddingLeft: 4, borderTopLeftRadius: 3 };
const titleFrameCSS = { paddingLeft: '4px', borderTopLeftRadius: '3px' };
const cardTextStyles = { content: { fontSize: 23 }, footer: { fontSize: 17 } };
async function paintedCardText(root) {
  for (const [part, values] of Object.entries(cardTextStyles)) await styleIs(cardTextSelector(root, part), { fontSize: `${values.fontSize}px` });
}
const startingCardCopy = { title: 'Project overview', description: 'Keep your ideas and next steps in one place.', content: 'Add details, organize your work, and share progress with your team.', action: 'Get started' };
const nextCardCopy = { title: 'System card', description: 'Default description', content: 'Default body', action: 'Start here' };
const themeColors = {
  light: { title: '#304a8a', label: '#304a8a', error: '#b42318' },
  dark: { title: '#8ab4f8', label: '#aecbfa', error: '#ffb4ab' },
};
const rgb = hex => `rgb(${hex.slice(1).match(/../g).map(value => parseInt(value, 16)).join(', ')})`;
async function paintedStyles(mode) {
  await styleIs(nodeSelector(rootId), { paddingTop: '8px', paddingLeft: '12px' });
  for (const id of [cardId, newCardId, ...(!skipAssets ? [copyId] : [])]) {
    assert.ok(id, 'Expected Card was inserted by this run');
    await styleIs(nodeSelector(id), cardCSS);
    const title = nodes(await node(id)).find(entry => entry.kind === 'cardTitle');
    assert.deepEqual((await node(id)).props, { variant: 'outlined', size: 'md' });
    await styleIs(nodeSelector(title.id), { ...titleFrameCSS, fontSize: '31px', fontWeight: '650', color: rgb(themeColors[mode].title) });
    await paintedCardText(nodeSelector(id)); noLocalStyles(await node(id));
  }
  if (!skipInput) {
    assert.ok(inputId, 'Expected Input was inserted by this run');
    await styleIs(partSelector('root'), { gap: '9px' });
    await styleIs(partSelector('control'), { fontSize: '17px', borderTopLeftRadius: '5px' });
    await styleIs(nodeSelector(inputId), { fontSize: '17px' });
    await styleIs(partSelector('label'), { fontSize: '15px', color: rgb(themeColors[mode].label) });
    await styleIs(partSelector('description'), { fontSize: '12px' });
    await styleIs(partSelector('error'), { fontSize: '13px', color: rgb(themeColors[mode].error) });
    noLocalStyles(await node(inputId));
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
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profile });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
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
  const originalSystems = await systemBytes();
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
    await check('Frame resolved values: read-only inspection, real history, clear/reset and theme refresh', async () => {
      await chooseLayer(); await wait(visible(q('[aria-label="Frame settings"]')));
      const before = await record(), systems = await systemBytes(), painted = q(nodeSelector(rootId));
      const input = q('#project-inspector [data-appearance-key="paddingTop"]');
      const shadow = q('#project-inspector [data-appearance-key="shadow"]');
      const color = q('#project-inspector [data-appearance-key="color"]');
      const matchesPadding = `${painted} && ${input}?.value===String(parseFloat(getComputedStyle(${painted}).paddingTop))`;
      const matchesShadow = `${painted} && ${shadow}?.querySelector('option[value=""]')?.textContent===getComputedStyle(${painted}).boxShadow`;
      const historyState = `[...document.querySelectorAll('[aria-label="Project history"] button')].map(e=>({label:e.getAttribute('aria-label'),disabled:e.disabled}))`;
      noLocalStyles(await node(rootId));
      for (const key of ['paddingTop', 'paddingLeft', 'fontSize', 'borderTopLeftRadius']) {
        const property = q(`#project-inspector [data-appearance-key="${key}"]`);
        await wait(`${property}?.value===String(parseFloat(getComputedStyle(${painted})[${JSON.stringify(key)}]))`, `Frame ${key} displays its rendered value`);
        assert.equal(await evaluate(`${property}.value`), String(parseFloat((await computed(nodeSelector(rootId), [key]))[key])));
      }
      assert.doesNotMatch(await evaluate(`${q('#project-inspector [aria-label="Local appearance"]')}.textContent`), /\binherited\b/i);
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('#project-inspector [data-appearance-key]')].filter(e=>/inherited/i.test((e.getAttribute('placeholder')??'')+' '+e.value)).map(e=>e.dataset.appearanceKey)`), [], 'Property controls never substitute Inherited for their values');
      await wait(matchesShadow, 'Shadow default label matches boxShadow, not an unsupported shadow CSS property');
      assert.equal(await evaluate(`${shadow}.value`), '');
      assert.deepEqual(await evaluate(`[...${shadow}.options].map(option=>option.value)`), ['', 'none', 'sm', 'md', 'lg'], 'Rendered shadows are display-only, not preset values');

      const display = await evaluate(`${input}.value`), editedValue = Number(display) + 7.25;
      await appearance('Frame', 'paddingTop', editedValue); await press('Tab');
      assert.equal((await record()).revision, before.revision + 1, 'Changed Enter followed by blur persists exactly once');
      const edited = await project();
      await history('Undo', before.document); await wait(matchesPadding, 'Undo restores the effective default value');
      const untouched = await record(), historyBefore = await evaluate(historyState);
      assert.equal(await evaluate(`${q('[aria-label="Redo project edit"]')}.disabled`), false, 'A real redo entry guards against accidental no-op history');
      await reveal(input); await click(input); await press('Enter'); await press('Tab');
      assert.deepEqual(await record(), untouched, 'Untouched focus/Enter/blur cannot write the Project');
      await fill(input, display, 'enter'); await press('Tab');
      assert.deepEqual(await record(), untouched, 'Retyping the displayed value cannot materialize an override');
      await fill(input, `${display}${display.includes('.') ? '0' : '.0'}`, 'enter'); await press('Tab');
      assert.deepEqual(await record(), untouched, 'Equivalent numeric text also stays linked');
      await fill(input, '', 'enter'); await press('Tab'); await wait(matchesPadding);
      assert.deepEqual(await record(), untouched, 'Clearing an unset property cannot write the Project');
      assert.deepEqual(await evaluate(historyState), historyBefore, 'No-op edits preserve Undo/Redo availability');
      noLocalStyles(await node(rootId));

      const originalTheme = await evaluate(`${q('[aria-label="Frame theme"]')}.value`), colors = {};
      for (const mode of [originalTheme === 'light' ? 'dark' : 'light', originalTheme]) {
        await select('[aria-label="Frame theme"]', mode);
        await wait(`${q(`[data-frame-id="${frameId}"] [data-frame-surface]`)}.dataset.dsTheme===${JSON.stringify(mode)}`);
        colors[mode] = (await computed(nodeSelector(rootId), ['color'])).color;
        await wait(`(()=>{const value=${color}?.value;return /^#[0-9a-f]{6}$/i.test(value??'') && 'rgb('+value.slice(1).match(/../g).map(channel=>parseInt(channel,16)).join(', ')+')'===${JSON.stringify(colors[mode])}})()`, `${mode} Frame color refreshes from the rendered theme`);
        assert.equal(rgb(await evaluate(`${color}.value`)), colors[mode]);
        await wait(matchesPadding); await wait(matchesShadow);
        assert.deepEqual(await record(), untouched, 'Theme measurement is read-only');
      }
      assert.notEqual(colors.light, colors.dark, 'The theme changed the actual inherited color');
      assert.deepEqual(await evaluate(historyState), historyBefore);
      await history('Redo', edited);
      await wait(`${input}.value===${JSON.stringify(String(editedValue))}`, 'Redo restores the authored value');
      await appearance('Frame', 'paddingTop', ''); await press('Tab'); await wait(matchesPadding);
      assert.deepEqual(await project(), before.document, 'Clearing removes the override rather than storing the measured value');
      noLocalStyles(await node(rootId));
      assert.equal(await evaluate(`!!${q('[aria-label="Reset Frame Padding top"]')}`), false);

      await history('Undo', edited);
      await wait(`${input}.value===${JSON.stringify(String(editedValue))}`);
      const beforeReset = (await record()).revision;
      await click(q('[aria-label="Reset Frame Padding top"]')); await press('Tab');
      await wait(`${stored()}.revision===${beforeReset + 1}`, 'Reset persists exactly once');
      await wait(matchesPadding); await wait(matchesShadow);
      assert.deepEqual(await project(), before.document, 'Reset restores the linked value without an authored override');
      noLocalStyles(await node(rootId));
      assert.equal(await evaluate(`!!${q('[aria-label="Reset Frame Padding top"]')}`), false);
      assert.equal(await systemBytes(), systems, 'Frame inspection and local edits never author System values');
      evidence('frame-resolved-values', { defaultPadding: display, editedValue, shadow: (await computed(nodeSelector(rootId), ['boxShadow'])).boxShadow, colors, noOpWrites: 0, redoPreserved: true, localOverridesRemoved: true });
    });
    await check('selected frame only: generic root appearance commits by Enter and blur', async () => {
      await chooseLayer(); await wait(visible(q('[aria-label="Frame settings"]')));
      assert.equal(await evaluate(visible(q('[aria-label="Instance settings"]'))), false);
      assert.equal(await evaluate(visible(q('[aria-label="Project name"]'))), false);
      await appearance('Frame', 'paddingTop', 8);
      await appearance('Frame', 'paddingLeft', 12, 'blur');
      assert.deepEqual((await node(rootId)).appearance, { paddingTop: 8, paddingLeft: 12 });
      await styleIs(nodeSelector(rootId), { paddingTop: '8px', paddingLeft: '12px' });
    });
    await check('Assets inserts full Card; Project exposes parameters and all compound layers', async () => {
      await sidebar('Assets'); await click(q('[data-insert-kind="card"]'));
      await wait(`${stored()}.document.pages[0].frames[0].root.children.some(n=>n.kind==='card')`);
      const card = (await frame()).root.children.find(entry => entry.kind === 'card'); cardId = card.id;
      assert.deepEqual(cardSlots(card), startingCardCopy); noLocalStyles(card);
      assert.deepEqual(card.props, { variant: 'outlined', size: 'md' });
      await parameterInspector();
      assert.equal(await evaluate(visible(q('[aria-label="Frame settings"]'))), false);
      for (const part of ['Header', 'Title', 'Description', 'Content', 'Footer']) assert.ok(await evaluate(visible(q(`[aria-label="Select Card.${part} layer"]`))), `Card.${part} is present, not an Add placeholder`);
      const header = card.children[0]; titleId = header.children[0].id;
      await click(q('[aria-label="Select Card.Title layer"]')); await parameterInspector();
      assert.equal(await evaluate(`${q('#project-inspector [aria-label="Instance text"]')}.value`), startingCardCopy.title);
      await sidebar('Layers'); await wait(q(layerSelector(titleId)));
      assert.match(await evaluate(`${q(layerSelector(header.id))}.getAttribute('aria-label')`), /^Card\.Header/);
      assert.match(await evaluate(`${q(layerSelector(titleId))}.getAttribute('aria-label')`), /^Card\.Title/);
      assert.equal(await systemBytes(), originalSystems, 'Project insertion does not author System defaults');
    });
    await check('Card matrix: exact outlined.md frame, independent corners/padding and linked-side history', async () => {
      const before = await record();
      await chooseLayer(cardId); await click(named('#project-inspector button', 'Edit styles in System'));
      await wait(`location.pathname==='/card' && ${q('[aria-label="Component editor"]')}`);
      await systemComponent('card');
      assert.equal(await evaluate(`!!${q(recipeControls)}`), false, 'Project style link does not silently pick a system-wide or arbitrary recipe');
      for (const selector of ['[data-system-shared-defaults]', '[data-system-base-tokens]']) assert.equal(await evaluate(`${q(selector)}.open`), false);
      evidence('collapsed-shared-defaults', await evaluate(`(()=>{const e=${q('[aria-label="Shared default layer"]')};return {open:e.closest('details').open,layoutBoxes:e.getClientRects().length,painted:e.checkVisibility({visibilityProperty:true})}})()`));
      assert.equal(await evaluate(visible(q('[aria-label="Shared default layer"]'))), false, 'Compatibility styles are not the primary editor');
      await matrixCards(startingCardCopy);
      const baseline = await matrixSnapshot('card');
      await systemTab('Parameters');
      for (const [key, value] of Object.entries(startingCardCopy)) assert.equal(await evaluate(`${q(`#system-default-card-${key}`)}.value`), value);
      await systemTab('Styles');
      await matrixClick('card', cardRecipe, 'root', 'frame');
      assert.equal(await evaluate(`!!${q(`${recipeControls} [id$="-fontSize"]`)}`), false, 'Frame controls do not expose text typography');
      for (const label of ['Link corners', 'Link padding sides']) assert.equal(await evaluate(`${q(`${recipeControls} [aria-label="${label}"]`)}.getAttribute('aria-pressed')`), 'false');
      for (const [key, value] of Object.entries(cardStyles)) await recipeStyle('card', cardRecipe, 'root', 'frame', key, value, key === 'paddingLeft' ? 'blur' : 'enter');
      for (const mode of ['light', 'dark']) assert.deepEqual((await system()).themes[mode].componentRecipes.card[cardRecipe].root, cardStyles);
      const independent = await system();
      await click(q(`${recipeControls} [aria-label="Link padding sides"]`));
      assert.equal(await evaluate(`${q(`${recipeControls} [aria-label="Link padding sides"]`)}.getAttribute('aria-pressed')`), 'true');
      const padding = Object.keys(cardStyles).filter(key => key.startsWith('padding'));
      await recipeStyle('card', cardRecipe, 'root', 'frame', 'paddingTop', 11, 'enter', padding);
      const linked = await system();
      await styleIs(matrixCard, { ...cardCSS, ...Object.fromEntries(padding.map(key => [key, '11px'])) });
      await systemHistory('Undo', independent); await styleIs(matrixCard, cardCSS);
      await systemHistory('Redo', linked); await styleIs(matrixCard, Object.fromEntries(padding.map(key => [key, '11px'])));
      await systemHistory('Undo', independent); await styleIs(matrixCard, cardCSS);
      // Card.Icon has always used border-radius: inherit; root corners legitimately reach this child.
      Object.assign(baseline[cardRecipe].find(entry => entry.component === 'card' && entry.part === 'icon').styles, Object.fromEntries(Object.entries(cardCSS).filter(([key]) => key.endsWith('Radius'))));
      await matrixUnchangedExcept('card', baseline, cardRecipe, ['root']); await matrixCards(startingCardCopy);
      await projectWorkspace(); assert.deepEqual(await record(), before);
      noLocalStyles(await node(cardId)); await styleIs(nodeSelector(cardId), cardCSS);
      evidence('card-recipe-frame', { id: cardId, recipe: cardRecipe, sharedAcrossThemes: cardStyles, otherRecipesUnchanged: 8, painted: await computed(nodeSelector(cardId), Object.keys(cardCSS)) });
    });
    await check('real outlined.md title text click: isolated typography, Undo/Redo and text reset preserve frame fields', async () => {
      const projectBefore = await record();
      await systemComponent('card');
      await matrixClick('card', cardRecipe, 'root', 'frame');
      await matrixClick('card', cardRecipe, 'title', 'text');
      await recipeLayer(cardRecipe, 'title', 'frame', 'Title');
      for (const [key, value] of Object.entries(titleFrameStyles)) await recipeStyle('card', cardRecipe, 'title', 'frame', key, value);
      await matrixClick('card', cardRecipe, 'title', 'text');
      assert.equal(await evaluate(`!!${q(`${recipeControls} [id$="-paddingLeft"]`)}`), false, 'Text and frame fields are disjoint');
      const before = await system(), previous = await computed(matrixTitle, ['fontSize']), baseline = await matrixSnapshot('card');
      const input = q(recipeInput('card', cardRecipe, 'title', 'text', 'fontSize'));
      await fill(input, '31px', 'enter');
      assert.equal(await evaluate(`${input}.getAttribute('aria-invalid')`), 'true');
      assert.deepEqual(await system(), before, 'Rejected style drafts cannot mutate any recipe');
      await press('Escape');
      await wait(`${input}.value===String(parseFloat(getComputedStyle(${q(matrixTitle)}).fontSize))`, 'Escape restores the rendered Card title font size');
      assert.equal(await evaluate(`${input}.value`), String(parseFloat((await computed(matrixTitle, ['fontSize'])).fontSize)));
      assert.deepEqual(await system(), before, 'Escape discards the draft without authoring a title typography override');
      await recipeStyle('card', cardRecipe, 'title', 'text', 'fontSize', 31); const after = await system();
      await styleIs(matrixTitle, { ...titleFrameCSS, fontSize: '31px' });
      await matrixUnchangedExcept('card', baseline, cardRecipe, ['title']);
      await systemHistory('Undo', before); await styleIs(matrixTitle, { ...titleFrameCSS, ...previous });
      await systemHistory('Redo', after); await styleIs(matrixTitle, { ...titleFrameCSS, fontSize: '31px' });
      await click(named(`${recipeControls} button`, 'Reset text styles'));
      await wait(`!${storedSystem()}.themes.light.componentRecipes.card[${JSON.stringify(cardRecipe)}].title.fontSize`);
      assert.deepEqual(await system(), before, 'Text reset preserves the same title frame fields, root geometry, all other recipes and content');
      await styleIs(matrixTitle, { ...titleFrameCSS, ...previous });
      await systemHistory('Undo', after); await styleIs(matrixTitle, { ...titleFrameCSS, fontSize: '31px' });
      await matrixUnchangedExcept('card', baseline, cardRecipe, ['title']); await matrixCards(startingCardCopy);
      if (screenshotPath) {
        await matrixClick('card', cardRecipe, 'title', 'text');
        await evaluate(`${q('#token-editor')}.scrollTo({top:0,behavior:'instant'})`); await settle();
        const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(screenshotPath, Buffer.from(data, 'base64'));
        evidence('screenshot', { path: screenshotPath, recipe: cardRecipe, part: 'title', target: 'text' });
      }
      await projectWorkspace(); assert.deepEqual(await record(), projectBefore);
      await styleIs(nodeSelector(titleId), { ...titleFrameCSS, fontSize: '31px' });
      assert.deepEqual(cardSlots(await node(cardId)), startingCardCopy);
      assert.equal((await system()).themes.dark.componentRecipes.card[cardRecipe].title.fontSize, 31);
      evidence('card-recipe-title', { recipe: cardRecipe, part: 'title', target: 'text', fontSize: 31, otherRecipesUnchanged: 8, retainedFrame: titleFrameStyles, projectContentUntouched: true });
    });
    await check('nested Card content/action text clicks edit the enclosing exact recipe, never standalone Text/Button styles', async () => {
      const before = await record();
      await systemComponent('card');
      const baseline = await matrixSnapshot('card');
      for (const [part, values] of Object.entries(cardTextStyles)) {
        await matrixClick('card', cardRecipe, part, 'text');
        await recipeStyle('card', cardRecipe, part, 'text', 'fontSize', values.fontSize);
      }
      await paintedCardText(matrixCard);
      await matrixUnchangedExcept('card', baseline, cardRecipe, ['content', 'footer']);
      await matrixCards(startingCardCopy);
      for (const mode of ['light', 'dark']) for (const component of ['text', 'button']) assert.equal((await system()).themes[mode].componentRecipes[component], undefined, `${component} has no accidental global recipe edit`);
      await projectWorkspace(); assert.deepEqual(await record(), before);
      await paintedCardText(nodeSelector(cardId));
      assert.deepEqual(cardSlots(await node(cardId)), startingCardCopy); noLocalStyles(await node(cardId));
      evidence('card-nested-text', { recipe: cardRecipe, parts: cardTextStyles, otherRecipesUnchanged: 8, standaloneRecipesUntouched: true });
    });
    await check('Project Card.Title content/history stay isolated; canvas selection reveals collapsed ancestry', async () => {
      const before = await project(), systems = await systemBytes();
      await chooseLayer(titleId); await parameterInspector(); await content('text', 'Workspace card', 'blur');
      assert.equal((await node(titleId)).text, 'Workspace card'); const after = await project();
      await history('Undo', before); assert.equal((await node(titleId)).text, startingCardCopy.title);
      await history('Redo', after); assert.equal((await node(titleId)).text, 'Workspace card');
      await chooseLayer(cardId); await click(q('[aria-label="Collapse Card.Header"]'));
      await chooseLayer(); await fitPage(); await click(q(nodeSelector(titleId)), false);
      await wait(`${q(layerSelector(titleId))}?.getAttribute('aria-selected')==='true'`);
      assert.equal(await evaluate(`!!${q('[aria-label="Collapse Card.Header"]')}`), true);
      await styleIs(nodeSelector(titleId), { fontSize: '31px' });
      await systemComponent('card', 'Parameters');
      await matrixCards(startingCardCopy);
      assert.equal(await evaluate(`${q('#system-default-card-title')}.value`), startingCardCopy.title);
      assert.equal(await systemBytes(), systems);
      await projectWorkspace();
      evidence('title', { id: titleId, text: (await node(titleId)).text, fontSize: await computed(nodeSelector(titleId), ['fontSize']) });
    });
  } else console.log('SKIP frame styles, full Card, System style history and Project content isolation (--shell-only)');


  if (!skipInput) {
    await check('Project Input content/error placement/icon are instance parameters, not System edits', async () => {
      const systems = await systemBytes();
      await chooseLayer(); await sidebar('Assets'); await click(q('[data-insert-kind="input"]'));
      const input = nodes((await frame()).root).find(entry => entry.kind === 'input'); assert.ok(input); inputId = input.id;
      await parameterInspector(); noLocalStyles(input);
      await content('label', 'Work email'); await content('description', 'Use your work address', 'blur');
      await content('error', 'Enter a valid email');
      await select('#project-inspector [aria-label="Instance errorIcon"]', 'warning');
      await select('#project-inspector [aria-label="Instance errorPosition"]', 'above');
      assert.equal((await node(inputId)).props.errorPosition, 'above');
      assert.equal((await node(inputId)).props.errorIcon, 'warning');
      assert.equal(await evaluate(`${q(partSelector('label'))}.textContent.trim()`), 'Work email');
      assert.equal(await evaluate(`${q(partSelector('description'))}.textContent.trim()`), 'Use your work address');
      assert.equal(await evaluate(`${q(partSelector('error'))}.textContent.trim()`), 'Enter a valid email');
      assert.equal(await evaluate(`${q(partSelector('root'))}.firstElementChild.getAttribute('data-appearance-part')`), 'error');
      assert.ok(await evaluate(`!!${q(partSelector('error') + '[data-error-icon="warning"] svg[aria-hidden="true"]')}`));
      assert.equal(await systemBytes(), systems);
    });
    await check('Input optional insertion copy resets; invalid examples expose an error for each size without saving sample content', async () => {
      const projectBefore = await record();
      await systemComponent('input', 'Parameters');
      const helper = await evaluate(`${q('#system-default-input-description')}.value`);
      await matrixInputs('Email address', helper, 'Please check this field.');
      await systemDefault('input', 'props', 'description', '');
      assert.equal(await evaluate(`${q('#system-default-input-description')}.value`), '');
      await matrixInputs('Email address', 'Helpful context for this field.', 'Please check this field.');
      await click(q('[aria-label="Reset Default Description"]'));
      await wait(`${q('#system-default-input-description')}.value===${JSON.stringify(helper)}`);
      await matrixInputs('Email address', helper, 'Please check this field.');
      const before = await systemBytes();
      for (const size of ['sm', 'md', 'lg']) await matrixClick('input', `invalid.${size}`, 'error', 'text');
      await systemTab('Parameters');
      assert.equal(await evaluate(`${q('#system-default-input-error')}.value`), '', 'Sample errors are not insertion defaults');
      await matrixInputs('Email address', helper, 'Please check this field.');
      assert.equal(await systemBytes(), before); assert.deepEqual(await record(), projectBefore);
      await projectWorkspace();
    });
    await check('Input invalid.md recipe: control frame/text split and all field parts reach only matching instances', async () => {
      const before = await record();
      await systemComponent('input', 'Parameters');
      assert.equal(await evaluate(`${q('#system-default-input-label')}.value`), 'Email address');
      assert.equal(await evaluate(`${q('#system-default-input-error')}.value`), '');
      await systemDefault('input', 'props', 'label', 'Contact email');
      await systemDefault('input', 'props', 'error', 'Insertion error');
      await systemDefault('input', 'props', 'errorPosition', 'below');
      await systemDefault('input', 'props', 'errorIcon', 'info');
      for (const [key, value] of Object.entries({ size: 'lg', hideLabel: true, disabled: true, readOnly: true })) await systemDefault('input', 'props', key, value);
      const helper = await evaluate(`${q('#system-default-input-description')}.value`);
      await matrixInputs('Contact email', helper, 'Insertion error');
      assert.equal(await evaluate(`${q(matrixInputPart('root'))}.lastElementChild.getAttribute('data-appearance-part')`), 'error');
      assert.ok(await evaluate(`!!${q(matrixInputPart('error') + '[data-error-icon="info"] svg[aria-hidden="true"]')}`));
      await systemTab('Styles');
      const baseline = await matrixSnapshot('input');
      const parts = { root: { gap: 9 }, control: { fontSize: 17, borderTopLeftRadius: 5 }, label: { fontSize: 15, color: themeColors.light.label }, description: { fontSize: 12 }, error: { fontSize: 13, color: themeColors.light.error } };
      await matrixClick('input', inputRecipe, 'root', 'frame');
      await recipeStyle('input', inputRecipe, 'root', 'frame', 'gap', 9);
      await matrixClick('input', inputRecipe, 'control', 'frame');
      assert.equal(await evaluate(`!!${q(`${recipeControls} [id$="-fontSize"]`)}`), false);
      await recipeStyle('input', inputRecipe, 'control', 'frame', 'borderTopLeftRadius', 5);
      await matrixClick('input', inputRecipe, 'control', 'text');
      assert.equal(await evaluate(`!!${q(`${recipeControls} [id$="-borderTopLeftRadius"]`)}`), false);
      await recipeStyle('input', inputRecipe, 'control', 'text', 'fontSize', 17);
      for (const part of ['label', 'description', 'error']) {
        await matrixClick('input', inputRecipe, part, 'text');
        for (const [key, value] of Object.entries(parts[part])) await recipeStyle('input', inputRecipe, part, 'text', key, value, key === 'color' ? 'blur' : 'enter');
      }
      for (const [part, values] of Object.entries(parts)) await styleIs(matrixInputPart(part), Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key === 'color' ? rgb(value) : `${value}px`])));
      await styleIs(matrixInputPart('control', 'text'), { fontSize: '17px' });
      assert.deepEqual((await system()).themes.light.componentRecipes.input, { [inputRecipe]: parts });
      const geometry = structuredClone(parts); delete geometry.label.color; delete geometry.error.color;
      assert.deepEqual((await system()).themes.dark.componentRecipes.input, { [inputRecipe]: geometry });
      await matrixUnchangedExcept('input', baseline, inputRecipe);
      const beforeOtherSizes = await systemBytes();
      for (const size of ['sm', 'lg']) {
        await matrixClick('input', `invalid.${size}`, 'error', 'text');
        const input = q(recipeInput('input', `invalid.${size}`, 'error', 'text', 'fontSize'));
        const errorPart = matrixPart('input', `invalid.${size}`, 'error', 'text');
        await wait(`${input}.value===String(parseFloat(getComputedStyle(${q(errorPart)}).fontSize))`, `Other-size ${size} error typography displays its rendered value`);
        assert.equal(await evaluate(`${input}.value`), String(parseFloat((await computed(errorPart, ['fontSize'])).fontSize)));
        for (const mode of ['light', 'dark']) assert.equal(Object.hasOwn((await system()).themes[mode].componentRecipes.input, `invalid.${size}`), false, 'Displaying another size never authors its inherited error typography');
      }
      assert.equal(await systemBytes(), beforeOtherSizes, 'Reading other-size values leaves all recipe storage unchanged');
      await matrixInputs('Contact email', helper, 'Insertion error');
      await projectWorkspace(); assert.deepEqual(await record(), before);
      for (const [part, values] of Object.entries(parts)) await styleIs(partSelector(part), Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key === 'color' ? rgb(value) : `${value}px`])));
      await styleIs(nodeSelector(inputId), { fontSize: '17px' }); noLocalStyles(await node(inputId));
      assert.equal((await node(inputId)).props.errorPosition, 'above');
      assert.equal((await node(inputId)).props.errorIcon, 'warning');
      assert.equal((await node(inputId)).props.size, 'md');
      assert.equal(await evaluate(`${q(nodeSelector(inputId))}.readOnly`), false);
      assert.equal(await evaluate(`${q(partSelector('error'))}.textContent.trim()`), 'Enter a valid email');
      evidence('input-recipe', { id: inputId, recipe: inputRecipe, instance: (await node(inputId)).props, defaults: (await system()).componentDefaults.input, parts, otherRecipesUnchanged: 8 });
    });
    await check('canvas label and error clicks select the owning Input, not the frame/layout', async () => {
      await fitPage();
      for (const part of ['label', 'error']) {
        await chooseLayer(); await click(q(partSelector(part)), false);
        await wait(`${q(layerSelector(inputId))}?.getAttribute('aria-selected')==='true'`, `${part} click selects Input owner`);
        await wait(visible(q('[aria-label="Instance settings"]')));
        assert.equal(await evaluate(`${q('#project-inspector [aria-label="Instance label"]')}.value`), 'Work email');
        assert.equal(await evaluate(visible(q('[aria-label="Frame settings"]'))), false);
      }
    });
  } else console.log(`SKIP Input parts and field-owner selection (${shellOnly ? '--shell-only' : '--skip-input'})`);

  if (!shellOnly) await check('insertion defaults do not change matrix scope; new Card axes and instance parameters resolve the matching recipe', async () => {
    const before = await record();
    await systemComponent('card'); await matrixClick('card', cardRecipe, 'title', 'text');
    const recipes = (await system()).themes;
    await systemTab('Parameters');
    for (const [key, value] of Object.entries(nextCardCopy)) await systemDefault('card', 'slots', key, value, key === 'description' ? 'blur' : 'enter');
    await systemDefault('card', 'props', 'variant', 'filled');
    await systemDefault('card', 'props', 'size', 'lg');
    await matrixCards(nextCardCopy);
    assert.deepEqual((await system()).componentDefaults.card.slots, nextCardCopy);
    assert.deepEqual((await system()).themes, recipes, 'Content/default axes never author recipe styles');
    await systemTab('Styles'); await selectedRecipe(cardRecipe, 'title', 'text');
    const otherRoot = await computed(matrixPart('card', 'filled.lg', 'root'), recipeCSSKeys);
    const otherTitle = await computed(matrixPart('card', 'filled.lg', 'title'), recipeCSSKeys);
    const smallRoot = await computed(matrixPart('card', 'outlined.sm', 'root'), recipeCSSKeys);
    const smallTitle = await computed(matrixPart('card', 'outlined.sm', 'title'), recipeCSSKeys);
    await projectWorkspace(); assert.deepEqual(await record(), before);
    assert.deepEqual(cardSlots(await node(cardId)), { ...startingCardCopy, title: 'Workspace card' });
    const systems = await systemBytes();
    await chooseLayer(); await sidebar('Assets'); await click(q('[data-insert-kind="card"]'));
    await wait(`${stored()}.document.pages[0].frames[0].root.children.filter(n=>n.kind==='card').length===2`);
    const inserted = (await frame()).root.children.find(entry => entry.kind === 'card' && entry.id !== cardId); newCardId = inserted.id;
    const insertedTitle = nodes(inserted).find(entry => entry.kind === 'cardTitle');
    assert.deepEqual(inserted.props, { variant: 'filled', size: 'lg' });
    assert.deepEqual(cardSlots(inserted), nextCardCopy); noLocalStyles(inserted); await parameterInspector();
    await styleIs(nodeSelector(newCardId), otherRoot); await styleIs(nodeSelector(insertedTitle.id), otherTitle);
    await select('#project-inspector [aria-label="Instance variant"]', 'outlined');
    await select('#project-inspector [aria-label="Instance size"]', 'sm');
    await styleIs(nodeSelector(newCardId), smallRoot); await styleIs(nodeSelector(insertedTitle.id), smallTitle);
    await select('#project-inspector [aria-label="Instance size"]', 'md');
    await styleIs(nodeSelector(newCardId), cardCSS);
    await styleIs(nodeSelector(insertedTitle.id), { ...titleFrameCSS, fontSize: '31px' });
    assert.deepEqual(cardSlots(await node(newCardId)), nextCardCopy); noLocalStyles(await node(newCardId));
    assert.equal((await node(titleId)).text, 'Workspace card');
    assert.equal(await systemBytes(), systems, 'Insertion and instance parameters only read System defaults/recipes');
    evidence('insertion-defaults', { existing: cardSlots(await node(cardId)), inserted: cardSlots(inserted), defaults: inserted.props, instance: (await node(newCardId)).props, newCardId });
  });

  if (!skipAssets) await check('saved Card snapshot preserves content with fresh IDs, independent copies and Project history', async () => {
    const systems = await systemBytes();
    await chooseLayer(cardId); await sidebar('Assets');
    await fill(labelled('Component name'), 'Workspace card snapshot');
    await click(named('#workspace-sidebar button', 'Save selection'));
    const saved = await project(), asset = saved.assets.find(entry => entry.name === 'Workspace card snapshot');
    assert.ok(asset); assert.deepEqual(asset.root, await node(cardId)); noLocalStyles(asset.root);
    await chooseLayer(); await sidebar('Assets'); await click(q('[aria-label="Insert Workspace card snapshot"]'));
    await wait(`${stored()}.document.pages[0].frames[0].root.children.filter(n=>n.kind==='card').length===3`);
    const after = await project(), cards = after.pages[0].frames[0].root.children.filter(entry => entry.kind === 'card');
    const copy = cards.find(entry => entry.id !== cardId && entry.id !== newCardId); assert.ok(copy); copyId = copy.id;
    assert.deepEqual(shape(copy), shape(asset.root));
    assert.equal(cardSlots(copy).title, 'Workspace card', 'Saved content wins over the newer System default');
    const sourceIds = new Set(nodes(asset.root).map(entry => entry.id));
    assert.ok(nodes(copy).every(entry => !sourceIds.has(entry.id)), 'Every copied node receives a fresh ID');
    await styleIs(nodeSelector(copyId), cardCSS);
    await history('Undo', saved); assert.equal(await evaluate(`!!${q(nodeSelector(copyId))}`), false);
    await history('Redo', after); await styleIs(nodeSelector(copyId), cardCSS);
    const copyTitle = nodes(copy).find(entry => entry.kind === 'cardTitle');
    await chooseLayer(copyTitle.id); await parameterInspector(); await content('text', 'Snapshot copy');
    assert.equal((await node(copyTitle.id)).text, 'Snapshot copy');
    assert.equal((await node(titleId)).text, 'Workspace card');
    assert.deepEqual((await project()).assets.find(entry => entry.id === asset.id), asset);
    await chooseLayer(titleId); await content('text', 'Updated original');
    assert.equal((await node(copyTitle.id)).text, 'Snapshot copy');
    assert.deepEqual((await project()).assets.find(entry => entry.id === asset.id), asset, 'Saving captures a snapshot, not a live content link');
    assert.deepEqual(cardSlots(await node(newCardId)), nextCardCopy);
    assert.equal(await systemBytes(), systems);
    noLocalStyles(await node(copyId)); await styleIs(nodeSelector(cardId), cardCSS); await styleIs(nodeSelector(copyId), cardCSS);
    evidence('asset', { assetId: asset.id, originalId: cardId, copyId, originalTitle: (await node(titleId)).text, savedTitle: cardSlots(asset.root).title, copyTitle: (await node(copyTitle.id)).text });
  }); else console.log(`SKIP saved components (${shellOnly ? '--shell-only' : '--skip-assets'})`);

  if (!shellOnly) await check('recipe colors are theme-specific, geometry/typography are shared, and linked Project theme switching is read-only', async () => {
    const saved = await record(), defaults = (await system()).componentDefaults, backgrounds = {};
    await systemComponent('card'); await matrixClick('card', cardRecipe, 'title', 'text');
    for (const mode of ['light', 'dark']) {
      await systemTheme(mode); cardThemeBaselines[mode] = await matrixSnapshot('card');
      await recipeStyle('card', cardRecipe, 'title', 'text', 'color', themeColors[mode].title);
      await styleIs(matrixTitle, { ...titleFrameCSS, fontSize: '31px', color: rgb(themeColors[mode].title) });
      await matrixUnchangedExcept('card', cardThemeBaselines[mode], cardRecipe, ['title']);
    }
    const beforeWeight = await system();
    await recipeStyle('card', cardRecipe, 'title', 'text', 'fontWeight', 650, 'blur');
    const afterWeight = await system();
    await systemHistory('Undo', beforeWeight); await systemHistory('Redo', afterWeight);
    if (!skipInput) {
      await systemComponent('input');
      const baseline = await matrixSnapshot('input');
      await matrixClick('input', inputRecipe, 'label', 'text');
      await recipeStyle('input', inputRecipe, 'label', 'text', 'color', themeColors.dark.label);
      await matrixClick('input', inputRecipe, 'error', 'text');
      await recipeStyle('input', inputRecipe, 'error', 'text', 'color', themeColors.dark.error);
      await styleIs(matrixInputPart('error'), { fontSize: '13px', color: rgb(themeColors.dark.error) });
      await matrixUnchangedExcept('input', baseline, inputRecipe, ['label', 'error']);
    }
    await systemComponent('card');
    for (const mode of ['light', 'dark']) {
      const theme = (await system()).themes[mode];
      assert.deepEqual(theme.componentRecipes.card, { [cardRecipe]: { root: cardStyles, title: { ...titleFrameStyles, fontSize: 31, fontWeight: 650, color: themeColors[mode].title }, ...cardTextStyles } });
      if (!skipInput) {
        assert.deepEqual(Object.keys(theme.componentRecipes.input), [inputRecipe]);
        assert.deepEqual(theme.componentRecipes.input[inputRecipe].control, { fontSize: 17, borderTopLeftRadius: 5 });
        assert.deepEqual(theme.componentRecipes.input[inputRecipe].label, { fontSize: 15, color: themeColors[mode].label });
        assert.deepEqual(theme.componentRecipes.input[inputRecipe].error, { fontSize: 13, color: themeColors[mode].error });
      }
      assert.deepEqual(theme.componentStyles ?? {}, {}, 'Recipe editing never authors all-variant shared defaults');
      await systemTheme(mode);
      await styleIs(matrixTitle, { ...titleFrameCSS, fontSize: '31px', fontWeight: '650', color: rgb(themeColors[mode].title) });
      await paintedCardText(matrixCard);
      await matrixUnchangedExcept('card', cardThemeBaselines[mode], cardRecipe, ['title']);
    }
    assert.deepEqual((await system()).componentDefaults, defaults);
    const systems = await systemBytes();
    await projectWorkspace();
    for (const mode of ['light', 'dark']) {
      await select('[aria-label="Frame theme"]', mode);
      await wait(`${q('[data-frame-surface]')}.dataset.dsTheme===${JSON.stringify(mode)}`);
      await paintedStyles(mode); assert.deepEqual(await record(), saved);
      backgrounds[mode] = (await computed('[data-frame-surface]', ['backgroundColor'])).backgroundColor;
    }
    assert.notEqual(backgrounds.light, backgrounds.dark, 'The linked theme actually changes, not just the select');
    assert.equal(await systemBytes(), systems, 'Theme switching cannot mutate System');
    evidence('themes', { backgrounds, colors: themeColors, recipe: cardRecipe, sharedCard: cardStyles, otherRecipesUnchanged: 8 });
  });

  if (!shellOnly) await check('real CSS/JSON exports and Project backup preserve exact recipes, shared geometry and independent content', async () => {
    const before = await record(), systems = await systemBytes(), authored = await system();
    await systemComponent('card');
    await click(q('[aria-label="Export tokens"]')); await wait(visible(q('[aria-label="Exported tokens"]')));
    await click(named('[aria-label="Export format"] button', 'CSS'));
    const css = await evaluate(`${q('[aria-label="Exported tokens"] code')}.textContent`);
    for (const mode of ['light', 'dark']) {
      const block = css.split(`[data-ds-theme="${mode}"] {`)[1]?.split('}')[0]; assert.ok(block, `${mode} CSS block`);
      for (const [part, values] of Object.entries({ root: cardStyles, title: titleFrameStyles, ...cardTextStyles })) for (const [key, value] of Object.entries(values)) assert.ok(block.includes(`--card-recipe-outlined-md-${part}-${key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}: ${value}px;`), `${mode} ${part}.${key} export`);
      for (const declaration of [`--card-recipe-outlined-md-title-font-size: 31px;`, `--card-recipe-outlined-md-title-font-weight: 650;`, `--card-recipe-outlined-md-title-color: ${themeColors[mode].title};`]) assert.ok(block.includes(declaration), `${mode} ${declaration}`);
      if (!skipInput) for (const declaration of [`--input-recipe-invalid-md-root-gap: 9px;`, `--input-recipe-invalid-md-control-font-size: 17px;`, `--input-recipe-invalid-md-control-border-top-left-radius: 5px;`, `--input-recipe-invalid-md-label-font-size: 15px;`, `--input-recipe-invalid-md-label-color: ${themeColors[mode].label};`, `--input-recipe-invalid-md-description-font-size: 12px;`, `--input-recipe-invalid-md-error-font-size: 13px;`, `--input-recipe-invalid-md-error-color: ${themeColors[mode].error};`]) assert.ok(block.includes(declaration), `${mode} ${declaration}`);
      for (const [declaration] of block.matchAll(/--(?:card|input)-recipe-[\w-]+:/g)) assert.ok(declaration.startsWith('--card-recipe-outlined-md-') || !skipInput && declaration.startsWith('--input-recipe-invalid-md-'), `No unrelated recipe declarations: ${declaration}`);
      assert.equal(/--(?:card|input)-part-[\w-]+:/.test(block), false, 'No accidental shared-part export');
    }
    assert.equal(css.includes(nextCardCopy.title), false, 'Content defaults are data, not CSS');
    await click(named('[role="dialog"] button', 'Download')); assert.equal(await downloaded('bambiui-tokens.css'), css);
    await click(named('[aria-label="Export format"] button', 'JSON'));
    const json = await evaluate(`${q('[aria-label="Exported tokens"] code')}.textContent`), exported = JSON.parse(json);
    assert.equal(exported.version, 3); assert.deepEqual(exported, authored);
    assert.deepEqual(exported.componentDefaults.card.slots, nextCardCopy);
    await click(named('[role="dialog"] button', 'Download')); assert.equal(await downloaded('bambiui-tokens.json'), json);
    const { parseDesignSystem } = await import('../app/studio/tokens.ts');
    assert.deepEqual(parseDesignSystem(json), exported, 'The actual System export round-trips through schema v3');
    await click(q('[aria-label="Close export dialog"]')); await wait(`!${q('[role="dialog"]')}`);
    await projectWorkspace(); await click(named('[aria-label="Inspector view"] [role="tab"]', 'Project'));
    await click(named('#project-inspector button', 'Download project JSON'));
    const backup = JSON.parse(await downloaded(`${projectId}.json`));
    assert.equal(before.version, 1); assert.equal(backup.version, 1); assert.deepEqual(backup, before.document);
    const { parseComposerDocument } = await import('../app/studio/composer/model.ts');
    assert.deepEqual(parseComposerDocument(backup), backup, 'The actual Project backup round-trips through its schema');
    assert.equal(backup.systemId, await evaluate(`${storedSystems()}.activeId`));
    assert.equal(Object.hasOwn(backup, 'componentDefaults'), false); assert.equal(Object.hasOwn(backup, 'themes'), false);
    assert.deepEqual(await record(), before); assert.equal(await systemBytes(), systems);
    evidence('exports', { systemVersion: exported.version, projectVersion: backup.version, cssBytes: Buffer.byteLength(css), jsonBytes: Buffer.byteLength(json), files: ['bambiui-tokens.css', 'bambiui-tokens.json', `${projectId}.json`] });
  });

  await check('reload restores exact Project/System records, defaults, snapshots and both painted themes', async () => {
    const before = await record(), systems = await systemBytes(), origin = await evaluate('performance.timeOrigin');
    await send('Page.reload'); await wait(`performance.timeOrigin!==${origin}`);
    await wait(`${q('[aria-label="Page canvas"]')}?.dataset.projectId===${JSON.stringify(projectId)} && ${q('[data-frame-id]')}`);
    assert.deepEqual(await record(), before);
    if (!shellOnly) {
      for (const mode of ['light', 'dark']) { await select('[aria-label="Frame theme"]', mode); await paintedStyles(mode); }
      await systemComponent('card', 'Parameters'); await matrixCards(nextCardCopy);
      for (const [key, value] of Object.entries(nextCardCopy)) assert.equal(await evaluate(`${q(`#system-default-card-${key}`)}.value`), value);
      assert.equal(await evaluate(`${q('#system-default-card-variant')}.value`), 'filled');
      assert.equal(await evaluate(`${q('#system-default-card-size')}.value`), 'lg');
      await matrixClick('card', cardRecipe, 'title', 'text');
      assert.equal(await evaluate(`${q(recipeInput('card', cardRecipe, 'title', 'text', 'fontSize'))}.value`), '31');
      for (const mode of ['light', 'dark']) {
        await systemTheme(mode);
        assert.equal(await evaluate(`${q(recipeInput('card', cardRecipe, 'title', 'text', 'color'))}.value`), themeColors[mode].title);
        await styleIs(matrixCard, cardCSS);
        await styleIs(matrixTitle, { ...titleFrameCSS, fontSize: '31px', fontWeight: '650', color: rgb(themeColors[mode].title) });
        await paintedCardText(matrixCard);
        await matrixUnchangedExcept('card', cardThemeBaselines[mode], cardRecipe, ['title']);
      }
      if (!skipInput) {
        await systemComponent('input'); await matrixClick('input', inputRecipe, 'error', 'text');
        assert.equal(await evaluate(`${q(recipeInput('input', inputRecipe, 'error', 'text', 'fontSize'))}.value`), '13');
        await styleIs(matrixInputPart('error'), { fontSize: '13px', color: rgb(themeColors.dark.error) });
        await systemTab('Parameters');
        await matrixInputs('Contact email', await evaluate(`${q('#system-default-input-description')}.value`), 'Insertion error');
      }
      await projectWorkspace();
    }
    if (!skipAssets) { assert.ok(copyId); await sidebar('Assets'); await wait(visible(q('[aria-label="Insert Workspace card snapshot"]'))); }
    assert.deepEqual(await record(), before); assert.equal(await systemBytes(), systems);
    if (shellOnly) assert.equal(systems, originalSystems);
    evidence('reload', { projectId, revision: before.revision, frames: before.document.pages[0].frames.length, assets: before.document.assets?.length ?? 0, systemPersisted: systems !== null });
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
      evidence('failure', await evaluate(`({url:location.href,viewport:[innerWidth,innerHeight],selected:[...document.querySelectorAll('[role="treeitem"][aria-selected="true"]')].map(e=>({id:e.dataset.layerId,label:e.getAttribute('aria-label')})),inspector:[...document.querySelectorAll('#workspace-inspector input,#workspace-inspector select,#workspace-inspector textarea')].filter(e=>e.checkVisibility({visibilityProperty:true})).map(e=>({id:e.id,label:e.getAttribute('aria-label'),value:e.value,invalid:e.getAttribute('aria-invalid')})).slice(0,32),recipe:[...document.querySelectorAll('[data-system-recipe-controls]')].map(e=>({recipe:e.dataset.recipe,part:e.dataset.part,target:e.dataset.target})),matrices:[...document.querySelectorAll('[data-component-matrix]')].map(e=>e.dataset.componentMatrix),sharedLayer:document.querySelector('[aria-label="Shared default layer"]')?.value,notices:[...document.querySelectorAll('[role="alert"]')].filter(e=>e.getClientRects().length).map(e=>e.textContent)})`));
    } catch (diagnosticError) { console.error(`Failure evidence unavailable: ${diagnosticError.message}`); }
  }
  if (errors.length) evidence('browser-errors', errors);
} finally {
  try { await cleanup(); console.log('CLEANUP disposable Chrome/profile/server removed; no app or smoke files changed by the run (optional screenshot retained)'); }
  catch (error) { console.error(`FAIL cleanup: ${error.message}`); process.exitCode = process.exitCode || 1; }
  clearTimeout(watchdog); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
}
