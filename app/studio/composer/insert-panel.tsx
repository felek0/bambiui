"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons";
import { INSERT_KINDS, insertionProposalCache, type InsertKind, type InsertionResult } from "./insertion";
import type { ComponentDefaults } from "../component-defaults";
import { composerFrameToPageDocument } from "./model";
import { canvasTarget as hit, type CanvasTarget as Target } from "./canvas-target";
import { nodePath } from "./selection";
import { startPointerDrag } from "./pointer-drag";
import type { Composer } from "./use-composer";
import styles from "./composer.module.css";

export function InsertPanel({ composer }: { composer: Composer }) {
  const [ghost, setGhost] = useState<{ kind: InsertKind; x: number; y: number; target: Target | null; valid: boolean; hint: string } | null>(null);
  const cancel = useRef<(() => void) | null>(null), suppressClick = useRef(false);
  const disabled = !composer.page || !composer.state.ready || composer.state.indexBlocked || !!composer.state.partial || composer.state.mode !== 'design';
  useEffect(() => () => cancel.current?.(), [composer.document, composer.page?.id, composer.state.mode]);
  const insertSelected = (kind: InsertKind) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (disabled) return;
    const frame = composer.page?.frames.find(frame => frame.id === composer.project?.frameId);
    if (!frame || !composer.document || !composer.page) { composer.controller.report('Select a frame or layout slot before inserting.'); return; }
    const parent = nodePath(frame.root, composer.project?.selection?.nodeId ?? frame.root.id).at(-1);
    if (!parent) return;
    composer.controller.insert({ projectId: composer.document.id, pageId: composer.page.id, frameId: frame.id, parentId: parent.id, index: parent.children?.length ?? 0 }, kind);
  };
  const down = (event: ReactPointerEvent<HTMLButtonElement>, kind: InsertKind) => {
    if (disabled || event.pointerType !== 'mouse' || event.button !== 0 || !composer.document || !composer.page) return;
    event.stopPropagation();
    const expected = composer.document, pageId = composer.page.id, session = composer.controller.insertionSession();
    let defaults: ComponentDefaults;
    try { defaults = composer.controller.insertionDefaults(); }
    catch (error) { composer.controller.report(error instanceof Error ? error.message : "Invalid System insertion defaults."); return; }
    const defaultsKey = JSON.stringify(defaults);
    const caches = new Map<string, ReturnType<typeof insertionProposalCache>>();
    const proposalFor = (target: Target | null): InsertionResult => {
      try {
        if (JSON.stringify(composer.controller.insertionDefaults()) !== defaultsKey) return { ok: false, hint: "System insertion defaults changed. Start a new drag." };
      } catch (error) { return { ok: false, hint: error instanceof Error ? error.message : "Invalid System insertion defaults." }; }
      if (!target) return { ok: false, hint: 'No visible insertion slot' };
      let cache = caches.get(target.frameId);
      if (!cache) {
        const frame = composer.page!.frames.find(frame => frame.id === target.frameId)!;
        cache = insertionProposalCache(composerFrameToPageDocument(frame), kind, defaults);
        caches.set(target.frameId, cache);
      }
      return cache(target);
    };
    let unsubscribe = () => {};
    const abort = startPointerDrag({ owner: composer.controller, source: event.currentTarget, event,
      onMove: point => {
        const target = hit(composer, point), proposal = proposalFor(target);
        setGhost({ kind, ...point, target, valid: proposal.ok, hint: proposal.hint });
      },
      onFinish: (commit, moved, point) => {
        unsubscribe(); cancel.current = null;
        setGhost(null); suppressClick.current = moved || !commit;
        if (commit && moved) {
          const target = hit(composer, point), proposal = proposalFor(target);
          if (target && proposal.ok) composer.controller.insert({ projectId: expected.id, pageId, frameId: target.frameId, parentId: target.parentId, index: target.index }, kind, expected, session, defaults);
          else composer.controller.report(proposal.hint);
        }
      },
    });
    if (!abort) return;
    suppressClick.current = false; cancel.current = abort;
    unsubscribe = composer.controller.subscribe(() => {
      const active = composer.controller.active();
      if (active?.history.present !== expected || active.pageId !== pageId || composer.controller.insertionSession() !== session) abort();
    });
  };
  return <section className={styles.insertPanel} aria-label="Insert palette">
    <h2>Components</h2><p className={styles.hint}>{composer.state.mode === 'preview' ? 'Switch to Design to insert.' : 'Drag or click to add with defaults from the linked System.'}</p>
    <div className={styles.insertItems}>{INSERT_KINDS.map(kind => <button key={kind} type="button" data-insert-kind={kind} disabled={disabled} draggable={false} title={`Drag ${kind} to canvas or insert into selected slot`} onPointerDown={event => down(event, kind)} onClick={event => { if (event.detail === 0) suppressClick.current = false; insertSelected(kind); }}><Icon name={kind === "stack" ? "box" : kind} size={18} /><span>{kind === "stack" ? "Auto layout" : kind[0].toUpperCase() + kind.slice(1)}</span></button>)}</div>
    {ghost && createPortal(<div className={styles.insertOverlay} data-insertion-valid={ghost.valid}>
      {ghost.target && <><div className={styles.dropHighlight} style={{ left: ghost.target.rect.x, top: ghost.target.rect.y, width: ghost.target.rect.width, height: ghost.target.rect.height }} />{ghost.valid && ghost.target.line && <div className={styles.insertionLine} style={{ left: ghost.target.line.x, top: ghost.target.line.y, width: ghost.target.line.width, height: ghost.target.line.height }} />}</>}
      <div className={styles.insertGhost} style={{ left: ghost.x + 14, top: ghost.y + 14 }}>{ghost.kind} · {ghost.hint}{ghost.valid && ` · position ${ghost.target!.index + 1}`}</div>
    </div>, document.body)}
  </section>;
}
