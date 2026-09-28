import type { ReactNode } from "react";
import Link from "next/link";
import { Button as BaseButton } from "@base-ui/react/button";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cx } from "./cx";

/*
 * Studio chrome primitives. These use the fixed `--studio-*` tokens in
 * globals.css and are intentionally independent of the user's design system.
 */

type ButtonBaseProps = Omit<BaseButton.Props, "className"> & {
  /** Visual hierarchy: one `primary` action per region, `ghost` for low-emphasis actions. */
  variant?: "primary" | "secondary" | "ghost";
  startIcon?: ReactNode;
  fullWidth?: boolean;
  className?: string;
};

export type ButtonProps = ButtonBaseProps &
  (
    | { iconOnly?: false }
    /** Icon-only buttons have no visible text, so an accessible name is required. */
    | { iconOnly: true; "aria-label": string }
  );

export function Button({
  variant = "secondary",
  iconOnly = false,
  fullWidth = false,
  startIcon,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={cx("studio-button", className)}
      data-variant={variant}
      data-icon-only={iconOnly || undefined}
      data-full-width={fullWidth || undefined}
    >
      {startIcon}
      {iconOnly ? children : <span data-slot="label">{children}</span>}
    </BaseButton>
  );
}

/** Single-select group of toggle buttons with roving focus (WAI-ARIA toolbar/toggle pattern). */
export function SegmentedControl<Value extends string>({
  value,
  onValueChange,
  className,
  children,
  ...props
}: {
  value: Value;
  onValueChange: (value: Value) => void;
  "aria-label": string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ToggleGroup
      {...props}
      className={cx("segmented", className)}
      value={[value]}
      onValueChange={(next) => {
        // Keep exactly one item pressed: ignore attempts to unpress the current one.
        if (next.length > 0) onValueChange(next[0] as Value);
      }}
    >
      {children}
    </ToggleGroup>
  );
}

SegmentedControl.Item = function SegmentedControlItem(
  props: Omit<Toggle.Props, "className" | "pressed" | "defaultPressed"> & {
    value: string;
  },
) {
  return <Toggle {...props} className="segmented-item" />;
};

/** Sidebar navigation entry. `current` marks the item for the visible view. */
export function NavItem({
  icon,
  current = false,
  ariaLabel,
  end,
  children,
  href,
}: {
  icon: ReactNode;
  current?: boolean;
  ariaLabel?: string;
  end?: ReactNode;
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="nav-item"
      aria-current={current ? "page" : undefined}
      aria-label={ariaLabel}
      href={href}
    >
      {icon}
      {children}
      {end}
    </Link>
  );
}
