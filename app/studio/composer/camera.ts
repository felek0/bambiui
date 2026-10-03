export type Point = { x: number; y: number };
export type Camera = Point & { zoom: number };
export type Bounds = Point & { width: number; height: number };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const INITIAL_CAMERA: Camera = { x: 32, y: 56, zoom: 0.5 };
export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
export const toScene = (point: Point, camera: Camera): Point => ({ x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom });
export const toViewport = (point: Point, camera: Camera): Point => ({ x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y });
export function zoomAt(camera: Camera, zoom: number, pointer: Point): Camera {
  const scene = toScene(pointer, camera), next = clampZoom(zoom);
  return { x: pointer.x - scene.x * next, y: pointer.y - scene.y * next, zoom: next };
}
export function sceneBounds(items: readonly Bounds[]): Bounds | null {
  if (!items.length) return null;
  const x = Math.min(...items.map(item => item.x)), y = Math.min(...items.map(item => item.y - 36));
  return { x, y, width: Math.max(...items.map(item => item.x + item.width)) - x, height: Math.max(...items.map(item => item.y + item.height)) - y };
}
export function fitCamera(bounds: Bounds | null, viewport: { width: number; height: number }, padding = 32): Camera {
  if (!bounds) return { ...INITIAL_CAMERA };
  const zoom = clampZoom(Math.min(Math.max(1, viewport.width - padding * 2) / Math.max(1, bounds.width), Math.max(1, viewport.height - padding * 2) / Math.max(1, bounds.height)));
  return { x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom, y: (viewport.height - bounds.height * zoom) / 2 - bounds.y * zoom, zoom };
}
