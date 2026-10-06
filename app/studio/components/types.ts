/** Shared anatomy types also used by the pure System style/recipe models. */
export type SharedComponentId = "button" | "input" | "switch" | "checkbox" | "badge" | "card" | "text";
export type ComponentStylePart = "root" | "control" | "row" | "label" | "description" | "error" | "header" | "title" | "content" | "footer" | "icon";

/** Shared size scale. Maps to the `controlHeight{Sm,Md,Lg}` tokens. */
export type Size = "sm" | "md" | "lg";

/** Global radius scale. Resolves to the shared radiusSm/radius/radiusLg foundation tokens. */
export type Radius = "sm" | "md" | "lg";

/** Semantic color roles. Map to the global color tokens of the same name. */
export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
