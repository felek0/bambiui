import type { ComponentId } from "./tokens";
import type { PaletteMode } from "./color-engine";

const englishNotes = {
  size: "Shared size scale; density for Card.",
  content: "Component content.",
  className: "Applied to the root; the field wrapper for labelled controls.",
  icons: "Content before / after the label or value.",
  label: "Visible accessible label.",
  hideLabel: "Visually hides the label, retaining its accessible name.",
  description: "Linked helper / error text. A truthy error marks the field invalid.",
  states: "Disable interaction / prevent changes / require a value.",
  name: "Form submission name.",
  labelPosition: "Side of the control on which the label appears.",
  checked: "Controlled / initial uncontrolled checked state.",
  onCheckedChange: "Receives the next checked state and event details.",
  value: "Form submission value, not the checked state.",
  hierarchy: "Visual hierarchy.",
  disabled: "Blocks activation.",
  loading: "Blocks activation, keeps focus, sets aria-busy and replaces the start icon with a spinner.",
  fullWidth: "Stretches to container width.",
  iconOnly: "Square icon control; requires aria-label when true. Hides endIcon.",
  render: "Base UI element composition.",
  inputType: "Native input type.",
  placeholder: "Hint, not a replacement for label.",
  inputValue: "Controlled / initial uncontrolled value.",
  onValueChange: "Receives the next value and event details.",
  indeterminate: "Displays a mixed-state indicator.",
  fill: "Fill style.",
  tone: "Semantic color role.",
  dot: "Decorative leading status dot; provide meaningful text.",
  startIcon: "Leading icon content.",
  surface: "Surface treatment.",
  textVariant: "Typography style, independent of the semantic element.",
  textTone: "Neutral uses the theme foreground; semantic tones use their readable on-subtle color.",
  textAs: "Rendered element. Defaults to h2 for heading, p for paragraph and span for label or caption.",
  textNative: "Native props for the chosen heading, paragraph or span element.",
} as const;

export type NoteKey = keyof typeof englishNotes;

type DeveloperCopy = {
  notes: Record<NoteKey, string>;
  componentNotes: Record<ComponentId, string>;
  developerReference: string;
  systemTokens: string;
  componentIntro: string;
  overviewIntro: string;
  system: string;
  theme: string;
  modeName: Record<PaletteMode, string>;
  source: string;
  reactUsage: string;
  copyReactCode: string;
  reactDescription: string;
  copying: string;
  copied: string;
  copyError: string;
  propsAndDefaults: string;
  propsDescription: string;
  propReference: string;
  prop: string;
  type: string;
  default: string;
  behavior: string;
  required: string;
  baseUIDefaults: string;
  baseUIDefault: string;
  tokenInheritance: string;
  globalTokenReference: string;
  componentTokensDescription: string;
  globalTokensDescription: string;
  baseTokenAliases: string;
  globalCSSVariables: string;
  aliasCSSName: string;
  cssName: string;
  sourceColumn: string;
  resolvedValue: string;
  inherited: string;
  componentOverride: string;
  globalValue: string;
  colorRamp: string;
  colorRampDescription: string;
  role: string;
  typographyReference: string;
  typographyDescription: string;
  fontFamily: string;
  variant: string;
  preview: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  letterSpacing: string;
  sampleText: string;
  derivedColors: string;
  derivedDescription: (mode: PaletteMode) => string;
  derivedThemeVariables: string;
  runtimeVariables: string;
  cssVariable: string;
  valueColumn: string;
  cssVariableExport: string;
  exportBeforeCode: string;
  exportAfterCode: string;
  showFullSystem: string;
  fullSystemExport: string;
  usageRegion: (name: string) => string;
  propsRegion: (name: string) => string;
  tokensRegion: (name: string) => string;
};

export const developerCopy = {
    notes: englishNotes,
    componentNotes: {
      button: "Also accepts Base UI Button props and native button attributes. An icon-only button must have an aria-label. No tone prop is defined.",
      input: "Also accepts Base UI Input props except its className, size and type, which the wrapper replaces. Icons are decorative. No variant or tone prop is defined.",
      switch: "Also accepts Base UI Switch.Root props except className and children. The wrapper supplies the thumb and label; use label rather than children. No variant or tone prop is defined.",
      checkbox: "Also accepts Base UI Checkbox.Root props except className and children. The wrapper supplies the indicator and label; use label rather than children. No variant or tone prop is defined.",
      badge: "Also accepts native span props. Badge has no endIcon, loading or disabled behavior.",
      card: "Also accepts native article props. Compose Card.Icon (span), Card.Header (div), Card.Title (strong, not a heading), Card.Description (p), Card.Content (div) and Card.Footer (div). Each part accepts its native element props. No tone prop is defined.",
      text: "Presentational; not a Base UI control. The variant controls visual typography, not document structure: choose as=\"h1\" through as=\"h6\" for the correct heading level. The label style does not render an HTML label. Size scales font size, while line height remains unitless.",
    },
    developerReference: "Developer reference",
    systemTokens: "System tokens",
    componentIntro: "React usage, component props and live token inheritance.",
    overviewIntro: "Select a component in the studio to see its React usage and API reference.",
    system: "System",
    theme: "theme",
    modeName: { light: "light", dark: "dark" },
    source: "source",
    reactUsage: "React usage",
    copyReactCode: "Copy React code",
    reactDescription: "Examples from snippets.ts. Imports refer to this project; this is not a published component package.",
    copying: "Copying React code…",
    copied: "React code copied to clipboard.",
    copyError: "Could not copy React code. Select and copy the code below manually.",
    propsAndDefaults: "Props and defaults",
    propsDescription: "Wrapper API from the component sources and docs/component-api.md. A dash means no wrapper default; inherited Base UI defaults are identified separately.",
    propReference: "prop reference",
    prop: "Prop",
    type: "Type",
    default: "Default",
    behavior: "Behavior",
    required: "Required",
    baseUIDefaults: "Base UI defaults",
    baseUIDefault: "Base UI default",
    tokenInheritance: "Token inheritance",
    globalTokenReference: "Global token reference",
    componentTokensDescription: "Live base aliases for this component. Overrides replace inheritance, even when equal to the global value. Variants, tones, sizes and states may use additional tokens; these are not computed element styles.",
    globalTokensDescription: "Current global CSS variables. Numeric token values are exported in pixels.",
    baseTokenAliases: "base token aliases",
    globalCSSVariables: "Global CSS variables",
    aliasCSSName: "Alias CSS name",
    cssName: "CSS name",
    sourceColumn: "Source",
    resolvedValue: "Resolved value",
    inherited: "Inherited",
    componentOverride: "Component override",
    globalValue: "Global value",
    colorRamp: "Color ramp",
    colorRampDescription: "Seven live theme roles, each with 11 light-to-dark stops. Swatches and values follow the exported --ds-{role}-{stop} CSS variables, including overrides. Scroll horizontally to see every stop.",
    role: "Role",
    typographyReference: "Typography reference",
    typographyDescription: "Shared font family and resolved values for the current theme. Text variants use these CSS variables; size sm/lg scales only font size with --ds-size-scale-sm/lg, while md uses the base size. Variant is visual; use as to choose semantic markup. Tone selects --ds-foreground (neutral) or --ds-{tone}-on-subtle.",
    fontFamily: "Font family preset",
    variant: "Variant",
    preview: "Preview",
    fontSize: "Font size",
    lineHeight: "Line height",
    fontWeight: "Font weight",
    letterSpacing: "Letter spacing",
    sampleText: "The quick brown fox",
    derivedColors: "Derived colors and system constants",
    derivedDescription: (mode) => `Computed from the ${mode === "light" ? "light" : "dark"} theme’s current values; these are not manual component overrides.`,
    derivedThemeVariables: "Derived theme variables",
    runtimeVariables: "runtime variables",
    cssVariable: "CSS variable",
    valueColumn: "Value",
    cssVariableExport: "CSS variable export",
    exportBeforeCode: "Both themes, including aliases, derived state colors and system constants. Light is the root default; set ",
    exportAfterCode: " on your theme container for dark mode. Component markup and style rules are not included.",
    showFullSystem: "Show full-system CSS variables",
    fullSystemExport: "Full-system CSS variable export",
    usageRegion: (name) => `${name} React usage`,
    propsRegion: (name) => `${name} props and defaults`,
    tokensRegion: (name) => `${name} token inheritance`,
} satisfies DeveloperCopy;
