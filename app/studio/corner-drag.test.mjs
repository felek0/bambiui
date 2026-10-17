import assert from "node:assert/strict";
import test from "node:test";
import { spacingDragFields, spacingDragValue, spacingEditPatch } from "./spacing-drag.ts";
import { spacingNumericInitial, spacingNumericValue } from "./spacing-numeric-draft.ts";
import { componentRecipeIds, componentRecipeOptions, componentRecipeParts, componentRecipeFields } from "./component-recipes.ts";
import { applyScopedRecipePatch, recipeEditTargets } from "./recipe-edit-scope.ts";

const selection = { component: "card", recipe: "outlined.md", part: "root", target: "frame" };
const corners = spacingDragFields(selection, "radius");

for (const component of componentRecipeIds) test(`${component}: corners come only from selected frame radius metadata`, () => {
  for (const recipe of componentRecipeOptions(component)) for (const { key: part } of componentRecipeParts(component, recipe.key)) {
    const scope = { component, recipe: recipe.key, part, target: "frame" };
    const fields = spacingDragFields(scope, "radius");
    assert.deepEqual(fields, componentRecipeFields(component, part, "frame", recipe.key).filter(field => field.group === "radius"));
    assert.deepEqual(spacingDragFields({ ...scope, target: "text" }, "radius"), []);
    for (const field of fields) {
      const patch = spacingEditPatch(fields, field, 8, 12.125, true);
      assert.deepEqual(patch, Object.fromEntries(fields.map(candidate => [candidate.key, 12.125])));
      const result = applyScopedRecipePatch(undefined, scope, patch);
      assert.deepEqual(Object.keys(result[component]), recipeEditTargets(scope, field.key).map(option => option.key));
      for (const peer of Object.values(result[component])) assert.deepEqual(peer, { [part]: patch });
    }
  }
});

test("all four corners grow diagonally inward and shrink outward without rounding history", () => {
  assert.equal(corners.length, 4);
  for (const field of corners) {
    const x = field.key.includes("Left") ? 1 : -1;
    const y = field.key.includes("Top") ? 1 : -1;
    assert.equal(spacingDragValue(field, 12.125, x * 8, y * 8), 20.125);
    assert.equal(spacingDragValue(field, 12.125, -x * 8, -y * 8), 4.125);
    assert.equal(spacingDragValue(field, 12.125, x * 10, y * 10, true), 13.125);
    assert.equal(spacingDragValue(field, 12.125, x * 8, -y * 8), 12.125);
    assert.equal(spacingDragValue(field, 12.125, 0, 0), 12.125);
    assert.equal(spacingDragValue(field, 999.125, x * 100, y * 100), field.max);
    assert.equal(spacingDragValue(field, 0.125, -x * 100, -y * 100), field.min);
  }
});

test("independent edits are default; linked no-op preserves divergent history", () => {
  const field = corners[0];
  const history = Object.fromEntries(corners.map((corner, index) => [corner.key, index + 0.125]));
  const initial = history[field.key];
  assert.equal(spacingEditPatch(corners, field, initial, initial, true), null);
  assert.deepEqual({ ...history, ...spacingEditPatch(corners, field, initial, initial, true) }, history);
  assert.deepEqual(spacingEditPatch(corners, field, initial, 19.125), { [field.key]: 19.125 });
  assert.deepEqual(spacingEditPatch(corners.slice(0, 2), field, initial, 19.125, true), { [corners[0].key]: 19.125, [corners[1].key]: 19.125 });
  assert.equal(spacingEditPatch([], field, initial, 19.125, true), null);
  for (const invalid of [NaN, Infinity, -1, 1001]) assert.equal(spacingEditPatch(corners, field, initial, invalid, true), null);
});

test("corner numeric drafts retain clicked authored fraction and reject invalid bounds", () => {
  for (const field of corners) {
    assert.equal(spacingNumericInitial("12.123456px", 12.12, field), 12.123456);
    assert.equal(spacingNumericValue("12.123456", field), 12.123456);
    for (const text of ["", "NaN", "Infinity", "-0.1", "1000.1"]) assert.equal(spacingNumericValue(text, field), null);
    for (const text of ["0", "1000"]) assert.equal(spacingNumericValue(text, field), Number(text));
  }
});
