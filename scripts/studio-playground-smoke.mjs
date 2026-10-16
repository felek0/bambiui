#!/usr/bin/env node
// Coordinator-built out/ only: never builds, generates, or silently skips browser checks.
// Node 22.18+, Chrome (CHROME_PATH supported), disposable CDP session, 115s session bound.
// Integration hooks in addition to the public playground/label contract:
// [data-matrix-pane], [data-playground-pane] are the two central layout panes;
// [data-playground-scroll] is the independently scrollable playground region;
// [data-playground-status] is the live "N actions" output.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { withSourceBrowser } from './source-browser-session.mjs';
import { componentDefaultFields } from '../app/studio/component-defaults.ts';
import { nodeRegistry } from '../app/studio/page-document/registry.ts';
import { keys, systemsFixture, targetId } from './studio-system-only-fixtures.mjs';

const outDir = fileURLToPath(new URL('../out/', import.meta.url));
const ids = ['button', 'input', 'switch', 'checkbox', 'badge', 'card', 'text'];
const counts = { button: 18, input: 9, switch: 12, checkbox: 12, badge: 54, card: 9, text: 180 };
const q = selector => `document.querySelector(${JSON.stringify(selector)})`;
const pg = id => `[data-component-playground="${id}"]`;
const preview = id => `${pg(id)} [data-playground-preview]`;
const root = id => `${preview(id)} [data-ds-component="${id}"][data-component-part="root"]`;
const field = (id, label) => `${pg(id)} [data-playground-controls] [aria-label="Playground ${label}"]`;
let stage = 'startup', passes = 0;

async function session(task) {
  await withSourceBrowser({ outDir }, async browser => {
    const { send, evaluate, wait, click, origin } = browser;
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{window.__playgroundWrites=[];for(const name of ['setItem','removeItem','clear']){const original=Storage.prototype[name];Storage.prototype[name]=function(...args){if(this===localStorage)window.__playgroundWrites.push([name,...args]);return original.apply(this,args)}}})()` });
    await send('Page.navigate', { url: `${origin}/button` });
    await wait(`${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
    await evaluate(`localStorage.clear();for(const [key,value] of Object.entries(${JSON.stringify(systemsFixture())}))localStorage.setItem(key,value)`);
    const seededTime = await evaluate('performance.timeOrigin');
    await send('Page.reload');
    await wait(`performance.timeOrigin!==${seededTime} && ${q(root('button'))} && ${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
    const api = {
      ...browser,
      async route(id, view = 'design') {
        const path = `${view === 'develop' ? '/develop' : ''}/${id}`;
        await wait(`${q(`.studio-sidebar a[href="${path}"]`)}`);
                await click(`.studio-sidebar a[href="${path}"]`);
        await wait(`location.pathname===${JSON.stringify(path)} && ${q(view === 'design' ? root(id) : '[data-cli-install]')}`);
      },
      async named(selector, name) {
        await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>(e.getAttribute('aria-label')||e.textContent.trim())===${JSON.stringify(name)});if(!e)throw Error(${JSON.stringify(`Missing ${name}`)});document.querySelector('[data-playground-smoke-target]')?.removeAttribute('data-playground-smoke-target');e.setAttribute('data-playground-smoke-target','')})()`);
        await click('[data-playground-smoke-target]');
      },
      async choose(selector, value) {
        const checkbox = await evaluate(`${q(selector)}?.matches('input[type="checkbox"]')`);
        if (checkbox) {
          if (await evaluate(`${q(selector)}.checked`) !== (String(value) === 'true')) await click(selector);
          await wait(`${q(selector)}.checked===${String(value) === 'true'}`);
          return;
        }
        await evaluate(`(()=>{const e=${q(selector)};if(!(e instanceof HTMLSelectElement))throw Error('Expected native select: '+${JSON.stringify(selector)});if(![...e.options].some(o=>o.value===${JSON.stringify(String(value))}))throw Error('Missing option '+${JSON.stringify(String(value))});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        await wait(`${q(selector)}.value===${JSON.stringify(String(value))}`);
      },
      async fill(selector, value, commit = false) {
        await click(selector);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
        await send('Input.insertText', { text: value });
        if (commit) {
          await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        }
      },
      async reset(id) { await api.named(`${pg(id)} button`, 'Reset playground'); },
      async snapshot(id) {
        return evaluate(`({matrix:${q(`[data-component-matrix="${id}"]`)}.innerHTML,storage:Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])),writes:window.__playgroundWrites,history:[...document.querySelectorAll('[aria-label="Undo change"], [aria-label="Redo change"]')].map(e=>e.disabled)})`);
      },
      async selectRecipe(id, recipe) {
        const selector = `[data-component-matrix="${id}"] [data-recipe-example="${recipe}"] > button`;
        await evaluate(`${q(selector)}.focus({preventScroll:true})`);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await wait(`${q('[data-system-recipe-controls]')}?.dataset.recipe===${JSON.stringify(recipe)}`);
      },
    };
    await task(api);
  });
}
async function check(label, task) {
  stage = label;
  await task();
  passes++;
  console.log(`PASS: ${label}`);
}

try {
  await session(async api => {
    const { evaluate, wait, route, choose, reset, snapshot } = api;
    for (const id of ids) await check(`${id}: independent native controls, every public axis, saved matrix isolation and reset`, async () => {
      if (id !== 'button') await route(id);
      assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(pg(id))}).length`), 1);
      assert.equal(await evaluate(`[...${q(pg(id))}.querySelectorAll('h2,h3')].some(e=>e.textContent.trim()==='Playground')`), true);
      assert.equal(await evaluate(`document.querySelectorAll('[data-component-matrix="${id}"] [data-recipe-example]').length`), counts[id]);
      assert.equal(await evaluate(`!!document.querySelector('#token-editor [aria-label^="Preview "]')`), false, 'Inspector is not the active args editor');
      for (const definition of componentDefaultFields(id).filter(field => !['defaultValue', 'defaultChecked'].includes(field.key))) {
        const selector = field(id, definition.label);
        assert.equal(await evaluate(`(()=>{const e=${q(selector)};return !!e && ['INPUT','TEXTAREA','SELECT'].includes(e.tagName) && [...(e.labels||[])].some(l=>l.textContent.includes(${JSON.stringify(definition.label)}))})()`), true, `Native labelled ${id} ${definition.label}`);
      }
      const defaults = await evaluate(`[...${q(`${pg(id)} [data-playground-controls]`)}.querySelectorAll('input,textarea,select')].map(e=>[e.getAttribute('aria-label'),e.type==='checkbox'?e.checked:e.value])`);
      const before = await snapshot(id);
      for (const axis of ['variant', 'size', 'tone']) {
        const options = nodeRegistry[id].props[axis];
        if (!Array.isArray(options)) continue;
        const label = axis[0].toUpperCase() + axis.slice(1);
        const actual = await evaluate(`[...${q(field(id, label))}.options].map(o=>o.value).filter(Boolean)`);
        assert.deepEqual(actual, options, `${id} ${axis} exposes the complete public axis`);
        for (const value of options) {
          await choose(field(id, label), value);
          await wait(`${q(root(id))}.getAttribute('data-${axis}')===${JSON.stringify(value)}`);
          assert.deepEqual(await snapshot(id), before, `${id} ${axis}=${value} changes only playground`);
        }
      }
      await reset(id);
      for (const mode of ['light', 'dark']) {
        await api.click(`[aria-label="Design theme"] [aria-label="${mode === 'light' ? 'Light' : 'Dark'}"]`);
        await wait(`${q(preview(id))}.dataset.theme===${JSON.stringify(mode)}`);
        assert.equal(await evaluate(`getComputedStyle(${q(preview(id))}).colorScheme`), mode);
        assert.equal(await evaluate(`getComputedStyle(${q(root(id))}).getPropertyValue('--ds-primary').trim()`), await evaluate(`getComputedStyle(${q('[data-component-matrix]')}).getPropertyValue('--ds-primary').trim()`), `${id} ${mode} playground consumes the same live system variables as matrix`);
        assert.deepEqual(await evaluate(`[...${q(`${pg(id)} [data-playground-controls]`)}.querySelectorAll('input,textarea,select')].map(e=>[e.getAttribute('aria-label'),e.type==='checkbox'?e.checked:e.value])`), defaults, 'Theme preserves playground args');
      }
      await api.click('[aria-label="Design theme"] [aria-label="Light"]');
      await wait(`${q(preview(id))}.dataset.theme==='light'`);
      assert.deepEqual(await evaluate(`[...${q(`${pg(id)} [data-playground-controls]`)}.querySelectorAll('input,textarea,select')].map(e=>[e.getAttribute('aria-label'),e.type==='checkbox'?e.checked:e.value])`), defaults);
      assert.deepEqual(await snapshot(id), before, 'Reset playground is transient too');
    });
  });

  await session(async api => {
    const { evaluate, wait, route, choose, fill, click, reset, snapshot } = api;
    await check('Button: live activation, disabled/loading suppress actions, reset clears actions', async () => {
      const action = `${pg('button')} [data-playground-status]`;
      const before = await snapshot('button');
      await wait(`${q(action)}?.textContent.trim()==='0 actions'`);
      await click(root('button'));
      await wait(`${q(action)}.textContent.trim()==='1 action'`);
      for (const state of ['Disabled', 'Loading']) {
        await reset('button');
        await choose(field('button', state), 'true');
        await wait(`${q(root('button'))}.matches(':disabled,[aria-disabled="true"],[data-disabled]')`);
        if (state === 'Loading') assert.equal(await evaluate(`${q(root('button'))}.getAttribute('aria-busy')`), 'true');
        await click(root('button'));
        assert.equal(await evaluate(`${q(action)}.textContent.trim()`), '0 actions');
      }
      await reset('button');
      assert.equal(await evaluate(`${q(action)}.textContent.trim()`), '0 actions');
      assert.deepEqual(await snapshot('button'), before);
    });
    await check('Input: actual editing, readOnly, error association and above/below DOM placement', async () => {
      await route('input');
      const before = await snapshot('input');
      const input = `${preview('input')} input:not([type="hidden"])`;
      await fill(input, 'editable@example.com');
      await wait(`${q(input)}.value==='editable@example.com'`);
      await choose(field('input', 'Read only'), 'true');
      await fill(input, 'must-not-replace@example.com');
      assert.equal(await evaluate(`${q(input)}.value`), 'editable@example.com');
      assert.equal(await evaluate(`${q(input)}.readOnly`), true);
      await fill(field('input', 'Error message'), 'QA error — 雪');
      for (const position of ['above', 'below']) {
        await choose(field('input', 'Error placement'), position);
        await wait(`${q(`${preview('input')} [data-component-part="error"]`)}?.textContent.includes('QA error')`);
        assert.equal(await evaluate(`${q(input)}.getAttribute('aria-invalid')`), 'true');
        assert.equal(await evaluate(`(()=>{const input=${q(input)},error=${q(`${preview('input')} [data-component-part="error"]`)};return (input.getAttribute('aria-describedby')||'').split(' ').includes(error.id) && !!(error.compareDocumentPosition(input)&Node.DOCUMENT_POSITION_${position === 'above' ? 'FOLLOWING' : 'PRECEDING'})})()`), true);
      }
      assert.deepEqual(await snapshot('input'), before);
      await reset('input');
      assert.equal(await evaluate(`${q(input)}.value`), '');
    });
    for (const id of ['switch', 'checkbox']) await check(`${id}: real checked interaction${id === 'checkbox' ? ' and indeterminate' : ''}`, async () => {
      await route(id);
      const control = `${preview(id)} [role="${id}"]`;
      const before = await snapshot(id);
      const initial = await evaluate(`${q(control)}.getAttribute('aria-checked')`);
      await click(control);
      await wait(`${q(control)}.getAttribute('aria-checked')===${JSON.stringify(initial === 'true' ? 'false' : 'true')}`);
      await choose(field(id, 'Checked'), 'true');
      await wait(`${q(control)}.getAttribute('aria-checked')==='true'`);
      if (id === 'checkbox') {
        await choose(field(id, 'Indeterminate'), 'true');
        await wait(`${q(control)}.getAttribute('aria-checked')==='mixed'`);
      }
      await reset(id);
      assert.equal(await evaluate(`${q(control)}.getAttribute('aria-checked')`), initial);
      assert.deepEqual(await snapshot(id), before);
    });
    await check('Card: title, description, content and action slots never repaint matrix', async () => {
      await route('card');
      const before = await snapshot('card');
      for (const [label, part] of [['Title', 'title'], ['Description', 'description'], ['Content', 'content'], ['Action label', 'footer']]) {
        const text = `QA ${label} — 雪 🦌`;
        await fill(field('card', label), text);
        await wait(`${q(`${preview('card')} [data-ds-component="card"][data-component-part="${part}"]`)}.textContent.includes(${JSON.stringify(text)})`);
        assert.deepEqual(await snapshot('card'), before);
      }
      await reset('card');
      assert.equal(await evaluate(`${q(preview('card'))}.textContent.includes('QA Title')`), false);
    });
    await check('Text: semantic as is independent from visual variant', async () => {
      await route('text');
      const before = await snapshot('text');
      await choose(field('text', 'Variant'), 'caption');
      for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span']) {
        await choose(field('text', 'HTML element'), tag);
        await wait(`${q(root('text'))}.tagName.toLowerCase()===${JSON.stringify(tag)}`);
        assert.equal(await evaluate(`${q(root('text'))}.dataset.variant`), 'caption');
      }
      await fill(field('text', 'Text'), 'Independent semantic text');
      await wait(`${q(root('text'))}.textContent==='Independent semantic text'`);
      assert.deepEqual(await snapshot('text'), before);
    });
  });

  await session(async api => {
    const { send, evaluate, wait, click, choose, fill, named, route, selectRecipe, reset } = api;
    await check('Theme, view and matrix selection preserve args; live recipe edits paint playground in both themes', async () => {
      await fill(field('button', 'Text'), 'Preserved playground text');
      await choose(field('button', 'Variant'), 'outline');
      await choose(field('button', 'Size'), 'lg');
      for (const mode of ['light', 'dark']) {
        await click(`[aria-label="Design theme"] [aria-label="${mode === 'light' ? 'Light' : 'Dark'}"]`);
        await wait(`document.documentElement.dataset.studioTheme===${JSON.stringify(mode)}`);
        await selectRecipe('button', 'outline.lg');
        assert.equal(await evaluate(`${q(field('button', 'Text'))}.value`), 'Preserved playground text');
        assert.equal(await evaluate(`${q(root('button'))}.dataset.size`), 'lg');
        const colorField = '[id="system-recipe-button-outline.lg-root-frame-background"]';
        const color = mode === 'light' ? '#123456' : '#654321';
        await fill(colorField, color, true);
        const rgb = mode === 'light' ? 'rgb(18, 52, 86)' : 'rgb(101, 67, 33)';
        await wait(`getComputedStyle(${q(root('button'))}).backgroundColor===${JSON.stringify(rgb)}`);
        assert.equal(await evaluate(`getComputedStyle(${q('[data-component-matrix="button"] [data-recipe-example="outline.lg"] [data-component-part="root"]')}).backgroundColor`), rgb);
      }
      await click('.view-switch a[href="/develop/button"]');
      await wait('location.pathname==="/develop/button"');
      await click('.view-switch a[href="/button"]');
      await wait(`location.pathname==='/button' && ${q(root('button'))} && ${q('.studio-sidebar a[href="/badge"]')}`);
      assert.equal(await evaluate(`${q(field('button', 'Text'))}.value`), 'Preserved playground text');
      assert.equal(await evaluate(`${q(root('button'))}.dataset.variant`), 'outline');
      assert.equal(await evaluate(`${q(root('button'))}.dataset.size`), 'lg');
    });
    await check('Component/System/import/reload reset args; component-style reset preserves the independent sample', async () => {
      await route('badge'); await route('button');
      const original = await evaluate(`${q(field('button', 'Text'))}.value`);
      assert.notEqual(original, 'Preserved playground text');
      const change = async () => fill(field('button', 'Text'), 'Discard at boundary');
      const restored = async () => wait(`${q(field('button', 'Text'))}.value===${JSON.stringify(original)}`);
      await change();
      await click('.system-switcher summary');
      await named('.system-switcher-list button', 'QA unrelated system');
      await restored();
      await change();
      await click('.system-switcher summary');
      await named('.system-switcher-list button', 'QA target system');
      await restored();
      assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.systems)})).activeId`), targetId);
      await change();
      await click('.system-switcher summary');
      await named('.system-switcher-actions button', 'Import as new system');
      const system = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.mirror)}))`);
      await evaluate(`(()=>{const e=${q('.header-actions input[type="file"]')},d=new DataTransfer();d.items.add(new File([${JSON.stringify(JSON.stringify({ ...system, name: 'QA playground import' }))}],'playground.json',{type:'application/json'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      await wait(`${q('.system-switcher summary')}.textContent.includes('QA playground import')`);
      await restored();
      await change();
      // Confirm only this intentional destructive operation in the disposable synthetic System.
      await evaluate('window.confirm=()=>true');
      await click('[data-system-base-tokens] > summary');
      await named('#token-editor button', 'Reset component styles');
      assert.equal(await evaluate(`${q(field('button', 'Text'))}.value`), 'Discard at boundary', 'Style reset is not an args reset');
      await reset('button');
      await restored();
      await change();
      const time = await evaluate('performance.timeOrigin');
      await send('Page.reload');
      await wait(`performance.timeOrigin!==${time} && ${q(root('button'))} && ${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
      await restored();
      await reset('button');
    });
  });

  await session(async api => {
    const { send, evaluate, wait, click, route, fill } = api;
    const camera = `getComputedStyle(${q('[data-canvas]')}).transform`;
    const rect = selector => evaluate(`(()=>{const r=${q(selector)}.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()`);
    await check('Desktop central split is 50/50; matrix camera pan/wheel cannot transform playground', async () => {
      const left = await rect('[data-matrix-pane]'), right = await rect('[data-playground-pane]');
      assert.ok(Math.abs(left.width - right.width) <= 3, 'Desktop central panes share width equally');
      assert.ok(left.right <= right.x + 2 && Math.abs(left.y - right.y) <= 2, 'Desktop panes are side by side');
      await fill(field('button', 'Text'), 'Camera independent');
      const before = await rect(pg('button'));
      const args = await evaluate(`${q(field('button', 'Text'))}.value`);
      const view = await rect('[aria-label="Component canvas"]');
      const point = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
      const oldCamera = await evaluate(camera);
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 100, deltaY: 160 });
      await wait(`${camera}!==${JSON.stringify(oldCamera)}`);
      assert.deepEqual(await rect(pg('button')), before);
      const wheelCamera = await evaluate(camera);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'middle', buttons: 4, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 40, y: point.y + 35, button: 'middle', buttons: 4 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + 40, y: point.y + 35, button: 'middle', buttons: 0, clickCount: 1 });
      await wait(`${camera}!==${JSON.stringify(wheelCamera)}`);
      assert.deepEqual(await rect(pg('button')), before);
      assert.equal(await evaluate(`${q(field('button', 'Text'))}.value`), args);
    });
    await check('Playground wheel scrolls its own region, never the matrix camera; mobile stacks without overflow', async () => {
      await route('input');
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 650, deviceScaleFactor: 1, mobile: false });
      await wait(`${q('[data-playground-scroll]')}.scrollHeight>${q('[data-playground-scroll]')}.clientHeight`);
      await evaluate(`${q('[data-playground-scroll]')}.scrollTop=0`);
      // Route selection animates the matrix camera for 360ms; settle it before testing wheel isolation.
      await delay(500);
      const before = await evaluate(camera);
      const scroll = await rect('[data-playground-scroll]');
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: scroll.x + scroll.width - 20, y: scroll.y + scroll.height / 2, deltaX: 0, deltaY: 240 });
      await wait(`${q('[data-playground-scroll]')}.scrollTop>0`);
      assert.equal(await evaluate(camera), before, 'Playground wheel must not bubble into camera handling');
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
      await wait('document.documentElement.scrollWidth<=innerWidth');
      const left = await rect('[data-matrix-pane]'), right = await rect('[data-playground-pane]');
      assert.ok(left.bottom <= right.y + 2 && Math.abs(left.x - right.x) <= 2, 'Mobile panes stack vertically');
      assert.ok(left.width > 0 && right.width > 0 && left.right <= 391 && right.right <= 391);
      await click(field('input', 'Label'));
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    });
  });
} catch (error) {
  process.exitCode = 1;
  console.error(`FAIL: ${stage}\n${error.stack || error}`);
} finally {
  console.log(`RESULT: ${passes} playground browser checks passed; ${process.exitCode ? 'FAILED (no skips)' : 'PASS'}. No build or generator run.`);
}
