import type { PageNode } from "./model.ts";

export type PageProp = string | boolean | number;
export type PageElement = "Container" | "Stack" | "Grid" | "Grid.Item" | "form" | "Card" | "Card.Header" | "Card.Title" | "Card.Description" | "Card.Content" | "Text" | "Input" | "Switch" | "Button";
type PropRule = readonly PageProp[] | "text" | "name" | "action";
type NodeDefinition = {
  element: PageElement;
  source: "components" | "layout" | null;
  props: Record<string, PropRule>;
  children: readonly string[];
  text?: boolean;
  requiredProps?: readonly string[];
  legacyAliases?: Record<string, string>;
  uniqueSlots?: boolean;
  allowEmpty?: boolean;
  fixedProps?: Record<string, PageProp>;
};

const definitions = {
  container: { allowEmpty: true, element: "Container", source: "layout", props: { maxWidth: ["narrow", "wide"] }, children: ["stack", "grid", "form", "card", "text"] },
  stack: { allowEmpty: true, element: "Stack", source: "layout", props: { direction: ["row", "column"], gap: ["sm", "md", "lg"], align: ["start", "center", "end", "stretch"], justify: ["start", "center", "end", "between"], wrap: [true, false] }, children: ["stack", "grid", "form", "card", "text", "input", "switch", "button"] },
  grid: { allowEmpty: true, element: "Grid", source: "layout", props: { columns: [1, 2, 3], gap: ["sm", "md", "lg"] }, children: ["gridItem"] },
  gridItem: { allowEmpty: true, element: "Grid.Item", source: "layout", props: { span: [1, 2, 3] }, children: ["stack", "card", "text", "input", "switch", "button"] },
  form: { allowEmpty: true, element: "form", source: null, props: { action: "action" }, requiredProps: ["action"], fixedProps: { method: "get" }, children: ["stack", "grid", "card", "text", "input", "switch", "button"] },
  card: { element: "Card", source: "components", props: {}, children: ["cardHeader", "cardContent"], uniqueSlots: true },
  cardHeader: { element: "Card.Header", source: "components", props: {}, children: ["cardTitle", "cardDescription"], uniqueSlots: true },
  cardTitle: { element: "Card.Title", source: "components", props: {}, children: [], text: true },
  cardDescription: { element: "Card.Description", source: "components", props: {}, children: [], text: true },
  cardContent: { allowEmpty: true, element: "Card.Content", source: "components", props: {}, children: ["stack", "grid", "text", "input", "switch", "button"] },
  text: { element: "Text", source: "components", props: { variant: ["h1", "h2", "h3", "paragraph", "caption"] }, children: [], text: true },
  input: { element: "Input", source: "components", props: { label: "text", name: "name", type: ["text", "email"], required: [true, false] }, requiredProps: ["label", "name"], children: [] },
  switch: { element: "Switch", source: "components", props: { label: "text", name: "name" }, requiredProps: ["label", "name"], children: [] },
  button: { element: "Button", source: "components", props: { type: ["submit", "button"] }, legacyAliases: { buttonType: "type" }, children: [], text: true },
} satisfies Record<string, NodeDefinition>;

export type PageKind = keyof typeof definitions;
export const nodeRegistry: Record<PageKind, NodeDefinition> = definitions;

/** Shared by renderer and export; omitted props stay omitted so component defaults agree. */
export function nodeAttributes(node: PageNode): Record<string, PageProp> {
  return { ...node.props, ...nodeRegistry[node.kind].fixedProps, "data-page-node": node.id };
}
