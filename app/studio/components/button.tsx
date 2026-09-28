import type { ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cx } from "../cx";
import { Spinner } from "./spinner";
import type { Radius, Size } from "./types";
import styles from "./components.module.css";

type ButtonBaseProps = Omit<BaseButton.Props, "className"> & {
  /** Visual hierarchy and intent. Defaults to `primary`. */
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
  /** Height, padding and font size from the shared size scale. Defaults to `md`. */
  size?: Size;
  /** Selects a shared global radius step. Defaults to `md`. */
  radius?: Radius;
  /** Shows a spinner and blocks activation while keeping the button focusable. */
  loading?: boolean;
  /** Stretches the button to the width of its container. */
  fullWidth?: boolean;
  /** Icon rendered before the label. Replaced by the spinner while loading. */
  startIcon?: ReactNode;
  /** Icon rendered after the label. */
  endIcon?: ReactNode;
  className?: string;
};

export type ButtonProps = ButtonBaseProps &
  (
    | { iconOnly?: false }
    /** Square button whose only child is an icon; an accessible name is required. */
    | { iconOnly: true; "aria-label": string }
  );

export function Button({
  variant = "primary",
  size = "md",
  radius,
  loading = false,
  fullWidth = false,
  iconOnly = false,
  disabled = false,
  startIcon,
  endIcon,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={cx(styles.button, className)}
      disabled={disabled || loading}
      // Keep focus on the button when it enters the loading state after activation.
      focusableWhenDisabled={loading || props.focusableWhenDisabled}
      aria-busy={loading || undefined}
      data-variant={variant}
      data-size={size}
      data-radius={radius}
      data-loading={loading || undefined}
      data-icon-only={iconOnly || undefined}
      data-full-width={fullWidth || undefined}
    >
      {loading ? <Spinner /> : startIcon && (
              <span className={styles.decorativeIcon} aria-hidden="true">{startIcon}</span>
            )}
      {iconOnly && loading ? null : children}
      {!iconOnly && endIcon && (
              <span className={styles.decorativeIcon} aria-hidden="true">{endIcon}</span>
            )}
    </BaseButton>
  );
}
