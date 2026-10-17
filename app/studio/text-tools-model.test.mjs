import assert from "node:assert/strict";
import test from "node:test";
import { textToolFields, textToolPatch, textToolPreviewVariables, textToolScope, textToolScrub, textToolSource } from "./text-tools-model.ts";
import { componentRecipeIds, componentRecipeOptions, componentRecipeParts, componentRecipeVariables } from "./component-recipes.ts";
import { applyScopedRecipePatch, recipeEditTargets } from "./recipe-edit-scope.ts";
import { defaultSystem } from "./tokens.ts";

const field = (fields, key) => fields.find(entry => entry.key === key);

test("text tools appear only on text targets with consumed typography/color fields", () => {
  for (const component of componentRecipeIds) for (const option of componentRecipeOptions(component)) for (const part of componentRecipeParts(component, option.key)) {
    const selection = { component, recipe: option.key, part: part.key, target: part.target };
    const fields = textToolFields(selection);
    if (part.target !== "text") assert.deepEqual(fields, [], `${component}/${part.key}`);
    else assert.deepEqual(fields.map(entry => entry.key), ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "color"], `${component}/${part.key}`);
  }
});
test("typography writes the same-size group in both themes; color writes only this combination", () => {
  const selection = { component: "text", recipe: "paragraph.neutral.sm", part: "root", target: "text" };
  const fields = textToolFields(selection);
  assert.equal(textToolScope(selection, field(fields, "fontSize"), "Light"), "6 combinations at sm · both themes");
  assert.equal(textToolScope(selection, field(fields, "color"), "Dark"), "This combination · Dark only");
  assert.deepEqual(recipeEditTargets(selection, "color").map(option => option.key), ["paragraph.neutral.sm"]);
  const button = { component: "button", recipe: "outline.sm", part: "text", target: "text" };
  assert.match(textToolScope(button, field(textToolFields(button), "fontWeight"), "Light"), /^6 combinations at sm/);
});
test("drafts validate without coercion, keep fractions and treat unchanged values as no-ops", () => {
  const fields = textToolFields({ component: "text", recipe: "paragraph.neutral.sm", part: "root", target: "text" });
  assert.deepEqual(textToolPatch(field(fields, "fontSize"), "15.375", "14"), { patch: { fontSize: 15.375 } });
  assert.deepEqual(textToolPatch(field(fields, "fontSize"), "14", "14"), { patch: null });
  assert.deepEqual(textToolPatch(field(fields, "lineHeight"), "1.45", "1.5"), { patch: { lineHeight: 1.45 } });
  assert.deepEqual(textToolPatch(field(fields, "color"), "#1A2B3C", "#1a2b3c"), { patch: null });
  assert.deepEqual(textToolPatch(field(fields, "color"), "#123456", "#000000"), { patch: { color: "#123456" } });
  for (const [key, text] of [["fontSize", ""], ["fontSize", "12px"], ["fontSize", "0"], ["fontWeight", "450.5"], ["lineHeight", "20"], ["color", "red"], ["color", "#12345"]]) {
    assert.ok("error" in textToolPatch(field(fields, key), text, "1"), `${key}=${text}`);
  }
});
test("label scrubbing is clamped, integer for weight and fine with Alt", () => {
  const fields = textToolFields({ component: "text", recipe: "paragraph.neutral.sm", part: "root", target: "text" });
  assert.equal(textToolScrub(field(fields, "fontSize"), 14.5, 10), 19.5);
  assert.equal(textToolScrub(field(fields, "fontSize"), 14, 10, true), 14.5);
  assert.equal(textToolScrub(field(fields, "fontSize"), 2, -40), 1);
  assert.equal(textToolScrub(field(fields, "fontWeight"), 400, 25), 600);
  assert.equal(textToolScrub(field(fields, "fontWeight"), 400, 25, true), 600);
  assert.equal(textToolScrub(field(fields, "lineHeight"), 1.5, 4), 1.6);
  assert.equal(textToolScrub(field(fields, "fontSize"), 14, 1), 14);
});
test("source reports stored overrides and peer-only resets without guessing from rendered values", () => {
  const theme = structuredClone(defaultSystem.themes.light);
  const selection = { component: "text", recipe: "paragraph.neutral.sm", part: "root", target: "text" };
  const size = field(textToolFields(selection), "fontSize");
  assert.equal(textToolSource(theme, selection, size).own, undefined);
  assert.equal(textToolSource(theme, selection, size).resettable, false);
  theme.componentRecipes = { text: { "paragraph.primary.sm": { root: { fontSize: 18 } } } };
  assert.equal(textToolSource(theme, selection, size).own, undefined);
  assert.equal(textToolSource(theme, selection, size).resettable, true, "a peer override in the same group is resettable");
});
test("preview variables equal saved recipe CSS for every text layer", () => {
  for (const component of componentRecipeIds) for (const option of componentRecipeOptions(component)) for (const part of componentRecipeParts(component, option.key)) {
    const selection = { component, recipe: option.key, part: part.key, target: part.target };
    if (!textToolFields(selection).length) continue;
    const theme = structuredClone(defaultSystem.themes.light);
    theme.componentRecipes = { [component]: { [option.key]: { [part.key]: { letterSpacing: 0.25 } } } };
    for (const values of [{ fontSize: 17.5 }, { fontWeight: 600 }, { lineHeight: 1.35 }, { color: "#123456" }, { textAlign: "center" }]) {
      const preview = textToolPreviewVariables(theme, selection, values);
      const saved = componentRecipeVariables(applyScopedRecipePatch(theme.componentRecipes, selection, values));
      for (const [key, value] of Object.entries(preview)) assert.equal(value, saved[key], `${component}/${option.key}/${part.key} ${key}`);
    }
  }
});
