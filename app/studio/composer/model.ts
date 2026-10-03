import { parsePageDocument, type PageDocument, type PageNode } from "../page-document/model.ts";

export type ComposerPreset = "web" | "tablet" | "mobile" | "custom";
export type ComposerFrame = {
  id: string; name: string; preset: ComposerPreset;
  x: number; y: number; width: number; height: number; root: PageNode;
};
export type ComposerPage = { id: string; name: string; frames: ComposerFrame[] };
export type ComposerDocument = { version: 1; id: string; name: string; systemId: string; pages: ComposerPage[] };
export type ProjectCollection = { version: 1; activeProjectId: string | null; projectIds: string[] };
export type ComposerSelection = { projectId: string; pageId: string; frameId: string; nodeId: string };

// Structural quotas, not import byte quotas. Depth is root-relative, matching the old parser.
export const COMPOSER_LIMITS = Object.freeze({
  pages: 20, framesPerPage: 10, nodes: 2000, nodesPerFrame: 100, depth: 12,
  nameLength: 120, idLength: 64, minDimension: 1, maxDimension: 10000, maxCoordinate: 100000,
});
export const COMPOSER_PRESETS = Object.freeze({
  web: Object.freeze({ width: 1440, height: 900 }),
  tablet: Object.freeze({ width: 768, height: 1024 }),
  mobile: Object.freeze({ width: 390, height: 844 }),
  custom: Object.freeze({ width: 1440, height: 900 }),
});

// Accept only own enumerable data fields on ordinary or null-prototype records.
// This also protects the older parser from inherited fields and accessor side effects.
function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
    throw new Error(`${path}: expected plain object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor))
      throw new Error(`${path}: expected own data fields`);
  }
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[], path: string) {
  const data = object(value, path);
  for (const key of Object.keys(data)) if (!keys.includes(key)) throw new Error(`${path}: unknown key ${key}`);
  for (const key of keys) if (!Object.hasOwn(data, key)) throw new Error(`${path}: missing ${key}`);
  return data;
}
function list(value: unknown, max: number, path: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max)
    throw new Error(`${path}: invalid array or limit exceeded`);
  if (Reflect.ownKeys(value).length !== value.length + 1) throw new Error(`${path}: expected dense array`);
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error(`${path}: expected array data`);
  }
  return value;
}
function identifier(value: unknown, path: string): string {
  // Project/page/frame/system IDs support UUIDs and the existing 'original' system.
  // Node IDs retain the old parser's alpha-first contract.
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) throw new Error(`${path}: invalid id`);
  return value;
}
function name(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > COMPOSER_LIMITS.nameLength) throw new Error(`${path}: invalid name`);
  return value;
}
function number(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${path}: invalid geometry`);
  return value;
}
function unique(id: string, ids: Set<string>, path: string) {
  if (ids.has(id)) throw new Error(`${path}: duplicate id`);
  ids.add(id);
}
function rootDocument(root: unknown): PageDocument {
  let count = 0;
  function guard(raw: unknown, depth: number) {
    if (++count > COMPOSER_LIMITS.nodesPerFrame || depth > COMPOSER_LIMITS.depth) throw new Error("frame.root: page limit exceeded");
    const node = object(raw, "frame.root");
    if (Object.hasOwn(node, "props")) object(node.props, "frame.root.props");
    if (Object.hasOwn(node, "children")) {
      for (const child of list(node.children, COMPOSER_LIMITS.nodesPerFrame, "frame.root.children")) guard(child, depth + 1);
    }
  }
  guard(root, 0);
  // Temporary metadata deliberately does not constrain Composer IDs to old page IDs.
  return parsePageDocument({ version: 1, id: "composer-frame", name: "Frame", root });
}

export function parseComposerFrame(value: unknown): ComposerFrame {
  const data = exact(value, ["id", "name", "preset", "x", "y", "width", "height", "root"], "frame");
  if (typeof data.preset !== "string" || !Object.hasOwn(COMPOSER_PRESETS, data.preset)) throw new Error("frame: invalid preset");
  const preset = data.preset as ComposerPreset;
  const width = number(data.width, COMPOSER_LIMITS.minDimension, COMPOSER_LIMITS.maxDimension, "frame.width");
  const height = number(data.height, COMPOSER_LIMITS.minDimension, COMPOSER_LIMITS.maxDimension, "frame.height");
  // Geometry is authoritative: arbitrary resized dimensions must be explicitly custom.
  if (preset !== "custom" && (width !== COMPOSER_PRESETS[preset].width || height !== COMPOSER_PRESETS[preset].height))
    throw new Error("frame: preset dimensions mismatch; use custom");
  return {
    id: identifier(data.id, "frame.id"), name: name(data.name, "frame.name"), preset,
    x: number(data.x, -COMPOSER_LIMITS.maxCoordinate, COMPOSER_LIMITS.maxCoordinate, "frame.x"),
    y: number(data.y, -COMPOSER_LIMITS.maxCoordinate, COMPOSER_LIMITS.maxCoordinate, "frame.y"),
    width, height, root: rootDocument(data.root).root,
  };
}
export function parseComposerPage(value: unknown): ComposerPage {
  const data = exact(value, ["id", "name", "frames"], "page");
  const ids = new Set<string>();
  const frames = list(data.frames, COMPOSER_LIMITS.framesPerPage, "page.frames").map((raw) => {
    const frame = parseComposerFrame(raw);
    unique(frame.id, ids, "page.frames");
    return frame;
  });
  return { id: identifier(data.id, "page.id"), name: name(data.name, "page.name"), frames };
}
export function parseComposerDocument(value: unknown): ComposerDocument {
  const data = exact(value, ["version", "id", "name", "systemId", "pages"], "project");
  if (data.version !== 1) throw new Error("project: unsupported version");
  const pageIds = new Set<string>();
  const frameIds = new Set<string>();
  let nodes = 0;
  function count(node: PageNode): number { return 1 + (node.children ?? []).reduce((sum, child) => sum + count(child), 0); }
  const pages = list(data.pages, COMPOSER_LIMITS.pages, "project.pages").map((raw) => {
    const page = parseComposerPage(raw);
    unique(page.id, pageIds, "project.pages");
    for (const frame of page.frames) {
      unique(frame.id, frameIds, "project.frames");
      nodes += count(frame.root);
      if (nodes > COMPOSER_LIMITS.nodes) throw new Error("project: node limit exceeded");
    }
    return page;
  });
  return { version: 1, id: identifier(data.id, "project.id"), name: name(data.name, "project.name"), systemId: identifier(data.systemId, "project.systemId"), pages };
}

// Index IDs are unique across the collection; null means no active project, even in a nonempty index.
// No storage recovery, document matching, or deletion policy is implied by this structural contract.
export function parseProjectCollection(value: unknown): ProjectCollection {
  const data = exact(value, ["version", "activeProjectId", "projectIds"], "projects");
  if (data.version !== 1) throw new Error("projects: unsupported version");
  const ids = new Set<string>();
  const projectIds = list(data.projectIds, Number.MAX_SAFE_INTEGER, "projects.projectIds").map((raw) => {
    const id = identifier(raw, "projects.projectIds"); unique(id, ids, "projects.projectIds"); return id;
  });
  const activeProjectId = data.activeProjectId === null ? null : identifier(data.activeProjectId, "projects.activeProjectId");
  if (activeProjectId !== null && !ids.has(activeProjectId)) throw new Error("projects: missing active project");
  return { version: 1, activeProjectId, projectIds };
}

export function createComposerDocument(id: string, systemId: string, projectName = "Untitled project"): ComposerDocument {
  return parseComposerDocument({ version: 1, id, name: projectName, systemId, pages: [] });
}
export function createComposerPage(id: string, pageName = "Untitled page"): ComposerPage {
  return parseComposerPage({ id, name: pageName, frames: [] });
}
export function createComposerFrame(id: string, rootId: string, preset: ComposerPreset = "web", frameName = "Untitled frame"): ComposerFrame {
  return parseComposerFrame({ id, name: frameName, preset, x: 0, y: 0, ...COMPOSER_PRESETS[preset], root: { id: rootId, kind: "container", props: { maxWidth: "full" }, children: [] } });
}

// Accept IDs or actual StoredSystem objects structurally, without a runtime systems.ts dependency.
// The caller supplies its validated system catalog; this checks existence, not tokens or registry compatibility.
export function resolveComposerSystem<T extends string | { id: string }>(document: Pick<ComposerDocument, "systemId">, systems: readonly T[]): T | null {
  return systems.find((entry) => (typeof entry === "string" ? entry : entry.id) === document.systemId) ?? null;
}
export function validateComposerSystemReference(document: Pick<ComposerDocument, "systemId">, systems: readonly (string | { id: string })[]): void {
  if (resolveComposerSystem(document, systems) === null) throw new Error(`project: missing system ${document.systemId}`);
}

export function composerFrameToPageDocument(frame: ComposerFrame): PageDocument {
  return rootDocument(parseComposerFrame(frame).root);
}
// Explicit conversion only; no storage read, migration, theme selection, or system rebinding.
export function pageDocumentToComposerPage(document: PageDocument, pageId: string, frameId: string, preset: ComposerPreset = "web"): ComposerPage {
  exact(document, ["version", "id", "name", "root"], "legacy page");
  rootDocument(document.root);
  const old = parsePageDocument(document);
  const frame = createComposerFrame(frameId, old.root.id, preset, old.name);
  frame.root = old.root;
  return parseComposerPage({ id: pageId, name: old.name, frames: [frame] });
}
