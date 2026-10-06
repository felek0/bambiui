"use client";

import { useEffect, useState } from "react";
import type { AppearanceField } from "./components/appearance";
import { canvasAppearanceElements, readCanvasAppearance, type CanvasAppearanceScope, type RenderedAppearance } from "./rendered-appearance";

/** Observe preview paint, not inspector inputs or the zoom/pan transform. */
export function observeCanvasAppearance(scope: CanvasAppearanceScope, fields: readonly AppearanceField[], onChange: (values: RenderedAppearance) => void) {
  const matrix = document.querySelector(`[data-component-matrix="${scope.component}"]`);
  const theme = matrix?.closest("[data-ds-theme]");
  let active = true, tick = 0;
  const observed = new Set<Element>();
  const update = () => {
    tick = 0;
    const elements = new Set(canvasAppearanceElements(scope));
    for (const element of observed) if (!elements.has(element)) { resize.unobserve(element); observed.delete(element); }
    for (const element of elements) if (!observed.has(element)) { resize.observe(element); observed.add(element); }
    onChange(readCanvasAppearance(scope, fields));
  };
  const schedule = () => { if (active && !tick) tick = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  const mutation = new MutationObserver(schedule);
  if (matrix) {
    resize.observe(matrix);
    mutation.observe(matrix, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["style", "class", "data-size", "data-variant", "data-tone", "data-invalid", "data-checked", "data-unchecked", "data-disabled", "data-indeterminate", "readonly", "disabled", "aria-invalid"] });
  }
  if (theme) mutation.observe(theme, { attributes: true, attributeFilter: ["style", "class", "data-ds-theme"] });
  const events = ["pointerover", "pointerout", "focusin", "focusout", "transitionend"];
  for (const event of events) matrix?.addEventListener(event, schedule);
  const fonts = document.fonts;
  fonts?.ready.then(schedule);
  fonts?.addEventListener("loadingdone", schedule);
  fonts?.addEventListener("loadingerror", schedule);
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    active = false;
    cancelAnimationFrame(tick); mutation.disconnect(); resize.disconnect();
    for (const event of events) matrix?.removeEventListener(event, schedule);
    fonts?.removeEventListener("loadingdone", schedule);
    fonts?.removeEventListener("loadingerror", schedule);
    window.removeEventListener("resize", schedule);
  };
}

export function useCanvasAppearance({ component, part, recipe, target }: CanvasAppearanceScope, fields: readonly AppearanceField[]): RenderedAppearance {
  const [values, setValues] = useState<RenderedAppearance>({});
  useEffect(() => observeCanvasAppearance({ component, part, recipe, target }, fields, next => {
    setValues(previous => Object.keys(previous).length === Object.keys(next).length && Object.keys(next).every(key => next[key] === previous[key]) ? previous : next);
  }), [component, part, recipe, target, fields]);
  return values;
}
