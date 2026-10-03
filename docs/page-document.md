# bambiui page-document design-safe contract

PageDocument remains version 1; design-system tokens remain schema v3. The registry is an exact-key, primitive-value allowlist, not the complete React component API. All seven built-in components render through the real components and share attributes with deterministic TSX export.

## Supported / unsupported matrix

`size` and `radius` are `sm | md | lg`; `tone` is `neutral | primary | success | warning | danger | info`. All state flags below are booleans, including explicit `false`.

| Node | Supported design-safe subset | Intentionally unsupported |
| --- | --- | --- |
| Button | required `text`; `variant`: primary, secondary, outline, ghost, destructive, link; size, radius, disabled, loading, fullWidth; `type`: button, submit, reset | tone (not a component prop), iconOnly, startIcon/endIcon, render, callbacks, arbitrary native attributes |
| Input | required string label/name; size, radius, hideLabel, string description/error, errorPosition, errorIcon, disabled, readOnly, required; `type`: text, email, password, number, search, tel, url; string placeholder/value/defaultValue | variant/tone (not component props), startIcon/endIcon, callbacks, numeric values, validation/composition APIs, arbitrary native attributes |
| Switch | required string label/name; size, hideLabel, string description/error, errorPosition, errorIcon, labelPosition: start/end, disabled, readOnly, required, string value, boolean checked/defaultChecked | radius (pill geometry), variant/tone, callbacks, composition/native attributes |
| Checkbox | Switch subset plus radius and boolean indeterminate | variant/tone, callbacks, composition/native attributes |
| Badge | required `text`; variant: solid, subtle, outline; tone, size, radius, dot | startIcon, JSX content/native attributes |
| Card | variant: outlined, elevated, filled; size, radius; unique Header, Content, Footer slots; Header has unique Title/Description text slots | tone, Card.Icon/Media, JSX/native attributes |
| Text | required `text`; variant: heading, h1–h6, paragraph, label, caption; size, tone; as: h1–h6, p, span | radius, JSX/native attributes |
| Container (frame root) | maxWidth: narrow/wide/full; optional direction: row/column, gap: sm/md/lg, align: start/center/end/stretch, justify: start/center/end/between, boolean wrap | arbitrary display/flex CSS or executable layout values |

No callbacks, raw ReactNode, CSS/style/className, arbitrary data/ARIA attributes, or executable content are accepted. Field errors support `errorPosition: "below" | "above"` (default below) and `errorIcon: "none" | "info" | "warning"` (default none). These are fixed decorative glyphs, never serialized JSX; other icons remain unsupported. Labels, description and error are plain nonblank strings (max 200 characters); label/name remain required even when hidden. Values and placeholders may be empty strings, also max 200 characters. Text remains nonblank, max 2000 characters. Existing identifier, URL-action, 100-node, depth-12, nested-form and legacy buttonType normalization rules remain in force. Unknown keys and invalid enums are rejected.

## State and inheritance

Optional props stay omitted. Component defaults remain Button primary/md, Input text/md, choice controls md/end, Badge outline/neutral/md, Card outlined/md and Text paragraph/neutral/md. Omitted radius retains legacy numeric component overrides; explicit radius selects the existing shared global scale. Variant/state colors and effects resolve through existing component CSS variables and theme tokens; this layer adds no tokens or recoloring.

`checked` and `value` are controlled snapshots without callbacks, **not** an editable state model. `defaultChecked` and `defaultValue` provide initial uncontrolled state for copied-source consumers. Both members of a controlled/default pair cannot be supplied together. No no-op callbacks are synthesized, and render/export pass the exact validated props. The design canvas is inert; application consumers must wire controlled changes themselves or use defaults for interaction. `indeterminate` remains the component's boolean state. Error text uses the existing Field invalid state/description relationships.

## Local appearance API (additive version 1)

`PageNode.appearance?: NodeAppearance` targets the actual primary painted element, not an editor wrapper. For Input this is the bordered input-control shell; for Switch/Checkbox it is the track/box, not the whole labelled field. All other component/layout nodes target their root; Grid targets its inner grid. Card Header, Title, Description, Content and Footer are independently editable nodes.

`PageNode.parts?: Partial<Record<NodePart, NodeAppearance>>` is supported only on Input/Checkbox/Switch. `NodePart` is `root | row | label | control | description | error`; `row` exists only for choices. `root` is the complete Field layout; `row` is the choice's enclosing label/control row; `label` is only its text (Input: Field.Label). `control` overrides the same painted element as `appearance`, with part values taking precedence. Base UI label/description/error relationships are preserved. An above error precedes the label/control group; a below error follows the description. Empty/omitted optional content does not render a part. Error gap separates the optional icon from the message; without an icon there is nothing to separate.

Stable DOM integration for the inspector/canvas:

- `[data-page-owner="<node-id>"]` is the whole Input/Checkbox/Switch Field.Root. It always carries `data-appearance-part="root"`, even without local overrides.
- Within that owner, `[data-appearance-part="label|control|description|error|row"]` selects the real part rather than a CSS-module class. `row` exists only for choices; description/error only exist when they have content. A hidden label's marker stays on its visually-hidden wrapper.
- The native Input or interactive Switch/Checkbox keeps its original `data-page-node="<node-id>"`; the owner attribute does not duplicate or move it. Standalone components without a page-node ID have part markers but no page owner.
- These are component-generated markers, not newly allowlisted arbitrary data attributes in serialized documents. Card slots still use their own node IDs.

Inspector imports from `app/studio/page-document/appearance.ts`:

- Types: `NodeAppearance`, `NodePart`, `NodeParts`, `AppearancePatch`, `PartsPatch`, `AppearanceField`, `AppearancePart` (also re-exported model types where applicable).
- `appearanceFields`: readonly catalog of `{ key, label, group, type, min?, max?, step?, options? }`; `type` is `number | dimension | select | color`.
- **Use `appearanceFieldsFor(kind, part?)` for controls**, not the entire catalog: it filters unsupported/non-consumed fields. `appearanceParts(kind)` returns readonly `{ key, label }[]`. No parts for Card: select its slot nodes.
- Pure `parseNodeAppearance(value, kind, part?)`, `parseNodeParts(value, kind)`, `patchAppearance(current, patch, kind, part?)`, `patchParts(current, patch, kind)` and `appearanceToStyle(appearance?)` helpers.

Flat appearance keys and units:

| Keys | Values |
| --- | --- |
| width, height | finite px 0–10000, `hug`, `fill` |
| minWidth, minHeight | finite px 0–10000 |
| maxWidth | finite px 0–10000 or `fill` |
| paddingTop/Right/Bottom/Left | finite px 0–1000 |
| marginTop/Right/Bottom/Left | finite px −1000–1000 |
| borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius | finite px 0–1000 |
| fontSize | finite px 1–512 |
| fontWeight | integer 1–1000 |
| lineHeight | finite unitless multiplier 0.1–10 |
| letterSpacing | finite px −100–100 |
| textAlign | left, center, right, justify |
| gap | finite px 0–1000, only on flex/grid layouts with multiple content positions |
| background, borderColor | six-digit hex or `transparent` |
| color | six-digit hex |
| borderWidth | finite px 0–100; solid decorative border, never focus outline |
| shadow | none, sm, md, lg; resolves existing `--ds-shadow-*` presets |
| opacity | finite 0–1 |

`hug` means fit-content width / auto height; `fill` means 100% of the containing block (height needs a definite parent height), **not** flex-grow/remaining-space distribution. Dimensions are border-box. Explicit height clears the preset minimum unless a local minHeight is supplied. Fractional lengths are preserved, not rounded to metadata UI steps. No URLs, arbitrary CSS strings, custom variables, outline/position/transform/overflow, unknown keys, non-finite numbers or executable values are allowed. Choice controls expose fontSize (their em-based geometry) but not unconsumed text typography; use their label part for text.

```ts
applyPageCommand(page, {
  type: "update", nodeId: "email",
  appearance: { paddingTop: 12, borderTopLeftRadius: 18 },
  parts: { label: { fontWeight: 600 }, error: { color: "#b42318" } },
});
// Each level supports reset without changing siblings:
// appearance: { paddingTop: null }  -> reset one field
// appearance: null                -> reset primary appearance
// parts: { label: { fontWeight: null } } -> reset one part field
// parts: { label: null }           -> reset one part
// parts: null                     -> reset all parts
```

Patches merge, reject unsupported keys even when resetting, and remove emptied overrides. Parsing, commands and history detach their data; omitted appearance stays omitted and old records are not recolored. Renderer and deterministic TSX export share the same attributes and real components. The source copier recursively includes the standalone `components/appearance.ts` helper; no runtime page-document/editor dependency is required.

Local overrides are intentionally separate from schema-v3 shared tokens: they are theme-independent instance values and take precedence over token-driven variant/state styles for the supplied properties only. Reset restores those styles. They do not alter either theme record, the global inspector or Develop token references. Focus outline geometry/color remains global; arbitrary opacity, size and color choices can still harm visibility or contrast. The global token contrast audit does not certify local overrides; review the actual instance in both themes.

## Root geometry and insertion

New composer frames explicitly store `container.props.maxWidth = "full"`: 100% border-box width, no width cap, no inline padding. Omitted/wide roots remain centered at 72rem with spacing-lg padding; narrow remains 42rem. Legacy/imported roots are preserved, not silently migrated. The same prop reaches live render and exported TSX. Fixed frame height/clipping and canvas position are editor-only; source export is content, not a responsive viewport or frame-clipping export.

Container roots support opt-in auto layout with the same props as Stack: `direction: "row" | "column"`, `gap: "sm" | "md" | "lg"`, `align: "start" | "center" | "end" | "stretch"`, `justify: "start" | "center" | "end" | "between"`, and boolean `wrap`. Without direction, legacy block flow is unchanged, including when the other layout options are saved. Explicit direction enables flex; active defaults are gap md, align stretch, justify start, and wrap false. Nothing is materialized on parse/import. Container's accepted numeric `appearance.gap` overrides the shared spacing preset while flex is active; it does not enable auto layout on its own. The inspector should enable the gap controls after a direction is selected. Reset `props.direction` to null through an update command to restore block flow; reset `appearance.gap` to null to restore the shared gap preset.

Allowed root children can now be laid out directly without an extra Stack solely for layout. This does not change child-slot rules or the insertion adapter's explicit wrappers for controls; frame/editor placement remains separate from content auto layout.

`composer/insertion.ts` is pure command preparation, with no palette/selection UI. Factories supply required text/labels/names and omit optional design props; Card insertion starts with Card.Content, while the legacy fixture retains header-first defaults via the shared `page-document/defaults.ts` helper.

Proposals address an exact parent/index. Root controls use an explicit Stack wrapper; Grid children use an explicit Grid.Item wrapper; Card body insertion creates Card.Content if absent, otherwise explicitly reports append into the existing Content slot (the Card index is not treated as a body index). The result includes commands, selected node ID, created wrappers, hint and validated page. One wrapper subtree insert is one atomic command/history step. Invalid leaf/header/slot targets do not fall back to ancestors. Nested forms and all parser/command limits remain authoritative. ID generation is injected; failed proposals cannot mutate the document, though consumed generated IDs are not rolled back. Actual drop UI belongs to C07.
