import { useState, type ReactNode } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "./controls";
import { componentDefaultFields, parseComponentDefaults, resolveComponentDefaults, type ComponentDefaultField, type ComponentDefaults } from "./component-defaults";
import { componentStyleFields, componentStyleParts, parseComponentStyles, type ComponentStylePart, type ComponentStyles } from "./component-styles";
import { type AppearanceField, type NodeAppearance } from "./components/appearance";
import type { ComponentId, ThemeTokens } from "./tokens";
import type { PaletteMode } from "./color-engine";
import fields from "./composer/inspector.module.css";
import styles from "./system-component-editor.module.css";

export type ComponentEditorTab = "parameters" | "styles";
const groupNames = { dimensions: "Size", padding: "Padding", margin: "Margin", radius: "Corners", typography: "Typography", layout: "Layout", surface: "Fill & stroke" };
const shortLabels: Partial<Record<keyof NodeAppearance, string>> = {
  paddingTop: "Top", paddingRight: "Right", paddingBottom: "Bottom", paddingLeft: "Left",
  marginTop: "Top", marginRight: "Right", marginBottom: "Bottom", marginLeft: "Left",
  borderTopLeftRadius: "Top left", borderTopRightRadius: "Top right", borderBottomRightRadius: "Bottom right", borderBottomLeftRadius: "Bottom left",
};

function DraftControl({ id, label, accessibleLabel, value, options, placeholder, multiline, maxLength, overridden, onCommit, onReset }: {
  id: string; label: string; accessibleLabel: string; value: string; options?: readonly string[];
  placeholder?: string; multiline?: boolean; maxLength?: number; overridden: boolean;
  onCommit: (value: string) => void; onReset: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const commit = (next: string) => {
    try { onCommit(next); setDraft(null); setError(""); } catch (error) { setError(error instanceof Error ? error.message : "Invalid value"); }
  };
  const inputProps = {
    id, "aria-label": accessibleLabel, "aria-invalid": !!error, "aria-describedby": error ? `${id}-error` : undefined,
    value: draft ?? value, placeholder, maxLength,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDraft(event.target.value); setError(""); },
    onBlur: () => { if (draft !== null && draft !== value) commit(draft); },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commit(draft ?? value); }
      if (event.key === "Escape") { event.preventDefault(); setDraft(null); setError(""); }
    },
  };
  return <div className={`${fields.property} ${multiline ? fields.fullWidth : ""}`} data-overridden={overridden || undefined}>
    <label htmlFor={id}>{label}</label>
    <div className={fields.inputRow}>
      {options ? <select id={id} aria-label={accessibleLabel} value={draft ?? value} onChange={event => commit(event.target.value)}>
        <option value="">Default</option>{options.map(option => <option key={option} value={option}>{option === "true" ? "On" : option === "false" ? "Off" : option}</option>)}
      </select> : multiline ? <textarea {...inputProps} rows={2} className={styles.textarea} /> : <input {...inputProps} spellCheck={false} />}
      {overridden && <button type="button" className={fields.reset} title="Reset to default" aria-label={`Reset ${accessibleLabel}`} onPointerDown={event => event.preventDefault()} onClick={() => { onReset(); setDraft(null); setError(""); }}>↺</button>}
    </div>
    {error && <p id={`${id}-error`} role="alert" className={fields.error}>{error}</p>}
  </div>;
}

function DefaultParameters({ component, defaults, onChange }: { component: ComponentId; defaults?: ComponentDefaults; onChange: (next: ComponentDefaults) => void }) {
  const resolved = resolveComponentDefaults(component, defaults);
  const metadata = componentDefaultFields(component);
  const content = metadata.filter(field => field.source !== "props" || ["label", "placeholder", "description", "error"].includes(field.key));
  const options = metadata.filter(field => field.source === "props" && ["variant", "size", "tone", "radius", "fullWidth"].includes(field.key));
  const behavior = metadata.filter(field => !content.includes(field) && !options.includes(field));
  function edit(field: ComponentDefaultField, draft: string | null) {
    const next = structuredClone(defaults ?? {});
    const entry = next[component] ??= {};
    if (field.source === "text") {
      if (draft === null) delete entry.text;
      else entry.text = draft;
    } else {
      const values = { ...entry[field.source] } as Record<string, string | boolean | number>;
      if (draft === null || draft === "" && field.type === "select") delete values[field.key];
      else values[field.key] = field.options ? field.options.find(value => String(value) === draft)! : draft;
      if (field.source === "props") {
        for (const [a, b] of [["checked", "defaultChecked"], ["value", "defaultValue"]]) {
          if (field.key === a && Object.hasOwn(values, a)) delete values[b];
          if (field.key === b && Object.hasOwn(values, b)) delete values[a];
        }
        entry.props = values;
      } else entry.slots = values as NonNullable<typeof entry.slots>;
    }
    onChange(parseComponentDefaults(next));
  }
  function render(items: ComponentDefaultField[]) {
    return <div className={fields.contentGrid}>{items.map(field => {
      const raw = defaults?.[component];
      const value = field.source === "text" ? resolved.text : (resolved[field.source] as Record<string, unknown> | undefined)?.[field.key];
      const authored = field.source === "text" ? raw?.text !== undefined : Object.hasOwn(raw?.[field.source] ?? {}, field.key);
      return <DraftControl key={`${component}-${field.source}-${field.key}`} id={`system-default-${component}-${field.key}`} label={field.label} accessibleLabel={`Default ${field.label}`}
        value={value === undefined ? "" : String(value)} options={field.options?.map(String)} multiline={field.type === "text"} maxLength={field.maxLength} placeholder="None"
        overridden={authored} onCommit={draft => edit(field, draft)} onReset={() => edit(field, null)} />;
    })}</div>;
  }
  return <>
    <p className={fields.note}>Set the starting content and options for new instances. Existing project content stays unchanged. Clear optional messages to hide them; ↺ restores the starter.</p>
    {content.length > 0 && <section className={styles.section}><h3>Content</h3>{render(content)}</section>}
    {options.length > 0 && <section className={styles.section}><h3>Options</h3>{render(options)}</section>}
    {behavior.length > 0 && <details className={fields.group}><summary>States & behavior</summary>{render(behavior)}</details>}
    <Button disabled={!defaults?.[component]} onClick={() => { const next = { ...defaults }; delete next[component]; onChange(next); }}>Reset starting parameters</Button>
  </>;
}

function StyleGroup({ component, part, group, metadata, values, allStyles, onChange }: {
  component: ComponentId; part: ComponentStylePart; group: AppearanceField["group"]; metadata: readonly AppearanceField[];
  values: NodeAppearance; allStyles?: ComponentStyles; onChange: (next: ComponentStyles) => void;
}) {
  const [linked, setLinked] = useState(false);
  const linkable = ["padding", "margin", "radius"].includes(group);
  const textPart = ["title", "label", "description", "error"].includes(part) || component === "text";
  const count = metadata.filter(field => values[field.key] !== undefined).length;
  function edit(field: AppearanceField, draft: string) {
    const next = structuredClone(allStyles ?? {});
    const value = draft.trim();
    const parsed = value === "" ? undefined : field.type === "number" || field.type === "dimension" && !field.options?.includes(value) ? Number(value) : value;
    const target = (next[component] ??= {})[part] ??= {};
    for (const key of linked ? metadata.map(field => field.key) : [field.key]) {
      if (parsed === undefined) delete target[key];
      else Object.assign(target, { [key]: parsed });
    }
    onChange(parseComponentStyles(next));
  }
  return <details className={fields.group} open={textPart ? group === "typography" : ["padding", "radius"].includes(group)}>
    <summary>{groupNames[group]}{count > 0 && <span className={fields.overrideCount}>{count}</span>}</summary>
    {linkable && <button type="button" className={fields.linkToggle} aria-label={`Link ${group === "radius" ? "corners" : group + " sides"}`} aria-pressed={linked} onClick={() => setLinked(!linked)}>{linked ? "Linked" : "Independent"}</button>}
    <div className={fields.propertyGrid}>{metadata.map(field => <DraftControl key={field.key} id={`system-style-${component}-${part}-${field.key}`}
      label={shortLabels[field.key] ?? field.label} accessibleLabel={`${part} ${field.label}`} value={values[field.key] === undefined ? "" : String(values[field.key])}
      options={field.type === "select" ? field.options : undefined} placeholder={field.type === "dimension" ? "Auto / px / fill / hug" : field.type === "color" ? "#rrggbb / inherited" : "Inherited"}
      overridden={values[field.key] !== undefined} onCommit={draft => edit(field, draft)} onReset={() => edit(field, "")} />)}</div>
  </details>;
}

export function SystemComponentEditor({ component, theme, mode, defaults, tab, part, onTabChange, onPartChange, onDefaultsChange, onStylesChange, children }: {
  component: ComponentId | null; theme: ThemeTokens; mode: PaletteMode; defaults?: ComponentDefaults;
  tab: ComponentEditorTab; part: ComponentStylePart; onTabChange: (tab: ComponentEditorTab) => void; onPartChange: (part: ComponentStylePart) => void;
  onDefaultsChange: (next: ComponentDefaults) => void; onStylesChange: (next: ComponentStyles) => void; children: ReactNode;
}) {
  if (!component) return children;
  const parts = componentStyleParts(component);
  const activePart = parts.some(entry => entry.key === part) ? part : "root";
  const metadata = componentStyleFields(component, activePart);
  const values = theme.componentStyles?.[component]?.[activePart] ?? {};
  const groups = [...new Set(metadata.map(field => field.group))];
  if (["title", "label", "description", "error"].includes(activePart) || component === "text") groups.sort((a, b) => a === "typography" ? -1 : b === "typography" ? 1 : 0);
  return <Tabs.Root value={tab} onValueChange={value => onTabChange(value as ComponentEditorTab)} className={styles.editor}>
    <Tabs.List aria-label="Component editor" className={styles.tabs}>
      <Tabs.Tab value="parameters" className={styles.tab}>Parameters</Tabs.Tab><Tabs.Tab value="styles" className={styles.tab}>Styles</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="parameters" className={styles.panel}><DefaultParameters component={component} defaults={defaults} onChange={onDefaultsChange} /></Tabs.Panel>
    <Tabs.Panel value="styles" className={styles.panel}>
      <p className={fields.note}>Shared across linked projects. Select a layer to design it.</p>
      <label className={fields.partPicker}>Component layer<select aria-label="System component part" value={activePart} onChange={event => onPartChange(event.target.value as ComponentStylePart)}>
        {parts.map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
      </select></label>
      <div className={fields.inheritance}><span>Geometry · both themes<br />Colors · {mode}</span><button type="button" disabled={!Object.keys(values).length} onClick={() => {
        const next = structuredClone(theme.componentStyles ?? {}); delete next[component]?.[activePart]; onStylesChange(parseComponentStyles(next));
      }}>Reset layer styles</button></div>
      {component === "card" && ["content", "footer"].includes(activePart) && <p className={fields.note}>This styles the slot. Nested Text and Button keep their own styles; click them on the canvas to edit their component.</p>}
      {activePart === "error" && <p className={fields.note}>The canvas shows a sample error while this layer is selected. Set default placement and icon in Parameters → States & behavior.</p>}
      {groups.map(group => <StyleGroup key={`${component}-${activePart}-${group}`} component={component} part={activePart} group={group} metadata={metadata.filter(field => field.group === group)} values={values} allStyles={theme.componentStyles} onChange={onStylesChange} />)}
      <details className={`${fields.group} ${styles.baseTokens}`} data-system-base-tokens><summary>Variant colors & base tokens</summary><p className={fields.note}>Variant and state colors stay independent. Base tokens supply the values inherited by unmodified layers.</p>{children}</details>
    </Tabs.Panel>
  </Tabs.Root>;
}
