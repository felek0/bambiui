import type { PageNode } from "./model.ts";
import { appearanceToStyle } from "../components/appearance.ts";

export type PageProp = string | boolean | number;
export type PageElement = "Container" | "Stack" | "Grid" | "Grid.Item" | "form" | "Card" | "Card.Header" | "Card.Title" | "Card.Description" | "Card.Content" | "Card.Footer" | "Text" | "Input" | "Switch" | "Checkbox" | "Badge" | "Button";
type PropRule = readonly PageProp[] | "text" | "string" | "name" | "action";
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

const size = ["sm", "md", "lg"] as const;
const tone = ["neutral", "primary", "success", "warning", "danger", "info"] as const;
const boolean = [true, false] as const;
const autoLayout = { direction: ["row", "column"], gap: size, align: ["start", "center", "end", "stretch"], justify: ["start", "center", "end", "between"], wrap: boolean } satisfies Record<string, PropRule>;
const field = { label: "text", name: "name", size, hideLabel: boolean, description: "text", error: "text", errorPosition: ["below", "above"], errorIcon: ["none", "info", "warning"], disabled: boolean, readOnly: boolean, required: boolean } satisfies Record<string, PropRule>;
const choice = { ...field, labelPosition: ["start", "end"], value: "string", checked: boolean, defaultChecked: boolean } satisfies Record<string, PropRule>;
const content = ["stack", "grid", "text", "input", "switch", "button", "checkbox", "badge"];

const definitions = {
  container: { allowEmpty: true, element: "Container", source: "layout", props: { ...autoLayout, maxWidth: ["narrow", "wide", "full"] }, children: ["stack", "grid", "form", "card", "text", "badge"] },
  stack: { allowEmpty: true, element: "Stack", source: "layout", props: autoLayout, children: ["stack", "grid", "form", "card", "text", "input", "switch", "button", "checkbox", "badge"] },
  grid: { allowEmpty: true, element: "Grid", source: "layout", props: { columns: [1, 2, 3], gap: size }, children: ["gridItem"] },
  gridItem: { allowEmpty: true, element: "Grid.Item", source: "layout", props: { span: [1, 2, 3] }, children: ["stack", "card", "text", "input", "switch", "button", "checkbox", "badge"] },
  form: { allowEmpty: true, element: "form", source: null, props: { action: "action" }, requiredProps: ["action"], fixedProps: { method: "get" }, children: ["stack", "grid", "card", "text", "input", "switch", "button", "checkbox", "badge"] },
  card: { element: "Card", source: "components", props: { variant: ["outlined", "elevated", "filled"], size, radius: size }, children: ["cardHeader", "cardContent", "cardFooter"], uniqueSlots: true },
  cardHeader: { element: "Card.Header", source: "components", props: {}, children: ["cardTitle", "cardDescription"], uniqueSlots: true },
  cardTitle: { element: "Card.Title", source: "components", props: {}, children: [], text: true },
  cardDescription: { element: "Card.Description", source: "components", props: {}, children: [], text: true },
  cardContent: { allowEmpty: true, element: "Card.Content", source: "components", props: {}, children: content },
  cardFooter: { allowEmpty: true, element: "Card.Footer", source: "components", props: {}, children: content },
  text: { element: "Text", source: "components", props: { variant: ["heading", "h1", "h2", "h3", "h4", "h5", "h6", "paragraph", "label", "caption"], size, tone, as: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "span"] }, children: [], text: true },
  input: { element: "Input", source: "components", props: { ...field, radius: size, type: ["text", "email", "password", "number", "search", "tel", "url"], placeholder: "string", value: "string", defaultValue: "string" }, requiredProps: ["label", "name"], children: [] },
  switch: { element: "Switch", source: "components", props: choice, requiredProps: ["label", "name"], children: [] },
  checkbox: { element: "Checkbox", source: "components", props: { ...choice, radius: size, indeterminate: boolean }, requiredProps: ["label", "name"], children: [] },
  badge: { element: "Badge", source: "components", props: { variant: ["solid", "subtle", "outline"], size, tone, radius: size, dot: boolean }, children: [], text: true },
  button: { element: "Button", source: "components", props: { variant: ["primary", "secondary", "outline", "ghost", "destructive", "link"], size, radius: size, disabled: boolean, loading: boolean, fullWidth: boolean, type: ["submit", "button", "reset"] }, legacyAliases: { buttonType: "type" }, children: [], text: true },
} satisfies Record<string, NodeDefinition>;

export type PageKind = keyof typeof definitions;
export const nodeRegistry: Record<PageKind, NodeDefinition> = definitions;

/** Shared by renderer and export; omitted props stay omitted so component defaults agree. */
export function nodeAttributes(node: PageNode): Record<string, unknown> {
  return {
    ...node.props, ...nodeRegistry[node.kind].fixedProps, "data-page-node": node.id,
    ...(node.appearance === undefined ? {} : node.kind === "form" ? { style: appearanceToStyle(node.appearance) } : { appearance: node.appearance }),
    ...(node.parts === undefined ? {} : { parts: node.parts }),
  };
}
