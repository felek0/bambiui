import { parseNodeAppearance, type AppearanceField, type AppearancePatch, type NodeAppearance, type NodePart } from "../page-document/appearance.ts";
import type { PageKind } from "../page-document/model.ts";

/** Empty fields restore inheritance; a draft never rounds historical values. */
export function appearanceDraft(kind: PageKind, field: AppearanceField, draft: string, part?: NodePart): AppearancePatch {
  const text = draft.trim();
  if (!text) return { [field.key]: null };
  let value: string | number = text;
  if (field.type === "number" || (field.type === "dimension" && !field.options?.includes(text))) {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error("Enter a number in pixels.");
    value = Number(text);
  }
  try {
    return parseNodeAppearance({ [field.key]: value }, kind, part);
  } catch {
    throw new Error(field.type === "color" ? `Use a six-digit hex color${field.options?.includes("transparent") ? " or transparent" : ""}.`
      : field.type === "select" ? "Choose a listed value."
        : `Use ${field.min}–${field.max}${field.type === "dimension" ? `, ${field.options?.join(" or ")}` : ""}.`);
  }
}

export function linkedAppearancePatch(patch: AppearancePatch, keys: readonly (keyof NodeAppearance)[]): AppearancePatch {
  const [entry] = Object.entries(patch);
  if (!entry || !keys.includes(entry[0] as keyof NodeAppearance)) throw new Error("Choose a field in this group.");
  return Object.fromEntries(keys.map(key => [key, entry[1]])) as AppearancePatch;
}
