"use client";

import { Fragment, useId, useRef, useState } from "react";
import { Button } from "../controls";
import { nodeRegistry } from "../page-document/registry";
import { createPageNode } from "../page-document/defaults";
import type { PageKind, PageNode } from "../page-document/model";
import { draftCommand, resolveSelection, type NodeSelection } from "./selection";
import type { Composer } from "./use-composer";
import { MovePanel } from "./move-panel";
import { ActionsMenu } from "./context-actions";
import { AppearanceInspector } from "./appearance-inspector";
import styles from "./inspector.module.css";

const fieldLabels: Record<string, string> = {
  text: "Text", label: "Label", placeholder: "Placeholder", description: "Description", error: "Error message",
  errorPosition: "Error placement", errorIcon: "Error icon", variant: "Variant", size: "Size", tone: "Tone", radius: "Radius preset",
  direction: "Direction", gap: "Gap preset", align: "Align", justify: "Distribute", wrap: "Wrap", columns: "Columns", span: "Column span",
  maxWidth: "Width preset", as: "HTML element", type: "Type", hideLabel: "Hide label", readOnly: "Read only", fullWidth: "Fill width",
  defaultValue: "Initial value", defaultChecked: "Initially checked", name: "Field name", value: "Value", checked: "Checked",
};
const contentKeys = ["text", "label", "placeholder", "description", "error", "errorPosition", "errorIcon"];
const propertyKeys = ["variant", "size", "tone", "radius", "direction", "gap", "align", "justify", "wrap", "columns", "span", "maxWidth", "fullWidth"];

function DraftField({ composer, selection, field, value, disabled }: { composer: Composer; selection: NodeSelection; field: string; value: string; disabled: boolean }) {
  const id = useId();
  const [draft, setDraft] = useState(value), [error, setError] = useState("");
  const dirty = useRef(false);
  const resolved = resolveSelection(composer.document!, selection)!;
  const definition = nodeRegistry[resolved.node.kind], rule = definition.props[field];
  const required = field === "text" || definition.requiredProps?.includes(field);
  const overridden = Object.hasOwn(resolved.node.props ?? {}, field);
  const commit = (next: string, clear = false) => {
    if (!clear && next === value && !dirty.current) { setError(""); return; }
    try {
      const command = draftCommand(composer.document!, selection, field, clear ? null : next);
      if (!composer.controller.execute({ type: "nodeCommands", pageId: selection.pageId, frameId: selection.frameId, commands: [command] })) throw new Error("Could not save this edit");
      dirty.current = false; setError("");
    } catch (error) { setError(error instanceof Error ? error.message.replace(/^.*: /, "") : "Invalid value"); }
  };
  return <div className={`${styles.property} ${Array.isArray(rule) ? "" : styles.fullWidth}`} data-overridden={overridden || undefined}>
    <label htmlFor={id}>{fieldLabels[field] ?? field[0].toUpperCase() + field.slice(1)}</label>
    <div className={styles.inputRow}>
      {Array.isArray(rule) ? <select id={id} aria-label={`Instance ${field}`} value={draft} disabled={disabled} onChange={event => { setDraft(event.target.value); commit(event.target.value); }}>
        <option value="" disabled={!!required}>Default</option>
        {rule.map(option => <option key={String(option)} value={String(option)}>{option === true ? "On" : option === false ? "Off" : String(option)}</option>)}
      </select> : <input id={id} aria-label={`Instance ${field}`} value={draft} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} placeholder={required ? undefined : "None"} maxLength={field === "text" ? 2000 : 200}
        onChange={event => { dirty.current = true; setDraft(event.target.value); setError(""); }} onBlur={() => commit(draft)} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") { event.preventDefault(); commit(draft); }
          if (event.key === "Escape") { event.preventDefault(); dirty.current = false; setDraft(value); setError(""); }
        }} />}
      {!required && overridden && <button type="button" className={styles.reset} aria-label={`Clear instance ${field}`} title="Reset to component default" onPointerDown={event => event.preventDefault()} disabled={disabled} onClick={() => { setDraft(""); commit("", true); }}>↺</button>}
    </div>
    {error && <p id={`${id}-error`} role="alert" className={styles.error}>{error}</p>}
  </div>;
}

function CardSlots({ node, composer, selection, disabled }: { node: PageNode; composer: Composer; selection: NodeSelection; disabled: boolean }) {
  const supported: PageKind[] = node.kind === "card" ? ["cardHeader", "cardContent", "cardFooter"] : node.kind === "cardHeader" ? ["cardTitle", "cardDescription"] : [];
  if (!supported.length) return null;
  return <details className={styles.group} open><summary>Component layers</summary><div className={styles.slotList}>
    {supported.map(kind => {
      const child = node.children?.find(child => child.kind === kind);
      const name = nodeRegistry[kind].element.replace("Card.", "");
      return <button type="button" key={kind} disabled={disabled} onClick={() => {
        if (child) { composer.controller.selectNode({ ...selection, nodeId: child.id }); return; }
        const nextId = () => `node_${crypto.randomUUID()}`;
        const added = createPageNode(kind, nextId);
        if (kind === "cardHeader") added.children!.push(createPageNode("cardDescription", nextId));
        const children = node.children ?? [];
        const after = children.findIndex(entry => supported.indexOf(entry.kind) > supported.indexOf(kind));
        if (composer.controller.execute({ type: "nodeCommands", pageId: selection.pageId, frameId: selection.frameId, commands: [{ type: "insert", parentId: node.id, index: after === -1 ? children.length : after, node: added }] })) composer.controller.selectNode({ ...selection, nodeId: added.id });
      }}>{name}<span>{child ? "Edit →" : "+ Add"}</span></button>;
    })}
  </div></details>;
}

export function NodeInspector({ composer, disabled, onEditSystem }: { composer: Composer; disabled: boolean; onEditSystem: (id: string, kind?: string) => void }) {
  const selection = composer.project?.selection ?? null;
  const resolved = composer.document && resolveSelection(composer.document, selection);
  if (!resolved || !selection) return null;
  const { node, path } = resolved;
  const keys = [...(nodeRegistry[node.kind].text ? ["text"] : []), ...Object.keys(nodeRegistry[node.kind].props)];
  const renderFields = (fields: string[]) => <div className={styles.contentGrid}>{fields.map(field => {
    const value = String(field === "text" ? node.text : node.props?.[field] ?? "");
    return <DraftField key={`${node.id}-${field}-${value}`} composer={composer} selection={selection} field={field} value={value} disabled={disabled} />;
  })}</div>;
  const groups = [
    { label: "Content", fields: keys.filter(key => contentKeys.includes(key)), open: true },
    { label: ["stack", "grid", "gridItem", "container"].includes(node.kind) ? "Auto layout" : "Properties", fields: keys.filter(key => propertyKeys.includes(key)), open: true },
  ];
  const advanced = keys.filter(key => !contentKeys.includes(key) && !propertyKeys.includes(key));
  return <div aria-label="Instance settings">
    <div className={styles.heading}><h3>{nodeRegistry[node.kind].element}<small>Local instance</small></h3><ActionsMenu composer={composer} /></div>
    <nav className={styles.breadcrumb} aria-label="Selection path">{path.map((entry, index) => <Fragment key={entry.id}>{index > 0 && <span aria-hidden="true">/</span>}<button type="button" aria-current={entry.id === node.id ? "true" : undefined} title={nodeRegistry[entry.kind].element} onClick={() => composer.controller.selectNode({ ...selection, nodeId: entry.id })}>{nodeRegistry[entry.kind].element.replace("Card.", "")}</button></Fragment>)}</nav>
    {groups.filter(group => group.fields.length).map(group => <details key={`${node.id}-${group.label}`} className={styles.group} open={group.open}><summary>{group.label}</summary>{renderFields(group.fields)}</details>)}
    <CardSlots key={node.id} node={node} composer={composer} selection={selection} disabled={disabled} />
    <AppearanceInspector key={`${selection.frameId}-${node.id}`} composer={composer} selection={selection} node={node} disabled={disabled} />
    {advanced.length > 0 && <details key={`${node.id}-advanced`} className={styles.group}><summary>States & behavior</summary>{renderFields(advanced)}{["input", "switch", "checkbox"].includes(node.kind) && <p className={styles.note}>Use initial values for interactive Preview. Value / checked are fixed snapshots.</p>}</details>}
    {path.length > 1 && <details className={styles.group}><summary>Arrange</summary><MovePanel key={`${selection.frameId}-${node.id}`} composer={composer} disabled={disabled} /><Button onClick={() => composer.controller.selectParent()}>Select parent</Button></details>}
    <div className={styles.footer}><Button onClick={() => onEditSystem(composer.document!.systemId, node.kind.startsWith("card") ? "card" : node.kind)}>Edit shared system styles</Button><p className={styles.note}>Local edits stay with this instance. Save a reusable copy in Assets → Saved components.</p></div>
  </div>;
}
