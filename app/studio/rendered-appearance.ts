import type { AppearanceField } from "./components/appearance";
import type { ComponentRecipePart, SharedComponentId } from "./component-recipes";

export type RenderedAppearance = Record<string, string>;
export type CanvasAppearanceScope = {
  component: SharedComponentId;
  part: ComponentRecipePart;
  recipe?: string;
  target?: "frame" | "text";
};

const numberText = (value: number) => String(Number(value.toFixed(6)));

function colorText(value: string): string {
  if (value === "transparent") return value;
  const rgb = /^rgba?\((.+)\)$/.exec(value);
  const srgb = /^color\(srgb\s+(.+)\)$/.exec(value);
  if (!rgb && !srgb) return value;
  const channels = (rgb?.[1] ?? srgb![1]).split(/[\s,/]+/).filter(Boolean);
  const alpha = channels[3] === undefined ? 1 : parseFloat(channels[3]) / (channels[3].endsWith("%") ? 100 : 1);
  if (alpha === 0) return "transparent";
  if (alpha !== 1) return value;
  const values = channels.slice(0, 3).map(channel => channel.endsWith("%") ? parseFloat(channel) / 100 * 255 : parseFloat(channel) * (srgb ? 255 : 1));
  return values.length === 3 && values.every(Number.isFinite)
    ? "#" + values.map(channel => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("") : value;
}

/** Display-only conversion. Never turn these measurements into stored overrides. */
export function appearanceValuesFromStyle(style: CSSStyleDeclaration, fields: readonly AppearanceField[]): RenderedAppearance {
  const values: RenderedAppearance = {};
  for (const field of fields) {
    const property = field.key === "background" ? "backgroundColor" : field.key === "shadow" ? "boxShadow" : field.key;
    let value = style[property as keyof CSSStyleDeclaration];
    if (typeof value !== "string" || !value) continue;
    if (field.type === "color") value = colorText(value);
    else if (field.key === "textAlign" && (value === "start" || value === "end")) {
      value = (value === "start") !== (style.direction === "rtl") ? "left" : "right";
    } else if (field.key === "lineHeight" && value.endsWith("px")) {
      const fontSize = parseFloat(style.fontSize);
      if (fontSize > 0) value = numberText(parseFloat(value) / fontSize);
    } else if ((field.key === "letterSpacing" || field.key === "gap") && value === "normal") value = "0";
    else if ((field.type === "number" || field.type === "dimension") && /^-?[\d.]+px$/.test(value)) value = numberText(parseFloat(value));
    values[field.key] = value;
  }
  return values;
}

export function readRenderedAppearance(elements: readonly Element[], fields: readonly AppearanceField[]): RenderedAppearance {
  const styles = elements.map(element => appearanceValuesFromStyle(getComputedStyle(element), fields));
  const result: RenderedAppearance = {};
  for (const { key } of fields) {
    const values = styles.map(style => style[key]).filter((value): value is string => value !== undefined);
    if (values.length) result[key] = values.every(value => value === values[0]) ? values[0] : "Mixed";
  }
  return result;
}

export function readCanvasAppearance(scope: CanvasAppearanceScope, fields: readonly AppearanceField[]): RenderedAppearance {
  const values = readRenderedAppearance(canvasAppearanceElements(scope), fields);
  // Shared Input control styles have a painted shell, but native input typography.
  if (scope.component === "input" && scope.part === "control" && !scope.target) {
    Object.assign(values, readRenderedAppearance(canvasAppearanceElements({ ...scope, target: "text" }), fields.filter(field => field.group === "typography")));
  }
  return values;
}

/** Use the same frame/text anatomy as canvas hit selection, including Card-owned descendants. */
export function canvasAppearanceElements(scope: CanvasAppearanceScope): Element[] {
  const matrix = document.querySelector(`[data-component-matrix="${scope.component}"]`);
  if (!matrix) return [];
  const examples = scope.recipe
    ? Array.from(matrix.querySelectorAll<HTMLElement>("[data-recipe-example]")).filter(example => example.dataset.recipeExample === scope.recipe)
    : Array.from(matrix.querySelectorAll<HTMLElement>("[data-recipe-example]"));
  return examples.flatMap(example => {
    const parts = Array.from(example.querySelectorAll<HTMLElement>(`[data-ds-component="${scope.component}"][data-component-part="${scope.part}"]`));
    const part = parts.find(element => scope.target && element.dataset.componentTarget === scope.target) ?? parts[0];
    if (!part) return [];
    if (scope.component === "card" && scope.target === "text" && ["content", "footer"].includes(scope.part)) {
      return Array.from(part.querySelectorAll('[data-component-target="text"]'));
    }
    return [part];
  });
}
