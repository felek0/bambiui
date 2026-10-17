import { componentRecipeFields, type ComponentRecipeSelection } from "./component-recipes.ts";
import { componentStyleParts } from "./component-styles.ts";
import { recipeEditTargets } from "./recipe-edit-scope.ts";
import { styleSourceInfo } from "./style-sources.ts";
import { spacingNumericValue } from "./spacing-numeric-draft.ts";
import type { ThemeTokens } from "./tokens.ts";
import type { AppearanceField, AppearancePatch } from "./components/appearance.ts";

export type SizeAxis = "width" | "height";
export type SizeMode = "default" | "hug" | "fill" | "fixed";
export const frameSizeFields = (selection: ComponentRecipeSelection) => componentRecipeFields(selection.component, selection.part, selection.target, selection.recipe).filter(field => field.key === "width" || field.key === "height");

/** Stored declarations describe intent; layout pixels only describe the rendered result. */
export function frameSizeSource(theme: ThemeTokens, selection: ComponentRecipeSelection, field: AppearanceField) {
  const axis = field.key as SizeAxis;
  const own = theme.componentRecipes?.[selection.component]?.[selection.recipe]?.[selection.part]?.[axis];
  const source = styleSourceInfo(theme, selection, field).current;
  const sharedPart = componentStyleParts(selection.component).find(part => part.key === selection.part)?.key;
  const shared = source.kind === "shared" && sharedPart ? theme.componentStyles?.[selection.component]?.[sharedPart]?.[axis] : undefined;
  const effective = own ?? shared;
  return {
    own, effective, source: source.label,
    mode: (own === undefined ? "default" : typeof own === "number" ? "fixed" : own) as SizeMode,
    resettable: recipeEditTargets(selection, axis).some(peer => theme.componentRecipes?.[selection.component]?.[peer.key]?.[selection.part]?.[axis] !== undefined),
  };
}

export function frameSizePatch(field: AppearanceField, own: number | "hug" | "fill" | undefined, mode: SizeMode, text: string): AppearancePatch | null {
  if (field.key !== "width" && field.key !== "height") throw new Error("Unsupported size axis");
  const value = mode === "fixed" ? spacingNumericValue(text, field) : mode === "default" ? undefined : mode;
  if (value === null || value === own) return null;
  return { [field.key]: value === undefined ? null : value };
}
