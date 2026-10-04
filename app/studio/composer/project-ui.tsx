"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "../controls";
import { Icon } from "../icons";
import { resolveComposerSystem, COMPOSER_LIMITS } from "./model";
import { resolveSelection } from "./selection";
import type { StoredSystem } from "../systems";
import type { Composer } from "./use-composer";
import styles from "./composer.module.css";
import { ComposerCanvas } from "./composer-canvas";
import { NodeInspector } from "./node-inspector";
import { FrameInspector } from "./frame-inspector";
import type { PaletteMode } from "../color-engine";

type Props = { composer: Composer; systems: readonly StoredSystem[]; onPages: () => void };

export function ProjectManager({ composer, systems, onPages, onSettings, managerRef }: Props & { onSettings: () => void; managerRef?: RefObject<HTMLDetailsElement | null> }) {
  const { state, document, controller } = composer;
  const [name, setName] = useState("");
  const [systemId, setSystemId] = useState("");
  const localRef = useRef<HTMLDetailsElement>(null);
  const details = managerRef ?? localRef;
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (details.current && !details.current.contains(event.target as Node)) details.current.open = false;
    };
    window.document.addEventListener("pointerdown", dismiss);
    return () => window.document.removeEventListener("pointerdown", dismiss);
  }, [details]);
  const blocked = !state.ready || state.indexBlocked || !!state.partial;
  const close = () => { details.current?.removeAttribute("open"); onPages(); };
  return <details className={styles.manager} ref={details} onKeyDown={(event) => {
    if (event.key === "Escape") { details.current?.removeAttribute("open"); details.current?.querySelector("summary")?.focus(); }
  }}>
    <summary aria-label={`Projects: ${document?.name ?? "Open or create"}`}><Icon name="box" size={14} /><span className="system-switcher-name">{document?.name ?? "Open or create project"}</span><Icon name="chevron" size={12} /></summary>
    <div className={`system-switcher-panel ${styles.managerPanel}`}>
      <h2 className="system-switcher-heading">Projects</h2>
      <div className={styles.list}>
        {state.collection.projectIds.map((id) => <button type="button" key={id} disabled={blocked} aria-current={id === document?.id ? "true" : undefined} onClick={() => { if (controller.open(id)) close(); }}>
          {state.sessions[id]?.history.present.name ?? `${id} · unavailable`}
        </button>)}
        {!state.collection.projectIds.length && <p className={styles.hint}>No projects yet. Create one to start designing.</p>}
      </div>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (controller.create(name.trim(), systemId || systems[0]?.id || "")) { setName(""); close(); } }}>
        <label>New project name<input aria-label="New project name" placeholder="Untitled project" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={blocked} /></label>
        <label>Design system<select aria-label="New project design system" value={systemId || systems[0]?.id || ""} onChange={(event) => setSystemId(event.target.value)} disabled={blocked || !systems.length}>
          {systems.map((entry) => <option key={entry.id} value={entry.id}>{entry.system.name || "Untitled system"}</option>)}
        </select></label>
        <Button variant="primary" type="submit" disabled={blocked || !name.trim() || !systems.length}>Create project</Button>
      </form>
      {document && <div className={styles.actions}><Button onClick={() => { close(); onSettings(); }}>Project settings</Button><Button disabled={blocked} onClick={() => { if (controller.duplicate()) close(); }}>Duplicate project</Button></div>}
      {(state.message || state.partial || composer.project?.error || composer.project?.status === "unsaved") && <ProjectNotice composer={composer} />}
    </div>
  </details>;
}

export function PagesPanel({ composer, active, onPages }: { composer: Composer; active: boolean; onPages: () => void }) {
  const { document, page, state, controller } = composer;
  return <section className={styles.pages} aria-label="Project pages">
    <div className={styles.pagesHeading}><Link href="/pages" aria-current={active && !page ? "page" : undefined}>Pages</Link>
      <button type="button" aria-label="Add page" title="Add blank page" disabled={!document || state.indexBlocked || !!state.partial || document.pages.length >= COMPOSER_LIMITS.pages} onClick={() => { if (controller.addPage()) onPages(); }}><Icon name="plus" size={14} /></button>
    </div>
    <nav aria-label="Pages">{document?.pages.map((entry) => <Link className={styles.pageLink} href="/pages" key={entry.id} aria-current={active && page?.id === entry.id ? "page" : undefined} onClick={() => controller.selectPage(entry.id)}><Icon name="card" size={13} /><span>{entry.name}</span>{active && page?.id === entry.id && <Icon name="check" size={12} />}</Link>)}</nav>
    {!document && <p className={styles.hint}>Open a project to see its pages.</p>}
    {document && !document.pages.length && <p className={styles.hint}>Add your first blank page.</p>}
  </section>;
}

function backup(document: NonNullable<Composer["document"]>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }));
  const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${document.id}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProjectStatus({ composer }: { composer: Composer }) {
  const { state, project, document } = composer;
  const unsaved = project?.status === "unsaved" || !!state.partial || state.indexBlocked;
  const label = !state.ready ? "Loading projects…" : unsaved ? "Project not saved" : document ? "Project saved locally" : "No project open";
  return <span className={styles.saveStatus} role="status" data-project-status data-unsaved={unsaved || undefined} title={label}><span aria-hidden="true" /><span className="sr-only">{label}</span><span aria-hidden="true">{!state.ready ? "Loading…" : unsaved ? "Not saved" : document ? "Saved locally" : "Local workspace"}</span></span>;
}

export function ProjectNotice({ composer }: { composer: Composer }) {
  const { state, project, document, controller } = composer;
  const error = state.message || project?.error;
  if (!error && !state.partial && project?.status !== "unsaved") return null;
  return <div className={styles.notice}>
    {error && <p role="alert">{error}</p>}
    {project?.status === "unsaved" && <p role="status">Project not saved. Your latest edits remain in memory.</p>}
    <div className={styles.actions}>
      {state.partial && <Button onClick={controller.retryRegistration}>Retry project registration</Button>}
      {project?.status === "unsaved" && <Button onClick={controller.save}>Retry project save</Button>}
      {(error || project?.status === "unsaved") && document && <Button onClick={() => backup(document)}>Download in-memory project JSON</Button>}
    </div>
  </div>;
}

export function PageCanvas({ composer, systems, theme, onTheme, onOpenProjects, onSettings }: Pick<Props, "composer" | "systems"> & { theme: PaletteMode; onTheme: (theme: PaletteMode) => void; onOpenProjects: () => void; onSettings: () => void }) {
  const { document, page, state, controller } = composer;
  const projectSystem = document ? resolveComposerSystem(document, systems) : null;
  return <section className={styles.canvas} aria-label="Page canvas" data-project-id={document?.id} data-page-id={page?.id} data-system-id={document?.systemId}>
    <h1 className="sr-only">{page?.name ?? document?.name ?? "Project workspace"}</h1>
    <div className={styles.canvasNotices}>
      <ProjectNotice composer={composer} />
      {document && !projectSystem && <div className={styles.notice}><p role="alert">The linked design system is unavailable. Content is preserved; choose a system in Project settings. Painted preview and source export are blocked—there is no fallback system.</p><Button onClick={onSettings}>Project settings</Button></div>}
    </div>
    {page ? <ComposerCanvas key={`${document!.id}-${page.id}`} composer={composer} system={projectSystem?.system ?? null} theme={theme} onTheme={onTheme} status={<ProjectStatus composer={composer} />} /> : <>
      <div className={styles.blank}><div className={styles.empty}>
        <span className={styles.emptyGlyph}><Icon name="desktop" size={24} /></span>
        <h2>{!state.ready ? "Loading your workspace" : !document ? "A space for your next idea" : "Start your first page"}</h2>
        <p className={styles.hint}>{!document ? "Create a project or open an existing one to start designing." : "Add a blank page, then build it with frames and components."}</p>
        <div className={styles.actions}>{!document ? <Button variant="primary" onClick={onOpenProjects} disabled={!state.ready}>Create or open a project</Button> : <Button variant="primary" onClick={controller.addPage} disabled={state.indexBlocked || !!state.partial}>Add page</Button>}</div>
      </div></div>
      <div className={styles.canvasToolbar} role="group" aria-label="Canvas tools"><label className={styles.themePicker}><Icon name={theme === "light" ? "sun" : "moon"} size={14} /><select aria-label="Frame theme" value={theme} onChange={event => onTheme(event.target.value as PaletteMode)}><option value="light">Light</option><option value="dark">Dark</option></select></label><ProjectStatus composer={composer} /></div>
    </>}
  </section>;
}

export function ProjectInspector({ composer, systems, onEditSystem, tab, onTabChange }: Pick<Props, "composer" | "systems"> & { onEditSystem: (id: string, kind?: string) => void; tab: "design" | "project"; onTabChange: (tab: "design" | "project") => void }) {
  const { document, page, state, controller } = composer;
  const [targetId, setTargetId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const projectSystem = document ? resolveComposerSystem(document, systems) : null;
  const target = systems.find((entry) => entry.id === targetId);
  const selectedNode = document && resolveSelection(document, composer.project?.selection ?? null);
  const selectedFrame = page?.frames.find(frame => frame.id === composer.project?.frameId);
  const blocked = state.indexBlocked || !!state.partial;
  return <aside className={styles.inspector} id="project-inspector" aria-label="Project and page inspector" tabIndex={-1}>
    <Tabs.Root value={tab} onValueChange={value => onTabChange(value as "design" | "project")} className={styles.inspectorTabs}>
      <Tabs.List className={styles.panelTabs} aria-label="Inspector view"><Tabs.Tab value="design" className={styles.panelTab}>Parameters</Tabs.Tab><Tabs.Tab value="project" className={styles.panelTab}>Project</Tabs.Tab></Tabs.List>
      <Tabs.Panel value="design" className={styles.inspectorPanel}>
        {!document ? <div className={styles.inspectorEmpty}><Icon name="sliders" size={20} /><h2>Make it yours</h2><p className={styles.hint}>Select a frame or layer to edit its properties.</p></div>
          : selectedNode ? <NodeInspector composer={composer} disabled={blocked || state.mode === "preview"} onEditSystem={onEditSystem} />
            : selectedFrame ? <FrameInspector key={`${page!.id}-${selectedFrame.id}-${selectedFrame.name}`} composer={composer} frame={selectedFrame} disabled={blocked || state.mode === "preview"} />
              : <section><h2>Page settings</h2>{page ? <><RenameForm key={`page-${page.id}-${page.name}`} label="Page name" name={page.name} disabled={blocked} onRename={(name) => controller.execute({ type: "renamePage", pageId: page.id, name })} /><p className={styles.hint}>{page.frames.length} frames</p></> : <p className={styles.hint}>Add a page to start designing.</p>}<p className={styles.hint}>Select a frame or layer on the canvas to inspect it.</p><Button variant="ghost" onClick={() => onTabChange("project")}>Project settings</Button></section>}
      </Tabs.Panel>
      <Tabs.Panel value="project" className={styles.inspectorPanel}>
        <h2>Project settings</h2>
        {!document ? <p className={styles.hint}>Open a project to manage its design-system link and local backup.</p> : <>
          <section><RenameForm key={`project-${document.id}-${document.name}`} label="Project name" name={document.name} disabled={blocked} onRename={(name) => controller.execute({ type: "renameProject", name })} /></section>
          <section><h3>Design system</h3><p className={styles.hint}>Linked: <strong data-project-system>{projectSystem?.system.name ?? `Unavailable (${document.systemId})`}</strong></p>
            {projectSystem && <Button onClick={() => onEditSystem(projectSystem.id)}>Edit project system</Button>}
            <details className={styles.settingsDetails}><summary>Change linked system</summary>
              <p className={styles.hint}>Browsing System does not change this link. Shared system edits affect every linked project.</p>
              <form className={styles.form} onSubmit={(event) => { event.preventDefault(); setConfirmOpen(true); }}>
                <label>Change design system<select aria-label="Project design system" value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={blocked}>
                  <option value="">Choose a system…</option>{systems.map((entry) => <option key={entry.id} value={entry.id}>{entry.system.name || "Untitled system"}</option>)}
                </select></label>
                <Button type="submit" disabled={blocked || !target || target.id === document.systemId}>Preview system change</Button>
              </form>
            </details>
          </section>
          <section><h3>Local backup</h3><p className={styles.hint}>Edits save locally after each validated action. Browser storage is not a permanent backup.</p><Button startIcon={<Icon name="download" size={14} />} onClick={() => backup(document)}>Download project JSON</Button></section>
          <details className={styles.settingsDetails}><summary>Project details</summary><code>{document.id}</code><p className={styles.hint}>Page selection and project Undo/Redo are session-only; reload selects the first page. Page Develop and source export are not available yet.</p></details>
        </>}
      </Tabs.Panel>
    </Tabs.Root>
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
