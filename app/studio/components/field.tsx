import type { ReactNode } from "react";
import { Field } from "@base-ui/react/field";
import { cx } from "../cx";
import type { Radius, Size } from "./types";
import styles from "./components.module.css";

/** Props shared by every labelled form control (Input, Switch, Checkbox). */
export type FieldProps = {
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
  size = "md",
  radius,
  disabled,
  description,
  error,
  className,
  children,
}: Pick<FieldProps, "size" | "radius" | "description" | "error" | "className"> & {
  kind: "text" | "choice";
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Field.Root
      className={cx(styles.field, className)}
      data-kind={kind}
      data-size={size}
      data-radius={radius}
      disabled={disabled}
      // Leave native constraint validation in charge unless an error is supplied.
      invalid={error ? true : undefined}
    >
      {children}
      {description && (
        <Field.Description className={styles.description}>
          {description}
        </Field.Description>
      )}
      {error && (
        <Field.Error match className={styles.error}>
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}

export const labelClassName = (hideLabel?: boolean) =>
  hideLabel ? "sr-only" : undefined;
