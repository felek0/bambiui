"use client";

import { useId, useState, type CSSProperties } from "react";
import { Badge, Button, Card, Checkbox, Input, Switch, Text, type BadgeProps, type ButtonProps, type CardProps, type CheckboxProps, type InputProps, type SwitchProps, type TextProps } from "./components";
import type { PaletteMode } from "./color-engine";
import { toCSSVariables, type ComponentId, type DesignSystem } from "./tokens";
import type { ComponentDefaultField, ComponentDefaultSlot } from "./component-defaults";
import { playgroundArgs, playgroundFields, updatePlaygroundArg } from "./component-playground-model";
import styles from "./component-playground.module.css";

function PresetIcon({ preset }: { preset: unknown }) {
  if (!preset || preset === "none") return null;
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {preset === "plus" ? <path d="M12 5v14M5 12h14" /> : preset === "check" ? <path d="m5 12 4 4L19 6" /> : preset === "warning" ? <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v4m0 4h.01" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>}
  </svg>;
}

/** Ephemeral args only. The parent owns identity remounts, never recipe selection. */
export function ComponentPlayground({ component, system, mode, active = true }: {
  component: ComponentId; system: DesignSystem; mode: PaletteMode; active?: boolean;
}) {
  const [args, setArgs] = useState(() => playgroundArgs(component, system.componentDefaults));
  const [actions, setActions] = useState(0);
  const [revision, setRevision] = useState(0);
  const id = useId();
  const fields = playgroundFields(component);
  const reset = () => {
    setArgs(playgroundArgs(component, system.componentDefaults));
    setActions(0);
    setRevision(value => value + 1);
  };
  const setProp = (key: string, value: string | boolean) => setArgs(current => ({ ...current, props: { ...current.props, [key]: value } }));
  const blocked = !!args.props.disabled || !!args.props.readOnly;
  const changeChecked = (checked: boolean) => {
    if (blocked) return;
    setArgs(current => ({ ...current, props: { ...current.props, checked, ...(component === "checkbox" ? { indeterminate: false } : {}) } }));
  };
  const activate = () => { if (!args.props.disabled && !args.props.loading) setActions(count => count + 1); };
  const { startIcon, endIcon, iconOnly, icon, ...scalarProps } = args.props;
  const decoratedProps = { ...scalarProps, startIcon: startIcon && startIcon !== "none" ? <PresetIcon preset={startIcon} /> : undefined, endIcon: endIcon && endIcon !== "none" ? <PresetIcon preset={endIcon} /> : undefined };
  const sample = () => {
    switch (component) {
      case "button": return <Button {...decoratedProps as ButtonProps} iconOnly={!!iconOnly} aria-label={args.text || "Playground button"} onClick={activate}>{iconOnly ? <PresetIcon preset={icon && icon !== "none" ? icon : "plus"} /> : args.text}</Button>;
      case "input": return <Input {...decoratedProps as InputProps} label={String(args.props.label ?? "")} value={String(args.props.value ?? "")} onValueChange={value => { if (!blocked) setProp("value", value); }} />;
      case "switch": return <Switch {...scalarProps as Partial<SwitchProps>} label={String(args.props.label ?? "")} checked={!!args.props.checked} onCheckedChange={changeChecked} />;
      case "checkbox": return <Checkbox {...scalarProps as Partial<CheckboxProps>} label={String(args.props.label ?? "")} checked={!!args.props.checked} onCheckedChange={changeChecked} />;
      case "badge": return <Badge {...scalarProps as BadgeProps} startIcon={decoratedProps.startIcon}>{args.text}</Badge>;
      case "text": return <Text {...scalarProps as TextProps}>{args.text}</Text>;
      case "card": return <Card {...scalarProps as CardProps}>
        <Card.Header><Card.Title>{args.slots?.title}</Card.Title><Card.Description>{args.slots?.description}</Card.Description></Card.Header>
        <Card.Content><Text>{args.slots?.content}</Text></Card.Content>
        <Card.Footer><Button type="button" onClick={() => setActions(count => count + 1)}>{args.slots?.action}</Button></Card.Footer>
      </Card>;
    }
  };
  const renderField = (field: ComponentDefaultField) => {
    const value = field.source === "text" ? args.text : field.source === "slots" ? args.slots?.[field.key as ComponentDefaultSlot] : args.props[field.key];
    const controlId = `${id}-${field.source}-${field.key}`;
    const boolean = field.options?.every(option => typeof option === "boolean");
    return <label key={`${field.source}-${field.key}`} htmlFor={controlId} className={styles.field}>
      <span>{field.label}</span>
      {boolean ? <input id={controlId} type="checkbox" aria-label={`Playground ${field.label}`} checked={!!value} onChange={event => setArgs(current => updatePlaygroundArg(current, field, event.target.checked))} />
        : field.type === "select" ? <select id={controlId} aria-label={`Playground ${field.label}`} value={value === undefined ? "" : String(value)} onChange={event => {
          const next = field.options?.find(option => String(option) === event.target.value);
          if (next !== undefined || event.target.value === "") setArgs(current => updatePlaygroundArg(current, field, next));
        }}>
          <option value="">Component default</option>
          {field.options?.map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
        </select> : <input id={controlId} type="text" aria-label={`Playground ${field.label}`} value={String(value ?? "")} maxLength={field.maxLength} onChange={event => setArgs(current => updatePlaygroundArg(current, field, event.target.value))} />}
    </label>;
  };
  return <section className={styles.playground} data-component-playground={component} hidden={!active} aria-labelledby={`${id}-heading`}>
    <header className={styles.header}><div><h2 id={`${id}-heading`}>Playground</h2><p>One live sample · unsaved args</p></div><button type="button" onClick={reset}>Reset playground</button></header>
    <div className={styles.scroll} data-playground-scroll>
      <div className={styles.preview} data-playground-preview data-theme={mode} style={{ ...toCSSVariables(system.themes[mode], mode), colorScheme: mode } as CSSProperties}>
        <form key={revision} className={styles.sample} onSubmit={event => event.preventDefault()} onReset={event => { event.preventDefault(); reset(); }}>{sample()}</form>
      </div>
      <output className={styles.status} data-playground-status data-playground-action-count={actions} role="status" aria-live="polite">{`${actions} action${actions === 1 ? "" : "s"}${component === "input" ? ` · Value: ${String(args.props.value ?? "")}` : component === "switch" || component === "checkbox" ? ` · ${args.props.indeterminate ? "Indeterminate" : args.props.checked ? "Checked" : "Unchecked"}` : ""}`}</output>
      <div className={styles.controls} data-playground-controls>{fields.map(renderField)}</div>
      <p className={styles.note}>Changes stay here. Matrix examples and saved styles are unchanged.</p>
            <details className={styles.note}><summary>About this playground</summary><p>Value and Checked edit the live state, not a separate initial value. Reset restores saved sample defaults and clears interactions. Icons use fixed presets; icon-only buttons fall back to Plus. Executable props, render functions, arbitrary JSX, names, styles and callbacks are not edited.</p></details>
    </div>
  </section>;
}
