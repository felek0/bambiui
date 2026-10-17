import type { TokenValues, TypographyVariant } from "./tokens";

/** System-wide foundations, listed in the order designers reach for them. */
export const foundationIds = ["colors", "typography", "spacing"] as const;
export type FoundationId = (typeof foundationIds)[number];
export const isFoundation = (value: string): value is FoundationId => (foundationIds as readonly string[]).includes(value);
export const foundationLabels: Record<FoundationId, string> = { colors: "Colors", typography: "Typography", spacing: "Shape & spacing" };

/** Studio-only presentation labels; token metadata stays unchanged for distributed sources. */
export const foundationTokenLabels: Partial<Record<keyof TokenValues, string>> = { radius: "Radius md" };

/** Shape & spacing order: the shared radius scale reads sm → md → lg. Base font size lives in Typography. */
export const spacingTokenOrder = [
  "radiusSm", "radius", "radiusLg", "borderWidth",
  "paddingX", "paddingY", "gap", "margin",
  "spacingSm", "spacingMd", "spacingLg",
  "controlHeightSm", "controlHeightMd", "controlHeightLg",
] as const satisfies readonly (keyof TokenValues)[];

export const typographyStyleLabel = (variant: TypographyVariant) =>
  variant === "heading" || variant === "paragraph" || variant === "label" || variant === "caption" ? variant[0].toUpperCase() + variant.slice(1) : variant.toUpperCase();

/** Canvas order: the heading scale first, then body and UI text; the generic `heading` style follows the scale. */
export const typographyCanvasOrder = ["h1", "h2", "h3", "h4", "h5", "h6", "heading", "paragraph", "label", "caption"] as const satisfies readonly TypographyVariant[];
