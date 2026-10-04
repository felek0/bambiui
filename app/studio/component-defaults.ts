import { nodeRegistry, type PageProp } from "./page-document/registry.ts";
import { createPageNode } from "./page-document/defaults.ts";
import type { PageKind, PageNode } from "./page-document/model.ts";

export const componentDefaultIds = ["button", "input", "card", "badge", "switch", "checkbox", "text"] as const;
export type ComponentDefaultId = typeof componentDefaultIds[number];
export type ComponentDefaultSlot = "title" | "description" | "content" | "action";
export type ComponentDefault = {
  props?: Record<string, PageProp>;
  text?: string;
  slots?: Partial<Record<ComponentDefaultSlot, string>>;
};
/** Insertion parameters only. Styles belong to System tokens; names belong to individual fields. */
export type ComponentDefaults = Partial<Record<ComponentDefaultId, ComponentDefault>>;
export type ResolvedComponentDefaults = ComponentDefault & { props: Record<string, PageProp> };
export type ComponentDefaultField = {
  source: "props" | "text" | "slots";
  key: string;
  label: string;
  type: "select" | "text";
  options?: readonly PageProp[];
  maxLength?: number;
  required: boolean;
};

const fieldProps = { size: "md", hideLabel: false, disabled: false, readOnly: false, required: false, errorPosition: "below", errorIcon: "none" } as const;
const builtins: Record<ComponentDefaultId, ResolvedComponentDefaults> = {
  button: { text: "Continue", props: { variant: "primary", size: "md", type: "button", disabled: false, loading: false, fullWidth: false } },
  input: { props: { ...fieldProps, label: "Email address", type: "email", placeholder: "you@example.com", description: "We'll only use this to contact you.", defaultValue: "" } },
  card: { props: { variant: "outlined", size: "md" }, slots: {
    title: "Project overview", description: "Keep your ideas and next steps in one place.",
    content: "Add details, organize your work, and share progress with your team.", action: "Get started",
  } },
  badge: { text: "New", props: { variant: "outline", tone: "neutral", size: "md", dot: false } },
  switch: { props: { ...fieldProps, label: "Email notifications", description: "Receive updates about your account.", labelPosition: "end", defaultChecked: true } },
  checkbox: { props: { ...fieldProps, label: "I agree to the terms", description: "Review the terms before continuing.", labelPosition: "end", defaultChecked: false, indeterminate: false } },
  text: { text: "Bring your next idea to life.", props: { variant: "paragraph", size: "md", tone: "neutral" } },
};
const slots: readonly ComponentDefaultSlot[] = ["title", "description", "content", "action"];
const labels: Record<string, string> = {
  text: "Text", defaultValue: "Initial value", defaultChecked: "Initially checked", readOnly: "Read only",
  hideLabel: "Hide label", fullWidth: "Fill width", labelPosition: "Label position", errorPosition: "Error placement",
  errorIcon: "Error icon", error: "Error message", as: "HTML element", radius: "Radius preset", action: "Action label",
};
const label = (key: string) => labels[key] ?? key[0].toUpperCase() + key.slice(1);
function componentId(id: string): asserts id is ComponentDefaultId {
  if (!Object.hasOwn(builtins, id)) throw new Error(`componentDefaults: unknown component ${id}`);
}

/** Registry-driven form metadata. Field names, CSS, event handlers and arbitrary children are never editable defaults. */
export function componentDefaultFields(id: ComponentDefaultId): ComponentDefaultField[] {
  componentId(id);
  const definition = nodeRegistry[id];
  const fields: ComponentDefaultField[] = definition.text ? [{ source: "text", key: "text", label: "Text", type: "text", maxLength: 2000, required: true }] : [];
  for (const [key, rule] of Object.entries(definition.props)) {
    if (key === "name") continue;
    fields.push({ source: "props", key, label: label(key), required: !!definition.requiredProps?.includes(key),
      ...(typeof rule === "string" ? { type: "text", maxLength: 200 } as const : { type: "select", options: [...rule] } as const),
    });
  }
  if (id === "card") for (const key of slots) fields.push({ source: "slots", key, label: label(key), type: "text", maxLength: 2000, required: true });
  return fields;
}

function record(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${path}: expected plain object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) throw new Error(`${path}: expected own data fields`);
    if (!allowed.includes(key)) throw new Error(`${path}: unknown key ${key}`);
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > maxLength) throw new Error(`${path}: invalid text`);
  return value;
}

/** Strict, detached, canonical-order data parser. Omitted entries stay omitted; nothing executes or becomes a style. */
export function parseComponentDefaults(value: unknown): ComponentDefaults {
  const raw = record(value, componentDefaultIds, "componentDefaults");
  const result: ComponentDefaults = {};
  for (const id of componentDefaultIds) {
    if (!Object.hasOwn(raw, id)) continue;
    const path = `componentDefaults.${id}`, definition = nodeRegistry[id];
    const entry = record(raw[id], ["props", ...(definition.text ? ["text"] : []), ...(id === "card" ? ["slots"] : [])], path);
    const parsed: ComponentDefault = {};
    if (Object.hasOwn(entry, "props")) {
      const keys = Object.keys(definition.props).filter(key => key !== "name");
      const props = record(entry.props, keys, `${path}.props`);
      parsed.props = {};
      for (const key of keys) {
        if (!Object.hasOwn(props, key)) continue;
        const rule = definition.props[key], value = props[key];
        if (typeof rule === "string") parsed.props[key] = text(value, `${path}.props.${key}`, 200, rule === "string" || value === "" && !definition.requiredProps?.includes(key));
        else {
          if (!rule.includes(value as PageProp)) throw new Error(`${path}.props.${key}: invalid value`);
          parsed.props[key] = value as PageProp;
        }
      }
      for (const [controlled, initial] of [["checked", "defaultChecked"], ["value", "defaultValue"]]) {
        if (Object.hasOwn(props, controlled) && Object.hasOwn(props, initial)) throw new Error(`${path}.props: conflicting ${controlled}/${initial}`);
      }
    }
    if (Object.hasOwn(entry, "text")) parsed.text = text(entry.text, `${path}.text`, 2000);
    if (Object.hasOwn(entry, "slots")) {
      const values = record(entry.slots, slots, `${path}.slots`);
      parsed.slots = {};
      for (const key of slots) if (Object.hasOwn(values, key)) parsed.slots[key] = text(values[key], `${path}.slots.${key}`, 2000);
    }
    result[id] = parsed;
  }
  return result;
}

function resolve(id: ComponentDefaultId, defaults: ComponentDefaults): ResolvedComponentDefaults {
  const base = builtins[id], override = defaults[id];
  const props = { ...base.props, ...override?.props };
  // Empty optional copy means "no message", distinct from resetting to the starter.
  for (const [key, value] of Object.entries(override?.props ?? {})) {
    if (value === "" && nodeRegistry[id].props[key] === "text" && !nodeRegistry[id].requiredProps?.includes(key)) delete props[key];
  }
  // An authored controlled snapshot replaces the starter's uncontrolled initial value.
  for (const [controlled, initial] of [["checked", "defaultChecked"], ["value", "defaultValue"]]) {
    if (override?.props && Object.hasOwn(override.props, controlled)) delete props[initial];
    if (override?.props && Object.hasOwn(override.props, initial)) delete props[controlled];
  }
  return { props, ...(base.text !== undefined ? { text: override?.text ?? base.text } : {}), ...(base.slots ? { slots: { ...base.slots, ...override?.slots } } : {}) };
}

/** Effective parameters for System forms/previews. No generated field name or local style is included. */
export function resolveComponentDefaults(id: ComponentDefaultId, defaults?: ComponentDefaults): ResolvedComponentDefaults {
  componentId(id);
  return resolve(id, defaults === undefined ? {} : parseComponentDefaults(defaults));
}

/**
 * New instances only; never normalize existing documents through this factory.
 * Card slot copy wins over standalone Text/Button copy, while those children's parameters use their own defaults.
 * Radius and semantic `as` stay omitted unless authored, preserving token radius and variant-to-element inheritance.
 */
export function createComponentNode(kind: PageKind, nextId: () => string, defaults?: ComponentDefaults): PageNode {
  if (!Object.hasOwn(nodeRegistry, kind)) throw new Error("componentDefaults: unknown node kind");
  const parsed = defaults === undefined ? {} : parseComponentDefaults(defaults);
  const used = new Set<string>();
  const allocate = () => {
    const id = nextId();
    if (typeof id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id) || used.has(id)) throw new Error("componentDefaults: expected fresh valid node id");
    used.add(id); return id;
  };
  const card = resolve("card", parsed).slots!;
  const create = (kind: PageKind): PageNode => {
    if (Object.hasOwn(builtins, kind)) {
      const effective = resolve(kind as ComponentDefaultId, parsed);
      const node: PageNode = { id: allocate(), kind, props: effective.props };
      if (effective.text !== undefined) node.text = effective.text;
      if (nodeRegistry[kind].props.name) node.props!.name = node.id;
      if (kind === "card") node.children = [create("cardHeader"), create("cardContent"), create("cardFooter")];
      return node;
    }
    if (kind.startsWith("card")) {
      const node: PageNode = { id: allocate(), kind };
      if (kind === "cardTitle") node.text = card.title!;
      if (kind === "cardDescription") node.text = card.description!;
      if (kind === "cardHeader") node.children = [create("cardTitle"), create("cardDescription")];
      if (kind === "cardContent") node.children = [{ ...create("text"), text: card.content! }];
      if (kind === "cardFooter") node.children = [{ ...create("button"), text: card.action! }];
      return node;
    }
    return createPageNode(kind, allocate);
  };
  return create(kind);
}
