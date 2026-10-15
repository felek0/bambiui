import { createHash } from "node:crypto";
import { distributionLicense } from "../dist/system/distribution-license.mjs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Local publication gate only; does not authenticate, contact npm or publish anything. */
export async function checkRelease(directory) {
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  if (manifest.private || manifest.name !== "bambiui" || !/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.bin?.bambiui !== "bin/bambiui.mjs") throw new Error("Invalid public CLI package metadata.");
  if (manifest.license !== "MIT") throw new Error("The approved CLI distribution license is MIT; package.json must declare MIT.");
  let license;
  try { const path = join(directory, "LICENSE"); if (!(await lstat(path)).isFile()) throw new Error("Not a regular license file"); license = await readFile(path, "utf8"); }
  catch { throw new Error("Include the approved LICENSE text in packages/cli/LICENSE before publishing."); }
  if (license !== distributionLicense.text) throw new Error("LICENSE must contain the approved MIT license text and copyright notice.");
  const runtimeDirectory = join(directory, "dist/system"), files = [];
  async function visit(path) {
    for (const name of await readdir(path)) {
      const absolute = join(path, name), info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error("CLI runtime must not contain symlinks.");
      if (info.isDirectory()) await visit(absolute);
      else if (info.isFile() && name.endsWith(".mjs")) files.push([relative(runtimeDirectory, absolute).split(sep).join("/"), await readFile(absolute, "utf8")]);
      else throw new Error("Unexpected file in the CLI runtime.");
    }
  }
  await visit(runtimeDirectory);
  files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const metadata = JSON.parse(await readFile(join(directory, "dist/runtime.json"), "utf8"));
  const sha256 = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  if (!files.length || metadata.version !== 1 || metadata.sha256 !== sha256) throw new Error("CLI resolver build is missing or stale. Run npm run cli:build from the repository root.");
  if (!((await lstat(join(directory, "bin/bambiui.mjs"))).mode & 0o111)) throw new Error("CLI bin must be executable.");
  return `${manifest.name}@${manifest.version}`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(`PASS: publication metadata/license/runtime gate for ${await checkRelease(fileURLToPath(new URL("../", import.meta.url)))}`); }
  catch (error) { console.error(`bambiui release blocked: ${error.message}`); process.exitCode = 1; }
}
