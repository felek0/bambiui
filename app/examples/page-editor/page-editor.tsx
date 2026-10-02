"use client";

import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { serializePageBundle, type PageBundle } from "../../studio/page-document/bundle";
import { ioMessage, readBundleFile, readLocalBundle, resetLocalBundle, saveLocalBundle } from "./storage";
import type { PageCommand } from "../../studio/page-document/commands";
import { createPageHistory, executePageCommands, undoPage, redoPage } from "../../studio/page-document/history";
import type { PageKind, PageNode, PageProp } from "../../studio/page-document/model";
import { nodeRegistry } from "../../studio/page-document/registry";
import { RenderPageBundle } from "../../studio/page-document/render";
import { allowedChildKinds, createEditorNode, locateNode } from "./editing";
import styles from "./page.module.css";

function Layers({ node, selectedId, select }: { node: PageNode; selectedId: string; select: (id: string) => void }) {
  return <li>
    <button type="button" className={styles.layer} data-editor-layer={node.id} aria-pressed={selectedId === node.id} onClick={() => select(node.id)}>
      <span>{nodeRegistry[node.kind].element}</span>
      <small>{node.text?.slice(0, 40) || node.id}</small>
    </button>
    {!!node.children?.length && <ul>{node.children.map((child) => <Layers key={child.id} node={child} selectedId={selectedId} select={select} />)}</ul>}
  </li>;
}

function Properties({ node, commit }: { node: PageNode; commit: (command: PageCommand) => void }) {
  const definition = nodeRegistry[node.kind];
  const entries = Object.entries(definition.props);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const props: Record<string, PageProp | null> = {};
    for (const [key, rule] of entries) {
      const value = String(data.get(key) ?? "");
      props[key] = value === "" ? null : typeof rule === "string" ? value : rule.find((option) => String(option) === value) ?? null;
    }
    commit({ type: "update", nodeId: node.id, ...(entries.length ? { props } : {}), ...(definition.text ? { text: String(data.get("nodeText") ?? "") } : {}) });
  }
  if (!definition.text && !entries.length) return <p className={styles.muted}>This node has no editable properties. Use its child slots below.</p>;
  return <form onSubmit={apply} noValidate className={styles.fields}>
    {definition.text && <label>Text <span className={styles.muted}>(required)</span><textarea name="nodeText" defaultValue={node.text} rows={4} maxLength={2000} /></label>}
    {entries.map(([key, rule]) => {
      const required = definition.requiredProps?.includes(key);
      return <label key={key}>{key} {required && <span className={styles.muted}>(required)</span>}
        {typeof rule === "string" ? <input name={key} defaultValue={String(node.props?.[key] ?? "")} maxLength={rule === "name" ? 64 : 200} aria-describedby={rule === "name" || rule === "action" ? `hint-${key}` : undefined} /> :
          <select name={key} defaultValue={String(node.props?.[key] ?? "")}>
            <option value="">Component default</option>
            {rule.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
          </select>}
        {rule === "name" && <small id={`hint-${key}`} className={styles.muted}>Start with a letter; use letters, digits, underscores or hyphens.</small>}
        {rule === "action" && <small id={`hint-${key}`} className={styles.muted}>Local path only, such as /examples/page-editor. Preview submissions never navigate.</small>}
      </label>;
    })}
    <button type="submit">Apply properties</button>
    <p className={styles.muted}>Draft fields apply together. Invalid edits leave the page unchanged. Selecting another layer discards unapplied property drafts.</p>
  </form>;
}

export default function PageEditor({ initialBundle }: { initialBundle: PageBundle }) {
  const [snapshot, setSnapshot] = useState(() => structuredClone(initialBundle));
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [drafts, setDrafts] = useState(false);
    const [savedText, setSavedText] = useState<string | null>(null);
    const [storageWarning, setStorageWarning] = useState("");
    const [ioError, setIoError] = useState("");
    const expectedRaw = useRef<string | null>(null);
  const [history, setHistory] = useState(() => createPageHistory(initialBundle.page));
  const [selectedId, setSelectedId] = useState(initialBundle.page.root.id);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Checking this browser’s local copy…");
  const [revision, setRevision] = useState(0);
  const treeRef = useRef<HTMLUListElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [previewWidth, setPreviewWidth] = useState<"narrow" | "wide">("wide");
  const [selectionMode, setSelectionMode] = useState(false);
  const page = history.present;
  const found = locateNode(page.root, selectedId) ?? locateNode(page.root, page.root.id)!;
  const selected = found.node;
  const parent = found.ancestors.at(-1);
  const allowed = allowedChildKinds(page.root, selected.id);

  const currentBundle = { ...snapshot, page };
  const currentText = JSON.stringify(currentBundle);
  const saved = savedText !== null && savedText === currentText;

  useEffect(() => {
    const nodes = previewRef.current?.querySelectorAll<HTMLElement>("[data-page-node]");
    nodes?.forEach((node) => {
      if (node.dataset.pageNode === selected.id) node.dataset.editorSelected = "true";
      else delete node.dataset.editorSelected;
    });
  }, [selected.id, page, previewTheme]);

  function selectLayer(id: string) {
    setSelectedId(id);
    setError("");
  }

  function replaceBundle(bundle: PageBundle) {
    setSnapshot(bundle);
    setHistory(createPageHistory(bundle.page));
    setSelectedId(bundle.page.root.id);
    setRevision((value) => value + 1);
    setDrafts(false);
    setError("");
  }

  useEffect(() => {
    // Delay initialization until hydration; never write on mount (including Strict Mode replay).
    const timer = window.setTimeout(() => {
      try {
        const result = readLocalBundle(window.localStorage);
        if (result.kind === "blocked") setStorageWarning(result.message);
        else {
          expectedRaw.current = result.raw;
          if (result.kind === "valid") {
            replaceBundle(result.bundle);
            setSavedText(JSON.stringify(result.bundle));
          }
        }
        setNotice(result.kind === "valid" ? "Local snapshot restored. History and drafts start fresh." : "Ready. Use Save locally to persist applied edits.");
      } catch (reason) {
        setStorageWarning(`${ioMessage(reason)}. Local storage is unavailable. Export a JSON backup; Reset local copy can retry storage explicitly.`);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || (saved && !drafts)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [ready, saved, drafts]);

  function save() {
    try {
      const text = saveLocalBundle(window.localStorage, currentBundle, expectedRaw.current);
      expectedRaw.current = text;
      setSavedText(currentText);
      setIoError("");
      setNotice("Applied page and detached design-system snapshot saved locally. Unapplied drafts are not saved.");
    } catch (reason) { setIoError(`Local save failed: ${ioMessage(reason)} Your in-memory edits remain available; export a JSON backup.`); }
  }

  function resetLocal() {
    if (!window.confirm("Replace the stored local copy and current page with the default demo? Current edits, history and unapplied drafts will be discarded. Export a backup first if needed.")) return;
    try {
      const bundle = structuredClone(initialBundle);
      const text = resetLocalBundle(window.localStorage, bundle);
      expectedRaw.current = text;
      replaceBundle(bundle);
      setSavedText(JSON.stringify(bundle));
      setStorageWarning("");
      setIoError("");
      setNotice("Local copy reset to the default detached snapshot. History and drafts cleared.");
    } catch (reason) { setIoError(`Reset failed: ${ioMessage(reason)} Current page and history were not changed.`); }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const bundle = await readBundleFile(file);
      if (!window.confirm("Replace the current page and detached design-system snapshot? Current edits, undo/redo history and unapplied drafts will be discarded. The stored local copy stays unchanged until you explicitly save.")) return;
      replaceBundle(bundle);
      setIoError("");
      setNotice("JSON bundle imported with fresh history. Use Save locally to replace the stored copy.");
    } catch (reason) { setIoError(`Import rejected: ${ioMessage(reason)} Current page and history were not changed.`); }
    finally { setBusy(false); }
  }

  function exportFile() {
    let url: string | undefined;
    try {
      const text = serializePageBundle(currentBundle);
      url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "bambiui-page-bundle.json";
      document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      setIoError("");
      setNotice("JSON backup download requested for applied edits and the detached snapshot. Drafts and history are not included.");
    } catch (reason) { setIoError(`Export failed: ${ioMessage(reason)}`); }
    finally { if (url) { const downloadUrl = url; window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000); } }
  }

  function commit(command: PageCommand, nextSelection?: string) {
    try {
      const next = executePageCommands(history, [command]);
      setHistory(next);
      if (nextSelection) {
        setSelectedId(nextSelection);
        requestAnimationFrame(() => {
          const button = Array.from(treeRef.current?.querySelectorAll<HTMLButtonElement>("[data-editor-layer]") ?? []).find((item) => item.dataset.editorLayer === nextSelection);
          button?.focus();
        });
      }
      setError("");
      setNotice(next === history ? "No changes to apply." : "Page updated. Use Save locally to persist applied edits.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to apply this edit.");
      setNotice("");
    }
  }

  function restore(direction: "undo" | "redo") {
    const next = direction === "undo" ? undoPage(history) : redoPage(history);
    setHistory(next);
    if (!locateNode(next.present.root, selected.id)) setSelectedId(next.present.root.id);
    setError("");
    setNotice(direction === "undo" ? "Undid page edit. Unapplied drafts were discarded." : "Redid page edit. Unapplied drafts were discarded.");
    setRevision((value) => value + 1);
    setDrafts(false);
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const kind = String(new FormData(event.currentTarget).get("kind")) as PageKind;
    if (!allowed.includes(kind)) return;
    const node = createEditorNode(kind, () => `node-${crypto.randomUUID()}`);
    commit({ type: "insert", parentId: selected.id, index: selected.children?.length ?? 0, node }, node.id);
  }

  return <div className={styles.editor}>
    <a href="#editor-workspace" className={styles.skip}>Skip to page editor</a>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>bambiui · prototype</p><h1>Page editor</h1><p className={styles.muted}>Detached snapshot demo. Explicit browser-local saving and JSON backups only; no project storage or live Studio connection.</p></div>
      <div className={styles.actions} role="group" aria-label="Page history">
        <button type="button" disabled={!ready || busy || !history.past.length} onClick={() => restore("undo")}>Undo</button>
        <button type="button" disabled={!ready || busy || !history.future.length} onClick={() => restore("redo")}>Redo</button>
      </div>
    </header>
    <fieldset className={`${styles.panel} ${styles.persistence}`} disabled={!ready || busy}>
      <legend>Local copy and JSON backup</legend>
      <div className={styles.actions}>
        <button type="button" onClick={save} disabled={!!storageWarning}>Save locally</button>
        <button type="button" onClick={exportFile}>Export JSON backup</button>
        <button type="button" onClick={resetLocal}>Reset local copy</button>
      </div>
      <label className={styles.fields}>Import page bundle JSON (maximum 1 MiB)<input type="file" accept=".json,application/json" onChange={importFile} /></label>
      <p role="status">{!ready ? "Checking local storage…" : ioError ? "Last operation failed; see the error below. No new local save is confirmed." : saved ? "Current applied snapshot matches the last restored or successfully saved local copy." : "Current snapshot is not saved locally."} {busy && "Reading import…"} {drafts && "Draft fields may contain unapplied changes; drafts are excluded from saves and backups."}</p>
      <p className={styles.muted}>One local copy for this browser and origin. No autosave or cloud sync. Import does not save. History, selection and drafts are session-only. Back up before replacing a copy; browser storage can be cleared.</p>
    </fieldset>
    <div className={styles.feedback}>
      <p role="status">{notice}</p>
      {storageWarning && <p role="alert" className={styles.error}><strong>Local storage blocked:</strong> {storageWarning}</p>}
      {ioError && <p role="alert" className={styles.error}>{ioError}</p>}
      {error && <p role="alert" className={styles.error}><strong>Edit rejected:</strong> {error}</p>}
    </div>
    <fieldset id="editor-workspace" className={styles.workspace} tabIndex={-1} disabled={!ready || busy} onChangeCapture={(event) => {
      if ((event.target as HTMLElement).closest("form") && !(event.target as HTMLElement).closest(`.${styles.previewPanel}`)) setDrafts(true);
    }}>
      <section aria-labelledby="layers-heading" className={styles.panel}>
        <h2 id="layers-heading">Layers</h2>
        <form key={`name-${revision}`} className={styles.fields} noValidate onSubmit={(event) => {
          event.preventDefault();
          commit({ type: "rename", name: String(new FormData(event.currentTarget).get("pageName") ?? "") });
        }}>
          <label>Page name<input name="pageName" defaultValue={page.name} maxLength={120} /></label>
          <button type="submit">Rename page</button>
        </form>
        <p className={styles.muted}>Select a layer to edit. The root cannot be deleted or reordered.</p>
        <ul ref={treeRef} className={styles.tree}><Layers node={page.root} selectedId={selected.id} select={selectLayer} /></ul>
      </section>
      <section aria-labelledby="properties-heading" className={styles.panel}>
        <h2 id="properties-heading">Properties</h2>
        <p><strong>{nodeRegistry[selected.kind].element}</strong><br /><small className={styles.muted}>{selected.id}</small></p>
        <div className={styles.actions}>
          <button type="button" disabled={!parent || found.index === 0} onClick={() => parent && commit({ type: "move", nodeId: selected.id, parentId: parent.id, index: found.index - 1 })}>Move up</button>
          <button type="button" disabled={!parent || found.index === (parent.children?.length ?? 0) - 1} onClick={() => parent && commit({ type: "move", nodeId: selected.id, parentId: parent.id, index: found.index + 1 })}>Move down</button>
          <button type="button" disabled={!parent} onClick={() => parent && commit({ type: "delete", nodeId: selected.id }, parent.id)}>Delete</button>
        </div>
        <Properties key={`${selected.id}-${revision}`} node={selected} commit={commit} />
        <h3>Add child</h3>
        {allowed.length ? <form key={`${selected.id}-${allowed.join()}`} onSubmit={add} className={styles.fields}>
          <label>Child type<select name="kind" defaultValue={allowed[0]}>{allowed.map((kind) => <option key={kind} value={kind}>{nodeRegistry[kind].element}</option>)}</select></label>
          <button type="submit">Add to selected layer</button>
        </form> : <p className={styles.muted}>No available child slots.</p>}
        <p className={styles.muted}>Cards and headers need at least one child. Unique slots and page limits are validated on every edit.</p>
      </section>
      <section aria-labelledby="preview-heading" className={styles.previewPanel}>
        <div className={styles.previewHeading}>
          <h2 id="preview-heading">Live preview</h2>
          <div className={styles.previewControls}>
            <div role="group" aria-label="Preview theme">{(["light", "dark"] as const).map((theme) => <button key={theme} type="button" aria-pressed={previewTheme === theme} onClick={() => setPreviewTheme(theme)}>{theme === "light" ? "Light" : "Dark"}</button>)}</div>
            <div role="group" aria-label="Preview container width">{(["narrow", "wide"] as const).map((width) => <button key={width} type="button" aria-pressed={previewWidth === width} onClick={() => setPreviewWidth(width)}>{width === "narrow" ? "Narrow" : "Wide"}</button>)}</div>
            <div role="group" aria-label="Preview interaction mode">
              <button type="button" aria-pressed={!selectionMode} onClick={() => setSelectionMode(false)}>Interact</button>
              <button type="button" aria-pressed={selectionMode} onClick={() => setSelectionMode(true)}>Select layers</button>
            </div>
          </div>
          <p className={styles.muted}>{previewTheme === "light" ? "Light" : "Dark"} snapshot · {previewWidth === "narrow" ? "Narrow: 360" : "Wide: 960"}px container maximum, capped to available space. Not a browser breakpoint or zoom. Preview preferences are not saved or exported.</p>
          <p id="preview-behavior" className={styles.muted}>{selectionMode ? "Select layers: click a preview node to select it; controls, typing, navigation and submission are blocked. Use the Layers buttons with Tab and Enter or Space for keyboard selection." : "Interact: inputs, switches and buttons work normally; preview clicks do not select layers. Form submissions are prevented; no data is saved or sent. Use the Layers list to select with the keyboard."}</p>
        </div>
        <div className={styles.previewStage}>
          <div ref={previewRef} className={styles.previewFrame} data-preview-width={previewWidth} data-selection-mode={selectionMode ? "select" : "interact"} aria-describedby="preview-behavior"
            onPointerDownCapture={(event) => { if (selectionMode) { event.preventDefault(); event.stopPropagation(); } }}
            onClickCapture={(event) => {
              if (!selectionMode) return;
              event.preventDefault();
              event.stopPropagation();
              const target = event.target instanceof Element ? event.target.closest("[data-page-node]") : null;
              const id = target?.getAttribute("data-page-node");
              if (id && event.currentTarget.contains(target) && locateNode(page.root, id)) selectLayer(id);
            }}
            onKeyDownCapture={(event) => { if (selectionMode && event.key !== "Tab") { event.preventDefault(); event.stopPropagation(); } }}
            onSubmitCapture={(event) => { event.preventDefault(); event.stopPropagation(); setNotice("Demo submission prevented. No data was saved or sent."); }}>
            <RenderPageBundle bundle={currentBundle} mode={previewTheme} className={styles.preview} />
          </div>
        </div>
      </section>
    </fieldset>
  </div>;
}
