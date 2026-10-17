import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Badge, Button, Card, Checkbox, Input, Switch, Text } from "./components";
import { Icon } from "./icons";
import { resolveComponentDefaults, type ComponentDefaults } from "./component-defaults";
import {
  componentRecipeOptions, componentRecipeParts, componentRecipeFields, componentRecipeSelectionFromElement,
  type ComponentRecipeOption, type ComponentRecipeSelection, type SharedComponentId,
} from "./component-recipes";
import { hasInteractionPreview, InteractionPreview } from "./interaction-preview";
import {
  changeMatrixFilters, createMatrixState, disableMatrixBodyTabStops, emptyMatrixFilters,
  matchesMatrixFilters, matrixSelectionKey, reconcileMatrixSelection, type MatrixFilters,
} from "./component-matrix-state";
import styles from "./component-matrix.module.css";
import { FrameSpacingEditor, type FrameSpacingCommit } from "./frame-spacing-editor";
import type { ThemeTokens } from "./tokens";
import { TextToolsEditor } from "./text-tools-editor";
import { textToolFields } from "./text-tools-model";
import { ToolStatus, toolbarKeyDown } from "./tool-status";
import surface from "./tool-status.module.css";
import { editScopeLabel, textTargetFor } from "./tool-scope";

const title = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
const sizes = { sm: "Small", md: "Medium", lg: "Large" } as const;

/** Use the public components, not specimen-only styles, so Project and exported code agree. */
function RecipeExample({ component, option, defaults, showError = false }: {
  component: SharedComponentId; option: ComponentRecipeOption; defaults?: ComponentDefaults; showError?: boolean;
}) {
  const resolved = resolveComponentDefaults(component, defaults);
  const props = { ...resolved.props, ...option.props };
  // Content is useful here; insertion-only state choices must not hide another recipe's anatomy.
  delete props.radius;
  const label = String(props.label ?? "Label");
  const description = String(props.description ?? "Helpful context for this field.");
  const error = option.variant.startsWith("invalid") || component === "input" && option.variant === "readonly" && showError ? String(resolved.props.error || "Please check this field.") : undefined;
  switch (component) {
    case "button": return <Button {...props} disabled={false} loading={false}>{resolved.text}</Button>;
    case "badge": return <Badge {...props}>{resolved.text}</Badge>;
    case "text": return <Text {...props} as="span">{resolved.text}</Text>;
    case "input": return <Input {...props} label={label} description={description} error={error} hideLabel={false} disabled={false} readOnly={option.variant === "readonly"} />;
    case "switch": return <Switch {...props} label={label} description={description} error={error} hideLabel={false} disabled={false} readOnly={false} defaultChecked={undefined} checked={!!option.props.defaultChecked} />;
    case "checkbox": return <Checkbox {...props} label={label} description={description} error={error} hideLabel={false} disabled={false} readOnly={false} indeterminate={false} defaultChecked={undefined} checked={!!option.props.defaultChecked} />;
    case "card": {
      const text = resolveComponentDefaults("text", defaults);
      const button = resolveComponentDefaults("button", defaults);
      return <Card {...props}>
        <Card.Icon><Icon name="check" /></Card.Icon>
        <Card.Header><Card.Title>{resolved.slots?.title}</Card.Title><Card.Description>{resolved.slots?.description}</Card.Description></Card.Header>
        <Card.Content><Text {...text.props}>{resolved.slots?.content}</Text></Card.Content>
        <Card.Footer><Button {...button.props} disabled={false} loading={false}>{resolved.slots?.action}</Button></Card.Footer>
      </Card>;
    }
  }
}

function rootSelection(component: SharedComponentId, recipe: string): ComponentRecipeSelection {
  return { component, recipe, part: "root", target: componentRecipeParts(component)[0].target };
}

export function ComponentMatrix({ component, defaults, selection: incomingSelection, onSelect, onClearSelection, onSpacingCommit, spacingContext, theme, themeLabel = "this theme" }: {
  component: SharedComponentId; defaults?: ComponentDefaults; selection: ComponentRecipeSelection | null;
  onSelect: (selection: ComponentRecipeSelection) => void;
  onClearSelection?: () => void;
  onSpacingCommit?: FrameSpacingCommit;
  spacingContext?: string;
  theme?: ThemeTokens;
  themeLabel?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const spacingHelpId = useId();
  const [storedState, setState] = useState(() => createMatrixState(component, incomingSelection));
  // Adjust local state before children render, avoiding an effect that could race a filter's clear callback.
  const state = reconcileMatrixSelection(storedState, component, incomingSelection);
  if (state !== storedState) setState(state);
  const selection = state.dismissed && state.dismissed === matrixSelectionKey(incomingSelection) ? null : incomingSelection;
  const options = componentRecipeOptions(component);
  const visible = useMemo(() => options.filter(option => matchesMatrixFilters(option, state.filters)), [options, state.filters]);
  const axes = useMemo(() => ({
    variant: [...new Set(options.map(option => option.variant))],
    tone: [...new Set(options.flatMap(option => option.tone ? [option.tone] : []))],
    size: [...new Set(options.map(option => option.size))],
  }), [options]);
  const rows = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; options: ComponentRecipeOption[] }>();
    for (const option of visible) {
      const key = [option.variant, option.tone].filter(Boolean).join(".");
      if (!groups.has(key)) groups.set(key, { key, label: [title(option.variant), option.tone && title(option.tone)].filter(Boolean).join(" / "), options: [] });
      groups.get(key)!.options.push(option);
    }
    return [...groups.values()];
  }, [visible]);
  const changeFilters = (filters: MatrixFilters) => {
    const next = changeMatrixFilters(state, filters, incomingSelection);
    setState(next.state);
    // Event-time only: no duplicate clear in Strict Mode, and no implicit replacement target.
    if (next.clear) onClearSelection?.();
  };
  const stateAxis = ["input", "switch", "checkbox"].includes(component);
  const activeFilters = Object.values(state.filters).some(Boolean);

  useLayoutEffect(() => {
    for (const body of root.current?.querySelectorAll<HTMLElement>("[data-recipe-body]") ?? []) disableMatrixBodyTabStops(body);
  }, [component, defaults, visible, selection]);

  useLayoutEffect(() => {
    const region = root.current;
    if (!region || selection?.component !== component) return;
    const example = Array.from(region.querySelectorAll<HTMLElement>("[data-recipe-example]")).find(element => element.dataset.recipeExample === selection.recipe);
    if (!example) return;
    const parts = Array.from(example.querySelectorAll<HTMLElement>(`[data-recipe-body] [data-ds-component="${component}"][data-component-part="${selection.part}"]`));
    let element = parts.find(part => part.dataset.componentTarget === selection.target) ?? parts[0];
    if (component === "card" && selection.target === "text" && ["content", "footer"].includes(selection.part)) {
      element = element?.querySelector<HTMLElement>('[data-component-target="text"]') ?? element;
    }
    element?.setAttribute("data-system-selected-part", selection.target);
    return () => element?.removeAttribute("data-system-selected-part");
  }, [component, selection, defaults, visible]);

  return <div ref={root} className={styles.matrix} data-component-matrix={component} style={{ "--matrix-size-count": state.filters.size ? 1 : axes.size.length } as CSSProperties}>
    <header className={styles.heading}>
      <div><h2 className={styles.srOnly}>{title(component)} variants</h2><p>Select a frame or text to edit its styles.</p></div>
      <span role="status" aria-live="polite">{activeFilters ? `${visible.length} of ${options.length}` : options.length} combinations</span>
    </header>
    <div className={styles.toolbar} data-matrix-toolbar>
    <fieldset className={styles.filters}>
      <legend className={styles.srOnly}>Filter combinations</legend>
      {(["variant", "tone", "size"] as const).filter(axis => axes[axis].length > 1).map(axis => <label key={axis}>
        <span>{axis === "variant" ? stateAxis ? "State" : "Variant" : title(axis)}</span>
        <select aria-label={`Filter ${axis === "variant" && stateAxis ? "state" : axis}`} value={state.filters[axis]} data-system-context-change="matrix-filter"
          onChange={event => changeFilters({ ...state.filters, [axis]: event.target.value })}>
          <option value="">All {axis === "variant" && stateAxis ? "states" : `${axis}s`}</option>
          {axes[axis].map(value => <option key={value} value={value}>{axis === "size" ? sizes[value as keyof typeof sizes] : title(value)}</option>)}
        </select>
      </label>)}
      <button type="button" disabled={!activeFilters} data-system-context-change="matrix-filter" onClick={() => changeFilters(emptyMatrixFilters())}>Clear filters</button>
    </fieldset>
    <p className={styles.context}>{selection?.component === component
      ? `Selected: ${options.find(option => option.key === selection.recipe)?.label ?? selection.recipe} / ${componentRecipeParts(component).find(part => part.key === selection.part)?.label ?? title(selection.part)} / ${title(selection.target)}${selection.target === "frame" && onSpacingCommit ? " · Frame tools edit this size across supported combinations in both themes." : ""}`
      : "No layer selected."}</p>
    </div>
    {!visible.length && <div className={styles.empty} role="status"><h3>No combinations match these filters</h3><p>Clear filters to show all {options.length} combinations. No new layer is selected automatically.</p><button type="button" data-system-context-change="matrix-filter" onClick={() => changeFilters(emptyMatrixFilters())}>Clear filters</button></div>}
    <div className={styles.columns} aria-hidden="true"><span>{stateAxis ? "State" : "Variant"}{axes.tone.length ? " / tone" : ""}</span>{axes.size.filter(size => !state.filters.size || size === state.filters.size).map(size => <span key={size}>{sizes[size]}</span>)}</div>
    <div className={styles.rows}>
      {rows.map(row => <section key={row.key} className={styles.row} aria-label={`${title(component)} ${row.label}`}>
        <h3>{row.label}</h3>
        {row.options.map(option => {
          const selected = selection?.component === component && selection.recipe === option.key;
          return <div className={styles.example} key={option.key} data-recipe-example={option.key} data-selected={selected || undefined}>
            <button type="button" className={styles.exampleLabel} data-system-context-change="matrix-selection" aria-label={`Select ${title(component)} ${row.label} ${sizes[option.size]} ${component === "text" ? "text" : "frame"}`} aria-pressed={selected && selection.part === "root"}
              onClick={() => onSelect(rootSelection(component, option.key))}>{sizes[option.size]}<span aria-hidden="true">↗</span></button>
            <div className={styles.body} data-recipe-body aria-hidden="true" data-system-context-change="matrix-selection" ref={disableMatrixBodyTabStops}
              onPointerDownCapture={event => { if (event.button === 0) event.preventDefault(); }}
              onClickCapture={event => {
                event.preventDefault(); event.stopPropagation();
                const hit = event.target instanceof Element ? componentRecipeSelectionFromElement(event.target, component) : null;
                onSelect(hit && hit.recipe === option.key ? hit : rootSelection(component, option.key));
              }}>
              <RecipeExample component={component} option={option} defaults={defaults} showError={selected && selection.part === "error"} />
            </div>
            {selected && selection.target === "text" && onSpacingCommit && <>
              <div className={surface.surface} data-tool-surface="text" data-system-context-change="text-tools">
                <div role="toolbar" aria-label="Text tools" className={surface.toolbar} onKeyDown={toolbarKeyDown}>
                  {theme && <TextToolsEditor key={`${spacingContext}-${selection.recipe}-${selection.part}`} selection={selection} theme={theme} themeLabel={themeLabel} onCommit={onSpacingCommit} id={`${spacingHelpId}-text`} />}
                  {componentRecipeFields(component, selection.part, "frame", selection.recipe).some(field => field.group === "padding" || field.group === "margin") && <button type="button" data-target-switch="frame" title="Edit this layer's size, spacing, corners and gap" onClick={() => onSelect({ ...selection, target: "frame" })}>Frame</button>}
                </div>
                {textToolFields(selection).length > 0 && <ToolStatus tool="Text" scope={`${editScopeLabel(selection, "fontSize", themeLabel)} · color: this combination, ${themeLabel}`} hint="Open Text to type values or drag a label; Enter applies, Escape cancels." />}
              </div>
            </>}
            {selected && selection.target === "frame" && onSpacingCommit && <FrameSpacingEditor key={`${spacingContext}-${selection.recipe}-${selection.part}`} selection={selection} onCommit={onSpacingCommit} helpId={spacingHelpId} theme={theme} themeLabel={themeLabel}
              onTextTarget={(text => text ? () => onSelect(text) : undefined)(textTargetFor(selection))} />}
            {selected && hasInteractionPreview(component) && <InteractionPreview key={option.key} component={component} option={option} defaults={defaults} showError={selection.part === "error"} />}
          </div>;
        })}
      </section>)}
    </div>
  </div>;
}
