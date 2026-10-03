"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import { Icon } from "../icons";
import { FieldRoot, labelClassName, type FieldProps } from "./field";
import styles from "./components.module.css";
import { appearanceToStyle, mergeAppearanceStyle } from "./appearance";

export type CheckboxProps = Omit<
  BaseCheckbox.Root.Props,
  "className" | "children"
> &
  FieldProps & {
    /** Side of the control the label sits on. Defaults to `end`. */
    labelPosition?: "start" | "end";
  };

export function Checkbox({
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
  labelPosition = "end",
  disabled,
  ...props
}: CheckboxProps) {
  return (
    <FieldRoot
      kind="choice"
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
      <Field.Label
        data-appearance-part="row"
        className={styles.choice}
        style={appearanceToStyle(parts?.row)}
        data-label-position={labelPosition}
      >
        <BaseCheckbox.Root
          {...props}
          data-appearance-part="control"
          disabled={disabled}
          className={styles.checkbox}
          style={mergeAppearanceStyle(style, appearance || parts?.control ? { ...appearance, ...parts?.control } : undefined)}
        >
          <BaseCheckbox.Indicator
            className={styles.indicator}
            render={(indicatorProps, state) => (
              <span {...indicatorProps}>
                <Icon name={state.indeterminate ? "minus" : "check"} />
              </span>
            )}
          />
        </BaseCheckbox.Root>
        <span data-appearance-part="label" className={labelClassName(hideLabel)} style={hideLabel ? undefined : appearanceToStyle(parts?.label)}>
          {hideLabel && parts?.label ? <span style={appearanceToStyle(parts.label)}>{label}</span> : label}
        </span>
      </Field.Label>
    </FieldRoot>
  );
}
