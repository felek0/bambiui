import type { ComponentId, ThemeTokens } from "./tokens";
import type { PaletteMode } from "./color-engine";
import { resolveComponent, toCSSVariables } from "./tokens.ts";
import { contrastRatio } from "./color-engine.ts";
import type { ComponentStylePart } from "./component-styles.ts";

export type ColorCheckTarget = { selection: "colors" | ComponentId; key: string; variant?: string; part?: ComponentStylePart; derived?: boolean };
type CheckTargets = { ink?: ColorCheckTarget; surface?: ColorCheckTarget };
type AuditedColor = { value: string; target: ColorCheckTarget };

// A check describes rendered colors, which may be derived rather than editable.
// Only return fields that actually influence the checked pair; scale stops do not.
export function colorCheckTargets(check: ContrastCheck): CheckTargets {
  const inferred = inferredColorCheckTargets(check);
  return { ink: check.inkTarget ?? inferred.ink, surface: check.surfaceTarget ?? inferred.surface };
}

function inferredColorCheckTargets(check: ContrastCheck): CheckTargets {
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
    const unchecked = parts.some((part) => part.includes("unchecked"));
    const invalid = parts.includes("invalid") || parts.some((part) => part.startsWith("invalid-"));
    const variant = invalid ? unchecked ? "invalidUnchecked" : "invalidChecked" : unchecked ? "unchecked" : "checked";
    return { ink: { selection: id as ComponentId, key: parts.includes("boundary") ? "border" : "foreground", variant }, surface };
  }
  if (id === "input") {
    if (parts.includes("placeholder")) return { ink: global("mutedForeground"), surface };
    const variant = ["default", "hover", "invalid", "readonly"].includes(parts[1]) ? parts[1] : "default";
    return { ink: { selection: "input", key: parts.includes("boundary") ? "border" : "foreground", variant }, surface };
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
  inkTarget?: ColorCheckTarget;
  surfaceTarget?: ColorCheckTarget;
};

const roles = [
  ["primary", "onPrimary"], ["secondary", "onSecondary"],
  ["success", "onSuccess"], ["warning", "onWarning"],
  ["danger", "onDanger"], ["info", "onInfo"],
] as const;

/**
 * Finite current-CSS diagnostics, not accessibility certification. Models opaque
 * #rrggbb tokens, normal text (4.5), marks and rendered boundaries (3). Components
 * sit on the global background; authored field rows and Card slots resolve their
 * internal surfaces. Text in Card.Content is modeled when shared part paint changes.
 * Offset focus rings also cover muted surroundings and authored choice rows.
 * Ratios use uncomposited colors: opacity, disabled states, local appearance,
 * arbitrary nested/external surfaces, shadows and focus geometry are not certified.
 * Unedited slots reuse existing pairs to preserve the historical default check set.
 * Filled controls need
 * an outer edge, not contrast between their border and their own solid fill;
 * unfilled controls additionally check the border against their interior surface.
 * Zero-width and transparent borders are omitted, not reported as compliant.
 */
export function auditSystemColors(theme: ThemeTokens, mode: PaletteMode = "light"): ContrastCheck[] {
  const g = theme.global;
  const v = toCSSVariables(theme, mode);
  const checks: ContrastCheck[] = [];
  const globalColor = (key: "background" | "foreground" | "mutedForeground" | "danger"): AuditedColor =>
    ({ value: g[key], target: { selection: "colors", key } });
  const canvas = globalColor("background");
  const partStyle = (component: ComponentId, part: ComponentStylePart) => theme.componentStyles?.[component]?.[part];
  function partColor(component: ComponentId, part: ComponentStylePart, key: "color" | "background", fallback: AuditedColor): AuditedColor {
    const value = partStyle(component, part)?.[key];
    return value === undefined || value === "transparent" ? fallback
      : { value, target: { selection: component, part, key } };
  }
  const hasPartPaint = (component: ComponentId, part: ComponentStylePart) =>
    (["color", "background", "borderColor", "borderWidth"] as const).some((key) => partStyle(component, part)?.[key] !== undefined);
  function variantColor(component: ComponentId, variant: string, key: "background" | "foreground" | "description", parent = canvas): AuditedColor {
    const value = v[`--${component}-variant-${variant}-${key}`];
    return value === "transparent" ? parent : { value, target: {
      selection: component, variant, key: key === "description" ? "foreground" : key,
      ...(key === "description" && { derived: true }),
    } };
  }
  function add(id: string, label: string, foreground: string, background: string,
    minimum = 4.5, component?: ComponentId, targets: CheckTargets = {}) {
    const effectiveBackground = background === "transparent" ? g.background : background;
    const ratio = contrastRatio(foreground, effectiveBackground);
    checks.push({ id, label, foreground, background: effectiveBackground, ratio, minimum,
      passes: ratio >= minimum, ...(component ? { component } : {}),
      ...(targets.ink && { inkTarget: targets.ink }), ...(targets.surface && { surfaceTarget: targets.surface }) });
  }
  function paintedPair(id: string, label: string, ink: AuditedColor, surface: AuditedColor, component: ComponentId, minimum = 4.5) {
    add(id, label, ink.value, surface.value, minimum, component, { ink: ink.target, surface: surface.target });
  }
  function boundary(component: ComponentId, id: string, label: string, stroke: string, inside?: string, width?: number, outside = canvas) {
    if ((width ?? resolveComponent(theme, component).borderWidth) <= 0 || stroke === "transparent") return;
    add(id, `${label} on ${outside === canvas ? "global background" : "shared row surface"}`, stroke, outside.value, 3, component,
      { surface: outside.target });
    if (inside !== undefined) add(`${id}.inside`, `${label} on interior surface`, stroke, inside === "transparent" ? outside.value : inside, 3, component,
      inside === "transparent" ? { surface: outside.target } : {});
  }
  function partBoundary(component: ComponentId, part: ComponentStylePart, id: string, label: string,
    ink: AuditedColor, surface: AuditedColor, outside: AuditedColor, defaultWidth = 0) {
    const style = partStyle(component, part);
    if ((style?.borderWidth ?? defaultWidth) <= 0 || style?.borderColor === "transparent") return;
    const stroke: AuditedColor = style?.borderColor === undefined ? ink : {
      value: style.borderColor, target: { selection: component, part, key: "borderColor" },
    };
    paintedPair(`${id}.boundary`, `${label} border on parent surface`, stroke, outside, component, 3);
    paintedPair(`${id}.boundary.inside`, `${label} border on interior surface`, stroke, surface, component, 3);
  }
  const rowSurface = (component: "switch" | "checkbox") => partColor(component, "row", "background", canvas);

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
    const row = component === "input" ? canvas : rowSurface(component);
    const labelInk = component === "input" ? globalColor("foreground") : partColor(component, "row", "color", globalColor("foreground"));
    for (const part of ["label", "description", "error"] as const) {
      const parent = part === "label" ? row : canvas;
      const ink = partColor(component, part, "color", part === "label" ? labelInk : globalColor(part === "description" ? "mutedForeground" : "danger"));
      const surface = partColor(component, part, "background", parent);
      paintedPair(`${component}.${part}`, `${component} ${part} on ${surface === canvas ? "global" : "shared part"} surface`, ink, surface, component);
      partBoundary(component, part, `${component}.${part}`, `${component} ${part}`, ink, surface, parent);
    }
    if (component !== "input") {
      partBoundary(component, "row", `${component}.row`, `${component} row`, labelInk, row, canvas);
      if (row.value !== canvas.value) add(`${component}.focus.row`, `${component} offset focus ring on shared row surface`,
        v["--ds-primary-focus"], row.value, 3, component, { ink: { selection: "colors", key: "primary", derived: true }, surface: row.target });
    }
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
    boundary("button", `button.${variant}.boundary`, `Button ${variant} border`, v[`${prefix}-border`], undefined, Number.parseFloat(v[`${prefix}-border-width`]));
  }

  for (const state of ["default", "hover", "invalid", "readonly"] as const) {
    const prefix = `--input-variant-${state}`;
    const background = v[`${prefix}-background`];
    add(`input.${state}.text`, `Input ${state} text`, v[`${prefix}-foreground`], background, 4.5, "input");
    add(`input.${state}.placeholder`, `Input ${state} placeholder`, g.mutedForeground, background, 4.5, "input");
    boundary("input", `input.${state}.boundary`, `Input ${state} border`, v[`${prefix}-border`], background, Number.parseFloat(v[`${prefix}-border-width`]));
  }

  for (const component of ["switch", "checkbox"] as const) {
    for (const state of ["checked", "unchecked", "invalidChecked", "invalidUnchecked"] as const) {
      const slug = state.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const prefix = `--${component}-variant-${slug}`;
      const background = v[`${prefix}-background`];
      const unchecked = state.endsWith("Unchecked") || state === "unchecked";
      const outside = rowSurface(component);
      add(`${component}.${slug}.text`, `${component} ${slug} ${component === "switch" ? "thumb" : "mark"}`, v[`${prefix}-foreground`], background === "transparent" ? outside.value : background, 3, component,
        background === "transparent" ? { surface: outside.target } : {});
      boundary(component, `${component}.${slug}.boundary`, `${component} ${slug} border`, v[`${prefix}-border`], unchecked ? background : undefined, Number.parseFloat(v[`${prefix}-border-width`]), outside);
    }
  }
  const switchTrack = v["--switch-variant-unchecked-background"];
  add("switch.unchecked.thumb", "Switch enabled unchecked thumb on track", v["--switch-variant-unchecked-foreground"],
    switchTrack === "transparent" ? rowSurface("switch").value : switchTrack, 3, "switch",
    switchTrack === "transparent" ? { surface: rowSurface("switch").target } : {});

  const textInks = ["foreground", "primary", "success", "warning", "danger", "info"].map((tone) => ({
    tone,
    ink: partColor("text", "root", "color", tone === "foreground"
      ? { value: resolveComponent(theme, "text").foreground, target: { selection: "text", key: "foreground" } }
      : { value: v[`--ds-${tone}-on-subtle`], target: { selection: "colors", key: tone, derived: true } }),
  }));
  const textSurface = partColor("text", "root", "background", canvas);
  for (const { tone, ink } of textInks) {
    const label = `Text ${tone === "foreground" ? "neutral" : tone}`;
    paintedPair(`text.${tone}`, `${label} on ${textSurface === canvas ? "global" : "shared part"} surface`, ink, textSurface, "text");
    partBoundary("text", "root", `text.${tone}`, label, ink, textSurface, canvas);
  }

  for (const variant of ["outlined", "elevated", "filled"] as const) {
    const prefix = `--card-variant-${variant}`;
    const surface = variantColor("card", variant, "background");
    const ink = variantColor("card", variant, "foreground");
    const headerSurface = partColor("card", "header", "background", surface);
    const headerInk = partColor("card", "header", "color", ink);
    const descriptionSurface = partColor("card", "description", "background", headerSurface);
    const descriptionInk = partColor("card", "description", "color", variantColor("card", variant, "description"));
    paintedPair(`card.${variant}.text`, `Card ${variant} text`, ink, surface, "card");
    paintedPair(`card.${variant}.description`, `Card ${variant} description`, descriptionInk, descriptionSurface, "card");
    boundary("card", `card.${variant}.boundary`, `Card ${variant} border`, v[`${prefix}-border`], surface.value, Number.parseFloat(v[`${prefix}-border-width`]));
    partBoundary("card", "description", `card.${variant}.description`, `Card ${variant} description`, descriptionInk, descriptionSurface, headerSurface);

    for (const part of ["header", "title", "content", "footer", "icon"] as const) {
      if (!hasPartPaint("card", part) && !(part === "title" && hasPartPaint("card", "header"))) continue;
      const parent = part === "title" ? headerSurface : surface;
      const partSurface = partColor("card", part, "background", parent);
      const partInk = partColor("card", part, "color", part === "title" ? headerInk : ink);
      const label = `Card ${variant} ${part}`;
      paintedPair(`card.${variant}.${part}.text`, `${label} ${part === "icon" ? "mark" : "inherited text"}`, partInk, partSurface, "card", part === "icon" ? 3 : 4.5);
      partBoundary("card", part, `card.${variant}.${part}`, label, partInk, partSurface, parent,
        part === "icon" ? Number.parseFloat(v["--ds-card-icon-border-width"]) : 0);
    }
    // Text sets its own tone ink; a Card.Content color does not recolor a Text child.
    if (hasPartPaint("card", "content") || hasPartPaint("text", "root")) {
      const contentSurface = partColor("card", "content", "background", surface);
      const childSurface = partColor("text", "root", "background", contentSurface);
      for (const { tone, ink: childInk } of textInks) {
        const id = `card.${variant}.content.text.${tone}`;
        const label = `Text ${tone === "foreground" ? "neutral" : tone} in Card ${variant} content`;
        paintedPair(id, label, childInk, childSurface, "card");
        partBoundary("text", "root", id, label, childInk, childSurface, contentSurface);
      }
    }
    if (variant === "outlined") {
      paintedPair("card.foreground", "Card outlined text", ink, surface, "card");
      paintedPair("card.description", "Card outlined description", descriptionInk, descriptionSurface, "card");
      boundary("card", "card.boundary", "Card outlined border", v[`${prefix}-border`], surface.value, Number.parseFloat(v[`${prefix}-border-width`]));
    }
  }

  const badge = resolveComponent(theme, "badge");
  add("badge.foreground", "Badge neutral solid text", badge.background, badge.foreground, 4.5, "badge");
  for (const tone of ["neutral", "primary", "success", "warning", "danger", "info"] as const) {
    for (const variant of ["solid", "subtle", "outline"] as const) {
      const prefix = `--badge-variant-${variant}-${tone}`;
      const background = v[`${prefix}-background`] === "transparent" ? g.background : v[`${prefix}-background`];
      const foreground = v[`${prefix}-foreground`];
      add(`badge.${tone}.${variant}`, `Badge ${tone} ${variant} text`, foreground, background, 4.5, "badge");
      boundary("badge", `badge.${tone}.${variant}.boundary`, `Badge ${tone} ${variant} border`, v[`${prefix}-border`], variant === "solid" ? undefined : background, Number.parseFloat(v[`${prefix}-border-width`]));
    }
  }
  return checks;
}
