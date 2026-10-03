"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ComposerSystemCatalog } from "./commands";
import { ComposerController } from "./controller";

export function useComposer(catalog: () => ComposerSystemCatalog) {
  const [controller] = useState(() => new ComposerController(catalog, () => `n${crypto.randomUUID()}`));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try { controller.hydrate(window.localStorage); }
      catch (error) {
        controller.hydrate({ getItem() { throw error; }, setItem() { throw error; }, removeItem() { throw error; } });
      }
    });
    return () => { cancelled = true; };
  }, [controller]);
  const project = state.collection.activeProjectId ? state.sessions[state.collection.activeProjectId] ?? null : null;
  const document = project?.history.present ?? null;
  const page = document?.pages.find((entry) => entry.id === project?.pageId) ?? null;
  return { controller, state, project, document, page };
}
export type Composer = ReturnType<typeof useComposer>;
