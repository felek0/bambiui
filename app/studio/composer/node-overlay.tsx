"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { ComposerFrame } from "./model";
import { clipRect } from "./selection";
import { nodeRegistry } from "../page-document/registry";
import styles from "./composer.module.css";

/** Two measured targets only; movement never parses a document or scans the tree. */
export function NodeOverlay({ surface, content, frame, selectedId, hoverId, kinds }: { surface: RefObject<HTMLDivElement | null>; content: RefObject<HTMLDivElement | null>; frame: ComposerFrame; selectedId: string | null; hoverId: string | null; kinds: Map<string, keyof typeof nodeRegistry> }) {
  const selected = useRef<HTMLDivElement>(null), hover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = surface.current, root = content.current; if (!container || !root) return;
    let raf = 0;
    const elements = new Map([...root.querySelectorAll<HTMLElement>("[data-page-node]")].map(element => [element.dataset.pageNode!, element]));
    const paint = () => {
      raf = 0;
      const bounds = container.getBoundingClientRect(), scale = bounds.width / frame.width;
      for (const [id, overlay] of [[selectedId, selected.current], [hoverId === selectedId ? null : hoverId, hover.current]] as const) {
        if (!overlay) continue;
        const target = id ? elements.get(id) : null;
        const rect = target?.getBoundingClientRect();
        const clipped = rect && scale > 0 ? clipRect({ x: (rect.x - bounds.x) / scale, y: (rect.y - bounds.y) / scale, width: rect.width / scale, height: rect.height / scale }, frame.width, frame.height) : null;
        overlay.hidden = !clipped;
        if (clipped) { Object.assign(overlay.style, { left: `${clipped.x}px`, top: `${clipped.y}px`, width: `${clipped.width}px`, height: `${clipped.height}px`, "--overlay-line": `${1.5 / scale}px`, "--overlay-label-scale": String(1 / scale) }); }
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const resize = new ResizeObserver(schedule); resize.observe(root); resize.observe(container);
    for (const id of [selectedId, hoverId]) { const target = id && elements.get(id); if (target) resize.observe(target); }
    // Ancestor transforms cover camera zoom/pan and temporary frame-title drag.
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    let ancestor: HTMLElement | null = container.parentElement;
    while (ancestor && !ancestor.hasAttribute("data-camera-zoom")) { mutation.observe(ancestor, { attributes: true, attributeFilter: ["style"] }); ancestor = ancestor.parentElement; }
    root.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
    schedule();
    return () => { resize.disconnect(); mutation.disconnect(); root.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); if (raf) cancelAnimationFrame(raf); };
  }, [surface, content, frame, selectedId, hoverId]);
  return <div className={styles.overlayLayer} aria-hidden="true">
    <div ref={hover} hidden className={styles.nodeOutline} data-node-overlay="hover"><span>{hoverId && kinds.has(hoverId) ? nodeRegistry[kinds.get(hoverId)!].element : ""}</span></div>
    <div ref={selected} hidden className={styles.nodeOutline} data-node-overlay="selected"><span data-node-move-handle={selectedId ?? undefined} title="Drag to move this instance">{selectedId && kinds.has(selectedId) ? nodeRegistry[kinds.get(selectedId)!].element : ""} · selected ⠿</span></div>
  </div>;
}
