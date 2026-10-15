import { readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { checkDistributionLicense } from "./license-scope.mjs";

const studio = fileURLToPath(new URL("../app/studio/", import.meta.url));
const allowedExternal = new Set(["react", "react-dom", "@base-ui/react"]);

/** One authoritative local import graph for prototype and browser source delivery. */
export async function collectStudioSources(entries) {
  const files = new Map(), graph = new Map(), externalPackages = new Set();
  const physicalStudio = await realpath(studio);
  async function copySource(path) {
    const local = relative(studio, path);
    if (relative(physicalStudio, await realpath(path)) !== local) throw new Error(`Unsupported symlink source dependency: ${local}`);
    if (local === ".." || local.startsWith(`..${sep}`) || !/\.(tsx?|module\.css)$/.test(local)) throw new Error(`Unsupported source dependency: ${local}`);
    const name = local.split(sep).join("/");
    if (files.has(name)) return name;
    const content = await readFile(path, "utf8");
    files.set(name, content);
    const imports = new Set(), packages = new Set();
    graph.set(name, { imports, packages });
    if (name.endsWith(".css")) {
      if (/@import\b|url\(/.test(content)) throw new Error(`Unsupported CSS dependency: ${name}`);
      return name;
    }
    const ast = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
    function check(node) {
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) throw new Error(`Unsupported dynamic dependency: ${name}`);
      ts.forEachChild(node, check);
    }
    check(ast);
    for (const statement of ast.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith(".")) {
        const pkg = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
        if (!allowedExternal.has(pkg)) throw new Error(`Unapproved export dependency: ${pkg}`);
        externalPackages.add(pkg); packages.add(pkg);
        continue;
      }
      const base = resolve(dirname(path), specifier);
      let found;
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
        try { await readFile(candidate); found = candidate; break; }
        catch (error) { if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error; }
      }
      if (!found) throw new Error(`Missing source dependency: ${name} → ${specifier}`);
      imports.add(await copySource(found));
    }
    return name;
  }
  for (const entry of entries) await copySource(resolve(studio, entry));
  await checkDistributionLicense([...files.keys()].map((path) => `app/studio/${path}`));
  return { files, graph, externalPackages };
}
