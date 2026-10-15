import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createRegistryRelease } from "./generate-registry.mjs";
import { defaultSystem } from "../app/studio/tokens.ts";
import { withSourceBrowser } from "./source-browser-session.mjs";
import cliManifest from "../packages/cli/package.json" with { type: "json" };

const arguments_ = process.argv.slice(2);
assert.ok(arguments_.every((arg) => ["--browser", "--published", "--clean-install"].includes(arg) || /^--published=\d+\.\d+\.\d+$/.test(arg)), "Use --browser, --clean-install, --published or --published=<version>");
const cleanInstall = arguments_.includes("--clean-install");
const publishedArgument = arguments_.find((arg) => arg === "--published" || arg.startsWith("--published="));
const published = publishedArgument !== undefined;
const publishedVersion = publishedArgument?.split("=")[1] ?? cliManifest.version;
assert.ok(!cleanInstall || published, "--clean-install requires --published or --published=<version>");
const root = fileURLToPath(new URL("../", import.meta.url));
let fixture, server;
async function command(executable, args, cwd, timeout = 30_000) {
  const child = spawn(executable, args, { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit", timeout });
  await new Promise((done, reject) => { child.once("error", reject); child.once("exit", (code, signal) => code === 0 && !signal ? done() : reject(new Error(`Consumer command failed: ${code}/${signal}`))); });
}
try {
  if (!cleanInstall) {
    const release = await createRegistryRelease();
    const registryFiles = new Map([["/registry/index.json", release.index], [`/registry/releases/${release.sha256}/registry.json`, release.text]]);
    server = createServer((req, res) => { const text = registryFiles.get(req.url); if (!text || req.method !== "GET") { res.writeHead(404).end(); return; } res.writeHead(200, { "Content-Type": "application/json" }).end(text); });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
  }
  if (cleanInstall) fixture = await mkdtemp(join(tmpdir(), "bambiui-clean-consumer-"));
  else { await mkdir(join(root, ".next"), { recursive: true }); fixture = await mkdtemp(join(root, ".next/cli-consumer-")); }
  const host = { private: true, type: "module", dependencies: { react: "19.2.8", "react-dom": "19.2.8" } };
  if (cleanInstall) host.devDependencies = { typescript: "5.9.3", "@types/react": "19.3.0", "@types/react-dom": "19.3.0", "@types/node": "20.19.43", vite: "7.3.7" };
  await writeFile(join(fixture, "package.json"), JSON.stringify(host));
  const cache = cleanInstall ? join(fixture, ".npm-cache") : join(root, ".next/npm-published-check");
  const install = (extra = []) => command("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--fetch-retries=0", "--fetch-timeout=60000", "--registry=https://registry.npmjs.org/", "--cache", cache, ...extra], fixture, 180_000);
  const cli = join(root, "packages/cli/bin/bambiui.mjs");
  const runCLI = (args) => published
    ? command("npm", ["exec", "--yes", "--ignore-scripts", "--registry=https://registry.npmjs.org/", "--cache", cache, `--package=bambiui@${publishedVersion}`, "--", "bambiui", ...args], fixture, 60_000)
    : command(process.execPath, [cli, ...args], fixture);
  console.log(`Checking ${published ? `published bambiui@${publishedVersion} from npm` : `local bambiui@${cliManifest.version} build`} against ${cleanInstall ? "production registry with isolated fresh dependencies" : "a temporary static registry"}.`);
  await runCLI(cleanInstall ? ["init", "--dir", "system"] : ["init", "--registry", `http://127.0.0.1:${server.address().port}/registry/index.json`, "--dir", "system"]);
  await runCLI(["add", "--all"]);
  await runCLI(["add", "layout"]);
  const system = structuredClone(defaultSystem);
  system.themes.light.componentRecipes = {
    card: { "outlined.md": { title: { fontSize: 19.375, fontWeight: 635, color: "#123456" }, root: { paddingLeft: 23.125, borderTopLeftRadius: 17.25 } } },
    input: { "invalid.md": { error: { fontSize: 12.625 } } },
  };
  system.themes.dark.componentRecipes = { card: { "outlined.md": { title: { color: "#aabbcc" } } } };
  await writeFile(join(fixture, "custom-system.json"), JSON.stringify(system));
  await runCLI(["theme", "--system", "custom-system.json"]);
  const state = JSON.parse(await readFile(join(fixture, "bambiui.json"), "utf8"));
  if (cleanInstall) {
    await install();
    assert.equal((await lstat(join(fixture, "node_modules"))).isSymbolicLink(), false);
    assert.equal(await realpath(join(fixture, "node_modules")), join(await realpath(fixture), "node_modules"));
    assert.ok(!Object.hasOwn(JSON.parse(await readFile(join(fixture, "package.json"), "utf8")).dependencies, "next"));
    console.log("PASS: isolated React host installed from npm without repository node_modules or Next.");
  } else await symlink(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
  const declaration = join(fixture, "types.d.ts");
  await writeFile(declaration, 'declare module "*.module.css" { const classes: Record<string,string>; export default classes; }\n');
  const sources = Object.keys(state.files).filter((path) => /\.tsx?$/.test(path)).map((path) => join(fixture, path));
  if (cleanInstall) {
    await writeFile(join(fixture, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, target: "ES2017", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", esModuleInterop: true, types: ["react", "react-dom"] }, files: [...sources, declaration] }));
    await command(process.execPath, [join(fixture, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.json"], fixture);
  } else {
    const program = ts.createProgram([...sources, declaration], { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, types: ["react", "react-dom"] });
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map((error) => `${error.file?.fileName}: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`), []);
  }
  console.log("PASS: real CLI init/add/theme output type-checks as standalone React sources.");
  await mkdir(join(fixture, "app/dark"), { recursive: true });
  await writeFile(join(fixture, "app/probe.tsx"), '"use client";\nimport {useEffect} from "react";\nexport default function Probe(){useEffect(()=>{document.documentElement.dataset.hydrated="true"},[]);return null}\n');
  await writeFile(join(fixture, "app/layout.tsx"), 'import "../system/styles.css";\nimport Probe from "./probe";\nexport default function Layout({children}:{children:React.ReactNode}){return <html><body style={{margin:0,background:"rgb(17, 34, 51)"}}><div style={{isolation:"isolate"}}>{children}<Probe /></div></body></html>}\n');
  await writeFile(join(fixture, "app/screen.tsx"), `import {ThemeScope} from "../system/ThemeScope";
import {Button,Card,Text,Badge,Input,Switch,Checkbox,Container,Stack} from "../system/ui";
export default function Screen({mode="light"}:{mode?:"light"|"dark"}){return <div id="consumer"><ThemeScope mode={mode}><Container maxWidth="full"><Stack>
<Card><Card.Header><Card.Title>CLI title</Card.Title><Card.Description>CLI description</Card.Description></Card.Header><Card.Content><Text>Installed sources</Text><Input label="Email" error="Fix this email" errorIcon="warning" errorPosition="above" /><Input label="Read only" defaultValue="fixed" readOnly /><Switch label="Notifications" defaultChecked={false}/><Checkbox label="Accept terms" defaultChecked={false}/></Card.Content><Card.Footer><Button>Continue</Button><Badge>New</Badge></Card.Footer></Card>
</Stack></Container></ThemeScope></div>}
`);
  await writeFile(join(fixture, "app/page.tsx"), 'import Screen from "./screen"; export default function Page(){return <Screen/>}\n');
  await writeFile(join(fixture, "app/dark/page.tsx"), 'import Screen from "../screen"; export default function Page(){return <Screen mode="dark"/>}\n');
  await writeFile(join(fixture, "next.config.mjs"), 'export default {output:"export"};\n');
  if (cleanInstall) {
    await writeFile(join(fixture, "main.tsx"), 'import {createRoot} from "react-dom/client";\nimport "./system/styles.css";\nimport Screen from "./app/screen";\nimport Probe from "./app/probe";\ndocument.body.style.cssText="margin:0;background:rgb(17,34,51)";\ncreateRoot(document.getElementById("root")!).render(<><Screen mode={location.pathname.startsWith("/dark")?"dark":"light"}/><Probe/></>);\n');
    for (const page of ["index.html", "dark.html"]) await writeFile(join(fixture, page), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
    await writeFile(join(fixture, "vite.config.mjs"), 'export default {esbuild:{jsx:"automatic"},build:{rollupOptions:{input:["index.html","dark.html"]}}};\n');
    await command(process.execPath, [join(fixture, "node_modules/vite/bin/vite.js"), "build"], fixture, 60_000);
    if (arguments_.includes("--browser")) await checkBrowser(join(fixture, "dist"));
    console.log("PASS: fresh standalone React/Vite production bundle (no Next dependency).");
    await install(["--save-exact", "next@16.3.6"]);
    await command("npm", ["ls", "--depth=0"], fixture);
    // Next must discover its own host files rather than the earlier source-only TS file list.
    await rm(join(fixture, "tsconfig.json"));
    await rm(join(fixture, "main.tsx"));
  }
  await command(process.execPath, [join(cleanInstall ? fixture : root, "node_modules/next/dist/bin/next"), "build"], fixture, 180_000);
  for (const path of ["index.html", "dark.html"]) {
    const html = await readFile(join(fixture, "out", path), "utf8");
    assert.match(html, /CLI title/); assert.match(html, /role="switch"/); assert.match(html, /data-bambiui-system="bambiui-[a-f0-9]{64}"/);
  }
  console.log("PASS: actual CLI-installed components/theme build and prerender in a separate Next host.");
  if (arguments_.includes("--browser")) await checkBrowser(join(fixture, "out"));
  console.log(cleanInstall ? "Scope: fresh npm dependencies and production registry; React/Vite and Next builds use only the isolated host. Manual accessibility, cross-browser and full visual acceptance remain open." : "Scope: installed node_modules are reused. This is not a clean dependency install, full visual parity or manual accessibility acceptance.");
} catch (error) { console.error("FAIL: CLI source consumer", error); process.exitCode = 1; }
finally { server?.closeAllConnections(); if (server) await new Promise((done) => server.close(done)); if (fixture) await rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }

async function checkBrowser(outDir) {
  await withSourceBrowser({ outDir }, async ({ send, evaluate, wait, click, origin }) => {
    for (const mode of ["light", "dark"]) {
      await send("Page.navigate", { url: `${origin}${mode === "dark" ? "/dark" : "/"}` });
      await wait('document.documentElement.dataset.hydrated === "true"');
      const css = (selector, field) => evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).${field}`);
      const title = '[data-ds-component="card"][data-component-part="title"]';
      assert.equal(await css("body", "backgroundColor"), "rgb(17, 34, 51)");
      assert.equal(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--ds-background")'), "");
      assert.equal(await css(title, "fontSize"), "19.375px"); assert.equal(await css(title, "fontWeight"), "635");
      assert.equal(await css(title, "color"), mode === "light" ? "rgb(18, 52, 86)" : "rgb(170, 187, 204)");
      assert.equal(await css('article[data-ds-component="card"]', "paddingLeft"), "23.125px");
      assert.equal(await css('article[data-ds-component="card"]', "borderTopLeftRadius"), "17.25px");
      assert.equal(await css('[data-ds-component="input"][data-component-part="error"]', "fontSize"), "12.625px");
      assert.equal(await evaluate('document.querySelector("input[readonly]").readOnly'), true);
      assert.ok(await evaluate('!!document.querySelector("[aria-invalid=true]")'));
      await click('[role="switch"]'); await wait('document.querySelector("[role=switch]").getAttribute("aria-checked") === "true"');
      await click('[role="checkbox"]'); await wait('document.querySelector("[role=checkbox]").getAttribute("aria-checked") === "true"');
      for (const width of [1440, 390]) {
        await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
        assert.equal(await css('#consumer > [data-bambiui-system]', "paddingLeft"), "0px");
      }
    }
    console.log("PASS: CLI-installed Light/Dark hydration, exact Card layer/edge and Input error styles, native switches/checkboxes, host isolation and 390px reflow.");
  });
}
