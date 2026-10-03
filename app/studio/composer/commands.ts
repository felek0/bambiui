import { applyPageCommands, type PageCommand } from "../page-document/commands.ts";
import { prepareMove, type MoveTarget } from "./movement.ts";
import type { PageNode } from "../page-document/model.ts";
import {
  composerFrameToPageDocument, parseComposerDocument, parseComposerFrame, parseComposerPage, parseComposerAsset,
  validateComposerSystemReference, type ComposerDocument, type ComposerFrame, type ComposerPage, type ComposerAsset,
} from "./model.ts";

/** Already validated system IDs or StoredSystem-shaped records. No token/catalog mutation or custom registry mapping. */
export type ComposerSystemCatalog = readonly (string | { id: string })[];
/** Exact source-node-ID -> new-node-ID map, including the root. Scoped by source frame. */
export type ComposerFrameIdRemap = { frameId: string; nodeIds: Record<string, string> };
export type ComposerPageIdRemap = { pageId: string; frames: Record<string, ComposerFrameIdRemap> };
export type ComposerGeometryPatch = Partial<Pick<ComposerFrame, "x" | "y" | "width" | "height">>;
export type ComposerNodeCommand = Exclude<PageCommand, { type: "rename" }>;
export type ComposerCommand =
  | ({ type: "moveNode"; wrapperIds: string[] } & MoveTarget)
  | { type: "renameProject"; name: string }
  | { type: "changeProjectSystem"; systemId: string }
    | { type: "saveAsset"; asset: ComposerAsset }
    | { type: "renameAsset"; assetId: string; name: string }
    | { type: "deleteAsset"; assetId: string }
  | { type: "insertPage"; index: number; page: ComposerPage }
  | { type: "renamePage"; pageId: string; name: string }
  | { type: "deletePage"; pageId: string }
  | { type: "duplicatePage"; pageId: string; index: number; ids: ComposerPageIdRemap }
  | { type: "reorderPage"; pageId: string; index: number }
  | { type: "insertFrame"; pageId: string; index: number; frame: ComposerFrame }
  | { type: "renameFrame"; pageId: string; frameId: string; name: string }
  | { type: "deleteFrame"; pageId: string; frameId: string }
  | { type: "duplicateFrame"; pageId: string; frameId: string; index: number; ids: ComposerFrameIdRemap }
  | { type: "reorderFrame"; pageId: string; frameId: string; index: number }
  | { type: "updateFrameGeometry"; pageId: string; frameId: string; geometry: ComposerGeometryPatch }
  | { type: "nodeCommands"; pageId: string; frameId: string; commands: readonly ComposerNodeCommand[] };

const commandKeys: Record<ComposerCommand["type"], readonly string[]> = {
  renameProject: ["type", "name"], changeProjectSystem: ["type", "systemId"],
    saveAsset: ["type", "asset"], renameAsset: ["type", "assetId", "name"], deleteAsset: ["type", "assetId"],
  insertPage: ["type", "index", "page"], renamePage: ["type", "pageId", "name"],
  deletePage: ["type", "pageId"], duplicatePage: ["type", "pageId", "index", "ids"],
  reorderPage: ["type", "pageId", "index"], insertFrame: ["type", "pageId", "index", "frame"],
  renameFrame: ["type", "pageId", "frameId", "name"], deleteFrame: ["type", "pageId", "frameId"],
  duplicateFrame: ["type", "pageId", "frameId", "index", "ids"],
  reorderFrame: ["type", "pageId", "frameId", "index"],
  updateFrameGeometry: ["type", "pageId", "frameId", "geometry"],
  nodeCommands: ["type", "pageId", "frameId", "commands"],
  moveNode: ["type", "pageId", "sourceFrameId", "nodeId", "frameId", "parentId", "index", "wrapperIds"],
};
const nodeKeys: Record<ComposerNodeCommand["type"], readonly string[]> = {
  insert: ["type", "parentId", "index", "node"], delete: ["type", "nodeId"],
  move: ["type", "nodeId", "parentId", "index"], update: ["type", "nodeId", "props", "text", "appearance", "parts"],
};

// Inspect descriptors before reading values: no getters, executable values, inherited fields,
// sparse arrays or exotic prototypes can reach the legacy command adapter.
function dataOnly(value: unknown, depth = 0, budget = { left: 50000 }): void {
  if (--budget.left < 0 || depth > 32) throw new Error("command: data limit exceeded");
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))) return;
  if (typeof value !== "object") throw new Error("command: expected data values");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
    throw new Error("command: expected plain data");
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) throw new Error("command: expected dense array");
  for (const key of keys) {
    if (array && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor))
      throw new Error("command: expected own data fields");
    if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))
      throw new Error("command: invalid array field");
    dataOnly(descriptor.value, depth + 1, budget);
  }
}
function exact(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("command: expected object");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!keys.includes(key)) throw new Error(`command: unknown key ${key}`);
  for (const key of keys) if (!optional.includes(key) && !Object.hasOwn(record, key)) throw new Error(`command: missing ${key}`);
  return record;
}
function tagged(value: unknown, allowlist: Record<string, readonly string[]>, node = false): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("command: expected object");
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || !Object.hasOwn(allowlist, record.type)) throw new Error("command: unknown command");
  exact(record, allowlist[record.type], node && record.type === "update" ? ["props", "text", "appearance", "parts"] : []);
  for (const key of ["name", "pageId", "frameId", "nodeId", "parentId", "systemId", "assetId", "text"])
    if (Object.hasOwn(record, key) && typeof record[key] !== "string") throw new Error(`command: invalid ${key}`);
}
function index(value: number, length: number): void {
  if (!Number.isInteger(value) || value < 0 || value > length) throw new Error("command: index out of range");
}
function page(document: ComposerDocument, id: string): ComposerPage {
  const result = document.pages.find((entry) => entry.id === id);
  if (!result) throw new Error(`command: unknown page ${id}`);
  return result;
}
function frame(document: ComposerDocument, pageId: string, id: string): ComposerFrame {
  const result = page(document, pageId).frames.find((entry) => entry.id === id);
  if (!result) throw new Error(`command: unknown frame ${id}`);
  return result;
}
function reorder<T>(items: T[], item: T, destination: number): void {
  index(destination, items.length - 1);
  items.splice(items.indexOf(item), 1);
  items.splice(destination, 0, item);
}
function visit(root: PageNode, callback: (node: PageNode) => void): void {
  callback(root);
  for (const child of root.children ?? []) visit(child, callback);
}
function duplicateFrame(document: ComposerDocument, source: ComposerFrame, ids: ComposerFrameIdRemap, usedNodes: Set<string>, usedFrames = new Set(document.pages.flatMap((entry) => entry.frames.map((item) => item.id)))): ComposerFrame {
  exact(ids, ["frameId", "nodeIds"]);
  if (typeof ids.frameId !== "string" || ids.frameId === source.id ||
    usedFrames.has(ids.frameId))
    throw new Error("command: duplicate frame id collision");
  const sourceIds: string[] = [];
  visit(source.root, (node) => sourceIds.push(node.id));
  exact(ids.nodeIds, sourceIds);
  const copy = structuredClone(source);
  copy.id = ids.frameId;
  visit(copy.root, (node) => {
    const target = ids.nodeIds[node.id];
    if (typeof target !== "string" || usedNodes.has(target)) throw new Error("command: duplicate node id collision");
    usedNodes.add(target);
    node.id = target;
  });
  const parsed = parseComposerFrame(copy);
  usedFrames.add(parsed.id);
  return parsed;
}
function duplicatePage(document: ComposerDocument, source: ComposerPage, ids: ComposerPageIdRemap, usedNodes: Set<string>, usedPages: Set<string>, usedFrames: Set<string>): ComposerPage {
  exact(ids, ["pageId", "frames"]);
  if (typeof ids.pageId !== "string" || usedPages.has(ids.pageId)) throw new Error("command: duplicate page id collision");
  exact(ids.frames, source.frames.map((item) => item.id));
  const copy = parseComposerPage({ ...source, id: ids.pageId, frames: source.frames.map((item) => duplicateFrame(document, item, ids.frames[item.id], usedNodes, usedFrames)) });
  usedPages.add(copy.id);
  return copy;
}
function existingNodes(document: ComposerDocument): Set<string> {
  const used = new Set<string>();
  for (const entry of document.pages) for (const item of entry.frames) visit(item.root, (node) => used.add(node.id));
  return used;
}

/**
 * Pure, atomic project batch (at most 100 commands; each node adapter batch at most 100).
 * Each project operation validates model quotas; node batches retain legacy final-tree validation.
 * Reorder indexes address the list AFTER removal; insertion/duplication indexes address the current list.
 * A validated catalog is required only for changeProjectSystem. Missing existing references survive other edits.
 * Built-in compatibility is enforced by the page parser, not by custom component mapping.
 */
export function applyComposerCommands(input: unknown, commands: readonly ComposerCommand[], systems?: ComposerSystemCatalog): ComposerDocument {
  let document = parseComposerDocument(input);
  if (!Array.isArray(commands) || commands.length > 100) throw new Error("command: invalid batch or batch limit exceeded");
  dataOnly(commands);
  for (const command of commands) {
    tagged(command, commandKeys);
    switch (command.type) {
      case "moveNode": {
        if (!Array.isArray(command.wrapperIds) || command.wrapperIds.some((id: unknown) => typeof id !== "string")) throw new Error("command: invalid wrapper IDs");
        let serial = 0;
        const result = prepareMove(document, command, () => {
          const id = command.wrapperIds[serial++];
          if (!id) throw new Error("command: missing wrapper ID");
          return id;
        });
        if (serial !== command.wrapperIds.length) throw new Error("command: unused wrapper IDs");
        document = result.document;
        break;
      }
      case "saveAsset": {
              const asset = parseComposerAsset(command.asset);
              if (document.assets?.some(entry => entry.id === asset.id)) throw new Error("command: duplicate asset id");
              (document.assets ??= []).push(asset);
              break;
            }
            case "renameAsset":
            case "deleteAsset": {
              const asset = document.assets?.find(entry => entry.id === command.assetId);
              if (!asset) throw new Error("command: saved component is no longer available");
              if (command.type === "renameAsset") asset.name = command.name;
              else document.assets!.splice(document.assets!.indexOf(asset), 1);
              break;
            }
            case "renameProject": document.name = command.name; break;
      case "changeProjectSystem":
        if (!systems) throw new Error("command: system catalog required");
        validateComposerSystemReference({ systemId: command.systemId }, systems);
        document.systemId = command.systemId;
        break;
      case "insertPage":
        index(command.index, document.pages.length);
        document.pages.splice(command.index, 0, parseComposerPage(command.page));
        break;
      case "renamePage": page(document, command.pageId).name = command.name; break;
      case "deletePage": {
        const target = page(document, command.pageId);
        document.pages.splice(document.pages.indexOf(target), 1);
        break;
      }
      case "duplicatePage": {
        const source = page(document, command.pageId);
        index(command.index, document.pages.length);
        const copy = duplicatePage(document, source, command.ids, existingNodes(document),
          new Set(document.pages.map((entry) => entry.id)),
          new Set(document.pages.flatMap((entry) => entry.frames.map((item) => item.id))));
        document.pages.splice(command.index, 0, copy);
        break;
      }
      case "reorderPage": reorder(document.pages, page(document, command.pageId), command.index); break;
      case "insertFrame": {
        const target = page(document, command.pageId);
        index(command.index, target.frames.length);
        target.frames.splice(command.index, 0, parseComposerFrame(command.frame));
        break;
      }
      case "renameFrame": frame(document, command.pageId, command.frameId).name = command.name; break;
      case "deleteFrame": {
        const target = page(document, command.pageId);
        const item = frame(document, command.pageId, command.frameId);
        target.frames.splice(target.frames.indexOf(item), 1);
        break;
      }
      case "duplicateFrame": {
        const target = page(document, command.pageId);
        const source = frame(document, command.pageId, command.frameId);
        index(command.index, target.frames.length);
        target.frames.splice(command.index, 0, duplicateFrame(document, source, command.ids, existingNodes(document)));
        break;
      }
      case "reorderFrame": reorder(page(document, command.pageId).frames, frame(document, command.pageId, command.frameId), command.index); break;
      case "updateFrameGeometry": {
        const target = frame(document, command.pageId, command.frameId);
        exact(command.geometry, ["x", "y", "width", "height"], ["x", "y", "width", "height"]);
        for (const key of ["x", "y", "width", "height"] as const) {
          if (Object.hasOwn(command.geometry, key)) {
            const value = command.geometry[key];
            if (typeof value !== "number") throw new Error("command: invalid geometry");
            if ((key === "width" || key === "height") && target[key] !== value) target.preset = "custom";
            target[key] = value;
          }
        }
        break;
      }
      case "nodeCommands": {
        if (!Array.isArray(command.commands) || command.commands.length > 100) throw new Error("command: invalid node batch");
        for (const node of command.commands) tagged(node, nodeKeys, true);
        const target = frame(document, command.pageId, command.frameId);
        target.root = applyPageCommands(composerFrameToPageDocument(target), command.commands).root;
        break;
      }
    }
    document = parseComposerDocument(document);
  }
  return document;
}

/**
 * Pure new-project copy with exact source-page -> page/frame/node maps; node source keys are frame-scoped.
 * New IDs cannot reuse source IDs in their namespace; new node IDs are unique across the copy.
 * Keeps systemId as a reference, including missing systems. No token copy, catalog access or registration.
 * The controller opens the returned project with createComposerHistory: fresh history, source unchanged.
 * Deliberately not a command that changes project identity inside the source history.
 */
export function duplicateComposerProject(input: unknown, projectId: string, name: string, pages: Record<string, ComposerPageIdRemap>): ComposerDocument {
  const document = parseComposerDocument(input);
  dataOnly({ projectId, name, pages });
  if (projectId === document.id) throw new Error("command: duplicate project id collision");
  exact(pages, document.pages.map((entry) => entry.id));
  const usedNodes = existingNodes(document);
  const usedPages = new Set(document.pages.map((entry) => entry.id));
  const usedFrames = new Set(document.pages.flatMap((entry) => entry.frames.map((item) => item.id)));
  return parseComposerDocument({ ...document, id: projectId, name,
    pages: document.pages.map((source) => duplicatePage(document, source, pages[source.id], usedNodes, usedPages, usedFrames)),
  });
}

export function applyComposerCommand(input: unknown, command: ComposerCommand, systems?: ComposerSystemCatalog): ComposerDocument {
  return applyComposerCommands(input, [command], systems);
}
