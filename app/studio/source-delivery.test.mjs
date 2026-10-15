import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createSourceCatalog, generateSourceCatalog } from "../../scripts/generate-source-catalog.mjs";
import { createSystemSourceFiles, captureSystemSource } from "./source-delivery.ts";
import { parseSourceCatalog } from "./source-catalog.ts";
import { parseSystemSourceManifest } from "./source-manifest.ts";
import { canonicalJSON, SOURCE_MAX_BYTES, SOURCE_MAX_FILES, checkedSourceFiles, sha256, utf8 } from "./source-files.ts";
import { createSourceZIP, crc32 } from "./source-zip.ts";
import { defaultSystem, componentIds, exportCSS } from "./tokens.ts";

const catalog = await createSourceCatalog();
const manifest = (files) => parseSystemSourceManifest(JSON.parse(files.get("manifest.json")));

test("System source copies all seven real components, their closure and exact dependency versions", async () => {
  const files = await createSystemSourceFiles(defaultSystem, componentIds, catalog), meta = manifest(files);
  assert.deepEqual(meta.requestedComponents, [...componentIds].sort());
  assert.deepEqual(meta.includedComponents, [...componentIds].sort());
  assert.deepEqual(meta.dependencies, { "@base-ui/react": catalog.versions["@base-ui/react"] });
  assert.deepEqual(meta.peerDependencies, { react: catalog.versions.react, "react-dom": catalog.versions["react-dom"] });
  assert.equal(JSON.parse(files.get("package.json")).private, true);
  for (const id of componentIds) assert.equal(files.get(`ui/components/${id}.tsx`), await readFile(new URL(`./components/${id}.tsx`, import.meta.url), "utf8"));
  assert.match(files.get("ui/components/checkbox.tsx"), /^"use client";/);
  for (const path of ["ui/components/appearance.ts", "ui/components/recipe-runtime.ts", "ui/components/recipes.ts", "ui/components/field.tsx", "ui/components/spinner.tsx", "ui/icons.tsx", "ui/brand.ts", "ui/layout/index.tsx", "ThemeScope.tsx", "Example.tsx", "ExampleContent.tsx", "snapshots/system.json"]) assert.ok(files.has(path), path);
  for (const [path, content] of files) if (/\.tsx?$/.test(path)) assert.doesNotMatch(content, /from ["'](?:next|node:|.*(?:composer|studio|page-document)\/)/);
  assert.doesNotMatch(files.get("scope.module.css"), /:root|\bbody\b|min-height|padding-block|100vh/);
  assert.deepEqual(meta.warnings, []);
    assert.equal(files.get("LICENSE"), await readFile(new URL("../../packages/cli/LICENSE", import.meta.url), "utf8"));
    assert.match(files.get("NOTICE.md"), /User-authored designs/);
    assert.equal(JSON.parse(files.get("package.json")).license, "MIT");
  assert.match(files.get("README.md"), /npm install @base-ui\/react@1\.8\.0/);
});

test("Text subset excludes Base UI; Card's populated nested Text/Button closure is explicit", async () => {
  const text = await createSystemSourceFiles(defaultSystem, ["text"], catalog);
  assert.deepEqual(manifest(text).dependencies, {});
  assert.equal(text.has("ui/components/button.tsx"), false);
  assert.equal(text.has("ui/icons.tsx"), false);
  assert.match(text.get("ui/components/index.ts"), /^export \{ Text \}/);
  const card = await createSystemSourceFiles(defaultSystem, ["card"], catalog);
  assert.deepEqual(manifest(card).requestedComponents, ["card"]);
  assert.deepEqual(manifest(card).includedComponents, ["button", "card", "text"]);
  assert.match(card.get("ExampleContent.tsx"), /Card.Title/);
  assert.match(card.get("ExampleContent.tsx"), /Button/);
  assert.match(card.get("ExampleContent.tsx"), /maxWidth=\{"full"\}/);
});

test("Capture is synchronous and detached; authoring precision, themes, recipes and seed parameters survive", async () => {
  const system = structuredClone(defaultSystem);
  system.componentDefaults = { card: { slots: { title: 'Türkçe "title" </script>' } } };
  system.themes.light.componentRecipes = { card: { "outlined.md": { title: { fontSize: 19.375, fontWeight: 635 } } } };
  system.themes.dark.componentRecipes = { card: { "outlined.md": { title: { color: "#ff00aa", fontSize: 19.375, fontWeight: 635 } } } };
  const original = structuredClone(system), promise = createSystemSourceFiles(system, ["card"], catalog);
  system.name = "Changed while exporting";
  system.themes.light.componentRecipes.card["outlined.md"].title.fontSize = 88;
  const files = await promise;
  assert.equal(files.get("snapshots/system.json"), canonicalJSON(original));
  assert.match(files.get("theme.css"), /19\.375px/);
  assert.match(files.get("theme.css"), /635/);
  assert.match(files.get("ExampleContent.tsx"), /Türkçe/);
  assert.doesNotMatch(files.get("README.md"), /<script>/);
  const capture = captureSystemSource(original, ["card"]);
  capture.system.name = "Detached"; assert.notEqual(original.name, "Detached");
});

test("Same semantic snapshot produces identical files, hashes and ZIP bytes regardless of key order", async () => {
  const reversed = Object.fromEntries(Object.entries(defaultSystem).reverse());
  const first = await createSystemSourceFiles(defaultSystem, ["text", "button"], catalog), second = await createSystemSourceFiles(reversed, ["button", "text"], catalog);
  assert.deepEqual(first, second);
  assert.deepEqual(createSourceZIP(first), createSourceZIP(second));
  const meta = manifest(first);
  assert.equal(meta.snapshot.scopeId, `bambiui-${await sha256(utf8(first.get("snapshots/system.json")))}`);
  for (const file of meta.files) {
    assert.equal(file.bytes, utf8(first.get(file.path)).length);
    assert.equal(file.sha256, await sha256(utf8(first.get(file.path))));
  }
  assert.equal(meta.files.some((file) => file.path === "manifest.json"), false);
  assert.match(first.get("ThemeScope.tsx"), new RegExp(meta.snapshot.scopeId));
});

test("Scoped CSS uses the same resolver, sparse resets and Google import; global CSS remains unchanged", async () => {
  const system = structuredClone(defaultSystem);
  system.themes.light.componentRecipes = { button: { "primary.md": { root: { background: "#123456" } } } };
  const id = `bambiui-${"a".repeat(64)}`, scoped = exportCSS(system, id), global = exportCSS(system);
  assert.match(global, /:root, \[data-ds-theme="light"\]/);
  assert.doesNotMatch(scoped, /:root|body/);
  assert.equal(scoped.split(`[data-bambiui-system="${id}"][data-ds-theme="light"]`).join(':root, [data-ds-theme="light"]').split(`[data-bambiui-system="${id}"][data-ds-theme="dark"]`).join('[data-ds-theme="dark"]'), global);
  assert.match(scoped, /--button-recipe-primary-md-root-background: initial/);
  assert.throws(() => exportCSS(system, 'x"] body'), /Invalid source theme scope/);
  const one = manifest(await createSystemSourceFiles(defaultSystem, ["text"], catalog)), two = manifest(await createSystemSourceFiles(system, ["text"], catalog));
  assert.notEqual(one.snapshot.scopeId, two.snapshot.scopeId);
});

test("Catalog rejects unsupported metadata/dependencies, corrupt hashes, missing imports and path escapes", async () => {
  for (const mutate of [
    c => { c.version = 2; }, c => { c.extra = true; }, c => { c.generator.version = "latest"; },
    c => { c.versions.next = "16.3.6"; }, c => { c.entries.text = "../text.tsx"; },
    c => { c.sources["components/text.tsx"].content += "\n"; },
    c => { c.sources["components/text.tsx"].sha256 = "a".repeat(64); },
    c => { c.sources["components/text.tsx"].packages = ["next"]; },
    c => { c.sources["components/text.tsx"].imports = ["missing.ts"]; },
    c => { c.sources["../escape.ts"] = c.sources["components/text.tsx"]; },
  ]) { const copy = structuredClone(catalog); mutate(copy); await assert.rejects(parseSourceCatalog(copy)); }
  await assert.rejects(createSystemSourceFiles({ ...defaultSystem, extra: true }, ["text"], catalog), /Unknown field/);
  for (const ids of [[], ["bogus"], ["text", "text"]]) assert.throws(() => captureSystemSource(defaultSystem, ids));
});

test("Manifest parser rejects unknown keys, invalid branches/versions/paths/dependencies and self hashing", async () => {
  const meta = manifest(await createSystemSourceFiles(defaultSystem, ["text"], catalog));
  for (const mutate of [
    m => { m.extra = true; }, m => { m.kind = "frame"; }, m => { m.version = 2; },
    m => { m.snapshot.scopeId = "bambiui-wrong"; }, m => { m.requestedComponents = ["button"]; },
    m => { m.dependencies.next = "16.3.6"; }, m => { m.peerDependencies.react = "^19"; },
    m => { m.files[0].path = "../escape.ts"; }, m => { m.files[0].path = "manifest.json"; },
    m => { m.files[0].bytes = -1; }, m => { m.warnings = ["fake"]; }, m => { m.files.reverse(); },
  ]) { const copy = structuredClone(meta); mutate(copy); assert.throws(() => parseSystemSourceManifest(copy)); }
});

test("Standard Python ZIP reader opens Unicode text/empty files and verifies STORE CRC and deterministic headers", () => {
  assert.equal(crc32(utf8("123456789")), 0xcbf43926);
  const files = new Map([["README.md", "Türkçe 🦌"], ["ui/empty.ts", ""]]), zip = createSourceZIP(files);
  const result = spawnSync("python3", ["-c", 'import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; assert all(i.compress_type == 0 and i.flag_bits & 2048 and i.date_time == (1980,1,1,0,0,0) for i in z.infolist()); print(json.dumps({i.filename:z.read(i).decode("utf-8") for i in z.infolist()},ensure_ascii=False))'], { input: zip, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { "bambiui-source/README.md": "Türkçe 🦌", "bambiui-source/ui/empty.ts": "" });
  const corrupt = zip.slice(); corrupt[30 + utf8("bambiui-source/README.md").length] ^= 1;
  const damaged = spawnSync("python3", ["-c", 'import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() == "bambiui-source/README.md"'], { input: corrupt });
  assert.equal(damaged.status, 0);
});

test("Archive validates exact UTF-8 byte/file limits and rejects unsafe or case-colliding paths", () => {
  assert.equal(checkedSourceFiles(new Map([["large.txt", "é".repeat(SOURCE_MAX_BYTES / 2)]]))[0][1].length, SOURCE_MAX_BYTES);
  assert.throws(() => createSourceZIP(new Map([["large.txt", "é".repeat(SOURCE_MAX_BYTES / 2) + "a"]])), /5 MiB/);
  const exact = new Map(Array.from({ length: SOURCE_MAX_FILES }, (_, i) => [`file-${i}.txt`, ""]));
  assert.equal(checkedSourceFiles(exact).length, SOURCE_MAX_FILES);
  exact.set("extra.txt", ""); assert.throws(() => createSourceZIP(exact), /file limit/);
  for (const path of ["../x", "/absolute", "a//b", "a/./b", "a\\b", "a\0b", "a/../b", ""]) assert.throws(() => createSourceZIP(new Map([[path, "text"]])));
  assert.throws(() => createSourceZIP(new Map([["File.ts", ""], ["file.ts", ""]])), /Duplicate/);
});

test("Populated System examples warn on controlled snapshots without inventing callbacks", async () => {
  const system = structuredClone(defaultSystem);
  system.componentDefaults = { input: { props: { value: "fixed" } }, checkbox: { props: { checked: true } } };
  const files = await createSystemSourceFiles(system, ["input", "checkbox"], catalog);
  assert.ok(manifest(files).warnings.includes("controlled-snapshot"));
  assert.match(files.get("ExampleContent.tsx"), /value=\{"fixed"\}/);
  assert.match(files.get("ExampleContent.tsx"), /checked=\{true\}/);
  assert.doesNotMatch(files.get("ExampleContent.tsx"), /onValueChange|onCheckedChange/);
});

test("Remote font selection is preserved with explicit privacy/offline warning", async () => {
  const system = structuredClone(defaultSystem);
  system.themes.light.fontFamily = system.themes.dark.fontFamily = "google-inter";
  const files = await createSystemSourceFiles(system, ["text"], catalog);
  assert.match(files.get("theme.css"), /^@import url\("https:\/\/fonts.googleapis.com\//);
  assert.ok(manifest(files).warnings.includes("remote-font"));
  assert.match(files.get("README.md"), /IP\/request data/);
});

test("Browser download captures before fetch, creates a real ZIP and cleans up link/Blob URL", async () => {
  const { downloadSystemSource } = await import("./source-download.ts");
  const original = { fetch: globalThis.fetch, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timeout: globalThis.setTimeout };
  const snapshot = structuredClone(defaultSystem), before = canonicalJSON(snapshot);
  let resolveFetch, blob, clicked = false, removed = false, appended = false, cleanup, revoked;
  try {
    globalThis.fetch = () => new Promise((done) => { resolveFetch = done; });
    URL.createObjectURL = (value) => { blob = value; return "blob:source-test"; };
    URL.revokeObjectURL = (url) => { revoked = url; };
    globalThis.setTimeout = (fn, ms, ...args) => ms === 60_000 ? (cleanup = fn, 0) : original.timeout(fn, ms, ...args);
    const link = { click: () => { clicked = true; }, remove: () => { removed = true; } };
    globalThis.document = { createElement: (tag) => { assert.equal(tag, "a"); return link; }, body: { append: (node) => { assert.equal(node, link); appended = true; } } };
    const promise = downloadSystemSource(snapshot, ["text"]);
    snapshot.name = "Changed during fetch";
    resolveFetch(new Response(canonicalJSON(catalog)));
    await promise;
    assert.equal(link.download, "bambiui-system-source.zip");
    assert.equal(link.href, "blob:source-test");
    assert.ok(clicked && removed && appended && blob.type === "application/zip");
    const result = spawnSync("python3", ["-c", 'import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(z.read("bambiui-source/snapshots/system.json").decode(),end="")'], { input: Buffer.from(await blob.arrayBuffer()), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, before);
    cleanup(); assert.equal(revoked, "blob:source-test");
  } finally {
    globalThis.fetch = original.fetch; globalThis.document = original.document; globalThis.setTimeout = original.timeout;
    URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke;
  }
});

test("Missing, stale or oversized browser catalog fails without a download", async () => {
  const { downloadSystemSource } = await import("./source-download.ts");
  const fetch = globalThis.fetch, create = URL.createObjectURL;
  let blobs = 0;
  try {
    URL.createObjectURL = () => { blobs++; throw new Error("Unexpected download"); };
    for (const response of [new Response("missing", { status: 404 }), new Response(canonicalJSON(catalog).replace("bambiui.source-catalog", "bambiui.source-invalid")), new Response("a".repeat(SOURCE_MAX_BYTES + 1))]) {
      globalThis.fetch = async () => response;
      await assert.rejects(downloadSystemSource(defaultSystem, ["text"]));
    }
    assert.equal(blobs, 0);
  } finally { globalThis.fetch = fetch; URL.createObjectURL = create; }
});

test("Source catalog descriptor is fresh and bound to current build source content", async () => {
  const descriptor = JSON.parse(await readFile(new URL("./source-catalog-meta.json", import.meta.url), "utf8"));
  const text = canonicalJSON(catalog);
  assert.equal(descriptor.sha256, await sha256(utf8(text)));
  assert.equal(descriptor.bytes, utf8(text).length);
  assert.equal(descriptor.url, `/bambiui-source/catalog.${descriptor.sha256}.json`);
});

test("Regenerating identical catalog content preserves descriptor and artifact timestamps", async () => {
  const metadata = new URL("./source-catalog-meta.json", import.meta.url);
  const before = (await stat(metadata)).mtimeMs;
  await generateSourceCatalog();
  assert.equal((await stat(metadata)).mtimeMs, before, "Dev startup must not make a current export look stale");
  const descriptor = JSON.parse(await readFile(metadata, "utf8"));
  const artifact = new URL(`../../public${descriptor.url}`, import.meta.url);
  const artifactBefore = (await stat(artifact)).mtimeMs;
  await generateSourceCatalog();
  assert.equal((await stat(metadata)).mtimeMs, before);
  assert.equal((await stat(artifact)).mtimeMs, artifactBefore);
});
