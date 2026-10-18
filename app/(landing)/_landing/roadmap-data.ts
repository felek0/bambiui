export type RoadmapColumn = "new" | "planned" | "progress" | "completed";
export type RoadmapItem = { id: string; title: string; detail: string; column: RoadmapColumn; kind: "feature" | "bug"; local?: boolean; created?: string };

export const roadmapColumns: { key: RoadmapColumn; label: string; hint: string }[] = [
  { key: "new", label: "New", hint: "Ideas and reports waiting for triage" },
  { key: "planned", label: "Planned", hint: "Accepted and scheduled" },
  { key: "progress", label: "In progress", hint: "Being built now" },
  { key: "completed", label: "Completed", hint: "Shipped in Studio" },
];

/** Curated from docs/roadmap.md; keep in step when the product roadmap changes. */
export const curatedRoadmap: RoadmapItem[] = [
  { id: "direct-editing", column: "completed", kind: "feature", title: "Direct editing on the canvas", detail: "Padding, margin, corners, size, resize, gap and text tools on real components, with visible scope and one-step undo." },
  { id: "typography", column: "completed", kind: "feature", title: "Typography foundation", detail: "Font family, base size and the H1–H6, paragraph, label and caption scale on their own page." },
  { id: "radius-presets", column: "completed", kind: "feature", title: "Component radius presets", detail: "radius=\"sm | md | lg\" per component and size, without flattening presets after manual edits." },
  { id: "cli", column: "completed", kind: "feature", title: "CLI and static registry", detail: "npx bambiui init / add / theme with pinned, immutable registry releases." },
  { id: "data-safety", column: "progress", kind: "feature", title: "Data safety", detail: "Two-tab editing, storage quota and retry, and safer imports of damaged files." },
  { id: "accessibility-review", column: "progress", kind: "feature", title: "Assisted accessibility review", detail: "VoiceOver, native 200% zoom and touch passes on the editing tools." },
  { id: "figma-kit", column: "planned", kind: "feature", title: "Figma kit pilot", detail: "A Card pilot mapped to the same token snapshot, then all seven components." },
  { id: "new-components", column: "planned", kind: "feature", title: "New components", detail: "One at a time, chosen by real gaps — Textarea, Select and Radio are candidates." },
];

export const SUBMISSIONS_KEY = "bambiui.roadmap-submissions.v1";
const maxItems = 50;

/** Preview only: submissions live in this browser and are never sent anywhere. */
export function parseSubmissions(text: string | null): RoadmapItem[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RoadmapItem => !!item && typeof item === "object"
      && typeof item.id === "string" && typeof item.title === "string" && typeof item.detail === "string"
      && (item.kind === "feature" || item.kind === "bug") && item.title.trim().length > 0 && item.title.length <= 120 && item.detail.length <= 1000)
      .slice(0, maxItems).map(item => ({ ...item, column: "new" as const, local: true }));
  } catch { return []; }
}

export function validateSubmission(title: string, detail: string): string | null {
  if (!title.trim()) return "Add a short title.";
  if (title.trim().length > 120) return "Keep the title under 120 characters.";
  if (detail.length > 1000) return "Keep details under 1000 characters.";
  return null;
}
