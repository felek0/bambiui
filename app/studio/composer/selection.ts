import type { PageNode, PageProp } from "../page-document/model.ts";
import { nodeRegistry } from "../page-document/registry.ts";
import { applyPageCommands } from "../page-document/commands.ts";
import { composerFrameToPageDocument, type ComposerDocument } from "./model.ts";
import type { ComposerNodeCommand } from "./commands.ts";

export type NodeSelection = { projectId: string; pageId: string; frameId: string; nodeId: string };
export function nodePath(root: PageNode, id: string): PageNode[] {
  if (root.id === id) return [root];
  for (const child of root.children ?? []) { const path = nodePath(child, id); if (path.length) return [root, ...path]; }
  return [];
}
export function resolveSelection(document: ComposerDocument, selection: NodeSelection | null) {
  if (!selection || selection.projectId !== document.id) return null;
  const page = document.pages.find(page => page.id === selection.pageId);
  const frame = page?.frames.find(frame => frame.id === selection.frameId);
  const path = frame ? nodePath(frame.root, selection.nodeId) : [];
  return frame && path.length ? { frame, path, node: path[path.length - 1] } : null;
}
export function flattenNodes(root: PageNode, depth = 0): { node: PageNode; depth: number }[] {
  return [{ node: root, depth }, ...(root.children ?? []).flatMap(child => flattenNodes(child, depth + 1))];
}
/** A draft is validated through the same command/parser path as the actual mutation. */
export function draftCommand(document: ComposerDocument, selection: NodeSelection, field: string, draft: string | null): ComposerNodeCommand {
  const resolved = resolveSelection(document, selection); if (!resolved) throw new Error("Selection is no longer available");
  const { node, frame } = resolved;
  let command: ComposerNodeCommand;
  if (field === "text") { if (draft === null) throw new Error("Text is required"); command = { type: "update", nodeId: node.id, text: draft }; }
  else {
    const definition = nodeRegistry[node.kind], rule = definition.props[field];
    if (!rule) throw new Error("Unsupported property");
    const required = definition.requiredProps?.includes(field);
    if (draft === null && required) throw new Error(`${field} is required`);
        let value: PageProp | null = draft === "" && !required && rule !== "string" ? null : draft;
    if (value !== null && Array.isArray(rule)) {
      const match = rule.find(option => String(option) === draft);
      if (match === undefined) throw new Error(`Choose a valid ${field}`);
      value = match;
    }
    const props: Record<string, PageProp | null> = { [field]: value };
    // Choosing one binding explicitly replaces its counterpart in the same history action.
    const counterpart = field === "checked" ? "defaultChecked" : field === "defaultChecked" ? "checked" : node.kind === "input" && field === "value" ? "defaultValue" : field === "defaultValue" ? "value" : null;
    if (counterpart && value !== null) props[counterpart] = null;
    command = { type: "update", nodeId: node.id, props };
  }
  applyPageCommands(composerFrameToPageDocument(frame), [command]);
  return command;
}
export type Rect = { x: number; y: number; width: number; height: number };
export function clipRect(rect: Rect, width: number, height: number): Rect | null {
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  const right = Math.min(width, rect.x + rect.width), bottom = Math.min(height, rect.y + rect.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
