import { parseComposerDocument, type ComposerDocument } from "./model.ts";
import { flattenNodes, nodePath } from "./selection.ts";
import { placement } from "./insertion.ts";

export type MoveTarget = { pageId: string; sourceFrameId: string; nodeId: string; frameId: string; parentId: string; index: number };

/** Authoritative indexes are AFTER removal. Validate both final trees, never an interim source. */
export function prepareMove(input: unknown, target: MoveTarget, nextId: () => string) {
  const document = parseComposerDocument(input);
  const page = document.pages.find(page => page.id === target.pageId);
  const source = page?.frames.find(frame => frame.id === target.sourceFrameId);
  const destination = page?.frames.find(frame => frame.id === target.frameId);
  if (!source || !destination) throw new Error("Move is restricted to frames on the current page.");
  const path = nodePath(source.root, target.nodeId), node = path.at(-1), parent = path.at(-2);
  if (!node || !parent) throw new Error("Frame roots cannot move; select an existing instance.");
  if (source === destination && nodePath(node, target.parentId).length) throw new Error("Cannot move into self or descendant.");
  if (source !== destination) {
    const used = new Set(flattenNodes(destination.root).map(({ node }) => node.id));
    if (flattenNodes(node).some(({ node }) => used.has(node.id))) throw new Error("Node ID collision in destination; move rejected (not copied).");
  }
  parent.children!.splice(parent.children!.findIndex(child => child.id === node.id), 1);
  const plan = placement(destination.root, target, node, nextId);
  const command = plan.commands[0];
  const slot = nodePath(destination.root, command.parentId).at(-1)!;
  slot.children!.splice(command.index, 0, command.node);
  return { document: parseComposerDocument(document), wrappers: plan.wrappers, hint: plan.hint.replaceAll("Insert", "Move").replaceAll("insert", "move"), parentId: command.parentId, index: command.index };
}

/** Convert the painted, pre-removal gap to the authoritative index exactly once. */
export function moveIndex(document: ComposerDocument, target: MoveTarget): number {
  if (target.sourceFrameId !== target.frameId) return target.index;
  const root = document.pages.find(page => page.id === target.pageId)?.frames.find(frame => frame.id === target.frameId)?.root;
  const parent = root && nodePath(root, target.nodeId).at(-2);
  const sourceIndex = parent?.children?.findIndex(node => node.id === target.nodeId) ?? -1;
  return parent?.id === target.parentId && sourceIndex >= 0 && sourceIndex < target.index ? target.index - 1 : target.index;
}

export function moveProposalCache(document: ComposerDocument, source: Pick<MoveTarget, "pageId" | "sourceFrameId" | "nodeId">) {
  const cache = new Map<string, ReturnType<typeof proposal>>();
  const used = new Set(document.pages.flatMap(page => page.frames.flatMap(frame => flattenNodes(frame.root).map(({ node }) => node.id))));
  function proposal(target: Pick<MoveTarget, "frameId" | "parentId" | "index">) {
    try {
      let serial = 0;
      const nextId = () => { let id: string; do { id = `move${++serial}`; } while (used.has(id)); return id; };
      const scope: MoveTarget = { ...source, frameId: target.frameId, parentId: target.parentId, index: target.index };
      const index = moveIndex(document, scope);
      return { ok: true as const, ...prepareMove(document, { ...scope, index }, nextId), target: { ...scope, index } };
    } catch (error) { return { ok: false as const, hint: error instanceof Error ? error.message : "Invalid move." }; }
  }
  return (target: Pick<MoveTarget, "frameId" | "parentId" | "index">) => {
    const key = JSON.stringify([target.frameId, target.parentId, target.index]);
    let result = cache.get(key);
    if (!result) { result = proposal(target); cache.set(key, result); }
    return result;
  };
}
