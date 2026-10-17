import type { Radius, Size } from "./components/types.ts";

/**
 * Component-specific radius presets. `radius="sm" | "md" | "lg"` instances resolve
 * `--{component}-radius-{preset}-{size}-{corner}` and fall back to the shared
 * `--ds-radius-{preset}` step. Geometry is shared by Light and Dark; sparse, never materialized.
 */
export const radiusComponentIds = ["button", "input", "checkbox", "badge", "card"] as const;
export type RadiusComponentId = (typeof radiusComponentIds)[number];
export const radiusPresets = ["sm", "md", "lg"] as const satisfies readonly Radius[];
export const radiusSizes = ["sm", "md", "lg"] as const satisfies readonly Size[];
export const radiusCorners = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
export type RadiusCorner = (typeof radiusCorners)[number];
export type CornerRadii = Partial<Record<RadiusCorner, number>>;
export type ComponentRadii = Partial<Record<RadiusComponentId, Partial<Record<Radius, Partial<Record<Size, CornerRadii>>>>>>;
export type CornerRadiiPatch = Partial<Record<RadiusCorner, number | null>>;

export const radiusMin = 0;
export const radiusMax = 1000;

/** The painted, shape-bearing layer whose corners a preset controls. */
export const radiusShapePart: Record<RadiusComponentId, "root" | "control"> = { button: "root", input: "control", checkbox: "control", badge: "root", card: "root" };
/** Direct-edit and inspector field keys for each corner. */
export const radiusCornerField = { topLeft: "borderTopLeftRadius", topRight: "borderTopRightRadius", bottomRight: "borderBottomRightRadius", bottomLeft: "borderBottomLeftRadius" } as const satisfies Record<RadiusCorner, string>;

export const isRadiusComponent = (id: string): id is RadiusComponentId => (radiusComponentIds as readonly string[]).includes(id);
const kebab = (value: string) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

export function componentRadiusVariable(id: RadiusComponentId, preset: Radius, size: Size, corner: RadiusCorner) {
  return `--${id}-radius-${preset}-${size}-${kebab(corner)}`;
}

function plainObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${path}: expected plain object`);
  return value as Record<string, unknown>;
}
function known(value: Record<string, unknown>, keys: readonly string[], path: string) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unknown field: ${path}.${key}`);
}
function cornerValue(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < radiusMin || value > radiusMax) throw new Error(`${path} must be a finite number from ${radiusMin} to ${radiusMax}`);
  return value;
}

/** Rejects unknown keys and invalid values; keeps exact numbers and drops empty branches. */
export function parseComponentRadii(value: unknown, path = "componentRadii"): ComponentRadii {
  const result: ComponentRadii = {};
  const components = plainObject(value, path);
  known(components, radiusComponentIds, path);
  for (const id of radiusComponentIds) {
    if (!Object.hasOwn(components, id)) continue;
    const presets = plainObject(components[id], `${path}.${id}`);
    known(presets, radiusPresets, `${path}.${id}`);
    for (const preset of radiusPresets) {
      if (!Object.hasOwn(presets, preset)) continue;
      const sizes = plainObject(presets[preset], `${path}.${id}.${preset}`);
      known(sizes, radiusSizes, `${path}.${id}.${preset}`);
      for (const size of radiusSizes) {
        if (!Object.hasOwn(sizes, size)) continue;
        const corners = plainObject(sizes[size], `${path}.${id}.${preset}.${size}`);
        known(corners, radiusCorners, `${path}.${id}.${preset}.${size}`);
        const parsed: CornerRadii = {};
        for (const corner of radiusCorners) if (Object.hasOwn(corners, corner)) parsed[corner] = cornerValue(corners[corner], `${path}.${id}.${preset}.${size}.${corner}`);
        if (Object.keys(parsed).length) ((result[id] ??= {})[preset] ??= {})[size] = parsed;
      }
    }
  }
  return result;
}

export function componentRadiiVariables(radii?: ComponentRadii): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const id of radiusComponentIds) for (const preset of radiusPresets) for (const size of radiusSizes) for (const corner of radiusCorners) {
    const value = radii?.[id]?.[preset]?.[size]?.[corner];
    if (value !== undefined) variables[componentRadiusVariable(id, preset, size, corner)] = `${value}px`;
  }
  return variables;
}

export function componentRadiusValues(radii: ComponentRadii | undefined, id: RadiusComponentId, preset: Radius, size: Size): CornerRadii {
  return { ...radii?.[id]?.[preset]?.[size] };
}

/** Pure write: numbers set, null removes; validates before returning and prunes empty branches. */
export function applyComponentRadiusPatch(radii: ComponentRadii | undefined, id: RadiusComponentId, preset: Radius, size: Size, patch: CornerRadiiPatch): ComponentRadii {
  const next = structuredClone(radii ?? {});
  const corners: CornerRadii = { ...next[id]?.[preset]?.[size] };
  for (const corner of Object.keys(patch) as RadiusCorner[]) {
    if (!radiusCorners.includes(corner)) throw new Error(`Unknown radius corner: ${corner}`);
    const value = patch[corner];
    if (value === null || value === undefined) delete corners[corner];
    else corners[corner] = cornerValue(value, `${id}.${preset}.${size}.${corner}`);
  }
  const presets = (next[id] ??= {});
  const sizes = (presets[preset] ??= {});
  if (Object.keys(corners).length) sizes[size] = corners;
  else delete sizes[size];
  if (!Object.keys(sizes).length) delete presets[preset];
  if (!Object.keys(presets).length) delete next[id];
  return next;
}

/** True when any corner of this component/preset/size is stored. */
export function componentRadiusResettable(radii: ComponentRadii | undefined, id: RadiusComponentId, preset: Radius, size: Size) {
  return Object.keys(radii?.[id]?.[preset]?.[size] ?? {}).length > 0;
}
