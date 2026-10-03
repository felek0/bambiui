import type { ComponentProps } from "react";
import { cx } from "../cx";
import { hasAppearanceBox, mergeAppearanceStyle, type AppearanceProps } from "./appearance";
import type { Radius, Size } from "./types";
import styles from "./components.module.css";

export type CardProps = ComponentProps<"article"> & AppearanceProps & {
  /** Surface treatment. Defaults to `outlined`, which uses the card component tokens. */
  variant?: "outlined" | "elevated" | "filled";
  /** Padding and gap density from the shared size scale. Defaults to `md`. */
  size?: Size;
  /** Selects a shared global radius step. Defaults to `md`. */
  radius?: Radius;
};

function CardRoot({
  variant = "outlined",
  size = "md",
  radius,
  className,
  appearance,
  style,
  ...props
}: CardProps) {
  return (
    <article
      {...props}
      style={mergeAppearanceStyle(style, appearance)}
      className={cx(styles.card, className)}
      data-variant={variant}
      data-size={size}
      data-radius={radius}
    />
  );
}

/** Decorative leading symbol. Hidden from assistive technology. */
function CardIcon({ className, appearance, style, ...props }: ComponentProps<"span"> & AppearanceProps) {
  return (
    <span
      aria-hidden="true"
      {...props}
      style={mergeAppearanceStyle(style, appearance)}
      className={cx(styles.cardIcon, className)}
    />
  );
}

/** Groups the title and description. */
function CardHeader({ className, appearance, style, ...props }: ComponentProps<"div"> & AppearanceProps) {
  return <div {...props} style={mergeAppearanceStyle(style, appearance)} className={cx(styles.cardHeader, className)} />;
}

function CardTitle({ className, appearance, style, ...props }: ComponentProps<"strong"> & AppearanceProps) {
  return <strong {...props} style={mergeAppearanceStyle(style, appearance)} data-appearance-box={hasAppearanceBox(appearance) || undefined} className={cx(styles.cardTitle, className)} />;
}

function CardDescription({ className, appearance, style, ...props }: ComponentProps<"p"> & AppearanceProps) {
  return <p {...props} style={mergeAppearanceStyle(style, appearance)} className={cx(styles.cardDescription, className)} />;
}

function CardContent({ className, appearance, style, ...props }: ComponentProps<"div"> & AppearanceProps) {
  return <div {...props} style={mergeAppearanceStyle(style, appearance)} className={cx(styles.cardContent, className)} />;
}

/** Actions or metadata aligned at the end of the card. */
function CardFooter({ className, appearance, style, ...props }: ComponentProps<"div"> & AppearanceProps) {
  return <div {...props} style={mergeAppearanceStyle(style, appearance)} className={cx(styles.cardFooter, className)} />;
}

export const Card = Object.assign(CardRoot, {
  Icon: CardIcon,
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
});
