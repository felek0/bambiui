import { applyPageCommands, type PageCommand } from "../page-document/commands.ts";
import { createComponentNode, parseComponentDefaults, type ComponentDefaults } from "../component-defaults.ts";
import { parsePageDocument, type PageDocument, type PageKind, type PageNode } from "../page-document/model.ts";
import { nodeRegistry } from "../page-document/registry.ts";

export const INSERT_KINDS = ["button", "input", "switch", "checkbox", "badge", "card", "text", "stack", "grid"] as const;
export type InsertKind = typeof INSERT_KINDS[number];
type InsertCommand = Extract<PageCommand, { type: "insert" }>;
export type InsertionResult =
  | { ok: true; commands: InsertCommand[]; page: PageDocument; nodeId: string; wrappers: { id: string; kind: PageKind }[]; hint: string }
  | { ok: false; hint: string };

/** A palette insertion snapshots the linked System's parameters, never local styles. */
export function createInsertionNode(kind: InsertKind, nextId: () => string, defaults?: ComponentDefaults): PageNode {
  if (!INSERT_KINDS.includes(kind)) throw new Error("Unsupported insertion kind.");
  return createComponentNode(kind, nextId, defaults);
}

/** Per-gesture/per-frame validation cache. Temporary IDs never consume the controller allocator. */
export function insertionProposalCache(page: PageDocument, kind: InsertKind, defaults?: ComponentDefaults) {
  const snapshot = defaults === undefined ? undefined : parseComponentDefaults(defaults);
  const used = new Set<string>();
  const visit = (node: PageNode) => { used.add(node.id); node.children?.forEach(visit); };
  visit(page.root);
  const cache = new Map<string, InsertionResult>();
  return (target: { parentId: string; index: number }): InsertionResult => {
    const key = JSON.stringify([target.parentId, target.index]);
    const previous = cache.get(key);
    if (previous) return previous;
    let serial = 0;
    const nextId = () => { let id: string; do { id = `insert${++serial}`; } while (used.has(id)); return id; };
    const proposal = proposeInsertion(page, target, kind, nextId, snapshot);
    cache.set(key, proposal);
    return proposal;
  };
}

function find(node: PageNode, id: string): PageNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) { const found = find(child, id); if (found) return found; }
}

/** Exact target only. Wrapper subtree is one insert/one history step; no ancestor fallback. */
export function proposeInsertion(input: unknown, target: { parentId: string; index: number }, kind: InsertKind, nextId: () => string, defaults?: ComponentDefaults): InsertionResult {
  try {
    const page = parsePageDocument(input);
    const parent = find(page.root, target.parentId);
    if (!parent?.children) throw new Error("Target has no insertion slot.");
    if (!Number.isInteger(target.index) || target.index < 0 || target.index > parent.children.length) throw new Error("Insertion index out of range.");
    const node = createInsertionNode(kind, nextId, defaults);
    const { commands, wrappers, hint } = placement(page.root, target, node, nextId);
    const result = applyPageCommands(page, commands);
    return { ok: true, commands, page: result, nodeId: node.id, wrappers, hint };
  } catch (error) {
    return { ok: false, hint: error instanceof Error ? error.message : "Invalid insertion." };
  }
}

/** Shared exact-slot adapter; accepts an interim tree during atomic moves. */
export function placement(root: PageNode, target: { parentId: string; index: number }, node: PageNode, nextId: () => string) {
    const parent = find(root, target.parentId);
    if (!parent?.children) throw new Error("Target has no insertion slot.");
    if (!Number.isInteger(target.index) || target.index < 0 || target.index > parent.children.length) throw new Error("Insertion index out of range.");
    const kind = node.kind;
    const wrappers: { id: string; kind: PageKind }[] = [];
    let inserted = node;
    let parentId = parent.id;
    let index = target.index;
    let hint = "Insert into selected slot.";
    const wrap = (wrapperKind: "stack" | "gridItem" | "cardContent", message: string) => {
      inserted = { id: nextId(), kind: wrapperKind, children: [node] };
      wrappers.push({ id: inserted.id, kind: wrapperKind });
      hint = message;
    };
    if (!nodeRegistry[parent.kind].children.includes(kind)) {
      if (parent.kind === "container" && ["button", "input", "switch", "checkbox"].includes(kind)) {
        wrap("stack", "Insert with an explicit Stack wrapper at the frame root.");
      } else if (parent.kind === "grid" && nodeRegistry.gridItem.children.includes(kind)) {
        wrap("gridItem", "Insert with an explicit Grid.Item wrapper.");
      } else if (parent.kind === "card" && nodeRegistry.cardContent.children.includes(kind)) {
        const content = parent.children.find(child => child.kind === "cardContent");
        if (content) {
          parentId = content.id;
          index = content.children!.length;
          hint = "Append into this Card's existing Card.Content slot (not its header).";
        } else {
          wrap("cardContent", "Insert with an explicit Card.Content slot (not its header).");
        }
      } else throw new Error(`Cannot insert ${kind} into ${parent.kind}; choose a valid slot.`);
    }
    const commands: InsertCommand[] = [{ type: "insert", parentId, index, node: inserted }];
    return { commands, wrappers, hint };
}
