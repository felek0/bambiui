# bambiui page-document design-safe contract

PageDocument remains version 1; design-system tokens remain schema v3. The registry is an exact-key, primitive-value allowlist, not the complete React component API. All seven built-in components render through the real components and share attributes with deterministic TSX export.

## Supported / unsupported matrix

`size` and `radius` are `sm | md | lg`; `tone` is `neutral | primary | success | warning | danger | info`. All state flags below are booleans, including explicit `false`.

| Node | Supported design-safe subset | Intentionally unsupported |
| --- | --- | --- |
| Button | required `text`; `variant`: primary, secondary, outline, ghost, destructive, link; size, radius, disabled, loading, fullWidth; `type`: button, submit, reset | tone (not a component prop), iconOnly, startIcon/endIcon, render, callbacks, arbitrary native attributes |
| Input | required string label/name; size, radius, hideLabel, string description/error, disabled, readOnly, required; `type`: text, email, password, number, search, tel, url; string placeholder/value/defaultValue | variant/tone (not component props), icons, callbacks, numeric values, validation/composition APIs, arbitrary native attributes |
| Switch | required string label/name; size, hideLabel, string description/error, labelPosition: start/end, disabled, readOnly, required, string value, boolean checked/defaultChecked | radius (pill geometry), variant/tone, callbacks, composition/native attributes |
| Checkbox | Switch subset plus radius and boolean indeterminate | variant/tone, callbacks, composition/native attributes |
| Badge | required `text`; variant: solid, subtle, outline; tone, size, radius, dot | startIcon, JSX content/native attributes |
| Card | variant: outlined, elevated, filled; size, radius; unique Header, Content, Footer slots; Header has unique Title/Description text slots | tone, Card.Icon/Media, JSX/native attributes |
| Text | required `text`; variant: heading, h1–h6, paragraph, label, caption; size, tone; as: h1–h6, p, span | radius, JSX/native attributes |

No callbacks, raw ReactNode, CSS/style/className, arbitrary data/ARIA attributes, or executable content are accepted. Icons are deferred: no icon schema or JSX is serialized. Labels, description and error are plain nonblank strings (max 200 characters); label/name remain required even when hidden. Values and placeholders may be empty strings, also max 200 characters. Text remains nonblank, max 2000 characters. Existing identifier, URL-action, 100-node, depth-12, nested-form and legacy buttonType normalization rules remain in force. Unknown keys and invalid enums are rejected.

## State and inheritance

Optional props stay omitted. Component defaults remain Button primary/md, Input text/md, choice controls md/end, Badge outline/neutral/md, Card outlined/md and Text paragraph/neutral/md. Omitted radius retains legacy numeric component overrides; explicit radius selects the existing shared global scale. Variant/state colors and effects resolve through existing component CSS variables and theme tokens; this layer adds no tokens or recoloring.

`checked` and `value` are controlled snapshots without callbacks, **not** an editable state model. `defaultChecked` and `defaultValue` provide initial uncontrolled state for copied-source consumers. Both members of a controlled/default pair cannot be supplied together. No no-op callbacks are synthesized, and render/export pass the exact validated props. The design canvas is inert; application consumers must wire controlled changes themselves or use defaults for interaction. `indeterminate` remains the component's boolean state. Error text uses the existing Field invalid state/description relationships.

## Root geometry and insertion

New composer frames explicitly store `container.props.maxWidth = "full"`: 100% border-box width, no width cap, no inline padding. Omitted/wide roots remain centered at 72rem with spacing-lg padding; narrow remains 42rem. Legacy/imported roots are preserved, not silently migrated. The same prop reaches live render and exported TSX. Fixed frame height/clipping and canvas position are editor-only; source export is content, not a responsive viewport or frame-clipping export.

`composer/insertion.ts` is pure command preparation, with no palette/selection UI. Factories supply required text/labels/names and omit optional design props; Card insertion starts with Card.Content, while the legacy fixture retains header-first defaults via the shared `page-document/defaults.ts` helper.

Proposals address an exact parent/index. Root controls use an explicit Stack wrapper; Grid children use an explicit Grid.Item wrapper; Card body insertion creates Card.Content if absent, otherwise explicitly reports append into the existing Content slot (the Card index is not treated as a body index). The result includes commands, selected node ID, created wrappers, hint and validated page. One wrapper subtree insert is one atomic command/history step. Invalid leaf/header/slot targets do not fall back to ancestors. Nested forms and all parser/command limits remain authoritative. ID generation is injected; failed proposals cannot mutate the document, though consumed generated IDs are not rolled back. Actual drop UI belongs to C07.
