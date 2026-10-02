import type { ComponentProps } from "react";
import { cx } from "../cx";
import styles from "./layout.module.css";

export type SpacingStep = "sm" | "md" | "lg";

type LayoutProps = ComponentProps<"div">;

export type ContainerProps = LayoutProps & {
  maxWidth?: "narrow" | "wide";
};

export function Container({ maxWidth = "wide", className, ...props }: ContainerProps) {
  return <div {...props} className={cx(styles.container, className)} data-max-width={maxWidth} />;
}

export type StackProps = LayoutProps & {
  direction?: "row" | "column";
  gap?: SpacingStep;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
};

export function Stack({ direction = "column", gap = "md", align = "stretch", justify = "start", wrap = false, className, ...props }: StackProps) {
  return <div {...props} className={cx(styles.stack, className)} data-direction={direction} data-gap={gap} data-align={align} data-justify={justify} data-wrap={wrap || undefined} />;
}

export type GridProps = LayoutProps & {
  columns?: 1 | 2 | 3;
  gap?: SpacingStep;
};

function GridRoot({ columns = 2, gap = "md", className, ...props }: GridProps) {
  return <div className={styles.gridContainer}><div {...props} className={cx(styles.grid, className)} data-columns={columns} data-gap={gap} /></div>;
}

export type GridItemProps = LayoutProps & {
  span?: 1 | 2 | 3;
};

function GridItem({ span = 1, className, ...props }: GridItemProps) {
  return <div {...props} className={cx(styles.gridItem, className)} data-span={span} />;
}

export const Grid = Object.assign(GridRoot, { Item: GridItem });
