import type { CSSProperties } from "react";

/** Local instance values, not shared design-system tokens. Lengths are px. */
export type NodeAppearance = {
  width?: number | "hug" | "fill";
  height?: number | "hug" | "fill";
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number | "fill";
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomRightRadius?: number;
  borderBottomLeftRadius?: number;
  fontSize?: number;
  fontWeight?: number;
  /** Unitless multiplier. */
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  gap?: number;
  /** Six-digit hex or transparent; never arbitrary CSS. */
  background?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  shadow?: "none" | "sm" | "md" | "lg";
  opacity?: number;
};
export type NodePart = "root" | "row" | "label" | "control" | "description" | "error";
export type NodeParts = Partial<Record<NodePart, NodeAppearance>>;
export type AppearanceProps = { appearance?: NodeAppearance };
export type AppearancePatch = { [K in keyof NodeAppearance]?: NodeAppearance[K] | null };
export type PartsPatch = Partial<Record<NodePart, AppearancePatch | null>>;
export type AppearanceField = {
  key: keyof NodeAppearance;
  label: string;
  group: "dimensions" | "padding" | "margin" | "radius" | "typography" | "layout" | "surface";
  type: "number" | "dimension" | "select" | "color";
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
};

/** Stable order is also the serialization/style order. No defaults are materialized. */
export const appearanceFields: readonly AppearanceField[] = [
  { key: "width", label: "Width", group: "dimensions", type: "dimension", min: 0, max: 10000, step: 1, options: ["hug", "fill"] },
  { key: "height", label: "Height", group: "dimensions", type: "dimension", min: 0, max: 10000, step: 1, options: ["hug", "fill"] },
  { key: "minWidth", label: "Min width", group: "dimensions", type: "number", min: 0, max: 10000, step: 1 },
  { key: "minHeight", label: "Min height", group: "dimensions", type: "number", min: 0, max: 10000, step: 1 },
  { key: "maxWidth", label: "Max width", group: "dimensions", type: "dimension", min: 0, max: 10000, step: 1, options: ["fill"] },
  ...(["Top", "Right", "Bottom", "Left"] as const).map((edge): AppearanceField => ({ key: `padding${edge}`, label: `Padding ${edge.toLowerCase()}`, group: "padding", type: "number", min: 0, max: 1000, step: 1 })),
  ...(["Top", "Right", "Bottom", "Left"] as const).map((edge): AppearanceField => ({ key: `margin${edge}`, label: `Margin ${edge.toLowerCase()}`, group: "margin", type: "number", min: -1000, max: 1000, step: 1 })),
  ...(["TopLeft", "TopRight", "BottomRight", "BottomLeft"] as const).map((corner): AppearanceField => ({ key: `border${corner}Radius`, label: `${corner.replace(/([a-z])([A-Z])/g, "$1 $2")} radius`, group: "radius", type: "number", min: 0, max: 1000, step: 1 })),
  { key: "fontSize", label: "Font size", group: "typography", type: "number", min: 1, max: 512, step: 1 },
  { key: "fontWeight", label: "Font weight", group: "typography", type: "number", min: 1, max: 1000, step: 1 },
  { key: "lineHeight", label: "Line height", group: "typography", type: "number", min: 0.1, max: 10, step: 0.05 },
  { key: "letterSpacing", label: "Letter spacing", group: "typography", type: "number", min: -100, max: 100, step: 0.1 },
  { key: "textAlign", label: "Text align", group: "typography", type: "select", options: ["left", "center", "right", "justify"] },
  { key: "gap", label: "Gap", group: "layout", type: "number", min: 0, max: 1000, step: 1 },
  { key: "background", label: "Background", group: "surface", type: "color", options: ["transparent"] },
  { key: "color", label: "Color", group: "surface", type: "color" },
  { key: "borderColor", label: "Border color", group: "surface", type: "color", options: ["transparent"] },
  { key: "borderWidth", label: "Border width", group: "surface", type: "number", min: 0, max: 100, step: 1 },
  { key: "shadow", label: "Shadow", group: "surface", type: "select", options: ["none", "sm", "md", "lg"] },
  { key: "opacity", label: "Opacity", group: "surface", type: "number", min: 0, max: 1, step: 0.05 },
];

export function appearanceRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${path}: expected plain object`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !Object.getOwnPropertyDescriptor(value, key)?.enumerable || !Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), "value")) throw new Error(`${path}: expected serialized keys and values`);
  }
  return value as Record<string, unknown>;
}

export function parseAppearance(value: unknown, fields: readonly AppearanceField[] = appearanceFields, path = "appearance"): NodeAppearance {
  const raw = appearanceRecord(value, path);
  for (const key of Object.keys(raw)) if (!fields.some((field) => field.key === key)) throw new Error(`${path}: unknown or unsupported key ${key}`);
  const result: NodeAppearance = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(raw, field.key)) continue;
    const entry = raw[field.key];
    const option = typeof entry === "string" && field.options?.includes(entry);
    const numeric = typeof entry === "number" && Number.isFinite(entry) && entry >= field.min! && entry <= field.max! && (field.key !== "fontWeight" || Number.isInteger(entry));
    const valid = field.type === "color" ? option || (typeof entry === "string" && /^#[\da-fA-F]{6}$/.test(entry))
      : field.type === "select" ? option : field.type === "dimension" ? numeric || option : numeric;
    if (!valid) throw new Error(`${path}: invalid ${field.key}`);
    Object.assign(result, { [field.key]: entry });
  }
  return result;
}

/** Only explicit box geometry changes inline text flow; a color/font edit must not. */
export function hasAppearanceBox(appearance?: NodeAppearance): boolean {
  return !!appearance && appearanceFields.some((field) => ["dimensions", "padding", "margin"].includes(field.group) && appearance[field.key] !== undefined);
}

/** Converts only validated, allowlisted data; never forwards arbitrary style keys. */
export function appearanceToStyle(appearance?: NodeAppearance): CSSProperties | undefined {
  if (appearance === undefined) return undefined;
  const value = parseAppearance(appearance);
  if (!Object.keys(value).length) return undefined;
  const style: CSSProperties = { boxSizing: "border-box" };
  for (const [key, entry] of Object.entries(value)) {
    if (key === "shadow") style.boxShadow = entry === "none" ? "none" : `var(--ds-shadow-${entry})`;
    else if (key === "background") style.backgroundColor = entry as string;
    else Object.assign(style, { [key]: entry === "fill" ? "100%" : entry === "hug" ? key === "height" ? "auto" : "fit-content" : entry });
  }
  // Explicit geometry wins over size-preset minimums, but not a local minimum.
  if (value.height !== undefined && value.minHeight === undefined) style.minHeight = 0;
  if (value.borderWidth !== undefined) style.borderStyle = "solid";
  return style;
}

export function mergeAppearanceStyle(style: CSSProperties | undefined, appearance?: NodeAppearance): CSSProperties | undefined;
export function mergeAppearanceStyle<State>(style: CSSProperties | ((state: State) => CSSProperties | undefined) | undefined, appearance?: NodeAppearance): CSSProperties | ((state: State) => CSSProperties | undefined) | undefined;
export function mergeAppearanceStyle<State>(style: CSSProperties | ((state: State) => CSSProperties | undefined) | undefined, appearance?: NodeAppearance) {
  const local = appearanceToStyle(appearance);
  if (!local) return style;
  return typeof style === "function" ? (state: State) => ({ ...style(state), ...local }) : { ...style, ...local };
}
