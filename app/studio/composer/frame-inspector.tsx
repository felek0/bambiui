"use client";

import { useId, useState } from "react";
import { Button } from "../controls";
import { nodeRegistry } from "../page-document/registry";
import { COMPOSER_LIMITS, type ComposerFrame } from "./model";
import { geometryDraft } from "./frames";
import type { Composer } from "./use-composer";
import { AppearanceInspector } from "./appearance-inspector";
import styles from "./inspector.module.css";

function GeometryField({ field, value, disabled, onCommit }: { field: "width" | "height" | "x" | "y"; value: number; disabled: boolean; onCommit: (value: number) => boolean }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const parsed = geometryDraft(draft, field), invalid = parsed === null;
  const commit = () => { if (parsed !== null && parsed !== value) onCommit(parsed); };
  return <div className={styles.property}><label htmlFor={id}>{field === "x" || field === "y" ? field.toUpperCase() : field === "width" ? "Width" : "Height"}</label>
    <input id={id} aria-label={`Frame ${field}`} inputMode="decimal" value={draft} disabled={disabled} aria-invalid={invalid || undefined} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter") { event.preventDefault(); commit(); }
      if (event.key === "Escape") { event.preventDefault(); setDraft(String(value)); }
    }} />
    {invalid && <span className={styles.error} role="status">Use {field === "width" || field === "height" ? `1–${COMPOSER_LIMITS.maxDimension}` : `−${COMPOSER_LIMITS.maxCoordinate}–${COMPOSER_LIMITS.maxCoordinate}`} px.</span>}
  </div>;
}

export function FrameInspector({ composer, frame, disabled }: { composer: Composer; frame: ComposerFrame; disabled: boolean }) {
  const [name, setName] = useState(frame.name);
  const [nameError, setNameError] = useState(false);
  const pageId = composer.page!.id;
  const selection = { projectId: composer.document!.id, pageId, frameId: frame.id, nodeId: frame.root.id };
  const rename = () => {
    if (name.trim() === frame.name) return;
    setNameError(!name.trim() || !composer.controller.execute({ type: "renameFrame", pageId, frameId: frame.id, name: name.trim() }));
  };
  const autoLayout = !!frame.root.props?.direction;
  return <div aria-label="Frame settings">
    <div className={styles.heading}><h3>Frame<small>{frame.preset} · {frame.width} × {frame.height}</small></h3></div>
    <label className={styles.property}>Name<input className={styles.textInput} aria-label="Frame name" value={name} maxLength={120} disabled={disabled} aria-invalid={nameError || undefined} onChange={event => { setName(event.target.value); setNameError(false); }} onBlur={rename} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); rename(); } if (event.key === "Escape") { setName(frame.name); setNameError(false); } }} /></label>
    {nameError && <p className={styles.error} role="alert">Enter a frame name before saving.</p>}
    <details className={styles.group} open><summary>Position & size</summary><div className={styles.propertyGrid}>
      {(["x", "y", "width", "height"] as const).map(field => <GeometryField key={`${field}-${frame[field]}`} field={field} value={frame[field]} disabled={disabled} onCommit={value => composer.controller.execute({ type: "updateFrameGeometry", pageId, frameId: frame.id, geometry: { [field]: value } })} />)}
    </div></details>
    <details className={styles.group} open><summary>Auto layout</summary><div className={styles.propertyGrid}>
      {(["direction", ...(autoLayout ? ["align", "justify", "wrap", "gap"] : [])] as const).map(field => {
        const rule = nodeRegistry.container.props[field];
        if (!Array.isArray(rule)) return null;
        return <label key={field} className={styles.property}>{field === "direction" ? "Flow" : field === "gap" ? "Gap preset" : field === "justify" ? "Distribute" : field[0].toUpperCase() + field.slice(1)}
          <select aria-label={`Frame ${field}`} value={String(frame.root.props?.[field] ?? "")} disabled={disabled} onChange={event => composer.controller.execute({ type: "nodeCommands", pageId, frameId: frame.id, commands: [{ type: "update", nodeId: frame.root.id, props: { [field]: rule.find(option => String(option) === event.target.value) ?? null } }] })}>
            <option value="">{field === "direction" ? "No auto layout" : "Default"}</option>{rule.map(option => <option key={String(option)} value={String(option)}>{option === true ? "On" : option === false ? "Off" : String(option)}</option>)}
          </select>
        </label>;
      })}
    </div></details>
    <AppearanceInspector key={`${frame.id}-${frame.root.id}`} composer={composer} selection={selection} node={frame.root} disabled={disabled} frame />
    <div className={styles.footer}><Button disabled={disabled || composer.page!.frames.length >= COMPOSER_LIMITS.framesPerPage} onClick={() => composer.controller.duplicateFrame()}>Duplicate frame</Button><p className={styles.note}>Frame size clips the editor preview. Root layout and appearance travel with exported content; canvas position does not.</p></div>
  </div>;
}
