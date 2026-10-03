import { nodeRegistry, type PageKind, type PageProp } from "./registry.ts";
export type { PageKind, PageProp } from "./registry.ts";

export type PageNode = {
  id: string;
  kind: PageKind;
  props?: Record<string, PageProp>;
  text?: string;
  children?: PageNode[];
};
export type PageDocument = { version: 1; id: string; name: string; root: PageNode };

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
  function visit(raw: unknown, path: string, depth: number, parent?: PageKind, insideForm = false): PageNode {
    if (depth > 12 || ids.size >= 100) throw new Error(`${path}: page limit exceeded`);
    if (!record(raw)) throw new Error(`${path}: expected node`);
    exact(raw, ["id", "kind", "props", "text", "children"], path);
    identifier(raw.id, `${path}.id`);
    if (ids.has(raw.id as string)) throw new Error(`${path}: duplicate id`);
    ids.add(raw.id as string);
    if (typeof raw.kind !== "string" || !Object.hasOwn(nodeRegistry, raw.kind)) throw new Error(`${path}: unknown kind`);
    const kind = raw.kind as PageKind;
    const definition = nodeRegistry[kind];
    if (parent ? !nodeRegistry[parent].children.includes(kind) : kind !== "container") throw new Error(`${path}: invalid parent/slot for ${kind}`);
    if (kind === "form" && insideForm) throw new Error(`${path}: nested form`);
    const node: PageNode = { id: raw.id as string, kind };
    if (raw.props !== undefined) {
      if (!record(raw.props)) throw new Error(`${path}: invalid props`);
      const aliases = definition.legacyAliases ?? {};
      exact(raw.props, [...Object.keys(definition.props), ...Object.keys(aliases)], `${path}.props`);
      node.props = {};
      for (const [key, prop] of Object.entries(raw.props)) {
        const canonical = Object.hasOwn(aliases, key) ? aliases[key] : key;
        if (canonical !== key && Object.hasOwn(raw.props, canonical)) throw new Error(`${path}: conflicting button type`);
        const rule = definition.props[canonical];
        if (typeof rule !== "string") {
          if (!rule.includes(prop as PageProp)) throw new Error(`${path}: invalid ${key}`);
        } else {
          if (typeof prop !== "string" || (rule !== "string" && !prop.trim()) || prop.length > 200) throw new Error(`${path}: invalid ${key}`);
          if (rule === "name" && !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(prop)) throw new Error(`${path}: invalid ${key}`);
          if (rule === "action" && !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(prop)) throw new Error(`${path}: invalid ${key}`);
        }
        node.props[canonical] = prop as PageProp;
      }
    }
    for (const [controlled, initial] of [["checked", "defaultChecked"], ["value", "defaultValue"]]) {
      if (node.props && Object.hasOwn(node.props, controlled) && Object.hasOwn(node.props, initial)) throw new Error(`${path}: conflicting ${controlled}/${initial}`);
    }
    for (const key of definition.requiredProps ?? []) if (!node.props || !Object.hasOwn(node.props, key)) throw new Error(`${path}: missing ${key}`);
    if (definition.text) {
      if (typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > 2000) throw new Error(`${path}: invalid text`);
      node.text = raw.text;
    } else if (raw.text !== undefined) throw new Error(`${path}: unexpected text`);
    if (definition.children.length) {
      if (!Array.isArray(raw.children) || (!raw.children.length && !definition.allowEmpty)) throw new Error(`${path}: missing children`);
      if (definition.uniqueSlots && new Set(raw.children.map((child: unknown) => record(child) ? child.kind : null)).size !== raw.children.length) throw new Error(`${path}: duplicate slot`);
      node.children = raw.children.map((child, index) => visit(child, `${path}.children[${index}]`, depth + 1, kind, insideForm || kind === "form"));
    } else if (raw.children !== undefined) throw new Error(`${path}: unexpected children`);
    return node;
  }
  return { version: 1, id: value.id as string, name: value.name as string, root: visit(value.root, "page.root", 0) };
}
