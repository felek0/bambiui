import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../cx";
import { hasAppearanceBox, type AppearanceProps } from "./appearance";
import { componentRecipeKey } from "./recipes";
import { componentRecipeMarkers, mergeRecipeStyle } from "./recipe-runtime";
import type { Size, Tone } from "./types";
import styles from "./components.module.css";

type TextElement = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
export type TextVariant = "heading" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "paragraph" | "label" | "caption";

export type TextProps<T extends TextElement = "p"> = Omit<ComponentPropsWithoutRef<T>, "as" | "size"> & AppearanceProps & {
  /** Typography style, independent of the rendered element. Defaults to `paragraph`. */
  variant?: TextVariant;
  /** Defaults to `md`. */
  size?: Size;
  /** Semantic text color. Defaults to `neutral`. */
  tone?: Tone;
  /** Native element. Defaults to the matching heading for `h1`–`h6`, `h2` for `heading`, `p` for `paragraph`, and `span` otherwise. */
  as?: T;
};

export function Text<T extends TextElement = "p">({
  as,
  variant = "paragraph",
  size = "md",
  tone = "neutral",
  className,
  appearance,
  style,
  ...props
}: TextProps<T>) {
  const recipe = componentRecipeKey("text", { variant, size, tone });
  const Element: TextElement = as ?? (variant === "heading" ? "h2" : /^h[1-6]$/.test(variant) ? variant as TextElement : variant === "paragraph" ? "p" : "span");

  return (
    <Element
      {...props}
      style={mergeRecipeStyle("text", recipe, style, appearance)}
      {...componentRecipeMarkers("text", "root")}
      data-component-recipe={recipe}
      data-appearance-box={hasAppearanceBox(appearance) || undefined}
      className={cx(styles.text, className)}
      data-variant={variant}
      data-size={size}
      data-tone={tone}
    />
  );
}
