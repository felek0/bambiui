import type { PageKind, PageNode } from "./model.ts";
import { nodeRegistry } from "./registry.ts";

/** Optional design props stay omitted, preserving component/token inheritance. */
export function createPageNode(kind: PageKind, nextId: () => string, formAction = "/"): PageNode {
  const definition = nodeRegistry[kind];
  const node: PageNode = { id: nextId(), kind };
  if (definition.text) node.text = kind === "button" ? "Button" : kind === "badge" ? "Badge" : kind === "cardTitle" ? "Card title" : kind === "cardDescription" ? "Card description" : "New text";
  for (const key of definition.requiredProps ?? []) {
    const rule = definition.props[key];
    const value = rule === "action" ? formAction : rule === "name" ? node.id : rule === "text" ? "New field" : typeof rule === "string" ? "Value" : rule[0];
    node.props = { ...node.props, [key]: value };
  }
  if (definition.children.length) node.children = definition.allowEmpty ? [] : [createPageNode(definition.children[0] as PageKind, nextId, formAction)];
  return node;
}
