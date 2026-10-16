import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h, isValidElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./page-document/parity-loader.mjs";

const loader = installParityLoader();
after(() => loader.cleanup());
const { ComponentPlayground } = await import("./component-playground.tsx");
const { groupPlaygroundFields, playgroundArgs, playgroundFields, updatePlaygroundArg } = await import("./component-playground-model.ts");
const { componentDefaultFields } = await import("./component-defaults.ts");
const { componentIds, defaultSystem, toCSSVariables } = await import("./tokens.ts");
const { Badge, Button, Input, Switch, Checkbox, Text, Card } = await import("./components/index.ts");
const isPortal = tree => tree?.$$typeof === Symbol.for("react.portal");
const entries = tree => Array.isArray(tree) ? tree.flatMap(entries) : isValidElement(tree) ? [tree, ...entries(tree.props.children)] : isPortal(tree) ? [tree, ...entries(tree.children)] : [];
const nodes = tree => entries(tree).filter(isValidElement);
const portals = tree => entries(tree).filter(isPortal);
const find = (tree, predicate) => nodes(tree).find(predicate);
const fieldNode = (tree, label) => find(tree, node => node.props["aria-label"] === `Playground ${label}`);
const field = (tree, label) => fieldNode(tree, label).props;
const controls = tree => find(tree, node => Object.hasOwn(node.props, "data-playground-controls"));
const live = tree => find(tree, node => [Badge, Button, Input, Switch, Checkbox, Text, Card].includes(node.type));
const reset = tree => find(tree, node => node.type === "button" && node.props.children === "Reset playground").props.onClick();
const status = tree => find(tree, node => Object.hasOwn(node.props, "data-playground-status")).props.children;
// Probe captures real React elements/portals, but returns null: no DOM mounting or server portal rendering.
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

test("saved args are detached; inline and portaled edits leave serialized System bytes unchanged", () => {
  for (const controlsTarget of [undefined, { nodeType: 1 }]) {
    const system = structuredClone(defaultSystem);
    system.componentDefaults = { button: { text: "Saved", props: { variant: "ghost", size: "lg", radius: "sm", fullWidth: true } } };
    const before = JSON.stringify(system);
    const tree = capture("button", [tree => {
      assert.equal(live(tree).props.children, "Saved");
      assert.equal(live(tree).props.variant, "ghost");
      assert.equal(live(tree).props.fullWidth, true);
      live(tree).props.onClick();
    }, tree => change(tree, "Text", "Local"), tree => change(tree, "Variant", "outline")], { system, controlsTarget });
    assert.equal(status(tree), "1 action");
    assert.equal(live(tree).props.children, "Local");
    assert.equal(JSON.stringify(system), before);
    const args = playgroundArgs("button", system.componentDefaults);
    updatePlaygroundArg(args, playgroundFields("button")[0], "Other");
    assert.equal(args.text, "Saved");
  }
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

test("inline and portal reset load CURRENT saved args, clear actions, and remount native form state", () => {
  for (const controlsTarget of [undefined, null, { nodeType: 1 }]) {
    let key;
    const tree = capture("button", [tree => {
      key = find(tree, node => node.type === "form").key;
      live(tree).props.onClick();
      change(tree, "Text", "Draft");
    }, (_tree, props) => { props.system = { ...props.system, componentDefaults: { button: { text: "New saved" } } }; }, tree => {
      assert.equal(live(tree).props.children, "Draft", "new saved defaults do not overwrite preview edits before reset");
      reset(tree);
    }], { controlsTarget });
    assert.equal(live(tree).props.children, "New saved");
    assert.equal(field(tree, "Text").value, "New saved");
    assert.equal(status(tree), "0 actions");
    assert.notEqual(find(tree, node => node.type === "form").key, key);
  }
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

test("metadata grouping is pure, exhaustive and ordered, without changing fields or options", () => {
  const expected = {
    button: {
      appearance: ["variant", "size", "radius", "fullWidth", "iconOnly"],
      content: ["text", "startIcon", "endIcon", "icon"],
      state: ["disabled", "loading"],
      more: ["type"],
    },
    input: {
      appearance: ["size", "radius"],
      content: ["label", "description", "placeholder", "startIcon", "endIcon"],
      state: ["error", "disabled", "readOnly", "required", "value"],
      more: ["hideLabel", "errorPosition", "errorIcon", "type"],
    },
    switch: {
      appearance: ["size"],
      content: ["label", "description"],
      state: ["error", "disabled", "readOnly", "required", "value", "checked"],
      more: ["hideLabel", "errorPosition", "errorIcon", "labelPosition"],
    },
    checkbox: {
      appearance: ["size", "radius"],
      content: ["label", "description"],
      state: ["error", "disabled", "readOnly", "required", "value", "checked", "indeterminate"],
      more: ["hideLabel", "errorPosition", "errorIcon", "labelPosition"],
    },
    badge: { appearance: ["variant", "size", "tone", "radius", "dot"], content: ["text", "startIcon"] },
    card: { appearance: ["variant", "size", "radius"], content: ["title", "description", "content", "action"] },
    text: { appearance: ["variant", "size", "tone"], content: ["text"], more: ["as"] },
  };
  for (const component of componentIds) {
    const fields = Object.freeze(playgroundFields(component).map(field => Object.freeze({ ...field, ...(field.options ? { options: Object.freeze([...field.options]) } : {}) })));
    const before = JSON.stringify(fields);
    const groups = groupPlaygroundFields(fields);
    assert.deepEqual(groups.map(group => group.id), Object.keys(expected[component]), component);
    assert.deepEqual(Object.fromEntries(groups.map(group => [group.id, group.fields.map(field => field.key)])), expected[component], component);
    const groupedFields = groups.flatMap(group => group.fields);
    assert.equal(groupedFields.length, fields.length);
    assert.deepEqual(new Set(groupedFields), new Set(fields), "groups retain the original field references and options exactly once");
    for (const group of groups) assert.equal(group.defaultOpen, group.id !== "more");
    assert.equal(JSON.stringify(fields), before);
    assert.deepEqual(groupPlaygroundFields(fields), groups, "grouping is deterministic");
  }
  const future = { source: "props", key: "futureOption", label: "New option", type: "select", options: ["one", "two"], required: false };
  const slot = { source: "slots", key: "size", label: "Renamed slot", type: "text", required: true };
  assert.deepEqual(groupPlaygroundFields([future, slot]).map(group => [group.id, group.fields]), [["content", [slot]], ["more", [future]]], "source/key metadata, not label copy, determines grouping; unknown supported props stay reachable");
  assert.deepEqual(groupPlaygroundFields([]), []);
});

test("undefined/null hosts render one SSR-safe native props region with named groups and every option", () => {
  for (const component of componentIds) for (const controlsTarget of [undefined, null]) {
    const tree = capture(component, [], { controlsTarget });
    assert.equal(portals(tree).length, 0);
    const region = controls(tree);
    assert.equal(region.props.role, "region");
    assert.equal(region.props["data-playground-controls-for"], component);
    assert.equal(region.props.hidden, false);
    assert.equal(find(region, node => node.props.id === region.props["aria-labelledby"]).props.children, "Playground props");
    assert.equal(find(region, node => node.props.id === region.props["aria-describedby"]).props.children, "Not saved to your system.");
    const resets = nodes(tree).filter(node => node.type === "button" && node.props.children === "Reset playground");
    assert.equal(resets.length, 1);
    assert.ok(nodes(region).includes(resets[0]));
    assert.equal(resets[0].props.type, "button");
    assert.equal(find(region, node => node.type === "form"), undefined, "props are outside the sample form");
    const groups = nodes(region).filter(node => node.props["data-playground-group"]);
    const metadataGroups = groupPlaygroundFields(playgroundFields(component));
    assert.deepEqual(groups.map(group => group.props["data-playground-group"]), metadataGroups.map(group => group.id));
    for (const [index, group] of groups.entries()) {
      const metadata = metadataGroups[index];
      assert.equal(group.type, "details");
      assert.equal(group.props.open, metadata.defaultOpen);
      const summary = find(group, node => node.type === "summary");
      assert.equal(summary.props.children, metadata.label);
      assert.equal(find(group, node => node.type === "fieldset").props["aria-labelledby"], summary.props.id);
      assert.deepEqual(nodes(group).filter(node => ["input", "select", "textarea"].includes(node.type)).map(node => node.props["aria-label"]), metadata.fields.map(field => `Playground ${field.label}`));
    }
    for (const metadata of playgroundFields(component)) {
      const control = fieldNode(region, metadata.label);
      assert.ok(["input", "select", "textarea"].includes(control.type));
      const label = find(region, node => node.type === "label" && node.props.htmlFor === control.props.id);
      assert.equal(find(label, node => node.type === "span").props.children, metadata.label);
      if (metadata.options?.every(option => typeof option === "boolean")) assert.equal(control.props.type, "checkbox");
      else if (metadata.options) assert.deepEqual(nodes(control).filter(node => node.type === "option").map(node => node.props.value), ["", ...metadata.options.map(String)]);
      else assert.equal(control.props.maxLength, metadata.maxLength);
    }
    const html = renderToStaticMarkup(tree);
    assert.match(html, /Preview only · not exported/);
    assert.doesNotMatch(html, /unsaved args/);
    assert.ok(renderToStaticMarkup(h(ComponentPlayground, { component, system: defaultSystem, mode: "light", controlsTarget })).includes("Playground props"));
  }
});

test("non-null hosts receive the sole props region through a real portal, without the sample or theme variables", () => {
  const controlsTarget = { nodeType: 1 };
  for (const component of componentIds) {
    const tree = capture(component, [], { controlsTarget });
    const region = controls(tree);
    const targets = portals(tree);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].containerInfo, controlsTarget);
    assert.equal(targets[0].children, region);
    assert.equal(nodes(tree).filter(node => Object.hasOwn(node.props, "data-playground-controls")).length, 1);
    assert.equal(nodes(tree).filter(node => node.type === "button" && node.props.children === "Reset playground").length, 1);
    assert.equal(nodes(region).filter(node => node.props["aria-label"]?.startsWith("Playground ")).length, playgroundFields(component).length);
    assert.equal(find(region, node => Object.hasOwn(node.props, "data-playground-preview")), undefined);
    assert.equal(find(region, node => Object.hasOwn(node.props, "data-playground-status")), undefined);
    assert.equal(find(region, node => node.type === "form"), undefined);
    assert.ok(nodes(region).every(node => node.props.style === undefined));
    assert.match(renderToStaticMarkup(region), /Playground props/);
    assert.equal(nodes(tree).filter(node => Object.hasOwn(node.props, "data-playground-preview")).length, 1);
    const output = find(tree, node => Object.hasOwn(node.props, "data-playground-status"));
    assert.equal(output.props.role, "status");
    assert.equal(output.props["aria-live"], "polite");
    assert.equal(output.props["data-playground-action-count"], 0);
  }
});

test("active hides both surfaces; host, theme and mode transitions preserve args, actions and the sample form", () => {
  const firstHost = { nodeType: 1 }, secondHost = { nodeType: 1 };
  let key;
  const tree = capture("button", [tree => {
    key = find(tree, node => node.type === "form").key;
    change(tree, "Text", "Keep this preview");
    live(tree).props.onClick();
  }, (_tree, props) => {
    props.controlsTarget = firstHost;
    props.active = false;
    props.mode = "dark";
  }, (tree, props) => {
    assert.equal(tree.props.hidden, true);
    assert.equal(controls(tree).props.hidden, true, "portal visibility cannot rely on the hidden workbench ancestor");
    assert.equal(portals(tree)[0].containerInfo, firstHost);
    assert.equal(field(tree, "Text").value, "Keep this preview");
    assert.equal(status(tree), "1 action");
    assert.equal(find(tree, node => node.type === "form").key, key);
    props.active = true;
  }, tree => {
    assert.equal(tree.props.hidden, false);
    assert.equal(controls(tree).props.hidden, false);
    change(tree, "Icon only", true);
  }, (_tree, props) => {
    props.controlsTarget = secondHost;
    props.mode = "light";
  }, (tree, props) => {
    assert.equal(portals(tree)[0].containerInfo, secondHost);
    assert.equal(field(tree, "Icon only").checked, true);
    props.controlsTarget = null;
    props.active = false;
  }, (tree, props) => {
    assert.equal(portals(tree).length, 0);
    assert.equal(tree.props.hidden, true);
    assert.equal(controls(tree).props.hidden, true);
    props.active = true;
  }]);
  assert.equal(tree.props.hidden, false);
  assert.equal(controls(tree).props.hidden, false);
  assert.equal(live(tree).props["aria-label"], "Keep this preview");
  assert.equal(live(tree).props.iconOnly, true);
  assert.equal(status(tree), "1 action");
  assert.equal(find(tree, node => node.type === "form").key, key);
  const css = readFileSync(new URL("./component-playground.module.css", import.meta.url), "utf8");
  assert.match(css, /\.playground\[hidden\],\s*\.controls\[hidden\]\s*\{\s*display:\s*none;/, "flex styling must not override either hidden attribute");
});

test("long copy uses labelled textareas; short labels and values stay single-line", () => {
  const expected = { button: [], input: ["Description", "Error message"], switch: ["Description", "Error message"], checkbox: ["Description", "Error message"], badge: [], card: ["Description", "Content"], text: ["Text"] };
  for (const component of componentIds) {
    const tree = capture(component);
    const textareas = nodes(controls(tree)).filter(node => node.type === "textarea");
    assert.deepEqual(textareas.map(node => node.props["aria-label"]), expected[component].map(label => `Playground ${label}`));
    assert.ok(textareas.every(node => node.props.rows === 3));
    for (const metadata of playgroundFields(component).filter(field => field.type === "text")) {
      const control = fieldNode(tree, metadata.label);
      assert.equal(control.type, expected[component].includes(metadata.label) ? "textarea" : "input");
      assert.equal(control.props.maxLength, metadata.maxLength);
    }
  }
  const tree = capture("input", [tree => change(tree, "Description", "First line\nSecond line"), tree => change(tree, "Error message", "Try again\nUse a valid email")], { controlsTarget: { nodeType: 1 } });
  assert.equal(live(tree).props.description, "First line\nSecond line");
  assert.equal(live(tree).props.error, "Try again\nUse a valid email");
  assert.equal(field(tree, "Description").value, live(tree).props.description);
});

test("native sample reset still restores current values and clears native form state with portaled props", () => {
  let key, prevented = false;
  const tree = capture("input", [tree => {
    key = find(tree, node => node.type === "form").key;
    live(tree).props.onValueChange("Draft value");
    change(tree, "Error message", "Draft error");
  }, (_tree, props) => {
    props.system = { ...props.system, componentDefaults: { input: { props: { defaultValue: "Latest initial value" } } } };
  }, tree => {
    find(tree, node => node.type === "form").props.onReset({ preventDefault() { prevented = true; } });
  }], { controlsTarget: { nodeType: 1 } });
  assert.equal(prevented, true);
  assert.equal(live(tree).props.value, "Latest initial value");
  assert.equal(field(tree, "Value").value, "Latest initial value");
  assert.equal(field(tree, "Error message").value, "");
  assert.equal(live(tree).props.defaultValue, undefined);
  assert.equal(status(tree), "0 actions · Value: Latest initial value");
  assert.notEqual(find(tree, node => node.type === "form").key, key);
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
