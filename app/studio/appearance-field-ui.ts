import { parseAppearance, type AppearanceField, type AppearancePatch } from "./components/appearance.ts";

/** Inspector presentation only; units and limits never change serialized values. */
export function appearanceFieldUnit(field: AppearanceField): string | undefined {
  if (field.type === "color") return "HEX";
  if (field.key === "lineHeight") return "×";
  if (field.key === "opacity") return "0–1";
  if (field.key === "fontWeight") return undefined;
  return field.type === "number" || field.type === "dimension" ? "px" : undefined;
}
export function appearanceFieldGuide(field: AppearanceField): string {
  if (field.type === "color") return `Use a six-digit hex color${field.options?.includes("transparent") ? " or transparent" : ""}.`;
  if (field.type === "select") return field.key === "shadow"
    ? `Choose ${field.options?.join(", ")}. The full rendered CSS shadow is display-only, not a value to paste into this field.`
    : `Choose ${field.options?.join(", ")}.`;
  const unit = field.key === "lineHeight" ? " (unitless multiplier)" : field.key === "opacity" ? " (unitless, not percent)" : field.key === "fontWeight" ? " (whole numbers)" : " px";
  return `Use ${field.min}–${field.max}${unit}${field.type === "dimension" && field.options?.length ? `, or ${field.options.join(" / ")}` : ""}. Enter numbers without units.${field.key !== "fontWeight" ? " Decimals are preserved." : ""}`;
}
export function appearanceFieldHint(field: AppearanceField): string {
  return `${appearanceFieldGuide(field)} Clear or reset to remove the override. Mixed means the examples use different values; it is not a saved value. ${field.type === "select" ? "Choices apply immediately." : "Enter commits; Escape cancels."}`;
}
export function appearanceFieldWide(field: AppearanceField): boolean {
  return field.type === "color" || field.key === "shadow";
}

/** One draft syntax/validation contract for System styles and Project appearance. */
export function appearanceStyleDraft(field: AppearanceField, draft: string): AppearancePatch {
  const text = draft.trim();
  if (!text) return { [field.key]: null };
  let value: string | number = text;
  if (field.type === "number" || field.type === "dimension" && !field.options?.includes(text)) {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error(appearanceFieldGuide(field));
    value = Number(text);
  }
  try { return parseAppearance({ [field.key]: value }, [field]); }
  catch { throw new Error(appearanceFieldGuide(field)); }
}
export function appearanceSaveError(field: AppearanceField, draft: string): string {
  try { appearanceStyleDraft(field, draft); }
  catch (error) { return error instanceof Error ? error.message : "Invalid value."; }
  return "This edit could not be saved. Check the project notice.";
}
