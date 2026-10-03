#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createPageSourceFiles } from "./page-source-files.mjs";
import { createPageBundle } from "../app/studio/page-document/bundle.ts";
import { defaultSystem } from "../app/studio/tokens.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const keep = process.argv.slice(2).includes("--keep");
const browser = process.argv.slice(2).includes("--browser");
assert.ok(process.argv.slice(2).every((arg) => ["--keep", "--browser"].includes(arg)), "Only --keep and --browser are supported");
let fixture;
try {
  const page = JSON.parse(await readFile(join(root, "app/studio/page-document/account-settings.json"), "utf8"));
  const files = await createPageSourceFiles(createPageBundle(page, defaultSystem));
  const sample = JSON.parse(await readFile(join(root, "app/studio/page-document/design-safe.json"), "utf8"));
  const sampleFiles = await createPageSourceFiles(createPageBundle(sample, defaultSystem));
  for (const [name, text] of sampleFiles) files.set(`design-safe/${name}`, text);
  const appearance = JSON.parse(await readFile(join(root, "app/studio/page-document/appearance-specimen.json"), "utf8"));
  const appearanceFiles = await createPageSourceFiles(createPageBundle(appearance, defaultSystem));
  for (const [name, text] of appearanceFiles) files.set(`appearance/${name}`, text);
  const autoLayout = JSON.parse(await readFile(join(root, "app/studio/page-document/container-auto-layout.json"), "utf8"));
  const autoLayoutFiles = await createPageSourceFiles(createPageBundle(autoLayout, defaultSystem));
  for (const [name, text] of autoLayoutFiles) files.set(`auto-layout/${name}`, text);
  await mkdir(join(root, ".next"), { recursive: true });
  fixture = await mkdtemp(join(root, ".next/page-source-"));
  const ui = join(fixture, "ui");
  for (const [name, text] of files) {
    const target = join(ui, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
  await symlink(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
  await writeFile(join(fixture, "package.json"), '{"private":true,"type":"module"}\n');
  const declarations = join(fixture, "types.d.ts");
  await writeFile(declarations, 'declare module "*.module.css" { const classes: Record<string, string>; export default classes; }\n');
  const program = ts.createProgram([...files.keys()].filter((name) => /\.tsx?$/.test(name)).map((name) => join(ui, name)).concat(declarations), {
    strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2017,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, types: ["react", "react-dom"],
  });
  const errors = ts.getPreEmitDiagnostics(program).map((error) => `${error.file?.fileName ?? "config"}: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`);
  assert.deepEqual(errors, [], "Standalone React source type-check failed");
  console.log("PASS: exported sources type-check as React without Studio or Next.js imports.");
  await mkdir(join(fixture, "app"));
  await writeFile(join(fixture, "app/page.tsx"), 'import Page from "../ui/Page";\nexport default function Example() { return <Page />; }\n');
  await mkdir(join(fixture, "app/dark"));
  await writeFile(join(fixture, "app/dark/page.tsx"), 'import Page from "../../ui/Page";\nexport default function Example() { return <Page mode="dark" />; }\n');
  await mkdir(join(fixture, "app/design-safe"));
  await writeFile(join(fixture, "app/design-safe/page.tsx"), 'import Page from "../../ui/design-safe/Page";\nexport default function Example() { return <Page />; }\n');
  await mkdir(join(fixture, "app/appearance"));
  await writeFile(join(fixture, "app/appearance/page.tsx"), 'import Page from "../../ui/appearance/Page";\nexport default function Example() { return <Page />; }\n');
  await mkdir(join(fixture, "app/appearance-dark"));
  await writeFile(join(fixture, "app/appearance-dark/page.tsx"), 'import Page from "../../ui/appearance/Page";\nexport default function Example() { return <Page mode="dark" />; }\n');
  await mkdir(join(fixture, "app/auto-layout"));
  await writeFile(join(fixture, "app/auto-layout/page.tsx"), 'import Page from "../../ui/auto-layout/Page";\nexport default function Example() { return <Page />; }\n');
  if (browser) {
    await mkdir(join(fixture, "app/examples/account-settings"), { recursive: true });
    await writeFile(join(fixture, "app/examples/account-settings/page.tsx"), 'import Page from "../../../ui/Page";\nexport default function Example() { return <Page />; }\n');
  }
  if (browser) await writeFile(join(fixture, "app/hydration-probe.tsx"), '"use client";\nimport { useEffect, useRef } from "react";\nexport default function HydrationProbe() { const ref = useRef<HTMLSpanElement>(null); useEffect(() => { ref.current?.setAttribute("data-hydrated", "true"); }, []); return <span ref={ref} hidden className="consumer-hydration-marker" data-hydrated="false" />; }\n');
  await writeFile(join(fixture, "app/layout.tsx"), `${browser ? 'import HydrationProbe from "./hydration-probe";\n' : ''}export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="tr"><body style={{ margin: 0 }}><div style={{ isolation: "isolate" }}>{children}${browser ? '<HydrationProbe />' : ''}</div></body></html>; }\n`);
  await writeFile(join(fixture, "next.config.mjs"), 'export default { output: "export" };\n');
  console.log(`Building copied-source Next consumer: ${relative(root, fixture)}`);
  const child = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "build"], {
    cwd: fixture, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit", timeout: 180_000,
  });
  const code = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => signal ? reject(new Error(`Consumer build terminated by ${signal}`)) : done(code));
  });
  assert.equal(code, 0, "Copied-source Next consumer build failed");
  const html = await readFile(join(fixture, "out/index.html"), "utf8");
  assert.match(html, /Hesap ayarları/);
  assert.match(html, /type="email"/);
  assert.match(html, /role="switch"/);
  assert.match(html, /data-ds-theme="light"/);
  const sampleHTML = await readFile(join(fixture, "out/design-safe.html"), "utf8");
  assert.match(sampleHTML, /data-max-width="full"/);
  assert.match(sampleHTML, /data-page-node="design-checkbox"/);
  assert.match(sampleHTML, /data-indeterminate/);
  assert.match(sampleHTML, /data-page-node="design-badge"/);
  for (const route of ["appearance", "appearance-dark"]) {
    const localHTML = await readFile(join(fixture, `out/${route}.html`), "utf8");
    assert.match(localHTML, /Independent card slots/);
    assert.match(localHTML, /padding-left:23px/);
    assert.match(localHTML, /font-weight:650/);
    assert.match(localHTML, /data-error-icon="warning"/);
    assert.match(localHTML, /data-error-icon="info"/);
    assert.match(localHTML, /box-shadow:var\(--ds-shadow-md\)/);
    assert.match(localHTML, /aria-invalid="true"/);
    for (const kind of ["input", "switch", "checkbox"]) {
      assert.match(localHTML, new RegExp(`data-page-owner="appearance-${kind}"`));
      assert.match(localHTML, new RegExp(`data-page-node="appearance-${kind}"`));
    }
    for (const part of ["root", "label", "control", "description", "error", "row"]) assert.match(localHTML, new RegExp(`data-appearance-part="${part}"`));
  }
  const autoLayoutHTML = await readFile(join(fixture, "out/auto-layout.html"), "utf8");
  const autoLayoutRoot = [...autoLayoutHTML.matchAll(/<div[^>]*>/g)].map(([tag]) => tag).find((tag) => tag.includes('data-page-node="auto-layout-root"'));
  assert.ok(autoLayoutRoot, "Missing auto-layout Container root");
  for (const [key, value] of Object.entries({ "max-width": "full", direction: "row", gap: "lg", align: "center", justify: "between", wrap: "true" })) assert.ok(autoLayoutRoot.includes(`data-${key}="${value}"`), `Missing Container ${key}`);
  assert.match(autoLayoutRoot, /gap:22.5px/);
  assert.match(autoLayoutHTML, /Direct children use the frame layout without an inner Stack/);
  const dark = await readFile(join(fixture, "out/dark.html"), "utf8");
  assert.match(dark, /data-ds-theme="dark"/);
  assert.match(dark, /Hesap ayarları/);
  assert.match(dark, /role="switch"/);
  const cssUrls = [...html.matchAll(/href="([^" ]+\.css)"/g)].map((match) => match[1]);
  assert.ok(cssUrls.length, "No stylesheet shipped");
  const css = (await Promise.all(cssUrls.map((url) => readFile(join(fixture, "out", url.replace(/^\//, "")), "utf8")))).join("\n");
  for (const variable of ["--ds-spacing-sm", "--ds-spacing-md", "--ds-spacing-lg", "--button-variant-primary-background"]) assert.ok(css.includes(variable), `Missing exported token ${variable}`);
  assert.match(css, /grid-template-columns/);
  assert.match(css, /@container/);
  console.log("PASS: copied page, component/layout CSS and theme variables build and prerender outside Studio.");
  if (browser) {
    const { checkPageSourceBrowser } = await import("./page-source-browser.mjs");
    await checkPageSourceBrowser({ outDir: join(fixture, "out"), expectedThemes: {
      light: defaultSystem.themes.light.global,
      dark: defaultSystem.themes.dark.global,
    } });
  }
  console.log(`Scope: dependencies reuse the installed node_modules; this is not a fresh npm install or visual/accessibility acceptance.${browser ? ' Browser checks cover only the listed fixture behaviors.' : ' Use --browser for hydration and browser behavior checks.'}`);
  if (keep) console.log(`Kept source and consumer fixture: ${relative(root, fixture)} (ui/ contains the source deliverable).`);
} catch (error) {
  console.error("FAIL: page source consumer check:", error);
  process.exitCode = 1;
} finally {
  if (fixture && !keep) await rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
