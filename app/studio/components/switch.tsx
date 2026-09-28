import { Field } from "@base-ui/react/field";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { FieldRoot, labelClassName, type FieldProps } from "./field";
import styles from "./components.module.css";

export type SwitchProps = Omit<
  BaseSwitch.Root.Props,
  "className" | "children"
> &
  Omit<FieldProps, "radius"> & {
    /** Side of the control the label sits on. Defaults to `end`. */
    labelPosition?: "start" | "end";
  };

export function Switch({
  label,
  hideLabel,
  description,
  error,
  size,
  className,
  labelPosition = "end",
  disabled,
  ...props
}: SwitchProps) {
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
        <BaseSwitch.Root
          {...props}
          disabled={disabled}
          className={styles.switch}
        >
          <BaseSwitch.Thumb className={styles.thumb} />
        </BaseSwitch.Root>
        <span className={labelClassName(hideLabel)}>{label}</span>
      </Field.Label>
    </FieldRoot>
  );
}
