"use client";

import { useRef, useState, type ReactElement } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { applyComposerCommand } from "./commands";
import { frameIdRemap } from "./frames";
import { ACTION_LABELS, NODE_ACTIONS, nodeActionReason } from "./component-actions";
import type { ComposerDocument } from "./model";
import type { Composer } from "./use-composer";
import { pointerDragActive } from "./pointer-drag";
import { flattenNodes } from "./selection";
import { canvasNodeId, closestCanvasNode } from "./canvas-elements";
import styles from "./composer.module.css";

export type ActionTarget = { projectId: string; pageId: string; frameId: string; nodeId?: string } | null;
type Action = { label: string; reason: string | null; run: () => void };
export function selectedActionTarget(composer: Composer): ActionTarget {
  return composer.project?.selection ?? (composer.document && composer.page && composer.project?.frameId ? { projectId: composer.document.id, pageId: composer.page.id, frameId: composer.project.frameId } : null);
}
function actions(composer: Composer, target: ActionTarget, expected: ComposerDocument | null): Action[] {
  const blocked = !composer.state.ready || composer.state.indexBlocked || !!composer.state.partial || composer.state.mode !== "design";
  const unavailable = blocked ? "Actions are unavailable in Preview or while the editor is blocked." : !target || !expected ? "Select an instance or frame." : null;
  if (target?.nodeId && expected) {
    const selection = { ...target, nodeId: target.nodeId };
    return NODE_ACTIONS.map(action => ({ label: ACTION_LABELS[action], reason: unavailable ?? nodeActionReason(expected, selection, action), run: () => {
      if (!pointerDragActive(composer.controller)) composer.controller.nodeAction(selection, action, expected);
    } }));
  }
  let reason = unavailable;
  if (!reason && target && expected) {
    try {
      const page = expected.pages.find(page => page.id === target.pageId), frame = page?.frames.find(frame => frame.id === target.frameId);
      if (!frame || target.projectId !== expected.id) throw new Error("Frame is no longer available.");
      let serial = 0;
      const used = new Set(expected.pages.flatMap(page => page.frames.flatMap(frame => [frame.id, ...flattenNodes(frame.root).map(({ node }) => node.id)])));
      const nextId = () => { let id: string; do { id = `frameAction${++serial}`; } while (used.has(id)); used.add(id); return id; };
      applyComposerCommand(expected, { type: "duplicateFrame", pageId: target.pageId, frameId: target.frameId, index: page!.frames.length, ids: frameIdRemap(frame, nextId) });
    } catch (error) { reason = error instanceof Error ? error.message : "Cannot duplicate frame."; }
  }
  return [{ label: "Duplicate frame", reason, run: () => { if (target && expected && !pointerDragActive(composer.controller)) composer.controller.duplicateFrame(target, expected); } }];
}
function Items({ definitions, context = false }: { definitions: Action[]; context?: boolean }) {
  const Item = context ? ContextMenu.Item : Menu.Item;
  const Separator = context ? ContextMenu.Separator : Menu.Separator;
  return <>{definitions.map((action, index) => <span key={action.label} className={styles.menuEntry}>
    {index > 0 && action.label === "Delete instance" && <Separator className={styles.menuSeparator} />}
    <Item className={styles.menuItem} disabled={!!action.reason} title={action.reason ?? undefined} onClick={action.run}>{action.label}{action.reason && <small>{action.reason}</small>}</Item>
  </span>)}</>;
}
export function ActionsMenu({ composer }: { composer: Composer }) {
  const [snapshot, setSnapshot] = useState<{ target: ActionTarget; document: ComposerDocument | null } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return <Menu.Root onOpenChange={(open, details) => {
    if (open && pointerDragActive(composer.controller)) { details.cancel(); return; }
    if (open) setSnapshot({ target: selectedActionTarget(composer), document: composer.document });
  }}>
    <Menu.Trigger ref={trigger} className={styles.actionButton} disabled={composer.state.mode !== "design"}>… Actions</Menu.Trigger>
    <Menu.Portal><Menu.Positioner collisionPadding={8} className={styles.menuPositioner}><Menu.Popup aria-label="Selection actions" className={styles.actionPopup} finalFocus={() => trigger.current?.isConnected ? trigger.current : document.querySelector<HTMLElement>('[aria-label="Interactive frame canvas"]')}>
      <Items definitions={actions(composer, snapshot?.target ?? null, snapshot?.document ?? null)} />
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

/** A single stable trigger surrounds the canvas, not a deletable or transformed instance. */
export function CanvasContextActions({ composer, surface }: { composer: Composer; surface: ReactElement }) {
  const [snapshot, setSnapshot] = useState<{ target: ActionTarget; document: ComposerDocument | null } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  return <ContextMenu.Root disabled={composer.state.mode !== "design"} onOpenChange={(open, details) => {
    if (!open) return;
    if (pointerDragActive(composer.controller) || !composer.document || !composer.page) { details.cancel(); return; }
    const element = details.event.target instanceof Element ? details.event.target : null;
    const frameId = element?.closest<HTMLElement>('[data-frame-id]')?.dataset.frameId;
    const nodeId = element?.closest<HTMLElement>('[data-node-move-handle]')?.dataset.nodeMoveHandle ?? canvasNodeId(closestCanvasNode(element));
    const target: ActionTarget = frameId ? { projectId: composer.document.id, pageId: composer.page.id, frameId, ...(nodeId ? { nodeId } : {}) } : null;
    if (target?.nodeId) composer.controller.selectNode({ ...target, nodeId: target.nodeId });
    else composer.controller.selectFrame(composer.page.id, target?.frameId ?? null);
    setSnapshot({ target, document: composer.document });
  }}>
    <ContextMenu.Trigger ref={canvas} className={styles.contextSurface} onContextMenuCapture={event => { if (composer.state.mode !== "design") { event.preventDefault(); event.stopPropagation(); } }}>{surface}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Positioner collisionPadding={8} className={styles.menuPositioner}><ContextMenu.Popup aria-label="Canvas actions" className={styles.actionPopup} finalFocus={() => canvas.current?.querySelector<HTMLElement>('[aria-label="Interactive frame canvas"]') ?? null}>
      <Items context definitions={actions(composer, snapshot?.target ?? null, snapshot?.document ?? null)} />
    </ContextMenu.Popup></ContextMenu.Positioner></ContextMenu.Portal>
  </ContextMenu.Root>;
}
