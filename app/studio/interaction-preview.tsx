import { useEffect, useId, useRef, useState } from "react";
import { Button, Checkbox, Input, Switch } from "./components";
import { componentRecipeKey, componentRecipeSelectionFromElement, type ComponentRecipeOption, type SharedComponentId } from "./component-recipes";
import { resolveComponentDefaults, type ComponentDefaults } from "./component-defaults";
import styles from "./interaction-preview.module.css";

export type InteractiveComponent = "button" | "input" | "switch" | "checkbox";
export type PreviewCondition = "normal" | "disabled" | "loading" | "readonly" | "indeterminate";
const labels: Record<PreviewCondition, string> = { normal: "Normal", disabled: "Disabled", loading: "Loading", readonly: "Read only", indeterminate: "Indeterminate" };
export function hasInteractionPreview(component: SharedComponentId): component is InteractiveComponent {
  return ["button", "input", "switch", "checkbox"].includes(component);
}
export function previewConditions(component: InteractiveComponent): readonly PreviewCondition[] {
  return component === "button" ? ["normal", "disabled", "loading"] : component === "checkbox" ? ["normal", "disabled", "readonly", "indeterminate"] : ["normal", "disabled", "readonly"];
}

/** A session-only, real-component sandbox. It has no token/default/selection callbacks. */
export function InteractionPreview({ component, option, defaults, showError = false }: {
  component: InteractiveComponent; option: ComponentRecipeOption; defaults?: ComponentDefaults; showError?: boolean;
}) {
  const resolved = resolveComponentDefaults(component, defaults);
  const props = { ...resolved.props, ...option.props };
  delete props.radius;
  const initialValue = String(props.value ?? props.defaultValue ?? "");
  const initialChecked = !!option.props.defaultChecked;
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<PreviewCondition>("normal");
  const [value, setValue] = useState(initialValue);
  const [checked, setChecked] = useState(initialChecked);
  const [activations, setActivations] = useState(0);
  const [observedRecipe, setObservedRecipe] = useState<string | null>(null);
  const [resetRevision, setResetRevision] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const conditionId = useId();
  const disabled = condition === "disabled";
  const loading = component === "button" && condition === "loading";
  const readOnly = condition === "readonly" || component === "input" && option.variant === "readonly";
  const indeterminate = component === "checkbox" && condition === "indeterminate";
  const error = option.variant.startsWith("invalid") || component === "input" && option.variant === "readonly" && showError
    ? String(resolved.props.error || "Please check this field.") : undefined;
  const initialRecipe = componentRecipeKey(component, { ...option.props, error, checked, readOnly, indeterminate });
  // Base UI/native validity can change independently of preview props. Read the
  // actual DOM state for the label only; never route it back to edit selection.
  useEffect(() => {
    const region = body.current;
    if (!open || !region) return;
    const update = () => {
      const control = region.querySelector(`[data-ds-component="${component}"][data-component-part="${component === "button" ? "root" : "control"}"]`);
      setObservedRecipe(componentRecipeSelectionFromElement(control, component)?.recipe ?? null);
    };
    const observer = new MutationObserver(update);
    observer.observe(region, { subtree: true, attributes: true, attributeFilter: ["data-invalid", "data-checked", "data-indeterminate", "readonly", "aria-invalid"] });
    update();
    return () => observer.disconnect();
  }, [open, component, initialRecipe, resetRevision]);
  const liveRecipe = observedRecipe ?? initialRecipe;
  // Remount on reset as well, clearing native/Base UI dirty, touched and validation state.
  const reset = () => { setCondition("normal"); setValue(initialValue); setChecked(initialChecked); setActivations(0); setObservedRecipe(null); setResetRevision(revision => revision + 1); };
  const changeChecked = (next: boolean) => {
    if (disabled || readOnly) return;
    setChecked(next);
    if (indeterminate) setCondition("normal");
  };
  const fieldProps = { ...props, label: String(props.label ?? "Label"), description: String(props.description ?? "Helpful context for this field."), error, hideLabel: false, disabled, readOnly };
  const renderControl = () => {
    switch (component) {
      case "button": return <Button {...props} type="button" disabled={disabled} loading={loading} onClick={() => {
        if (disabled || loading) return;
        setActivations(count => count + 1); setCondition("loading");
      }}>{resolved.text}</Button>;
      case "input": return <Input {...fieldProps} defaultValue={undefined} value={value} onValueChange={next => { if (!disabled && !readOnly) setValue(next); }} />;
      case "switch": return <Switch {...fieldProps} defaultChecked={undefined} checked={checked} onCheckedChange={changeChecked} />;
      case "checkbox": return <Checkbox {...fieldProps} defaultChecked={undefined} checked={checked} indeterminate={indeterminate} onCheckedChange={changeChecked} />;
    }
  };
  return <details className={styles.preview} data-interaction-preview={component} data-edit-recipe={option.key} onToggle={event => {
    setOpen(event.currentTarget.open);
    if (!event.currentTarget.open) reset();
  }}>
    <summary>Test interaction states</summary>
    {open && <>
      <p className={styles.note}>Preview only. Inspector edits stay on <strong>{option.label}</strong>; values and states here are never saved.</p>
      <div className={styles.tools}>
        <label htmlFor={conditionId}>Condition<select id={conditionId} aria-label="Preview condition" value={condition} onChange={event => {
          const next = event.target.value as PreviewCondition;
          if (previewConditions(component).includes(next)) setCondition(next);
        }}>{previewConditions(component).map(state => <option key={state} value={state}>{state === "normal" && component !== "button" ? "As selected" : labels[state]}</option>)}</select></label>
        <button type="button" onClick={reset}>Reset preview</button>
        <button type="button" disabled={disabled} onClick={() => body.current?.querySelector<HTMLElement>('button, input:not([type="hidden"]), [role="switch"], [role="checkbox"]')?.focus({ preventScroll: true })}>Focus control</button>
      </div>
      <p className={styles.note}>{component === "button" ? "Hover or hold the button to inspect pointer feedback. Clicking starts loading; choose Normal or Reset to finish."
        : component === "input" ? "Try input text and hover feedback where supported. Read only preserves the value; Disabled blocks interaction."
          : "Click or use Space to check/uncheck. Read only preserves the state; Disabled blocks interaction."} Use Tab for keyboard focus.</p>
      <div key={resetRevision} ref={body} className={styles.control} data-live-preview-recipe={liveRecipe}>{renderControl()}</div>
      <p className={styles.recipe}>Live recipe: <code>{liveRecipe}</code>{liveRecipe !== option.key && <span> · edit scope unchanged</span>}</p>
      <output className={styles.result} role="status" aria-live="polite">{component === "button" ? `${loading ? "Loading" : disabled ? "Disabled" : "Ready"} · ${activations} activation${activations === 1 ? "" : "s"}` : component === "input" ? disabled ? "Disabled" : readOnly ? "Read only" : "Editable input" : `${indeterminate ? "Indeterminate" : checked ? "Checked" : "Unchecked"}${disabled ? " · disabled" : readOnly ? " · read only" : ""}`}</output>
    </>}
  </details>;
}
