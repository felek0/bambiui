import { parseNodeAppearance, type AppearanceField, type AppearancePatch, type NodeAppearance, type NodePart } from "../page-document/appearance.ts";
import type { PageKind } from "../page-document/model.ts";
import { appearanceStyleDraft } from "../appearance-field-ui.ts";

/** Empty fields restore inheritance; a draft never rounds historical values. */
export function appearanceDraft(kind: PageKind, field: AppearanceField, draft: string, part?: NodePart): AppearancePatch {
  const patch = appearanceStyleDraft(field, draft);
  if (patch[field.key] === null) return patch;
  return parseNodeAppearance(patch, kind, part);
}

export function linkedAppearancePatch(patch: AppearancePatch, keys: readonly (keyof NodeAppearance)[]): AppearancePatch {
  const [entry] = Object.entries(patch);
  if (!entry || !keys.includes(entry[0] as keyof NodeAppearance)) throw new Error("Choose a field in this group.");
  return Object.fromEntries(keys.map(key => [key, entry[1]])) as AppearancePatch;
}
