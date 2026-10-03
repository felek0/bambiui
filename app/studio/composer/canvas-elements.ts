/** Field labels/messages belong to the same design node as their native control. */
export function closestCanvasNode(target: Element | null): HTMLElement | null {
  return target?.closest<HTMLElement>("[data-page-node], [data-page-owner]") ?? null;
}
export function canvasNodeId(element: HTMLElement | null | undefined): string | undefined {
  return element?.dataset.pageOwner ?? element?.dataset.pageNode;
}
export function canvasNodeElements(root: Element): Map<string, HTMLElement> {
  const nodes = new Map<string, HTMLElement>();
  for (const element of root.querySelectorAll<HTMLElement>("[data-page-node]")) nodes.set(element.dataset.pageNode!, element);
  // Prefer the entire field for selection outlines, drag footprints and insertion gaps.
  for (const owner of root.querySelectorAll<HTMLElement>("[data-page-owner]")) nodes.set(owner.dataset.pageOwner!, owner);
  return nodes;
}
