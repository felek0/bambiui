import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createThemeSourceFiles } from "../dist/system/source-theme.mjs";
import { defaultSystem } from "../dist/system/tokens.mjs";
import { canonicalJSON, checkedSourceFiles } from "../dist/system/source-files.mjs";
import { cliRuntimeSha256, digest, loadRegistry, resolveRegistry } from "./registry.mjs";
import { applyPlan, encodeConfig, existing, hostPackage, itemIds, outputDirectory, readConfig, withProjectLock } from "./project.mjs";

async function systemInput(file) {
  if (!file) return defaultSystem;
  const path = resolve(file), info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 5 * 1024 * 1024) throw new Error("System input must be a regular JSON file up to 5 MiB.");
  const bytes = await readFile(path); if (bytes.length > 5 * 1024 * 1024) throw new Error("System JSON exceeds 5 MiB.");
  return JSON.parse(bytes);
}
function setupReadme(directory, versions) {
  return `# bambiui local sources

Import ./${directory}/styles.css once in your host entry or Next app layout. Import ThemeScope from ./${directory}/ThemeScope (named export) and wrap your UI in <ThemeScope mode="light"> or mode="dark". Components are named exports from ./${directory}/ui after bambiui add.

Keep shipped client boundaries. Add host event handlers/hooks inside your own Client Components. The host keeps its html/body and isolated application root for Base UI portals. CSS Modules must be supported. No Tailwind/Next/Studio runtime is required by these sources. No component examples or application callbacks are installed automatically; System Parameters are preserved in snapshots/system.json, not rewritten into React API defaults.

The CLI does not run package-manager installs or edit host entry files. Install dependencies after reviewing package.json. Existing React ranges are preserved; tested React/react-dom versions are ${versions.react}/${versions["react-dom"]}. Review any existing Base UI range against the registry's tested version.

bambiui theme --system ./bambiui-tokens.json applies a local system JSON using the same schema normalization/token resolver as Studio. It preserves component code. Theme CSS is scoped, not a global :root/body reset; optional Google font imports make requests to Google and use local fallbacks offline.

bambiui.json pins an immutable registry URL/hash and tracks original file hashes. Repeated add is idempotent; local modifications are never silently overwritten. --overwrite is an explicit destructive choice on planned target files. Multi-file writes roll back on caught errors but are not process-crash atomic. A stale .bambiui.lock needs inspection before manual removal; do not run other generators on the same files concurrently.

The supplied bambiui software is MIT licensed; retain LICENSE and NOTICE.md. Your System JSON, authored token values and content are not relicensed. Studio code outside the explicit repository license scope remains private; trademark and third-party/font rights are separate. Hashes detect changed content, not authenticity; choose only a trusted registry. Older pinned releases must remain hosted; the CLI does not silently fall back to latest.
`;
}
function finishState(config, output) {
  checkedSourceFiles(output);
  const planned = new Map();
  for (const [path, content] of output) {
    const target = `${config.directory}/${path}`; planned.set(target, content); config.files[target] = digest(content);
  }
  planned.set("bambiui.json", encodeConfig(config)); return planned;
}
export async function init(options, log = console.log) {
  if (!options.registry) throw new Error("Choose the static registry with --registry <https://host/registry/index.json>. No public default registry has been released yet.");
  return withProjectLock(process.cwd(), options.dryRun, async (root) => {
    if (await existing(root, "bambiui.json")) throw new Error("bambiui is already initialized. Use add or theme; init does not reset an existing project.");
    await hostPackage(root);
    let defaultDirectory = "components/bambiui";
    try { const src = await lstat(resolve(root, "src")); if (src.isDirectory() && !src.isSymbolicLink()) defaultDirectory = "src/components/bambiui"; } catch (error) { if (error.code !== "ENOENT") throw error; }
    const directory = outputDirectory(options.dir ?? defaultDirectory);
    const input = await systemInput(options.system);
    const { files, systemSha256 } = await createThemeSourceFiles(input);
    // Resolve a trusted static release; no local snapshot content is sent over the network.
    const registry = await resolveRegistry(options.registry), catalog = await loadRegistry(registry);
    files.set("README.md", setupReadme(directory, catalog.versions));
    const config = { format: "bambiui.project", version: 1, directory, registry, components: [], systemSha256, themeRuntimeSha256: cliRuntimeSha256, files: {} };
    const changed = await applyPlan(root, finishState(config, files), {}, options);
    report(changed, options, log);
    log(`Import ${directory}/styles.css in your host entry, then wrap your UI with ThemeScope. Next: bambiui add button`);
    log("MIT software license and scope notice included. Retain them when redistributing bambiui sources.");
  });
}
export async function add(names, options, log = console.log) {
  if (options.all) { if (names.length) throw new Error("Use component names or --all, not both."); names = itemIds.filter((id) => id !== "layout"); }
  if (!names.length || names.some((id) => !itemIds.includes(id)) || new Set(names).size !== names.length) throw new Error(`Choose unique components: ${itemIds.join(", ")}.`);
  return withProjectLock(process.cwd(), options.dryRun, async (root) => {
    const configBytes = await existing(root, "bambiui.json", 256 * 1024), config = await readConfig(root);
    const { manifest: host, bytes: packageBytes } = await hostPackage(root);
    const catalog = await loadRegistry(config.registry), files = new Map(), packages = new Set();
    function collect(path) {
      if (files.has(`ui/${path}`)) return;
      const file = catalog.sources[path]; files.set(`ui/${path}`, file.content);
      file.packages.forEach((pkg) => packages.add(pkg)); file.imports.forEach(collect);
    }
    names.forEach((id) => collect(catalog.entries[id]));
    config.components = [...new Set([...config.components, ...names])].sort();
    const exports = config.components.filter((id) => id !== "layout").map((id) => `export { ${id[0].toUpperCase() + id.slice(1)} } from "./components/${id}";`);
    if (config.components.includes("layout")) exports.push('export { Container, Stack, Grid } from "./layout";');
    files.set("ui/index.ts", exports.join("\n") + "\n");
    const previous = { ...config.files }, planned = finishState(config, files);
    if (packages.has("@base-ui/react")) {
      const declared = host.dependencies?.["@base-ui/react"] ?? host.devDependencies?.["@base-ui/react"] ?? host.peerDependencies?.["@base-ui/react"];
      if (declared === undefined) { host.dependencies ??= {}; host.dependencies["@base-ui/react"] = catalog.versions["@base-ui/react"]; planned.set("package.json", canonicalJSON(host)); }
      else if (declared !== catalog.versions["@base-ui/react"]) log(`Preserving existing @base-ui/react declaration ${JSON.stringify(declared)}; registry tested ${catalog.versions["@base-ui/react"]}. Review compatibility before installing.`);
    }
    const expected = new Map([["bambiui.json", configBytes], ["package.json", packageBytes]]);
    const changed = await applyPlan(root, planned, previous, { ...options, expected });
    report(changed, options, log);
    if (planned.has("package.json")) log("package.json includes the missing runtime dependency. Review it, then run your package manager's install command. No install scripts were executed.");
    log(`Installed public components: ${config.components.join(", ")}. Import from ${config.directory}/ui.`);
  });
}
export async function theme(options, log = console.log) {
  if (!options.system) throw new Error("theme requires --system <local-system.json>.");
  return withProjectLock(process.cwd(), options.dryRun, async (root) => {
    const bytes = await existing(root, "bambiui.json", 256 * 1024), config = await readConfig(root), previous = { ...config.files };
    const { files, systemSha256 } = await createThemeSourceFiles(await systemInput(options.system));
    config.systemSha256 = systemSha256;
    const changed = await applyPlan(root, finishState(config, files), previous, { ...options, expected: new Map([["bambiui.json", bytes]]) });
    report(changed, options, log); log("Both themes applied locally. Component source and existing content were not rewritten.");
  });
}
function report(changed, options, log) {
  log(`${options.dryRun ? "Dry run: would write" : "Wrote"} ${changed.length} file(s).`);
  for (const path of changed) log(`  ${path}`);
}
