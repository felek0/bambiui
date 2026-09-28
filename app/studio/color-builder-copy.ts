// UI copy only; token names, audit IDs and CSS/JSON identifiers remain stable.
export const colorBuilderCopy = {
  builder: "Color builder",
  openBuilder: "Open color builder",
  closeBuilder: "Close color builder",
  autoIntro: "Choose a brand color to update light and dark together. Component overrides and dimensions stay unchanged.",
  bothSource: "Source for both themes: ",
  differentSources: "Theme sources differ; choose a color to update both. Light source: ",
  source: "Source brand color",
  picker: "Source brand color picker",
  validHex: "Six-digit hex. Your source stays separate from the adjusted primary color.",
  invalidHex: "Enter a six-digit hex color, such as #e8673c.",
  presets: "Brand color presets",
  applyPreset: (name: string) => `Apply ${name} to both themes`,

  failures: (failures: string, total: string) => `${failures} of ${total} checked color pairs need attention.`,
  allPass: (total: string) => `All ${total} checked color pairs meet their targets.`,
  reportHelp: "Selected color pairs on the global surface, including modeled mixes and enabled states. Not a complete accessibility audit; nested surfaces and other states still need review.",

  pairResults: "Contrast pair results",
  componentPairs: (name: string) => `${name} color pairs`,
  componentPairStatus: (name: string, failures: number, total: number) => failures
    ? `${name} color pairs: ${failures} of ${total} need attention`
    : `${name} color pairs: ${total} checked, no issues found`,
  closePairs: "Close color pair results",
  pass: "Pass",
  belowTarget: "Below target",
  required: "required",
  on: "on",
  modes: { light: "Light", dark: "Dark" },
};
