import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { checkDistributionLicense } from "./license-scope.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const studio = join(root, "app/studio");
/** Transpile only the authoritative pure resolver graph; the published CLI has no TS/React dependency. */
export async function cliRuntimeFiles() {
  const files = new Map();
  async function visit(path) {
    path = await realpath(path);
    const name = relative(studio, path).split(sep).join("/");
    assert.ok(!name.startsWith("..") && name.endsWith(".ts"), `Unsupported CLI runtime: ${name}`);
    const outputName = name.replace(/\.ts$/, ".mjs");
    if (files.has(outputName)) return;
    files.set(outputName, "");
    const source = await readFile(path, "utf8");
    const js = ts.transpileModule(source, { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const ast = ts.createSourceFile(outputName, js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const dependencies = [];
    const transformed = ts.transform(ast, [(context) => (file) => {
      function transform(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
          const specifier = node.moduleSpecifier.text;
          assert.ok(specifier.startsWith("."), `External CLI resolver dependency: ${specifier}`);
          const dependency = resolve(dirname(path), specifier);
          assert.ok(dependency.endsWith(".ts"), `Unresolved CLI import: ${specifier}`);
          dependencies.push(dependency);
          const next = context.factory.createStringLiteral(specifier.replace(/\.ts$/, ".mjs"));
          return ts.isImportDeclaration(node)
            ? context.factory.updateImportDeclaration(node, node.modifiers, node.importClause, next, node.attributes)
            : context.factory.updateExportDeclaration(node, node.modifiers, false, node.exportClause, next, node.attributes);
        }
        assert.ok(!(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword), "Dynamic CLI resolver import is unsupported");
        return ts.visitEachChild(node, transform, context);
      }
      return ts.visitNode(file, transform);
    }]);
    files.set(outputName, ts.createPrinter().printFile(transformed.transformed[0])); transformed.dispose();
    for (const dependency of dependencies) await visit(dependency);
  }
  for (const entry of ["source-theme.ts", "source-catalog.ts"]) await visit(join(studio, entry));
  await checkDistributionLicense([...files.keys()].map((path) => `app/studio/${path.replace(/\.mjs$/, ".ts")}`));
  return new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
export function runtimeHash(files) {
  return createHash("sha256").update(JSON.stringify([...files])).digest("hex");
}
export async function buildCLI() {
  const files = await cliRuntimeFiles(), output = join(root, "packages/cli/dist");
  await rm(output, { recursive: true, force: true });
  for (const [path, text] of files) { await mkdir(dirname(join(output, "system", path)), { recursive: true }); await writeFile(join(output, "system", path), text); }
  await writeFile(join(output, "runtime.json"), JSON.stringify({ version: 1, sha256: runtimeHash(files) }, null, 2) + "\n");
  console.log(`PASS: built standalone CLI resolver (${files.size} modules, no runtime dependencies)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildCLI();
