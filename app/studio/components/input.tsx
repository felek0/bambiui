import type { CSSProperties, ReactNode } from "react";
import { Field } from "@base-ui/react/field";
import { Input as BaseInput } from "@base-ui/react/input";
import { cx } from "../cx";
import { FieldRoot, labelClassName, type FieldProps } from "./field";
import styles from "./components.module.css";
import { appearanceToStyle } from "./appearance";
import { componentRecipeMarkers } from "./recipe-runtime";

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
  errorPosition,
  errorIcon,
  appearance,
  parts,
  style,
  size,
  radius,
  className,
  type = "text",
  startIcon,
  endIcon,
  disabled,
  ...props
}: InputProps) {
  const control = appearance || parts?.control ? { ...appearance, ...parts?.control } : undefined;
  const controlStyle = appearanceToStyle(control);
  // The shell owns edge padding; avoid adding the input's token padding a second time.
  const inputStyle: CSSProperties | undefined = controlStyle ? {
    ...(control?.paddingTop !== undefined ? { paddingTop: 0 } : {}),
    ...(control?.paddingBottom !== undefined ? { paddingBottom: 0 } : {}),
    ...(control?.lineHeight !== undefined ? { lineHeight: control.lineHeight } : {}),
    ...(control?.letterSpacing !== undefined ? { letterSpacing: control.letterSpacing } : {}),
    ...(control?.textAlign !== undefined ? { textAlign: control.textAlign } : {}),
  } : undefined;
  return (
    <FieldRoot
      kind="text"
      component="input"
      pageOwner={props["data-page-node"]}
      size={size}
      radius={radius}
      disabled={disabled}
      description={description}
      error={error}
      errorPosition={errorPosition}
      errorIcon={errorIcon}
      parts={parts}
      className={className}
    >
      <Field.Label {...componentRecipeMarkers("input", "label")} data-appearance-part="label" data-hide-label={hideLabel || undefined} className={cx(styles.label, labelClassName(hideLabel))} style={hideLabel ? undefined : appearanceToStyle(parts?.label)}>
        {hideLabel && parts?.label ? <span style={appearanceToStyle(parts.label)}>{label}</span> : label}
      </Field.Label>
      <div {...componentRecipeMarkers("input", "control")} data-appearance-part="control" className={styles.inputControl} style={controlStyle}>
        {startIcon && (
          <span className={styles.adornment} aria-hidden="true">
            {startIcon}
          </span>
        )}
        <BaseInput
          {...props}
          {...componentRecipeMarkers("input", "control", "text")}
          type={type}
          disabled={disabled}
          className={styles.input}
          style={inputStyle ? typeof style === "function" ? (state) => ({ ...style(state), ...inputStyle }) : { ...style, ...inputStyle } : style}
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
