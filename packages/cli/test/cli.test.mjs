import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { checkRelease } from "../lib/check-release.mjs";
import { createRegistryRelease } from "../../../scripts/generate-registry.mjs";
import { defaultSystem } from "../../../app/studio/tokens.ts";
import { createThemeSourceFiles } from "../../../app/studio/source-theme.ts";
import { canonicalJSON } from "../../../app/studio/source-files.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const binary = join(root, "packages/cli/bin/bambiui.mjs");
let server, origin, base, release, mode = "normal";
const requests = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function child(command, args, cwd) {
  return new Promise((done, reject) => {
    const process = spawn(command, args, { cwd, timeout: 25_000, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    process.stdout.on("data", (bytes) => { stdout += bytes; }); process.stderr.on("data", (bytes) => { stderr += bytes; });
    process.once("error", reject); process.once("close", (code, signal) => done({ code, signal, stdout, stderr }));
  });
}
const run = (args, cwd, bin = binary) => child(process.execPath, [bin, ...args], cwd);
async function ok(args, cwd, bin) { const result = await run(args, cwd, bin); assert.equal(result.code, 0, result.stdout + result.stderr); return result; }
async function failed(args, cwd, pattern) { const result = await run(args, cwd); assert.notEqual(result.code, 0); assert.match(result.stderr, pattern); return result; }
async function host() {
  const directory = await mkdtemp(join(base, "host-"));
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module", dependencies: { react: "19.2.8", "react-dom": "19.2.8" } }, null, 2) + "\n");
  return directory;
}
const config = async (directory) => JSON.parse(await readFile(join(directory, "bambiui.json"), "utf8"));
const init = (directory, args = [], bin) => ok(["init", "--registry", `${origin}/registry/index.json`, ...args], directory, bin);
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function tree(directory) {
  const files = {};
  async function visit(path, prefix = "") {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (item.isDirectory()) await visit(join(path, item.name), `${name}/`);
      else if (item.isFile()) files[name] = await readFile(join(path, item.name), "utf8");
    }
  }
  await visit(directory); return files;
}
before(async () => {
  await mkdir(join(root, ".next"), { recursive: true }); base = await mkdtemp(join(root, ".next/cli-test-"));
  release = await createRegistryRelease();
  server = createServer(async (req, res) => {
    requests.push({ path: req.url, method: req.method });
    if (mode === "offline") { res.writeHead(503).end(); return; }
    let text = release.text;
    if (mode === "runtime") { const value = JSON.parse(text); value.themeRuntimeSha256 = "a".repeat(64); text = canonicalJSON(value); }
    if (mode === "license") { const value = JSON.parse(text); value.license.spdx = "GPL-3.0"; text = canonicalJSON(value); }
    if (mode === "source") { const value = JSON.parse(text); value.catalog.sources["components/text.tsx"].content += "\n"; text = canonicalJSON(value); }
    const sha = hash(text);
    if (req.url === "/registry/index.json") {
      if (mode === "path") { const value = JSON.parse(release.index); value.release.path = "../escape.json"; res.end(JSON.stringify(value)); return; }
      res.setHeader("Content-Type", "application/json");
      res.end(canonicalJSON({ format: "bambiui.registry-index", version: 1, release: { path: `releases/${sha}/registry.json`, sha256: sha, bytes: Buffer.byteLength(text) }, warnings: [] })); return;
    }
    if (/^\/registry\/releases\/[a-f0-9]{64}\/registry.json$/.test(req.url)) {
      if (mode === "redirect") { res.writeHead(302, { Location: "/registry/index.json" }).end(); return; }
      if (mode === "corrupt") text = text.replace("bambiui.registry", "bambiui.registrY");
      if (mode === "oversize") text = "x".repeat(8 * 1024 * 1024 + 1);
      res.setHeader("Content-Type", "application/json"); res.end(text); return;
    }
    res.writeHead(404).end();
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done)); origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

test("CLI help/version and strict arguments do not mutate a project", async () => {
  const directory = await host(), before = await tree(directory);
  assert.match((await ok(["--help"], directory)).stdout, /theme --system/);
  assert.equal((await ok(["--version"], directory)).stdout.trim(), "0.2.0");
  await failed(["wat"], directory, /Unknown command/);
  await failed(["init", "--typo"], directory, /Unknown option/);
  await failed(["init"], directory, /No public default registry/);
  await failed(["add", "text", "text"], directory, /unique components/);
  assert.deepEqual(await tree(directory), before);
});

test("init creates scoped foundation/config only, never installs components or modifies the host entry", async () => {
  const directory = await host(), packageBefore = await readFile(join(directory, "package.json"), "utf8");
  await writeFile(join(directory, "entry.tsx"), "// host entry\n");
  await init(directory);
  const state = await config(directory);
  assert.equal(state.directory, "components/bambiui"); assert.deepEqual(state.components, []);
  assert.ok(state.registry.url.endsWith(`/releases/${release.sha256}/registry.json`));
  assert.equal(state.registry.sha256, release.sha256);
  assert.equal(await exists(join(directory, state.directory, "ui")), false);
  assert.equal(await readFile(join(directory, "package.json"), "utf8"), packageBefore);
  assert.equal(await readFile(join(directory, "entry.tsx"), "utf8"), "// host entry\n");
  const css = await readFile(join(directory, state.directory, "theme.css"), "utf8");
  assert.doesNotMatch(css, /:root|\bbody\b/); assert.match(css, /data-ds-theme="dark"/);
  assert.match(await readFile(join(directory, state.directory, "README.md"), "utf8"), /MIT licensed/);
  assert.equal(await readFile(join(directory, state.directory, "LICENSE"), "utf8"), await readFile(join(root, "packages/cli/LICENSE"), "utf8"));
  assert.match(await readFile(join(directory, state.directory, "NOTICE.md"), "utf8"), /not assigned a license/);
  assert.equal(await exists(join(directory, ".bambiui.lock")), false);
});

test("Card installs only its actual graph, Text has no Base UI and Button adds the missing runtime declaration", async () => {
  const directory = await host(); await init(directory);
  await ok(["add", "card"], directory);
  let state = await config(directory), files = await tree(directory);
  assert.ok(files[`${state.directory}/ui/components/card.tsx`]);
  for (const id of ["button", "text", "input", "checkbox"]) assert.equal(files[`${state.directory}/ui/components/${id}.tsx`], undefined);
  assert.equal(JSON.parse(files["package.json"]).dependencies["@base-ui/react"], undefined);
  await ok(["add", "text"], directory);
  files = await tree(directory); assert.equal(JSON.parse(files["package.json"]).dependencies["@base-ui/react"], undefined);
  await ok(["add", "button"], directory);
  state = await config(directory); files = await tree(directory);
  assert.deepEqual(state.components, ["button", "card", "text"]);
  assert.equal(JSON.parse(files["package.json"]).dependencies["@base-ui/react"], "1.8.0");
  assert.equal(files[`${state.directory}/ui/components/button.tsx`], await readFile(join(root, "app/studio/components/button.tsx"), "utf8"));
  assert.match(files[`${state.directory}/ui/index.ts`], /export \{ Button \}/);
  assert.equal(await exists(join(directory, "node_modules")), false);
});

test("Repeated add is idempotent, preserves timestamps and does not follow a floating index", async () => {
  const directory = await host(); await init(directory); await ok(["add", "button"], directory);
  const before = await tree(directory), time = (await stat(join(directory, "bambiui.json"))).mtimeMs, requestStart = requests.length;
  const result = await ok(["add", "button"], directory);
  assert.match(result.stdout, /Wrote 0 file/); assert.deepEqual(await tree(directory), before);
  assert.equal((await stat(join(directory, "bambiui.json"))).mtimeMs, time);
  assert.ok(requests.slice(requestStart).every((req) => req.method === "GET" && req.path === `/registry/releases/${release.sha256}/registry.json`));
});

test("Edited targets fail the entire plan; explicit overwrite restores only planned files", async () => {
  const directory = await host(); await init(directory); await ok(["add", "button"], directory);
  const state = await config(directory), path = join(directory, state.directory, "ui/components/button.tsx");
  await writeFile(path, "// my custom button\n"); const before = await tree(directory);
  await failed(["add", "button", "input"], directory, /Local file conflict/);
  assert.deepEqual(await tree(directory), before);
  await ok(["add", "text"], directory); assert.equal(await readFile(path, "utf8"), "// my custom button\n");
  await ok(["add", "button", "--overwrite"], directory);
  assert.equal(await readFile(path, "utf8"), await readFile(join(root, "app/studio/components/button.tsx"), "utf8"));
});

test("Dry-run init/add validates without creating any files or changing hashes", async () => {
  const directory = await host(), before = await tree(directory);
  const result = await init(directory, ["--dry-run"]); assert.match(result.stdout, /Dry run/);
  assert.deepEqual(await tree(directory), before);
  await init(directory); const initialized = await tree(directory);
  await ok(["add", "--all", "--dry-run"], directory); assert.deepEqual(await tree(directory), initialized);
});

test("Custom System input uses Studio normalization, exact recipe fractions and no upload", async () => {
  const directory = await host(), system = structuredClone(defaultSystem);
  system.name = "Private CLI system";
  system.themes.light.componentRecipes = { card: { "outlined.md": { title: { fontSize: 19.375, fontWeight: 635, color: "#123456" } } } };
  system.themes.dark.componentRecipes = { card: { "outlined.md": { title: { color: "#aabbcc" } } } };
  await writeFile(join(directory, "my-system.json"), JSON.stringify(system));
  const start = requests.length; await init(directory, ["--system", "my-system.json", "--dir", "custom/ui"]);
  const expected = await createThemeSourceFiles(system), state = await config(directory);
  assert.equal(state.directory, "custom/ui"); assert.equal(state.systemSha256, expected.systemSha256);
  for (const [path, content] of expected.files) assert.equal(await readFile(join(directory, state.directory, path), "utf8"), content);
  assert.ok(requests.slice(start).every((req) => req.method === "GET" && !req.path.includes("Private")));
});

test("theme updates two themes offline without modifying component code; local style conflicts remain protected", async () => {
  const directory = await host(); await init(directory); await ok(["add", "button"], directory);
  const state = await config(directory), component = join(directory, state.directory, "ui/components/button.tsx");
  await writeFile(component, "// locally customized source\n");
  const system = structuredClone(defaultSystem); system.themes.light.global.radius = 7.125; system.themes.dark.global.background = "#112233";
  await writeFile(join(directory, "system.json"), JSON.stringify(system));
  mode = "offline";
  try { await ok(["theme", "--system", "system.json"], directory); } finally { mode = "normal"; }
  assert.equal(await readFile(component, "utf8"), "// locally customized source\n");
  const cssPath = join(directory, state.directory, "theme.css");
  assert.match(await readFile(cssPath, "utf8"), /7\.125px/);
  await writeFile(cssPath, "/* my hand-written theme */\n"); const before = await tree(directory);
  await failed(["theme", "--system", "system.json"], directory, /Local file conflict/); assert.deepEqual(await tree(directory), before);
});

test("Input/schema errors and missing React do not initialize or reset a project", async () => {
  const directory = await host(); await writeFile(join(directory, "invalid.json"), JSON.stringify({ ...defaultSystem, extra: true }));
  const before = await tree(directory), start = requests.length;
  await failed(["init", "--registry", `${origin}/registry/index.json`, "--system", "invalid.json"], directory, /Unknown field/);
  assert.equal(requests.length, start); assert.deepEqual(await tree(directory), before);
  await writeFile(join(directory, "package.json"), '{"dependencies":{"react":"18.3.1","react-dom":"18.3.1"}}');
  await failed(["init", "--registry", `${origin}/registry/index.json`], directory, /targets React 19/);
  const good = await host(); await init(good); const initialized = await tree(good);
  await failed(["init", "--registry", `${origin}/registry/index.json`, "--overwrite"], good, /already initialized/);
  assert.deepEqual(await tree(good), initialized);
});

test("Malicious paths, symlink targets, corrupted config and concurrent CLI lock never write outside the host", async () => {
  const directory = await host();
  await failed(["init", "--registry", `${origin}/registry/index.json`, "--dir", "../escape"], directory, /Invalid source file path/);
  await init(directory); const state = await config(directory), outside = await mkdtemp(join(base, "outside-"));
  await symlink(outside, join(directory, state.directory, "ui"), "dir");
  const before = await tree(directory); await failed(["add", "text"], directory, /symlink/);
  assert.deepEqual(await tree(directory), before); assert.deepEqual(await readdir(outside), []);
  await rm(join(directory, state.directory, "ui"));
  await writeFile(join(directory, ".bambiui.lock"), "another command");
  await failed(["add", "text"], directory, /holds .bambiui.lock/); assert.equal(await readFile(join(directory, ".bambiui.lock"), "utf8"), "another command");
  await rm(join(directory, ".bambiui.lock"));
  state.files["../escape.ts"] = "a".repeat(64); await writeFile(join(directory, "bambiui.json"), JSON.stringify(state));
  await failed(["add", "text"], directory, /Invalid source file path/); assert.deepEqual(await readdir(outside), []);
});

test("Registry integrity/format/runtime/path/redirect/size errors fail before any project write", async () => {
  for (const failure of ["runtime", "license", "source", "path", "redirect", "corrupt", "oversize", "offline"]) {
    const directory = await host(), before = await tree(directory); mode = failure;
    try { const result = await run(["init", "--registry", `${origin}/registry/index.json`], directory); assert.notEqual(result.code, 0, failure); assert.deepEqual(await tree(directory), before, failure); }
    finally { mode = "normal"; }
  }
  const directory = await host(), before = await tree(directory);
  for (const url of ["file:///etc/passwd", "http://example.com/registry.json", "https://user:secret@example.com/registry.json", "https://example.com/index.json?secret=1"]) await failed(["init", "--registry", url], directory, /Registry URL/);
  assert.deepEqual(await tree(directory), before);
});

test("A missing pinned release is not silently replaced by latest and dependency declarations are preserved", async () => {
  const directory = await host();
  const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8")); pkg.dependencies["@base-ui/react"] = "^1.8.0"; await writeFile(join(directory, "package.json"), JSON.stringify(pkg));
  await init(directory); const result = await ok(["add", "button"], directory);
  assert.match(result.stdout, /Preserving existing/); assert.equal(JSON.parse(await readFile(join(directory, "package.json"), "utf8")).dependencies["@base-ui/react"], "^1.8.0");
  const before = await tree(directory), start = requests.length; mode = "offline";
  try { await failed(["add", "text"], directory, /Registry unavailable/); } finally { mode = "normal"; }
  assert.deepEqual(await tree(directory), before); assert.equal(requests.slice(start).some((req) => req.path === "/registry/index.json"), false);
});

test("All components and explicit layout install with a precise public barrel", async () => {
  const directory = await host(); await mkdir(join(directory, "src")); await init(directory); await ok(["add", "--all"], directory); await ok(["add", "layout"], directory);
  const state = await config(directory); assert.equal(state.directory, "src/components/bambiui"); assert.equal(state.components.length, 8);
  const index = await readFile(join(directory, state.directory, "ui/index.ts"), "utf8");
  for (const name of ["Button", "Input", "Card", "Badge", "Switch", "Checkbox", "Text", "Container", "Stack", "Grid"]) assert.ok(index.includes(name));
  assert.ok((await readFile(join(directory, state.directory, "ui/components/checkbox.tsx"), "utf8")).startsWith('"use client";'));
});

test("A mismatched CLI resolver cannot apply a theme or mutate an existing project", async () => {
  const directory = await host(); await init(directory);
  const state = await config(directory); state.themeRuntimeSha256 = "a".repeat(64);
  await writeFile(join(directory, "bambiui.json"), JSON.stringify(state));
  await writeFile(join(directory, "system.json"), JSON.stringify(defaultSystem));
  const before = await tree(directory), requestStart = requests.length;
  await failed(["theme", "--system", "system.json"], directory, /matching CLI theme resolver/);
  await failed(["add", "text"], directory, /matching CLI theme resolver/);
  assert.equal(requests.length, requestStart); assert.deepEqual(await tree(directory), before);
});

test("MIT release is 0.2.0; missing/incorrect notices and corrupted builds still block publication", async () => {
  const packageRoot = join(root, "packages/cli");
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.equal(manifest.version, "0.2.0"); assert.equal(manifest.publishConfig.access, "public");
  assert.equal(manifest.license, "MIT");
  assert.equal(await checkRelease(packageRoot), "bambiui@0.2.0");
  const directory = await mkdtemp(join(base, "release-"));
  await cp(join(packageRoot, "dist"), join(directory, "dist"), { recursive: true });
  await cp(join(packageRoot, "bin"), join(directory, "bin"), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
  await assert.rejects(checkRelease(directory), /approved LICENSE text/);
  await writeFile(join(directory, "LICENSE"), "Incorrect license notice");
  await assert.rejects(checkRelease(directory), /approved MIT license text/);
  await writeFile(join(directory, "LICENSE"), await readFile(join(packageRoot, "LICENSE"), "utf8"));
  assert.equal(await checkRelease(directory), "bambiui@0.2.0");
  await writeFile(join(directory, "dist/system/tokens.mjs"), "// corrupt runtime\n");
  await assert.rejects(checkRelease(directory), /missing or stale/);
});

test("Packed CLI executes init/add outside this repo without node_modules or TypeScript", async () => {
  const destination = await mkdtemp(join(base, "pack-"));
  const packed = await child("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destination, "--cache", join(destination, "cache")], join(root, "packages/cli"));
  assert.equal(packed.code, 0, packed.stderr); const data = JSON.parse(packed.stdout)[0];
  assert.ok(data.files.some((file) => file.path === "LICENSE"));
  assert.ok(data.files.some((file) => file.path === "NOTICE.md"));
  assert.ok(data.files.some((file) => file.path === "bin/bambiui.mjs")); assert.ok(data.files.some((file) => file.path === "dist/system/tokens.mjs"));
  assert.ok(data.files.every((file) => !/^(app|node_modules|test)\//.test(file.path)));
  const extract = await child("tar", ["-xzf", join(destination, data.filename), "-C", destination], root); assert.equal(extract.code, 0, extract.stderr);
  const directory = await host(), bin = join(destination, "package/bin/bambiui.mjs");
  await init(directory, [], bin); await ok(["add", "text"], directory, bin);
  assert.equal(await exists(join(directory, "node_modules")), false);
  assert.equal(await exists(join(destination, "package/node_modules")), false);
  const exec = await child("npm", ["exec", "--offline", "--ignore-scripts", "--cache", join(destination, "exec-cache"), "--package", join(destination, data.filename), "--", "bambiui", "--version"], directory);
  assert.equal(exec.code, 0, exec.stderr); assert.equal(exec.stdout.trim(), "0.2.0");
});
