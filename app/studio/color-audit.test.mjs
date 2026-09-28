import assert from "node:assert/strict";
import test from "node:test";
import { auditSystemColors, colorCheckTargets } from "./color-audit.ts";
import { contrastRatio, deriveRoleColors, generatePalette } from "./color-engine.ts";
import { componentIds, defaultSystem, parseDesignSystem, resolveComponent, toCSSVariables } from "./tokens.ts";

const modes = ["light", "dark"];
const fresh = (mode = "light") => structuredClone(defaultSystem.themes[mode]);
const byId = (theme = fresh(), mode = "light") => new Map(auditSystemColors(theme, mode).map((c) => [c.id, c]));
function pair(check, foreground, background, minimum = 4.5) {
  assert.ok(check);
  assert.equal(check.foreground, foreground);
  assert.equal(check.background, background);
  assert.equal(check.minimum, minimum);
  assert.equal(check.ratio, contrastRatio(foreground, background));
  assert.equal(check.passes, check.ratio >= minimum);
}
function allPass(theme, mode) {
  const checks = auditSystemColors(theme, mode);
  assert.deepEqual(checks.filter((c) => !c.passes).map((c) => `${c.id}: ${c.ratio}`), [], mode);
  return checks;
}

test("checked pairs point to real editable sources, not raw scale stops", () => {
  const theme = fresh();
  for (const check of auditSystemColors(theme)) {
    const targets = colorCheckTargets(check);
    for (const target of Object.values(targets)) {
      if (!target) continue;
      const fields = target.selection === "colors" ? theme.global : resolveComponent(theme, target.selection);
      assert.equal(typeof fields[target.key], "string", `${check.id}: ${target.selection}.${target.key}`);
    }
  }
  const targets = colorCheckTargets(byId().get("checkbox.boundary"));
  assert.deepEqual(targets.ink, { selection: "checkbox", key: "border" });
  assert.deepEqual(targets.surface, { selection: "colors", key: "background" });
  assert.deepEqual(colorCheckTargets(byId().get("text.success")).ink, { selection: "colors", key: "success", derived: true });
  assert.deepEqual(colorCheckTargets(byId().get("badge.neutral.solid.boundary")).ink, { selection: "badge", key: "foreground" });
});

test("known ratios and unrounded threshold decisions", () => {
  const theme = fresh();
  theme.global.background = "#ffffff";
  theme.global.foreground = "#000000";
  assert.equal(byId(theme).get("global.foreground.background").ratio, 21);
  theme.global.foreground = "#777777";
  const check = byId(theme).get("global.foreground.background");
  assert.ok(Math.abs(check.ratio - 4.478089453577214) < 1e-12);
  assert.equal(check.passes, false);
  theme.global.foreground = "#ffffff";
  assert.equal(byId(theme).get("global.foreground.background").ratio, 1);
});

test("both normalized defaults pass finite, deterministic, pure diagnostics", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    const before = structuredClone(theme);
    const checks = allPass(theme, mode);
    assert.deepEqual(theme, before);
    assert.deepEqual(auditSystemColors(theme, mode), checks);
    assert.equal(new Set(checks.map((c) => c.id)).size, checks.length);
    assert.equal(checks.filter((c) => !c.component && c.minimum === 4.5).length, 17);
    for (const c of checks) {
      assert.ok(Number.isFinite(c.ratio) && c.ratio >= 1 && c.ratio <= 21);
      assert.ok(c.label.length > 0);
      assert.equal(c.passes, c.ratio >= c.minimum);
      assert.ok(!/disabled/i.test(c.label));
    }
    for (const id of componentIds) assert.ok(checks.some((c) => c.component === id));
  }
  assert.deepEqual(auditSystemColors(fresh()), auditSystemColors(fresh(), "light"));
});

test("logo-color primary uses readable dark ink and derived link text", () => {
  const theme = fresh();
  const variables = toCSSVariables(theme);
  const checks = byId(theme);
  assert.equal(theme.global.primary, "#e8673c");
  assert.equal(theme.global.onPrimary, "#291b15");
  pair(checks.get("button.primary.text"), theme.global.onPrimary, theme.global.primary);
  pair(checks.get("button.link.text"), variables["--ds-primary-on-subtle"], theme.global.background);
  pair(checks.get("global.primary.muted"), variables["--ds-primary-on-subtle"], theme.global.muted);
  allPass(theme, "light");
});

test("equal component overrides still fail without changing globals", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    for (const id of componentIds) theme.components[id] = { foreground: "#123456", background: "#123456" };
    const checks = byId(theme, mode);
    for (const id of componentIds.filter((id) => id !== "text")) {
      const check = checks.get(`${id}.foreground`);
      assert.equal(check.ratio, 1, id);
      assert.equal(check.passes, false, id);
      assert.equal(check.minimum, ["switch", "checkbox"].includes(id) ? 3 : 4.5);
    }
    pair(checks.get("text.foreground"), "#123456", theme.global.background);
    assert.deepEqual(auditSystemColors(theme, mode).filter((c) => !c.component),
      auditSystemColors(fresh(mode), mode).filter((c) => !c.component));
  }
});

test("Text semantic tones audit their CSS on-subtle ink on the global background", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    const checks = byId(theme, mode);
    const v = toCSSVariables(theme, mode);
    for (const tone of ["primary", "success", "warning", "danger", "info"]) {
      const check = checks.get(`text.${tone}`);
      pair(check, v[`--ds-${tone}-on-subtle`], theme.global.background);
      assert.equal(check.component, "text");
    }
  }

  const theme = fresh();
  theme.global.background = "#777777";
  theme.global.success = "#333333";
  const ink = toCSSVariables(theme)["--ds-success-on-subtle"];
  const check = byId(theme).get("text.success");
  pair(check, ink, theme.global.background);
  assert.equal(check.passes, false);
});

test("input readOnly retains its surface; filled card uses global ink and description", () => {
  const theme = fresh();
  theme.components.input = { foreground: "#ff0000", background: "#123456" };
  theme.components.card = { foreground: "#000000", background: "#ffffff" };
  theme.global.muted = "#445566";
  const checks = byId(theme);
  const v = toCSSVariables(theme);
  pair(checks.get("input.placeholder"), theme.global.mutedForeground, "#123456");
  pair(checks.get("input.readonly.placeholder"), theme.global.mutedForeground, "#123456");
  pair(checks.get("input.readonly.text"), "#ff0000", "#123456");
  pair(checks.get("input.error"), theme.global.danger, theme.global.background);
  pair(checks.get("input.invalid.boundary.inside"), theme.global.danger, "#123456", 3);
  pair(checks.get("card.description"), "#4d4d4d", "#ffffff");
  pair(checks.get("card.filled.description"), v["--card-filled-description"], "#445566");
  pair(checks.get("card.filled.text"), theme.global.foreground, "#445566");
});

test("badge derivatives use overridden badge background in both modes", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    theme.components.badge = { background: "#102030", foreground: "#abcdef" };
    const checks = byId(theme, mode);
    const v = toCSSVariables(theme, mode);
    for (const tone of ["neutral", "primary", "success", "warning", "danger", "info"]) {
      pair(checks.get(`badge.${tone}.outline`), v[`--badge-${tone}-on-subtle`], "#102030");
      pair(checks.get(`badge.${tone}.subtle`), v[`--badge-${tone}-on-subtle`], v[`--badge-${tone}-subtle`]);
      pair(checks.get(`badge.${tone}.outline.boundary.inside`), v[`--badge-${tone}-outline`], "#102030", 3);
      assert.equal(checks.has(`badge.${tone}.subtle.boundary`), false);
    }
    pair(checks.get("badge.neutral.solid"), "#102030", "#abcdef");
  }
});

test("unchecked states are opaque global colors; invalid borders and focus match CSS", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    const g = theme.global;
    for (const id of ["switch", "checkbox"]) theme.components[id] = { border: "#ff0000", background: "#00ff00", foreground: "#0000ff" };
    const checks = byId(theme, mode);
    const v = toCSSVariables(theme, mode);
    for (const id of ["switch", "checkbox"]) {
      pair(checks.get(`${id}.unchecked.boundary`), g.border, g.background, 3);
      pair(checks.get(`${id}.unchecked.boundary.inside`), g.border, g.muted, 3);
      pair(checks.get(`${id}.invalid.boundary`), v["--ds-danger-outline"], g.background, 3);
      pair(checks.get(`${id}.unchecked.invalid.boundary.inside`), v["--ds-danger-outline"], g.muted, 3);
    }
    pair(checks.get("switch.unchecked.thumb"), g.foreground, g.muted, 3);
    assert.equal(checks.has("checkbox.unchecked.mark"), false);
    assert.equal(checks.has("switch.unchecked.fill"), false);
    for (const id of ["button", "input", "switch", "checkbox"]) {
      for (const surface of ["background", "muted"]) pair(checks.get(`${id}.focus.${surface}`), v["--ds-primary-focus"], g[surface], 3);
    }
  }
});

test("button hover/active retain ink and use derived fills; link only underlines", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    theme.components.button = { foreground: "#ffffff", background: "#808080" };
    const checks = byId(theme, mode);
    const v = toCSSVariables(theme, mode);
    for (const [variant, ink, prefix] of [
      ["primary", "#ffffff", "--button"],
      ["secondary", theme.global.onSecondary, "--ds-secondary"],
      ["destructive", theme.global.onDanger, "--ds-danger"],
    ]) {
      for (const state of ["hover", "active"]) pair(checks.get(`button.${variant}.${state}`), ink, v[`${prefix}-${state}`]);
    }
    for (const state of ["text", "hover", "active"]) pair(checks.get(`button.link.${state}`), v["--ds-primary-on-subtle"], theme.global.background);
    pair(checks.get("button.outline.hover"), theme.global.foreground, theme.global.muted);
    assert.equal(checks.has("button.link.boundary"), false);
    assert.equal(checks.has("button.ghost.boundary"), false);
  }
});

test("absent borders are omitted, focus and marks remain, explicit borders still warn", () => {
  const theme = fresh();
  theme.global.borderWidth = 0;
  for (const id of componentIds) theme.components[id].borderWidth = 0;
  const checks = auditSystemColors(theme);
  assert.ok(!checks.some((c) => c.id.includes("boundary") || c.id.startsWith("global.border.")));
  assert.ok(checks.some((c) => c.id === "switch.unchecked.thumb"));
  assert.ok(checks.some((c) => c.id === "input.focus.background"));
  theme.components.input = { borderWidth: 1, border: theme.global.background };
  assert.equal(byId(theme).get("input.boundary").passes, false);
  theme.components.input.border = "#000000";
  assert.equal(byId(theme).get("input.boundary").passes, true);
  assert.equal(byId(theme).has("checkbox.boundary"), false);
});

test("legacy v1 and v2 migration preserves invalid manual pairs in both modes", () => {
  const global = {
    background: "#ffffff", foreground: "#27272a", primary: "#e8673c", onPrimary: "#ffffff",
    border: "#e4e4e7", radius: 8, paddingX: 16, paddingY: 10, gap: 8, margin: 0, fontSize: 14, borderWidth: 1,
  };
  for (const version of [1, 2]) {
    const workspace = parseDesignSystem(JSON.stringify({ version, name: "Legacy", global: version === 1 ? global : { ...fresh().global, ...global }, components: fresh().components }));
    for (const mode of modes) {
      const checks = byId(workspace.themes[mode], mode);
      for (const id of ["global.onPrimary.primary", "global.border.background", "button.foreground", "input.boundary", "switch.unchecked.boundary", "checkbox.unchecked.boundary"]) assert.equal(checks.get(id).passes, false, `${version}/${mode}/${id}`);
    }
  }
});

test("generated multi-seed themes pass all six components and match derived helper contract", () => {
  for (const seed of ["#e8673c", "#000000", "#ffffff", "#808080", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#663399"]) {
    const palette = generatePalette(seed);
    for (const mode of modes) {
      const theme = fresh(mode);
      theme.source = seed;
      Object.assign(theme.global, palette[mode].tokens);
      allPass(theme, mode);
      const v = toCSSVariables(theme, mode);
      const c = resolveComponent(theme, "button");
      const derived = deriveRoleColors(c.background, c.foreground, theme.global.background, mode, theme.global.muted);
      assert.equal(v["--button-hover"], derived.hover);
      assert.equal(v["--button-active"], derived.active);
      for (const [role, colors] of Object.entries(palette[mode].roles)) {
        for (const key of ["hover", "active", "subtle", "outline", "focus"]) assert.equal(v[`--ds-${role}-${key}`], colors[key]);
        assert.equal(v[`--ds-${role}-on-subtle`], colors.onSubtle);
      }
    }
  }
});
