import type { PageNode } from "../page-document/model.ts";
import { nodeRegistry } from "../page-document/registry.ts";
import type { InsertKind } from "./insertion.ts";
import type { Rect } from "./selection.ts";

export function slotHint(parent: PageNode, kind: InsertKind): string | null {
  if (!parent.children) return null;
  if (nodeRegistry[parent.kind].children.includes(kind)) return `Insert into ${parent.kind}`;
  if (parent.kind === "container" && ["button", "input", "switch", "checkbox"].includes(kind)) return "Insert with an explicit Stack wrapper";
  if (parent.kind === "grid" && nodeRegistry.gridItem.children.includes(kind)) return "Insert with an explicit Grid.Item wrapper";
  if (parent.kind === "card" && nodeRegistry.cardContent.children.includes(kind)) return parent.children.some(child => child.kind === "cardContent") ? "Append into existing Card.Content (not header)" : "Insert with an explicit Card.Content wrapper";
  return null;
}
export function contains(rect: Rect, point: { x: number; y: number }) {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}
/** Client rectangles already include camera zoom, page scroll and pan. Never mix scene pixels with these. */
export function insertionGeometry(parent: Rect, children: (Rect | null)[], point: { x: number; y: number }, axis: "row" | "column" | "grid") {
  let index = children.length;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    const before = axis === "row" ? point.x < child.x + child.width / 2 : axis === "column" ? point.y < child.y + child.height / 2 : point.y < child.y || (point.y < child.y + child.height && point.x < child.x + child.width / 2);
    if (before) { index = i; break; }
  }
  const child = children[index] ?? children.findLast(child => child !== null);
  const row = axis !== "column";
  const edge = child ? (row ? child.x + (index === children.length ? child.width : 0) : child.y + (index === children.length ? child.height : 0)) : row ? parent.x : parent.y;
  return { index, line: row ? { x: edge, y: child?.y ?? parent.y, width: 2, height: child?.height ?? parent.height } : { x: parent.x, y: edge, width: parent.width, height: 2 } };
}
export function clientToScene(point: { x: number; y: number }, viewport: Rect, camera: { x: number; y: number; zoom: number }) {
  return { x: (point.x - viewport.x - camera.x) / camera.zoom, y: (point.y - viewport.y - camera.y) / camera.zoom };
}
