import { generatePalette, type PaletteMode } from "../../studio/color-engine.ts";
import { defaultSystem, toCSSVariables, type DesignSystem, type FontFamilyPreset } from "../../studio/tokens.ts";

/** Landing demos share one in-memory System. Nothing is written to Studio storage. */
export function createDemoSystem(): DesignSystem {
  return structuredClone(defaultSystem);
}

export function applyBrandColor(system: DesignSystem, color: string): DesignSystem {
  const palette = generatePalette(color);
  return { ...system, themes: {
    light: { ...system.themes.light, source: palette.source, global: { ...system.themes.light.global, ...palette.light.tokens } },
    dark: { ...system.themes.dark, source: palette.source, global: { ...system.themes.dark.global, ...palette.dark.tokens } },
  } };
}

export type ShapeControls = { radius: number; density: number; fontSize: number; fontFamily: FontFamilyPreset };
export const defaultShape = (): ShapeControls => {
  const global = defaultSystem.themes.light.global;
  return { radius: global.radius, density: global.paddingX, fontSize: global.fontSize, fontFamily: defaultSystem.themes.light.fontFamily };
};

/** Non-color tokens are shared by Light and Dark, exactly as in Studio. */
export function applyShape(system: DesignSystem, shape: ShapeControls): DesignSystem {
  const geometry = {
    radius: shape.radius, radiusSm: Math.round(shape.radius / 2), radiusLg: Math.round(shape.radius * 1.5),
    paddingX: shape.density, paddingY: Math.round(shape.density * 0.6), gap: Math.max(4, Math.round(shape.density / 2)),
    fontSize: shape.fontSize,
  };
  const theme = (mode: PaletteMode) => ({ ...system.themes[mode], fontFamily: shape.fontFamily, global: { ...system.themes[mode].global, ...geometry } });
  return { ...system, themes: { light: theme("light"), dark: theme("dark") } };
}

/** Exported variables that differ from the default System, per theme. */
export function changedVariables(system: DesignSystem, mode: PaletteMode) {
  const base = toCSSVariables(defaultSystem.themes[mode], mode), next = toCSSVariables(system.themes[mode], mode);
  return Object.entries(next).filter(([name, value]) => base[name] !== value && name.startsWith("--ds-") && !/-(50|100|200|300|400|500|600|700|800|900|1000)$/.test(name));
}
