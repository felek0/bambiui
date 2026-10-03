"use client";

import { useCallback, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "../controls";
import { Icon } from "../icons";
import { COMPOSER_LIMITS, COMPOSER_PRESETS, type ComposerPreset } from "./model";
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

function AddFrameMenu({ composer, primary = false }: { composer: Composer; primary?: boolean }) {
  const disabled = !composer.state.ready || composer.state.indexBlocked || !!composer.state.partial || composer.state.mode === "preview" || !composer.page || composer.page.frames.length >= COMPOSER_LIMITS.framesPerPage;
  return <Menu.Root>
    <Menu.Trigger disabled={disabled} render={<Button variant={primary ? "primary" : "ghost"} startIcon={<Icon name="plus" size={14} />} />} aria-label="Add frame">Add frame</Menu.Trigger>
    <Menu.Portal><Menu.Positioner side="top" align="start" sideOffset={8} className={styles.menuPositioner}>
      <Menu.Popup className={styles.actionPopup}>
        {(["web", "tablet", "mobile", "custom"] as ComposerPreset[]).map(preset => <Menu.Item key={preset} className={styles.menuItem} aria-label={`Add ${preset[0].toUpperCase() + preset.slice(1)} frame`} onClick={() => composer.controller.addFrame(preset)}>
          <span>Add {preset[0].toUpperCase() + preset.slice(1)} frame</span><small className={styles.hint}>{COMPOSER_PRESETS[preset].width} × {COMPOSER_PRESETS[preset].height}{preset === "custom" ? " · editable size" : ""}</small>
        </Menu.Item>)}
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

export function ComposerCanvas({ composer, system, theme, onTheme, status }: { composer: Composer; system: DesignSystem | null; theme: PaletteMode; onTheme: (theme: PaletteMode) => void; status?: ReactNode }) {
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
    </div>} />
    {!page.frames.length && <div className={styles.canvasEmpty}><div>
      <span className={styles.emptyGlyph}><Icon name="desktop" size={24} /></span>
      <h2>Start with a frame</h2><p className={styles.hint}>Choose a size, then add components from Assets.</p>
      <AddFrameMenu composer={composer} primary />
    </div></div>}
    <div className={styles.canvasToolbar} role="group" aria-label="Canvas tools">
      <div className={styles.toolGroup} role="group" aria-label="Project history">
        <Button variant="ghost" iconOnly aria-label="Undo project edit" title="Undo project edit" disabled={!composer.project?.history.past.length || blocked} onClick={() => composer.controller.travel("undo")}><Icon name="undo" size={15} /></Button>
        <Button variant="ghost" iconOnly aria-label="Redo project edit" title="Redo project edit" disabled={!composer.project?.history.future.length || blocked} onClick={() => composer.controller.travel("redo")}><Icon name="redo" size={15} /></Button>
      </div>
      <div className={styles.toolGroup}><AddFrameMenu composer={composer} /><ActionsMenu composer={composer} /></div>
      <div className={styles.toolGroup} role="group" aria-label="Canvas camera">
        <Button variant="ghost" iconOnly aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1 / 1.25)}><Icon name="minus" size={13} /></Button>
        <Menu.Root><Menu.Trigger className={styles.zoomTrigger} aria-label={`Canvas zoom ${Math.round(camera.zoom * 100)}%`}><output aria-label="Canvas zoom">{Math.round(camera.zoom * 100)}%</output><Icon name="chevron" size={10} /></Menu.Trigger>
          <Menu.Portal><Menu.Positioner side="top" sideOffset={8} className={styles.menuPositioner}><Menu.Popup className={styles.actionPopup}>
            <Menu.Item className={styles.menuItem} disabled={!page.frames.length} onClick={() => fit(false)}>Fit page</Menu.Item>
            <Menu.Item className={styles.menuItem} disabled={!selected} onClick={() => fit(true)}>Fit selection</Menu.Item>
            <Menu.Item className={styles.menuItem} onClick={() => zoom(1 / camera.zoom)}>Zoom to 100%</Menu.Item>
          </Menu.Popup></Menu.Positioner></Menu.Portal>
        </Menu.Root>
        <Button variant="ghost" iconOnly aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)}><Icon name="plus" size={13} /></Button>
      </div>
      <div className={styles.toolGroup}>
        <label className={styles.themePicker}><Icon name={theme === "light" ? "sun" : "moon"} size={14} /><select aria-label="Frame theme" value={theme} onChange={event => onTheme(event.target.value as PaletteMode)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <Dialog.Root><Dialog.Trigger render={<Button variant="ghost" iconOnly aria-label="Canvas help" title="Canvas help" />}>?</Dialog.Trigger>
          <Dialog.Portal><Dialog.Backdrop className="studio-backdrop" /><Dialog.Popup className={`export-dialog ${styles.dialog}`}>
            <Dialog.Title>Canvas help</Dialog.Title>
            <Dialog.Description className={styles.hint}>Design selects instances. Preview lets you interact with controls; form submission stays blocked.</Dialog.Description>
            <ul className={styles.helpList}>
              <li>Focus the canvas to pan with the wheel or trackpad. Ctrl/⌘ + wheel zooms at the pointer (10–400%).</li>
              <li>Space + mouse drag or middle-mouse drag pans. Drag a frame title to move the frame.</li>
              <li>Drag an instance or its selection label to move it. Hold near a canvas edge to pan.</li>
              <li>Use Layers with arrow keys; Enter selects. Use inspector fields and Move instance for keyboard editing.</li>
              <li>With canvas focus: Ctrl/⌘ + Z undoes, Shift + Ctrl/⌘ + Z redoes, Ctrl/⌘ + D duplicates, and Delete/Backspace deletes a valid selection. Text fields keep their native shortcuts.</li>
              <li>Right-click a frame or instance, or use Actions. Wrap selects the wrapper; delete selects the parent.</li>
              <li>Escape, pointer cancellation or window blur cancels a drag. Touch gestures are not implemented. Frame sizes are CSS pixels, not viewport media-query emulation.</li>
            </ul>
            <Dialog.Close render={<Button />}>Close canvas help</Dialog.Close>
          </Dialog.Popup></Dialog.Portal>
        </Dialog.Root>
      </div>
      {status && <div className={styles.toolbarStatus}>{status}</div>}
    </div>
    {move.overlay}
  </>;
}
