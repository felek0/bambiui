import { useMemo, useRef, useState, type ReactNode } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "./controls";
import { componentDefaultFields, parseComponentDefaults, resolveComponentDefaults, type ComponentDefaultField, type ComponentDefaults } from "./component-defaults";
import { componentStyleFields, componentStyleParts, parseComponentStyles, type ComponentStylePart, type ComponentStyles } from "./component-styles";
import { componentRecipeFields, componentRecipeOptions, componentRecipeParts, parseComponentRecipes, type ComponentRecipeSelection, type ComponentRecipes } from "./component-recipes";
import { parseAppearance, type AppearanceField, type AppearancePatch, type NodeAppearance } from "./components/appearance";
import type { ComponentId, ThemeTokens } from "./tokens";
import type { RenderedAppearance } from "./rendered-appearance";
import { useCanvasAppearance } from "./use-canvas-appearance";
import type { PaletteMode } from "./color-engine";
import fields from "./composer/inspector.module.css";
import styles from "./system-component-editor.module.css";

export type ComponentEditorTab = "parameters" | "styles";
export type SystemComponentEditorProps = {
  component: ComponentId | null;
  theme: ThemeTokens;
  mode: PaletteMode;
  defaults?: ComponentDefaults;
  tab: ComponentEditorTab;
  selection: ComponentRecipeSelection | null;
  sharedPart?: ComponentStylePart;
  onSharedPartChange?: (part: ComponentStylePart) => void;
  onTabChange: (tab: ComponentEditorTab) => void;
  onSelectionChange: (selection: ComponentRecipeSelection) => void;
  onDefaultsChange: (next: ComponentDefaults) => void;
  onStylesChange: (next: ComponentStyles) => void;
  onRecipesChange: (next: ComponentRecipes) => void;
  children: ReactNode;
};

const groupNames = { dimensions: "Size", padding: "Padding", margin: "Margin", radius: "Corners", typography: "Typography", layout: "Layout", surface: "Fill & stroke" };
const shortLabels: Partial<Record<keyof NodeAppearance, string>> = {
  paddingTop: "Top", paddingRight: "Right", paddingBottom: "Bottom", paddingLeft: "Left",
  marginTop: "Top", marginRight: "Right", marginBottom: "Bottom", marginLeft: "Left",
  borderTopLeftRadius: "Top left", borderTopRightRadius: "Top right", borderBottomRightRadius: "Bottom right", borderBottomLeftRadius: "Bottom left",
};
const sizeLabels: Record<string, string> = { sm: "Small", md: "Medium", lg: "Large" };
const title = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/(^|[- ])\w/g, letter => letter.toUpperCase());
const message = (error: unknown) => error instanceof Error ? error.message : "Invalid value";
type RecipeOption = ReturnType<typeof componentRecipeOptions>[number];

function DraftControl({ id, label, accessibleLabel, value, resolvedValue, numeric, options, placeholder, multiline, maxLength, overridden, onCommit, onReset }: {
  id: string; label: string; accessibleLabel: string; value: string; options?: readonly string[];
  resolvedValue?: string; numeric?: boolean; placeholder?: string; multiline?: boolean; maxLength?: number; overridden: boolean;
  onCommit: (value: string) => void; onReset: () => void;
}) {
  const current = overridden ? value : resolvedValue ?? value;
  const [draft, setDraft] = useState<string | null>(null);
  // Keep the pre-edit value through live measurements, and consume Enter before blur.
  const pending = useRef<{ value: string; baseline: string } | null>(null);
  const [error, setError] = useState("");
  const discard = () => { pending.current = null; setDraft(null); setError(""); };
  const same = (left: string, right: string) => left === right || !!numeric
    && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(left.trim()) && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(right.trim()) && Number(left) === Number(right);
  const commit = (next: string, baseline = current) => {
    pending.current = null;
    try {
      const emptyDefault = resolvedValue !== undefined && !overridden && !next.trim();
      if (!emptyDefault && !same(next, value) && !same(next, current) && !same(next, baseline)) onCommit(next);
      discard();
    }
    catch (error) { setDraft(next); setError(message(error)); }
  };
  const accessibility = { id, "aria-label": accessibleLabel, "aria-invalid": !!error, "aria-describedby": error ? `${id}-error` : undefined };
  const inputProps = {
    ...accessibility, value: draft ?? current, placeholder, maxLength,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { pending.current = { value: event.target.value, baseline: pending.current?.baseline ?? current }; setDraft(event.target.value); setError(""); },
    onBlur: () => { if (pending.current !== null) commit(pending.current.value, pending.current.baseline); },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); if (pending.current !== null) commit(pending.current.value, pending.current.baseline); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); discard(); }
    },
  };
  return <div className={`${fields.property} ${multiline ? fields.fullWidth : ""}`} data-overridden={overridden || undefined}>
    <label htmlFor={id}>{label}</label>
    <div className={fields.inputRow}>
      {options ? <select {...accessibility} value={draft ?? value} title={current || undefined} onChange={event => commit(event.target.value)}>
        <option value="">{resolvedValue || placeholder || "Default"}</option>{options.map(option => <option key={option} value={option}>{option === "true" ? "On" : option === "false" ? "Off" : option}</option>)}
      </select> : multiline ? <textarea {...inputProps} rows={2} className={styles.textarea} /> : <input {...inputProps} spellCheck={false} />}
      {overridden && <button type="button" className={fields.reset} title="Reset to the system default" aria-label={`Reset ${accessibleLabel}`} onPointerDown={event => event.preventDefault()} onClick={() => {
        try { onReset(); discard(); } catch (error) { setError(message(error)); }
      }}>↺</button>}
    </div>
    {error && <p id={`${id}-error`} role="alert" className={fields.error}>{error}</p>}
  </div>;
}

function DefaultParameters({ component, defaults, onChange }: { component: ComponentId; defaults?: ComponentDefaults; onChange: (next: ComponentDefaults) => void }) {
  const [error, setError] = useState("");
  const [draftRevision, setDraftRevision] = useState(0);
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
      return <DraftControl key={`${component}-${field.source}-${field.key}-${draftRevision}`} id={`system-default-${component}-${field.key}`} label={field.label} accessibleLabel={`Default ${field.label}`}
        value={value === undefined ? "" : String(value)} options={field.options?.map(String)} multiline={field.type === "text"} maxLength={field.maxLength} placeholder={field.options ? "Default" : "None"}
        overridden={authored} onCommit={draft => edit(field, draft)} onReset={() => edit(field, null)} />;
    })}</div>;
  }
  return <>
    <p className={fields.note}>Defaults for new instances only. Existing saved work stays unchanged.</p>
    {content.length > 0 && <section className={styles.section}><h3>Content</h3>{render(content)}</section>}
    {options.length > 0 && <section className={styles.section}><h3>Options</h3>{render(options)}</section>}
    {behavior.length > 0 && <details className={fields.group}><summary>States & behavior</summary>{render(behavior)}</details>}
    <Button disabled={!defaults?.[component]} onPointerDown={event => event.preventDefault()} onClick={() => {
      try { const next = { ...defaults }; delete next[component]; onChange(parseComponentDefaults(next)); setDraftRevision(revision => revision + 1); setError(""); }
      catch (error) { setError(message(error)); }
    }}>Reset insertion defaults</Button>
    {error && <p className={fields.error} role="alert">{error}</p>}
  </>;
}

function styleDraft(field: AppearanceField, draft: string): AppearancePatch {
  const text = draft.trim();
  if (!text) return { [field.key]: null };
  let value: string | number = text;
  if (field.type === "number" || field.type === "dimension" && !field.options?.includes(text)) {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error("Enter a number, without units.");
    value = Number(text);
  }
  try { return parseAppearance({ [field.key]: value }, [field]); }
  catch {
    throw new Error(field.type === "color" ? `Use a six-digit hex color${field.options?.includes("transparent") ? " or transparent" : ""}.`
      : field.type === "select" ? "Choose a listed value." : `Use ${field.min}–${field.max}${field.key === "fontWeight" ? " (whole numbers)" : ""}.`);
  }
}

function patchAppearance(values: NodeAppearance, patch: AppearancePatch) {
  for (const key of Object.keys(patch) as (keyof NodeAppearance)[]) {
    if (patch[key] === null) delete values[key];
    else Object.assign(values, { [key]: patch[key] });
  }
}

function updateRecipeFields(recipes: ComponentRecipes | undefined, selection: ComponentRecipeSelection, patch: AppearancePatch): ComponentRecipes {
  if (!componentRecipeOptions(selection.component).some(option => option.key === selection.recipe)) throw new Error(`unknown recipe: ${selection.recipe}`);
  const metadata = componentRecipeFields(selection.component, selection.part, selection.target, selection.recipe);
  for (const key of Object.keys(patch)) if (!metadata.some(field => field.key === key)) throw new Error(`This ${selection.target} does not consume ${key}.`);
  const current = recipes?.[selection.component]?.[selection.recipe]?.[selection.part] ?? {};
  if (Object.entries(patch).every(([key, value]) => current[key as keyof NodeAppearance] === (value === null ? undefined : value))) return recipes ?? {};
  const next = structuredClone(recipes ?? {});
  const target = ((next[selection.component] ??= {})[selection.recipe] ??= {})[selection.part] ??= {};
  patchAppearance(target, patch);
  return parseComponentRecipes(next);
}

function StyleGroup({ scope, label, group, metadata, values, resolved = {}, text, onChange }: {
  scope: string; label: string; group: AppearanceField["group"]; metadata: readonly AppearanceField[];
  values: NodeAppearance; resolved?: RenderedAppearance; text?: boolean; onChange: (patch: AppearancePatch) => void;
}) {
  const [linked, setLinked] = useState(false);
  const linkable = ["padding", "margin", "radius"].includes(group);
  const count = metadata.filter(field => values[field.key] !== undefined).length;
  function edit(field: AppearanceField, draft: string) {
    const patch = styleDraft(field, draft);
    onChange(linked && linkable ? Object.fromEntries(metadata.map(entry => [entry.key, patch[field.key]])) as AppearancePatch : patch);
  }
  return <details className={fields.group} open={text ? ["typography", "surface"].includes(group) : group === "padding"}>
    <summary>{text && group === "surface" ? "Text color" : groupNames[group]}{count > 0 && <span className={fields.overrideCount}>{count}</span>}</summary>
    {linkable && <button type="button" className={fields.linkToggle} aria-label={`Link ${group === "radius" ? "corners" : group + " sides"}`} aria-pressed={linked} onClick={() => setLinked(!linked)}>{linked ? "Linked" : "Independent"}</button>}
    <div className={fields.propertyGrid}>{metadata.map(field => <DraftControl key={field.key} id={`${scope}-${field.key}`}
      label={shortLabels[field.key] ?? field.label} accessibleLabel={`${label} ${field.label}`} value={values[field.key] === undefined ? "" : String(values[field.key])}
      resolvedValue={resolved[field.key] ?? ""} numeric={field.type === "number" || field.type === "dimension"}
      options={field.type === "select" ? field.options : undefined} placeholder="Not rendered"
      overridden={values[field.key] !== undefined} onCommit={draft => edit(field, draft)} onReset={() => edit(field, "")} />)}</div>
  </details>;
}

function RecipeLayers({ selection, label, onSelect }: { selection: ComponentRecipeSelection; label: string; onSelect: (next: ComponentRecipeSelection) => void }) {
  return <details className={`${fields.group} ${styles.layers}`} open>
    <summary>Layers</summary>
    <ul className={styles.layerList} aria-label={`${label} layers`} onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
      const current = buttons.indexOf(event.target as HTMLButtonElement);
      if (current < 0) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
      {componentRecipeParts(selection.component, selection.recipe).map(part => {
        const alternate = part.target === "text" ? "frame" : "text";
        return <li key={part.key} data-child={part.key !== "root" || undefined}>
          <button type="button" aria-pressed={part.key === selection.part && part.target === selection.target} aria-label={`Select ${part.label} ${part.target}`} onClick={() => onSelect({ ...selection, part: part.key, target: part.target })}>
            <span>{part.label}</span><span className={styles.layerKind}>{title(part.target)}</span>
          </button>
          {componentRecipeFields(selection.component, part.key, alternate, selection.recipe).length > 0 && <button type="button" className={styles.alternateTarget} aria-pressed={part.key === selection.part && alternate === selection.target} aria-label={`Select ${part.label} ${alternate}`} onClick={() => onSelect({ ...selection, part: part.key, target: alternate })}>{title(alternate)}</button>}
        </li>;
      })}
    </ul>
  </details>;
}

function RecipeStyles({ selection, recipe, theme, mode, onSelectionChange, onChange }: {
  selection: ComponentRecipeSelection; recipe: RecipeOption; theme: ThemeTokens; mode: PaletteMode;
  onSelectionChange: (next: ComponentRecipeSelection) => void; onChange: (next: ComponentRecipes) => void;
}) {
  const [error, setError] = useState("");
  const [draftRevision, setDraftRevision] = useState(0);
  const metadata = useMemo(() => componentRecipeFields(selection.component, selection.part, selection.target, selection.recipe), [selection.component, selection.part, selection.target, selection.recipe]);
  const values = theme.componentRecipes?.[selection.component]?.[selection.recipe]?.[selection.part] ?? {};
  const part = componentRecipeParts(selection.component).find(entry => entry.key === selection.part)!;
  const combination = [title(selection.component), title(recipe.variant), ...(recipe.tone ? [title(recipe.tone)] : []), sizeLabels[recipe.size] ?? title(recipe.size)].join(" / ");
  const breadcrumb = `${combination} / ${part.label}`;
  const scope = `system-recipe-${selection.component}-${selection.recipe}-${selection.part}-${selection.target}`;
  const resolved = useCanvasAppearance(selection, metadata);
  const groups = [...new Set(metadata.map(field => field.group))];
  function change(patch: AppearancePatch) {
    const next = updateRecipeFields(theme.componentRecipes, selection, patch);
    if (next !== theme.componentRecipes) onChange(next);
    setError("");
  }
  return <section data-system-recipe-controls data-recipe={selection.recipe} data-part={selection.part} data-target={selection.target} aria-label={breadcrumb}>
    <header className={styles.selectionHeading}><h3>{breadcrumb}</h3><span className={styles.target}>{title(selection.target)}</span></header>
    <p className={fields.note}>Only this combination and layer, across linked projects. Other variants, sizes and layers stay unchanged.</p>
    <RecipeLayers selection={selection} label={combination} onSelect={onSelectionChange} />
    <div className={fields.inheritance}><span>{selection.target === "text" ? "Typography" : "Geometry & effects"} · both themes<br />Colors · {title(mode)}</span>
      <button type="button" disabled={!metadata.some(field => values[field.key] !== undefined)} onPointerDown={event => event.preventDefault()} onClick={() => {
        try { change(Object.fromEntries(metadata.map(field => [field.key, null])) as AppearancePatch); setDraftRevision(revision => revision + 1); }
        catch (error) { setError(message(error)); }
      }}>Reset {selection.target} styles</button>
    </div>
    {error && <p className={fields.error} role="alert">{error}</p>}
    {groups.map(group => <StyleGroup key={`${group}-${draftRevision}`} scope={scope} label={breadcrumb} group={group} metadata={metadata.filter(field => field.group === group)} values={values} resolved={resolved} text={selection.target === "text"} onChange={change} />)}
  </section>;
}

function SharedDefaults({ component, theme, initialPart = "root", onPartChange, onChange }: { component: ComponentId; theme: ThemeTokens; initialPart?: ComponentStylePart; onPartChange?: (part: ComponentStylePart) => void; onChange: (next: ComponentStyles) => void }) {
  const [part, setPart] = useState<ComponentStylePart>(initialPart);
  const [error, setError] = useState("");
  const [draftRevision, setDraftRevision] = useState(0);
  const metadata = useMemo(() => componentStyleFields(component, part), [component, part]);
  const values = theme.componentStyles?.[component]?.[part] ?? {};
  const resolved = useCanvasAppearance({ component, part }, metadata);
  function change(patch: AppearancePatch) {
    if (Object.entries(patch).every(([key, value]) => values[key as keyof NodeAppearance] === (value === null ? undefined : value))) return;
    const next = structuredClone(theme.componentStyles ?? {});
    patchAppearance((next[component] ??= {})[part] ??= {}, patch);
    onChange(parseComponentStyles(next)); setError("");
  }
  return <details className={fields.group} data-system-shared-defaults>
    <summary>Shared defaults · all variants & sizes</summary>
    <p className={fields.note}>Base layer styles for every {title(component)}. Combination overrides take precedence. Mixed means the canvas examples use different values.</p>
    <label className={fields.partPicker}>Shared default layer<select aria-label="Shared default layer" value={part} onChange={event => { const next = event.target.value as ComponentStylePart; setPart(next); onPartChange?.(next); setError(""); }}>
      {componentStyleParts(component).map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
    </select></label>
    <div className={fields.inheritance}><span>All variants & sizes</span><button type="button" disabled={!Object.keys(values).length} onPointerDown={event => event.preventDefault()} onClick={() => {
      try { change(Object.fromEntries(metadata.map(field => [field.key, null])) as AppearancePatch); setDraftRevision(revision => revision + 1); }
      catch (error) { setError(message(error)); }
    }}>Reset shared layer</button></div>
    {error && <p className={fields.error} role="alert">{error}</p>}
    {[...new Set(metadata.map(field => field.group))].map(group => <StyleGroup key={`${part}-${group}-${draftRevision}`} scope={`system-shared-${component}-${part}`} label={`Shared ${title(component)} ${part}`} group={group} metadata={metadata.filter(field => field.group === group)} values={values} resolved={resolved} onChange={change} />)}
  </details>;
}

export function SystemComponentEditor({ component, theme, mode, defaults, tab, selection, sharedPart, onSharedPartChange, onTabChange, onSelectionChange, onDefaultsChange, onStylesChange, onRecipesChange, children }: SystemComponentEditorProps) {
  if (!component) return children;
  const recipe = selection?.component === component ? componentRecipeOptions(component).find(entry => entry.key === selection.recipe) : undefined;
  const validSelection = selection && recipe && componentRecipeFields(component, selection.part, selection.target, selection.recipe).length > 0 ? selection : null;
  return <Tabs.Root value={tab} onValueChange={value => { if (value === "styles" || value === "parameters") onTabChange(value); }} className={styles.editor}>
    <Tabs.List aria-label="Component editor" className={styles.tabs}>
      <Tabs.Tab value="styles" className={styles.tab}>Styles</Tabs.Tab><Tabs.Tab value="parameters" className={styles.tab}>Parameters</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="styles" className={styles.panel}>
      {validSelection && recipe ? <RecipeStyles key={`${component}-${validSelection.recipe}-${validSelection.part}-${validSelection.target}-${mode}`} selection={validSelection} recipe={recipe} theme={theme} mode={mode}
        onSelectionChange={next => { onSelectionChange(next); onTabChange("styles"); }} onChange={onRecipesChange} />
        : <div className={styles.emptySelection}><h3>Select a frame or text</h3><p className={fields.note}>Choose a layer in a canvas example to style that exact variant and size.</p></div>}
      <SharedDefaults key={`${component}-${mode}-${sharedPart ?? "root"}`} component={component} theme={theme} initialPart={sharedPart} onPartChange={onSharedPartChange} onChange={onStylesChange} />
      <details className={`${fields.group} ${styles.baseTokens}`} data-system-base-tokens><summary>Base & variant tokens · all sizes</summary><p className={fields.note}>Shared across sizes, not limited to the selection above.</p>{children}</details>
    </Tabs.Panel>
    <Tabs.Panel value="parameters" className={styles.panel}><DefaultParameters key={component} component={component} defaults={defaults} onChange={onDefaultsChange} /></Tabs.Panel>
  </Tabs.Root>;
}
