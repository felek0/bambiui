import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { publishRegistryArtifacts, readRegistryArchive } from "./registry-archive.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
let fixture, server;
async function child(executable, args, cwd) {
  const process = spawn(executable, args, { cwd, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  process.stdout.on("data", (data) => { stdout += data; }); process.stderr.on("data", (data) => { stderr += data; });
  const code = await new Promise((done, reject) => { process.once("error", reject); process.once("close", done); });
  return { code, stdout, stderr };
}
function releaseFor(text) {
  const sha256 = createHash("sha256").update(text).digest("hex");
  return { text, sha256, index: JSON.stringify({ format: "bambiui.registry-index", version: 1, release: { bytes: Buffer.byteLength(text), path: `releases/${sha256}/registry.json`, sha256 }, warnings: [] }, null, 2) + "\n" };
}
try {
  const archiveDirectory = join(root, "registry"), archive = await readRegistryArchive(archiveDirectory);
  const originalSHA = "f8c9659b67ea08923f7300577db326c63baa61cad3b04e9576ae0b10c945a709";
  assert.ok(archive.has(originalSHA));
  const old = releaseFor(archive.get(originalSHA));
  const changed = JSON.parse(old.text); changed.catalog.generator.version = "99.0.0"; changed.themeRuntimeSha256 = "a".repeat(64);
  const future = releaseFor(JSON.stringify(changed, null, 2) + "\n");
  await mkdir(join(root, ".next"), { recursive: true }); fixture = await mkdtemp(join(root, ".next/retention-check-"));
  const outputDirectory = join(fixture, "public/registry"), host = join(fixture, "host");
  await mkdir(host); await writeFile(join(host, "package.json"), '{"private":true,"type":"module","dependencies":{"react":"19.2.8","react-dom":"19.2.8"}}\n');
  await publishRegistryArtifacts(old, { archiveDirectory, outputDirectory });
  const requests = [];
  server = createServer(async (req, res) => {
    try {
      requests.push(req.url);
      if (req.method !== "GET" || !/^\/registry\/(?:index\.json|releases\/[a-f0-9]{64}\/registry\.json)$/.test(req.url)) { res.writeHead(404).end(); return; }
      const text = await readFile(join(fixture, "public", req.url.slice(1)), "utf8");
      res.writeHead(200, { "Content-Type": "application/json" }).end(text);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${server.address().port}/registry/index.json`;
  const oldCLI = (args) => child("npm", ["exec", "--yes", "--ignore-scripts", "--registry=https://registry.npmjs.org/", "--cache", join(root, ".next/npm-published-check"), "--package=bambiui@0.2.0", "--", "bambiui", ...args], host);
  const newCLI = (args, cwd = host) => child(process.execPath, [join(root, "packages/cli/bin/bambiui.mjs"), ...args], cwd);
  async function ok(result) { result = await result; assert.equal(result.code, 0, result.stdout + result.stderr); return result; }
  await ok(oldCLI(["init", "--registry", url])); await ok(oldCLI(["add", "text"]));
  const stateBefore = JSON.parse(await readFile(join(host, "bambiui.json"), "utf8"));
  const textPath = join(host, stateBefore.directory, "ui/components/text.tsx");
  const custom = await readFile(textPath, "utf8") + "\n// User customization retained across a registry deployment.\n";
  await writeFile(textPath, custom);
  console.log("PASS: published 0.2.0 creates a project pinned to the archived production release.");

  await rm(outputDirectory, { recursive: true });
  await publishRegistryArtifacts(future, { archiveDirectory, outputDirectory });
  assert.equal(await readFile(join(outputDirectory, "releases", old.sha256, "registry.json"), "utf8"), old.text);
  const indexRequestsBefore = requests.filter((path) => path === "/registry/index.json").length;
  await ok(oldCLI(["add", "button"]));
  await ok(newCLI(["add", "card"]));
  const stateAfter = JSON.parse(await readFile(join(host, "bambiui.json"), "utf8"));
  assert.deepEqual(stateAfter.registry, stateBefore.registry);
  assert.equal(await readFile(textPath, "utf8"), custom);
  assert.equal(requests.filter((path) => path === "/registry/index.json").length, indexRequestsBefore);
  console.log("PASS: after a clean output rebuild and incompatible future latest, old 0.2.0 and local 0.2.1 still add through the original pin; local edits survive.");

  const snapshot = JSON.parse(await readFile(join(host, stateAfter.directory, "snapshots/system.json"), "utf8"));
  snapshot.themes.light.global.radius = 13.125;
  await writeFile(join(host, "updated-system.json"), JSON.stringify(snapshot));
  await ok(newCLI(["theme", "--system", "updated-system.json"]));
  assert.equal(await readFile(textPath, "utf8"), custom);
  assert.ok((await readFile(join(host, stateAfter.directory, "theme.css"), "utf8")).includes("--ds-radius: 13.125px;"));
  console.log("PASS: 0.2.1 applies a local theme to a 0.2.0 project without source/registry migration.");

  const fresh = join(fixture, "fresh"); await mkdir(fresh);
  await writeFile(join(fresh, "package.json"), await readFile(join(host, "package.json")));
  const rejected = await newCLI(["init", "--registry", url], fresh);
  assert.notEqual(rejected.code, 0); assert.match(rejected.stderr, /different CLI theme resolver/);
  console.log("PASS: fresh init rejects the simulated incompatible latest instead of silently downgrading or mixing resolvers.");
} catch (error) { console.error("FAIL: registry retention", error); process.exitCode = 1; }
finally {
  server?.closeAllConnections(); if (server) await new Promise((done) => server.close(done));
  if (fixture) await rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
