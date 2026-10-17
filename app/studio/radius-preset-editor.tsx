import { useState } from "react";
import type { Radius, Size } from "./components/types";
import type { ThemeTokens } from "./tokens";
import { radiusCorners, radiusPresets, radiusSizes, type CornerRadiiPatch, type RadiusComponentId } from "./component-radii";
import { spacingNumericValue } from "./spacing-numeric-draft";

export type RadiusPresetUpdate = { preset: Radius; size: Size; patch: CornerRadiiPatch };
const sizeLabels: Record<Size, string> = { sm: "Small", md: "Medium", lg: "Large" };
const field = { key: "borderTopLeftRadius", label: "Radius", group: "radius", type: "number", min: 0, max: 1000, step: 1 } as const;
const sharedStep = (theme: ThemeTokens, preset: Radius) => preset === "sm" ? theme.global.radiusSm : preset === "lg" ? theme.global.radiusLg : theme.global.radius;

function PresetCell({ component, preset, size, theme, onChange }: {
  component: RadiusComponentId; preset: Radius; size: Size; theme: ThemeTokens;
  onChange: (updates: RadiusPresetUpdate[]) => void;
}) {
  const stored = theme.componentRadii?.[component]?.[preset]?.[size] ?? {};
  const values = radiusCorners.map(corner => stored[corner] ?? sharedStep(theme, preset));
  const custom = Object.keys(stored).length > 0;
  const mixed = new Set(values).size > 1;
  const resolved = mixed ? "" : String(values[0]);
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? resolved;
  const value = draft === null ? null : spacingNumericValue(draft, field);
  const id = `radius-preset-${component}-${preset}-${size}`;
  const describe = `${custom ? "Custom" : "Shared scale"}${mixed ? " · corners differ" : ""}`;
  function apply() {
    if (value === null) return;
    setDraft(null);
    if (!mixed && value === values[0] && custom) return;
    onChange([{ preset, size, patch: Object.fromEntries(radiusCorners.map(corner => [corner, value])) }]);
  }
  return <td data-radius-preset-cell={`${preset}.${size}`} data-source={custom ? "custom" : "scale"}>
    <input id={id} type="text" inputMode="decimal" value={text} placeholder={mixed ? "Mixed" : undefined}
      aria-label={`Radius ${preset} at ${sizeLabels[size]}: ${mixed ? `corners ${values.join(", ")}` : `${values[0]}px`} (${describe})`}
      aria-invalid={draft !== null && value === null} title={mixed ? `Corners ${values.join(" / ")}px. Typing a value sets all four.` : `${describe}. Enter applies to all variants in both themes.`}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => setDraft(null)}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); apply(); }
        if (event.key === "Escape" && draft !== null) { event.preventDefault(); event.stopPropagation(); setDraft(null); }
      }} />
    <small>{describe}</small>
    {custom && <button type="button" aria-label={`Reset radius ${preset} at ${sizeLabels[size]}`} title="Use the shared scale step"
      onClick={() => onChange([{ preset, size, patch: Object.fromEntries(radiusCorners.map(corner => [corner, null])) }])}>↺</button>}
  </td>;
}

/** Overview of every radius preset per size; the matrix view selects which preset canvas edits target. */
export function RadiusPresetEditor({ component, theme, view, onViewChange, onChange, embedded = false }: {
  component: RadiusComponentId; theme: ThemeTokens; view?: Radius;
  /** Inside a titled inspector group the section heading is redundant. */
  embedded?: boolean;
  onViewChange: (radius: Radius | undefined) => void;
  onChange: (updates: RadiusPresetUpdate[]) => void;
}) {
  const custom = radiusPresets.some(preset => radiusSizes.some(size => Object.keys(theme.componentRadii?.[component]?.[preset]?.[size] ?? {}).length));
  return <section className="token-section radius-preset-editor" id="radius-presets" data-radius-preset-editor>
    {!embedded && <div className="section-heading"><h3>Radius presets</h3><span>Shared · both themes</span></div>}
    <p>Used by <code>radius=&quot;sm | md | lg&quot;</code> instances, per size and for every variant. Unset cells follow the Shape &amp; spacing scale. The default shape (no radius prop) is edited with Corners.</p>
    <table>
      <thead><tr><th scope="col">Preset</th>{radiusSizes.map(size => <th scope="col" key={size}>{sizeLabels[size]}</th>)}</tr></thead>
      <tbody>{radiusPresets.map(preset => <tr key={preset} data-radius-preset-row={preset} data-viewing={view === preset || undefined}>
        <th scope="row">
          <button type="button" aria-pressed={view === preset} data-system-context-change="matrix-radius" title={view === preset ? "Show the default shape" : `Show every variant with radius="${preset}"`}
            onClick={() => onViewChange(view === preset ? undefined : preset)}>{preset}</button>
          <small>scale {sharedStep(theme, preset)}px</small>
        </th>
        {radiusSizes.map(size => <PresetCell key={`${size}-${JSON.stringify(theme.componentRadii?.[component]?.[preset]?.[size] ?? {})}`} component={component} preset={preset} size={size} theme={theme} onChange={onChange} />)}
      </tr>)}</tbody>
    </table>
    {custom && <button type="button" className="radius-preset-reset" onClick={() => onChange(radiusPresets.flatMap(preset => radiusSizes
      .filter(size => Object.keys(theme.componentRadii?.[component]?.[preset]?.[size] ?? {}).length)
      .map(size => ({ preset, size, patch: Object.fromEntries(radiusCorners.map(corner => [corner, null])) }))))}>Reset all radius presets</button>}
  </section>;
}
