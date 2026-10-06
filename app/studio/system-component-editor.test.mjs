import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { createElement as h, isValidElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./page-document/parity-loader.mjs";
import { componentIds, defaultSystem } from "./tokens.ts";
import { appearanceFields } from "./components/appearance.ts";
import { componentDefaultFields } from "./component-defaults.ts";
import { componentRecipeFields, componentRecipeOptions, componentRecipeParts, parseComponentRecipes } from "./component-recipes.ts";

const nextResolution = registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === "next/link" ? "next/link.js" : specifier, context); } });
const loader = installParityLoader();
const { SystemComponentEditor } = await import("./system-component-editor.tsx");
// Expose implementation helpers in memory only; the public editor API stays small.
const source = readFileSync(new URL("./system-component-editor.tsx", import.meta.url), "utf8");
const { DraftControl, DefaultParameters, RecipeStyles, RecipeLayers, StyleGroup, SharedDefaults, styleDraft, updateRecipeFields } = await loader.generated(
  source.replaceAll('from "./', 'from "../') + "\nexport { DraftControl, DefaultParameters, RecipeStyles, RecipeLayers, StyleGroup, SharedDefaults, styleDraft, updateRecipeFields };\n",
);
after(() => { loader.cleanup(); nextResolution.deregister(); });
const noop = () => {};
const baseTheme = defaultSystem.themes.light;
const selectionFor = (component, recipe, part, target) => ({
  component, recipe: recipe ?? componentRecipeOptions(component).find(option => option.size === "md").key,
  part: part ?? componentRecipeParts(component)[0].key,
  target: target ?? componentRecipeParts(component).find(entry => entry.key === (part ?? componentRecipeParts(component)[0].key)).target,
});
const editorProps = (component, tab = "styles", selection = null, extra = {}) => ({
  component, tab, selection, theme: baseTheme, mode: "light", onTabChange: noop, onSelectionChange: noop,
  onDefaultsChange: noop, onStylesChange: noop, onRecipesChange: noop, children: h("p", null, "Variant paint controls"), ...extra,
});
const panel = (component, tab = "styles", selection = null, extra = {}) => renderToStaticMarkup(h(SystemComponentEditor, editorProps(component, tab, selection, extra)));
const scopedMarkup = html => html.match(/<section\b[^>]*data-system-recipe-controls[\s\S]*?<\/section>/)?.[0] ?? "";
const recipeProps = (selection, extra = {}) => ({ selection, recipe: componentRecipeOptions(selection.component).find(option => option.key === selection.recipe), theme: baseTheme, mode: "light", onSelectionChange: noop, onChange: noop, ...extra });
const fieldId = (selection, key) => `system-recipe-${selection.component}-${selection.recipe}-${selection.part}-${selection.target}-${key}`;

// SSR probes capture the real callback props. This is not browser/focus-layout coverage.
function capture(Component, props, steps = []) {
  let tree, index = 0;
  renderToStaticMarkup(h(function Probe() {
    const [, rerender] = useState(0);
    tree = Component(props);
    const step = steps[index++];
    if (step) { step(tree, props); rerender(value => value + 1); }
    return null;
  }));
  return tree;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join("") : isValidElement(tree) ? textOf(tree.props.children) : tree == null || typeof tree === "boolean" ? "" : String(tree);
const keyEvent = (key, extra = {}) => ({ key, nativeEvent: { isComposing: false }, preventDefault: noop, stopPropagation: noop, ...extra });

test("Styles comes first; insertion Parameters and shared all-size defaults stay separate", () => {
  for (const component of componentIds) {
    const parameters = panel(component, "parameters"), styles = panel(component);
    assert.match(parameters, /role="tablist"[^>]*aria-label="Component editor"|aria-label="Component editor"[^>]*role="tablist"/);
    assert.match(parameters, /role="tabpanel"/);
    assert.ok(styles.indexOf(">Styles<") < styles.indexOf(">Parameters<"));
    for (const field of componentDefaultFields(component)) assert.ok(parameters.includes(`system-default-${component}-${field.key}`));
    assert.match(parameters, /Defaults for new instances only\. Existing saved work stays unchanged\./);
    assert.match(parameters, /Reset insertion defaults/);
    assert.doesNotMatch(parameters, /system-recipe-|system-shared-|Variant paint controls|Shared default layer/);
    assert.doesNotMatch(styles, /system-default-/);
    for (const marker of ["data-system-base-tokens", "data-system-shared-defaults"]) {
      const details = styles.match(new RegExp(`<details[^>]*${marker}="true"[^>]*>`));
      assert.ok(details, marker); assert.doesNotMatch(details[0], /\bopen=/);
    }
    assert.match(styles, /Shared defaults · all variants &amp; sizes/);
    assert.match(styles, /Base &amp; variant tokens · all sizes/);
    assert.match(styles, /Variant paint controls/);
    assert.doesNotMatch(parameters + styles, /starting component|starting parameters|starter|sample|System component part/i);
  }
  assert.equal(panel(null), "<p>Variant paint controls</p>", "foundation workflows pass through unchanged");
});

test("no selection or a stale/unsupported selection never masquerades as scoped styles", () => {
  const title = selectionFor("card", "outlined.md", "title", "text");
  for (const selection of [null, { ...title, component: "button" }, { ...title, recipe: "outlined.xs" }, { ...title, part: "missing" }, { ...title, part: "root", target: "text" }]) {
    const html = panel("card", "styles", selection);
    assert.match(html, /Select a frame or text/);
    assert.equal(scopedMarkup(html), "");
    assert.doesNotMatch(html, /id="system-recipe-/);
  }
});

test("breadcrumb includes the exact variant, tone, size and layer; canvas selections stay authoritative", () => {
  const title = selectionFor("card", "outlined.md", "title", "text");
  const html = scopedMarkup(panel("card", "styles", title));
  assert.match(html, /<h3>Card \/ Outlined \/ Medium \/ Title<\/h3>/);
  assert.match(html, /data-recipe="outlined.md" data-part="title" data-target="text"/);
  assert.match(html, /Only this combination and layer, across linked projects/);
  assert.match(html, /Other variants, sizes and layers stay unchanged/);
  assert.match(html, /Typography · both themes/);
  assert.match(html, /Colors · Light/);
  assert.doesNotMatch(html, /<select[^>]*aria-label="(?:System component part|Shared default layer)"/);
  assert.match(panel("badge", "styles", selectionFor("badge", "outline.neutral.md", "text")), /Badge \/ Outline \/ Neutral \/ Medium \/ Label/);
  assert.match(panel("switch", "styles", selectionFor("switch", "invalidChecked.lg", "control")), /Switch \/ Invalid Checked \/ Large \/ Control/);
  for (const [component, part, target] of [["input", "control", "text"], ["card", "content", "text"], ["card", "footer", "text"], ["card", "title", "frame"], ["text", "root", "frame"]]) {
    const selected = selectionFor(component, undefined, part, target);
    assert.ok(scopedMarkup(panel(component, "styles", selected)), `${component}.${part}.${target} is a supported alternate target`);
  }
});

test("error layers exist only in recipes that can actually render an error", () => {
  for (const component of ["input", "switch", "checkbox"]) for (const option of componentRecipeOptions(component)) {
    const supportsError = option.variant.startsWith("invalid") || option.variant === "readonly";
    const html = panel(component, "styles", selectionFor(component, option.key));
    assert.equal(html.includes('aria-label="Select Error text"'), supportsError, option.key);
    assert.equal(!!scopedMarkup(panel(component, "styles", selectionFor(component, option.key, "error", "text"))), supportsError);
  }
});

test("shared layer picker reports navigation changes so a later contrast request can restore its original layer", () => {
  const changes = [];
  const tree = capture(SharedDefaults, { component: "card", theme: baseTheme, initialPart: "title", onPartChange: part => changes.push(part), onChange: noop });
  const picker = find(tree, node => node.props["aria-label"] === "Shared default layer");
  assert.equal(picker.props.value, "title");
  picker.props.onChange({ target: { value: "description" } });
  assert.deepEqual(changes, ["description"]);
  const restored = capture(SharedDefaults, { component: "card", theme: baseTheme, initialPart: "title", onChange: noop });
  assert.equal(find(restored, node => node.props["aria-label"] === "Shared default layer").props.value, "title");
});

test("each scoped inspector exposes exactly the consumed target allowlist", () => {
  for (const component of componentIds) for (const { key: part } of componentRecipeParts(component)) for (const target of ["frame", "text"]) {
    const allowed = componentRecipeFields(component, part, target);
    if (!allowed.length) continue;
    const recipe = componentRecipeOptions(component).find(option => componentRecipeFields(component, part, target, option.key).length)?.key;
    const selection = selectionFor(component, recipe, part, target);
    const html = scopedMarkup(panel(component, "styles", selection));
    assert.ok(html, `${component}.${part}.${target}`);
    for (const field of appearanceFields) assert.equal(html.includes(`id="${fieldId(selection, field.key)}"`), allowed.some(entry => entry.key === field.key), `${component}.${part}.${target}.${field.key}`);
    if (target === "text") {
      assert.ok(allowed.every(field => field.group === "typography" || field.key === "color"));
      assert.doesNotMatch(html, /Link corners|Link padding sides|Link margin sides/);
    } else {
      assert.ok(allowed.every(field => field.group !== "typography" && field.key !== "color"));
      assert.match(html, /aria-label="Link corners" aria-pressed="false"/);
      assert.match(html, /aria-label="Link padding sides" aria-pressed="false"/);
    }
    assert.match(html, new RegExp(`Reset ${target} styles`));
  }
});

test("every recipe key is addressable without introducing a global part or an insertion-default selection", () => {
  for (const component of componentIds) for (const option of componentRecipeOptions(component)) {
    const selection = selectionFor(component, option.key);
    const props = editorProps(component, "styles", selection);
    const recipeEditor = find(SystemComponentEditor(props), node => node.type?.name === "RecipeStyles");
    assert.ok(recipeEditor, `${component}.${option.key}`);
    assert.equal(recipeEditor.props.recipe.key, option.key);
    assert.deepEqual(recipeEditor.props.selection, selection);
  }
});

test("scoped authored values stay separate from measured defaults and never bleed to another recipe", () => {
  const theme = { ...baseTheme, componentStyles: { card: { title: { fontSize: 20.25, color: "#112233" } } }, componentRecipes: {
    card: {
      "outlined.md": { title: { fontSize: 27.25, color: "#123456", paddingLeft: 12.375 } },
      "outlined.sm": { title: { fontSize: 17.25 } },
      "elevated.md": { title: { fontSize: 35.25 } },
    },
  } };
  for (const [recipe, value] of [["outlined.md", "27.25"], ["outlined.sm", "17.25"], ["elevated.md", "35.25"], ["outlined.lg", ""]]) {
    const selection = selectionFor("card", recipe, "title", "text");
    const tree = capture(RecipeStyles, recipeProps(selection, { theme }));
    const typography = find(tree, node => node.type?.name === "StyleGroup" && node.props.group === "typography");
    const fontSize = find(capture(StyleGroup, { ...typography.props, resolved: { fontSize: "20.25" } }), node => node.props.id === fieldId(selection, "fontSize"));
    assert.equal(fontSize.props.value, value);
    assert.equal(fontSize.props.resolvedValue, "20.25");
    assert.equal(fontSize.props.overridden, value !== "");
    assert.match(renderToStaticMarkup(fontSize), new RegExp(`value="${value || "20.25"}"`));
  }
  const scoped = scopedMarkup(panel("card", "styles", selectionFor("card", "outlined.md", "title", "text"), { theme }));
  assert.match(scoped, /value="#123456"/);
  assert.doesNotMatch(scoped, /value="12\.375"/);
  const noOverrides = scopedMarkup(panel("card", "styles", selectionFor("card", "outlined.md", "title", "text")));
  assert.match(noOverrides, /placeholder="Not rendered"/);
  assert.doesNotMatch(noOverrides, /Inherited/);
  const nestedTheme = { ...baseTheme, componentStyles: { card: { content: { fontSize: 99 } } } };
  assert.doesNotMatch(scopedMarkup(panel("card", "styles", selectionFor("card", "outlined.md", "content", "text"), { theme: nestedTheme })), /value="99"/);
});

test("frame root paint is recipe-scoped and never includes text typography or ink", () => {
  for (const component of ["button", "badge", "card"]) {
    const selection = selectionFor(component), html = scopedMarkup(panel(component, "styles", selection));
    for (const key of ["background", "borderColor", "borderWidth", "shadow"]) assert.ok(html.includes(fieldId(selection, key)));
    for (const key of ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "color"]) assert.ok(!html.includes(fieldId(selection, key)));
  }
});

test("measured control paint is displayed without materializing a recipe override", () => {
  const theme = { ...baseTheme, variantColors: { input: { invalid: { background: "#123456" } }, switch: { invalidChecked: { background: "#abcdef" } } } };
  for (const [component, recipe, color] of [["input", "invalid.md", "#123456"], ["switch", "invalidChecked.md", "#abcdef"]]) {
    const selection = selectionFor(component, recipe, "control", "frame");
    const tree = capture(RecipeStyles, recipeProps(selection, { theme }));
    const surface = find(tree, node => node.type?.name === "StyleGroup" && node.props.group === "surface");
    const changes = [];
    const background = find(capture(StyleGroup, { ...surface.props, resolved: { background: color }, onChange: next => changes.push(next) }), node => node.props.id === fieldId(selection, "background"));
    assert.equal(background.props.value, "");
    assert.equal(background.props.resolvedValue, color);
    assert.equal(background.props.overridden, false);
    const input = find(capture(DraftControl, background.props), node => node.type === "input").props;
    assert.equal(input.value, color);
    input.onBlur(); input.onKeyDown(keyEvent("Enter"));
    assert.deepEqual(changes, []);
  }
});

const authoredRecipes = () => parseComponentRecipes({
  card: {
    "outlined.md": { root: { paddingLeft: 24 }, title: { fontSize: 27.25, color: "#123456", paddingLeft: 12.375, borderWidth: 2, background: "#abcdef" }, description: { fontSize: 14.5 } },
    "outlined.sm": { title: { fontSize: 17.25 } },
    "elevated.md": { title: { fontSize: 35.25 } },
  },
  button: { "primary.md": { root: { paddingLeft: 18 }, text: { fontSize: 15.25 } } },
});

test("reset removes only fields for the selected recipe, part and target in one parent commit", () => {
  for (const target of ["text", "frame"]) {
    const componentRecipes = authoredRecipes(), before = structuredClone(componentRecipes), changes = [];
    const selection = selectionFor("card", "outlined.md", "title", target);
    const theme = { ...baseTheme, componentRecipes }, tree = capture(RecipeStyles, recipeProps(selection, { theme, onChange: value => changes.push(value) }));
    const reset = find(tree, node => node.type === "button" && textOf(node) === `Reset ${target} styles`);
    assert.equal(reset.props.disabled, false);
    let prevented = false;
    reset.props.onPointerDown({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true, "reset does not blur-commit a pending draft first");
    reset.props.onClick();
    assert.equal(changes.length, 1);
    const expected = structuredClone(before);
    for (const field of componentRecipeFields("card", "title", target)) delete expected.card["outlined.md"].title[field.key];
    assert.deepEqual(changes[0], expected);
    assert.deepEqual(componentRecipes, before);
    assert.deepEqual(theme.componentStyles, baseTheme.componentStyles);
  }
  const selection = selectionFor("card", "outlined.md", "title", "text");
  const tree = capture(RecipeStyles, recipeProps(selection, { theme: { ...baseTheme, componentRecipes: { card: { "outlined.md": { title: { paddingLeft: 12 } } } } } }));
  assert.equal(find(tree, node => node.type === "button" && textOf(node) === "Reset text styles").props.disabled, true, "frame-only values never enable text reset");
});

test("recipe edits preserve historical fractions and siblings, reject cross-target fields, and avoid no-op commits", () => {
  const recipes = authoredRecipes(), before = structuredClone(recipes), selection = selectionFor("card", "outlined.md", "title", "text");
  const next = updateRecipeFields(recipes, selection, { fontSize: 31.375 });
  assert.equal(next.card["outlined.md"].title.fontSize, 31.375);
  assert.equal(next.card["outlined.md"].title.paddingLeft, 12.375);
  assert.deepEqual(next.card["outlined.sm"], before.card["outlined.sm"]);
  assert.deepEqual(next.card["elevated.md"], before.card["elevated.md"]);
  assert.deepEqual(next.button, before.button);
  assert.deepEqual(recipes, before);
  assert.equal(updateRecipeFields(recipes, selection, { fontSize: 27.25 }), recipes);
  assert.equal(updateRecipeFields(recipes, selection, { letterSpacing: null }), recipes);
  assert.throws(() => updateRecipeFields(recipes, selection, { paddingLeft: 10 }), /does not consume/);
  assert.throws(() => updateRecipeFields(recipes, { ...selection, target: "frame" }, { fontSize: 10 }), /does not consume/);
  assert.throws(() => updateRecipeFields(recipes, { ...selection, recipe: "outlined.xs" }, { fontSize: 10 }), /unknown recipe/);
  assert.deepEqual(updateRecipeFields({ card: { "outlined.md": { title: { fontSize: 20 } } } }, selection, { fontSize: null }), {});
});

test("draft validation is strict and inline-ready, with no rounding or arbitrary CSS", () => {
  const field = key => appearanceFields.find(field => field.key === key);
  assert.deepEqual(styleDraft(field("fontSize"), " 27.375 "), { fontSize: 27.375 });
  assert.deepEqual(styleDraft(field("lineHeight"), "1.375"), { lineHeight: 1.375 });
  assert.deepEqual(styleDraft(field("fontSize"), ""), { fontSize: null });
  assert.deepEqual(styleDraft(field("width"), "fill"), { width: "fill" });
  assert.deepEqual(styleDraft(field("width"), "hug"), { width: "hug" });
  assert.deepEqual(styleDraft(field("color"), "#aBcDEF"), { color: "#aBcDEF" });
  assert.deepEqual(styleDraft(field("background"), "transparent"), { background: "transparent" });
  for (const value of ["NaN", "Infinity", "12px", "1e3", "0x10", "calc(1px + 1px)", "-2", "513"]) assert.throws(() => styleDraft(field("fontSize"), value));
  for (const value of ["#abc", "red", "var(--ds-primary)", "transparent"]) assert.throws(() => styleDraft(field("color"), value), /six-digit hex/);
  assert.throws(() => styleDraft(field("fontWeight"), "400.5"), /whole numbers/);
  assert.match(source, /"aria-invalid": !!error/);
  assert.match(source, /"aria-describedby": error \? `\$\{id\}-error`/);
  assert.match(source, /id=\{`\$\{id\}-error`\} role="alert"/);
});

function draftInput(extra = {}, steps = []) {
  const commits = [], resets = [];
  const tree = capture(DraftControl, { id: "draft", label: "Font size", accessibleLabel: "Card Title Font size", value: "20", overridden: true, onCommit: value => commits.push(value), onReset: () => resets.push(true), ...extra }, steps);
  return { commits, resets, tree, input: find(tree, node => node.type === "input" || node.type === "textarea" || node.type === "select").props };
}

test("typing is local; blur/Enter commit once, Escape cancels, and unchanged values never create undo entries", () => {
  const { input, commits } = draftInput();
  input.onChange({ target: { value: "27.25" } }); assert.deepEqual(commits, []);
  input.onKeyDown(keyEvent("Enter")); input.onBlur(); input.onBlur();
  assert.deepEqual(commits, ["27.25"]);
  input.onChange({ target: { value: "28.25" } }); input.onKeyDown(keyEvent("Escape")); input.onBlur();
  assert.deepEqual(commits, ["27.25"]);
  input.onChange({ target: { value: "20" } }); input.onBlur(); input.onKeyDown(keyEvent("Enter"));
  assert.deepEqual(commits, ["27.25"]);
  input.onChange({ target: { value: "29.25" } }); input.onBlur(); input.onKeyDown(keyEvent("Enter"));
  assert.deepEqual(commits, ["27.25", "29.25"]);
});

test("effective values are editable input text; no-op reads and equivalent numeric edits stay linked", () => {
  for (const resolvedValue of ["16", "1.333333", "0", "Mixed", "normal", "auto", "#123456", "rgba(0, 0, 0, 0.5)"]) {
    const { tree, input, commits } = draftInput({ value: "", resolvedValue, overridden: false, numeric: true });
    assert.equal(input.value, resolvedValue);
    assert.equal(tree.props["data-overridden"], undefined);
    input.onBlur(); input.onKeyDown(keyEvent("Enter"));
    for (const next of [resolvedValue, "", "  "]) {
      input.onChange({ target: { value: next } }); input.onKeyDown(keyEvent("Enter")); input.onBlur();
    }
    assert.deepEqual(commits, []);
  }
  const sameNumber = draftInput({ value: "", resolvedValue: "16", overridden: false, numeric: true });
  sameNumber.input.onChange({ target: { value: "16.000" } }); sameNumber.input.onBlur();
  assert.deepEqual(sameNumber.commits, []);
  const precise = draftInput({ value: "16.123456789012", resolvedValue: "16.123457" });
  assert.equal(precise.input.value, "16.123456789012", "measurement rounding never changes authored values");
});

test("measurements refresh untouched values but preserve drafts and the edit's original baseline", () => {
  const inputOf = tree => find(tree, node => node.type === "input").props;
  const result = draftInput({ value: "", resolvedValue: "16", overridden: false, numeric: true }, [
    (tree, props) => { assert.equal(inputOf(tree).value, "16"); props.resolvedValue = "20"; },
    tree => { assert.equal(inputOf(tree).value, "20"); inputOf(tree).onChange({ target: { value: "20.00" } }); },
    (tree, props) => { assert.equal(inputOf(tree).value, "20.00"); props.resolvedValue = "24"; },
    tree => { assert.equal(inputOf(tree).value, "20.00"); inputOf(tree).onKeyDown(keyEvent("Enter")); inputOf(tree).onBlur(); },
  ]);
  assert.equal(result.input.value, "24"); assert.deepEqual(result.commits, []);
  const changed = draftInput({ value: "", resolvedValue: "16", overridden: false }, [
    tree => inputOf(tree).onChange({ target: { value: "17." } }),
    (tree, props) => { assert.equal(inputOf(tree).value, "17."); props.resolvedValue = "24"; },
    tree => { assert.equal(inputOf(tree).value, "17."); inputOf(tree).onKeyDown(keyEvent("Enter")); inputOf(tree).onBlur(); },
  ]);
  assert.deepEqual(changed.commits, ["17."]);
  const cleared = draftInput({ resolvedValue: "20" }, [
    tree => inputOf(tree).onChange({ target: { value: "" } }),
    (tree, props) => { inputOf(tree).onKeyDown(keyEvent("Enter")); inputOf(tree).onBlur(); props.value = ""; props.overridden = false; props.resolvedValue = "16"; },
  ]);
  assert.deepEqual(cleared.commits, [""]); assert.equal(cleared.input.value, "16");
});

test("select default labels display actual alignment and shadow without saving raw CSS", () => {
  for (const resolvedValue of ["left", "Mixed", "rgba(0, 0, 0, 0.1) 0px 2px 8px 0px"]) {
    const { tree, input, commits } = draftInput({ value: "", resolvedValue, overridden: false, options: ["none", "sm", "md", "lg"] });
    assert.equal(input.value, "");
    assert.equal(find(tree, node => node.type === "option").props.children, resolvedValue);
    input.onChange({ target: { value: "" } });
    assert.deepEqual(commits, []);
    input.onChange({ target: { value: "md" } });
    assert.deepEqual(commits, ["md"]);
  }
  const same = draftInput({ value: "", resolvedValue: "left", overridden: false, options: ["left", "center"] });
  same.input.onChange({ target: { value: "left" } }); assert.deepEqual(same.commits, []);
  const explicit = draftInput({ value: "right", resolvedValue: "right", options: ["left", "right"] });
  explicit.input.onChange({ target: { value: "" } }); assert.deepEqual(explicit.commits, [""]);
});

test("shared explicit values beat Mixed measurements, and unset shared resets never write", () => {
  const metadata = appearanceFields.filter(field => field.key === "fontSize");
  const group = capture(StyleGroup, { scope: "shared", label: "Shared", group: "typography", metadata, values: { fontSize: 17.123456789 }, resolved: { fontSize: "Mixed" }, onChange: noop });
  const draft = find(group, node => node.type?.name === "DraftControl");
  assert.equal(draft.props.value, "17.123456789"); assert.equal(draft.props.resolvedValue, "Mixed");
  assert.match(renderToStaticMarkup(draft), /value="17.123456789"/);
  const changes = [];
  const shared = capture(SharedDefaults, { component: "card", theme: baseTheme, onChange: value => changes.push(value) });
  find(shared, node => node.type?.name === "StyleGroup").props.onChange({ paddingTop: null });
  assert.deepEqual(changes, []);
});

test("composition, multiline Shift+Enter, failed validation and reset preserve draft boundaries", () => {
  const { input, commits } = draftInput({ multiline: true });
  input.onChange({ target: { value: "new text" } });
  input.onKeyDown(keyEvent("Enter", { nativeEvent: { isComposing: true } }));
  input.onKeyDown(keyEvent("Escape", { nativeEvent: { isComposing: true } }));
  input.onKeyDown(keyEvent("Enter", { shiftKey: true }));
  assert.deepEqual(commits, []);
  input.onBlur(); assert.deepEqual(commits, ["new text"]);
  const validated = [];
  const invalid = draftInput({ onCommit(value) { const patch = styleDraft(appearanceFields.find(field => field.key === "fontSize"), value); validated.push(patch); } });
  invalid.input.onChange({ target: { value: "broken" } });
  assert.doesNotThrow(() => invalid.input.onKeyDown(keyEvent("Enter")));
  assert.deepEqual(validated, []);
  invalid.input.onKeyDown(keyEvent("Escape")); invalid.input.onBlur();
  invalid.input.onChange({ target: { value: "23.25" } }); invalid.input.onBlur();
  assert.deepEqual(validated, [{ fontSize: 23.25 }]);
  const reset = draftInput();
  reset.input.onChange({ target: { value: "unsaved" } });
  const resetButton = find(reset.tree, node => node.type === "button");
  let prevented = false;
  resetButton.props.onPointerDown({ preventDefault() { prevented = true; } });
  resetButton.props.onClick(); reset.input.onBlur();
  assert.equal(prevented, true); assert.deepEqual(reset.resets, [true]); assert.deepEqual(reset.commits, []);
  const select = draftInput({ options: ["left", "center", "right"], value: "left" });
  select.input.onChange({ target: { value: "center" } }); assert.deepEqual(select.commits, ["center"]);
});

test("layer list selects parent and text/frame parts without changing recipe; arrow/Home/End move focus only", () => {
  const selection = selectionFor("card", "outlined.md", "title", "text"), selections = [];
  const tree = RecipeLayers({ selection, label: "Card / Outlined / Medium", onSelect: value => selections.push(value) });
  const buttons = nodes(tree).filter(node => node.type === "button");
  assert.ok(buttons.every(node => node.props.type === "button"));
  assert.equal(buttons.filter(node => node.props["aria-pressed"]).length, 1);
  for (const [label, part, target] of [["Select Card frame", "root", "frame"], ["Select Title text", "title", "text"], ["Select Content text", "content", "text"], ["Select Content frame", "content", "frame"]]) {
    find(tree, node => node.props["aria-label"] === label).props.onClick();
    assert.deepEqual(selections.at(-1), { ...selection, part, target });
  }
  const focused = [], fakeButtons = buttons.map((_, index) => ({ focus() { focused.push(index); } }));
  const list = find(tree, node => node.type === "ul");
  for (const [key, from, to] of [["ArrowDown", 0, 1], ["ArrowUp", 0, buttons.length - 1], ["Home", 3, 0], ["End", 0, buttons.length - 1]]) {
    list.props.onKeyDown(keyEvent(key, { currentTarget: { querySelectorAll: () => fakeButtons }, target: fakeButtons[from] }));
    assert.equal(focused.at(-1), to);
  }
  assert.equal(selections.length, 4, "moving focus does not override the canvas selection");
  const tabs = [], parentSelections = [];
  const editor = SystemComponentEditor(editorProps("card", "styles", selection, { onSelectionChange: value => parentSelections.push(value), onTabChange: value => tabs.push(value) }));
  find(editor, node => node.type?.name === "RecipeStyles").props.onSelectionChange({ ...selection, part: "root", target: "frame" });
  assert.deepEqual(parentSelections, [{ ...selection, part: "root", target: "frame" }]); assert.deepEqual(tabs, ["styles"]);
});

test("selection/target/theme changes remount drafts; ordinary value updates preserve field focus", () => {
  const selection = selectionFor("card", "outlined.md", "title", "text");
  const keyFor = (nextSelection, extra = {}) => find(SystemComponentEditor(editorProps("card", "styles", nextSelection, extra)), node => node.type?.name === "RecipeStyles").key;
  const original = keyFor(selection);
  assert.notEqual(original, keyFor({ ...selection, recipe: "outlined.sm" }));
  assert.notEqual(original, keyFor({ ...selection, part: "description" }));
  assert.notEqual(original, keyFor({ ...selection, target: "frame" }));
  assert.notEqual(original, keyFor(selection, { mode: "dark" }));
  assert.equal(original, keyFor(selection, { theme: { ...baseTheme, componentRecipes: authoredRecipes() } }));
});

test("Parameters commits only insertion defaults and leaves existing objects untouched", () => {
  const defaults = { card: { props: { variant: "filled", size: "lg" }, slots: { title: "Saved title", action: "Open" } }, button: { text: "Continue" } };
  const before = structuredClone(defaults), changes = [];
  const tree = capture(DefaultParameters, { component: "card", defaults, onChange: next => changes.push(next) });
  const title = find(tree, node => node.props.id === "system-default-card-title");
  title.props.onCommit("New insertion title");
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], { ...before, card: { ...before.card, slots: { ...before.card.slots, title: "New insertion title" } } });
  assert.deepEqual(defaults, before);
  assert.equal(title.props.value, "Saved title");
  const reset = find(tree, node => node.type?.name === "Button" && textOf(node) === "Reset insertion defaults");
  reset.props.onClick();
  assert.deepEqual(changes[1], { button: before.button });
  assert.deepEqual(defaults, before);
});
