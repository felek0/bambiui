"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "../controls";
import { Icon } from "../icons";
import { resolveComposerSystem, COMPOSER_LIMITS } from "./model";
import type { StoredSystem } from "../systems";
import type { Composer } from "./use-composer";
import styles from "./composer.module.css";
import { ComposerCanvas } from "./composer-canvas";
import { NodeInspector } from "./node-inspector";
import { FrameInspector } from "./frame-inspector";
import type { PaletteMode } from "../color-engine";

type Props = { composer: Composer; systems: readonly StoredSystem[]; onPages: () => void };

export function ProjectManager({ composer, systems, onPages }: Props) {
  const { state, document, controller } = composer;
  const [name, setName] = useState("");
  const [systemId, setSystemId] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (details.current && !details.current.contains(event.target as Node)) details.current.open = false;
    };
    window.document.addEventListener("pointerdown", dismiss);
    return () => window.document.removeEventListener("pointerdown", dismiss);
  }, []);
  const blocked = !state.ready || state.indexBlocked || !!state.partial;
  const close = () => { details.current?.removeAttribute("open"); onPages(); };
  return <details className={styles.manager} ref={details} onKeyDown={(event) => {
    if (event.key === "Escape") { details.current?.removeAttribute("open"); details.current?.querySelector("summary")?.focus(); }
  }}>
    <summary aria-label={`Projects: ${document?.name ?? "Open or create"}`}><span className="system-switcher-name">Projects · {document?.name ?? "Open or create"}</span><Icon name="chevron" size={14} /></summary>
    <div className={`system-switcher-panel ${styles.managerPanel}`}>
      <h2 className="system-switcher-heading">Projects</h2>
      <p className={styles.hint}>Projects own pages. Choosing a project does not switch the design-system editor.</p>
      <div className={styles.list}>
        {state.collection.projectIds.map((id) => <button type="button" key={id} disabled={blocked} aria-current={id === document?.id ? "true" : undefined} onClick={() => { if (controller.open(id)) close(); }}>
          {state.sessions[id]?.history.present.name ?? `${id} · unavailable`}
        </button>)}
        {!state.collection.projectIds.length && <p className={styles.hint}>No projects yet.</p>}
      </div>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (controller.create(name.trim(), systemId || systems[0]?.id || "")) { setName(""); close(); } }}>
        <label>New project name<input aria-label="New project name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={blocked} /></label>
        <label>Design system<select aria-label="New project design system" value={systemId || systems[0]?.id || ""} onChange={(event) => setSystemId(event.target.value)} disabled={blocked || !systems.length}>
          {systems.map((entry) => <option key={entry.id} value={entry.id}>{entry.system.name || "Untitled system"}</option>)}
        </select></label>
        <Button type="submit" disabled={blocked || !name.trim() || !systems.length}>Create project</Button>
      </form>
      {document && <div className={styles.actions}><Button disabled={blocked} onClick={close}>Project settings</Button><Button disabled={blocked} onClick={() => { if (controller.duplicate()) close(); }}>Duplicate project</Button></div>}
      {(state.message || state.partial || composer.project?.error) && <ProjectNotice composer={composer} />}
    </div>
  </details>;
}

export function PagesPanel({ composer, active, onPages }: { composer: Composer; active: boolean; onPages: () => void }) {
  const { document, page, state, controller } = composer;
  return <section className={styles.pages} aria-label="Project pages">
    <div className={styles.pagesHeading}><Link href="/pages" aria-current={active && !page ? "page" : undefined}>PAGES</Link>
      <button type="button" aria-label="Add page" title="Add blank page" disabled={!document || state.indexBlocked || !!state.partial || document.pages.length >= COMPOSER_LIMITS.pages} onClick={() => { if (controller.addPage()) onPages(); }}>+</button>
    </div>
    <nav aria-label="Pages">{document?.pages.map((entry) => <Link className={styles.pageLink} href="/pages" key={entry.id} aria-current={active && page?.id === entry.id ? "page" : undefined} onClick={() => controller.selectPage(entry.id)}>{entry.name}</Link>)}</nav>
    {!document && <p className={styles.hint}>Create or open a project above.</p>}
    {document && !document.pages.length && <p className={styles.hint}>Add your first blank page.</p>}
  </section>;
}

function backup(document: NonNullable<Composer["document"]>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }));
  const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${document.id}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ProjectNotice({ composer }: { composer: Composer }) {
  const { state, project, document, controller } = composer;
  const error = state.message || project?.error;
  return <div className={styles.notice}>
    <p role="status" data-project-status>{!state.ready ? "Loading projects…" : project?.status === "unsaved" ? "Project not saved" : document ? "Project saved locally" : "No project open"}</p>
    {error && <p role="alert">{error}</p>}
    {state.partial && <Button onClick={controller.retryRegistration}>Retry project registration</Button>}
    {project?.status === "unsaved" && <Button onClick={controller.save}>Retry project save</Button>}
    {(error || project?.status === "unsaved") && document && <Button onClick={() => backup(document)}>Download in-memory project JSON</Button>}
  </div>;
}

export function PageCanvas({ composer, systems, theme, onTheme }: Pick<Props, "composer" | "systems"> & { theme: PaletteMode; onTheme: (theme: PaletteMode) => void }) {
  const { document, page, project, state, controller } = composer;
  const projectSystem = document ? resolveComposerSystem(document, systems) : null;
  return <section className={styles.canvas} aria-label="Page canvas" data-project-id={document?.id} data-page-id={page?.id} data-system-id={document?.systemId}>
    <div className="canvas-history" role="group" aria-label="Project history">
      <Button iconOnly aria-label="Undo project edit" title="Undo project edit" disabled={!project?.history.past.length || state.indexBlocked || !!state.partial} onClick={() => controller.travel("undo")}><Icon name="undo" size={16} /></Button>
      <Button iconOnly aria-label="Redo project edit" title="Redo project edit" disabled={!project?.history.future.length || state.indexBlocked || !!state.partial} onClick={() => controller.travel("redo")}><Icon name="redo" size={16} /></Button>
    </div>
    <div className={styles.pageInfo}><h1>{page?.name ?? (document ? "Project pages" : "Pages")}</h1><p className={styles.hint}>{document ? `${document.name} · ${projectSystem?.system.name ?? `Unavailable system (${document.systemId})`}` : "A blank canvas for your project's pages."}</p></div>
    <ProjectNotice composer={composer} />
    <label className={styles.themePicker}>Frame theme <select aria-label="Frame theme" value={theme} onChange={event => onTheme(event.target.value as PaletteMode)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
    {document && !projectSystem && <p role="alert" className={styles.notice}>The linked design system is unavailable. Content is preserved; choose a system in Project settings. Painted preview and source export are blocked—there is no fallback system.</p>}
    {page ? <ComposerCanvas key={`${document!.id}-${page.id}`} composer={composer} system={projectSystem?.system ?? null} theme={theme} /> : <div className={styles.blank}><div className={styles.empty}>
      <h2>{!state.ready ? "Loading projects" : !document ? "Create or open a project" : "Add a blank page"}</h2>
      <p className={styles.hint}>{!document ? "Use Projects in the header to get started. Your pages are stored separately from design-system tokens." : "Pages belong only to this project. Start with an empty page, not demo content."}</p>
      {document && !page && <div className={styles.actions}><Button onClick={controller.addPage} disabled={state.indexBlocked || !!state.partial}>Add page</Button></div>}

    </div></div>}
  </section>;
}

export function ProjectInspector({ composer, systems, onEditSystem }: Pick<Props, "composer" | "systems"> & { onEditSystem: (id: string, kind?: string) => void }) {
  const { document, page, state, controller } = composer;
  const [targetId, setTargetId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const projectSystem = document ? resolveComposerSystem(document, systems) : null;
  const target = systems.find((entry) => entry.id === targetId);
  const selectedFrame = page?.frames.find(frame => frame.id === composer.project?.frameId);
  const blocked = state.indexBlocked || !!state.partial;
  return <aside className={styles.inspector} id="project-inspector" aria-label="Project and page inspector" tabIndex={-1}>
    <h2>Project settings</h2>
    {!document ? <p className={styles.hint}>Open a project to inspect its pages and design-system link.</p> : <>
      <NodeInspector composer={composer} disabled={blocked || state.mode === "preview"} onEditSystem={onEditSystem} />
      <section><RenameForm key={`project-${document.id}-${document.name}`} label="Project name" name={document.name} disabled={blocked} onRename={(name) => controller.execute({ type: "renameProject", name })} /><details className={styles.hint}><summary>Project reference</summary><code>{document.id}</code></details></section>
      <section><h3>Design system</h3><p className={styles.hint}>Linked: <strong data-project-system>{projectSystem?.system.name ?? `Unavailable (${document.systemId})`}</strong></p>
        <p className={styles.hint}>Browsing the design-system editor does not change this link. Editing a shared system affects every project linked to it.</p>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); setConfirmOpen(true); }}>
          <label>Change design system<select aria-label="Project design system" value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={blocked}>
            <option value="">Choose a system…</option>{systems.map((entry) => <option key={entry.id} value={entry.id}>{entry.system.name || "Untitled system"}</option>)}
          </select></label>
          <Button type="submit" disabled={blocked || !target || target.id === document.systemId}>Preview system change</Button>
        </form>
        {projectSystem && <Button onClick={() => onEditSystem(projectSystem.id)}>Edit project system</Button>}
      </section>
      {selectedFrame ? <FrameInspector key={`${page!.id}-${selectedFrame.id}-${selectedFrame.name}`} composer={composer} frame={selectedFrame} disabled={blocked} /> : <section><h3>Frame settings</h3><p className={styles.hint}>Select a frame on the canvas to edit its name, size and position.</p></section>}
            <section><h3>Page info</h3>{page ? <><RenameForm key={`page-${page.id}-${page.name}`} label="Page name" name={page.name} disabled={blocked} onRename={(name) => controller.execute({ type: "renamePage", pageId: page.id, name })} /><p className={styles.hint}>{page.frames.length} frames</p></> : <p className={styles.hint}>No page selected.</p>}</section>
      <p className={styles.hint}>Project edits save locally after each validated action. Page selection and project Undo/Redo are session-only; reload selects the first page. Browser storage is not a permanent backup.</p>
      <p className={styles.hint}>Page Develop and source export are not available yet.</p>
    </>}
    <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Dialog.Portal><Dialog.Backdrop className="studio-backdrop" /><Dialog.Popup className={`export-dialog ${styles.dialog}`}>
        <Dialog.Title>Change project design system?</Dialog.Title>
        <Dialog.Description className={styles.hint}>Only the system link of this project changes. Pages, frame geometry, content and instance overrides are preserved. Overrides may hide the new defaults. This is one project Undo step; neither system tokens nor other projects change.</Dialog.Description>
        {target && <><p className={styles.hint}>{projectSystem?.system.name ?? "Unavailable system"} → <strong>{target.system.name}</strong></p>
          {(["light", "dark"] as const).map((mode) => <div key={mode}><p className={styles.hint}>{mode === "light" ? "Light" : "Dark"} target colors · radius {target.system.themes[mode].global.radius}px</p><div className={styles.swatches} aria-label={`${mode} target color preview`}>{(["background", "foreground", "primary"] as const).map((role) => <span key={role} title={`${role}: ${target.system.themes[mode].global[role]}`} style={{ backgroundColor: target.system.themes[mode].global[role] }} />)}</div></div>)}</>}
        <p className={styles.hint}>This is a token-impact preview. Confirm to paint all project frames with the linked system.</p>
        <div className={styles.actions}><Dialog.Close render={<Button />}>Cancel</Dialog.Close><Button disabled={!target || blocked || !document || target.id === document.systemId} onClick={() => { if (target && controller.execute({ type: "changeProjectSystem", systemId: target.id })) { setConfirmOpen(false); setTargetId(""); } }}>Confirm system change</Button></div>
      </Dialog.Popup></Dialog.Portal>
    </Dialog.Root>
  </aside>;
}
function RenameForm({ label, name, disabled, onRename }: { label: string; name: string; disabled: boolean; onRename: (name: string) => boolean }) {
  const [draft, setDraft] = useState(name);
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); onRename(draft.trim()); }}><label>{label}<input aria-label={label} required maxLength={120} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} /></label><Button type="submit" disabled={disabled || !draft.trim() || draft.trim() === name}>Rename {label.startsWith("Page") ? "page" : "project"}</Button></form>;
}
