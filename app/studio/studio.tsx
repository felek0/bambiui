"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { usePathname, useRouter } from "next/navigation";
import { Button, NavItem, SegmentedControl } from "./controls";
import { BrandMark, Icon } from "./icons";
import { brandColor } from "./brand";
import { Preview } from "./preview";
import { DeveloperView } from "./developer";
import { ColorBuilder, ColorBuilderDialog, ColorPairDialog, ContrastReport } from "./color-builder";
import { auditSystemColors, type ColorCheckTarget } from "./color-audit";
import { mixColors, type GeneratedPalette, type PaletteMode } from "./color-engine";
import { copy as t, tokenImpact } from "./studio-copy";
import {
  componentIds,
  componentEditableTokenKeys,
  colorScaleRoles,
  colorScaleStops,
  typographyFields,
  typographyVariants,
  defaultTypography,
  fontFamilyPresets,
  fontFamilyLabels,
  googleFontUrl,
  resolveFontFamily,
  resolveColorScale,
  resolveTypography,
  shareNonColorTokens,
  defaultSystem,
  exportCSS,
  isComponentKey,
  parseDesignSystem,
  resolveComponent,
  STORAGE_KEY,
  tokenFields,
  toCSSVariables,
  type ComponentId,
  type ColorScaleRole,
  type ColorScaleStop,
  type ComponentTokens,
  type TypographyVariant,
  type TypographyTokens,
  type DesignSystem,
  type ThemeTokens,
  type TokenField,
  type TokenValues,
} from "./tokens";
import { loadSystems, saveSystems, SYSTEMS_KEY, type SystemCollection } from "./systems";

type Selection = "overview" | "colors" | "spacing" | ComponentId;
type View = "design" | "develop";

const spacingGroups: { label: string; keys: readonly (keyof TokenValues)[] }[] = [
  { label: "Shape", keys: ["radius", "borderWidth"] },
  { label: "Layout spacing", keys: ["paddingX", "paddingY", "gap", "margin"] },
  { label: "Spacing scale", keys: ["spacingSm", "spacingMd", "spacingLg"] },
  { label: "Type & control sizing", keys: ["fontSize", "controlHeightSm", "controlHeightMd", "controlHeightLg"] },
];

const componentGroups: { label: string; ids: readonly ComponentId[] }[] = [
  { label: "Actions", ids: ["button"] },
  { label: "Forms", ids: ["input", "switch", "checkbox"] },
  { label: "Content", ids: ["card", "badge", "text"] },
];

function workspaceHref(view: View, selection: Selection) {
  const prefix = view === "develop" ? "/develop" : "";
  return `${prefix}${selection === "overview" ? "" : `/${selection}`}` || "/";
}

function isValidToken(field: TokenField, text: string) {
  if (field.type === "color") return /^#[\da-f]{6}$/i.test(text);
  const number = Number(text);
  return (
    text.trim() !== "" &&
    Number.isFinite(number) &&
    number >= field.min! &&
    number <= field.max!
  );
}

function TokenControl({
  field,
  value,
  overridden,
  derivedOutline,
  impact,
  highlighted,
  compact = false,
  onChange,
  onReset,
  onFinish,
}: {
  field: TokenField;
  value: string | number;
  overridden?: boolean;
  derivedOutline?: string;
  impact?: string;
  highlighted?: boolean;
  compact?: boolean;
  onChange: (value: string | number) => void;
  onReset: () => void;
  onFinish: () => void;
}) {
  const label = t.tokenLabels[field.key];
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [sliderOpen, setSliderOpen] = useState(false);
  const isColor = field.type === "color";
  const displayed = draft ?? String(value);
  const valid = isValidToken(field, displayed);
  return (
    <div className="token-control" data-highlighted={highlighted || undefined} data-compact={compact || undefined}>
      <div className="token-control-heading flex items-center justify-between gap-2">
        <label
          htmlFor={`token-${field.key}`}
          title={compact ? label : undefined}
          className="text-[12px] studio-text-secondary"
        >
          {label}
        </label>
        {overridden === true && (
          <button
            type="button"
            className="inherit-button"
            aria-label={t.resetOverride(label)}
            title={t.resetTip}
            onClick={() => {
              setDraft(null);
              onReset();
              // The reset control disappears; keep focus in the field it affected.
              inputRef.current?.focus();
            }}
          >
            <Icon name="reset" size={11} />
            {!compact && t.override}
          </button>
        )}
        {overridden === false && (
          <span className="inherit-button" title={t.inheritedTip}>
            <Icon name="link" size={11} />
            {!compact && t.inherited}
          </span>
        )}
        {compact && overridden !== undefined && <span className="sr-only" id={`source-${field.key}`}>{overridden ? "Component override" : t.inheritedTip}</span>}
        {compact && impact && <button type="button" className="token-usage-trigger" aria-label={`${label} usage details`} title={`${label} usage details`} aria-expanded={usageOpen} aria-controls={usageOpen ? `token-${field.key}-usage` : undefined} onClick={() => setUsageOpen(!usageOpen)}>ⓘ</button>}
      </div>
      <div className="token-input" onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onFinish();
      }}>
        {isColor && (
          <input
            type="color"
            aria-label={t.colorPicker(label)}
            value={String(value)}
            onChange={(event) => {
              setDraft(null);
              onChange(event.target.value);
            }}
          />
        )}
        <input
          ref={inputRef}
          id={`token-${field.key}`}
          type={isColor ? "text" : "number"}
          min={field.min}
          max={field.max}
          step="any"
          spellCheck={false}
          aria-invalid={!valid}
          aria-describedby={[compact && overridden !== undefined ? `source-${field.key}` : null, !valid ? `error-${field.key}` : null].filter(Boolean).join(" ") || undefined}
          value={displayed}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (isValidToken(field, next))
              onChange(isColor ? next : Number(next));
          }}
          onBlur={() => setDraft(null)}
        />
        <span>{isColor ? "HEX" : "px"}</span>
      </div>
      {compact && !isColor && <button type="button" className="token-slider-trigger" aria-label={`${sliderOpen ? "Hide" : "Show"} ${label} slider`} title={`${sliderOpen ? "Hide" : "Show"} ${label} slider`} aria-expanded={sliderOpen} aria-controls={sliderOpen ? `token-${field.key}-slider` : undefined} onClick={() => setSliderOpen(!sliderOpen)}><Icon name="sliders" size={14} /></button>}
      {derivedOutline && <p className="text-[11px] studio-text-secondary">{t.derivedOutline}: {derivedOutline}</p>}
      {!isColor && (!compact || sliderOpen) && (
        <input
          onBlur={onFinish}
          className="token-range"
          id={`token-${field.key}-slider`}
          type="range"
          aria-label={t.slider(label)}
          min={field.min}
          max={field.max}
          value={Number(value)}
          onChange={(event) => {
            setDraft(null);
            onChange(Number(event.target.value));
          }}
        />
      )}
      {compact && impact && usageOpen && <p className="token-usage-copy" id={`token-${field.key}-usage`}>{impact}</p>}
      {!valid && (
        <p className="text-[10px] studio-text-danger" id={`error-${field.key}`}>
          {isColor
            ? t.invalidColor
            : t.invalidNumber(field.min!, field.max!)}
        </p>
      )}
    </div>
  );
}

function ScaleStopControl({ role, stop, value, overridden, onChange, onReset, onFinish }: {
  role: ColorScaleRole;
  stop: ColorScaleStop;
  value: string;
  overridden: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
  onFinish: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const label = `${role} ${stop}`;
  const valid = /^#[0-9a-f]{6}$/i.test(draft ?? value);
  return <div className="scale-stop-control">
    <label htmlFor={`scale-${role}-${stop}`}>{label}</label>
    <div className="scale-stop-input" onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) onFinish();
    }}>
      <input type="color" aria-label={`${label} color picker`} value={value} onChange={(event) => { setDraft(null); onChange(event.target.value); }} />
      <input id={`scale-${role}-${stop}`} type="text" value={draft ?? value} spellCheck={false} aria-invalid={!valid}
        onChange={(event) => { setDraft(event.target.value); if (/^#[0-9a-f]{6}$/i.test(event.target.value)) onChange(event.target.value); }}
        onBlur={() => setDraft(null)} />
      {overridden && <button type="button" aria-label={`Reset ${label} to generated color`} onClick={() => { setDraft(null); onReset(); }}>Reset</button>}
    </div>
    {!valid && <span className="studio-text-danger">Use a six-digit hex color.</span>}
  </div>;
}

function TypographyControl({ variant, field, value, onChange, onFinish }: {
  variant: TypographyVariant;
  field: (typeof typographyFields)[number];
  value: number;
  onChange: (value: number) => void;
  onFinish: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const number = Number(draft ?? value);
  const valid = (draft ?? String(value)).trim() !== "" && Number.isFinite(number) && number >= field.min && number <= field.max;
  const label = `${variant} ${field.label}`;
  return <div className="typography-control">
    <label htmlFor={`typography-${variant}-${field.key}`}>{field.label}</label>
    <div className="typography-input">
      <input id={`typography-${variant}-${field.key}`} type="number" step="any" min={field.min} max={field.max} value={draft ?? value}
        aria-label={label} aria-invalid={!valid}
        onChange={(event) => { setDraft(event.target.value); const next = Number(event.target.value); if (event.target.value.trim() && Number.isFinite(next) && next >= field.min && next <= field.max) onChange(next); }}
        onBlur={() => { setDraft(null); onFinish(); }} />
      {field.unit && <span>{field.unit}</span>}
    </div>
    {!valid && <span className="studio-text-danger">Use a value from {field.min} to {field.max}.</span>}
  </div>;
}

export default function Studio() {
  const [system, setSystem] = useState<DesignSystem>(defaultSystem);
  const [ready, setReady] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const segments = pathname.split("/").filter(Boolean);
  const view: View = segments[0] === "develop" ? "develop" : "design";
  const routeComponent = segments[view === "develop" ? 1 : 0];
  const selection: Selection = routeComponent === "colors" || routeComponent === "spacing"
    ? routeComponent
    : componentIds.find((id) => id === routeComponent) ?? "overview";
  const [query, setQuery] = useState("");
  const [activeTheme, setActiveTheme] = useState<PaletteMode>("light");
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.studioTheme = activeTheme;
    return () => { delete root.dataset.studioTheme; };
  }, [activeTheme]);
  const [scaleRole, setScaleRole] = useState<ColorScaleRole>("primary");
  const [selectedTypography, setSelectedTypography] = useState<TypographyVariant>("heading");
  const [editTarget, setEditTarget] = useState<{ selection: Selection; inputId: string } | null>(null);
  const [highlightedTarget, setHighlightedTarget] = useState<{ selection: Selection; inputId: string } | null>(null);
  function navigateToColorToken(target: ColorCheckTarget) {
    const next = { selection: target.selection, inputId: `token-${target.key}` };
    setHighlightedTarget(next);
    setEditTarget(next);
    router.push(workspaceHref("design", target.selection));
  }

  useEffect(() => {
    if (!ready || view !== "design" || !editTarget || selection !== editTarget.selection) return;
    const frame = requestAnimationFrame(() => {
      const input = document.getElementById(editTarget.inputId);
      if (input instanceof HTMLElement) {
        input.focus({ preventScroll: true });
        input.scrollIntoView({ block: "center" });
      }
      setEditTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, view, selection, editTarget, scaleRole]);

  const [status, setStatus] = useState<"loading" | "saved" | "draft" | "unsaved">("loading");
  const [notice, setNotice] = useState<"" | "loadError" | "storageError" | "imported" | "importError">("");
  const [importError, setImportError] = useState<"fileSize" | "invalidJson">("invalidJson");
  const [format, setFormat] = useState<"css" | "json">("css");
  const [copyStatus, setCopyStatus] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const importAsNew = useRef(false);
  const switcherRef = useRef<HTMLDetailsElement>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [collection, setCollection] = useState<SystemCollection>({ version: 1, activeId: "original", systems: [{ id: "original", system: defaultSystem }] });
  const collectionRef = useRef(collection);
  const history = useRef<{ undo: DesignSystem[]; redo: DesignSystem[]; group: string | null }>({ undo: [], redo: [], group: null });
  const currentSystem = useRef(system);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) switcherRef.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && switcherRef.current?.open) {
        switcherRef.current.open = false;
        switcherRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Read after hydration so the server and initial client render stay identical.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = localStorage.getItem(SYSTEMS_KEY) || localStorage.getItem(STORAGE_KEY);
        const loaded = loadSystems(localStorage);
        collectionRef.current = loaded;
        setCollection(loaded);
        const active = loaded.systems.find((entry) => entry.id === loaded.activeId)!.system;
        currentSystem.current = active;
        setSystem(active);
        setStatus(saved ? "saved" : "draft");
      } catch {
        setStatus("draft");
        setNotice("loadError");
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function finishEdit() {
    history.current.group = null;
  }

  function persist(next: SystemCollection) {
    collectionRef.current = next;
    setCollection(next);
    try {
      saveSystems(localStorage, next);
      setStatus("saved");
      return true;
    } catch {
      setStatus("unsaved");
      setNotice("storageError");
      return false;
    }
  }

  function activate(next: SystemCollection) {
    try {
      saveSystems(localStorage, next);
      setStatus("saved");
    } catch {
      setStatus("unsaved");
      setNotice("storageError");
      return false;
    }
    collectionRef.current = next;
    setCollection(next);
    const active = next.systems.find((entry) => entry.id === next.activeId)!.system;
    currentSystem.current = active;
    setSystem(active);
    history.current = { undo: [], redo: [], group: null };
    setHistoryCounts({ undo: 0, redo: 0 });
    setWorkspaceRevision((revision) => revision + 1);
    setEditTarget(null);
    switcherRef.current?.removeAttribute("open");
    return true;
  }

  function addSystem(duplicate: boolean, imported?: DesignSystem) {
    const id = crypto.randomUUID();
    const nextSystem = imported ?? (duplicate ? { ...currentSystem.current, name: `${currentSystem.current.name} copy` } : { ...defaultSystem });
    return activate({ ...collectionRef.current, activeId: id, systems: [...collectionRef.current.systems, { id, system: nextSystem }] });
  }

  function update(next: DesignSystem, group?: string, record = true) {
    if (JSON.stringify(currentSystem.current) === JSON.stringify(next)) return;
    if (record) {
      if (!group || history.current.group !== group) {
        history.current.undo.push(currentSystem.current);
        if (history.current.undo.length > 50) history.current.undo.shift();
      }
      history.current.redo = [];
      history.current.group = group ?? null;
    }
    currentSystem.current = next;
    setSystem(next);
    setHistoryCounts({ undo: history.current.undo.length, redo: history.current.redo.length });
    persist({ ...collectionRef.current, systems: collectionRef.current.systems.map((entry) =>
      entry.id === collectionRef.current.activeId ? { ...entry, system: next } : entry),
    });
  }

  function travel(direction: "undo" | "redo") {
    const from = history.current[direction];
    const previous = from.pop();
    if (!previous) return;
    history.current[direction === "undo" ? "redo" : "undo"].push(currentSystem.current);
    finishEdit();
    update(previous, undefined, false);
    setWorkspaceRevision((revision) => revision + 1);
  }

  const theme = system.themes[activeTheme];
  const auditChecks = useMemo(() => auditSystemColors(theme, activeTheme), [theme, activeTheme]);
  const failingChecks = auditChecks.filter((check) => !check.passes);
  const globalIssueCount = failingChecks.filter((check) => !check.component).length;
  const componentIssueCount = (id: ComponentId) => failingChecks.filter((check) => check.component === id).length;
  useEffect(() => {
    if (!ready) return;
    const url = googleFontUrl(theme.fontFamily);
    if (!url) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = url;
    stylesheet.referrerPolicy = "no-referrer";
    document.head.append(stylesheet);
    return () => stylesheet.remove();
  }, [ready, theme.fontFamily]);
  const previewColors = {
    "--preview-grid-dot": mixColors(theme.global.foreground, theme.global.background, 0.18),
  } as CSSProperties;
  const isGlobal = selection === "overview" || selection === "colors" || selection === "spacing";
  const component: ComponentId = isGlobal ? "button" : selection;
  const values = isGlobal ? theme.global : resolveComponent(theme, component);
  const fields = tokenFields.filter(
    ({ key, type }) => isGlobal
      ? (selection !== "colors" || type === "color") && (selection !== "spacing" || type === "number")
      : isComponentKey(key) && (componentEditableTokenKeys(component).includes(key)),
  );
  const colorFields = fields.filter((field) => field.type === "color");
  const numberFields = fields.filter((field) => field.type === "number");

  const cssOutput = useMemo(() => exportCSS({ themes: system.themes }), [system.themes]);
  const output = format === "css" ? cssOutput : JSON.stringify(system, null, 2);

  function applyPalette(palette: GeneratedPalette, group?: string) {
    update({ ...system, themes: {
      light: { ...system.themes.light, source: palette.source, global: { ...system.themes.light.global, ...palette.light.tokens } },
      dark: { ...system.themes.dark, source: palette.source, global: { ...system.themes.dark.global, ...palette.dark.tokens } },
    } }, group);
  }

  function updateTheme(next: ThemeTokens, mode: PaletteMode = activeTheme, group?: string) {
    update(shareNonColorTokens({ ...system, themes: { ...system.themes, [mode]: next } }, mode), group);
  }

  function setToken(key: keyof TokenValues, value: string | number) {
    if (isGlobal)
      updateTheme({ ...theme, global: { ...theme.global, [key]: value } }, activeTheme, `global-${activeTheme}-${key}`);
    else
      updateTheme({
        ...theme,
        components: {
          ...theme.components,
          [component]: { ...theme.components[component], [key]: value },
        },
      }, activeTheme, `component-${activeTheme}-${component}-${key}`);
  }

  function setScaleStop(stop: ColorScaleStop, value: string) {
    updateTheme({ ...theme, colorScales: {
      ...theme.colorScales,
      [scaleRole]: { ...theme.colorScales?.[scaleRole], [stop]: value },
    } }, activeTheme, `scale-${activeTheme}-${scaleRole}-${stop}`);
  }

  function resetScaleStop(stop: ColorScaleStop) {
    const roleOverrides = { ...theme.colorScales?.[scaleRole] };
    delete roleOverrides[stop];
    updateTheme({ ...theme, colorScales: { ...theme.colorScales, [scaleRole]: roleOverrides } });
  }

  function setTypography(variant: TypographyVariant, field: keyof TypographyTokens, value: number) {
    updateTheme({ ...theme, typography: {
      ...theme.typography,
      [variant]: { ...resolveTypography(theme, variant), [field]: value },
    } }, activeTheme, `typography-${variant}-${field}`);
  }

  function resetToken(key: keyof ComponentTokens) {
    const overrides = { ...theme.components[component] };
    delete overrides[key];
    updateTheme({
      ...theme,
      components: { ...theme.components, [component]: overrides },
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("clipboardError");
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([output], {
        type: format === "css" ? "text/css" : "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bambiui-tokens.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderTokenField(field: TokenField) {
    return <TokenControl
      key={`${workspaceRevision}-${activeTheme}-${selection}-${field.key}`}
      field={field}
      compact={!isGlobal || selection === "spacing"}
      value={values[field.key as keyof typeof values]}
      impact={isGlobal ? undefined : tokenImpact(component, field.key as keyof ComponentTokens)}
      highlighted={highlightedTarget?.selection === selection && highlightedTarget.inputId === `token-${field.key}`}
      derivedOutline={!isGlobal && component === "badge" && field.key === "border" && !Object.hasOwn(theme.components.badge, "border")
        ? toCSSVariables(theme, activeTheme)["--badge-neutral-outline"] : undefined}
      overridden={isGlobal ? undefined : Object.hasOwn(theme.components[component], field.key)}
      onChange={(value) => setToken(field.key, value)}
      onReset={() => resetToken(field.key as keyof ComponentTokens)}
      onFinish={finishEdit}
    />;
  }

  return (
    <div className="studio-shell" data-view={view}>
      <a className="skip-link" href="#workspace">
        {t.skip}
      </a>
      <header className="studio-header">
        <Link href="/" className="brand" aria-label={t.home}>
          <span className="brand-mark" style={{ color: brandColor }}>
            <BrandMark size={24} />
          </span>
          bambi<span className="brand-ui">ui</span>
          <span className="beta-tag">{t.beta}</span>
        </Link>
        <nav className="view-switch" aria-label={t.workspaceView}>
          <Link href={workspaceHref("design", selection)} aria-current={view === "design" ? "page" : undefined} data-active={view === "design" || undefined}>
            <Icon name="grid" size={14} />{t.design}
          </Link>
          <Link href={workspaceHref("develop", selection)} aria-current={view === "develop" ? "page" : undefined} data-active={view === "develop" || undefined}>
            <Icon name="code" size={15} />{t.develop}
          </Link>
        </nav>
        <details className="system-switcher" ref={switcherRef} onToggle={(event) => {
          if (event.currentTarget.open) setRenameDraft(system.name);
        }}>
          <summary aria-label={`${t.selectSystem}: ${system.name || t.untitled}`}>
            <span className="system-switcher-name">{system.name || t.untitled}</span>
            <Icon name="chevron" size={14} />
          </summary>
          <div className="system-switcher-panel">
            <div className="system-switcher-heading">{t.yourSystems}</div>
            <div className="system-switcher-list">
              {collection.systems.map((entry) => <button key={entry.id} type="button" aria-current={entry.id === collection.activeId ? "true" : undefined}
                onClick={() => entry.id === collection.activeId ? switcherRef.current?.removeAttribute("open") : activate({ ...collectionRef.current, activeId: entry.id })}>
                <span>{entry.system.name || t.untitled}</span>{entry.id === collection.activeId && <Icon name="check" size={14} />}
              </button>)}
            </div>
            <div className="system-switcher-actions">
              <button type="button" onClick={() => addSystem(false)}>{t.newSystem}</button>
              <button type="button" onClick={() => addSystem(true)}>{t.duplicateSystem}</button>
              <button type="button" onClick={() => { importAsNew.current = true; switcherRef.current?.removeAttribute("open"); importRef.current?.click(); }}>{t.importAsNew}</button>
              {collection.systems.length > 1 && <button type="button" onClick={() => {
                if (!window.confirm(t.deleteSystemConfirm(system.name || t.untitled))) return;
                const systems = collectionRef.current.systems.filter((entry) => entry.id !== collectionRef.current.activeId);
                activate({ ...collectionRef.current, activeId: systems[0].id, systems });
              }}>{t.deleteSystem}</button>}
            </div>
            <form className="system-rename" onSubmit={(event) => {
              event.preventDefault();
              const name = renameDraft.trim();
              if (name && name !== system.name) update({ ...currentSystem.current, name });
              switcherRef.current?.removeAttribute("open");
            }}>
              <label htmlFor="design-system-name">{t.name}</label>
              <div><input id="design-system-name" maxLength={80} required value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
                <button type="submit">{t.rename}</button></div>
            </form>
          </div>
        </details>
        <div className="header-workspace-controls">
          {view === "develop" && <SegmentedControl aria-label={t.theme} value={activeTheme} onValueChange={(next) => setActiveTheme(next as PaletteMode)}>
            <SegmentedControl.Item value="light" aria-label={t.light} title={t.light}><Icon name="sun" size={16} /></SegmentedControl.Item>
            <SegmentedControl.Item value="dark" aria-label={t.dark} title={t.dark}><Icon name="moon" size={16} /></SegmentedControl.Item>
          </SegmentedControl>}
          {view === "design" && <a className="mobile-editor-link" href="#token-editor">{t.jumpToTokens} <Icon name="arrow" size={12} /></a>}
        </div>
        <div className="header-actions">

          <span className="save-status">
            <span
              className={`status-dot ${status === "unsaved" ? "warning" : ""}`}
            />
            {t[status]}
          </span>
          <Button
            aria-label={t.importAria}
            disabled={!ready}
            startIcon={<Icon name="upload" />}
            onClick={() => { importAsNew.current = false; importRef.current?.click(); }}
          >
            {t.import}
          </Button>
          <input
            ref={importRef}
            className="hidden"
            type="file"
            accept=".json,application/json"
            aria-label={t.importJson}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const asNew = importAsNew.current;
              importAsNew.current = false;
              try {
                if (file.size > 100_000)
                  throw new Error(t.fileSize);
                const imported = parseDesignSystem(await file.text());
                if (asNew) {
                  if (!addSystem(false, imported)) return;
                } else {
                  if (!window.confirm(t.replace)) return;
                  update(imported);
                  setWorkspaceRevision((revision) => revision + 1);
                }
                setNotice("imported");
              } catch (error) {
                setImportError(error instanceof Error && error.message === t.fileSize ? "fileSize" : "invalidJson");
                setNotice("importError");
              }
            }}
          />
          <Dialog.Root onOpenChange={() => setCopyStatus("")}>
            <Dialog.Trigger
              render={
                <Button
                  variant="primary"
                  startIcon={<Icon name="download" />}
                />
              }
              aria-label={t.export}
              disabled={!ready}
            >
              {t.export}
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop className="studio-backdrop" />
              <Dialog.Popup className="export-dialog">
                <div className="flex items-center justify-between">
                  <Dialog.Title className="text-lg font-semibold">
                    {t.exportTitle}
                  </Dialog.Title>
                  <Dialog.Close
                    render={
                      <Button
                        variant="ghost"
                        iconOnly
                        aria-label={t.closeExport}
                      />
                    }
                  >
                    <Icon name="close" />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="mt-2 text-sm studio-text-muted">
                  {t.exportDescription}
                </Dialog.Description>
                <SegmentedControl
                  className="mt-5"
                  aria-label={t.exportFormat}
                  value={format}
                  onValueChange={(next) => {
                    setFormat(next);
                    setCopyStatus("");
                  }}
                >
                  {(["css", "json"] as const).map((item) => (
                    <SegmentedControl.Item key={item} value={item}>
                      {item.toUpperCase()}
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl>
                <pre
                  className="code-output"
                  tabIndex={0}
                  aria-label={t.exported}
                >
                  <code>{output}</code>
                </pre>
                <p role="status" className="min-h-5 text-xs studio-text-muted">
                  {copyStatus === "copied" ? t.copied : copyStatus === "clipboardError" ? t.clipboardError : ""}
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button onClick={copy}>{t.copy} {format.toUpperCase()}</Button>
                  <Button
                    variant="primary"
                    startIcon={<Icon name="download" />}
                    onClick={download}
                  >
                    {t.download}
                  </Button>
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </header>

      <aside className="studio-sidebar" aria-label={t.library}>
        <div className="sidebar-navigation">
          <div className="sidebar-section-label">{t.workspace.toUpperCase()}</div>
          <NavItem
            icon={<Icon name="grid" />}
            current={selection === "overview"}
            href={workspaceHref(view, "overview")}
          >
            {t.overview}
          </NavItem>
          <div className="sidebar-section-label sidebar-foundations-label">{t.sidebarFoundations.toUpperCase()}</div>
          <NavItem icon={<Icon name="colors" />} href={workspaceHref(view, "colors")} current={selection === "colors"}
            ariaLabel={ready && globalIssueCount ? `Colors, ${t.sidebarContrastWarning(globalIssueCount, activeTheme)}` : undefined}
            end={ready && globalIssueCount > 0 && <span className="nav-indicators"><span className="nav-contrast-warning" title={t.sidebarContrastWarning(globalIssueCount, activeTheme)}><Icon name="warning" size={14} /></span></span>}
          >Colors</NavItem>
          <NavItem icon={<Icon name="sliders" />} href={workspaceHref(view, "spacing")} current={selection === "spacing"}>Shape &amp; spacing</NavItem>
          <div className="sidebar-divider" />
          <div className="sidebar-section-label">
            {t.components.toUpperCase()}
          </div>
          <div className="search-field">
            <Icon name="search" size={14} />
            <input
              aria-label={t.search}
              placeholder={t.find}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <nav aria-label={t.components} className="component-nav">
            {componentGroups.map((group) => {
              const matches = group.ids.filter((id) => t.componentNames[id].toLowerCase().includes(query.toLowerCase().trim()));
              if (!matches.length) return null;
              return <div className="component-group" role="group" aria-label={group.label} key={group.label}>
                <div className="component-group-label" aria-hidden="true">{group.label}</div>
                {matches.map((id) => {
                  const overridden = Object.keys(theme.components[id]).length > 0;
                  const issues = ready ? componentIssueCount(id) : 0;
                  return <NavItem
                    key={id}
                    icon={<Icon name={id} />}
                    current={selection === id}
                    ariaLabel={issues ? `${t.componentNames[id]}, ${t.sidebarContrastWarning(issues, activeTheme)}${overridden ? t.custom : ""}` : undefined}
                    end={(overridden || issues > 0) && <span className="nav-indicators">
                      {overridden && <><span className="override-dot" aria-hidden="true" title={t.customTitle} /><span className="sr-only">{t.custom}</span></>}
                      {issues > 0 && <span className="nav-contrast-warning" title={t.sidebarContrastWarning(issues, activeTheme)}><Icon name="warning" size={14} /></span>}
                    </span>}
                    href={workspaceHref(view, id)}
                  >
                    {t.componentNames[id]}
                  </NavItem>;
                })}
              </div>;
            })}
            {!componentIds.some((id) => t.componentNames[id].toLowerCase().includes(query.toLowerCase().trim())) && (
              <p className="p-3 text-xs studio-text-muted">{t.noComponents}</p>
            )}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <a
            className="docs-link"
            href="https://base-ui.com/react/overview/quick-start"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="box" size={14} />
            {t.builtWith}
            <Icon name="arrow" size={14} />
          </a>
        </div>
      </aside>

      <main className={`studio-main studio-main--${view}`} id="workspace" tabIndex={-1}>
        {view === "design" ? (
          <h1 className="sr-only">{selection === "overview" ? t.overviewTitle : selection === "colors" ? "Colors" : selection === "spacing" ? "Shape & spacing" : t.componentTitle(t.componentNames[selection])}</h1>
        ) : (
          <div className="workspace-heading">
            <h1>{selection === "overview" ? "Token reference" : selection === "colors" ? "Colors documentation" : selection === "spacing" ? "Shape & spacing documentation" : `${t.componentNames[selection]} documentation`}</h1>
            <p>{selection === "colors" || selection === "spacing" ? "Live token values and CSS references for your design system." : "React usage, props and resolved theme tokens for your design system."}</p>
          </div>
        )}
        <div className="workspace-tabs workspace-views">
          <div
            className={`workspace-content workspace-content--${view}`}
            id="workspace-content"
            tabIndex={-1}
            data-design={view === "design" || undefined}
            style={view === "design" ? previewColors : undefined}
          >
            {notice && (
              <div role="status" className="notice">
                <span>{notice === "importError" ? `${t.importFailed}: ${t[importError]}` : t[notice]}</span>
                <Button
                  variant="ghost"
                  iconOnly
                  aria-label={t.dismiss}
                  onClick={() => setNotice("")}
                >
                  <Icon name="close" size={14} />
                </Button>
              </div>
            )}
            <section hidden={view !== "design"} aria-label={t.design} className="workspace-panel workspace-panel--design preview-canvas">
              <div className="preview-frame">
                <div className="canvas-history" role="group" aria-label="Edit history">
                  <Button iconOnly aria-label={t.undo} title={t.undo} disabled={!ready || historyCounts.undo === 0} onClick={() => travel("undo")}><Icon name="undo" size={16} /></Button>
                  <Button iconOnly aria-label={t.redo} title={t.redo} disabled={!ready || historyCounts.redo === 0} onClick={() => travel("redo")}><Icon name="redo" size={16} /></Button>
                </div>
                <div className="canvas-theme">
                  <SegmentedControl aria-label={t.theme} value={activeTheme} onValueChange={(next) => setActiveTheme(next as PaletteMode)}>
                    <SegmentedControl.Item value="light" aria-label={t.light} title={t.light}><Icon name="sun" size={16} /></SegmentedControl.Item>
                    <SegmentedControl.Item value="dark" aria-label={t.dark} title={t.dark}><Icon name="moon" size={16} /></SegmentedControl.Item>
                  </SegmentedControl>
                </div>
                <Preview key={collection.activeId} selected={selection} system={system} mode={activeTheme} active={view === "design"} onSelectColorRole={setScaleRole} onEditToken={(nextSelection, inputId) => setEditTarget({ selection: nextSelection, inputId })} />
              </div>
            </section>
            <section hidden={view !== "develop"} aria-label={t.develop} className="workspace-panel workspace-panel--develop">
              <DeveloperView selected={selection} system={system} mode={activeTheme} cssOutput={cssOutput} />
            </section>
          </div>
        </div>

      </main>

      <aside
        className="token-editor"
        hidden={view !== "design"}
        id="token-editor"
        tabIndex={-1}
        aria-label={t.editor}
      >
        <div className="editor-title">
          <Icon name={selection === "colors" ? "colors" : isGlobal ? "sliders" : component} />
          <h2>{selection === "spacing" ? "Shape & spacing" : `${selection === "colors" ? "Global colors" : isGlobal ? t.inspector : t.componentTokens(t.componentNames[component])} · ${activeTheme === "light" ? t.light : t.dark}`}</h2>
          {ready && (selection === "colors" || !isGlobal) && <div className="editor-title-actions">
            <ColorPairDialog key={`${collection.activeId}-${activeTheme}-${selection}`} checks={auditChecks} mode={activeTheme} component={isGlobal ? undefined : component} onNavigate={navigateToColorToken} />
            {selection === "colors" && <ColorBuilderDialog key={`${collection.activeId}-${workspaceRevision}`} system={system} onFinish={finishEdit} onApply={applyPalette} />}
          </div>}
          <a className="mobile-preview-link" href="#workspace-content">{view === "design" ? t.backToPreview : t.backToCode}</a>
        </div>

        <fieldset disabled={!ready} className={`editor-fields${!isGlobal || selection === "colors" || selection === "spacing" ? " editor-fields--compact" : ""}${!isGlobal ? " editor-fields--component" : ""}${selection === "spacing" ? " editor-fields--spacing" : ""}`}>
          <legend className="sr-only">{selection === "spacing" ? "Edit shared shape and spacing tokens" : t.editTokens(activeTheme === "light" ? t.light : t.dark)}</legend>
          {isGlobal && selection === "overview" && <div className="editor-intro">
            <span className="scope-icon"><Icon name="sliders" size={18} /></span>
            <div>
              <h3>{t.foundations}</h3>
              <p>{t.foundationsHint}</p>
              <p>{t.mixedScope}</p>
            </div>
          </div>}
          {ready && selection === "overview" && <ColorBuilder key={workspaceRevision} system={system} onFinish={finishEdit} onApply={applyPalette} />}
          {selection === "overview" && <ContrastReport key={activeTheme} theme={theme} mode={activeTheme} />}
          {selection === "spacing" && spacingGroups.map((group) => <section className="token-section" key={group.label}>
            <div className="section-heading"><h3>{group.label}</h3>{group.label === "Shape" && <span>{t.sharedThemes}</span>}</div>
            <div className="number-fields">{numberFields.filter((field) => group.keys.includes(field.key)).map(renderTokenField)}</div>
          </section>)}
          {(
            [
              {
                type: "color",
                heading: t.colors,
                hint: t.themeOnly(activeTheme),
                className: "color-fields",
                items: colorFields,
              },
              {
                type: "number",
                heading: t.shape,
                hint: t.sharedThemes,
                className: "number-fields",
                items: numberFields,
              },
            ] as const
          ).filter((group) => group.items.length > 0 && selection !== "spacing").map((group) => (
            <section className="token-section" key={group.type}>
              <div className="section-heading">
                <h3>{group.heading}</h3>
                <span>{group.hint}</span>
              </div>
              <div className={group.className}>{group.items.map(renderTokenField)}</div>
            </section>
          ))}
          {isGlobal && selection !== "spacing" && <section className="token-section foundation-editor" id="color-scales">
            <div className="section-heading"><h3>Color scale</h3><span>{t.themeOnly(activeTheme)}</span></div>
            <label htmlFor="color-scale-role">Color role</label>
            <select id="color-scale-role" value={scaleRole} onChange={(event) => setScaleRole(event.target.value as ColorScaleRole)}>
              {colorScaleRoles.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <p>Stops follow the current {activeTheme} theme role until overridden. Scale edits affect the reference and CSS export; component colors follow semantic roles.</p>
            <div className="scale-stop-list">
              {colorScaleStops.map((stop) => <ScaleStopControl key={`${workspaceRevision}-${activeTheme}-${scaleRole}-${stop}`} role={scaleRole} stop={stop}
                value={resolveColorScale(theme, activeTheme, scaleRole)[stop]}
                overridden={Object.hasOwn(theme.colorScales?.[scaleRole] ?? {}, stop)}
                onChange={(value) => setScaleStop(stop, value)} onReset={() => resetScaleStop(stop)} onFinish={finishEdit} />)}
            </div>
          </section>}
          {(selection === "overview" || selection === "text") && <section className="token-section foundation-editor" id="font-family-tokens">
            <div className="section-heading"><h3>Font family</h3><span>{t.sharedThemes}</span></div>
            <div className="font-family-row"><label htmlFor="font-family-preset">Font family</label>
            <select id="font-family-preset" value={theme.fontFamily} onChange={(event) => updateTheme({ ...theme, fontFamily: event.target.value as ThemeTokens["fontFamily"] })}>
              <optgroup label="Local fonts">
                {fontFamilyPresets.filter((preset) => !googleFontUrl(preset)).map((preset) => <option key={preset} value={preset}>{fontFamilyLabels[preset]}</option>)}
              </optgroup>
              <optgroup label="Google Fonts · requires internet">
                {fontFamilyPresets.filter((preset) => googleFontUrl(preset)).map((preset) => <option key={preset} value={preset}>{fontFamilyLabels[preset]}</option>)}
              </optgroup>
            </select></div>
            <div className="font-family-preview"><p style={{ fontFamily: resolveFontFamily(theme), fontSize: 18, lineHeight: 1.4 }}>Aa Bb 123</p>
            {selection === "text" && theme.fontFamily !== defaultSystem.themes[activeTheme].fontFamily && <Button type="button" variant="ghost" onClick={() => updateTheme({ ...theme, fontFamily: defaultSystem.themes[activeTheme].fontFamily })}>Reset font family</Button>}</div>
            {selection === "text" ? <><p>Google Fonts presets request Google when selected.</p><details className="font-family-help"><summary>About font loading</summary><p>Shared by both themes. Google Fonts load only when selected, sending a request to Google; an internet connection is required. Local presets make no font request. Exported CSS imports the selected Google font; offline viewers use its fallback.</p></details></> : <p>Shared by both themes. Google Fonts load only when selected, sending a request to Google; an internet connection is required. Local presets make no font request. Exported CSS imports the selected Google font; offline viewers use its fallback.</p>}
          </section>}
          {selection === "text" && !isGlobal && <section className="token-section foundation-editor" id="typography-tokens">
            <div className="section-heading"><h3>Text styles</h3><span>{t.sharedThemes}</span></div>
            <div className="typography-style-row"><label htmlFor="typography-variant">Style</label>
              <select id="typography-variant" value={selectedTypography} onChange={(event) => setSelectedTypography(event.target.value as TypographyVariant)}>
                {typographyVariants.map((variant) => <option key={variant} value={variant}>{variant === "heading" ? "Legacy heading" : variant.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="typography-controls">
              {typographyFields.map((field) => <TypographyControl key={`${workspaceRevision}-${activeTheme}-${selectedTypography}-${field.key}`} variant={selectedTypography} field={field}
                value={resolveTypography(theme, selectedTypography)[field.key]}
                onChange={(value) => setTypography(selectedTypography, field.key, value)} onFinish={finishEdit} />)}
            </div>
            {typographyFields.some((field) => resolveTypography(theme, selectedTypography)[field.key] !== defaultTypography[selectedTypography][field.key]) && <Button type="button" variant="ghost" className="typography-reset" onClick={() => updateTheme({ ...theme, typography: { ...theme.typography, [selectedTypography]: { ...defaultTypography[selectedTypography] } } })}>
              Reset {selectedTypography}
            </Button>}
          </section>}
          <Button
            className="reset-button"
            fullWidth
            startIcon={<Icon name="reset" size={14} />}
            onClick={() => {
              if (
                !window.confirm(
                  isGlobal
                    ? selection === "colors" ? `Reset ${activeTheme} global colors? Color scale and component overrides will be kept; shared dimensions and font family will not change.`
                      : selection === "spacing" ? "Reset shared shape, spacing and sizing in both themes? Colors and component overrides will be kept."
                      : t.confirmGlobal(activeTheme === "light" ? t.light : t.dark)
                    : t.confirmComponent(activeTheme === "light" ? t.light : t.dark, t.componentNames[component]),
                )
              )
                return;
              updateTheme(
                isGlobal
                  ? { ...theme, source: selection === "spacing" ? theme.source : defaultSystem.themes[activeTheme].source,
                      fontFamily: selection === "overview" ? defaultSystem.themes[activeTheme].fontFamily : theme.fontFamily,
                      global: Object.fromEntries(tokenFields.map(({ key, type }) => [key,
                        selection === "overview" || selection === "colors" && type === "color" || selection === "spacing" && type === "number"
                          ? defaultSystem.themes[activeTheme].global[key] : theme.global[key],
                      ])) as TokenValues }
                  : {
                      ...theme,
                      components: { ...theme.components, [component]: {} },
                    },
              );
            }}
          >
            {selection === "spacing" ? "Reset shared dimensions" : isGlobal ? t.resetGlobal : t.resetComponent}
          </Button>
        </fieldset>

      </aside>
    </div>
  );
}
