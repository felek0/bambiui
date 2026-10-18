import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog } from "@base-ui/react/dialog";
import ts from "typescript";
import * as roadmapData from "./roadmap-data.ts";
import { applyBrandColor, applyShape, changedVariables, createDemoSystem, defaultShape } from "./demo-system.ts";
import { curatedRoadmap, parseSubmissions, roadmapColumns, validateSubmission } from "./roadmap-data.ts";
import { defaultSystem, parseDesignSystem } from "../../studio/tokens.ts";

test("demo System starts from the default and never mutates it", () => {
  const before = structuredClone(defaultSystem);
  const system = applyShape(applyBrandColor(createDemoSystem(), "#2563eb"), { ...defaultShape(), radius: 18 });
  assert.deepEqual(defaultSystem, before);
  assert.equal(system.themes.light.source, "#2563eb");
  assert.notEqual(system.themes.light.global.primary, system.themes.dark.global.primary, "colors stay per theme");
});

test("shape controls are shared by both themes and derive the radius scale", () => {
  const system = applyShape(createDemoSystem(), { radius: 10, density: 20, fontSize: 15, fontFamily: "mono" });
  for (const mode of ["light", "dark"]) {
    const { global, fontFamily } = system.themes[mode];
    assert.deepEqual([global.radiusSm, global.radius, global.radiusLg, global.paddingX, global.paddingY, global.fontSize, fontFamily], [5, 10, 15, 20, 12, 15, "mono"]);
  }
});

test("the demo exports a System the Studio and CLI parser accept", () => {
  const system = applyShape(applyBrandColor(createDemoSystem(), "#0f766e"), { ...defaultShape(), radius: 0, density: 6 });
  assert.doesNotThrow(() => parseDesignSystem(JSON.stringify(system)));
});

test("changed variables list only edited, non-scale --ds-* values", () => {
  assert.deepEqual(changedVariables(createDemoSystem(), "light"), []);
  const names = changedVariables(applyShape(createDemoSystem(), { ...defaultShape(), radius: 13 }), "light").map(([name]) => name);
  assert.ok(names.includes("--ds-radius-md") && names.includes("--ds-radius-lg"));
  assert.ok(names.every(name => name.startsWith("--ds-") && !/-\d+$/.test(name)));
});

test("roadmap: curated items fit the four columns; submissions are validated and forced into New", () => {
  assert.deepEqual(roadmapColumns.map(column => column.label), ["New", "Planned", "In progress", "Completed"]);
  for (const item of curatedRoadmap) assert.ok(roadmapColumns.some(column => column.key === item.column));
  assert.deepEqual(parseSubmissions(null), []);
  assert.deepEqual(parseSubmissions("{oops"), []);
  assert.deepEqual(parseSubmissions(JSON.stringify({ not: "a list" })), []);
  const parsed = parseSubmissions(JSON.stringify([
    { id: "a", title: "Select", detail: "", kind: "feature", column: "completed" },
    { id: "b", title: "", detail: "", kind: "feature" },
    { id: "c", title: "x".repeat(121), detail: "", kind: "bug" },
    { id: "d", title: "Focus ring", detail: "", kind: "other" },
  ]));
  assert.deepEqual(parsed.map(item => [item.id, item.column, item.local]), [["a", "new", true]], "only valid items, always in New and marked local");
  assert.equal(validateSubmission("  ", ""), "Add a short title.");
  assert.match(validateSubmission("x".repeat(121), ""), /120/);
  assert.match(validateSubmission("ok", "y".repeat(1001)), /1000/);
  assert.equal(validateSubmission("Select component", "Need search"), null);
});

const { SUBMISSIONS_KEY } = roadmapData;
const boardJS = ts.transpileModule(readFileSync(new URL("./roadmap-board.tsx", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const localItem = (id, title = id) => ({ id, title, detail: "", kind: "feature", column: "new", local: true });
function storage(raw = null) {
  const data = new Map([["bambiui.design-system.v1", "untouched System bytes"]]);
  if (raw !== null) data.set(SUBMISSIONS_KEY, raw);
  return {
    data, reads: 0, writes: 0, removals: 0, clears: 0, denyAccess: false, denyRead: false, denyWrite: false,
    getItem(key) {
      assert.equal(key, SUBMISSIONS_KEY);
      this.reads++;
      if (this.denyRead) throw new Error("Access denied");
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      assert.equal(key, SUBMISSIONS_KEY);
      if (this.denyWrite) throw new Error("Quota exceeded");
      data.set(key, value);
      this.writes++;
    },
    removeItem(key) { data.delete(key); this.removals++; },
    clear() { data.clear(); this.clears++; },
  };
}

// Execute the actual mount effect and callback props against fault-injecting storage.
// Like the Studio callback probes, this uses React's SSR hooks for state, not DOM
// mounting: browser storage-event delivery, focus and Escape remain browser tests.
function probeBoard(local, steps, clock = Date) {
  let effect, cleanup, tree, index = 0;
  const listeners = new Map();
  const window = {
    get localStorage() { if (local.denyAccess) throw new Error("Storage getter denied"); return local; },
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { assert.equal(listeners.get(name), listener); listeners.delete(name); },
  };
  const sync = key => { assert.ok(listeners.has("storage")); listeners.get("storage")({ key }); };
  const imports = {
    react: { ...React, useEffect(callback) { effect ??= callback; } },
    "react/jsx-runtime": jsxRuntime,
    "@base-ui/react/dialog": { Dialog },
    "./demos": { SectionHead: "section-head" },
    "./roadmap-data": roadmapData,
    "./landing.module.css": { default: new Proxy({}, { get: (_, key) => key }) },
  };
  const exports = {};
  runInNewContext(boardJS, { exports, window, Date: clock, require(id) { assert.ok(id in imports, id); return imports[id]; } });
  try {
    renderToStaticMarkup(React.createElement(function Probe() {
      const [, rerender] = React.useState(0);
      tree = exports.RoadmapBoard({});
      if (index === 0) {
        assert.equal(local.reads, 0, "rendering must not read storage before the mount effect");
        assert.equal(local.writes, 0);
        cleanup = effect();
      } else if (index <= steps.length) steps[index - 1](tree, sync);
      else return null;
      index++;
      rerender(value => value + 1);
      return null;
    }));
  } finally { cleanup?.(); }
  assert.equal(listeners.size, 0, "unmount removes the storage listener");
  assert.equal(index, steps.length + 1);
  assert.equal(local.removals + local.clears, 0, "storage failures never trigger destructive cleanup");
  assert.equal(local.data.get("bambiui.design-system.v1"), "untouched System bytes");
  return tree;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join("") : React.isValidElement(tree) ? textOf(tree.props.children) : tree == null || typeof tree === "boolean" ? "" : String(tree);
function findNode(tree, predicate) { const node = nodes(tree).find(predicate); assert.ok(node, "expected board node"); return node; }
const part = (tree, type) => findNode(tree, node => node.type === type);
const button = (tree, label) => findNode(tree, node => node.type === "button" && textOf(node) === label);
const localIds = tree => nodes(tree).filter(node => node.type === "li" && node.props["data-local"]).map(node => node.props["data-roadmap-item"]);
const statusOf = tree => textOf(findNode(tree, node => node.props.role === "status"));
const boardError = tree => textOf(findNode(tree, node => node.type === "p" && node.props.role === "alert"));
const dialogError = tree => textOf(findNode(tree, node => node.type === "span" && node.props.role === "alert"));
const openForm = (tree, label = "Suggest a feature", opener = {}) => button(tree, label).props.onClick({ currentTarget: opener });
const setTitle = (tree, value) => part(tree, "input").props.onChange({ target: { value } });
const removeItem = (tree, title) => findNode(tree, node => node.props["aria-label"] === `Remove “${title}”`).props.onClick();
function submit(tree) { let prevented = false; part(tree, "form").props.onSubmit({ preventDefault() { prevented = true; } }); assert.ok(prevented); }

test("roadmap: browser-only scope is explicit before opening and Dialog contracts remain intact", () => {
  const local = storage();
  const opener = {};
  probeBoard(local, [
    tree => {
      assert.equal(part(tree, Dialog.Root).props.open, false);
      assert.match(textOf(part(tree, "section-head")), /in this browser only and are not sent to the team/);
      assert.doesNotMatch(textOf(tree), /the team moves them along|waiting for triage/);
      assert.match(textOf(part(tree, Dialog.Description)), /saved in this browser only\. Nothing is sent to the team/);
      assert.equal(button(tree, "Save in this browser").props.type, "submit");
      assert.ok(nodes(tree).some(node => node.type === Dialog.Close && textOf(node) === "Cancel"));
      assert.ok(nodes(tree).some(node => node.type === Dialog.Close && node.props["aria-label"] === "Close"));
      assert.equal(part(tree, "input").props.maxLength, 120);
      assert.equal(part(tree, "textarea").props.maxLength, 1000);
      openForm(tree, "Report a gap", opener);
    },
    tree => {
      assert.equal(part(tree, Dialog.Root).props.open, true);
      assert.equal(textOf(part(tree, Dialog.Title)), "Report a gap");
      assert.equal(part(tree, Dialog.Popup).props.finalFocus.current, opener);
      assert.equal(part(tree, Dialog.Popup).props.initialFocus, part(tree, "input").props.ref);
      part(tree, Dialog.Root).props.onOpenChange(false, { reason: "escape-key" });
    },
    tree => { assert.equal(part(tree, Dialog.Root).props.open, false); assert.equal(local.writes, 0); },
  ]);
});

test("roadmap: item timestamps are created only during a validated submit event", () => {
  const local = storage();
  const timestamp = Date.parse("2026-10-18T12:00:00.000Z");
  let submitting = false, clockReads = 0;
  class EventDate extends Date {
    static now() {
      assert.ok(submitting, "the clock must not be read during render or an invalid submission");
      clockReads++;
      return timestamp;
    }
    constructor(...args) {
      assert.ok(submitting, "dates must not be created during render or an invalid submission");
      super(...args);
    }
  }
  probeBoard(local, [
    tree => openForm(tree),
    tree => submit(tree),
    tree => { assert.equal(dialogError(tree), "Add a short title."); assert.equal(clockReads, 0); setTitle(tree, "Event-time suggestion"); },
    tree => {
      submitting = true;
      try { submit(tree); } finally { submitting = false; }
    },
    tree => {
      const [saved] = parseSubmissions(local.data.get(SUBMISSIONS_KEY));
      assert.equal(saved.id, `local-${timestamp.toString(36)}`);
      assert.equal(saved.created, new Date(timestamp).toISOString());
      assert.equal(part(tree, Dialog.Root).props.open, false);
      assert.equal(clockReads, 1);
    },
  ], EventDate);
});

test("roadmap: denied storage getter and getItem are caught on mount without losing bytes", () => {
  for (const denial of ["denyAccess", "denyRead"]) {
    const local = storage(JSON.stringify([localItem("existing")]));
    const before = [...local.data];
    local[denial] = true;
    probeBoard(local, [
      tree => {
        assert.match(boardError(tree), /could not be read.*left unchanged/);
        assert.deepEqual(localIds(tree), []);
        assert.equal(nodes(tree).filter(node => node.props["data-roadmap-item"]).length, curatedRoadmap.length);
        openForm(tree);
      },
      tree => { assert.match(dialogError(tree), /could not be read/); setTitle(tree, "Do not replace existing data"); },
      tree => submit(tree),
      (tree, sync) => {
        assert.equal(part(tree, Dialog.Root).props.open, true);
        assert.match(dialogError(tree), /Reload before making changes/);
        assert.deepEqual([...local.data], before);
        assert.equal(local.writes, 0);
        local[denial] = false;
        sync(SUBMISSIONS_KEY);
      },
      tree => { assert.deepEqual(localIds(tree), ["existing"]); assert.equal(dialogError(tree), ""); },
    ]);
  }
});

test("roadmap: malformed, partial and oversized saved lists are not silently replaced", () => {
  const invalidRecords = ["", "{oops", "null", '{"not":"a list"}', JSON.stringify([localItem("valid"), null]), JSON.stringify(Array.from({ length: 51 }, (_, i) => localItem(`item-${i}`)))];
  for (const raw of invalidRecords) {
    const local = storage(raw);
    const before = [...local.data];
    probeBoard(local, [
      tree => { assert.match(boardError(tree), /could not be read/); openForm(tree); },
      tree => setTitle(tree, "A new suggestion"),
      tree => submit(tree),
      tree => {
        assert.match(dialogError(tree), /existing browser data was left unchanged/);
        assert.deepEqual([...local.data], before);
        assert.equal(local.writes, 0);
        assert.deepEqual(localIds(tree), []);
        assert.equal(statusOf(tree), "");
      },
    ]);
  }
});

test("roadmap: successful local submission trims fields, caps at 50 and round trips", () => {
  const existing = Array.from({ length: 50 }, (_, i) => localItem(`existing-${i}`));
  const local = storage(JSON.stringify(existing));
  probeBoard(local, [
    tree => openForm(tree, "Report a gap"),
    tree => { setTitle(tree, "  Focus ring  "); part(tree, "textarea").props.onChange({ target: { value: "  Needs more contrast  " } }); },
    tree => submit(tree),
    tree => {
      const saved = parseSubmissions(local.data.get(SUBMISSIONS_KEY));
      assert.equal(saved.length, 50);
      assert.deepEqual([saved[0].title, saved[0].detail, saved[0].kind, saved[0].column, saved[0].local], ["Focus ring", "Needs more contrast", "bug", "new", true]);
      assert.equal(saved[49].id, "existing-48");
      assert.equal(part(tree, Dialog.Root).props.open, false);
      assert.equal(part(tree, "input").props.value, "");
      assert.equal(part(tree, "textarea").props.value, "");
      assert.match(statusOf(tree), /Added “Focus ring” to New in this browser only/);
      assert.equal(boardError(tree), "");
      assert.equal(local.writes, 1);
    },
  ]);
  probeBoard(storage(local.data.get(SUBMISSIONS_KEY)), [tree => { assert.equal(localIds(tree).length, 50); assert.match(textOf(tree), /this browser only/); }]);
});

test("roadmap: failed Remove retains the item, clears stale success, exposes an error and permits retry", () => {
  for (const denial of ["denyAccess", "denyRead", "denyWrite"]) {
    const local = storage(JSON.stringify([localItem("first"), localItem("remaining")]));
    let before;
    probeBoard(local, [
      tree => removeItem(tree, "first"),
      tree => {
        assert.match(statusOf(tree), /Removed “first”/);
        before = [...local.data];
        local[denial] = true;
        removeItem(tree, "remaining");
      },
      tree => {
        assert.deepEqual(localIds(tree), ["remaining"]);
        assert.deepEqual([...local.data], before);
        assert.equal(local.writes, 1);
        assert.equal(statusOf(tree), "", "a failed removal must not claim this or a prior removal succeeded");
        assert.equal(part(tree, Dialog.Root).props.open, false);
        assert.match(boardError(tree), /could not save the change\. Nothing was added or removed/);
        local[denial] = false;
        removeItem(tree, "remaining");
      },
      tree => {
        assert.deepEqual(localIds(tree), []);
        assert.equal(local.data.get(SUBMISSIONS_KEY), "[]");
        assert.match(statusOf(tree), /Removed “remaining” from this browser/);
        assert.equal(boardError(tree), "");
        assert.equal(local.writes, 2);
      },
    ]);
  }
});

test("roadmap: validation and failed save leave the draft and dialog available for retry", () => {
  const local = storage(JSON.stringify([localItem("existing")]));
  const before = [...local.data];
  probeBoard(local, [
    tree => openForm(tree),
    tree => submit(tree),
    tree => {
      assert.equal(dialogError(tree), "Add a short title.");
      assert.equal(part(tree, "input").props["aria-invalid"], true);
      assert.equal(local.writes, 0);
      setTitle(tree, "  Keep my draft  ");
      part(tree, "textarea").props.onChange({ target: { value: "Draft details" } });
      local.denyWrite = true;
    },
    tree => submit(tree),
    tree => {
      assert.equal(part(tree, Dialog.Root).props.open, true);
      assert.equal(part(tree, "input").props.value, "  Keep my draft  ");
      assert.equal(part(tree, "textarea").props.value, "Draft details");
      assert.equal(part(tree, "input").props["aria-invalid"], false, "storage denial is not a title-validation error");
      assert.match(dialogError(tree), /could not save the change/);
      assert.equal(boardError(tree), "", "the active dialog owns the visible alert while open");
      assert.equal(statusOf(tree), "");
      assert.deepEqual(localIds(tree), ["existing"]);
      assert.deepEqual([...local.data], before);
      local.denyWrite = false;
      submit(tree);
    },
    tree => { assert.equal(part(tree, Dialog.Root).props.open, false); assert.equal(localIds(tree).length, 2); assert.equal(dialogError(tree), ""); assert.equal(local.writes, 1); },
  ]);
});

test("roadmap: a failed sync preserves displayed items and blocks writes until a successful read", () => {
  const raw = JSON.stringify([localItem("existing")]);
  const local = storage(raw);
  const before = [...local.data];
  probeBoard(local, [
    (_tree, sync) => { local.denyRead = true; sync(SUBMISSIONS_KEY); },
    (tree, sync) => {
      assert.deepEqual(localIds(tree), ["existing"]);
      assert.match(boardError(tree), /could not be read/);
      assert.deepEqual([...local.data], before);
      local.denyRead = false;
      local.data.set(SUBMISSIONS_KEY, "{unreadable");
      sync(SUBMISSIONS_KEY);
    },
    tree => { assert.deepEqual(localIds(tree), ["existing"]); removeItem(tree, "existing"); },
    (tree, sync) => {
      assert.deepEqual(localIds(tree), ["existing"]);
      assert.match(boardError(tree), /Reload before making changes/);
      assert.equal(local.data.get(SUBMISSIONS_KEY), "{unreadable");
      assert.equal(local.writes, 0);
      local.data.set(SUBMISSIONS_KEY, raw);
      sync(SUBMISSIONS_KEY);
    },
    tree => { assert.equal(boardError(tree), ""); removeItem(tree, "existing"); },
    tree => { assert.deepEqual(localIds(tree), []); assert.equal(local.writes, 1); },
  ]);
});

test("roadmap: changed raw bytes are not overwritten before the storage event arrives", () => {
  const local = storage(JSON.stringify([localItem("original")]));
  const externalRaw = JSON.stringify([localItem("another-tab")]);
  probeBoard(local, [
    tree => { local.data.set(SUBMISSIONS_KEY, externalRaw); removeItem(tree, "original"); },
    (tree, sync) => {
      assert.match(boardError(tree), /changed in another tab/);
      assert.equal(statusOf(tree), "");
      assert.deepEqual(localIds(tree), ["original"]);
      assert.equal(local.data.get(SUBMISSIONS_KEY), externalRaw);
      assert.equal(local.writes, 0);
      sync(SUBMISSIONS_KEY);
    },
    tree => { assert.deepEqual(localIds(tree), ["another-tab"]); assert.equal(boardError(tree), ""); },
  ]);
});

test("roadmap: storage sync ignores unrelated keys and reflects external removal and clear", () => {
  const local = storage(JSON.stringify([localItem("original")]));
  probeBoard(local, [
    (_tree, sync) => { local.data.set(SUBMISSIONS_KEY, JSON.stringify([localItem("updated")])); sync("unrelated"); },
    (tree, sync) => { assert.deepEqual(localIds(tree), ["original"]); assert.equal(local.reads, 1); sync(SUBMISSIONS_KEY); },
    (tree, sync) => { assert.deepEqual(localIds(tree), ["updated"]); local.data.delete(SUBMISSIONS_KEY); sync(SUBMISSIONS_KEY); },
    (tree, sync) => { assert.deepEqual(localIds(tree), []); local.data.set(SUBMISSIONS_KEY, JSON.stringify([localItem("restored")])); sync(SUBMISSIONS_KEY); },
    (tree, sync) => { assert.deepEqual(localIds(tree), ["restored"]); local.data.delete(SUBMISSIONS_KEY); sync(null); },
    tree => { assert.deepEqual(localIds(tree), []); assert.equal(local.writes, 0); assert.equal(boardError(tree), ""); },
  ]);
});
