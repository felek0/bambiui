"use client";

import { useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Card, Checkbox, Input, Switch, Text, type BadgeProps, type ButtonProps, type CardProps, type CheckboxProps, type InputProps, type SwitchProps, type TextProps } from "./components";
import type { PaletteMode } from "./color-engine";
import { toCSSVariables, type ComponentId, type DesignSystem } from "./tokens";
import type { ComponentDefaultField, ComponentDefaultSlot } from "./component-defaults";
import { groupPlaygroundFields, playgroundArgs, playgroundFields, updatePlaygroundArg } from "./component-playground-model";
import styles from "./component-playground.module.css";

function PresetIcon({ preset }: { preset: unknown }) {
  if (!preset || preset === "none") return null;
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {preset === "plus" ? <path d="M12 5v14M5 12h14" /> : preset === "check" ? <path d="m5 12 4 4L19 6" /> : preset === "warning" ? <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v4m0 4h.01" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>}
  </svg>;
}

/** Ephemeral args only. The parent owns identity remounts, never recipe selection. */
export function ComponentPlayground({ component, system, mode, active = true, controlsTarget }: {
  component: ComponentId; system: DesignSystem; mode: PaletteMode; active?: boolean; controlsTarget?: HTMLElement | null;
}) {
  const [args, setArgs] = useState(() => playgroundArgs(component, system.componentDefaults));
  const [actions, setActions] = useState(0);
  const [revision, setRevision] = useState(0);
  const id = useId();
  const groups = groupPlaygroundFields(playgroundFields(component));
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
    const multiline = field.type === "text" && (field.source === "text" && component === "text" || ["description", "content", "error"].includes(field.key));
    return <label key={`${field.source}-${field.key}`} htmlFor={controlId} className={`${styles.field} ${boolean ? styles.booleanField : field.type === "text" ? styles.wideField : ""}`}>
      <span>{field.label}</span>
      {boolean ? <input id={controlId} type="checkbox" aria-label={`Playground ${field.label}`} checked={!!value} onChange={event => setArgs(current => updatePlaygroundArg(current, field, event.target.checked))} />
        : field.type === "select" ? <select id={controlId} aria-label={`Playground ${field.label}`} value={value === undefined ? "" : String(value)} onChange={event => {
          const next = field.options?.find(option => String(option) === event.target.value);
          if (next !== undefined || event.target.value === "") setArgs(current => updatePlaygroundArg(current, field, next));
        }}>
          <option value="">Component default</option>
          {field.options?.map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
        </select> : multiline ? <textarea id={controlId} aria-label={`Playground ${field.label}`} rows={3} value={String(value ?? "")} maxLength={field.maxLength} onChange={event => setArgs(current => updatePlaygroundArg(current, field, event.target.value))} />
          : <input id={controlId} type="text" aria-label={`Playground ${field.label}`} value={String(value ?? "")} maxLength={field.maxLength} onChange={event => setArgs(current => updatePlaygroundArg(current, field, event.target.value))} />}
    </label>;
  };
  // A portal does not inherit the workbench's hidden attribute or its studio chrome styles.
  const controls = <section className={styles.controls} data-playground-controls data-playground-controls-for={component} hidden={!active} role="region" aria-labelledby={`${id}-props-heading`} aria-describedby={`${id}-props-note`}>
    <header className={styles.controlsHeader}>
      <div><h3 id={`${id}-props-heading`}>Playground props</h3><p id={`${id}-props-note`}>Not saved to your system.</p></div>
      <button className={styles.reset} type="button" onClick={reset}>Reset playground</button>
    </header>
    {groups.map(group => <details key={group.id} className={styles.group} data-playground-group={group.id} open={group.defaultOpen}>
      <summary id={`${id}-group-${group.id}`}>{group.label}</summary>
      <fieldset className={styles.groupFields} aria-labelledby={`${id}-group-${group.id}`}>{group.fields.map(renderField)}</fieldset>
    </details>)}
    <details className={styles.help}>
      <summary>About this playground</summary>
      <p>Changes affect only this sample, not Variants or saved styles. Value and Checked update the live state. Reset restores the latest saved defaults and clears interactions.</p>
      <p>Icons use presets; icon-only buttons fall back to Plus. Custom JSX, names, styles and callbacks are not editable here.</p>
    </details>
  </section>;
  return <section className={styles.playground} data-component-playground={component} hidden={!active} aria-labelledby={`${id}-heading`}>
    <header className={styles.header}><h2 id={`${id}-heading`}>Playground</h2><p>Preview only · not exported</p></header>
    <div className={styles.scroll} data-playground-scroll>
      <div className={styles.workbench}>
        <div className={styles.preview} data-playground-preview data-theme={mode} style={{ ...toCSSVariables(system.themes[mode], mode), colorScheme: mode } as CSSProperties}>
          <form key={revision} className={styles.sample} onSubmit={event => event.preventDefault()} onReset={event => { event.preventDefault(); reset(); }}>{sample()}</form>
        </div>
        <output className={styles.status} data-playground-status data-playground-action-count={actions} role="status" aria-live="polite">{`${actions} action${actions === 1 ? "" : "s"}${component === "input" ? ` · Value: ${String(args.props.value ?? "")}` : component === "switch" || component === "checkbox" ? ` · ${args.props.indeterminate ? "Indeterminate" : args.props.checked ? "Checked" : "Unchecked"}` : ""}`}</output>
      </div>
      {controlsTarget ? createPortal(controls, controlsTarget) : controls}
    </div>
  </section>;
}
