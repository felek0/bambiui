import {
  componentRecipeFields, componentRecipeOptions, componentRecipeParts, parseComponentRecipes,
  type ComponentRecipeOption, type ComponentRecipeSelection, type ComponentRecipes,
} from "./component-recipes.ts";
import { appearanceRecord, type AppearancePatch, type NodeAppearance } from "./components/appearance.ts";

const colors = new Set<keyof NodeAppearance>(["background", "color", "borderColor"]);

function selectedOption(selection: ComponentRecipeSelection): ComponentRecipeOption {
  const { component, recipe, part, target } = selection;
  const option = componentRecipeOptions(component).find(({ key }) => key === recipe);
  if (!option) throw new Error(`recipe edit: unknown recipe ${component}.${recipe}`);
  if (!componentRecipeParts(component, recipe).some(({ key }) => key === part)) throw new Error(`recipe edit: unknown part ${part}`);
  if (!componentRecipeFields(component, part, target, recipe).length) throw new Error(`recipe edit: unsupported target ${target}`);
  return option;
}

/** Studio edit policy only; persisted recipes and standalone runtime keep exact scopes. */
export function recipeEditTargets(selection: ComponentRecipeSelection, key: keyof NodeAppearance): readonly ComponentRecipeOption[] {
  const selected = selectedOption(selection);
  const { component, part, target } = selection;
  if (!componentRecipeFields(component, part, target, selected.key).some((field) => field.key === key)) {
    throw new Error(`recipe edit: unknown or unsupported key ${key}`);
  }
  if (colors.has(key)) return [selected];
  return componentRecipeOptions(component).filter((option) => option.size === selected.size
    && (component !== "text" || option.variant === selected.variant)
    && componentRecipeFields(component, part, target, option.key).some((field) => field.key === key));
}

/** Null removes only the requested fields; all validation finishes before any authored data changes. */
export function applyScopedRecipePatch(recipes: ComponentRecipes | undefined, selection: ComponentRecipeSelection, patch: AppearancePatch): ComponentRecipes {
  selectedOption(selection);
  const raw = appearanceRecord(patch, "recipe edit patch");
  const edits = Object.entries(raw).map(([key, value]) => ({
    key: key as keyof NodeAppearance, value,
    targets: recipeEditTargets(selection, key as keyof NodeAppearance),
  }));
  const { component, recipe, part } = selection;
  // Validate even an unchanged value (including explicitly supplied undefined).
  const values = Object.fromEntries(edits.filter(({ value }) => value !== null).map(({ key, value }) => [key, value]));
  parseComponentRecipes({ [component]: { [recipe]: { [part]: values } } });
  const changed = edits.some(({ key, value, targets }) => targets.some(({ key: peer }) => {
    const current = recipes?.[component]?.[peer]?.[part];
    return value === null ? !!current && Object.hasOwn(current, key) : current?.[key] !== value;
  }));
  if (!changed) return recipes ?? {};

  const result: ComponentRecipes = structuredClone(recipes ?? {});
  for (const { key, value, targets } of edits) for (const { key: peer } of targets) {
    if (value === null) {
      const entry = result[component]?.[peer];
      const appearance = entry?.[part];
      if (!appearance) continue;
      delete appearance[key];
      if (!Object.keys(appearance).length) delete entry![part];
      if (!Object.keys(entry!).length) delete result[component]![peer];
      if (!Object.keys(result[component]!).length) delete result[component];
    } else {
      const appearance = ((result[component] ??= {})[peer] ??= {})[part] ??= {};
      Object.assign(appearance, { [key]: value });
    }
  }
  return parseComponentRecipes(result);
}
