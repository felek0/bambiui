"use client";

import { useState } from "react";
import Link from "next/link";
import { captureLocalRecovery, LocalRecoveryError } from "./legacy-project-recovery";
import styles from "./project-suspended.module.css";

export function ProjectSuspended() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  function downloadRecovery() {
    let url: string | undefined;
    try {
      const raw = captureLocalRecovery(window.localStorage);
      url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "bambiui-local-recovery.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setError(false);
      setMessage("Local recovery download requested. Only stored records are included; this is not an atomic or complete backup of open tabs.");
    } catch (error) {
      setError(true);
      setMessage(error instanceof LocalRecoveryError
        ? `${error.message} No stored records were changed. Retry without clearing your data.`
        : "Local recovery could not be downloaded because storage or the download is unavailable. No partial backup was created and no stored records were changed. Retry without clearing your data.");
    } finally {
      if (url) { const captured = url; setTimeout(() => URL.revokeObjectURL(captured), 1000); }
    }
  }
  return <main className={styles.screen}>
    <section className={styles.panel} aria-labelledby="project-paused-title">
      <p className={styles.brand}>bambiui</p>
      <h1 id="project-paused-title">Project editing is paused</h1>
      <p>Work on your design system in System and Develop. Existing local Project records have not been removed or migrated.</p>
      <Link className={styles.link} href="/">Open design system</Link>
      <h2>Local data recovery</h2>
      <p>Download raw stored Project, legacy page-editor and System records from this browser only. Nothing is uploaded or written to storage. This recovery file is not a supported import or portable Project bundle.</p>
      <p>Unsaved work and history in other tabs cannot be read here. Export unsaved work in old authoring tabs before reloading them. Stored-record checks are best effort, not an atomic multi-tab backup.</p>
      <button className={styles.download} type="button" onClick={downloadRecovery}>Download local recovery data</button>
      <p role={error ? "alert" : "status"} className={styles.status}>{message}</p>
    </section>
  </main>;
}
