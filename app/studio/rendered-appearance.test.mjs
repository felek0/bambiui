import assert from "node:assert/strict";
import test from "node:test";
import { appearanceFields } from "./components/appearance.ts";
import { appearanceValuesFromStyle, readRenderedAppearance, canvasAppearanceElements, readCanvasAppearance } from "./rendered-appearance.ts";

const fields = (...keys) => appearanceFields.filter(field => keys.includes(field.key));
function globals(values, run) {
  const descriptors = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  try { return run(); }
  finally { for (const [key, descriptor] of Object.entries(descriptors)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
}

test("measured lengths, unitless line height and CSS keyword values match inspector units", () => {
  const style = Object.freeze({ width: "123.375px", height: "auto", minWidth: "0px", maxWidth: "none", paddingLeft: "12.125px", marginTop: "-4.5px", borderTopLeftRadius: "8px", fontSize: "16px", fontWeight: "650", lineHeight: "24px", letterSpacing: "normal", gap: "normal", opacity: "0.75" });
  assert.deepEqual(appearanceValuesFromStyle(style, appearanceFields), { width: "123.375", height: "auto", minWidth: "0", maxWidth: "none", paddingLeft: "12.125", marginTop: "-4.5", borderTopLeftRadius: "8", fontSize: "16", fontWeight: "650", lineHeight: "1.5", letterSpacing: "0", gap: "0", opacity: "0.75" });
  assert.equal(appearanceValuesFromStyle({ fontSize: "15px", lineHeight: "20px" }, fields("lineHeight")).lineHeight, "1.333333");
  assert.equal(appearanceValuesFromStyle({ lineHeight: "normal" }, fields("lineHeight")).lineHeight, "normal");
  assert.equal(appearanceValuesFromStyle({ gap: "4px 8px" }, fields("gap")).gap, "4px 8px", "unequal axes must not be silently simplified");
});

test("resolved alignment respects direction without changing stored alignment keywords", () => {
  for (const [direction, start, end] of [["ltr", "left", "right"], ["rtl", "right", "left"]]) {
    assert.equal(appearanceValuesFromStyle({ direction, textAlign: "start" }, fields("textAlign")).textAlign, start);
    assert.equal(appearanceValuesFromStyle({ direction, textAlign: "end" }, fields("textAlign")).textAlign, end);
  }
  assert.equal(appearanceValuesFromStyle({ textAlign: "center" }, fields("textAlign")).textAlign, "center");
});

test("paint reads backgroundColor and boxShadow; translucent/modern colors remain accurate", () => {
  for (const [css, expected] of [
    ["rgb(18, 52, 86)", "#123456"], ["rgb(18 52 86 / 100%)", "#123456"],
    ["rgb(50% 0% 100%)", "#8000ff"], ["rgba(12, 34, 56, 0)", "transparent"],
    ["color(srgb 0.5 0 1)", "#8000ff"], ["color(srgb 1 0 0 / 0)", "transparent"],
    ["rgba(12, 34, 56, 0.5)", "rgba(12, 34, 56, 0.5)"],
    ["color(srgb 1 0 0 / 0.5)", "color(srgb 1 0 0 / 0.5)"],
    ["oklch(0.5 0.1 90)", "oklch(0.5 0.1 90)"], ["transparent", "transparent"],
  ]) assert.equal(appearanceValuesFromStyle({ backgroundColor: css }, fields("background")).background, expected, css);
  const shadow = "rgba(0, 0, 0, 0.1) 0px 2px 8px 0px";
  assert.deepEqual(appearanceValuesFromStyle({ boxShadow: shadow, shadow: "wrong" }, fields("shadow")), { shadow });
});

test("aggregate measurements show Mixed only for genuinely differing properties and never use zoomed rects", () => {
  const element = style => Object.freeze({ style: Object.freeze(style), getBoundingClientRect() { throw new Error("Zoomed rectangles are not property values"); } });
  const elements = [element({ fontSize: "16px", paddingLeft: "4px", boxShadow: "none" }), element({ fontSize: "20px", paddingLeft: "4px", boxShadow: "none" })];
  globals({ getComputedStyle: element => element.style }, () => {
    assert.deepEqual(readRenderedAppearance(elements, fields("fontSize", "paddingLeft", "shadow")), { fontSize: "Mixed", paddingLeft: "4", shadow: "none" });
    assert.deepEqual(readRenderedAppearance([], appearanceFields), {});
    assert.deepEqual(readRenderedAppearance([element({})], appearanceFields), {}, "missing measurements are not fabricated zeroes");
  });
});

function canvasFixture() {
  const part = (name, target, style = {}, children = []) => ({ name, dataset: { componentTarget: target }, style, querySelectorAll: () => children });
  const title = part("title", "text", { fontSize: "16px" });
  const nested = part("nestedText", "text", { fontSize: "18px" });
  const content = part("content", "frame", { fontSize: "99px" }, [nested]);
  const native = part("native", "text", { lineHeight: "24px", fontSize: "16px", paddingTop: "8px" });
  const shell = part("shell", "frame", { lineHeight: "32px", fontSize: "16px", paddingTop: "0px" });
  const groups = { card: { title: [title], content: [content] }, input: { control: [shell, native] } };
  const matrices = Object.fromEntries(Object.entries(groups).map(([component, parts]) => [component, {
    querySelectorAll: () => ["outlined.sm", "outlined.md"].map(recipe => ({ dataset: { recipeExample: recipe }, querySelectorAll: selector => parts[/data-component-part="([^"]+)"/.exec(selector)?.[1]] ?? [] })),
  }]));
  return { title, nested, content, native, shell, document: { querySelector: selector => matrices[/data-component-matrix="([^"]+)"/.exec(selector)?.[1]] }, getComputedStyle: element => element.style };
}

test("canvas lookup follows exact recipe, frame/text anatomy and Card-owned descendant typography", () => {
  const fixture = canvasFixture();
  globals({ document: fixture.document, getComputedStyle: fixture.getComputedStyle }, () => {
    assert.deepEqual(canvasAppearanceElements({ component: "card", recipe: "outlined.md", part: "title", target: "text" }), [fixture.title]);
    assert.deepEqual(canvasAppearanceElements({ component: "card", recipe: "missing.md", part: "title", target: "text" }), []);
    assert.deepEqual(canvasAppearanceElements({ component: "card", recipe: "outlined.md", part: "title", target: "frame" }), [fixture.title]);
    assert.deepEqual(canvasAppearanceElements({ component: "card", recipe: "outlined.md", part: "content", target: "text" }), [fixture.nested]);
    assert.deepEqual(canvasAppearanceElements({ component: "card", part: "content" }), [fixture.content, fixture.content], "legacy shared Card slot styles still describe the wrapper");
    assert.deepEqual(canvasAppearanceElements({ component: "badge", part: "root" }), []);
  });
});

test("Input text reads native typography while frame geometry reads the painted shell", () => {
  const fixture = canvasFixture();
  globals({ document: fixture.document, getComputedStyle: fixture.getComputedStyle }, () => {
    const scope = { component: "input", part: "control", recipe: "outlined.md" };
    assert.deepEqual(canvasAppearanceElements({ ...scope, target: "frame" }), [fixture.shell]);
    assert.deepEqual(canvasAppearanceElements({ ...scope, target: "text" }), [fixture.native]);
    assert.deepEqual(readCanvasAppearance(scope, fields("paddingTop", "lineHeight")), { paddingTop: "0", lineHeight: "1.5" });
  });
});
