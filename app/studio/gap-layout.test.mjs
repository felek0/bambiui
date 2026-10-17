import assert from "node:assert/strict";
import test from "node:test";
import { gapLayout } from "./gap-layout.ts";
import { spacingDragFields, spacingDragValue } from "./spacing-drag.ts";
import { componentRecipeIds, componentRecipeOptions, componentRecipeParts } from "./component-recipes.ts";

const row = { display: "flex", flexDirection: "row", flexWrap: "nowrap" };
const box = (left, top, width, height) => ({ left, top, width, height });

test("gap slot lies between the first two visual items on the main axis", () => {
  assert.deepEqual(gapLayout(row, [box(30, 2, 20, 10), box(4, 0, 16, 16)]), { axis: "x", slot: box(20, 0, 10, 16) });
  assert.deepEqual(gapLayout({ ...row, display: "inline-flex", flexDirection: "column-reverse" }, [box(0, 40, 50, 20), box(0, 0, 60, 30)]), { axis: "y", slot: box(0, 30, 60, 10) });
  assert.deepEqual(gapLayout(row, [box(0, 0, 10, 10), box(0, 0, 0, 0), box(10, 0, 10, 10)]).slot, box(10, 0, 0, 10), "zero gap is still a draggable position; empty items are ignored");
});
test("gap drag is unavailable without a single-axis visible gap", () => {
  assert.equal(gapLayout(row, [box(0, 0, 10, 10)]).axis, null);
  assert.equal(gapLayout({ ...row, flexWrap: "wrap" }, [box(0, 0, 10, 10), box(20, 0, 10, 10)]).axis, null);
  assert.equal(gapLayout({ ...row, display: "grid" }, [box(0, 0, 10, 10), box(20, 0, 10, 10)]).axis, null);
  assert.equal(gapLayout({ ...row, display: "block" }, [box(0, 0, 10, 10), box(0, 20, 10, 10)]).axis, null);
  assert.match(gapLayout(row, []).reason, /enter the gap value/i);
});
test("gap drags along its axis only, keeps fractions and clamps to the field range", () => {
  const field = { key: "gap", label: "Gap", group: "layout", type: "number", min: 0, max: 1000, step: 1 };
  assert.equal(spacingDragValue(field, 8.25, 12, 40, false, "x"), 20.25);
  assert.equal(spacingDragValue(field, 8.25, 40, -5, false, "y"), 3.25);
  assert.equal(spacingDragValue(field, 8, 30, 0, true, "x"), 11);
  assert.equal(spacingDragValue(field, 4, -20, 0, false, "x"), 0);
  assert.equal(spacingDragValue(field, 999, 20, 0, false, "x"), 1000);
});
test("gap tools exist exactly on the documented frame layers", () => {
  const expected = { button: ["root"], badge: ["root"], input: ["root", "control", "error"], switch: ["root", "row", "error"], checkbox: ["root", "row", "error"], card: ["root", "header", "content", "footer"], text: [] };
  for (const component of componentRecipeIds) {
    const parts = new Set();
    for (const { key: option } of componentRecipeOptions(component)) for (const { key: part } of componentRecipeParts(component, option)) {
      if (spacingDragFields({ component, recipe: option, part, target: "frame" }, "layout").length) parts.add(part);
      assert.deepEqual(spacingDragFields({ component, recipe: option, part, target: "text" }, "layout"), []);
    }
    assert.deepEqual([...parts].sort(), [...expected[component]].sort(), component);
  }
});
