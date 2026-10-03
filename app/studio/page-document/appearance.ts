import {
  appearanceFields, appearanceRecord, parseAppearance,
  type AppearanceField, type AppearancePatch, type NodeAppearance, type NodePart, type NodeParts, type PartsPatch,
} from "../components/appearance.ts";
import type { PageKind } from "./registry.ts";

export { appearanceFields, appearanceToStyle } from "../components/appearance.ts";
export type { AppearanceField, AppearancePatch, NodeAppearance, NodePart, NodeParts, PartsPatch } from "../components/appearance.ts";

export type AppearancePart = { key: NodePart; label: string };
const fieldParts: readonly AppearancePart[] = [
  { key: "root", label: "Field layout" },
  { key: "label", label: "Label" },
  { key: "control", label: "Control" },
  { key: "description", label: "Description" },
  { key: "error", label: "Error" },
];
const choiceParts: readonly AppearancePart[] = [fieldParts[0], { key: "row", label: "Control and label row" }, ...fieldParts.slice(1)];

/** Card slots are ordinary nodes, not part overrides. */
export function appearanceParts(kind: PageKind): readonly AppearancePart[] {
  return kind === "input" ? fieldParts : kind === "switch" || kind === "checkbox" ? choiceParts : [];
}

/** Only controls consumed by this actual element; use this instead of the full catalog in an inspector. */
export function appearanceFieldsFor(kind: PageKind, part?: NodePart): readonly AppearanceField[] {
  if (part && !appearanceParts(kind).some((entry) => entry.key === part)) return [];
  const choiceControl = (kind === "switch" || kind === "checkbox") && (!part || part === "control");
  const gap = part ? ["root", "row", "error"].includes(part) || (part === "control" && kind === "input")
    : ["container", "stack", "grid", "card", "cardHeader", "cardContent", "cardFooter", "button", "badge", "input"].includes(kind);
  return appearanceFields.filter((field) => (field.key !== "gap" || gap) && (!choiceControl || field.group !== "typography" || field.key === "fontSize"));
}

export function parseNodeAppearance(value: unknown, kind: PageKind, part?: NodePart, path = "appearance"): NodeAppearance {
  if (part && !appearanceParts(kind).some((entry) => entry.key === part)) throw new Error(`${path}: unsupported part ${part}`);
  return parseAppearance(value, appearanceFieldsFor(kind, part), path);
}

export function parseNodeParts(value: unknown, kind: PageKind, path = "parts"): NodeParts {
  const raw = appearanceRecord(value, path);
  const allowed = appearanceParts(kind);
  if (!allowed.length) throw new Error(`${path}: parts not supported for ${kind}`);
  for (const key of Object.keys(raw)) if (!allowed.some((part) => part.key === key)) throw new Error(`${path}: unknown part ${key}`);
  const result: NodeParts = {};
  for (const { key } of allowed) if (Object.hasOwn(raw, key)) result[key] = parseNodeAppearance(raw[key], kind, key, `${path}.${key}`);
  return result;
}

/** Null resets; empty results are omitted, restoring token/component inheritance. */
export function patchAppearance(current: NodeAppearance | undefined, patch: AppearancePatch | null, kind: PageKind, part?: NodePart): NodeAppearance | undefined {
  if (part && !appearanceParts(kind).some((entry) => entry.key === part)) throw new Error(`appearance: unsupported part ${part}`);
  if (patch === null) return undefined;
  const raw = appearanceRecord(patch, "appearance patch");
  const allowed = appearanceFieldsFor(kind, part);
  const result = { ...current };
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.some((field) => field.key === key)) throw new Error(`appearance patch: unknown or unsupported key ${key}`);
    if (value === null) delete result[key as keyof NodeAppearance];
    else Object.assign(result, parseAppearance({ [key]: value }, allowed, "appearance patch"));
  }
  return Object.keys(result).length ? parseNodeAppearance(result, kind, part) : undefined;
}

export function patchParts(current: NodeParts | undefined, patch: PartsPatch | null, kind: PageKind): NodeParts | undefined {
  if (!appearanceParts(kind).length) throw new Error(`parts: not supported for ${kind}`);
  if (patch === null) return undefined;
  const raw = appearanceRecord(patch, "parts patch");
  const result = { ...current };
  for (const [key, value] of Object.entries(raw)) {
    if (!appearanceParts(kind).some((part) => part.key === key)) throw new Error(`parts patch: unknown part ${key}`);
    const part = key as NodePart;
    const next = patchAppearance(result[part], value as AppearancePatch | null, kind, part);
    if (next) result[part] = next;
    else delete result[part];
  }
  return Object.keys(result).length ? parseNodeParts(result, kind) : undefined;
}
