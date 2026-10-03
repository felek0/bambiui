import type { PageNode } from "../page-document/model.ts";
import { applyComposerCommand, type ComposerCommand } from "./commands.ts";
import type { ComposerDocument } from "./model.ts";
import { flattenNodes, resolveSelection, type NodeSelection } from "./selection.ts";

export const NODE_ACTIONS = ["duplicate", "selectParent", "wrapStack", "wrapGrid", "delete"] as const;
export type NodeAction = typeof NODE_ACTIONS[number];
export const ACTION_LABELS: Record<NodeAction, string> = { duplicate: "Duplicate instance", delete: "Delete instance", selectParent: "Select parent", wrapStack: "Wrap in Stack", wrapGrid: "Wrap in Grid" };

/** Exact source slot only: no insertion adapters, ancestor fallback or slot flattening. */
export function prepareNodeAction(document: ComposerDocument, selection: NodeSelection, action: NodeAction, nextId: () => string): { command: ComposerCommand | null; selection: NodeSelection } {
  const resolved = resolveSelection(document, selection);
  if (!resolved) throw new Error("Selection is no longer available.");
  const { node, path } = resolved, parent = path.at(-2);
  if (!parent) throw new Error("Frame root cannot be duplicated, deleted or wrapped; select the frame instead.");
  if (action === "selectParent") return { command: null, selection: { ...selection, nodeId: parent.id } };
  const index = parent.children!.findIndex(child => child.id === node.id);
  const used = new Set(document.pages.flatMap(page => page.frames.flatMap(frame => flattenNodes(frame.root).map(({ node }) => node.id))));
  const fresh = () => { const id = nextId(); if (used.has(id)) throw new Error("Action ID must be fresh."); used.add(id); return id; };
  let replacement: PageNode | null = null;
  if (action === "duplicate") {
    replacement = structuredClone(node);
    for (const { node: child } of flattenNodes(replacement)) child.id = fresh();
  } else if (action === "wrapStack" || action === "wrapGrid") {
    replacement = { id: fresh(), kind: action === "wrapStack" ? "stack" : "grid", children: action === "wrapStack" ? [structuredClone(node)] : [{ id: fresh(), kind: "gridItem", children: [structuredClone(node)] }] };
  } else if (action !== "delete") throw new Error("Unknown instance action.");
  const command: ComposerCommand = { type: "nodeCommands", pageId: selection.pageId, frameId: selection.frameId, commands: [
    ...(action === "duplicate" ? [] : [{ type: "delete" as const, nodeId: node.id }]),
    ...(replacement ? [{ type: "insert" as const, parentId: parent.id, index: index + (action === "duplicate" ? 1 : 0), node: replacement }] : []),
  ] };
  applyComposerCommand(document, command);
  return { command, selection: { ...selection, nodeId: replacement?.id ?? parent.id } };
}

/** Dry-run the authoritative validator without consuming the caller's allocator. */
export function nodeActionReason(document: ComposerDocument, selection: NodeSelection, action: NodeAction): string | null {
  let serial = 0;
  const used = new Set(document.pages.flatMap(page => page.frames.flatMap(frame => flattenNodes(frame.root).map(({ node }) => node.id))));
  try {
    prepareNodeAction(document, selection, action, () => { let id: string; do { id = `action${++serial}`; } while (used.has(id)); return id; });
    return null;
  } catch (error) { return error instanceof Error ? error.message : "Unavailable action."; }
}
