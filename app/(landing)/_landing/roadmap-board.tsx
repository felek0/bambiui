"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { SectionHead } from "./demos";
import { curatedRoadmap, parseSubmissions, roadmapColumns, SUBMISSIONS_KEY, validateSubmission, type RoadmapItem } from "./roadmap-data";
import styles from "./landing.module.css";

// Called only by the validated submit event, never while rendering the board.
function createLocalSubmission(kind: RoadmapItem["kind"], title: string, detail: string): RoadmapItem {
  const now = Date.now();
  return { id: `local-${now.toString(36)}`, column: "new", kind, title: title.trim(), detail: detail.trim(), local: true, created: new Date(now).toISOString() };
}

/** Preview board: curated roadmap plus submissions kept only in this browser. */
export function RoadmapBoard({ fontClassName = "" }: { fontClassName?: string }) {
  const id = useId();
  const [submissions, setSubmissions] = useState<RoadmapItem[]>([]);
  const [kind, setKind] = useState<"feature" | "bug">("feature");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const storedRaw = useRef<string | null | undefined>(undefined);
  // The board opens the dialog itself, so focus returns to whichever button opened it.
  const opener = useRef<HTMLButtonElement | null>(null);
  const openForm = (next: "feature" | "bug", button: HTMLButtonElement) => { opener.current = button; setKind(next); setError(""); setOpen(true); };

  // Read after hydration; static HTML always shows the curated board.
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(SUBMISSIONS_KEY);
        const next = parseSubmissions(raw);
        if (raw !== null) {
          const value: unknown = JSON.parse(raw);
          // The display parser filters invalid records; never silently save over those bytes.
          if (!Array.isArray(value) || value.length !== next.length) throw new Error("Unreadable saved suggestions");
        }
        storedRaw.current = raw;
        setSubmissions(next);
        setStorageError("");
      } catch {
        storedRaw.current = undefined;
        setStatus("");
        setStorageError("Saved suggestions could not be read. Existing browser data was left unchanged. Reload to try again.");
      }
    };
    read();
    const sync = (event: StorageEvent) => { if (event.key === SUBMISSIONS_KEY || event.key === null) read(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function save(next: RoadmapItem[]) {
    setStatus("");
    if (storedRaw.current === undefined) {
      setStorageError("Saved suggestions are unavailable. Reload before making changes; existing browser data was left unchanged.");
      return false;
    }
    try {
      const storage = window.localStorage;
      if (storage.getItem(SUBMISSIONS_KEY) !== storedRaw.current) {
        setStorageError("Saved suggestions changed in another tab. Reload before making changes; nothing was added or removed.");
        return false;
      }
      const raw = JSON.stringify(next);
      storage.setItem(SUBMISSIONS_KEY, raw);
      storedRaw.current = raw;
      setSubmissions(next);
      setStorageError("");
      return true;
    } catch {
      setStorageError("This browser could not save the change. Nothing was added or removed. Check browser storage settings and try again.");
      return false;
    }
  }

  function remove(item: RoadmapItem) {
    if (save(submissions.filter(entry => entry.id !== item.id))) setStatus(`Removed “${item.title}” from this browser.`);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validateSubmission(title, detail);
    if (problem) { setError(problem); return; }
    const item = createLocalSubmission(kind, title, detail);
    if (save([item, ...submissions].slice(0, 50))) {
      setTitle(""); setDetail(""); setError(""); setOpen(false);
      setStatus(`Added “${item.title}” to New in this browser only.`);
    }
  }

  const items = [...submissions, ...curatedRoadmap];
  return <section id="roadmap" className={styles.section} aria-labelledby="roadmap-title">
    <div className={styles.wrap}>
      <SectionHead index="05" name="Roadmap" title="What is shipped, what is next." id="roadmap-title">
        Explore the curated roadmap. Suggestions stay in New in this browser only and are not sent to the team.
      </SectionHead>
      <div className={`${styles.grid} ${styles.body}`}>
        <div className={`${styles.metaCol} ${styles.actionList}`}>
          <button type="button" className={styles.button} data-roadmap-suggest onClick={event => openForm("feature", event.currentTarget)}>Suggest a feature</button>
          <button type="button" className={styles.textButton} onClick={event => openForm("bug", event.currentTarget)}>Report a gap</button>
          <p className={styles.status} role="status">{status}</p>
          <p className={styles.error} role="alert">{open ? "" : storageError}</p>
        </div>
        <div className={`${styles.span4End} ${styles.board}`}>
          {roadmapColumns.map(column => {
            const cards = items.filter(item => item.column === column.key);
            return <section key={column.key} className={styles.column} aria-labelledby={`${id}-${column.key}`} data-roadmap-column={column.key}>
              <header className={styles.columnHead}>
                <h3 id={`${id}-${column.key}`}>{column.label}</h3>
                <span className={styles.count} aria-label={`${cards.length} items`}>{String(cards.length).padStart(2, "0")}</span>
              </header>
              <p className={styles.columnHint}>{column.key === "new" ? "Browser-only suggestions, not sent to the team" : column.hint}</p>
              <ul className={styles.items}>
                {cards.map(item => <li key={item.id} className={styles.item} data-roadmap-item={item.id} data-local={item.local || undefined}>
                  <strong>{item.title}</strong>
                  {item.detail && <p>{item.detail}</p>}
                  <span className={styles.itemMeta}>
                    <span>{item.kind === "bug" ? "gap" : "feature"}</span>
                    {item.local && <>
                      <span>this browser only</span>
                      <button type="button" className={styles.textButton} aria-label={`Remove “${item.title}”`}
                        onClick={() => remove(item)}>Remove</button>
                    </>}
                  </span>
                </li>)}
                {!cards.length && <li className={styles.emptyItem}>Nothing here yet.</li>}
              </ul>
            </section>;
          })}
        </div>
      </div>
    </div>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={`${styles.dialog} ${fontClassName}`} initialFocus={titleInput} finalFocus={opener} data-roadmap-dialog>
          <form className={styles.form} onSubmit={submit} noValidate>
            <div className={styles.dialogHead}>
              <Dialog.Title>{kind === "feature" ? "Suggest a feature" : "Report a gap"}</Dialog.Title>
              <Dialog.Close className={styles.close} aria-label="Close">×</Dialog.Close>
            </div>
            <div className={styles.toggle} role="group" aria-label="Type">
              {(["feature", "bug"] as const).map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "feature" ? "Feature" : "Gap or bug"}</button>)}
            </div>
            <label className={styles.field}><span>Title</span>
              <input ref={titleInput} value={title} maxLength={120} aria-invalid={!!error && !title.trim()} aria-describedby={`${id}-error`} onChange={event => { setTitle(event.target.value); setError(""); }}
                placeholder={kind === "feature" ? "Select component with search" : "Focus ring is hard to see in Dark"} />
            </label>
            <label className={styles.field}><span>Details <small>optional</small></span>
              <textarea value={detail} maxLength={1000} rows={4} onChange={event => { setDetail(event.target.value); setError(""); }}
                placeholder="What were you trying to do, and what would help?" />
            </label>
            <span id={`${id}-error`} className={styles.error} role="alert">{error || storageError}</span>
            <div className={styles.dialogFoot}>
              <Dialog.Description className={styles.dialogNote}>Preview: saved in this browser only. Nothing is sent to the team.</Dialog.Description>
              <div className={styles.dialogActions}>
                <Dialog.Close className={styles.textButton}>Cancel</Dialog.Close>
                <button type="submit" className={styles.button}>Save in this browser</button>
              </div>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  </section>;
}
