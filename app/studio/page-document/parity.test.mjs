import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./parity-loader.mjs";

const loader = installParityLoader();
after(() => loader.cleanup());
const { parsePageDocument } = await import("./model.ts");
const { RenderPage, RenderPageBundle } = await import("./render.tsx");
const { createPageBundle, parsePageBundle, serializePageBundle } = await import("./bundle.ts");
const { defaultSystem, toCSSVariables } = await import("../tokens.ts");
const { contrastRatio } = await import("../color-engine.ts");
const { exportPageTSX } = await import("./export.ts");
const { nodeRegistry } = await import("./registry.ts");
const { appearanceFieldsFor, appearanceParts } = await import("./appearance.ts");
const { createInsertionNode } = await import("../composer/insertion.ts");
const { Badge, Button, Card, Checkbox, Input, Switch, Text } = await import("../components/index.ts");
const { Container, Stack } = await import("../layout/index.tsx");
const fixture = JSON.parse(readFileSync(new URL("./account-settings.json", import.meta.url), "utf8"));
const document = (children) => ({ version: 1, id: "parity", name: "Parity", root: { id: "root", kind: "container", children } });
const text = (id, value = "Text") => ({ id, kind: "text", text: value });

// RenderNode wrappers change React useId tree paths. Normalize only generated
// Base UI IDs (including references) and irrelevant attribute order, not content,
// whitespace, classes or other values. This is SSR parity, not CSS/browser acceptance.
function canonicalMarkup(html) {
  const ids = new Map();
  for (const match of html.matchAll(/\sid="(base-ui-_R_[^"\s]+_)"/g)) {
    assert.equal(ids.has(match[1]), false, "generated IDs must be unique");
    ids.set(match[1], `parity-id-${ids.size}`);
  }
  return html.replace(/<([a-z][a-z0-9-]*)(\s[^<>]*?)?(\/?)>/g, (_, tag, attributes = "", close) => {
    const attrs = [...attributes.matchAll(/([^\s=]+)="([^"]*)"/g)].map(([, key, value]) => {
      if (["id", "for", "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-activedescendant"].includes(key)) {
        value = value.replace(/base-ui-_R_[^\s]+_/g, (id) => {
          assert.ok(ids.has(id), `dangling generated ID reference: ${id}`);
          return ids.get(id);
        });
      }
      return ` ${key}="${value}"`;
    });
    return `<${tag}${attrs.sort().join("")}${close}>`;
  });
}

async function parity(input) {
  const original = structuredClone(input);
  const page = parsePageDocument(input);
  const source = exportPageTSX(input, "../components", "../layout");
  const { default: PageContent } = await loader.generated(source);
  const preview = renderToStaticMarkup(createElement(RenderPage, { page }));
  const exported = renderToStaticMarkup(createElement(PageContent));
  assert.equal(canonicalMarkup(exported), canonicalMarkup(preview));
  assert.deepEqual(input, original, "parsing/exporting must not mutate source JSON");
  return { preview, source, page };
}

test("HTML normalization preserves content and ID reference relationships", () => {
  const first = '<label id="base-ui-_R_a_" for="base-ui-_R_b_">Name &amp; text</label><input id="base-ui-_R_b_" name="name"/>';
  const second = '<label for="base-ui-_R_y_" id="base-ui-_R_x_">Name &amp; text</label><input name="name" id="base-ui-_R_y_"/>';
  assert.equal(canonicalMarkup(first), canonicalMarkup(second));
  assert.notEqual(canonicalMarkup(first), canonicalMarkup(second.replace('for="base-ui-_R_y_"', 'for="base-ui-_R_x_"')));
  assert.notEqual(canonicalMarkup(first), canonicalMarkup(second.replace("&amp;", "&lt;")));
  assert.notEqual(canonicalMarkup(first), canonicalMarkup(second.replace('name="name"', 'name="other"')));
  assert.throws(() => canonicalMarkup('<input id="base-ui-_R_a_"/><input id="base-ui-_R_a_"/>'), /unique/);
  assert.throws(() => canonicalMarkup('<label for="base-ui-_R_missing_">Name</label>'), /dangling/);
});

test("account-settings fixture renders the same real components as exported TSX", async () => {
  const { preview } = await parity(fixture);
  assert.match(preview, /<form/);
  assert.match(preview, /type="email"/);
  assert.match(preview, /role="switch"/);
});

test("snapshot bundle keeps themed SSR output equal to exported content in both modes", async () => {
  const system = structuredClone(defaultSystem);
  system.themes.light.global.background = "#fefefe";
  system.themes.dark.global.background = "#121212";
  system.themes.light.global.spacingSm = 7;
  const bundle = parsePageBundle(serializePageBundle(createPageBundle(fixture, system)));
  const { default: PageContent } = await loader.generated(exportPageTSX(bundle.page, "../components", "../layout"));
  for (const mode of ["light", "dark"]) {
    const preview = renderToStaticMarkup(createElement(RenderPageBundle, { bundle, mode }));
    const variables = toCSSVariables(bundle.designSystem.themes[mode], mode);
    const expected = renderToStaticMarkup(createElement("main", {
      "data-ds-theme": mode,
      style: { ...variables, colorScheme: mode, backgroundColor: "var(--ds-background)", color: "var(--ds-foreground)", fontFamily: "var(--ds-font-family)" },
    }, createElement(PageContent)));
    assert.equal(canonicalMarkup(preview), canonicalMarkup(expected));
    assert.match(preview, new RegExp(`data-ds-theme="${mode}"`));
    assert.match(preview, /--ds-spacing-sm:7px/);
    assert.ok(preview.includes(`--ds-background:${mode === "light" ? "#fefefe" : "#121212"}`));
  }
});

test("minimal document and omitted component/layout props preserve defaults", async () => {
  await parity(document([text("only-text")]));
  await parity(document([{ id: "form", kind: "form", props: { action: "/example" }, children: [
    { id: "stack", kind: "stack", children: [
      { id: "card", kind: "card", children: [
        { id: "header", kind: "cardHeader", children: [{ id: "title", kind: "cardTitle", text: "Title" }, { id: "description", kind: "cardDescription", text: "Description" }] },
        { id: "content", kind: "cardContent", children: [{ id: "grid", kind: "grid", children: [{ id: "cell", kind: "gridItem", children: [text("body")] }] }] },
      ] },
      { id: "input", kind: "input", props: { label: "Name", name: "name" } },
      { id: "switch", kind: "switch", props: { label: "Enabled", name: "enabled" } },
      { id: "button", kind: "button", text: "Continue" },
    ] },
  ] }]));
});

test("explicit layout settings and text variants stay in parity", async () => {
  for (const [index, maxWidth] of ["narrow", "wide", "full"].entries()) {
    const input = document([{ id: "stack", kind: "stack", props: {
      direction: index ? "column" : "row", gap: index ? "sm" : "lg", align: index ? "end" : "center", justify: index ? "center" : "between", wrap: !index,
    }, children: [1, 2, 3].map((columns) => ({ id: `grid-${columns}`, kind: "grid", props: { columns, gap: "md" }, children: [1, 2, 3].map((span) => ({ id: `cell-${columns}-${span}`, kind: "gridItem", props: { span }, children: [text(`text-${columns}-${span}`)] })) })) }]);
    input.root.props = { maxWidth };
    await parity(input);
  }
  await parity(document(["h1", "h2", "h3", "paragraph", "caption"].map((variant) => ({ ...text(`text-${variant}`), props: { variant } }))));
});

test("Container retains historical block markup until direction explicitly enables auto layout", async () => {
  const baseline = document([text("first"), text("second")]);
  const original = (await parity(baseline)).preview;
  const rootTag = openingTag(original, "container");
  assert.match(rootTag, /data-max-width="wide"/);
  assert.doesNotMatch(rootTag, /data-(direction|gap|align|justify|wrap)|style=/);
  const dormant = structuredClone(baseline);
  dormant.root.props = { gap: "lg", align: "center", justify: "between", wrap: true };
  assert.equal((await parity(dormant)).preview, original, "inactive options must not add attributes, wrappers or change block flow");
  for (const direction of ["row", "column"]) {
    const active = structuredClone(baseline); active.root.props = { direction };
    const { preview } = await parity(active);
    const root = openingTag(preview, "container");
    assert.match(root, new RegExp(`data-direction="${direction}"`));
    assert.match(root, /data-gap="md"/);
    assert.match(root, /data-align="stretch"/);
    assert.match(root, /data-justify="start"/);
    assert.doesNotMatch(root, /data-wrap|style=/);
  }
  dormant.root.appearance = { gap: 12.25 };
  const gapOnly = openingTag((await parity(dormant)).preview, "container");
  assert.match(gapOnly, /gap:12.25px/);
  assert.doesNotMatch(gapOnly, /data-direction|display:/, "local gap cannot opt into flex on its own");
});

test("Container auto-layout axes and local gap keep direct component and TSX parity", async () => {
  for (const maxWidth of ["narrow", "wide", "full"]) for (const direction of ["row", "column"]) {
    for (const [key, values] of Object.entries(nodeRegistry.container.props)) for (const value of values) {
      const input = document([text("first"), text("second")]);
      const props = { maxWidth, direction, [key]: value };
      input.root.props = props;
      input.root.appearance = { gap: 12.25 };
      const { preview, source } = await parity(input);
      const direct = renderToStaticMarkup(createElement(Container, { ...props, appearance: input.root.appearance, "data-page-node": "root" },
        createElement(Text, { "data-page-node": "first" }, "Text"), createElement(Text, { "data-page-node": "second" }, "Text")));
      assert.equal(canonicalMarkup(preview), canonicalMarkup(direct));
      const root = openingTag(preview, "container");
      assert.match(root, new RegExp(`data-max-width="${props.maxWidth}"`));
      assert.match(root, new RegExp(`data-direction="${props.direction}"`));
      assert.match(root, /gap:12.25px/);
      assert.equal(root.includes('data-wrap="true"'), !!props.wrap);
      assert.match(source, /<Container/);
      assert.doesNotMatch(source, /<Stack/, "direct root children do not need a generated layout wrapper");
    }
  }
});

test("Container flex consumers are gated by direction and use existing shared spacing tokens", () => {
  const css = readFileSync(new URL("../layout/layout.module.css", import.meta.url), "utf8");
  const block = /\.container \{([^}]+)\}/.exec(css)[1];
  assert.doesNotMatch(block, /display:|flex|gap:|align-items:|justify-content:/);
  assert.match(block, /width: 100%/);
  assert.match(block, /max-width: 72rem/);
  assert.match(block, /margin-inline: auto/);
  assert.match(block, /padding-inline: var\(--ds-spacing-lg\)/);
  assert.match(css, /\.container\[data-direction\] \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*gap: var\(--ds-spacing-md\);[^}]*align-items: stretch;[^}]*justify-content: flex-start;/);
  for (const [selector, declaration] of [
    ['[data-direction="row"]', "flex-direction: row"],
    ['[data-direction][data-gap="sm"]', "gap: var(--ds-spacing-sm)"],
    ['[data-direction][data-gap="lg"]', "gap: var(--ds-spacing-lg)"],
    ['[data-direction][data-align="start"]', "align-items: flex-start"],
    ['[data-direction][data-align="center"]', "align-items: center"],
    ['[data-direction][data-align="end"]', "align-items: flex-end"],
    ['[data-direction][data-justify="center"]', "justify-content: center"],
    ['[data-direction][data-justify="end"]', "justify-content: flex-end"],
    ['[data-direction][data-justify="between"]', "justify-content: space-between"],
    ['[data-direction][data-wrap]', "flex-wrap: wrap"],
  ]) assert.ok(css.includes(`.container${selector} { ${declaration}; }`), selector);
});

test("seven-component sample stays in SSR/export parity with booleans and full root", async () => {
  const sample = JSON.parse(readFileSync(new URL("./design-safe.json", import.meta.url), "utf8"));
  const { preview, source } = await parity(sample);
  assert.match(source, /Badge, Button, Card, Checkbox, Input, Switch, Text/);
  assert.match(source, /checked=\{true\}/); assert.match(source, /loading=\{false\}/);
  assert.match(preview, /data-max-width="full"/);
  assert.match(preview, /data-indeterminate/);
});

test("every allowlisted enum/state matches direct real component SSR, including omitted defaults", async () => {
  const components = { badge: Badge, button: Button, card: Card, checkbox: Checkbox, input: Input, switch: Switch, text: Text };
  for (const [kind, Component] of Object.entries(components)) {
    let sequence = 0;
    const base = createInsertionNode(kind, () => `component-${++sequence}`);
    const samples = [base];
    for (const [key, rule] of Object.entries(nodeRegistry[kind].props)) {
      for (const value of Array.isArray(rule) ? rule : rule === "string" ? ["", "Sample"] : rule === "text" && !["label"].includes(key) ? ["Supporting text"] : []) {
        samples.push({ ...base, props: { ...base.props, [key]: value } });
      }
    }
    if (kind === "badge") {
      for (const variant of nodeRegistry.badge.props.variant) for (const tone of nodeRegistry.badge.props.tone) samples.push({ ...base, props: { variant, tone } });
    }
    if (["switch", "checkbox"].includes(kind)) {
      for (const checked of [true, false]) samples.push({ ...base, props: { ...base.props, checked, error: "Invalid choice" } });
    }
    for (const node of samples) {
      const input = document([{ id: "stack", kind: "stack", children: [node] }]);
      const { preview } = await parity(input);
      const children = kind === "card" ? createElement(Card.Content, { "data-page-node": node.children[0].id }) : node.text;
      const direct = renderToStaticMarkup(createElement(Container, { "data-page-node": "root" },
        createElement(Stack, { "data-page-node": "stack" }, createElement(Component, { ...node.props, "data-page-node": node.id }, children))));
      assert.equal(canonicalMarkup(preview), canonicalMarkup(direct), `${kind}: ${JSON.stringify(node.props)}`);
      if (kind === "button" && !node.props?.type) assert.match(preview, /type="button"/);
      if (["switch", "checkbox"].includes(kind) && !node.props?.checked && !node.props?.defaultChecked && !node.props?.indeterminate) assert.match(preview, /aria-checked="false"/);
    }
  }
});

test("hostile text and labels remain escaped literal content, not executable TSX/HTML", async () => {
  const hostile = '</Text><script>alert("x")</script> & " \' {globalThis.__parityInjected = true} \\ \n \u2028 \u2029';
  const input = structuredClone(fixture);
  function poison(node) {
    if (node.text !== undefined) node.text = hostile;
    if (node.props?.label !== undefined) node.props.label = hostile;
    node.children?.forEach(poison);
  }
  poison(input.root);
  const { preview } = await parity(input);
  assert.doesNotMatch(preview, /<script|<\/Text>/);
  assert.match(preview, /&lt;script&gt;/);
  assert.match(preview, /&amp;/);
  assert.match(preview, /&quot;/);
  assert.equal(Object.hasOwn(globalThis, "__parityInjected"), false);
});

function openingTag(html, className) {
  const tag = [...html.matchAll(/<[a-z][^>]*>/g)].map(([tag]) => tag).find((tag) => tag.includes(`__${className}`) && new RegExp(`__${className}(?: |")`).test(tag));
  assert.ok(tag, `Missing ${className}`);
  return tag;
}

test("appearance styles painted controls and independent card/field parts, with export parity", async () => {
  const sample = JSON.parse(readFileSync(new URL("./appearance-specimen.json", import.meta.url), "utf8"));
  const { preview } = await parity(sample);
  assert.match(openingTag(preview, "inputControl"), /padding-top:11px/);
  assert.match(openingTag(preview, "inputControl"), /padding-left:23px/);
  assert.match(openingTag(preview, "inputControl"), /border-color:#b42318/);
  assert.doesNotMatch(openingTag(preview, "field"), /padding-left:23px/);
  assert.match(openingTag(preview, "input"), /padding-top:0/);
  assert.match(openingTag(preview, "input"), /line-height:1.8/);
  assert.match(openingTag(preview, "input"), /text-align:right/);
  assert.doesNotMatch(openingTag(preview, "input"), /background-color/);
  assert.match(openingTag(preview, "label"), /font-weight:700/);
  assert.match(openingTag(preview, "description"), /font-size:12px/);
  assert.match(openingTag(preview, "error"), /gap:6px/);
  assert.match(openingTag(preview, "switch"), /width:76px/);
  assert.match(openingTag(preview, "checkbox"), /width:28px/);
  assert.match(openingTag(preview, "cardHeader"), /padding-bottom:6px/);
  assert.match(openingTag(preview, "cardTitle"), /font-weight:650/);
  assert.match(openingTag(preview, "cardDescription"), /line-height:1.7/);
  assert.match(openingTag(preview, "cardContent"), /gap:18px/);
  assert.match(openingTag(preview, "cardFooter"), /gap:20px/);
  assert.match(openingTag(preview, "grid"), /gap:15px/);
  assert.match(preview, /data-error-icon="warning"/);
  assert.match(preview, /data-error-icon="info"/);
  assert.doesNotMatch(preview, /\s(?:appearance|parts)="/);
});

test("every exposed appearance field reaches the real element in renderer and exported TSX", async () => {
  const sample = JSON.parse(readFileSync(new URL("./appearance-specimen.json", import.meta.url), "utf8"));
  const values = (fields) => Object.fromEntries(fields.map((field) => [field.key, field.type === "color" ? "#123456" : field.type === "select" ? field.options.at(-1) : field.key === "opacity" ? 0.7 : field.key === "fontWeight" ? 600 : field.key === "lineHeight" ? 1.5 : 12.25]));
  function visit(node) {
    node.appearance = values(appearanceFieldsFor(node.kind));
    const parts = appearanceParts(node.kind);
    if (parts.length) node.parts = Object.fromEntries(parts.map(({ key }) => [key, values(appearanceFieldsFor(node.kind, key))]));
    node.children?.forEach(visit);
  }
  visit(sample.root);
  const { preview } = await parity(sample);
  for (const className of ["container", "stack", "grid", "gridItem", "card", "cardHeader", "cardTitle", "cardDescription", "cardContent", "cardFooter", "text", "inputControl", "switch", "checkbox", "button", "badge", "field", "label", "description", "error", "choice"]) {
    const tag = openingTag(preview, className);
    for (const entry of ["width:12.25px", "height:12.25px", "padding-top:12.25px", "padding-right:12.25px", "padding-bottom:12.25px", "padding-left:12.25px", "margin-top:12.25px", "margin-right:12.25px", "margin-bottom:12.25px", "margin-left:12.25px", "border-top-left-radius:12.25px", "border-top-right-radius:12.25px", "border-bottom-right-radius:12.25px", "border-bottom-left-radius:12.25px", "background-color:#123456", "border-color:#123456", "border-width:12.25px", "opacity:0.7", "box-shadow:var(--ds-shadow-lg)"]) assert.ok(tag.includes(entry), `${className}: ${entry}`);
  }
});

test("error placement/icon enums and hidden label appearance preserve semantic markup", async () => {
  for (const kind of ["input", "switch", "checkbox"]) for (const errorPosition of ["above", "below"]) for (const errorIcon of ["none", "info", "warning"]) {
    const input = document([{ id: "stack", kind: "stack", children: [{ id: "field", kind, props: { name: "test", label: "Visible label", hideLabel: true, description: "Help text", error: "Error text", errorPosition, errorIcon }, parts: { label: { width: 200, paddingTop: 20 }, error: { fontWeight: 700 } } }] }]);
    const { preview } = await parity(input);
    assert.match(preview, /aria-invalid="true"/);
    assert.match(preview, /Visible label/);
    assert.match(preview, /Help text/);
    const errorIndex = preview.indexOf("Error text");
    assert.equal(errorIndex < preview.indexOf("Visible label"), errorPosition === "above");
    assert.equal(errorIndex > preview.indexOf("Help text"), errorPosition === "below");
    const hidden = [...preview.matchAll(/<[a-z][^>]*>/g)].map(([tag]) => tag).find((tag) => /class="[^"]*sr-only/.test(tag));
    assert.ok(hidden);
    assert.doesNotMatch(hidden, /style=/, "instance dimensions must not unhide the label wrapper");
    if (errorIcon === "none") assert.doesNotMatch(preview, /data-error-icon/);
    else {
      assert.match(preview, new RegExp(`data-error-icon="${errorIcon}"`));
      assert.match(preview, /<svg[^>]+aria-hidden="true"[^>]+focusable="false"/);
    }
  }
});

test("field owners and part markers are stable without moving the native node identity", async () => {
  for (const kind of ["input", "switch", "checkbox"]) {
    const field = { id: `owned-${kind}`, kind, props: { label: "Owned field", name: kind, description: "Help", error: "Error", errorPosition: "above", errorIcon: "info" } };
    const { preview } = await parity(document([{ id: "stack", kind: "stack", children: [field] }]));
    const tags = [...preview.matchAll(/<[a-z][^>]*>/g)].map(([tag]) => tag);
    const owner = tags.filter((tag) => tag.includes(`data-page-owner="${field.id}"`));
    assert.equal(owner.length, 1);
    assert.match(owner[0], /data-appearance-part="root"/);
    assert.doesNotMatch(owner[0], /data-page-node/);
    const native = tags.filter((tag) => tag.includes(`data-page-node="${field.id}"`));
    assert.equal(native.length, 1);
    assert.match(native[0], kind === "input" ? /^<input\b/ : new RegExp(`role="${kind}"`));
    const marked = tags.map((tag) => /data-appearance-part="([^"]+)"/.exec(tag)?.[1]).filter(Boolean);
    assert.deepEqual(marked.slice().sort(), appearanceParts(kind).map(({ key }) => key).sort());
    const control = tags.find((tag) => tag.includes('data-appearance-part="control"'));
    if (kind === "input") {
      assert.match(control, /^<div\b/);
      assert.doesNotMatch(native[0], /data-appearance-part/, "Input's painted shell, not its native input, is the appearance control");
    } else assert.equal(control, native[0]);
    const Component = { input: Input, switch: Switch, checkbox: Checkbox }[kind];
    const standalone = renderToStaticMarkup(createElement(Component, { label: "Standalone" }));
    assert.doesNotMatch(standalone, /data-page-owner/);
    assert.match(standalone, /data-appearance-part="root"/);
  }
});

test("above-error instance overrides retain Base UI SSR label associations and description/error IDs", async () => {
  const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
  const tags = (html) => [...html.matchAll(/<[a-z][^>]*>/g)].map(([tag]) => ({ tag, ...attributes(tag) }));
  // Base UI adds dynamic described-by/labelled-by links on hydration. Compare its
  // complete SSR association attributes, rather than claiming SSR wires those effects.
  const associations = (html) => tags(canonicalMarkup(html)).map((tag) => Object.fromEntries(Object.entries(tag).filter(([key]) => ["id", "for", "role", "name", "type", "tabindex"].includes(key) || key.startsWith("aria-")))).filter((entry) => Object.keys(entry).length);
  for (const kind of ["input", "switch", "checkbox"]) for (const hideLabel of [false, true]) {
    const input = document([{ id: "stack", kind: "stack", children: [{ id: "field", kind, props: { label: "Accessible field name", name: "field-value", description: "Accessible description", error: "Accessible error", errorPosition: "above", errorIcon: "warning", hideLabel } }] }]);
    const baseline = (await parity(input)).preview;
    input.root.children[0].children[0].appearance = { background: "#eeeeee", color: "#eeeeee", borderWidth: 0, shadow: "none" };
    input.root.children[0].children[0].parts = { root: { background: "#eeeeee" }, label: { color: "#eeeeee", paddingTop: 8 }, description: { color: "#eeeeee" }, error: { color: "#eeeeee", fontSize: 16 } };
    const { preview } = await parity(input);
    assert.deepEqual(associations(preview), associations(baseline), `${kind}: styling must not change semantic associations`);
    const elements = tags(preview);
    const painted = elements.find((tag) => tag["data-appearance-part"] === "control");
    const inline = Object.fromEntries(painted.style.split(";").map((declaration) => declaration.split(":")));
    assert.equal(contrastRatio(inline.color, inline["background-color"]), 1, "the rendered instance can fail contrast even with intact semantics");
    const label = elements.find((tag) => tag.tag.startsWith("<label"));
    const labelledInput = elements.find((tag) => tag.id === label.for);
    assert.ok(label.id && labelledInput?.tag.startsWith("<input"));
    assert.equal(labelledInput.name, "field-value");
    for (const part of ["description", "error"]) assert.ok(elements.find((tag) => tag["data-appearance-part"] === part)?.id, `${part} keeps its Base UI message ID`);
    assert.match(preview, /Accessible field name/);
    assert.match(preview, /Accessible description/);
    assert.ok(preview.indexOf("Accessible error") < preview.indexOf("Accessible field name"));
    assert.equal(elements.find((tag) => tag["data-page-node"] === "field")["aria-invalid"], "true");
    assert.match(preview, /<svg[^>]+aria-hidden="true"[^>]+focusable="false"/);
    assert.doesNotMatch(preview, /style="[^"]*outline/);
  }
  const css = readFileSync(new URL("../components/components.module.css", import.meta.url), "utf8");
  assert.match(css, /\.button:focus-visible,\s*\.inputControl:has\(:focus-visible\),\s*\.switch:focus-visible,\s*\.checkbox:focus-visible\s*\{\s*outline: var\(--ds-focus-ring-width\) solid var\(--ds-primary-focus\);\s*outline-offset: var\(--ds-focus-ring-offset\);/);
});

test("omitted and empty appearance keep the same default markup", async () => {
  const sample = JSON.parse(readFileSync(new URL("./design-safe.json", import.meta.url), "utf8"));
  const original = (await parity(sample)).preview;
  function empty(node) { node.appearance = {}; if (appearanceParts(node.kind).length) node.parts = {}; node.children?.forEach(empty); }
  empty(sample.root);
  assert.equal((await parity(sample)).preview, original);
});

test("legacy buttonType normalizes before both render paths without retaining alias", async () => {
  for (const type of ["button", "submit"]) {
    const input = document([{ id: "stack", kind: "stack", children: [{ id: "button", kind: "button", props: { buttonType: type }, text: "Continue" }] }]);
    const { page, source, preview } = await parity(input);
    assert.deepEqual(page.root.children[0].children[0].props, { type });
    assert.doesNotMatch(source, /buttonType/);
    assert.match(preview, new RegExp(`type="${type}"`));
    const current = structuredClone(input);
    current.root.children[0].children[0].props = { type };
    assert.equal((await parity(current)).preview, preview);
  }
});
