
import { useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "./controls";
import { Icon } from "./icons";
import { generatePalette, type GeneratedPalette, type PaletteMode } from "./color-engine";
import { auditSystemColors, colorCheckTargets, type ColorCheckTarget, type ContrastCheck } from "./color-audit";
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

type BuilderProps = {
  system: DesignSystem;
  onApply: (palette: GeneratedPalette, group?: string) => void;
  onFinish?: () => void;
};

export function ColorBuilder({ system, onApply, onFinish, expanded = false }: BuilderProps & { expanded?: boolean }) {
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
    <details className={styles.builder} data-palette-builder data-expanded={expanded || undefined} open={expanded || undefined}>
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

export function ColorBuilderDialog(props: BuilderProps) {
  const copy = colorBuilderCopy;
  return <Dialog.Root>
    <Dialog.Trigger className={styles.contrastTrigger} aria-label={copy.openBuilder} title={copy.openBuilder}>
      <Icon name="colors" size={16} />
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop className={styles.contrastBackdrop} />
      <Dialog.Popup className={styles.contrastPopup}>
        <div className={styles.contrastHeader}>
          <Dialog.Title>{copy.builder}</Dialog.Title>
          <Dialog.Close className={styles.contrastClose} aria-label={copy.closeBuilder}><Icon name="close" size={18} /></Dialog.Close>
        </div>
        <ColorBuilder {...props} expanded />
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function ColorPairDialog({ checks: allChecks, mode, component, onNavigate }: { checks: ContrastCheck[]; mode: PaletteMode; component?: ComponentId; onNavigate: (target: ColorCheckTarget) => void }) {
  const [open, setOpen] = useState(false);
  const pending = useRef<ColorCheckTarget | null>(null);
  function navigate(target: ColorCheckTarget) {
    pending.current = target;
    setOpen(false);
  }
  const copy = colorBuilderCopy;
  const name = component ? title(component) : "System";
  const checks = component ? allChecks.filter((check) => check.component === component) : allChecks;
  const failures = checks.filter((check) => !check.passes);
  const ordered = [...failures, ...checks.filter((check) => check.passes)];
  const status = copy.componentPairStatus(name, failures.length, checks.length);

  return <Dialog.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={(isOpen) => {
    if (!isOpen && pending.current) {
      const target = pending.current;
      pending.current = null;
      onNavigate(target);
    }
  }}>
    <Dialog.Trigger className={styles.contrastTrigger} aria-label={status} title={status} data-failing={failures.length > 0 || undefined}>
      <Icon name={failures.length ? "warning" : "check"} size={16} />
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop className={styles.contrastBackdrop} />
      <Dialog.Popup className={styles.contrastPopup}>
        <div className={styles.contrastHeader}>
          <div>
            <Dialog.Title>{copy.componentPairs(name)} · {copy.modes[mode]}</Dialog.Title>
            <Dialog.Description>{copy.reportHelp}</Dialog.Description>
          </div>
          <Dialog.Close className={styles.contrastClose} aria-label={copy.closePairs}><Icon name="close" size={18} /></Dialog.Close>
        </div>
        <p className={styles.contrastSummary} data-failing={failures.length > 0 || undefined}>
          {failures.length ? copy.failures(numberText(failures.length), numberText(checks.length)) : copy.allPass(numberText(checks.length))}
        </p>
        <ul className={styles.contrastPairs} aria-label={copy.pairResults}>
          {ordered.map((check) => {
            const targets = colorCheckTargets(check);
            return <li key={check.id} data-contrast-check={check.id} data-failing={!check.passes || undefined}>
            <div className={styles.pairHeading}>
              <strong>{check.label}</strong>
              <span>{check.passes ? copy.pass : copy.belowTarget}</span>
            </div>
            <span>{ratioText(check.ratio)}:1 / {copy.required} {numberText(check.minimum)}:1</span>
            <code>{check.foreground} {copy.on} {check.background}</code>
            {targets.ink && <div className={styles.pairActions}>
              <button type="button" onClick={() => navigate(targets.ink!)}>
                {targets.ink.derived ? "View source" : "Edit"} {targets.ink.selection === "colors" ? "global" : title(targets.ink.selection)} {targets.ink.key} {targets.ink.derived ? "(derived color)" : ""}
              </button>
              {targets.surface && (targets.surface.selection !== targets.ink.selection || targets.surface.key !== targets.ink.key) && <button type="button" onClick={() => navigate(targets.surface!)}>
                Edit {targets.surface.selection === "colors" ? "global" : title(targets.surface.selection)} {targets.surface.key}
              </button>}
            </div>}
          </li>;
          })}
        </ul>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
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
