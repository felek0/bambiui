#!/usr/bin/env node
// Coordinator-built out/ only: never builds, generates, or silently skips browser checks.
// Node 22.18+, Chrome (CHROME_PATH supported), disposable CDP session, 115s session bound.
// Integration hooks in addition to the public playground/label contract:
// Native [data-workbench-mode] buttons select one mounted pane at a time.
// [data-matrix-content] is untransformed; [data-matrix-toolbar] holds sticky filters.
// Props/reset are scoped by [data-playground-controls-for], portalled into the inspector.
// [data-playground-status] is the live "N actions" output.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

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
const controls = id => `[data-playground-controls-for="${id}"]`;
const field = (id, label) => `${controls(id)} [aria-label="Playground ${label}"]`;
const toolbar = '[data-workbench-toolbar]';
const modeButton = mode => `${toolbar} [data-workbench-mode="${mode}"]`;
const themeButton = mode => `${toolbar} [aria-label="Design theme"] [aria-label="${mode === 'light' ? 'Light' : 'Dark'}"]`;
const storage = `Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))`;
let stage = 'startup', passes = 0;

async function session(task) {
  await withSourceBrowser({ outDir }, async browser => {
    const { send, evaluate, wait, origin } = browser;
    const rawClick = browser.click;
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{window.__playgroundWrites=[];for(const name of ['setItem','removeItem','clear']){const original=Storage.prototype[name];Storage.prototype[name]=function(...args){if(this===localStorage)window.__playgroundWrites.push([name,...args]);return original.apply(this,args)}}})()` });
    await send('Page.navigate', { url: `${origin}/button` });
    await wait(`${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
    await evaluate(`localStorage.clear();for(const [key,value] of Object.entries(${JSON.stringify(systemsFixture())}))localStorage.setItem(key,value)`);
    const seededTime = await evaluate('performance.timeOrigin');
    await send('Page.reload');
    await wait(`performance.timeOrigin!==${seededTime} && ${q(root('button'))} && ${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
    const api = {
      ...browser,
      async key(key, code = key, modifiers = 0) {
        const windowsVirtualKeyCode = { Enter: 13, ' ': 32, Tab: 9, Escape: 27, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35 }[key];
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode, ...(key === 'Enter' ? { text: '\r' } : {}) });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode });
      },
      async panel(id, open) {
        if (await evaluate(`${q('#' + id)}.hidden`) === open) await rawClick(`${toolbar} [aria-controls="${id}"]`);
        await wait(`${q('#' + id)}.hidden===${!open}`);
      },
      async prepare(selector) {
        assert.ok(await evaluate(`!!${q(selector)}`), `Missing control: ${selector}`);
        if (await evaluate('innerWidth<=800')) {
          const owner = await evaluate(`${q(selector)}.closest('#workspace-sidebar,#workspace-inspector,.studio-main')?.id`);
          if (owner === 'workspace-sidebar' || owner === 'workspace-inspector') await api.panel(owner, true);
          else if (owner === 'workspace') {
            await api.panel('workspace-sidebar', false);
            await api.panel('workspace-inspector', false);
          }
        }
        // Open native disclosures through pointer input, never by assigning details.open.
        for (let i = 0; i < 8; i++) {
          const closed = await evaluate(`(()=>{const e=${q(selector)};let closed=null;for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(e))closed=p;document.querySelector('[data-qa-reveal]')?.removeAttribute('data-qa-reveal');if(!closed)return false;closed.querySelector(':scope > summary').setAttribute('data-qa-reveal','');return true})()`);
          if (!closed) {
            assert.ok(await evaluate(`${q(selector)}.checkVisibility()`), `Inactive or hidden control: ${selector}`);
            return;
          }
          await rawClick('[data-qa-reveal]');
        }
        throw new Error(`Cannot reveal ${selector}`);
      },
      async click(selector) { await api.prepare(selector); await rawClick(selector); },
      async assertMode(id, mode) {
        await wait(`${q('.studio-shell')}?.dataset.componentMode===${JSON.stringify(mode)}`);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-workbench-mode]')].map(e=>[e.tagName,e.dataset.workbenchMode,e.getAttribute('aria-pressed'),e.getAttribute('aria-controls'),e.closest('[data-workbench-toolbar]')===${q(toolbar)}])`),[
          ['BUTTON','variants',String(mode==='variants'),'component-variants',true],
          ['BUTTON','playground',String(mode==='playground'),'component-playground',true],
        ]);
        for (const candidate of ['variants','playground']) {
          const pane = candidate === 'variants' ? '[data-matrix-pane]' : '[data-playground-pane]';
          assert.deepEqual(await evaluate(`(()=>{const e=${q(pane)};return [e.id,e.hidden,e.checkVisibility()]})()`),[`component-${candidate}`,candidate!==mode,candidate===mode]);
          if (candidate !== mode) assert.ok(await evaluate(`[...${q(pane)}.querySelectorAll('button,input,select,textarea,a,summary')].every(e=>!e.checkVisibility())`),'inactive content has no visible controls');
        }
        assert.equal(await evaluate(`${q('#token-editor')}.hidden`),mode==='playground');
        assert.ok(await evaluate(`(()=>{const c=${q(controls(id))},h=${q('[data-playground-host]')};return c && h.closest('#workspace-inspector') && h.contains(c) && !${q(pg(id))}.contains(c) && c.hidden===${mode!=='playground'} && h.hidden===${mode!=='playground'}})()`),'props live in the scoped inspector portal');
        const inactive = mode === 'playground' ? '#token-editor' : controls(id);
        assert.ok(await evaluate(`[...${q(inactive)}.querySelectorAll('button,input,select,textarea,summary')].every(e=>!e.checkVisibility())`),'inactive editor controls are hidden too');
        assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Undo change"],[aria-label="Redo change"]').length`),mode==='variants'?2:0);
        if (mode==='variants') assert.equal(await evaluate(`${q('.canvas-history')}.closest('[data-workbench-toolbar]')===${q(toolbar)}`),true);
        assert.equal(await evaluate(`${q(`${toolbar} [aria-controls="workspace-inspector"]`)}.textContent.trim()`),mode==='playground'?'Props':'Styles');
        assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Design theme"]').length`),1);
        assert.ok(await evaluate(`${q(`${toolbar} [aria-label="Design theme"]`)}.checkVisibility() && !${q(toolbar)}.closest('.preview-frame,.studio-header')`));
      },
      async mode(id, mode, keyboard) {
        const selector = modeButton(mode);
        if (keyboard) {
          await api.prepare(selector);
          await evaluate(`${q(selector)}.focus({preventScroll:true})`);
          await api.key(keyboard,keyboard===' '?'Space':keyboard);
          assert.equal(await evaluate(`document.activeElement===${q(selector)}`),true,'mode activation retains keyboard focus');
        } else await api.click(selector);
        await api.assertMode(id,mode);
      },
      async route(id, view = 'design', mode = 'playground') {
        const path = `${view === 'develop' ? '/develop' : ''}/${id}`;
        const previous = await evaluate(`${q('[data-component-playground]')}?.dataset.componentPlayground`);
        if (await evaluate('innerWidth<=800')) await api.panel('workspace-sidebar', true);
        await wait(`${q(`.studio-sidebar a[href="${path}"]`)}`);
        await api.click(`.studio-sidebar a[href="${path}"]`);
        await wait(`location.pathname===${JSON.stringify(path)} && ${q(view === 'design' ? ids.includes(id)?root(id):`[data-foundation="${id}"]` : '.workspace-panel--develop')}`);
        if (await evaluate('innerWidth<=800')) {
          await api.panel('workspace-sidebar', false);
          await api.panel('workspace-inspector', false);
        }
        if (view==='design' && ids.includes(id)) {
          if (id!==previous) await api.assertMode(id,'variants');
          await api.mode(id,mode);
        }
      },
      async named(selector, name) {
        await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>(e.getAttribute('aria-label')||e.textContent.trim())===${JSON.stringify(name)});if(!e)throw Error(${JSON.stringify(`Missing ${name}`)});document.querySelector('[data-playground-smoke-target]')?.removeAttribute('data-playground-smoke-target');e.setAttribute('data-playground-smoke-target','')})()`);
        await api.click('[data-playground-smoke-target]');
      },
      async choose(selector, value) {
        await api.prepare(selector);
        const checkbox = await evaluate(`${q(selector)}?.matches('input[type="checkbox"]')`);
        if (checkbox) {
          if (await evaluate(`${q(selector)}.checked`) !== (String(value) === 'true')) await api.click(selector);
          await wait(`${q(selector)}.checked===${String(value) === 'true'}`);
          return;
        }
        await evaluate(`(()=>{const e=${q(selector)};if(!(e instanceof HTMLSelectElement))throw Error('Expected native select: '+${JSON.stringify(selector)});if(![...e.options].some(o=>o.value===${JSON.stringify(String(value))}))throw Error('Missing option '+${JSON.stringify(String(value))});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        await wait(`${q(selector)}.value===${JSON.stringify(String(value))}`);
      },
      async fill(selector, value, commit = false) {
        await api.click(selector);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
        await send('Input.insertText', { text: value });
        if (commit) {
          await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        }
      },
      async reset(id) { await api.named(`${controls(id)} button`, 'Reset playground'); },
      async args(id) { return evaluate(`[...${q(controls(id))}.querySelectorAll('input,textarea,select')].map(e=>[e.getAttribute('aria-label'),e.type==='checkbox'?e.checked:e.value])`); },
      async snapshot(id) {
        return evaluate(`({matrix:${q(`[data-component-matrix="${id}"]`)}.innerHTML,storage:${storage},writes:window.__playgroundWrites,history:[...document.querySelectorAll('[aria-label="Undo change"], [aria-label="Redo change"]')].map(e=>e.disabled)})`);
      },
      async selectRecipe(id, recipe) {
        await api.mode(id,'variants');
        const selector = `[data-component-matrix="${id}"] [data-recipe-example="${recipe}"] > button`;
        await api.prepare(selector);
        await evaluate(`${q(selector)}.focus({preventScroll:true})`);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await wait(`${q('[data-system-recipe-controls]')}?.dataset.recipe===${JSON.stringify(recipe)}`);
      },
    };
    await api.assertMode('button','variants');
    try { await task(api); }
    catch (error) {
      console.error('EVIDENCE',await evaluate(`({route:location.pathname,mode:${q('.studio-shell')}?.dataset.componentMode,width:innerWidth,height:innerHeight,leftHidden:${q('#workspace-sidebar')}?.hidden,rightHidden:${q('#workspace-inspector')}?.hidden,active:document.activeElement?.outerHTML.slice(0,400)})`).catch(()=>'browser unavailable'));
      throw error;
    }
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
      if (id !== 'button') await route(id); else await api.mode(id,'playground');
      const groups=await evaluate(`[...${q(controls(id))}.querySelectorAll('[data-playground-group]')].map(e=>[e.dataset.playgroundGroup,e.open])`);
      const expectedGroups=['appearance','content',...(['button','input','switch','checkbox'].includes(id)?['state']:[]),...(['button','input','switch','checkbox','text'].includes(id)?['more']:[])];
      assert.deepEqual(groups,expectedGroups.map(group=>[group,group!=='more']),'Appearance, Content and State start open; More options starts closed');
      assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(pg(id))}).length`), 1);
      assert.equal(await evaluate(`[...${q(pg(id))}.querySelectorAll('h2,h3')].some(e=>e.textContent.trim()==='Playground')`), true);
      assert.equal(await evaluate(`document.querySelectorAll('[data-component-matrix="${id}"] [data-recipe-example]').length`), counts[id]);
      assert.equal(await evaluate(`!!document.querySelector('#token-editor [aria-label^="Preview "]')`), false, 'Inspector is not the active args editor');
      for (const definition of componentDefaultFields(id).filter(field => !['defaultValue', 'defaultChecked'].includes(field.key))) {
        const selector = field(id, definition.label);
        assert.equal(await evaluate(`(()=>{const e=${q(selector)};return !!e && ['INPUT','TEXTAREA','SELECT'].includes(e.tagName) && [...(e.labels||[])].some(l=>l.textContent.includes(${JSON.stringify(definition.label)}))})()`), true, `Native labelled ${id} ${definition.label}`);
      }
      const defaults = await api.args(id);
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
        await api.click(themeButton(mode));
        await wait(`${q(preview(id))}.dataset.theme===${JSON.stringify(mode)}`);
        assert.equal(await evaluate(`getComputedStyle(${q(preview(id))}).colorScheme`), mode);
        assert.equal(await evaluate(`getComputedStyle(${q(root(id))}).getPropertyValue('--ds-primary').trim()`), await evaluate(`getComputedStyle(${q('[data-component-matrix]')}).getPropertyValue('--ds-primary').trim()`), `${id} ${mode} playground consumes the same live system variables as matrix`);
        assert.deepEqual(await api.args(id), defaults, 'Theme preserves playground args');
      }
      await api.click(themeButton('light'));
      await wait(`${q(preview(id))}.dataset.theme==='light'`);
      assert.deepEqual(await api.args(id), defaults);
      assert.deepEqual(await snapshot(id), before, 'Reset playground is transient too');
    });
  });

  await session(async api => {
    const { evaluate, wait, route, choose, fill, click, reset, snapshot } = api;
    await api.mode('button','playground');
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
      await api.mode('button','playground');
      await fill(field('button', 'Text'), 'Preserved playground text');
      await choose(field('button', 'Variant'), 'outline');
      await choose(field('button', 'Size'), 'lg');
      for (const mode of ['light', 'dark']) {
        await click(themeButton(mode));
        await wait(`document.documentElement.dataset.studioTheme===${JSON.stringify(mode)}`);
        await selectRecipe('button', 'outline.lg');
        assert.equal(await evaluate(`${q(field('button', 'Text'))}.value`), 'Preserved playground text');
        assert.equal(await evaluate(`${q(root('button'))}.dataset.size`), 'lg');
        const colorField = '[id="system-recipe-button-outline.lg-root-frame-background"]';
        const color = mode === 'light' ? '#123456' : '#654321';
        await fill(colorField, color, true);
        const rgb = mode === 'light' ? 'rgb(18, 52, 86)' : 'rgb(101, 67, 33)';
        const matrixRoot = '[data-component-matrix="button"] [data-recipe-example="outline.lg"] [data-component-part="root"]';
        await wait(`getComputedStyle(${q(matrixRoot)}).backgroundColor===${JSON.stringify(rgb)}`);
        assert.equal(await evaluate(`getComputedStyle(${q(matrixRoot)}).backgroundColor`), rgb);
        await api.mode('button','playground');
        await wait(`getComputedStyle(${q(root('button'))}).backgroundColor===${JSON.stringify(rgb)}`);
        assert.equal(await evaluate(`${q(field('button','Text'))}.value`),'Preserved playground text');
      }
      await evaluate(`window.__qaThemeControl=${q(`${toolbar} [aria-label="Design theme"]`)};true`);
      await click('.view-switch a[href="/develop/button"]');
      await wait('location.pathname==="/develop/button"');
      assert.ok(await evaluate(`window.__qaThemeControl===${q(`${toolbar} [aria-label="Design theme"]`)} && window.__qaThemeControl.checkVisibility()`),'Develop reuses the common theme control');
      assert.equal(await evaluate(`document.querySelectorAll('[data-workbench-mode], [aria-label="Undo change"], [aria-label="Redo change"]').length`),0);
      assert.ok(await evaluate(`!${q(controls('button'))}.checkVisibility() && !${q(pg('button'))}.checkVisibility() && !${q('#token-editor')}.checkVisibility()`),'Develop exposes neither design editor');
      await click('.view-switch a[href="/button"]');
      await wait(`location.pathname==='/button' && ${q(root('button'))} && ${q('.studio-sidebar a[href="/badge"]')}`);
      await api.assertMode('button','playground');
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
      await api.mode('button','variants');
      await click('[data-system-base-tokens] > summary');
      await named('#token-editor button', 'Reset component styles');
      await api.mode('button','playground');
      assert.equal(await evaluate(`${q(field('button', 'Text'))}.value`), 'Discard at boundary', 'Style reset is not an args reset');
      await reset('button');
      await restored();
      await change();
      const time = await evaluate('performance.timeOrigin');
      await send('Page.reload');
      await wait(`performance.timeOrigin!==${time} && ${q(root('button'))} && ${q('.editor-fields')} && !${q('.editor-fields')}.disabled`);
      await api.assertMode('button','variants');
      await api.mode('button','playground');
      await restored();
      await reset('button');
    });
  });

  await session(async api => {
    const { send, evaluate, wait, click, fill, choose, snapshot } = api;
    await check('Keyboard mode switches preserve matrix selection/filters, playground args, storage writes and undo/redo', async () => {
      await api.selectRecipe('button','outline.md');
      const padding='[id="system-recipe-button-outline.md-root-frame-paddingLeft"]';
      await fill(padding,'37.125',true);
      await wait(`!${q('[aria-label="Undo change"]')}.disabled`);
      const authored=await evaluate(storage);
      await click(`${toolbar} [aria-label="Undo change"]`);
      await wait(`!${q('[aria-label="Redo change"]')}.disabled`);
      await choose('[aria-label="Filter variant"]','outline');
      await choose('[aria-label="Filter size"]','md');
      await wait(`document.querySelectorAll('[data-recipe-example]').length===1`);
      await api.mode('button','playground','Enter');
      await fill(field('button','Text'),'Mode-persistent sample — 雪');
      await choose(field('button','Size'),'lg');
      await click(root('button'));
      const args=await api.args('button');
      await api.mode('button','variants',' ');
      const before=await snapshot('button');
      const original=await evaluate(`${q(padding)}.value`);
      await evaluate(`window.__qaMounted=[${q('[data-component-matrix]')},${q(pg('button'))},${q(controls('button'))}];true`);
      for (const [draft,invalid] of [['41.875',false],['999999',true]]) {
        await fill(padding,draft,invalid);
        if (invalid) assert.equal(await evaluate(`${q(padding)}.getAttribute('aria-invalid')`),'true');
        await api.mode('button','playground');
        assert.deepEqual(await api.args('button'),args);
        assert.equal(await evaluate(`${q(`${pg('button')} [data-playground-status]`)}.textContent.trim()`),'1 action');
        assert.deepEqual(await evaluate(storage),before.storage,'leaving Styles discards pending valid/invalid drafts');
        assert.deepEqual(await evaluate('window.__playgroundWrites'),before.writes,'not even an identical storage rewrite is allowed');
        assert.ok(await evaluate('window.__qaMounted.every(e=>e.isConnected)'),'mode changes preserve mounted nodes');
        await api.mode('button','variants',invalid?'Enter':' ');
        await wait(`${q(padding)}.value===${JSON.stringify(original)}`);
        assert.equal(await evaluate(`${q(padding)}.getAttribute('aria-invalid')`),'false');
        assert.deepEqual(await snapshot('button'),before,'matrix selection, filters, exact markup, storage and history survive the round trip');
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-recipe-example][data-selected]')].map(e=>e.dataset.recipeExample)`),['outline.md']);
        assert.deepEqual(await evaluate(`[${q('[aria-label="Filter variant"]')}.value,${q('[aria-label="Filter size"]')}.value]`),['outline','md']);
      }
      await api.mode('button','playground','Enter');
      await evaluate(`${q(modeButton('playground'))}.focus({preventScroll:true})`);
      for (let i=0;i<28;i++) {
        await api.key('Tab');
        assert.ok(await evaluate(`document.activeElement.checkVisibility() && !document.activeElement.closest('[data-matrix-pane],#token-editor')`),'Tab never enters inactive Variants or Styles');
      }
      const {nodes}=await send('Accessibility.getFullAXTree');
      assert.ok(nodes.some(node=>!node.ignored && node.name?.value==='Playground Text'),'Props are present in the accessibility tree');
      assert.equal(nodes.some(node=>!node.ignored && /^Select Button Outline Medium frame$|^Undo change$|^Redo change$/.test(node.name?.value||'')),false,'inactive selection/history are absent from the accessibility tree');
      await api.mode('button','variants',' ');
      assert.deepEqual(await snapshot('button'),before,'keyboard traversal cannot write args or styles');
      await click(`${toolbar} [aria-label="Redo change"]`);
      await wait(`${q(padding)}.value==='37.125'`);
      assert.deepEqual(await evaluate(storage),authored,'redo still reaches the original style transaction after Playground');
      await click(`${toolbar} [aria-label="Undo change"]`);
      assert.deepEqual(await evaluate(storage),before.storage);
      await api.mode('button','playground');
      await api.route('badge','design','variants');
      await api.route('button','design','variants');
      assert.equal(await evaluate(`${q(field('button','Text'))}.value`),'Continue','component navigation resets args and mode');
      assert.deepEqual(await evaluate(`[${q('[aria-label="Filter variant"]')}.value,${q('[aria-label="Filter size"]')}.value]`),['','']);
      assert.equal(await evaluate(`!!${q('[data-recipe-example][data-selected]')}`),false);
    });
    await check('Collapsed More options are natively keyboard-reachable and reset stays scoped to portalled Props', async () => {
      await api.route('text');
      const more=`${controls('text')} [data-playground-group="more"]`;
      assert.equal(await evaluate(`${q(more)}.open`),false);
      assert.equal(await evaluate(`${q(field('text','HTML element'))}.checkVisibility()`),false);
      await api.prepare(`${more} > summary`);
      await evaluate(`${q(`${more} > summary`)}.focus({preventScroll:true})`); await api.key('Enter');
      await wait(`${q(more)}.open && ${q(field('text','HTML element'))}.checkVisibility()`);
      await choose(field('text','HTML element'),'h3');
      await wait(`${q(root('text'))}.tagName==='H3'`);
      await api.reset('text');
      assert.equal(await evaluate(`${q(root('text'))}.tagName`),'P');
      await evaluate(`${q(`${more} > summary`)}.focus({preventScroll:true})`); await api.key(' ','Space');
      assert.equal(await evaluate(`${q(more)}.open`),false);
    });
  });

  await session(async api => {
    const { evaluate, wait, click, fill } = api;
    await check('Custom palette recolors samples, never neutral mode controls, chrome or portalled Props', async () => {
      await api.mode('button','playground');
      const selectors=['.studio-header','.studio-sidebar',toolbar,'#workspace-inspector',controls('button'),field('button','Text'),field('button','Variant'),modeButton('variants'),modeButton('playground')];
      const chrome=()=>evaluate(`${JSON.stringify(selectors)}.map(selector=>{const s=getComputedStyle(document.querySelector(selector));return [selector,s.backgroundColor,s.color,s.borderTopColor,s.fontFamily]})`);
      const before={};
      for (const mode of ['light','dark']) {
        await click(themeButton(mode)); await wait(`document.documentElement.dataset.studioTheme===${JSON.stringify(mode)}`);
        before[mode]=await chrome();
      }
      await api.route('colors');
      await click('[aria-label="Open color builder"]');
      await fill('input[id$="-source"]','#287c60');
      await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.mirror)})).themes.light.source==='#287c60' && JSON.parse(localStorage.getItem(${JSON.stringify(keys.mirror)})).themes.dark.source==='#287c60'`);
      await click('[aria-label="Close color builder"]');
      await api.route('button');
      for (const mode of ['light','dark']) {
        await click(themeButton(mode)); await wait(`${q(preview('button'))}.dataset.theme===${JSON.stringify(mode)}`);
        assert.deepEqual(await chrome(),before[mode],`${mode}: task controls and Props retain neutral editor colors/type`);
        const system=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.mirror)}))`);
        assert.equal(await evaluate(`getComputedStyle(${q(root('button'))}).getPropertyValue('--ds-primary').trim()`),system.themes[mode].global.primary,'sample consumes the customized system');
        assert.notEqual(await evaluate(`getComputedStyle(${q(root('button'))}).getPropertyValue('--ds-primary').trim()`),await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--studio-color-accent").trim()'));
        await api.assertMode('button','playground');
      }
    });
  });

  await session(async api => {
    const { send, evaluate, wait, route, fill } = api;
    const matrixPosition = `(()=>{const e=${q('[data-matrix-scroll]')};return [e.scrollLeft,e.scrollTop]})()`;
    const contentTransform = `getComputedStyle(${q('[data-matrix-content]')}).transform`;
    const rect = selector => evaluate(`(()=>{const r=${q(selector)}.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()`);
    await check('Desktop shows one full-width mounted pane; native matrix scrolling leaves playground args untouched', async () => {
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 650, deviceScaleFactor: 1, mobile: false });
      assert.equal((await rect('#workspace-sidebar')).width,200);
      assert.equal((await rect('#workspace-inspector')).width,320);
      await api.mode('button','playground');
      await fill(field('button', 'Text'), 'Scroll independent');
      const args = await api.args('button');
      await evaluate(`window.__qaPanes=[${q('[data-matrix-pane]')},${q('[data-playground-pane]')},${q(pg('button'))},${q(controls('button'))}];true`);
      for (const mode of ['variants','playground','variants']) {
        await api.mode('button',mode);
        const active=await rect(mode==='variants'?'[data-matrix-pane]':'[data-playground-pane]'),area=await rect('.preview-frame');
        assert.ok(Math.abs(active.width-area.width)<=2 && Math.abs(active.x-area.x)<=2,'active pane fills the central workspace, never half a split');
        assert.ok(await evaluate(`window.__qaPanes.every(e=>e.isConnected) && window.__qaPanes[0]===${q('[data-matrix-pane]')} && window.__qaPanes[1]===${q('[data-playground-pane]')} && window.__qaPanes[2]===${q(pg('button'))} && window.__qaPanes[3]===${q(controls('button'))}`),'mode switching never remounts either sample or the props portal');
      }
      const view = await rect('[data-matrix-scroll]');
      const point = { x: view.right - 18, y: view.bottom - 24 };
      assert.equal(await evaluate(`${q('[data-matrix-scroll]')}.getAttribute('role')`), 'region');
      assert.equal(await evaluate(`${q('[data-matrix-scroll]')}.getAttribute('aria-label')`), 'Component examples');
      assert.equal(await evaluate(`!!${q('[data-canvas], [aria-label="Component canvas"], [aria-label="Canvas zoom"], [class*="canvasHelp"]')}`), false);
      assert.equal(await evaluate(contentTransform), 'none');
      await wait(`${q('[data-matrix-scroll]')}.scrollHeight>${q('[data-matrix-scroll]')}.clientHeight`);
      await evaluate(`${q('[data-matrix-scroll]')}.scrollTop=0`);
      const playgroundScroll = await evaluate(`(()=>{const e=${q('[data-playground-scroll]')};return [e.scrollLeft,e.scrollTop]})()`);
      const shellScroll = await evaluate('[scrollX,scrollY,document.documentElement.scrollTop]');
      const toolbarTop = (await rect(toolbar)).y;
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 240 });
      await wait(`${q('[data-matrix-scroll]')}.scrollTop>0`);
      assert.equal(await evaluate(contentTransform), 'none', 'native scroll never transforms matrix content');
      assert.equal((await rect(toolbar)).y,toolbarTop);
      assert.deepEqual(await evaluate(`(()=>{const e=${q('[data-playground-scroll]')};return [e.scrollLeft,e.scrollTop]})()`), playgroundScroll);
      assert.deepEqual(await evaluate('[scrollX,scrollY,document.documentElement.scrollTop]'), shellScroll);
      await api.mode('button','playground');
      assert.deepEqual(await api.args('button'), args);
    });
    await check('Short desktop playground and portalled Props scroll independently without scrolling matrix or shell', async () => {
      await route('input');
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 480, deviceScaleFactor: 1, mobile: false });
      const before = await evaluate(matrixPosition);
      const shellScroll = await evaluate('[scrollX,scrollY,document.documentElement.scrollTop]');
      for (const selector of ['[data-playground-scroll]',controls('input')]) {
        await wait(`${q(selector)}.scrollHeight>${q(selector)}.clientHeight`);
        await evaluate(`${q(selector)}.scrollTop=0`);
        const peer=selector==='[data-playground-scroll]'?controls('input'):'[data-playground-scroll]';
        const peerScroll=await evaluate(`[${q(peer)}.scrollLeft,${q(peer)}.scrollTop]`);
        const scroll = await rect(selector);
        const point={x:scroll.right-12,y:scroll.y+scroll.height/2};
        assert.ok(await evaluate(`${q(selector)}.contains(document.elementFromPoint(${point.x},${point.y}))`),'wheel reaches the intended scroll region');
        await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 240 });
        await wait(`${q(selector)}.scrollTop>0`);
        assert.deepEqual(await evaluate(`[${q(peer)}.scrollLeft,${q(peer)}.scrollTop]`),peerScroll,'Props and sample have independent scrollers');
        assert.deepEqual(await evaluate(matrixPosition), before, 'Playground wheel must not scroll the hidden matrix');
        assert.deepEqual(await evaluate('[scrollX,scrollY,document.documentElement.scrollTop]'), shellScroll);
      }
      assert.equal(await evaluate(contentTransform), 'none');
    });
    await check('Mobile Library and Props are reachable by pointer and keyboard; only the active pane is visible', async () => {
      for (const width of [700,390,320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
        // Let matchMedia and React switch from docked panels to mobile overlays before toggling.
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await api.panel('workspace-sidebar',false); await api.panel('workspace-inspector',false);
        await api.mode('input','playground','Enter');
        assert.equal(await evaluate(`${q('#workspace-inspector')}.hidden`),true,'mobile mode changes leave the work area unobstructed');
        assert.ok(await evaluate(`(()=>{const r=${q(`${toolbar} [aria-controls="workspace-sidebar"]`)}.getBoundingClientRect();return r.width>0 && r.left>=0 && r.right<=innerWidth})()`),'Library toggle fits');
        await api.panel('workspace-sidebar',true);
        assert.equal(await evaluate(`${q('#workspace-inspector')}.hidden`),true);
        assert.equal(await evaluate(`document.querySelectorAll('.component-group').length`),1);
        assert.equal(await evaluate(`document.querySelectorAll('.component-group a').length`),7);
        await api.panel('workspace-sidebar',false);
        const props=`${toolbar} [aria-controls="workspace-inspector"]`;
        await evaluate(`${q(props)}.focus({preventScroll:true})`); await api.key(' ','Space');
        await wait(`!${q('#workspace-inspector')}.hidden && ${q(controls('input'))}.checkVisibility()`);
        assert.equal(await evaluate(`${q(props)}.textContent.trim()`),'Props');
        assert.equal(await evaluate(`${q('#workspace-sidebar')}.hidden`),true);
        await fill(field('input','Label'),`Mobile props ${width}`);
        await wait(`${q(preview('input'))}.textContent.includes(${JSON.stringify(`Mobile props ${width}`)})`);
        await api.key('Escape');
        await wait(`${q('#workspace-inspector')}.hidden`);
        assert.equal(await evaluate(`document.activeElement===${q(props)}`),true,'Escape restores the Props toggle');
        await api.mode('input','variants',' ');
        await api.mode('input','playground','Enter');
        assert.equal(await evaluate(`${q(field('input','Label'))}.value`),`Mobile props ${width}`);
        const active=await rect('[data-playground-pane]'),area=await rect('.preview-frame');
        assert.ok(active.width>0 && Math.abs(active.width-area.width)<=2 && active.right<=width+1,'mobile uses a single full-width pane, not stacked panes');
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'), true);
      }
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    });
    await check('Narrow matrix panes stack full-size variant/state/tone samples and keep filters usable', async () => {
      for (const id of ids) {
        await route(id,'design','variants');
        await wait(`${q(`[data-component-matrix="${id}"]`)} && ${contentTransform}==='none'`);
        assert.ok(await evaluate(`(()=>{const m=${q(`[data-component-matrix="${id}"]`)},s=${q('[data-matrix-scroll]')},rows=[...m.querySelectorAll('section')].map(row=>[...row.querySelectorAll(':scope > [data-recipe-example]')]).filter(examples=>examples.length);return rows.length>0 && rows.every(examples=>examples.every((e,i)=>{const r=e.getBoundingClientRect(),p=examples[i-1]?.getBoundingClientRect();return r.width>0 && r.left>=s.getBoundingClientRect().left-1 && r.right<=s.getBoundingClientRect().right+1 && (!p || r.top>=p.bottom-1 && Math.abs(r.left-p.left)<=2)}))})()`), `${id}: narrow samples stack rather than shrink or overflow`);
        assert.ok(await evaluate(`(()=>{const s=${q('[data-matrix-scroll]')};return s.scrollWidth<=s.clientWidth+1 && [...s.querySelectorAll('[data-recipe-body] [data-component-part="root"]')].every(e=>{const r=e.getBoundingClientRect();for(let p=e;p&&p!==s;p=p.parentElement)if(getComputedStyle(p).transform!=='none')return false;return Math.abs(r.width-e.offsetWidth)<=1 && Math.abs(r.height-e.offsetHeight)<=1})})()`), `${id}: natural samples retain their rendered dimensions`);
        await evaluate(`${q('[data-matrix-scroll]')}.scrollTop=200`);
        await wait(`(()=>{const s=${q('[data-matrix-scroll]')}.getBoundingClientRect(),t=${q('[data-matrix-toolbar]')}.getBoundingClientRect();return Math.abs(t.top-s.top)<=3 && t.bottom<s.bottom})()`);
        assert.ok(await evaluate(`(()=>{const s=${q('[data-matrix-scroll]')}.getBoundingClientRect();return [...document.querySelectorAll('[data-matrix-toolbar] select')].every(e=>{const r=e.getBoundingClientRect();return e.checkVisibility() && r.width>0 && r.left>=s.left && r.right<=s.right && r.bottom<=s.bottom})})()`), `${id}: sticky filters remain visible and fit the narrow pane`);
        assert.equal(await evaluate(`!!${q('[data-canvas], [aria-label="Canvas zoom"], [class*="canvasHelp"]')}`), false);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
      }
    });
  });
} catch (error) {
  process.exitCode = 1;
  console.error(`FAIL: ${stage}\n${error.stack || error}`);
} finally {
  console.log(`RESULT: ${passes} playground browser checks passed; ${process.exitCode ? 'FAILED (no skips)' : 'PASS'}. No build or generator run.`);
}
