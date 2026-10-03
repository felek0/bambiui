import type { ComposerFrameIdRemap } from "./commands.ts";
import { COMPOSER_LIMITS, type ComposerFrame } from "./model.ts";

export function frameIdRemap(frame: ComposerFrame, id: () => string): ComposerFrameIdRemap {
  const nodeIds: Record<string, string> = Object.create(null);
  const visit = (node: ComposerFrame["root"]) => { nodeIds[node.id] = id(); for (const child of node.children ?? []) visit(child); };
  visit(frame.root);
  return { frameId: id(), nodeIds };
}
export function nextFramePosition(frames: readonly ComposerFrame[]) {
  return { x: Math.min(COMPOSER_LIMITS.maxCoordinate, frames.length ? Math.max(...frames.map(frame => frame.x + frame.width)) + 80 : 0), y: 0 };
}
export function geometryDraft(value: string, field: "x" | "y" | "width" | "height"): number | null {
  if (!value.trim()) return null;
  const number = Number(value), dimension = field === "width" || field === "height";
  const min = dimension ? COMPOSER_LIMITS.minDimension : -COMPOSER_LIMITS.maxCoordinate;
  const max = dimension ? COMPOSER_LIMITS.maxDimension : COMPOSER_LIMITS.maxCoordinate;
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
export function movedFrame(frame: ComposerFrame, dx: number, dy: number) {
  const clamp = (value: number) => Math.max(-COMPOSER_LIMITS.maxCoordinate, Math.min(COMPOSER_LIMITS.maxCoordinate, value));
  return { x: clamp(frame.x + dx), y: clamp(frame.y + dy) };
}
