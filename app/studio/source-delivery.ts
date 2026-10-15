import { componentIds, parseDesignSystem, type ComponentId } from "./tokens.ts";
import { createComponentNode } from "./component-defaults.ts";
import { exportPageTSX } from "./page-document/export.ts";
import { parsePageDocument, type PageNode } from "./page-document/model.ts";
import { nodeRegistry } from "./page-document/registry.ts";
import { parseSourceCatalog } from "./source-catalog.ts";
import { canonicalJSON, checkedSourceFiles, sha256 } from "./source-files.ts";
import { parseSystemSourceManifest, type SourceWarning } from "./source-manifest.ts";

import { createThemeSourceFiles } from "./source-theme.ts";

/** Capture before any asynchronous work. No computed styles, stores or callbacks. */
export function captureSystemSource(input: unknown, selection: readonly ComponentId[]) {
  if (!Array.isArray(selection) || !selection.length || selection.some((id) => !componentIds.includes(id)) || new Set(selection).size !== selection.length) throw new Error("Choose at least one supported component.");
  const system = parseDesignSystem(JSON.stringify(input));
  return { system, requested: [...selection].sort() };
}

export async function createSystemSourceFiles(input: unknown, selection: readonly ComponentId[], catalogInput: unknown): Promise<Map<string, string>> {
  // Snapshot and detach the caller synchronously, before parsing/hashing the catalog.
  const { system, requested } = captureSystemSource(input, selection);
  const catalog = await parseSourceCatalog(catalogInput);
  const { files: themeFiles, systemSha256, scopeId } = await createThemeSourceFiles(system);
  let serial = 0;
  const page = parsePageDocument({ version: 1, id: "system-example", name: "System example", root: {
    id: "example-root", kind: "container", props: { maxWidth: "full" },
    children: [{ id: "example-stack", kind: "stack", props: { direction: "column", gap: "lg" },
      children: requested.map((id) => createComponentNode(id, () => `example-${++serial}`, system.componentDefaults)) }],
  } });
  const included = new Set<ComponentId>();
  function visit(node: PageNode) {
    const definition = nodeRegistry[node.kind];
    if (definition.source === "components") included.add(definition.element.split(".")[0].toLowerCase() as ComponentId);
    node.children?.forEach(visit);
  }
  visit(page.root);
  const files = new Map<string, string>(), external = new Set<string>();
  function collect(path: string) {
    if (files.has(`ui/${path}`)) return;
    const source = catalog.sources[path];
    files.set(`ui/${path}`, source.content);
    source.packages.forEach((pkg) => external.add(pkg)); source.imports.forEach(collect);
  }
  [...included].sort().forEach((id) => collect(catalog.entries[id]));
  collect(catalog.entries.layout);
  const includedComponents = [...included].sort();
  files.set("ui/components/index.ts", includedComponents.map((id) => `export { ${nodeRegistry[id].element} } from "./${id}";`).join("\n") + "\n");
  files.set("ui/index.ts", 'export * from "./components";\nexport { Container, Stack, Grid } from "./layout";\n');
  const dependencies: Record<string, string> = {};
  if (external.has("@base-ui/react")) dependencies["@base-ui/react"] = catalog.versions["@base-ui/react"];
  const peerDependencies = { react: catalog.versions.react, "react-dom": catalog.versions["react-dom"] };
  files.set("package.json", canonicalJSON({ name: "bambiui-system-source", version: "0.0.0", private: true, license: "MIT", type: "module", dependencies, peerDependencies }));
  for (const [path, content] of themeFiles) files.set(path, content);
  files.set("css-modules.d.ts", 'declare module "*.module.css" { const classes: Record<string, string>; export default classes; }\n');

  files.set("ExampleContent.tsx", exportPageTSX(page, "./ui/components", "./ui/layout"));
  files.set("Example.tsx", `import { ThemeScope } from "./ThemeScope";
import ExampleContent from "./ExampleContent";

export default function Example({ mode = "light" }: { mode?: "light" | "dark" }) {
  return <ThemeScope mode={mode}><ExampleContent /></ThemeScope>;
}
`);
  const warnings: SourceWarning[] = [];
  if (files.get("theme.css")!.includes("@import")) warnings.push("remote-font");
  function inspect(node: PageNode) {
    if (node.props && ((node.kind === "input" && Object.hasOwn(node.props, "value")) || ["switch", "checkbox"].includes(node.kind) && Object.hasOwn(node.props, "checked"))) warnings.push("controlled-snapshot");
    node.children?.forEach(inspect);
  }
  inspect(page.root);
  const warningList = [...new Set(warnings)].sort();
  files.set("README.md", `# bambiui system source

Requested components: ${requested.join(", ")}.
Included public components: ${includedComponents.join(", ")}.
Container, Stack and Grid accompany the populated example. Component code and CSS Modules are copied unchanged; shared component CSS is included in full. System Parameters seed ExampleContent, not React API defaults.

## Install in an existing host

Copy bambiui-source into a React + TypeScript application supporting CSS Modules. Use your host's TypeScript and React type packages. React ${peerDependencies.react} / react-dom ${peerDependencies["react-dom"]} are the tested peer versions; do not silently upgrade a different host React version.
${dependencies["@base-ui/react"] ? `From the host root, install the tested runtime dependency: npm install @base-ui/react@${dependencies["@base-ui/react"]}.` : "This subset needs no Base UI runtime dependency."}
The private package.json records dependencies; it is not a publishable npm package and has no install scripts. css-modules.d.ts is optional host typing: Next/Vite hosts with existing CSS Module declarations should exclude this file to avoid duplicate ambient definitions.

Import ./bambiui-source/styles.css once in the host entry or Next App Router layout. Import Example from ./bambiui-source/Example and render <Example mode="light" /> or <Example mode="dark" />. To author your own tree, import { ThemeScope } from ./bambiui-source/ThemeScope and components from ./bambiui-source/ui, then place them inside ThemeScope. Keep shipped client boundaries; add your own Client Component boundary for hooks/event handlers. Next hosts keep their html/body and an isolated root for Base UI portals. No Next/Tailwind/Studio dependency is shipped.

## Boundaries

Both themes are isolated to this snapshot's ThemeScope; no host :root/body styles, wrapper padding or viewport height are added. Explicit authored component geometry is preserved. This is a detached snapshot, not live sync, a Project backup or a release/version pin.
Bind onClick, form state, value/checked callbacks and submission in host code. No callbacks are synthesized; controlled snapshots remain controlled. Disabled/loading/readOnly/required remain authored parameters. The example is not a backend or a submission demo.
${warningList.includes("remote-font") ? "Google Fonts @import is retained. Using these styles sends stylesheet/font requests (including IP/request data) to Google. Offline/blocked loading uses the local fallback stack; remove the import and provide licensed self-hosted fonts if required." : "The selected local font preset adds no remote font request."}

## Licensing and integrity

The supplied bambiui software sources and integration templates are MIT licensed; retain LICENSE and NOTICE.md. User-authored System JSON, token values and content are not relicensed. Studio code outside the explicit repository license scope remains private. Trademark rights and third-party dependencies/fonts remain separate; private: true is packaging metadata, not the license.
Warnings: ${warningList.join(", ")}.
manifest.json lists UTF-8 payload sizes and SHA-256 (excluding itself); ZIP CRC detects corruption. Neither is a signature or trust guarantee. The archive is bounded to 128 files and 5 MiB of text payload. Files: ${[...files.keys(), "README.md", "manifest.json"].sort().join(", ")}.
`);
  const manifest = parseSystemSourceManifest({ format: "bambiui.source-delivery", version: 1, kind: "system", generator: catalog.generator,
    snapshot: { systemSchemaVersion: 3, systemSha256, scopeId }, requestedComponents: requested, includedComponents, includesLayout: true, entry: "Example.tsx", dependencies, peerDependencies,
    files: await Promise.all(checkedSourceFiles(files).map(async ([path, bytes]) => ({ path, bytes: bytes.length, sha256: await sha256(bytes) }))), warnings: warningList });
  files.set("manifest.json", canonicalJSON(manifest));
  checkedSourceFiles(files);
  return new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
