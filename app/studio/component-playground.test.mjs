import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement as h, isValidElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./page-document/parity-loader.mjs";

const loader = installParityLoader();
after(() => loader.cleanup());
const { ComponentPlayground } = await import("./component-playground.tsx");
const { playgroundArgs, playgroundFields, updatePlaygroundArg } = await import("./component-playground-model.ts");
const { componentDefaultFields } = await import("./component-defaults.ts");
const { componentIds, defaultSystem, toCSSVariables } = await import("./tokens.ts");
const { Badge, Button, Input, Switch, Checkbox, Text, Card } = await import("./components/index.ts");
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const find = (tree, predicate) => nodes(tree).find(predicate);
const field = (tree, label) => find(tree, node => node.props["aria-label"] === `Playground ${label}`).props;
const live = tree => find(tree, node => [Badge, Button, Input, Switch, Checkbox, Text, Card].includes(node.type));
const reset = tree => find(tree, node => node.type === "button" && node.props.children === "Reset playground").props.onClick();
const status = tree => find(tree, node => Object.hasOwn(node.props, "data-playground-status")).props.children;
function capture(component, steps = [], extra = {}) {
  let tree, index = 0;
  const props = { component, system: structuredClone(defaultSystem), mode: "light", ...extra };
  renderToStaticMarkup(h(function Probe() {
    const [, rerender] = useState(0);
    tree = ComponentPlayground(props);
    const step = steps[index++];
    if (step) { step(tree, props); rerender(value => value + 1); }
    return null;
  }));
  return tree;
}
const change = (tree, label, value) => field(tree, label).onChange({ target: typeof value === "boolean" ? { checked: value } : { value } });

test("all seven components expose registry metadata with a single live value and only supported axes", () => {
  for (const component of componentIds) {
    const fields = playgroundFields(component);
    for (const original of componentDefaultFields(component)) {
      if (!["defaultValue", "defaultChecked"].includes(original.key)) assert.ok(fields.some(field => field.key === original.key && field.source === original.source));
    }
    assert.ok(!fields.some(field => ["name", "render", "style", "appearance", "onClick", "defaultValue", "defaultChecked"].includes(field.key)));
    const tree = capture(component);
    assert.equal(tree.props["data-component-playground"], component);
    for (const metadata of fields) assert.ok(field(tree, metadata.label));
    assert.ok(field(tree, "Size"));
    assert.ok(renderToStaticMarkup(tree).includes("Playground"));
  }
  for (const component of ["input", "switch", "checkbox"]) assert.ok(!playgroundFields(component).some(field => ["variant", "tone"].includes(field.key)));
  for (const component of ["switch", "text"]) assert.ok(!playgroundFields(component).some(field => field.key === "radius"));
});

test("saved args are detached; events and edits leave serialized System bytes unchanged", () => {
  const system = structuredClone(defaultSystem);
  system.componentDefaults = { button: { text: "Saved", props: { variant: "ghost", size: "lg", radius: "sm", fullWidth: true } } };
  const before = JSON.stringify(system);
  const tree = capture("button", [tree => {
    assert.equal(live(tree).props.children, "Saved");
    assert.equal(live(tree).props.variant, "ghost");
    assert.equal(live(tree).props.fullWidth, true);
    live(tree).props.onClick();
  }, tree => change(tree, "Text", "Local"), tree => change(tree, "Variant", "outline")], { system });
  assert.equal(status(tree), "1 action");
  assert.equal(live(tree).props.children, "Local");
  assert.equal(JSON.stringify(system), before);
  const args = playgroundArgs("button", system.componentDefaults);
  updatePlaygroundArg(args, playgroundFields("button")[0], "Other");
  assert.equal(args.text, "Saved");
});

test("button disabled/loading block actions without automatic loading; safe icons are real props", () => {
  for (const label of ["Disabled", "Loading"]) {
    const tree = capture("button", [tree => change(tree, label, true), tree => live(tree).props.onClick()]);
    assert.equal(status(tree), "0 actions");
  }
  const tree = capture("button", [tree => live(tree).props.onClick(), tree => change(tree, "Icon only", true), tree => change(tree, "Icon-only glyph", "check")]);
  assert.equal(live(tree).props.loading, false);
  assert.equal(live(tree).props.iconOnly, true);
  assert.ok(live(tree).props["aria-label"]);
  assert.match(renderToStaticMarkup(tree), /data-icon-only="true"/);
  assert.equal(live(capture("input")).props.startIcon, undefined);
});

test("Input live typing and args edits synchronize; readonly/disabled preserve controlled values", () => {
  const tree = capture("input", [tree => live(tree).props.onValueChange("typed"), tree => {
    assert.equal(field(tree, "Value").value, "typed");
    change(tree, "Value", "edited");
  }]);
  assert.equal(live(tree).props.value, "edited");
  assert.equal(live(tree).props.defaultValue, undefined);
  for (const label of ["Read only", "Disabled"]) {
    const blocked = capture("input", [tree => change(tree, "Value", "kept"), tree => change(tree, label, true), tree => live(tree).props.onValueChange("blocked")]);
    assert.equal(live(blocked).props.value, "kept");
  }
});

test("choices seed checked pairs correctly, reflect clicks, and enforce readonly/disabled", () => {
  for (const component of ["switch", "checkbox"]) {
    const system = structuredClone(defaultSystem);
    system.componentDefaults = { [component]: { props: { checked: false } } };
    const tree = capture(component, [tree => live(tree).props.onCheckedChange(true)], { system });
    assert.equal(field(tree, "Checked").checked, true);
    assert.equal(live(tree).props.checked, true);
    assert.equal(live(tree).props.defaultChecked, undefined);
    for (const label of ["Read only", "Disabled"]) {
      const blocked = capture(component, [tree => change(tree, "Checked", false), tree => change(tree, label, true), tree => live(tree).props.onCheckedChange(true)]);
      assert.equal(live(blocked).props.checked, false);
    }
  }
  const mixed = capture("checkbox", [tree => change(tree, "Indeterminate", true), tree => live(tree).props.onCheckedChange(true)]);
  assert.equal(live(mixed).props.indeterminate, false);
});

test("reset loads CURRENT saved args, clears actions, and remounts native form state", () => {
  let key;
  const tree = capture("button", [tree => {
    key = find(tree, node => node.type === "form").key;
    live(tree).props.onClick();
  }, (_tree, props) => { props.system = { ...props.system, componentDefaults: { button: { text: "New saved" } } }; }, tree => reset(tree)]);
  assert.equal(live(tree).props.children, "New saved");
  assert.equal(status(tree), "0 actions");
  assert.notEqual(find(tree, node => node.type === "form").key, key);
});

test("theme/view changes preserve args; only preview receives theme variables; form prevents navigation", () => {
  let prevented = false;
  const tree = capture("input", [tree => live(tree).props.onValueChange("keep"), (_tree, props) => { props.mode = "dark"; props.active = false; }, tree => {
    find(tree, node => node.type === "form").props.onSubmit({ preventDefault() { prevented = true; } });
  }]);
  assert.equal(tree.props.hidden, true);
  assert.equal(live(tree).props.value, "keep");
  const preview = find(tree, node => Object.hasOwn(node.props, "data-playground-preview"));
  assert.equal(preview.props.style["--ds-background"], toCSSVariables(defaultSystem.themes.dark, "dark")["--ds-background"]);
  assert.equal(find(tree, node => Object.hasOwn(node.props, "data-playground-controls")).props.style, undefined);
  assert.equal(tree.props.onPointerDown, undefined);
  assert.equal(prevented, true);
});

test("all seven saved defaults render without mutation and authored strings remain inert", () => {
  const system = structuredClone(defaultSystem);
  system.componentDefaults = {
    button: { text: "<script>inert</script>", props: { variant: "secondary", size: "sm", radius: "lg", type: "submit" } },
    input: { props: { value: "saved value", error: "Invalid", errorPosition: "above", errorIcon: "warning", hideLabel: true } },
    switch: { props: { defaultChecked: false, labelPosition: "start", readOnly: true } },
    checkbox: { props: { defaultChecked: true, indeterminate: true, radius: "sm" } },
    badge: { text: "Saved badge", props: { tone: "danger", variant: "solid", dot: true } },
    card: { props: { variant: "filled", radius: "lg" }, slots: { title: "Saved title", content: "Saved content" } },
    text: { text: "Saved text", props: { variant: "caption", as: "span", tone: "info" } },
  };
  const before = JSON.stringify(system);
  for (const component of componentIds) {
    const tree = capture(component, [], { system });
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes(`data-component-playground="${component}"`));
    assert.equal(JSON.stringify(system), before);
    const sample = live(tree);
    for (const [key, value] of Object.entries(system.componentDefaults[component].props)) {
      if (key === "defaultChecked") assert.equal(sample.props.checked, value);
      else if (sample) assert.equal(sample.props[key], value);
    }
    if (component === "button") { assert.ok(html.includes("&lt;script&gt;inert&lt;/script&gt;")); assert.ok(!html.includes("<script>")); }
  }
});

test("Text keeps typography variant distinct from semantics; Card edits compound content", () => {
  const text = capture("text", [tree => change(tree, "Variant", "h1"), tree => change(tree, "HTML element", "h3"), tree => change(tree, "Text", "Example")]);
  assert.match(renderToStaticMarkup(text), /<h3[^>]*data-variant="h1"/);
  assert.equal(live(text).props.children, "Example");
  const card = capture("card", [tree => change(tree, "Title", "Title draft"), tree => change(tree, "Description", "Description draft"), tree => change(tree, "Content", "Content draft"), tree => change(tree, "Action label", "Footer draft")]);
  const html = renderToStaticMarkup(card);
  for (const copy of ["Title draft", "Description draft", "Content draft", "Footer draft"]) assert.ok(html.includes(copy));
  assert.equal(nodes(card).filter(node => node.type === "form").length, 1);
});
