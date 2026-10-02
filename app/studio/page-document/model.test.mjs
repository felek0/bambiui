import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { parsePageDocument } from "./model.ts";
import { exportPageTSX } from "./export.ts";

const root = resolve(import.meta.dirname, "../../..");
const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "account-settings.json"), "utf8"));
const clone = () => structuredClone(fixture);

test("versioned JSON fixture round trips without changing nodes", () => {
  const page = parsePageDocument(fixture);
  assert.deepEqual(parsePageDocument(JSON.parse(JSON.stringify(page))), page);
  assert.equal(page.root.children[0].children[1].kind, "form");
  assert.equal(exportPageTSX(page), exportPageTSX(JSON.parse(JSON.stringify(page))));
});

test("rejects unknown fields, props, missing labels, invalid slots and duplicate IDs", () => {
  const cases = [
    (v) => { v.root.props.style = "color:red"; },
    (v) => { v.root.children[0].children.push({ id: "bad", kind: "gridItem", children: [{ id: "oops", kind: "text", text: "hi" }] }); },
    (v) => { v.root.children[0].children[0].children[0].id = "page"; },
    (v) => { v.root.children[0].children[1].props.action = "//external.example"; },
    (v) => { v.root.children[0].children[1].children[0].children[0].children[1].children[0].children[0].children[0].props.label = ""; },
    (v) => { v.root.children[0].children[1].children[0].children[0].children.push({ id: "duplicate-header", kind: "cardHeader", children: [{ id: "title", kind: "cardTitle", text: "Hi" }] }); },
    (v) => { v.version = 3; },
  ];
  for (const mutate of cases) {
    const value = clone(); mutate(value);
    assert.throws(() => parsePageDocument(value));
  }
});

test("only serializes text and props as escaped TSX expressions", () => {
  const value = clone();
  value.root.children[0].children[0].children[0].text = '</Text>" & <script>alert(1)</script>';
  const output = exportPageTSX(value, "../components", "../layout");
  assert.match(output, /{"<\/Text>/);
  assert.doesNotMatch(output, /\}\s*<script>/);
  assert.throws(() => exportPageTSX(value, "unsafe-package;exit"));
});

test("generated TSX compiles with the actual component and layout APIs", () => {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  assert.ok(configPath);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  const file = resolve(root, "app/studio/page-document/__generated.tsx");
  const source = exportPageTSX(fixture, "../components", "../layout");
  const host = ts.createCompilerHost({ ...parsed.options, incremental: false });
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const get = host.getSourceFile.bind(host);
  host.readFile = (path) => path === file ? source : read(path);
  host.fileExists = (path) => path === file || exists(path);
  host.getSourceFile = (path, version, onError, shouldCreateNewSourceFile) => path === file
    ? ts.createSourceFile(path, source, version, true, ts.ScriptKind.TSX)
    : get(path, version, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([file, resolve(root, "next-env.d.ts")], { ...parsed.options, incremental: false }, host);
  const errors = ts.getPreEmitDiagnostics(program).map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  assert.deepEqual(errors, []);
});
