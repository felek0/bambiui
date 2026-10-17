import { editScopeLabel } from "./tool-scope.ts";
import { componentRecipeFields, componentRecipeVariables, type ComponentRecipeSelection } from "./component-recipes.ts";
import { appearanceStyleDraft } from "./appearance-field-ui.ts";
import { recipeEditTargets } from "./recipe-edit-scope.ts";
import { styleSourceInfo } from "./style-sources.ts";
import type { AppearanceField, AppearancePatch, NodeAppearance } from "./components/appearance.ts";
import type { ThemeTokens } from "./tokens.ts";

export const textToolKeys = ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "color"] as const;
export type TextToolKey = typeof textToolKeys[number];

/** Direct text tools exist only on text targets and only for fields the layer consumes. */
export function textToolFields(selection: ComponentRecipeSelection): readonly AppearanceField[] {
  if (selection.target !== "text") return [];
  return componentRecipeFields(selection.component, selection.part, "text", selection.recipe)
    .filter(field => (textToolKeys as readonly string[]).includes(field.key));
}

/** Stored value and provenance; the rendered value is shown separately and never copied into an override. */
export function textToolSource(theme: ThemeTokens, selection: ComponentRecipeSelection, field: AppearanceField) {
  const own = theme.componentRecipes?.[selection.component]?.[selection.recipe]?.[selection.part]?.[field.key];
  return {
    own, source: styleSourceInfo(theme, selection, field).current.label,
    resettable: recipeEditTargets(selection, field.key).some(peer => theme.componentRecipes?.[selection.component]?.[peer.key]?.[selection.part]?.[field.key] !== undefined),
  };
}

/** Typography follows the same-size (and Text variant) group in both themes; color is this combination in the active theme. */
export function textToolScope(selection: ComponentRecipeSelection, field: AppearanceField, themeLabel: string) {
  return editScopeLabel(selection, field.key, themeLabel);
}

/** Empty drafts are an error here: removing an override is the explicit Reset action, never a cleared field. */
export function textToolPatch(field: AppearanceField, text: string, baseline: string): { patch: AppearancePatch | null } | { error: string } {
  if (!text.trim()) return { error: "Enter a value. Use Reset to remove the override." };
  let patch: AppearancePatch;
  try { patch = appearanceStyleDraft(field, text); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid value." }; }
  const value = patch[field.key];
  const same = typeof value === "number" ? value === Number(baseline) && baseline.trim() !== "" : String(value).toLowerCase() === baseline.trim().toLowerCase();
  return { patch: same ? null : patch };
}

/** Label scrubbing: whole steps (font weight by 100), fine steps with Alt, clamped and fraction-preserving. */
export function textToolScrub(field: AppearanceField, initial: number, dx: number, fine = false) {
  const step = field.key === "fontWeight" ? 100 : field.key === "lineHeight" ? 0.05 : 1;
  const unit = fine && field.key !== "fontWeight" ? step / 10 : step;
  const steps = Math.trunc(dx / (field.key === "fontWeight" ? 12 : 2));
  const next = Number((initial + steps * unit).toFixed(6));
  return Math.min(field.max!, Math.max(field.min!, field.key === "fontWeight" ? Math.round(next) : next));
}

/** Preview through the same recipe variables the saved CSS uses. */
export function textToolPreviewVariables(theme: ThemeTokens, selection: ComponentRecipeSelection, values: Partial<NodeAppearance>) {
  return componentRecipeVariables({ [selection.component]: { [selection.recipe]: {
    [selection.part]: { ...theme.componentRecipes?.[selection.component]?.[selection.recipe]?.[selection.part], ...values },
  } } });
}
