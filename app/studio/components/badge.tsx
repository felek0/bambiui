import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";
import type { AppearanceProps } from "./appearance";
import { componentRecipeKey } from "./recipes";
import { componentRecipeMarkers, mergeRecipeStyle } from "./recipe-runtime";
import type { Radius, Size, Tone } from "./types";
import styles from "./components.module.css";

export type BadgeProps = ComponentProps<"span"> & AppearanceProps & {
  /** Fill style. Defaults to `outline`, which uses the badge component tokens. */
  variant?: "solid" | "subtle" | "outline";
  /** Semantic color role. Defaults to `neutral`. */
  tone?: Tone;
  /** Defaults to `md`. */
  size?: Size;
  /** Selects a shared global radius step. Defaults to `md`. */
  radius?: Radius;
  /** Shows a leading status dot. */
  dot?: boolean;
  /** Decorative icon before the label. */
  startIcon?: ReactNode;
};

export function Badge({
  variant = "outline",
  tone = "neutral",
  size = "md",
  radius,
  dot = false,
  startIcon,
  className,
  children,
  appearance,
  style,
  ...props
}: BadgeProps) {
  const recipe = componentRecipeKey("badge", { variant, size, tone });
  return (
    <span
      {...props}
      style={mergeRecipeStyle("badge", recipe, style, appearance)}
      {...componentRecipeMarkers("badge", "root")}
      data-component-recipe={recipe}
      className={cx(styles.badge, className)}
      data-variant={variant}
      data-tone={tone}
      data-size={size}
      data-radius={radius}
    >
      {dot && <span className={styles.badgeDot} aria-hidden="true" />}
      {startIcon && (
        <span className={styles.decorativeIcon} aria-hidden="true">{startIcon}</span>
      )}
      <span {...componentRecipeMarkers("badge", "text")} className={cx(styles.badgeContent, appearance?.textAlign && styles.alignedContent)}>{children}</span>
    </span>
  );
}
