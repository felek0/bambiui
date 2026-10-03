"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Icon, type IconName } from "../icons";
import { nodeRegistry } from "../page-document/registry";
import type { PageNode } from "../page-document/model";
import { nodePath } from "./selection";
import type { Composer } from "./use-composer";
import { PagesPanel } from "./project-ui";
import { InsertPanel } from "./insert-panel";
import { SavedAssetsPanel } from "./assets-panel";
import styles from "./composer.module.css";

type Layer = { id: string; frameId: string; nodeId?: string; label: string; detail?: string; icon: IconName; children: Layer[] };
const nodeKey = (frameId: string, nodeId: string) => `${frameId}/${nodeId}`;

function nodeLayer(node: PageNode, frameId: string): Layer {
  const icon: IconName = node.kind.startsWith("card") ? "card"
    : ["button", "input", "switch", "checkbox", "badge", "text"].includes(node.kind) ? node.kind as IconName
      : node.kind === "grid" || node.kind === "gridItem" ? "grid" : "box";
  return {
    id: nodeKey(frameId, node.id), frameId, nodeId: node.id,
    label: nodeRegistry[node.kind].element,
    detail: node.text || String(node.props?.label ?? "") || undefined,
    icon, children: (node.children ?? []).map(child => nodeLayer(child, frameId)),
  };
}

function LayerTree({ composer }: { composer: Composer }) {
  const { page, document, project, controller, state } = composer;
  const tree = useRef<HTMLUListElement>(null);
  const selection = project?.selection;
  const selectedKey = selection ? nodeKey(selection.frameId, selection.nodeId) : project?.frameId ?? "";
  const [expansion, setExpansion] = useState({ selection: selectedKey, collapsed: new Set<string>() });
  const [focus, setFocus] = useState({ selection: selectedKey, id: selectedKey });
  const layers: Layer[] = (page?.frames ?? []).map(frame => ({
    id: frame.id, frameId: frame.id, label: frame.name, icon: "desktop",
    detail: `${frame.width} × ${frame.height}`, children: [nodeLayer(frame.root, frame.id)],
  }));

  // Reveal a canvas selection without stealing focus or undoing a user's later collapse.
  if (expansion.selection !== selectedKey) {
    const collapsed = new Set(expansion.collapsed);
    if (selection) {
      collapsed.delete(selection.frameId);
      const frame = page?.frames.find(entry => entry.id === selection.frameId);
      if (frame) for (const node of nodePath(frame.root, selection.nodeId).slice(0, -1)) collapsed.delete(nodeKey(frame.id, node.id));
    }
    setExpansion({ selection: selectedKey, collapsed });
  }

  useEffect(() => {
    tree.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedKey]);

  const visible: { layer: Layer; parent?: string }[] = [];
  const visit = (entries: Layer[], parent?: string) => {
    for (const layer of entries) {
      visible.push({ layer, parent });
      if (!expansion.collapsed.has(layer.id)) visit(layer.children, layer.id);
    }
  };
  visit(layers);
  const requestedFocus = focus.selection === selectedKey ? focus.id : selectedKey;
  const tabStop = visible.find(entry => entry.layer.id === requestedFocus)?.layer.id ?? visible[0]?.layer.id;
  const toggle = (id: string) => setExpansion(current => {
    const collapsed = new Set(current.collapsed);
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    return { selection: selectedKey, collapsed };
  });
  const choose = (layer: Layer) => {
    if (!document || !page || state.mode === "preview") return;
    if (layer.nodeId) controller.selectNode({ projectId: document.id, pageId: page.id, frameId: layer.frameId, nodeId: layer.nodeId });
    else controller.selectFrame(page.id, layer.frameId);
  };
  const focusLayer = (id?: string) => {
    if (!id) return;
    setFocus({ selection: selectedKey, id });
    const element = Array.from(tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []).find(item => item.dataset.layerId === id);
    element?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, layer: Layer) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = visible.findIndex(entry => entry.layer.id === layer.id);
    const expanded = !expansion.collapsed.has(layer.id);
    switch (event.key) {
      case "ArrowDown": focusLayer(visible[Math.min(index + 1, visible.length - 1)]?.layer.id); break;
      case "ArrowUp": focusLayer(visible[Math.max(0, index - 1)]?.layer.id); break;
      case "Home": focusLayer(visible[0]?.layer.id); break;
      case "End": focusLayer(visible.at(-1)?.layer.id); break;
      case "ArrowRight": if (layer.children.length) { if (!expanded) toggle(layer.id); else focusLayer(layer.children[0].id); } break;
      case "ArrowLeft": if (layer.children.length && expanded) toggle(layer.id); else focusLayer(visible[index]?.parent); break;
      case "Enter": case " ": choose(layer); break;
      default: return;
    }
    event.preventDefault(); event.stopPropagation();
  };
  const render = (entries: Layer[], depth = 0) => entries.map(layer => {
    const expanded = !expansion.collapsed.has(layer.id);
    return <li key={layer.id} role="treeitem" aria-label={`${layer.label}${layer.detail ? `: ${layer.detail}` : ""}`} aria-selected={selectedKey === layer.id}
      aria-expanded={layer.children.length ? expanded : undefined} aria-disabled={state.mode === "preview" || undefined}
      tabIndex={tabStop === layer.id ? 0 : -1} data-layer-id={layer.id} className={styles.treeItem}
      onFocus={event => { if (event.target === event.currentTarget) setFocus({ selection: selectedKey, id: layer.id }); }}
      onKeyDown={event => onKeyDown(event, layer)}>
      <div className={styles.treeRow} style={{ paddingInlineStart: 6 + depth * 12 }} onClick={event => { event.stopPropagation(); focusLayer(layer.id); choose(layer); }}>
        {layer.children.length ? <button type="button" className={styles.treeDisclosure} tabIndex={-1} aria-label={`${expanded ? "Collapse" : "Expand"} ${layer.label}`} onClick={event => { event.stopPropagation(); focusLayer(layer.id); toggle(layer.id); }} data-expanded={expanded || undefined}><Icon name="chevron" size={11} /></button> : <span className={styles.treeDisclosure} />}
        <Icon name={layer.icon} size={13} />
        <span className={styles.treeLabel}>{layer.label}{layer.detail && <span>{layer.detail}</span>}</span>
      </div>
      {expanded && layer.children.length > 0 && <ul role="group">{render(layer.children, depth + 1)}</ul>}
    </li>;
  });
  return <section className={styles.layerSection} aria-label="Page layers">
    <div className={styles.panelHeading}><h2>Layers</h2><span>{page?.frames.length ?? 0} frames</span></div>
    {layers.length ? <ul ref={tree} role="tree" aria-label="Frame layers" className={styles.layerTree}>{render(layers)}</ul>
      : <p className={styles.panelEmpty}>{page ? "Add a frame to start building this page." : "Your frames and components will appear here."}</p>}
    {state.mode === "preview" && <p className={styles.panelEmpty}>Switch to Design to select and edit layers.</p>}
  </section>;
}

export function LayersPanel({ composer, onPages }: { composer: Composer; onPages: () => void }) {
  return <Tabs.Root defaultValue="layers" className={styles.sidebarTabs}>
    <Tabs.List className={styles.panelTabs} aria-label="Project sidebar">
      <Tabs.Tab value="layers" className={styles.panelTab}>Layers</Tabs.Tab>
      <Tabs.Tab value="assets" className={styles.panelTab}>Assets</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panel value="layers" keepMounted className={styles.sidebarPanel}>
      <PagesPanel composer={composer} active onPages={onPages} />
      <LayerTree key={`${composer.document?.id}-${composer.page?.id}`} composer={composer} />
    </Tabs.Panel>
    <Tabs.Panel value="assets" keepMounted className={`${styles.sidebarPanel} ${styles.assetsPanel}`}>
      <InsertPanel composer={composer} />
      <SavedAssetsPanel composer={composer} />
    </Tabs.Panel>
  </Tabs.Root>;
}
