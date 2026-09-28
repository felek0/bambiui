import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  componentIds, componentTokenKeys, componentEditableTokenKeys, defaultSystem, exportCSS, isComponentKey,
  parseDesignSystem, resolveColorScale, resolveComponent, resolveTypography, shareNonColorTokens, STORAGE_KEY, systemConstants,
  toCSSVariables, tokenFields, colorScaleRoles, colorScaleStops, typographyVariants, typographyFields, defaultTypography,
  fontFamilyPresets, fontFamilyStacks, fontFamilyLabels, googleFontFamilies, googleFontUrl,
} from "./tokens.ts";
import { contrastRatio, deriveRoleColors, generatePalette, mixColors, paletteRoles } from "./color-engine.ts";

const modes = ["light", "dark"];
const fresh = () => structuredClone(defaultSystem);
const parse = (value) => parseDesignSystem(JSON.stringify(value));
const kebab = (key) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const numericRanges = {
  radius: [0, 48], radiusSm: [0, 48], radiusLg: [0, 48], paddingX: [0, 64], paddingY: [0, 64], gap: [0, 64],
  margin: [0, 48], fontSize: [10, 32], borderWidth: [0, 6],
  controlHeightSm: [16, 80], controlHeightMd: [16, 80], controlHeightLg: [16, 80],
};
const geometry = {
  radius: 8, radiusSm: 4, radiusLg: 12, paddingX: 16, paddingY: 10, gap: 8, margin: 0, fontSize: 14,
  borderWidth: 1, controlHeightSm: 32, controlHeightMd: 36, controlHeightLg: 44,
};
const spacingPresets = { spacingSm: 4, spacingMd: 8, spacingLg: 16 };
const legacyGlobal = {
  background: "#ffffff", foreground: "#27272a", muted: "#f4f4f5",
  mutedForeground: "#63636b", border: "#e4e4e7", primary: "#e8673c",
  onPrimary: "#ffffff", secondary: "#f1ede8", onSecondary: "#27272a",
  success: "#1a7f45", onSuccess: "#ffffff", warning: "#a15c00", onWarning: "#ffffff",
  danger: "#d2393f", onDanger: "#ffffff", info: "#2563c9", onInfo: "#ffffff", ...geometry,
};
const v1Keys = ["background", "foreground", "primary", "onPrimary", "border",
  "radius", "paddingX", "paddingY", "gap", "margin", "fontSize", "borderWidth"];
const colorKeys = Object.keys(legacyGlobal).filter((key) => !(key in numericRanges));
const globalOnly = Object.keys(legacyGlobal).filter((key) => !isComponentKey(key));
const onKeys = { primary: "onPrimary", secondary: "onSecondary", success: "onSuccess",
  warning: "onWarning", danger: "onDanger", info: "onInfo" };
function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") deepFreeze(child);
  }
  return Object.freeze(value);
}

test("Text exposes only the alias its CSS consumes while retaining legacy export aliases", () => {
  assert.deepEqual(componentEditableTokenKeys("text"), ["foreground"]);
  assert.deepEqual(componentEditableTokenKeys("badge"), componentTokenKeys);
  const variables = toCSSVariables(defaultSystem.themes.light);
  assert.equal(variables["--text-padding-x"], "var(--ds-padding-x)");
});

test("v3 defaults contain two generated themes with shared presets and historical geometry", () => {
  assert.equal(STORAGE_KEY, "bambiui.design-system.v1");
  assert.deepEqual(componentIds, ["button", "input", "card", "badge", "switch", "checkbox", "text"]);
  assert.deepEqual(componentTokenKeys, ["background", "foreground", "border", "radius",
    "paddingX", "paddingY", "gap", "margin", "fontSize", "borderWidth"]);
  assert.equal(defaultSystem.version, 3);
  assert.equal(defaultSystem.name, "Untitled system");
  assert.deepEqual(Object.keys(defaultSystem), ["version", "name", "themes"]);
  const palette = generatePalette("#e8673c");
  const objects = [];
  for (const mode of modes) {
    const theme = defaultSystem.themes[mode];
    assert.deepEqual(Object.keys(theme).sort(), ["source", "global", "components", "colorScales", "typography", "fontFamily", "variantColors"].sort());
    assert.equal(theme.fontFamily, "system");
    assert.deepEqual(theme.colorScales, {});
    assert.deepEqual(theme.typography, defaultTypography);
    assert.equal(theme.source, "#e8673c");
    assert.deepEqual(theme.global, { ...palette[mode].tokens, ...geometry, ...spacingPresets });
    assert.deepEqual(Object.keys(theme.components), componentIds);
    for (const overrides of Object.values(theme.components)) assert.deepEqual(overrides, {});
    objects.push(theme, theme.global, theme.components, ...Object.values(theme.components));
  }
  assert.equal(new Set(objects).size, 20);
});

test("radius aliases and opt-in component radius selectors consume the shared scale", () => {
  const theme = fresh().themes.light;
  const variables = toCSSVariables(theme);
  assert.equal(variables["--ds-radius"], "8px");
  assert.equal(variables["--ds-radius-md"], variables["--ds-radius"]);
  assert.equal(variables["--ds-radius-sm"], "4px");
  assert.equal(variables["--ds-radius-lg"], "12px");
  const css = readFileSync(new URL("./components/components.module.css", import.meta.url), "utf8");
  for (const step of ["sm", "md", "lg"]) {
    assert.ok(css.includes(`data-radius="${step}"`));
    assert.ok(css.includes(`var(--ds-radius-${step})`));
  }
  for (const component of ["button", "inputControl", "checkbox", "badge", "card"]) assert.ok(css.includes(`.${component}[data-radius=`) || css.includes(`.field[data-radius=`), component);
});

test("variant colors resolve independently by theme; Card shadow preset is shared", () => {
  const system = fresh();
  system.themes.light.variantColors = {
    button: { secondary: { background: "#123456", foreground: "#ffffff", hoverBackground: "#234567" } },
    badge: { "solid.success": { background: "#225522", foreground: "#ffffff" } },
    card: { elevated: { background: "#eeeeee", shadow: "sm" } },
  };
  system.themes.dark.variantColors = {
    button: { secondary: { background: "#abcdef" } },
    badge: { "solid.success": { background: "#123456" } },
    card: { elevated: { background: "#222222", shadow: "lg" } },
  };
  for (const mode of modes) {
    const variables = toCSSVariables(system.themes[mode], mode);
    assert.equal(variables["--button-variant-secondary-background"], mode === "light" ? "#123456" : "#abcdef");
    assert.equal(variables["--badge-variant-solid-success-background"], mode === "light" ? "#225522" : "#123456");
    assert.equal(variables["--card-variant-elevated-background"], mode === "light" ? "#eeeeee" : "#222222");
  }
  const shared = shareNonColorTokens(system, "light");
  assert.equal(shared.themes.dark.variantColors.card.elevated.shadow, "sm");
  assert.equal(shared.themes.dark.variantColors.card.elevated.background, "#222222");
  const css = readFileSync(new URL("./components/components.module.css", import.meta.url), "utf8");
  for (const variable of ["--button-variant-secondary-background", "--badge-variant-solid-success-background", "--card-variant-elevated-background", "--card-variant-elevated-shadow"]) assert.ok(css.includes(variable), variable);
});

test("metadata includes three shared spacing presets without changing component aliases", () => {
  assert.equal(tokenFields.length, 32);
  assert.equal(colorKeys.length, 17);
  assert.equal(componentTokenKeys.length, 10);
  assert.deepEqual(tokenFields.map(({ key }) => key).sort(), [...Object.keys(legacyGlobal), ...Object.keys(spacingPresets)].sort());
  for (const field of tokenFields) {
    assert.ok(field.label.length > 0);
    assert.equal(isComponentKey(field.key), componentTokenKeys.includes(field.key));
    if (colorKeys.includes(field.key)) {
      assert.equal(field.type, "color");
      assert.equal(field.min, undefined);
      assert.equal(field.max, undefined);
    } else {
      assert.equal(field.type, "number");
      if (field.key in spacingPresets) {
        assert.ok(Number.isFinite(field.min) && Number.isFinite(field.max));
        assert.ok(field.min <= spacingPresets[field.key] && field.max >= spacingPresets[field.key]);
      } else {
        assert.deepEqual([field.min, field.max], numericRanges[field.key]);
      }
    }
  }
});

for (const mode of modes) {
  for (const id of componentIds) {
    test(`${mode}/${id}: inheritance and literal overrides retain the full component set`, () => {
      const theme = fresh().themes[mode];
      theme.global.onPrimary = "#123456";
      const expected = Object.fromEntries(componentTokenKeys.map((key) => [key, theme.global[key]]));
      if (["button", "switch", "checkbox"].includes(id)) {
        expected.background = theme.global.primary;
        expected.foreground = theme.global.onPrimary;
      }
      assert.deepEqual(resolveComponent(theme, id), expected);
      theme.components[id] = { background: "#abcdef", foreground: "#fedcba", paddingX: 0, radius: 2.5 };
      assert.deepEqual(resolveComponent(theme, id), { ...expected, ...theme.components[id] });
      for (const key of globalOnly) assert.equal(key in resolveComponent(theme, id), false);
    });
  }

  test(`${mode}: CSS maps contain all stored, derived, and constant values`, () => {
    const theme = fresh().themes[mode];
    const variables = toCSSVariables(theme, mode);
    assert.equal(Object.keys(variables).length, 156 + Object.keys(systemConstants).length + colorScaleRoles.length * colorScaleStops.length + typographyVariants.length * typographyFields.length + Object.keys(spacingPresets).length + 2 + 1 + 153);
    for (const [key, value] of Object.entries(theme.global)) {
      assert.equal(variables[`--ds-${kebab(key)}`], typeof value === "number" ? `${value}px` : value);
    }
    for (const [key, value] of Object.entries(systemConstants)) assert.equal(variables[key], value);
    for (const id of componentIds) {
      for (const key of componentTokenKeys) {
        let source = key;
        if (["button", "switch", "checkbox"].includes(id)) {
          if (key === "background") source = "primary";
          if (key === "foreground") source = "onPrimary";
        }
        assert.equal(variables[`--${id}-${kebab(key)}`], `var(--ds-${kebab(source)})`);
      }
      theme.components[id] = { ...resolveComponent(theme, id), radius: 0, borderWidth: 0.5 };
    }
    const overridden = toCSSVariables(theme, mode);
    for (const id of componentIds) {
      for (const [key, value] of Object.entries(theme.components[id])) {
        assert.equal(overridden[`--${id}-${kebab(key)}`], typeof value === "number" ? `${value}px` : value);
      }
    }
    delete theme.components.button.background;
    assert.equal(toCSSVariables(theme, mode)["--button-background"], "var(--ds-primary)");
  });

  test(`${mode}: derived colors use active tokens and resolved component overrides, never source`, () => {
    const theme = fresh().themes[mode];
    Object.assign(theme.global, { primary: "#123456", onPrimary: "#ffffff", background: "#fefefe", muted: "#eaeaea" });
    theme.components.button = { background: "#843482", foreground: "#ffffff" };
    theme.components.badge = { background: "#eeeeee", foreground: "#343434" };
    const variables = toCSSVariables(theme, mode);
    const global = theme.global;
    for (const role of paletteRoles) {
      const colors = deriveRoleColors(global[role], global[onKeys[role]], global.background, mode, global.muted);
      for (const key of ["hover", "active", "subtle", "onSubtle", "outline", "focus"]) {
        assert.equal(variables[`--ds-${role}-${kebab(key)}`], colors[key]);
      }
    }
    const button = resolveComponent(theme, "button");
    const colors = deriveRoleColors(button.background, button.foreground, global.background, mode, global.muted);
    assert.equal(variables["--button-hover"], colors.hover);
    assert.equal(variables["--button-active"], colors.active);
    const badge = resolveComponent(theme, "badge");
    for (const tone of ["neutral", "primary", "success", "warning", "danger", "info"]) {
      const colors = deriveRoleColors(tone === "neutral" ? badge.foreground : global[tone],
        tone === "neutral" ? badge.background : global[onKeys[tone]], badge.background, mode, badge.background);
      for (const key of ["subtle", "onSubtle", "outline"]) {
        assert.equal(variables[`--badge-${tone}-${kebab(key)}`], colors[key]);
      }
    }
    theme.source = "#abcdef";
    assert.deepEqual(toCSSVariables(theme, mode), variables);
    assert.deepEqual(toCSSVariables(theme), toCSSVariables(theme, "light"));
  });

  test(`${mode}: neutral badge outline honors explicit border overrides and reset restores derivation`, () => {
    const theme = fresh().themes[mode];
    theme.global.border = "#aBcDeF";
    const baseline = toCSSVariables(theme, mode);
    const badge = resolveComponent(theme, "badge");
    const derived = deriveRoleColors(badge.foreground, badge.background, badge.background, mode, badge.background).outline;
    assert.equal(baseline["--badge-neutral-outline"], derived);
    assert.notEqual(derived, theme.global.border);
    for (const border of ["#123456", theme.global.border, derived]) {
      theme.components.badge.border = border;
      assert.deepEqual(toCSSVariables(theme, mode), {
        ...baseline,
        "--badge-border": border,
        "--badge-neutral-outline": border,
        "--badge-variant-outline-neutral-border": border,
        "--badge-variant-outline-neutral-outline": border,
      });
    }
    delete theme.components.badge.border;
    assert.deepEqual(toCSSVariables(theme, mode), baseline);
  });

  test(`${mode}: card description mixes only when the result meets 4.5 contrast`, () => {
    const theme = fresh().themes[mode];
    for (const [foreground, background] of [["#000000", "#ffffff"], ["#777777", "#ffffff"], ["#ffffff", "#000000"]]) {
      theme.components.card = { foreground, background };
      theme.global.foreground = foreground;
      theme.global.muted = background;
      const mixed = mixColors(foreground, background, 0.7);
      const expected = contrastRatio(mixed, background) >= 4.5 ? mixed : foreground;
      const variables = toCSSVariables(theme, mode);
      assert.equal(variables["--card-description"], expected);
      assert.equal(variables["--card-filled-description"], expected);
    }
    theme.components.card.foreground = "#123456";
    assert.equal(toCSSVariables(theme, mode)["--card-filled-description"], mixColors("#ffffff", "#000000", 0.7));
  });
}

test("system constant map includes only the current geometry and state constants", () => {
  assert.deepEqual(systemConstants, {
    "--ds-size-scale-sm": "0.875", "--ds-size-scale-lg": "1.125", "--ds-icon-size": "1.15em",
    "--ds-focus-ring-width": "2px", "--ds-focus-ring-offset": "3px",
    "--ds-state-pressed-offset": "1px", "--ds-state-disabled-opacity": "0.4",
    "--ds-text-muted-mix": "70%",
    "--ds-button-font-weight": "500", "--ds-button-line-height": "1.35",
    "--ds-field-label-font-weight": "500", "--ds-field-helper-font-size": "0.86em",
    "--ds-field-helper-line-height": "1.45", "--ds-input-line-height": "1.4",
    "--ds-badge-line-height": "1.2", "--ds-card-title-font-weight": "550",
    "--ds-card-title-letter-spacing": "-0.02em", "--ds-card-description-line-height": "1.65",
    "--ds-shadow-sm": "0 1px 2px #00000014", "--ds-shadow-md": "0 4px 12px #00000018", "--ds-shadow-lg": "0 8px 24px #27272a1f",
    "--ds-shadow-elevated": "0 8px 24px #27272a0c", "--ds-transition-duration": "150ms",
    "--ds-control-inset": "2px", "--ds-switch-thumb-shadow": "0 1px 2px #00000029",
    "--ds-checkbox-inset": "6px", "--ds-spinner-duration": "800ms", "--ds-card-icon-border-width": "1px",
  });
});

test("export emits two complete maps with scoped color-scheme, no name interpolation", () => {
  const system = fresh();
  system.name = "*/ } body { color: red; }";
  system.themes.light.components.card.gap = 2.5;
  system.themes.dark.components.button.background = "#123456";
  const expected = modes.map((mode) => {
    const selector = mode === "light" ? ':root, [data-ds-theme="light"]' : '[data-ds-theme="dark"]';
    const declarations = Object.entries(toCSSVariables(system.themes[mode], mode)).map(([key, value]) => `  ${key}: ${value};`).join("\n");
    return `${selector} {\n  color-scheme: ${mode};\n${declarations}\n}\n`;
  }).join("\n");
  assert.equal(exportCSS(system), expected);
  assert.equal(exportCSS({ themes: system.themes }), expected);
});

test("resolution/export are pure; parse round-trips complete overrides and independent sources", () => {
  const system = fresh();
  system.themes.light.source = "#AbCdEf";
  system.themes.dark.source = "#654321";
  for (const mode of modes) for (const id of componentIds) {
    system.themes[mode].components[id] = resolveComponent(system.themes[mode], id);
  }
  const parsed = parse(system);
  assert.deepEqual(parsed, system);
  const before = JSON.stringify(system);
  deepFreeze(system);
  resolveComponent(system.themes.light, "button").radius = 48;
  toCSSVariables(system.themes.dark, "dark")["--ds-radius"] = "48px";
  exportCSS(system);
  assert.equal(JSON.stringify(system), before);
  parsed.themes.light.global.radius = 48;
  parsed.themes.light.components.button.radius = 48;
  assert.equal(parsed.themes.dark.global.radius, 8);
  assert.equal(parsed.themes.dark.components.button.radius, 8);
  assert.equal(defaultSystem.themes.light.global.radius, 8);
  assert.deepEqual(defaultSystem.themes.light.components.button, {});
});

test("parser validates JSON, workspace name/version and all required object shapes/keys", () => {
  assert.throws(() => parseDesignSystem("{"), SyntaxError);
  for (const value of [null, [], "text", 42, true]) assert.throws(() => parse(value), /system/);
  for (const name of ["", "a".repeat(80)]) assert.equal(parse({ ...fresh(), name }).name, name);
  for (const name of ["a".repeat(81), null, 1, {}, []]) assert.throws(() => parse({ ...fresh(), name }), /system.name/);
  for (const version of [0, 4, "1", "2", "3", null, true, undefined]) {
    assert.throws(() => parse({ ...fresh(), version }), /system.version/);
  }
  const objectPaths = [[], ["themes"]];
  for (const mode of modes) {
    objectPaths.push(["themes", mode], ["themes", mode, "global"], ["themes", mode, "components"], ["themes", mode, "variantColors"]);
    for (const id of componentIds) objectPaths.push(["themes", mode, "components", id]);
  }
  for (const path of objectPaths) {
    for (const key of ["unknown", "__proto__", "constructor", "toString"]) {
      const system = fresh();
      const target = path.reduce((value, part) => value[part], system);
      Object.defineProperty(target, key, { value: {}, enumerable: true });
      assert.throws(() => parse(system), /Unknown field/);
    }
    const target = path.reduce((value, part) => value[part], fresh());
    for (const key of Object.keys(target).filter((key) => !["colorScales", "typography", "fontFamily", "variantColors", ...(path.at(-1) === "global" ? [...Object.keys(spacingPresets), "radiusSm", "radiusLg"] : []), ...(path.at(-1) === "components" ? ["text"] : [])].includes(key))) {
      const system = fresh();
      delete path.reduce((value, part) => value[part], system)[key];
      assert.throws(() => parse(system), undefined, `${path.join(".")}.${key} required`);
    }
    if (path.length) for (const invalid of [null, [], 1, "tokens", true]) {
      const system = fresh();
      path.slice(0, -1).reduce((value, part) => value[part], system)[path.at(-1)] = invalid;
      assert.throws(() => parse(system), /must be an object/);
    }
  }
  for (const mode of modes) for (const id of componentIds) for (const key of globalOnly) {
    const system = fresh();
    system.themes[mode].components[id][key] = legacyGlobal[key];
    assert.throws(() => parse(system), /Unknown field/);
  }
});

for (const version of [1, 2]) {
  test(`v${version} migrates exact legacy values and overrides independently without recoloring`, () => {
    const global = { ...legacyGlobal, primary: "#AbCdEf", onPrimary: "#123456", radius: 4 };
    const legacy = { version, name: "Legacy", global: version === 1
      ? Object.fromEntries(v1Keys.map((key) => [key, global[key]])) : global,
    components: fresh().themes.light.components };
    for (const id of componentIds) legacy.components[id] = { background: "#abcdef", foreground: "#fedcba", radius: 0, gap: 2.5 };
    const migrated = parse(legacy);
    assert.equal(migrated.version, 3);
    assert.equal(migrated.name, legacy.name);
    for (const mode of modes) {
      assert.equal(migrated.themes[mode].source, "#AbCdEf");
      assert.deepEqual(migrated.themes[mode].global, { ...global, ...spacingPresets });
      assert.deepEqual(migrated.themes[mode].components, legacy.components);
    }
    assert.deepEqual(migrated.themes.light.colorScales, {});
    assert.deepEqual(migrated.themes.light.typography, defaultTypography);
    assert.equal(migrated.themes.light.fontFamily, "system");
    assert.equal(migrated.themes.dark.fontFamily, "system");
    assert.deepEqual(parse(migrated), migrated);
    migrated.themes.light.global.radius = 48;
    migrated.themes.light.components.card.gap = 64;
    assert.equal(migrated.themes.dark.global.radius, 4);
    assert.equal(migrated.themes.dark.components.card.gap, 2.5);
    assert.equal(legacy.components.card.gap, 2.5);
    for (const key of Object.keys(legacy.global).filter((key) => !["radiusSm", "radiusLg", "spacingSm", "spacingMd", "spacingLg"].includes(key))) {
      const missing = structuredClone(legacy);
      delete missing.global[key];
      assert.throws(() => parse(missing), new RegExp(`global.${key}`));
    }
    for (const id of componentIds) {
      const missing = structuredClone(legacy);
      delete missing.components[id];
      if (id === "text") assert.deepEqual(parse(missing).themes.light.components.text, {});
      else assert.throws(() => parse(missing), new RegExp(`components.${id}`));
    }
    for (const path of [[], ["global"], ["components"], ["components", "button"]]) {
      const invalid = structuredClone(legacy);
      path.reduce((value, part) => value[part], invalid).unknown = 1;
      assert.throws(() => parse(invalid), /Unknown field/);
    }
    const invalid = structuredClone(legacy);
    invalid.global.primary = "#fff";
    assert.throws(() => parse(invalid), /global.primary/);
    if (version === 1) {
      invalid.global.primary = "#ffffff";
      invalid.global.success = "#00ff00";
      assert.throws(() => parse(invalid), /Unknown field: global.success/);
    }
  });
}

test("shared font family presets and spacing survive v3 round-trip and dark edits", () => {
  const system = fresh();
  for (const preset of fontFamilyPresets) {
    system.themes.dark.fontFamily = preset;
    const shared = shareNonColorTokens(system, "dark");
    const restored = parse(shared);
    for (const mode of modes) assert.equal(restored.themes[mode].fontFamily, preset);
    assert.deepEqual(parse(restored), restored);
  }
  Object.assign(system.themes.dark.global, { spacingSm: 5, spacingMd: 12, spacingLg: 24 });
  system.themes.dark.global.paddingX = 30;
  system.themes.dark.global.paddingY = 7;
  system.themes.dark.global.gap = 3;
  system.themes.dark.components.button.gap = 11;
  const restored = parse(shareNonColorTokens(system, "dark"));
  for (const mode of modes) {
    assert.deepEqual(Object.fromEntries(Object.keys(spacingPresets).map((key) => [key, restored.themes[mode].global[key]])),
      { spacingSm: 5, spacingMd: 12, spacingLg: 24 });
    assert.deepEqual([restored.themes[mode].global.paddingX, restored.themes[mode].global.paddingY, restored.themes[mode].global.gap], [30, 7, 3]);
    assert.equal(restored.themes[mode].components.button.gap, 11);
  }
  assert.equal(system.themes.light.global.spacingSm, 4);
});

test("old v3 records default missing presets without changing legacy aliases or colors", () => {
  const system = fresh();
  for (const mode of modes) {
    delete system.themes[mode].fontFamily;
    for (const key of [...Object.keys(spacingPresets), "radiusSm", "radiusLg"]) delete system.themes[mode].global[key];
  }
  system.themes.light.global.paddingX = 19;
  system.themes.light.global.paddingY = 6;
  system.themes.light.global.gap = 13;
  system.themes.light.components.button.paddingX = 27;
  system.themes.dark.global.primary = "#123456";
  const parsed = parse(system);
  for (const mode of modes) {
    assert.equal(parsed.themes[mode].fontFamily, "system");
    for (const [key, value] of Object.entries(spacingPresets)) assert.equal(parsed.themes[mode].global[key], value);
    assert.deepEqual([parsed.themes[mode].global.paddingX, parsed.themes[mode].global.paddingY, parsed.themes[mode].global.gap], [19, 6, 13]);
    assert.equal(parsed.themes[mode].components.button.paddingX, 27);
  }
  assert.equal(parsed.themes.dark.global.primary, "#123456");
  assert.deepEqual(parse(parsed), parsed);
});

test("v3 imports normalize conflicting font and spacing from Light; reject invalid presets", () => {
  const system = fresh();
  system.themes.light.fontFamily = "serif";
  system.themes.dark.fontFamily = "mono";
  Object.assign(system.themes.light.global, { spacingSm: 6, spacingMd: 10, spacingLg: 20 });
  Object.assign(system.themes.dark.global, { spacingSm: 7, spacingMd: 14, spacingLg: 28 });
  const parsed = parse(system);
  for (const mode of modes) {
    assert.equal(parsed.themes[mode].fontFamily, "serif");
    assert.deepEqual(Object.fromEntries(Object.keys(spacingPresets).map((key) => [key, parsed.themes[mode].global[key]])),
      { spacingSm: 6, spacingMd: 10, spacingLg: 20 });
  }
  for (const mode of modes) for (const invalid of ["unknown", "", "var(--font)", null, 1]) {
    const candidate = fresh();
    candidate.themes[mode].fontFamily = invalid;
    assert.throws(() => parse(candidate), new RegExp(`themes.${mode}.fontFamily`));
  }
  for (const mode of modes) for (const key of Object.keys(spacingPresets)) {
    const field = tokenFields.find((entry) => entry.key === key);
    for (const invalid of ["8", null, -1, field.max + 1, Infinity]) {
      const candidate = fresh();
      candidate.themes[mode].global[key] = invalid;
      assert.throws(() => parse(candidate), new RegExp(`themes.${mode}.global.${key}`));
    }
  }
});

test("Google presets use allowlisted font URLs and CSS imports only when selected", () => {
  assert.equal(fontFamilyPresets.length, 19);
  for (const preset of fontFamilyPresets) {
    const url = googleFontUrl(preset);
    if (!preset.startsWith("google-")) {
      assert.equal(url, null);
      continue;
    }
    const font = googleFontFamilies[preset];
    assert.ok(font);
    const weights = preset === "google-merriweather" ? "400;700" : "400;500;600;700";
    assert.equal(url, `https://fonts.googleapis.com/css2?family=${font.family.replaceAll(" ", "+")}:wght@${weights}&display=swap`);
    const system = fresh();
    system.themes.dark.fontFamily = preset;
    const shared = parse(shareNonColorTokens(system, "dark"));
    for (const mode of modes) assert.equal(shared.themes[mode].fontFamily, preset);
    const css = exportCSS(shared);
    assert.ok(css.startsWith(`@import url("${url}");\n\n:root`));
    assert.equal(css.split("@import url(").length - 1, 1);
    assert.equal(css.split(`--ds-font-family: ${fontFamilyStacks[preset]};`).length - 1, 2);
  }
  assert.ok(!exportCSS(fresh()).includes("@import"));
  const disagreeing = fresh();
  disagreeing.themes.light.fontFamily = "google-inter";
  disagreeing.themes.dark.fontFamily = "google-lora";
  const css = exportCSS(disagreeing);
  assert.ok(css.includes(`@import url("${googleFontUrl("google-inter")}");`));
  assert.ok(css.includes(`@import url("${googleFontUrl("google-lora")}");`));
});

test("CSS export emits shared preset variables while legacy spacing aliases stay independent", () => {
  const system = fresh();
  system.themes.dark.fontFamily = "mono";
  Object.assign(system.themes.dark.global, { spacingSm: 6, spacingMd: 12, spacingLg: 24 });
  const shared = parse(shareNonColorTokens(system, "dark"));
  const css = exportCSS(shared);
  const fontStacks = new Set();
  for (const mode of modes) {
    const vars = toCSSVariables(shared.themes[mode], mode);
    assert.equal(typeof vars["--ds-font-family"], "string");
    assert.ok(vars["--ds-font-family"].length > 0);
    fontStacks.add(vars["--ds-font-family"]);
    for (const [key, value] of Object.entries({ spacingSm: 6, spacingMd: 12, spacingLg: 24 })) {
      assert.equal(vars[`--ds-${kebab(key)}`], `${value}px`);
      assert.equal(css.split(`--ds-${kebab(key)}: ${value}px;`).length - 1, 2);
    }
    assert.equal(vars["--ds-padding-x"], "16px");
    assert.equal(vars["--ds-padding-y"], "10px");
    assert.equal(vars["--ds-gap"], "8px");
    assert.equal(vars["--button-padding-x"], "var(--ds-padding-x)");
    assert.equal(vars["--button-gap"], "var(--ds-gap)");
  }
  assert.equal(fontStacks.size, 1);
  assert.equal(css.split(`--ds-font-family: ${[...fontStacks][0]};`).length - 1, 2);
  const stacks = fontFamilyPresets.map((preset) => {
    const theme = { ...shared.themes.light, fontFamily: preset };
    const stack = toCSSVariables(theme)["--ds-font-family"];
    assert.equal(stack, fontFamilyStacks[preset]);
    assert.ok(fontFamilyLabels[preset], `Missing label for ${preset}`);
    return stack;
  });
  assert.equal(new Set(stacks).size, fontFamilyPresets.length);
});

test("optional v3 extensions normalize old saves and retain existing data", () => {
  const system = fresh();
  for (const mode of modes) {
    delete system.themes[mode].colorScales;
    delete system.themes[mode].typography;
    system.themes[mode].components.button.radius = 23;
  }
  const parsed = parse(system);
  assert.equal(parsed.version, 3);
  for (const mode of modes) {
    assert.deepEqual(parsed.themes[mode].colorScales, {});
    assert.deepEqual(parsed.themes[mode].typography, defaultTypography);
    assert.equal(parsed.themes[mode].components.button.radius, 23);
  }
  parsed.themes.light.typography.heading.fontSize = 42;
  assert.equal(parsed.themes.dark.typography.heading.fontSize, 32);
  assert.deepEqual(parse(parsed).themes.dark.typography.heading.fontSize, 42);
});

test("scale stops follow live global colors and keep manual overrides across palette application", () => {
  assert.deepEqual(colorScaleStops, [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
  assert.deepEqual(colorScaleRoles, ["neutral", "primary", "secondary", "success", "warning", "danger", "info"]);
  const theme = fresh().themes.light;
  theme.colorScales.primary = { 50: "#AbCdEf", 900: "#000000" };
  const original = resolveColorScale(theme, "light", "primary");
  theme.global.primary = "#123456";
  const changed = resolveColorScale(theme, "light", "primary");
  assert.equal(changed[50], "#AbCdEf");
  assert.equal(changed[900], "#000000");
  assert.notEqual(changed[500], original[500]);
  theme.global.foreground = "#ff0000";
  const neutral = resolveColorScale(theme, "light", "neutral");
  assert.notDeepEqual(neutral, resolveColorScale(fresh().themes.light, "light", "neutral"));
  const palette = generatePalette("#2563eb");
  const applied = { ...theme, source: palette.source, global: { ...theme.global, ...palette.light.tokens } };
  assert.deepEqual(applied.colorScales, theme.colorScales);
  assert.equal(resolveColorScale(applied, "light", "primary")[50], "#AbCdEf");
  assert.equal(parse({ ...fresh(), themes: { light: applied, dark: fresh().themes.dark } }).themes.light.colorScales.primary[50], "#AbCdEf");
  const css = toCSSVariables(applied, "light");
  for (const role of colorScaleRoles) for (const stop of colorScaleStops) {
    assert.equal(css[`--ds-${role}-${stop}`], resolveColorScale(applied, "light", role)[stop]);
  }
  assert.match(exportCSS({ themes: { light: applied, dark: fresh().themes.dark } }), /--ds-primary-50: #AbCdEf;/);
});

test("legacy typography records gain independent H1–H6 defaults without losing existing values", () => {
  const headings = ["h1", "h2", "h3", "h4", "h5", "h6"];
  assert.deepEqual(typographyVariants, ["heading", ...headings, "paragraph", "label", "caption"]);
  assert.deepEqual(headings.map((variant) => defaultTypography[variant].fontSize), [48, 40, 32, 28, 24, 20]);
  for (const variant of headings) {
    assert.ok(defaultTypography[variant].fontSize >= 8 && defaultTypography[variant].fontSize <= 96);
  }
  const system = fresh();
  for (const mode of modes) {
    system.themes[mode].typography = {
      heading: { fontSize: 53, fontWeight: 800 },
      paragraph: { fontSize: 18 },
      label: { letterSpacing: 1 },
      caption: { lineHeight: 1.8 },
    };
  }
  const parsed = parse(system);
  for (const mode of modes) {
    const theme = parsed.themes[mode];
    assert.deepEqual(theme.typography.heading, { ...defaultTypography.heading, fontSize: 53, fontWeight: 800 });
    assert.equal(theme.typography.paragraph.fontSize, 18);
    assert.equal(theme.typography.label.letterSpacing, 1);
    assert.equal(theme.typography.caption.lineHeight, 1.8);
    for (const variant of headings) assert.deepEqual(theme.typography[variant], defaultTypography[variant]);
  }
  assert.deepEqual(parse(parsed), parsed);
  parsed.themes.light.typography.h1.fontSize = 90;
  assert.equal(parsed.themes.dark.typography.h1.fontSize, 48);
});

test("H1–H6 export independent CSS variables and share edited values across themes", () => {
  const system = fresh();
  const headings = typographyVariants.filter((variant) => /^h[1-6]$/.test(variant));
  for (const [index, variant] of headings.entries()) {
    system.themes.dark.typography[variant] = { fontSize: 80 - index, fontWeight: 500 + index * 10 };
  }
  const shared = shareNonColorTokens(system, "dark");
  const parsed = parse(shared);
  for (const mode of modes) {
    const vars = toCSSVariables(parsed.themes[mode], mode);
    for (const [index, variant] of headings.entries()) {
      assert.equal(vars[`--ds-typography-${variant}-font-size`], `${80 - index}px`);
      assert.equal(vars[`--ds-typography-${variant}-font-weight`], `${500 + index * 10}`);
      for (const field of typographyFields) {
        assert.equal(vars[`--ds-typography-${variant}-${kebab(field.key)}`], `${resolveTypography(parsed.themes[mode], variant)[field.key]}${field.unit}`);
      }
    }
    assert.equal(vars["--ds-typography-heading-font-size"], "32px");
  }
  const css = exportCSS(parsed);
  for (const variant of headings) {
    assert.equal(css.split(`--ds-typography-${variant}-font-size:`).length - 1, 2);
  }
});

test("Text variants use their own CSS tokens and default semantic elements", () => {
  const css = readFileSync(new URL("./components/components.module.css", import.meta.url), "utf8");
  const source = readFileSync(new URL("./components/text.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(id) {
      if (id === "react/jsx-runtime") return { jsx: (tag, props) => ({ tag, props }) };
      if (id === "../cx") return { cx: (...names) => names.filter(Boolean).join(" ") };
      if (id === "./components.module.css") return { __esModule: true, default: { text: "text" } };
      throw new Error(`Unexpected module: ${id}`);
    },
  });
  for (const variant of typographyVariants) {
    const expected = /^h[1-6]$/.test(variant) ? variant : variant === "heading" ? "h2" : variant === "paragraph" ? "p" : "span";
    const element = exports.Text({ variant, children: "Example" });
    assert.equal(element.tag, expected);
    assert.equal(element.props["data-variant"], variant);
    assert.equal(element.props["data-size"], "md");
    if (variant !== "paragraph") for (const field of typographyFields) {
      assert.match(css, new RegExp(`\\.text\\[data-variant="${variant}"\\] \\{[^}]*--text-${kebab(field.key)}: var\\(--ds-typography-${variant}-${kebab(field.key)}\\);`, "s"));
    }
    assert.equal(exports.Text({ variant, as: "span" }).tag, "span");
  }
  assert.equal(exports.Text({}).tag, "p");
  assert.equal(exports.Text({ as: "h1", variant: "heading" }).tag, "h1");
});

test("typography is shared across themes; v3 import uses Light when old themes disagree", () => {
  const system = fresh();
  system.themes.light.typography = { heading: { fontSize: 42, letterSpacing: -1 }, h1: { fontSize: 56 }, h6: { fontWeight: 800 }, caption: { lineHeight: 2, fontWeight: 600 } };
  system.themes.dark.typography = { heading: { fontSize: 44 }, h1: { fontSize: 60 } };
  const parsed = parse(system);
  for (const mode of modes) {
    assert.deepEqual(resolveTypography(parsed.themes[mode], "heading"), { ...defaultTypography.heading, fontSize: 42, letterSpacing: -1 });
    assert.equal(parsed.themes[mode].typography.caption.lineHeight, 2);
    assert.equal(parsed.themes[mode].typography.h1.fontSize, 56);
    assert.equal(parsed.themes[mode].typography.h6.fontWeight, 800);
    const css = toCSSVariables(parsed.themes[mode], mode);
    assert.equal(css["--ds-typography-heading-font-size"], "42px");
    assert.equal(css["--ds-typography-heading-letter-spacing"], "-1px");
    assert.equal(css["--ds-typography-caption-line-height"], "2");
  }
  assert.match(exportCSS(parsed), /--ds-typography-heading-font-size: 42px;/);
  assert.deepEqual(typographyFields.map(({ key }) => key), ["fontSize", "lineHeight", "fontWeight", "letterSpacing"]);
});

test("shared geometry and typography follow edits in either theme; palette and color overrides stay independent", () => {
  const system = fresh();
  system.themes.dark.global.radius = 23;
  system.themes.dark.global.controlHeightLg = 62;
  system.themes.dark.components.button.paddingX = 29;
  system.themes.dark.components.card.background = "#123456";
  system.themes.dark.typography.heading.fontSize = 41;
  system.themes.light.components.button.radius = 12;
  const normalized = parse(system);
  assert.equal(normalized.themes.dark.global.radius, 8);
  assert.equal(normalized.themes.dark.global.controlHeightLg, 44);
  assert.equal(normalized.themes.dark.components.button.paddingX, undefined);
  assert.equal(normalized.themes.dark.components.button.radius, 12);
  assert.equal(normalized.themes.dark.components.card.background, "#123456");
  assert.equal(normalized.themes.dark.typography.heading.fontSize, 32);
  normalized.themes.dark.global.gap = 21;
  normalized.themes.dark.components.button.radius = 18;
  delete normalized.themes.dark.components.button.paddingX;
  normalized.themes.dark.typography.heading.fontSize = 46;
  const edited = shareNonColorTokens(normalized, "dark");
  assert.equal(edited.themes.light.global.gap, 21);
  assert.equal(edited.themes.light.components.button.radius, 18);
  assert.equal(edited.themes.light.components.button.paddingX, undefined);
  assert.equal(edited.themes.light.typography.heading.fontSize, 46);
  assert.notEqual(edited.themes.light.global.primary, edited.themes.dark.global.primary);
  assert.equal(edited.themes.dark.components.card.background, "#123456");
  assert.equal(parse(edited).themes.light.typography.heading.fontSize, 46);
  assert.match(exportCSS(edited), /--ds-typography-heading-font-size: 46px;/);
});

test("optional extensions reject unknown keys and invalid values with specific paths", () => {
  for (const mode of modes) {
    for (const path of ["colorScales", "typography", "variantColors"]) {
      const system = fresh();
      system.themes[mode][path] = null;
      assert.throws(() => parse(system), new RegExp(`themes.${mode}.${path}`));
    }
    for (const [path, value] of [
      [["colorScales", "unknown"], {}], [["colorScales", "primary", "75"], "#ffffff"],
      [["colorScales", "primary", "50"], "red"], [["colorScales", "neutral"], []],
      [["typography", "unknown"], {}], [["typography", "heading", "unknown"], 1],
      [["typography", "heading", "fontSize"], 0], [["typography", "label", "fontWeight"], "700"],
      [["typography", "caption", "lineHeight"], null], [["typography", "paragraph"], []],
      [["typography", "h1", "fontSize"], 7], [["typography", "h6", "fontSize"], 97],
      [["variantColors", "unknown"], {}], [["variantColors", "button", "unknown"], {}],
      [["variantColors", "badge", "solid.success", "unknown"], "#ffffff"],
      [["variantColors", "button", "secondary", "background"], "red"],
      [["variantColors", "card", "elevated", "shadow"], "xl"],
    ]) {
      const system = fresh();
      let target = system.themes[mode];
      for (const key of path.slice(0, -1)) target = target[key] ??= {};
      target[path.at(-1)] = value;
      assert.throws(() => parse(system), new RegExp(`themes.${mode}.${path.join(".")}`));
    }
  }
});

for (const key of [...colorKeys, "source"]) {
  test(`${key}: six-digit hex validation in both themes and all applicable overrides`, () => {
    for (const mode of modes) {
      const targets = key === "source" ? ["theme"] : isComponentKey(key) ? ["global", ...componentIds] : ["global"];
      for (const target of targets) {
        const system = fresh();
        const theme = system.themes[mode];
        const tokens = target === "theme" ? theme : target === "global" ? theme.global : theme.components[target];
        for (const valid of ["#000000", "#ffffff", "#aBcDeF"]) {
          tokens[key] = valid;
          assert.deepEqual(parse(system), system);
        }
        for (const invalid of ["#fff", "#ffffffff", "ffffff", "#gggggg", "red", "var(--ds-primary)",
          "rgb(0,0,0)", " #ffffff", "#ffffff\n", "#ffffff; color:red", null, 123, true, {}, []]) {
          tokens[key] = invalid;
          assert.throws(() => parse(system), /must be a #rrggbb color/);
        }
      }
    }
  });
}

for (const [key, [min, max]] of Object.entries(numericRanges)) {
  test(`${key}: finite numeric ranges in both themes and every applicable override`, () => {
    for (const mode of modes) for (const target of isComponentKey(key) ? ["global", ...componentIds] : ["global"]) {
      const system = fresh();
      const theme = system.themes[mode];
      const tokens = target === "global" ? theme.global : theme.components[target];
      for (const valid of [min, max, min + 0.5]) {
        tokens[key] = valid;
        assert.deepEqual(parse(system), shareNonColorTokens(system));
      }
      for (const invalid of [min - 0.1, max + 0.1, "10", null, true, {}, [], NaN, Infinity, -Infinity]) {
        tokens[key] = invalid;
        assert.throws(() => parse(system), /must be a finite number/);
      }
      tokens[key] = "overflow-number";
      assert.throws(() => parseDesignSystem(JSON.stringify(system).replace('"overflow-number"', "1e400")), /must be a finite number/);
    }
  });
}
