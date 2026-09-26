import {
  contrastRatio,
  deriveRoleColors,
  generateColorScale,
  generatePalette,
  mixColors,
  paletteRoles,
  colorScaleRoles,
  colorScaleStops,
} from "./color-engine.ts";
import type { ColorScaleRole, ColorScaleStop, PaletteMode, PaletteRole } from "./color-engine.ts";
export { colorScaleRoles, colorScaleStops } from "./color-engine.ts";
export type { ColorScaleRole, ColorScaleStop } from "./color-engine.ts";
import { brandColor } from "./brand.ts";

export const componentIds = [
  "button",
  "input",
  "card",
  "badge",
  "switch",
  "checkbox",
  "text",
] as const;

export type ComponentId = (typeof componentIds)[number];

export type TokenValues = {
  // Base surfaces
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  // Brand roles
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  // Status roles
  success: string;
  onSuccess: string;
  warning: string;
  onWarning: string;
  danger: string;
  onDanger: string;
  info: string;
  onInfo: string;
  // Shape and spacing
  radius: number;
  paddingX: number;
  paddingY: number;
  gap: number;
  margin: number;
  fontSize: number;
  borderWidth: number;
  // Size scale shared by every sizeable control
  controlHeightSm: number;
  controlHeightMd: number;
  controlHeightLg: number;
};

/** Tokens every component can override. All other tokens are system-wide roles. */
export const componentTokenKeys = [
  "background",
  "foreground",
  "border",
  "radius",
  "paddingX",
  "paddingY",
  "gap",
  "margin",
  "fontSize",
  "borderWidth",
] as const satisfies readonly (keyof TokenValues)[];

export type ComponentTokens = Pick<
  TokenValues,
  (typeof componentTokenKeys)[number]
>;

/** Editable aliases consumed by the rendered component. Legacy Text aliases remain in CSS/JSON for compatibility. */
export function componentEditableTokenKeys(id: ComponentId): readonly (keyof ComponentTokens)[] {
  return id === "text" ? ["foreground"] : componentTokenKeys;
}

export type ColorScaleOverrides = Partial<Record<ColorScaleRole, Partial<Record<ColorScaleStop, string>>>>;

export const typographyVariants = ["heading", "h1", "h2", "h3", "h4", "h5", "h6", "paragraph", "label", "caption"] as const;
export type TypographyVariant = (typeof typographyVariants)[number];
export type TypographyTokens = {
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing: number;
};
export const typographyFields = [
  { key: "fontSize", label: "Font size", unit: "px", min: 8, max: 96 },
  { key: "lineHeight", label: "Line height", unit: "", min: 0.8, max: 3 },
  { key: "fontWeight", label: "Font weight", unit: "", min: 100, max: 900 },
  { key: "letterSpacing", label: "Letter spacing", unit: "px", min: -5, max: 10 },
] as const satisfies readonly { key: keyof TypographyTokens; label: string; unit: string; min: number; max: number }[];

export const defaultTypography: Record<TypographyVariant, TypographyTokens> = {
  heading: { fontSize: 32, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.5 },
  h1: { fontSize: 48, lineHeight: 1.1, fontWeight: 700, letterSpacing: -1 },
  h2: { fontSize: 40, lineHeight: 1.15, fontWeight: 700, letterSpacing: -0.75 },
  h3: { fontSize: 32, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.5 },
  h4: { fontSize: 28, lineHeight: 1.25, fontWeight: 600, letterSpacing: -0.35 },
  h5: { fontSize: 24, lineHeight: 1.3, fontWeight: 600, letterSpacing: -0.25 },
  h6: { fontSize: 20, lineHeight: 1.35, fontWeight: 600, letterSpacing: 0 },
  paragraph: { fontSize: 16, lineHeight: 1.5, fontWeight: 400, letterSpacing: 0 },
  label: { fontSize: 14, lineHeight: 1.4, fontWeight: 500, letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 1.4, fontWeight: 400, letterSpacing: 0 },
};

export type ThemeTokens = {
  source: string;
  global: TokenValues;
  components: Record<ComponentId, Partial<ComponentTokens>>;
  colorScales?: ColorScaleOverrides;
  typography?: Partial<Record<TypographyVariant, Partial<TypographyTokens>>>;
};

export function resolveColorScale(
  theme: ThemeTokens, mode: PaletteMode, role: ColorScaleRole,
): Record<ColorScaleStop, string> {
  // Both modes use light-to-dark stops; only the effective theme's role color differs.
  void mode;
  const source = role === "neutral" ? theme.global.foreground : theme.global[role];
  return { ...generateColorScale(source), ...theme.colorScales?.[role] };
}

export function resolveTypography(theme: ThemeTokens, variant: TypographyVariant): TypographyTokens {
  return { ...defaultTypography[variant], ...theme.typography?.[variant] };
}

export type DesignSystem = {
  version: 3;
  name: string;
  themes: Record<PaletteMode, ThemeTokens>;
};

/** Schema v3 retains both theme records; only color values may differ. */
export function shareNonColorTokens(system: DesignSystem, from: PaletteMode = "light"): DesignSystem {
  const other = from === "light" ? "dark" : "light";
  const source = system.themes[from];
  const target = system.themes[other];
  const global = { ...target.global };
  for (const field of tokenFields) {
    if (field.type === "number") (global[field.key] as number) = source.global[field.key] as number;
  }
  const components = { ...target.components };
  for (const id of componentIds) {
    const overrides = { ...target.components[id] };
    for (const key of componentTokenKeys) {
      if (typeof source.global[key] !== "number") continue;
      if (Object.hasOwn(source.components[id], key)) (overrides[key] as number) = source.components[id][key] as number;
      else delete overrides[key];
    }
    components[id] = overrides;
  }
  return {
    ...system,
    themes: { ...system.themes, [other]: { ...target, global, components, typography: structuredClone(source.typography) } },
  };
}

export const STORAGE_KEY = "bambiui.design-system.v1";

/** Historical defaults are migration data, never generated palette values. */
const legacyDefaults = {
  version: 2,
  name: "Untitled system",
  global: {
    background: "#ffffff",
    foreground: "#27272a",
    muted: "#f4f4f5",
    mutedForeground: "#63636b",
    border: "#e4e4e7",
    primary: "#e8673c",
    onPrimary: "#ffffff",
    secondary: "#f1ede8",
    onSecondary: "#27272a",
    success: "#1a7f45",
    onSuccess: "#ffffff",
    warning: "#a15c00",
    onWarning: "#ffffff",
    danger: "#d2393f",
    onDanger: "#ffffff",
    info: "#2563c9",
    onInfo: "#ffffff",
    radius: 8,
    paddingX: 16,
    paddingY: 10,
    gap: 8,
    margin: 0,
    fontSize: 14,
    borderWidth: 1,
    controlHeightSm: 32,
    controlHeightMd: 36,
    controlHeightLg: 44,
  },
  components: {
    button: {},
    input: {},
    card: {},
    badge: {},
    switch: {},
    checkbox: {},
    text: {},
  },
};

const defaultSource = brandColor;
const defaultPalette = generatePalette(defaultSource);

function defaultTheme(mode: PaletteMode): ThemeTokens {
  return {
    source: defaultSource,
    global: { ...legacyDefaults.global, ...defaultPalette[mode].tokens },
    components: { button: {}, input: {}, card: {}, badge: {}, switch: {}, checkbox: {}, text: {} },
    colorScales: {},
    typography: structuredClone(defaultTypography),
  };
}

export const defaultSystem: DesignSystem = {
  version: 3,
  name: "Untitled system",
  themes: { light: defaultTheme("light"), dark: defaultTheme("dark") },
};

/** Non-editable component constants, included in every exported theme. */
export const systemConstants = {
  "--ds-size-scale-sm": "0.875",
  "--ds-size-scale-lg": "1.125",
  "--ds-icon-size": "1.15em",
  "--ds-focus-ring-width": "2px",
  "--ds-focus-ring-offset": "3px",

  "--ds-state-pressed-offset": "1px",
  "--ds-state-disabled-opacity": "0.4",

  "--ds-text-muted-mix": "70%",

  "--ds-shadow-elevated": "0 8px 24px #27272a0c",
  "--ds-transition-duration": "150ms",
  "--ds-control-inset": "2px",
  "--ds-switch-thumb-shadow": "0 1px 2px #00000029",
  "--ds-checkbox-inset": "6px",
  "--ds-spinner-duration": "800ms",
  "--ds-card-icon-border-width": "1px",
} as const;

export type TokenField = {
  key: keyof TokenValues;
  label: string;
  type: "color" | "number";
  min?: number;
  max?: number;
};

const color = (key: keyof TokenValues, label: string): TokenField => ({
  key,
  label,
  type: "color",
});

export const tokenFields: TokenField[] = [
  color("background", "Background"),
  color("foreground", "Foreground"),
  color("muted", "Muted"),
  color("mutedForeground", "Muted foreground"),
  color("border", "Border"),
  color("primary", "Primary"),
  color("onPrimary", "On primary"),
  color("secondary", "Secondary"),
  color("onSecondary", "On secondary"),
  color("success", "Success"),
  color("onSuccess", "On success"),
  color("warning", "Warning"),
  color("onWarning", "On warning"),
  color("danger", "Danger"),
  color("onDanger", "On danger"),
  color("info", "Info"),
  color("onInfo", "On info"),
  { key: "radius", label: "Radius", type: "number", min: 0, max: 48 },
  {
    key: "paddingX",
    label: "Horizontal padding",
    type: "number",
    min: 0,
    max: 64,
  },
  {
    key: "paddingY",
    label: "Vertical padding",
    type: "number",
    min: 0,
    max: 64,
  },
  { key: "gap", label: "Gap", type: "number", min: 0, max: 64 },
  { key: "margin", label: "Margin", type: "number", min: 0, max: 48 },
  { key: "fontSize", label: "Font size", type: "number", min: 10, max: 32 },
  { key: "borderWidth", label: "Border width", type: "number", min: 0, max: 6 },
  {
    key: "controlHeightSm",
    label: "Control height sm",
    type: "number",
    min: 16,
    max: 80,
  },
  {
    key: "controlHeightMd",
    label: "Control height md",
    type: "number",
    min: 16,
    max: 80,
  },
  {
    key: "controlHeightLg",
    label: "Control height lg",
    type: "number",
    min: 16,
    max: 80,
  },
];

/** Global keys that existed in schema v1; v1 files are migrated by filling in the rest. */
const v1GlobalKeys = [
  "background",
  "foreground",
  "primary",
  "onPrimary",
  "border",
  "radius",
  "paddingX",
  "paddingY",
  "gap",
  "margin",
  "fontSize",
  "borderWidth",
] as const;

export function isComponentKey(
  key: keyof TokenValues,
): key is keyof ComponentTokens {
  return (componentTokenKeys as readonly string[]).includes(key);
}

function inheritedKey(
  id: ComponentId,
  key: keyof ComponentTokens,
): keyof TokenValues {
  if (id === "button" || id === "switch" || id === "checkbox") {
    if (key === "background") return "primary";
    if (key === "foreground") return "onPrimary";
  }
  return key;
}

export function resolveComponent(
  theme: ThemeTokens,
  id: ComponentId,
): ComponentTokens {
  const tokens = {} as Record<keyof ComponentTokens, string | number>;
  for (const key of componentTokenKeys) {
    tokens[key] = theme.global[inheritedKey(id, key)];
  }
  return { ...(tokens as ComponentTokens), ...theme.components[id] };
}

function kebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function cssValue(value: string | number): string {
  return typeof value === "number" ? `${value}px` : value;
}

const onRoleKeys = {
  primary: "onPrimary", secondary: "onSecondary", success: "onSuccess",
  warning: "onWarning", danger: "onDanger", info: "onInfo",
} as const satisfies Record<PaletteRole, keyof TokenValues>;

function descriptionColor(foreground: string, background: string): string {
  const mixed = mixColors(foreground, background, 0.7);
  return contrastRatio(mixed, background) >= 4.5 ? mixed : foreground;
}

export function toCSSVariables(
  theme: ThemeTokens,
  mode: PaletteMode = "light",
): Record<string, string> {
  const variables: Record<string, string> = { ...systemConstants };
  for (const { key } of tokenFields) {
    variables[`--ds-${kebabCase(key)}`] = cssValue(theme.global[key]);
  }
  for (const role of colorScaleRoles) {
    const scale = resolveColorScale(theme, mode, role);
    for (const stop of colorScaleStops) variables[`--ds-${role}-${stop}`] = scale[stop];
  }
  for (const variant of typographyVariants) {
    const tokens = resolveTypography(theme, variant);
    for (const field of typographyFields) {
      variables[`--ds-typography-${variant}-${kebabCase(field.key)}`] = `${tokens[field.key]}${field.unit}`;
    }
  }
  for (const id of componentIds) {
    for (const key of componentTokenKeys) {
      const override = theme.components[id][key];
      variables[`--${id}-${kebabCase(key)}`] =
        override === undefined
          ? `var(--ds-${kebabCase(inheritedKey(id, key))})`
          : cssValue(override);
    }
  }
  const global = theme.global;
  for (const role of paletteRoles) {
    const colors = deriveRoleColors(
      global[role], global[onRoleKeys[role]], global.background, mode, global.muted,
    );
    for (const key of ["hover", "active", "subtle", "onSubtle", "outline", "focus"] as const) {
      variables[`--ds-${role}-${kebabCase(key)}`] = colors[key];
    }
  }
  const button = resolveComponent(theme, "button");
  const buttonColors = deriveRoleColors(
    button.background, button.foreground, global.background, mode, global.muted,
  );
  variables["--button-hover"] = buttonColors.hover;
  variables["--button-active"] = buttonColors.active;

  const badge = resolveComponent(theme, "badge");
  for (const tone of ["neutral", "primary", "success", "warning", "danger", "info"] as const) {
    const colors = deriveRoleColors(
      tone === "neutral" ? badge.foreground : global[tone],
      tone === "neutral" ? badge.background : global[onRoleKeys[tone]],
      badge.background, mode, badge.background,
    );
    for (const key of ["subtle", "onSubtle", "outline"] as const) {
      variables[`--badge-${tone}-${kebabCase(key)}`] =
              tone === "neutral" && key === "outline"
                ? theme.components.badge.border ?? colors[key]
                : colors[key];
    }
  }
  const card = resolveComponent(theme, "card");
  variables["--card-description"] = descriptionColor(card.foreground, card.background);
  variables["--card-filled-description"] = descriptionColor(global.foreground, global.muted);
  return variables;
}

export function exportCSS(workspace: Pick<DesignSystem, "themes">): string {
  return (["light", "dark"] as const).map((mode) => {
    const selector = mode === "light"
      ? ':root, [data-ds-theme="light"]'
      : '[data-ds-theme="dark"]';
    const declarations = Object.entries(toCSSVariables(workspace.themes[mode], mode))
      .map(([key, value]) => `  ${key}: ${value};`)
      .join("\n");
    return `${selector} {\n  color-scheme: ${mode};\n${declarations}\n}\n`;
  }).join("\n");
}

function requireObject(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
}

function requireKnownKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`Unknown field: ${path}.${key}`);
  }
}

function validateTokens(value: unknown, path: string, partial: boolean): void {
  requireObject(value, path);
  const fields = partial
    ? tokenFields.filter(({ key }) => isComponentKey(key))
    : tokenFields;
  requireKnownKeys(
    value,
    fields.map(({ key }) => key),
    path,
  );
  for (const field of fields) {
    if (partial && !Object.prototype.hasOwnProperty.call(value, field.key))
      continue;
    const token = value[field.key];
    if (field.type === "color") {
      if (typeof token !== "string" || !/^#[0-9a-fA-F]{6}$/.test(token)) {
        throw new Error(`${path}.${field.key} must be a #rrggbb color`);
      }
    } else if (
      typeof token !== "number" ||
      !Number.isFinite(token) ||
      token < field.min! ||
      token > field.max!
    ) {
      throw new Error(
        `${path}.${field.key} must be a finite number from ${field.min} to ${field.max}`,
      );
    }
  }
}

export function parseDesignSystem(text: string): DesignSystem {
  const value: unknown = JSON.parse(text);
  requireObject(value, "system");
  if (value.version !== 1 && value.version !== 2 && value.version !== 3) {
    throw new Error("system.version must be 1, 2 or 3");
  }
  requireKnownKeys(value, value.version === 3
    ? ["version", "name", "themes"]
    : ["version", "name", "global", "components"], "system");
  if (typeof value.name !== "string" || value.name.length > 80) {
    throw new Error("system.name must be a string of at most 80 characters");
  }
  if (value.version === 3) {
    requireObject(value.themes, "themes");
    requireKnownKeys(value.themes, ["light", "dark"], "themes");
    for (const mode of ["light", "dark"] as const) {
      const theme = value.themes[mode];
      const path = `themes.${mode}`;
      requireObject(theme, path);
      requireKnownKeys(theme, ["source", "global", "components", "colorScales", "typography"], path);
      if (typeof theme.source !== "string" || !/^#[0-9a-fA-F]{6}$/.test(theme.source)) {
        throw new Error(`${path}.source must be a #rrggbb color`);
      }
      validateTokens(theme.global, `${path}.global`, false);
      validateComponents(theme.components, `${path}.components`, true);
      if (theme.colorScales !== undefined) validateColorScales(theme.colorScales, `${path}.colorScales`);
      if (theme.typography !== undefined) validateTypography(theme.typography, `${path}.typography`);
      theme.colorScales ??= {};
      theme.typography = Object.fromEntries(typographyVariants.map((variant) =>
        [variant, resolveTypography(theme as ThemeTokens, variant)],
      ));
    }
    // Older v3 exports may disagree; retain Light geometry and both color palettes.
    return shareNonColorTokens(value as DesignSystem);
  }
  if (value.version === 1) {
    // v1 predates the extended roles and size scale: accept only v1 keys, then
    // fill the new ones from the defaults.
    requireObject(value.global, "global");
    requireKnownKeys(value.global, v1GlobalKeys, "global");
    for (const key of v1GlobalKeys) {
      if (!Object.prototype.hasOwnProperty.call(value.global, key)) {
        throw new Error(`global.${key} is required`);
      }
    }
    value.global = { ...legacyDefaults.global, ...value.global };
  }
  validateTokens(value.global, "global", false);
  validateComponents(value.components, "components", true);
  const global = value.global as TokenValues;
  const components = value.components as ThemeTokens["components"];
  const theme = { source: global.primary, global, components, colorScales: {}, typography: defaultTypography };
  return {
    version: 3,
    name: value.name,
    themes: { light: structuredClone(theme), dark: structuredClone(theme) },
  };
}

function validateColorScales(value: unknown, path: string): void {
  requireObject(value, path);
  requireKnownKeys(value, colorScaleRoles, path);
  for (const role of colorScaleRoles) {
    if (!Object.prototype.hasOwnProperty.call(value, role)) continue;
    const stops = value[role];
    const rolePath = `${path}.${role}`;
    requireObject(stops, rolePath);
    requireKnownKeys(stops, colorScaleStops.map(String), rolePath);
    for (const [stop, color] of Object.entries(stops)) {
      if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        throw new Error(`${rolePath}.${stop} must be a #rrggbb color`);
      }
    }
  }
}

function validateTypography(value: unknown, path: string): void {
  requireObject(value, path);
  requireKnownKeys(value, typographyVariants, path);
  for (const variant of typographyVariants) {
    if (!Object.prototype.hasOwnProperty.call(value, variant)) continue;
    const tokens = value[variant];
    const variantPath = `${path}.${variant}`;
    requireObject(tokens, variantPath);
    requireKnownKeys(tokens, typographyFields.map(({ key }) => key), variantPath);
    for (const field of typographyFields) {
      if (!Object.prototype.hasOwnProperty.call(tokens, field.key)) continue;
      const number = tokens[field.key];
      if (typeof number !== "number" || !Number.isFinite(number) || number < field.min || number > field.max) {
        throw new Error(`${variantPath}.${field.key} must be a finite number from ${field.min} to ${field.max}`);
      }
    }
  }
}

function validateComponents(value: unknown, path: string, migrateText = false): void {
  requireObject(value, path);
  requireKnownKeys(value, componentIds, path);
  if (migrateText && value.text === undefined) value.text = {};
  for (const id of componentIds) {
    validateTokens(value[id], `${path}.${id}`, true);
  }
}
