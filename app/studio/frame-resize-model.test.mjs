import assert from "node:assert/strict";
import test from "node:test";
import { resizeCornerPatch, resizeInitial, resizeValue, resizePreviewVariables } from "./frame-resize-model.ts";
import { componentRecipeVariables, componentRecipeIds, componentRecipeOptions, componentRecipeParts } from "./component-recipes.ts";
import { frameSizeFields } from "./frame-size-model.ts";
import { applyScopedRecipePatch } from "./recipe-edit-scope.ts";
import { defaultSystem } from "./tokens.ts";

test("resize starts at rendered border box, retaining unconstrained authored fractions", () => {
  assert.equal(resizeInitial(123.125, 123.125123), 123.125123);
  assert.equal(resizeInitial(200, 100), 200);
  for (const value of [undefined, "hug", "fill"]) assert.equal(resizeInitial(120.5, value), 120.5);
  assert.equal(resizeValue(120.125123, 10), 130.125123);
  assert.equal(resizeValue(120.125, 10, true), 121.125);
  assert.equal(resizeValue(12.125, 0), 12.125);
  assert.equal(resizeValue(12, -20), 0);
  assert.equal(resizeValue(9999, 20), 10000);
});
for (const component of componentRecipeIds) test(`${component}: every supported resize preview matches its saved recipe CSS helpers`, () => {
  for (const option of componentRecipeOptions(component)) for (const { key: part } of componentRecipeParts(component, option.key)) {
    const selection = { component, recipe: option.key, part, target: "frame" };
    for (const { key: axis } of frameSizeFields(selection)) {
      const theme = structuredClone(defaultSystem.themes.light);
      theme.componentRecipes = { [component]: { [option.key]: { [part]: { paddingLeft: 5.125, minWidth: 13 } } } };
      const before = structuredClone(theme);
      const preview = resizePreviewVariables(theme, selection, { [axis]: 64.625 });
      const saved = applyScopedRecipePatch(theme.componentRecipes, selection, { [axis]: 64.625 });
      const variables = componentRecipeVariables(saved);
      for (const [key, value] of Object.entries(preview)) assert.equal(value, variables[key]);
      assert.deepEqual(theme, before);
      assert.ok(Object.keys(preview).some(key => key.endsWith('-box-sizing')));
      if (axis === 'height') assert.ok(Object.entries(preview).some(([key,value])=>key.endsWith('-min-height')&&value==='0px'));
      if (component === 'switch' && part === 'control') assert.ok(Object.entries(preview).some(([key,value])=>key.endsWith('-thumb-transform')&&value==='none'));
      if (component === 'text' || component === 'card' && part === 'title') assert.ok(Object.entries(preview).some(([key,value])=>key.endsWith('-box-display')&&value==='inline-block'));
    }
  }
});
test("resize height respects explicitly authored minHeight rather than manufacturing a zero minimum", () => {
  const theme = structuredClone(defaultSystem.themes.light);
  const selection = { component:'button', recipe:'outline.sm', part:'root', target:'frame' };
  theme.componentRecipes = { button: { 'outline.sm': { root: { minHeight: 44.25 } } } };
  const variables = resizePreviewVariables(theme,selection,{ height: 20 });
  assert.equal(variables['--button-recipe-outline-sm-root-min-height'],'44.25px');
});
test("corner resize fixes only changed axes and previews both axes like saved CSS", () => {
  assert.equal(resizeCornerPatch({ width: 80, height: 32 }, { width: 80, height: 32 }), null);
  assert.deepEqual(resizeCornerPatch({ width: 80, height: 32 }, { width: 92.5, height: 32 }), { width: 92.5 });
  assert.deepEqual(resizeCornerPatch({ width: 80, height: 32 }, { width: 80, height: 40 }), { height: 40 });
  assert.deepEqual(resizeCornerPatch({ width: 80, height: 32 }, { width: 90, height: 40 }), { width: 90, height: 40 });
  for (const component of componentRecipeIds) for (const option of componentRecipeOptions(component)) for (const { key: part } of componentRecipeParts(component, option.key)) {
    const selection = { component, recipe: option.key, part, target: "frame" };
    if (frameSizeFields(selection).length !== 2) continue;
    const theme = structuredClone(defaultSystem.themes.light);
    theme.componentRecipes = { [component]: { [option.key]: { [part]: { width: "hug", paddingTop: 3.5 } } } };
    const preview = resizePreviewVariables(theme, selection, { width: 70.25, height: 30.5 });
    const saved = componentRecipeVariables(applyScopedRecipePatch(theme.componentRecipes, selection, { width: 70.25, height: 30.5 }));
    for (const [key, value] of Object.entries(preview)) assert.equal(value, saved[key], `${component}/${option.key}/${part} ${key}`);
  }
});
