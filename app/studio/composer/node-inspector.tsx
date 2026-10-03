"use client";

import { useRef, useState } from "react";
import { Button } from "../controls";
import { nodeRegistry } from "../page-document/registry";
import { draftCommand, flattenNodes, resolveSelection, type NodeSelection } from "./selection";
import type { Composer } from "./use-composer";
import { MovePanel } from "./move-panel";
import { ActionsMenu } from "./context-actions";

import styles from "./composer.module.css";

function DraftField({ composer, selection, field, value, disabled }: { composer: Composer; selection: NodeSelection; field: string; value: string; disabled: boolean }) {
  const [draft, setDraft] = useState(value), [error, setError] = useState("");
  const dirty = useRef(false);
  const resolved = resolveSelection(composer.document!, selection)!;
  const definition = nodeRegistry[resolved.node.kind], rule = definition.props[field];
  const required = field === "text" || definition.requiredProps?.includes(field);
  const commit = (next: string, clear = false) => {
    if (!clear && next === value && !dirty.current) { setError(""); return; }
    try {
      const command = draftCommand(composer.document!, selection, field, clear ? null : next);
      if (!composer.controller.execute({ type: "nodeCommands", pageId: selection.pageId, frameId: selection.frameId, commands: [command] })) throw new Error("Could not save this edit");
      dirty.current = false; setError("");
    } catch (error) { setError(error instanceof Error ? error.message.replace(/^.*: /, "") : "Invalid value"); }
  };
  const id = `instance-${field}`;
  return <div className={styles.draftField}>
    <label htmlFor={id}>{field}{required ? " *" : ""}</label>
    {Array.isArray(rule) ? <select id={id} aria-label={`Instance ${field}`} value={draft} disabled={disabled} onChange={event => { setDraft(event.target.value); commit(event.target.value); }}>
      <option value="" disabled={!!required}>Inherited · component default</option>
      {rule.map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
    </select> : <input id={id} aria-label={`Instance ${field}`} value={draft} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} maxLength={field === "text" ? 2000 : 200} onChange={event => { dirty.current = true; setDraft(event.target.value); setError(""); }} onBlur={() => commit(draft)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); commit(draft); } }} />}
    {!required && <Button aria-label={`Clear instance ${field}`} onPointerDown={event => event.preventDefault()} disabled={disabled || !Object.hasOwn(resolved.node.props ?? {}, field)} onClick={() => { setDraft(""); commit("", true); }}>Clear override</Button>}
    {error && <p id={`${id}-error`} role="alert" className={styles.hint}>{error}</p>}
  </div>;
}
export function NodeInspector({ composer, disabled, onEditSystem }: { composer: Composer; disabled: boolean; onEditSystem: (id: string, kind?: string) => void }) {
  const selection = composer.project?.selection ?? null;
  const resolved = composer.document && resolveSelection(composer.document, selection);
  const frame = composer.page?.frames.find(frame => frame.id === composer.project?.frameId);
  const choose = (nodeId: string) => composer.controller.selectNode({ projectId: composer.document!.id, pageId: composer.page!.id, frameId: frame!.id, nodeId });
  return <section aria-label="Instance settings">
    <h3>{resolved ? `${nodeRegistry[resolved.node.kind].element} instance` : "Instance settings"}</h3>
    {resolved && selection ? <>
      <nav aria-label="Selection path" className={styles.actions}>{resolved.path.map(node => <Button key={node.id} aria-current={node.id === selection.nodeId ? "true" : undefined} onClick={() => choose(node.id)}>{nodeRegistry[node.kind].element}</Button>)}</nav>
      <div className={styles.actions}><ActionsMenu composer={composer} /><Button onClick={() => composer.controller.selectParent()}>Select parent</Button><Button onClick={() => composer.controller.clearNode()}>Clear selection</Button></div>
      <p className={styles.hint}>Instance only. Omitted props inherit component defaults; omitted radius preserves legacy system overrides. Text commits on blur or Enter. Clear removes an optional override.</p>
      {resolved.path.length > 1 && <MovePanel key={`${selection.frameId}-${selection.nodeId}`} composer={composer} disabled={disabled || composer.state.mode !== "design"} />}
      <div className={`${styles.form} ${styles.instanceFields}`}>
        {[...(nodeRegistry[resolved.node.kind].text ? ["text"] : []), ...Object.keys(nodeRegistry[resolved.node.kind].props)].map(field => {
          const value = String(field === "text" ? resolved.node.text : resolved.node.props?.[field] ?? "");
          return <DraftField key={`${selection.frameId}-${selection.nodeId}-${field}-${value}`} composer={composer} selection={selection} field={field} value={value} disabled={disabled} />;
        })}
      </div>
      {["input", "switch", "checkbox"].includes(resolved.node.kind) && <p className={styles.hint}>Setting value/checked replaces its default counterpart. Controlled values are fixed snapshots; use defaultValue/defaultChecked for interactive Preview.</p>}
      <Button onClick={() => onEditSystem(composer.document!.systemId, resolved.node.kind.startsWith("card") ? "card" : resolved.node.kind)}>Edit shared system styles</Button>
      {!Object.keys(nodeRegistry[resolved.node.kind].props).length && <p className={styles.hint}>This compound slot inherits styles from its parent. Select parent for surface settings.</p>}
    </> : <p className={styles.hint}>Design: click content or use Layers. Empty frame clicks select the frame; empty canvas clicks clear frame and node. Escape clears only the node.</p>}
    {frame && <details className={styles.layers}><summary>Layers · {frame.name}</summary><div className={styles.list} role="group" aria-label="Frame layers">{flattenNodes(frame.root).map(({ node, depth }) => <Button key={node.id} aria-label={`Select ${nodeRegistry[node.kind].element}: ${node.text ?? node.props?.label ?? "layout"}`} aria-pressed={selection?.nodeId === node.id} style={{ paddingInlineStart: 8 + depth * 10 }} disabled={composer.state.mode === "preview"} onClick={() => choose(node.id)}>{nodeRegistry[node.kind].element}{node.text || node.props?.label ? ` · ${String(node.text ?? node.props?.label).slice(0, 32)}` : ""}</Button>)}</div></details>}
  </section>;
}
