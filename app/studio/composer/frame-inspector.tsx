"use client";

import { useState } from "react";
import { Button } from "../controls";
import { COMPOSER_LIMITS, type ComposerFrame } from "./model";
import { geometryDraft } from "./frames";
import type { Composer } from "./use-composer";
import styles from "./composer.module.css";

function GeometryField({ field, value, disabled, onCommit }: { field: "width" | "height" | "x" | "y"; value: number; disabled: boolean; onCommit: (value: number) => boolean }) {
  const [draft, setDraft] = useState(String(value));
  const parsed = geometryDraft(draft, field), invalid = parsed === null;
  const commit = () => { if (parsed !== null && parsed !== value) onCommit(parsed); };
  return <label>{field === "x" || field === "y" ? field.toUpperCase() : `${field[0].toUpperCase()}${field.slice(1)}`} (px)
    <input aria-label={`Frame ${field}`} inputMode="decimal" value={draft} disabled={disabled} aria-invalid={invalid || undefined} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => {
      if (event.key === "Enter") { event.preventDefault(); commit(); }
      if (event.key === "Escape") { event.preventDefault(); setDraft(String(value)); }
    }} />
    {invalid && <span className={styles.hint} role="status">Use a finite value {field === "width" || field === "height" ? `1–${COMPOSER_LIMITS.maxDimension}` : `between −${COMPOSER_LIMITS.maxCoordinate} and ${COMPOSER_LIMITS.maxCoordinate}`}.</span>}
  </label>;
}
export function FrameInspector({ composer, frame, disabled }: { composer: Composer; frame: ComposerFrame; disabled: boolean }) {
  const [name, setName] = useState(frame.name);
  const pageId = composer.page!.id;
  return <section aria-label="Frame settings">
    <h3>Frame settings · {frame.preset}</h3>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); composer.controller.execute({ type: "renameFrame", pageId, frameId: frame.id, name: name.trim() }); }}>
      <label>Frame name<input aria-label="Frame name" value={name} maxLength={120} disabled={disabled} onChange={event => setName(event.target.value)} /></label>
      <Button type="submit" disabled={disabled || !name.trim() || name.trim() === frame.name}>Rename frame</Button>
    </form>
    <div className={`${styles.form} ${styles.geometry}`}>
      {(["width", "height", "x", "y"] as const).map(field => <GeometryField key={`${field}-${frame[field]}`} field={field} value={frame[field]} disabled={disabled} onCommit={value => composer.controller.execute({ type: "updateFrameGeometry", pageId, frameId: frame.id, geometry: { [field]: value } })} />)}
    </div>
    <p className={styles.hint}>Enter or leave a valid field to save. Escape restores it. Size edits make this frame custom; other frames and its root remain unchanged.</p>
    <Button disabled={disabled || composer.state.mode !== "design" || composer.page!.frames.length >= COMPOSER_LIMITS.framesPerPage} onClick={() => composer.controller.duplicateFrame()}>Duplicate frame</Button>
    <details className={styles.hint}><summary>Frame reference</summary><code>{frame.id}</code></details>
  </section>;
}
