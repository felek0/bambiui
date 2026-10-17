import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppearanceField, AppearancePatch } from "./components/appearance";
import { componentRecipeVariable, type ComponentRecipeSelection } from "./component-recipes";
import { spacingNumericInitial, spacingNumericValue } from "./spacing-numeric-draft";
import { canvasAppearanceElements } from "./rendered-appearance";
import { observeCanvasAppearance } from "./use-canvas-appearance";
import { spacingDragFields, spacingDragValue, spacingEditPatch, type SpacingKind } from "./spacing-drag";
import styles from "./frame-spacing-editor.module.css";
import { FrameSizeEditor } from "./frame-size-editor";
import { FrameResizeEditor } from "./frame-resize-editor";
import { frameSizeFields } from "./frame-size-model";
import { measureGapLayout, type GapLayout } from "./gap-layout";
import { ToolStatus, toolbarKeyDown } from "./tool-status";
import surface from "./tool-status.module.css";
import { editScopeLabel, groupResetPatch, groupResettable } from "./tool-scope";
import type { ThemeTokens } from "./tokens";

export type FrameSpacingCommit = (selection: ComponentRecipeSelection, patch: AppearancePatch) => void;
type Measurement = { left: number; top: number; width: number; height: number; values: Record<string, number>; gap?: GapLayout };
type Draft = { field: AppearanceField; initial: number; text: string; trigger: HTMLButtonElement; selection: ComponentRecipeSelection };
type Gesture = { trigger: HTMLButtonElement; dragging: boolean; pointer: number; x: number; y: number; initial: number; value: number; field: AppearanceField; element: HTMLElement; properties: { property: string; previous: string; priority: string }[]; display: string; displayPriority: string };

/** Only the selected sample receives a temporary DOM preview. Persistence happens once, on release. */
const toolNames = { size: "Size", padding: "Padding", margin: "Margin", radius: "Corners", layout: "Gap" } as const;
const toolHints = {
  padding: "Drag an edge handle or click it to type a value.",
  margin: "Drag an edge handle or click it to type a value. Margins may be negative.",
  radius: "Drag a corner diagonally inward to grow, outward to shrink, or click to type.",
  layout: "Drag the gap handle along the layout direction or click it to type.",
} as const;

export function FrameSpacingEditor({ selection, onCommit, helpId: help, theme, themeLabel = "this theme", onTextTarget }: {
  selection: ComponentRecipeSelection; onCommit: FrameSpacingCommit; helpId: string; theme?: ThemeTokens; themeLabel?: string; onTextTarget?: () => void;
}) {
  const [requestedKind, setKind] = useState<SpacingKind | "size">("padding");
  const [linked, setLinked] = useState(false);
  const [sizePanel, setSizePanel] = useState(true);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [resizeHint, setResizeHint] = useState("");
  const toolbar = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const { component, recipe, part, target } = selection;
  const scope = useMemo(() => ({ component, recipe, part, target }), [component, recipe, part, target]);
  const corners = useMemo(() => spacingDragFields(scope, "radius"), [scope]);
  const gapFields = useMemo(() => spacingDragFields(scope, "layout"), [scope]);
  const kind = requestedKind === "radius" && !corners.length || requestedKind === "layout" && !gapFields.length ? "padding" : requestedKind;
  const fields = useMemo(() => kind === "size" ? frameSizeFields(scope) : spacingDragFields(scope, kind), [scope, kind]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const closeDraft = useCallback((focus = false) => {
    const current = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (focus && current?.trigger.isConnected) current.trigger.focus({ preventScroll: true });
  }, []);

  function initialValue(field: AppearanceField, measured: number) {
    const element = canvasAppearanceElements(scope)[0];
    const property = field.key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    const authored = element instanceof HTMLElement
      ? element.style.getPropertyValue(property) || getComputedStyle(element).getPropertyValue(componentRecipeVariable(component, recipe, part, field.key)) : "";
    return spacingNumericInitial(authored, measured, field);
  }

  function openDraft(field: AppearanceField, measured: number, trigger: HTMLButtonElement) {
    const initial = initialValue(field, measured);
    const next = { field, initial, text: String(initial), trigger, selection: scope };
    draftRef.current = next;
    setDraft(next);
  }

  function changeDraft(text: string) {
    if (!draftRef.current) return;
    const next = { ...draftRef.current, text };
    draftRef.current = next;
    setDraft(next);
  }

  function applyDraft() {
    const current = draftRef.current;
    if (!current) return;
    const value = spacingNumericValue(current.text, current.field);
    if (value === null) return;
    closeDraft(true);
    const patch = spacingEditPatch(fields, current.field, current.initial, value, linked);
    if (patch) {
      onCommit(current.selection, patch);
      setAnnouncement(`${current.field.label}: ${value}px. Applied to this size in both themes.`);
    }
  }

  const restore = useCallback(() => {
    const drag = gesture.current;
    if (!drag) return null;
    gesture.current = null;
    for (const { property, previous, priority } of drag.properties) {
      if (previous) drag.element.style.setProperty(property, previous, priority);
      else drag.element.style.removeProperty(property);
    }
    if (drag.display) drag.element.style.setProperty("display", drag.display, drag.displayPriority);
    else drag.element.style.removeProperty("display");
    if (drag.trigger.hasPointerCapture(drag.pointer)) drag.trigger.releasePointerCapture(drag.pointer);
    return drag;
  }, []);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, [draft?.field.key]);

  useEffect(() => {
    const stop = observeCanvasAppearance(scope, fields, () => {
      const element = canvasAppearanceElements(scope)[0];
      // Overlays are positioned in the example; the tool surface itself flows under the specimen.
      const host = toolbar.current?.closest<HTMLElement>("[data-recipe-example]");
      if (!(element instanceof HTMLElement) || !host) return;
      const rect = element.getBoundingClientRect(), parent = host.getBoundingClientRect();
      const computed = getComputedStyle(element);
      const gap = kind === "layout" ? measureGapLayout(element) : undefined;
      // A flex gap is the main-axis component; CSS `normal` is a rendered 0.
      const read = (key: string) => key === "gap" ? computed[gap?.axis === "y" ? "rowGap" : "columnGap"] : String(computed[key as keyof CSSStyleDeclaration]);
      const values = Object.fromEntries(fields.map(field => { const raw = read(field.key); return [field.key, raw === "normal" ? 0 : Number.parseFloat(raw)]; }));
      const next = { left: rect.left - parent.left, top: rect.top - parent.top, width: rect.width, height: rect.height, values, gap };
      setMeasurement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    });
    const cancel = () => {
      const active = !!gesture.current || !!draftRef.current;
      restore(); closeDraft();
      if (active) setAnnouncement("Frame change cancelled.");
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && editor.current?.contains(event.target)) return;
      cancel();
    };
    // Workbench/view/theme changes can hide this still-mounted editor.
    const context = new MutationObserver(cancel);
    for (let ancestor = toolbar.current?.parentElement; ancestor; ancestor = ancestor.parentElement) {
      context.observe(ancestor, { attributes: true, attributeFilter: ["hidden", "inert", "style", "class", "data-ds-theme"] });
    };
    const key = (event: KeyboardEvent) => {
      if ((gesture.current || draftRef.current) && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        const trigger = draftRef.current?.trigger ?? gesture.current?.trigger;
        cancel();
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      }
    };
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("bambiui:discard-inspector-drafts", cancel, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", cancel);
    return () => {
      stop(); context.disconnect(); restore(); closeDraft();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("bambiui:discard-inspector-drafts", cancel, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", cancel);
    };
  }, [scope, fields, kind, restore, closeDraft]);

  if (!fields.length) return null;
  return <>
    <div className={surface.surface} data-frame-spacing-editor data-tool-surface="frame" data-system-context-change="frame-spacing">
      <div ref={toolbar} role="toolbar" aria-label="Frame tools" className={surface.toolbar} onKeyDown={toolbarKeyDown}>
        {theme && frameSizeFields(scope).length > 0 && <button type="button" data-size-trigger aria-pressed={kind === "size"} onClick={() => { setSizePanel(true); setKind("size"); }}>Size</button>}
        {(["padding", "margin"] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "padding" ? "Padding" : "Margin"}</button>)}
        {corners.length > 0 && <button type="button" aria-pressed={kind === "radius"} onClick={() => setKind("radius")}>Corners</button>}
        {gapFields.length > 0 && <button type="button" aria-pressed={kind === "layout"} onClick={() => setKind("layout")}>Gap</button>}
        {kind === "radius" && <button type="button" aria-label="Link corners" title="Link corners" aria-pressed={linked} onClick={() => { restore(); closeDraft(); setLinked(value => !value); }}>Link</button>}
        {onTextTarget && <button type="button" data-target-switch="text" title="Edit this layer's typography and color" onClick={onTextTarget}>Text</button>}
      </div>
      <p id={help} className={styles.srOnly}>Drag spacing edges or drag corners diagonally inward to grow and outward to shrink; release to apply. Link corners applies the next changed value to all supported corners; linking alone changes nothing. Drag the gap handle along the layout direction when two items are visible. Click or press Enter/Space to enter a value; Enter or Apply saves. Escape, Cancel or leaving the editor discards. Applies to this size in both themes. Arrow keys adjust; Shift ×10.</p>
      <span className={styles.srOnly} role="status">{announcement}</span>
      {(() => {
        const keys = fields.map(field => field.key);
        const scopeText = editScopeLabel(scope, keys[0], themeLabel);
        const name = kind === "size" && !sizePanel ? "Resize" : toolNames[kind];
        const hint = kind === "size" ? (sizePanel ? "Choose Hug, Fill or Fixed per axis; Enter or Apply saves." : resizeHint)
          : kind === "layout" && measurement?.gap && !measurement.gap.axis ? measurement.gap.reason : toolHints[kind];
        const reset = theme && !(kind === "size" && sizePanel) ? { label: kind === "size" ? "Size" : toolNames[kind], enabled: groupResettable(theme, scope, keys), onReset: () => {
          restore(); closeDraft(); onCommit(scope, groupResetPatch(keys)); setAnnouncement(`${toolNames[kind]} reset. ${scopeText}.`);
        } } : undefined;
        return <ToolStatus tool={name} scope={scopeText} hint={hint} hintId={kind === "size" && !sizePanel ? `${help}-resize-help` : undefined} reset={reset} />;
      })()}
      {kind === "size" && theme && sizePanel && <FrameSizeEditor selection={scope} theme={theme} onCommit={onCommit} onClose={() => setKind("padding")} onResize={() => setSizePanel(false)} id={help} />}
    </div>
    {kind === "size" && theme && !sizePanel && <FrameResizeEditor selection={scope} theme={theme} onCommit={onCommit} onHint={setResizeHint} id={help} />}
    {kind !== "size" && measurement && <div className={styles.overlay} data-spacing-overlay={kind} data-system-context-change="frame-spacing" style={{ left: measurement.left, top: measurement.top, width: measurement.width, height: measurement.height }}>
      {fields.map(field => {
        const value = measurement.values[field.key];
        if (!Number.isFinite(value)) return null;
        const gap = kind === "layout" ? measurement.gap : undefined;
        const slot = gap?.axis ? gap.slot : undefined;
        const side = kind === "layout" ? (slot ? "gap" : "top") : kind === "radius" ? field.key.replace("border", "").replace("Radius", "").toLowerCase() : field.key.replace(kind, "").toLowerCase();
        const vertical = kind === "layout" ? gap?.axis === "y" : side === "top" || side === "bottom";
        // Keep hit targets outside the frame so small labels and native fields remain selectable.
        const inset = vertical ? -20 : -24;
        return <button key={field.key} type="button" role="slider" className={styles.handle} data-spacing-handle={field.key} data-side={side}
          data-gap-axis={gap ? gap.axis ?? "none" : undefined}
          style={slot ? { left: slot.left + slot.width / 2, top: slot.top + slot.height / 2 } : kind === "radius" ? undefined : { [side]: inset }}
          aria-label={kind === "layout" ? (slot ? "Drag gap" : "Gap") : `Drag ${field.label.toLowerCase()}`} aria-describedby={gap && !gap.axis ? `${help} ${help}-gap-reason` : help}
          aria-valuenow={value} aria-valuemin={field.min} aria-valuemax={field.max} aria-valuetext={`${value} pixels`} aria-orientation={vertical ? "vertical" : "horizontal"}
          title={`${field.label}: ${value}px${gap && !gap.axis ? ` · ${gap.reason}` : ""}`}
          onPointerDown={event => {
            if (event.button !== 0 || gesture.current) return;
            const element = canvasAppearanceElements(selection)[0];
            if (!(element instanceof HTMLElement)) return;
            event.preventDefault(); event.stopPropagation();
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            const initial = initialValue(field, value);
            const affected = kind === "radius" && linked ? fields : [field];
            const properties = affected.map(candidate => {
              const property = candidate.key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
              return { property, previous: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) };
            });
            gesture.current = { trigger: event.currentTarget, dragging: false, pointer: event.pointerId, x: event.clientX, y: event.clientY, initial, value: initial, field, element, properties,
              display: element.style.getPropertyValue("display"), displayPriority: element.style.getPropertyPriority("display") };
          }}
          onPointerMove={event => {
            const drag = gesture.current;
            if (!drag || drag.pointer !== event.pointerId) return;
            // Without a visible single-axis gap the handle only opens the numeric editor.
            if (kind === "layout" && !gap?.axis) return;
            if (!drag.dragging && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
            drag.dragging = true;
            const next = spacingDragValue(field, drag.initial, event.clientX - drag.x, event.clientY - drag.y, event.altKey, gap?.axis ?? "x");
            if (next === drag.value) return;
            drag.value = next;
            if (getComputedStyle(drag.element).display === "inline") drag.element.style.setProperty("display", "inline-block");
            for (const { property, previous, priority } of drag.properties) {
              // Returning to the initial value is a no-op, including divergent linked corners.
              if (next !== drag.initial) drag.element.style.setProperty(property, `${next}px`, "important");
              else if (previous) drag.element.style.setProperty(property, previous, priority);
              else drag.element.style.removeProperty(property);
            }
          }}
          onPointerUp={event => {
            if (gesture.current?.pointer !== event.pointerId) return;
            const drag = restore();
            if (drag && !drag.dragging) { openDraft(field, drag.initial, event.currentTarget); return; }
            const patch = drag && spacingEditPatch(fields, field, drag.initial, drag.value, linked);
            if (patch) { onCommit(selection, patch); setAnnouncement(`${field.label}: ${drag!.value}px. Applied to this size in both themes.`); }
          }}
          onPointerCancel={() => { restore(); setAnnouncement("Frame change cancelled."); }}
          onLostPointerCapture={() => { restore(); }}
          onKeyDown={event => {
            if (!gesture.current && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault(); event.stopPropagation();
              openDraft(field, value, event.currentTarget); return;
            }
            if (gesture.current || !["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const delta = (event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1);
            const initial = initialValue(field, value);
            const next = Math.min(field.max!, Math.max(field.min!, initial + delta));
            const patch = spacingEditPatch(fields, field, initial, next, linked);
            if (patch) onCommit(selection, patch);
          }}><span>{Number(value.toFixed(2))}</span></button>;
      })}
      {measurement.gap && !measurement.gap.axis && <span id={`${help}-gap-reason`} className={styles.srOnly}>{measurement.gap.reason}</span>}
      {draft && <div ref={editor} className={styles.valueEditor} data-spacing-value-editor role="group" aria-label={`${draft.field.label} value`}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeDraft(); }}>
        <label htmlFor={`${help}-value`}>{draft.field.label} (px)</label>
        <input ref={input} id={`${help}-value`} type="text" inputMode="decimal" aria-label={`Edit ${draft.field.label.toLowerCase()}`}
          value={draft.text} aria-invalid={spacingNumericValue(draft.text, draft.field) === null}
          aria-describedby={`${help}-value-help`} onChange={event => changeDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); applyDraft(); }
            if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) {
              event.preventDefault(); event.stopPropagation();
              const value = spacingNumericValue(event.currentTarget.value, draft.field);
              if (value === null) return;
              const delta = (event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1);
              changeDraft(String(Math.min(draft.field.max!, Math.max(draft.field.min!, value + delta))));
            }
          }} />
        <span id={`${help}-value-help`}>{spacingNumericValue(draft.text, draft.field) === null ? `Enter a number from ${draft.field.min} to ${draft.field.max}.` : "Enter or Apply saves. Leaving discards."}</span>
        <div><button type="button" disabled={spacingNumericValue(draft.text, draft.field) === null} onClick={applyDraft}>Apply</button>
          <button type="button" onClick={() => { closeDraft(true); setAnnouncement("Frame change cancelled."); }}>Cancel</button></div>
      </div>}
    </div>}
  </>;
}
