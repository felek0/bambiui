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
const { exportPageTSX } = await import("./export.ts");
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
  for (const [index, maxWidth] of ["narrow", "wide"].entries()) {
    const input = document([{ id: "stack", kind: "stack", props: {
      direction: index ? "column" : "row", gap: index ? "sm" : "lg", align: index ? "end" : "center", justify: index ? "center" : "between", wrap: !index,
    }, children: [1, 2, 3].map((columns) => ({ id: `grid-${columns}`, kind: "grid", props: { columns, gap: "md" }, children: [1, 2, 3].map((span) => ({ id: `cell-${columns}-${span}`, kind: "gridItem", props: { span }, children: [text(`text-${columns}-${span}`)] })) })) }]);
    input.root.props = { maxWidth };
    await parity(input);
  }
  await parity(document(["h1", "h2", "h3", "paragraph", "caption"].map((variant) => ({ ...text(`text-${variant}`), props: { variant } }))));
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
