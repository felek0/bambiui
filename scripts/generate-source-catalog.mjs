import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { collectStudioSources } from "./source-collector.mjs";
import { componentIds } from "../app/studio/tokens.ts";
import { canonicalJSON } from "../app/studio/source-files.ts";

const root = new URL("../", import.meta.url);
const hash = (text) => createHash("sha256").update(text).digest("hex");
export async function createSourceCatalog() {
  const entries = Object.fromEntries(componentIds.map((id) => [id, `components/${id}.tsx`]));
  entries.layout = "layout/index.tsx";
  const { files, graph } = await collectStudioSources(Object.values(entries));
  const product = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const versions = {};
  for (const pkg of ["react", "react-dom", "@base-ui/react"]) versions[pkg] = JSON.parse(await readFile(new URL(`node_modules/${pkg}/package.json`, root), "utf8")).version;
  return { format: "bambiui.source-catalog", version: 1, generator: { name: "bambiui", version: product.version }, versions, entries,
    sources: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => [path, { content, bytes: Buffer.byteLength(content), sha256: hash(content), imports: [...graph.get(path).imports].sort(), packages: [...graph.get(path).packages].sort() }])) };
}

async function writeIfChanged(path, text) {
  try { if (await readFile(path, "utf8") === text) return; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(path, text);
}

export async function generateSourceCatalog(check = false) {
  const text = canonicalJSON(await createSourceCatalog()), sha256 = hash(text);
  const descriptor = canonicalJSON({ url: `/bambiui-source/catalog.${sha256}.json`, sha256, bytes: Buffer.byteLength(text) });
  const directory = new URL("public/bambiui-source/", root);
  const metadata = new URL("app/studio/source-catalog-meta.json", root);
  if (check) {
    assert.equal(await readFile(metadata, "utf8"), descriptor, "Source catalog metadata is stale; run npm run source:catalog");
    assert.equal(await readFile(new URL(`catalog.${sha256}.json`, directory), "utf8"), text, "Source catalog content is stale");
  } else {
    await mkdir(directory, { recursive: true });
    await writeIfChanged(new URL(`catalog.${sha256}.json`, directory), text);
    await writeIfChanged(metadata, descriptor);
    // Keep only this build's immutable catalog; Studio never fetches a floating latest URL.
    const { readdir } = await import("node:fs/promises");
    for (const name of await readdir(directory)) if (/^catalog\.[a-f0-9]{64}\.json$/.test(name) && name !== `catalog.${sha256}.json`) await rm(new URL(name, directory));
  }
  console.log(`PASS: ${check ? "fresh" : "generated"} source catalog (${Buffer.byteLength(text)} UTF-8 bytes)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every((arg) => arg === "--check"), "Only --check is supported");
  await generateSourceCatalog(process.argv.includes("--check"));
}
