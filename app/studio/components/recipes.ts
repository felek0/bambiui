import type { NodeAppearance } from "./appearance";
import type { ComponentStylePart, SharedComponentId, Size } from "./types";

export type { SharedComponentId } from "./types";
export type ComponentRecipePart = ComponentStylePart | "text";
export type ComponentRecipeSelection = {
  component: SharedComponentId;
  recipe: string;
  part: ComponentRecipePart;
  target: "frame" | "text";
};
export type ComponentRecipes = Partial<Record<SharedComponentId, Record<string, Partial<Record<ComponentRecipePart, NodeAppearance>>>>>;
export type ComponentRecipeOption = {
  key: string;
  label: string;
  variant: string;
  size: Size;
  tone?: string;
  props: Record<string, string | boolean>;
};
export type ComponentRecipePartOption = {
  key: ComponentRecipePart;
  label: string;
  /** Default hit target; some parts also support the other target. */
  target: ComponentRecipeSelection["target"];
};

const sizes = ["sm", "md", "lg"] as const;
const tones = ["neutral", "primary", "success", "warning", "danger", "info"] as const;
export const componentRecipeIds: readonly SharedComponentId[] = Object.freeze(["button", "input", "switch", "checkbox", "badge", "card", "text"]);
const variants: Record<SharedComponentId, readonly string[]> = {
  button: ["primary", "secondary", "outline", "ghost", "destructive", "link"],
  input: ["default", "invalid", "readonly"],
  switch: ["checked", "unchecked", "invalidChecked", "invalidUnchecked"],
  checkbox: ["checked", "unchecked", "invalidChecked", "invalidUnchecked"],
  badge: ["solid", "subtle", "outline"],
  card: ["outlined", "elevated", "filled"],
  text: ["heading", "h1", "h2", "h3", "h4", "h5", "h6", "paragraph", "label", "caption"],
};
const slug = (value: string) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/\./g, "-");
const title = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
const options: Record<SharedComponentId, ComponentRecipeOption[]> = { button: [], input: [], switch: [], checkbox: [], badge: [], card: [], text: [] };
// ES2017-compatible because these sources are copied into standalone consumers.
for (const id of componentRecipeIds) for (const variant of variants[id]) {
  for (const tone of id === "badge" || id === "text" ? tones : [undefined]) for (const size of sizes) {
    const props: ComponentRecipeOption["props"] = { size };
    if (id === "input") {
      if (variant === "invalid") props.error = "Invalid value";
      if (variant === "readonly") props.readOnly = true;
    } else if (id === "switch" || id === "checkbox") {
      // Uncontrolled examples remain real controls; transitions select the new recipe.
      props.defaultChecked = variant === "checked" || variant === "invalidChecked";
      if (variant.startsWith("invalid")) props.error = "Invalid value";
    } else props.variant = variant;
    if (tone) props.tone = tone;
    options[id].push(Object.freeze({ key: [variant, tone, size].filter(Boolean).join("."), label: [title(variant), tone && title(tone), size.toUpperCase()].filter(Boolean).join(" / "), variant, size, ...(tone ? { tone } : {}), props: Object.freeze(props) }));
  }
}
for (const list of Object.values(options)) Object.freeze(list);

const frame = (key: ComponentRecipePart, label: string): ComponentRecipePartOption => ({ key, label, target: "frame" });
const text = (key: ComponentRecipePart, label: string): ComponentRecipePartOption => ({ key, label, target: "text" });
const fieldParts = [frame("root", "Field"), text("label", "Label"), frame("control", "Control"), text("description", "Description"), text("error", "Error")];
const choiceParts = [fieldParts[0], frame("row", "Label / control row"), ...fieldParts.slice(1)];
const parts: Record<SharedComponentId, readonly ComponentRecipePartOption[]> = {
  button: [frame("root", "Button"), text("text", "Label")],
  input: fieldParts,
  switch: choiceParts,
  checkbox: choiceParts,
  badge: [frame("root", "Badge"), text("text", "Label")],
  card: [frame("root", "Card"), frame("header", "Header"), text("title", "Title"), text("description", "Description"), frame("content", "Content"), frame("footer", "Footer"), frame("icon", "Icon")],
  text: [text("root", "Text")],
};

export function componentRecipeOptions(id: SharedComponentId): readonly ComponentRecipeOption[] {
  return Object.prototype.hasOwnProperty.call(options, id) ? options[id] : [];
}
/** Omit recipe for the union anatomy; unknown recipes have no editable parts. */
export function componentRecipeParts(id: SharedComponentId, recipe?: string): readonly ComponentRecipePartOption[] {
  if (!Object.prototype.hasOwnProperty.call(parts, id)) return [];
  const option = recipe === undefined ? undefined : componentRecipeOptions(id).find(({ key }) => key === recipe);
  if (recipe !== undefined && !option) return [];
  // FieldRoot always marks an error invalid; only Input readonly takes precedence.
  return parts[id].filter(({ key }) => key !== "error" || !option || componentRecipeKey(id, { ...option.props, error: true }) === recipe).map((part) => ({ ...part }));
}

// Only keys live here: bounds/units/validation remain in the appearance catalog.
const frameKeys: readonly (keyof NodeAppearance)[] = [
  "width", "height", "minWidth", "minHeight", "maxWidth",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "marginTop", "marginRight", "marginBottom", "marginLeft",
  "borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius",
  "gap", "background", "borderColor", "borderWidth", "shadow", "opacity",
];
const textKeys: readonly (keyof NodeAppearance)[] = ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "color"];

/** Frame and text share a part record, but never an editable field. No focus CSS. */
export function componentRecipeFieldKeys(id: SharedComponentId, part: ComponentRecipePart, target: "frame" | "text", recipe?: string): readonly (keyof NodeAppearance)[] {
  const definition = componentRecipeParts(id, recipe).find(({ key }) => key === part);
  if (!definition || (target !== "frame" && target !== "text")) return [];
  if (target === "text") {
    const inkOnly = (id === "switch" || id === "checkbox") && part === "control" || id === "card" && part === "icon";
    const supportsText = definition.target === "text" || id === "input" && part === "control" || id === "card" && ["content", "footer"].includes(part);
    return inkOnly ? ["color"] : supportsText ? [...textKeys] : [];
  }
  if (part === "text") return [];
  const gap = ["root", "header", "content", "footer", "row", "error"].includes(part) && id !== "text" || id === "input" && part === "control";
  return frameKeys.filter((key) => key !== "gap" || gap);
}

export function recipeCSSValue(key: keyof NodeAppearance, value: NonNullable<NodeAppearance[keyof NodeAppearance]>): string {
  return key === "shadow" ? value === "none" ? "none" : `var(--ds-shadow-${value})`
    : typeof value === "number" ? `${value}${["fontWeight", "lineHeight", "opacity"].includes(key) ? "" : "px"}`
    : value === "fill" ? "100%" : value === "hug" ? key === "height" ? "auto" : "fit-content" : value;
}

export type ComponentRecipeProps = {
  variant?: string; size?: Size; tone?: string; readOnly?: boolean;
  invalid?: boolean; error?: unknown; checked?: boolean; defaultChecked?: boolean; indeterminate?: boolean;
};
/** Actual props/state -> catalog key. Readonly wins over invalid, matching Input CSS. */
export function componentRecipeKey(id: SharedComponentId, props: ComponentRecipeProps = {}): string {
  const size = props.size ?? "md";
  const invalid = props.invalid || !!props.error;
  const checked = props.indeterminate || (props.checked ?? props.defaultChecked ?? false);
  const variant = id === "input" ? props.readOnly ? "readonly" : invalid ? "invalid" : "default"
    : id === "switch" || id === "checkbox" ? invalid ? checked ? "invalidChecked" : "invalidUnchecked" : checked ? "checked" : "unchecked"
    : props.variant ?? ({ button: "primary", badge: "outline", card: "outlined", text: "paragraph" } as const)[id];
  const key = [variant, id === "badge" || id === "text" ? props.tone ?? "neutral" : undefined, size].filter(Boolean).join(".");
  if (!componentRecipeOptions(id).some((option) => option.key === key)) throw new Error(`componentRecipes.${id}: unknown recipe ${key}`);
  return key;
}

/** Implementation suffixes used by recipe indirections and CSS (not editable fields). */
export function componentRecipeSuffixes(id: SharedComponentId, part: ComponentRecipePart): readonly string[] {
  return [...componentRecipeFieldKeys(id, part, "frame"), ...componentRecipeFieldKeys(id, part, "text")].map(slug).concat(
    part !== "text" ? ["box-sizing", "border-style"] : [],
    id === "text" || id === "card" && part === "title" ? ["box-display"] : [],
    (id === "button" || id === "badge") && part === "text" ? ["content-display"] : [],
    id === "input" && part === "control" ? ["inner-padding-top", "inner-padding-bottom"] : [],
    id === "switch" && part === "control" ? ["thumb-transform", "thumb-margin"] : [],
  );
}

/**
 * Optional editor hit helper. Pass the System component to keep nested components
 * in that specimen's scope (e.g. Card.Content > Text, Card.Footer > Button).
 * Fields read live state attributes, not stale initial/defaultChecked props.
 * No DOM globals are accessed until called, so importing this catalog is SSR-safe.
 */
export function componentRecipeSelectionFromElement(element: Element | null, component?: SharedComponentId): ComponentRecipeSelection | null {
  if (!element || component && !componentRecipeParts(component).length) return null;
  const hit = element.closest("[data-ds-component][data-component-part]");
  if (!hit) return null;
  const isText = hit.getAttribute("data-component-target") === "text";
  const cardPart = hit.closest('[data-ds-component="card"][data-component-part]');
  const cardSlot = isText && ["content", "footer"].includes(cardPart?.getAttribute("data-component-part") ?? "") ? cardPart : null;
  const selected = component ? hit.closest(`[data-ds-component="${component}"][data-component-part]`) : cardSlot ?? hit;
  if (!selected) return null;
  const id = selected.getAttribute("data-ds-component") as SharedComponentId;
  const part = selected.getAttribute("data-component-part") as ComponentRecipePart;
  if (!componentRecipeParts(id).some(({ key }) => key === part)) return null;
  const root = selected.closest(`[data-ds-component="${id}"][data-component-part="root"]`);
  if (!root) return null;
  const target = isText && componentRecipeFieldKeys(id, part, "text").length ? "text" : selected.getAttribute("data-component-target") === "text" ? "text" : "frame";
  const control = root.querySelector(`[data-ds-component="${id}"][data-component-part="control"]`);
  const nativeInput = id === "input" ? control?.querySelector("input") : null;
  const recipe = componentRecipeKey(id, {
    variant: root.getAttribute("data-variant") ?? undefined,
    tone: root.getAttribute("data-tone") ?? undefined,
    size: (root.getAttribute("data-size") ?? "md") as Size,
    readOnly: nativeInput?.hasAttribute("readonly"),
    invalid: root.hasAttribute("data-invalid") || !!control?.hasAttribute("data-invalid") || nativeInput?.getAttribute("aria-invalid") === "true",
    checked: control?.hasAttribute("data-checked"),
    indeterminate: control?.hasAttribute("data-indeterminate"),
  });
  return componentRecipeFieldKeys(id, part, target, recipe).length ? { component: id, recipe, part, target } : null;
}
