import type { PageNode, PageKind } from "../../studio/page-document/model.ts";
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
