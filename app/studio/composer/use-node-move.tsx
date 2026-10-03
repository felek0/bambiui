"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { canvasTarget, rectOf, type CanvasTarget } from "./canvas-target";
import { moveProposalCache } from "./movement";
import { startPointerDrag } from "./pointer-drag";
import type { Composer } from "./use-composer";
import { clipRect, type Rect } from "./selection";
import styles from "./composer.module.css";

type Ghost = { x: number; y: number; source: Rect | null; target: CanvasTarget | null; valid: boolean; hint: string; position?: number };
export function useNodeMove(composer: Composer, edgePan: (point: { x: number; y: number }) => boolean) {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), [composer.document, composer.page?.id, composer.state.mode]);
  const down = (event: ReactPointerEvent<HTMLDivElement>, frameId: string, nodeId: string) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || composer.state.mode !== "design" || !composer.document || !composer.page || composer.state.indexBlocked || composer.state.partial) return;
    const expected = composer.document, pageId = composer.page.id, session = composer.controller.insertionSession();
    const element = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-page-node]')).find(element => element.dataset.pageNode === nodeId);
    if (!element) return;
    const surface = event.currentTarget;
    const sourceRect = () => {
      const viewport = surface.closest('[data-camera-zoom]');
      if (!viewport) return null;
      const bounds = rectOf(viewport), frame = rectOf(surface), node = rectOf(element);
      const x = Math.max(bounds.x, frame.x), y = Math.max(bounds.y, frame.y);
      const width = Math.max(0, Math.min(bounds.x + bounds.width, frame.x + frame.width) - x);
      const height = Math.max(0, Math.min(bounds.y + bounds.height, frame.y + frame.height) - y);
      const clipped = clipRect({ ...node, x: node.x - x, y: node.y - y }, width, height);
      return clipped ? { ...clipped, x: clipped.x + x, y: clipped.y + y } : null;
    };
    const cache = moveProposalCache(expected, { pageId, sourceFrameId: frameId, nodeId });
    let unsubscribe = () => {};
    const abort = startPointerDrag({ owner: composer.controller, source: event.currentTarget, event,
      onMove: point => {
        const panning = edgePan(point), target = canvasTarget(composer, point, true), proposal = target && cache(target);
        setGhost({ ...point, source: sourceRect(), target, valid: !!proposal?.ok, hint: proposal?.hint ?? "No visible move slot", position: proposal?.ok ? proposal.index + 1 : undefined });
        return panning;
      },
      onFinish: (commit, moved, point) => {
        unsubscribe(); cancel.current = null; setGhost(null);
        if (!commit || !moved) return;
        const target = canvasTarget(composer, point, true), proposal = target && cache(target);
        if (proposal?.ok) composer.controller.move({ projectId: expected.id, ...proposal.target }, expected, session);
        else composer.controller.report(proposal?.hint ?? "No visible move slot");
      },
    });
    if (!abort) return;
    cancel.current = abort;
    unsubscribe = composer.controller.subscribe(() => {
      const active = composer.controller.active();
      if (active?.history.present !== expected || active.pageId !== pageId || composer.controller.insertionSession() !== session) abort();
    });
  };
  const overlay = ghost && createPortal(<div className={styles.insertOverlay} data-node-move-valid={ghost.valid} data-insertion-valid={ghost.valid}>
    {ghost.source && <div data-move-source className={styles.moveSource} style={{ left: ghost.source.x, top: ghost.source.y, width: ghost.source.width, height: ghost.source.height }} />}
    {ghost.target && <><div data-move-target className={styles.dropHighlight} style={{ left: ghost.target.rect.x, top: ghost.target.rect.y, width: ghost.target.rect.width, height: ghost.target.rect.height }} />{ghost.valid && ghost.target.line && <div className={styles.insertionLine} style={{ left: ghost.target.line.x, top: ghost.target.line.y, width: ghost.target.line.width, height: ghost.target.line.height }} />}</>}
    <div className={styles.insertGhost} style={{ left: ghost.x + 14, top: ghost.y + 14 }}>Move · {ghost.hint}{ghost.target && ` · ${ghost.target.frameId}/${ghost.target.parentId}`}{ghost.position && ` · position ${ghost.position}`} · source stays until drop</div>
  </div>, document.body);
  return { down, overlay };
}
