"use client";

import { Fragment, useId, useRef, useState } from "react";
import { Button } from "../controls";
import { nodeRegistry } from "../page-document/registry";
import { createComponentNode } from "../component-defaults";
import type { PageKind, PageNode } from "../page-document/model";
import { draftCommand, resetLocalStylesCommand, resolveSelection, type NodeSelection } from "./selection";
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
  defaultValue: "Initial value", defaultChecked: "Initially checked", name: "Field name", value: "Value", checked: "Checked", labelPosition: "Label position",
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
  if (!supported.length && !(["cardContent", "cardFooter"].includes(node.kind) && node.children?.length)) return null;
  const selectLayer = (child: PageNode) => <button type="button" key={child.id} disabled={disabled} aria-label={`Select ${nodeRegistry[child.kind].element} layer`} onClick={() => composer.controller.selectNode({ ...selection, nodeId: child.id })}>
    {nodeRegistry[child.kind].element.replace("Card.", "")}<span>Edit →</span>
  </button>;
  return <details className={styles.group} open><summary>Component layers</summary><div className={styles.slotList}>
    {supported.map(kind => {
      const child = node.children?.find(child => child.kind === kind);
      const name = nodeRegistry[kind].element.replace("Card.", "");
      return <Fragment key={kind}>{child ? selectLayer(child) : <button type="button" disabled={disabled} aria-label={`Add ${nodeRegistry[kind].element} layer`} onClick={() => {
        try {
          const added = createComponentNode(kind, () => `node_${crypto.randomUUID()}`, composer.controller.insertionDefaults());
          const children = node.children ?? [];
          const after = children.findIndex(entry => supported.indexOf(entry.kind) > supported.indexOf(kind));
          if (composer.controller.execute({ type: "nodeCommands", pageId: selection.pageId, frameId: selection.frameId, commands: [{ type: "insert", parentId: node.id, index: after === -1 ? children.length : after, node: added }] })) composer.controller.selectNode({ ...selection, nodeId: added.id });
        } catch (error) { composer.controller.report(error instanceof Error ? error.message : "Could not add this layer."); }
      }}>{name}<span>+ Add</span></button>}
        {child?.children?.length ? <div className={styles.slotChildren}>{child.children.map(selectLayer)}</div> : null}
      </Fragment>;
    })}
    {!supported.length && node.children?.map(selectLayer)}
  </div></details>;
}

function LegacyStyles({ node, composer, selection, disabled }: { node: PageNode; composer: Composer; selection: NodeSelection; disabled: boolean }) {
  const [error, setError] = useState("");
  const hasStyles = Object.keys(node.appearance ?? {}).length > 0 || Object.values(node.parts ?? {}).some(part => Object.keys(part).length > 0);
  if (!hasStyles) return null;
  return <section className={styles.legacyStyles} aria-label="Legacy local styles">
    <h4>Legacy local styles</h4>
    <p className={styles.note}>Saved local styles still override System styles on this layer. Reset keeps its parameters, content and child layers unchanged.</p>
    <Button disabled={disabled} onClick={() => {
      try {
        const command = resetLocalStylesCommand(composer.document!, selection);
        if (!composer.controller.execute({ type: "nodeCommands", pageId: selection.pageId, frameId: selection.frameId, commands: [command] })) throw new Error("Could not reset local styles. Check the project notice.");
        setError("");
      } catch (error) { setError(error instanceof Error ? error.message : "Could not reset local styles."); }
    }}>Reset local styles</Button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}

export function NodeInspector({ composer, disabled, onEditSystem }: { composer: Composer; disabled: boolean; onEditSystem: (id: string, kind?: string) => void }) {
  const selection = composer.project?.selection ?? null;
  const resolved = composer.document && resolveSelection(composer.document, selection);
  if (!resolved || !selection) return null;
  const { node, path } = resolved;
  const isLayout = nodeRegistry[node.kind].source !== "components";
  const keys = [...(nodeRegistry[node.kind].text ? ["text"] : []), ...Object.keys(nodeRegistry[node.kind].props)];
  const renderFields = (fields: string[]) => <div className={styles.contentGrid}>{fields.map(field => {
    const value = String(field === "text" ? node.text : node.props?.[field] ?? "");
    return <DraftField key={`${node.id}-${field}-${value}`} composer={composer} selection={selection} field={field} value={value} disabled={disabled} />;
  })}</div>;
  const groups = [
    { label: "Content", fields: keys.filter(key => contentKeys.includes(key)), open: true },
    { label: isLayout ? "Auto layout" : "Options", fields: keys.filter(key => propertyKeys.includes(key)), open: true },
  ];
  const advanced = keys.filter(key => !contentKeys.includes(key) && !propertyKeys.includes(key));
  return <div aria-label="Instance settings">
    <div className={styles.heading}><h3>{isLayout ? nodeRegistry[node.kind].element : "Parameters"}<small>{isLayout ? "Layout settings" : nodeRegistry[node.kind].element}</small></h3><ActionsMenu composer={composer} /></div>
    <nav className={styles.breadcrumb} aria-label="Selection path">{path.map((entry, index) => <Fragment key={entry.id}>{index > 0 && <span aria-hidden="true">/</span>}<button type="button" aria-current={entry.id === node.id ? "true" : undefined} title={nodeRegistry[entry.kind].element} onClick={() => composer.controller.selectNode({ ...selection, nodeId: entry.id })}>{nodeRegistry[entry.kind].element.replace("Card.", "")}</button></Fragment>)}</nav>
    {groups.filter(group => group.fields.length).map(group => <details key={`${node.id}-${group.label}`} className={styles.group} open={group.open}><summary>{group.label}</summary>{renderFields(group.fields)}</details>)}
    <CardSlots key={node.id} node={node} composer={composer} selection={selection} disabled={disabled} />
    {isLayout && <AppearanceInspector key={`${selection.frameId}-${node.id}`} composer={composer} selection={selection} node={node} disabled={disabled} />}
    {advanced.length > 0 && <details key={`${node.id}-advanced`} className={styles.group}><summary>States & behavior</summary>{renderFields(advanced)}{["input", "switch", "checkbox"].includes(node.kind) && <p className={styles.note}>Use initial values for interactive Preview. Value / checked are fixed snapshots.</p>}</details>}
    {path.length > 1 && <details className={styles.group}><summary>Arrange</summary><MovePanel key={`${selection.frameId}-${node.id}`} composer={composer} disabled={disabled} /><Button onClick={() => composer.controller.selectParent()}>Select parent</Button></details>}
    <div className={styles.footer}>
      {!isLayout && <LegacyStyles key={`${selection.frameId}-${node.id}`} node={node} composer={composer} selection={selection} disabled={disabled} />}
      <Button onClick={() => onEditSystem(composer.document!.systemId, node.kind.startsWith("card") ? "card" : node.kind)}>Edit styles in System</Button>
      <p className={styles.note}>Parameters belong to this instance. Component styles and insertion defaults are authored in System; changing defaults does not rewrite existing content.</p>
    </div>
  </div>;
}
