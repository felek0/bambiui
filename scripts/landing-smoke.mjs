#!/usr/bin/env node
// Run after the production build. Uses a disposable Chromium profile and never builds/publishes.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { withSourceBrowser } from "./source-browser-session.mjs";
import { exportCSS, parseDesignSystem } from "../app/studio/tokens.ts";
import { SUBMISSIONS_KEY } from "../app/(landing)/_landing/roadmap-data.ts";

assert.ok(process.argv.slice(2).every(arg => arg === "--screenshots"), "Use --screenshots for visual review captures");
const root = fileURLToPath(new URL("../", import.meta.url));
const captures = join(root, ".next/landing-review");
await mkdir(join(root, ".next"), { recursive: true });
const downloads = await mkdtemp(join(root, ".next/landing-download-"));
if (process.argv.includes("--screenshots")) await mkdir(captures, { recursive: true });
const q = selector => `document.querySelector(${JSON.stringify(selector)})`;
const palette = '[aria-label="Generated palette"]';
const dialog = "[data-roadmap-dialog]";
const specimen = '#tokens [data-ds-component="button"][data-component-part="root"]';
let passes = 0;

try {
  await withSourceBrowser({ outDir: join(root, "out"), downloads }, async ({ send, evaluate, wait, click, origin, waitForDownload }) => {
    const frame = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    async function check(name, task) { await task(); console.log(`PASS: ${name}`); passes++; }
    async function key(key, modifiers = 0) {
      const windowsVirtualKeyCode = { Tab: 9, Escape: 27, ArrowRight: 39, Enter: 13 }[key];
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode, modifiers });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode, modifiers });
    }
    async function setValue(selector, value) {
      await evaluate(`(()=>{const e=${q(selector)},prototype=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await frame();
    }
    async function clickText(selector, text) {
      const target = await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing control');e.dataset.landingSmokeTarget='';return '[data-landing-smoke-target]'})()`);
      try { await click(target); } finally { await evaluate(`${q(target)}?.removeAttribute('data-landing-smoke-target')`); }
    }
    async function viewport(width, mobile = width < 500, height = 900) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await frame();
    }
    async function ready() {
      await wait(`${q('#roadmap')} && ${q('main dl dd')}?.textContent.endsWith('px')`);
      await evaluate("document.fonts.ready");
      await frame();
    }
    async function reload() {
      const time = await evaluate("performance.timeOrigin");
      await send("Page.reload");
      await wait(`performance.timeOrigin!==${time}`);
      await ready();
    }
    async function assertWidth(label) {
      // Mobile innerWidth can inflate to the overflowing content width. It is NOT the viewport oracle.
      const dimensions = await evaluate(`(()=>{const d=document.documentElement,b=document.body,p=${q('main')}.parentElement;return {client:d.clientWidth,scroll:d.scrollWidth,body:b.scrollWidth,inner:innerWidth,visual:visualViewport.width,masked:[d,b,${q('.root')},p].some(e=>['hidden','clip'].includes(getComputedStyle(e).overflowX))}})()`);
      assert.ok(dimensions.scroll <= dimensions.client && dimensions.body <= dimensions.client, `${label}: ${JSON.stringify(dimensions)}`);
      assert.equal(dimensions.masked, false, `${label}: document overflow must not be hidden`);
      assert.ok(Math.abs(dimensions.visual - dimensions.client) <= 1, `${label}: visual viewport must match layout width at 1×`);
    }
    async function capture(name, selector) {
      if (!process.argv.includes("--screenshots")) return;
      if (selector) await evaluate(`${q(selector)}.scrollIntoView({block:'start',behavior:'instant'})`);
      else await evaluate("window.scrollTo(0,0)");
      await frame();
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(join(captures, `${name}.png`), Buffer.from(data, "base64"));
    }
    async function openDialog(label = "Suggest a feature") {
      await clickText("#roadmap button", label);
      await wait(`${q(dialog)}?.hasAttribute('data-open') && document.activeElement===${q(dialog+' input')}`);
      await wait(`getComputedStyle(${q(dialog)}).opacity==='1'`);
    }
    async function closeDialog(method, label) {
      if (method === "Escape") await key("Escape");
      else await clickText(`${dialog} button`, method);
      await wait(`!${q(dialog)}`);
      await wait(`document.activeElement?.textContent===${JSON.stringify(label)}`);
    }

    await send("Page.navigate", { url: `${origin}/` });
    await ready();
    const storageBefore = await evaluate("JSON.stringify({...localStorage})");
    await check("landing routes, local fonts, palette semantics and no hidden Studio", async () => {
      assert.equal(await evaluate(`${q('h1')}.textContent`), "Design your system on the components you ship.");
      assert.equal(await evaluate("document.querySelectorAll('.studio-shell').length"), 0);
      for (const id of ["color", "tokens", "export", "cli", "roadmap"]) assert.ok(await evaluate(`!!${q('#'+id+' h2')}`));
      assert.equal(await evaluate(`${q('header a[href="/colors"]')}.textContent`), "Open Studio");
      assert.equal(await evaluate("document.querySelectorAll('#color tbody tr').length"), 7);
      assert.equal(await evaluate("document.querySelectorAll('#color tbody td').length"), 77);
      assert.ok(await evaluate(`[...document.querySelectorAll('#color tbody td')].every(e=>/^#[a-f0-9]{6}$/i.test(e.textContent))`));
      assert.deepEqual(await evaluate("performance.getEntriesByType('resource').filter(e=>new URL(e.name).origin!==location.origin).map(e=>e.name)"), []);
    });

    for (const width of [320, 360, 375, 390, 430, 640, 641, 700, 768, 800, 900, 1040, 1041, 1280, 1440, 1920]) {
      await check(`${width}px: no document overflow; hero values and redlines follow real DOM`, async () => {
        await viewport(width);
        await assertWidth(`${width}px`);
        const measurement = await evaluate(`(()=>{const p=${q('[data-spec-probe] button')},v=${q('[data-spec-view] button')},c=v.closest('[class*="specCanvas"]'),r=v.getBoundingClientRect(),line=c.querySelector('[class*="markV"]'),s=getComputedStyle(p),t=getComputedStyle(p.querySelector('[data-component-part="text"]'));return {displayed:[...document.querySelectorAll('main dl dd')].map(e=>parseFloat(e.textContent)),actual:[parseFloat(s.borderTopLeftRadius),parseFloat(s.paddingLeft),p.getBoundingClientRect().height,parseFloat(t.fontSize)],redline:line.getBoundingClientRect().height,height:r.height,topDelta:line.getBoundingClientRect().top-r.top,zoom:getComputedStyle(v.parentElement).zoom,hidden:p.closest('[data-spec-probe]').getAttribute('aria-hidden'),inert:c.inert}})()`);
        assert.deepEqual(measurement.displayed, measurement.actual.map(n => Math.round(n * 100) / 100));
        assert.ok(Math.abs(measurement.redline - measurement.height) < 0.1 && Math.abs(measurement.topDelta) < 0.1);
        assert.equal(measurement.zoom, "1.75");
        assert.equal(measurement.hidden, "true");
        assert.equal(measurement.inert, true);
        if (width > 1040) assert.ok(await evaluate(`Math.abs(${q('#color tbody td')}.getBoundingClientRect().left-${q('#color h2')}.getBoundingClientRect().left)<2`), "palette starts on the section heading column");
        if (width <= 1040) assert.ok(await evaluate(`(()=>{const panel=${q('[aria-label="Design tokens"]')},controls=[...panel.children].map(e=>e.getBoundingClientRect()),last=controls.at(-1),before=controls.at(-2);return Math.abs(last.right-panel.getBoundingClientRect().right)<1 && ${width <= 640 ? 'last.width>before.width*1.9' : 'Math.abs(last.top-before.top)<1 && last.width>controls[0].width*1.4'}})()`), "responsive token controls fill each row without an empty decorative cell");
        if ([390, 900, 1440].includes(width)) {
          await capture(`landing-${width}-hero`);
          for (const section of ["color", "tokens", "export", "cli", "roadmap"]) await capture(`landing-${width}-${section}`, `#${section}`);
        }
      });
    }
    await check("390px palette scroll stays local, keeps row labels visible and reaches the last stop", async () => {
      await viewport(390);
      await evaluate(`${q(palette)}.scrollIntoView({block:'center'});${q(palette)}.focus()`);
      const left = await evaluate(`${q('#color tbody th')}.getBoundingClientRect().left`);
      await key("ArrowRight");
      await wait(`${q(palette)}.scrollLeft>0`);
      await evaluate(`${q(palette)}.scrollLeft=${q(palette)}.scrollWidth`);
      await frame();
      assert.ok(await evaluate(`Math.abs(${q('#color tbody th')}.getBoundingClientRect().left-${left})<1`));
      assert.ok(await evaluate(`${q('#color tbody tr td:last-child')}.getBoundingClientRect().right<=${q(palette)}.getBoundingClientRect().right+1`));
      await assertWidth("scrolled palette");
      await evaluate(`${q(palette)}.scrollLeft=0`);
    });
    await check("brand controls update real components; invalid hex leaves the last valid theme", async () => {
      await click('[aria-label="Use #2563eb"]');
      await wait(`getComputedStyle(${q('#color [data-ds-theme] button')}).backgroundColor==='rgb(38, 100, 236)'`);
      await setValue('[aria-label="Brand color hex"]', "#bad");
      assert.equal(await evaluate(`${q('[aria-label="Brand color hex"]')}.getAttribute('aria-invalid')`), "true");
      assert.equal(await evaluate(`getComputedStyle(${q('#color [data-ds-theme] button')}).backgroundColor`), "rgb(38, 100, 236)");
      await setValue('[aria-label="Brand color hex"]', "#2563eb");
    });
    await check("token extremes reflow at 320–1440px in Light/Dark with local fonts", async () => {
      for (const [label, value] of [["Radius", 24], ["Density", 28], ["Font size", 18]]) await setValue(`#tokens [aria-label="${label}"]`, value);
      for (const mode of ["Dark", "Light"]) {
        await clickText('#tokens [aria-label="Theme"] button', mode);
        for (const font of ["system", "serif", "mono"]) {
          await setValue('#tokens [aria-label="Font family"]', font);
          for (const width of [320, 390, 900, 1440]) { await viewport(width); await assertWidth(`${mode}/${font}/${width}`); }
        }
      }
      assert.equal(await evaluate(`getComputedStyle(${q(specimen)}).borderTopLeftRadius`), "24px");
      assert.equal(await evaluate(`getComputedStyle(${q(specimen)}).paddingLeft`), "28px");
      assert.equal(await evaluate(`getComputedStyle(${q(specimen)}).fontSize`), "18px");
      assert.ok(await evaluate(`${q('#export code')}.textContent.includes('--ds-radius-md: 24px;')`));
    });
    await check("dark specimens retain the component's accessible focus ring, not landing ink", async () => {
      await viewport(390);
      await clickText('#tokens [aria-label="Theme"] button', "Dark");
      await key("Tab");
      await evaluate(`${q(specimen)}.focus()`);
      const ring = await evaluate(`(()=>{const e=${q(specimen)},s=getComputedStyle(e),probe=document.createElement('span');probe.style.color='var(--ds-primary-focus)';e.parentElement.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return {visible:e.matches(':focus-visible'),color:s.outlineColor,width:s.outlineWidth,offset:s.outlineOffset,expected,expectedWidth:s.getPropertyValue('--ds-focus-ring-width').trim(),expectedOffset:s.getPropertyValue('--ds-focus-ring-offset').trim()}})()`);
      assert.equal(ring.visible, true);
      assert.equal(ring.color, ring.expected);
      assert.equal(ring.width, ring.expectedWidth);
      assert.equal(ring.offset, ring.expectedOffset);
      assert.notEqual(ring.color, "rgb(11, 11, 11)");
      await capture("landing-390-dark-tokens", "#tokens [data-ds-theme]");
    });
    await check("JSON and CSS downloads match the demo and both themes; CLI command is selectable and copyable", async () => {
      await clickText("#export button", "Download System JSON");
      let completed = await waitForDownload();
      assert.equal(completed.suggestedFilename, "bambiui-tokens.json");
      const system = parseDesignSystem(await readFile(join(downloads, completed.suggestedFilename), "utf8"));
      for (const mode of ["light", "dark"]) {
        assert.equal(system.themes[mode].global.radius, 24);
        assert.equal(system.themes[mode].global.paddingX, 28);
        assert.equal(system.themes[mode].global.fontSize, 18);
        assert.equal(system.themes[mode].fontFamily, "mono");
        assert.equal(system.themes[mode].source, "#2563eb");
      }
      await clickText("#export button", "Download CSS");
      completed = await waitForDownload();
      assert.equal(completed.suggestedFilename, "bambiui-tokens.css");
      assert.equal(await readFile(join(downloads, completed.suggestedFilename), "utf8"), exportCSS({ themes: system.themes }));
      for (const name of ["checkbox", "switch", "badge", "text"]) await clickText('#cli [aria-label="Components to add"] button', name);
      await viewport(390);
      await assertWidth("all CLI components selected");
      assert.ok(await evaluate(`${q('#cli')}.textContent.includes('add button card input checkbox switch badge text')`));
      await send("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
      await click("#cli li:nth-child(2) [class*='command'] button");
      await wait(`${q('#cli li:nth-child(2) [class*="command"] button')}.textContent==='Copied'`);
      assert.equal(await evaluate("navigator.clipboard.readText()"), await evaluate(`${q('#cli li:nth-child(2) code')}.textContent`));
      assert.equal(await evaluate("JSON.stringify({...localStorage})"), storageBefore, "demo interactions must not persist anything");
    });
    await check("mobile dialog: focus trap, Escape/Cancel return focus, validation and local-only save", async () => {
      await openDialog();
      await capture("landing-390-dialog", dialog);
      assert.match(await evaluate(`${q(dialog)}.textContent`), /saved in this browser only\. Nothing is sent to the team/);
      const bounds = await evaluate(`(()=>{const e=${q(dialog)},r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:e.clientWidth,scroll:e.scrollWidth}})()`);
      assert.ok(bounds.left >= 0 && bounds.right <= 390 && bounds.top >= 0 && bounds.bottom <= 900);
      assert.ok(bounds.scroll <= bounds.client, "dialog itself must not overflow horizontally");
      // Base UI's focus guard briefly receives focus before redirecting on the next frame.
      for (let i = 0; i < 12; i++) {
        await key("Tab");
        assert.ok(await evaluate(`${q(dialog)}.contains(document.activeElement) || document.activeElement.hasAttribute('data-base-ui-focus-guard')`));
        await wait(`${q(dialog)}.contains(document.activeElement)`);
      }
      await key("Tab", 8);
      await wait(`${q(dialog)}.contains(document.activeElement)`);
      await closeDialog("Escape", "Suggest a feature");
      await openDialog("Report a gap");
      assert.equal(await evaluate(`${q(dialog+' h2')}.textContent`), "Report a gap");
      await closeDialog("Cancel", "Report a gap");
      await openDialog();
      await click(`${dialog} button[type="submit"]`);
      await wait(`${q(dialog+' [role="alert"]')}.textContent==='Add a short title.'`);
      assert.equal(await evaluate(`${q(dialog+' input')}.getAttribute('aria-invalid')`), "true");
      await setValue(`${dialog} input`, "x".repeat(120));
      await setValue(`${dialog} textarea`, "https://example.test/" + "long-path".repeat(90));
      await click(`${dialog} button[type="submit"]`);
      await wait(`!${q(dialog)} && !!${q('[data-roadmap-item][data-local]')}`);
      await assertWidth("long local suggestion");
      const saved = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SUBMISSIONS_KEY)}))`);
      assert.equal(saved[0].title, "x".repeat(120));
      assert.equal(saved[0].column, "new");
      assert.equal(saved[0].local, true);
      assert.deepEqual(await evaluate(`Object.keys(localStorage).sort()`), [SUBMISSIONS_KEY]);
      await reload();
      await wait(`!!${q('[data-roadmap-item][data-local]')}`);
      await assertWidth("reloaded long suggestion");
    });
    await check("storage failure keeps the local item and reports failure, never a false removal", async () => {
      const raw = await evaluate(`localStorage.getItem(${JSON.stringify(SUBMISSIONS_KEY)})`);
      await evaluate(`window.landingOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===${JSON.stringify(SUBMISSIONS_KEY)})throw new DOMException('Quota exceeded','QuotaExceededError');return window.landingOriginalSet.call(this,key,value)}`);
      await click("[data-roadmap-item][data-local] button");
      await wait(`${q('#roadmap [role="alert"]')}.textContent.includes('Nothing was added or removed')`);
      assert.ok(await evaluate(`!!${q('[data-roadmap-item][data-local]')}`));
      assert.equal(await evaluate(`${q('#roadmap [role="status"]')}.textContent`), "");
      assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SUBMISSIONS_KEY)})`), raw);
      await evaluate("Storage.prototype.setItem=window.landingOriginalSet;delete window.landingOriginalSet");
      await click("[data-roadmap-item][data-local] button");
      await wait(`!${q('[data-roadmap-item][data-local]')}`);
    });
    await check("denied storage reads and malformed saved bytes do not crash or overwrite data", async () => {
      const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `const read=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key===${JSON.stringify(SUBMISSIONS_KEY)})throw new DOMException('Denied','SecurityError');return read.call(this,key)}` });
      await reload();
      await wait(`${q('#roadmap [role="alert"]')}.textContent.includes('could not be read')`);
      await openDialog();
      await setValue(`${dialog} input`, "Must not replace data");
      await click(`${dialog} button[type="submit"]`);
      await wait(`${q(dialog+' [role="alert"]')}.textContent.includes('Reload before making changes')`);
      await closeDialog("Cancel", "Suggest a feature");
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
      await evaluate(`localStorage.setItem(${JSON.stringify(SUBMISSIONS_KEY)},'{broken')`);
      await reload();
      await wait(`${q('#roadmap [role="alert"]')}.textContent.includes('could not be read')`);
      await openDialog();
      await setValue(`${dialog} input`, "Must not replace malformed bytes");
      await click(`${dialog} button[type="submit"]`);
      await wait(`${q(dialog+' [role="alert"]')}.textContent.includes('Reload before making changes')`);
      assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SUBMISSIONS_KEY)})`), "{broken");
      await closeDialog("Escape", "Suggest a feature");
      await evaluate(`localStorage.removeItem(${JSON.stringify(SUBMISSIONS_KEY)})`);
      await reload();
    });
    await check("short-screen/reduced-motion dialog remains scrollable and closes accessibly", async () => {
      await viewport(320, true, 480);
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await openDialog();
      assert.ok(await evaluate(`(()=>{const e=${q(dialog)},r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=480&&r.left>=0&&r.right<=320&&e.scrollWidth<=e.clientWidth&&e.scrollHeight>e.clientHeight&&getComputedStyle(e).transitionDuration==='0s'})()`));
      await closeDialog("Cancel", "Suggest a feature");
      await assertWidth("short screen after dialog close");
    });
    await check("Open Studio enters Colors, leaving Project suspended", async () => {
      await viewport(390);
      await click('header a[href="/colors"]');
      await wait(`location.pathname==='/colors' && !!${q('.studio-shell')} && ${q('h1')}?.textContent==='Colors'`);
      assert.equal(await evaluate(`!!${q('[aria-label="Page canvas"], #project-inspector')}`), false);
    });
  });
  console.log(`Landing smoke: ${passes}/${passes} checks passed. Native VoiceOver, browser zoom and real touch remain manual acceptance.`);
} catch (error) {
  console.error(`FAIL: landing smoke after ${passes} passed checks`, error);
  process.exitCode = 1;
} finally {
  await rm(downloads, { recursive: true, force: true });
}
