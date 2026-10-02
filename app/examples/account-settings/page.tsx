import type { CSSProperties } from "react";
import example from "../../studio/page-document/account-settings.json";
import { parsePageDocument } from "../../studio/page-document/model";
import { RenderPage } from "../../studio/page-document/render";
import { defaultSystem, toCSSVariables } from "../../studio/tokens";
import styles from "./page.module.css";

export default function AccountSettingsExample() {
  const variables = toCSSVariables(defaultSystem.themes.light, "light");

  return (
    <main className={styles.page} data-ds-theme="light" style={{ ...variables, colorScheme: "light" } as CSSProperties}>
      <RenderPage page={parsePageDocument(example)} />
    </main>
  );
}
