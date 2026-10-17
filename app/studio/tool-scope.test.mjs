import assert from "node:assert/strict";
import test from "node:test";
import { editScopeLabel, groupResetPatch, groupResettable, rovingIndex, textTargetFor } from "./tool-scope.ts";
import { applyScopedRecipePatch } from "./recipe-edit-scope.ts";
import { defaultSystem } from "./tokens.ts";

test("scope labels name the real write group", () => {
  assert.equal(editScopeLabel({ component: "button", recipe: "outline.sm", part: "root", target: "frame" }, "paddingLeft", "Light"), "6 combinations at sm · both themes");
  assert.equal(editScopeLabel({ component: "button", recipe: "outline.sm", part: "root", target: "frame" }, "background", "Dark"), "This combination · Dark only");
  assert.equal(editScopeLabel({ component: "text", recipe: "h1.neutral.lg", part: "root", target: "text" }, "fontSize", "Light"), "6 combinations at lg · both themes");
});
test("group reset removes only the group's keys across the write group, including peer-only overrides", () => {
  const selection = { component: "button", recipe: "outline.sm", part: "root", target: "frame" };
  const theme = structuredClone(defaultSystem.themes.light);
  const keys = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
  assert.equal(groupResettable(theme, selection, keys), false);
  theme.componentRecipes = { button: { "ghost.sm": { root: { paddingLeft: 3, marginTop: 2 } }, "ghost.md": { root: { paddingLeft: 9 } } } };
  assert.equal(groupResettable(theme, selection, keys), true, "a peer override in the same size group is resettable");
  assert.equal(groupResettable(theme, selection, ["marginLeft"]), false);
  const after = applyScopedRecipePatch(theme.componentRecipes, selection, groupResetPatch(keys));
  assert.deepEqual(after.button["ghost.sm"].root, { marginTop: 2 }, "other groups survive");
  assert.deepEqual(after.button["ghost.md"].root, { paddingLeft: 9 }, "other sizes survive");
});
test("roving toolbar index wraps and supports Home/End", () => {
  assert.equal(rovingIndex("ArrowRight", 2, 3), 0);
  assert.equal(rovingIndex("ArrowLeft", 0, 3), 2);
  assert.equal(rovingIndex("Home", 2, 3), 0);
  assert.equal(rovingIndex("End", 0, 3), 2);
  assert.equal(rovingIndex("Enter", 0, 3), null);
  assert.equal(rovingIndex("ArrowRight", 0, 0), null);
});
test("Frame → Text goes to the same layer, else to a root's only text layer", () => {
  assert.deepEqual(textTargetFor({ component: "button", recipe: "outline.sm", part: "root", target: "frame" }), { component: "button", recipe: "outline.sm", part: "text", target: "text" });
  assert.deepEqual(textTargetFor({ component: "badge", recipe: "outline.primary.sm", part: "root", target: "frame" })?.part, "text");
  assert.deepEqual(textTargetFor({ component: "text", recipe: "paragraph.neutral.sm", part: "root", target: "frame" }), { component: "text", recipe: "paragraph.neutral.sm", part: "root", target: "text" });
  assert.deepEqual(textTargetFor({ component: "input", recipe: "default.sm", part: "control", target: "frame" })?.target, "text");
  assert.equal(textTargetFor({ component: "input", recipe: "default.sm", part: "root", target: "frame" }), null, "several text layers: no guess");
  assert.equal(textTargetFor({ component: "card", recipe: "filled.md", part: "header", target: "frame" }), null);
});
