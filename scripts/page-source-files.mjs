import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { parsePageBundle, serializePageBundle } from "../app/studio/page-document/bundle.ts";
import { exportPageTSX } from "../app/studio/page-document/export.ts";
import { nodeRegistry } from "../app/studio/page-document/registry.ts";
import { exportCSS } from "../app/studio/tokens.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const studio = join(root, "app/studio");

/** Build-time source delivery prototype; does not execute page content or rewrite components. */
export async function createPageSourceFiles(input) {
  const bundle = parsePageBundle(serializePageBundle(input));
  const files = new Map();
  const usedComponents = new Set();
  let needsLayout = false;
  function visit(node) {
    const definition = nodeRegistry[node.kind];
    if (definition.source === "components") usedComponents.add(definition.element.split(".")[0]);
    if (definition.source === "layout") needsLayout = true;
    node.children?.forEach(visit);
  }
  visit(bundle.page.root);
  const externalPackages = new Set();
  async function copySource(path) {
    const local = relative(studio, path);
    if (local === ".." || local.startsWith(`..${sep}`) || !/\.(tsx?|module\.css)$/.test(local)) throw new Error(`Unsupported source dependency: ${local}`);
    const name = local.split(sep).join("/");
    if (files.has(name)) return;
    const content = await readFile(path, "utf8");
    files.set(name, content);
    if (name.endsWith(".css")) return;
    const ast = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith(".")) {
        const pkg = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
        externalPackages.add(pkg);
        continue;
      }
      const base = resolve(dirname(path), specifier);
      let found;
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
        try { await readFile(candidate); found = candidate; break; }
        catch (error) { if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error; }
      }
      if (!found) throw new Error(`Missing source dependency: ${name} → ${specifier}`);
      await copySource(found);
    }
  }
  for (const name of [...usedComponents].sort()) await copySource(join(studio, "components", `${name.toLowerCase()}.tsx`));
  if (usedComponents.size) files.set("components/index.ts", [...usedComponents].sort().map((name) => `export { ${name} } from "./${name.toLowerCase()}";`).join("\n") + "\n");
  if (needsLayout) await copySource(join(studio, "layout/index.tsx"));
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const dependencies = {};
  const peerDependencies = {};
  for (const pkg of [...externalPackages].sort()) {
    if (!["react", "react-dom", "@base-ui/react"].includes(pkg) || !manifest.dependencies[pkg]) throw new Error(`Unapproved export dependency: ${pkg}`);
    (pkg.startsWith("react") ? peerDependencies : dependencies)[pkg] = manifest.dependencies[pkg];
  }
  peerDependencies["react-dom"] = manifest.dependencies["react-dom"];
  files.set("package.json", JSON.stringify({ name: "bambiui-page-source", version: "0.0.0", private: true, type: "module", dependencies, peerDependencies }, null, 2) + "\n");
  files.set("PageContent.tsx", exportPageTSX(bundle.page));
  files.set("Page.tsx", 'import PageContent from "./PageContent";\nimport "./theme.css";\nimport "./page.css";\n\nexport default function Page({ mode = "light" }: { mode?: "light" | "dark" }) {\n  return <main className="bambiui-page" data-ds-theme={mode}><PageContent /></main>;\n}\n');
  files.set("theme.css", exportCSS(bundle.designSystem));
  files.set("page.css", ':where(.bambiui-page, .bambiui-page *) { box-sizing: border-box; }\n.bambiui-page { min-height: 100vh; padding-block: var(--ds-spacing-lg); background: var(--ds-background); color: var(--ds-foreground); font-family: var(--ds-font-family); color-scheme: light; }\n.bambiui-page[data-ds-theme="dark"] { color-scheme: dark; }\n.bambiui-page .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }\n');
  files.set("page.bambiui.json", serializePageBundle(bundle));
  files.set("README.md", `# bambiui page source prototype\n\nCopy this directory into a React + TypeScript project supporting CSS Modules. Use the dependency versions in package.json (React/react-dom are peers; @base-ui/react is needed by interactive components). No Tailwind runtime, Studio imports, account or bambiui service is required.\n\nImport Page from the copied directory's Page.tsx and render <Page mode="light" /> or <Page mode="dark" />. In Next.js App Router, the host root layout must include html/body and an isolated application root for Base UI portals; keep the shipped client boundaries intact.\n\nPage.tsx imports theme.css and page.css. theme.css includes root defaults and both theme selectors; review its global :root scope when integrating an existing system. Google font selections retain remote @import requests; remove these and self-host fonts if your privacy/offline policy requires it. Component CSS is shared in full even though only required component sources are included.\n\nThis is a detached snapshot, not live Studio sync or an npm release. Form actions are preserved demo GET paths; wire application behavior yourself before production use. No update/merge or licensing policy is established by this prototype.\n`);
  return files;
}
