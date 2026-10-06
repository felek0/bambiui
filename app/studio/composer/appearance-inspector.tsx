"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { appearanceFieldsFor, appearanceParts, type AppearanceField, type AppearancePatch, type NodeAppearance, type NodePart } from "../page-document/appearance";
import type { PageNode } from "../page-document/model";
import { readRenderedAppearance } from "../rendered-appearance";
import { appearanceDraft, linkedAppearancePatch } from "./appearance-draft";
import type { NodeSelection } from "./selection";
import type { Composer } from "./use-composer";
import styles from "./inspector.module.css";

type Target = "element" | NodePart;
const groupLabels = { dimensions: "Dimensions", layout: "Layout", padding: "Padding", margin: "Margin", radius: "Corner radius", typography: "Typography", surface: "Fill & stroke" };
const shortLabels: Partial<Record<keyof NodeAppearance, string>> = {
  paddingTop: "Top", paddingRight: "Right", paddingBottom: "Bottom", paddingLeft: "Left",
  marginTop: "Top", marginRight: "Right", marginBottom: "Bottom", marginLeft: "Left",
  borderTopLeftRadius: "Top left", borderTopRightRadius: "Top right", borderBottomRightRadius: "Bottom right", borderBottomLeftRadius: "Bottom left",
};

function sameAppearanceValue(field: AppearanceField, left: string, right: string): boolean {
  if (left === right) return true;
  const numeric = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
  return (field.type === "number" || field.type === "dimension") && numeric.test(left) && numeric.test(right)
    && Number(left) === Number(right);
}

function AppearanceInput({ field, value, resolved, disabled, targetLabel, onCommit, onClearError }: {
  field: AppearanceField; value: NodeAppearance[keyof NodeAppearance]; resolved?: string; disabled: boolean;
  targetLabel: string; onCommit: (draft: string) => boolean; onClearError?: () => void;
}) {
  const id = useId();
  const current = value === undefined ? resolved ?? "" : String(value);
  const [draft, setDraft] = useState<string | null>(null);
  // Keep the edit's starting value even if a measurement changes during typing.
  // Consume pending edits synchronously so Enter/Escape/reset cannot also commit on blur.
  const pending = useRef<{ text: string; baseline: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const discard = () => { pending.current = null; setDraft(null); setInvalid(false); onClearError?.(); };
  const save = (next: string) => {
    pending.current = null;
    if (disabled) return;
    const saved = onCommit(next);
    setInvalid(!saved);
    if (saved) setDraft(null);
  };
  const commit = () => {
    const edit = pending.current;
    pending.current = null;
    if (disabled || !edit) return;
    const text = edit.text.trim();
    if ((!text && value === undefined) || (text && (sameAppearanceValue(field, text, edit.baseline) || sameAppearanceValue(field, text, current)))) { discard(); return; }
    save(edit.text);
  };
  const label = `${targetLabel} ${field.label}`;
  const title = value === undefined ? "Current value. Edit to override; reset to follow the linked system." : "Local override. Clear or reset to follow the linked system.";
  return <div className={styles.property} data-overridden={value !== undefined || undefined}>
    <label htmlFor={id}>{shortLabels[field.key] ?? field.label}</label>
    <div className={styles.inputRow}>
      {field.type === "color" && <span className={styles.colorChip} style={{ backgroundColor: (draft ?? current) || "transparent" }} aria-hidden="true" />}
      {field.type === "select" ? <select id={id} value={draft ?? (value === undefined ? "" : String(value))} aria-label={label} disabled={disabled} aria-invalid={invalid || undefined} title={title} data-appearance-key={field.key} onChange={event => {
        if (disabled) return;
        const next = event.target.value;
        if (next === (value === undefined ? "" : String(value)) || next && next === current) { discard(); return; }
        setDraft(next); onClearError?.(); save(next);
      }}>
        <option value="">{resolved || "Not rendered"}</option>
        {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
      </select> : <input id={id} type="text" inputMode={field.type === "number" || field.type === "dimension" ? "decimal" : undefined} aria-label={label} disabled={disabled} aria-invalid={invalid || undefined}
        title={title} data-appearance-key={field.key} value={draft ?? current} placeholder="Not rendered"
        list={field.options?.length ? `${id}-options` : undefined} onChange={event => {
          if (disabled) return;
          pending.current = { text: event.target.value, baseline: pending.current?.baseline ?? current };
          setDraft(event.target.value); setInvalid(false); onClearError?.();
        }} onBlur={commit}
        onKeyDown={event => {
          if (disabled || event.nativeEvent.isComposing) return;
          if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); commit(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); discard(); }
        }} />}
      {field.options?.length && field.type !== "select" ? <datalist id={`${id}-options`}>{field.options.map(option => <option key={option} value={option} />)}</datalist> : null}
      {value !== undefined && <button type="button" className={styles.reset} aria-label={`Reset ${label}`} title="Reset to the linked system" disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={() => save("")}>↺</button>}
    </div>
  </div>;
}

function AppearanceGroup({ group, fields, values, resolved, disabled, targetLabel, onCommit, onClearError }: {
  group: AppearanceField["group"]; fields: readonly AppearanceField[]; values: NodeAppearance; resolved: Record<string, string>;
  disabled: boolean; targetLabel: string; onCommit: (field: AppearanceField, draft: string, linkedKeys?: readonly (keyof NodeAppearance)[]) => boolean;
  onClearError: () => void;
}) {
  const [linked, setLinked] = useState(false);
  const linkable = ["padding", "margin", "radius"].includes(group);
  const count = fields.filter(field => values[field.key] !== undefined).length;
  return <details className={styles.group} open={group !== "margin"}>
    <summary>{groupLabels[group]}{count > 0 && <span className={styles.overrideCount} title={`${count} local overrides`}>{count}</span>}</summary>
    {linkable && <button className={styles.linkToggle} type="button" disabled={disabled} aria-pressed={linked} aria-label={`Link ${group === "radius" ? "corners" : group + " sides"}`} onClick={() => setLinked(!linked)}>{linked ? "Linked" : "Independent"}</button>}
    <div className={styles.propertyGrid}>
      {fields.map(field => <AppearanceInput key={`${field.key}-${values[field.key] ?? "linked"}`} field={field} value={values[field.key]} resolved={resolved[field.key]} disabled={disabled} targetLabel={targetLabel}
        onClearError={onClearError} onCommit={draft => onCommit(field, draft, linked ? fields.map(entry => entry.key) : undefined)} />)}
    </div>
  </details>;
}

function observeAppearance(frameId: string, nodeId: string, target: Target, isField: boolean, fields: readonly AppearanceField[], onChange: (values: Record<string, string>) => void) {
  const frame = document.querySelector(`[data-frame-id="${frameId}"]`);
  let active = true, tick = 0;
  let observed: Element | null = null;
  const update = () => {
    tick = 0;
    const owner = frame?.querySelector(`[data-page-owner="${nodeId}"]`);
    const part = target === "element" ? "control" : target;
    const element = (isField ? part === "root" ? owner : owner?.querySelector(`[data-appearance-part="${part}"]`)
      : frame?.querySelector(`[data-page-node="${nodeId}"]`)) ?? null;
    if (element !== observed) {
      if (observed) resize.unobserve(observed);
      if (element) resize.observe(element);
      observed = element;
    }
    onChange(readRenderedAppearance(element ? [element] : [], fields));
  };
  const schedule = () => { if (active && !tick) tick = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  // The frame contains the preview, not the inspector. Ignore selection-overlay paint.
  const mutation = new MutationObserver(records => {
    if (records.some(record => !(record.target instanceof Element && record.target.closest("[data-node-overlay]")))) schedule();
  });
  if (frame) {
    resize.observe(frame);
    mutation.observe(frame, { subtree: true, attributes: true, childList: true, characterData: true });
    for (let ancestor = frame.parentElement; ancestor; ancestor = ancestor.parentElement) {
      mutation.observe(ancestor, { attributes: true, attributeFilter: ["style", "class", "data-ds-theme"] });
    }
  }
  const fonts = document.fonts;
  fonts?.ready.then(schedule);
  fonts?.addEventListener("loadingdone", schedule);
  fonts?.addEventListener("loadingerror", schedule);
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    active = false;
    cancelAnimationFrame(tick); resize.disconnect(); mutation.disconnect();
    fonts?.removeEventListener("loadingdone", schedule);
    fonts?.removeEventListener("loadingerror", schedule);
    window.removeEventListener("resize", schedule);
  };
}

/** Same controls for every node and compound slot; no per-component geometry forms. */
export function AppearanceInspector({ composer, selection, node, disabled, frame = false }: { composer: Composer; selection: NodeSelection; node: PageNode; disabled: boolean; frame?: boolean }) {
  const parts = appearanceParts(node.kind);
  const isField = parts.length > 0;
  const [target, setTarget] = useState<Target>("element");
  const [error, setError] = useState("");
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [resetVersion, setResetVersion] = useState(0);
  const targetLabel = target === "element" ? isField ? "Control" : frame ? "Frame" : "Component" : parts.find(part => part.key === target)!.label;
  const fields = useMemo(() => appearanceFieldsFor(node.kind, target === "element" ? undefined : target).filter(field => (!frame || field.group !== "dimensions") && (node.kind !== "container" || field.key !== "gap" || !!node.props?.direction)), [node.kind, node.props?.direction, target, frame]);
  const values = target === "element" ? { ...node.appearance, ...(isField ? node.parts?.control : {}) } : node.parts?.[target] ?? {};
  const groups = [...new Set(fields.map(field => field.group))];

  useEffect(() => observeAppearance(selection.frameId, node.id, target, isField, fields, next => {
    setResolved(previous => Object.keys(previous).length === Object.keys(next).length && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
  }), [node.id, target, selection.frameId, isField, fields]);

  const commit = (patch: AppearancePatch | null) => {
    if (disabled || (patch === null && !Object.keys(values).length)) return false;
    const primary = target === "element";
    // Imported control-part values take precedence. An explicit primary edit resets just
    // those competing keys, not unrelated authored part styles.
    const resetControl = primary && isField ? patch === null ? null : Object.fromEntries(Object.keys(patch).map(key => [key, null])) : undefined;
    const saved = composer.controller.execute({ type: "nodeCommands", pageId: selection.pageId, frameId: selection.frameId, commands: [{ type: "update", nodeId: node.id,
      ...(primary ? { appearance: patch, ...(isField ? { parts: { control: resetControl } } : {}) } : { parts: { [target]: patch } }),
    }] });
    if (!saved) setError("This edit could not be saved. Check the project notice.");
    return saved;
  };
  const missingPart = target === "error" ? !node.props?.error : target === "description" ? !node.props?.description : false;
  return <div className={styles.appearance} aria-label="Local appearance">
    {isField && <label className={styles.partPicker}>Edit part<select aria-label="Edit component part" value={target} onChange={event => { setTarget(event.target.value as Target); setError(""); }}>
      <option value="element">Control</option>{parts.filter(part => part.key !== "control").map(part => <option key={part.key} value={part.key}>{part.label}</option>)}
    </select></label>}
    <div className={styles.inheritance}><span>Current values</span><button type="button" disabled={disabled || !Object.keys(values).length} onPointerDown={event => event.preventDefault()} onClick={() => { setError(""); if (commit(null)) setResetVersion(version => version + 1); }} title="Reset this part to the linked system">Reset part</button></div>
    {missingPart && <p className={styles.note}>Add {target === "error" ? "an error message" : "a description"} in Content to preview this part.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {groups.map(group => <AppearanceGroup key={`${target}-${group}-${resetVersion}`} group={group} fields={fields.filter(field => field.group === group)} values={values} resolved={resolved} disabled={disabled} targetLabel={targetLabel}
      onClearError={() => setError("")} onCommit={(field, draft, linkedKeys) => {
        try {
          let patch = appearanceDraft(node.kind, field, draft, target === "element" ? undefined : target);
          if (linkedKeys) patch = linkedAppearancePatch(patch, linkedKeys);
          setError("");
          return commit(patch);
        } catch (error) { setError(error instanceof Error ? error.message : "Invalid value."); return false; }
      }} />)}
    <p className={styles.note}>Local colors apply in both themes. Reset them to follow the system. Check contrast in Light and Dark after color edits.</p>
  </div>;
}
