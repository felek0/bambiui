import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement as h, isValidElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./page-document/parity-loader.mjs";

const loader = installParityLoader();
after(() => loader.cleanup());
const { InteractionPreview, hasInteractionPreview, previewConditions } = await import("./interaction-preview.tsx");
const { componentRecipeOptions } = await import("./component-recipes.ts");
const option = (component, recipe) => componentRecipeOptions(component).find(option => option.key === recipe);
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : []; }
const find = (tree, predicate) => nodes(tree).find(predicate);
const control = tree => find(tree, node => ["Button", "Input", "Switch", "Checkbox"].includes(node.type?.name));
const condition = tree => find(tree, node => node.props["aria-label"] === "Preview condition").props;
const liveRecipe = tree => find(tree, node => node.props["data-live-preview-recipe"]).props["data-live-preview-recipe"];
const reset = tree => find(tree, node => node.type === "button" && node.props.children === "Reset preview").props.onClick;
const open = tree => tree.props.onToggle({ currentTarget: { open: true } });
function capture(component, recipe, steps = [], extra = {}) {
  let tree, index = 0;
  const props = { component, option: option(component, recipe), ...extra };
  renderToStaticMarkup(h(function Probe() {
    const [, rerender] = useState(0);
    tree = InteractionPreview(props);
    const step = steps[index++];
    if (step) { step(tree, props); rerender(value => value + 1); }
    return null;
  }));
  return tree;
}

test("only interactive components expose supported preview conditions; hover/focus are native interactions", () => {
  for (const component of ["button", "input", "switch", "checkbox"]) assert.equal(hasInteractionPreview(component), true);
  for (const component of ["card", "badge", "text"]) assert.equal(hasInteractionPreview(component), false);
  assert.deepEqual(previewConditions("button"), ["normal", "disabled", "loading"]);
  assert.deepEqual(previewConditions("input"), ["normal", "disabled", "readonly"]);
  assert.deepEqual(previewConditions("switch"), ["normal", "disabled", "readonly"]);
  assert.deepEqual(previewConditions("checkbox"), ["normal", "disabled", "readonly", "indeterminate"]);
});

test("preview starts collapsed and mounts no hidden control, extra recipe or selection callback", () => {
  const tree = capture("button", "primary.md");
  assert.equal(tree.type, "details");
  assert.equal(tree.props.open, undefined);
  assert.equal(tree.props["data-interaction-preview"], "button");
  assert.equal(tree.props["data-edit-recipe"], "primary.md");
  assert.equal(control(tree), undefined);
  assert.equal(find(tree, node => node.props["data-live-preview-recipe"]), undefined);
  assert.doesNotMatch(renderToStaticMarkup(tree), /data-recipe-example|data-recipe-body|aria-busy|input|data-component-part=/);
});

test("preview preserves exact axes but never seeds disabled/loading/radius from insertion defaults", () => {
  const defaults = { button: { text: "Saved label", props: { variant: "ghost", size: "lg", disabled: true, loading: true, radius: "lg", type: "submit" } } };
  const before = structuredClone(defaults);
  const tree = capture("button", "secondary.sm", [open], { defaults });
  const button = control(tree).props;
  assert.equal(button.children, "Saved label");
  assert.equal(button.variant, "secondary"); assert.equal(button.size, "sm");
  assert.equal(button.disabled, false); assert.equal(button.loading, false);
  assert.equal(button.radius, undefined); assert.equal(button.type, "button", "preview cannot submit or navigate");
  assert.equal(liveRecipe(tree), "secondary.sm");
  assert.deepEqual(defaults, before);
});

test("real activation enters loading once; blocked activation and reset are local", () => {
  const tree = capture("button", "primary.md", [
    open,
    tree => control(tree).props.onClick(),
    tree => { assert.equal(control(tree).props.loading, true); control(tree).props.onClick(); },
  ]);
  assert.equal(control(tree).props.loading, true);
  assert.equal(condition(tree).value, "loading");
  assert.equal(find(tree, node => node.type === "output").props.children, "Loading · 1 activation");
  const html = renderToStaticMarkup(tree);
  assert.match(html, /aria-busy="true"/); assert.match(html, /data-loading="true"/);
  const resetTree = capture("button", "primary.md", [open, tree => control(tree).props.onClick(), tree => reset(tree)()]);
  assert.equal(control(resetTree).props.loading, false);
  assert.equal(find(resetTree, node => node.type === "output").props.children, "Ready · 0 activations");
});

test("condition selection validates support, disabled blocks activation, and closing discards the session", () => {
  const disabled = capture("button", "primary.md", [open, tree => condition(tree).onChange({ target: { value: "disabled" } }), tree => control(tree).props.onClick()]);
  assert.equal(control(disabled).props.disabled, true);
  assert.equal(find(disabled, node => node.type === "output").props.children, "Disabled · 0 activations");
  assert.equal(find(disabled, node => node.type === "button" && node.props.children === "Focus control").props.disabled, true);
  const unsupported = capture("button", "primary.md", [open, tree => condition(tree).onChange({ target: { value: "readonly" } })]);
  assert.equal(condition(unsupported).value, "normal");
  const closed = capture("button", "primary.md", [open, tree => control(tree).props.onClick(), tree => tree.props.onToggle({ currentTarget: { open: false } })]);
  assert.equal(control(closed), undefined);
  const reopened = capture("button", "primary.md", [open, tree => control(tree).props.onClick(), tree => tree.props.onToggle({ currentTarget: { open: false } }), open]);
  assert.equal(condition(reopened).value, "normal");
  assert.equal(find(reopened, node => node.type === "output").props.children, "Ready · 0 activations");
});

test("Input value and readonly are local; live recipe may differ without changing edit scope", () => {
  const defaults = { input: { props: { value: "Saved snapshot", error: "Saved error", disabled: true, hideLabel: true } } };
  const before = structuredClone(defaults);
  const tree = capture("input", "invalid.md", [open,
    tree => control(tree).props.onValueChange("Typed only here"),
    tree => condition(tree).onChange({ target: { value: "readonly" } }),
    tree => control(tree).props.onValueChange("blocked"),
  ], { defaults });
  assert.equal(control(tree).props.value, "Typed only here");
  assert.equal(control(tree).props.defaultValue, undefined);
  assert.equal(control(tree).props.readOnly, true); assert.equal(control(tree).props.hideLabel, false);
  assert.equal(control(tree).props.error, "Saved error");
  assert.equal(liveRecipe(tree), "readonly.md");
  assert.equal(tree.props["data-edit-recipe"], "invalid.md");
  assert.deepEqual(defaults, before);
  const readonly = capture("input", "readonly.sm", [open], { showError: true });
  assert.equal(control(readonly).props.readOnly, true);
  assert.ok(control(readonly).props.error);
  assert.equal(liveRecipe(readonly), "readonly.sm");
  const baseline = nodes(readonly).find(node => node.type === "option" && node.props.value === "normal");
  assert.equal(baseline.props.children, "As selected", "normal is the selected recipe, not a promise of editable/valid state");
  const disabledReadonly = capture("input", "readonly.sm", [open, tree => condition(tree).onChange({ target: { value: "disabled" } })]);
  assert.equal(find(disabledReadonly, node => node.type === "output").props.children, "Disabled");
});

test("switch/checkbox use real controlled values and preserve recipe/error context; readonly and disabled block changes", () => {
  for (const component of ["switch", "checkbox"]) {
    const tree = capture(component, "invalidUnchecked.md", [open, tree => control(tree).props.onCheckedChange(true)]);
    assert.equal(control(tree).props.checked, true);
    assert.equal(control(tree).props.defaultChecked, undefined);
    assert.equal(liveRecipe(tree), "invalidChecked.md");
    assert.equal(tree.props["data-edit-recipe"], "invalidUnchecked.md");
    assert.ok(control(tree).props.error);
    for (const state of ["disabled", "readonly"]) {
      const blocked = capture(component, "unchecked.md", [open, tree => condition(tree).onChange({ target: { value: state } }), tree => control(tree).props.onCheckedChange(true)]);
      assert.equal(control(blocked).props.checked, false);
      assert.equal(liveRecipe(blocked), "unchecked.md");
    }
  }
});

test("indeterminate renders the real Checkbox state and interaction can leave it", () => {
  const mixed = capture("checkbox", "unchecked.md", [open, tree => condition(tree).onChange({ target: { value: "indeterminate" } })]);
  assert.equal(control(mixed).props.indeterminate, true);
  assert.equal(liveRecipe(mixed), "checked.md");
  assert.match(renderToStaticMarkup(mixed), /aria-checked="mixed"/);
  const changed = capture("checkbox", "unchecked.md", [open, tree => condition(tree).onChange({ target: { value: "indeterminate" } }), tree => control(tree).props.onCheckedChange(true)]);
  assert.equal(control(changed).props.indeterminate, false);
  assert.equal(control(changed).props.checked, true);
  assert.equal(condition(changed).value, "normal");
});

test("reset remounts only the native control to clear Base UI validity state without recreating the disclosure", () => {
  let originalKey;
  const tree = capture("input", "default.md", [open,
    tree => { originalKey = find(tree, node => node.props["data-live-preview-recipe"]).key; reset(tree)(); },
  ]);
  assert.notEqual(find(tree, node => node.props["data-live-preview-recipe"]).key, originalKey);
  assert.equal(tree.type, "details");
  assert.equal(control(tree).props.value, "");
});

test("default updates preserve typed preview values until explicit reset; initial value never becomes an override", () => {
  const tree = capture("input", "default.md", [open,
    tree => control(tree).props.onValueChange("Preview draft"),
    (_tree, props) => { props.defaults = { input: { props: { defaultValue: "New seed" } } }; },
    tree => { assert.equal(control(tree).props.value, "Preview draft"); reset(tree)(); },
  ]);
  assert.equal(control(tree).props.value, "New seed");
  assert.equal(control(tree).props.appearance, undefined);
  assert.equal(control(tree).props.parts, undefined);
});
