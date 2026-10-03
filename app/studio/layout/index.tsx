import type { ComponentProps } from "react";
import { cx } from "../cx";
import { mergeAppearanceStyle, type AppearanceProps } from "../components/appearance";
import styles from "./layout.module.css";

export type SpacingStep = "sm" | "md" | "lg";

type LayoutProps = ComponentProps<"div"> & AppearanceProps;

type AutoLayoutProps = {
  direction?: "row" | "column";
  gap?: SpacingStep;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
};

export type ContainerProps = LayoutProps & AutoLayoutProps & {
  maxWidth?: "narrow" | "wide" | "full";
};

/** Omitted direction preserves block flow; other layout settings are dormant until opted in. */
export function Container({ maxWidth = "wide", direction, gap = "md", align = "stretch", justify = "start", wrap = false, className, appearance, style, ...props }: ContainerProps) {
  return (
    <div
      {...props}
      style={mergeAppearanceStyle(style, appearance)}
      className={cx(styles.container, className)}
      data-max-width={maxWidth}
      data-direction={direction}
      data-gap={direction ? gap : undefined}
      data-align={direction ? align : undefined}
      data-justify={direction ? justify : undefined}
      data-wrap={direction && wrap || undefined}
    />
  );
}

export type StackProps = LayoutProps & AutoLayoutProps;

export function Stack({ direction = "column", gap = "md", align = "stretch", justify = "start", wrap = false, className, appearance, style, ...props }: StackProps) {
  return <div {...props} style={mergeAppearanceStyle(style, appearance)} className={cx(styles.stack, className)} data-direction={direction} data-gap={gap} data-align={align} data-justify={justify} data-wrap={wrap || undefined} />;
}

export type GridProps = LayoutProps & {
  columns?: 1 | 2 | 3;
  gap?: SpacingStep;
};

function GridRoot({ columns = 2, gap = "md", className, appearance, style, ...props }: GridProps) {
  return <div className={styles.gridContainer}><div {...props} style={mergeAppearanceStyle(style, appearance)} className={cx(styles.grid, className)} data-columns={columns} data-gap={gap} /></div>;
}

export type GridItemProps = LayoutProps & {
  span?: 1 | 2 | 3;
};

function GridItem({ span = 1, className, appearance, style, ...props }: GridItemProps) {
  return <div {...props} style={mergeAppearanceStyle(style, appearance)} className={cx(styles.gridItem, className)} data-span={span} />;
}

export const Grid = Object.assign(GridRoot, { Item: GridItem });
