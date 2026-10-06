import type { ReactNode } from "react";
import { Field } from "@base-ui/react/field";
import { cx } from "../cx";
import type { Radius, Size } from "./types";
import styles from "./components.module.css";
import { appearanceToStyle, type AppearanceProps, type NodeParts } from "./appearance";
import { componentRecipeMarkers, fieldRecipeStyle } from "./recipe-runtime";

export type ErrorPosition = "below" | "above";
export type ErrorIcon = "none" | "info" | "warning";

/** Props shared by every labelled form control (Input, Switch, Checkbox). */
export type FieldProps = AppearanceProps & {
  /** Independently styles the field layout, label, control, description and error. */
  parts?: NodeParts;
  /** Stable document identity; retained on the native/interactive control and mirrored as its field owner. */
  "data-page-node"?: string;
  /** Error before the label/control group or after the description. Defaults to `below`. */
  errorPosition?: ErrorPosition;
  /** Fixed decorative glyph; defaults to `none`. */
  errorIcon?: ErrorIcon;
  /** Visible label. Also provides the control's accessible name. */
  label: ReactNode;
  /** Visually hides the label while keeping it available to assistive technology. */
  hideLabel?: boolean;
  /** Helper text linked to the control with `aria-describedby`. */
  description?: ReactNode;
  /** Error message. When set, the field is marked invalid and the message is announced. */
  error?: ReactNode;
  /** Defaults to `md`. */
  size?: Size;
  /** Selects a shared global radius step. Defaults to `md`; omit to retain a legacy numeric component radius override. */
  radius?: Radius;
  className?: string;
};

/**
 * Base UI Field wrapper that wires label, description and error to the control
 * and exposes `data-disabled` / `data-invalid` for styling.
 */
export function FieldRoot({
  kind,
  component,
  size = "md",
  radius,
  disabled,
  description,
  error,
  errorPosition = "below",
  errorIcon = "none",
  parts,
  pageOwner,
  className,
  children,
}: Pick<FieldProps, "size" | "radius" | "description" | "error" | "errorPosition" | "errorIcon" | "parts" | "className"> & {
  kind: "text" | "choice";
  component: "input" | "switch" | "checkbox";
  pageOwner?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const message = error && (
    <Field.Error match {...componentRecipeMarkers(component, "error")} data-appearance-part="error" className={styles.error} style={appearanceToStyle(parts?.error)} data-error-icon={errorIcon === "none" ? undefined : errorIcon}>
      {errorIcon !== "none" && (
        <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          {errorIcon === "info" ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></> : <path d="M12 3 2 21h20L12 3z M12 9v5m0 3v1" />}
        </svg>
      )}
      {error}
    </Field.Error>
  );
  return (
    <Field.Root
      className={cx(styles.field, className)}
      style={{ ...fieldRecipeStyle(component, size), ...appearanceToStyle(parts?.root) }}
      {...componentRecipeMarkers(component, "root")}
      data-appearance-part="root"
      data-page-owner={pageOwner}
      data-kind={kind}
      data-component={component}
      data-size={size}
      data-radius={radius}
      disabled={disabled}
      // Leave native constraint validation in charge unless an error is supplied.
      invalid={error ? true : undefined}
    >
      {errorPosition === "above" && message}
      {children}
      {description && (
        <Field.Description {...componentRecipeMarkers(component, "description")} data-appearance-part="description" className={styles.description} style={appearanceToStyle(parts?.description)}>
          {description}
        </Field.Description>
      )}
      {errorPosition === "below" && message}
    </Field.Root>
  );
}

export const labelClassName = (hideLabel?: boolean) =>
  hideLabel ? "sr-only" : undefined;
