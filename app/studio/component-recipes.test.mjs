import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import test, { after } from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import ts from "typescript";
import { appearanceFields } from "./components/appearance.ts";
import {
  componentRecipeIds as ids, componentRecipeOptions as options, componentRecipeParts as parts,
  componentRecipeFields as fields, componentRecipeKey as recipeKey, componentRecipeVariable as variable,
  componentRecipeVariables as variables, componentRecipeStylesFor as stylesFor,
  parseComponentRecipes as parse, shareComponentRecipes as share,
} from "./component-recipes.ts";
import { componentRecipeSuffixes } from "./components/recipes.ts";
import { installParityLoader } from "./page-document/parity-loader.mjs";

const loader = installParityLoader();
after(() => loader.cleanup());
const { Button, Input, Switch, Checkbox, Badge, Card, Text } = await import("./components/index.ts");
const { componentRecipeStyle, fieldRecipeStyle, mergeRecipeStyle } = await import("./components/recipe-runtime.ts");
const { defaultSystem, toCSSVariables } = await import("./tokens.ts");
const { componentStyleVariables } = await import("./component-styles.ts");
const css = readFileSync(new URL("./components/components.module.css", import.meta.url), "utf8");
const property = (key) => key === "shadow" ? "box-shadow" : key === "background" ? "background-color" : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const slug = (value) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replaceAll(".", "-");
const allFields = (id, part, recipe) => appearanceFields.filter((field) => [...fields(id, part, "frame", recipe), ...fields(id, part, "text", recipe)].includes(field));
const sample = (field) => field.type === "color" ? "#123AbC" : field.type === "select" ? field.key === "shadow" ? "md" : "right"
  : ({ width: 247, height: 87, minWidth: 297, minHeight: 121, maxWidth: 329, fontSize: 23.25, fontWeight: 650, lineHeight: 1.45, letterSpacing: 0.35, borderWidth: 2, opacity: 0.65 }[field.key] ?? 12.25);
const record = (id, recipe, part, key, value) => ({ [id]: { [recipe]: { [part]: { [key]: value } } } });
const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const components = { button: Button, input: Input, switch: Switch, checkbox: Checkbox, badge: Badge, card: Card, text: Text };

function specimen(id, props = {}) {
  if (["input", "switch", "checkbox"].includes(id)) return h(components[id], { label: "Name", description: "Helper", errorIcon: "info", ...props });
  if (id === "card") return h(Card, props,
    h(Card.Icon, {}, "i"), h(Card.Header, {}, h(Card.Title, {}, "Title"), h(Card.Description, {}, "Description")),
    h(Card.Content, {}, h(Text, {}, "Card body")), h(Card.Footer, {}, h(Button, { variant: "secondary" }, "Card action")));
  return h(components[id], props, "Example");
}
const editingRecipe = (id) => id === "input" ? "invalid.md" : id === "switch" || id === "checkbox" ? "invalidChecked.md" : recipeKey(id);
const specimenProps = (id, option) => parts(id, option.key).some(({ key }) => key === "error") ? { ...option.props, error: "Invalid value" } : option.props;

test("catalog is the complete 294-recipe Cartesian product, with public props and no starter/state aliases", () => {
  const counts = { button: 18, input: 9, switch: 12, checkbox: 12, badge: 54, card: 9, text: 180 };
  for (const id of ids) {
    assert.equal(options(id).length, counts[id]);
    assert.equal(new Set(options(id).map(({ key }) => key)).size, counts[id]);
    for (const option of options(id)) {
      assert.deepEqual(Object.keys(option).sort(), ["key", "label", "variant", "size", "props", ...(option.tone ? ["tone"] : [])].sort());
      assert.equal(recipeKey(id, option.props), option.key);
      assert.ok(option.label && ["sm", "md", "lg"].includes(option.size));
      assert.ok(Object.values(option.props).every((value) => ["string", "boolean"].includes(typeof value)));
      assert.ok(!/disabled|loading|starting/i.test(option.key));
      assert.ok(Object.isFrozen(option) && Object.isFrozen(option.props));
    }
  }
  assert.deepEqual(options("toString"), []);
  assert.equal(recipeKey("input", { error: "Error", readOnly: true, size: "sm" }), "readonly.sm");
  assert.equal(recipeKey("checkbox", { checked: false, defaultChecked: true }), "unchecked.md");
  assert.equal(recipeKey("checkbox", { checked: false, indeterminate: true, invalid: true }), "invalidChecked.md");
  assert.throws(() => recipeKey("button", { variant: "Primary" }), /unknown recipe/);
});

test("frame/text metadata has disjoint fields, exact anatomy, safe bounds and no focus controls", () => {
  assert.deepEqual(parts("card").map(({ key }) => key), ["root", "header", "title", "description", "content", "footer", "icon"]);
  for (const id of ids) for (const part of parts(id)) {
    const frame = fields(id, part.key, "frame"), text = fields(id, part.key, "text");
    assert.ok(frame.every((field) => field.group !== "typography" && field.key !== "color"));
    assert.ok(text.every((field) => field.group === "typography" || field.key === "color"));
    assert.ok(!frame.some((field) => text.includes(field)));
    assert.ok([...frame, ...text].every((field) => appearanceFields.includes(field) && !/focus|outline/i.test(field.key)));
    assert.ok(fields(id, part.key, part.target).length);
  }
  for (const id of ["button", "badge"]) {
    assert.deepEqual(parts(id).map(({ key, target }) => [key, target]), [["root", "frame"], ["text", "text"]]);
    assert.deepEqual(fields(id, "root", "text"), []);
    assert.deepEqual(fields(id, "text", "frame"), []);
  }
  for (const part of ["content", "footer"]) assert.equal(fields("card", part, "text").length, 6);
  assert.deepEqual(fields("input", "row", "frame"), []);
  assert.deepEqual(fields("text", "root", "wrong"), []);
});

test("exact recipe availability excludes only unreachable error parts; omitted recipes retain union metadata", () => {
  for (const id of ids) {
    const anatomy = parts(id);
    for (const option of options(id)) {
      const unavailableError = id === "input" ? option.variant === "default"
        : ["switch", "checkbox"].includes(id) && ["checked", "unchecked"].includes(option.variant);
      assert.deepEqual(parts(id, option.key), anatomy.filter(({ key }) => key !== "error" || !unavailableError), `${id}.${option.key}`);
      for (const { key: part } of anatomy) for (const target of ["frame", "text"]) {
        assert.deepEqual(fields(id, part, target, option.key), part === "error" && unavailableError ? [] : fields(id, part, target));
      }
    }
    for (const recipe of ["", "unknown.md", "toString", "__proto__"]) {
      assert.deepEqual(parts(id, recipe), []);
      for (const { key: part } of anatomy) for (const target of ["frame", "text"]) assert.deepEqual(fields(id, part, target, recipe), []);
    }
  }
  assert.deepEqual(parts("toString", "default.md"), []);
  for (const id of ["input", "switch", "checkbox"]) assert.ok(parts(id).some(({ key }) => key === "error"));
});

test("unreachable recipe error scopes reject before pruning, sharing, resolution or CSS emission", () => {
  for (const [id, variants] of [["input", ["default"]], ["switch", ["checked", "unchecked"]], ["checkbox", ["checked", "unchecked"]]]) {
    for (const variant of variants) for (const size of ["sm", "md", "lg"]) {
      const recipe = `${variant}.${size}`;
      assert.ok(!parts(id, recipe).some(({ key }) => key === "error"));
      for (const target of ["frame", "text"]) assert.deepEqual(fields(id, "error", target, recipe), []);
      for (const appearance of [{}, { color: "#12ABcd", paddingLeft: 12.251 }]) {
        const value = freeze({ [id]: { [recipe]: { root: { width: 143.125 }, error: appearance } } });
        for (const operation of [() => parse(value), () => variables(value), () => share(value), () => share({}, value), () => stylesFor(value, id, recipe, "root")]) {
          assert.throws(operation, /unknown part error/, `${id}.${recipe}.error must reject, not silently disappear`);
        }
      }
      for (const { key } of allFields(id, "error")) assert.throws(() => variable(id, recipe, "error", key), /unsupported field/);
      assert.throws(() => stylesFor(undefined, id, recipe, "error", { color: "#123456" }, { paddingLeft: 1 }), /unknown part error/);
    }
  }
});

test("valid invalid/readonly error scopes preserve exact values, variable names, sharing and local precedence", () => {
  for (const [id, variants] of [["input", ["invalid", "readonly"]], ["switch", ["invalidChecked", "invalidUnchecked"]], ["checkbox", ["invalidChecked", "invalidUnchecked"]]]) {
    for (const variant of variants) for (const size of ["sm", "md", "lg"]) {
      const recipe = `${variant}.${size}`, appearance = { paddingLeft: 12.251, fontSize: 19.125, color: "#12ABcd" };
      const value = freeze({ [id]: { [recipe]: { error: appearance } } });
      assert.deepEqual(parse(value), value);
      assert.equal(recipeKey(id, { ...options(id).find(({ key }) => key === recipe).props, error: "Error" }), recipe);
      const prefix = `--${id}-recipe-${slug(recipe)}-error`;
      assert.equal(variable(id, recipe, "error", "color"), `${prefix}-color`);
      assert.equal(variable(id, recipe, "error", "paddingLeft"), `${prefix}-padding-left`);
      assert.deepEqual(variables(value), { [`${prefix}-box-sizing`]: "border-box", [`${prefix}-padding-left`]: "12.251px", [`${prefix}-font-size`]: "19.125px", [`${prefix}-color`]: "#12ABcd" });
      assert.deepEqual(share(value), { [id]: { [recipe]: { error: { paddingLeft: 12.251, fontSize: 19.125 } } } });
      assert.deepEqual(share({}, value), { [id]: { [recipe]: { error: { color: "#12ABcd" } } } });
      assert.deepEqual(stylesFor(value, id, recipe, "error", { color: "#ffffff", paddingTop: 1.251 }, { fontSize: 21.625 }), { ...appearance, paddingTop: 1.251, fontSize: 21.625 });
      assert.deepEqual(parse({ [id]: { [recipe]: { error: {} } } }), {});
    }
  }
});

test("strict parsing preserves every recipe/field and fractional value, prunes empties, and is deterministic", () => {
  const full = Object.fromEntries(ids.map((id) => [id, Object.fromEntries(options(id).map(({ key: recipe }) => [recipe,
    Object.fromEntries(parts(id, recipe).map(({ key: part }) => [part, Object.fromEntries(allFields(id, part, recipe).map((field) => [field.key, sample(field)]))])),
  ]))]));
  freeze(full);
  assert.deepEqual(parse(full), full);
  assert.deepEqual(parse({ button: { "primary.md": { root: {}, text: {} } }, card: {} }), {});
  for (const id of ids) {
    const recipe = editingRecipe(id);
    for (const { key: part } of parts(id, recipe)) for (const field of allFields(id, part, recipe)) {
      for (const value of [...(field.min !== undefined ? [field.min, field.max] : []), ...(field.options ?? [])]) {
        assert.equal(parse(record(id, recipe, part, field.key, value))[id][recipe][part][field.key], value);
      }
      if (field.min !== undefined) for (const value of [field.min - 0.01, field.max + 0.01, NaN, Infinity, null, undefined, "2px", true]) {
        assert.throws(() => parse(record(id, recipe, part, field.key, value)), /invalid/);
      }
    }
  }
  assert.equal(parse(record("button", "primary.sm", "root", "paddingLeft", 12.251)).button["primary.sm"].root.paddingLeft, 12.251);
  assert.throws(() => parse(record("text", "h1.info.sm", "root", "fontWeight", 650.5)), /invalid/);
  const reverse = Object.fromEntries(Object.entries(full).reverse());
  assert.equal(JSON.stringify(parse(full)), JSON.stringify(parse(reverse)));
});

test("unknown/ambiguous scopes, prototype keys, getters and unsafe CSS reject at every level", () => {
  for (const value of [null, [], 1, "", new Date(), Object.create({ button: {} }), { toString: {} }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => parse(value));
  for (const recipe of ["primary", "primary-sm", "primary.md.text", "primary.neutral.md", "primary.xl", "disabled.md", "toString", "__proto__"]) assert.throws(() => parse({ button: { [recipe]: {} } }), /unknown recipe/);
  for (const value of [[], null, new Date(), { get root() { throw new Error("getter must not run"); } }, { [Symbol("root")]: {} }]) {
    assert.throws(() => parse({ button: value }));
    assert.throws(() => parse({ button: { "primary.md": value } }));
    assert.throws(() => parse({ button: { "primary.md": { root: value } } }));
  }
  for (const [part, key, value] of [["root", "fontSize", 20], ["root", "color", "#112233"], ["text", "background", "#112233"], ["root", "outline", "none"], ["frame", "width", 20], ["root", "background", "url(https://example.com)"], ["text", "color", "transparent"], ["root", "shadow", "0 0 1px red"]]) {
    assert.throws(() => parse(record("button", "primary.md", part, key, value)));
    if (allFields("button", part).some((field) => field.key === key)) assert.doesNotThrow(() => variable("button", "primary.md", part, key));
    else assert.throws(() => variable("button", "primary.md", part, key), /unsupported/);
  }
  // Variable identifiers validate scopes/fields, not values.
  assert.equal(variable("button", "primary.md", "root", "background"), "--button-recipe-primary-md-root-background");
  assert.deepEqual(parse(Object.assign(Object.create(null), { text: { "paragraph.neutral.md": { root: { color: "#12ABcd" } } } })), { text: { "paragraph.neutral.md": { root: { color: "#12ABcd" } } } });
});

test("sharing owns non-colors including omissions, preserves target colors, and never mutates inputs", () => {
  const source = freeze({ button: { "primary.sm": { root: { width: 99.25, background: "#112233", shadow: "lg" }, text: { fontSize: 21 } } } });
  const target = freeze({ button: { "primary.sm": { root: { paddingLeft: 12, background: "#abcdef", borderColor: "transparent" }, text: { color: "#FEDCBA", fontSize: 8 } }, "primary.md": { root: { width: 100 } } }, card: { "filled.lg": { content: { color: "#123456", fontSize: 50 } } } });
  assert.deepEqual(share(source, target), { button: { "primary.sm": { root: { width: 99.25, background: "#abcdef", borderColor: "transparent", shadow: "lg" }, text: { fontSize: 21, color: "#FEDCBA" } } }, card: { "filled.lg": { content: { color: "#123456" } } } });
  assert.deepEqual(share(source), { button: { "primary.sm": { root: { width: 99.25, shadow: "lg" }, text: { fontSize: 21 } } } });
  assert.deepEqual(share(), {});
  assert.deepEqual(stylesFor(source, "button", "primary.sm", "root", { width: 88, opacity: 0.8 }, { width: 44 }), { width: 44, opacity: 0.8, background: "#112233", shadow: "lg" });
  assert.deepEqual(stylesFor(source, "button", "primary.md", "root"), {});
});

test("variables are sparse/unitized; all authored fields and helpers have real CSS consumers", () => {
  assert.deepEqual(variables(), {});
  assert.deepEqual(variables({}), {});
  assert.deepEqual(variables(record("button", "primary.sm", "text", "fontSize", 21.25)), { "--button-recipe-primary-sm-text-font-size": "21.25px" });
  assert.equal(variable("checkbox", "invalidChecked.lg", "control", "borderColor"), "--checkbox-recipe-invalid-checked-lg-control-border-color");
  assert.throws(() => variable("checkbox", "invalid-checked.lg", "control", "borderColor"));
  const style = variables({ input: { "readonly.sm": { control: { height: 21.25, paddingTop: 2.5, borderWidth: 0, shadow: "sm", opacity: 0.65 } } } });
  assert.equal(style["--input-recipe-readonly-sm-control-min-height"], "0px");
  assert.equal(style["--input-recipe-readonly-sm-control-inner-padding-top"], "0px");
  assert.equal(style["--input-recipe-readonly-sm-control-border-style"], "solid");
  assert.equal(style["--input-recipe-readonly-sm-control-shadow"], "var(--ds-shadow-sm)");
  assert.equal(style["--input-recipe-readonly-sm-control-opacity"], "0.65");
  assert.equal(variables(record("text", "paragraph.neutral.md", "root", "width", "hug"))["--text-recipe-paragraph-neutral-md-root-width"], "fit-content");
  const declarations = [];
  postcss.parse(css).walkDecls((decl) => { if (!decl.prop.startsWith("--")) declarations.push(decl); });
  for (const id of ids) for (const { key: part } of parts(id, editingRecipe(id))) {
    for (const field of allFields(id, part, editingRecipe(id))) assert.ok(declarations.some((decl) => [property(field.key), ...(field.key.startsWith("border") ? ["border"] : []), ...(field.key === "background" ? ["background"] : [])].includes(decl.prop) && decl.value.includes(`--${id}-active-part-${part}-${slug(field.key)}`)), `${id}.${part}.${field.key}`);
    for (const suffix of componentRecipeSuffixes(id, part)) assert.ok(declarations.some((decl) => decl.value.includes(`--${id}-active-part-${part}-${suffix}`)), `helper ${id}.${part}.${suffix}`);
  }
  assert.ok(declarations.filter((decl) => decl.prop.startsWith("outline")).every((decl) => !/recipe|active-part/.test(decl.value)));
});

test("public components select actual props; field candidates cover every state; local style callbacks keep precedence", () => {
  for (const id of ids) for (const option of options(id)) {
    const props = specimenProps(id, option), html = renderToStaticMarkup(specimen(id, props));
    assert.equal(recipeKey(id, props), option.key);
    for (const { key: part } of parts(id, option.key)) assert.match(html, new RegExp(`data-ds-component="${id}" data-component-part="${part}"`));
    if (props.error) assert.match(html, /data-invalid=""/);
    else assert.doesNotMatch(html, /data-component-part="error"/);
    assert.ok(html.includes(`--${id}-recipe-${slug(option.key)}-`), `${id}.${option.key}`);
  }
  for (const id of ["input", "switch", "checkbox"]) for (const size of ["sm", "md", "lg"]) {
    const style = fieldRecipeStyle(id, size);
    for (const option of options(id).filter((option) => option.size === size)) assert.ok(Object.values(style).some((value) => value.includes(`--${id}-recipe-${slug(option.key)}-`)));
  }
  assert.equal(componentRecipeStyle("button", "primary.sm")["--button-active-part-root-width"], "var(--button-recipe-primary-sm-root-width, var(--button-part-root-width))");
  const style = mergeRecipeStyle("button", "primary.sm", (state) => ({ width: state.disabled ? 20 : 30, color: "red" }), { width: 45, color: "#123456", fontSize: 19 });
  assert.equal(style({ disabled: false }).width, 45);
  assert.equal(style({ disabled: true })["--button-local-text-color"], "#123456");
  assert.equal(style({ disabled: true })["--button-local-text-font-size"], "19px");
});

const page = { version: 1, id: "recipes", name: "Recipe consumers", root: { id: "root", kind: "container", props: { maxWidth: "full" }, children: [{ id: "stack", kind: "stack", children: [
  { id: "card", kind: "card", props: { variant: "filled", size: "lg" }, children: [
    { id: "body", kind: "cardContent", children: [{ id: "body-text", kind: "text", text: "Body" }] },
    { id: "actions", kind: "cardFooter", children: [{ id: "action", kind: "button", text: "Action", props: { variant: "secondary", size: "sm" } }] },
  ] },
  ...["input", "switch", "checkbox"].map((kind) => ({ id: kind, kind, props: { label: kind, name: kind, size: "sm" } })),
  { id: "badge", kind: "badge", text: "Badge", props: { variant: "subtle", tone: "success", size: "lg" } },
] }] } };
let projectHTML, exportedHTML;
test("Project renderer and generated TSX use the same real Card/field/label consumers", async () => {
  const { RenderPage } = await import("./page-document/render.tsx");
  const { exportPageTSX } = await import("./page-document/export.ts");
  const { default: Page } = await loader.generated(exportPageTSX(page, "../components", "../layout"));
  projectHTML = renderToStaticMarkup(h(RenderPage, { page }));
  exportedHTML = renderToStaticMarkup(h(Page));
  const markers = (html) => html.match(/(?:data-(?:component-part|component-target|component-recipe|ds-component)="[^"]*"|--(?:card|button)-(?:scoped|recipe)[^;" ]*)/g);
  assert.deepEqual(markers(projectHTML), markers(exportedHTML));
  assert.match(projectHTML, /--card-scoped-content-font-size:var\(--card-recipe-filled-lg-content-font-size\)/);
  assert.match(exportedHTML, /--ds-recipe-text-color:var\(--card-scoped-footer-color\)/);
});

test("copied-source dependency graph is standalone React and type-checks without Studio/Next or TS-extension flags", async () => {
  const { createPageSourceFiles } = await import("../../scripts/page-source-files.mjs");
  const { createPageBundle } = await import("./page-document/bundle.ts");
  const files = await createPageSourceFiles(createPageBundle(page, defaultSystem));
  assert.ok(files.has("components/recipes.ts") && files.has("components/recipe-runtime.ts"));
  assert.ok(!files.has("component-recipes.ts") && !files.has("tokens.ts"));
  const directory = mkdtempSync(join(resolve(import.meta.dirname, "../../.next"), "recipe-types-"));
  try {
    for (const [name, content] of files) {
      const path = join(directory, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content);
      if (name.endsWith(".ts") || name.endsWith(".tsx")) assert.doesNotMatch(content, /from ["'][^"']*(?:tokens|component-styles|component-recipes|page-document|composer|next\/)[^"']*["']/);
    }
    const declarations = join(directory, "types.d.ts");
    writeFileSync(declarations, 'declare module "*.module.css" { const classes: Record<string, string>; export default classes; }');
    const program = ts.createProgram([...files.keys()].filter((name) => /\.tsx?$/.test(name)).map((name) => join(directory, name)).concat(declarations), {
      strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, types: ["react", "react-dom"],
    });
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map((error) => `${error.file?.fileName}: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
test("browser: every field/recipe consumes values, exact hits/states, Card nested typography, local precedence and sparse reset", { skip: !existsSync(chrome), timeout: 120000 }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "bambiui-recipes-"));
  try {
    const prefix = "app_studio_components_components_module_css__";
    const sheet = postcss.parse(css);
    sheet.walkRules((rule) => { rule.selector = rule.selector.replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => `.${prefix}${name}`); });
    const editing = h("div", { id: "editing" }, ids.map((id) => h("div", { key: id, "data-edit": id, style: { width: 400 } }, specimen(id, options(id).find(({ key }) => key === editingRecipe(id)).props))));
    const catalog = h("div", { id: "catalog" }, ids.flatMap((id) => options(id).map((option) => h("div", { key: `${id}.${option.key}`, "data-example": `${id}.${option.key}` }, specimen(id, specimenProps(id, option))))));
    const locals = h("div", { id: "locals" },
      h(Button, { appearance: { color: "#654321", fontSize: 17, width: 171 } }, "Local button"),
      h(Badge, { appearance: { color: "#654321", fontSize: 17 } }, "Local badge"),
      h(Card, { variant: "filled", size: "lg" }, h(Card.Content, { appearance: { color: "#654321", fontSize: 17 } }, h(Text, {}, "Slot local"), h(Text, { appearance: { color: "#123456", fontSize: 19 } }, "Child local")), h(Card.Footer, {}, h(Button, { appearance: { color: "#123456", fontSize: 19 } }, "Action local"))),
      h(Input, { label: "Input", appearance: { width: 171, color: "#654321", fontSize: 17, lineHeight: 2, paddingTop: 9 } }),
      ...[Switch, Checkbox].map((Component, i) => h(Component, { key: i, label: "Choice", appearance: { background: "#654321", width: 71 }, parts: { label: { fontSize: 19 } } })),
      h(Card, { id: "nested", variant: "filled", size: "lg" }, h(Card.Content, {}, h(Card, { variant: "outlined" }, h(Card.Title, {}, "Nested title"), h(Card.Content, {}, h(Text, {}, "Nested body"))))));
    const cases = ids.flatMap((id) => parts(id, editingRecipe(id)).flatMap(({ key: part }) => allFields(id, part, editingRecipe(id)).map((field) => ({ id, part, key: field.key, property: property(field.key), value: sample(field), variables: variables(record(id, editingRecipe(id), part, field.key, sample(field))) }))));
    const combinationRecipes = {}, combinations = [];
    for (const id of ids) for (const option of options(id)) {
      const index = combinations.length, color = `#${(0x123400 + index).toString(16)}`, part = ["input", "switch", "checkbox"].includes(id) ? "control" : "root";
      const appearance = (combinationRecipes[id] ??= {})[option.key] ??= {};
      appearance[part] = { background: color };
      const error = parts(id, option.key).some(({ key }) => key === "error");
      if (error) appearance.error = { color, paddingLeft: 12.251, fontSize: 23.125 };
      combinations.push({ id, recipe: option.key, part, error, color: `rgb(18, ${Math.floor((0x3400 + index) / 256)}, ${(0x3400 + index) % 256})` });
    }
    const scoped = { card: { "filled.lg": { content: { color: "#123abc", fontSize: 29, fontWeight: 650, lineHeight: 1.8, letterSpacing: 2, textAlign: "right" }, footer: { color: "#abcdef", fontSize: 27, fontWeight: 750 } } }, button: { "primary.md": { root: { width: 277 }, text: { color: "#abcdef", fontSize: 30 } } }, badge: { "outline.neutral.md": { text: { color: "#abcdef", fontSize: 30 } } } };
    const payload = { prefix, cases, combinations, combinationsVariables: variables(combinationRecipes), theme: toCSSVariables(defaultSystem.themes.light), dark: toCSSVariables(defaultSystem.themes.dark), scoped: variables(scoped),
      shared: componentStyleVariables({ card: { content: { color: "#fedcba", fontSize: 40 } }, button: { root: { width: 177 } } }),
      primary: variables({ button: { "primary.md": { root: { width: 201, background: "#123abc", borderWidth: 0, shadow: "none" } } } }),
      states: variables({ input: { "default.md": { control: { background: "#112233" }, label: { color: "#112233" } }, "invalid.md": { control: { background: "#445566" }, label: { color: "#445566" } }, "readonly.md": { control: { background: "#778899" }, label: { color: "#778899" } } },
        ...Object.fromEntries(["switch", "checkbox"].map((id) => [id, Object.fromEntries(["unchecked", "checked", "invalidUnchecked", "invalidChecked"].map((state, index) => [`${state}.md`, { control: { background: ["#112233", "#445566", "#778899", "#aabbcc"][index] }, label: { color: ["#112233", "#445566", "#778899", "#aabbcc"][index] } }]))])) }),
    };
    const catalogJS = ts.transpileModule(readFileSync(new URL("./components/recipes.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^export \{\};?$/gm, "").replace(/\bexport /g, "");
    const html = `<!doctype html><html><head><style>@layer reset {${readFileSync(fileURLToPath(import.meta.resolve("tailwindcss/preflight.css")), "utf8")}} body {font:14px/1.5 Arial;padding:20px} *,*::before,*::after {transition:none!important;animation:none!important}</style><style>${sheet}</style></head><body>${renderToStaticMarkup(h("div", {}, editing, catalog, locals))}<div id="project">${projectHTML}</div><div id="exported">${exportedHTML}</div><pre id="result"></pre><script>${catalogJS}\n(${browserAssertions.toString()})(${JSON.stringify(payload).replace(/</g, "\\u003c")});</script></body></html>`;
    const path = join(directory, "test.html"); writeFileSync(path, html);
    const result = await chromeResult(pathToFileURL(path).href, directory, "result");
    assert.equal(result.error, undefined, result.error);
    t.diagnostic(`${cases.length} field consumers; ${combinations.length} exact recipes; ${result.assertions} browser assertions`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// Close Chrome after a complete result, never accept a timeout/partial DOM as a pass.
function chromeResult(url, directory, id, flags = []) {
  return new Promise((done, reject) => {
    let output = "", encoded;
    const expression = new RegExp(`<pre id="${id}">(ey[A-Za-z0-9+/=]+)</pre>`);
    const child = execFile(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", `--user-data-dir=${join(directory, "profile")}`, ...flags, "--dump-dom", url], { timeout: 100000, maxBuffer: 30 * 1024 * 1024 }, (error) => {
      if (encoded) done(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
      else reject(error ?? new Error("Chrome exited without a complete result"));
    });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (!encoded && (encoded = output.match(expression)?.[1])) child.kill("SIGTERM");
    });
  });
}

function browserAssertions(data) {
  let assertions = 0;
  const check = (ok, message) => { assertions++; if (!ok) throw new Error(message); };
  const near = (actual, expected, context) => check(Math.abs(parseFloat(actual) - expected) < 0.1, `${context}: ${actual} != ${expected}`);
  const set = (element, values) => { for (const name of [...element.style]) if (name.startsWith("--")) element.style.removeProperty(name); for (const [key, value] of Object.entries(values)) element.style.setProperty(key, value); };
  const part = (root, id, name) => root.querySelector(`[data-ds-component="${id}"][data-component-part="${name}"]`);
  const style = (element) => getComputedStyle(element);
  const selection = (element, component) => componentRecipeSelectionFromElement(element, component);
  try {
    set(document.body, data.theme);
    const catalog = document.querySelector("#catalog");
    set(catalog, data.combinationsVariables);
    for (const entry of data.combinations) {
      const wrapper = catalog.querySelector(`[data-example="${entry.id}.${entry.recipe}"]`), element = part(wrapper, entry.id, entry.part);
      check(style(element).backgroundColor === entry.color, `exact recipe ${entry.id}.${entry.recipe}: ${style(element).backgroundColor}`);
      check(selection(element, entry.id).recipe === entry.recipe, `selection ${entry.id}.${entry.recipe}`);
      const error = part(wrapper, entry.id, "error");
      if (entry.error) {
        check(!!error && selection(error)?.recipe === entry.recipe, `error selection ${entry.id}.${entry.recipe}`);
        check(style(error).color === entry.color, `error ink ${entry.id}.${entry.recipe}`);
        near(style(error).paddingLeft, 12.251, `error geometry ${entry.id}.${entry.recipe}`);
        near(style(error).fontSize, 23.125, `error typography ${entry.id}.${entry.recipe}`);
      } else check(!error, `unavailable error ${entry.id}.${entry.recipe}`);
    }
    catalog.remove();
    for (const entry of data.cases) {
      const wrapper = document.querySelector(`[data-edit="${entry.id}"]`);
      set(wrapper, entry.variables);
      const element = part(wrapper, entry.id, entry.part), computed = style(element), actual = computed.getPropertyValue(entry.property), context = `${entry.id}.${entry.part}.${entry.key}`;
      if (["background", "color", "borderColor"].includes(entry.key)) check(actual === "rgb(18, 58, 188)", `${context}: ${actual}`);
      else if (entry.key === "shadow") check(actual !== "none", `${context}: ${actual}`);
      else if (entry.key === "textAlign") check(actual === "right", `${context}: ${actual}`);
      else if (entry.key === "lineHeight") near(actual, parseFloat(computed.fontSize) * entry.value, context);
      else near(actual, entry.value, context);
      set(wrapper, {});
    }
    const edit = (id) => document.querySelector(`[data-edit="${id}"]`);
    const button = part(edit("button"), "button", "root"), label = part(edit("button"), "button", "text");
    check(selection(button).target === "frame" && selection(label).target === "text" && selection(label).part === "text", "separate frame/text hit targets");
    const rect = label.getBoundingClientRect();
    check(rect.width > 0 && rect.height > 0, "label must have a hit-testable box (not display:contents)");
    window.scrollTo(0, 0);
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    check(hit && selection(hit)?.target === "text", "pointer on label selects exact text");
    set(edit("button"), data.shared); near(style(button).width, 177, "shared fallback");
    set(edit("button"), { ...data.shared, ...data.primary }); near(style(button).width, 201, "recipe over shared");
    button.focus();
    check(style(button).outlineStyle === "solid" && parseFloat(style(button).outlineWidth) > 0, "recipe border zero must not erase keyboard focus");
    set(edit("button"), data.shared); near(style(button).width, 177, "reset restores shared fallback");
    set(edit("button"), {});
    for (const id of ["input", "switch", "checkbox"]) {
      const wrapper = edit(id), root = part(wrapper, id, "root"), control = part(wrapper, id, "control"), label = part(wrapper, id, "label");
      set(wrapper, data.states);
      const checkState = (recipe, color) => {
        check(style(control).backgroundColor === color, `${id} ${recipe} control`);
        check(style(label).color === color, `${id} ${recipe} sibling label`);
        check(selection(label).recipe === `${recipe}.md`, `${id} live-state hit ${recipe}`);
        const errorSelection = selection(part(wrapper, id, "error"));
        if (recipe === "readonly" || recipe.startsWith("invalid")) check(errorSelection?.recipe === `${recipe}.md`, `${id} available error hit ${recipe}`);
        else check(errorSelection === null, `${id} unreachable error hit ${recipe}`);
      };
      if (id === "input") {
        const native = control.querySelector("input");
        root.removeAttribute("data-invalid"); native.removeAttribute("data-invalid"); native.removeAttribute("aria-invalid");
        checkState("default", "rgb(17, 34, 51)");
        root.setAttribute("data-invalid", ""); checkState("invalid", "rgb(68, 85, 102)");
        native.setAttribute("readonly", ""); checkState("readonly", "rgb(119, 136, 153)");
        native.removeAttribute("readonly"); root.removeAttribute("data-invalid"); native.setAttribute("aria-invalid", "true"); checkState("invalid", "rgb(68, 85, 102)");
        native.removeAttribute("aria-invalid");
      } else {
        for (const invalid of [false, true]) for (const checked of [false, true, false]) {
          root.toggleAttribute("data-invalid", invalid); control.toggleAttribute("data-invalid", invalid);
          control.toggleAttribute("data-checked", checked); control.toggleAttribute("data-unchecked", !checked);
          checkState(invalid ? checked ? "invalidChecked" : "invalidUnchecked" : checked ? "checked" : "unchecked", invalid ? checked ? "rgb(170, 187, 204)" : "rgb(119, 136, 153)" : checked ? "rgb(68, 85, 102)" : "rgb(17, 34, 51)");
        }
        if (id === "checkbox") { control.setAttribute("data-indeterminate", ""); checkState("invalidChecked", "rgb(170, 187, 204)"); control.removeAttribute("data-indeterminate"); }
      }
      set(wrapper, {});
    }
    set(document.body, { ...data.theme, ...data.scoped });
    for (const name of ["project", "exported"]) {
      const root = document.getElementById(name), body = part(root, "card", "content"), nestedText = part(body, "text", "root"), footer = part(root, "card", "footer"), action = part(footer, "button", "text");
      near(style(nestedText).fontSize, 29, `${name} Card body typography`);
      check(style(nestedText).color === "rgb(18, 58, 188)", `${name} Card body color`);
      near(style(nestedText).lineHeight, 29 * 1.8, `${name} Card body lineHeight`);
      near(style(action).fontSize, 27, `${name} Card action typography`);
      check(style(action).color === "rgb(171, 205, 239)", `${name} Card action color`);
      for (const [node, slot] of [[nestedText, "content"], [action, "footer"]]) {
        const selected = selection(node, "card"); check(selected.component === "card" && selected.part === slot && selected.recipe === "filled.lg" && selected.target === "text", `${name} Card-scoped text selection`);
      }
      check(selection(footer, "card").target === "frame", "Card footer frame differs from nested action text");
    }
    const local = document.querySelector("#locals");
    for (const id of ["button", "badge"]) { const text = part(local, id, "text"); near(style(text).fontSize, 17, `${id} local label font`); check(style(text).color === "rgb(101, 67, 33)", `${id} local label color`); }
    const content = part(local, "card", "content"), children = content.querySelectorAll('[data-ds-component="text"]');
    near(style(children[0]).fontSize, 17, "Card slot local font"); check(style(children[0]).color === "rgb(101, 67, 33)", "Card slot local color");
    near(style(children[1]).fontSize, 19, "Text local beats Card local"); check(style(children[1]).color === "rgb(18, 52, 86)", "Text local color beats Card local");
    const action = part(part(local, "card", "footer"), "button", "text"); near(style(action).fontSize, 19, "Button local beats Card recipe");
    const nested = document.querySelector("#nested"), nestedBody = nested.querySelector('[data-ds-component="text"]');
    check(style(nestedBody).fontSize !== "29px", "nested Card resets outer Card typography");
    check(selection(nested.querySelector('[data-component-part="title"]')).recipe === "outlined.md", "nested Card hit scope is not captured by outer content");
    for (const theme of [data.theme, data.dark]) {
      set(document.body, { ...theme, ...data.scoped });
      const before = style(part(document.querySelector("#project"), "card", "content")).fontSize;
      check(before === "29px", "shared typography consumes identically in both themes");
      set(document.body, theme);
      check(style(part(part(document.querySelector("#project"), "card", "content"), "text", "root")).fontSize !== "29px", "sparse theme omission restores old typography");
    }
    document.querySelector("#result").textContent = btoa(JSON.stringify({ assertions }));
  } catch (error) { document.querySelector("#result").textContent = btoa(JSON.stringify({ assertions, error: error.stack })); }
}

test("production copied source: hydrated controlled/uncontrolled/cancelled/reset/mixed/invalid/readonly transitions select real recipes", { skip: !existsSync(chrome), timeout: 240000 }, async (t) => {
  const root = resolve(import.meta.dirname, "../..");
  const directory = mkdtempSync(join(root, ".next/recipe-consumer-"));
  let server;
  try {
    const { createPageSourceFiles } = await import("../../scripts/page-source-files.mjs");
    const { createPageBundle } = await import("./page-document/bundle.ts");
    const files = await createPageSourceFiles(createPageBundle(page, defaultSystem));
    const stateColors = { unchecked: "#112233", checked: "#445566", invalidUnchecked: "#778899", invalidChecked: "#aabbcc" };
    const recipes = {
      ...Object.fromEntries(["switch", "checkbox"].map((id) => [id, Object.fromEntries(Object.entries(stateColors).map(([state, color]) => [`${state}.md`, { control: { background: color }, label: { color }, ...(state.startsWith("invalid") ? { error: { color } } : {}) }]))])),
      input: Object.fromEntries(["default", "invalid", "readonly"].map((state, index) => [`${state}.md`, { control: { background: ["#112233", "#445566", "#778899"][index] }, ...(state !== "default" ? { error: { color: ["#112233", "#445566", "#778899"][index] } } : {}) }])),
      card: { "filled.lg": { content: { fontSize: 28, color: "#123abc" }, footer: { fontSize: 26, color: "#abcdef" } } },
    };
    for (const [name, content] of files) { const path = join(directory, "ui", name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
    writeFileSync(join(directory, "ui/recipes.css"), `.recipe-fixture {${Object.entries({ ...toCSSVariables(defaultSystem.themes.light), ...variables(recipes) }).map(([key, value]) => `${key}:${value};`).join("")}} .recipe-fixture *, .recipe-fixture *::before, .recipe-fixture *::after {transition:none!important;animation:none!important}`);
    symlinkSync(join(root, "node_modules"), join(directory, "node_modules"), "dir");
    writeFileSync(join(directory, "package.json"), '{"private":true,"type":"module"}');
    writeFileSync(join(directory, "next.config.mjs"), 'export default { output: "export" };');
    mkdirSync(join(directory, "app"));
    writeFileSync(join(directory, "app/layout.jsx"), 'export default function Layout({children}) { return <html lang="en"><body>{children}</body></html>; }');
    writeFileSync(join(directory, "app/page.jsx"), 'import Page from "../ui/Page"; import Probe from "./probe"; import "../ui/recipes.css"; export default function Example() { return <><Page/><Probe/></>; }');
    writeFileSync(join(directory, "app/probe.jsx"), `"use client";
import {useState,useEffect} from "react";
import {Button,Card,Checkbox,Input,Switch,Text} from "../ui/components";
import {componentRecipeSelectionFromElement} from "../ui/components/recipes";
export default function Probe() {
  const [checked,setChecked]=useState(false), [invalid,setInvalid]=useState(false), [readOnly,setReadOnly]=useState(false), [mixed,setMixed]=useState(true);
  useEffect(() => { (${hydratedAssertions.toString()})({setInvalid,setReadOnly,setMixed}, componentRecipeSelectionFromElement).then(result => { document.getElementById("hydrated-result").textContent=btoa(JSON.stringify(result)); }); }, []);
  return <main className="recipe-fixture">
    <form id="recipe-form"><div id="uncontrolled"><Switch label="Switch" name="switch" defaultChecked={false} error={invalid ? "Invalid" : undefined}/></div></form>
    <div id="controlled"><Checkbox label="Controlled" checked={checked} onCheckedChange={setChecked} error={invalid ? "Invalid" : undefined}/></div>
    <div id="cancelled"><Checkbox label="Cancelled" onCheckedChange={(_,details)=>details.cancel()}/></div>
    <div id="mixed"><Checkbox label="Mixed" indeterminate={mixed} error={invalid ? "Invalid" : undefined}/></div>
    <div id="input"><Input label="Input" error={invalid ? "Invalid" : undefined} readOnly={readOnly}/></div>
    <div id="scoped-card"><Card variant="filled" size="lg"><Card.Content><Text>Body</Text></Card.Content><Card.Footer><Button>Action</Button></Card.Footer></Card></div>
    <pre id="hydrated-result">pending</pre>
  </main>;
}`);
    await new Promise((done, reject) => execFile(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "build"], { cwd: directory, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, timeout: 180000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stdout}\n${stderr}`)) : done()));
    const out = join(directory, "out");
    server = createServer((request, response) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const path = resolve(out, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!path.startsWith(`${out}/`)) { response.writeHead(403).end(); return; }
      try {
        response.setHeader("Content-Type", path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html");
        response.end(readFileSync(path));
      } catch { response.writeHead(404).end(); }
    });
    await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
    const result = await chromeResult(`http://127.0.0.1:${server.address().port}/`, directory, "hydrated-result", ["--virtual-time-budget=15000"]);
    assert.equal(result.error, undefined, result.error);
    assert.ok(result.assertions >= 25);
    t.diagnostic(`${result.assertions} hydrated assertions using minified exported component CSS; no Studio runtime`);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((done) => server.close(done)); }
    rmSync(directory, { recursive: true, force: true });
  }
});

async function hydratedAssertions(actions, selection) {
  let assertions = 0;
  const check = (ok, message) => { assertions++; if (!ok) throw new Error(message); };
  const wait = () => new Promise((done) => setTimeout(done, 250));
  const control = (id) => document.querySelector(`#${id} [data-component-part="control"]`);
  const label = (id) => document.querySelector(`#${id} [data-component-part="label"]`);
  const state = (id, key, color) => {
    const field = control(id).closest('[data-component-part="root"]');
    const kind = field.getAttribute("data-ds-component");
    const switches = ["checked", "unchecked", "invalid-checked", "invalid-unchecked"].map((name) => `${name}=${JSON.stringify(getComputedStyle(field).getPropertyValue(`--${kind}-recipe-skip-${name}`))}`).join(",");
    check(getComputedStyle(control(id)).backgroundColor === color, `${id} ${key} paint: ${getComputedStyle(control(id)).backgroundColor}; state=${selection(control(id)).recipe}; ${switches}; active=${getComputedStyle(field).getPropertyValue(`--${kind}-active-part-control-background`)}`);
    check(selection(control(id)).recipe === `${key}.md`, `${id} ${key} hit`);
    if (id !== "input") check(getComputedStyle(label(id)).color === color, `${id} ${key} sibling label`);
    const error = field.querySelector('[data-component-part="error"]');
    if (key.startsWith("invalid") || key === "readonly") {
      check(!!error && selection(error)?.recipe === `${key}.md`, `${id} ${key} error scope`);
      check(getComputedStyle(error).color === color, `${id} ${key} error paint`);
    } else check(!error, `${id} ${key} has no error`);
  };
  try {
    await wait();
    state("uncontrolled", "unchecked", "rgb(17, 34, 51)");
    control("uncontrolled").click(); await wait(); state("uncontrolled", "checked", "rgb(68, 85, 102)");
    control("uncontrolled").click(); await wait(); state("uncontrolled", "unchecked", "rgb(17, 34, 51)");
    control("controlled").click(); await wait(); state("controlled", "checked", "rgb(68, 85, 102)");
    control("cancelled").click(); await wait(); state("cancelled", "unchecked", "rgb(17, 34, 51)");
    state("mixed", "checked", "rgb(68, 85, 102)");
    state("input", "default", "rgb(17, 34, 51)");
    actions.setInvalid(true); await wait();
    state("uncontrolled", "invalidUnchecked", "rgb(119, 136, 153)");
    state("controlled", "invalidChecked", "rgb(170, 187, 204)");
    state("mixed", "invalidChecked", "rgb(170, 187, 204)");
    state("input", "invalid", "rgb(68, 85, 102)");
    control("controlled").click(); await wait(); state("controlled", "invalidUnchecked", "rgb(119, 136, 153)");
    actions.setMixed(false); actions.setReadOnly(true); await wait();
    state("mixed", "invalidUnchecked", "rgb(119, 136, 153)");
    state("input", "readonly", "rgb(119, 136, 153)");
    actions.setInvalid(false); actions.setReadOnly(false); await wait(); state("input", "default", "rgb(17, 34, 51)");
    const body = document.querySelector('#scoped-card [data-component-part="content"] [data-ds-component="text"]');
    const action = document.querySelector('#scoped-card [data-ds-component="button"][data-component-part="text"]');
    check(getComputedStyle(body).fontSize === "28px", "copied Card body font");
    check(getComputedStyle(body).color === "rgb(18, 58, 188)", "copied Card body ink");
    check(getComputedStyle(action).fontSize === "26px", "copied Card action font");
    check(selection(action, "card").part === "footer", "copied Card action hit");
    control("uncontrolled").click(); await wait(); state("uncontrolled", "checked", "rgb(68, 85, 102)");
    // Base UI 1.8 does not reset this uncontrolled React state on native reset.
    // Recipes follow the actual state, never independently reset the paint.
    document.getElementById("recipe-form").reset(); await wait(); state("uncontrolled", "checked", "rgb(68, 85, 102)");
    return { assertions };
  } catch (error) { return { assertions, error: error.stack }; }
}
