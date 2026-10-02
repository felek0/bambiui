import { applyPageCommand, type PageCommand } from "../../studio/page-document/commands.ts";
import type { PageDocument, PageNode, PageKind } from "../../studio/page-document/model.ts";
import { nodeRegistry } from "../../studio/page-document/registry.ts";

export function locateNode(root: PageNode, id: string, ancestors: PageNode[] = []): { node: PageNode; ancestors: PageNode[]; index: number } | undefined {
  if (root.id === id) return { node: root, ancestors, index: ancestors.at(-1)?.children?.findIndex((node) => node.id === id) ?? 0 };
  for (const child of root.children ?? []) {
    const found = locateNode(child, id, [...ancestors, root]);
    if (found) return found;
  }
}

export function allowedChildKinds(root: PageNode, parentId: string): PageKind[] {
  const found = locateNode(root, parentId);
  if (!found) return [];
  const definition = nodeRegistry[found.node.kind];
  const insideForm = [...found.ancestors, found.node].some((node) => node.kind === "form");
  return (definition.children as PageKind[]).filter((kind) =>
    !(insideForm && kind === "form") &&
    !(definition.uniqueSlots && found.node.children?.some((child) => child.kind === kind)),
  );
}

export type MoveDestination = { parentId: string; label: string; command: Extract<PageCommand, { type: "move" }> };

/** Preorder paths use stable IDs, not potentially identical display names. */
export function eligibleMoveDestinations(page: PageDocument, nodeId: string): MoveDestination[] {
  const source = locateNode(page.root, nodeId);
  const parent = source?.ancestors.at(-1);
  if (!source || !parent) return [];
  const destinations: MoveDestination[] = [];
  function visit(node: PageNode, path: string[]) {
    if (node.id === nodeId) return;
    const nextPath = [...path, `${nodeRegistry[node.kind].element} [${node.id}]`];
    if (node.children && node.id !== parent!.id) {
      const command = { type: "move" as const, nodeId, parentId: node.id, index: node.children.length };
      try {
        applyPageCommand(page, command);
        destinations.push({ parentId: node.id, label: nextPath.join(" / "), command });
      } catch {
        // The command engine owns source, destination and final-tree validation.
      }
    }
    node.children?.forEach((child) => visit(child, nextPath));
  }
  visit(page.root, []);
  return destinations;
}

/** Optional props stay omitted to preserve the real components' defaults. */
export function createEditorNode(kind: PageKind, nextId: () => string): PageNode {
  const definition = nodeRegistry[kind];
  const node: PageNode = { id: nextId(), kind };
  if (definition.text) node.text = kind === "button" ? "Button" : kind === "cardTitle" ? "Card title" : kind === "cardDescription" ? "Card description" : "New text";
  for (const key of definition.requiredProps ?? []) {
    const rule = definition.props[key];
    const value = rule === "action" ? "/examples/page-editor" : rule === "name" ? node.id : rule === "text" ? "New field" : typeof rule === "string" ? "Value" : rule[0];
    node.props = { ...node.props, [key]: value };
  }
  if (definition.children.length) {
    node.children = definition.allowEmpty ? [] : [createEditorNode(definition.children[0] as PageKind, nextId)];
  }
  return node;
}
