import type { AppearanceField } from "./components/appearance";
import { appearanceFieldHint } from "./appearance-field-ui";
import styles from "./composer/inspector.module.css";

/** Native, read-only disclosure: keyboard-accessible full values without a write callback. */
export function AppearanceFieldHelp({ id, label, field, current }: { id: string; label: string; field: AppearanceField; current: string }) {
  return <>
    <span id={`${id}-hint`} className={styles.fieldHint}>{appearanceFieldHint(field)}</span>
    <details className={styles.fieldInfo} data-appearance-help={field.key}>
      <summary aria-label={`Value and limits for ${label}`} title={`Value and limits for ${label}`}>ⓘ</summary>
      <div className={styles.fieldInfoBody}>
        <strong>Current value</strong>
        <code data-appearance-full-value>{current || "Not rendered"}</code>
        <p>{appearanceFieldHint(field)}</p>
      </div>
    </details>
  </>;
}
