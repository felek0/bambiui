import assert from "node:assert/strict";
import test, { after } from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { appearanceFields } from "../page-document/appearance.ts";
import { appearanceDraft, linkedAppearancePatch } from "./appearance-draft.ts";
import { createComposerDocument, createComposerFrame, createComposerPage } from "./model.ts";
import { applyComposerCommand } from "./commands.ts";
import { installParityLoader } from "../page-document/parity-loader.mjs";

const nextResolution = registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === "next/link" ? "next/link.js" : specifier, context); } });
const loader = installParityLoader();
const { NodeInspector } = await import("./node-inspector.tsx");
const { FrameInspector } = await import("./frame-inspector.tsx");
after(() => { loader.cleanup(); nextResolution.deregister(); });

const field = key => appearanceFields.find(entry => entry.key === key);

test("appearance drafts preserve fractional values, reset blank values, and distinguish dimensions from CSS strings", () => {
  assert.deepEqual(appearanceDraft("card", field("paddingLeft"), " 12.375 "), { paddingLeft: 12.375 });
  assert.deepEqual(appearanceDraft("card", field("paddingLeft"), ""), { paddingLeft: null });
  assert.deepEqual(appearanceDraft("cardTitle", field("fontSize"), "25.5"), { fontSize: 25.5 });
  assert.deepEqual(appearanceDraft("button", field("width"), "fill"), { width: "fill" });
  assert.deepEqual(appearanceDraft("button", field("width"), "hug"), { width: "hug" });
  assert.deepEqual(appearanceDraft("input", field("fontSize"), "12", "error"), { fontSize: 12 });
  for (const value of ["NaN", "Infinity", "12px", "calc(100% - 1px)", "1e3", "-2", "1001"]) assert.throws(() => appearanceDraft("card", field("paddingLeft"), value));
  assert.throws(() => appearanceDraft("card", field("fontWeight"), "400.5"));
  assert.throws(() => appearanceDraft("text", field("gap"), "10"));
  assert.throws(() => appearanceDraft("button", field("fontSize"), "12", "error"));
});

test("color drafts accept only explicit local colors; linking changes or resets the four requested edges only", () => {
  assert.deepEqual(appearanceDraft("card", field("background"), "#abcDEF"), { background: "#abcDEF" });
  assert.deepEqual(appearanceDraft("card", field("background"), "transparent"), { background: "transparent" });
  for (const value of ["#abc", "red", "url(https://example.com/image)", "var(--ds-background)"]) assert.throws(() => appearanceDraft("card", field("background"), value));
  const keys = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
  assert.deepEqual(linkedAppearancePatch({ paddingLeft: 12.75 }, keys), Object.fromEntries(keys.map(key => [key, 12.75])));
  assert.deepEqual(linkedAppearancePatch({ paddingTop: null }, keys), Object.fromEntries(keys.map(key => [key, null])));
  assert.throws(() => linkedAppearancePatch({ fontSize: 12 }, keys));
});

function composerFor(node) {
  const document = createComposerDocument("project", "original"), page = createComposerPage("page"), frame = createComposerFrame("frame", "root", "mobile");
  frame.root.children = [{ id: "stack", kind: "stack", children: [node] }];
  page.frames.push(frame); document.pages.push(page);
  const selection = { projectId: document.id, pageId: page.id, frameId: frame.id, nodeId: node.id };
  return { document, page, project: { selection, frameId: frame.id }, state: { ready: true, mode: "design", indexBlocked: false, partial: null }, controller: {} };
}
const inspector = node => renderToStaticMarkup(createElement(NodeInspector, { composer: composerFor(node), disabled: false, onEditSystem() {} }));

test("every component and Card slot exposes local four-edge/corner controls and typography", () => {
  const nodes = [
    { id: "button", kind: "button", text: "Action" },
    { id: "badge", kind: "badge", text: "Status" },
    { id: "input", kind: "input", props: { label: "Email", name: "email" } },
    { id: "switch", kind: "switch", props: { label: "Enabled", name: "enabled" } },
    { id: "checkbox", kind: "checkbox", props: { label: "Agree", name: "agree" } },
    { id: "card", kind: "card", children: [{ id: "body", kind: "cardContent", children: [] }] },
    { id: "text", kind: "text", text: "Text" },
    { id: "title", kind: "cardTitle", text: "Title" },
  ];
  for (const node of nodes) {
    const html = inspector(node);
    for (const field of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius", "fontSize"]) assert.ok(html.includes(`data-appearance-key="${field}"`), `${node.kind}: ${field}`);
    assert.match(html, /Link corners/); assert.match(html, /Inherited unless overridden/);
  }
  const html = inspector(nodes[2]);
  assert.match(html, /Edit component part/); assert.match(html, /value="error"/);
  assert.match(html, /Instance errorPosition/); assert.match(html, /Instance errorIcon/);
});

test("frame inspector exposes geometry once, shared appearance, and opt-in auto layout", () => {
  const composer = composerFor({ id: "text", kind: "text", text: "Hello" });
  const html = renderToStaticMarkup(createElement(FrameInspector, { composer, frame: composer.page.frames[0], disabled: false }));
  assert.match(html, /aria-label="Frame width"/); assert.match(html, /aria-label="Frame direction"/);
  assert.match(html, /data-appearance-key="paddingLeft"/);
  assert.doesNotMatch(html, /data-appearance-key="width"/);
  assert.doesNotMatch(html, /data-appearance-key="gap"/);
  composer.page.frames[0].root.props.direction = "column";
  const active = renderToStaticMarkup(createElement(FrameInspector, { composer, frame: composer.page.frames[0], disabled: false }));
  assert.match(active, /data-appearance-key="gap"/);
});

test("frame appearance changes do not touch other frames or project system; null restores exact inheritance", () => {
  const composer = composerFor({ id: "card", kind: "card", children: [{ id: "content", kind: "cardContent", children: [] }] });
  const before = structuredClone(composer.document);
  const changed = applyComposerCommand(before, { type: "nodeCommands", pageId: "page", frameId: "frame", commands: [{ type: "update", nodeId: "root", appearance: { paddingLeft: 17.25, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 0, borderBottomLeftRadius: 0 } }] });
  assert.equal(changed.systemId, before.systemId);
  assert.deepEqual(changed.pages[0].frames[0].root.children, before.pages[0].frames[0].root.children);
  const reset = applyComposerCommand(changed, { type: "nodeCommands", pageId: "page", frameId: "frame", commands: [{ type: "update", nodeId: "root", appearance: null }] });
  assert.deepEqual(reset, before);
});
