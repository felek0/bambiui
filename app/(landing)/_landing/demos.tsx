"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Badge, Button, Card, Checkbox, Input, Switch } from "../../studio/components";
import { colorScaleRoles, colorScaleStops, contrastRatio, generatePalette, paletteRoles, type PaletteMode } from "../../studio/color-engine";
import { exportCSS, fontFamilyLabels, resolveColorScale, toCSSVariables, type DesignSystem, type FontFamilyPreset } from "../../studio/tokens";
import { applyBrandColor, applyShape, changedVariables, createDemoSystem, defaultShape, type ShapeControls } from "./demo-system";
import styles from "./landing.module.css";

const brandPresets = ["#e8673c", "#2563eb", "#0f766e", "#7c3aed", "#db2777", "#ca8a04"];
const localFonts: FontFamilyPreset[] = ["system", "sans", "humanist", "serif", "mono"];
const cliComponents = ["button", "input", "card", "checkbox", "switch", "badge", "text"] as const;
const roleLabel = (role: string) => role[0].toUpperCase() + role.slice(1);

/** Real components rendered with a System's exported variables; the page chrome never inherits them. */
function ThemeScope({ system, mode, children, label, className = "" }: { system: DesignSystem; mode: PaletteMode; children: ReactNode; label: string; className?: string }) {
  const variables = useMemo(() => toCSSVariables(system.themes[mode], mode), [system, mode]);
  return <div className={`${styles.scope} ${className}`} data-ds-theme={mode} role="group" aria-label={label}
    style={{ ...variables, colorScheme: mode } as CSSProperties}>{children}</div>;
}

export function SectionHead({ index, name, title, id, children }: { index: string; name: string; title: string; id: string; children: ReactNode }) {
  return <header className={`${styles.grid} ${styles.sectionHead}`}>
    <p className={styles.meta}><span>{index}</span><span>{name}</span></p>
    <h2 id={id}>{title}</h2>
    <p className={styles.sectionLead}>{children}</p>
  </header>;
}

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return <div className={styles.command}>
    <code>{command}</code>
    <button type="button" className={styles.textButton} onClick={async () => {
      try { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); }
    }}>{copied ? "Copied" : "Copy"}</button>
    <span className={styles.srOnly} role="status">{copied ? "Command copied" : ""}</span>
  </div>;
}

/** Matches .specScope zoom in landing.module.css. */
const zoom = 1.75;
type Measure = { left: number; top: number; width: number; height: number; contentLeft: number; radius: number; padding: number; fontSize: number; size: number };

/** The hero is the product: a real Button, measured as rendered, with its geometry drawn as redlines. */
export function HeroSpec() {
  const system = useMemo(() => createDemoSystem(), []);
  const canvas = useRef<HTMLDivElement>(null);
  const [measure, setMeasure] = useState<Measure | null>(null);
  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root) return;
    const read = () => {
      // Lines follow the zoomed specimen; values come from an identical, unzoomed probe at 1×.
      const button = root.querySelector<HTMLElement>('[data-spec-view] [data-ds-component="button"][data-component-part="root"]');
      const content = button?.querySelector<HTMLElement>('[data-component-part="text"]');
      const probe = root.querySelector<HTMLElement>('[data-spec-probe] [data-ds-component="button"][data-component-part="root"]');
      const probeText = probe?.querySelector<HTMLElement>('[data-component-part="text"]');
      if (!button || !content || !probe || !probeText) return;
      const base = root.getBoundingClientRect(), box = button.getBoundingClientRect(), text = content.getBoundingClientRect();
      const style = getComputedStyle(probe);
      const next: Measure = {
        left: box.left - base.left, top: box.top - base.top, width: box.width, height: box.height, contentLeft: text.left - base.left,
        radius: parseFloat(style.borderTopLeftRadius), padding: parseFloat(style.paddingLeft), fontSize: parseFloat(getComputedStyle(probeText).fontSize),
        size: probe.getBoundingClientRect().height,
      };
      setMeasure(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(root);
    document.fonts?.ready.then(read);
    return () => observer.disconnect();
  }, []);
  const value = (number?: number) => number === undefined ? "—" : `${Math.round(number * 100) / 100}px`;
  return <figure className={styles.spec}>
    <div ref={canvas} className={styles.specCanvas} inert>
      <span className={styles.specZoom}>{Math.round(zoom * 100)}%</span>
      <span className={styles.specName}>Button · lg</span>
      <div data-spec-view><ThemeScope system={system} mode="light" label="Button specimen" className={styles.specScope}><Button size="lg">Save changes</Button></ThemeScope></div>
      <div data-spec-probe className={styles.specProbe} aria-hidden="true"><ThemeScope system={system} mode="light" label="Button measurement"><Button size="lg">Save changes</Button></ThemeScope></div>
      {measure && <>
        <span className={styles.markV} style={{ left: measure.left - 20, top: measure.top, height: measure.height }}><span>{Math.round(measure.size)}</span></span>
        <span className={styles.markH} style={{ left: measure.left, top: measure.top + measure.height + 14, width: measure.contentLeft - measure.left }}><span>{Math.round(measure.padding)}</span></span>
        <span className={styles.markArc} style={{ left: measure.left, top: measure.top, width: measure.radius * zoom, height: measure.radius * zoom, borderTopLeftRadius: measure.radius * zoom }} />
        <span className={styles.markRadius} style={{ left: measure.left - 34, top: measure.top - 24 }}>r {Math.round(measure.radius)}</span>
      </>}
    </div>
    <dl className={styles.specList}>
      <dt>border-radius</dt><dd>{value(measure?.radius)}</dd>
      <dt>padding-inline</dt><dd>{value(measure?.padding)}</dd>
      <dt>block-size</dt><dd>{value(measure?.size)}</dd>
      <dt>font-size</dt><dd>{value(measure?.fontSize)}</dd>
    </dl>
    <figcaption>Measured from the rendered Button, size lg, default System.</figcaption>
  </figure>;
}

function PaletteDemo({ brand, onBrand, system }: { brand: string; onBrand: (color: string) => void; system: DesignSystem }) {
  const [text, setText] = useState(brand);
  const palette = useMemo(() => generatePalette(brand), [brand]);
  const scales = useMemo(() => colorScaleRoles.map(role => [role, resolveColorScale(system.themes.light, "light", role)] as const), [system]);
  const valid = /^#[\da-f]{6}$/i.test(text);
  const pick = (color: string) => { setText(color); onBrand(color.toLowerCase()); };
  return <div className={`${styles.grid} ${styles.body}`}>
    <span className={`${styles.metaCol} ${styles.rowLabel}`} aria-hidden="true">brand</span>
    <div className={`${styles.span4End} ${styles.brandRow}`}>
      <input type="color" className={styles.swatchInput} aria-label="Pick brand color" value={brand} onChange={event => pick(event.target.value)} />
      <input className={styles.hexInput} aria-label="Brand color hex" value={text} aria-invalid={!valid} spellCheck={false}
        onChange={event => { setText(event.target.value); if (/^#[\da-f]{6}$/i.test(event.target.value)) onBrand(event.target.value.toLowerCase()); }} />
      <div className={styles.presets} role="group" aria-label="Brand color presets">
        {brandPresets.map(color => <button key={color} type="button" aria-label={`Use ${color}`} aria-pressed={brand === color} style={{ background: color }} onClick={() => pick(color)} />)}
      </div>
    </div>
    <div className={`${styles.full} ${styles.tableRegion}`} role="region" aria-label="Generated palette" tabIndex={0}>
      <table className={styles.paletteTable}>
        <caption className={styles.srOnly}>Light palette generated from {brand}: seven roles, eleven steps each</caption>
        <colgroup><col className={styles.labelCol} /><col span={colorScaleStops.length} /></colgroup>
        <thead><tr><th scope="col"><span className={styles.srOnly}>Role</span></th>{colorScaleStops.map(stop => <th scope="col" key={stop}>{stop}</th>)}</tr></thead>
        <tbody>{scales.map(([role, scale]) => <tr key={role}>
          <th scope="row">{role}</th>
          {colorScaleStops.map(stop => <td key={stop} style={{ background: scale[stop] }} title={`${role} ${stop} · ${scale[stop]}`}><span className={styles.srOnly}>{scale[stop]}</span></td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <div className={`${styles.span4End} ${styles.roles}`}>
      {(["light", "dark"] as const).map(mode => <div key={mode} className={styles.roleSet} data-mode={mode}
        style={{ background: palette[mode].tokens.background, color: palette[mode].tokens.foreground }}>
        <h3>{mode === "light" ? "Light" : "Dark"} roles</h3>
        <ul>{paletteRoles.map(role => {
          const colors = palette[mode].roles[role];
          const ratio = contrastRatio(colors.onSolid, colors.solid);
          return <li key={role} className={styles.roleRow}>
            <span className={styles.chip} style={{ background: colors.solid, color: colors.onSolid }} aria-hidden="true">Aa</span>
            <span>{roleLabel(role)}</span>
            <code>{colors.solid}</code>
            <code title="Contrast of the role foreground on its fill">{ratio.toFixed(1)}{ratio >= 4.5 ? " AA" : ""}</code>
          </li>;
        })}</ul>
      </div>)}
    </div>
    <span className={`${styles.metaCol} ${styles.rowLabel}`} aria-hidden="true">applied</span>
    <div className={styles.span4End}>
      <ThemeScope system={system} mode="light" label="Brand applied to components" className={styles.appliedScope}>
        <Button>Primary</Button><Button variant="secondary">Secondary</Button><Badge tone="success" variant="subtle">Success</Badge><Badge tone="danger" variant="outline">Danger</Badge>
      </ThemeScope>
    </div>
  </div>;
}

function Control({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return <div className={styles.control}>
    <span className={styles.controlLabel}><span>{label}</span>{value && <output>{value}</output>}</span>
    {children}
  </div>;
}

function TokenDemo({ shape, onShape, system, mode, onMode }: {
  shape: ShapeControls; onShape: (next: ShapeControls) => void; system: DesignSystem; mode: PaletteMode; onMode: (mode: PaletteMode) => void;
}) {
  const global = system.themes[mode].global;
  const range = (key: "radius" | "density" | "fontSize", label: string, min: number, max: number) => <Control label={label.toLowerCase()} value={`${shape[key]}px`}>
    <input type="range" className={styles.range} min={min} max={max} value={shape[key]} aria-label={label} onChange={event => onShape({ ...shape, [key]: Number(event.target.value) })} />
  </Control>;
  const cell = (label: string, span: string, children: ReactNode) => <div className={`${styles.cell} ${span}`}><span className={styles.cellLabel}>{label}</span>{children}</div>;
  return <div className={`${styles.grid} ${styles.body}`}>
    <div className={`${styles.full} ${styles.instrument}`} role="group" aria-label="Design tokens">
      {range("radius", "Radius", 0, 24)}
      {range("density", "Density", 6, 28)}
      {range("fontSize", "Font size", 12, 18)}
      <Control label="font">
        <select className={styles.select} aria-label="Font family" value={shape.fontFamily} onChange={event => onShape({ ...shape, fontFamily: event.target.value as FontFamilyPreset })}>
          {localFonts.map(font => <option key={font} value={font}>{fontFamilyLabels[font]}</option>)}
        </select>
      </Control>
      <Control label="theme">
        <div className={styles.toggle} role="group" aria-label="Theme">
          {(["light", "dark"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => onMode(value)}>{value === "light" ? "Light" : "Dark"}</button>)}
        </div>
      </Control>
    </div>
    <ThemeScope system={system} mode={mode} label={`Live ${mode} preview`} className={`${styles.full} ${styles.specimenGrid}`}>
      {cell("button / variant", styles.c5, <div className={styles.row}><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button></div>)}
      {cell("button / size", styles.c3, <div className={styles.row}><Button size="sm" variant="outline">Small</Button><Button size="md" variant="outline">Medium</Button><Button size="lg" variant="outline">Large</Button></div>)}
      {cell("badge / tone", styles.c4, <div className={styles.row}><Badge tone="primary">Primary</Badge><Badge tone="success" variant="subtle">Success</Badge><Badge tone="warning" variant="subtle">Warning</Badge><Badge tone="danger" variant="outline">Danger</Badge></div>)}
      {cell("input / state", styles.c5, <div className={styles.stack}><Input label="Email" placeholder="you@example.com" /><Input label="Workspace" defaultValue="acme" error="This name is already taken." /></div>)}
      {cell("card", styles.c4, <Card variant="outlined" size="sm">
        <Card.Header><Card.Title>Weekly summary</Card.Title><Card.Description>Every value here comes from your tokens.</Card.Description></Card.Header>
        <Card.Footer><Button size="sm" variant="ghost">Later</Button><Button size="sm">Subscribe</Button></Card.Footer>
      </Card>)}
      {cell("checkbox / switch", styles.c3, <div className={styles.stack}><Checkbox label="Remember me" defaultChecked /><Switch label="Notifications" defaultChecked /></div>)}
    </ThemeScope>
    <p className={`${styles.full} ${styles.readout}`} aria-live="polite">
      <span>--ds-radius-sm <b>{global.radiusSm}px</b></span><span>--ds-radius-md <b>{global.radius}px</b></span><span>--ds-radius-lg <b>{global.radiusLg}px</b></span>
      <span>--ds-padding-x <b>{global.paddingX}px</b></span><span>--ds-font-size <b>{global.fontSize}px</b></span>
    </p>
  </div>;
}

function ExportDemo({ system, mode }: { system: DesignSystem; mode: PaletteMode }) {
  const [status, setStatus] = useState("");
  const changed = useMemo(() => changedVariables(system, mode), [system, mode]);
  const download = (format: "css" | "json") => {
    const text = format === "css" ? exportCSS({ themes: system.themes }) : JSON.stringify(system, null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: format === "css" ? "text/css" : "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `bambiui-tokens.${format}`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(format === "css" ? "CSS for both themes downloaded." : "System JSON downloaded.");
  };
  return <div className={`${styles.grid} ${styles.body}`}>
    <div className={`${styles.metaCol} ${styles.actionList}`}>
      <button type="button" className={styles.textButton} onClick={() => download("json")}>Download System JSON</button>
      <button type="button" className={styles.textButton} onClick={() => download("css")}>Download CSS</button>
      <button type="button" className={styles.textButton} onClick={async () => {
        try { await navigator.clipboard.writeText(`:root {\n${changed.map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}`); setStatus("Changed variables copied."); }
        catch { setStatus("Copy is not available in this browser."); }
      }}>Copy changes</button>
      <p className={styles.status} role="status">{status}</p>
    </div>
    <div className={`${styles.span4End} ${styles.diff}`}>
      <div className={styles.diffHead}><span>{mode}.css · against the default System</span><span>{changed.length} changed</span></div>
      <pre><code>{changed.length
        ? changed.map(([name, value]) => <span key={name} className={styles.diffLine}><span className={styles.plus} aria-hidden="true">+ </span>{`${name}: ${value};`}{"\n"}</span>)
        : <span className={styles.diffEmpty}>No changes yet. Pick a brand color or move a slider above.</span>}</code></pre>
    </div>
  </div>;
}

function CliDemo({ version }: { version: string }) {
  const [components, setComponents] = useState<string[]>(["button", "card", "input"]);
  const cli = `npx bambiui@${version}`;
  const init = `${cli} init --system ./bambiui-tokens.json`;
  const add = `${cli} add ${components.join(" ")}`;
  const initOutput = [
    "Wrote 9 file(s).",
    "  bambiui.json",
    "  src/components/bambiui/ThemeScope.tsx",
    "  src/components/bambiui/styles.css",
    "  src/components/bambiui/theme.css",
    "  …",
    `Next: ${cli} add button`,
    "Host setup (src/app/layout.tsx):",
    '  import "../components/bambiui/styles.css";',
    '  import { ThemeScope } from "../components/bambiui/ThemeScope";',
  ].join("\n");
  const addOutput = [
    "  src/components/bambiui/ui/index.ts",
    ...components.map(name => `  src/components/bambiui/ui/${name}…`),
    `Installed public components: ${components.join(", ")}. Import from src/components/bambiui/ui.`,
  ].join("\n");
  const toggle = (name: string) => setComponents(list => list.includes(name) ? (list.length > 1 ? list.filter(entry => entry !== name) : list) : [...list, name]);
  return <div className={`${styles.grid} ${styles.body}`}>
    <ol className={`${styles.span4End} ${styles.steps}`}>
      <li className={styles.step}>
        <span className={styles.stepNo}>1</span>
        <div>
          <p className={styles.stepTitle}>Write your themes and the theme scope.</p>
          <CopyCommand command={init} />
          <pre className={styles.output}>{initOutput}</pre>
        </div>
      </li>
      <li className={styles.step}>
        <span className={styles.stepNo}>2</span>
        <div>
          <p className={styles.stepTitle}>Copy the components you use.</p>
          <div className={styles.picker} role="group" aria-label="Components to add">
            {cliComponents.map(name => <button key={name} type="button" aria-pressed={components.includes(name)} onClick={() => toggle(name)}>{name}</button>)}
          </div>
          <CopyCommand command={add} />
          <pre className={styles.output}>{addOutput}</pre>
        </div>
      </li>
    </ol>
    <p className={`${styles.span4End} ${styles.footnote}`}>Abridged example output for a Next.js app with a src directory. Nothing is installed and no scripts run on their own.</p>
  </div>;
}

/** One in-memory System: color → tokens → export → CLI tell a single story. Studio storage is never touched. */
export function LandingDemos({ cliVersion }: { cliVersion: string }) {
  const [brand, setBrand] = useState("#e8673c");
  const [shape, setShape] = useState<ShapeControls>(defaultShape);
  const [mode, setMode] = useState<PaletteMode>("light");
  const system = useMemo(() => applyShape(applyBrandColor(createDemoSystem(), brand), shape), [brand, shape]);
  const sections = [
    { id: "color", index: "01", name: "Color", title: "One brand color, two complete themes.",
      lead: "Semantic roles with readable foregrounds and an eleven-step scale for every role, generated for Light and Dark.",
      body: <PaletteDemo brand={brand} onBrand={setBrand} system={system} /> },
    { id: "tokens", index: "02", name: "Tokens", title: "Change a token. Every component follows.",
      lead: "These are the shipped components, not mockups. Shape, spacing and type are shared by both themes; colors are set per theme.",
      body: <TokenDemo shape={shape} onShape={setShape} system={system} mode={mode} onMode={setMode} /> },
    { id: "export", index: "03", name: "Export", title: "Export what changed.",
      lead: "Your system is plain CSS custom properties and a JSON file the CLI reads. No runtime, no lock-in.",
      body: <ExportDemo system={system} mode={mode} /> },
    { id: "cli", index: "04", name: "CLI", title: "Copy the source into your app.",
      lead: "Editable React, TypeScript and CSS Modules from a pinned, checksummed registry.",
      body: <CliDemo version={cliVersion} /> },
  ];
  return <>{sections.map(section => <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-title`}>
    <div className={styles.wrap}>
      <SectionHead index={section.index} name={section.name} title={section.title} id={`${section.id}-title`}>{section.lead}</SectionHead>
      {section.body}
    </div>
  </section>)}</>;
}
