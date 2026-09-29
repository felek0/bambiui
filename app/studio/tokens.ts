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
  /** Legacy medium radius. Kept for v1-v3 compatibility and exported as --ds-radius/--ds-radius-md. */
  radius: number;
  radiusSm: number;
  radiusLg: number;
  paddingX: number;
  paddingY: number;
  gap: number;
  margin: number;
  spacingSm: number;
  spacingMd: number;
  spacingLg: number;
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

export const componentVariantKeys = {
  button: ["primary", "secondary", "outline", "ghost", "destructive", "link"],
  input: ["default", "hover", "invalid", "readonly"],
  switch: ["checked", "unchecked", "invalidChecked", "invalidUnchecked"],
  checkbox: ["checked", "unchecked", "invalidChecked", "invalidUnchecked"],
  badge: ["solid.neutral", "solid.primary", "solid.success", "solid.warning", "solid.danger", "solid.info", "subtle.neutral", "subtle.primary", "subtle.success", "subtle.warning", "subtle.danger", "subtle.info", "outline.neutral", "outline.primary", "outline.success", "outline.warning", "outline.danger", "outline.info"],
  card: ["outlined", "elevated", "filled"],
} as const;
export type ComponentVariantId = keyof typeof componentVariantKeys;
export type ComponentVariantColorTokens = Partial<Record<"background" | "foreground" | "border" | "hoverBackground" | "activeBackground", string>> & {
  borderWidth?: number;
  shadow?: "none" | "sm" | "md" | "lg";
};
export type ComponentVariantColors = Partial<Record<ComponentVariantId, Partial<Record<(typeof componentVariantKeys)[ComponentVariantId][number], ComponentVariantColorTokens>>>>;

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

export const fontFamilyPresets = [
  "system", "sans", "humanist", "serif", "editorial", "mono", "typewriter",
  "google-inter", "google-roboto", "google-open-sans", "google-dm-sans",
  "google-montserrat", "google-poppins", "google-nunito", "google-space-grotesk",
  "google-playfair-display", "google-lora", "google-merriweather", "google-roboto-mono",
] as const;
export type FontFamilyPreset = (typeof fontFamilyPresets)[number];
export const googleFontFamilies = {
  "google-inter": { family: "Inter", fallback: "sans-serif" },
  "google-roboto": { family: "Roboto", fallback: "sans-serif" },
  "google-open-sans": { family: "Open Sans", fallback: "sans-serif" },
  "google-dm-sans": { family: "DM Sans", fallback: "sans-serif" },
  "google-montserrat": { family: "Montserrat", fallback: "sans-serif" },
  "google-poppins": { family: "Poppins", fallback: "sans-serif" },
  "google-nunito": { family: "Nunito", fallback: "sans-serif" },
  "google-space-grotesk": { family: "Space Grotesk", fallback: "sans-serif" },
  "google-playfair-display": { family: "Playfair Display", fallback: "serif" },
  "google-lora": { family: "Lora", fallback: "serif" },
  "google-merriweather": { family: "Merriweather", fallback: "serif" },
  "google-roboto-mono": { family: "Roboto Mono", fallback: "monospace" },
} as const satisfies Partial<Record<FontFamilyPreset, { family: string; fallback: string }>>;

export function googleFontUrl(preset: FontFamilyPreset): string | null {
  const font = googleFontFamilies[preset as keyof typeof googleFontFamilies];
  if (!font) return null;
  const weights = preset === "google-merriweather" ? "400;700" : "400;500;600;700";
  return `https://fonts.googleapis.com/css2?family=${font.family.replaceAll(" ", "+")}:wght@${weights}&display=swap`;
}

export const fontFamilyStacks: Record<FontFamilyPreset, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  sans: 'Arial, Helvetica, sans-serif',
  humanist: '"Trebuchet MS", "Segoe UI", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  editorial: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  typewriter: '"Courier New", Courier, monospace',
  ...Object.fromEntries(Object.entries(googleFontFamilies).map(([id, font]) =>
    [id, `"${font.family}", ${font.fallback}`],
  )) as Record<keyof typeof googleFontFamilies, string>,
};

export const fontFamilyLabels: Record<FontFamilyPreset, string> = {
  system: "System sans", sans: "Classic sans", humanist: "Humanist sans",
  serif: "Georgia serif", editorial: "Editorial serif",
  mono: "System mono", typewriter: "Typewriter mono",
  ...Object.fromEntries(Object.entries(googleFontFamilies).map(([id, font]) =>
    [id, font.family],
  )) as Record<keyof typeof googleFontFamilies, string>,
};

export function resolveFontFamily(theme: ThemeTokens): string {
  return fontFamilyStacks[theme.fontFamily];
}

export type ThemeTokens = {
  source: string;
  fontFamily: FontFamilyPreset;
  global: TokenValues;
  components: Record<ComponentId, Partial<ComponentTokens>>;
  colorScales?: ColorScaleOverrides;
  typography?: Partial<Record<TypographyVariant, Partial<TypographyTokens>>>;
  /** Optional Light/Dark-specific colors for real component variant/tone combinations. */
  variantColors?: ComponentVariantColors;
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
  const variantColors = structuredClone(target.variantColors ?? {});
  for (const id of Object.keys(componentVariantKeys) as ComponentVariantId[]) {
    const next = { ...(variantColors[id] ?? {}) };
    for (const key of componentVariantKeys[id]) {
      const sourceTokens = source.variantColors?.[id]?.[key];
      const targetTokens = { ...(next[key] ?? {}) };
      if (sourceTokens?.shadow === undefined) delete targetTokens.shadow;
      else targetTokens.shadow = sourceTokens.shadow;
      if (sourceTokens?.borderWidth === undefined) delete targetTokens.borderWidth;
      else targetTokens.borderWidth = sourceTokens.borderWidth;
      if (Object.keys(targetTokens).length) next[key] = targetTokens;
      else delete next[key];
    }
    if (Object.keys(next).length) variantColors[id] = next;
    else delete variantColors[id];
  }
  return {
    ...system,
    themes: { ...system.themes, [other]: { ...target, global, components, fontFamily: source.fontFamily, typography: structuredClone(source.typography), variantColors } },
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
    radiusSm: 4,
    radiusLg: 12,
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
    fontFamily: "system",
    global: { ...legacyDefaults.global, spacingSm: 4, spacingMd: 8, spacingLg: 16, ...defaultPalette[mode].tokens },
    components: { button: {}, input: {}, card: {}, badge: {}, switch: {}, checkbox: {}, text: {} },
    colorScales: {},
    typography: structuredClone(defaultTypography),
    variantColors: {},
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
  "--ds-button-font-weight": "500",
  "--ds-button-line-height": "1.35",
  "--ds-field-label-font-weight": "500",
  "--ds-field-helper-font-size": "0.86em",
  "--ds-field-helper-line-height": "1.45",
  "--ds-input-line-height": "1.4",
  "--ds-badge-line-height": "1.2",
  "--ds-card-title-font-weight": "550",
  "--ds-card-title-letter-spacing": "-0.02em",
  "--ds-card-description-line-height": "1.65",

  "--ds-shadow-sm": "0 1px 2px #00000014",
  "--ds-shadow-md": "0 4px 12px #00000018",
  "--ds-shadow-lg": "0 8px 24px #27272a1f",
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
  { key: "radius", label: "Radius md (legacy)", type: "number", min: 0, max: 48 },
  { key: "radiusSm", label: "Radius sm", type: "number", min: 0, max: 48 },
  { key: "radiusLg", label: "Radius lg", type: "number", min: 0, max: 48 },
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
  { key: "spacingSm", label: "Spacing sm", type: "number", min: 0, max: 64 },
  { key: "spacingMd", label: "Spacing md", type: "number", min: 0, max: 64 },
  { key: "spacingLg", label: "Spacing lg", type: "number", min: 0, max: 64 },
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
  const variables: Record<string, string> = { ...systemConstants, "--ds-font-family": resolveFontFamily(theme) };
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
  variables["--ds-radius-md"] = variables["--ds-radius"];
  variables["--ds-radius"] = variables["--ds-radius-md"];
  for (const role of paletteRoles) {
    const colors = deriveRoleColors(
      global[role], global[onRoleKeys[role]], global.background, mode, global.muted,
    );
    for (const key of ["hover", "active", "subtle", "onSubtle", "outline", "focus"] as const) {
      variables[`--ds-${role}-${kebabCase(key)}`] = colors[key];
    }
  }
  const shadowValue = (level: string) => level === "none" ? "none" : `var(--ds-shadow-${level})`;
  const button = resolveComponent(theme, "button");
  const buttonDefaults: Record<string, { background: string; foreground: string; border: string }> = {
    primary: { background: button.background, foreground: button.foreground, border: button.border },
    secondary: { background: global.secondary, foreground: global.onSecondary, border: global.secondary },
    outline: { background: "transparent", foreground: global.foreground, border: global.border },
    ghost: { background: "transparent", foreground: global.foreground, border: "transparent" },
    destructive: { background: global.danger, foreground: global.onDanger, border: global.danger },
    link: { background: "transparent", foreground: variables["--ds-primary-on-subtle"], border: "transparent" },
  };
  for (const variant of componentVariantKeys.button) {
    const defaults = buttonDefaults[variant];
    const overrides = theme.variantColors?.button?.[variant] ?? {};
    const colors = { ...defaults, ...overrides };
    const prefix = `--button-variant-${variant}`;
    for (const key of ["background", "foreground", "border"] as const) variables[`${prefix}-${kebabCase(key)}`] = colors[key];
    variables[`${prefix}-border-width`] = cssValue(overrides.borderWidth ?? button.borderWidth);
    variables[`${prefix}-shadow`] = shadowValue(overrides.shadow ?? "none");
    const derivedBackground = colors.background === "transparent" ? global.background : colors.background;
    const derived = deriveRoleColors(derivedBackground, colors.foreground, global.background, mode, global.muted);
    variables[`${prefix}-hover-background`] = overrides.hoverBackground ?? (variant === "outline" || variant === "ghost" || variant === "link" ? global.muted : derived.hover);
    variables[`${prefix}-active-background`] = overrides.activeBackground ?? (variant === "outline" || variant === "ghost" || variant === "link" ? global.muted : derived.active);
  }
  variables["--button-hover"] = variables["--button-variant-primary-hover-background"];
  variables["--button-active"] = variables["--button-variant-primary-active-background"];

  const input = resolveComponent(theme, "input");
  const inputDefaults = {
    default: { background: input.background, foreground: input.foreground, border: input.border },
    hover: { background: input.background, foreground: input.foreground, border: input.border },
    invalid: { background: input.background, foreground: input.foreground, border: global.danger },
    readonly: { background: input.background, foreground: input.foreground, border: input.border },
  } as const;
  for (const state of componentVariantKeys.input) {
    const defaults = inputDefaults[state];
    const overrides = theme.variantColors?.input?.[state] ?? {};
    const values = { ...defaults, ...overrides };
    const prefix = `--input-variant-${kebabCase(state)}`;
    for (const field of ["background", "foreground", "border"] as const) variables[`${prefix}-${field}`] = values[field];
    variables[`${prefix}-border-width`] = cssValue(overrides.borderWidth ?? input.borderWidth);
    variables[`${prefix}-shadow`] = shadowValue(overrides.shadow ?? "none");
  }
  for (const component of ["switch", "checkbox"] as const) {
    const resolved = resolveComponent(theme, component);
    const defaults = {
      checked: { background: resolved.background, foreground: resolved.foreground, border: resolved.border },
      unchecked: { background: global.muted, foreground: global.foreground, border: global.border },
      invalidChecked: { background: resolved.background, foreground: resolved.foreground, border: variables["--ds-danger-outline"] },
      invalidUnchecked: { background: global.muted, foreground: global.foreground, border: variables["--ds-danger-outline"] },
    };
    for (const state of componentVariantKeys[component]) {
      const overrides = theme.variantColors?.[component]?.[state] ?? {};
      const values = { ...defaults[state], ...overrides };
      const prefix = `--${component}-variant-${kebabCase(state)}`;
      for (const field of ["background", "foreground", "border"] as const) variables[`${prefix}-${field}`] = values[field];
      variables[`${prefix}-border-width`] = cssValue(overrides.borderWidth ?? resolved.borderWidth);
      variables[`${prefix}-shadow`] = shadowValue(overrides.shadow ?? "none");
    }
  }

  const badge = resolveComponent(theme, "badge");
  const tones = ["neutral", "primary", "success", "warning", "danger", "info"] as const;
  const badgeRoles: Record<typeof tones[number], { fill: string; ink: string }> = {
    neutral: { fill: badge.foreground, ink: badge.background },
    primary: { fill: global.primary, ink: global.onPrimary },
    success: { fill: global.success, ink: global.onSuccess },
    warning: { fill: global.warning, ink: global.onWarning },
    danger: { fill: global.danger, ink: global.onDanger },
    info: { fill: global.info, ink: global.onInfo },
  };
  for (const tone of tones) {
    const role = badgeRoles[tone];
    const derived = deriveRoleColors(role.fill, role.ink, badge.background, mode, badge.background);
    const defaults = {
      solid: { background: role.fill, foreground: role.ink, border: role.fill, borderWidth: badge.borderWidth, shadow: "none" },
      subtle: { background: derived.subtle, foreground: derived.onSubtle, border: "transparent", borderWidth: badge.borderWidth, shadow: "none" },
      outline: { background: badge.background, foreground: derived.onSubtle, border: tone === "neutral" ? theme.components.badge.border ?? derived.outline : derived.outline, borderWidth: badge.borderWidth, shadow: "none" },
    };
    variables[`--badge-${tone}-subtle`] = derived.subtle;
    variables[`--badge-${tone}-on-subtle`] = derived.onSubtle;
    variables[`--badge-${tone}-outline`] = tone === "neutral" ? theme.components.badge.border ?? derived.outline : derived.outline;
    for (const variant of ["solid", "subtle", "outline"] as const) {
      const key = `${variant}.${tone}`;
      const values = { ...defaults[variant], ...theme.variantColors?.badge?.[key as (typeof componentVariantKeys.badge)[number]] };
      const prefix = `--badge-variant-${variant}-${tone}`;
      for (const field of ["background", "foreground", "border"] as const) variables[`${prefix}-${field}`] = values[field];
      variables[`${prefix}-border-width`] = cssValue(values.borderWidth);
      variables[`${prefix}-shadow`] = shadowValue(values.shadow);
      variables[`${prefix}-subtle`] = derived.subtle;
      variables[`${prefix}-on-subtle`] = derived.onSubtle;
      variables[`${prefix}-outline`] = values.border;
    }
  }
  const card = resolveComponent(theme, "card");
  const cardDefaults = {
    outlined: { background: card.background, foreground: card.foreground, border: card.border, borderWidth: card.borderWidth, shadow: "none" },
    elevated: { background: card.background, foreground: card.foreground, border: "transparent", borderWidth: card.borderWidth, shadow: "lg" },
    filled: { background: global.muted, foreground: global.foreground, border: "transparent", borderWidth: card.borderWidth, shadow: "none" },
  } as const;
  for (const variant of componentVariantKeys.card) {
    const values = { ...cardDefaults[variant], ...theme.variantColors?.card?.[variant] };
    const prefix = `--card-variant-${variant}`;
    variables[`${prefix}-background`] = values.background;
    variables[`${prefix}-foreground`] = values.foreground;
    variables[`${prefix}-border`] = values.border;
    variables[`${prefix}-border-width`] = cssValue(values.borderWidth);
    variables[`${prefix}-shadow`] = shadowValue(values.shadow);
    const descriptionBackground = values.background === "transparent" ? global.background : values.background;
    variables[`${prefix}-description`] = descriptionColor(values.foreground, descriptionBackground);
  }
  variables["--card-description"] = descriptionColor(card.foreground, card.background);
  variables["--card-filled-description"] = variables["--card-variant-filled-description"];
  return variables;
}

export function exportCSS(workspace: Pick<DesignSystem, "themes">): string {
  const imports = [...new Set((["light", "dark"] as const)
    .map((mode) => googleFontUrl(workspace.themes[mode].fontFamily))
    .filter((url): url is string => url !== null))];
  const prelude = imports.map((url) => `@import url("${url}");`).join("\n");
  return (prelude ? `${prelude}\n\n` : "") + (["light", "dark"] as const).map((mode) => {
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
      requireKnownKeys(theme, ["source", "fontFamily", "global", "components", "colorScales", "typography", "variantColors"], path);
      if (theme.fontFamily === undefined && !Object.hasOwn(theme, "fontFamily")) theme.fontFamily = "system";
      if (!fontFamilyPresets.includes(theme.fontFamily as FontFamilyPreset)) {
        throw new Error(`${path}.fontFamily must be one of: ${fontFamilyPresets.join(", ")}`);
      }
      requireObject(theme.global, `${path}.global`);
      for (const key of ["spacingSm", "spacingMd", "spacingLg", "radiusSm", "radiusLg"] as const) {
        if (!Object.hasOwn(theme.global, key)) theme.global[key] = defaultSystem.themes[mode].global[key];
      }
      if (typeof theme.source !== "string" || !/^#[0-9a-fA-F]{6}$/.test(theme.source)) {
        throw new Error(`${path}.source must be a #rrggbb color`);
      }
      validateTokens(theme.global, `${path}.global`, false);
      validateComponents(theme.components, `${path}.components`, true);
      if (theme.colorScales !== undefined) validateColorScales(theme.colorScales, `${path}.colorScales`);
      if (theme.typography !== undefined) validateTypography(theme.typography, `${path}.typography`);
      if (theme.variantColors !== undefined) validateVariantColors(theme.variantColors, `${path}.variantColors`);
      theme.colorScales ??= {};
      theme.typography = Object.fromEntries(typographyVariants.map((variant) =>
        [variant, resolveTypography(theme as ThemeTokens, variant)],
      ));
      theme.variantColors ??= {};
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
  requireObject(value.global, "global");
  for (const key of ["spacingSm", "spacingMd", "spacingLg", "radiusSm", "radiusLg"] as const) {
    value.global[key] = defaultSystem.themes.light.global[key];
  }
  validateTokens(value.global, "global", false);
  validateComponents(value.components, "components", true);
  const global = value.global as TokenValues;
  const components = value.components as ThemeTokens["components"];
  const theme = { source: global.primary, fontFamily: "system" as const, global, components, colorScales: {}, typography: defaultTypography, variantColors: {} };
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

function validateVariantColors(value: unknown, path: string): void {
  requireObject(value, path);
  requireKnownKeys(value, Object.keys(componentVariantKeys), path);
  for (const id of Object.keys(value) as ComponentVariantId[]) {
    const variants = value[id];
    const variantsPath = `${path}.${id}`;
    requireObject(variants, variantsPath);
    requireKnownKeys(variants, componentVariantKeys[id], variantsPath);
    for (const [variant, rawTokens] of Object.entries(variants)) {
      const tokenPath = `${variantsPath}.${variant}`;
      requireObject(rawTokens, tokenPath);
      const colorFields = id === "button"
        ? ["background", "foreground", "border", "hoverBackground", "activeBackground"]
        : ["background", "foreground", "border"];
      requireKnownKeys(rawTokens, [...colorFields, "borderWidth", "shadow"], tokenPath);
      for (const [field, token] of Object.entries(rawTokens)) {
        if (field === "shadow") {
          if (!["none", "sm", "md", "lg"].includes(token as string)) throw new Error(`${tokenPath}.${field} must be a supported shadow preset`);
        } else if (field === "borderWidth") {
          if (typeof token !== "number" || !Number.isFinite(token) || token < 0 || token > 6) throw new Error(`${tokenPath}.${field} must be a finite number from 0 to 6`);
        } else {
          const transparentSurface = token === "transparent"
            && ["background", "border", "hoverBackground", "activeBackground"].includes(field);
          if (typeof token !== "string" || (!/^#[0-9a-fA-F]{6}$/.test(token) && !transparentSurface)) {
            throw new Error(`${tokenPath}.${field} must be a #rrggbb color${field === "foreground" ? "" : " or transparent"}`);
          }
        }
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
