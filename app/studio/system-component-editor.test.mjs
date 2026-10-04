import assert from "node:assert/strict";
import test, { after } from "node:test";
import { registerHooks } from "node:module";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./page-document/parity-loader.mjs";
import { componentIds, defaultSystem } from "./tokens.ts";
import { componentStyleFields, componentStyleParts } from "./component-styles.ts";

const nextResolution = registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === "next/link" ? "next/link.js" : specifier, context); } });
const loader = installParityLoader();
const { SystemComponentEditor } = await import("./system-component-editor.tsx");
const { ComponentStarterPreview } = await import("./component-starter-preview.tsx");
after(() => { loader.cleanup(); nextResolution.deregister(); });
const noop = () => {};
const panel = (component, tab, part = "root", extra = {}) => renderToStaticMarkup(h(SystemComponentEditor, {
  component, tab, part, theme: defaultSystem.themes.light, mode: "light", onTabChange: noop, onPartChange: noop,
  onDefaultsChange: noop, onStylesChange: noop, children: h("p", null, "Variant paint controls"), ...extra,
}));
const starter = (component, extra = {}) => renderToStaticMarkup(h(ComponentStarterPreview, { component, onSelectPart: noop, onEditParameters: noop, ...extra }));

test("System Parameters and Styles are accessible separate panels, not one long inspector", () => {
  for (const component of componentIds) {
    const parameters = panel(component, "parameters"), styles = panel(component, "styles");
    assert.match(parameters, /role="tablist"[^>]*aria-label="Component editor"|aria-label="Component editor"[^>]*role="tablist"/);
    assert.match(parameters, /role="tabpanel"/);
    assert.ok(parameters.includes(`system-default-${component}-size`));
    assert.doesNotMatch(parameters, /system-style-|Variant paint controls|System component part/);
    assert.match(styles, /System component part/);
    assert.match(styles, /Variant paint controls/);
    assert.doesNotMatch(styles, /system-default-/);
    assert.ok(styles.includes('data-system-base-tokens="true"'), "base-token section remains available behind a collapsed summary");
  }
  assert.equal(panel(null, "styles"), "<p>Variant paint controls</p>", "foundation workflows pass through unchanged");
});

test("System layer controls match the consumed allowlist; independent sides and reset are available", () => {
  for (const component of componentIds) for (const { key: part } of componentStyleParts(component)) {
    const html = panel(component, "styles", part);
    for (const field of componentStyleFields(component, part)) assert.ok(html.includes(`id="system-style-${component}-${part}-${field.key}"`), `${component}.${part}.${field.key}`);
    assert.match(html, /aria-label="Link corners" aria-pressed="false"/);
    assert.match(html, /aria-label="Link padding sides" aria-pressed="false"/);
    assert.match(html, /Reset layer styles/);
  }
  const theme = { ...defaultSystem.themes.light, componentStyles: { card: { title: { fontSize: 27.25, color: "#123456" } } } };
  const html = panel("card", "styles", "title", { theme });
  assert.match(html, /id="system-style-card-title-fontSize"[^>]*value="27\.25"/);
  assert.match(html, /Reset title Font size/);
  assert.match(html, /value="#123456"/);
});

test("starting specimens use the same complete parameters as insertion without local style overrides", () => {
  const defaults = { card: { slots: { title: "Authored title", description: "Authored subtitle", content: "Authored body", action: "Authored action" } } };
  const html = starter("card", { defaults });
  for (const text of Object.values(defaults.card.slots)) assert.ok(html.includes(text));
  assert.equal((html.match(/data-page-node=/g) ?? []).length, 10, "Card, 7 descendants and 2 layout adapters");
  assert.match(html, /Edit parameters/);
  assert.doesNotMatch(html, /style="/);
  const input = starter("input");
  assert.match(input, /Email address/); assert.match(input, /you@example.com/);
});

test("error and hidden-label samples are temporary and clearly separate from insertion content", () => {
  const defaults = { input: { props: { hideLabel: true, description: "" } } }, before = structuredClone(defaults);
  const error = starter("input", { defaults, part: "error" });
  assert.match(error, /error layer sample · not saved as content/);
  assert.match(error, /Please check this field\./);
  assert.doesNotMatch(starter("input", { defaults }), /Please check this field\./);
  assert.match(starter("input", { defaults, part: "label" }), /label layer sample · not saved as content/);
  assert.match(starter("input", { defaults, part: "description" }), /Helpful context for this field\./);
  assert.deepEqual(defaults, before);
});
