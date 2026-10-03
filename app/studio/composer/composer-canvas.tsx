"use client";

import { useCallback } from "react";
import { Button } from "../controls";
import { COMPOSER_LIMITS, type ComposerPreset } from "./model";
import type { DesignSystem } from "../tokens";
import type { PaletteMode } from "../color-engine";
import type { Composer } from "./use-composer";
import { Frame } from "./frame";
import { fitCamera, sceneBounds, zoomAt } from "./camera";
import { useNodeMove } from "./use-node-move";
import { useCanvasGesture } from "./use-canvas-gesture";
import styles from "./composer.module.css";
import { ActionsMenu, CanvasContextActions } from "./context-actions";
import { composerShortcut } from "./shortcuts";
import { nodeActionReason } from "./component-actions";
import { pointerDragActive } from "./pointer-drag";

export function ComposerCanvas({ composer, system, theme }: { composer: Composer; system: DesignSystem | null; theme: PaletteMode }) {
  const blocked = !composer.state.ready || composer.state.indexBlocked || !!composer.state.partial;
  const { viewport, scene, camera, setCamera, edgePan } = useCanvasGesture(composer, blocked);
  const move = useNodeMove(composer, edgePan);
  const page = composer.page!;
  const selected = page.frames.find(frame => frame.id === composer.project?.frameId);
  const selectNode = useCallback((frameId: string, nodeId: string) => composer.controller.selectNode({ projectId: composer.document!.id, pageId: page.id, frameId, nodeId }), [composer.controller, composer.document, page.id]);
  const selectFrame = useCallback((id: string) => composer.controller.selectFrame(page.id, id), [composer.controller, page.id]);
  const fit = (selection: boolean) => {
    const element = viewport.current; if (!element) return;
    setCamera(fitCamera(sceneBounds(selection && selected ? [selected] : page.frames), { width: element.clientWidth, height: element.clientHeight }));
  };
  const zoom = (factor: number) => {
    const element = viewport.current; if (!element) return;
    setCamera(zoomAt(camera, camera.zoom * factor, { x: element.clientWidth / 2, y: element.clientHeight / 2 }));
  };
  return <>
    <div className={styles.canvasToolbar}>
      <div className={styles.actions} role="group" aria-label="Canvas mode"><Button aria-pressed={composer.state.mode === "design"} onClick={() => composer.controller.setMode("design")}>Design</Button><Button aria-pressed={composer.state.mode === "preview"} onClick={() => composer.controller.setMode("preview")}>Preview</Button><span className={styles.hint}>{composer.state.mode === "design" ? "Select and edit instances · controls do not activate" : "Interact with controls · selection off · form submission blocked"}</span></div>
      <div className={styles.actions} role="group" aria-label="Add independent frame">
        {(["web", "tablet", "mobile", "custom"] as ComposerPreset[]).map(preset => <Button key={preset} disabled={blocked || page.frames.length >= COMPOSER_LIMITS.framesPerPage} onClick={() => composer.controller.addFrame(preset)}>Add {preset[0].toUpperCase() + preset.slice(1)} frame</Button>)}
      </div>
      <div className={styles.actions} role="group" aria-label="Canvas camera">
              <ActionsMenu composer={composer} />
        <Button aria-label="Zoom out" onClick={() => zoom(1 / 1.25)}>−</Button><output aria-label="Canvas zoom">{Math.round(camera.zoom * 100)}%</output><Button aria-label="Zoom in" onClick={() => zoom(1.25)}>+</Button>
        <Button disabled={!page.frames.length} onClick={() => fit(false)}>Fit page</Button><Button disabled={!selected} onClick={() => fit(true)}>Fit selection</Button>
      </div>
      <details className={styles.cameraHelp}><summary>Canvas help</summary><p className={styles.hint}>Click or Tab into the canvas to enable wheel/trackpad pan. Ctrl/⌘ + wheel zooms at the pointer (10–400%). Space + mouse drag or middle-mouse drag pans. Drag an instance or its selected label to move it; hold near canvas edges to pan. Use Move instance in the inspector for keyboard target/position selection. Right-click an instance or frame, or open the visible Actions menu. With canvas focus: Ctrl/⌘ + Z undoes, Shift + Ctrl/⌘ + Z redoes, Ctrl/⌘ + D duplicates a valid selected instance, and Delete/Backspace deletes it. Native text editing keeps its own shortcuts. Wrap selects the new wrapper; delete selects the parent. Drag a frame title to move the frame; Escape, pointer cancellation or window blur cancels. Use frame fields for keyboard geometry edits. Touch gestures are not implemented. Frame sizes are CSS pixels, not viewport media-query emulation.</p></details>
    </div>
    <CanvasContextActions composer={composer} surface={<div ref={viewport} onKeyDownCapture={event => {
      const editing = event.target instanceof Element && !!event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
      const shortcut = composerShortcut({ ...event, isComposing: event.nativeEvent.isComposing }, editing);
      if (!shortcut || blocked || composer.state.mode !== "design" || pointerDragActive(composer.controller)) return;
      const selection = composer.project?.selection;
      if (shortcut === "delete" || shortcut === "duplicate") {
        if (!selection || !composer.document || nodeActionReason(composer.document, selection, shortcut)) return;
        event.preventDefault(); event.stopPropagation(); composer.controller.nodeAction(selection, shortcut);
      } else {
        const available = shortcut === "undo" ? composer.project?.history.past.length : composer.project?.history.future.length;
        if (!available) return;
        event.preventDefault(); event.stopPropagation(); composer.controller.travel(shortcut);
      }
    }} className={styles.viewport} tabIndex={0} role="region" aria-label="Interactive frame canvas" aria-describedby="canvas-instructions" data-camera-zoom={camera.zoom} data-camera-x={camera.x} data-camera-y={camera.y}>
      <p id="canvas-instructions" className="sr-only">Use Canvas help for pan and zoom shortcuts. Select a frame title, then edit its geometry in Frame settings.</p>
      <div ref={scene} className={styles.scene} style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
        {page.frames.map(frame => <Frame key={frame.id} frame={frame} selected={selected?.id === frame.id} system={system} theme={theme} onSelect={selectFrame} onSelectNode={selectNode} onMoveNode={move.down} selectedNodeId={composer.project?.selection?.frameId === frame.id ? composer.project.selection.nodeId : null} preview={composer.state.mode === "preview"} />)}
      </div>
      {!page.frames.length && <div className={styles.canvasEmpty}><h2>Your page is blank</h2><p className={styles.hint}>Add an independent Web, Tablet, Mobile or custom frame above. No demo content is inserted.</p></div>}
    </div>} />
    {move.overlay}
  </>;
}
