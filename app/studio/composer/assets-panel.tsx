"use client";

import { useId, useRef, useState } from "react";
import { COMPOSER_LIMITS, type ComposerAsset } from "./model";
import type { Composer } from "./use-composer";
import styles from "./assets.module.css";

export function SavedAssetsPanel({ composer }: { composer: Composer }) {
  return <AssetsPanel key={composer.document?.id ?? "no-project"} composer={composer} />;
}

function AssetsPanel({ composer }: { composer: Composer }) {
  const [name, setName] = useState("");
  const id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const { controller, document, project, state } = composer;
  const assets = document?.assets ?? [];
  const blocked = !document || !state.ready || state.indexBlocked || !!state.partial || state.mode !== "design";
  const reason = controller.saveSelectionAsAssetReason();
  return <section className={styles.panel} aria-labelledby={`${id}-heading`}>
    <div className={styles.heading}>
      <h2 id={`${id}-heading`} ref={heading} tabIndex={-1}>Saved components</h2>
      <span className={styles.hint}>{assets.length}/{COMPOSER_LIMITS.assets}</span>
    </div>
    <p className={styles.hint}>Project snapshots. Copies stay independently editable.</p>
    <form className={styles.form} onSubmit={event => {
      event.preventDefault();
      if (controller.saveSelectionAsAsset(name.trim())) setName("");
    }}>
      <label htmlFor={`${id}-name`}>Component name</label>
      <div className={styles.saveRow}>
        <input id={`${id}-name`} value={name} maxLength={COMPOSER_LIMITS.nameLength} disabled={blocked} aria-describedby={`${id}-help`} onChange={event => setName(event.target.value)} />
        <button type="submit" disabled={blocked || !!reason || !name.trim()}>Save selection</button>
      </div>
      <p id={`${id}-help`} className={styles.hint}>{reason ?? "Save this selection, then select a container or frame to insert a copy."}</p>
    </form>
    {assets.length ? <ul className={styles.list}>{assets.map(asset => <AssetRow key={asset.id} asset={asset} disabled={blocked}
      onInsert={() => controller.insertAsset(asset.id)}
      onDelete={() => {
        if (controller.execute({ type: "deleteAsset", assetId: asset.id })) heading.current?.focus();
      }} />)}</ul> : <p className={styles.hint}>No saved components yet.</p>}
    <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{project?.error || state.message}</p>
  </section>;
}

function AssetRow({ asset, disabled, onInsert, onDelete }: { asset: ComposerAsset; disabled: boolean; onInsert: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return <li className={styles.item}>
    <span className={styles.name}>{asset.name}</span>
    <div className={styles.actions}>
      <button type="button" disabled={disabled} aria-label={`Insert ${asset.name}`} onClick={onInsert}>Insert</button>
      <button type="button" disabled={disabled} aria-label={`${confirm ? "Confirm deletion of" : "Delete"} saved component ${asset.name}`} onClick={() => confirm ? onDelete() : setConfirm(true)}>{confirm ? "Confirm delete" : "Delete"}</button>
      {confirm && <button type="button" onClick={() => setConfirm(false)}>Cancel</button>}
    </div>
    {confirm && <p className={styles.hint}>Delete this snapshot? Existing copies stay. You can undo this.</p>}
  </li>;
}
