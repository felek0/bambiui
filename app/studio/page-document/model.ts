export type PageKind = "container" | "stack" | "grid" | "gridItem" | "form" | "card" | "cardHeader" | "cardTitle" | "cardDescription" | "cardContent" | "text" | "input" | "switch" | "button";
export type PageProp = string | boolean | number;
export type PageNode = {
  id: string;
  kind: PageKind;
  props?: Record<string, PageProp>;
  text?: string;
  children?: PageNode[];
};
export type PageDocument = { version: 1; id: string; name: string; root: PageNode };

type Rule = readonly string[];
const children: Record<PageKind, Rule> = {
  container: ["stack", "grid", "form", "card", "text"],
  stack: ["stack", "grid", "form", "card", "text", "input", "switch", "button"],
  grid: ["gridItem"],
  gridItem: ["stack", "card", "text", "input", "switch", "button"],
  form: ["stack", "grid", "card", "text", "input", "switch", "button"],
  card: ["cardHeader", "cardContent"],
  cardHeader: ["cardTitle", "cardDescription"],
  cardTitle: [], cardDescription: [],
  cardContent: ["stack", "grid", "text", "input", "switch", "button"],
  text: [], input: [], switch: [], button: [],
};
const choices: Record<string, readonly PageProp[]> = {
  maxWidth: ["narrow", "wide"], direction: ["row", "column"],
  gap: ["sm", "md", "lg"], align: ["start", "center", "end", "stretch"],
  justify: ["start", "center", "end", "between"], wrap: [true, false],
  columns: [1, 2, 3], span: [1, 2, 3],
  variant: ["h1", "h2", "h3", "paragraph", "caption"],
  type: ["text", "email"], required: [true, false],
  buttonType: ["submit", "button"],
};
const props: Record<PageKind, Rule> = {
  container: ["maxWidth"], stack: ["direction", "gap", "align", "justify", "wrap"],
  grid: ["columns", "gap"], gridItem: ["span"], form: ["action"],
  card: [], cardHeader: [], cardTitle: [], cardDescription: [], cardContent: [],
  text: ["variant"], input: ["label", "name", "type", "required"],
  switch: ["label", "name"], button: ["buttonType"],
};
const textKinds: readonly PageKind[] = ["cardTitle", "cardDescription", "text", "button"];
const requiredProps: Partial<Record<PageKind, Rule>> = { input: ["label", "name"], switch: ["label", "name"], form: ["action"] };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, allowed: readonly string[], path: string) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}: unknown key ${key}`);
};
const identifier = (value: unknown, path: string) => {
  if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)) throw new Error(`${path}: invalid id`);
};

export function parsePageDocument(value: unknown): PageDocument {
  if (!record(value)) throw new Error("page: expected object");
  exact(value, ["version", "id", "name", "root"], "page");
  if (value.version !== 1) throw new Error("page: unsupported version");
  identifier(value.id, "page.id");
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 120) throw new Error("page: invalid name");
  const ids = new Set<string>();
  function visit(raw: unknown, path: string, depth: number, parent?: PageKind): PageNode {
    if (depth > 12 || ids.size >= 100) throw new Error(`${path}: page limit exceeded`);
    if (!record(raw)) throw new Error(`${path}: expected node`);
    exact(raw, ["id", "kind", "props", "text", "children"], path);
    identifier(raw.id, `${path}.id`);
    if (ids.has(raw.id as string)) throw new Error(`${path}: duplicate id`);
    ids.add(raw.id as string);
    if (typeof raw.kind !== "string" || !Object.hasOwn(children, raw.kind)) throw new Error(`${path}: unknown kind`);
    const kind = raw.kind as PageKind;
    if (parent ? !children[parent].includes(kind) : kind !== "container") throw new Error(`${path}: invalid parent/slot for ${kind}`);
    if (raw.props !== undefined) {
      if (!record(raw.props)) throw new Error(`${path}: invalid props`);
      exact(raw.props, props[kind], `${path}.props`);
      for (const [key, prop] of Object.entries(raw.props)) {
        if (key in choices) {
          if (!choices[key].includes(prop as PageProp)) throw new Error(`${path}: invalid ${key}`);
        } else if (typeof prop !== "string" || !prop.trim() || prop.length > 200) throw new Error(`${path}: invalid ${key}`);
        if (key === "name" && !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(prop as string)) throw new Error(`${path}: invalid name`);
        if (key === "action" && !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(prop as string)) throw new Error(`${path}: invalid action`);
      }
    }
    for (const key of requiredProps[kind] ?? []) if (!record(raw.props) || !Object.hasOwn(raw.props, key)) throw new Error(`${path}: missing ${key}`);
    if (textKinds.includes(kind)) {
      if (typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > 2000) throw new Error(`${path}: invalid text`);
    } else if (raw.text !== undefined) throw new Error(`${path}: unexpected text`);
    if (children[kind].length) {
      if (!Array.isArray(raw.children) || !raw.children.length) throw new Error(`${path}: missing children`);
      if (kind === "card" && (raw.children.length > 2 || new Set(raw.children.map((child: unknown) => record(child) ? child.kind : null)).size !== raw.children.length)) throw new Error(`${path}: duplicate card slot`);
      if (kind === "cardHeader" && (raw.children.length > 2 || new Set(raw.children.map((child: unknown) => record(child) ? child.kind : null)).size !== raw.children.length)) throw new Error(`${path}: duplicate header slot`);
    } else if (raw.children !== undefined) throw new Error(`${path}: unexpected children`);
    const node: PageNode = { id: raw.id as string, kind };
    if (raw.props !== undefined) node.props = { ...raw.props } as PageNode["props"];
    if (raw.text !== undefined) node.text = raw.text as string;
    if (Array.isArray(raw.children)) node.children = raw.children.map((child, index) => visit(child, `${path}.children[${index}]`, depth + 1, kind));
    return node;
  }
  return { version: 1, id: value.id as string, name: value.name as string, root: visit(value.root, "page.root", 0) };
}
