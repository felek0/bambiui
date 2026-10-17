import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AppearanceField } from "./components/appearance";
import type { ComponentRecipeSelection } from "./component-recipes";
import type { FrameSpacingCommit } from "./frame-spacing-editor";
import type { ThemeTokens } from "./tokens";
import { canvasAppearanceElements, readCanvasAppearance } from "./rendered-appearance";
import { useCanvasAppearance } from "./use-canvas-appearance";
import { textToolFields, textToolPatch, textToolPreviewVariables, textToolScope, textToolScrub, textToolSource } from "./text-tools-model";
import styles from "./text-tools-editor.module.css";

type Scrub = { id: number; label: HTMLElement; root: HTMLElement; x: number; initial: number; value: number; moved: boolean; previous: Map<string, { value: string; priority: string }> };
type RowProps = { field: AppearanceField; selection: ComponentRecipeSelection; theme: ThemeTokens; themeLabel: string; rendered?: string; onCommit: FrameSpacingCommit; id: string; announce: (message: string) => void };

const unit = (field: AppearanceField) => field.key === "lineHeight" ? "×" : field.type === "number" && field.key !== "fontWeight" ? "px" : "";
const shortLabel: Partial<Record<AppearanceField["key"], string>> = { fontSize: "Size", fontWeight: "Weight", lineHeight: "Line height", letterSpacing: "Letter spacing", textAlign: "Align", color: "Color" };

function TextToolRow({ field, selection, theme, themeLabel, rendered, onCommit, id, announce }: RowProps) {
  const source = textToolSource(theme, selection, field);
  const baseline = source.own !== undefined ? String(source.own) : rendered ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const scrub = useRef<Scrub | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const label = shortLabel[field.key] ?? field.label;
  const scope = textToolScope(selection, field, themeLabel);
  const numeric = field.type === "number";

  const discard = useCallback(() => { setDraft(null); setError(""); }, []);
  const restore = useCallback(() => {
    const active = scrub.current;
    if (!active) return null;
    scrub.current = null;
    for (const [property, previous] of active.previous) {
      if (previous.value) active.root.style.setProperty(property, previous.value, previous.priority);
      else active.root.style.removeProperty(property);
    }
    if (active.label.hasPointerCapture(active.id)) active.label.releasePointerCapture(active.id);
    setScrubValue(null);
    return active;
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (scrub.current && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); restore(); announce(`${label} change cancelled.`); } };
    const cancel = () => { restore(); discard(); };
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener("keydown", key, true);
    document.addEventListener("bambiui:discard-inspector-drafts", cancel, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", cancel);
    return () => {
      restore();
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("bambiui:discard-inspector-drafts", cancel, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", cancel);
    };
  }, [restore, discard, announce, label]);

  function commit(text: string) {
    const result = textToolPatch(field, text, baseline);
    if ("error" in result) { setError(result.error); return; }
    discard();
    if (result.patch) { onCommit(selection, result.patch); announce(`${label}: ${text.trim()}${unit(field)}. ${scope}.`); }
  }

  const scrubHandlers = numeric ? {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0 || scrub.current) return;
      const element = canvasAppearanceElements(selection)[0];
      const root = element?.closest<HTMLElement>(`[data-ds-component="${selection.component}"][data-component-part="root"]`);
      // Measure now: the observed value can lag one frame behind a just-cancelled preview.
      const start = source.own !== undefined ? String(source.own) : readCanvasAppearance(selection, [field])[field.key] ?? "";
      const initial = Number(start);
      if (!root || start === "" || !Number.isFinite(initial)) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      discard();
      scrub.current = { id: event.pointerId, label: event.currentTarget, root, x: event.clientX, initial, value: initial, moved: false, previous: new Map() };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const active = scrub.current;
      if (!active || active.id !== event.pointerId) return;
      const dx = event.clientX - active.x;
      if (!active.moved && Math.abs(dx) < 3) return;
      active.moved = true;
      const value = textToolScrub(field, active.initial, dx, event.altKey);
      if (value === active.value) return;
      active.value = value;
      const variables = textToolPreviewVariables(theme, selection, { [field.key]: value });
      for (const [property, next] of Object.entries(variables)) {
        if (!active.previous.has(property)) active.previous.set(property, { value: active.root.style.getPropertyValue(property), priority: active.root.style.getPropertyPriority(property) });
        active.root.style.setProperty(property, next);
      }
      setScrubValue(value === active.initial ? null : value);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      if (scrub.current?.id !== event.pointerId) return;
      const active = restore();
      if (!active?.moved) { input.current?.focus({ preventScroll: true }); input.current?.select(); return; }
      if (active.value !== active.initial) { onCommit(selection, { [field.key]: active.value }); announce(`${label}: ${active.value}${unit(field)}. ${scope}.`); }
    },
    onPointerCancel() { if (restore()) announce(`${label} change cancelled.`); },
    onLostPointerCapture() { restore(); },
  } : {};

  const resetButton = <button type="button" className={styles.reset} disabled={!source.resettable} aria-label={`Reset ${label.toLowerCase()}`} title={source.resettable ? `Remove ${label.toLowerCase()} overrides · ${scope}` : "No override to reset"}
    onClick={() => { discard(); onCommit(selection, { [field.key]: null }); announce(`${label} reset. ${scope}.`); }}>↺</button>;
  const sourceText = `${source.own !== undefined ? "Override" : source.source}${rendered !== undefined && rendered !== "" ? ` · rendered ${rendered}${unit(field)}` : ""}`;

  if (field.type === "select") return <div className={styles.row} data-text-tool={field.key} role="group" aria-label={`${label} · ${scope}`}>
    <span className={styles.label}>{label}</span>
    <div className={styles.segments}>
      {field.options!.map(option => <button key={option} type="button" aria-pressed={(source.own ?? rendered) === option} onClick={() => {
        if (option === source.own) return;
        onCommit(selection, { [field.key]: option }); announce(`${label}: ${option}. ${scope}.`);
      }}>{option[0].toUpperCase() + option.slice(1)}</button>)}
    </div>
    {resetButton}
    <small className={styles.source} title={scope}>{sourceText}</small>
  </div>;

  const text = draft ?? baseline;
  const color = field.type === "color" && /^#[\da-f]{6}$/i.test(text) ? text : "#000000";
  return <div className={styles.row} data-text-tool={field.key} data-scrub-value={scrubValue ?? undefined}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) discard(); }}>
    <label htmlFor={`${id}-${field.key}`} className={styles.label} data-scrub={numeric || undefined} title={numeric ? `Drag to adjust ${label.toLowerCase()} · Alt for fine steps` : undefined} {...scrubHandlers}>
      {label}{scrubValue !== null && <span aria-hidden="true"> {scrubValue}</span>}
    </label>
    <div className={styles.control}>
      {field.type === "color" && <input type="color" aria-label={`${label} picker`} value={color.toLowerCase()} onChange={event => { setDraft(event.target.value); setError(""); }} />}
      <input ref={input} id={`${id}-${field.key}`} type="text" inputMode={numeric ? "decimal" : undefined} value={text} aria-invalid={!!error}
        aria-describedby={`${id}-${field.key}-help`} aria-label={`${label} · ${scope}`}
        onChange={event => { setDraft(event.target.value); setError(""); }}
        onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (draft !== null) commit(draft); }
          if (event.key === "Escape" && draft !== null) { event.preventDefault(); event.stopPropagation(); discard(); }
          if (numeric && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            const current = Number(text);
            if (text.trim() === "" || !Number.isFinite(current)) return;
            const step = (field.key === "fontWeight" ? 100 : field.key === "lineHeight" ? 0.05 : 1) * (event.shiftKey ? 10 : 1) * (event.altKey && field.key !== "fontWeight" ? 0.1 : 1);
            const next = Number(Math.min(field.max!, Math.max(field.min!, current + (event.key === "ArrowUp" ? step : -step))).toFixed(6));
            setDraft(String(next)); setError("");
          }
        }} />
      {draft !== null && <button type="button" className={styles.apply} aria-label={`Apply ${label.toLowerCase()}`} onClick={() => commit(draft)}>✓</button>}
      {resetButton}
    </div>
    <small id={`${id}-${field.key}-help`} className={error ? styles.error : styles.source} title={scope}>{error || (draft !== null ? "Enter applies · Esc cancels" : sourceText)}</small>
  </div>;
}

/** Compact typography and ink controls beside a selected text layer. Opening it never writes an override. */
export function TextToolsEditor({ selection, theme, themeLabel, onCommit, id }: { selection: ComponentRecipeSelection; theme: ThemeTokens; themeLabel: string; onCommit: FrameSpacingCommit; id: string }) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const toggle = useRef<HTMLButtonElement>(null);
  const { component, recipe, part, target } = selection;
  const scope = useMemo(() => ({ component, recipe, part, target }), [component, recipe, part, target]);
  const fields = useMemo(() => textToolFields(scope), [scope]);
  const rendered = useCanvasAppearance(scope, fields);
  if (!fields.length) return null;
  const typography = fields.find(field => field.type !== "color");
  return <>
    <button ref={toggle} type="button" className={styles.toggle} data-text-tools-toggle aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(value => !value)}>Text</button>
    {open && <div id={`${id}-panel`} className={styles.panel} data-text-tools role="group" aria-label="Text styles" data-system-context-change="text-tools"
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); toggle.current?.focus({ preventScroll: true }); } }}>
      <p className={styles.scope}>{typography && textToolScope(scope, typography, themeLabel)} · color: this combination, {themeLabel}</p>
      {fields.map(field => <TextToolRow key={field.key} field={field} selection={scope} theme={theme} themeLabel={themeLabel} rendered={rendered[field.key]} onCommit={onCommit} id={id} announce={setAnnouncement} />)}
    </div>}
    <span className={styles.srOnly} role="status">{announcement}</span>
  </>;
}
