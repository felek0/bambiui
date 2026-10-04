import assert from "node:assert/strict";
import test from "node:test";
import { auditSystemColors, colorCheckTargets } from "./color-audit.ts";
import { contrastRatio, deriveRoleColors, generatePalette } from "./color-engine.ts";
import { componentIds, componentVariantKeys, defaultSystem, parseDesignSystem, resolveComponent, toCSSVariables } from "./tokens.ts";
import { appearanceToStyle, parseNodeAppearance, parseNodeParts } from "./page-document/appearance.ts";
import { componentStyleFields, componentStyleParts, parseComponentStyles, shareComponentStyles } from "./component-styles.ts";

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
      if (target.variant) {
        assert.ok(target.selection in componentVariantKeys, `${check.id}: variant selection`);
        assert.ok(componentVariantKeys[target.selection].includes(target.variant), `${check.id}: ${target.variant}`);
        assert.ok(["background", "foreground", "border", "hoverBackground", "activeBackground"].includes(target.key), `${check.id}: ${target.key}`);
      } else {
        const fields = target.selection === "colors" ? theme.global : resolveComponent(theme, target.selection);
        assert.equal(typeof fields[target.key], "string", `${check.id}: ${target.selection}.${target.key}`);
      }
    }
  }
  const targets = colorCheckTargets(byId().get("checkbox.checked.boundary"));
  assert.deepEqual(targets.ink, { selection: "checkbox", key: "border", variant: "checked" });
  assert.deepEqual(targets.surface, { selection: "colors", key: "background" });
  assert.deepEqual(colorCheckTargets(byId().get("checkbox.invalid-unchecked.boundary")).ink,
    { selection: "checkbox", key: "border", variant: "invalidUnchecked" });
  assert.deepEqual(colorCheckTargets(byId().get("text.success")).ink, { selection: "colors", key: "success", derived: true });
  assert.deepEqual(colorCheckTargets(byId().get("badge.neutral.solid.boundary")).ink, { selection: "badge", key: "border", variant: "solid.neutral" });
  assert.deepEqual(colorCheckTargets(byId().get("button.secondary.hover")).ink, { selection: "button", key: "hoverBackground", variant: "secondary" });
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
    assert.equal(checks.length, 150);
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
    const checkIds = {
      button: "button.primary.text", input: "input.default.text", card: "card.outlined.text",
      badge: "badge.neutral.solid", switch: "switch.checked.text", checkbox: "checkbox.checked.text",
    };
    for (const id of componentIds.filter((id) => id !== "text")) {
      const check = checks.get(checkIds[id]);
      assert.equal(check.ratio, 1, id);
      assert.equal(check.passes, false, id);
      assert.equal(check.minimum, ["switch", "checkbox"].includes(id) ? 3 : 4.5);
    }
    pair(checks.get("text.foreground"), "#123456", theme.global.background);
    assert.deepEqual(auditSystemColors(theme, mode).filter((c) => !c.component),
      auditSystemColors(fresh(mode), mode).filter((c) => !c.component));
  }
});

test("valid local instance colors can fail contrast without changing or being certified by the token audit", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    const before = structuredClone(theme);
    const tokenChecks = allPass(theme, mode);
    for (const kind of componentIds) {
      const appearance = parseNodeAppearance({ background: "#777777", color: "#777777", borderColor: "#777777", borderWidth: 2 }, kind);
      const painted = appearanceToStyle(appearance);
      const minimum = ["switch", "checkbox"].includes(kind) ? 3 : 4.5;
      const ratio = contrastRatio(painted.color, painted.backgroundColor);
      assert.equal(ratio, 1, `${mode}/${kind}: explicit instance ink and surface`);
      assert.ok(ratio < minimum);
      assert.equal(contrastRatio(painted.borderColor, painted.backgroundColor), 1);
      assert.deepEqual(appearance.color, "#777777", "invalid contrast is preserved, not silently recolored");
    }
    assert.deepEqual(theme, before);
    assert.deepEqual(auditSystemColors(theme, mode), tokenChecks, "theme diagnostics are not a page-instance audit");
  }
});

test("field part ink and transparent local surfaces use the actual parent, not passing global defaults", () => {
  for (const mode of modes) for (const kind of ["input", "switch", "checkbox"]) {
    const theme = fresh(mode);
    const checks = allPass(theme, mode);
    const parts = parseNodeParts({
      root: { background: "#eeeeee" },
      label: { color: "#eeeeee" },
      description: { color: "#eeeeee", background: "transparent" },
      error: { color: "#eeeeee", background: "#eeeeee" },
    }, kind);
    const parent = appearanceToStyle(parts.root).backgroundColor;
    for (const part of ["label", "description", "error"]) {
      const style = appearanceToStyle(parts[part]);
      const surface = !style.backgroundColor || style.backgroundColor === "transparent" ? parent : style.backgroundColor;
      assert.equal(contrastRatio(style.color, surface), 1, `${mode}/${kind}/${part}`);
      assert.equal(checks.find((check) => check.id === `${kind}.${part}`).passes, true, "the shared-token pair still passes independently");
    }
    const effects = appearanceToStyle(parseNodeAppearance({ borderWidth: 0, shadow: "none" }, kind));
    assert.ok(!Object.keys(effects).some((key) => key.startsWith("outline")));
    for (const check of checks.filter((check) => check.id.startsWith(`${kind}.focus.`))) assert.equal(check.passes, true);
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
  pair(checks.get("input.default.placeholder"), theme.global.mutedForeground, "#123456");
  pair(checks.get("input.readonly.placeholder"), theme.global.mutedForeground, "#123456");
  pair(checks.get("input.readonly.text"), "#ff0000", "#123456");
  pair(checks.get("input.error"), theme.global.danger, theme.global.background);
  pair(checks.get("input.invalid.boundary.inside"), theme.global.danger, "#123456", 3);
  pair(checks.get("card.description"), "#4d4d4d", "#ffffff");
  pair(checks.get("card.filled.description"), v["--card-variant-filled-description"], v["--card-variant-filled-background"]);
  pair(checks.get("card.filled.text"), v["--card-variant-filled-foreground"], v["--card-variant-filled-background"]);
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
      pair(checks.get(`${id}.invalid-checked.boundary`), v["--ds-danger-outline"], g.background, 3);
      pair(checks.get(`${id}.invalid-unchecked.boundary.inside`), v["--ds-danger-outline"], g.muted, 3);
    }
    pair(checks.get("switch.unchecked.thumb"), g.foreground, g.muted, 3);
    assert.equal(checks.has("checkbox.unchecked.mark"), false);
    assert.equal(checks.has("switch.unchecked.fill"), false);
    for (const id of ["button", "input", "switch", "checkbox"]) {
      for (const surface of ["background", "muted"]) pair(checks.get(`${id}.focus.${surface}`), v["--ds-primary-focus"], g[surface], 3);
    }
  }
});

test("button hover/active retain ink and audit the actual fill for every variant", () => {
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
    pair(checks.get("button.link.text"), v["--button-variant-link-foreground"], theme.global.background);
    for (const state of ["hover", "active"]) {
      pair(checks.get(`button.link.${state}`), v["--button-variant-link-foreground"], v[`--button-variant-link-${state}-background`]);
    }
    pair(checks.get("button.outline.hover"), theme.global.foreground, v["--button-variant-outline-hover-background"]);
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
  assert.equal(byId(theme).get("input.default.boundary").passes, false);
  theme.components.input.border = "#000000";
  assert.equal(byId(theme).get("input.default.boundary").passes, true);
  assert.equal(byId(theme).has("checkbox.checked.boundary"), false);
});

test("custom borders on normally unbordered variants are audited and route to their controls", () => {
  const theme = fresh();
  const sameAsSurface = theme.global.background;
  theme.variantColors = {
    button: { ghost: { border: sameAsSurface, borderWidth: 1 } },
    badge: { "subtle.success": { border: sameAsSurface, borderWidth: 1 } },
    card: { filled: { border: sameAsSurface, borderWidth: 1 } },
  };
  const checks = byId(theme);
  for (const [id, selection, variant] of [
    ["button.ghost.boundary", "button", "ghost"],
    ["badge.success.subtle.boundary", "badge", "subtle.success"],
    ["card.filled.boundary", "card", "filled"],
  ]) {
    const check = checks.get(id);
    assert.equal(check.passes, false, id);
    assert.deepEqual(colorCheckTargets(check).ink, { selection, key: "border", variant });
  }
});

test("input and choice state overrides are the exact colors audited", () => {
  const theme = fresh();
  theme.variantColors = {
    input: { invalid: { background: "#ffffff", foreground: "#000000", border: "#ff0000" } },
    checkbox: { invalidUnchecked: { background: "#ffffff", foreground: "#000000", border: "#ffffff" } },
  };
  const checks = byId(theme);
  const variables = toCSSVariables(theme);
  pair(checks.get("input.invalid.text"), variables["--input-variant-invalid-foreground"], variables["--input-variant-invalid-background"]);
  pair(checks.get("input.invalid.boundary"), variables["--input-variant-invalid-border"], theme.global.background, 3);
  pair(checks.get("checkbox.invalid-unchecked.boundary"), variables["--checkbox-variant-invalid-unchecked-border"], theme.global.background, 3);
  assert.equal(checks.get("checkbox.invalid-unchecked.boundary").passes, false);
  assert.deepEqual(colorCheckTargets(checks.get("checkbox.invalid-unchecked.boundary")).ink,
    { selection: "checkbox", key: "border", variant: "invalidUnchecked" });
});

test("transparent variant surfaces are audited against the global canvas surface", () => {
  const theme = fresh();
  theme.variantColors = {
    button: { ghost: { background: "transparent", hoverBackground: "transparent" } },
    input: { invalid: { background: "transparent" } },
    switch: { invalidChecked: { background: "transparent" } },
    checkbox: { unchecked: { background: "transparent" } },
    badge: { "subtle.success": { background: "transparent" } },
    card: { filled: { background: "transparent" } },
  };
  const checks = byId(theme);
  for (const id of [
    "button.ghost.text", "button.ghost.hover", "input.invalid.text",
    "switch.invalid-checked.text", "checkbox.unchecked.text",
    "badge.success.subtle", "card.filled.text", "card.filled.description",
  ]) {
    assert.equal(checks.get(id).background, theme.global.background, id);
    assert.ok(Number.isFinite(checks.get(id).ratio), id);
  }
  allPass(theme, "light");
});

test("omitted, empty and geometry-only shared styles preserve the original check set", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    const original = auditSystemColors(theme, mode);
    for (const styles of [{}, {
      button: { root: { width: 120, fontSize: 24 } }, input: { control: { height: 40 } },
      card: { title: { fontSize: 24 }, content: { gap: 16 } }, text: { root: { fontWeight: 600 } },
    }]) {
      theme.componentStyles = parseComponentStyles(styles);
      assert.deepEqual(auditSystemColors(theme, mode), original);
    }
    // These are uncomposited color diagnostics, not opacity or shadow certification.
    theme.componentStyles = parseComponentStyles({
      input: { root: { opacity: 0.1 }, label: { shadow: "lg" } },
      card: { title: { opacity: 0.25 } }, text: { root: { opacity: 0.5, shadow: "md" } },
    });
    assert.deepEqual(auditSystemColors(theme, mode), original);
    assert.equal(original.length, 150);
  }
});

test("shared field ink, surfaces and borders use authored part targets in both themes", () => {
  for (const mode of modes) for (const component of ["input", "switch", "checkbox"]) {
    const theme = fresh(mode);
    const before = structuredClone(theme);
    theme.componentStyles = parseComponentStyles({ [component]: {
      label: { color: "#111111", background: "#111111", borderColor: "#111111", borderWidth: 2 },
      description: { color: "#222222", background: "#222222" },
      error: { color: "#333333", background: "#333333" },
      ...(component === "input" ? {} : { row: { background: "#444444", color: "#abcdef" } }),
    } });
    const saved = structuredClone(theme);
    const checks = byId(theme, mode);
    for (const [part, color] of [["label", "#111111"], ["description", "#222222"], ["error", "#333333"]]) {
      const check = checks.get(`${component}.${part}`);
      pair(check, color, color);
      assert.equal(check.passes, false);
      assert.deepEqual(colorCheckTargets(check), {
        ink: { selection: component, part, key: "color" }, surface: { selection: component, part, key: "background" },
      });
    }
    pair(checks.get(`${component}.label.boundary`), "#111111", component === "input" ? theme.global.background : "#444444", 3);
    pair(checks.get(`${component}.label.boundary.inside`), "#111111", "#111111", 3);
    assert.deepEqual(colorCheckTargets(checks.get(`${component}.label.boundary`)).ink,
      { selection: component, part: "label", key: "borderColor" });
    assert.deepEqual(theme, saved, "audit is pure");
    assert.deepEqual(auditSystemColors(theme, mode).filter((check) => !check.component),
      auditSystemColors(before, mode).filter((check) => !check.component));
    delete theme.componentStyles[component].label.color;
    theme.componentStyles[component].label.background = "transparent";
    pair(byId(theme, mode).get(`${component}.label`), component === "input" ? theme.global.foreground : "#abcdef",
      component === "input" ? theme.global.background : "#444444");
  }
});

test("choice row inheritance reaches labels, transparent controls, boundaries and focus but not helper text", () => {
  for (const mode of modes) for (const component of ["switch", "checkbox"]) {
    const theme = fresh(mode);
    theme.componentStyles = parseComponentStyles({ [component]: {
      row: { color: "#abcdef", background: "#123456", borderWidth: 1 },
      label: { background: "transparent" }, description: { background: "transparent" }, error: { background: "transparent" },
    } });
    theme.variantColors = { [component]: {
      unchecked: { foreground: "#ffffff", background: "transparent", border: "#ffffff" },
      invalidChecked: { foreground: "#eeeeee", background: "transparent" },
    } };
    const checks = byId(theme, mode);
    pair(checks.get(`${component}.label`), "#abcdef", "#123456");
    assert.deepEqual(colorCheckTargets(checks.get(`${component}.label`)), {
      ink: { selection: component, part: "row", key: "color" }, surface: { selection: component, part: "row", key: "background" },
    });
    pair(checks.get(`${component}.description`), theme.global.mutedForeground, theme.global.background);
    pair(checks.get(`${component}.error`), theme.global.danger, theme.global.background);
    pair(checks.get(`${component}.row.boundary`), "#abcdef", theme.global.background, 3);
    pair(checks.get(`${component}.row.boundary.inside`), "#abcdef", "#123456", 3);
    for (const suffix of ["text", "boundary", "boundary.inside"]) {
      pair(checks.get(`${component}.unchecked.${suffix}`), "#ffffff", "#123456", 3);
      assert.deepEqual(colorCheckTargets(checks.get(`${component}.unchecked.${suffix}`)).surface,
        { selection: component, part: "row", key: "background" });
    }
    pair(checks.get(`${component}.invalid-checked.text`), "#eeeeee", "#123456", 3);
    assert.deepEqual(colorCheckTargets(checks.get(`${component}.invalid-checked.text`)).ink,
      { selection: component, variant: "invalidChecked", key: "foreground" });
    pair(checks.get(`${component}.focus.row`), toCSSVariables(theme, mode)["--ds-primary-focus"], "#123456", 3);
    assert.deepEqual(colorCheckTargets(checks.get(`${component}.focus.row`)), {
      ink: { selection: "colors", key: "primary", derived: true }, surface: { selection: component, part: "row", key: "background" },
    });
    if (component === "switch") pair(checks.get("switch.unchecked.thumb"), "#ffffff", "#123456", 3);
    delete theme.componentStyles[component].row;
    const reset = byId(theme, mode);
    pair(reset.get(`${component}.label`), theme.global.foreground, theme.global.background);
    pair(reset.get(`${component}.unchecked.text`), "#ffffff", theme.global.background, 3);
    assert.equal(reset.has(`${component}.focus.row`), false);
  }
});

test("Card slots follow each variant and Header inheritance without recoloring description or nested Text", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    theme.variantColors = { card: {
      outlined: { background: "#101010", foreground: "#fafafa" },
      elevated: { background: "#202020", foreground: "#eeeeee" },
      filled: { background: "transparent", foreground: "#123456" },
    } };
    theme.componentStyles = parseComponentStyles({ card: {
      header: { color: "#dddddd", background: "#222222" }, title: { background: "transparent" },
      description: { background: "transparent" }, content: { color: "#eeeeee", background: "#333333" },
      footer: { color: "#f1f1f1", background: "#444444" }, icon: { color: "#121212", background: "#555555", borderWidth: 2 },
    } });
    const variables = toCSSVariables(theme, mode);
    const checks = byId(theme, mode);
    for (const variant of ["outlined", "elevated", "filled"]) {
      const prefix = `--card-variant-${variant}`;
      const surface = variables[`${prefix}-background`] === "transparent" ? theme.global.background : variables[`${prefix}-background`];
      pair(checks.get(`card.${variant}.text`), variables[`${prefix}-foreground`], surface);
      pair(checks.get(`card.${variant}.header.text`), "#dddddd", "#222222");
      pair(checks.get(`card.${variant}.title.text`), "#dddddd", "#222222");
      pair(checks.get(`card.${variant}.description`), variables[`${prefix}-description`], "#222222");
      assert.deepEqual(colorCheckTargets(checks.get(`card.${variant}.title.text`)), {
        ink: { selection: "card", part: "header", key: "color" }, surface: { selection: "card", part: "header", key: "background" },
      });
      assert.deepEqual(colorCheckTargets(checks.get(`card.${variant}.description`)).ink,
        { selection: "card", variant, key: "foreground", derived: true });
      pair(checks.get(`card.${variant}.content.text`), "#eeeeee", "#333333");
      pair(checks.get(`card.${variant}.footer.text`), "#f1f1f1", "#444444");
      pair(checks.get(`card.${variant}.icon.text`), "#121212", "#555555", 3);
      pair(checks.get(`card.${variant}.icon.boundary`), "#121212", surface, 3);
      pair(checks.get(`card.${variant}.icon.boundary.inside`), "#121212", "#555555", 3);
      for (const tone of ["foreground", "primary", "success", "warning", "danger", "info"]) {
        pair(checks.get(`card.${variant}.content.text.${tone}`), tone === "foreground" ? resolveComponent(theme, "text").foreground : variables[`--ds-${tone}-on-subtle`], "#333333");
      }
    }
    pair(checks.get("card.description"), variables["--card-variant-outlined-description"], "#222222");
    pair(checks.get("card.foreground"), variables["--card-variant-outlined-foreground"], "#101010");
    delete theme.componentStyles.card.header;
    theme.componentStyles.card.content = { background: "transparent" };
    const reset = byId(theme, mode);
    for (const variant of ["outlined", "elevated", "filled"]) {
      const prefix = `--card-variant-${variant}`;
      const surface = variables[`${prefix}-background`] === "transparent" ? theme.global.background : variables[`${prefix}-background`];
      pair(reset.get(`card.${variant}.title.text`), variables[`${prefix}-foreground`], surface);
      pair(reset.get(`card.${variant}.description`), variables[`${prefix}-description`], surface);
      pair(reset.get(`card.${variant}.content.text.foreground`), resolveComponent(theme, "text").foreground, surface);
    }
    theme.componentStyles.card.title = { color: "#777777", background: "#777777" };
    theme.componentStyles.card.description = { color: "#888888", background: "#888888" };
    for (const variant of ["outlined", "elevated", "filled"]) {
      pair(byId(theme, mode).get(`card.${variant}.title.text`), "#777777", "#777777");
      pair(byId(theme, mode).get(`card.${variant}.description`), "#888888", "#888888");
      assert.deepEqual(colorCheckTargets(byId(theme, mode).get(`card.${variant}.description`)), {
        ink: { selection: "card", part: "description", key: "color" }, surface: { selection: "card", part: "description", key: "background" },
      });
    }
  }
});

test("shared Text colors override all tones; transparent surfaces and resets retain each tone's fallback", () => {
  for (const mode of modes) {
    const theme = fresh(mode);
    theme.componentStyles = parseComponentStyles({ text: { root: { background: "#555555", borderWidth: 2 } } });
    const variables = toCSSVariables(theme, mode);
    for (const tone of ["foreground", "primary", "success", "warning", "danger", "info"]) {
      const ink = tone === "foreground" ? resolveComponent(theme, "text").foreground : variables[`--ds-${tone}-on-subtle`];
      const checks = byId(theme, mode);
      pair(checks.get(`text.${tone}`), ink, "#555555");
      pair(checks.get(`text.${tone}.boundary`), ink, theme.global.background, 3);
      pair(checks.get(`text.${tone}.boundary.inside`), ink, "#555555", 3);
      assert.deepEqual(colorCheckTargets(checks.get(`text.${tone}.boundary`)).ink, colorCheckTargets(checks.get(`text.${tone}`)).ink);
    }
    theme.componentStyles.text.root.color = "#555555";
    const checks = byId(theme, mode);
    for (const tone of ["foreground", "primary", "success", "warning", "danger", "info"]) {
      pair(checks.get(`text.${tone}`), "#555555", "#555555");
      assert.deepEqual(colorCheckTargets(checks.get(`text.${tone}`)), {
        ink: { selection: "text", part: "root", key: "color" }, surface: { selection: "text", part: "root", key: "background" },
      });
      for (const variant of ["outlined", "elevated", "filled"]) pair(checks.get(`card.${variant}.content.text.${tone}`), "#555555", "#555555");
    }
    theme.componentStyles.text.root = { background: "transparent" };
    for (const tone of ["foreground", "primary", "success", "warning", "danger", "info"]) {
      pair(byId(theme, mode).get(`text.${tone}`), tone === "foreground" ? resolveComponent(theme, "text").foreground : variables[`--ds-${tone}-on-subtle`], theme.global.background);
    }
    delete theme.componentStyles;
    assert.deepEqual(auditSystemColors(theme, mode), auditSystemColors(fresh(mode), mode));
  }
});

test("all authored part borders are checked only when painted, with real metadata navigation", () => {
  for (const component of componentIds) for (const { key: part } of componentStyleParts(component)) {
    if (!componentStyleFields(component, part).some(({ key }) => key === "borderWidth")) continue;
    const theme = fresh();
    const prefix = component === "card" ? `card.outlined.${part}` : component === "text" ? "text.foreground" : `${component}.${part}`;
    theme.componentStyles = parseComponentStyles({ [component]: { [part]: { borderWidth: 2, borderColor: "#777777" } } });
    let checks = byId(theme);
    pair(checks.get(`${prefix}.boundary`), "#777777", component === "card" ? toCSSVariables(theme)["--card-variant-outlined-background"] : theme.global.background, 3);
    assert.deepEqual(colorCheckTargets(checks.get(`${prefix}.boundary`)).ink, { selection: component, part, key: "borderColor" });
    for (const check of checks.values()) for (const target of Object.values(colorCheckTargets(check))) {
      if (target?.part) assert.ok(componentStyleFields(target.selection, target.part).some(({ key, type }) => key === target.key && type === "color"), `${check.id}: ${JSON.stringify(target)}`);
    }
    for (const style of [{ borderWidth: 0, borderColor: "#777777" }, { borderWidth: 2, borderColor: "transparent" }]) {
      theme.componentStyles[component][part] = style;
      checks = byId(theme);
      assert.equal(checks.has(`${prefix}.boundary`), false, `${component}.${part}`);
      assert.equal(checks.has(`${prefix}.boundary.inside`), false, `${component}.${part}`);
    }
    // A color alone cannot create a border on an otherwise borderless part.
    theme.componentStyles[component][part] = { borderColor: "#777777" };
    assert.equal(byId(theme).has(`${prefix}.boundary`), component === "card" && part === "icon");
    assert.deepEqual(byId(theme).get("input.focus.background"), byId().get("input.focus.background"));
  }
});

test("shared non-color normalization does not leak Light part colors into the Dark audit", () => {
  const light = fresh("light"), dark = fresh("dark");
  light.componentStyles = parseComponentStyles({ input: { label: { color: "#777777", background: "#777777", borderWidth: 2 } }, text: { root: { color: "#888888" } } });
  dark.componentStyles = shareComponentStyles(light.componentStyles, { input: { label: { color: "#ffffff", background: "#000000" } } });
  pair(byId(light).get("input.label"), "#777777", "#777777");
  const checks = byId(dark, "dark");
  pair(checks.get("input.label"), "#ffffff", "#000000");
  pair(checks.get("input.label.boundary.inside"), "#ffffff", "#000000", 3);
  pair(checks.get("text.foreground"), resolveComponent(dark, "text").foreground, dark.global.background);
  assert.deepEqual(colorCheckTargets(checks.get("text.foreground")).ink, { selection: "text", key: "foreground" });
});

test("Develop separates metadata-backed shared part styles, insertion parameters and local appearance", async () => {
  const { installParityLoader } = await import("./page-document/parity-loader.mjs");
  const { registerHooks } = await import("node:module");
  // Next's bundler resolves this extensionless package path; plain Node ESM does not.
  const nextPaths = registerHooks({ resolve: (specifier, context, nextResolve) => nextResolve(specifier === "next/link" ? "next/link.js" : specifier, context) });
  const loader = installParityLoader();
  try {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { DeveloperView } = await import("./developer.tsx");
    const system = structuredClone(defaultSystem);
    system.componentDefaults = { card: { slots: { title: "Authored insertion title" } } };
    const render = (selected, mode = "light") => renderToStaticMarkup(createElement(DeveloperView, { selected, system, mode, cssOutput: "" }));
    for (const selected of componentIds) {
      const html = render(selected);
      const section = html.match(/<details[^>]*data-component-styles-reference[^>]*>([\s\S]*?)<\/details>/)?.[1];
      assert.ok(section, selected);
      assert.deepEqual([...section.matchAll(/data-style-field="([^"]+)"/g)].map((match) => match[1]),
        componentStyleParts(selected).flatMap(({ key: part }) => componentStyleFields(selected, part).map(({ key }) => `${selected}.${part}.${key}`)));
      assert.match(section, /Inherited CSS default/);
      assert.match(section, /Not declared — component CSS fallback/);
      assert.match(section, /Shared dimension \/ effect/);
      assert.doesNotMatch(section, /--[a-z]+-part-[a-z]+-(?:box-sizing|box-display|border-style|content-display|inner-padding|thumb-transform|thumb-margin)/);
      assert.match(html, /data-insertion-parameters-reference/);
      assert.match(html, /data-instance-appearance-reference/);
    }
    assert.match(render("card"), /Authored insertion title/);
    for (const mode of modes) {
      system.themes[mode].componentStyles = parseComponentStyles({ card: { title: { color: "#123456", fontSize: 23.5 } } });
      const section = render("card", mode).match(/<details[^>]*data-component-styles-reference[^>]*>([\s\S]*?)<\/details>/)[1];
      assert.match(section, new RegExp(`${mode} theme color`));
      for (const key of ["color", "fontSize"]) {
        const row = section.match(new RegExp(`<tr[^>]*data-style-field="card.title.${key}"[^>]*>([\\s\\S]*?)<\\/tr>`))?.[1];
        assert.match(row, /Authored System style/);
      }
    }
  } finally { loader.cleanup(); nextPaths.deregister(); }
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
      for (const id of ["global.onPrimary.primary", "global.border.background", "button.primary.text", "input.default.boundary", "switch.unchecked.boundary", "checkbox.unchecked.boundary"]) assert.equal(checks.get(id).passes, false, `${version}/${mode}/${id}`);
    }
  }
});

test("generated multi-seed themes pass all component pairs and match derived helper contract", () => {
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
