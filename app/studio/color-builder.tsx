
import { useId, useMemo, useState } from "react";
import { Button } from "./controls";
import { generatePalette, type GeneratedPalette, type PaletteMode } from "./color-engine";
import { auditSystemColors } from "./color-audit";
import { colorBuilderCopy } from "./color-builder-copy";

import type { ComponentId, DesignSystem, ThemeTokens } from "./tokens";
import styles from "./color-builder.module.css";

const presets = [
  { name: "Terracotta", color: "#e8673c" },
  { name: "Iris", color: "#7660d5" },
  { name: "Ocean", color: "#247db3" },
  { name: "Forest", color: "#287c60" },
  { name: "Graphite", color: "#27272a" },
];
const title = (text: string) => text[0].toUpperCase() + text.slice(1);
const validHex = (text: string) => /^#[\da-f]{6}$/i.test(text);
const numberText = (value: number) => new Intl.NumberFormat("en-US").format(value);
// Flooring avoids presenting a failing 4.499:1 pair as meeting a 4.5:1 target.
const ratioText = (ratio: number) => new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Math.floor(ratio * 100) / 100);

export function ColorBuilder({ system, onApply, onFinish }: {
  system: DesignSystem;
  onApply: (palette: GeneratedPalette, group?: string) => void;
  onFinish?: () => void;
}) {
  const id = useId();
  const copy = colorBuilderCopy;
  const [draft, setDraft] = useState<string | null>(null);
  const source = draft ?? system.themes.light.source;
  const valid = validHex(source);

  function apply(next: string, group?: string) {
    if (!validHex(next)) {
      setDraft(next);
      return;
    }
    setDraft(null);
    onApply(generatePalette(next), group);
  }

  return (
    <details className={styles.builder} data-palette-builder>
      <summary id={`${id}-title`}>{copy.builder}</summary>
      <p>{copy.autoIntro}</p>
      <label htmlFor={`${id}-source`}>{copy.source}</label>
      <div className={styles.sourceInput}>
        <input
          type="color"
          onBlur={onFinish}
          aria-label={copy.picker}
          value={valid ? source : system.themes.light.source}
          onChange={(event) => apply(event.target.value, "palette-picker")}
        />
        <input
          id={`${id}-source`}
          type="text"
          onBlur={onFinish}
          value={source}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!valid}
          aria-describedby={`${id}-help`}
          onChange={(event) => apply(event.target.value, "palette-source")}
        />
      </div>
      <p id={`${id}-help`}>{valid ? copy.validHex : copy.invalidHex}</p>
      <div className={styles.presets} aria-label={copy.presets}>
        {presets.map((preset) => (
          <Button key={preset.name} aria-label={copy.applyPreset(preset.name)} onClick={() => apply(preset.color)}>
            <span className={styles.swatch} style={{ background: preset.color }} aria-hidden="true" />
            {preset.name}
          </Button>
        ))}
      </div>
      <p role="status" className={styles.feedback}>
        {system.themes.light.source === system.themes.dark.source ? copy.bothSource : copy.differentSources}
        <code>{system.themes.light.source}</code>
      </p>
    </details>
  );
}

export function ContrastReport({ theme, mode, component }: { theme: ThemeTokens; mode: PaletteMode; component?: ComponentId }) {
  const copy = colorBuilderCopy;
  const checks = useMemo(() => auditSystemColors(theme, mode), [theme, mode]);
  const scoped = component ? checks.filter((check) => check.component === component) : checks;
  const failures = scoped.filter((check) => !check.passes);
  return (
    <section className={styles.report} data-failing={failures.length > 0 || undefined} aria-label={copy.currentChecks}>
      <h3>{copy.modes[mode]} · {component ? copy.componentContrast(title(component)) : copy.systemContrast}</h3>
      <p role="status" aria-atomic="true">
        {failures.length > 0
          ? copy.failures(numberText(failures.length), numberText(scoped.length))
          : copy.allPass(numberText(scoped.length))}
      </p>
      <details className={styles.details}>
        <summary>{failures.length ? copy.reviewWarnings(numberText(failures.length)) : copy.reviewPairs}</summary>
        <p>{copy.reportHelp}</p>
        <ul className={styles.checks} tabIndex={0} aria-label={copy.pairResults}>
          {(failures.length ? failures : scoped).map((check) => (
            <li key={check.id} data-contrast-check={check.id}>
              <strong>{check.label}</strong>
              <span>{check.passes ? copy.pass : copy.belowTarget}: {ratioText(check.ratio)}:1 / {copy.required} {numberText(check.minimum)}:1</span>
              <code>{check.foreground} {copy.on} {check.background}</code>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
