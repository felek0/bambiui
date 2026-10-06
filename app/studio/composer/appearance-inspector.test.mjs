import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h, isValidElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "../page-document/parity-loader.mjs";
import { appearanceFields } from "../page-document/appearance.ts";

const loader = installParityLoader();
const source = readFileSync(new URL("./appearance-inspector.tsx", import.meta.url), "utf8");
// Private helpers stay private in production. Virtual modules live in page-document/.
const { AppearanceInput, AppearanceGroup, AppearanceInspector, observeAppearance } = await loader.generated(
  source.replaceAll('from "./', 'from "../composer/') + "\nexport { AppearanceInput, AppearanceGroup, observeAppearance };\n",
);
after(() => loader.cleanup());
const noop = () => {};
const field = key => appearanceFields.find(entry => entry.key === key);
const keyEvent = (key, extra = {}) => ({ key, nativeEvent: { isComposing: false }, preventDefault: noop, stopPropagation: noop, ...extra });

// Real SSR hooks and callback props, with render-phase rerenders for local state probes.
// This does not simulate browser focus, layout, or native select behavior.
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
const inputOf = tree => find(tree, node => node.type === "input" || node.type === "select").props;
const resetOf = tree => find(tree, node => node.type === "button" && node.props["aria-label"]?.startsWith("Reset"));
const groupOf = (tree, group) => find(tree, node => node.type === AppearanceGroup && node.props.group === group);
const fieldOf = (tree, key) => find(tree, node => node.type === AppearanceInput && node.props.field.key === key);
function draftInput(extra = {}, steps = []) {
  const commits = [];
  const props = { field: field("fontSize"), value: undefined, resolved: "16", disabled: false, targetLabel: "Component", onCommit: value => { commits.push(value); return true; }, ...extra };
  const tree = capture(AppearanceInput, props, steps);
  return { commits, tree, input: inputOf(tree) };
}

test("resolved values are input text, not placeholders or authored overrides", () => {
  for (const [key, resolved] of [["fontSize", "16"], ["paddingLeft", "12.375"], ["width", "320"], ["background", "#123456"], ["lineHeight", "1.5"], ["color", "Mixed"]]) {
    const { input, tree, commits } = draftInput({ field: field(key), resolved });
    assert.equal(input.value, resolved, key);
    assert.notEqual(input.placeholder, resolved);
    assert.equal(tree.props["data-overridden"], undefined);
    assert.equal(resetOf(tree), undefined);
    assert.doesNotMatch(renderToStaticMarkup(tree), /Inherited/);
    assert.deepEqual(commits, []);
  }
  const color = draftInput({ field: field("background"), resolved: "#123456" });
  assert.equal(find(color.tree, node => node.type === "span").props.style.backgroundColor, "#123456");
  const missing = draftInput({ resolved: undefined });
  assert.equal(missing.input.value, "");
  assert.equal(missing.input.placeholder, "Not rendered");
});

test("focus/blur and untouched Enter do not commit or create overrides", () => {
  for (const extra of [{}, { value: 16.123456789012, resolved: "16.123457" }, { field: field("color"), resolved: "rgba(0, 0, 0, 0.5)" }]) {
    const { input, commits } = draftInput(extra);
    input.onFocus?.(); input.onBlur(); input.onKeyDown(keyEvent("Enter")); input.onBlur();
    assert.deepEqual(commits, []);
  }
});

test("retyping the same displayed numeric value or clearing an unset value is a no-op", () => {
  for (const [key, resolved, next] of [["fontSize", "16", "16"], ["fontSize", "16", " 16.000 "], ["paddingLeft", "0", "0.0"], ["width", "320", "320.00"], ["lineHeight", "1.333333", "1.3333330"], ["fontSize", "16", ""], ["fontSize", "16", "  "]]) {
    const { input, commits } = draftInput({ field: field(key), resolved });
    input.onChange({ target: { value: next } });
    input.onKeyDown(keyEvent("Enter")); input.onBlur();
    assert.deepEqual(commits, [], `${key}: ${JSON.stringify(next)}`);
  }
});

test("typing stays local; changed Enter plus blur commits exactly once; Escape cancels synchronously", () => {
  const { input, commits } = draftInput();
  input.onChange({ target: { value: "27.123456789012" } });
  assert.deepEqual(commits, []);
  input.onKeyDown(keyEvent("Enter")); input.onBlur(); input.onBlur(); input.onKeyDown(keyEvent("Enter"));
  assert.deepEqual(commits, ["27.123456789012"]);
  input.onChange({ target: { value: "28.25" } });
  input.onKeyDown(keyEvent("Escape")); input.onBlur(); input.onKeyDown(keyEvent("Enter"));
  assert.deepEqual(commits, ["27.123456789012"]);
  input.onChange({ target: { value: "29.25" } }); input.onBlur(); input.onKeyDown(keyEvent("Enter"));
  assert.deepEqual(commits, ["27.123456789012", "29.25"]);
});

test("measurements update untouched values but preserve in-progress text and its comparison baseline", () => {
  const { input, commits } = draftInput({}, [
    (tree, props) => { assert.equal(inputOf(tree).value, "16"); props.resolved = "20"; },
    tree => { assert.equal(inputOf(tree).value, "20"); inputOf(tree).onChange({ target: { value: "20.00" } }); },
    (tree, props) => { assert.equal(inputOf(tree).value, "20.00"); props.resolved = "24"; },
    tree => { assert.equal(inputOf(tree).value, "20.00"); inputOf(tree).onKeyDown(keyEvent("Enter")); inputOf(tree).onBlur(); },
  ]);
  assert.equal(input.value, "24");
  assert.deepEqual(commits, [], "a remeasurement must not turn an unchanged edit into an override");

  const changed = draftInput({}, [
    tree => inputOf(tree).onChange({ target: { value: "17." } }),
    (tree, props) => { assert.equal(inputOf(tree).value, "17."); props.resolved = "24"; },
    tree => { assert.equal(inputOf(tree).value, "17."); inputOf(tree).onKeyDown(keyEvent("Enter")); inputOf(tree).onBlur(); },
  ]);
  assert.deepEqual(changed.commits, ["17."]);
});

test("authored fractions, dimensions, and colors always take precedence without rounding", () => {
  for (const [key, value, resolved] of [["fontSize", 16.123456789012, "16.123457"], ["lineHeight", 1.123456789012, "1.123457"], ["width", "hug", "130.5"], ["color", "#aBcDeF", "#abcdef"], ["opacity", 0, "0"]]) {
    const { tree, input, commits } = draftInput({ field: field(key), value, resolved });
    assert.equal(input.value, String(value));
    assert.equal(tree.props["data-overridden"], true);
    assert.ok(resetOf(tree));
    input.onChange({ target: { value: String(value) } }); input.onKeyDown(keyEvent("Enter")); input.onBlur();
    assert.deepEqual(commits, []);
  }
  const updated = draftInput({ value: 16.123456789012 }, [
    (_tree, props) => { props.resolved = "20"; },
  ]);
  assert.equal(updated.input.value, "16.123456789012");
});

test("clearing or resetting authored values restores current values without committing a pending draft", () => {
  const cleared = draftInput({ value: 18 }, [
    tree => inputOf(tree).onChange({ target: { value: "" } }),
    (tree, props) => {
      inputOf(tree).onKeyDown(keyEvent("Enter")); inputOf(tree).onBlur();
      props.value = undefined; props.resolved = "16";
    },
  ]);
  assert.deepEqual(cleared.commits, [""]);
  assert.equal(cleared.input.value, "16");
  assert.equal(resetOf(cleared.tree), undefined);

  let prevented = false;
  const reset = draftInput({ value: 18 }, [
    tree => inputOf(tree).onChange({ target: { value: "unsaved" } }),
    (tree, props) => {
      const button = resetOf(tree).props;
      button.onPointerDown({ preventDefault() { prevented = true; } });
      button.onClick(); inputOf(tree).onBlur();
      props.value = undefined; props.resolved = "16";
    },
  ]);
  assert.equal(prevented, true);
  assert.deepEqual(reset.commits, [""]);
  assert.equal(reset.input.value, "16");
});

test("failed edits remain invalid, Escape clears them, and composition does not commit prematurely", () => {
  const attempts = [], cleared = [];
  const invalid = draftInput({ onCommit(value) { attempts.push(value); return false; }, onClearError() { cleared.push(true); } }, [
    tree => inputOf(tree).onChange({ target: { value: "broken" } }),
    tree => { inputOf(tree).onKeyDown(keyEvent("Enter")); inputOf(tree).onBlur(); },
  ]);
  assert.equal(invalid.input.value, "broken");
  assert.equal(invalid.input["aria-invalid"], true);
  assert.deepEqual(attempts, ["broken"]);
  const escaped = draftInput({ onCommit: () => false, onClearError() { cleared.push(true); } }, [
    tree => inputOf(tree).onChange({ target: { value: "broken" } }),
    tree => inputOf(tree).onKeyDown(keyEvent("Enter")),
    tree => { assert.equal(inputOf(tree)["aria-invalid"], true); inputOf(tree).onKeyDown(keyEvent("Escape")); inputOf(tree).onBlur(); },
  ]);
  assert.equal(escaped.input.value, "16");
  assert.equal(escaped.input["aria-invalid"], undefined);
  assert.ok(cleared.length > 0);

  const composing = draftInput();
  composing.input.onChange({ target: { value: "17" } });
  composing.input.onKeyDown(keyEvent("Enter", { nativeEvent: { isComposing: true } }));
  composing.input.onKeyDown(keyEvent("Escape", { nativeEvent: { isComposing: true } }));
  assert.deepEqual(composing.commits, []);
  composing.input.onBlur();
  assert.deepEqual(composing.commits, ["17"]);

  const failedReset = draftInput({ value: 18, onCommit: () => false }, [
    tree => resetOf(tree).props.onClick(),
  ]);
  assert.equal(failedReset.input.value, "18");
  assert.equal(failedReset.input["aria-invalid"], true);
  assert.ok(resetOf(failedReset.tree));
});

test("select defaults show the actual value; raw shadows and Mixed are display-only", () => {
  for (const [key, resolved] of [["shadow", "rgba(0, 0, 0, 0.1) 0px 2px 8px 0px"], ["shadow", "Mixed"], ["textAlign", "left"]]) {
    const { tree, input, commits } = draftInput({ field: field(key), resolved });
    const options = nodes(tree).filter(node => node.type === "option");
    assert.equal(input.value, "");
    assert.equal(options[0].props.value, "");
    assert.equal(options[0].props.children, resolved);
    assert.deepEqual(options.slice(1).map(option => option.props.value), field(key).options);
    input.onChange({ target: { value: "" } });
    assert.deepEqual(commits, []);
  }
  const preset = draftInput({ field: field("shadow"), resolved: "none" });
  preset.input.onChange({ target: { value: "none" } });
  assert.deepEqual(preset.commits, [], "choosing the displayed default does not freeze it");
  preset.input.onChange({ target: { value: "md" } });
  assert.deepEqual(preset.commits, ["md"]);

  const authored = draftInput({ field: field("shadow"), value: "md", resolved: "rgba(0, 0, 0, 0.1) 0px 2px 8px 0px" });
  assert.equal(authored.input.value, "md");
  authored.input.onChange({ target: { value: "md" } }); assert.deepEqual(authored.commits, []);
  authored.input.onChange({ target: { value: "" } }); assert.deepEqual(authored.commits, [""]);

  const cleared = draftInput({ field: field("textAlign"), value: "right", resolved: "right" }, [
    (tree, props) => { inputOf(tree).onChange({ target: { value: "" } }); props.value = undefined; props.resolved = "left"; },
  ]);
  assert.deepEqual(cleared.commits, [""]);
  assert.equal(cleared.input.value, "");
  assert.equal(find(cleared.tree, node => node.type === "option").props.children, "left");
  const failed = draftInput({ field: field("shadow"), resolved: "none", onCommit: () => false }, [
    tree => inputOf(tree).onChange({ target: { value: "lg" } }),
  ]);
  assert.equal(failed.input.value, "lg");
  assert.equal(failed.input["aria-invalid"], true);
});

test("disabled inputs, selects, and resets cannot commit even through callbacks", () => {
  for (const extra of [{}, { value: 18 }, { field: field("shadow"), value: "md" }]) {
    const { tree, input, commits } = draftInput({ ...extra, disabled: true });
    assert.equal(input.disabled, true);
    input.onChange({ target: { value: "20" } });
    input.onKeyDown?.(keyEvent("Enter")); input.onBlur?.();
    const reset = resetOf(tree);
    if (reset) { assert.equal(reset.props.disabled, true); reset.props.onClick(); }
    assert.deepEqual(commits, []);
  }
  const disabledDuringEdit = draftInput({}, [
    (tree, props) => { inputOf(tree).onChange({ target: { value: "20" } }); props.disabled = true; },
    tree => inputOf(tree).onBlur(),
  ]);
  assert.deepEqual(disabledDuringEdit.commits, []);
});

const selection = { projectId: "project", pageId: "page", frameId: "frame", nodeId: "node" };
function inspectorProps(node, extra = {}) {
  const commands = [];
  return { commands, props: { composer: { controller: { execute(command) { commands.push(command); return true; } } }, selection, node, disabled: false, ...extra } };
}

test("groups keep authored precedence, stable measurement keys, and linked edit/reset ownership", () => {
  const entries = appearanceFields.filter(entry => entry.group === "padding");
  const values = { paddingLeft: 12.123456789012 }, commits = [];
  const props = { group: "padding", fields: entries, values, resolved: { paddingLeft: "12.123457", paddingTop: "8" }, disabled: false, targetLabel: "Component", onClearError: noop, onCommit: (...args) => { commits.push(args); return true; } };
  const first = capture(AppearanceGroup, props);
  const second = capture(AppearanceGroup, { ...props, resolved: { paddingLeft: "20", paddingTop: "10" } });
  assert.equal(fieldOf(first, "paddingLeft").props.value, 12.123456789012);
  assert.equal(fieldOf(first, "paddingLeft").props.resolved, "12.123457");
  for (const entry of entries) assert.equal(fieldOf(first, entry.key).key, fieldOf(second, entry.key).key);

  const linked = capture(AppearanceGroup, props, [
    tree => find(tree, node => node.type === "button" && node.props["aria-label"] === "Link padding sides").props.onClick(),
  ]);
  fieldOf(linked, "paddingLeft").props.onCommit("17.25");
  fieldOf(linked, "paddingLeft").props.onCommit("");
  assert.deepEqual(commits, [[field("paddingLeft"), "17.25", entries.map(entry => entry.key)], [field("paddingLeft"), "", entries.map(entry => entry.key)]]);
});

test("actual edits retain command ownership and remove only competing imported control keys", () => {
  const node = { id: "node", kind: "input", appearance: { fontSize: 18, color: "#123456" }, parts: { control: { fontSize: 19.123456789012, paddingLeft: 7 }, label: { fontSize: 12 } } };
  const before = structuredClone(node);
  const { commands, props } = inspectorProps(node);
  const inspector = capture(AppearanceInspector, props);
  const group = groupOf(inspector, "typography");
  assert.equal(group.props.values.fontSize, 19.123456789012);
  const input = capture(AppearanceInput, fieldOf(capture(AppearanceGroup, group.props), "fontSize").props);
  inputOf(input).onBlur(); inputOf(input).onKeyDown(keyEvent("Enter"));
  assert.deepEqual(commands, []);
  inputOf(input).onChange({ target: { value: "20.123456789012" } });
  inputOf(input).onKeyDown(keyEvent("Enter")); inputOf(input).onBlur();
  assert.deepEqual(commands, [{ type: "nodeCommands", pageId: "page", frameId: "frame", commands: [{ type: "update", nodeId: "node", appearance: { fontSize: 20.123456789012 }, parts: { control: { fontSize: null } } }] }]);
  assert.deepEqual(node, before);
  resetOf(input).props.onClick(); inputOf(input).onBlur();
  assert.deepEqual(commands[1].commands, [{ type: "update", nodeId: "node", appearance: { fontSize: null }, parts: { control: { fontSize: null } } }]);

  const partTree = capture(AppearanceInspector, props, [
    tree => find(tree, node => node.type === "select" && node.props["aria-label"] === "Edit component part").props.onChange({ target: { value: "label" } }),
  ]);
  groupOf(partTree, "typography").props.onCommit(field("fontSize"), "13.25");
  assert.deepEqual(commands[2].commands, [{ type: "update", nodeId: "node", parts: { label: { fontSize: 13.25 } } }]);
});

test("part reset is one scoped command, cancels drafts via fresh groups, and stays disabled when unset", () => {
  const node = { id: "node", kind: "input", appearance: { fontSize: 18 }, parts: { control: { paddingLeft: 7 }, label: { color: "#123456" } } };
  const { commands, props } = inspectorProps(node);
  let initialKey, prevented = false;
  const reset = capture(AppearanceInspector, props, [
    tree => {
      initialKey = groupOf(tree, "typography").key;
      const button = find(tree, node => node.type === "button" && node.props.children === "Reset part").props;
      button.onPointerDown({ preventDefault() { prevented = true; } }); button.onClick();
    },
  ]);
  assert.equal(prevented, true);
  assert.notEqual(groupOf(reset, "typography").key, initialKey);
  assert.deepEqual(commands, [{ type: "nodeCommands", pageId: "page", frameId: "frame", commands: [{ type: "update", nodeId: "node", appearance: null, parts: { control: null } }] }]);
  for (const extra of [{ node: { id: "node", kind: "stack" } }, { disabled: true }]) {
    const blocked = inspectorProps(node, extra);
    const tree = capture(AppearanceInspector, blocked.props);
    const button = find(tree, node => node.type === "button" && node.props.children === "Reset part").props;
    assert.equal(button.disabled, true); button.onClick();
    assert.deepEqual(blocked.commands, []);
  }
  const html = renderToStaticMarkup(h(AppearanceInspector, props));
  assert.match(html, /Current values/);
  assert.match(html, /Reset them to follow the system/);
  assert.doesNotMatch(html, /Inherited/);
});

test("invalid drafts and controller failures surface errors without writing unrelated commands", () => {
  const { commands, props } = inspectorProps({ id: "node", kind: "stack" });
  const invalid = capture(AppearanceInspector, props, [
    tree => assert.equal(groupOf(tree, "typography").props.onCommit(field("fontSize"), "not a number"), false),
  ]);
  assert.deepEqual(commands, []);
  assert.match(find(invalid, node => node.props.role === "alert").props.children, /number in pixels/);
  const failed = capture(AppearanceInspector, { ...props, composer: { controller: { execute: () => false } } }, [
    tree => assert.equal(groupOf(tree, "typography").props.onCommit(field("fontSize"), "20"), false),
  ]);
  assert.match(find(failed, node => node.props.role === "alert").props.children, /could not be saved/);
});

function measurementEnvironment(t) {
  class ElementStub {
    constructor(name, parentElement = null) { this.name = name; this.parentElement = parentElement; this.queries = new Map(); this.style = {}; }
    querySelector(selector) { return this.queries.get(selector) ?? null; }
    closest(selector) { return selector === "[data-node-overlay]" && this.name === "overlay" ? this : null; }
    getBoundingClientRect() { throw new Error("Camera-scaled rects are not appearance values"); }
  }
  const html = new ElementStub("html"), body = new ElementStub("body", html), camera = new ElementStub("camera", body), frame = new ElementStub("frame", camera);
  const owner = new ElementStub("owner", frame), control = new ElementStub("control", owner), label = new ElementStub("label", owner), overlay = new ElementStub("overlay", frame);
  frame.queries.set('[data-page-owner="node"]', owner);
  frame.queries.set('[data-page-node="node"]', control);
  owner.queries.set('[data-appearance-part="control"]', control);
  owner.queries.set('[data-appearance-part="label"]', label);
  control.style = { width: "240px", fontSize: "16px", lineHeight: "24px", backgroundColor: "rgb(18, 52, 86)", boxShadow: "rgba(0, 0, 0, 0.1) 0px 2px 8px 0px" };
  owner.style = { fontSize: "12px" }; label.style = { fontSize: "14px" };
  const frames = new Map(), mutations = [], resizes = [], reads = [];
  let serial = 0, fontReady;
  const fonts = new EventTarget();
  fonts.ready = new Promise(resolve => { fontReady = resolve; });
  class Observer {
    constructor(callback, collection) { this.callback = callback; this.observed = new Map(); this.disconnected = false; collection.push(this); }
    observe(element, options) { this.observed.set(element, options); }
    unobserve(element) { this.observed.delete(element); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
  }
  const globals = {
    Element: ElementStub,
    document: { querySelector(selector) { assert.equal(selector, '[data-frame-id="frame"]'); return frame; }, fonts },
    window: new EventTarget(),
    MutationObserver: class extends Observer { constructor(callback) { super(callback, mutations); } },
    ResizeObserver: class extends Observer { constructor(callback) { super(callback, resizes); } },
    requestAnimationFrame: callback => { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: element => { reads.push(element); return element.style; },
  };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  }
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  return { ...globals, frame, camera, body, html, owner, control, label, overlay, frames, mutations, resizes, reads, flush, fontReady, fonts };
}

test("measurements use the shared style reader, refresh on style/theme/resize/fonts, and never observe inspector contents", async t => {
  const env = measurementEnvironment(t), changes = [];
  const stop = observeAppearance("frame", "node", "element", true, appearanceFields, value => changes.push(value));
  assert.equal(env.frames.size, 1); env.flush();
  assert.equal(changes[0].width, "240");
  assert.equal(changes[0].lineHeight, "1.5");
  assert.equal(changes[0].background, "#123456");
  assert.equal(changes[0].shadow, env.control.style.boxShadow);
  assert.deepEqual(env.reads, [env.control]);
  const mutation = env.mutations[0], resize = env.resizes[0];
  assert.equal(mutation.observed.get(env.frame).subtree, true);
  for (const ancestor of [env.camera, env.body, env.html]) assert.notEqual(mutation.observed.get(ancestor).subtree, true);
  assert.equal(resize.observed.has(env.control), true);
  assert.equal(resize.observed.has(env.frame), true);

  env.control.style.fontSize = "20px";
  mutation.callback([{ target: env.control }]); mutation.callback([{ target: env.frame }]);
  assert.equal(env.frames.size, 1, "style and theme mutations coalesce into one measurement"); env.flush();
  assert.equal(changes.at(-1).fontSize, "20");
  mutation.callback([{ target: env.overlay }]);
  assert.equal(env.frames.size, 0, "overlay paint cannot start a measurement loop");

  env.control.style.width = "300px"; resize.callback([]); env.flush();
  assert.equal(changes.at(-1).width, "300");
  env.control.style.fontSize = "21px"; env.fontReady(); await Promise.resolve(); env.flush();
  assert.equal(changes.at(-1).fontSize, "21");
  env.control.style.fontSize = "22px"; env.fonts.dispatchEvent(new Event("loadingdone")); env.flush();
  assert.equal(changes.at(-1).fontSize, "22");
  env.control.style.fontSize = "23px"; env.fonts.dispatchEvent(new Event("loadingerror")); env.flush();
  assert.equal(changes.at(-1).fontSize, "23");
  env.control.style.width = "320px"; env.window.dispatchEvent(new Event("resize")); env.flush();
  assert.equal(changes.at(-1).width, "320");
  mutation.callback([{ target: env.frame }]); stop();
  assert.equal(env.frames.size, 0);
  assert.equal(mutation.disconnected, true); assert.equal(resize.disconnected, true);
  env.fonts.dispatchEvent(new Event("loadingdone")); env.window.dispatchEvent(new Event("resize"));
  assert.equal(env.frames.size, 0);
});

test("part measurements follow painted ownership and reattach after preview replacement", t => {
  const env = measurementEnvironment(t);
  for (const [target, isField, expected] of [["element", false, env.control], ["root", true, env.owner], ["label", true, env.label]]) {
    const stop = observeAppearance("frame", "node", target, isField, appearanceFields, noop);
    env.flush(); assert.equal(env.reads.at(-1), expected); stop();
  }
  const changes = [];
  const stop = observeAppearance("frame", "node", "element", true, appearanceFields, value => changes.push(value));
  env.flush();
  const replacement = new env.Element("replacement", env.owner);
  replacement.style = { fontSize: "28px" };
  env.owner.queries.set('[data-appearance-part="control"]', replacement);
  env.mutations.at(-1).callback([{ target: env.owner }]); env.flush();
  assert.equal(changes.at(-1).fontSize, "28");
  assert.equal(env.resizes.at(-1).observed.has(env.control), false);
  assert.equal(env.resizes.at(-1).observed.has(replacement), true);
  env.owner.queries.delete('[data-appearance-part="control"]');
  env.mutations.at(-1).callback([{ target: env.owner }]); env.flush();
  assert.deepEqual(changes.at(-1), {});
  stop();
});

test("font readiness after unmount cannot restart measurements", async t => {
  const env = measurementEnvironment(t);
  const stop = observeAppearance("frame", "node", "element", true, appearanceFields, noop);
  stop(); env.fontReady(); await Promise.resolve();
  assert.equal(env.frames.size, 0);
  assert.deepEqual(env.reads, []);
});
