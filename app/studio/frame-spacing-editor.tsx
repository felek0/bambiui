import { useEffect, useMemo, useRef, useState } from "react";
import type { AppearanceField, AppearancePatch } from "./components/appearance";
import type { ComponentRecipeSelection } from "./component-recipes";
import { canvasAppearanceElements } from "./rendered-appearance";
import { observeCanvasAppearance } from "./use-canvas-appearance";
import { spacingDragFields, spacingDragValue, type SpacingKind } from "./spacing-drag";
import styles from "./frame-spacing-editor.module.css";

export type FrameSpacingCommit = (selection: ComponentRecipeSelection, patch: AppearancePatch) => void;
type Measurement = { left: number; top: number; width: number; height: number; values: Record<string, number> };
type Gesture = { pointer: number; x: number; y: number; initial: number; value: number; field: AppearanceField; element: HTMLElement; property: string; previous: string; priority: string; display: string; displayPriority: string };

/** Only the selected sample receives a temporary DOM preview. Persistence happens once, on release. */
export function FrameSpacingEditor({ selection, onCommit, helpId: help }: { selection: ComponentRecipeSelection; onCommit: FrameSpacingCommit; helpId: string }) {
  const [kind, setKind] = useState<SpacingKind>("padding");
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const toolbar = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const fields = useMemo(() => spacingDragFields(selection, kind), [selection, kind]);


  function restore() {
    const drag = gesture.current;
    if (!drag) return null;
    gesture.current = null;
    if (drag.previous) drag.element.style.setProperty(drag.property, drag.previous, drag.priority);
    else drag.element.style.removeProperty(drag.property);
    if (drag.display) drag.element.style.setProperty("display", drag.display, drag.displayPriority);
    else drag.element.style.removeProperty("display");
    return drag;
  }

  useEffect(() => {
    const stop = observeCanvasAppearance(selection, fields, () => {
      const element = canvasAppearanceElements(selection)[0];
      const host = toolbar.current?.parentElement;
      if (!(element instanceof HTMLElement) || !host) return;
      const rect = element.getBoundingClientRect(), parent = host.getBoundingClientRect();
      const computed = getComputedStyle(element);
      const values = Object.fromEntries(fields.map(field => [field.key, Number.parseFloat(String(computed[field.key as keyof CSSStyleDeclaration]))]));
      const next = { left: rect.left - parent.left, top: rect.top - parent.top, width: rect.width, height: rect.height, values };
      setMeasurement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    });
    const cancel = () => { if (restore()) setAnnouncement("Spacing change cancelled."); };
    const key = (event: KeyboardEvent) => {
      if (gesture.current && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
    };
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener("keydown", key, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", cancel);
    return () => { stop(); restore(); document.removeEventListener("keydown", key, true); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", cancel); };
  }, [selection, fields]);

  if (!fields.length) return null;
  return <>
    <div ref={toolbar} className={styles.toolbar} data-frame-spacing-editor data-system-context-change="frame-spacing">
      <div role="group" aria-label="Frame spacing">
        {(["padding", "margin"] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "padding" ? "Padding" : "Margin"}</button>)}
      </div>
      <p id={help} className={styles.srOnly}>Drag edges · release to apply to this size in both themes · Esc cancels. Arrow keys adjust; Shift ×10.</p>
      <span className={styles.srOnly} role="status">{announcement}</span>
    </div>
    {measurement && <div className={styles.overlay} data-spacing-overlay={kind} data-system-context-change="frame-spacing" style={{ left: measurement.left, top: measurement.top, width: measurement.width, height: measurement.height }}>
      {fields.map(field => {
        const value = measurement.values[field.key];
        if (!Number.isFinite(value)) return null;
        const side = field.key.replace(kind, "").toLowerCase();
        const vertical = side === "top" || side === "bottom";
        // Keep hit targets outside the frame so small labels and native fields remain selectable.
        const inset = vertical ? -20 : -24;
        return <button key={field.key} type="button" role="slider" className={styles.handle} data-spacing-handle={field.key} data-side={side}
          style={{ [side]: inset }} aria-label={`Drag ${field.label.toLowerCase()}`} aria-describedby={help}
          aria-valuenow={value} aria-valuemin={field.min} aria-valuemax={field.max} aria-valuetext={`${value} pixels`} aria-orientation={vertical ? "vertical" : "horizontal"}
          title={`${field.label}: ${value}px`}
          onPointerDown={event => {
            if (event.button !== 0 || gesture.current) return;
            const element = canvasAppearanceElements(selection)[0];
            if (!(element instanceof HTMLElement)) return;
            event.preventDefault(); event.stopPropagation();
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            const property = field.key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
            gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, initial: value, value, field, element, property,
              previous: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
              display: element.style.getPropertyValue("display"), displayPriority: element.style.getPropertyPriority("display") };
          }}
          onPointerMove={event => {
            const drag = gesture.current;
            if (!drag || drag.pointer !== event.pointerId) return;
            const next = spacingDragValue(field, drag.initial, event.clientX - drag.x, event.clientY - drag.y, event.altKey);
            if (next === drag.value) return;
            drag.value = next;
            if (getComputedStyle(drag.element).display === "inline") drag.element.style.setProperty("display", "inline-block");
            drag.element.style.setProperty(drag.property, `${next}px`, "important");
          }}
          onPointerUp={event => {
            if (gesture.current?.pointer !== event.pointerId) return;
            const drag = restore();
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (drag && drag.value !== drag.initial) { onCommit(selection, { [field.key]: drag.value }); setAnnouncement(`${field.label}: ${drag.value}px. Applied to this size in both themes.`); }
          }}
          onPointerCancel={() => { restore(); setAnnouncement("Spacing change cancelled."); }}
          onLostPointerCapture={() => { restore(); }}
          onKeyDown={event => {
            if (gesture.current || !["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const delta = (event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1);
            const next = Math.min(field.max!, Math.max(field.min!, value + delta));
            if (next !== value) onCommit(selection, { [field.key]: next });
          }}><span>{Number(value.toFixed(2))}</span></button>;
      })}
    </div>}
  </>;
}
