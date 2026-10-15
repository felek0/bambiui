import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  componentRecipeIds, componentRecipeOptions, componentRecipeParts, componentRecipeFields,
  parseComponentRecipes, componentRecipeVariables,
} from "./component-recipes.ts";
import { applyScopedRecipePatch as apply, recipeEditTargets as targets } from "./recipe-edit-scope.ts";

const select = (component, recipe, part = "root", target = "frame") => ({ component, recipe, part, target });
const keys = (selection, key) => targets(selection, key).map(({ key }) => key);
const freeze = (value) => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const colors = new Set(["background", "color", "borderColor"]);
const sample = (field) => field.type === "color" ? "#12AbCd"
  : field.type === "select" ? field.options[0]
    : ({ fontWeight: 651, lineHeight: 1.375, opacity: 0.625 }[field.key] ?? 12.251);

for (const [component, recipe, count] of [
  ["button", "primary.sm", 6], ["input", "default.sm", 3],
  ["switch", "checked.sm", 4], ["checkbox", "unchecked.sm", 4],
  ["badge", "solid.warning.sm", 18], ["card", "outlined.sm", 3],
  ["text", "paragraph.neutral.sm", 6],
]) test(`${component}: explicit same-size membership and applied dimensions`, () => {
  const selection = select(component, recipe);
  const expected = componentRecipeOptions(component).filter((option) => option.size === "sm"
    && (component !== "text" || option.variant === "paragraph")).map(({ key }) => key);
  assert.equal(expected.length, count);
  assert.deepEqual(keys(selection, "width"), expected);
  assert.deepEqual(keys(selection, "background"), [recipe]);
  const result = apply(undefined, selection, { width: 143.125, background: "#12AbCd" });
  assert.deepEqual(Object.keys(result[component]), expected);
  for (const peer of expected) assert.deepEqual(result[component][peer].root,
    { width: 143.125, ...(peer === recipe ? { background: "#12AbCd" } : {}) });
});

test("every consumed field in every recipe/part/target follows the color or peer policy", () => {
  for (const component of componentRecipeIds) for (const option of componentRecipeOptions(component)) {
    for (const { key: part } of componentRecipeParts(component, option.key)) for (const target of ["frame", "text"]) {
      const selection = select(component, option.key, part, target);
      for (const field of componentRecipeFields(component, part, target, option.key)) {
        const expected = colors.has(field.key) ? [option] : componentRecipeOptions(component).filter((peer) =>
          peer.size === option.size && (component !== "text" || peer.variant === option.variant)
          && componentRecipeFields(component, part, target, peer.key).some(({ key }) => key === field.key));
        assert.deepEqual(targets(selection, field.key), expected);
      }
    }
  }
});

test("all non-color field categories write exact fractional values and never unrelated fields", () => {
  for (const [selection, fields] of [
    [select("card", "filled.md", "content"), componentRecipeFields("card", "content", "frame", "filled.md")],
    [select("badge", "subtle.info.lg", "text", "text"), componentRecipeFields("badge", "text", "text", "subtle.info.lg")],
  ]) for (const field of fields) {
    const value = sample(field);
    const result = apply(undefined, selection, { [field.key]: value });
    assert.deepEqual(Object.keys(result), [selection.component]);
    assert.deepEqual(Object.keys(result[selection.component]), keys(selection, field.key));
    for (const parts of Object.values(result[selection.component])) assert.deepEqual(parts, { [selection.part]: { [field.key]: value } });
    assert.strictEqual(apply(freeze(result), selection, { [field.key]: value }), result);
  }
});

test("Text retains each typographic variant while sharing all six tones, for frame and typography", () => {
  for (const variant of ["heading", "h1", "h2", "h3", "h4", "h5", "h6", "paragraph", "label", "caption"]) {
    for (const [target, key, value] of [["text", "fontSize", 23.125], ["frame", "paddingLeft", 3.625]]) {
      const selection = select("text", `${variant}.info.sm`, "root", target);
      const result = apply(undefined, selection, { [key]: value });
      assert.deepEqual(Object.keys(result.text), ["neutral", "primary", "success", "warning", "danger", "info"].map((tone) => `${variant}.${tone}.sm`));
      assert.deepEqual(keys(select("text", `${variant}.info.sm`, "root", "text"), "color"), [`${variant}.info.sm`]);
    }
  }
});

test("conditional error parts include only invalid/readonly Input and invalid choices", () => {
  for (const [component, variants, unavailable] of [
    ["input", ["invalid", "readonly"], ["default"]],
    ["switch", ["invalidChecked", "invalidUnchecked"], ["checked", "unchecked"]],
    ["checkbox", ["invalidChecked", "invalidUnchecked"], ["checked", "unchecked"]],
  ]) for (const size of ["sm", "md", "lg"]) {
    for (const variant of variants) for (const [target, key, value] of [["frame", "gap", 2.375], ["text", "lineHeight", 1.625]]) {
      const selection = select(component, `${variant}.${size}`, "error", target);
      assert.deepEqual(keys(selection, key), variants.map((peer) => `${peer}.${size}`));
      const result = apply(undefined, selection, { [key]: value });
      assert.deepEqual(Object.keys(result[component]), variants.map((peer) => `${peer}.${size}`));
      for (const peer of variants) assert.equal(result[component][`${peer}.${size}`].error[key], value);
    }
    for (const variant of unavailable) {
      const selection = select(component, `${variant}.${size}`, "error", "text");
      assert.throws(() => targets(selection, "fontSize"), /unknown part/);
      assert.throws(() => apply({}, selection, {}), /unknown part/);
    }
  }
});

test("mixed color/non-color patches preserve other components, sizes, parts, colors and historical fractions", () => {
  const original = freeze({
    card: {
      "filled.sm": { content: { background: "#111111", paddingLeft: 1.251, fontSize: 17.375 }, footer: { paddingLeft: 2.625 } },
      "outlined.sm": { content: { background: "#222222", paddingLeft: 3.125, color: "#333333" } },
      "elevated.sm": { content: { borderColor: "#444444", paddingLeft: 4.875 } },
      "filled.lg": { content: { paddingLeft: 5.251 } },
    },
    button: { "primary.sm": { root: { width: 95.125 } } },
  });
  const before = JSON.stringify(original);
  const selection = select("card", "filled.sm", "content");
  const result = apply(original, selection, { background: "#ABCdef", borderColor: "transparent", paddingLeft: 12.251, opacity: 0.375 });
  for (const { key } of targets(selection, "paddingLeft")) {
    assert.equal(result.card[key].content.paddingLeft, 12.251);
    assert.equal(result.card[key].content.opacity, 0.375);
  }
  assert.deepEqual(result.card["filled.sm"].content, { background: "#ABCdef", borderColor: "transparent", paddingLeft: 12.251, fontSize: 17.375, opacity: 0.375 });
  assert.equal(result.card["outlined.sm"].content.background, "#222222");
  assert.equal(result.card["outlined.sm"].content.color, "#333333");
  assert.equal(result.card["elevated.sm"].content.borderColor, "#444444");
  assert.deepEqual(result.card["filled.sm"].footer, original.card["filled.sm"].footer);
  assert.deepEqual(result.card["filled.lg"], original.card["filled.lg"]);
  assert.deepEqual(result.button, original.button);
  assert.equal(JSON.stringify(original), before);
  // Inspection and an empty edit never reconcile historical peer differences.
  assert.strictEqual(apply(original, selection, {}), original);
  targets(selection, "paddingLeft");
  assert.equal(JSON.stringify(original), before);
});

test("granular reset removes shared fields across peers, colors only exactly, and prunes only empty records", () => {
  const selection = select("button", "primary.sm");
  const original = freeze({ button: {
    "primary.sm": { root: { width: 123.125, background: "#111111", borderColor: "#222222" }, text: { fontSize: 19.625 } },
    "secondary.sm": { root: { width: 85.375, background: "#333333" } },
    "outline.sm": { root: { width: 97.251 } },
    "primary.md": { root: { width: 154.625 } },
  } });
  const result = apply(original, selection, { width: null, background: null });
  assert.deepEqual(result, { button: {
    "primary.sm": { root: { borderColor: "#222222" }, text: { fontSize: 19.625 } },
    "secondary.sm": { root: { background: "#333333" } },
    "primary.md": { root: { width: 154.625 } },
  } });
  assert.strictEqual(apply(result, selection, { width: null, background: null }), result);
  assert.deepEqual(apply({ button: { "primary.sm": { root: { width: 1.125 } } } }, selection, { width: null }), {});
  assert.deepEqual(apply(undefined, selection, { width: null }), {});
});

test("no-op compares every peer, including missing peers, and returns the exact original reference", () => {
  const selection = select("button", "primary.sm");
  const sparse = freeze({ button: { "primary.sm": { root: { width: 143.125 } } } });
  const filled = apply(sparse, selection, { width: 143.125 });
  assert.notStrictEqual(filled, sparse);
  assert.equal(Object.keys(filled.button).length, 6);
  assert.strictEqual(apply(freeze(filled), selection, { width: 143.125, background: null }), filled);
  const divergent = structuredClone(filled);
  divergent.button["link.sm"].root.width = 99.625;
  assert.notStrictEqual(apply(divergent, selection, { width: 143.125 }), divergent);
  const empty = freeze({});
  assert.strictEqual(apply(empty, selection, { background: null, opacity: null }), empty);
  assert.strictEqual(apply(sparse, selection, {}), sparse);
});

test("invalid selections, targets, keys and values reject transactionally without executing getters", () => {
  const selection = select("card", "filled.sm", "content");
  const original = freeze({ card: { "filled.sm": { content: { width: 1.251 } } } });
  const before = JSON.stringify(original);
  for (const invalid of [select("unknown", "filled.sm"), select("toString", "filled.sm"),
    { ...selection, recipe: "filled" }, { ...selection, part: "unknown" },
    { ...selection, target: "wrong" }, select("button", "primary.sm", "root", "text")]) {
    assert.throws(() => apply(original, invalid, {}));
    assert.throws(() => targets(invalid, "width"));
  }
  for (const patch of [
    { width: 2.375, opacity: 1.001 }, { width: NaN }, { width: Infinity }, { width: undefined },
    { width: -1 }, { width: "2px" }, { shadow: "blur" }, { background: "red" },
    { fontSize: 22 }, { mystery: null }, { color: null }, { outline: "none" },
    null, [], new Date(), Object.create({ width: 2 }), { [Symbol("width")]: 2 },
    { get width() { assert.fail("getter must not execute"); } },
  ]) assert.throws(() => apply(original, selection, patch));
  for (const patch of [{ fontWeight: 650.5 }, { color: "transparent" }, { lineHeight: 0 }, { textAlign: "start" }]) {
    assert.throws(() => apply(original, { ...selection, target: "text" }, patch), /invalid/);
  }
  for (const component of ["switch", "checkbox"]) assert.throws(() => apply({}, select(component, "checked.sm", "control", "text"), { fontSize: 20 }), /unsupported key/);
  assert.throws(() => apply({}, select("card", "filled.sm", "icon", "text"), { fontSize: 20 }), /unsupported key/);
  assert.equal(JSON.stringify(original), before);
});

test("existing parser, CSS variables and JSON round-trip preserve sparse authored data and exact fractions", () => {
  const selection = select("card", "filled.sm", "footer", "text");
  const result = apply(undefined, selection, { fontSize: 19.125, lineHeight: 1.375, color: "#12ABcd" });
  assert.deepEqual(parseComponentRecipes(JSON.parse(JSON.stringify(result))), result);
  const variables = componentRecipeVariables(result);
  for (const variant of ["outlined", "elevated", "filled"]) {
    assert.equal(variables[`--card-recipe-${variant}-sm-footer-font-size`], "19.125px");
    assert.equal(variables[`--card-recipe-${variant}-sm-footer-line-height`], "1.375");
  }
  assert.equal(variables["--card-recipe-filled-sm-footer-color"], "#12ABcd");
  assert.equal(variables["--card-recipe-outlined-sm-footer-color"], undefined);
  const historical = { button: { "primary.sm": { root: { width: 12.251 } }, "secondary.sm": { root: { width: 13.625 } } } };
  assert.deepEqual(parseComponentRecipes(JSON.parse(JSON.stringify(historical))), historical);
});

test("helper stays outside distributed component/runtime imports", () => {
  for (const file of ["components/recipes.ts", "components/recipe-runtime.ts", "component-recipes.ts", "source-manifest.ts", "source-files.ts"]) {
    assert.ok(!readFileSync(new URL(`./${file}`, import.meta.url), "utf8").includes("recipe-edit-scope"), file);
  }
});
