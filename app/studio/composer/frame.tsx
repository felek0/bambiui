"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { RenderPage } from "../page-document/render";
import { toCSSVariables, type DesignSystem } from "../tokens";
import type { PaletteMode } from "../color-engine";
import type { ComposerFrame } from "./model";
import styles from "./composer.module.css";
import { flattenNodes } from "./selection";
import { NodeOverlay } from "./node-overlay";

export const Frame = memo(function Frame({ frame, selected, system, theme, onSelect, onSelectNode, selectedNodeId, preview, onMoveNode }: { frame: ComposerFrame; selected: boolean; system: DesignSystem | null; theme: PaletteMode; onSelect: (id: string) => void; onSelectNode: (frameId: string, nodeId: string) => void; selectedNodeId: string | null; preview: boolean; onMoveNode: (event: PointerEvent<HTMLDivElement>, frameId: string, nodeId: string) => void }) {
  const surface = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const renderKey = useMemo(() => JSON.stringify(frame.root), [frame.root]);
  const kinds = useMemo(() => new Map(flattenNodes(frame.root).map(({ node }) => [node.id, node.kind])), [frame.root]);
  useEffect(() => {
    const root = content.current; if (!root || preview) return;
    const saved = new Map<HTMLElement, string | null>();
    const suppress = () => { for (const element of root.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')) { if (!saved.has(element)) saved.set(element, element.getAttribute('tabindex')); if (element.tabIndex !== -1) element.tabIndex = -1; } };
    suppress(); const observer = new MutationObserver(suppress); observer.observe(root, { subtree: true, childList: true });
    return () => { observer.disconnect(); for (const [element, value] of saved) { if (value === null) element.removeAttribute('tabindex'); else element.setAttribute('tabindex', value); } };
  }, [preview, frame.root]);
  const targetNode = (target: EventTarget) => {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-page-node]") : null;
    return element && content.current?.contains(element) && kinds.has(element.dataset.pageNode!) ? element.dataset.pageNode! : null;
  };
  const variables = system ? toCSSVariables(system.themes[theme], theme) : {};
  return <div className={styles.frame} data-frame-id={frame.id} data-selected={selected || undefined} style={{ left: frame.x, top: frame.y, width: frame.width }}>
    <button type="button" className={styles.frameTitle} data-frame-title={frame.id} aria-label={`Select frame ${frame.name}`} aria-pressed={selected} onClick={() => onSelect(frame.id)}>
      {frame.name} · {frame.width} × {frame.height}
    </button>
    <div ref={surface} className={styles.frameSurface} data-frame-surface data-editor-mode={preview ? "preview" : "design"}
          onPointerMove={event => { if (!preview) { const id = targetNode(event.target); setHoverId(previous => previous === id ? previous : id); } }} onPointerLeave={() => setHoverId(null)}
          onPointerDownCapture={event => { if (preview || event.button !== 0 || event.currentTarget.closest('[data-camera-zoom]')?.hasAttribute('data-pan-ready')) return; event.preventDefault(); event.stopPropagation(); const handle = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-node-move-handle]') : null; const id = handle?.dataset.nodeMoveHandle ?? targetNode(event.target); if (id && id !== frame.root.id) { onSelectNode(frame.id, id); onMoveNode(event, frame.id, id); } else onSelect(frame.id); event.currentTarget.closest<HTMLElement>('[data-camera-zoom]')?.focus({ preventScroll: true }); }}
          onClickCapture={event => { if (!preview) { event.preventDefault(); event.stopPropagation(); } }}
          onKeyDownCapture={event => { if (!preview) { event.preventDefault(); event.stopPropagation(); } }}
          onFocusCapture={event => { if (!preview && event.target !== event.currentTarget) event.currentTarget.closest<HTMLElement>('[data-camera-zoom]')?.focus({ preventScroll: true }); }}
          onSubmitCapture={event => { event.preventDefault(); event.stopPropagation(); }}
       data-ds-theme={system ? theme : undefined} style={{ ...variables, height: frame.height, colorScheme: theme, backgroundColor: system ? "var(--ds-background)" : undefined, color: system ? "var(--ds-foreground)" : undefined, fontFamily: system ? "var(--ds-font-family)" : undefined } as CSSProperties}>
      {system ? <div ref={content} className={styles.frameContent} aria-hidden={!preview || undefined}><RenderPage key={`${preview}-${renderKey}`} page={{ version: 1, id: "composer-frame", name: frame.name, root: frame.root }} /></div> : <p className={styles.frameHint}>Linked system unavailable. Content preserved.</p>}
      {system && !preview && <NodeOverlay surface={surface} content={content} frame={frame} selectedId={selectedNodeId} hoverId={hoverId} kinds={kinds} />}
      {system && !frame.root.children?.length && <div className={styles.frameHint}>Empty frame · Drop area<br />Drag from Insert or select this frame and click a palette item.</div>}
    </div>
    <p className={styles.frameFootnote}>Fixed-height editor preview clips overflow. Not an isolated viewport or export preview.</p>
  </div>;
});
