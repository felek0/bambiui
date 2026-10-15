import { lstat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import manifest from "../package.json" with { type: "json" };

export const cliCommand = `npx bambiui@${manifest.version}`;
async function isRegularFile(path) {
  try { const info = await lstat(path); return info.isFile() && !info.isSymbolicLink(); }
  catch { return false; } // Setup hints must not turn a successful install into a failure.
}
export async function installHint(root, host) {
  const manager = typeof host.packageManager === "string" ? host.packageManager.split("@")[0] : "";
  if (["npm", "pnpm", "yarn", "bun"].includes(manager)) return `${manager} install`;
  for (const [file, command] of [["pnpm-lock.yaml", "pnpm install"], ["yarn.lock", "yarn install"], ["bun.lock", "bun install"], ["bun.lockb", "bun install"], ["package-lock.json", "npm install"]]) {
    if (await isRegularFile(join(root, file))) return command;
  }
  return "npm install";
}
export async function hostSetup(root, directory, host) {
  const next = host.dependencies?.next ?? host.devDependencies?.next;
  const candidates = next ? ["src/app/layout.tsx", "app/layout.tsx", "src/pages/_app.tsx", "pages/_app.tsx"] : ["src/main.tsx", "src/index.tsx", "main.tsx", "index.tsx"];
  let entry = null;
  for (const candidate of candidates) if (await isRegularFile(join(root, candidate))) { entry = candidate; break; }
  const entryDirectory = entry ? dirname(entry) : ".";
  const fromEntry = (target) => { const path = relative(entryDirectory, `${directory}/${target}`).split(sep).join("/"); return path.startsWith(".") ? path : `./${path}`; };
  return { entry, styles: fromEntry("styles.css"), scope: fromEntry("ThemeScope"), components: fromEntry("ui") };
}
export function setupInstructions(setup) {
  return `Host setup (${setup.entry ?? "paths shown relative to project root; adjust for your entry file"}):
  import ${JSON.stringify(setup.styles)};
  import { ThemeScope } from ${JSON.stringify(setup.scope)};
Wrap your existing component tree with <ThemeScope mode="light"> or mode="dark".
After adding components, import them from ${JSON.stringify(setup.components)}.
No host entry file was edited automatically.`;
}
