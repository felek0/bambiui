import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { parsePageDocument } from "./model.ts";
import { exportPageTSX } from "./export.ts";
import { nodeRegistry } from "./registry.ts";

const root = resolve(import.meta.dirname, "../../..");
const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "account-settings.json"), "utf8"));
const designSafe = JSON.parse(readFileSync(resolve(import.meta.dirname, "design-safe.json"), "utf8"));
const clone = () => structuredClone(fixture);

test("empty layouts are explicit, exportable and retain content requirements", () => {
  const page = minimal([]);
  assert.deepEqual(parsePageDocument(page), page);
  assert.doesNotThrow(() => exportPageTSX(page));
  for (const node of [
    { id: "empty", kind: "stack", children: [] },
    { id: "empty", kind: "grid", children: [] },
    { id: "empty", kind: "grid", children: [{ id: "item", kind: "gridItem", children: [] }] },
    { id: "empty", kind: "form", props: { action: "/example" }, children: [] },
    { id: "empty", kind: "card", children: [{ id: "content", kind: "cardContent", children: [] }] },
  ]) assert.doesNotThrow(() => exportPageTSX(minimal([node])));
  for (const node of [
    { id: "empty", kind: "stack" },
    { id: "empty", kind: "card", children: [] },
    { id: "empty", kind: "card", children: [{ id: "header", kind: "cardHeader", children: [] }] },
    { id: "empty", kind: "text", text: "" },
    { id: "empty", kind: "form", children: [] },
  ]) assert.throws(() => parsePageDocument(minimal([node])));
});

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

test("Container auto-layout props use the Stack allowlist without changing omitted defaults", () => {
  const unchanged = minimal([textNode("first"), textNode("second")]);
  assert.deepEqual(parsePageDocument(unchanged), unchanged);
  assert.equal(Object.hasOwn(parsePageDocument(unchanged).root, "props"), false);
  assert.equal(Object.hasOwn(parsePageDocument(unchanged).root, "appearance"), false);
  for (const key of ["direction", "gap", "align", "justify", "wrap"]) {
    assert.deepEqual(nodeRegistry.container.props[key], nodeRegistry.stack.props[key]);
    for (const value of nodeRegistry.container.props[key]) {
      const input = minimal([textNode("first"), textNode("second")]);
      input.root.props = { [key]: value };
      const parsed = parsePageDocument(input);
      assert.deepEqual(parsed, input, `${key}: no auto-layout defaults are serialized`);
      assert.deepEqual(parsePageDocument(JSON.parse(JSON.stringify(parsed))), parsed);
      assert.match(exportPageTSX(input), new RegExp(` ${key}=\\{${JSON.stringify(value)}\\}`));
    }
  }
  for (const props of [
    { direction: "block" }, { direction: "row-reverse" }, { direction: null },
    { gap: 8 }, { gap: "xl" }, { align: "flex-start" }, { justify: "space-between" },
    { wrap: "true" }, { display: "flex" }, { flexDirection: "row" },
  ]) {
    const input = minimal([]); input.root.props = props;
    assert.throws(() => parsePageDocument(input), /invalid|unknown/);
    assert.throws(() => exportPageTSX(input), /invalid|unknown/);
  }
});

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

test("design-safe props roundtrip while unsupported APIs, conflicts and malformed states reject", () => {
  assert.deepEqual(parsePageDocument(designSafe), designSafe);
  const samples = designSafe.root.children[0].children;
  for (const sample of samples) {
    for (const key of ["onClick", "onCheckedChange", "onValueChange", "style", "className", "render", "startIcon", "endIcon", "iconOnly", "dangerouslySetInnerHTML"]) {
      const value = structuredClone(designSafe);
      findNode(value.root, sample.id).props = { ...sample.props, [key]: "unsafe" };
      assert.throws(() => parsePageDocument(value), /unknown key/);
    }
  }
  for (const [id, props] of [
    ["design-switch", { radius: "sm" }], ["design-button", { tone: "danger" }],
    ["design-checkbox", { checked: "true" }], ["design-badge", { tone: "destructive" }],
    ["design-card", { variant: "outline" }], ["design-text", { as: "script" }],
    ["design-input", { value: 123 }], ["design-input", { label: { children: "JSX" } }],
    ["design-switch", { checked: false, defaultChecked: true }],
    ["design-input", { value: "", defaultValue: "" }],
  ]) {
    const value = structuredClone(designSafe);
    findNode(value.root, id).props = { ...findNode(value.root, id).props, ...props };
    assert.throws(() => parsePageDocument(value));
  }
  for (const kind of ["input", "switch", "checkbox"]) {
    for (const missing of ["label", "name"]) {
      const value = structuredClone(designSafe);
      delete findNode(value.root, `design-${kind}`).props[missing];
      assert.throws(() => parsePageDocument(value), new RegExp(`missing ${missing}`));
    }
  }
  const blank = structuredClone(designSafe);
  findNode(blank.root, "design-input").props.defaultValue = "";
  findNode(blank.root, "design-input").props.placeholder = "";
  assert.doesNotThrow(() => parsePageDocument(blank));
  const duplicate = structuredClone(designSafe);
  findNode(duplicate.root, "design-card").children.push({ id: "duplicate-footer", kind: "cardFooter", children: [] });
  assert.throws(() => parsePageDocument(duplicate), /duplicate slot/);
});

test("generated TSX compiles with the actual component and layout APIs", () => {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  assert.ok(configPath);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  const file = resolve(root, "app/studio/page-document/__generated.tsx");
  const second = resolve(root, "app/studio/page-document/__design_safe.tsx");
  const sources = new Map([[file, exportPageTSX(fixture, "../components", "../layout")], [second, exportPageTSX(designSafe, "../components", "../layout")]]);
  const appearance = JSON.parse(readFileSync(resolve(import.meta.dirname, "appearance-specimen.json"), "utf8"));
  sources.set(resolve(root, "app/studio/page-document/__appearance.tsx"), exportPageTSX(appearance, "../components", "../layout"));
  for (const sample of designSafe.root.children[0].children) {
    for (const [key, rule] of Object.entries(nodeRegistry[sample.kind].props)) {
      for (const value of Array.isArray(rule) ? rule : [rule === "string" ? "" : "Sample"]) {
        const node = structuredClone(sample);
        node.props = { ...node.props, [key]: value };
        if (key === "checked") delete node.props.defaultChecked;
        if (key === "defaultChecked") delete node.props.checked;
        if (key === "value") delete node.props.defaultValue;
        if (key === "defaultValue") delete node.props.value;
        const input = minimal([{ id: "slot", kind: "stack", children: [node] }]);
        sources.set(resolve(root, `app/studio/page-document/__axis_${sources.size}.tsx`), exportPageTSX(input, "../components", "../layout"));
      }
    }
  }
  for (const [key, rule] of Object.entries(nodeRegistry.container.props)) for (const value of rule) {
    const input = minimal([textNode("first"), textNode("second")]);
    input.root.props = { direction: "column", [key]: value };
    input.root.appearance = { gap: 12.25 };
    sources.set(resolve(root, `app/studio/page-document/__container_${sources.size}.tsx`), exportPageTSX(input, "../components", "../layout"));
  }
  const host = ts.createCompilerHost({ ...parsed.options, incremental: false });
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const get = host.getSourceFile.bind(host);
  host.readFile = (path) => sources.get(path) ?? read(path);
  host.fileExists = (path) => sources.has(path) || exists(path);
  host.getSourceFile = (path, version, onError, shouldCreateNewSourceFile) => sources.has(path)
    ? ts.createSourceFile(path, sources.get(path), version, true, ts.ScriptKind.TSX)
    : get(path, version, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([...sources.keys(), resolve(root, "next-env.d.ts")], { ...parsed.options, incremental: false }, host);
  const errors = ts.getPreEmitDiagnostics(program).map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  assert.deepEqual(errors, []);
});
