import type { ReactNode } from "react";
import { Field } from "@base-ui/react/field";
import { Input as BaseInput } from "@base-ui/react/input";
import { cx } from "../cx";
import { FieldRoot, labelClassName, type FieldProps } from "./field";
import styles from "./components.module.css";

export type InputProps = Omit<BaseInput.Props, "className" | "size" | "type"> &
  FieldProps & {
    /** Native input type. Defaults to `text`. */
    type?: "text" | "email" | "password" | "number" | "search" | "tel" | "url";
    /** Decorative icon inside the field, before the value. */
    startIcon?: ReactNode;
    /** Decorative icon inside the field, after the value. */
    endIcon?: ReactNode;
  };

export function Input({
  label,
  hideLabel,
  description,
  error,
  size,
  radius,
  className,
  type = "text",
  startIcon,
  endIcon,
  disabled,
  ...props
}: InputProps) {
  return (
    <FieldRoot
      kind="text"
      size={size}
      radius={radius}
      disabled={disabled}
      description={description}
      error={error}
      className={className}
    >
      <Field.Label className={cx(styles.label, labelClassName(hideLabel))}>
        {label}
      </Field.Label>
      <div className={styles.inputControl}>
        {startIcon && (
          <span className={styles.adornment} aria-hidden="true">
            {startIcon}
          </span>
        )}
        <BaseInput
          {...props}
          type={type}
          disabled={disabled}
          className={styles.input}
        />
        {endIcon && (
          <span className={styles.adornment} aria-hidden="true">
            {endIcon}
          </span>
        )}
      </div>
    </FieldRoot>
  );
}
