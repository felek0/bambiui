import example from "../../studio/page-document/account-settings.json";
import { createPageBundle } from "../../studio/page-document/bundle";
import { defaultSystem } from "../../studio/tokens";
import PageEditor from "./page-editor";

export default function PageEditorExample() {
  return <PageEditor initialBundle={createPageBundle(example, defaultSystem)} />;
}
