import { useEffect, useMemo, useRef } from "react";
import { createComponentNode, resolveComponentDefaults, type ComponentDefaults } from "./component-defaults";
import type { ComponentStylePart } from "./component-styles";
import type { ComponentId } from "./tokens";
import { parsePageDocument, type PageNode } from "./page-document/model";
import { RenderPage } from "./page-document/render";
import { Card } from "./components/card";
import { Icon } from "./icons";
import styles from "./system-component-editor.module.css";

const cardParts: Record<string, ComponentStylePart> = { card: "root", cardHeader: "header", cardTitle: "title", cardDescription: "description", cardContent: "content", cardFooter: "footer" };
function flatten(node: PageNode): PageNode[] { return [node, ...(node.children ?? []).flatMap(flatten)]; }

/** The same typed factory powers this editable specimen and new Project insertions. */
export function ComponentStarterPreview({ component, defaults, part, onSelectPart, onEditParameters }: {
  component: ComponentId; defaults?: ComponentDefaults; part?: ComponentStylePart;
  onSelectPart: (component: ComponentId, part: ComponentStylePart) => void; onEditParameters: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const page = useMemo(() => {
    let index = 0;
    const nextId = () => `starter_${component}_${++index}`;
    const node = createComponentNode(component, nextId, defaults);
    if (part === "error" && ["input", "switch", "checkbox"].includes(component) && !node.props?.error) node.props = { ...node.props, error: "Please check this field." };
    if (part === "label" && node.props?.hideLabel) node.props = { ...node.props, hideLabel: false };
    if (part === "description" && component !== "card" && !node.props?.description) node.props = { ...node.props, description: "Helpful context for this field." };
    return parsePageDocument({ version: 1, id: `starter_${component}`, name: "Component starter", root: { id: nextId(), kind: "container", props: { maxWidth: "full" }, children: [{ id: nextId(), kind: "stack", children: [node] }] } });
  }, [component, defaults, part]);
  const all = useMemo(() => flatten(page.root), [page]), root = page.root.children![0].children![0];
  useEffect(() => {
    const region = body.current;
    if (!region || !part) return;
    const node = all.find(node => cardParts[node.kind] === part);
    const element = component === "card" ? part === "icon" ? region.querySelector('[data-starter-icon]') : region.querySelector(`[data-page-node="${node?.id}"]`)
      : ["input", "switch", "checkbox"].includes(component) ? region.querySelector(`[data-appearance-part="${part}"]`)
        : region.querySelector(`[data-page-node="${root.id}"]`);
    element?.setAttribute("data-system-selected-part", "");
    return () => element?.removeAttribute("data-system-selected-part");
  }, [component, part, page, all, root.id]);
  const parameters = resolveComponentDefaults(component, defaults).props;
  const sample = part === "error" && !parameters.error || part === "label" && parameters.hideLabel || part === "description" && component !== "card" && !parameters.description || part === "icon";
  return <section className={styles.starter} data-system-starter={component} aria-label={`${component} starting component`}>
    <header className={styles.starterHeader}><span>{sample ? `${part} layer sample · not saved as content` : "Starting component · click a layer to style"}</span><button type="button" onClick={onEditParameters}>Edit parameters</button></header>
    <div ref={body} className={styles.starterBody} onClickCapture={event => {
      if (!(event.target instanceof Element)) return;
      const fieldPart = event.target.closest<HTMLElement>("[data-appearance-part]");
      if (["input", "switch", "checkbox"].includes(component)) { onSelectPart(component, fieldPart?.dataset.appearancePart as ComponentStylePart ?? "root"); return; }
      const element = event.target.closest<HTMLElement>("[data-page-node]");
      const node = all.find(node => node.id === element?.dataset.pageNode);
      if (component === "card" && node) {
        if (cardParts[node.kind]) onSelectPart("card", cardParts[node.kind]);
        else if (node.kind === "text" || node.kind === "button") onSelectPart(node.kind, "root");
      } else onSelectPart(component, "root");
    }}><RenderPage key={JSON.stringify(page)} page={page} />
      {component === "card" && part === "icon" && <Card.Icon data-starter-icon title="Card icon sample"><Icon name="check" /></Card.Icon>}
    </div>
  </section>;
}
