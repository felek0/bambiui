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
} from "./components";

import { Icon } from "./icons";

import type { PaletteMode } from "./color-engine";

import { previewCopy, type PreviewCopy } from "./preview-copy";

import {
  colorScaleRoles,
  colorScaleStops,
  tokenFields,
  resolveColorScale,
  toCSSVariables,
  type ComponentId,
  type ColorScaleRole,
  type DesignSystem,
  type ThemeTokens,
} from "./tokens";
import styles from "./preview.module.css";
import { ComponentMatrix } from "./component-matrix";
import type { ComponentRecipeSelection } from "./component-recipes";


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
            <Button radius="sm">radius sm</Button>
            <Button radius="md">radius md</Button>
            <Button radius="lg">radius lg</Button>
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
          <div className={styles.states} data-instance-specimen="button">
            <Button appearance={{ paddingTop: 12, paddingRight: 24, paddingBottom: 8, paddingLeft: 16, borderTopLeftRadius: 20 }}>Local spacing</Button>
            <span>Instance values; shared tokens unchanged.</span>
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
              <div className={styles.sizeGroup}>
                <Input label="Radius sm" radius="sm" defaultValue="radius=sm" />
                <Input label="Radius md" radius="md" defaultValue="radius=md" />
                <Input label="Radius lg" radius="lg" defaultValue="radius=lg" />
              </div>
              <Input
                data-instance-specimen="input"
                label="Locally styled email"
                description="Instance values; shared tokens unchanged."
                error="Enter a valid email."
                errorPosition="above"
                errorIcon="warning"
                appearance={{ paddingTop: 12, paddingRight: 18, paddingBottom: 8, paddingLeft: 14, borderTopLeftRadius: 16 }}
                parts={{ root: { gap: 8 }, label: { fontWeight: 700 }, description: { fontSize: 12 }, error: { fontSize: 13, gap: 6 } }}
              />
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
              <Card variant="elevated" size="lg" radius="lg">
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
              <Card variant="filled" size="sm" radius="sm">
                <Card.Header>
                  <Card.Title>{copy.card.filled}</Card.Title>
                  <Card.Description>
                    {copy.card.filledDescription}
                  </Card.Description>
                </Card.Header>
                <Card.Content><span>Start with a foundation.</span><span>Make it your own.</span></Card.Content>
              </Card>
              <Card data-instance-specimen="card" appearance={{ paddingTop: 20, paddingRight: 24, paddingBottom: 16, paddingLeft: 12, borderTopLeftRadius: 24, shadow: "md" }}>
                <Card.Header appearance={{ gap: 12, paddingBottom: 4 }}>
                  <Card.Title appearance={{ fontSize: 22, fontWeight: 650 }}>Independent slots</Card.Title>
                  <Card.Description appearance={{ lineHeight: 1.8 }}>Instance values; shared tokens unchanged.</Card.Description>
                </Card.Header>
                <Card.Content appearance={{ gap: 20, paddingTop: 8 }}><span>Local content spacing.</span><span>Each slot remains independent.</span></Card.Content>
                <Card.Footer appearance={{ gap: 16, marginTop: 4 }}><Button>Continue</Button><Button variant="ghost">Later</Button></Card.Footer>
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
            <Badge radius="sm">radius sm</Badge>
            <Badge radius="md">radius md</Badge>
            <Badge radius="lg">radius lg</Badge>
          </div>
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
          <div className={styles.states} data-instance-specimen="badge">
            <Badge appearance={{ paddingTop: 6, paddingBottom: 8, borderTopLeftRadius: 12, borderBottomRightRadius: 4 }}>Local draft</Badge>
            <span>Instance geometry; shared colors unchanged.</span>
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
              <Switch label="Needs attention · enabled" error="This enabled setting needs review." defaultChecked />
              <Switch label={copy.input.unavailable} disabled defaultChecked />
              <Switch
                data-instance-specimen="switch"
                label="Local notification setting"
                description="Instance values; shared tokens unchanged."
                error="Review this setting."
                errorPosition="below"
                errorIcon="info"
                appearance={{ width: 64, height: 30 }}
                parts={{ root: { gap: 8 }, row: { gap: 16 }, label: { fontSize: 15, fontWeight: 600 }, error: { fontSize: 13, gap: 6 } }}
              />
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
              <Checkbox label="Accepted terms · needs review" error="Review this selection." defaultChecked />
              <Checkbox label={copy.checkbox.smallPrint} size="sm" />
              <div className={styles.states}>
                <Checkbox label="Radius sm" radius="sm" />
                <Checkbox label="Radius md" radius="md" />
                <Checkbox label="Radius lg" radius="lg" />
              </div>
              <Checkbox label="Read-only selection" readOnly defaultChecked />
              <Checkbox label={copy.input.unavailable} disabled defaultChecked />
              <Checkbox
                data-instance-specimen="checkbox"
                label="Local terms acceptance"
                description="Instance values; shared tokens unchanged."
                error="Review the terms."
                errorPosition="above"
                errorIcon="info"
                appearance={{ width: 26, height: 26, borderTopLeftRadius: 8 }}
                parts={{ row: { gap: 14 }, control: { borderBottomRightRadius: 4 }, label: { fontWeight: 600 }, description: { fontSize: 12 }, error: { fontSize: 13 } }}
              />
            </>
          )}
        </div>
      );
  }
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

export function Preview({ selected, system, mode, active = true, onSelectColorRole, onEditToken, recipeSelection, onSelectRecipe }: {
  selected: "colors" | "spacing" | ComponentId;
  system: DesignSystem;
  mode: PaletteMode;
  active?: boolean;
  onSelectColorRole?: (role: ColorScaleRole) => void;
  onEditToken?: (selection: "colors" | "spacing", inputId: string) => void;
  recipeSelection: ComponentRecipeSelection | null;
  onSelectRecipe: (selection: ComponentRecipeSelection) => void;
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
  const wheelFrame = useRef<number | null>(null);
  const zoomLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);
  const hoveredUnitRef = useRef<string | null>(null);
  const updateHoveredUnit = (next: string | null) => {
    if (hoveredUnitRef.current === next) return;
    hoveredUnitRef.current = next;
    setHoveredUnit(next);
  };

  const selectFoundation = (id: "colors" | "spacing") => {
    if (active && selected !== id) router.push(`/${id}`, { scroll: false });
  };

  const naturalLayout = () => window.matchMedia("(max-width: 760px)").matches;

  const stopAnimation = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);

  const setCamera = useCallback((next: { x: number; y: number; zoom: number }, updateLabel = true) => {
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
    if (updateLabel) setZoom((previous) => previous === next.zoom ? previous : next.zoom);
  }, []);

  const queueWheelCamera = useCallback((next: { x: number; y: number; zoom: number }, updateLabel: boolean) => {
    camera.current = next;
    if (wheelFrame.current === null) {
      wheelFrame.current = requestAnimationFrame(() => {
        wheelFrame.current = null;
        setCamera(camera.current, false);
      });
    }
    if (updateLabel && zoomLabelTimer.current === null) {
      zoomLabelTimer.current = setTimeout(() => {
        zoomLabelTimer.current = null;
        setZoom(camera.current.zoom);
      }, 80);
    }
  }, [setCamera]);

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

  const zoomAt = useCallback((next: number, x: number, y: number, fromWheel = false) => {
    const current = camera.current;
    const value = Math.min(3, Math.max(0.2, next));
    if (value === current.zoom) return;
    const nextCamera = {
      x: x - (x - current.x) * value / current.zoom,
      y: y - (y - current.y) * value / current.zoom,
      zoom: value,
    };
    if (fromWheel) {
      stopAnimation();
      queueWheelCamera(nextCamera, true);
    } else {
      moveCamera(nextCamera);
    }
  }, [moveCamera, queueWheelCamera, stopAnimation]);

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
    return () => {
      observer.disconnect();
      stopAnimation();
      if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current);
      if (zoomLabelTimer.current !== null) clearTimeout(zoomLabelTimer.current);
    };
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
        const delta = Math.max(-120, Math.min(120, event.deltaY * unit));
        zoomAt(camera.current.zoom * Math.exp(-delta * 0.004), event.clientX - bounds.left, event.clientY - bounds.top, true);
      } else {
        const current = camera.current;
        stopAnimation();
        queueWheelCamera({ ...current,
          x: current.x - (event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit,
          y: current.y - (event.shiftKey ? 0 : event.deltaY) * unit,
        }, false);
      }
    };
    view.addEventListener("wheel", wheel, { passive: false });
    return () => view.removeEventListener("wheel", wheel);
  }, [active, queueWheelCamera, stopAnimation, zoomAt]);

  const selectedRecipe = recipeSelection?.component === selected ? recipeSelection.recipe : null;
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const view = viewport.current;
      const element = canvas.current;
      const unit = element?.querySelector<HTMLElement>(`[data-canvas-unit="${selected}"]`);
      const target = selectedRecipe ? unit?.querySelector<HTMLElement>(`[data-recipe-example="${selectedRecipe}"]`) : unit;
      if (!view || !element || !target || !view.clientWidth) return;
      if (naturalLayout()) {
        target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      } else {
        const bounds = target.getBoundingClientRect();
        const box = view.getBoundingClientRect();
        const current = camera.current;
        // Fit the three size columns, not the whole tall matrix; keep text legible.
        const overviewZoom = Math.min(1, Math.max(0.2, (view.clientWidth - 64) / element.offsetWidth));
        const zoom = selectedRecipe ? Math.max(current.zoom, overviewZoom) : overviewZoom;
        if (selectedRecipe && bounds.left >= box.left + 24 && bounds.right <= box.right - 24 && bounds.top >= box.top + 72 && bounds.bottom <= box.bottom - 76) return;
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
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const highlight = { outline: "2px solid var(--ds-foreground)", outlineOffset: "4px" };
      target.animate(reducedMotion ? [highlight, highlight] : [
        { outline: "2px solid transparent", outlineOffset: "4px" },
        { ...highlight, offset: 0.2 },
        { outline: "2px solid transparent", outlineOffset: "4px" },
      ], { duration: 1400 });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, selectedRecipe, active, moveCamera]);

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
      <p id={helpId} className={styles.srOnly}>On desktop, drag empty space or use the mouse wheel to pan without bounds. Hold Control or Command while scrolling to zoom at the pointer; Shift and scroll pans horizontally. Focus the canvas and use arrow keys to pan, or use Fit and zoom buttons. On mobile, scroll the page normally. Hover over a section for a selection outline; click an empty area of that section to edit its tokens. Select an example frame or its text to edit that exact combination. Keyboard users can select an example using its size button, then choose a layer in the inspector. Interactive behavior is available in the optional state previews.</p>
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
          // Middle drag pans anywhere; left drag on a design example selects a layer.
          if (event.button === 0 && event.target.closest("[data-recipe-example], a, button, input, textarea, select, label, summary, [role='switch'], [role='checkbox'], [contenteditable='true']")) return;
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
          {(selected === "colors" || selected === "spacing") && <div className={styles.foundations}>
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
                    {["radius", "radiusSm", "radiusLg", "borderWidth"].includes(field.key) ? <span className={styles.shapeVisual} />
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
          </div>}
          {selected !== "colors" && selected !== "spacing" && <section key={selected} className={styles.componentBoard} data-specimen={selected} data-canvas-unit={selected} data-selected aria-label={`${selected} preview`}>
            <ComponentMatrix component={selected} defaults={system.componentDefaults} selection={recipeSelection} onSelect={onSelectRecipe} />
            {selected !== "text" && <details className={styles.interactions} data-interaction-examples>
              <summary>Interaction & state previews</summary>
              <p>Try keyboard and pointer behavior here. Disabled, loading and radius examples inherit the same recipes; they are not separate style scopes.</p>
              <div className={styles.specimen}><Specimen id={selected} expanded copy={copy} /></div>
            </details>}
          </section>}
        </div>
      </div>
    </ThemePane>
  );
}
