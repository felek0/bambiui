import type { ComponentProps } from "react";
import { cx } from "../cx";
import type { Radius, Size } from "./types";
import styles from "./components.module.css";

export type CardProps = ComponentProps<"article"> & {
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
  ...props
}: CardProps) {
  return (
    <article
      {...props}
      className={cx(styles.card, className)}
      data-variant={variant}
      data-size={size}
      data-radius={radius}
    />
  );
}

/** Decorative leading symbol. Hidden from assistive technology. */
function CardIcon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      {...props}
      className={cx(styles.cardIcon, className)}
    />
  );
}

/** Groups the title and description. */
function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx(styles.cardHeader, className)} />;
}

function CardTitle({ className, ...props }: ComponentProps<"strong">) {
  return <strong {...props} className={cx(styles.cardTitle, className)} />;
}

function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p {...props} className={cx(styles.cardDescription, className)} />;
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx(styles.cardContent, className)} />;
}

/** Actions or metadata aligned at the end of the card. */
function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx(styles.cardFooter, className)} />;
}

export const Card = Object.assign(CardRoot, {
  Icon: CardIcon,
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
});
