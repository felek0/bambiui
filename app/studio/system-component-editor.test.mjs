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
import { recipeEditTargets } from "./recipe-edit-scope.ts";

const nextResolution = registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === "next/link" ? "next/link.js" : specifier, context); } });
const loader = installParityLoader();
const { SystemComponentEditor } = await import("./system-component-editor.tsx");
// Expose implementation helpers in memory only; the public editor API stays small.
const source = readFileSync(new URL("./system-component-editor.tsx", import.meta.url), "utf8");
const { DraftControl, PreviewSamples, previewSampleFields, installDraftScopeGuard, RecipeStyles, RecipeLayerPicker, RecipeLayers, StyleGroup, SharedDefaults, ValueSourceDetails, styleDraft, updateRecipeFields } = await loader.generated(
  source.replaceAll('from "./', 'from "../') + "\nexport { DraftControl, PreviewSamples, previewSampleFields, installDraftScopeGuard, RecipeStyles, RecipeLayerPicker, RecipeLayers, StyleGroup, SharedDefaults, ValueSourceDetails, styleDraft, updateRecipeFields };\n",
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

test("legacy Preview remains explicit opt-in, temporary and separate from styles and shared/base controls", () => {
  for (const component of componentIds) {
    const preview = panel(component, "preview", null, { showPreview: true }), styles = panel(component, "styles", null, { showPreview: true });
    assert.match(preview, /role="tablist"[^>]*aria-label="Component editor"|aria-label="Component editor"[^>]*role="tablist"/);
    assert.match(preview, /role="tabpanel"/);
    assert.ok(styles.indexOf(">Styles<") < styles.indexOf(">Preview<"));
    for (const field of previewSampleFields(component)) assert.ok(preview.includes(`system-default-${component}-${field.key}`));
    for (const field of componentDefaultFields(component).filter(field => !previewSampleFields(component).some(entry => entry.key === field.key))) assert.ok(!preview.includes(`id="system-default-${component}-${field.key}"`));
    assert.match(preview, /Styles, saved defaults, history and exports stay unchanged/);
    assert.match(preview, /Reset preview/);
    assert.doesNotMatch(preview, /system-recipe-|system-shared-|Variant paint controls|Shared default layer/);
    assert.doesNotMatch(styles, /system-default-/);
    for (const marker of ["data-system-base-tokens", "data-system-shared-defaults"]) {
      const details = styles.match(new RegExp(`<details[^>]*${marker}="true"[^>]*>`));
      assert.ok(details, marker); assert.doesNotMatch(details[0], /\bopen=/);
    }
    assert.match(styles, /Shared defaults · all variants &amp; sizes/);
    assert.match(styles, /Base &amp; variant tokens · all sizes/);
    assert.match(styles, /Variant paint controls/);
    assert.doesNotMatch(preview + styles, /starting component|starting parameters|starter|insertion defaults|System component part/i);
    assert.doesNotMatch(source, /Project Parameters|linked projects|in every project/i);
  }
  assert.equal(panel(null), "<p>Variant paint controls</p>", "foundation workflows pass through unchanged");
});

test("the default active inspector is styles-only, even with a stale legacy Preview tab", () => {
  for (const component of componentIds) for (const showPreview of [undefined, false]) {
    const selection = selectionFor(component);
    const html = panel(component, "preview", selection, { showPreview });
    assert.match(html, /data-style-inspector/);
    assert.match(html, /data-system-recipe-controls/);
    assert.match(html, /data-system-shared-defaults/);
    assert.match(html, /data-system-base-tokens/);
    assert.match(html, /Variant paint controls/);
    assert.doesNotMatch(html, /role="tablist"|role="tabpanel"|system-default-|aria-label="Preview /);
  }
});

test("editable fields precede source explanations, with secondary shared/base sections at the bottom", () => {
  for (const component of componentIds) {
    const selection = selectionFor(component);
    const html = panel(component, "styles", selection);
    const scoped = scopedMarkup(html);
    const picker = scoped.indexOf("data-system-layer-picker");
    const layers = scoped.indexOf("data-system-layers");
    const sources = scoped.indexOf('data-system-scope-details="recipe"');
    assert.ok(picker > 0 && layers > picker && sources > layers);
    assert.match(scoped, /<details[^>]*data-system-layers="true"[^>]*>/);
    assert.doesNotMatch(scoped.match(/<details[^>]*data-system-layers="true"[^>]*>/)[0], /\bopen=/);
    for (const field of componentRecipeFields(component, selection.part, selection.target, selection.recipe)) {
      const position = scoped.indexOf(`id="${fieldId(selection, field.key)}"`);
      assert.ok(position > layers && position < sources, `${component}.${field.key} precedes sources`);
    }
    assert.doesNotMatch(scoped.slice(0, sources), /Values describe the selected example|Existing differences remain|Exported consumers/);
    assert.ok(html.indexOf("data-system-shared-defaults") > html.indexOf('data-system-scope-details="recipe"'));
    assert.ok(html.indexOf("data-system-base-tokens") > html.indexOf("data-system-shared-defaults"));
    assert.ok(html.lastIndexOf(`id="system-shared-${component}-`) < html.indexOf('data-system-scope-details="shared"'));
    assert.ok(html.indexOf("Variant paint controls") < html.indexOf('data-system-scope-details="base"'));
    for (const marker of ["data-system-shared-defaults", "data-system-base-tokens"]) {
      assert.doesNotMatch(html.match(new RegExp(`<details[^>]*${marker}="true"[^>]*>`))[0], /\bopen=/);
    }
  }
});

test("scope/source details stay opt-in and separate exact, shared, base and insertion effects", () => {
  const selection = selectionFor("card", "outlined.md", "title", "text");
  const html = panel("card", "styles", selection);
  for (const scope of ["recipe", "shared", "base"]) {
    assert.match(html, new RegExp(`data-system-edit-scope="${scope}"`));
    const details = html.match(new RegExp(`<details[^>]*data-system-scope-details="${scope}"[^>]*>`));
    assert.ok(details); assert.doesNotMatch(details[0], /\bopen=/);
  }
  const summary = html.match(/<dl[^>]*data-system-edit-scope="recipe"[^>]*>[\s\S]*?<\/dl>/)?.[0];
  assert.ok(summary);
  assert.match(summary, /<dt>Non-colors<\/dt><dd>Same size · both themes<\/dd>/);
  assert.match(summary, /<dt>Colors<\/dt><dd>This combination · Light<\/dd>/);
  assert.match(html, /All combinations · shared layer/);
  assert.match(html, /Exported consumers use these System styles/);
  assert.match(html, /Reset removes the field from its editing group/);
  assert.match(html, /Shared defaults and base tokens stay unchanged/);
  assert.match(html, /does not clear shared layer styles, exact combination styles or local instance styles/);
  const preview = panel("card", "preview", selection, { showPreview: true });
  assert.match(preview, /data-system-edit-scope="preview"/);
  assert.match(preview, /saved defaults, history and exports stay unchanged/);
  assert.doesNotMatch(preview, /data-system-scope-details=/);
});

test("source details list only consumed fields and identify authored/reset targets without editing", () => {
  const scope = selectionFor("card", "outlined.md", "title", "text");
  const metadata = componentRecipeFields(scope.component, scope.part, scope.target, scope.recipe);
  const theme = { ...baseTheme, componentRecipes: { card: { "outlined.md": { title: { fontSize: 27.123456789, color: "#123456" } } } }, componentStyles: { card: { title: { fontSize: 20 } } } };
  const before = structuredClone(theme);
  const tree = ValueSourceDetails({ scope, metadata, theme, mode: "dark" });
  assert.equal(tree.type, "details"); assert.equal(tree.props.open, undefined);
  assert.equal(tree.props.onToggle, undefined, "opening details has no persistence handler");
  assert.equal(nodes(tree).some(node => ["input", "select", "textarea", "button"].includes(node.type)), false);
  const rows = nodes(tree).filter(node => node.props["data-style-source-field"]);
  assert.deepEqual(rows.map(node => node.props["data-style-source-field"]), metadata.map(field => field.key));
  assert.match(textOf(rows.find(row => row.props["data-style-source-field"] === "fontSize")), /This combination.*Reset → Shared Title.*--card-recipe-outlined-md-title-font-size.*--card-part-title-font-size/);
  assert.match(textOf(rows.find(row => row.props["data-style-source-field"] === "color")), /Dark/);
  assert.match(textOf(rows.find(row => row.props["data-style-source-field"] === "fontWeight")), /Both themes/);
  assert.deepEqual(theme, before);
  const shared = renderToStaticMarkup(h(ValueSourceDetails, { scope: { component: "card", part: "title" }, metadata, theme, mode: "light" }));
  assert.match(shared, /Reset removes only this shared layer&#x27;s overrides, not exact combination overrides or base tokens/);
  assert.match(shared, /Shared authored values are shown even when an exact override masks them/);
});

test("no selection or a stale/unsupported selection never masquerades as scoped styles", () => {
  const title = selectionFor("card", "outlined.md", "title", "text");
  for (const selection of [null, { ...title, component: "button" }, { ...title, recipe: "outlined.xs" }, { ...title, part: "missing" }, { ...title, part: "root", target: "text" }]) {
    const html = panel("card", "styles", selection);
    assert.match(html, /Select a component layer/);
    assert.equal(scopedMarkup(html), "");
    assert.doesNotMatch(html, /id="system-recipe-/);
  }
});

test("compact selection header retains variant, tone, size, layer and target without a visible breadcrumb", () => {
  const title = selectionFor("card", "outlined.md", "title", "text");
  const html = scopedMarkup(panel("card", "styles", title));
  const header = html.match(/<header[^>]*data-system-selection-header[^>]*>[\s\S]*?<\/header>/)?.[0];
  assert.ok(header);
  assert.match(header, /<h3>Card <span[^>]*>Outlined · Medium<\/span><\/h3>/);
  assert.match(header, /<span>Title · Text<\/span>/);
  assert.doesNotMatch(header, /Card \/ Outlined|Non-colors|Scope &amp; value sources/);
  assert.match(html, /data-recipe="outlined.md" data-part="title" data-target="text"/);
  assert.match(html, /aria-label="Card \/ Outlined \/ Medium \/ Title"/, "full context remains available to assistive technology");
  assert.match(html, /Same size · both themes/);
  assert.match(html, /across variants, states and tones where this layer is supported/);
  assert.match(html, /Other sizes and layers stay unchanged/);
  assert.match(html, /Medium · 3 combinations · both themes/);
  assert.match(html, /This combination · Light/);
  assert.doesNotMatch(html, /<select[^>]*aria-label="(?:System component part|Shared default layer)"/);
  const badge = panel("badge", "styles", selectionFor("badge", "outline.neutral.md", "text"));
  assert.match(badge, /<h3>Badge <span[^>]*>Outline · Neutral · Medium<\/span><\/h3>/);
  assert.match(badge, /<span>Label · Text<\/span>/);
  const control = panel("switch", "styles", selectionFor("switch", "invalidChecked.lg", "control"));
  assert.match(control, /<h3>Switch <span[^>]*>Invalid Checked · Large<\/span><\/h3>/);
  assert.match(control, /<span>Control · Frame<\/span>/);
  for (const [component, part, target] of [["input", "control", "text"], ["card", "content", "text"], ["card", "footer", "text"], ["card", "title", "frame"], ["text", "root", "frame"]]) {
    const selected = selectionFor(component, undefined, part, target);
    assert.ok(scopedMarkup(panel(component, "styles", selected)), `${component}.${part}.${target} is a supported alternate target`);
  }
});

test("compact picker and collapsed layer list cover every supported recipe part and target", () => {
  for (const component of componentIds) for (const recipe of componentRecipeOptions(component)) {
    const parts = componentRecipeParts(component, recipe.key);
    const expectedLayers = parts.flatMap(part => ["frame", "text"]
      .filter(target => componentRecipeFields(component, part.key, target, recipe.key).length)
      .map(target => `Select ${part.label} ${target}`));
    for (const part of parts) for (const target of ["frame", "text"]) {
      if (!componentRecipeFields(component, part.key, target, recipe.key).length) continue;
      const selection = selectionFor(component, recipe.key, part.key, target);
      const tree = RecipeLayerPicker({ selection, onSelect: () => assert.fail("rendering never selects or writes") });
      const picker = find(tree, node => node.type === "select");
      assert.equal(picker.props["aria-label"], "Selected layer");
      assert.equal(picker.props.value, part.key);
      assert.equal(picker.props["data-inspector-discard-drafts"], true);
      assert.deepEqual(nodes(picker).filter(node => node.type === "option").map(node => [node.props.value, textOf(node)]), parts.map(entry => [entry.key, entry.label]));
      const targets = nodes(tree).filter(node => node.type === "button");
      assert.deepEqual(targets.map(node => node.props["data-system-style-target"]), ["frame", "text"].filter(value => componentRecipeFields(component, part.key, value, recipe.key).length));
      assert.equal(targets.filter(node => node.props["aria-pressed"]).length, 1);
      for (const button of targets) {
        assert.equal(button.props.type, "button");
        assert.equal(button.props["aria-pressed"], button.props["data-system-style-target"] === target);
        assert.equal(button.props["data-inspector-discard-drafts"], button.props["aria-pressed"] ? undefined : true);
      }
      assert.equal(find(tree, node => node.props.role === "group").props["aria-label"], `${part.label} style target`);
      const layers = RecipeLayers({ selection, label: recipe.label, onSelect: noop });
      assert.equal(layers.props.open, undefined);
      assert.deepEqual(nodes(layers).filter(node => node.type === "button").map(node => node.props["aria-label"]).sort(), [...expectedLayers].sort());
    }
  }
});

test("compact layer and target controls select exact scopes without redundant selection callbacks", () => {
  const selection = selectionFor("card", "outlined.md", "title", "text"), selections = [];
  const tree = RecipeLayerPicker({ selection, onSelect: next => selections.push(next) });
  const picker = find(tree, node => node.type === "select");
  picker.props.onChange({ target: { value: "title" } });
  picker.props.onChange({ target: { value: "missing" } });
  find(tree, node => node.props["data-system-style-target"] === "text").props.onClick();
  assert.deepEqual(selections, []);
  for (const [part, target] of [["root", "frame"], ["description", "text"], ["content", "frame"]]) {
    picker.props.onChange({ target: { value: part } });
    assert.deepEqual(selections.at(-1), { ...selection, part, target }, "new layers start with their documented default target");
  }
  const frame = find(tree, node => node.props["data-system-style-target"] === "frame");
  frame.props.onClick();
  assert.deepEqual(selections.at(-1), { ...selection, target: "frame" });
  for (const control of [picker, frame]) for (const value of ["23.125", "invalid"]) {
    assert.equal(control.props["data-inspector-discard-drafts"], true);
    const { input, commits } = draftInput();
    const document = draftDocument();
    input.onFocus({ currentTarget: { ownerDocument: document } });
    input.onChange({ target: { value } });
    document.pointer("[data-inspector-discard-drafts]");
    input.onBlur();
    assert.deepEqual(commits, [], "compact scope controls discard the outgoing draft before blur");
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

test("reset removes fields from their size or color group for one part and target in one parent commit", () => {
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
    for (const field of componentRecipeFields("card", "title", target)) {
      for (const option of componentRecipeOptions("card")) {
        if (field.type === "color" ? option.key !== selection.recipe : option.size !== "md") continue;
        const appearance = expected.card[option.key]?.title;
        if (appearance) delete appearance[field.key];
      }
    }
    assert.deepEqual(changes[0], parseComponentRecipes(expected));
    assert.deepEqual(componentRecipes, before);
    assert.deepEqual(theme.componentStyles, baseTheme.componentStyles);
  }
  const selection = selectionFor("card", "outlined.md", "title", "text");
  const tree = capture(RecipeStyles, recipeProps(selection, { theme: { ...baseTheme, componentRecipes: { card: { "outlined.md": { title: { paddingLeft: 12 } } } } } }));
  assert.equal(find(tree, node => node.type === "button" && textOf(node) === "Reset text styles").props.disabled, true, "frame-only values never enable text reset");
});

test("recipe edits preserve fractions, broadcast only non-colors to size peers and avoid group no-op commits", () => {
  const recipes = authoredRecipes(), before = structuredClone(recipes), selection = selectionFor("card", "outlined.md", "title", "text");
  const next = updateRecipeFields(recipes, selection, { fontSize: 31.375 });
  assert.equal(next.card["outlined.md"].title.fontSize, 31.375);
  assert.equal(next.card["outlined.md"].title.paddingLeft, 12.375);
  assert.deepEqual(next.card["outlined.sm"], before.card["outlined.sm"]);
  assert.equal(next.card["elevated.md"].title.fontSize, 31.375);
  assert.equal(next.card["filled.md"].title.fontSize, 31.375);
  assert.deepEqual(next.button, before.button);
  assert.deepEqual(recipes, before);
  const aligned = updateRecipeFields(recipes, selection, { fontSize: 27.25 });
  assert.notEqual(aligned, recipes, "the selected value must still reconcile different peer values");
  assert.equal(updateRecipeFields(aligned, selection, { fontSize: 27.25 }), aligned);
  assert.equal(updateRecipeFields(recipes, selection, { letterSpacing: null }), recipes);
  assert.throws(() => updateRecipeFields(recipes, selection, { paddingLeft: 10 }), /unsupported key/);
  assert.throws(() => updateRecipeFields(recipes, { ...selection, target: "frame" }, { fontSize: 10 }), /unsupported key/);
  assert.throws(() => updateRecipeFields(recipes, { ...selection, recipe: "outlined.xs" }, { fontSize: 10 }), /unknown recipe/);
  assert.deepEqual(updateRecipeFields({ card: { "outlined.md": { title: { fontSize: 20 } } } }, selection, { fontSize: null }), {});
});

test("size-group reset remains available when only another variant has an authored value", () => {
  const selection = selectionFor("card", "outlined.sm", "title", "text");
  const componentRecipes = { card: { "filled.sm": { title: { fontSize: 21.375, color: "#123456" } } } };
  const changes = [];
  const tree = capture(RecipeStyles, recipeProps(selection, { theme: { ...baseTheme, componentRecipes }, onChange: next => changes.push(next) }));
  const typography = find(tree, node => node.type?.name === "StyleGroup" && node.props.group === "typography");
  const field = find(capture(StyleGroup, { ...typography.props, resolved: { fontSize: "14" } }), node => node.props.id === fieldId(selection, "fontSize"));
  assert.equal(field.props.overridden, false, "the selected example still shows its own effective value");
  assert.equal(field.props.resettable, true, "a same-size peer supplies a removable override");
  assert.match(field.props.scopeHint, /Small.*3 combinations.*both themes/);
  const control = capture(DraftControl, field.props);
  assert.ok(find(control, node => node.type === "button" && node.props["aria-label"]?.startsWith("Reset ")));
  find(control, node => node.type === "input").props.onChange({ target: { value: "" } });
  find(control, node => node.type === "input").props.onKeyDown(keyEvent("Enter"));
  assert.deepEqual(changes, [{ card: { "filled.sm": { title: { color: "#123456" } } } }], "clear removes only grouped typography, preserving another variant's color");
  const html = renderToStaticMarkup(field);
  assert.match(html, new RegExp(`${fieldId(selection, "fontSize")}-scope`));
});

test("readable group scopes and per-field descriptions distinguish colors from shared non-colors", () => {
  const selections = [selectionFor("card", "outlined.md", "root", "frame"), selectionFor("card", "outlined.md", "title", "text"), selectionFor("text", "paragraph.warning.sm", "root", "text")];
  for (const selection of selections) for (const mode of ["light", "dark"]) {
    const recipe = recipeProps(selection, { mode });
    const tree = capture(RecipeStyles, recipe);
    const groups = nodes(tree).filter(node => node.type?.name === "StyleGroup");
    for (const group of groups) {
      const rendered = capture(StyleGroup, group.props);
      const summary = find(rendered, node => node.props["data-system-group-scope"]);
      assert.ok(summary);
      assert.equal(summary.props.hidden, undefined);
      assert.equal(summary.props["aria-hidden"], undefined);
      for (const field of group.props.metadata) {
        const draft = find(rendered, node => node.type?.name === "DraftControl" && node.props.field.key === field.key);
        const hint = draft.props.scopeHint;
        assert.ok(textOf(summary).includes(hint), `${field.key} scope is readable once at group level`);
        if (field.type === "color") assert.equal(hint, `This combination · ${mode === "light" ? "Light" : "Dark"}`);
        else {
          assert.ok(hint.includes(`${recipeEditTargets(selection, field.key).length} combinations`));
          assert.ok(hint.endsWith("both themes"));
          if (selection.component === "text") assert.ok(hint.startsWith("Small Paragraph"));
        }
        const control = capture(DraftControl, draft.props);
        const input = find(control, node => ["input", "select", "textarea"].includes(node.type));
        const id = `${fieldId(selection, field.key)}-scope`;
        assert.ok(input.props["aria-describedby"].split(" ").includes(id));
        const description = find(control, node => node.props.id === id);
        assert.equal(textOf(description), hint);
        assert.equal(description.props.hidden, undefined);
        assert.equal(description.props["aria-hidden"], undefined);
      }
      const hints = [...new Set(group.props.metadata.map(field => group.props.scopeHints[field.key]))];
      if (hints.length > 1) {
        const lines = nodes(summary).filter(node => node.type === "p");
        for (const field of group.props.metadata) {
          const line = lines.find(node => textOf(node).endsWith(group.props.scopeHints[field.key]));
          assert.ok(textOf(find(line, node => node.type === "strong")).includes(field.label), "mixed groups identify the fields for each scope, not a blanket theme label");
        }
      }
    }
  }
  const css = readFileSync(new URL("./system-component-editor.module.css", import.meta.url), "utf8");
  const compactScope = css.match(/\.fieldScope\s*\{([^}]+)\}/)?.[1];
  assert.ok(compactScope);
  assert.match(compactScope, /clip-path: inset\(50%\)/);
  assert.doesNotMatch(compactScope, /display:\s*none|visibility:\s*hidden/);
});

test("shared group scope summaries keep current-theme colors separate from both-theme effects", () => {
  const tree = capture(SharedDefaults, { component: "card", theme: baseTheme, mode: "dark", onChange: noop });
  for (const group of nodes(tree).filter(node => node.type?.name === "StyleGroup")) {
    const rendered = capture(StyleGroup, group.props);
    const summary = find(rendered, node => node.props["data-system-group-scope"]);
    for (const field of group.props.metadata) {
      const draft = find(rendered, node => node.type?.name === "DraftControl" && node.props.field.key === field.key);
      assert.equal(draft.props.scopeHint, `All combinations & sizes · ${field.type === "color" ? "Dark" : "both themes"}`);
      assert.ok(textOf(summary).includes(draft.props.scopeHint));
    }
  }
});

test("text size-scope descriptions retain the typographic variant and exact colors", () => {
  const html = scopedMarkup(panel("text", "styles", selectionFor("text", "paragraph.warning.sm", "root", "text")));
  assert.match(html, /Same size &amp; typographic variant · both themes/);
  assert.match(html, /Text keeps its typographic variant/);
  assert.match(html, /Small Paragraph · 6 combinations · both themes/);
  assert.match(html, /This combination · Light/);
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
  assert.match(source, /"aria-describedby": \[field && `\$\{id\}-hint`, scopeHint && `\$\{id\}-scope`, error && `\$\{id\}-error`\]/);
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

test("style controls show metadata units, constraints, dimension suggestions and read-only full values", () => {
  const field = key => appearanceFields.find(field => field.key === key);
  const font = draftInput({ field: field("fontSize"), numeric: true });
  assert.equal(font.input.inputMode, "decimal");
  assert.equal(font.input["aria-describedby"], "draft-hint");
  assert.match(font.input.title, /20.*1–512 px/);
  assert.match(renderToStaticMarkup(font.tree), /aria-hidden="true">px<\/small>/);
  const help = find(font.tree, node => node.type?.name === "AppearanceFieldHelp");
  assert.equal(help.props.current, "20");
  assert.equal(help.props.field.key, "fontSize");
  const width = draftInput({ field: field("width"), numeric: true, value: "hug" });
  assert.equal(width.input.list, "draft-options");
  assert.deepEqual(nodes(width.tree).filter(node => node.type === "option").map(node => node.props.value), ["hug", "fill"]);
  const shadow = draftInput({ field: field("shadow"), value: "", resolvedValue: "rgba(0, 0, 0, 0.1) 0px 2px 8px 0px", overridden: false, options: field("shadow").options });
  assert.match(shadow.tree.props.className, /fullWidth/);
  assert.match(shadow.input.title, /rgba.*display-only/);
  const parameters = draftInput({ value: "Parameter content" });
  assert.equal(find(parameters.tree, node => node.type?.name === "AppearanceFieldHelp"), undefined, "style help never changes Parameters semantics");
});

test("invalid style drafts link inline errors to the field; Escape and failed reset never commit pending text", () => {
  const field = appearanceFields.find(field => field.key === "lineHeight");
  const inputOf = tree => find(tree, node => node.type === "input").props;
  const invalid = draftInput({ field, value: "1.5", numeric: true, onCommit: value => styleDraft(field, value) }, [
    tree => inputOf(tree).onChange({ target: { value: "30%" } }),
    tree => { inputOf(tree).onKeyDown(keyEvent("Enter")); inputOf(tree).onBlur(); },
  ]);
  assert.equal(invalid.input.value, "30%");
  assert.equal(invalid.input["aria-invalid"], true);
  assert.equal(invalid.input["aria-describedby"], "draft-hint draft-error");
  assert.match(textOf(find(invalid.tree, node => node.props.role === "alert")), /unitless multiplier/);
  const failedReset = draftInput({ onReset() { throw new Error("Reset not saved"); } }, [
    tree => inputOf(tree).onChange({ target: { value: "27" } }),
    tree => { find(tree, node => node.type === "button").props.onClick(); inputOf(tree).onBlur(); },
  ]);
  assert.deepEqual(failedReset.commits, []);
  assert.equal(failedReset.input["aria-invalid"], true);
});

test("collapsed full layer list selects parent and text/frame parts; arrow/Home/End move focus only", () => {
  const selection = selectionFor("card", "outlined.md", "title", "text"), selections = [];
  const tree = RecipeLayers({ selection, label: "Card / Outlined / Medium", onSelect: value => selections.push(value) });
  assert.equal(tree.type, "details");
  assert.equal(tree.props.open, undefined);
  assert.equal(tree.props["data-system-layers"], true);
  assert.equal(textOf(find(tree, node => node.type === "summary")), "Layers");
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

test("Preview emits a detached full effective session replacement, never saved-default writes", () => {
  const defaults = { card: { props: { variant: "filled", size: "lg" }, slots: { title: "Saved title", action: "Open" } }, button: { text: "Continue" } };
  const before = structuredClone(defaults), changes = [];
  const tree = capture(PreviewSamples, { component: "card", defaults, onChange: next => changes.push(next) });
  const title = find(tree, node => node.props.id === "system-default-card-title");
  title.props.onCommit("Temporary title");
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], { ...before, card: { ...before.card, slots: { ...before.card.slots, title: "Temporary title" } } });
  assert.deepEqual(defaults, before);
  assert.equal(title.props.value, "Saved title");
  title.props.onCommit("Saved title");
  assert.equal(changes.length, 1, "no-op does not emit a replacement");
  const session = capture(PreviewSamples, { component: "card", defaults, previewDefaults: changes[0], onChange: next => changes.push(next) });
  assert.equal(find(session, node => node.props.id === "system-default-card-title").props.value, "Temporary title");
  find(session, node => node.type?.name === "Button" && textOf(node) === "Reset preview").props.onClick();
  assert.equal(changes[1], undefined);
  assert.deepEqual(defaults, before);
  const savedWrites = [], previews = [], tabs = [];
  const editor = SystemComponentEditor(editorProps("card", "preview", null, { showPreview: true, defaults, onDefaultsChange: next => savedWrites.push(next), onPreviewDefaultsChange: next => previews.push(next), onTabChange: next => tabs.push(next) }));
  editor.props.onValueChange("styles");
  assert.deepEqual(previews, [undefined]); assert.deepEqual(tabs, ["styles"]); assert.deepEqual(savedWrites, []);
});

test("preview allowlist supports real sample fields but never axes, geometry or interaction conditions", () => {
  for (const component of componentIds) {
    const metadata = previewSampleFields(component);
    assert.ok(metadata.length > 0);
    assert.ok(metadata.every(field => componentDefaultFields(component).some(entry => entry.key === field.key && entry.source === field.source)));
    assert.ok(metadata.every(field => !["variant", "size", "tone", "radius", "fullWidth", "as", "checked", "defaultChecked", "disabled", "readOnly", "loading", "indeterminate", "hideLabel", "labelPosition"].includes(field.key)));
  }
  for (const component of ["input", "switch", "checkbox"]) {
    assert.ok(previewSampleFields(component).some(field => field.key === "errorPosition"));
    assert.ok(previewSampleFields(component).some(field => field.key === "errorIcon"));
  }
  assert.deepEqual(previewSampleFields("card").map(field => field.key), ["title", "description", "content", "action"]);
  assert.deepEqual(componentRecipeParts("button").map(part => part.key), ["root", "text"]);
});

test("preview field reset restores saved copy; strict invalid drafts and effective replacement preserve unrelated records", () => {
  const defaults = { card: { slots: { title: "Saved title" } }, button: { text: "Saved button" } };
  const previewDefaults = { card: { slots: { title: "Session title" } }, text: { text: "Session-only record" } };
  const before = structuredClone({ defaults, previewDefaults }), changes = [];
  const tree = capture(PreviewSamples, { component: "card", defaults, previewDefaults, onChange: next => changes.push(next) });
  const title = find(tree, node => node.props.id === "system-default-card-title");
  title.props.onReset();
  assert.deepEqual(changes[0], { card: { slots: { title: "Saved title" } }, text: { text: "Session-only record" } });
  assert.throws(() => title.props.onCommit(" "), /invalid text/);
  assert.equal(changes.length, 1);
  assert.deepEqual({ defaults, previewDefaults }, before);
});

function draftDocument() {
  const listeners = new Map();
  return {
    addEventListener(type, callback, capture) { assert.equal(capture, true); listeners.set(type, callback); },
    removeEventListener(type, callback, capture) { assert.equal(capture, true); if (listeners.get(type) === callback) listeners.delete(type); },
    pointer(scope, interaction = false, button = 0) {
      listeners.get("pointerdown")?.({ button, target: { closest(selector) {
        if (selector === "[data-interaction-preview]") return interaction;
        return scope !== null && selector.includes(scope);
      } } });
    },
    cancel() { listeners.get("bambiui:discard-inspector-drafts")?.(); },
    listeners,
  };
}

test("target-changing pointer capture discards valid/invalid drafts BEFORE old blur; normal blur still commits", () => {
  for (const scope of ["[data-system-context-change]", "[data-inspector-discard-drafts]", "a[href]", ".system-switcher", ".view-switch", ".canvas-theme", "[data-component-matrix] select", "[data-recipe-example]"]) {
    for (const value of ["23.125", "invalid"]) {
      const { input, commits } = draftInput();
      const document = draftDocument();
      input.onFocus({ currentTarget: { ownerDocument: document } });
      input.onChange({ target: { value } });
      document.pointer(scope);
      input.onChange({ target: { value: "late composition event" } });
      input.onBlur();
      assert.deepEqual(commits, [], `${scope} must prevent even an old-target commit`);
      assert.equal(document.listeners.size, 0);
    }
  }
  for (const [scope, interaction, button] of [[null, false, 0], ["[data-recipe-example]", true, 0], ["a[href]", false, 2]]) {
    const { input, commits } = draftInput();
    const document = draftDocument();
    input.onFocus({ currentTarget: { ownerDocument: document } });
    input.onChange({ target: { value: "23.125" } });
    document.pointer(scope, interaction, button); input.onBlur();
    assert.deepEqual(commits, ["23.125"], "ordinary same-scope blur must not be dropped");
  }
});

test("a canceled scope pointer does not lock a still-focused input against a fresh native edit", () => {
  const { input, commits } = draftInput();
  const document = draftDocument();
  input.onFocus({ currentTarget: { ownerDocument: document } });
  input.onChange({ target: { value: "discard me" } });
  document.pointer("[data-recipe-example]");
  input.onChange({ target: { value: "late composition" } });
  input.onKeyDown(keyEvent("2"));
  input.onChange({ target: { value: "23.125" } });
  input.onBlur();
  assert.deepEqual(commits, ["23.125"]);
});

test("invalid ordinary blur retains draft and error until correction; native undo keys are not intercepted", () => {
  const commits = [];
  const result = capture(DraftControl, { id: "invalid", label: "Size", accessibleLabel: "Size", value: "16", overridden: true, onCommit: value => {
    const patch = styleDraft(appearanceFields.find(field => field.key === "fontSize"), value);
    commits.push(patch);
  }, onReset: noop }, [
    tree => find(tree, node => node.type === "input").props.onChange({ target: { value: "invalid" } }),
    tree => find(tree, node => node.type === "input").props.onBlur(),
    tree => {
      const input = find(tree, node => node.type === "input").props;
      assert.equal(input.value, "invalid"); assert.equal(input["aria-invalid"], true);
      input.onKeyDown(keyEvent("z", { ctrlKey: true, preventDefault() { assert.fail("native undo must not be intercepted"); } }));
      input.onChange({ target: { value: "19.375" } });
    },
    tree => find(tree, node => node.type === "input").props.onBlur(),
  ]);
  assert.deepEqual(commits, [{ fontSize: 19.375 }]);
  assert.equal(find(result, node => node.type === "input").props["aria-invalid"], false);
});

test("scope guard cleanup and explicit parent discard work without preventing native events", () => {
  const document = draftDocument(), discarded = [];
  const cleanup = installDraftScopeGuard({ ownerDocument: document }, () => discarded.push(true));
  document.cancel(); assert.equal(discarded.length, 1);
  cleanup(); document.pointer("a[href]"); assert.equal(discarded.length, 1);
  const tree = RecipeLayers({ selection: selectionFor("button", "primary.md", "root", "frame"), label: "Button", onSelect: noop });
  const buttons = nodes(tree).filter(node => node.type === "button");
  assert.ok(buttons.filter(node => !node.props["aria-pressed"]).every(node => node.props["data-inspector-discard-drafts"] === true));
});
