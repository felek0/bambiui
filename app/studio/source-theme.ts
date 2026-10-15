import { exportCSS, parseDesignSystem } from "./tokens.ts";
import { canonicalJSON, sha256, utf8 } from "./source-files.ts";
import { distributionLicense, distributionNotice } from "./distribution-license.ts";

/** Shared by browser ZIP and the compiled CLI; never reimplement schema migrations in the CLI. */
export async function createThemeSourceFiles(input: unknown): Promise<{ files: Map<string, string>; systemSha256: string; scopeId: string }> {
  const system = parseDesignSystem(JSON.stringify(input));
  const snapshot = canonicalJSON(system), systemSha256 = await sha256(utf8(snapshot)), scopeId = `bambiui-${systemSha256}`;
  const files = new Map<string, string>([
    ["LICENSE", distributionLicense.text],
    ["NOTICE.md", distributionNotice],
    ["snapshots/system.json", snapshot],
    ["theme.css", exportCSS(system, scopeId)],
    ["styles.css", '@import "./theme.css";\n'],
    ["scope.module.css", `.scope { background: var(--ds-background); color: var(--ds-foreground); font-family: var(--ds-font-family); }
.scope, .scope *, .scope *::before, .scope *::after { box-sizing: border-box; }
:where(.scope) :where(button, input) { font: inherit; letter-spacing: inherit; }
.scope :global(.sr-only) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
`],
    ["ThemeScope.tsx", `import type { ReactNode } from "react";
import styles from "./scope.module.css";

export function ThemeScope({ mode = "light", children }: { mode?: "light" | "dark"; children: ReactNode }) {
  return <div className={styles.scope} data-bambiui-system="${scopeId}" data-ds-theme={mode}>{children}</div>;
}
`],
  ]);
  return { files, systemSha256, scopeId };
}
