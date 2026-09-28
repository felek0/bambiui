"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Switch,
  Text,
} from "./components";

import { Icon } from "./icons";

import type { PaletteMode } from "./color-engine";

import { previewCopy, type PreviewCopy } from "./preview-copy";

import {
  componentIds,
  colorScaleRoles,
  colorScaleStops,
  tokenFields,
  resolveColorScale,
  typographyVariants,
  toCSSVariables,
  type ComponentId,
  type ColorScaleRole,
  type DesignSystem,
  type ThemeTokens,
} from "./tokens";
import styles from "./preview.module.css";


function DemoButton({
  children,
  disabled = false,
  copy,
}: {
  children?: ReactNode;
  disabled?: boolean;
  copy: PreviewCopy;
}) {
  const [clicks, setClicks] = useState(0);
  return (
    <div className={styles.actionDemo}>
      <Button
        disabled={disabled}
        onClick={() => setClicks((count) => count + 1)}
        endIcon={<Icon name={clicks ? "check" : "arrow"} />}
      >
        {clicks ? copy.demo.allSet : children ?? copy.demo.getStarted}
      </Button>
      <span className={styles.srOnly} role="status">
        {clicks > 0 ? copy.demo.completed(clicks) : ""}
      </span>
    </div>
  );
}

function SaveButtonDemo({ copy }: { copy: PreviewCopy }) {
  const [saving, setSaving] = useState(false);
  const [saves, setSaves] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  return <div className={styles.actionDemo} data-save-demo data-save-count={saves}>
    <Button loading={saving} onClick={() => {
      setSaving(true);
      setSaves((count) => count + 1);
      timer.current = setTimeout(() => { setSaving(false); timer.current = null; }, 1200);
    }}>{saving ? copy.button.saving : saves ? copy.button.saved : copy.button.save}</Button>
    <span className={styles.srOnly} role="status">{saving ? copy.button.saving : saves ? copy.button.saved : ""}</span>
  </div>;
}

function FormDemo() {
  const [email, setEmail] = useState("");
  const [updates, setUpdates] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  return <form className={styles.formDemo} data-form-demo onSubmit={(event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setResult(`Submitted ${values.contact} · updates ${values.updates ?? "off"} · terms ${values.terms}`);
  }}>
    <strong>Controlled form</strong>
    <Input label="Contact email" type="email" name="contact" required value={email} onValueChange={(next) => { setEmail(next); setResult(null); }} />
    <Switch label="Email updates" name="updates" value="yes" checked={updates} onCheckedChange={(next) => { setUpdates(next); setResult(null); }} />
    <Checkbox label="Accept terms" name="terms" value="accepted" required checked={agreed} onCheckedChange={(next) => { setAgreed(next); setResult(null); }} labelPosition="start" />
    <Button type="submit">Submit example</Button>
    <output role="status" data-form-result>{result}</output>
  </form>;
}

type ShowcaseId = Exclude<ComponentId, "text">;

function Specimen({ id, expanded, copy }: { id: ShowcaseId; expanded: boolean; copy: PreviewCopy }) {
  switch (id) {
    case "button":
      if (!expanded)
        return (
          <div className={styles.states}>
            <DemoButton copy={copy} />
            <Button variant="secondary">{copy.button.secondary}</Button>
            <Button variant="ghost">{copy.button.ghost}</Button>
          </div>
        );
      return (
        <div className={styles.rows}>
          <div className={styles.states}>
            <DemoButton copy={copy} />
            <Button variant="secondary">{copy.button.secondary}</Button>
            <Button variant="outline">{copy.button.outline}</Button>
            <Button variant="ghost">{copy.button.ghost}</Button>
            <Button variant="destructive">{copy.button.delete}</Button>
            <Button variant="link">{copy.button.learnMore}</Button>
          </div>
          <div className={styles.states}>
            <Button size="sm">{copy.button.small}</Button>
            <Button size="md">{copy.button.medium}</Button>
            <Button size="lg">{copy.button.large}</Button>
            <Button variant="outline" iconOnly aria-label={copy.button.addItem}>
              <Icon name="plus" />
            </Button>
          </div>
          <div className={styles.states}>
            <Button startIcon={<Icon name="download" />}>{copy.button.download}</Button>
            <Button loading>{copy.button.saving}</Button>
            <SaveButtonDemo copy={copy} />
            <DemoButton copy={copy} disabled>{copy.button.disabled}</DemoButton>
          </div>
        </div>
      );
    case "input":
      return (
        <div className={styles.inputStates}>
          <Input
            label={copy.input.email}
            type="email"
            required
            placeholder="you@example.com"
            description={expanded ? copy.input.receipts : undefined}
          />
          {expanded && (
            <>
              <Input
                label={copy.input.search}
                hideLabel
                type="search"
                size="sm"
                placeholder={copy.input.searchPlaceholder}
                startIcon={<Icon name="search" />}
              />
              <Input
                label={copy.input.url}
                type="url"
                defaultValue="studio"
                endIcon={<Icon name="link" />}
                error={copy.input.urlError}
              />
              <Input
                label={copy.input.readOnlyEmail}
                defaultValue="hello@studio.design"
                readOnly
              />
              <Input label={copy.input.unavailable} size="lg" disabled defaultValue="—" />
              <div className={styles.sizeGroup}>
                <Input label={copy.button.small} size="sm" placeholder="size=&quot;sm&quot;" />
                <Input label={copy.button.medium} size="md" placeholder="size=&quot;md&quot;" />
                <Input label={copy.button.large} size="lg" placeholder="size=&quot;lg&quot;" />
              </div>
              <details className={styles.formDemoDisclosure}>
                <summary>Controlled form example</summary>
                <FormDemo />
              </details>
            </>
          )}
        </div>
      );
    case "card":
      return (
        <div className={styles.cardStates}>
          <Card>
            <Card.Icon>
              <Icon name="spark" />
            </Card.Icon>
            <Card.Header>
              <Card.Title>{copy.card.make}</Card.Title>
              <Card.Description>
                {copy.card.makeDescription}
              </Card.Description>
            </Card.Header>
            <Card.Content><span>Shape the details.</span><span>Keep the whole system in view.</span></Card.Content>
          </Card>
          {expanded && (
            <>
              <Card variant="elevated" size="lg">
                <Card.Icon>
                  <Icon name="plus" />
                </Card.Icon>
                <Card.Header>
                  <Card.Title>{copy.card.explore}</Card.Title>
                  <Card.Description>
                    {copy.card.exploreDescription}
                  </Card.Description>
                </Card.Header>
                <Card.Content><span>Give your next idea a place to grow.</span><span>Carry it through every detail.</span></Card.Content>
                <Card.Footer>
                  <Button size="sm">{copy.card.start}</Button>
                  <Button size="sm" variant="ghost">
                    {copy.card.later}
                  </Button>
                </Card.Footer>
              </Card>
              <Card variant="filled" size="sm">
                <Card.Header>
                  <Card.Title>{copy.card.filled}</Card.Title>
                  <Card.Description>
                    {copy.card.filledDescription}
                  </Card.Description>
                </Card.Header>
                <Card.Content><span>Start with a foundation.</span><span>Make it your own.</span></Card.Content>
              </Card>
            </>
          )}
        </div>
      );
    case "badge":
      return expanded ? (
        <div className={styles.rows}>
          {(["solid", "subtle", "outline"] as const).map((variant) => (
            <div className={styles.states} key={variant}>
              {(
                [
                  "neutral",
                  "primary",
                  "success",
                  "warning",
                  "danger",
                  "info",
                ] as const
              ).map((tone) => (
                <Badge key={tone} variant={variant} tone={tone} startIcon={variant === "outline" && tone === "info" ? <Icon name="spark" /> : undefined}>
                  {copy.tones[tone]}
                </Badge>
              ))}
            </div>
          ))}
          <div className={styles.states}>
            <Badge size="sm" dot tone="success">
              {copy.button.small}
            </Badge>
            <Badge dot tone="success">
              {copy.button.medium}
            </Badge>
            <Badge size="lg" dot tone="success">
              {copy.button.large}
            </Badge>
          </div>
        </div>
      ) : (
        <div className={styles.states}>
          <Badge dot>{copy.badge.published}</Badge>
          <Badge variant="subtle">{copy.badge.draft}</Badge>
          <Badge variant="subtle" tone="success" dot>
            {copy.badge.live}
          </Badge>
        </div>
      );
    case "switch":
      return (
        <div className={styles.toggleStates}>
          <Switch label={copy.switch.notifications} defaultChecked />
          <Switch label={copy.switch.focus} />
          {expanded && (
            <>
              <Switch
                label={copy.switch.autoSave}
                description={copy.switch.autoSaveDescription}
                size="lg"
                defaultChecked
              />
              <Switch label={copy.switch.compact} size="sm" labelPosition="start" />
              <Switch label="Read-only setting" readOnly defaultChecked />
              <Switch label="Needs attention" error="Turn this setting on to continue." />
              <Switch label={copy.input.unavailable} disabled defaultChecked />
            </>
          )}
        </div>
      );

    case "checkbox":
      return (
        <div className={styles.toggleStates}>
          <Checkbox label={copy.checkbox.details} defaultChecked />
          <Checkbox label={copy.checkbox.loop} />
          {expanded && (
            <>
              <Checkbox label={copy.checkbox.selectAll} size="lg" description="Includes every item in this list." indeterminate />
              <Checkbox
                label={copy.checkbox.terms}
                required
                error={copy.checkbox.termsError}
              />
              <Checkbox label={copy.checkbox.smallPrint} size="sm" />
              <Checkbox label="Read-only selection" readOnly defaultChecked />
              <Checkbox label={copy.input.unavailable} disabled defaultChecked />
            </>
          )}
        </div>
      );
  }
}

function Showcase({
  id,
  expanded,
  copy,
  selected,
  onSelect,
}: {
  id: ShowcaseId;
  expanded: boolean;
  copy: PreviewCopy;
  selected: boolean;
  onSelect: (id: ComponentId) => void;
}) {
  const { name } = copy.components[id];

  return (
    <section
      className={styles.showcase}
      data-specimen={id}
      data-canvas-unit={id}
      data-selected={selected || undefined}
      aria-label={copy.showcase.preview(name)}
      onClickCapture={() => onSelect(id)}
      onKeyDownCapture={(event) => {
        if (event.key !== "Tab" && !event.altKey && !event.metaKey && !event.ctrlKey) onSelect(id);
      }}
    >
      <header className={styles.showcaseHeader}>
        <h2><Link href={`/${id}`} aria-current={selected ? "page" : undefined}>{name}</Link></h2>
      </header>
      <div className={`${styles.specimen} ${expanded ? styles.expanded : ""}`}>
        <Specimen id={id} expanded={expanded} copy={copy} />
      </div>

    </section>
  );
}

function ThemePane({ theme, mode, children, copy }: {
  theme: ThemeTokens;
  mode: PaletteMode;
  children: ReactNode;
  copy: PreviewCopy;
}) {
  const variables = useMemo(() => toCSSVariables(theme, mode), [theme, mode]);
  return (
    <section className="theme-pane" aria-label={copy.theme.preview(copy.modes[mode])}>
      <div
        className={styles.preview}
        data-ds-theme={mode}
        style={{ ...variables, colorScheme: mode } as CSSProperties}
      >
        {children}
      </div>
    </section>
  );
}

export function Preview({ selected, system, mode, active = true, onSelectColorRole, onEditToken }: {
  selected: "overview" | "colors" | "spacing" | ComponentId;
  system: DesignSystem;
  mode: PaletteMode;
  active?: boolean;
  onSelectColorRole?: (role: ColorScaleRole) => void;
  onEditToken?: (selection: "colors" | "spacing", inputId: string) => void;
}) {
  const copy = previewCopy;
  const router = useRouter();
  const helpId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const dragged = useRef(false);
  const camera = useRef({ x: 0, y: 0, zoom: 1 });
  const animation = useRef<number | null>(null);
  const initialized = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);
  const hoveredUnitRef = useRef<string | null>(null);
  const updateHoveredUnit = (next: string | null) => {
    if (hoveredUnitRef.current === next) return;
    hoveredUnitRef.current = next;
    setHoveredUnit(next);
  };
  const selectSpecimen = (id: ComponentId) => {
    if (active && selected !== id) router.push(`/${id}`, { scroll: false });
  };
  const selectFoundation = (id: "colors" | "spacing") => {
    if (active && selected !== id) router.push(`/${id}`, { scroll: false });
  };

  const naturalLayout = () => window.matchMedia("(max-width: 760px)").matches;

  const stopAnimation = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);

  const setCamera = useCallback((next: { x: number; y: number; zoom: number }) => {
    camera.current = next;
    const view = viewport.current;
    if (view) {
      view.style.backgroundPosition = `${next.x}px ${next.y}px`;
      view.style.backgroundSize = `${16 * next.zoom}px ${16 * next.zoom}px`;
      view.style.setProperty("--canvas-dot-radius", `${next.zoom}px`);
      view.style.setProperty("--canvas-selection-stroke", `${Math.min(10, 2 / next.zoom)}px`);
      view.dataset.cameraX = String(next.x);
      view.dataset.cameraY = String(next.y);
      view.dataset.cameraZoom = String(next.zoom);
    }
    if (canvas.current) canvas.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.zoom})`;
    setZoom((previous) => previous === next.zoom ? previous : next.zoom);
  }, []);

  const moveCamera = useCallback((next: { x: number; y: number; zoom: number }, smooth = false) => {
    stopAnimation();
    if (!smooth || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCamera(next);
      return;
    }
    const start = camera.current;
    const startTime = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - startTime) / 360);
      const eased = 1 - (1 - progress) ** 3;
      setCamera({
        x: start.x + (next.x - start.x) * eased,
        y: start.y + (next.y - start.y) * eased,
        zoom: start.zoom + (next.zoom - start.zoom) * eased,
      });
      animation.current = progress < 1 ? requestAnimationFrame(tick) : null;
    };
    animation.current = requestAnimationFrame(tick);
  }, [setCamera, stopAnimation]);

  const zoomAt = useCallback((next: number, x: number, y: number) => {
    const current = camera.current;
    const value = Math.min(3, Math.max(0.2, next));
    if (value === current.zoom) return;
    moveCamera({
      x: x - (x - current.x) * value / current.zoom,
      y: y - (y - current.y) * value / current.zoom,
      zoom: value,
    });
  }, [moveCamera]);

  function changeZoom(next: number) {
    const view = viewport.current;
    if (!view || naturalLayout()) return;
    zoomAt(next, view.clientWidth / 2, view.clientHeight / 2);
  }

  function fit() {
    const view = viewport.current;
    const element = canvas.current;
    if (!view || !element || naturalLayout()) return;
    const value = Math.min((view.clientWidth - 48) / element.offsetWidth, (view.clientHeight - 48) / element.offsetHeight, 1);
    moveCamera({
      x: (view.clientWidth - element.offsetWidth * value) / 2,
      y: (view.clientHeight - element.offsetHeight * value) / 2,
      zoom: value,
    }, true);
  }

  useEffect(() => {
    const view = viewport.current;
    const element = canvas.current;
    if (!view || !element) return;
    const observer = new ResizeObserver(() => {
      if (!initialized.current && !naturalLayout() && view.clientWidth) {
        initialized.current = true;
        setCamera({ x: (view.clientWidth - element.offsetWidth) / 2, y: 24, zoom: 1 });
      }
    });
    observer.observe(view);
    return () => { observer.disconnect(); stopAnimation(); };
  }, [setCamera, stopAnimation]);

  useEffect(() => {
    const view = viewport.current;
    if (!view || !active) return;
    const wheel = (event: WheelEvent) => {
      if (naturalLayout()) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) {
        const bounds = view.getBoundingClientRect();
        zoomAt(camera.current.zoom * Math.exp(-event.deltaY * unit * 0.002), event.clientX - bounds.left, event.clientY - bounds.top);
      } else {
        const current = camera.current;
        moveCamera({ ...current,
          x: current.x - (event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit,
          y: current.y - (event.shiftKey ? 0 : event.deltaY) * unit,
        });
      }
    };
    view.addEventListener("wheel", wheel, { passive: false });
    return () => view.removeEventListener("wheel", wheel);
  }, [active, moveCamera, zoomAt]);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const view = viewport.current;
      const element = canvas.current;
      const target = selected === "overview" ? element : element?.querySelector<HTMLElement>(`[data-canvas-unit="${selected}"]`);
      if (!view || !element || !target || !view.clientWidth) return;
      if (naturalLayout()) {
        if (selected !== "overview") target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      } else if (selected === "overview") {
        moveCamera({ x: (view.clientWidth - element.offsetWidth * camera.current.zoom) / 2, y: 24, zoom: camera.current.zoom }, initialized.current);
      } else {
        const bounds = target.getBoundingClientRect();
        const box = view.getBoundingClientRect();
        const current = camera.current;
        // A previous Fit should not leave a newly selected unit too small to edit.
        const zoom = Math.max(current.zoom, 1);
        const worldX = (bounds.left - box.left + bounds.width / 2 - current.x) / current.zoom;
        const worldY = (bounds.top - box.top + bounds.height / 2 - current.y) / current.zoom;
        const heading = target.querySelector("h2")?.getBoundingClientRect();
        const headingY = heading ? (heading.top - box.top - current.y) / current.zoom : worldY;
        // Keep the selected heading below the floating history/theme controls.
        moveCamera({
          x: view.clientWidth / 2 - worldX * zoom,
          y: Math.max(view.clientHeight / 2 - worldY * zoom, 72 - headingY * zoom),
          zoom,
        }, initialized.current);
      }
      initialized.current = true;
      if (selected !== "overview") {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const highlight = { outline: "2px solid var(--ds-foreground)", outlineOffset: "4px" };
        target.animate(reducedMotion ? [highlight, highlight] : [
          { outline: "2px solid transparent", outlineOffset: "4px" },
          { ...highlight, offset: 0.2 },
          { outline: "2px solid transparent", outlineOffset: "4px" },
        ], { duration: 1400 });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, active, moveCamera]);

  return (
    <ThemePane theme={system.themes[mode]} mode={mode} copy={copy}>
      <div className={styles.canvasControls} role="group" aria-label="Canvas zoom">
        <button type="button" onClick={() => changeZoom(zoom - 0.1)} disabled={zoom <= 0.2} aria-label="Zoom out">−</button>
        <output aria-live="polite" aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
        <button type="button" onClick={() => changeZoom(zoom + 0.1)} disabled={zoom >= 3} aria-label="Zoom in">+</button>
        <button type="button" onClick={fit}>Fit</button>
        <button type="button" onClick={() => changeZoom(1)}>Reset zoom</button>
      </div>
      <p className={styles.canvasHelp} aria-hidden="true">Drag or scroll to pan · Ctrl/⌘ + scroll to zoom</p>
      <p className={styles.selectionHint} data-canvas-selection-hint data-visible={hoveredUnit ? true : undefined} aria-hidden="true">{hoveredUnit ? `${hoveredUnit === "colors" ? "Colors" : hoveredUnit === "spacing" ? "Shape & spacing" : hoveredUnit === "text" ? "Text" : copy.components[hoveredUnit as ShowcaseId].name} · Click to edit tokens` : ""}</p>
      <p id={helpId} className={styles.srOnly}>On desktop, drag empty space or use the mouse wheel to pan without bounds. Hold Control or Command while scrolling to zoom at the pointer; Shift and scroll pans horizontally. Focus the canvas and use arrow keys to pan, or use Fit and zoom buttons. On mobile, scroll the page normally. Hover over a section for a selection outline; click an empty area of that section to edit its tokens. Controls inside specimens remain interactive.</p>
      <div
        ref={viewport}
        className={styles.viewport}
        tabIndex={0}
        role="region"
        aria-label="Component canvas"
        aria-describedby={helpId}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || naturalLayout()) return;
          const offsets: Record<string, [number, number]> = {
            ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60],
          };
          if (offsets[event.key]) {
            event.preventDefault();
            const [dx, dy] = offsets[event.key];
            moveCamera({ ...camera.current, x: camera.current.x + dx, y: camera.current.y + dy });
          } else if (event.key === "+" || event.key === "=") {
            event.preventDefault(); changeZoom(camera.current.zoom + 0.1);
          } else if (event.key === "-") {
            event.preventDefault(); changeZoom(camera.current.zoom - 0.1);
          }
        }}
        onClickCapture={(event) => {
          if (dragged.current) {
            event.stopPropagation();
            dragged.current = false;
          }
        }}
        onPointerDown={(event) => {
          dragged.current = false;
          if (naturalLayout() || (event.button !== 0 && event.button !== 1) || event.pointerType === "touch" || !(event.target instanceof Element)) return;
          // Middle drag pans anywhere; left drag leaves interactive specimens usable.
          if (event.button === 0 && event.target.closest("a, button, input, textarea, select, label, [role='switch'], [role='checkbox'], [contenteditable='true']")) return;
          stopAnimation();
          const view = event.currentTarget;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: camera.current.x, top: camera.current.y };
          if (event.button === 1) {
            view.setPointerCapture(event.pointerId);
            view.dataset.dragging = "true";
            view.focus({ preventScroll: true });
            event.preventDefault();
          }
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) {
            const unit = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-canvas-unit]") : null;
            updateHoveredUnit(unit?.dataset.canvasUnit ?? null);
            return;
          }
          if (start.id !== event.pointerId) return;
          if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) <= 5 && !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            dragged.current = true;
            updateHoveredUnit(null);
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.dataset.dragging = "true";
            event.currentTarget.focus({ preventScroll: true });
          }
          if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 5) dragged.current = true;
          setCamera({ ...camera.current, x: start.left + event.clientX - start.x, y: start.top + event.clientY - start.y });
        }}
        onPointerLeave={() => {
          const focused = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>("[data-canvas-unit]") : null;
          updateHoveredUnit(focused?.dataset.canvasUnit ?? null);
        }}
        onFocusCapture={(event) => {
          const unit = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-canvas-unit]") : null;
          updateHoveredUnit(unit?.dataset.canvasUnit ?? null);
        }}
        onBlurCapture={(event) => {
          const unit = event.relatedTarget instanceof Element ? event.relatedTarget.closest<HTMLElement>("[data-canvas-unit]") : null;
          updateHoveredUnit(unit?.dataset.canvasUnit ?? null);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          drag.current = null;
          delete event.currentTarget.dataset.dragging;
        }}
        onPointerCancel={(event) => {
          drag.current = null;
          delete event.currentTarget.dataset.dragging;
        }}
        onLostPointerCapture={(event) => {
          drag.current = null;
          delete event.currentTarget.dataset.dragging;
        }}
      >
        <div ref={canvas} data-canvas className={styles.canvas}>
          <div className={styles.foundations}>
            <section data-foundation="colors" data-canvas-unit="colors" data-selected={selected === "colors" || undefined} aria-labelledby="canvas-colors-title" className={styles.foundation}
              onClickCapture={(event) => { if (!(event.target instanceof Element && event.target.closest("a, button, input, select"))) selectFoundation("colors"); }}>
              <h2 id="canvas-colors-title"><Link href="/colors" aria-current={selected === "colors" ? "page" : undefined}>Colors</Link></h2>
              <p>Generated from the current theme. Select a role to edit its 50–1000 tokens.</p>
              <div className={styles.scaleRegion} role="region" aria-label="Color scale reference" tabIndex={0}>
                <div className={styles.scaleTable}>
                  <div className={styles.scaleRow} aria-hidden="true"><span />{colorScaleStops.map((stop) => <span key={stop}>{stop}</span>)}</div>
                  {colorScaleRoles.map((role) => {
                    const scale = resolveColorScale(system.themes[mode], mode, role);
                    return <div className={styles.scaleRow} key={role}>
                      <Link href="/colors" onClick={() => { onSelectColorRole?.(role); onEditToken?.("colors", "color-scale-role"); }}>{role}</Link>
                      {colorScaleStops.map((stop) => <Link key={stop} href="/colors" onClick={() => { onSelectColorRole?.(role); onEditToken?.("colors", `scale-${role}-${stop}`); }} className={styles.swatch} aria-label={`Edit ${role} ${stop} color: ${scale[stop]}`} title={`${role} ${stop}: ${scale[stop]}`} style={{ backgroundColor: scale[stop] }}><span className={styles.srOnly}>{role} {stop}: {scale[stop]}</span></Link>)}
                    </div>;
                  })}
                </div>
              </div>
            </section>
            <section data-foundation="spacing" data-canvas-unit="spacing" data-selected={selected === "spacing" || undefined} aria-labelledby="canvas-spacing-title" className={styles.foundation}
              onClickCapture={(event) => { if (!(event.target instanceof Element && event.target.closest("a, button, input, select"))) selectFoundation("spacing"); }}>
              <h2 id="canvas-spacing-title"><Link href="/spacing" aria-current={selected === "spacing" ? "page" : undefined}>Shape &amp; spacing</Link></h2>
              <p>Shared dimensions for both themes. Spacing sm/md/lg sets the gap between Card.Content items at matching sizes; legacy component padding and outer gap stay independent. Select a token to edit its value.</p>
              <div className={styles.spacingSamples}>
                {tokenFields.filter((field) => field.type === "number").map((field) => <Link key={field.key} href="/spacing" onClick={() => onEditToken?.("spacing", `token-${field.key}`)} className={styles.spacingSample} data-spacing-token={field.key}>
                  <span className={styles.spacingSampleHeader}><span>{field.label}</span><strong>{system.themes[mode].global[field.key]}px</strong></span>
                  <span className={styles.spacingVisual} aria-hidden="true">
                    {field.key === "radius" || field.key === "borderWidth" ? <span className={styles.shapeVisual} />
                      : field.key === "paddingX" || field.key === "paddingY" ? <span className={styles.paddingVisual}><span>Content</span></span>
                      : field.key === "gap" ? <span className={styles.gapVisual}><i /><i /><i /></span>
                                            : field.key === "spacingSm" || field.key === "spacingMd" || field.key === "spacingLg" ? <span className={styles.spacingScaleVisual}><i /><i /></span>
                      : field.key === "margin" ? <span className={styles.marginVisual}><span /></span>
                      : field.key === "fontSize" ? <span className={styles.fontVisual}>Ag</span>
                      : <span className={styles.heightVisual}>Control</span>}
                  </span>
                </Link>)}
              </div>
            </section>
            <section data-foundation="text" data-specimen="text" data-canvas-unit="text" data-selected={selected === "text" || undefined} aria-label="Text preview" className={styles.foundation}
              onClickCapture={() => selectSpecimen("text")}
              onKeyDownCapture={(event) => { if (event.key !== "Tab" && !event.altKey && !event.metaKey && !event.ctrlKey) selectSpecimen("text"); }}>
              <h2><Link href="/text" aria-current={selected === "text" ? "page" : undefined}>Text</Link></h2>
              <p>Independent H1–H6, paragraph, label, caption and legacy heading styles.</p>
              <div className={styles.foundationText}>
                {typographyVariants.map((variant) => <div key={variant}>
                  <span className={styles.foundationTextLabel}>{variant === "heading" ? "Legacy heading" : variant.toUpperCase()}</span>
                  <Text variant={variant} as={variant === "paragraph" ? "p" : "span"}>
                    {variant === "heading" ? "A familiar heading style" : variant === "paragraph" ? "A clear paragraph gives each idea room to breathe." : variant === "label" ? "A helpful label" : variant === "caption" ? "The finer details, thoughtfully placed." : `A ${variant.toUpperCase()} that sets the tone`}
                  </Text>
                </div>)}
                <div>
                  <span className={styles.foundationTextLabel}>Primary · large</span>
                  <Text variant="h3" as="span" size="lg" tone="primary">An expressive heading</Text>
                </div>
                <div>
                  <span className={styles.foundationTextLabel}>Info · small</span>
                  <Text as="span" size="sm" tone="info">A little more context for this idea.</Text>
                </div>
                <div>
                  <span className={styles.foundationTextLabel}>Danger · large</span>
                  <Text variant="caption" as="span" size="lg" tone="danger">Something needs attention.</Text>
                </div>
              </div>
            </section>
          </div>
          <div className={styles.grid}>
            {componentIds.filter((id): id is ShowcaseId => id !== "text").map((id) => <Showcase key={id} id={id} expanded copy={copy} selected={selected === id} onSelect={selectSpecimen} />)}
          </div>
        </div>
      </div>
    </ThemePane>
  );
}
