import { Field } from "@base-ui/react/field";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { FieldRoot, labelClassName, type FieldProps } from "./field";
import styles from "./components.module.css";
import { appearanceToStyle, hasAppearanceBox, mergeAppearanceStyle } from "./appearance";
import { componentRecipeMarkers } from "./recipe-runtime";

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
  errorPosition,
  errorIcon,
  appearance,
  parts,
  style,
  size,
  className,
  labelPosition = "end",
  disabled,
  ...props
}: SwitchProps) {
  const control = appearance || parts?.control ? { ...appearance, ...parts?.control } : undefined;
  return (
    <FieldRoot
      kind="choice"
      component="switch"
      pageOwner={props["data-page-node"]}
      size={size}
      disabled={disabled}
      description={description}
      error={error}
      errorPosition={errorPosition}
      errorIcon={errorIcon}
      parts={parts}
      className={className}
    >
      <Field.Label
        {...componentRecipeMarkers("switch", "row")}
        data-appearance-part="row"
        className={styles.choice}
        style={appearanceToStyle(parts?.row)}
        data-label-position={labelPosition}
      >
        <BaseSwitch.Root
          {...props}
          {...componentRecipeMarkers("switch", "control")}
          data-appearance-part="control"
          disabled={disabled}
          className={styles.switch}
          style={mergeAppearanceStyle(style, control)}
          data-local-geometry={hasAppearanceBox(control) || control?.borderWidth !== undefined || undefined}
        >
          <BaseSwitch.Thumb className={styles.thumb} />
        </BaseSwitch.Root>
        <span {...componentRecipeMarkers("switch", "label")} data-appearance-part="label" data-hide-label={hideLabel || undefined} className={labelClassName(hideLabel)} style={hideLabel ? undefined : appearanceToStyle(parts?.label)}>
          {hideLabel && parts?.label ? <span style={appearanceToStyle(parts.label)}>{label}</span> : label}
        </span>
      </Field.Label>
    </FieldRoot>
  );
}
