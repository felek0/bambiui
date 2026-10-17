import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ThemeTokens } from "./tokens";
import type { ComponentRecipeSelection } from "./component-recipes";
import type { FrameSpacingCommit } from "./frame-spacing-editor";
import { frameSizeFields, frameSizeSource, type SizeAxis } from "./frame-size-model";
import { resizeCornerPatch, resizeInitial, resizePreviewVariables, resizeValue } from "./frame-resize-model";
import { canvasAppearanceElements } from "./rendered-appearance";
import { observeCanvasAppearance } from "./use-canvas-appearance";
import styles from "./frame-resize-editor.module.css";

type Handle = SizeAxis | "corner";
type Sizes = Record<SizeAxis, number>;
type Gesture = { id: number; trigger: HTMLButtonElement; root: HTMLElement; handle: Handle; x: number; y: number; initial: Sizes; value: Sizes; moved: boolean; previous: Map<string, { value: string; priority: string }> };
const axesOf = (handle: Handle): SizeAxis[] => handle === "corner" ? ["width", "height"] : [handle];
const describe = (patch: Partial<Sizes>) => (Object.entries(patch) as [SizeAxis, number][]).map(([axis, value]) => `${axis === "width" ? "Width" : "Height"} → Fixed ${Number(value.toFixed(3))}px`).join(" · ");
export const resizeIdleHint = "Drag right / bottom / corner → Fixed. Arrow keys on W/H adjust by 1px (Shift ×10).";
/** The hint is rendered by the shared tool status line (id `${id}-resize-help`) so it never overlaps the canvas. */
export function FrameResizeEditor({ selection, theme, onCommit, onHint, id }: { selection: ComponentRecipeSelection; theme: ThemeTokens; onCommit: FrameSpacingCommit; onHint: (hint: string) => void; id: string }) {
  const anchor = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<Partial<Sizes> | null>(null);
  const fields = useMemo(() => frameSizeFields(selection), [selection]);
  const restore = useCallback(() => {
    const drag = gesture.current;
    if (!drag) return null;
    gesture.current = null;
    for (const [property, previous] of drag.previous) {
      if (previous.value) drag.root.style.setProperty(property, previous.value, previous.priority);
      else drag.root.style.removeProperty(property);
    }
    if (drag.trigger.hasPointerCapture(drag.id)) drag.trigger.releasePointerCapture(drag.id);
    return drag;
  }, []);
  useEffect(() => {
    const stop = observeCanvasAppearance(selection, fields, () => {
      const element = canvasAppearanceElements(selection)[0];
      const host = anchor.current?.parentElement;
      if (!(element instanceof HTMLElement) || !host) return;
      const rect = element.getBoundingClientRect(), parent = host.getBoundingClientRect();
      const next = { left: rect.left - parent.left, top: rect.top - parent.top, width: rect.width, height: rect.height };
      setBox(before => JSON.stringify(before) === JSON.stringify(next) ? before : next);
    });
    const cancel = () => { if (restore()) { setPending(null); setStatus("Resize cancelled. Original sizing restored."); } };
    const key = (event: KeyboardEvent) => {
      if (gesture.current && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
    };
    const visibility = () => { if (document.hidden) cancel(); };
    const outside = () => cancel();
    const context = new MutationObserver(cancel);
    for (let parent = anchor.current?.parentElement; parent; parent = parent.parentElement) context.observe(parent, { attributes: true, attributeFilter: ["hidden", "inert", "style", "class", "data-ds-theme"] });
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("bambiui:discard-inspector-drafts", cancel, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", cancel);
    return () => { stop(); context.disconnect(); restore(); document.removeEventListener("keydown", key, true); document.removeEventListener("pointerdown", outside, true); document.removeEventListener("bambiui:discard-inspector-drafts", cancel, true); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", cancel); };
  }, [selection, fields, theme, restore]);

  const initials = (): Sizes | null => box && Object.fromEntries(fields.map(field => [field.key, resizeInitial(box[field.key as SizeAxis], frameSizeSource(theme, selection, field).effective)])) as Sizes;
  const handles: Handle[] = [...fields.map(field => field.key as SizeAxis), ...(fields.length === 2 ? ["corner" as const] : [])];
  const pendingAxes = pending ? Object.keys(pending).join(" ") : undefined;
  const hint = pending ? `${describe(pending)} · release to apply` : resizeIdleHint;
  useEffect(() => { onHint(hint); }, [hint, onHint]);

  return <div ref={anchor} data-frame-resize-editor data-resize-pending-axis={pendingAxes} data-resize-pending-value={pending && Object.keys(pending).length === 1 ? Object.values(pending)[0] : undefined}
    data-resize-pending-width={pending?.width} data-resize-pending-height={pending?.height}>
    {box && <div className={styles.overlay} style={box} data-system-context-change="frame-resize">
      {handles.map(handle => {
        const corner = handle === "corner";
        const axis = corner ? "width" : handle;
        const field = fields.find(candidate => candidate.key === axis)!;
        const source = frameSizeSource(theme, selection, field);
        const initial = resizeInitial(box[axis], source.effective);
        const pointer = {
          onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
            if (event.button !== 0 || gesture.current) return;
            const element = canvasAppearanceElements(selection)[0];
            const root = element?.closest<HTMLElement>(`[data-ds-component="${selection.component}"][data-component-part="root"]`);
            const start = initials();
            if (!root || !start) return;
            event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
            gesture.current = { id: event.pointerId, trigger: event.currentTarget, root, handle, x: event.clientX, y: event.clientY, initial: start, value: { ...start }, moved: false, previous: new Map() };
          },
          onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
            const drag = gesture.current;
            if (!drag || drag.id !== event.pointerId) return;
            const delta: Sizes = { width: event.clientX - drag.x, height: event.clientY - drag.y };
            if (!drag.moved && Math.max(...axesOf(drag.handle).map(axis => Math.abs(delta[axis]))) < 4) return;
            drag.moved = true;
            const value = { ...drag.value };
            for (const axis of axesOf(drag.handle)) value[axis] = resizeValue(drag.initial[axis], delta[axis], event.altKey);
            if (value.width === drag.value.width && value.height === drag.value.height) return;
            drag.value = value;
            const patch = resizeCornerPatch(drag.initial, value);
            const variables = resizePreviewVariables(theme, selection, patch ?? {});
            for (const [property, next] of Object.entries(variables)) {
              if (!drag.previous.has(property)) drag.previous.set(property, { value: drag.root.style.getPropertyValue(property), priority: drag.root.style.getPropertyPriority(property) });
              drag.root.style.setProperty(property, next);
            }
            // Returning to the start is a no-op: restore anything no longer produced by the patch.
            for (const [property, previous] of drag.previous) if (!patch || !(property in variables)) {
              if (previous.value) drag.root.style.setProperty(property, previous.value, previous.priority);
              else drag.root.style.removeProperty(property);
            }
            setPending(patch);
          },
          onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
            if (gesture.current?.id !== event.pointerId) return;
            const drag = restore(); setPending(null);
            const patch = drag?.moved ? resizeCornerPatch(drag.initial, drag.value) : null;
            if (patch) { onCommit(selection, patch); setStatus(`${describe(patch)} applied to this size in both themes.`); }
          },
          onPointerCancel() { restore(); setPending(null); setStatus("Resize cancelled."); },
          onLostPointerCapture() { if (restore()) setPending(null); },
        };
        // The corner is a pointer shortcut; keyboard users resize each axis with the edge sliders.
        if (corner) return <button type="button" key={handle} className={styles.handle} data-resize-handle="corner" tabIndex={-1} aria-hidden="true"
          title="Resize width and height → Fixed" {...pointer} />;
        return <button type="button" key={handle} className={styles.handle} data-resize-handle={axis} role="slider" aria-label={`Resize ${axis}`} aria-describedby={`${id}-resize-help`}
          aria-valuemin={0} aria-valuemax={10000} aria-valuenow={Math.min(10000, box[axis])} aria-valuetext={`${Number(box[axis].toFixed(3))} pixels rendered. Editing sets Fixed ${axis}.`} aria-orientation={axis === "width" ? "horizontal" : "vertical"}
          title={`Resize ${axis} · ${source.own === undefined ? "defaults" : typeof source.own === "number" ? "Fixed" : source.own} → Fixed`}
          {...pointer}
          onKeyDown={event => {
            if (gesture.current || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const delta = (event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1);
            const next = resizeValue(initial, delta, event.altKey);
            if (next !== initial) { onCommit(selection, { [axis]: next }); setStatus(`Fixed ${axis}: ${next}px applied.`); }
          }}>{axis === "width" ? "W" : "H"}</button>;
      })}
    </div>}
    <span className={styles.srOnly} role="status">{status}</span>
  </div>;
}
