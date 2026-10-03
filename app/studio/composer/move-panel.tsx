"use client";

import { useState } from "react";
import { flattenNodes, resolveSelection } from "./selection";
import { prepareMove } from "./movement";
import type { Composer } from "./use-composer";
import styles from "./composer.module.css";

export function MovePanel({ composer, disabled }: { composer: Composer; disabled: boolean }) {
  const selection = composer.project!.selection!;
  const resolved = resolveSelection(composer.document!, selection)!;
  const parent = resolved.path.at(-2)!;
  const [destination, setDestination] = useState(JSON.stringify([selection.frameId, parent.id]));
  const [position, setPosition] = useState(parent.children!.findIndex(node => node.id === selection.nodeId));
  const [frameId, parentId] = JSON.parse(destination) as [string, string];
  const slots = composer.page!.frames.flatMap(frame => flattenNodes(frame.root).filter(({ node }) => node.children).map(({ node }) => ({ frame, node })));
  const slot = slots.find(slot => slot.frame.id === frameId && slot.node.id === parentId);
  const count = (slot?.node.children?.length ?? 0) - (frameId === selection.frameId && parentId === parent.id ? 1 : 0);
  const scope = { projectId: selection.projectId, pageId: selection.pageId, sourceFrameId: selection.frameId, nodeId: selection.nodeId, frameId, parentId, index: position };
  let hint = "", valid = false;
  try {
    let serial = 0;
    const used = new Set(slots.flatMap(slot => flattenNodes(slot.frame.root).map(({ node }) => node.id)));
    const proposal = prepareMove(composer.document, scope, () => { let id: string; do { id = `movehint${++serial}`; } while (used.has(id)); return id; });
    hint = proposal.hint; valid = true;
  } catch (error) { hint = error instanceof Error ? error.message : "Invalid move"; }
  return <details className={styles.layers}><summary>Move instance</summary><div className={`${styles.form} ${styles.moveFields}`}>
    <label>Target slot<select aria-label="Move target slot" value={destination} disabled={disabled} onChange={event => { setDestination(event.target.value); setPosition(0); }}>{slots.map(({ frame, node }) => <option key={`${frame.id}-${node.id}`} value={JSON.stringify([frame.id, node.id])}>{frame.name} · {node.kind} · {node.id}</option>)}</select></label>
    <label>Position after removal<select aria-label="Move position" value={position} disabled={disabled} onChange={event => setPosition(Number(event.target.value))}>{Array.from({ length: count + 1 }, (_, index) => <option key={index} value={index}>{index + 1}{index === count ? " · end" : ""}</option>)}</select></label>
    <p className={styles.hint}>{hint} IDs are preserved; no copying. Unrelated drafts retain their blur/Enter policy.</p>
    <button type="button" disabled={disabled || !valid} onClick={() => composer.controller.move(scope)}>Move here</button>
  </div></details>;
}
