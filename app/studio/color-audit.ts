import type { ComponentId, ThemeTokens } from "./tokens";
import type { PaletteMode } from "./color-engine";
import { resolveComponent, toCSSVariables } from "./tokens.ts";
import { contrastRatio } from "./color-engine.ts";

export type ColorCheckTarget = { selection: "colors" | ComponentId; key: string; variant?: string; derived?: boolean };

// A check describes rendered colors, which may be derived rather than editable.
// Only return fields that actually influence the checked pair; scale stops do not.
export function colorCheckTargets(check: ContrastCheck): { ink?: ColorCheckTarget; surface?: ColorCheckTarget } {
  const parts = check.id.split(".");
  const id = parts[0];
  const global = (key: string, derived = false): ColorCheckTarget => ({ selection: "colors", key, ...(derived && { derived }) });
  const local = (key: string): ColorCheckTarget => ({ selection: id as ComponentId, key });
  if (id === "global") {
    const key = parts[1] === "primary" && parts[2] === "muted" ? "primary" : parts[1];
    return { ink: global(key, key === "primary"),
      surface: parts[2] && parts[2] in { background: 1, muted: 1, primary: 1, secondary: 1, success: 1, warning: 1, danger: 1, info: 1 } ? global(parts[2]) : undefined };
  }
  const surface = check.label.includes("on global background") || check.label.includes("on global surface") || check.label.includes("on background")
    ? global("background") : undefined;
  if (parts[1] === "focus") return { ink: global("primary", true), surface: global(parts[2]) };
  if (parts[1] === "label") return { ink: global("foreground"), surface };
  if (parts[1] === "description" && id !== "card") return { ink: global("mutedForeground"), surface };
  if (parts[1] === "error") return { ink: global("danger"), surface };
  if (id === "checkbox" || id === "switch") {
    if (parts.includes("invalid")) return { ink: global("danger", true), surface };
    if (parts.includes("unchecked")) return { ink: global(parts[1] === "unchecked" && parts[2] === "thumb" ? "foreground" : "border"), surface };
    return { ink: local(parts[1] === "boundary" ? "border" : "foreground"), surface };
  }
  if (id === "input") {
    if (parts[1] === "invalid") return { ink: global("danger"), surface };
    return { ink: parts.includes("placeholder") ? global("mutedForeground") : local(parts.includes("boundary") ? "border" : "foreground"), surface };
  }
  if (id === "button") {
    const variant = ["primary", "secondary", "outline", "ghost", "destructive", "link"].includes(parts[1]) ? parts[1] : "primary";
    const field = parts.includes("boundary") ? "border" : parts.includes("hover") ? "hoverBackground" : parts.includes("active") ? "activeBackground" : "foreground";
    return { ink: { selection: "button", key: field, variant }, surface };
  }
  if (id === "card") {
    const variant = parts[1] === "filled" ? "filled" : parts[1] === "elevated" ? "elevated" : "outlined";
    return { ink: { selection: "card", key: parts.includes("boundary") ? "border" : parts.includes("description") ? "foreground" : "foreground", variant }, surface };
  }
  if (id === "text") return { ink: parts[1] === "foreground" ? local("foreground") : global(parts[1], true), surface };
  if (id === "badge") {
    const tone = ["primary", "success", "warning", "danger", "info"].includes(parts[1]) ? parts[1] : "neutral";
    const variant = ["solid", "subtle", "outline"].includes(parts[2]) ? parts[2] : "outline";
    return { ink: { selection: "badge", key: parts.includes("boundary") ? "border" : "foreground", variant: `${variant}.${tone}` }, surface };
  }
  return { surface };
}

export type ContrastCheck = {
  id: string;
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
  passes: boolean;
  component?: ComponentId;
};

const roles = [
  ["primary", "onPrimary"], ["secondary", "onSecondary"],
  ["success", "onSuccess"], ["warning", "onWarning"],
  ["danger", "onDanger"], ["info", "onInfo"],
] as const;

/**
 * Finite current-CSS diagnostics, not accessibility certification. Models opaque
 * #rrggbb tokens, normal text (4.5), marks and rendered boundaries (3). Components
 * sit on the global background; offset focus rings also cover muted surroundings.
 * Disabled states, custom/nested surfaces, shadows and focus geometry are excluded.
 * Identical painted pairs shared by states are checked once. Filled controls need
 * an outer edge, not contrast between their border and their own solid fill;
 * unfilled controls additionally check the border against their interior surface.
 * Zero-width and transparent borders are omitted, not reported as compliant.
 */
export function auditSystemColors(theme: ThemeTokens, mode: PaletteMode = "light"): ContrastCheck[] {
  const g = theme.global;
  const v = toCSSVariables(theme, mode);
  const checks: ContrastCheck[] = [];
  function add(id: string, label: string, foreground: string, background: string,
    minimum = 4.5, component?: ComponentId) {
    const ratio = contrastRatio(foreground, background);
    checks.push({ id, label, foreground, background, ratio, minimum,
      passes: ratio >= minimum, ...(component ? { component } : {}) });
  }
  function boundary(component: ComponentId, id: string, label: string, stroke: string, inside?: string) {
    if (resolveComponent(theme, component).borderWidth <= 0 || stroke === "transparent") return;
    add(id, `${label} on global background`, stroke, g.background, 3, component);
    if (inside !== undefined) add(`${id}.inside`, `${label} on interior surface`, stroke, inside, 3, component);
  }

  for (const surface of ["background", "muted"] as const) {
    for (const ink of ["foreground", "mutedForeground"] as const) {
      add(`global.${ink}.${surface}`, `${ink} on ${surface}`, g[ink], g[surface]);
    }
    if (g.borderWidth > 0) add(`global.border.${surface}`, `Global border on ${surface}`, g.border, g[surface], 3);
  }
  for (const [role, onRole] of roles) {
    add(`global.${onRole}.${role}`, `${onRole} on ${role}`, g[onRole], g[role]);
    add(`global.${role}.background`, `${role} text on background`, role === "primary" ? v["--ds-primary-on-subtle"] : g[role], g.background);
  }
  add("global.primary.muted", "Primary link on muted", v["--ds-primary-on-subtle"], g.muted);

  for (const component of ["button", "input", "switch", "checkbox"] as const) {
    for (const surface of ["background", "muted"] as const) {
      add(`${component}.focus.${surface}`, `${component} offset focus ring on ${surface}`,
        v["--ds-primary-focus"], g[surface], 3, component);
    }
  }
  for (const component of ["input", "switch", "checkbox"] as const) {
    add(`${component}.label`, `${component} label on global surface`, g.foreground, g.background, 4.5, component);
    add(`${component}.description`, `${component} description on global surface`, g.mutedForeground, g.background, 4.5, component);
    add(`${component}.error`, `${component} error on global surface`, g.danger, g.background, 4.5, component);
  }

  for (const variant of ["primary", "secondary", "outline", "ghost", "destructive", "link"] as const) {
    const prefix = `--button-variant-${variant}`;
    const fill = v[`${prefix}-background`] === "transparent" ? g.background : v[`${prefix}-background`];
    const ink = v[`${prefix}-foreground`];
    add(`button.${variant}.text`, `Button ${variant} text`, ink, fill, 4.5, "button");
    for (const state of ["hover", "active"]) {
      const stateFill = v[`${prefix}-${state}-background`] === "transparent" ? g.background : v[`${prefix}-${state}-background`];
      add(`button.${variant}.${state}`, `Button ${variant} ${state} text`, ink, stateFill, 4.5, "button");
    }
    if (variant !== "ghost" && variant !== "link") boundary("button", `button.${variant}.boundary`, `Button ${variant} border`, v[`${prefix}-border`]);
  }

  const input = resolveComponent(theme, "input");
  add("input.foreground", "Input text (normal/hover/active/invalid/focus)", input.foreground, input.background, 4.5, "input");
  add("input.placeholder", "Input placeholder (including invalid/focus)", g.mutedForeground, input.background, 4.5, "input");
  add("input.readonly.text", "Read-only input text on resolved background", input.foreground, input.background, 4.5, "input");
  add("input.readonly.placeholder", "Read-only input placeholder on resolved background", g.mutedForeground, input.background, 4.5, "input");
  boundary("input", "input.boundary", "Input normal/read-only border", input.border, input.background);
  boundary("input", "input.invalid.boundary", "Input invalid border", g.danger, input.background);

  for (const component of ["switch", "checkbox"] as const) {
    const c = resolveComponent(theme, component);
    add(`${component}.foreground`, `${component} checked ${component === "switch" ? "thumb" : "mark (also indeterminate)"} on fill`, c.foreground, c.background, 3, component);
    boundary(component, `${component}.boundary`, `${component} checked border`, c.border);
    boundary(component, `${component}.unchecked.boundary`, `${component} enabled unchecked boundary`, g.border, g.muted);
    boundary(component, `${component}.invalid.boundary`, `${component} invalid checked border`, v["--ds-danger-outline"]);
    boundary(component, `${component}.unchecked.invalid.boundary`, `${component} invalid unchecked border`, v["--ds-danger-outline"], g.muted);
    if (component === "switch") add("switch.unchecked.thumb", "Switch enabled unchecked thumb on track", g.foreground, g.muted, 3, component);
  }

  const text = resolveComponent(theme, "text");
  add("text.foreground", "Text neutral on global surface", text.foreground, g.background, 4.5, "text");
  for (const tone of ["primary", "success", "warning", "danger", "info"] as const) {
    add(`text.${tone}`, `Text ${tone} on global surface`, v[`--ds-${tone}-on-subtle`], g.background, 4.5, "text");
  }

  const card = resolveComponent(theme, "card");
  for (const variant of ["outlined", "elevated", "filled"] as const) {
    const prefix = `--card-variant-${variant}`;
    const background = v[`${prefix}-background`];
    add(`card.${variant}.text`, `Card ${variant} text`, v[`${prefix}-foreground`], background, 4.5, "card");
    add(`card.${variant}.description`, `Card ${variant} description`, v[`${prefix}-description`], background, 4.5, "card");
    if (variant !== "filled") boundary("card", `card.${variant}.boundary`, `Card ${variant} border`, v[`${prefix}-border`], background);
  }
  add("card.foreground", "Card outlined/elevated text", card.foreground, card.background, 4.5, "card");
  add("card.description", "Card outlined/elevated description", v["--card-description"], card.background, 4.5, "card");

  boundary("card", "card.boundary", "Card outlined border", v["--card-variant-outlined-border"], card.background);

  const badge = resolveComponent(theme, "badge");
  add("badge.foreground", "Badge neutral solid text", badge.background, badge.foreground, 4.5, "badge");
  for (const tone of ["neutral", "primary", "success", "warning", "danger", "info"] as const) {
    for (const variant of ["solid", "subtle", "outline"] as const) {
      const prefix = `--badge-variant-${variant}-${tone}`;
      const background = v[`${prefix}-background`] === "transparent" ? g.background : v[`${prefix}-background`];
      const foreground = v[`${prefix}-foreground`];
      add(`badge.${tone}.${variant}`, `Badge ${tone} ${variant} text`, foreground, background, 4.5, "badge");
      if (variant === "solid") boundary("badge", `badge.${tone}.${variant}.boundary`, `Badge ${tone} ${variant} border`, v[`${prefix}-border`]);
      else if (variant === "outline") boundary("badge", `badge.${tone}.${variant}.boundary`, `Badge ${tone} ${variant} border`, v[`${prefix}-border`], background);
    }
  }
  return checks;
}
