"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { usePathname } from "next/navigation";
import { Button, NavItem, SegmentedControl } from "./controls";
import { BrandMark, Icon } from "./icons";
import { Preview } from "./preview";
import { DeveloperView } from "./developer";
import { ColorBuilder, ContrastReport } from "./color-builder";
import { mixColors, type PaletteMode } from "./color-engine";
import { copy as t } from "./studio-copy";
import {
  componentIds,
  componentEditableTokenKeys,
  colorScaleRoles,
  colorScaleStops,
  typographyFields,
  typographyVariants,
  defaultTypography,
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

type Selection = "overview" | "colors" | "spacing" | ComponentId;
type View = "design" | "develop";

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
  onChange,
  onReset,
  onFinish,
}: {
  field: TokenField;
  value: string | number;
  overridden?: boolean;
  derivedOutline?: string;
  onChange: (value: string | number) => void;
  onReset: () => void;
  onFinish: () => void;
}) {
  const label = t.tokenLabels[field.key];
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isColor = field.type === "color";
  const displayed = draft ?? String(value);
  const valid = isValidToken(field, displayed);
  return (
    <div className="token-control">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`token-${field.key}`}
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
            {t.override}
          </button>
        )}
        {overridden === false && (
          <span className="inherit-button" title={t.inheritedTip}>
            <Icon name="link" size={11} />
            {t.inherited}
          </span>
        )}
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
          aria-describedby={!valid ? `error-${field.key}` : undefined}
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
      {derivedOutline && <p className="text-[11px] studio-text-secondary">{t.derivedOutline}: {derivedOutline}</p>}
      {!isColor && (
        <input
          onBlur={onFinish}
          className="token-range"
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
      <span>{field.unit || "—"}</span>
    </div>
    {!valid && <span className="studio-text-danger">Use a value from {field.min} to {field.max}.</span>}
  </div>;
}

export default function Studio() {
  const [system, setSystem] = useState<DesignSystem>(defaultSystem);
  const [ready, setReady] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const view: View = segments[0] === "develop" ? "develop" : "design";
  const routeComponent = segments[view === "develop" ? 1 : 0];
  const selection: Selection = routeComponent === "colors" || routeComponent === "spacing"
    ? routeComponent
    : componentIds.find((id) => id === routeComponent) ?? "overview";
  const [query, setQuery] = useState("");
  const [activeTheme, setActiveTheme] = useState<PaletteMode>("light");
  const [scaleRole, setScaleRole] = useState<ColorScaleRole>("primary");
  const [editTarget, setEditTarget] = useState<{ selection: "colors" | "spacing"; inputId: string } | null>(null);

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
  const history = useRef<{ undo: DesignSystem[]; redo: DesignSystem[]; group: string | null }>({ undo: [], redo: [], group: null });
  const currentSystem = useRef(system);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });

  useEffect(() => {
    let cancelled = false;
    // Read after hydration so the server and initial client render stay identical.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const loaded = parseDesignSystem(saved);
          currentSystem.current = loaded;
          setSystem(loaded);
        }
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStatus("saved");
    } catch {
      setStatus("unsaved");
      setNotice("storageError");
    }
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
  const previewColors = {
    "--preview-background": theme.global.background,
    "--preview-foreground": theme.global.foreground,
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

  return (
    <div className="studio-shell" data-view={view}>
      <a className="skip-link" href="#workspace">
        {t.skip}
      </a>
      <header className="studio-header">
        <Link href="/" className="brand" aria-label={t.home}>
          <span className="brand-mark">
            <BrandMark size={24} />
          </span>
          bambi<span className="brand-ui">ui</span>
          <span className="beta-tag">{t.beta}</span>
        </Link>
        <div className="project-name">
          <span className="studio-text-muted">/</span>
          <input
            aria-label={t.name}
            maxLength={80}
            disabled={!ready}
            value={system.name}
            onChange={(event) =>
              update({ ...system, name: event.target.value }, "system-name")
            }
            onBlur={finishEdit}
          />
        </div>
        <div className="header-workspace-controls">
          <nav className="view-switch" aria-label={t.workspaceView}>
            <Link href={workspaceHref("design", selection)} aria-current={view === "design" ? "page" : undefined} data-active={view === "design" || undefined}>
              <Icon name="grid" size={14} />{t.design}
            </Link>
            <Link href={workspaceHref("develop", selection)} aria-current={view === "develop" ? "page" : undefined} data-active={view === "develop" || undefined}>
              <Icon name="code" size={15} />{t.develop}
            </Link>
          </nav>
          <SegmentedControl aria-label={t.theme} value={activeTheme} onValueChange={(next) => setActiveTheme(next as PaletteMode)}>
            <SegmentedControl.Item value="light">{t.light}</SegmentedControl.Item>
            <SegmentedControl.Item value="dark">{t.dark}</SegmentedControl.Item>
          </SegmentedControl>
          {view === "design" && <a className="mobile-editor-link" href="#token-editor">{t.jumpToTokens} <Icon name="arrow" size={12} /></a>}
        </div>
        <div className="header-actions">
          <Button iconOnly aria-label={t.undo} title={t.undo} disabled={!ready || historyCounts.undo === 0} onClick={() => travel("undo")}>↶</Button>
          <Button iconOnly aria-label={t.redo} title={t.redo} disabled={!ready || historyCounts.redo === 0} onClick={() => travel("redo")}>↷</Button>
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
            onClick={() => importRef.current?.click()}
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
              try {
                if (file.size > 100_000)
                  throw new Error(t.fileSize);
                const imported = parseDesignSystem(await file.text());
                if (
                  !window.confirm(
                    t.replace,
                  )
                )
                  return;
                update(imported);
                setWorkspaceRevision((revision) => revision + 1);
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
        <div className="sidebar-project">
          <span className="project-icon"><Icon name="box" size={20} /></span>
          <div><strong>{t.yourSystem}</strong><span>{t.feel}</span></div>
        </div>
        <div className="sidebar-section-label">{t.workspace.toUpperCase()}</div>
        <NavItem
          icon={<Icon name="grid" />}
          current={selection === "overview"}
          href={workspaceHref(view, "overview")}
        >
          {t.overview}
        </NavItem>
        <NavItem icon={<Icon name="colors" />} href={workspaceHref(view, "colors")} current={selection === "colors"}>Colors</NavItem>
        <NavItem icon={<Icon name="sliders" />} href={workspaceHref(view, "spacing")} current={selection === "spacing"}>Shape &amp; spacing</NavItem>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label flex justify-between">
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
          {componentIds
            .filter((id) => id.includes(query.toLowerCase().trim()))
            .map((id) => (
              <NavItem
                key={id}
                icon={<Icon name={id} />}
                current={selection === id}
                end={
                  Object.keys(theme.components[id]).length > 0 && (
                    <>
                      <span
                        className="override-dot"
                        aria-hidden="true"
                        title={t.customTitle}
                      />
                      <span className="sr-only">{t.custom}</span>
                    </>
                  )
                }
                href={workspaceHref(view, id)}
              >
                {t.componentNames[id]}
              </NavItem>
            ))}
          {!componentIds.some((id) =>
            id.includes(query.toLowerCase().trim()),
          ) && (
            <p className="p-3 text-xs studio-text-muted">{t.noComponents}</p>
          )}
        </nav>
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
                <Preview selected={selection} system={system} mode={activeTheme} active={view === "design"} onSelectColorRole={setScaleRole} onEditToken={(nextSelection, inputId) => setEditTarget({ selection: nextSelection, inputId })} />
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
          <Icon name="sliders" />
          <h2>{t.inspector} · {activeTheme === "light" ? t.light : t.dark}</h2>
          <a className="mobile-preview-link" href="#workspace-content">{view === "design" ? t.backToPreview : t.backToCode}</a>
        </div>

        <fieldset disabled={!ready} className="editor-fields">
          <legend className="sr-only">{t.editTokens(activeTheme === "light" ? t.light : t.dark)}</legend>
          <div className="editor-intro">
            <span className="scope-icon"><Icon name={isGlobal ? "sliders" : component} size={18} /></span>
            <div>
              <h3>{selection === "colors" ? "Global colors" : selection === "spacing" ? "Global shape & spacing" : isGlobal ? t.foundations : t.componentTokens(t.componentNames[component])}</h3>
              <p>{isGlobal ? t.foundationsHint : t.inheritComponent}</p>
              <p>{selection === "spacing" ? t.sharedThemes : selection === "colors" ? t.themeOnly(activeTheme) : t.mixedScope}</p>
            </div>
          </div>
          {ready && (
            <div hidden={!isGlobal || selection === "spacing"}>
              <ColorBuilder
                key={workspaceRevision}
                system={system}
                onFinish={finishEdit}
                onApply={(palette, group) => {
                  update({ ...system, themes: {
                    light: { ...system.themes.light, source: palette.source, global: { ...system.themes.light.global, ...palette.light.tokens } },
                    dark: { ...system.themes.dark, source: palette.source, global: { ...system.themes.dark.global, ...palette.dark.tokens } },
                  } }, group);
                }}
              />
            </div>
          )}
          {selection !== "spacing" && <ContrastReport key={`${activeTheme}-${selection}`} theme={theme} mode={activeTheme} component={isGlobal ? undefined : component} />}
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
          ).filter((group) => group.items.length > 0).map((group) => (
            <section className="token-section" key={group.type}>
              <div className="section-heading">
                <h3>{group.heading}</h3>
                <span>{group.hint}</span>
              </div>
              <div className={group.className}>
                {group.items.map((field) => (
                  <TokenControl
                    key={`${workspaceRevision}-${activeTheme}-${selection}-${field.key}`}
                    field={field}
                    value={values[field.key as keyof typeof values]}
                    derivedOutline={!isGlobal && component === "badge" && field.key === "border" && !Object.hasOwn(theme.components.badge, "border")
                      ? toCSSVariables(theme, activeTheme)["--badge-neutral-outline"] : undefined}
                    overridden={
                      isGlobal
                        ? undefined
                        : Object.hasOwn(theme.components[component], field.key)
                    }
                    onChange={(value) => setToken(field.key, value)}
                    onReset={() =>
                      resetToken(field.key as keyof ComponentTokens)
                    }
                    onFinish={finishEdit}
                  />
                ))}
              </div>
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
          {selection === "text" && !isGlobal && <section className="token-section foundation-editor" id="typography-tokens">
            <div className="section-heading"><h3>Text styles</h3><span>{t.sharedThemes}</span></div>
            <p>Typography tokens are shared by both themes and every Text variant.</p>
            {typographyVariants.map((variant) => <details className="typography-variant" key={variant} open={variant === "heading" || variant === "h1" || undefined}>
              <summary>{variant === "heading" ? "Legacy heading" : variant.toUpperCase()}</summary>
              <div className="typography-controls">
                {typographyFields.map((field) => <TypographyControl key={`${workspaceRevision}-${activeTheme}-${variant}-${field.key}`} variant={variant} field={field}
                  value={resolveTypography(theme, variant)[field.key]}
                  onChange={(value) => setTypography(variant, field.key, value)} onFinish={finishEdit} />)}
                <Button type="button" onClick={() => updateTheme({ ...theme, typography: { ...theme.typography, [variant]: { ...defaultTypography[variant] } } })}>
                  Reset {variant}
                </Button>
              </div>
            </details>)}
          </section>}
          <Button
            className="reset-button"
            fullWidth
            startIcon={<Icon name="reset" size={14} />}
            onClick={() => {
              if (
                !window.confirm(
                  isGlobal
                    ? selection === "colors" ? `Reset ${activeTheme} global colors? Color scale and component overrides will be kept; shared dimensions will not change.`
                      : selection === "spacing" ? "Reset shared shape, spacing and sizing in both themes? Colors and component overrides will be kept."
                      : t.confirmGlobal(activeTheme === "light" ? t.light : t.dark)
                    : t.confirmComponent(activeTheme === "light" ? t.light : t.dark, t.componentNames[component]),
                )
              )
                return;
              updateTheme(
                isGlobal
                  ? { ...theme, source: selection === "spacing" ? theme.source : defaultSystem.themes[activeTheme].source,
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
            {isGlobal ? t.resetGlobal : t.resetComponent}
          </Button>
        </fieldset>
        <div className="editor-footer"><span className="tiny-orbit" />{t.changes}</div>
      </aside>
    </div>
  );
}
