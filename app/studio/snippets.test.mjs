import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import ts from "typescript";
import { componentIds } from "./tokens.ts";
import { snippets } from "./snippets.ts";

const root = resolve(import.meta.dirname, "../..");
const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
assert.ok(configPath, "Project TypeScript configuration is required");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined, ts.flattenDiagnosticMessageText(config.error?.messageText ?? "", "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
assert.deepEqual(parsed.errors, []);

test("copyable React examples compile against the actual component APIs", () => {
  assert.deepEqual(Object.keys(snippets).sort(), [...componentIds].sort());
  const sources = new Map(componentIds.map((id) => [resolve(root, `app/studio/__example-${id}.tsx`), snippets[id]]));
  const host = ts.createCompilerHost({ ...parsed.options, incremental: false });
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (file) => sources.get(file) ?? readFile(file);
  host.fileExists = (file) => sources.has(file) || fileExists(file);
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) =>
    sources.has(file)
      ? ts.createSourceFile(file, sources.get(file), languageVersion, true, ts.ScriptKind.TSX)
      : getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([...sources.keys(), resolve(root, "next-env.d.ts")], { ...parsed.options, incremental: false }, host);
  const errors = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const position = diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;
    return `${diagnostic.file?.fileName ?? "config"}:${position ? `${position.line + 1}:${position.character + 1}` : ""} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
  });
  assert.deepEqual(errors, []);
});
