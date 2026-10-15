import assert from "node:assert/strict";
import test from "node:test";
import { defaultSystem } from "./tokens.ts";
import { appearanceFields } from "./components/appearance.ts";
import { componentRecipeIds, componentRecipeOptions, componentRecipeParts, componentRecipeFields } from "./component-recipes.ts";
import { componentStyleParts, componentStyleFields } from "./component-styles.ts";
import { styleSourceInfo } from "./style-sources.ts";

const base = defaultSystem.themes.light;
const field = key => appearanceFields.find(field => field.key === key);
const cardTitle = { component: "card", recipe: "outlined.md", part: "title", target: "text" };

test("source metadata distinguishes exact, shared and CSS defaults without comparing rendered values", () => {
  const theme = { ...base, componentRecipes: { card: { "outlined.md": { title: { fontSize: 20 } } } }, componentStyles: { card: { title: { fontSize: 20 } } } };
  const before = structuredClone(theme);
  const exact = styleSourceInfo(theme, cardTitle, field("fontSize"));
  assert.equal(exact.current.kind, "recipe");
  assert.equal(exact.current.label, "This combination");
  assert.equal(exact.current.variable, "--card-recipe-outlined-md-title-font-size");
  assert.equal(exact.afterReset.kind, "shared");
  assert.equal(exact.afterReset.variable, "--card-part-title-font-size");
  assert.equal(exact.overridden, true);
  assert.equal(exact.themeSpecific, false);
  const shared = styleSourceInfo(theme, { ...cardTitle, recipe: "outlined.sm" }, field("fontSize"));
  assert.equal(shared.current.kind, "shared");
  assert.equal(shared.overridden, false);
  const defaults = styleSourceInfo(base, cardTitle, field("fontSize"));
  assert.equal(defaults.current.kind, "fallback");
  assert.equal(defaults.current.variable, undefined, "a matching pixel value cannot identify its final token source");
  assert.match(defaults.current.description, /parent styles/);
  assert.deepEqual(theme, before);
});

test("Card descendant text never labels legacy slot typography as its source or reset target", () => {
  for (const part of ["content", "footer"]) {
    const theme = { ...base, componentStyles: { card: { [part]: { fontSize: 99, color: "#123456" } } }, componentRecipes: { card: { "outlined.md": { [part]: { fontSize: 17 } } } } };
    const selection = { component: "card", recipe: "outlined.md", part, target: "text" };
    const source = styleSourceInfo(theme, selection, field("fontSize"));
    assert.equal(source.current.kind, "recipe");
    assert.equal(source.afterReset.kind, "fallback");
    assert.equal(source.afterReset.label, "Nested component defaults");
    assert.match(source.afterReset.description, /own recipes, shared styles and defaults/);
    assert.match(source.afterReset.description, /Shared Card slot typography does not/);
    assert.equal(styleSourceInfo(theme, selection, field("color")).current.kind, "fallback");
    const wrapper = styleSourceInfo(theme, { component: "card", part }, field("fontSize"));
    assert.equal(wrapper.current.kind, "shared", "shared slot metadata describes the wrapper, not its nested Text/Button");
  }
});

test("Button labels fall back through root CSS, not an invented shared text-part variable", () => {
  const theme = { ...base, componentStyles: { button: { root: { fontSize: 22 } } } };
  const scope = { component: "button", recipe: "primary.md", part: "text", target: "text" };
  const source = styleSourceInfo(theme, scope, field("fontSize"));
  assert.equal(source.current.kind, "fallback");
  assert.equal(source.current.variable, undefined);
  assert.equal(source.editVariable, "--button-recipe-primary-md-text-font-size");
  assert.throws(() => styleSourceInfo(theme, scope, field("paddingLeft")), /does not consume/);
});

test("Input error sources remain isolated by layer and size; colors identify the current theme record", () => {
  const theme = { ...base, componentRecipes: { input: { "invalid.md": { error: { color: "#123456", fontSize: 17 } } } }, componentStyles: { input: { label: { fontSize: 25 }, error: { fontSize: 12 } } } };
  const scope = { component: "input", recipe: "invalid.md", part: "error", target: "text" };
  assert.equal(styleSourceInfo(theme, scope, field("color")).themeSpecific, true);
  assert.equal(styleSourceInfo(theme, scope, field("fontSize")).themeSpecific, false);
  assert.equal(styleSourceInfo(theme, scope, field("fontSize")).afterReset.variable, "--input-part-error-font-size");
  assert.equal(styleSourceInfo(theme, { ...scope, recipe: "invalid.sm" }, field("color")).current.kind, "fallback");
  assert.equal(styleSourceInfo(theme, { ...scope, recipe: "invalid.sm" }, field("fontSize")).current.kind, "shared");
  assert.throws(() => styleSourceInfo(theme, { ...scope, recipe: "default.md" }, field("fontSize")), /does not consume/);
  const dark = styleSourceInfo({ ...theme, componentRecipes: {} }, scope, field("color"));
  assert.equal(dark.current.kind, "fallback", "Light color provenance never leaks into a different supplied theme");
});

test("generated minHeight provenance and reset follow authored height rather than freezing zero", () => {
  const scope = { component: "card", recipe: "outlined.md", part: "root", target: "frame" };
  const theme = { ...base, componentRecipes: { card: { "outlined.md": { root: { height: 90 } } } }, componentStyles: { card: { root: { minHeight: 40, height: 80 } } } };
  const source = styleSourceInfo(theme, scope, field("minHeight"));
  assert.equal(source.current.kind, "generated");
  assert.equal(source.current.variable, "--card-recipe-outlined-md-root-height");
  assert.equal(source.overridden, false);
  const direct = styleSourceInfo({ ...theme, componentRecipes: { card: { "outlined.md": { root: { height: 90, minHeight: 0 } } } } }, scope, field("minHeight"));
  assert.equal(direct.current.kind, "recipe");
  assert.equal(direct.afterReset.kind, "generated");
  assert.equal(direct.overridden, true, "zero is an explicit authored value");
  const shared = styleSourceInfo({ ...theme, componentRecipes: {} }, scope, field("minHeight"));
  assert.equal(shared.current.kind, "shared");
  const generatedShared = styleSourceInfo({ ...theme, componentRecipes: {}, componentStyles: { card: { root: { height: "hug" } } } }, scope, field("minHeight"));
  assert.equal(generatedShared.current.kind, "generated");
  assert.equal(generatedShared.current.variable, "--card-part-root-height");
  const resetShared = styleSourceInfo(theme, { component: "card", part: "root" }, field("minHeight"));
  assert.equal(resetShared.current.kind, "shared");
  assert.equal(resetShared.afterReset.kind, "generated");
});

test("shared source editing remains distinct even when exact combinations mask its value", () => {
  const theme = { ...base, componentRecipes: { card: { "outlined.md": { title: { fontSize: 30 } } } }, componentStyles: { card: { title: { fontSize: 17.123456789 } } } };
  const info = styleSourceInfo(theme, { component: "card", part: "title" }, field("fontSize"));
  assert.equal(info.current.kind, "shared");
  assert.equal(info.current.variable, "--card-part-title-font-size");
  assert.match(info.current.description, /Exact combination overrides may mask/);
  assert.equal(info.afterReset.kind, "fallback");
  assert.equal(theme.componentStyles.card.title.fontSize, 17.123456789);
});

test("every supported exact/shared field has read-only provenance; no extra fields are exposed", () => {
  for (const component of componentRecipeIds) {
    for (const { key: recipe } of componentRecipeOptions(component)) for (const { key: part } of componentRecipeParts(component, recipe)) for (const target of ["frame", "text"]) {
      for (const field of componentRecipeFields(component, part, target, recipe)) {
        const source = styleSourceInfo(base, { component, recipe, part, target }, field);
        assert.equal(source.overridden, false);
        assert.equal(source.current.kind, "fallback");
        assert.ok(source.editVariable.startsWith(`--${component}-recipe-`));
      }
    }
    for (const { key: part } of componentStyleParts(component)) for (const field of componentStyleFields(component, part)) {
      const source = styleSourceInfo(base, { component, part }, field);
      assert.equal(source.overridden, false);
      assert.equal(source.editVariable, `--${component}-part-${part}-${field.key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}`);
    }
  }
});
