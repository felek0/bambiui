"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Button } from "./controls";
import { componentIds, type ComponentId, type DesignSystem } from "./tokens";
import styles from "./developer.module.css";
import { isFoundation, type FoundationId } from "./foundations";

const subscribeOrigin = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";

export function SourceDownloadPanel({ selected, system, ready }: { selected: FoundationId | ComponentId; system: DesignSystem; ready: boolean }) {
  const [status, setStatus] = useState<{ busy: boolean; text: string; error: boolean }>({ busy: false, text: "", error: false });
  const pending = useRef(false);
  const origin = useSyncExternalStore(subscribeOrigin, browserOrigin, serverOrigin);
  const [copyStatus, setCopyStatus] = useState("");
  const component = isFoundation(selected) ? null : selected;
  async function download(ids: readonly ComponentId[]) {
    if (pending.current || !ready) return;
    pending.current = true;
    // Detach before the lazy module or catalog loads; later edits cannot change this package.
    const snapshot = JSON.stringify(system);
    const name = system.name;
    setStatus({ busy: true, text: `Preparing ${ids.length === 1 ? ids[0] : "all 7 components"} from ${name}…`, error: false });
    try {
      const { downloadSystemSource } = await import("./source-download");
      await downloadSystemSource(JSON.parse(snapshot), ids);
      setStatus({ busy: false, text: `Source ZIP download started for ${name}. Both themes are included.`, error: false });
    } catch (error) {
      setStatus({ busy: false, text: error instanceof Error ? error.message : "Could not create source ZIP. Retry when connected.", error: true });
    } finally { pending.current = false; }
  }
  const commands = origin ? `npx bambiui@0.2.1 init --registry "${origin}/registry/index.json" --system ./bambiui-tokens.json\nnpx bambiui@0.2.1 add ${component ?? "--all"}` : "";
  function downloadSystemJSON() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(system, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bambiui-tokens.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyCommands() {
    try { await navigator.clipboard.writeText(commands); setCopyStatus("CLI commands copied."); }
    catch { setCopyStatus("Could not copy commands. Select the code and copy it manually."); }
  }
  return <section className={`${styles.section} ${styles.sourceDownload}`} aria-labelledby="system-source-title" data-cli-install>
    <div className={styles.codeHeading}>
      <h3 id="system-source-title">Use this system in your project</h3>
      <Button disabled={!ready || !commands} onClick={copyCommands}>Copy CLI commands</Button>
    </div>
    <p>Download your tokens, then run these commands in an existing React 19 project. The CLI installs editable React and CSS Modules sources.</p>
    <div className={styles.sourceActions}><Button data-system-json-download disabled={!ready} onClick={downloadSystemJSON}>Download System JSON</Button></div>
    <p><strong>1.</strong> Save <code>bambiui-tokens.json</code> in your project. <strong>2.</strong> Run the CLI commands below. <strong>3.</strong> Follow the generated stylesheet and ThemeScope setup.</p>
    <pre className={styles.cliCommands}><code>{commands}</code></pre>
    <p>The JSON download includes both themes and saved tokens, never Playground props. The CLI reads it locally and never uploads your system. Without <code>--system</code>, init uses the default system.</p>
    <p className={styles.systemName}>Registry: <code>{origin ? `${origin}/registry/index.json` : ""}</code>. Imports and package-manager installation remain explicit. Distributed software is MIT licensed; Studio remains private.</p>
    <p className={styles.copyStatus} role="status" aria-atomic="true" data-cli-copy-status>{copyStatus}</p>
    <details className={styles.manualSource}>
      <summary>Manual source ZIP (fallback)</summary>
      <div className={styles.section} data-source-download>
      <p>Components, CSS Modules, both themes and a populated example from saved System sample defaults. Temporary Preview options are excluded. A detached system snapshot—not a Project backup. CLI sources retain their React API defaults.</p>
      <div className={styles.sourceActions}>
      {component && <Button disabled={!ready || status.busy} onClick={() => download([component])}>Download {component[0].toUpperCase() + component.slice(1)} source</Button>}
      <Button disabled={!ready || status.busy} onClick={() => download(componentIds)}>Download all 7 components</Button>
    </div>
    <p className={styles.systemName}>Bind application behavior in your host. Optional Google Fonts remain remote. MIT license and scope notice are included; user-authored designs are not relicensed.</p>
    <p role={status.error ? "alert" : "status"} aria-live={status.error ? "assertive" : "polite"} aria-atomic="true" data-source-status>{status.text}</p>
      </div>
    </details>
  </section>;
}
