import type { PageNode } from "../page-document/model.ts";
import { applyComposerCommand, type ComposerCommand } from "./commands.ts";
import { ASSET_ROOT_KINDS, COMPOSER_LIMITS, parseComposerAsset, type ComposerAsset, type ComposerDocument } from "./model.ts";
import { placement } from "./insertion.ts";
import { flattenNodes, resolveSelection, type NodeSelection } from "./selection.ts";

export type AssetInsertionTarget = { projectId: string; pageId: string; frameId: string; parentId: string; index: number };

function selectedRoot(document: ComposerDocument | null, selection: NodeSelection | null): PageNode {
  if (!document) throw new Error("Open a project to save a component.");
  const resolved = resolveSelection(document, selection);
  if (!resolved) throw new Error("Select a component or layout to save.");
  if (resolved.path.length === 1) throw new Error("Frame roots cannot be saved. Select a component or layout inside the frame.");
  if (!(ASSET_ROOT_KINDS as readonly string[]).includes(resolved.node.kind))
    throw new Error("Compound slots cannot be saved alone. Select their whole Card or Grid instead.");
  if ((document.assets?.length ?? 0) >= COMPOSER_LIMITS.assets)
    throw new Error(`This project has ${COMPOSER_LIMITS.assets} saved components. Delete one before saving another.`);
  return resolved.node;
}

/** A snapshot, not a linked definition. Preserve every validated node field, including nested overrides. */
export function createSelectionAsset(document: ComposerDocument, selection: NodeSelection | null, id: string, name: string): ComposerAsset {
  return parseComposerAsset({ id, name, root: structuredClone(selectedRoot(document, selection)) });
}

export function assetSelectionReason(document: ComposerDocument | null, selection: NodeSelection | null): string | null {
  try {
    parseComposerAsset({ id: "asset-preview", name: "Saved component", root: selectedRoot(document, selection) });
    return null;
  } catch (error) { return error instanceof Error ? error.message : "Selection cannot be saved."; }
}

/** Reserve IDs across live frames AND saved snapshots; repeated allocator values remain bounded and valid. */
export function assetIdAllocator(document: ComposerDocument, nextId: () => string): () => string {
  const used = new Set(document.assets?.map(asset => asset.id));
  const reserve = (root: PageNode) => { for (const { node } of flattenNodes(root)) used.add(node.id); };
  for (const page of document.pages) for (const frame of page.frames) reserve(frame.root);
  for (const asset of document.assets ?? []) reserve(asset.root);
  return () => {
    const base = nextId();
    if (typeof base !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(base)) throw new Error("Saved component allocator must return a valid node ID.");
    let id = base, serial = 0;
    while (used.has(id)) {
      const suffix = `-${++serial}`;
      id = `${base.slice(0, COMPOSER_LIMITS.idLength - suffix.length)}${suffix}`;
    }
    used.add(id); return id;
  };
}

/** Exact target, existing legal adapters, one project command. No ancestor fallback or master-instance link. */
export function prepareAssetInsertion(document: ComposerDocument, assetId: string, target: AssetInsertionTarget, nextId: () => string) {
  if (target.projectId !== document.id) throw new Error("Saved components can only be inserted into the current project.");
  const asset = document.assets?.find(asset => asset.id === assetId);
  if (!asset) throw new Error("Saved component is no longer available in this project.");
  const frame = document.pages.find(page => page.id === target.pageId)?.frames.find(frame => frame.id === target.frameId);
  if (!frame) throw new Error("Select an available frame before inserting a saved component.");
  const fresh = assetIdAllocator(document, nextId);
  const root = structuredClone(asset.root);
  for (const { node } of flattenNodes(root)) node.id = fresh();
  const proposal = placement(frame.root, target, root, fresh);
  const command: ComposerCommand = { type: "nodeCommands", pageId: target.pageId, frameId: target.frameId, commands: proposal.commands };
  // Includes project-wide quotas, nested forms, unique slots, node/depth limits and the strict PageNode parser.
  applyComposerCommand(document, command);
  const selection: NodeSelection = { projectId: document.id, pageId: target.pageId, frameId: frame.id, nodeId: root.id };
  return { command, selection, wrappers: proposal.wrappers, hint: proposal.hint };
}
