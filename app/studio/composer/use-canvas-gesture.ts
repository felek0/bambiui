"use client";

import { useEffect, useRef, useState } from "react";
import { INITIAL_CAMERA, zoomAt, type Camera, type Point } from "./camera";
import { movedFrame } from "./frames";
import type { Composer } from "./use-composer";
import { pointerDragActive, startPointerDrag } from "./pointer-drag";

type Gesture = { pointerId: number; start: Point; last: Point; camera: Camera; moved: boolean; frame: NonNullable<Composer["page"]>["frames"][number] | null; element: HTMLElement | null };
export function useCanvasGesture(composer: Composer, blocked: boolean) {
  const viewport = useRef<HTMLDivElement>(null), scene = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ ...INITIAL_CAMERA });
  const gesture = useRef<Gesture | null>(null), raf = useRef(0), space = useRef(false);
  const [displayCamera, setDisplayCamera] = useState<Camera>({ ...INITIAL_CAMERA });
  const paint = () => {
    if (scene.current) scene.current.style.transform = `translate(${camera.current.x}px, ${camera.current.y}px) scale(${camera.current.zoom})`;
    const drag = gesture.current;
    if (drag?.frame && drag.element && drag.moved) {
      const position = movedFrame(drag.frame, (drag.last.x - drag.start.x) / drag.camera.zoom, (drag.last.y - drag.start.y) / drag.camera.zoom);
      drag.element.style.left = `${position.x}px`; drag.element.style.top = `${position.y}px`;
    }
    const next = { ...camera.current };
    setDisplayCamera(previous => previous.x === next.x && previous.y === next.y && previous.zoom === next.zoom ? previous : next);
  };
  const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; paint(); }); };
  const setCamera = (next: Camera) => { if (gesture.current) return; camera.current = next; schedule(); };
  const { page, controller } = composer;
  useEffect(() => {
    const element = viewport.current;
    if (!element || !page) return;
    const restore = (drag: Gesture) => {
      if (drag.frame && drag.element) { drag.element.style.left = `${drag.frame.x}px`; drag.element.style.top = `${drag.frame.y}px`; }
    };
    const finish = (commit: boolean) => {
      const drag = gesture.current; gesture.current = null;
      if (!drag) return;
      if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
      restore(drag);
      if (!commit && !drag.frame) camera.current = drag.camera;
      if (element.hasPointerCapture(drag.pointerId)) element.releasePointerCapture(drag.pointerId);
      element.removeAttribute("data-gesture");
      schedule();
      if (commit && drag.moved && drag.frame) {
        const geometry = movedFrame(drag.frame, (drag.last.x - drag.start.x) / drag.camera.zoom, (drag.last.y - drag.start.y) / drag.camera.zoom);
        controller.execute({ type: "updateFrameGeometry", pageId: page.id, frameId: drag.frame.id, geometry });
      }
    };
    let abortDrag: (() => void) | null = null;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || pointerDragActive(controller) || gesture.current || (event.button !== 0 && event.button !== 1)) return;
      const target = event.target as HTMLElement;
      const pan = event.button === 1 || space.current;
      const frameId = target.closest<HTMLElement>("[data-frame-id]")?.dataset.frameId;
      const frame = !pan && target.closest("[data-frame-title]") ? page.frames.find(frame => frame.id === frameId) ?? null : null;
      if (!pan && !frame && frameId) return; // Content selection/interaction belongs to Frame.
      element.focus({ preventScroll: true });
      if (!pan) controller.selectFrame(page.id, frameId ?? null);
      if (!pan && (!frame || blocked)) return;
      event.preventDefault();
      gesture.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, last: { x: event.clientX, y: event.clientY }, camera: { ...camera.current }, moved: false, frame, element: frame ? target.closest<HTMLElement>("[data-frame-id]") : null };
      abortDrag = startPointerDrag({ owner: controller, source: element, event,
        onMove: point => move(point),
        onFinish: (commit, moved, point) => { if (moved) move(point); finish(commit); abortDrag = null; },
      });
    };
    const move = (point: Point) => {
      const drag = gesture.current; if (!drag) return;
      drag.last = point;
      const dx = drag.last.x - drag.start.x, dy = drag.last.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      element.dataset.gesture = drag.frame ? "move" : "pan";
      if (!drag.frame) camera.current = { ...drag.camera, x: drag.camera.x + dx, y: drag.camera.y + dy };
      schedule();
    };
    const cancel = () => { space.current = false; element.removeAttribute("data-pan-ready"); abortDrag?.(); finish(false); };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="menu"]'))) return;
      if (event.key === "Escape") { const dragging = pointerDragActive(controller); cancel(); if (!dragging && document.activeElement === element) controller.clearNode(); return; }
      if (event.code === "Space" && document.activeElement === element) { event.preventDefault(); space.current = true; element.setAttribute("data-pan-ready", ""); }
    };
    const keyup = (event: KeyboardEvent) => { if (event.code === "Space") { space.current = false; element.removeAttribute("data-pan-ready"); } };
    const wheel = (event: WheelEvent) => {
      // Opt in by focusing the bounded editor; an unfocused canvas never traps page scroll.
      if (document.activeElement !== element || pointerDragActive(controller)) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect(), factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      if (event.ctrlKey || event.metaKey) camera.current = zoomAt(camera.current, camera.current.zoom * Math.exp(-event.deltaY * factor * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      else camera.current = { ...camera.current, x: camera.current.x - event.deltaX * factor, y: camera.current.y - event.deltaY * factor };
      schedule();
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", cancel);
    return () => {
      cancel();
      if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
      element.removeEventListener("pointerdown", down); element.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", cancel);
    };
    // Page identity/content changes cancel rather than committing a stale gesture. Camera is ref-owned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, controller, blocked]);
  const edgePan = (point: Point) => {
    const element = viewport.current;
    if (!element || gesture.current) return false;
    const rect = element.getBoundingClientRect();
    if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return false;
    const velocity = (position: number, start: number, end: number) => position < start + 32 ? Math.min(8, (start + 32 - position) / 4) : position > end - 32 ? -Math.min(8, (position - end + 32) / 4) : 0;
    const x = Math.max(-100000, Math.min(100000, camera.current.x + velocity(point.x, rect.left, rect.right)));
    const y = Math.max(-100000, Math.min(100000, camera.current.y + velocity(point.y, rect.top, rect.bottom)));
    if (x === camera.current.x && y === camera.current.y) return false;
    camera.current = { ...camera.current, x, y };
    paint(); // Refresh client rectangles before this drag tick's hit test; no native scrolling.
    return true;
  };
  return { viewport, scene, camera: displayCamera, setCamera, edgePan };
}
