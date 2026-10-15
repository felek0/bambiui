import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { appearanceFields } from "./components/appearance.ts";
import { appearanceFieldGuide, appearanceFieldHint, appearanceFieldUnit, appearanceFieldWide, appearanceStyleDraft, appearanceSaveError } from "./appearance-field-ui.ts";
import { appearanceDraft } from "./composer/appearance-draft.ts";
import { installParityLoader } from "./page-document/parity-loader.mjs";
const loader = installParityLoader();
const { AppearanceFieldHelp } = await import("./appearance-field-help.tsx");
after(() => loader.cleanup());
const field = key => appearanceFields.find(field => field.key === key);

test("field units and guidance distinguish pixel lengths from weight, ratios and opacity", () => {
  for (const key of ["width", "paddingTop", "marginLeft", "fontSize", "letterSpacing", "borderWidth"]) assert.equal(appearanceFieldUnit(field(key)), "px");
  assert.equal(appearanceFieldUnit(field("lineHeight")), "×");
  assert.equal(appearanceFieldUnit(field("opacity")), "0–1");
  assert.equal(appearanceFieldUnit(field("fontWeight")), undefined);
  assert.match(appearanceFieldGuide(field("lineHeight")), /0.1–10 \(unitless multiplier\)/);
  assert.match(appearanceFieldGuide(field("opacity")), /0–1 \(unitless, not percent\)/);
  assert.match(appearanceFieldGuide(field("fontWeight")), /1–1000 \(whole numbers\)/);
  assert.match(appearanceFieldGuide(field("width")), /0–10000 px, or hug \/ fill/);
  assert.match(appearanceFieldGuide(field("maxWidth")), /or fill/);
  assert.match(appearanceFieldGuide(field("marginLeft")), /-1000–1000 px/);
  assert.match(appearanceFieldGuide(field("color")), /six-digit hex color\./);
  assert.match(appearanceFieldGuide(field("background")), /or transparent/);
});

test("common parsing preserves all bounds, fractions and presets without materializing defaults", () => {
  for (const entry of appearanceFields) {
    const blank = appearanceStyleDraft(entry, " ");
    assert.deepEqual(blank, { [entry.key]: null });
    if (entry.type === "number" || entry.type === "dimension") {
      for (const value of [entry.min, entry.max]) assert.deepEqual(appearanceStyleDraft(entry, String(value)), { [entry.key]: value }, entry.key);
      const fractional = entry.key === "fontWeight" ? 650 : entry.key === "opacity" ? 0.123456789012 : entry.key === "lineHeight" ? 1.123456789012 : 12.123456789012;
      assert.deepEqual(appearanceStyleDraft(entry, String(fractional)), { [entry.key]: fractional });
      for (const value of [entry.min - 1, entry.max + 1, "12px", "1e3", "Infinity", "NaN", "calc(1px + 2px)"]) assert.throws(() => appearanceStyleDraft(entry, String(value)), entry.key);
    }
    for (const value of entry.options ?? []) assert.deepEqual(appearanceStyleDraft(entry, value), { [entry.key]: value });
  }
  assert.throws(() => appearanceStyleDraft(field("fontWeight"), "650.5"), /whole numbers/);
  assert.deepEqual(appearanceStyleDraft(field("color"), " #aBcDeF "), { color: "#aBcDeF" });
});

test("System and Project use identical syntax/range errors, with accurate unitless messages", () => {
  for (const [key, draft] of [["lineHeight", "1.5px"], ["opacity", "50%"], ["fontWeight", "400.5"], ["paddingTop", "1001"], ["background", "#abc"]]) {
    let system, project;
    try { appearanceStyleDraft(field(key), draft); } catch (error) { system = error.message; }
    try { appearanceDraft("container", field(key), draft); } catch (error) { project = error.message; }
    assert.equal(project, system); assert.equal(system, appearanceFieldGuide(field(key)));
    if (["lineHeight", "opacity", "fontWeight"].includes(key)) assert.doesNotMatch(system, /pixels|\bpx\b/);
  }
  assert.equal(appearanceSaveError(field("fontSize"), "broken"), appearanceFieldGuide(field("fontSize")));
  assert.equal(appearanceSaveError(field("fontSize"), "16"), "This edit could not be saved. Check the project notice.");
  assert.throws(() => appearanceDraft("text", field("gap"), "10"), "node allowlists remain authoritative after shared value validation");
});

test("long raw shadows, Mixed and measured keywords are accurate read-only display, never saved presets", () => {
  const current = "rgba(0, 0, 0, 0.15) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 8px 16px -2px";
  const tree = AppearanceFieldHelp({ id: "shadow", label: "Card Shadow", field: field("shadow"), current });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /data-appearance-help="shadow"/);
  assert.match(html, /aria-label="Value and limits for Card Shadow"/);
  assert.ok(html.includes(current));
  assert.match(html, /display-only/);
  assert.match(html, /Clear or reset/);
  assert.doesNotMatch(html, /<input|<button|<select|<textarea|\bopen=/);
  assert.throws(() => appearanceStyleDraft(field("shadow"), current));
  for (const [key, value] of [["fontSize", "Mixed"], ["lineHeight", "normal"], ["width", "auto"], ["background", "rgba(0, 0, 0, 0.5)"]]) {
    const html = renderToStaticMarkup(h(AppearanceFieldHelp, { id: key, label: key, field: field(key), current: value }));
    assert.ok(html.includes(value)); assert.throws(() => appearanceStyleDraft(field(key), value));
  }
  assert.equal(appearanceFieldWide(field("shadow")), true);
  assert.equal(appearanceFieldWide(field("background")), true);
  assert.equal(appearanceFieldWide(field("fontSize")), false);
  assert.match(appearanceFieldHint(field("fontSize")), /Mixed.*not a saved value.*Enter commits; Escape cancels/);
});
