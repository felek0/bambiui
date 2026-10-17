import { componentRecipeFields, type ComponentRecipeSelection } from "./component-recipes.ts";
import type { AppearanceField } from "./components/appearance.ts";

export type SpacingKind = "padding" | "margin";
export function spacingDragFields(selection: ComponentRecipeSelection, kind: SpacingKind) {
  return selection.target === "frame" ? componentRecipeFields(selection.component, selection.part, selection.target, selection.recipe).filter(field => field.group === kind) : [];
}

/** Keep the original fractional value; snap the gesture delta, not historical tokens. */
export function spacingDragValue(field: AppearanceField, initial: number, dx: number, dy: number, fine = false) {
  const horizontal = /Left|Right$/.test(field.key);
  const inward = /Top|Left$/.test(field.key) ? 1 : -1;
  const direction = field.group === "margin" ? -inward : inward;
  const delta = Math.round((horizontal ? dx : dy) * direction) * (fine ? 0.1 : 1);
  return Math.min(field.max!, Math.max(field.min!, initial + delta));
}
