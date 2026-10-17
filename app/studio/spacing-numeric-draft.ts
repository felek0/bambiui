import type { AppearanceField } from "./components/appearance.ts";

/** Drafts accept finite decimal px values, never CSS or empty-string coercion. */
export function spacingNumericValue(text: string, field: AppearanceField): number | null {
  const trimmed = text.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= field.min! && value <= field.max! ? value : null;
}

/** Prefer authored CSS lengths to layout-rounded computed lengths. */
export function spacingNumericInitial(authored: string, measured: number, field: AppearanceField): number {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))px$/.exec(authored.trim());
  return match ? spacingNumericValue(match[1], field) ?? measured : measured;
}
