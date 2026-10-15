import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement as h, isValidElement } from "react";
import { performance } from "node:perf_hooks";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "./page-document/parity-loader.mjs";

const loader = installParityLoader();
after(() => loader.cleanup());
const { ComponentMatrix } = await import("./component-matrix.tsx");
const { componentRecipeOptions, componentRecipeParts } = await import("./component-recipes.ts");
const {
  changeMatrixFilters, createMatrixState, disableMatrixBodyTabStops, emptyMatrixFilters,
  matchesMatrixFilters, reconcileMatrixSelection,
} = await import("./component-matrix-state.ts");
const counts = { button: 18, input: 9, switch: 12, checkbox: 12, badge: 54, card: 9, text: 180 };
const sizes = { sm: "Small", md: "Medium", lg: "Large" };
const title = value => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
const noop = () => {};
const markup = (component, extra = {}) => renderToStaticMarkup(h(ComponentMatrix, { component, selection: null, onSelect: noop, ...extra }));
const exampleMarkup = (html, recipe) => html.split(/(?=<div\b[^>]*data-recipe-example=)/).find(segment => segment.startsWith("<div") && segment.includes(`data-recipe-example="${recipe}"`));

// Callback probes and pure lifecycle tests complement SSR. Actual browser focus,
// native event ordering and integrated draft discard still require System-only smoke.
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
  for (const option of componentRecipeOptions("button")) assert.doesNotMatch(exampleMarkup(buttons, option.key), /data-loading=|aria-busy="true"|\sdisabled=""|data-radius=/);
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

test("only the selected interactive recipe gets a collapsed sandbox, separate from design hit targets", () => {
  for (const component of Object.keys(counts)) {
    const option = componentRecipeOptions(component).find(option => option.size === "md");
    const selection = { component, recipe: option.key, part: "root", target: "frame" };
    const tree = capture(component, { selection });
    const previews = nodes(tree).filter(node => node.type?.name === "InteractionPreview");
    const interactive = ["button", "input", "switch", "checkbox"].includes(component);
    assert.equal(previews.length, interactive ? 1 : 0);
    if (interactive) {
      assert.equal(previews[0].key, option.key);
      assert.equal(previews[0].props.option.key, option.key);
      assert.equal(previews[0].props.onSelect, undefined);
      const html = markup(component, { selection });
      assert.equal([...html.matchAll(/data-interaction-preview=/g)].length, 1);
      assert.equal([...html.matchAll(/data-recipe-example=/g)].length, counts[component]);
      assert.doesNotMatch(html, /data-live-preview-recipe=/, "closed preview mounts no extra native control");
      const alternate = capture(component, { selection: { ...selection, part: "label", target: "text" } });
      assert.equal(nodes(alternate).find(node => node.type?.name === "InteractionPreview").key, previews[0].key, "layer selection preserves this recipe's sandbox session");
    }
  }
  const stale = capture("button", { selection: { component: "input", recipe: "default.md", part: "root", target: "frame" } });
  assert.equal(nodes(stale).filter(node => node.type?.name === "InteractionPreview").length, 0);
});

test("matrix filters expose only existing axes, accessible counts, context and integration markers", () => {
  for (const component of Object.keys(counts)) {
    const tree = capture(component);
    const all = nodes(tree);
    const filters = all.filter(node => node.type === "select");
    assert.deepEqual(filters.map(node => node.props["aria-label"]), [
      `Filter ${["input", "switch", "checkbox"].includes(component) ? "state" : "variant"}`,
      ...(["badge", "text"].includes(component) ? ["Filter tone"] : []), "Filter size",
    ]);
    for (const filter of filters) {
      assert.equal(filter.props.value, "");
      assert.equal(filter.props["data-system-context-change"], "matrix-filter");
      const axis = filter.props["aria-label"].split(" ")[1];
      const expected = [...new Set(componentRecipeOptions(component).map(option => option[axis === "state" ? "variant" : axis]))];
      assert.deepEqual(nodes(filter).filter(node => node.type === "option").map(node => node.props.value), ["", ...expected]);
    }
    const clear = all.find(node => node.type === "button" && node.props.children === "Clear filters");
    assert.equal(clear.props.disabled, true);
    for (const control of all.filter(node => node.props["data-recipe-body"] || node.props["aria-label"]?.startsWith("Select "))) {
      assert.equal(control.props["data-system-context-change"], "matrix-selection");
    }
    const html = markup(component);
    assert.match(html, /No layer selected/);
    assert.ok(html.includes(`${counts[component]} combinations`));
  }
});

const cardSelection = { component: "card", recipe: "outlined.md", part: "title", target: "text" };
const visibleKeys = state => componentRecipeOptions(state.component).filter(option => matchesMatrixFilters(option, state.filters)).map(option => option.key);

test("filter event clears a hidden target synchronously without onSelect or saved-default mutation", () => {
  const events = [];
  const defaults = { card: { slots: { title: "Session sample" } } };
  const before = structuredClone(defaults);
  const tree = capture("card", { selection: cardSelection, defaults,
    onSelect: () => events.push("unexpected select"), onClearSelection: () => events.push("clear"),
  });
  const filter = nodes(tree).find(node => node.type === "select" && node.props["aria-label"] === "Filter variant");
  filter.props.onChange({ target: { value: "filled" } });
  events.push("event returned");
  assert.deepEqual(events, ["clear", "event returned"]);
  assert.deepEqual(defaults, before);
  const legacy = capture("card", { selection: cardSelection });
  assert.doesNotThrow(() => nodes(legacy).find(node => node.type === "select").props.onChange({ target: { value: "filled" } }));
});

test("filters hide selection, request clear once, and do not undo themselves before the parent acknowledges", () => {
  const original = createMatrixState("card", cardSelection);
  const before = structuredClone(original);
  const next = changeMatrixFilters(original, { ...original.filters, variant: "filled" }, cardSelection);
  assert.equal(next.clear, true);
  assert.deepEqual(original, before, "pure UI transitions do not mutate even their input state");
  assert.deepEqual(visibleKeys(next.state), ["filled.sm", "filled.md", "filled.lg"]);
  const delayed = reconcileMatrixSelection(next.state, "card", { ...cardSelection });
  assert.equal(delayed, next.state, "identity-only prop changes are not external navigation");
  assert.equal(changeMatrixFilters(delayed, delayed.filters, cardSelection).clear, false);
  const cleared = reconcileMatrixSelection(delayed, "card", null);
  assert.equal(cleared.dismissed, null);
  assert.deepEqual(cleared.filters, delayed.filters);
  assert.equal(changeMatrixFilters(cleared, emptyMatrixFilters(), null).clear, false);
});

test("external exact recipe or layer navigation reveals its target while preserving compatible filters", () => {
  const selected = { component: "text", recipe: "heading.primary.md", part: "root", target: "text" };
  let state = createMatrixState("text", selected);
  const filtered = changeMatrixFilters(state, { variant: "paragraph", tone: "primary", size: "lg" }, selected);
  assert.equal(filtered.clear, true);
  state = reconcileMatrixSelection(filtered.state, "text", null);
  state = reconcileMatrixSelection(state, "text", selected);
  assert.deepEqual(state.filters, { variant: "", tone: "primary", size: "" });
  assert.ok(visibleKeys(state).includes(selected.recipe));
  const hiddenCard = changeMatrixFilters(createMatrixState("card", cardSelection), { variant: "filled", tone: "", size: "md" }, cardSelection).state;
  const externalLayer = reconcileMatrixSelection(hiddenCard, "card", { ...cardSelection, part: "footer", target: "frame" });
  assert.deepEqual(externalLayer.filters, { variant: "", tone: "", size: "md" });
  assert.equal(externalLayer.dismissed, null);
});

test("compatible filters preserve selection and component changes reset only local matrix state", () => {
  const state = createMatrixState("card", cardSelection);
  const compatible = changeMatrixFilters(state, { variant: "outlined", tone: "", size: "md" }, cardSelection);
  assert.equal(compatible.clear, false);
  assert.deepEqual(visibleKeys(compatible.state), ["outlined.md"]);
  assert.equal(reconcileMatrixSelection(compatible.state, "card", cardSelection), compatible.state);
  const changed = reconcileMatrixSelection(compatible.state, "text", null);
  assert.deepEqual(changed.filters, emptyMatrixFilters());
  assert.equal(visibleKeys(changed).length, 180);
});

test("filter and Clear transitions never pick a replacement and tolerate empty results", () => {
  const selection = { component: "text", recipe: "paragraph.neutral.md", part: "root", target: "text" };
  const initial = createMatrixState("text", selection);
  // A stale/unsupported filter must fail closed, not manufacture an exact recipe.
  const empty = changeMatrixFilters(initial, { variant: "not-a-recipe", tone: "", size: "" }, selection);
  assert.deepEqual(visibleKeys(empty.state), []);
  assert.equal(empty.clear, true);
  const acknowledged = reconcileMatrixSelection(empty.state, "text", null);
  const cleared = changeMatrixFilters(acknowledged, emptyMatrixFilters(), null);
  assert.equal(cleared.clear, false);
  assert.equal(cleared.state.observed, null);
  assert.equal(visibleKeys(cleared.state).length, 180);
});

test("newly mounted or updated design bodies remove every native/custom keyboard tab stop", () => {
  const controls = Array.from({ length: 8 }, () => ({ tabIndex: 0 }));
  let queried;
  const body = { querySelectorAll(selector) { queried = selector; return controls; } };
  disableMatrixBodyTabStops(body);
  assert.ok(controls.every(control => control.tabIndex === -1));
  for (const tag of ["button", "input", "select", "textarea", "[tabindex]", "[contenteditable]", "summary"]) assert.ok(queried.includes(tag));
  controls.push({ tabIndex: 0 }); // A filter/session update has mounted another descendant.
  disableMatrixBodyTabStops(body);
  assert.ok(controls.every(control => control.tabIndex === -1));
  disableMatrixBodyTabStops(null);
  for (const component of Object.keys(counts)) {
    for (const node of nodes(capture(component)).filter(node => node.props["data-recipe-body"])) assert.equal(node.props.ref, disableMatrixBodyTabStops);
  }
});

test("Text180 pure SSR render measurement (not browser, pan, hydration or interaction performance)", t => {
  markup("text"); // Warm up transpiled/public component code.
  const durations = [];
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    const html = markup("text");
    durations.push(performance.now() - started);
    assert.equal([...html.matchAll(/data-recipe-example=/g)].length, 180);
  }
  durations.sort((a, b) => a - b);
  t.diagnostic(`Text180 warm SSR n=5: median ${durations[2].toFixed(2)} ms; range ${durations[0].toFixed(2)}–${durations[4].toFixed(2)} ms (local Node only)`);
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
