import assert from "node:assert/strict";
import test from "node:test";
import { spacingDragFields, spacingDragValue } from "./spacing-drag.ts";
import { componentRecipeIds, componentRecipeOptions, componentRecipeParts, componentRecipeFields } from "./component-recipes.ts";
import { applyScopedRecipePatch, recipeEditTargets } from "./recipe-edit-scope.ts";

for (const component of componentRecipeIds) test(`${component}: direct spacing editing exposes only supported frame fields and shares the inspector write scope`, () => {
  for (const recipe of componentRecipeOptions(component)) for (const { key: part } of componentRecipeParts(component, recipe.key)) {
    const selection = { component, recipe: recipe.key, part, target: "frame" };
    for (const kind of ["padding", "margin"]) {
      const fields = spacingDragFields(selection, kind);
      assert.deepEqual(fields, componentRecipeFields(component, part, "frame", recipe.key).filter(field => field.group === kind));
      assert.deepEqual(spacingDragFields({ ...selection, target: "text" }, kind), []);
      for (const field of fields) {
        const result = applyScopedRecipePatch(undefined, selection, { [field.key]: 12.125 });
        assert.deepEqual(Object.keys(result[component]), recipeEditTargets(selection, field.key).map(option => option.key));
        for (const peer of Object.values(result[component])) assert.deepEqual(peer, { [part]: { [field.key]: 12.125 } });
      }
    }
  }
});

test("padding grows inward, margin outward; only the dragged axis contributes", () => {
  const selection = { component: "card", recipe: "outlined.md", part: "root", target: "frame" };
  for (const kind of ["padding", "margin"]) for (const field of spacingDragFields(selection, kind)) {
    const sign = /Top|Left$/.test(field.key) ? 1 : -1;
    const direction = sign * (kind === "margin" ? -1 : 1);
    const horizontal = /Left|Right$/.test(field.key);
    assert.equal(spacingDragValue(field, 12.125, horizontal ? direction * 8 : 99, horizontal ? 99 : direction * 8), 20.125);
    assert.equal(spacingDragValue(field, 12.125, 0, 0), 12.125);
    assert.equal(spacingDragValue(field, 12.125, horizontal ? direction * 10 : 0, horizontal ? 0 : direction * 10, true), 13.125);
    assert.equal(spacingDragValue(field, 999, horizontal ? direction * 100 : 0, horizontal ? 0 : direction * 100), 1000);
    assert.equal(spacingDragValue(field, 0, horizontal ? -direction * 2000 : 0, horizontal ? 0 : -direction * 2000), kind === "padding" ? 0 : -1000);
  }
});
