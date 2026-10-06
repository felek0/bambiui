import type { CSSProperties } from "react";
import { mergeAppearanceStyle, type NodeAppearance } from "./appearance";
import {
  componentRecipeOptions, componentRecipeParts, componentRecipeSuffixes, recipeCSSValue,
  type ComponentRecipePart,
} from "./recipes";
import type { SharedComponentId, Size } from "./types";

const slug = (value: string) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/\./g, "-");
const textKeys = ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "color"] as const;

/** Pure indirections only; copied components never depend on a Studio theme/store. */
export function componentRecipeStyle(id: SharedComponentId, recipe: string): CSSProperties {
  if (!componentRecipeOptions(id).some(({ key }) => key === recipe)) throw new Error(`Unknown ${id} recipe: ${recipe}`);
  const result: Record<string, string> = {};
  for (const { key: part } of componentRecipeParts(id)) for (const suffix of componentRecipeSuffixes(id, part)) {
    result[`--${id}-active-part-${part}-${suffix}`] = `var(--${id}-recipe-${slug(recipe)}-${part}-${suffix}, var(--${id}-part-${part}-${suffix}))`;
  }
  if (id === "card") {
    // Slot typography deliberately excludes old componentStyles inheritance.
    for (const part of ["content", "footer"]) for (const key of textKeys) {
      result[`--card-scoped-${part}-${slug(key)}`] = `var(--card-recipe-${slug(recipe)}-${part}-${slug(key)})`;
    }
    // A nested Card is a new typography boundary, even inside another Card slot.
    for (const key of textKeys) result[`--ds-recipe-text-${slug(key)}`] = "initial";
  }
  return result as CSSProperties;
}

/**
 * CSS selects these candidates using Base UI's actual DOM states. This handles
 * uncontrolled/controlled changes, cancelled events and indeterminate without
 * a second React state machine or a server-to-client render callback. Native
 * form reset retains whatever state Base UI supplies; recipes do not own it.
 */
export function fieldRecipeStyle(id: "input" | "switch" | "checkbox", size: Size = "md"): CSSProperties {
  const result: Record<string, string> = {};
  const candidates = componentRecipeOptions(id).filter((option) => option.size === size);
  for (const { key: part } of componentRecipeParts(id)) for (const suffix of componentRecipeSuffixes(id, part)) {
    // CSS sets exactly one skip flag to initial (invalid), the rest to empty.
    // Only the selected fallback contributes a value. An absent recipe makes
    // this indirection invalid too, restoring the existing shared/token fallback.
    result[`--${id}-active-part-${part}-${suffix}`] = candidates.map((option) =>
      `var(--${id}-recipe-skip-${slug(option.variant)}, var(--${id}-recipe-${slug(option.key)}-${part}-${suffix}))`).join(" ");
  }
  return result as CSSProperties;
}

export function mergeRecipeStyle(id: SharedComponentId, recipe: string, style: CSSProperties | undefined, appearance?: NodeAppearance): CSSProperties;
export function mergeRecipeStyle<State>(id: SharedComponentId, recipe: string, style: CSSProperties | ((state: State) => CSSProperties | undefined) | undefined, appearance?: NodeAppearance): CSSProperties | ((state: State) => CSSProperties);
export function mergeRecipeStyle<State>(id: SharedComponentId, recipe: string, style: CSSProperties | ((state: State) => CSSProperties | undefined) | undefined, appearance?: NodeAppearance) {
  const active = componentRecipeStyle(id, recipe);
  const merge = (native?: CSSProperties): CSSProperties => {
    const local = mergeAppearanceStyle(native, appearance);
    const label: Record<string, string | number> = {};
    if (id === "button" || id === "badge") for (const key of textKeys) {
      const value = local?.[key];
      // Preserve root-local typography over the dedicated label's scoped styles.
      label[`--${id}-local-text-${slug(key)}`] = value === undefined ? "initial" : typeof value === "number" ? recipeCSSValue(key, value) : value;
    }
    return { ...active, ...label, ...local };
  };
  return typeof style === "function" ? (state: State) => merge(style(state)) : merge(style);
}

/** A slot's local typography and the child's own local appearance both beat recipes. */
export function cardSlotRecipeStyle(part: "content" | "footer", style: CSSProperties | undefined, appearance?: NodeAppearance): CSSProperties {
  const local = mergeAppearanceStyle(style, appearance);
  const scope: Record<string, string | number> = {};
  for (const key of textKeys) {
    const value = local?.[key];
    scope[`--ds-recipe-text-${slug(key)}`] = value === undefined ? `var(--card-scoped-${part}-${slug(key)})` : typeof value === "number" ? recipeCSSValue(key, value) : value;
  }
  return { ...scope, ...local };
}

export function componentRecipeMarkers(component: SharedComponentId, part: ComponentRecipePart, target?: "frame" | "text") {
  const definition = componentRecipeParts(component).find(({ key }) => key === part);
  if (!definition) throw new Error(`Unknown ${component} part: ${part}`);
  return { "data-ds-component": component, "data-component-part": part, "data-component-target": target ?? definition.target };
}


