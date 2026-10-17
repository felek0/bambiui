import type { KeyboardEvent, ReactNode } from "react";
import { rovingIndex } from "./tool-scope";
import styles from "./tool-status.module.css";

/** Arrow/Home/End move focus between a toolbar's own buttons; panels and inputs inside keep their keys. */
export function toolbarKeyDown(event: KeyboardEvent<HTMLElement>) {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(":scope > button:not(:disabled)")];
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  const next = rovingIndex(event.key, index, buttons.length);
  if (next === null) return;
  event.preventDefault();
  buttons[next].focus();
}

/** One status line under the selected specimen: active tool, real write scope, hint and group reset. */
export function ToolStatus({ tool, scope, hint, hintId, reset, children }: {
  tool: string; scope?: string; hint?: string; hintId?: string; children?: ReactNode;
  reset?: { label: string; enabled: boolean; onReset: () => void };
}) {
  return <div className={styles.status} data-tool-status={tool} data-system-context-change="tool-status">
    <strong>{tool}</strong>
    {scope && <span data-tool-scope>{scope}</span>}
    {hint && <span id={hintId} className={styles.hint} data-tool-hint>{hint}</span>}
    {children}
    {reset && <button type="button" disabled={!reset.enabled} title={reset.enabled ? `Remove ${reset.label.toLowerCase()} overrides in this group` : "No override to reset"} onClick={reset.onReset}>Reset {reset.label.toLowerCase()}</button>}
  </div>;
}
