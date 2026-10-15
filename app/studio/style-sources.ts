import { componentRecipeFields, componentRecipeVariable, type ComponentRecipeSelection, type SharedComponentId } from "./component-recipes.ts";
import { componentStyleFields, componentStyleParts, componentStyleVariable, type ComponentStylePart } from "./component-styles.ts";
import type { AppearanceField, NodeAppearance } from "./components/appearance";
import type { ThemeTokens } from "./tokens";

export type StyleSource = {
  kind: "recipe" | "shared" | "generated" | "fallback";
  label: string;
  description: string;
  variable?: string;
};
export type StyleSourceScope = { component: SharedComponentId; part: ComponentStylePart; recipe?: never; target?: never } | ComponentRecipeSelection;
export type StyleSourceInfo = { current: StyleSource; afterReset: StyleSource; overridden: boolean; themeSpecific: boolean; editVariable: string };

/** Authored declaration provenance, not an inference from a matching computed value.
 * The final CSS cascade (including parent/variant/theme/browser defaults) stays a
 * named boundary: it cannot be reconstructed from a pixel measurement alone. */
function cssFallback(scope: StyleSourceScope): StyleSource {
  const nestedCardText = scope.component === "card" && scope.target === "text" && ["content", "footer"].includes(scope.part);
  return {
    kind: "fallback", label: nestedCardText ? "Nested component defaults" : "Component / parent CSS",
    description: nestedCardText
      ? "The nested Text or action component resolves its own recipes, shared styles and defaults. Shared Card slot typography does not style these descendants."
      : "Component CSS resolves variant/state tokens, base tokens, parent styles and browser defaults. The property control shows the rendered result, not a guessed token value.",
  };
}

export function styleSourceInfo(theme: ThemeTokens, scope: StyleSourceScope, field: AppearanceField): StyleSourceInfo {
  const exact = scope.recipe !== undefined;
  const allowed = exact ? componentRecipeFields(scope.component, scope.part, scope.target, scope.recipe) : componentStyleFields(scope.component, scope.part);
  if (!allowed.some(entry => entry.key === field.key)) throw new Error(`This layer does not consume ${field.key}.`);
  const own = exact ? theme.componentRecipes?.[scope.component]?.[scope.recipe]?.[scope.part] ?? {} : theme.componentStyles?.[scope.component]?.[scope.part] ?? {};
  const nestedCardText = scope.component === "card" && scope.target === "text" && ["content", "footer"].includes(scope.part);
  const sharedPart = !nestedCardText ? componentStyleParts(scope.component).find(part => part.key === scope.part)?.key : undefined;
  const shared = exact && sharedPart ? theme.componentStyles?.[scope.component]?.[sharedPart] ?? {} : {};
  const label = (part: ComponentStylePart) => componentStyleParts(scope.component).find(entry => entry.key === part)!.label;
  const ownVariable = (key: keyof NodeAppearance) => exact
    ? componentRecipeVariable(scope.component, scope.recipe, scope.part, key)
    : componentStyleVariable(scope.component, scope.part, key);
  const sharedVariable = (key: keyof NodeAppearance) => componentStyleVariable(scope.component, sharedPart!, key);
  const generatedHeight = (values: NodeAppearance, variable: (key: keyof NodeAppearance) => string, owner: string): StyleSource | undefined => field.key === "minHeight" && values.height !== undefined ? {
    kind: "generated", label: `${owner} height`, variable: variable("height"),
    description: "An authored height generates a zero minimum height, so the size preset cannot clamp it. Resetting min height leaves the height override intact.",
  } : undefined;
  const sharedFallback = (): StyleSource => {
    if (sharedPart && componentStyleFields(scope.component, sharedPart).some(entry => entry.key === field.key)) {
      if (shared[field.key] !== undefined) return { kind: "shared", label: `Shared ${label(sharedPart)}`, variable: sharedVariable(field.key), description: "This shared layer supplies the default for all combinations; an exact override takes precedence." };
      const generated = generatedHeight(shared, sharedVariable, "Shared");
      if (generated) return generated;
    }
    return cssFallback(scope);
  };
  const fallback = (): StyleSource => generatedHeight(own, ownVariable, exact ? "This combination's" : "Shared") ?? sharedFallback();
  const overridden = own[field.key] !== undefined;
  const afterReset = fallback();
  return {
    current: overridden ? {
      kind: exact ? "recipe" : "shared", label: exact ? "This combination" : `Shared ${label(scope.part as ComponentStylePart)}`, variable: ownVariable(field.key),
      description: exact ? "Authored for this exact combination and layer, not other sizes or variants." : "Authored for this shared layer. Exact combination overrides may mask it in the canvas.",
    } : afterReset,
    afterReset, overridden,
    themeSpecific: ["background", "color", "borderColor"].includes(field.key),
    editVariable: ownVariable(field.key),
  };
}
