import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement as h, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./page-document/parity-loader.mjs";

const loader = installParityLoader();
after(() => loader.cleanup());
const { ComponentMatrix } = await import("./component-matrix.tsx");
const { componentRecipeOptions, componentRecipeParts } = await import("./component-recipes.ts");
const counts = { button: 18, input: 9, switch: 12, checkbox: 12, badge: 54, card: 9, text: 180 };
const sizes = { sm: "Small", md: "Medium", lg: "Large" };
const title = value => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
const noop = () => {};
const markup = (component, extra = {}) => renderToStaticMarkup(h(ComponentMatrix, { component, selection: null, onSelect: noop, ...extra }));
const exampleMarkup = (html, recipe) => html.split(/(?=<div\b[^>]*data-recipe-example=)/).find(segment => segment.startsWith("<div") && segment.includes(`data-recipe-example="${recipe}"`));

// Callback probes complement SSR; actual DOM hit testing, focus and native default
// prevention are covered by studio-smoke.mjs after a fresh production build.
function capture(component, extra = {}) {
  let tree;
  renderToStaticMarkup(h(function Probe() {
    tree = ComponentMatrix({ component, selection: null, onSelect: noop, ...extra });
    return null;
  }));
  return tree;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}

for (const [component, count] of Object.entries(counts)) test(`${component}: all ${count} exact combinations use public components and accessible frame labels`, () => {
  const html = markup(component);
  const options = componentRecipeOptions(component);
  assert.equal(options.length, count);
  assert.deepEqual([...html.matchAll(/data-component-matrix="([^"]+)"/g)].map(match => match[1]), [component]);
  assert.deepEqual([...html.matchAll(/data-recipe-example="([^"]+)"/g)].map(match => match[1]), options.map(option => option.key));
  assert.equal([...html.matchAll(/data-recipe-body="true" aria-hidden="true"/g)].length, count);
  assert.doesNotMatch(html, /Starting component|data-system-starter|data-page-node|data-foundation=/i);
  for (const option of options) {
    const example = exampleMarkup(html, option.key);
    assert.ok(example, option.key);
    const row = [title(option.variant), option.tone && title(option.tone)].filter(Boolean).join(" / ");
    assert.ok(example.includes(`aria-label="Select ${title(component)} ${row} ${sizes[option.size]} ${component === "text" ? "text" : "frame"}"`));
    const root = [...example.matchAll(/<[a-z]+\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`data-ds-component="${component}"`) && tag.includes('data-component-part="root"'));
    assert.ok(root, `${component}/${option.key} public root`);
    assert.ok(root.includes(`data-size="${option.size}"`));
    if (!["input", "switch", "checkbox"].includes(component)) assert.ok(root.includes(`data-component-recipe="${option.key}"`));
  }
});

test("Card examples preserve complete anatomy and nested Text/Button rather than a separate Starting component", () => {
  const html = markup("card");
  for (const { key } of componentRecipeOptions("card")) {
    const example = exampleMarkup(html, key);
    for (const { key: part } of componentRecipeParts("card")) {
      assert.equal([...example.matchAll(new RegExp(`data-ds-component="card" data-component-part="${part}"`, "g"))].length, 1, `${key}/${part}`);
    }
    assert.match(example, /data-ds-component="text" data-component-part="root" data-component-target="text"/);
    assert.match(example, /data-ds-component="button" data-component-part="text" data-component-target="text"/);
    assert.ok(example.includes("Project overview") && example.includes("Get started"));
  }
});

test("insertion state defaults cannot hide matrix anatomy or override its exact axes", () => {
  const defaults = {
    button: { text: "Custom action", props: { variant: "ghost", size: "lg", disabled: true, loading: true, radius: "lg" } },
    input: { props: { label: "Custom input", description: "Custom help", error: "Custom error", disabled: true, hideLabel: true, readOnly: true, size: "lg" } },
    checkbox: { props: { label: "Custom choice", disabled: true, hideLabel: true, readOnly: true, indeterminate: true, defaultChecked: true } },
  };
  const before = structuredClone(defaults);
  const buttons = markup("button", { defaults });
  assert.equal([...buttons.matchAll(/>Custom action<\/span>/g)].length, 18);
  assert.doesNotMatch(buttons, /data-loading=|aria-busy="true"|\sdisabled=""|data-radius=/);
  const input = markup("input", { defaults });
  for (const state of ["default", "invalid", "readonly"]) {
    const example = exampleMarkup(input, `${state}.md`);
    assert.ok(example.includes("Custom input") && example.includes("Custom help"));
    assert.equal(example.includes("Custom error"), state === "invalid");
    assert.equal(example.includes('readOnly=""'), state === "readonly");
    assert.doesNotMatch(example, /data-hide-label="true"|\sdisabled=""/);
  }
  const checkbox = markup("checkbox", { defaults });
  for (const state of ["checked", "unchecked", "invalidChecked", "invalidUnchecked"]) {
    const example = exampleMarkup(checkbox, `${state}.md`);
    assert.ok(example.includes(`aria-checked="${state === "checked" || state === "invalidChecked"}"`));
    assert.doesNotMatch(example, /aria-checked="mixed"|aria-readonly="true"|data-hide-label="true"|\sdisabled=""/);
  }
  assert.deepEqual(defaults, before, "rendering the matrix never mutates insertion defaults");
});

test("selecting an optional readonly error reveals that real layer without changing its recipe or insertion defaults", () => {
  const defaults = { input: { props: { error: "Saved readonly error" } } };
  const before = structuredClone(defaults);
  const html = markup("input", { defaults, selection: { component: "input", recipe: "readonly.md", part: "error", target: "text" } });
  for (const recipe of ["readonly.sm", "readonly.md", "readonly.lg", "default.md"]) {
    const example = exampleMarkup(html, recipe);
    assert.equal(example.includes("Saved readonly error"), recipe === "readonly.md");
    assert.equal(example.includes('data-component-part="error"'), recipe === "readonly.md");
  }
  assert.deepEqual(defaults, before);
});

test("example label callbacks select the exact recipe root without changing insertion defaults", () => {
  for (const component of Object.keys(counts)) {
    const selections = [];
    const tree = capture(component, { onSelect: selection => selections.push(selection) });
    const labels = nodes(tree).filter(node => node.type === "button" && node.props["aria-label"]?.startsWith("Select "));
    assert.equal(labels.length, counts[component]);
    for (const label of labels) label.props.onClick();
    assert.deepEqual(selections, componentRecipeOptions(component).map(option => ({ component, recipe: option.key, part: "root", target: component === "text" ? "text" : "frame" })));
  }
});

test("selection marks only its exact example; nested part selection is not a pressed root frame", () => {
  const selection = { component: "card", recipe: "outlined.md", part: "title", target: "text" };
  for (const [component, expected] of [["card", ["outlined.md"]], ["button", []]]) {
    const tree = capture(component, { selection });
    assert.deepEqual(nodes(tree).filter(node => node.props["data-recipe-example"] && node.props["data-selected"]).map(node => node.props["data-recipe-example"]), expected);
    assert.equal(nodes(tree).filter(node => node.type === "button" && node.props["aria-pressed"]).length, 0);
  }
  const root = capture("card", { selection: { ...selection, part: "root", target: "frame" } });
  assert.deepEqual(nodes(root).filter(node => node.type === "button" && node.props["aria-pressed"]).map(node => node.props["aria-label"]), ["Select Card Outlined Medium frame"]);
});

test("matrix design hit areas cancel primary pointer defaults without swallowing middle-button panning", () => {
  for (const component of Object.keys(counts)) {
    const tree = capture(component);
    const bodies = nodes(tree).filter(node => node.props["data-recipe-body"]);
    assert.equal(bodies.length, counts[component]);
    for (const body of bodies) {
      assert.equal(body.props["aria-hidden"], "true");
      assert.equal(typeof body.props.onClickCapture, "function");
      const prevented = [];
      for (const button of [0, 1, 2]) body.props.onPointerDownCapture({ button, preventDefault: () => prevented.push(button) });
      assert.deepEqual(prevented, [0]);
    }
  }
});
