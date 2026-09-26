import type { ComponentId, ThemeTokens } from "./tokens";
import type { PaletteMode } from "./color-engine";
import { resolveComponent, toCSSVariables } from "./tokens.ts";
import { contrastRatio } from "./color-engine.ts";

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
    if (resolveComponent(theme, component).borderWidth <= 0) return;
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

  const button = resolveComponent(theme, "button");
  add("button.foreground", "Button resolved text on background", button.foreground, button.background, 4.5, "button");
  boundary("button", "button.boundary", "Button primary border", button.border);
  for (const [variant, ink, fill, prefix, stroke] of [
    ["primary", button.foreground, button.background, "--button", button.border],
    ["secondary", g.onSecondary, g.secondary, "--ds-secondary", g.secondary],
    ["destructive", g.onDanger, g.danger, "--ds-danger", g.danger],
  ]) {
    add(`button.${variant}.text`, `Button ${variant} text`, ink, fill, 4.5, "button");
    for (const state of ["hover", "active"]) {
      add(`button.${variant}.${state}`, `Button ${variant} ${state} text`, ink, v[`${prefix}-${state}`], 4.5, "button");
    }
    if (variant !== "primary") boundary("button", `button.${variant}.boundary`, `Button ${variant} border (all states)`, stroke);
  }
  for (const variant of ["outline", "ghost", "link"]) {
    const ink = variant === "link" ? v["--ds-primary-on-subtle"] : g.foreground;
    add(`button.${variant}.text`, `Button ${variant} text on global surface`, ink, g.background, 4.5, "button");
    for (const state of ["hover", "active"]) {
      add(`button.${variant}.${state}`, `Button ${variant} ${state} text`, ink, variant === "link" ? g.background : g.muted, 4.5, "button");
    }
  }
  boundary("button", "button.outline.boundary", "Button outline border", g.border);
  boundary("button", "button.outline.hover.boundary", "Button outline hover/active border", g.border, g.muted);

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
  add("card.foreground", "Card outlined/elevated text", card.foreground, card.background, 4.5, "card");
  add("card.description", "Card outlined/elevated description", v["--card-description"], card.background, 4.5, "card");
  add("card.filled.text", "Filled card global text on muted", g.foreground, g.muted, 4.5, "card");
  add("card.filled.description", "Filled card description on muted", v["--card-filled-description"], g.muted, 4.5, "card");
  boundary("card", "card.boundary", "Card outlined border", card.border, card.background);

  const badge = resolveComponent(theme, "badge");
  // Neutral solid reverses the component ink/surface; its ratio is symmetric.
  add("badge.foreground", "Badge neutral solid text", badge.background, badge.foreground, 4.5, "badge");
  for (const tone of ["neutral", "primary", "success", "warning", "danger", "info"] as const) {
    const role = roles.find(([name]) => name === tone);
    const fill = role ? g[role[0]] : badge.foreground;
    const onFill = role ? g[role[1]] : badge.background;
    const ink = v[`--badge-${tone}-on-subtle`];
    add(`badge.${tone}.solid`, `Badge ${tone} solid text`, onFill, fill, 4.5, "badge");
    add(`badge.${tone}.subtle`, `Badge ${tone} subtle text`, ink, v[`--badge-${tone}-subtle`], 4.5, "badge");
    add(`badge.${tone}.outline`, `Badge ${tone} outline text on badge background`, ink, badge.background, 4.5, "badge");
    boundary("badge", `badge.${tone}.solid.boundary`, `Badge ${tone} solid border`, fill);
    boundary("badge", `badge.${tone}.outline.boundary`, `Badge ${tone} outline border`, v[`--badge-${tone}-outline`], badge.background);
  }
  return checks;
}
