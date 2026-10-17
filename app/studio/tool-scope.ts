import { componentRecipeFields, componentRecipeOptions, componentRecipeParts, type ComponentRecipeSelection } from "./component-recipes.ts";
import { recipeEditTargets } from "./recipe-edit-scope.ts";
import type { AppearancePatch, NodeAppearance } from "./components/appearance.ts";
import type { ThemeTokens } from "./tokens.ts";

const colors = new Set<keyof NodeAppearance>(["background", "color", "borderColor"]);

/** The write scope of one field, in the words every direct tool uses. */
export function editScopeLabel(selection: ComponentRecipeSelection, key: keyof NodeAppearance, themeLabel: string) {
  if (colors.has(key)) return `This combination · ${themeLabel} only`;
  const count = recipeEditTargets(selection, key).length;
  const size = componentRecipeOptions(selection.component).find(option => option.key === selection.recipe)?.size;
  return `${count} ${count === 1 ? "combination" : "combinations"} at ${size ?? "this size"} · both themes`;
}

/** A group reset is available when any combination it would write holds one of the keys. */
export function groupResettable(theme: ThemeTokens, selection: ComponentRecipeSelection, keys: readonly (keyof NodeAppearance)[]) {
  return keys.some(key => recipeEditTargets(selection, key).some(peer => theme.componentRecipes?.[selection.component]?.[peer.key]?.[selection.part]?.[key] !== undefined));
}

/** Reset removes overrides only; it never copies inherited values into the record. */
export function groupResetPatch(keys: readonly (keyof NodeAppearance)[]): AppearancePatch {
  return Object.fromEntries(keys.map(key => [key, null]));
}

/** WAI-ARIA toolbar: arrows/Home/End move focus between enabled buttons; returns whether the key was used. */
export function rovingIndex(key: string, index: number, count: number): number | null {
  if (!count) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Frame → Text: the same layer's text target, else (for a root frame) the component's only text layer, e.g. the Button label. */
export function textTargetFor(selection: ComponentRecipeSelection): ComponentRecipeSelection | null {
  const { component, recipe, part } = selection;
  if (componentRecipeFields(component, part, "text", recipe).length) return { ...selection, target: "text" };
  if (part !== "root") return null;
  const texts = componentRecipeParts(component, recipe).filter(entry => entry.target === "text");
  return texts.length === 1 ? { component, recipe, part: texts[0].key, target: "text" } : null;
}
