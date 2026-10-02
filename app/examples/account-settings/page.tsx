
import example from "../../studio/page-document/account-settings.json";
import { createPageBundle } from "../../studio/page-document/bundle";
import { RenderPageBundle } from "../../studio/page-document/render";
import { defaultSystem } from "../../studio/tokens";
import styles from "./page.module.css";

export default function AccountSettingsExample() {
  const bundle = createPageBundle(example, defaultSystem);
  return <RenderPageBundle bundle={bundle} className={styles.page} />;
}
