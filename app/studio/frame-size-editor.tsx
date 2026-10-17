import { useEffect, useMemo, useRef, useState } from "react";
import type { ThemeTokens } from "./tokens";
import type { ComponentRecipeSelection } from "./component-recipes";
import type { AppearanceField } from "./components/appearance";
import type { FrameSpacingCommit } from "./frame-spacing-editor";
import { frameSizeFields, frameSizePatch, frameSizeSource, type SizeMode } from "./frame-size-model";
import { spacingNumericValue } from "./spacing-numeric-draft";
import { useCanvasAppearance } from "./use-canvas-appearance";
import styles from "./frame-size-editor.module.css";

function SizeAxisEditor({ field, selection, theme, measured, onCommit, id }: {
  field: AppearanceField; selection: ComponentRecipeSelection; theme: ThemeTokens; measured?: string; onCommit: FrameSpacingCommit; id: string;
}) {
  const source = frameSizeSource(theme, selection, field);
  const [draft, setDraft] = useState<{ mode: SizeMode; text: string } | null>(null);
  const mode = draft?.mode ?? source.mode;
  const initialText = typeof source.effective === "number" ? String(source.effective) : measured && Number.isFinite(Number(measured)) ? measured : "";
  const text = draft?.text ?? initialText;
  const invalid = mode === "fixed" && spacingNumericValue(text, field) === null;
  const name = field.key === "width" ? "width" : "height";
  const label = field.label;
  function apply() {
    if (invalid) return;
    const patch = frameSizePatch(field, source.own, mode, text);
    setDraft(null);
    if (patch) onCommit(selection, patch);
  }
  return <fieldset data-size-axis={name} onKeyDown={event => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); apply(); }
  }}>
    <legend>{label}</legend>
    <p data-size-source={name}>{source.source}: {source.effective === undefined ? "CSS defaults" : typeof source.effective === "number" ? `Fixed ${source.effective}px` : source.effective === "hug" ? "Hug" : "Fill"}</p>
    <p data-size-measured={name}>Rendered: {measured ?? "—"}{measured && Number.isFinite(Number(measured)) ? "px" : ""}</p>
    <label htmlFor={`${id}-mode`}>{label} mode</label>
    <select id={`${id}-mode`} aria-label={`${label} mode`} value={mode} onChange={event => setDraft({ mode: event.target.value as SizeMode, text })}>
      <option value="default">Use defaults</option><option value="hug">Hug</option><option value="fill">Fill</option><option value="fixed">Fixed</option>
    </select>
    {mode === "fixed" && <><label htmlFor={`${id}-value`}>Fixed {name} (px)</label><input id={`${id}-value`} type="text" inputMode="decimal" aria-label={`Fixed ${name}`} aria-invalid={invalid} aria-describedby={`${id}-hint`} value={text} onChange={event => setDraft({ mode, text: event.target.value })} /></>}
    <p id={`${id}-hint`}>{invalid ? `Enter a number from ${field.min} to ${field.max}.` : mode === "fill" ? `100% of the parent ${name}, not remaining flex space.${name === "height" ? " Requires a definite parent height." : ""}` : mode === "hug" ? name === "width" ? "Fits content within available width (fit-content)." : "Automatic content height (auto)." : mode === "default" ? "Remove this size group's override; keep shared and CSS defaults." : "Fixed pixels remain subject to min/max and layout constraints."}</p>
    <div className={styles.actions}>
      <button type="button" disabled={invalid || !draft} onClick={apply}>Apply {name}</button>
      <button type="button" disabled={!draft} onClick={() => setDraft(null)}>Cancel {name}</button>
      <button type="button" disabled={!source.resettable} onClick={() => { setDraft(null); onCommit(selection, { [name]: null }); }}>Reset {name}</button>
    </div>
  </fieldset>;
}

export function FrameSizeEditor({ selection, theme, onCommit, onClose, onResize, id }: {
  selection: ComponentRecipeSelection; theme: ThemeTokens; onCommit: FrameSpacingCommit; onClose: () => void; onResize?: () => void; id: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const fields = useMemo(() => frameSizeFields(selection), [selection]);
  const values = useCanvasAppearance(selection, fields);
  useEffect(() => {
    root.current?.querySelector<HTMLSelectElement>("select")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) close.current(); };
    const cancel = () => close.current();
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("bambiui:discard-inspector-drafts", cancel);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", cancel);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("bambiui:discard-inspector-drafts", cancel); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", cancel); };
  }, []);
  return <div ref={root} className={styles.panel} data-frame-size-editor role="group" aria-label="Frame size" data-system-context-change="frame-size"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onClose(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); const trigger = root.current?.parentElement?.querySelector<HTMLButtonElement>('[data-size-trigger]'); onClose(); trigger?.focus({ preventScroll: true }); } }}>
    <header><strong>Frame size</strong><button type="button" onClick={onClose} aria-label="Close frame size">×</button></header>
    <p>Same size · both themes. Enter or Apply saves; leaving discards drafts.</p>
    {onResize && <button type="button" onClick={onResize}>Resize on frame</button>}
    {fields.map(field => <SizeAxisEditor key={`${field.key}-${JSON.stringify([theme.componentRecipes, theme.componentStyles])}`} field={field} selection={selection} theme={theme} measured={values[field.key]} onCommit={onCommit} id={`${id}-${field.key}`} />)}
  </div>;
}
