import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./page-document/parity-loader.mjs";
import {
  applyComponentRadiusPatch, componentRadiiVariables, componentRadiusResettable, componentRadiusVariable, parseComponentRadii,
  radiusComponentIds,
} from "./component-radii.ts";
import { defaultSystem, exportCSS, parseDesignSystem, shareNonColorTokens, toCSSVariables } from "./tokens.ts";

const loader = installParityLoader();
after(() => loader.cleanup());
const { radiusPresetStyle } = await import("./components/recipe-runtime.ts");
const { Button, Input, Checkbox, Badge, Card, Switch } = await import("./components/index.ts");

test("parse keeps exact sparse corners and rejects unknown keys or invalid values", () => {
  const value = { button: { lg: { sm: { topLeft: 14.25, bottomRight: 0 } } }, card: { sm: { lg: {} } } };
  assert.deepEqual(parseComponentRadii(value), { button: { lg: { sm: { topLeft: 14.25, bottomRight: 0 } } } }, "empty branches are dropped, fractions kept");
  for (const bad of [
    { switch: {} }, { button: { xl: {} } }, { button: { lg: { xs: {} } } }, { button: { lg: { sm: { top: 1 } } } },
    { button: { lg: { sm: { topLeft: -1 } } } }, { button: { lg: { sm: { topLeft: 1001 } } } }, { button: { lg: { sm: { topLeft: "4px" } } } },
    { button: { lg: { sm: { topLeft: Number.NaN } } } }, [], null,
  ]) assert.throws(() => parseComponentRadii(bad), undefined, JSON.stringify(bad));
  assert.deepEqual(radiusComponentIds, ["button", "input", "checkbox", "badge", "card"], "Switch keeps its pill and has no presets");
});

test("variables are sparse, unitized and named per component, preset, size and corner", () => {
  assert.equal(componentRadiusVariable("input", "sm", "lg", "bottomLeft"), "--input-radius-sm-lg-bottom-left");
  assert.deepEqual(componentRadiiVariables({ badge: { md: { sm: { topRight: 3.5 } } } }), { "--badge-radius-md-sm-top-right": "3.5px" });
  assert.deepEqual(componentRadiiVariables(undefined), {});
});

test("patch writes one component/preset/size, removes with null and prunes", () => {
  const radii = { button: { sm: { md: { topLeft: 2 } } } };
  const before = structuredClone(radii);
  const next = applyComponentRadiusPatch(radii, "button", "lg", "md", { topLeft: 20, topRight: 20 });
  assert.deepEqual(next, { button: { sm: { md: { topLeft: 2 } }, lg: { md: { topLeft: 20, topRight: 20 } } } });
  assert.deepEqual(radii, before, "input is not mutated");
  assert.deepEqual(applyComponentRadiusPatch(next, "button", "lg", "md", { topLeft: null, topRight: null }), before);
  assert.deepEqual(applyComponentRadiusPatch(before, "button", "sm", "md", { topLeft: null }), {});
  assert.throws(() => applyComponentRadiusPatch(before, "button", "sm", "md", { topLeft: 2000 }));
  assert.throws(() => applyComponentRadiusPatch(before, "button", "sm", "md", { middle: 2 }));
  assert.equal(componentRadiusResettable(next, "button", "lg", "md"), true);
  assert.equal(componentRadiusResettable(next, "button", "lg", "sm"), false);
});

test("runtime preset style resolves component preset corners, then the shared step; omitted radius adds nothing", () => {
  assert.deepEqual(radiusPresetStyle("button", undefined, "sm"), {});
  assert.deepEqual(radiusPresetStyle("card", "lg", "sm"), {
    "--card-radius-preset-top-left": "var(--card-radius-lg-sm-top-left, var(--ds-radius-lg))",
    "--card-radius-preset-top-right": "var(--card-radius-lg-sm-top-right, var(--ds-radius-lg))",
    "--card-radius-preset-bottom-right": "var(--card-radius-lg-sm-bottom-right, var(--ds-radius-lg))",
    "--card-radius-preset-bottom-left": "var(--card-radius-lg-sm-bottom-left, var(--ds-radius-lg))",
  });
  for (const id of radiusComponentIds) for (const [key, value] of Object.entries(radiusPresetStyle(id, "md", "lg"))) {
    assert.match(key, new RegExp(`^--${id}-radius-preset-`));
    assert.ok(value.includes(componentRadiusVariable(id, "md", "lg", key.replace(`--${id}-radius-preset-`, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()))), "runtime and theme agree on variable names");
  }
});

test("schema v3: older records stay unmaterialized; radii are shared from Light and exported in CSS", () => {
  const old = structuredClone(defaultSystem);
  for (const mode of ["light", "dark"]) delete old.themes[mode].componentRadii;
  const parsed = parseDesignSystem(JSON.stringify(old));
  assert.equal(parsed.themes.light.componentRadii, undefined, "no defaults are materialized");
  assert.equal(parsed.themes.dark.componentRadii, undefined);

  const system = structuredClone(defaultSystem);
  system.themes.light.componentRadii = { button: { lg: { sm: { topLeft: 18 } } } };
  system.themes.dark.componentRadii = { card: { sm: { md: { topLeft: 1 } } } };
  const imported = parseDesignSystem(JSON.stringify(system));
  assert.deepEqual(imported.themes.dark.componentRadii, { button: { lg: { sm: { topLeft: 18 } } } }, "non-color geometry normalizes from Light");
  assert.deepEqual(shareNonColorTokens(imported, "dark").themes.light.componentRadii, imported.themes.dark.componentRadii);
  for (const mode of ["light", "dark"]) assert.equal(toCSSVariables(imported.themes[mode], mode)["--button-radius-lg-sm-top-left"], "18px");
  assert.ok(exportCSS(imported).includes("--button-radius-lg-sm-top-left: 18px;"));

  const bad = structuredClone(system);
  bad.themes.light.componentRadii = { button: { lg: { sm: { topLeft: "18" } } } };
  assert.throws(() => parseDesignSystem(JSON.stringify(bad)), /componentRadii/);
});

test("real components carry preset variables only for an explicit radius; Switch never does", () => {
  const cases = [
    [Button, { size: "sm", children: "Go" }, "button"], [Badge, { size: "sm", children: "New" }, "badge"], [Card, { size: "sm" }, "card"],
    [Input, { size: "sm", label: "Email" }, "input"], [Checkbox, { size: "sm", label: "Agree" }, "checkbox"],
  ];
  for (const [Component, props, id] of cases) {
    const omitted = renderToStaticMarkup(h(Component, props));
    assert.ok(!omitted.includes(`--${id}-radius-preset-`), `${id}: omitted radius keeps the default shape chain`);
    const explicit = renderToStaticMarkup(h(Component, { ...props, radius: "lg" }));
    assert.ok(explicit.includes(`--${id}-radius-preset-top-left:var(--${id}-radius-lg-sm-top-left, var(--ds-radius-lg))`), `${id}: explicit lg resolves its sm-size preset`);
    assert.ok(explicit.includes('data-radius="lg"'));
  }
  assert.ok(!renderToStaticMarkup(h(Switch, { size: "sm", label: "On" })).includes("radius-preset"));
});
