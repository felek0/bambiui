import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { nodeRegistry } from "./page-document/registry.ts";
import { parsePageDocument } from "./page-document/model.ts";
import { createPageNode } from "./page-document/defaults.ts";

const guard = registerHooks({ resolve(specifier, context, nextResolve) {
  if (/(?:^|\/)tokens(?:\.ts)?$/.test(specifier)) throw new Error("Component defaults must not import runtime tokens");
  return nextResolve(specifier, context);
} });
const { componentDefaultIds, componentDefaultFields, parseComponentDefaults, resolveComponentDefaults, createComponentNode } = await import("./component-defaults.ts");
guard.deregister();

const ids = () => { let serial = 0; return () => `node-${++serial}`; };
const flatten = node => [node, ...(node.children ?? []).flatMap(flatten)];
function pageFor(node) {
  let child = node;
  if (["cardTitle", "cardDescription"].includes(child.kind)) child = { id: "header", kind: "cardHeader", children: [child] };
  if (child.kind.startsWith("card") && child.kind !== "card") child = { id: "card", kind: "card", children: [child] };
  if (child.kind === "gridItem") child = { id: "grid", kind: "grid", children: [child] };
  return { version: 1, id: "page", name: "Page", root: child.kind === "container" ? child : { id: "root", kind: "container", children: [{ id: "stack", kind: "stack", children: [child] }] } };
}

test("every registry kind creates a complete valid tree without local styles; layouts stay empty", () => {
  for (const kind of Object.keys(nodeRegistry)) {
    const node = createComponentNode(kind, ids());
    assert.doesNotThrow(() => parsePageDocument(pageFor(node)), kind);
    for (const entry of flatten(node)) {
      assert.equal(Object.hasOwn(entry, "appearance"), false);
      assert.equal(Object.hasOwn(entry, "parts"), false);
      if (nodeRegistry[entry.kind].props.name) assert.equal(entry.props.name, entry.id);
    }
    if (nodeRegistry[kind].source !== "components") assert.deepEqual(node.children, []);
  }
});

test("starter parameters have useful content, accessible labels and interactive initial states", () => {
  const button = resolveComponentDefaults("button"), input = resolveComponentDefaults("input");
  assert.equal(button.text, "Continue"); assert.equal(button.props.variant, "primary"); assert.equal(button.props.size, "md");
  assert.equal(button.props.loading, false); assert.equal(button.props.disabled, false);
  assert.equal(input.props.label, "Email address"); assert.equal(input.props.placeholder, "you@example.com");
  assert.ok(input.props.description); assert.equal(input.props.defaultValue, ""); assert.equal(input.props.error, undefined);
  assert.equal(resolveComponentDefaults("switch").props.defaultChecked, true);
  assert.equal(resolveComponentDefaults("checkbox").props.defaultChecked, false);
  for (const id of componentDefaultIds) {
    const value = resolveComponentDefaults(id);
    assert.equal(value.props.name, undefined); assert.equal(value.props.radius, undefined); assert.equal(value.props.as, undefined);
    assert.equal(value.props.size, "md");
  }
  assert.ok(resolveComponentDefaults("badge").text);
  assert.ok(resolveComponentDefaults("text").text);
});

test("Card includes Header with Title and Description, meaningful Text content and a Footer action", () => {
  const card = createComponentNode("card", ids());
  const [header, content, footer] = card.children;
  assert.deepEqual(card.children.map(child => child.kind), ["cardHeader", "cardContent", "cardFooter"]);
  assert.deepEqual(header.children.map(child => child.kind), ["cardTitle", "cardDescription"]);
  assert.equal(content.children[0].kind, "text"); assert.equal(footer.children[0].kind, "button");
  assert.equal(flatten(card).length, 8); assert.equal(new Set(flatten(card).map(node => node.id)).size, 8);
  const copy = resolveComponentDefaults("card").slots;
  assert.deepEqual([header.children[0].text, header.children[1].text, content.children[0].text, footer.children[0].text], [copy.title, copy.description, copy.content, copy.action]);
  for (const text of Object.values(copy)) assert.ok(text.trim().length > 5);
});

test("partial System defaults merge with starters and compose Card copy with Text/Button parameters", () => {
  const defaults = {
    card: { props: { variant: "filled", size: "lg", radius: "sm" }, slots: { title: "Your account", content: "Review your details.", action: "Save changes" } },
    button: { text: "Standalone action", props: { variant: "secondary", size: "sm" } },
    text: { text: "Standalone text", props: { variant: "caption", tone: "info" } },
  };
  const before = structuredClone(defaults), card = createComponentNode("card", ids(), defaults);
  const [header, content, footer] = card.children;
  assert.equal(header.children[0].text, "Your account"); assert.ok(header.children[1].text);
  assert.equal(content.children[0].text, "Review your details."); assert.equal(content.children[0].props.variant, "caption");
  assert.equal(footer.children[0].text, "Save changes"); assert.equal(footer.children[0].props.variant, "secondary"); assert.equal(footer.children[0].props.size, "sm");
  assert.equal(createComponentNode("button", ids(), defaults).text, "Standalone action");
  assert.equal(createComponentNode("cardTitle", ids(), defaults).text, "Your account");
  assert.equal(createComponentNode("cardFooter", ids(), defaults).children[0].text, "Save changes");
  assert.deepEqual(defaults, before); assert.doesNotThrow(() => parsePageDocument(pageFor(card)));
});

test("empty optional copy suppresses starter messages without changing required labels or legacy documents", () => {
  for (const component of ["input", "switch", "checkbox"]) {
    const defaults = { [component]: { props: { description: "", error: "" } } };
    assert.deepEqual(parseComponentDefaults(defaults), defaults);
    const effective = resolveComponentDefaults(component, defaults);
    assert.equal(Object.hasOwn(effective.props, "description"), false);
    assert.equal(Object.hasOwn(effective.props, "error"), false);
    assert.ok(effective.props.label);
    assert.doesNotThrow(() => parsePageDocument(pageFor(createComponentNode(component, ids(), defaults))));
    assert.ok(resolveComponentDefaults(component).props.description, "reset restores the starter description");
    assert.throws(() => parseComponentDefaults({ [component]: { props: { label: "" } } }));
    assert.throws(() => parseComponentDefaults({ [component]: { props: { description: " " } } }));
  }
  const input = createComponentNode("input", ids(), { input: { props: { placeholder: "" } } });
  assert.equal(input.props.placeholder, "");
});

test("controlled snapshots replace starter initial values without conflicting bindings", () => {
  for (const [kind, props, absent] of [["input", { value: "person@example.com", readOnly: true }, "defaultValue"], ["switch", { checked: false }, "defaultChecked"], ["checkbox", { checked: true, indeterminate: true }, "defaultChecked"]]) {
    const defaults = { [kind]: { props } }, value = resolveComponentDefaults(kind, defaults);
    assert.equal(Object.hasOwn(value.props, absent), false);
    for (const [key, expected] of Object.entries(props)) assert.equal(value.props[key], expected);
    assert.doesNotThrow(() => parsePageDocument(pageFor(createComponentNode(kind, ids(), defaults))));
  }
});

test("each insertion derives a fresh field name and produces detached defaults, props and slot trees", () => {
  const defaults = { input: { props: { label: "Full name", type: "text", placeholder: "Alex Morgan" } }, card: { slots: { title: "Original title" } } };
  const next = ids(), first = createComponentNode("input", next, defaults), second = createComponentNode("input", next, defaults);
  assert.notEqual(first.props.name, second.props.name); assert.equal(first.props.name, first.id); assert.equal(second.props.name, second.id);
  first.props.label = "Edited"; assert.equal(second.props.label, "Full name");
  const parsed = parseComponentDefaults(defaults), effective = resolveComponentDefaults("card", defaults), card = createComponentNode("card", next, defaults);
  parsed.input.props.label = "Parsed edit"; effective.slots.title = "Resolved edit"; card.children[0].children[0].text = "Instance edit";
  assert.equal(defaults.input.props.label, "Full name"); assert.equal(defaults.card.slots.title, "Original title");
  assert.equal(resolveComponentDefaults("card").slots.title, "Project overview");
  assert.deepEqual(parseComponentDefaults({}), {});
});

test("metadata is registry-backed, omits generated names, and exposes only the four Card text slots", () => {
  for (const id of componentDefaultIds) {
    const fields = componentDefaultFields(id), props = fields.filter(field => field.source === "props");
    assert.deepEqual(props.map(field => field.key), Object.keys(nodeRegistry[id].props).filter(key => key !== "name"));
    assert.equal(fields.some(field => ["name", "appearance", "parts", "style"].includes(field.key)), false);
    for (const field of props) {
      const rule = nodeRegistry[id].props[field.key];
      if (typeof rule === "string") assert.equal(field.maxLength, 200);
      else assert.deepEqual(field.options, rule);
    }
    assert.equal(fields.some(field => field.source === "text"), !!nodeRegistry[id].text);
  }
  assert.deepEqual(componentDefaultFields("card").filter(field => field.source === "slots").map(field => field.key), ["title", "description", "content", "action"]);
  const fields = componentDefaultFields("button"); fields.find(field => field.key === "variant").options.push("invented");
  assert.equal(nodeRegistry.button.props.variant.includes("invented"), false);
  assert.throws(() => componentDefaultFields("stack"), /unknown component/);
  assert.throws(() => resolveComponentDefaults("constructor"), /unknown component/);
});

test("strict defaults parser rejects names, styles, arbitrary code, children, unknown keys and invalid bindings", () => {
  for (const value of [
    null, undefined, [], "{}", 42, { stack: {} }, { cardTitle: {} }, { unknown: {} }, { button: null }, { button: [] },
    { button: { appearance: { color: "#112233" } } }, { input: { parts: {} } }, { card: { children: [] } },
    { button: { props: { style: "color:red" } } }, { button: { props: { className: "custom" } } }, { button: { props: { onClick() {} } } },
    { input: { props: { name: "saved-name" } } }, { input: { text: "Wrong slot" } }, { button: { slots: { title: "No" } } },
    { card: { slots: { footer: "Unknown" } } }, { card: { slots: { title: " " } } }, { card: { slots: { title: "x".repeat(2001) } } },
    { button: { text: "" } }, { button: { text: false } }, { button: { text: "x".repeat(2001) } },
    { button: { props: { buttonType: "button" } } }, { button: { props: { variant: "invented" } } },
    { button: { props: { disabled: "false" } } }, { button: { props: { size: 2 } } }, { input: { props: { label: " " } } },
    { input: { props: { label: "x".repeat(201) } } }, { input: { props: { placeholder: null } } },
    { input: { props: { value: "", defaultValue: "" } } }, { switch: { props: { checked: false, defaultChecked: false } } },
    { checkbox: { props: { checked: true, defaultChecked: true } } }, { text: { props: { radius: "md" } } },
    JSON.parse('{"__proto__":{}}'), JSON.parse('{"button":{"props":{"__proto__":"no"}}}'), { constructor: {} },
  ]) assert.throws(() => parseComponentDefaults(value));
  assert.doesNotThrow(() => parseComponentDefaults({ input: { props: { placeholder: "", value: " ", label: "x".repeat(200) } }, text: { text: "x".repeat(2000) } }));
});

test("parser rejects getters, symbols, inherited and hidden properties without invoking executable values", () => {
  let calls = 0;
  const getter = Object.defineProperty({}, "button", { enumerable: true, get() { calls++; return {}; } });
  const hidden = Object.defineProperty({}, "button", { value: {} });
  const propsGetter = Object.defineProperty({}, "label", { enumerable: true, get() { calls++; return "No"; } });
  for (const value of [getter, hidden, { [Symbol("button")]: {} }, Object.create({ button: {} }), new Date(), { input: { props: propsGetter } }, { button: { props: new Map() } }, { card: { slots: { title() {} } } }]) assert.throws(() => parseComponentDefaults(value));
  assert.equal(calls, 0);
  assert.deepEqual(parseComponentDefaults(Object.assign(Object.create(null), { button: { text: "Safe" } })), { button: { text: "Safe" } });
});

test("parsing is deterministic, rejects invalid data at resolution/factory boundaries, and never rewrites legacy nodes", () => {
  const a = { input: { props: { readOnly: true, label: "Name" } }, button: { text: "Go", props: { size: "lg", variant: "ghost" } } };
  const b = { button: { props: { variant: "ghost", size: "lg" }, text: "Go" }, input: { props: { label: "Name", readOnly: true } } };
  assert.equal(JSON.stringify(parseComponentDefaults(a)), JSON.stringify(parseComponentDefaults(b)));
  assert.throws(() => resolveComponentDefaults("input", { input: { props: { name: "no" } } }));
  assert.throws(() => createComponentNode("button", ids(), { button: { props: { loading: "yes" } } }));
  assert.throws(() => createComponentNode("card", () => "same"), /fresh valid node id/);
  assert.throws(() => createComponentNode("input", () => "not a valid id"), /fresh valid node id/);
  const legacy = createPageNode("card", ids()), before = structuredClone(legacy);
  assert.deepEqual(legacy.children.map(child => child.kind), ["cardHeader"]);
  createComponentNode("card", ids(), a);
  assert.deepEqual(legacy, before); assert.equal(legacy.props, undefined);
});
