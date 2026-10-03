"use client";

import { useEffect, useId, useState } from "react";
import { appearanceFieldsFor, appearanceParts, type AppearanceField, type AppearancePatch, type NodeAppearance, type NodePart } from "../page-document/appearance";
import type { PageNode } from "../page-document/model";
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

function AppearanceInput({ field, value, inherited, disabled, targetLabel, onCommit }: {
  field: AppearanceField; value: NodeAppearance[keyof NodeAppearance]; inherited?: string; disabled: boolean;
  targetLabel: string; onCommit: (draft: string) => boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [invalid, setInvalid] = useState(false);
  const commit = (next: string) => { const saved = onCommit(next); setInvalid(!saved); return saved; };
  const label = `${targetLabel} ${field.label}`;
  return <div className={styles.property} data-overridden={value !== undefined || undefined}>
    <label htmlFor={id}>{shortLabels[field.key] ?? field.label}</label>
    <div className={styles.inputRow}>
      {field.type === "color" && <span className={styles.colorChip} style={{ backgroundColor: draft || inherited || "transparent" }} aria-hidden="true" />}
      {field.type === "select" ? <select id={id} value={draft} aria-label={label} disabled={disabled} data-appearance-key={field.key} onChange={event => { setDraft(event.target.value); commit(event.target.value); }}>
        <option value="">Inherited{inherited ? ` · ${inherited}` : ""}</option>
        {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
      </select> : <input id={id} type="text" inputMode={field.type === "number" ? "decimal" : undefined} aria-label={label} disabled={disabled} aria-invalid={invalid || undefined}
        title={value === undefined ? "Inherited. Enter a value to override; leave empty to reset." : "Local override. Clear to inherit again."}
        data-appearance-key={field.key} value={draft} placeholder={inherited || (field.type === "dimension" ? "Auto / px" : "Inherited")}
        list={field.options?.length ? `${id}-options` : undefined} onChange={event => { setDraft(event.target.value); setInvalid(false); }}
        onBlur={() => { if (draft !== (value === undefined ? "" : String(value))) commit(draft); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") { event.preventDefault(); commit(draft); }
          if (event.key === "Escape") { event.preventDefault(); setDraft(value === undefined ? "" : String(value)); setInvalid(false); }
        }} />}
      {field.options?.length && field.type !== "select" ? <datalist id={`${id}-options`}>{field.options.map(option => <option key={option} value={option} />)}</datalist> : null}
      {value !== undefined && <button type="button" className={styles.reset} aria-label={`Reset ${label}`} title="Reset to inherited value" disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={() => { if (commit("")) setDraft(""); }}>↺</button>}
    </div>
  </div>;
}

function AppearanceGroup({ group, fields, values, inherited, disabled, targetLabel, onCommit }: {
  group: AppearanceField["group"]; fields: readonly AppearanceField[]; values: NodeAppearance; inherited: Record<string, string>;
  disabled: boolean; targetLabel: string; onCommit: (field: AppearanceField, draft: string, linkedKeys?: readonly (keyof NodeAppearance)[]) => boolean;
}) {
  const [linked, setLinked] = useState(false);
  const linkable = ["padding", "margin", "radius"].includes(group);
  const count = fields.filter(field => values[field.key] !== undefined).length;
  return <details className={styles.group} open={group !== "margin"}>
    <summary>{groupLabels[group]}{count > 0 && <span className={styles.overrideCount} title={`${count} local overrides`}>{count}</span>}</summary>
    {linkable && <button className={styles.linkToggle} type="button" disabled={disabled} aria-pressed={linked} aria-label={`Link ${group === "radius" ? "corners" : group + " sides"}`} onClick={() => setLinked(!linked)}>{linked ? "Linked" : "Independent"}</button>}
    <div className={styles.propertyGrid}>
      {fields.map(field => <AppearanceInput key={`${field.key}-${values[field.key] ?? "inherit"}`} field={field} value={values[field.key]} inherited={inherited[field.key]} disabled={disabled} targetLabel={targetLabel}
        onCommit={draft => onCommit(field, draft, linked ? fields.map(entry => entry.key) : undefined)} />)}
    </div>
  </details>;
}

/** Same controls for every node and compound slot; no per-component geometry forms. */
export function AppearanceInspector({ composer, selection, node, disabled, frame = false }: { composer: Composer; selection: NodeSelection; node: PageNode; disabled: boolean; frame?: boolean }) {
  const parts = appearanceParts(node.kind);
  const isField = parts.length > 0;
  const [target, setTarget] = useState<Target>("element");
  const [error, setError] = useState("");
  const [inherited, setInherited] = useState<Record<string, string>>({});
  const targetLabel = target === "element" ? isField ? "Control" : frame ? "Frame" : "Component" : parts.find(part => part.key === target)!.label;
  const fields = appearanceFieldsFor(node.kind, target === "element" ? undefined : target).filter(field => (!frame || field.group !== "dimensions") && (node.kind !== "container" || field.key !== "gap" || !!node.props?.direction));
  const values = target === "element" ? { ...node.appearance, ...(isField ? node.parts?.control : {}) } : node.parts?.[target] ?? {};
  const groups = [...new Set(fields.map(field => field.group))];

  useEffect(() => {
    const update = () => {
      const surface = document.querySelector(`[data-frame-id="${selection.frameId}"]`);
      const owner = surface?.querySelector(`[data-page-owner="${node.id}"]`);
      const part = target === "element" ? "control" : target;
      const element = isField ? part === "root" ? owner : owner?.querySelector(`[data-appearance-part="${part}"]`)
        : surface?.querySelector(`[data-page-node="${node.id}"]`);
      if (!element) { setInherited({}); return; }
      const computed = getComputedStyle(element);
      const entries: Record<string, string> = {};
      for (const field of appearanceFieldsFor(node.kind, target === "element" ? undefined : target)) {
        const cssKey = field.key === "background" ? "backgroundColor" : field.key;
        let value = computed[cssKey as keyof CSSStyleDeclaration];
        if (typeof value !== "string") continue;
        if (field.key === "lineHeight" && value.endsWith("px")) value = String(Math.round(parseFloat(value) / parseFloat(computed.fontSize) * 100) / 100);
        if (field.type === "number" || field.type === "dimension") value = value.replace(/px$/, "");
        if (field.type === "color") {
          const rgb = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
          if (rgb) value = "#" + rgb.slice(1).map(channel => Number(channel).toString(16).padStart(2, "0")).join("");
          else if (value === "rgba(0, 0, 0, 0)") value = "transparent";
        }
        entries[field.key] = value;
      }
      setInherited(entries);
    };
    const tick = requestAnimationFrame(update);
    const surface = document.querySelector(`[data-frame-id="${selection.frameId}"] [data-frame-surface]`);
    const observer = new MutationObserver(update);
    if (surface) observer.observe(surface, { attributes: true, attributeFilter: ["style", "data-ds-theme"] });
    return () => { cancelAnimationFrame(tick); observer.disconnect(); };
  }, [node, target, selection.frameId, isField]);

  const commit = (patch: AppearancePatch | null) => {
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
    <div className={styles.inheritance}><span>Inherited unless overridden</span><button type="button" disabled={disabled || !Object.keys(values).length} onClick={() => { setError(""); commit(null); }} title="Reset this part to the linked system">Reset part</button></div>
    {missingPart && <p className={styles.note}>Add {target === "error" ? "an error message" : "a description"} in Content to preview this part.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {groups.map(group => <AppearanceGroup key={`${target}-${group}`} group={group} fields={fields.filter(field => field.group === group)} values={values} inherited={inherited} disabled={disabled} targetLabel={targetLabel}
      onCommit={(field, draft, linkedKeys) => {
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
