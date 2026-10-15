import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "./controls";
import { componentDefaultFields, parseComponentDefaults, resolveComponentDefaults, type ComponentDefaultField, type ComponentDefaults } from "./component-defaults";
import { componentStyleFields, componentStyleParts, parseComponentStyles, type ComponentStylePart, type ComponentStyles } from "./component-styles";
import { componentRecipeFields, componentRecipeOptions, componentRecipeParts, type ComponentRecipeSelection, type ComponentRecipes } from "./component-recipes";
import { applyScopedRecipePatch, recipeEditTargets } from "./recipe-edit-scope";
import type { AppearanceField, AppearancePatch, NodeAppearance } from "./components/appearance";
import { appearanceFieldHint, appearanceFieldUnit, appearanceFieldWide, appearanceStyleDraft } from "./appearance-field-ui";
import { AppearanceFieldHelp } from "./appearance-field-help";
import type { ComponentId, ThemeTokens } from "./tokens";
import type { RenderedAppearance } from "./rendered-appearance";
import { useCanvasAppearance } from "./use-canvas-appearance";
import { styleSourceInfo, type StyleSourceScope } from "./style-sources";
import type { PaletteMode } from "./color-engine";
import fields from "./composer/inspector.module.css";
import styles from "./system-component-editor.module.css";

export type ComponentEditorTab = "styles" | "preview";
export type SystemComponentEditorProps = {
  component: ComponentId | null;
  theme: ThemeTokens;
  mode: PaletteMode;
  defaults?: ComponentDefaults;
  previewDefaults?: ComponentDefaults;
  onPreviewDefaultsChange?: (next: ComponentDefaults | undefined) => void;
  tab: ComponentEditorTab;
  selection: ComponentRecipeSelection | null;
  sharedPart?: ComponentStylePart;
  onSharedPartChange?: (part: ComponentStylePart) => void;
  onTabChange: (tab: ComponentEditorTab) => void;
  onSelectionChange: (selection: ComponentRecipeSelection) => void;
  /** @deprecated Saved defaults are read-only in the inspector. */
  onDefaultsChange?: (next: ComponentDefaults) => void;
  onStylesChange: (next: ComponentStyles) => void;
  onRecipesChange: (next: ComponentRecipes) => void;
  children: ReactNode;
};

const groupNames = { dimensions: "Size", padding: "Padding", margin: "Margin", radius: "Corners", typography: "Typography", layout: "Layout", surface: "Surface, border & shadow" };
const shortLabels: Partial<Record<keyof NodeAppearance, string>> = {
  paddingTop: "Top", paddingRight: "Right", paddingBottom: "Bottom", paddingLeft: "Left",
  marginTop: "Top", marginRight: "Right", marginBottom: "Bottom", marginLeft: "Left",
  borderTopLeftRadius: "Top left", borderTopRightRadius: "Top right", borderBottomRightRadius: "Bottom right", borderBottomLeftRadius: "Bottom left",
};
const sizeLabels: Record<string, string> = { sm: "Small", md: "Medium", lg: "Large" };
const title = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/(^|[- ])\w/g, letter => letter.toUpperCase());
const message = (error: unknown) => error instanceof Error ? error.message : "Invalid value";
type RecipeOption = ReturnType<typeof componentRecipeOptions>[number];

// Capture before the browser blurs the outgoing field, including old-target commits.
// Shell/matrix owners mark additional scope-changing controls with this data attribute.
function installDraftScopeGuard(input: HTMLInputElement | HTMLTextAreaElement, discard: () => void) {
  const document = input.ownerDocument;
  const pointer = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (event.button !== 0 || !target?.closest || target.closest("[data-interaction-preview]")) return;
    if (target.closest('[data-system-context-change], [data-inspector-discard-drafts], a[href], .system-switcher, .view-switch, .canvas-theme, [data-component-matrix] select, [data-component-matrix] [data-recipe-example]')) discard();
  };
  const cancel = () => discard();
  document.addEventListener("pointerdown", pointer, true);
  document.addEventListener("bambiui:discard-inspector-drafts", cancel, true);
  return () => {
    document.removeEventListener("pointerdown", pointer, true);
    document.removeEventListener("bambiui:discard-inspector-drafts", cancel, true);
  };
}

function DraftControl({ id, label, accessibleLabel, value, resolvedValue, numeric, field, options, placeholder, multiline, maxLength, overridden, resettable, scopeHint, onCommit, onReset }: {
  id: string; label: string; accessibleLabel: string; value: string; options?: readonly string[];
  resolvedValue?: string; numeric?: boolean; field?: AppearanceField; placeholder?: string; multiline?: boolean; maxLength?: number; overridden: boolean;
  resettable?: boolean; scopeHint?: string;
  onCommit: (value: string) => void; onReset: () => void;
}) {
  const current = overridden ? value : resolvedValue ?? value;
  const [draft, setDraft] = useState<string | null>(null);
  // Keep the pre-edit value through live measurements, and consume Enter before blur.
  const pending = useRef<{ value: string; baseline: string } | null>(null);
  const [error, setError] = useState("");
  const cleanupGuard = useRef<(() => void) | null>(null);
  const abandonedScope = useRef(false);
  useEffect(() => () => cleanupGuard.current?.(), []);
  const discard = () => { pending.current = null; setDraft(null); setError(""); };
  const same = (left: string, right: string) => left === right || !!numeric
    && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(left.trim()) && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(right.trim()) && Number(left) === Number(right);
  const commit = (next: string, baseline = current) => {
    if (abandonedScope.current) { discard(); return; }
    pending.current = null;
    try {
      const emptyDefault = resolvedValue !== undefined && !overridden && !resettable && !next.trim();
      const clearingScopedOverride = resettable && !next.trim();
      if (!emptyDefault && (clearingScopedOverride || !same(next, value) && !same(next, current) && !same(next, baseline))) onCommit(next);
      discard();
    }
    catch (error) { pending.current = { value: next, baseline }; setDraft(next); setError(message(error)); }
  };
  const hint = field ? appearanceFieldHint(field) : undefined;
  const accessibility = { id, "aria-label": accessibleLabel, "aria-invalid": !!error, "aria-describedby": [field && `${id}-hint`, scopeHint && `${id}-scope`, error && `${id}-error`].filter(Boolean).join(" ") || undefined };
  const inputProps = {
    ...accessibility, value: draft ?? current, placeholder, maxLength, title: field ? `${current || "Not rendered"}. ${hint}` : undefined,
    inputMode: numeric ? "decimal" as const : undefined,
    list: field?.type === "dimension" && field.options?.length ? `${id}-options` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (abandonedScope.current) return;
      pending.current = { value: event.target.value, baseline: pending.current?.baseline ?? current }; setDraft(event.target.value); setError("");
    },
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      cleanupGuard.current?.();
      abandonedScope.current = false;
      cleanupGuard.current = installDraftScopeGuard(event.currentTarget, () => { abandonedScope.current = true; discard(); });
    },
    onBlur: () => {
      cleanupGuard.current?.(); cleanupGuard.current = null;
      if (pending.current !== null) commit(pending.current.value, pending.current.baseline);
    },
    onPointerDown: () => { abandonedScope.current = false; },
    onCompositionStart: () => { abandonedScope.current = false; },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      // A canceled scope action may keep focus here; a new native edit starts fresh.
      abandonedScope.current = false;
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); if (pending.current !== null) commit(pending.current.value, pending.current.baseline); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); discard(); }
    },
  };
  return <div className={`${fields.property} ${multiline || field && appearanceFieldWide(field) ? fields.fullWidth : ""}`} data-overridden={overridden || undefined} data-appearance-field={field?.key} data-has-field-help={!!field || undefined}>
    <label htmlFor={id}>{label}{field && appearanceFieldUnit(field) && <small className={fields.fieldUnit} aria-hidden="true">{appearanceFieldUnit(field)}</small>}</label>
    <div className={fields.inputRow}>
      {options ? <select {...accessibility} value={draft ?? value} title={field ? `${current || "Not rendered"}. ${hint}` : current || undefined} onChange={event => commit(event.target.value)}>
        <option value="">{resolvedValue || placeholder || "Default"}</option>{options.map(option => <option key={option} value={option}>{option === "true" ? "On" : option === "false" ? "Off" : option}</option>)}
      </select> : multiline ? <textarea {...inputProps} rows={2} className={styles.textarea} /> : <input {...inputProps} spellCheck={false} />}
      {(resettable ?? overridden) && <button type="button" className={fields.reset} title={scopeHint ? `Reset field overrides: ${scopeHint}` : "Reset to the system default"} aria-label={`Reset ${accessibleLabel}`} onPointerDown={event => event.preventDefault()} onClick={() => {
        pending.current = null;
        try { onReset(); discard(); } catch (error) { setError(message(error)); }
      }}>↺</button>}
    </div>
    {field?.type === "dimension" && field.options?.length ? <datalist id={`${id}-options`}>{field.options.map(option => <option key={option} value={option} />)}</datalist> : null}
    {scopeHint && <small id={`${id}-scope`} className={styles.fieldScope}>{scopeHint}</small>}
    {field && <AppearanceFieldHelp id={id} label={accessibleLabel} field={field} current={current} />}
    {error && <p id={`${id}-error`} role="alert" className={fields.error}>{error}</p>}
  </div>;
}

function previewSampleFields(component: ComponentId) {
  return componentDefaultFields(component).filter(field => field.source !== "props"
    || ["label", "placeholder", "description", "error", "errorPosition", "errorIcon", "value", "defaultValue", "type", "dot"].includes(field.key) && (!["type", "value", "defaultValue"].includes(field.key) || component === "input"));
}

function PreviewSamples({ component, defaults, previewDefaults, onChange }: { component: ComponentId; defaults?: ComponentDefaults; previewDefaults?: ComponentDefaults; onChange?: (next: ComponentDefaults | undefined) => void }) {
  const [error, setError] = useState("");
  const [draftRevision, setDraftRevision] = useState(0);
  const effective = previewDefaults ?? defaults;
  const resolved = resolveComponentDefaults(component, effective);
  const metadata = previewSampleFields(component);
  const content = metadata.filter(field => field.type === "text");
  const options = metadata.filter(field => field.type === "select");
  function edit(field: ComponentDefaultField, draft: string | null) {
    if (!onChange) return;
    const next = structuredClone(effective ?? {});
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
    const parsed = parseComponentDefaults(next);
    if (JSON.stringify(parsed) !== JSON.stringify(parseComponentDefaults(effective ?? {}))) onChange(parsed);
  }
  function render(items: ComponentDefaultField[]) {
    return <div className={fields.contentGrid}>{items.map(field => {

      const value = field.source === "text" ? resolved.text : (resolved[field.source] as Record<string, unknown> | undefined)?.[field.key];
      const saved = resolveComponentDefaults(component, defaults);
      const savedValue = field.source === "text" ? saved.text : (saved[field.source] as Record<string, unknown> | undefined)?.[field.key];
      const authored = previewDefaults !== undefined && value !== savedValue;
      return <DraftControl key={`${component}-${field.source}-${field.key}-${draftRevision}`} id={`system-default-${component}-${field.key}`} label={field.label} accessibleLabel={`Preview ${field.label}`}
        value={value === undefined ? "" : String(value)} options={field.options?.map(String)} multiline={field.type === "text"} maxLength={field.maxLength} placeholder={field.options ? "Default" : "None"}
        overridden={authored} onCommit={draft => edit(field, draft)} onReset={() => {
                  const savedEntry = defaults?.[component];
                  const savedRaw = field.source === "text" ? savedEntry?.text : (savedEntry?.[field.source] as Record<string, unknown> | undefined)?.[field.key];
                  edit(field, savedRaw === undefined ? null : String(savedRaw));
                }} />;
    })}</div>;
  }
  return <>
    <p className={styles.scopeLabel} data-system-edit-scope="preview">Temporary preview</p>
    <p className={fields.note}>Sample content only. Styles, saved defaults, history and exports stay unchanged. Choose combinations in the matrix; test live states on the canvas.</p>
    {content.length > 0 && <section className={styles.section}><h3>Content</h3>{render(content)}</section>}
    {options.length > 0 && <section className={styles.section}><h3>Sample options</h3>{render(options)}</section>}
    <Button disabled={previewDefaults === undefined || !onChange} onPointerDown={event => event.preventDefault()} onClick={() => {
      try { onChange?.(undefined); setDraftRevision(revision => revision + 1); setError(""); }
      catch (error) { setError(message(error)); }
    }}>Reset preview</Button>
    {error && <p className={fields.error} role="alert">{error}</p>}
  </>;
}

const styleDraft = appearanceStyleDraft;

function patchAppearance(values: NodeAppearance, patch: AppearancePatch) {
  for (const key of Object.keys(patch) as (keyof NodeAppearance)[]) {
    if (patch[key] === null) delete values[key];
    else Object.assign(values, { [key]: patch[key] });
  }
}

function updateRecipeFields(recipes: ComponentRecipes | undefined, selection: ComponentRecipeSelection, patch: AppearancePatch): ComponentRecipes {
  return applyScopedRecipePatch(recipes, selection, patch);
}

function StyleGroup({ scope, label, group, metadata, values, resolved = {}, text, resetFields, scopeHints, onChange }: {
  scope: string; label: string; group: AppearanceField["group"]; metadata: readonly AppearanceField[];
  values: NodeAppearance; resolved?: RenderedAppearance; text?: boolean;
  resetFields?: ReadonlySet<keyof NodeAppearance>; scopeHints?: Partial<Record<keyof NodeAppearance, string>>;
  onChange: (patch: AppearancePatch) => void;
}) {
  const [linked, setLinked] = useState(false);
  const linkable = ["padding", "margin", "radius"].includes(group);
  const count = metadata.filter(field => resetFields ? resetFields.has(field.key) : values[field.key] !== undefined).length;
  function edit(field: AppearanceField, draft: string) {
    const patch = styleDraft(field, draft);
    onChange(linked && linkable ? Object.fromEntries(metadata.map(entry => [entry.key, patch[field.key]])) as AppearancePatch : patch);
  }
  return <details className={fields.group} open={text ? ["typography", "surface"].includes(group) : ["dimensions", "layout", "padding", "surface"].includes(group)}>
    <summary>{text && group === "surface" ? "Text color" : groupNames[group]}{count > 0 && <span className={fields.overrideCount}>{count}</span>}</summary>
    {linkable && <button type="button" className={fields.linkToggle} aria-label={`Link ${group === "radius" ? "corners" : group + " sides"}`} aria-pressed={linked} onClick={() => setLinked(!linked)}>{linked ? "Linked" : "Independent"}</button>}
    <div className={fields.propertyGrid}>{metadata.map(field => <DraftControl key={field.key} id={`${scope}-${field.key}`}
      label={shortLabels[field.key] ?? field.label} accessibleLabel={`${label} ${field.label}`} value={values[field.key] === undefined ? "" : String(values[field.key])}
      resolvedValue={resolved[field.key] ?? ""} numeric={field.type === "number" || field.type === "dimension"} field={field}
      options={field.type === "select" ? field.options : undefined} placeholder="Not rendered"
      overridden={values[field.key] !== undefined} resettable={resetFields?.has(field.key)} scopeHint={scopeHints?.[field.key]}
      onCommit={draft => edit(field, draft)} onReset={() => edit(field, "")} />)}</div>
  </details>;
}

function ValueSourceDetails({ scope, metadata, theme, mode }: { scope: StyleSourceScope; metadata: readonly AppearanceField[]; theme: ThemeTokens; mode: PaletteMode }) {
  const exact = scope.recipe !== undefined;
  return <details className={styles.sourceDetails} data-system-scope-details={exact ? "recipe" : "shared"}>
    <summary>Scope &amp; value sources</summary>
    <p>{exact ? "Color edits affect this combination and theme. Non-color edits affect the same layer at this size across variants, states and tones; Text keeps its typographic variant." : "Edits affect this layer across all combinations and sizes."} Exported consumers use these System styles.</p>
    <p>{exact ? "Reset removes the field from its editing group: colors from this combination, non-colors from the same-size layer group. Shared defaults and base tokens stay unchanged." : "Reset removes only this shared layer's overrides, not exact combination overrides or base tokens."} Sample content and other layers stay unchanged.</p>
    {!exact && <p>Shared authored values are shown even when an exact override masks them. Mixed means the examples use different rendered values.</p>}
    <p>Sources below identify direct declarations and the fallback boundary; parent or nested-component defaults may resolve through additional styles. Values remain in the property controls.</p>
    <ul className={styles.sourceList} aria-label="Style declaration sources">
      {metadata.map(field => {
        const source = styleSourceInfo(theme, scope, field);
        return <li key={field.key} data-style-source-field={field.key} data-style-source={source.current.kind}>
          <div><strong>{field.label}</strong><span>{source.themeSpecific ? title(mode) : "Both themes"}</span></div>
          <p>{source.current.label}</p>
          <small>{source.current.description}</small>
          {exact && <small>Edit/reset scope: {field.type === "color" ? `this combination · ${title(mode)}` : `same size${scope.component === "text" ? " and typographic variant" : ""} · ${recipeEditTargets(scope, field.key).length} combinations · both themes`}</small>}
          <small>Reset → {source.afterReset.label}{!source.overridden && " · no direct override here"}</small>
          <code title="Variable authored by this control">{source.editVariable}</code>
          {source.current.variable && source.current.variable !== source.editVariable && <small>Source: <code>{source.current.variable}</code></small>}
          {source.afterReset.variable && source.afterReset.variable !== source.editVariable && source.afterReset.variable !== source.current.variable && <small>Reset source: <code>{source.afterReset.variable}</code></small>}
        </li>;
      })}
    </ul>
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
          <button type="button" data-inspector-discard-drafts={part.key !== selection.part || part.target !== selection.target || undefined} aria-pressed={part.key === selection.part && part.target === selection.target} aria-label={`Select ${part.label} ${part.target}`} onClick={() => onSelect({ ...selection, part: part.key, target: part.target })}>
            <span>{part.label}</span><span className={styles.layerKind}>{title(part.target)}</span>
          </button>
          {componentRecipeFields(selection.component, part.key, alternate, selection.recipe).length > 0 && <button type="button" className={styles.alternateTarget} data-inspector-discard-drafts={part.key !== selection.part || alternate !== selection.target || undefined} aria-pressed={part.key === selection.part && alternate === selection.target} aria-label={`Select ${part.label} ${alternate}`} onClick={() => onSelect({ ...selection, part: part.key, target: alternate })}>{title(alternate)}</button>}
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
  const resetFields = new Set(metadata.filter(field => recipeEditTargets(selection, field.key).some(option =>
    theme.componentRecipes?.[selection.component]?.[option.key]?.[selection.part]?.[field.key] !== undefined)).map(field => field.key));
  const scopeHints = Object.fromEntries(metadata.map(field => [field.key, field.type === "color"
    ? `This combination · ${title(mode)}`
    : `${sizeLabels[recipe.size]}${selection.component === "text" ? ` ${title(recipe.variant)}` : ""} · ${recipeEditTargets(selection, field.key).length} combinations · both themes`]));
  function change(patch: AppearancePatch) {
    const next = updateRecipeFields(theme.componentRecipes, selection, patch);
    if (next !== theme.componentRecipes) onChange(next);
    setError("");
  }
  return <section data-system-recipe-controls data-recipe={selection.recipe} data-part={selection.part} data-target={selection.target} aria-label={breadcrumb}>
    <header className={styles.selectionHeading}><div><h3>{breadcrumb}</h3><p className={styles.scopeLabel}>Colors · this combination · {title(mode)} / non-colors · same size · both themes</p></div><span className={styles.target}>{title(selection.target)}</span></header>
    <p className={styles.scopeLabel} data-system-edit-scope="recipe">Size styles / combination colors</p>
    <p className={fields.note}>{selection.component === "text" ? "Size styles apply to every tone of this typographic variant." : "Size styles apply across variants, states and tones where this layer is supported."} Other sizes and layers stay unchanged. Colors stay on this combination.</p>
    <p className={fields.note}>Values describe the selected example. Existing differences remain until you edit or reset a field.</p>
    <ValueSourceDetails scope={selection} metadata={metadata} theme={theme} mode={mode} />
    <RecipeLayers selection={selection} label={combination} onSelect={onSelectionChange} />
    <div className={fields.inheritance}><span>{selection.target === "text" ? "Typography" : "Geometry & effects"} · both themes<br />Colors · {title(mode)}</span>
      <button type="button" disabled={!resetFields.size} onPointerDown={event => event.preventDefault()} onClick={() => {
        try { change(Object.fromEntries(metadata.map(field => [field.key, null])) as AppearancePatch); setDraftRevision(revision => revision + 1); }
        catch (error) { setError(message(error)); }
      }}>Reset {selection.target} styles</button>
    </div>
    {error && <p className={fields.error} role="alert">{error}</p>}
    {groups.map(group => <StyleGroup key={`${group}-${draftRevision}`} scope={scope} label={breadcrumb} group={group} metadata={metadata.filter(field => field.group === group)} values={values} resolved={resolved} text={selection.target === "text"} resetFields={resetFields} scopeHints={scopeHints} onChange={change} />)}
  </section>;
}

function SharedDefaults({ component, theme, mode = "light", initialPart = "root", onPartChange, onChange }: { component: ComponentId; theme: ThemeTokens; mode?: PaletteMode; initialPart?: ComponentStylePart; onPartChange?: (part: ComponentStylePart) => void; onChange: (next: ComponentStyles) => void }) {
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
    <p className={styles.scopeLabel} data-system-edit-scope="shared">All combinations · shared layer</p>
    <p className={fields.note}>Base layer styles for every {title(component)}. Combination overrides take precedence. Mixed means the canvas examples use different values.</p>
    <label className={fields.partPicker}>Shared default layer<select data-inspector-discard-drafts aria-label="Shared default layer" value={part} onChange={event => { const next = event.target.value as ComponentStylePart; setPart(next); onPartChange?.(next); setError(""); }}>
      {componentStyleParts(component).map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
    </select></label>
    <ValueSourceDetails key={part} scope={{ component, part }} metadata={metadata} theme={theme} mode={mode} />
    <div className={fields.inheritance}><span>All variants & sizes</span><button type="button" disabled={!Object.keys(values).length} onPointerDown={event => event.preventDefault()} onClick={() => {
      try { change(Object.fromEntries(metadata.map(field => [field.key, null])) as AppearancePatch); setDraftRevision(revision => revision + 1); }
      catch (error) { setError(message(error)); }
    }}>Reset shared layer</button></div>
    {error && <p className={fields.error} role="alert">{error}</p>}
    {[...new Set(metadata.map(field => field.group))].map(group => <StyleGroup key={`${part}-${group}-${draftRevision}`} scope={`system-shared-${component}-${part}`} label={`Shared ${title(component)} ${part}`} group={group} metadata={metadata.filter(field => field.group === group)} values={values} resolved={resolved} onChange={change} />)}
  </details>;
}

export function SystemComponentEditor({ component, theme, mode, defaults, previewDefaults, onPreviewDefaultsChange, tab, selection, sharedPart, onSharedPartChange, onTabChange, onSelectionChange, onStylesChange, onRecipesChange, children }: SystemComponentEditorProps) {
  if (!component) return children;
  const recipe = selection?.component === component ? componentRecipeOptions(component).find(entry => entry.key === selection.recipe) : undefined;
  const validSelection = selection && recipe && componentRecipeFields(component, selection.part, selection.target, selection.recipe).length > 0 ? selection : null;
  return <Tabs.Root value={tab} onValueChange={value => {
    if (value !== "styles" && value !== "preview" || value === tab) return;
    if (tab === "preview") onPreviewDefaultsChange?.(undefined);
    onTabChange(value);
  }} className={styles.editor}>
    <Tabs.List aria-label="Component editor" className={styles.tabs}>
      <Tabs.Tab value="styles" data-inspector-discard-drafts={tab !== "styles" || undefined} className={styles.tab}>Styles</Tabs.Tab><Tabs.Tab value="preview" data-inspector-discard-drafts={tab !== "preview" || undefined} className={styles.tab}>Preview</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="styles" className={styles.panel}>
      {validSelection && recipe ? <RecipeStyles key={`${component}-${validSelection.recipe}-${validSelection.part}-${validSelection.target}-${mode}`} selection={validSelection} recipe={recipe} theme={theme} mode={mode}
        onSelectionChange={next => { onSelectionChange(next); onTabChange("styles"); }} onChange={onRecipesChange} />
        : <div className={styles.emptySelection}><h3>Select a component layer</h3><p className={fields.note}>Choose a layer in a canvas example to style that exact variant and size.</p></div>}
      <SharedDefaults key={`${component}-${mode}-${sharedPart ?? "root"}`} component={component} theme={theme} mode={mode} initialPart={sharedPart} onPartChange={onSharedPartChange} onChange={onStylesChange} />
      <details className={`${fields.group} ${styles.baseTokens}`} data-system-base-tokens><summary>Base & variant tokens · all sizes</summary><p className={styles.scopeLabel} data-system-edit-scope="base">Base / variant defaults · all sizes</p><p className={fields.note}>Shared across sizes, not limited to the selection above. Exact combination and shared layer overrides may mask these defaults.</p><details className={styles.sourceDetails} data-system-scope-details="base"><summary>Scope &amp; reset behavior</summary><p>Variant/state tokens affect the selected variant or state across all sizes. Component base tokens supply defaults across combinations. Both affect System components where those defaults are consumed.</p><p>Resetting a base or variant token removes only its own override and restores its global or derived default. It does not clear shared layer styles, exact combination styles or local instance styles. Accessible focus outlines remain global.</p></details>{children}</details>
    </Tabs.Panel>
    <Tabs.Panel value="preview" className={styles.panel}><fieldset className={styles.previewFields} disabled={!onPreviewDefaultsChange}><legend className={styles.previewLegend}>Session samples</legend><PreviewSamples key={`${component}-${selection?.recipe ?? "none"}`} component={component} defaults={defaults} previewDefaults={previewDefaults} onChange={onPreviewDefaultsChange} /></fieldset></Tabs.Panel>
  </Tabs.Root>;
}
