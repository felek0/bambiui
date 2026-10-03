import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installParityLoader } from "../page-document/parity-loader.mjs";
const loader = installParityLoader(); after(() => loader.cleanup());
const { Frame } = await import("./frame.tsx");
const { createComposerFrame } = await import("./model.ts");
const { defaultSystem } = await import("../tokens.ts");
const render = (frame, system = defaultSystem, theme = "light") => renderToStaticMarkup(createElement(Frame, { frame, system, theme, selected: true, selectedNodeId: null, preview: false, onSelect() {}, onSelectNode() {} }));

test("frame renders real stored nodes in a div scope without mutating roots or emitting main/font links", () => {
  const frame = createComposerFrame("f", "root");
  frame.root.children = [{ id: "stack", kind: "stack", children: [{ id: "text", kind: "text", text: "Saved content" }, { id: "action", kind: "button", text: "Saved action" }] }];
  const before = structuredClone(frame), html = render(frame);
  assert.match(html, /width:1440px/); assert.match(html, /height:900px/); assert.match(html, /data-page-node="root"/);
    assert.match(html, /data-max-width="full"/);
  assert.match(html, /data-page-node="action"/); assert.match(html, /Saved action/); assert.match(html, /data-editor-mode="design"/); assert.match(html, /aria-hidden="true"/); assert.doesNotMatch(html, /inert=/);
  assert.doesNotMatch(html, /<main|<link|Empty frame/); assert.deepEqual(frame, before);
});
test("frame paints only its supplied project system and theme, missing reference never paints fallback", () => {
  const frame = createComposerFrame("f", "root"), system = structuredClone(defaultSystem);
  system.themes.light.global.background = "#aabbcc"; system.themes.dark.global.background = "#112233";
  assert.match(render(frame, system), /--ds-background:#aabbcc/);
  assert.match(render(frame, system, "dark"), /data-ds-theme="dark"/);
  assert.match(render(frame, system, "dark"), /--ds-background:#112233/);
  const missing = render(frame, null); assert.doesNotMatch(missing, /--ds-background|data-ds-theme|data-page-node/);
  assert.match(missing, /Linked system unavailable/);
});
test("blank frame has an explicit empty drop hint and preview-only clipping policy", () => {
  const html = render(createComposerFrame("f", "root", "mobile"));
  assert.match(html, /width:390px/); assert.match(html, /Empty frame · Drop area/);
  assert.match(html, /Drag from Insert/); assert.match(html, /editor preview clips overflow/);
  assert.match(html, /Not an isolated viewport or export preview/);
});
