import { componentRecipeFields, type ComponentRecipeSelection } from "./component-recipes.ts";
import type { AppearanceField, AppearancePatch } from "./components/appearance.ts";

export type SpacingKind = "padding" | "margin" | "radius" | "layout";
/** Linking changes the next edit, never historical values on its own. */
export function spacingEditPatch(fields: readonly AppearanceField[], field: AppearanceField, initial: number, value: number, linked = false): AppearancePatch | null {
  if (value === initial || !Number.isFinite(value) || !fields.some(candidate => candidate.key === field.key)) return null;
  const affected = linked && field.group === "radius" ? fields.filter(candidate => candidate.group === "radius") : [field];
  if (affected.some(candidate => value < candidate.min! || value > candidate.max!)) return null;
  return Object.fromEntries(affected.map(candidate => [candidate.key, value]));
}

export function spacingDragFields(selection: ComponentRecipeSelection, kind: SpacingKind) {
  return selection.target === "frame" ? componentRecipeFields(selection.component, selection.part, selection.target, selection.recipe).filter(field => field.group === kind) : [];
}

/** Keep the original fractional value; snap the gesture delta, not historical tokens. */
export function spacingDragValue(field: AppearanceField, initial: number, dx: number, dy: number, fine = false, axis: "x" | "y" = "x") {
  if (field.group === "layout") {
    const delta = Math.round(axis === "x" ? dx : dy) * (fine ? 0.1 : 1);
    return Math.min(field.max!, Math.max(field.min!, initial + delta));
  }
  if (field.group === "radius") {
    const inwardX = field.key.includes("Left") ? dx : -dx;
    const inwardY = field.key.includes("Top") ? dy : -dy;
    const delta = Math.round((inwardX + inwardY) / 2) * (fine ? 0.1 : 1);
    return Math.min(field.max!, Math.max(field.min!, initial + delta));
  }
  const horizontal = /Left|Right$/.test(field.key);
  const inward = /Top|Left$/.test(field.key) ? 1 : -1;
  const direction = field.group === "margin" ? -inward : inward;
  const delta = Math.round((horizontal ? dx : dy) * direction) * (fine ? 0.1 : 1);
  return Math.min(field.max!, Math.max(field.min!, initial + delta));
}
