import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePageDocument } from "./model.ts";
import { nodeAttributes, nodeRegistry } from "./registry.ts";
import { exportPageTSX } from "./export.ts";
import { applyPageCommand, applyPageCommands } from "./commands.ts";
import { createPageHistory, executePageCommands, undoPage, redoPage } from "./history.ts";
import { createPageBundle, parsePageBundle, serializePageBundle } from "./bundle.ts";
import { defaultSystem } from "../tokens.ts";
import { appearanceFields, appearanceFieldsFor, appearanceParts, appearanceToStyle, parseNodeAppearance, parseNodeParts } from "./appearance.ts";
import { hasAppearanceBox, mergeAppearanceStyle } from "../components/appearance.ts";

const specimen = JSON.parse(readFileSync(new URL("./appearance-specimen.json", import.meta.url), "utf8"));
function nodes(node) { return [node, ...(node.children ?? []).flatMap(nodes)]; }
const find = (page, id) => nodes(page.root).find((node) => node.id === id);
const sample = (field) => field.type === "color" ? "#123AbC" : field.type === "select" ? field.options[0]
  : field.key === "fontWeight" ? 650 : field.key === "opacity" ? 0.65 : field.key === "lineHeight" ? 1.45 : Math.min(field.max, Math.max(field.min, 12.25));
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test("appearance specimen covers every node kind and preserves exact fractional instance data", () => {
  assert.deepEqual(new Set(nodes(specimen.root).map((node) => node.kind)), new Set(Object.keys(nodeRegistry)));
  const source = freeze(structuredClone(specimen));
  const page = parsePageDocument(source);
  assert.deepEqual(page, specimen);
  assert.deepEqual(parsePageDocument(JSON.parse(JSON.stringify(page))), page);
  find(page, "appearance-stack").appearance.gap = 12;
  assert.equal(find(source, "appearance-stack").appearance.gap, 19.5);
  find(page, "appearance-input").parts.label.fontWeight = 400;
  assert.equal(find(source, "appearance-input").parts.label.fontWeight, 700);
});

test("metadata exposes only supported parts, meaningful gaps and choice-control typography", () => {
  assert.equal(new Set(appearanceFields.map((field) => field.key)).size, 29);
  assert.deepEqual(appearanceParts("input").map((part) => part.key), ["root", "label", "control", "description", "error"]);
  assert.deepEqual(appearanceParts("checkbox").map((part) => part.key), ["root", "row", "label", "control", "description", "error"]);
  for (const kind of ["card", "text", "button", "container"]) assert.deepEqual(appearanceParts(kind), []);
  for (const kind of ["text", "cardTitle", "cardDescription", "gridItem", "form", "checkbox", "switch"]) assert.ok(!appearanceFieldsFor(kind).some((field) => field.key === "gap"), kind);
  for (const kind of ["container", "input", "stack", "grid", "card", "cardHeader", "cardContent", "cardFooter", "button", "badge"]) assert.ok(appearanceFieldsFor(kind).some((field) => field.key === "gap"), kind);
  assert.deepEqual(appearanceFieldsFor("input", "row"), []);
  assert.deepEqual(appearanceFieldsFor("switch").filter((field) => field.group === "typography").map((field) => field.key), ["fontSize"]);
  assert.ok(appearanceFieldsFor("switch", "label").some((field) => field.key === "textAlign"));
});

test("every metadata value/boundary is accepted exactly where consumed; unsupported fields reject", () => {
  for (const kind of Object.keys(nodeRegistry)) {
    for (const part of [undefined, ...appearanceParts(kind).map((entry) => entry.key)]) {
      const fields = appearanceFieldsFor(kind, part);
      for (const field of fields) {
        const values = [sample(field), ...(field.options ?? []), ...(field.min === undefined ? [] : [field.min, field.max])];
        for (const value of values) assert.deepEqual(parseNodeAppearance({ [field.key]: value }, kind, part), { [field.key]: value }, `${kind}.${part}.${field.key}`);
        if (field.min !== undefined) for (const value of [field.min - 0.1, field.max + 0.1, NaN, Infinity, -Infinity, "12", true, null, undefined, {}, []]) {
          assert.throws(() => parseNodeAppearance({ [field.key]: value }, kind, part), /invalid/);
        }
      }
      for (const field of appearanceFields.filter((entry) => !fields.includes(entry))) assert.throws(() => parseNodeAppearance({ [field.key]: sample(field) }, kind, part), /unsupported/);
    }
  }
  assert.throws(() => parseNodeAppearance({ fontWeight: 450.5 }, "text"), /invalid fontWeight/);
});

test("serialized appearance rejects CSS injection, unknown/prototype keys and non-data objects", () => {
  for (const value of [null, [], "red", new Date(), Object.create({ width: 20 }), { get width() { throw new Error("getter must not run"); } }, { [Symbol("width")]: 20 }]) assert.throws(() => parseNodeAppearance(value, "text"), /expected/);
  for (const key of ["style", "className", "outline", "outlineWidth", "position", "transform", "backgroundImage", "--ds-primary", "constructor", "__proto__", "toString"]) {
    const raw = JSON.parse(JSON.stringify({ [key]: "unsafe" }));
    assert.throws(() => parseNodeAppearance(raw, "text"), /unknown or unsupported/);
    const page = structuredClone(specimen); page.root.appearance = raw;
    assert.throws(() => exportPageTSX(page), /unknown or unsupported/);
  }
  for (const value of ["red", "#fff", "#123456ff", "var(--ds-primary)", "url(https://evil.test/a)", "#ffffff;outline:none", "rgb(0,0,0)", "</style><script>alert(1)</script>"]) {
    for (const key of ["background", "color", "borderColor"]) assert.throws(() => parseNodeAppearance({ [key]: value }, "text"), /invalid/);
  }
  for (const value of ["transparent", "currentColor"]) assert.throws(() => parseNodeAppearance({ color: value }, "text"), /invalid/);
  for (const value of ["0 0 0 red", "var(--custom)", "xl"]) assert.throws(() => parseNodeAppearance({ shadow: value }, "text"), /invalid/);
  for (const value of [{ row: {} }, { thumb: {} }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => parseNodeParts(value, "input"), /unknown part/);
  assert.throws(() => parseNodeParts({}, "card"), /not supported/);
  for (const value of [null, [], { label: null }, { label: { style: "unsafe" } }]) assert.throws(() => parseNodeParts(value, "input"));
});

test("conversion is bounded, deterministic and leaves accessible outlines unmodified", () => {
  const appearance = { paddingLeft: 4.25, width: "fill", height: "hug", maxWidth: "fill", borderWidth: 0, shadow: "lg", background: "#123AbC", color: "#ffffff", lineHeight: 1.4 };
  const style = appearanceToStyle(appearance);
  assert.deepEqual(style, { boxSizing: "border-box", width: "100%", height: "auto", maxWidth: "100%", paddingLeft: 4.25, lineHeight: 1.4, backgroundColor: "#123AbC", color: "#ffffff", borderWidth: 0, boxShadow: "var(--ds-shadow-lg)", minHeight: 0, borderStyle: "solid" });
  assert.deepEqual(appearanceToStyle({ width: "hug", height: 24, minHeight: 8, shadow: "none" }), { boxSizing: "border-box", width: "fit-content", height: 24, minHeight: 8, boxShadow: "none" });
  assert.equal(appearanceToStyle(undefined), undefined);
  assert.equal(appearanceToStyle({}), undefined);
  assert.equal(hasAppearanceBox({ color: "#123456", fontSize: 24 }), false);
  assert.equal(hasAppearanceBox({ marginTop: 0 }), true);
  assert.equal(hasAppearanceBox({ width: "hug" }), true);
  assert.ok(!Object.keys(style).some((key) => key.startsWith("outline")));
  assert.deepEqual(appearanceToStyle(Object.fromEntries(Object.entries(appearance).reverse())), style);
  assert.deepEqual(mergeAppearanceStyle({ color: "red", outline: "2px solid blue" }, { color: "#123456" }), { boxSizing: "border-box", color: "#123456", outline: "2px solid blue" });
  const callback = (state) => ({ fontSize: state.disabled ? 10 : 20 });
  assert.equal(mergeAppearanceStyle(callback), callback);
  assert.deepEqual(mergeAppearanceStyle(callback, { fontSize: 18 })({ disabled: true }), { fontSize: 18, boxSizing: "border-box" });
});

test("appearance and parts update/reset merge independently and round trip through history", () => {
  const before = freeze(structuredClone(specimen));
  const history = createPageHistory(before);
  const commands = freeze([{ type: "update", nodeId: "appearance-input", appearance: { paddingTop: null, marginLeft: -3.5 }, parts: { label: { fontSize: 21, fontWeight: null }, control: null } }]);
  const edited = executePageCommands(history, commands);
  const input = find(edited.present, "appearance-input");
  assert.equal(input.appearance.paddingTop, undefined);
  assert.equal(input.appearance.paddingRight, 17);
  assert.equal(input.appearance.marginLeft, -3.5);
  assert.deepEqual(input.parts.label, { fontSize: 21, color: "#344054" });
  assert.equal(input.parts.control, undefined);
  assert.deepEqual(input.parts.description, find(before, "appearance-input").parts.description);
  assert.equal(edited.past.length, 1);
  assert.deepEqual(undoPage(edited).present, before);
  assert.deepEqual(redoPage(undoPage(edited)), edited);
  const reset = applyPageCommand(edited.present, { type: "update", nodeId: input.id, appearance: null, parts: null });
  assert.ok(!Object.hasOwn(find(reset, input.id), "appearance"));
  assert.ok(!Object.hasOwn(find(reset, input.id), "parts"));
  const one = applyPageCommand(reset, { type: "update", nodeId: input.id, appearance: { paddingTop: 1 }, parts: { label: { color: "#123456" } } });
  assert.deepEqual(applyPageCommand(one, { type: "update", nodeId: input.id, appearance: { paddingTop: null }, parts: { label: { color: null } } }), reset);
  const undone = undoPage(edited);
  assert.equal(executePageCommands(undone, [{ type: "update", nodeId: input.id, appearance: {}, parts: {} }]), undone);
  assert.deepEqual(before, specimen);
});

test("Container direction and local gap reset independently without materializing defaults", () => {
  const original = { version: 1, id: "auto-layout", name: "Auto layout", root: { id: "root", kind: "container", props: { maxWidth: "full" }, children: [] } };
  const active = applyPageCommand(original, { type: "update", nodeId: "root", props: { direction: "row", gap: "sm", wrap: false }, appearance: { gap: 12.25 } });
  assert.deepEqual(active.root.props, { maxWidth: "full", direction: "row", gap: "sm", wrap: false });
  assert.deepEqual(active.root.appearance, { gap: 12.25 });
  const sharedGap = applyPageCommand(active, { type: "update", nodeId: "root", appearance: { gap: null } });
  assert.equal(Object.hasOwn(sharedGap.root, "appearance"), false);
  assert.deepEqual(sharedGap.root.props, active.root.props);
  const dormant = applyPageCommand(active, { type: "update", nodeId: "root", props: { direction: null } });
  assert.deepEqual(dormant.root.props, { maxWidth: "full", gap: "sm", wrap: false });
  assert.deepEqual(dormant.root.appearance, { gap: 12.25 });
  assert.deepEqual(applyPageCommand(dormant, { type: "update", nodeId: "root", props: { gap: null, wrap: null }, appearance: null }), original);
  const history = createPageHistory(original);
  const edited = executePageCommands(history, [{ type: "update", nodeId: "root", props: { direction: "column" }, appearance: { gap: 0 } }]);
  assert.deepEqual(undoPage(edited).present, original);
  assert.deepEqual(redoPage(undoPage(edited)), edited);
});

test("invalid appearance commands, including unknown resets, reject atomically", () => {
  const before = freeze(structuredClone(specimen));
  for (const patch of [
    { appearance: { width: Infinity } }, { appearance: { paddingLeft: -1 } }, { appearance: { outline: null } },
    { appearance: JSON.parse('{"__proto__":null}') }, { appearance: { width: undefined } }, { appearance: undefined },
    { parts: { row: null } }, { parts: { error: { fontSize: null, outline: null } } }, { parts: { label: "bad" } },
    { parts: { label: undefined } }, { parts: [] }, { parts: undefined },
  ]) {
    assert.throws(() => applyPageCommands(before, [{ type: "rename", name: "Must not leak" }, { type: "update", nodeId: "appearance-input", ...patch }]));
    assert.deepEqual(before, specimen);
  }
  assert.throws(() => applyPageCommand(before, { type: "update", nodeId: "appearance-card", parts: { label: null } }), /not supported/);
});

test("old v1 documents/defaults stay unchanged and bundle themes are never recolored", () => {
  for (const file of ["account-settings.json", "design-safe.json"]) {
    const old = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
    const page = parsePageDocument(old);
    assert.deepEqual(page, old);
    for (const node of nodes(page.root)) {
      assert.ok(!Object.hasOwn(node, "appearance"));
      assert.ok(!Object.hasOwn(node, "parts"));
      assert.ok(!Object.hasOwn(nodeAttributes(node), "appearance"));
    }
  }
  const themes = structuredClone(defaultSystem);
  const plain = createPageBundle({ ...specimen, root: { id: "root", kind: "container", children: [] } }, themes);
  const bundle = parsePageBundle(serializePageBundle(createPageBundle(specimen, themes)));
  assert.deepEqual(bundle.page, specimen);
  assert.deepEqual(bundle.designSystem, plain.designSystem);
  assert.deepEqual(themes, defaultSystem);
});

test("nested appearance ordering exports deterministically and form styles are derived, not raw CSS", () => {
  const reverse = (value) => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverse(entry)])) : value;
  assert.equal(exportPageTSX(specimen), exportPageTSX(reverse(specimen)));
  const source = exportPageTSX(specimen);
  assert.match(source, /appearance=\{\{/);
  assert.match(source, /parts=\{\{/);
  assert.match(source, /<form[^>]+style=\{\{/);
  assert.doesNotMatch(source, /<style|dangerouslySetInnerHTML|appearanceToStyle|page-document/);
  for (const kind of ["input", "switch", "checkbox"]) {
    for (const [key, invalid] of [["errorPosition", "left"], ["errorIcon", "<svg />"]]) {
      const page = structuredClone(specimen);
      nodes(page.root).find((node) => node.kind === kind).props[key] = invalid;
      assert.throws(() => parsePageDocument(page), new RegExp(`invalid ${key}`));
    }
  }
});
