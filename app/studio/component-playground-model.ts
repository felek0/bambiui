import { componentDefaultFields, resolveComponentDefaults, type ComponentDefaultField, type ComponentDefaults, type ResolvedComponentDefaults } from "./component-defaults";
import type { ComponentId } from "./tokens";
import type { PageProp } from "./page-document/registry";

export const playgroundIcons = ["none", "plus", "check", "info", "warning"] as const;
export type PlaygroundArgs = ResolvedComponentDefaults;

const fieldGroups = [
  { id: "appearance", label: "Appearance", defaultOpen: true },
  { id: "content", label: "Content", defaultOpen: true },
  { id: "state", label: "State & behavior", defaultOpen: true },
  { id: "more", label: "More options", defaultOpen: false },
] as const;
export type PlaygroundFieldGroup = typeof fieldGroups[number] & { fields: ComponentDefaultField[] };

function fieldGroup(field: ComponentDefaultField): PlaygroundFieldGroup["id"] {
  if (field.source !== "props") return "content";
  if (["variant", "size", "tone", "radius", "fullWidth", "iconOnly", "dot"].includes(field.key)) return "appearance";
  if (["label", "description", "placeholder", "startIcon", "endIcon", "icon"].includes(field.key)) return "content";
  if (["value", "checked", "indeterminate", "disabled", "loading", "readOnly", "required", "error"].includes(field.key)) return "state";
  return "more";
}

/** Keep metadata and its order intact; future supported fields remain reachable in More options. */
export function groupPlaygroundFields(fields: readonly ComponentDefaultField[]): PlaygroundFieldGroup[] {
  return fieldGroups.map(group => ({ ...group, fields: fields.filter(field => fieldGroup(field) === group.id) }))
    .filter(group => group.fields.length > 0);
}

/** The live value replaces the initial-value pair; no uncontrolled props reach the sample. */
export function playgroundFields(component: ComponentId): ComponentDefaultField[] {
  const fields = componentDefaultFields(component).filter(field => !["defaultValue", "defaultChecked"].includes(field.key));
  const iconField = (key: string, label: string): ComponentDefaultField => ({ source: "props", key, label, type: "select", options: playgroundIcons, required: false });
  if (["button", "input", "badge"].includes(component)) fields.push(iconField("startIcon", "Start icon"));
  if (["button", "input"].includes(component)) fields.push(iconField("endIcon", "End icon"));
  if (component === "button") {
    fields.push({ source: "props", key: "iconOnly", label: "Icon only", type: "select", options: [false, true], required: false });
    fields.push(iconField("icon", "Icon-only glyph"));
  }
  return fields;
}

export function playgroundArgs(component: ComponentId, defaults?: ComponentDefaults): PlaygroundArgs {
  const resolved = resolveComponentDefaults(component, defaults);
  const props = { ...resolved.props };
  if (component === "input") props.value = props.value ?? props.defaultValue ?? "";
  if (component === "switch" || component === "checkbox") props.checked = props.checked ?? props.defaultChecked ?? false;
  delete props.defaultValue;
  delete props.defaultChecked;
  return { ...resolved, props, ...(resolved.slots ? { slots: { ...resolved.slots } } : {}) };
}

export function updatePlaygroundArg(args: PlaygroundArgs, field: ComponentDefaultField, value: PageProp | undefined): PlaygroundArgs {
  if (field.source === "text") return { ...args, text: String(value ?? "") };
  if (field.source === "slots") return { ...args, slots: { ...args.slots, [field.key]: String(value ?? "") } };
  const props = { ...args.props };
  if (value === undefined) delete props[field.key];
  else props[field.key] = value;
  return { ...args, props };
}
