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

function findNode(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
}

const minimal = (children) => ({
  version: 1, id: "limits", name: "Limits",
  root: { id: "root", kind: "container", children },
});
const textNode = (id) => ({ id, kind: "text", text: "Text" });
const formNode = (id) => ({ id, kind: "form", props: { action: "/example" }, children: [textNode(`${id}-text`)] });

test("rejects nested forms through layout ancestors, but permits sibling forms", () => {
  const nested = minimal([{ ...formNode("outer-form"), children: [
    { id: "wrapper", kind: "stack", children: [formNode("inner-form")] },
  ] }]);
  assert.throws(() => parsePageDocument(nested), /nested form/);
  assert.throws(() => exportPageTSX(nested), /nested form/);
  assert.doesNotThrow(() => parsePageDocument(minimal([formNode("first-form"), formNode("second-form")])));
});

test("validates the shared type name against each component's values", () => {
  const value = clone();
  assert.equal(findNode(parsePageDocument(value).root, "try-form").props.type, "submit");
  findNode(value.root, "try-form").props.type = "email";
  assert.throws(() => parsePageDocument(value), /invalid type/);
  findNode(value.root, "try-form").props.type = "button";
  findNode(value.root, "email").props.type = "submit";
  assert.throws(() => parsePageDocument(value), /invalid type/);
});

test("normalizes legacy v1 buttonType without mutating input or exporting the alias", () => {
  const value = clone();
  const button = findNode(value.root, "try-form");
  button.props = { buttonType: "submit" };
  const page = parsePageDocument(value);
  assert.deepEqual(findNode(page.root, "try-form").props, { type: "submit" });
  assert.deepEqual(button.props, { buttonType: "submit" });
  assert.deepEqual(parsePageDocument(page), page);
  assert.doesNotMatch(exportPageTSX(value), /buttonType/);
  button.props.type = "submit";
  assert.throws(() => parsePageDocument(value), /conflicting button type/);
  delete button.props.type;
  button.props.buttonType = "email";
  assert.throws(() => parsePageDocument(value), /invalid buttonType/);
});

test("accepts exactly 100 nodes and rejects the next node", () => {
  const value = minimal(Array.from({ length: 99 }, (_, index) => textNode(`text-${index}`)));
  assert.doesNotThrow(() => parsePageDocument(value));
  value.root.children.push(textNode("overflow"));
  assert.throws(() => parsePageDocument(value), /page limit exceeded/);
});

test("accepts root-relative depth 12 and rejects depth 13", () => {
  function nested(depth) {
    let child = textNode("deep-text");
    for (let level = 1; level < depth; level++) child = { id: `stack-${level}`, kind: "stack", children: [child] };
    return minimal([child]);
  }
  assert.doesNotThrow(() => parsePageDocument(nested(12)));
  assert.throws(() => parsePageDocument(nested(13)), /page limit exceeded/);
});

test("enforces name, text and prop length boundaries", () => {
  const value = minimal([textNode("long-text")]);
  value.name = "n".repeat(120);
  value.root.children[0].text = "t".repeat(2000);
  assert.doesNotThrow(() => parsePageDocument(value));
  value.name += "n";
  assert.throws(() => parsePageDocument(value), /invalid name/);
  value.name = "Limits";
  value.root.children[0].text += "t";
  assert.throws(() => parsePageDocument(value), /invalid text/);
  const input = clone();
  findNode(input.root, "email").props.label = "l".repeat(200);
  assert.doesNotThrow(() => parsePageDocument(input));
  findNode(input.root, "email").props.label += "l";
  assert.throws(() => parsePageDocument(input), /invalid label/);
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
