import {
  appearanceFields, appearanceRecord, hasAppearanceBox, parseAppearance,
  type AppearanceField, type NodeAppearance,
} from "./components/appearance.ts";
import {
  componentRecipeIds, componentRecipeOptions, componentRecipeParts, componentRecipeFieldKeys,
  recipeCSSValue, type SharedComponentId, type ComponentRecipePart, type ComponentRecipes,
} from "./components/recipes.ts";

export {
  componentRecipeIds, componentRecipeOptions, componentRecipeParts, componentRecipeKey,
  componentRecipeSelectionFromElement,
  type SharedComponentId, type ComponentRecipePart, type ComponentRecipeSelection,
  type ComponentRecipes, type ComponentRecipeOption, type ComponentRecipePartOption, type ComponentRecipeProps,
} from "./components/recipes.ts";

const colors = new Set<keyof NodeAppearance>(["background", "color", "borderColor"]);
const slug = (value: string) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replaceAll(".", "-");

/** Text edits typography/ink; frames edit geometry/layout/surface. Unavailable recipe parts have no fields. */
export function componentRecipeFields(id: SharedComponentId, part: ComponentRecipePart, target: "frame" | "text", recipe?: string): readonly AppearanceField[] {
  const keys = componentRecipeFieldKeys(id, part, target, recipe);
  return appearanceFields.filter((field) => keys.includes(field.key));
}
function allFields(id: SharedComponentId, part: ComponentRecipePart, recipe: string): readonly AppearanceField[] {
  const keys = [...componentRecipeFieldKeys(id, part, "frame", recipe), ...componentRecipeFieldKeys(id, part, "text", recipe)];
  return appearanceFields.filter((field) => keys.includes(field.key));
}
function requireRecipe(id: SharedComponentId, recipe: string): void {
  if (!componentRecipeOptions(id).some(({ key }) => key === recipe)) throw new Error(`componentRecipes.${id}: unknown recipe ${recipe}`);
}

/** Exact keys only: no aliases, partial variant scopes, coercion, or step rounding. */
export function parseComponentRecipes(value: unknown): ComponentRecipes {
  const raw = appearanceRecord(value, "componentRecipes");
  for (const id of Object.keys(raw)) if (!componentRecipeIds.includes(id as SharedComponentId)) throw new Error(`componentRecipes: unknown component ${id}`);
  const result: ComponentRecipes = {};
  for (const id of componentRecipeIds) {
    if (!Object.hasOwn(raw, id)) continue;
    const records = appearanceRecord(raw[id], `componentRecipes.${id}`);
    for (const recipe of Object.keys(records)) requireRecipe(id, recipe);
    for (const { key: recipe } of componentRecipeOptions(id)) {
      if (!Object.hasOwn(records, recipe)) continue;
      const entry = appearanceRecord(records[recipe], `componentRecipes.${id}.${recipe}`);
      const parts = componentRecipeParts(id, recipe);
      for (const part of Object.keys(entry)) if (!parts.some(({ key }) => key === part)) throw new Error(`componentRecipes.${id}.${recipe}: unknown part ${part}`);
      for (const { key: part } of parts) {
        if (!Object.hasOwn(entry, part)) continue;
        const appearance = parseAppearance(entry[part], allFields(id, part, recipe), `componentRecipes.${id}.${recipe}.${part}`);
        if (Object.keys(appearance).length) ((result[id] ??= {})[recipe] ??= {})[part] = appearance;
      }
    }
  }
  return result;
}

/** Source owns non-colors, including omissions; target alone owns its colors. */
export function shareComponentRecipes(source?: ComponentRecipes, target?: ComponentRecipes): ComponentRecipes {
  const from = parseComponentRecipes(source === undefined ? {} : source);
  const into = parseComponentRecipes(target === undefined ? {} : target);
  const result: ComponentRecipes = {};
  for (const id of componentRecipeIds) for (const { key: recipe } of componentRecipeOptions(id)) for (const { key: part } of componentRecipeParts(id, recipe)) {
    const appearance: NodeAppearance = {};
    for (const { key } of allFields(id, part, recipe)) {
      const value = (colors.has(key) ? into : from)[id]?.[recipe]?.[part]?.[key];
      if (value !== undefined) Object.assign(appearance, { [key]: value });
    }
    if (Object.keys(appearance).length) ((result[id] ??= {})[recipe] ??= {})[part] = appearance;
  }
  return result;
}

export function componentRecipeVariable(id: SharedComponentId, recipe: string, part: ComponentRecipePart, key: keyof NodeAppearance): string {
  requireRecipe(id, recipe);
  if (!allFields(id, part, recipe).some((field) => field.key === key)) throw new Error(`componentRecipes.${id}.${recipe}.${part}: unsupported field ${key}`);
  return `--${id}-recipe-${slug(recipe)}-${part}-${slug(key)}`;
}

/** Sparse authored declarations plus conditional, non-authorable CSS helpers. */
export function componentRecipeVariables(recipes?: ComponentRecipes): Record<string, string> {
  const parsed = parseComponentRecipes(recipes === undefined ? {} : recipes);
  const variables: Record<string, string> = {};
  for (const id of componentRecipeIds) for (const { key: recipe } of componentRecipeOptions(id)) for (const { key: part } of componentRecipeParts(id, recipe)) {
    const appearance = parsed[id]?.[recipe]?.[part];
    if (!appearance) continue;
    const prefix = `--${id}-recipe-${slug(recipe)}-${part}`;
    // Text-only edits must not change historical box sizing/layout.
    if (Object.keys(appearance).some((key) => componentRecipeFields(id, part, "frame", recipe).some((field) => field.key === key))) variables[`${prefix}-box-sizing`] = "border-box";
    for (const { key } of allFields(id, part, recipe)) {
      const value = appearance[key];
      if (value !== undefined) variables[componentRecipeVariable(id, recipe, part, key)] = recipeCSSValue(key, value);
    }
    if (appearance.height !== undefined && appearance.minHeight === undefined) variables[`${prefix}-min-height`] = "0px";
    if (appearance.borderWidth !== undefined) variables[`${prefix}-border-style`] = "solid";
    if ((id === "text" || id === "card" && part === "title") && hasAppearanceBox(appearance)) variables[`${prefix}-box-display`] = "inline-block";
    if ((id === "button" || id === "badge") && part === "text" && appearance.textAlign !== undefined) variables[`${prefix}-content-display`] = "block";
    if (id === "input" && part === "control") for (const edge of ["Top", "Bottom"] as const) {
      if (appearance[`padding${edge}`] !== undefined) variables[`${prefix}-inner-padding-${edge.toLowerCase()}`] = "0px";
    }
    if (id === "switch" && part === "control" && (hasAppearanceBox(appearance) || appearance.borderWidth !== undefined)) {
      variables[`${prefix}-thumb-transform`] = "none";
      variables[`${prefix}-thumb-margin`] = "auto";
    }
  }
  return variables;
}

/** Resolves authored layers only: shared < exact recipe < local; no CSS defaults. */
export function componentRecipeStylesFor(recipes: ComponentRecipes | undefined, id: SharedComponentId, recipe: string, part: ComponentRecipePart, shared?: NodeAppearance, local?: NodeAppearance): NodeAppearance {
  requireRecipe(id, recipe);
  if (!componentRecipeParts(id, recipe).some(({ key }) => key === part)) throw new Error(`componentRecipes.${id}.${recipe}: unknown part ${part}`);
  return { ...shared, ...parseComponentRecipes(recipes === undefined ? {} : recipes)[id]?.[recipe]?.[part], ...local };
}
