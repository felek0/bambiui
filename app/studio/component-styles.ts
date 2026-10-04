import {
  appearanceFields,
  appearanceRecord,
  hasAppearanceBox,
  parseAppearance,
  type AppearanceField,
  type NodeAppearance,
} from "./components/appearance.ts";

export type SharedComponentId = "button" | "input" | "switch" | "checkbox" | "badge" | "card" | "text";
export type ComponentStylePart = "root" | "control" | "row" | "label" | "description" | "error" | "header" | "title" | "content" | "footer" | "icon";
export type ComponentStyles = Partial<Record<SharedComponentId, Partial<Record<ComponentStylePart, NodeAppearance>>>>;

type Part = { key: ComponentStylePart; label: string; fields: readonly AppearanceField[] };
const variantPaint = new Set<keyof NodeAppearance>(["background", "color", "borderColor", "borderWidth", "shadow"]);
const colors = new Set<keyof NodeAppearance>(["background", "color", "borderColor"]);

// Keep this allowlist in step with the real consumers in components.module.css.
function fields({ paint = true, gap = false, choice = false } = {}): readonly AppearanceField[] {
  return appearanceFields.filter((field) =>
    (paint || !variantPaint.has(field.key)) &&
    (gap || field.key !== "gap") &&
    (!choice || field.group !== "typography" || field.key === "fontSize"));
}
const geometry = fields({ paint: false, gap: true });
const surface = fields();
const layout = fields({ gap: true });
const choiceControl = fields({ paint: false, choice: true });
const fieldParts: readonly Part[] = [
  { key: "root", label: "Field", fields: geometry },
  { key: "label", label: "Label", fields: surface },
  { key: "control", label: "Control", fields: geometry },
  { key: "description", label: "Description", fields: surface },
  { key: "error", label: "Error", fields: layout },
];
const choiceParts: readonly Part[] = [
  fieldParts[0],
  { key: "row", label: "Label / control row", fields: layout },
  fieldParts[1],
  { key: "control", label: "Control", fields: choiceControl },
  fieldParts[3],
  fieldParts[4],
];
const parts: Record<SharedComponentId, readonly Part[]> = {
  button: [{ key: "root", label: "Button", fields: geometry }],
  input: fieldParts,
  switch: choiceParts,
  checkbox: choiceParts,
  badge: [{ key: "root", label: "Badge", fields: geometry }],
  card: [
    { key: "root", label: "Card", fields: geometry },
    { key: "header", label: "Header", fields: layout },
    { key: "title", label: "Title", fields: surface },
    { key: "description", label: "Description", fields: surface },
    { key: "content", label: "Content", fields: layout },
    { key: "footer", label: "Footer", fields: layout },
    { key: "icon", label: "Icon", fields: surface },
  ],
  text: [{ key: "root", label: "Text", fields: surface }],
};
const ids = Object.keys(parts) as SharedComponentId[];

export function componentStyleParts(id: SharedComponentId): readonly { key: ComponentStylePart; label: string }[] {
  return Object.hasOwn(parts, id) ? parts[id].map(({ key, label }) => ({ key, label })) : [];
}

export function componentStyleFields(id: SharedComponentId, part: ComponentStylePart): readonly AppearanceField[] {
  return Object.hasOwn(parts, id) ? parts[id].find((entry) => entry.key === part)?.fields ?? [] : [];
}

/** Strict serialized data only. Empty records are pruned; no defaults or rounding. */
export function parseComponentStyles(value: unknown): ComponentStyles {
  const raw = appearanceRecord(value, "componentStyles");
  for (const id of Object.keys(raw)) if (!Object.hasOwn(parts, id)) throw new Error(`componentStyles: unknown component ${id}`);
  const result: ComponentStyles = {};
  for (const id of ids) {
    if (!Object.hasOwn(raw, id)) continue;
    const entry = appearanceRecord(raw[id], `componentStyles.${id}`);
    for (const part of Object.keys(entry)) if (!parts[id].some(({ key }) => key === part)) throw new Error(`componentStyles.${id}: unknown part ${part}`);
    for (const { key, fields } of parts[id]) {
      if (!Object.hasOwn(entry, key)) continue;
      const appearance = parseAppearance(entry[key], fields, `componentStyles.${id}.${key}`);
      if (Object.keys(appearance).length) (result[id] ??= {})[key] = appearance;
    }
  }
  return result;
}

/** Source owns shared geometry/effects, including deletions; target owns its colors. */
export function shareComponentStyles(source?: ComponentStyles, target?: ComponentStyles): ComponentStyles {
  const from = parseComponentStyles(source === undefined ? {} : source);
  const into = parseComponentStyles(target === undefined ? {} : target);
  const result: ComponentStyles = {};
  for (const id of ids) for (const { key: part, fields } of parts[id]) {
    const appearance: NodeAppearance = {};
    for (const { key } of fields) {
      const value = (colors.has(key) ? into : from)[id]?.[part]?.[key];
      if (value !== undefined) Object.assign(appearance, { [key]: value });
    }
    if (Object.keys(appearance).length) (result[id] ??= {})[part] = appearance;
  }
  return result;
}

export function componentStyleVariable(id: SharedComponentId, part: ComponentStylePart, key: keyof NodeAppearance): string {
  if (!componentStyleFields(id, part).some((field) => field.key === key)) throw new Error(`componentStyles.${id}.${part}: unsupported field ${key}`);
  return `--${id}-part-${part}-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/**
 * Sparse authored variables plus CSS-only implementation helpers. Helpers are not
 * authorable fields: they activate boxes/alignment only when needed, so old CSS
 * and copied component sources need neither defaults nor a runtime studio import.
 */
export function componentStyleVariables(styles?: ComponentStyles): Record<string, string> {
  const parsed = parseComponentStyles(styles === undefined ? {} : styles);
  const variables: Record<string, string> = {};
  for (const id of ids) for (const { key: part, fields } of parts[id]) {
    const appearance = parsed[id]?.[part];
    if (!appearance) continue;
    const prefix = `--${id}-part-${part}`;
    variables[`${prefix}-box-sizing`] = "border-box";
    if (appearance.borderWidth !== undefined) variables[`${prefix}-border-style`] = "solid";
    for (const { key } of fields) {
      const value = appearance[key];
      if (value === undefined) continue;
      variables[componentStyleVariable(id, part, key)] = key === "shadow" ? value === "none" ? "none" : `var(--ds-shadow-${value})`
        : typeof value === "number" ? `${value}${["fontWeight", "lineHeight", "opacity"].includes(key) ? "" : "px"}`
        : value === "fill" ? "100%" : value === "hug" ? key === "height" ? "auto" : "fit-content" : value;
    }
    // Match local appearance: an explicit height is not clamped by the size preset.
    if (appearance.height !== undefined && appearance.minHeight === undefined) variables[`${prefix}-min-height`] = "0px";
    if ((id === "text" || id === "card" && part === "title") && hasAppearanceBox(appearance)) variables[`${prefix}-box-display`] = "inline-block";
    if ((id === "button" || id === "badge") && appearance.textAlign !== undefined) variables[`${prefix}-content-display`] = "block";
    if (id === "input" && part === "control") {
      if (appearance.paddingTop !== undefined) variables[`${prefix}-inner-padding-top`] = "0px";
      if (appearance.paddingBottom !== undefined) variables[`${prefix}-inner-padding-bottom`] = "0px";
    }
    if (id === "switch" && part === "control" && hasAppearanceBox(appearance)) {
      variables[`${prefix}-thumb-transform`] = "none";
      variables[`${prefix}-thumb-margin`] = "auto";
    }
  }
  return variables;
}
