"use client";

import { useMemo, useState, type ReactNode } from "react";
import { highlight } from "sugar-high";
import { Button } from "./controls";
import { snippets } from "./snippets";
import {
  colorScaleRoles,
  colorScaleStops,
  resolveColorScale,
  resolveTypography,
  typographyVariants,
  toCSSVariables,
  tokenFields,
  componentTokenKeys,
  componentEditableTokenKeys,
  componentIds,
  componentVariantKeys,
  type ComponentVariantId,
  type ComponentVariantColorTokens,
  type ThemeTokens,
  type ComponentId,
  type DesignSystem,
} from "./tokens";
import styles from "./developer.module.css";
import { developerCopy, type NoteKey } from "./developer-copy";
import type { PaletteMode } from "./color-engine";
import { appearanceFieldsFor, appearanceParts } from "./page-document/appearance";


export type DeveloperViewProps = {
  selected: "colors" | "spacing" | ComponentId;
  system: DesignSystem;
  mode: PaletteMode;
  cssOutput: string;

};

const instanceNotes = {
  appearance: "Theme-independent instance values on the painted element. Omitted values inherit the shared component tokens; these are not new CSS tokens.",
  parts: "Independent root, label, control, description and error appearance; choices also support row. Control part values take precedence over appearance.",
  errorPosition: "Place the error before the label/control group or after the description. DOM order matches visual order.",
  errorIcon: "Fixed decorative, aria-hidden glyph; never a replacement for the textual error.",
} as const;
const propNotes = { ...developerCopy.notes, ...instanceNotes };
type PropRow = readonly [prop: string, type: string, defaultValue: string, noteKey: NoteKey | keyof typeof instanceNotes];

const size: PropRow = ["size", '"sm" | "md" | "lg"', '"md"', "size"];
const radius: PropRow = ["radius", '"sm" | "md" | "lg"', "omitted (global md by default)", "radius"];
const content: PropRow = ["children", "ReactNode", "—", "content"];
const className: PropRow = ["className", "string", "—", "className"];
const icons: PropRow = ["startIcon / endIcon", "ReactNode", "—", "icons"];
const appearance: PropRow = ["appearance", "NodeAppearance", "omitted", "appearance"];
const parts: PropRow = ["parts", "NodeParts", "omitted", "parts"];
const fields: readonly PropRow[] = [
  ["label", "ReactNode", "Required", "label"],
  ["hideLabel", "boolean", "false", "hideLabel"],
  ["description / error", "ReactNode", "—", "description"],
  ["errorPosition", '"below" | "above"', '"below"', "errorPosition"],
  ["errorIcon", '"none" | "info" | "warning"', '"none"', "errorIcon"],
  appearance, parts, size,
  ["disabled / readOnly / required", "boolean", "false", "states"],
  ["name", "string", "—", "name"],
  className,
];
const choices: readonly PropRow[] = [
  ...fields,
  ["labelPosition", '"start" | "end"', '"end"', "labelPosition"],
  ["checked / defaultChecked", "boolean", "Base UI defaults", "checked"],
  ["onCheckedChange", "Base UI callback", "—", "onCheckedChange"],
  ["value", "Base UI value prop", "Base UI default", "value"],
];

// Keep wrapper-specific defaults aligned with components/ and docs/component-api.md.
// Inherited props remain delegated to Base UI rather than inventing wrapper defaults.
const reference: Record<ComponentId, { name: string; props: readonly PropRow[] }> = {
  button: {
    name: "Button",
    props: [
      ["variant", '"primary" | "secondary" | "outline" | "ghost" | "destructive" | "link"', '"primary"', "hierarchy"],
      size,
      ["disabled", "boolean", "false", "disabled"],
      radius,
      ["loading", "boolean", "false", "loading"],
      ["fullWidth", "boolean", "false", "fullWidth"],
      ["iconOnly", "boolean", "false", "iconOnly"],
      icons, content, className, appearance,
      ["render", "Base UI render prop", "—", "render"],
    ],
  },
  input: {
    name: "Input",
    props: [
      ...fields,
      radius,
      ["type", '"text" | "email" | "password" | "number" | "search" | "tel" | "url"', '"text"', "inputType"],
      ["placeholder", "string", "—", "placeholder"],
      ["value / defaultValue", "Base UI Input value props", "—", "inputValue"],
      ["onValueChange", "Base UI callback", "—", "onValueChange"],
      icons,
    ],
  },
  switch: {
    name: "Switch",
    props: choices,
  },
  checkbox: {
    name: "Checkbox",
    props: [...choices, radius, ["indeterminate", "boolean", "Base UI default", "indeterminate"]],
  },
  badge: {
    name: "Badge",
    props: [
      ["variant", '"solid" | "subtle" | "outline"', '"outline"', "fill"],
      ["tone", '"neutral" | "primary" | "success" | "warning" | "danger" | "info"', '"neutral"', "tone"],
      size,
      ["dot", "boolean", "false", "dot"], radius,
      ["startIcon", "ReactNode", "—", "startIcon"],
      content, className, appearance,
    ],
  },
  card: {
    name: "Card",
    props: [
      ["variant", '"outlined" | "elevated" | "filled"', '"outlined"', "surface"],
      size, radius, content, className, appearance,
    ],
  },
  text: {
    name: "Text",
    props: [
      ["variant", '"h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "heading" | "paragraph" | "label" | "caption"', '"paragraph"', "textVariant"],
      size,
      ["tone", '"neutral" | "primary" | "success" | "warning" | "danger" | "info"', '"neutral"', "textTone"],
      ["as", '"h1"–"h6" | "p" | "span"', "By variant", "textAs"],
      content, className, appearance,
      ["native attributes", "HTML attributes for the rendered element", "—", "textNative"],
    ],
  },
};

function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.scroll} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

function ReactUsage({ selected }: { selected: ComponentId }) {
  const copy = developerCopy;
  const source = snippets[selected];
  const highlighted = useMemo(() => highlight(source), [source]);
  const [copyStatus, setCopyStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

  async function copyReactCode() {
    if (copyStatus === "pending") return;
    setCopyStatus("pending");
    try {
      await navigator.clipboard.writeText(source);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.codeHeading}>
        <h3>{copy.reactUsage}</h3>
        <Button
          type="button"
          onClick={copyReactCode}
          disabled={copyStatus === "pending"}
          focusableWhenDisabled
          aria-busy={copyStatus === "pending"}
        >
          {copy.copyReactCode}
        </Button>
      </div>
      <p>{copy.reactDescription}</p>
      <p className={styles.copyStatus} role="status" aria-atomic="true">
        {copyStatus === "pending" && copy.copying}
        {copyStatus === "success" && copy.copied}
        {copyStatus === "error" && copy.copyError}
      </p>
      <div className={styles.reactCode}>
        <ScrollRegion label={copy.usageRegion(reference[selected].name)}>
          <pre className={styles.code}>
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
        </ScrollRegion>
      </div>
    </section>
  );
}

function ColorRamp({ theme, mode, variables, copyable = false }: { theme: ThemeTokens; mode: PaletteMode; variables: Record<string, string>; copyable?: boolean }) {
  const copy = developerCopy;
  return (
    <section className={styles.section}>
      <h3>{copy.colorRamp}</h3>
      <p>{copy.colorRampDescription}</p>
      <ScrollRegion label={copy.colorRamp}>
        <table className={`${styles.table} ${styles.rampTable}`}>
          <caption>{copy.modeName[mode]} {copy.colorRamp}</caption>
          <thead><tr><th scope="col">{copy.role}</th>{colorScaleStops.map((stop) => <th scope="col" key={stop}>{stop}</th>)}</tr></thead>
          <tbody>{colorScaleRoles.map((role) => {
            const scale = resolveColorScale(theme, mode, role);
            return (
              <tr key={role}>
                <th scope="row">{role}</th>
                {colorScaleStops.map((stop) => {
                  const name = `--ds-${role}-${stop}`;
                  return <td key={stop}>
                    <span className={styles.swatch} style={{ backgroundColor: `var(${name}, ${scale[stop]})` }} aria-hidden="true" />
                    <code>{name}</code>{copyable && <CopyToken value={name} />}<code>{variables[name]}</code>{copyable && <CopyToken value={variables[name]} />}
                  </td>;
                })}
              </tr>
            );
          })}</tbody>
        </table>
      </ScrollRegion>
    </section>
  );
}

function TypographyReference({ theme, variables }: { theme: ThemeTokens; variables: Record<string, string> }) {
  const copy = developerCopy;
  return (
    <section className={styles.section}>
      <h3>{copy.typographyReference}</h3>
      <p>{copy.typographyDescription}</p>
      <p>{copy.fontFamily}: <code>{theme.fontFamily ?? "system"}</code> · <code>--ds-font-family</code>: <code>{variables["--ds-font-family"]}</code></p>
      <ScrollRegion label={copy.typographyReference}>
        <table className={styles.table}>
          <caption>{copy.typographyReference}</caption>
          <thead><tr><th scope="col">{copy.variant}</th><th scope="col">{copy.preview}</th><th scope="col">{copy.fontSize}</th><th scope="col">{copy.lineHeight}</th><th scope="col">{copy.fontWeight}</th><th scope="col">{copy.letterSpacing}</th></tr></thead>
          <tbody>{typographyVariants.map((variant) => {
            const values = resolveTypography(theme, variant);
            const prefix = `--ds-typography-${variant}-`;
            return <tr key={variant}>
              <th scope="row">{variant}</th>
              <td><span className={styles.typeSample} style={{ fontFamily: "var(--ds-font-family)", fontSize: values.fontSize, lineHeight: values.lineHeight, fontWeight: values.fontWeight, letterSpacing: values.letterSpacing }}>{copy.sampleText}</span></td>
              {(["font-size", "line-height", "font-weight", "letter-spacing"] as const).map((field) => {
                const name = `${prefix}${field}`;
                return <td key={field}><code>{name}</code><br /><code>{variables[name]}</code></td>;
              })}
            </tr>;
          })}</tbody>
        </table>
      </ScrollRegion>
    </section>
  );
}

function cssName(key: string, prefix = "--ds-") {
  return `${prefix}${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function CopyToken({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }
  return <span className={styles.copyToken}>
    <button type="button" onClick={copy} aria-label={`Copy ${value}`} title={`Copy ${value}`}>Copy</button>
    <span className={styles.copyFeedback} role="status">{status === "copied" ? "Copied" : status === "error" ? "Copy failed" : ""}</span>
  </span>;
}

function FoundationTokens({ theme, mode, variables, kind }: {
  theme: ThemeTokens;
  mode: PaletteMode;
  variables: Record<string, string>;
  kind: "colors" | "spacing";
}) {
  const colors = kind === "colors";
  const fields = tokenFields.filter((field) => field.type === (colors ? "color" : "number"));
  const keys = componentTokenKeys.filter((key) => colors
    ? key === "background" || key === "foreground" || key === "border"
    : key !== "background" && key !== "foreground" && key !== "border");
  const derived = Object.entries(variables).filter(([name]) =>
    /^(--ds-(primary|secondary|success|warning|danger|info)-(hover|active|subtle|on-subtle|outline|focus)|--button-(hover|active)|--badge-(neutral|primary|success|warning|danger|info)-(subtle|on-subtle|outline)|--card-(filled-)?description)$/.test(name));

  return <>
    <section className={styles.section}>
      <h2>{colors ? "Colors" : "Spacing & sizing"}</h2>
      <p>{colors
        ? `These are the ${mode} theme’s live color roles. Light and dark have independent colors, scales, and component color overrides. Values below follow the CSS export, not a static palette.`
        : "Shape, spacing, and sizing tokens are shared across light and dark themes. Editing either theme updates both; only colors differ. Values below are the live exported CSS values in pixels."}</p>
      <h3>{colors ? "Global color roles" : "Global shape, spacing & sizing"}</h3>
      <p>{colors
        ? "Surface and semantic roles include foreground partners for readable content on their fills. Use the CSS variable in styles; copy a name or value from the table."
        : "SpacingSm/Md/Lg (--ds-spacing-sm/md/lg) set the gap between items in Card.Content at matching Card sizes. Legacy paddingX, paddingY and gap tokens still control component padding and outer gaps independently. The sm/md/lg control heights are shared across controls."}</p>
      <ScrollRegion label={colors ? "Global color roles" : "Global spacing and sizing tokens"}>
        <table className={styles.table}>
          <caption>{colors ? `${mode} global colors` : "Shared global numeric tokens"}</caption>
          <thead><tr><th scope="col">Token</th><th scope="col">CSS variable</th><th scope="col">Value</th></tr></thead>
          <tbody>{fields.map(({ key, label }) => {
            const name = cssName(key);
            return <tr key={key}>
              <th scope="row">{label}</th>
              <td><code>{name}</code><CopyToken value={name} /></td>
              <td><span className={styles.tokenValue}>{colors && <span className={styles.inlineSwatch} style={{ backgroundColor: variables[name] }} aria-hidden="true" />}<code>{variables[name]}</code></span><CopyToken value={variables[name]} /></td>
            </tr>;
          })}</tbody>
        </table>
      </ScrollRegion>
    </section>
    {colors && <ColorRamp theme={theme} mode={mode} variables={variables} copyable />}
    <section className={styles.section}>
      <h3>{colors ? "Component color tokens" : "Component numeric tokens"}</h3>
      <p>{colors
        ? "Each component has background, foreground, and border aliases. A declared override replaces the inherited global value even if they currently match. Variant/tone-specific styles below list the actual resolved CSS variables consumed by the component."
        : "The radius alias defaults to shared --ds-radius-md; radius=sm/md/lg selects --ds-radius-sm/md/lg on supported components. Omitting the prop preserves historical numeric component overrides. Padding, gap, margin, font size and border width keep their component aliases; spacing presets are shared across themes."}</p>
      <ScrollRegion label={colors ? "Component color aliases" : "Component numeric aliases"}>
        <table className={styles.table}>
          <caption>{colors ? `${mode} component color aliases` : "Shared component numeric aliases"}</caption>
          <thead><tr><th scope="col">Component</th><th scope="col">CSS variable</th><th scope="col">Source</th><th scope="col">Resolved value</th></tr></thead>
          <tbody>{componentIds.flatMap((id) => keys.filter((key) => componentEditableTokenKeys(id).includes(key)).map((key) => {
            const name = cssName(key, `--${id}-`);
            const declaration = variables[name];
            const inherited = /^var\((--ds-[a-z-]+)\)$/.exec(declaration)?.[1];
            const value = inherited ? variables[inherited] : declaration;
            return <tr key={name}>
              <th scope="row">{reference[id].name}</th>
              <td><code>{name}</code><CopyToken value={name} /></td>
              <td>{inherited ? <>Inherited from <code>{inherited}</code></> : "Override"}</td>
              <td><span className={styles.tokenValue}>{colors && <span className={styles.inlineSwatch} style={{ backgroundColor: value }} aria-hidden="true" />}<code>{value}</code></span><CopyToken value={value} /></td>
            </tr>;
          }))}</tbody>
        </table>
      </ScrollRegion>
    </section>
    {colors && <section className={styles.section}>
      <h3>Derived color variables</h3>
      <p>Hover, active, subtle, on-subtle, outline, focus, and component-specific colors are computed from the current theme and overrides. They are not separate editable roles; use these variables for states and readable text.</p>
      <ScrollRegion label="Derived color variables">
        <table className={styles.table}>
          <caption>{mode} derived color variables</caption>
          <thead><tr><th scope="col">CSS variable</th><th scope="col">Value</th></tr></thead>
          <tbody>{derived.map(([name, value]) => <tr key={name}><th scope="row"><code>{name}</code><CopyToken value={name} /></th><td><span className={styles.tokenValue}><span className={styles.inlineSwatch} style={{ backgroundColor: value }} aria-hidden="true" /><code>{value}</code></span><CopyToken value={value} /></td></tr>)}</tbody>
        </table>
      </ScrollRegion>
    </section>}
    <section className={styles.section}>
      <h3>CSS variable reference</h3>
      <p>{colors
        ? "Use global roles and scales with var(--ds-…), or a component alias with var(--button-…). The exported CSS contains both light and dark selectors; the active theme determines the resolved color."
        : "Use var(--ds-…) for shared dimensions and var(--button-…) for component aliases. Numeric token declarations use px; component aliases inherit via var() unless overridden. Both theme selectors export the same non-color values."}</p>
      <ScrollRegion label={colors ? "Color CSS example" : "Spacing CSS example"}>
        <pre className={styles.code}><code>{colors
          ? `.example {\n  color: var(--ds-foreground);\n  background: var(--ds-background);\n  border-color: var(--ds-border);\n  outline-color: var(--ds-primary-focus);\n}\n.example--accent { background: var(--ds-primary-500); }`
          : `.example {\n  padding: var(--ds-spacing-md);\n  gap: var(--ds-spacing-sm);\n  border-radius: var(--ds-radius);\n  min-height: var(--ds-control-height-md);\n}\n.button-example { padding-inline: var(--button-padding-x); }`}</code></pre>
      </ScrollRegion>
    </section>
  </>;
}

export function DeveloperView({ selected, system, mode, cssOutput }: DeveloperViewProps) {
  const copy = developerCopy;
  const component = selected === "colors" || selected === "spacing" ? null : reference[selected];
  const theme = system.themes[mode];
  const variables = useMemo(() => toCSSVariables(theme, mode), [theme, mode]);
  const prefix = selected === "colors" || selected === "spacing" ? "--ds-" : `--${selected}-`;
  const editableNames = new Set((selected === "colors" || selected === "spacing" ? [...componentTokenKeys] : componentEditableTokenKeys(selected))
    .map((key) => `${prefix}${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`));
  const tokens = Object.entries(variables).filter(([name]) => editableNames.has(name));
  const variantComponent = component && selected in componentVariantKeys ? selected as ComponentVariantId : null;
  const variantPrefix = variantComponent ? `--${variantComponent}-variant-` : "";
  const variantFields = ["background", "foreground", "border", "hoverBackground", "activeBackground", "borderWidth", "shadow", "description"] as const;
  const variantVariables = variantComponent
    ? Object.entries(variables).filter(([name]) => name.startsWith(variantPrefix)
      && variantFields.some((field) => componentVariantKeys[variantComponent].some((variant) => {
        const slug = variant.replaceAll(".", "-").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        const fieldSlug = field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        return name === `${variantPrefix}${slug}-${fieldSlug}`;
      })))
    : [];
  const derived = Object.entries(variables).filter(([name]) => name.startsWith(prefix) && !editableNames.has(name)
    && !(selected === "text" && name.startsWith("--text-"))
    && !(variantComponent && name.startsWith(variantPrefix)));

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <p className={styles.systemName}>{copy.system}: {system.name} · {copy.modeName[mode]} {copy.theme} · {copy.source} {system.themes[mode].source}</p>
      </header>

      {selected !== "colors" && selected !== "spacing" && component && (
        <>
          <ReactUsage key={selected} selected={selected} />
          <details className={styles.reference}>
            <summary>{copy.propsAndDefaults}</summary>
            <p>{copy.propsDescription}</p>
            <ScrollRegion label={copy.propsRegion(component.name)}>
              <table className={styles.table}>
                <caption>{component.name} {copy.propReference}</caption>
                <thead><tr><th scope="col">{copy.prop}</th><th scope="col">{copy.type}</th><th scope="col">{copy.default}</th><th scope="col">{copy.behavior}</th></tr></thead>
                <tbody>
                  {component.props.map(([prop, type, defaultValue, noteKey]) => (
                    <tr key={prop}>
                      <th scope="row"><code>{prop}</code></th>
                      <td><code>{type}</code></td>
                      <td><code>{defaultValue === "Required" ? copy.required : defaultValue === "Base UI defaults" ? copy.baseUIDefaults : defaultValue === "Base UI default" ? copy.baseUIDefault : defaultValue}</code></td>
                      <td>{propNotes[noteKey]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <p>{copy.componentNotes[selected]}</p>
          </details>
          <details className={styles.reference} data-instance-appearance-reference>
            <summary>Local instance appearance (not tokens)</summary>
            <p><code>appearance</code> overrides only this instance. It targets the Input shell, Switch track, Checkbox box, or the component root. Unset values keep their existing theme, variant and state inheritance. Lengths are pixels; lineHeight is unitless. Colors are six-digit hex (background and borderColor also accept transparent); shadow uses the existing none/sm/md/lg presets.</p>
            <p>Consumed primary fields: {appearanceFieldsFor(selected).map(({ key }, index) => <span key={key}>{index > 0 && ", "}<code>{key}</code></span>)}.</p>
            {appearanceParts(selected).length > 0 && <>
              <p><code>parts</code> independently styles these field elements. <code>parts.control</code> merges over primary appearance; error gap separates its optional icon. The label and description relationships remain managed by Base UI.</p>
              <ul>{appearanceParts(selected).map(({ key, label }) => <li key={key}><code>{key}</code> — {label}</li>)}</ul>
            </>}
            {selected === "card" && <p>Set <code>appearance</code> separately on Card.Header, Card.Title, Card.Description, Card.Content and Card.Footer. They are independent page nodes, not entries in a Card parts object.</p>}
            <p>width/height accept a finite number, hug or fill; minWidth/minHeight are numeric and maxWidth also accepts fill. Hug means fit-content width or auto height. Fill is 100% of the containing block, not flex-grow.</p>
            <p>Reset by omitting a React appearance key; page-document update commands use null to reset a field, part or entire override object. Values are stored in the page and copied into TSX, not exported as new theme CSS variables. Local colors and opacity can fail contrast even when the token audit passes; review both themes. Decorative borders and shadows never replace the shared focus outline.</p>
          </details>
        </>
      )}

      {(selected === "colors" || selected === "spacing") && <FoundationTokens theme={theme} mode={mode} variables={variables} kind={selected} />}
      {selected === "text" && <TypographyReference theme={theme} variables={variables} />}

      {selected !== "colors" && selected !== "spacing" && <details className={styles.reference}>
        <summary>{component ? copy.tokenInheritance : copy.globalTokenReference}</summary>
        <p>
          {component
            ? copy.componentTokensDescription
            : copy.globalTokensDescription}
        </p>
        {selected === "badge" && <p>Neutral outline uses <code>--badge-neutral-outline</code>, derived from Badge colors unless the border is overridden. <code>--badge-border</code> is exported for compatibility but not painted by the current Badge variants.</p>}
        {selected === "text" && <p>Only <code>--text-foreground</code> affects Text. Typography comes from shared <code>--ds-typography-*</code> tokens; unused legacy aliases remain in CSS/JSON backups.</p>}
        <ScrollRegion label={component ? copy.tokensRegion(component.name) : copy.globalTokenReference}>
          <table className={styles.table}>
            <caption>{component ? `${component.name} ${copy.baseTokenAliases}` : copy.globalCSSVariables}</caption>
            <thead><tr><th scope="col">{component ? copy.aliasCSSName : copy.cssName}</th><th scope="col">{copy.sourceColumn}</th><th scope="col">{copy.resolvedValue}</th></tr></thead>
            <tbody>
              {tokens.map(([name, declaration]) => {
                // Follow the exported declaration instead of duplicating token inheritance rules.
                const source = /^var\((--ds-[a-z-]+)\)$/.exec(declaration)?.[1];
                return (
                  <tr key={name}>
                    <th scope="row"><code>{name}</code></th>
                    <td>{source ? <><span>{copy.inherited}: </span><code>{source}</code></> : component ? copy.componentOverride : copy.globalValue}</td>
                    <td><code>{source ? variables[source] : declaration}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
      </details>}

      {variantVariables.length > 0 && component && (
        <details className={styles.reference}>
          <summary>Variant and state styles</summary>
          <p>These are the resolved CSS variables consumed by this component. Sparse color overrides are theme-specific; border widths and shadow presets are shared across Light and Dark. Unset colors inherit from component or global tokens, or use the documented derived color.</p>
          <ScrollRegion label={`${component.name} variant and tone CSS variables`}>
            <table className={styles.table}>
              <caption>{component.name} resolved variant styles</caption>
              <thead><tr><th scope="col">CSS variable</th><th scope="col">Source</th><th scope="col">Resolved value</th></tr></thead>
              <tbody>{variantVariables.map(([name, value]) => {
                const tokens = theme.variantColors?.[variantComponent!] as Record<string, ComponentVariantColorTokens> | undefined;
                const matchedStyle = componentVariantKeys[variantComponent!].flatMap((variant) => variantFields.map((field) => {
                  const slug = variant.replaceAll(".", "-").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
                  const fieldSlug = field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
                  const override = field === "description" ? undefined : tokens?.[variant]?.[field];
                  return [`${variantPrefix}${slug}-${fieldSlug}`, field, override] as const;
                })).find(([variable]) => variable === name);
                const sharedEffect = matchedStyle?.[1] === "borderWidth" || matchedStyle?.[1] === "shadow";
                const hasOverride = matchedStyle?.[2] !== undefined;
                const source = hasOverride
                  ? sharedEffect ? "Shared component override" : "Theme-specific component override"
                  : sharedEffect ? "Shared default" : "Inherited / derived";
                return <tr key={name}><th scope="row"><code>{name}</code></th><td>{source}</td><td><code>{value}</code></td></tr>;
              })}</tbody>
            </table>
          </ScrollRegion>
        </details>
      )}

      {selected !== "colors" && selected !== "spacing" && derived.length > 0 && (
        <details className={styles.reference}>
          <summary>{copy.derivedColors}</summary>
          <p>{copy.derivedDescription(mode)}</p>
          <ScrollRegion label={copy.derivedThemeVariables}>
            <table className={styles.table}>
              <caption>{copy.modeName[mode]} {copy.runtimeVariables}</caption>
              <thead><tr><th scope="col">{copy.cssVariable}</th><th scope="col">{copy.valueColumn}</th></tr></thead>
              <tbody>{derived.map(([name, value]) => (
                <tr key={name}><th scope="row"><code>{name}</code></th><td><code>{value}</code></td></tr>
              ))}</tbody>
            </table>
          </ScrollRegion>
        </details>
      )}
      <section className={styles.section}>
        <h3>{copy.cssVariableExport}</h3>
        <p>{copy.exportBeforeCode}<code>{'data-ds-theme="dark"'}</code>{copy.exportAfterCode}</p>
        <details className={styles.export}>
          <summary>{copy.showFullSystem}</summary>
          <ScrollRegion label={copy.fullSystemExport}>
            <pre className={styles.code}><code>{cssOutput}</code></pre>
          </ScrollRegion>
        </details>
      </section>
    </div>
  );
}
