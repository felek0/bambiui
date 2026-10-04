import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test, { after } from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { appearanceFields, appearanceToStyle, mergeAppearanceStyle } from "./components/appearance.ts";
import {
  componentStyleParts, componentStyleFields, componentStyleVariable,
  componentStyleVariables, parseComponentStyles, shareComponentStyles,
} from "./component-styles.ts";
import { installParityLoader } from "./page-document/parity-loader.mjs";

const ids = ["button", "input", "switch", "checkbox", "badge", "card", "text"];
const css = readFileSync(new URL("./components/components.module.css", import.meta.url), "utf8");
const declarations = [];
postcss.parse(css).walkDecls((declaration) => declarations.push(declaration));
const loader = installParityLoader();
after(() => loader.cleanup());
const { Button, Input, Switch, Checkbox, Badge, Card, Text } = await import("./components/index.ts");
const { defaultSystem, toCSSVariables } = await import("./tokens.ts");
const component = { button: Button, input: Input, switch: Switch, checkbox: Checkbox, badge: Badge, card: Card, text: Text };
const sample = (field) => field.type === "color" ? "#123AbC" : field.type === "select" ? field.key === "shadow" ? "md" : "right"
  : ({ width: 247, height: 87, minWidth: 297, minHeight: 121, maxWidth: 329, fontSize: 23.25, fontWeight: 650, lineHeight: 1.45, letterSpacing: 0.35, borderWidth: 2, opacity: 0.65 }[field.key] ?? 12.25);
const property = (key) => key === "shadow" ? "box-shadow" : key === "background" ? "background-color" : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const authored = (id, part, key, value) => ({ [id]: { [part]: { [key]: value } } });
const full = () => Object.fromEntries(ids.map((id) => [id, Object.fromEntries(componentStyleParts(id).map(({ key: part }) => [part, Object.fromEntries(componentStyleFields(id, part).map((field) => [field.key, sample(field)]))]))]));

// These implementation variables are deliberately not authorable AppearanceFields.
function helperNames(id, part) {
  const prefix = `--${id}-part-${part}`;
  return ["box-sizing", ...(componentStyleFields(id, part).some(({ key }) => key === "borderWidth") ? ["border-style"] : []),
    ...(id === "text" || id === "card" && part === "title" ? ["box-display"] : []),
    ...(["button", "badge"].includes(id) ? ["content-display"] : []),
    ...(id === "input" && part === "control" ? ["inner-padding-top", "inner-padding-bottom"] : []),
    ...(id === "switch" && part === "control" ? ["thumb-transform", "thumb-margin"] : []),
  ].map((suffix) => `${prefix}-${suffix}`);
}

test("parts match rendered anatomy; state/variant paint and focus remain outside this model", () => {
  assert.deepEqual(componentStyleParts("button").map(({ key }) => key), ["root"]);
  assert.deepEqual(componentStyleParts("input").map(({ key }) => key), ["root", "label", "control", "description", "error"]);
  for (const id of ["switch", "checkbox"]) {
    assert.deepEqual(componentStyleParts(id).map(({ key }) => key), ["root", "row", "label", "control", "description", "error"]);
    assert.deepEqual(componentStyleFields(id, "control").filter(({ group }) => group === "typography").map(({ key }) => key), ["fontSize"]);
  }
  assert.deepEqual(componentStyleParts("card").map(({ key }) => key), ["root", "header", "title", "description", "content", "footer", "icon"]);
  const paint = ["background", "color", "borderColor", "borderWidth", "shadow"];
  for (const id of ids.filter((id) => id !== "text")) for (const part of ["root", "control"]) {
    assert.ok(!componentStyleFields(id, part).some(({ key }) => paint.includes(key)), `${id}.${part}`);
  }
  for (const id of ids) for (const { key: part } of componentStyleParts(id)) {
    const fields = componentStyleFields(id, part);
    assert.equal(new Set(fields.map(({ key }) => key)).size, fields.length);
    assert.ok(fields.every((field) => appearanceFields.includes(field)), "uses the existing safe vocabulary/bounds");
    assert.ok(!fields.some(({ key }) => /outline|focus/i.test(key)));
    if (["label", "description", "title", "icon"].includes(part) || id === "text") assert.ok(!fields.some(({ key }) => key === "gap"));
  }
  assert.deepEqual(componentStyleFields("input", "row"), []);
  assert.deepEqual(componentStyleParts("toString"), []);
});

test("every consumed field and boundary parses exactly, with no defaulting or rounding", () => {
  const original = freeze(full());
  assert.deepEqual(parseComponentStyles(original), original);
  const parsed = parseComponentStyles(original);
  parsed.card.title.fontSize = 20;
  assert.equal(original.card.title.fontSize, 23.25);
  assert.deepEqual(parseComponentStyles({ button: { root: {} }, card: {} }), {});
  for (const id of ids) for (const { key: part } of componentStyleParts(id)) {
    const fields = componentStyleFields(id, part);
    for (const field of fields) {
      for (const value of [sample(field), ...(field.options ?? []), ...(field.min === undefined ? [] : [field.min, field.max])]) {
        const input = authored(id, part, field.key, value);
        assert.deepEqual(parseComponentStyles(input), input);
      }
      for (const value of [undefined, null, true, [], {}, NaN, Infinity, -Infinity, ...(field.min === undefined ? [] : [field.min - 0.1, field.max + 0.1])]) {
        assert.throws(() => parseComponentStyles(authored(id, part, field.key, value)), /invalid/);
      }
    }
    for (const field of appearanceFields.filter((entry) => !fields.includes(entry))) {
      assert.throws(() => parseComponentStyles(authored(id, part, field.key, sample(field))), /unsupported/);
      assert.throws(() => componentStyleVariable(id, part, field.key), /unsupported/);
    }
  }
  assert.throws(() => parseComponentStyles({ text: { root: { fontWeight: 450.5 } } }), /invalid fontWeight/);
});

test("unknown keys, unsafe CSS and non-serialized values reject at every nesting level", () => {
  const badRecords = [undefined, null, [], "text", 42, new Date(), Object.create({ width: 20 }),
    { get width() { throw new Error("getter must not run"); } }, { [Symbol("width")]: 20 }, Object.defineProperty({}, "width", { value: 20 })];
  for (const raw of badRecords) for (const wrap of [(raw) => raw, (raw) => ({ text: raw }), (raw) => ({ text: { root: raw } })]) {
    assert.throws(() => parseComponentStyles(wrap(raw)), /expected/);
  }
  for (const key of ["constructor", "__proto__", "toString", "unknown"]) {
    assert.throws(() => parseComponentStyles(JSON.parse(`{"${key}":{}}`)), /unknown component/);
    assert.throws(() => parseComponentStyles({ text: JSON.parse(`{"${key}":{}}`) }), /unknown part/);
    assert.throws(() => parseComponentStyles({ text: { root: JSON.parse(`{"${key}":0}`) } }), /unsupported/);
  }
  for (const key of ["style", "outline", "outlineWidth", "position", "transform", "backgroundImage", "--ds-primary"]) {
    assert.throws(() => parseComponentStyles(authored("text", "root", key, "unsafe")), /unsupported/);
  }
  for (const value of ["red", "#fff", "#123456ff", "var(--ds-primary)", "url(https://evil.test/a)", "#ffffff;outline:none", "rgb(0,0,0)", "</style><script>alert(1)</script>"]) {
    for (const key of ["background", "color", "borderColor"]) assert.throws(() => parseComponentStyles(authored("text", "root", key, value)), /invalid/);
  }
  for (const value of ["transparent", "currentColor"]) assert.throws(() => parseComponentStyles(authored("text", "root", "color", value)), /invalid/);
  for (const value of ["12px", "100vw", "calc(1px)"]) assert.throws(() => parseComponentStyles(authored("text", "root", "width", value)), /invalid/);
  for (const value of ["0 0 0 red", "var(--custom)", "xl"]) assert.throws(() => parseComponentStyles(authored("text", "root", "shadow", value)), /invalid/);
  const nullPrototype = Object.assign(Object.create(null), { text: { root: { color: "#123456" } } });
  assert.deepEqual(parseComponentStyles(nullPrototype), { text: { root: { color: "#123456" } } });
});

test("theme sharing copies/removes non-colors while preserving only the target colors", () => {
  const source = freeze({ input: { label: { color: "#111111", fontSize: 16.25, shadow: "sm" }, control: { width: "fill" } }, card: { title: { background: "#eeeeee", marginTop: -2.75 } } });
  const target = freeze({ input: { label: { color: "#ffffff", fontSize: 27, borderColor: "transparent", borderWidth: 2 } }, card: { title: { color: "#abcdef", shadow: "lg" }, footer: { background: "transparent", gap: 55 } }, badge: { root: { width: 77 } } });
  const expected = { input: { label: { color: "#ffffff", fontSize: 16.25, shadow: "sm", borderColor: "transparent" }, control: { width: "fill" } }, card: { title: { color: "#abcdef", marginTop: -2.75 }, footer: { background: "transparent" } } };
  assert.deepEqual(shareComponentStyles(source, target), expected);
  assert.deepEqual(shareComponentStyles(source), { input: { label: { fontSize: 16.25, shadow: "sm" }, control: { width: "fill" } }, card: { title: { marginTop: -2.75 } } });
  assert.deepEqual(shareComponentStyles(undefined, target), { input: { label: { color: "#ffffff", borderColor: "transparent" } }, card: { title: { color: "#abcdef" }, footer: { background: "transparent" } } });
  assert.deepEqual(shareComponentStyles(), {});
  assert.deepEqual(shareComponentStyles(source, shareComponentStyles(source, target)), expected);
  const shared = shareComponentStyles(source, target);
  shared.input.label.color = "#000000";
  assert.equal(target.input.label.color, "#ffffff");
  assert.throws(() => shareComponentStyles({ input: { control: { color: "#111111" } } }), /unsupported/);
});

test("variables are sparse, deterministic and correctly unitized; helpers are conditional", () => {
  assert.deepEqual(componentStyleVariables(), {});
  assert.deepEqual(componentStyleVariables({}), {});
  assert.deepEqual(componentStyleVariables({ button: { root: {} } }), {});
  const input = { text: { root: { width: "hug", height: "fill", maxWidth: "fill", color: "#123AbC", fontSize: 23.25, fontWeight: 650, lineHeight: 1.45, opacity: 0.65, shadow: "md" } } };
  assert.deepEqual(componentStyleVariables(input), {
    "--text-part-root-box-sizing": "border-box", "--text-part-root-width": "fit-content", "--text-part-root-height": "100%", "--text-part-root-max-width": "100%",
    "--text-part-root-font-size": "23.25px", "--text-part-root-font-weight": "650", "--text-part-root-line-height": "1.45", "--text-part-root-color": "#123AbC",
    "--text-part-root-shadow": "var(--ds-shadow-md)", "--text-part-root-opacity": "0.65", "--text-part-root-min-height": "0px", "--text-part-root-box-display": "inline-block",
  });
  assert.equal(componentStyleVariables({ card: { title: { fontSize: 23 } } })["--card-part-title-box-display"], undefined);
  assert.equal(componentStyleVariables({ text: { root: { height: "hug", minHeight: 8, shadow: "none" } } })["--text-part-root-height"], "auto");
  assert.equal(componentStyleVariables({ text: { root: { height: "hug", minHeight: 8 } } })["--text-part-root-min-height"], "8px");
  assert.equal(componentStyleVariables({ switch: { control: { fontSize: 24 } } })["--switch-part-control-thumb-transform"], undefined);
  for (const key of ["width", "minWidth", "maxWidth", "height", "paddingLeft", "paddingRight"]) {
    const variables = componentStyleVariables(authored("switch", "control", key, 80));
    assert.equal(variables["--switch-part-control-thumb-transform"], "none");
    assert.equal(variables["--switch-part-control-thumb-margin"], "auto");
  }
  const reverse = (value) => value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverse(entry)])) : value;
  assert.deepEqual(Object.entries(componentStyleVariables(full())), Object.entries(componentStyleVariables(reverse(full()))));
  assert.throws(() => componentStyleVariables({ text: { root: { color: "url(unsafe)" } } }), /invalid/);
});

test("the variable allowlist exactly matches real CSS property consumers", () => {
  const allowlist = new Set();
  for (const id of ids) for (const { key: part } of componentStyleParts(id)) {
    for (const { key } of componentStyleFields(id, part)) {
      const variable = componentStyleVariable(id, part, key);
      allowlist.add(variable);
      assert.equal(variable, `--${id}-part-${part}-${property(key) === "background-color" ? "background" : key === "shadow" ? "shadow" : property(key)}`);
      assert.ok(declarations.some(({ prop, value }) => prop === property(key) && value.includes(`var(${variable},`)), `Missing ${id}.${part}.${key} consumer`);
    }
    for (const helper of helperNames(id, part)) allowlist.add(helper);
  }
  const consumed = new Set([...css.matchAll(/var\((--(?:button|input|switch|checkbox|badge|card|text)-part-[a-z-]+),/g)].map((match) => match[1]));
  assert.deepEqual(consumed, allowlist);
  assert.deepEqual(new Set(Object.keys(componentStyleVariables(full()))), allowlist);
  for (const declaration of declarations.filter(({ prop }) => prop.startsWith("outline"))) assert.doesNotMatch(declaration.value, /-part-/);
  assert.match(css, /outline: var\(--ds-focus-ring-width\) solid var\(--ds-primary-focus\)/);
});

test("local appearance stays compatible and component sources have no shared-model dependency", () => {
  assert.equal(appearanceToStyle(undefined), undefined);
  assert.deepEqual(appearanceToStyle({ width: "fill", height: "hug", borderWidth: 0, paddingLeft: 4.25, shadow: "sm", color: "#123456" }), {
    boxSizing: "border-box", width: "100%", height: "auto", paddingLeft: 4.25, color: "#123456", borderWidth: 0, boxShadow: "var(--ds-shadow-sm)", minHeight: 0, borderStyle: "solid",
  });
  assert.deepEqual(mergeAppearanceStyle({ color: "red", outline: "2px solid blue" }, { color: "#123456" }), { color: "#123456", outline: "2px solid blue", boxSizing: "border-box" });
  for (const name of [...ids, "field", "appearance"]) {
    const source = readFileSync(new URL(`./components/${name}.${name === "appearance" ? "ts" : "tsx"}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from ["'][^"']*(?:component-styles|tokens|page-document|composer)[^"']*["']/);
  }
  const modelSource = readFileSync(new URL("./component-styles.ts", import.meta.url), "utf8");
  assert.doesNotMatch(modelSource, /from ["'][^"']*tokens/);
  for (const id of ["input", "switch", "checkbox"]) {
    const markup = renderToStaticMarkup(h(component[id], { label: "Name", hideLabel: true, parts: { label: { width: 300 } }, description: "Help", error: "Error" }));
    assert.match(markup, new RegExp(`data-component="${id}"`));
    assert.match(markup, /data-appearance-part="label" data-hide-label="true" class="[^"]*sr-only"/);
    assert.match(markup, /<span style="box-sizing:border-box;width:300px">Name<\/span>/);
  }
});

const classPrefix = "app_studio_components_components_module_css__";
const selector = (id, part) => ["input", "switch", "checkbox"].includes(id) ? `[data-appearance-part="${part}"]`
  : `.${classPrefix}${id === "card" && part !== "root" ? "card" + part[0].toUpperCase() + part.slice(1) : id}`;
function specimen(id, props = {}) {
  if (["input", "switch", "checkbox"].includes(id)) return h(component[id], { label: "Name", description: "Help text", error: "Error text", errorIcon: "info", ...props });
  if (id === "card") return h(Card, props, h(Card.Icon, {}, "i"), h(Card.Header, {}, h(Card.Title, {}, "Title"), h(Card.Description, {}, "Description")), h(Card.Content, {}, h("span", {}, "Content")), h(Card.Footer, {}, "Footer"));
  return h(component[id], props, props.children ?? "Example");
}
function historicalSpecimens() {
  const result = [];
  const push = (id, props) => result.push(h("div", { key: result.length, "data-history": `${id}-${result.length}` }, specimen(id, props)));
  for (const size of ["sm", "md", "lg"]) {
    for (const variant of ["primary", "secondary", "outline", "ghost", "destructive", "link"]) push("button", { size, variant });
    for (const id of ["input", "switch", "checkbox"]) for (const state of [{ error: undefined }, { readOnly: true }, { disabled: true }, { defaultChecked: true }, { hideLabel: true }, { errorPosition: "above" }, ...(id === "checkbox" ? [{ indeterminate: true }] : [])]) push(id, { size, ...state });
    for (const variant of ["solid", "subtle", "outline"]) for (const tone of ["neutral", "primary", "success", "warning", "danger", "info"]) push("badge", { size, variant, tone });
    for (const variant of ["outlined", "filled", "elevated"]) push("card", { size, variant });
    for (const variant of ["heading", "h1", "h2", "h3", "h4", "h5", "h6", "paragraph", "label", "caption"]) for (const tone of ["neutral", "danger"]) push("text", { size, variant, tone });
    for (const id of ["button", "input", "checkbox", "badge", "card"]) push(id, { size, radius: size });
  }
  for (const props of [{ disabled: true }, { loading: true }, { fullWidth: true }, { iconOnly: true, "aria-label": "Example" }, { startIcon: h("svg", { viewBox: "0 0 24 24" }), endIcon: h("svg", { viewBox: "0 0 24 24" }) }]) push("button", props);
  for (const id of ["button", "badge"]) push(id, { children: h("svg", { viewBox: "0 0 24 24" }, h("path", { d: "M0 0h24v24H0z" })) });
  for (const id of ids) push(id, { appearance: { width: 157.25, paddingLeft: 11.5, borderTopLeftRadius: 5.5, fontSize: 17, textAlign: "right", color: "#654321" } });
  push("text", { as: "span", appearance: { color: "#123456" } });
  push("text", { as: "span", appearance: { width: 77 } });
  return renderToStaticMarkup(h("div", { id: "history" }, result));
}

// No browser dependency is added. This follows the repository's installed-Chrome
// convention; CHROME_PATH can point at Chromium on other platforms.
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
test("browser: all fields consume values; defaults, states, local precedence and geometry remain correct", { skip: !existsSync(chrome), timeout: 60000 }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "bambiui-component-styles-"));
  try {
    const sheet = postcss.parse(css);
    sheet.walkRules((rule) => { rule.selector = rule.selector.replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => `.${classPrefix}${name}`); });
    const currentCSS = sheet.toString();
    const baselineCSS = currentCSS.replace(/\/\* Shared component parts[\s\S]*?(?=@media \(prefers-reduced-motion: reduce\))/, "") + `\n.${classPrefix}buttonContent, .${classPrefix}badgeContent { display: contents; }`;
    const editing = renderToStaticMarkup(h("div", { id: "editing" }, ids.map((id) => h("div", { key: id, "data-edit": id }, specimen(id, id === "text" ? { as: "span" } : id === "switch" ? { defaultChecked: true } : {})))));
    const hidden = renderToStaticMarkup(h("div", { id: "hidden" }, ["input", "switch", "checkbox"].map((id) => h("div", { key: id, "data-hidden": id }, specimen(id, { hideLabel: true, parts: { label: { width: 450, paddingLeft: 40 } } })))));
    const local = renderToStaticMarkup(h("div", { id: "local" }, specimen("button", { appearance: { width: 157.25, paddingLeft: 11.5, textAlign: "right", color: "#654321" } }), specimen("input", { appearance: { width: 157.25, paddingTop: 7, lineHeight: 2, letterSpacing: 1.5, textAlign: "right" }, parts: { control: { width: 199 } } }), specimen("switch", { defaultChecked: true, appearance: { width: 91, paddingLeft: 9, paddingRight: 6 } })));
    const cases = ids.flatMap((id) => componentStyleParts(id).flatMap(({ key: part }) => componentStyleFields(id, part).map((field) => ({ id, part, key: field.key, property: property(field.key), value: sample(field), variables: componentStyleVariables(authored(id, part, field.key, sample(field))) }))));
    const payload = {
      prefix: classPrefix, css: currentCSS, variables: toCSSVariables(defaultSystem.themes.light), darkVariables: toCSSVariables(defaultSystem.themes.dark), cases,
      selectors: Object.fromEntries(ids.map((id) => [id, Object.fromEntries(componentStyleParts(id).map(({ key: part }) => [part, selector(id, part)]))])),
      special: {
        input: componentStyleVariables({ input: { control: { paddingTop: 13, paddingBottom: 17, lineHeight: 1.7, letterSpacing: 3, textAlign: "center" } } }),
        switch: [
          { width: 113, paddingLeft: 7, paddingRight: 19 }, { width: "fill", paddingLeft: 4, paddingRight: 5 },
          { width: "hug", minWidth: 103 }, { width: 400, maxWidth: 87 }, { minWidth: 101 },
        ].map((control) => componentStyleVariables({ switch: { control } })),
        local: componentStyleVariables({ button: { root: { width: 260, paddingLeft: 35, textAlign: "center" } }, input: { control: { width: 250, paddingTop: 37, lineHeight: 1.2, letterSpacing: 4, textAlign: "center" } }, switch: { control: { width: 150, paddingLeft: 2, paddingRight: 19 } } }),
        hidden: componentStyleVariables(Object.fromEntries(["input", "switch", "checkbox"].map((id) => [id, { label: { width: 300, height: 200, paddingTop: 30, marginLeft: 60 } }]))),
      },
    };
    const script = `(${browserAssertions.toString()})(${JSON.stringify(payload).replace(/</g, "\\u003c")})`;
    const preflight = readFileSync(fileURLToPath(import.meta.resolve("tailwindcss/preflight.css")), "utf8");
    const html = `<!doctype html><html><head><style>@layer reset {${preflight}} body {font:14px/1.5 Arial; padding:20px} #editing > div {width:400px;margin:20px} .sr-only {position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0} *,*::before,*::after {transition:none!important;animation:none!important}</style><style id="component-css">${baselineCSS}</style></head><body>${historicalSpecimens()}${editing}${hidden}${local}<pre id="result"></pre><script>${script}</script></body></html>`;
    const path = join(directory, "test.html");
    writeFileSync(path, html);
    const { stdout } = await promisify(execFile)(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", `--user-data-dir=${join(directory, "profile")}`, "--dump-dom", pathToFileURL(path).href], { timeout: 45000, maxBuffer: 10 * 1024 * 1024 });
    const encoded = stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/)?.[1];
    assert.ok(encoded, "Chrome did not return test results");
    const result = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assert.equal(result.error, undefined, result.error);
    assert.ok(result.assertions > cases.length);
    assert.ok(result.historicalElements > 500);
    t.diagnostic(`${cases.length} authored field consumers; ${result.historicalElements} historical elements in each theme; ${result.assertions} browser assertions`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function browserAssertions(data) {
  let assertions = 0, historicalElements = 0;
  const check = (condition, message) => { assertions++; if (!condition) throw new Error(message); };
  const near = (value, expected, message) => check(Math.abs(value - expected) < 0.1, `${message}: ${value} != ${expected}`);
  const set = (element, values) => { element.removeAttribute("style"); for (const [key, value] of Object.entries(values)) element.style.setProperty(key, value); };
  const part = (id, name) => document.querySelector(`[data-edit="${id}"]`).querySelector(data.selectors[id][name]);
  const properties = [...new Set(data.cases.map((entry) => entry.property)), "display", "border-style", "outline-width", "outline-offset", "opacity", "transform"];
  const elements = [...document.querySelectorAll('#history [class]')].filter((element) => element.className?.toString().includes(data.prefix) && !element.classList.contains(data.prefix + "buttonContent") && !element.classList.contains(data.prefix + "badgeContent"));
  const wrappers = [...document.querySelectorAll(`#history .${data.prefix}buttonContent, #history .${data.prefix}badgeContent`)].map((wrapper) => ({ wrapper, children: [...wrapper.childNodes], marker: document.createComment("content") }));
  const snapshot = () => elements.map((element) => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return { styles: Object.fromEntries(properties.map((key) => [key, style.getPropertyValue(key)])), width: rect.width, height: rect.height, x: rect.x, y: rect.y };
  });
  try {
    for (const variables of [data.variables, data.darkVariables]) {
      set(document.body, variables);
      document.querySelector("#component-css").textContent = data.css.replace(/\/\* Shared component parts[\s\S]*?(?=@media \(prefers-reduced-motion: reduce\))/, "") + `\n.${data.prefix}buttonContent, .${data.prefix}badgeContent { display: contents; }`;
      for (const { wrapper, children, marker } of wrappers) { wrapper.before(marker); wrapper.replaceWith(...children); }
      const before = snapshot();
      for (const { wrapper, children, marker } of wrappers) { marker.replaceWith(wrapper); wrapper.append(...children); }
      document.querySelector("#component-css").textContent = data.css;
      const after = snapshot();
      historicalElements = elements.length;
      for (let i = 0; i < elements.length; i++) {
        const context = elements[i].closest("[data-history]").dataset.history + " " + elements[i].className;
        for (const key of properties) check(before[i].styles[key] === after[i].styles[key], `Historical ${context} ${key}: ${before[i].styles[key]} -> ${after[i].styles[key]}`);
        near(after[i].width, before[i].width, "Historical width " + context);
        near(after[i].height, before[i].height, "Historical height " + context);
        near(after[i].x, before[i].x, "Historical x " + context);
        near(after[i].y, before[i].y, "Historical y " + context);
      }
    }
    set(document.body, data.variables);
    document.querySelector("#history").remove();
    const editing = document.querySelector("#editing");
    for (const entry of data.cases) {
      set(editing, entry.variables);
      const element = part(entry.id, entry.part), style = getComputedStyle(element), actual = style.getPropertyValue(entry.property);
      const context = `${entry.id}.${entry.part}.${entry.key}`;
      if (["background", "color", "borderColor"].includes(entry.key)) check(actual === "rgb(18, 58, 188)", `${context}: ${actual}`);
      else if (entry.key === "shadow") check(actual !== "none" && actual.includes("12px"), `${context}: ${actual}`);
      else if (entry.key === "textAlign") check(actual === entry.value, `${context}: ${actual}`);
      else if (entry.key === "lineHeight") near(parseFloat(actual), parseFloat(style.fontSize) * entry.value, context);
      else near(parseFloat(actual), entry.value, context);
    }
    set(editing, data.special.input);
    const input = part("input", "control"), native = input.querySelector("input");
    check(getComputedStyle(input).paddingTop === "13px", "Input shell top padding");
    check(getComputedStyle(input).paddingBottom === "17px", "Input shell bottom padding");
    check(getComputedStyle(native).paddingTop === "0px" && getComputedStyle(native).paddingBottom === "0px", "No doubled Input padding");
    check(getComputedStyle(native).letterSpacing === "3px" && getComputedStyle(native).textAlign === "center", "Input native typography consumes shell values");
    function aligned(track) {
      const thumb = track.querySelector("." + data.prefix + "thumb"), box = track.getBoundingClientRect(), mark = thumb.getBoundingClientRect(), style = getComputedStyle(track);
      near(mark.right, box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight), "Checked thumb alignment");
    }
    for (const variables of data.special.switch) { set(editing, variables); aligned(part("switch", "control")); }
    for (const labelPosition of ["start", "end"]) {
      part("switch", "row").dataset.labelPosition = labelPosition;
      set(editing, data.special.switch[0]); aligned(part("switch", "control"));
    }
    const local = document.querySelector("#local");
    set(local, data.special.local);
    const button = local.querySelector("." + data.prefix + "button");
    check(getComputedStyle(button).width === "157.25px" && getComputedStyle(button).paddingLeft === "11.5px", "Local Button geometry wins");
    check(getComputedStyle(button).textAlign === "right" && getComputedStyle(button).color === "rgb(101, 67, 33)", "Local Button typography/paint wins");
    const localInput = local.querySelector("." + data.prefix + "inputControl"), localNative = localInput.querySelector("input");
    check(getComputedStyle(localInput).width === "199px", "Local parts.control wins over appearance and shared width");
    check(getComputedStyle(localInput).paddingTop === "7px" && getComputedStyle(localNative).paddingTop === "0px", "Local Input padding wins");
    check(getComputedStyle(localNative).letterSpacing === "1.5px" && getComputedStyle(localNative).textAlign === "right", "Local Input native typography wins");
    near(parseFloat(getComputedStyle(localNative).lineHeight), parseFloat(getComputedStyle(localNative).fontSize) * 2, "Local Input line height");
    aligned(local.querySelector("." + data.prefix + "switch"));
    set(document.querySelector("#hidden"), data.special.hidden);
    for (const label of document.querySelectorAll("#hidden [data-hide-label]")) {
      near(label.getBoundingClientRect().width, 1, "Hidden label width");
      near(label.getBoundingClientRect().height, 1, "Hidden label height");
      check(getComputedStyle(label).position === "absolute", "Hidden label clipping survives shared/local dimensions");
    }
    // Removing the sparse variables restores inherited geometry, not materialized defaults.
    set(editing, {});
    check(getComputedStyle(part("text", "root")).display === "inline", "Text keeps inline flow without box edits");
    const track = part("switch", "control"), thumb = track.querySelector("." + data.prefix + "thumb");
    check(getComputedStyle(thumb).transform !== "none", "Default switch travel/animation is retained");
    document.querySelector("#result").textContent = btoa(JSON.stringify({ assertions, historicalElements }));
  } catch (error) {
    document.querySelector("#result").textContent = btoa(JSON.stringify({ error: error.stack, assertions, historicalElements }));
  }
}
