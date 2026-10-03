import type { Composer } from "./use-composer";
import { contains, insertionGeometry } from "./drop-target";
import { clipRect, nodePath, type Rect } from "./selection";

export type CanvasTarget = { frameId: string; parentId: string; index: number; rect: Rect; line: Rect | null };
export const rectOf = (element: Element): Rect => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
export function canvasTarget(composer: Composer, point: { x: number; y: number }, moving = false): CanvasTarget | null {
  let front = document.elementFromPoint(point.x, point.y);
  if (!moving && front?.closest('[data-node-move-handle]')) front = document.elementsFromPoint(point.x, point.y).find(element => element.closest('[data-page-node]')) ?? null;
  const surface = front?.closest<HTMLElement>('[data-frame-surface][data-editor-mode="design"]');
  const viewport = surface?.closest('[data-camera-zoom]');
  if (!surface || !viewport || !contains(rectOf(surface), point) || !contains(rectOf(viewport), point)) return null;
  const frameId = surface.closest<HTMLElement>('[data-frame-id]')?.dataset.frameId;
  const frame = composer.page?.frames.find(frame => frame.id === frameId);
  if (!frame || !surface.querySelector('[data-page-node]')) return null;
  const handleId = front?.closest<HTMLElement>('[data-node-move-handle]')?.dataset.nodeMoveHandle;
  const element = handleId ? Array.from(surface.querySelectorAll<HTMLElement>('[data-page-node]')).find(element => element.dataset.pageNode === handleId) : front?.closest<HTMLElement>('[data-page-node]');
  const path = element && surface.contains(element) ? nodePath(frame.root, element.dataset.pageNode!) : [frame.root];
  let parent = path.at(-1);
  // Moving over a leaf addresses its painted sibling gap, not an arbitrary valid ancestor.
  if (moving && parent && !parent.children) parent = path.at(-2);
  if (!parent) return null;
  const nodeElements = new Map(Array.from(surface.querySelectorAll<HTMLElement>('[data-page-node]')).map(element => [element.dataset.pageNode, element]));
  const parentElement = nodeElements.get(parent.id);
  if (!parentElement) return null;
  const bounds = parent === frame.root ? rectOf(surface) : rectOf(parentElement);
  const children = (parent.children ?? []).map(child => { const element = nodeElements.get(child.id); return element ? rectOf(element) : null; });
  const axis = parent.kind === 'grid' ? 'grid' : parent.kind === 'stack' && parent.props?.direction === 'row' ? 'row' : 'column';
  const geometry = insertionGeometry(bounds, children, point, axis);
  const clip = (rect: Rect, boundary: Rect): Rect | null => {
    const result = clipRect({ ...rect, x: rect.x - boundary.x, y: rect.y - boundary.y }, boundary.width, boundary.height);
    return result ? { ...result, x: result.x + boundary.x, y: result.y + boundary.y } : null;
  };
  const visible = clip(rectOf(surface), rectOf(viewport));
  const rect = visible && clip(bounds, visible);
  if (!rect) return null;
  return { frameId: frame.id, parentId: parent.id, index: geometry.index, line: clip(geometry.line, visible!), rect };
}
