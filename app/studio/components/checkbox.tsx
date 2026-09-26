"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import { Icon } from "../icons";
import { FieldRoot, labelClassName, type FieldProps } from "./field";
import styles from "./components.module.css";

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
  size,
  className,
  labelPosition = "end",
  disabled,
  ...props
}: CheckboxProps) {
  return (
    <FieldRoot
      kind="choice"
      size={size}
      disabled={disabled}
      description={description}
      error={error}
      className={className}
    >
      <Field.Label
        className={styles.choice}
        data-label-position={labelPosition}
      >
        <BaseCheckbox.Root
          {...props}
          disabled={disabled}
          className={styles.checkbox}
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
        <span className={labelClassName(hideLabel)}>{label}</span>
      </Field.Label>
    </FieldRoot>
  );
}
