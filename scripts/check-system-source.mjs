import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createSourceCatalog } from "./generate-source-catalog.mjs";
import { createSystemSourceFiles } from "../app/studio/source-delivery.ts";
import { defaultSystem, componentIds, resolveComponent } from "../app/studio/tokens.ts";
import { withSourceBrowser } from "./source-browser-session.mjs";

assert.ok(process.argv.slice(2).every((arg) => arg === "--browser"), "Only --browser is supported");
const root = fileURLToPath(new URL("../", import.meta.url));
let fixture;
try {
  const catalog = await createSourceCatalog(), second = structuredClone(defaultSystem);
  second.name = "Independent system";
  second.themes.light.global.background = "#f1e9ff"; second.themes.light.global.primary = "#2367ab";
  second.themes.light.componentRecipes = { text: { "paragraph.neutral.md": { root: { fontSize: 23.375 } } } };
  const first = structuredClone(defaultSystem);
  first.themes.light.componentRecipes = { text: { "paragraph.neutral.md": { root: { color: "#123456" } } } };
  const packs = { system: await createSystemSourceFiles(first, componentIds, catalog), independent: await createSystemSourceFiles(second, componentIds, catalog), minimal: await createSystemSourceFiles(defaultSystem, ["text"], catalog) };
  await mkdir(join(root, ".next"), { recursive: true }); fixture = await mkdtemp(join(root, ".next/system-source-"));
  const sources = [];
  for (const [name, files] of Object.entries(packs)) for (const [path, content] of files) {
    if (path === "css-modules.d.ts") continue; // Host already supplies one ambient declaration.
    const target = join(fixture, name, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content);
    if (/\.tsx?$/.test(path)) sources.push(target);
  }
  await symlink(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
  await writeFile(join(fixture, "package.json"), '{"private":true,"type":"module"}\n');
  const declarations = join(fixture, "types.d.ts"); await writeFile(declarations, 'declare module "*.module.css" { const classes: Record<string,string>; export default classes; }\n');
  const program = ts.createProgram([...sources, declarations], { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, types: ["react", "react-dom"] });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map((error) => `${error.file?.fileName}: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`), []);
  console.log("PASS: System ZIP sources type-check in a standalone React host; all-seven, independent system and minimal Text.");
  await mkdir(join(fixture, "app"));
  await writeFile(join(fixture, "app/probe.tsx"), '"use client";\nimport { useEffect } from "react";\nexport default function Probe(){useEffect(()=>{document.documentElement.dataset.hydrated="true"},[]);return null}\n');
  await writeFile(join(fixture, "app/layout.tsx"), 'import Probe from "./probe";\nexport default function Layout({children}:{children:React.ReactNode}){return <html><body style={{margin:0,background:"rgb(17, 34, 51)",color:"rgb(240, 230, 220)"}}><div style={{isolation:"isolate"}}>{children}<Probe /></div></body></html>}\n');
  await writeFile(join(fixture, "app/page.tsx"), `import "../system/styles.css";
import "../independent/styles.css";
import Example from "../system/Example";
import OtherExample from "../independent/Example";
import { ThemeScope } from "../system/ThemeScope";
import { Text, Button, Input, Switch, Checkbox } from "../system/ui";
export default function Page(){return <>
<div id="first"><Example /></div><div id="second"><OtherExample /></div>
<div id="dark"><Example mode="dark" /></div>
<div id="nested"><ThemeScope mode="light"><Text>Outer</Text><ThemeScope mode="dark"><Text>Inner</Text><Input label="Read only" readOnly defaultValue="fixed" /><Input label="Invalid" error="Fix this" errorIcon="warning" /><Button disabled>Disabled</Button><Button loading>Loading</Button></ThemeScope></ThemeScope></div>
<div id="interactive"><ThemeScope><Switch label="Switch" defaultChecked={false} /><Checkbox label="Checkbox" defaultChecked={false} /></ThemeScope></div>
</>}
`);
  await writeFile(join(fixture, "next.config.mjs"), 'export default {output:"export"};\n');
  const build = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "build"], { cwd: fixture, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit", timeout: 180_000 });
  await new Promise((done, reject) => { build.once("error", reject); build.once("exit", (code, signal) => code === 0 && !signal ? done() : reject(new Error(`System consumer build failed: ${code}/${signal}`))); });
  const html = await readFile(join(fixture, "out/index.html"), "utf8");
  assert.match(html, /data-bambiui-system="bambiui-[a-f0-9]{64}"/); assert.match(html, /Project overview/);
  console.log("PASS: generated System sources build and prerender in a separate Next consumer.");
  if (process.argv.includes("--browser")) await withSourceBrowser({ outDir: join(fixture, "out") }, async ({ send, evaluate, wait, click, origin }) => {
    await send("Page.navigate", { url: origin }); await wait('document.documentElement.dataset.hydrated === "true"');
    const color = async (selector, field) => evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).${field}`);
    const cssColor = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    assert.equal(await color("body", "backgroundColor"), "rgb(17, 34, 51)");
    assert.equal(await color("body", "color"), "rgb(240, 230, 220)");
    assert.equal(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--ds-background")'), "");
    assert.equal(await color('#first [data-bambiui-system]', "backgroundColor"), cssColor(first.themes.light.global.background));
    assert.equal(await color('#second [data-bambiui-system]', "backgroundColor"), cssColor(second.themes.light.global.background));
    assert.equal(await color('#dark [data-bambiui-system]', "backgroundColor"), cssColor(first.themes.dark.global.background));
    assert.equal(await color('#first [data-ds-component="text"]', "color"), "rgb(18, 52, 86)");
    assert.equal(await color('#first [data-ds-component="button"]', "fontSize"), `${resolveComponent(first.themes.light, "button").fontSize}px`);
    assert.equal(await color('#second [data-ds-component="text"]', "fontSize"), "23.375px");
    assert.equal(await color('#nested [data-ds-theme="dark"] [data-ds-component="text"]', "color"), cssColor(first.themes.dark.global.foreground));
    assert.equal(await evaluate('document.querySelector("#nested input[readonly]").readOnly'), true);
    assert.ok(await evaluate('!!document.querySelector("#nested [aria-invalid=true]")'));
    assert.ok(await evaluate('!!document.querySelector("#nested [data-error-icon=warning]")'));
    assert.ok(await evaluate('!!document.querySelector("#nested button[disabled]")'));
    assert.ok(await evaluate('!!document.querySelector("#nested button[aria-busy=true]")'));
    await click('#interactive [role="switch"]'); await wait('document.querySelector("#interactive [role=switch]").getAttribute("aria-checked") === "true"');
    await click('#interactive [role="checkbox"]'); await wait('document.querySelector("#interactive [role=checkbox]").getAttribute("aria-checked") === "true"');
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
    await wait('document.activeElement.matches("#interactive [role=switch]")');
    assert.equal(await evaluate('document.activeElement.matches(":focus-visible")'), true);
    assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), "solid");
    assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineWidth === getComputedStyle(document.activeElement).getPropertyValue("--ds-focus-ring-width").trim()'), true);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await wait('document.querySelector("#interactive [role=switch]").getAttribute("aria-checked") === "false"');
    for (const width of [1440, 768, 390]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      assert.equal(await color('#first > [data-bambiui-system]', "paddingLeft"), "0px");
      assert.equal(await color('#first > [data-bambiui-system]', "minHeight"), "0px");
      assert.equal(await evaluate('document.querySelector("#first > [data-bambiui-system]").getBoundingClientRect().width'), width);
    }
    console.log("PASS: System source hydration, host/two-system/nested-theme isolation, exact fractions, native states/choices and uncapped 1440/768/390 scope geometry.");
  });
  console.log("Scope: installed node_modules are reused. Clean installation, full visual parity and manual accessibility remain D04 acceptance.");
} catch (error) { console.error("FAIL: System source consumer", error); process.exitCode = 1; }
finally { if (fixture) await rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
