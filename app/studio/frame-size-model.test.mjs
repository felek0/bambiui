import assert from "node:assert/strict";
import test from "node:test";
import { frameSizeFields, frameSizeSource, frameSizePatch } from "./frame-size-model.ts";
import { componentRecipeIds, componentRecipeOptions, componentRecipeParts } from "./component-recipes.ts";
import { applyScopedRecipePatch, recipeEditTargets } from "./recipe-edit-scope.ts";
import { defaultSystem } from "./tokens.ts";
const selection = { component: "button", recipe: "outline.sm", part: "root", target: "frame" };
const width = frameSizeFields(selection).find(field => field.key === "width");

test("size source separates recipe/shared modes from unknown CSS defaults without measurement guesses", () => {
  const theme = structuredClone(defaultSystem.themes.light);
  assert.equal(frameSizeSource(theme, selection, width).mode, "default");
  assert.equal(frameSizeSource(theme, selection, width).effective, undefined);
  theme.componentStyles = { button: { root: { width: "fill" } } };
  assert.equal(frameSizeSource(theme, selection, width).mode, "default");
  assert.equal(frameSizeSource(theme, selection, width).effective, "fill");
  assert.match(frameSizeSource(theme, selection, width).source, /Shared/);
  theme.componentRecipes = { button: { "outline.sm": { root: { width: 142.125123 } } } };
  assert.equal(frameSizeSource(theme, selection, width).mode, "fixed");
  assert.equal(frameSizeSource(theme, selection, width).effective, 142.125123);
  assert.equal(frameSizeSource(theme, selection, width).source, "This combination");
});

test("numeric size validation, no-op and reset never materialize measured defaults", () => {
  for (const value of ["", " ", "NaN", "Infinity", "10001", "-1", "20px"]) assert.equal(frameSizePatch(width, undefined, "fixed", value), null);
  assert.deepEqual(frameSizePatch(width, undefined, "fixed", "0"), { width: 0 });
  assert.deepEqual(frameSizePatch(width, undefined, "fixed", "123.125123456"), { width: 123.125123456 });
  assert.equal(frameSizePatch(width, 123.125123456, "fixed", "123.125123456"), null);
  assert.equal(frameSizePatch(width, undefined, "default", "999"), null);
  assert.equal(frameSizePatch(width, "hug", "hug", ""), null);
  assert.deepEqual(frameSizePatch(width, "fill", "default", ""), { width: null });
});

for (const component of componentRecipeIds) test(`${component}: size modes and reset use supported same-size layers, retaining other fields`, () => {
  for (const option of componentRecipeOptions(component)) for (const { key: part } of componentRecipeParts(component, option.key)) {
    const selection = { component, recipe: option.key, part, target: "frame" };
    assert.deepEqual(frameSizeFields({ ...selection, target: "text" }), []);
    for (const field of frameSizeFields(selection)) {
      const theme = structuredClone(defaultSystem.themes.light);
      for (const mode of ["hug", "fill", "fixed"]) {
        const patch = frameSizePatch(field, undefined, mode, "137.625");
        const recipes = applyScopedRecipePatch(undefined, selection, patch);
        assert.deepEqual(Object.keys(recipes[component]), recipeEditTargets(selection, field.key).map(peer => peer.key));
        theme.componentRecipes = recipes;
        assert.equal(frameSizeSource(theme, selection, field).resettable, true);
        assert.deepEqual(applyScopedRecipePatch(recipes, selection, { [field.key]: null }), {});
      }
      const peer = recipeEditTargets(selection, field.key).find(peer => peer.key !== option.key);
      if (peer) {
        theme.componentRecipes = { [component]: { [peer.key]: { [part]: { [field.key]: "fill" } } } };
        const source = frameSizeSource(theme, selection, field);
        assert.equal(source.own, undefined);
        assert.equal(source.resettable, true, "peer-only overrides remain resettable");
      }
    }
  }
});
