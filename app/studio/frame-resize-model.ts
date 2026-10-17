import { componentRecipeVariables, type ComponentRecipeSelection } from "./component-recipes.ts";
import type { ThemeTokens } from "./tokens.ts";
import type { SizeAxis } from "./frame-size-model.ts";

/** Preserve authored fractions only when layout has not materially constrained the size. */
export function resizeInitial(rendered: number, authored: number | "hug" | "fill" | undefined) {
  return typeof authored === "number" && Math.abs(authored - rendered) < 0.02 ? authored : rendered;
}
export function resizeValue(initial: number, delta: number, fine = false) {
  if (!delta) return initial;
  return Math.min(10000, Math.max(0, initial + Math.round(delta) * (fine ? 0.1 : 1)));
}

/** Preview uses the same generated recipe helpers as saved CSS, not an inline width approximation. */
export function resizePreviewVariables(theme: ThemeTokens, selection: ComponentRecipeSelection, values: Partial<Record<SizeAxis, number>>) {
  return componentRecipeVariables({ [selection.component]: { [selection.recipe]: {
    [selection.part]: { ...theme.componentRecipes?.[selection.component]?.[selection.recipe]?.[selection.part], ...values },
  } } });
}

/** A corner gesture fixes only the axes whose value actually changed; an untouched axis keeps Hug/Fill/defaults. */
export function resizeCornerPatch(initial: Record<SizeAxis, number>, value: Record<SizeAxis, number>) {
  const patch: Partial<Record<SizeAxis, number>> = {};
  for (const axis of ["width", "height"] as const) if (value[axis] !== initial[axis]) patch[axis] = value[axis];
  return Object.keys(patch).length ? patch : null;
}
