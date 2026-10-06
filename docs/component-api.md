# Component API contract

Every bambiui component in `app/studio/components/` follows this contract. New components must implement the full prop set for their category below. A developer should be able to guess a component's API without reading its source:

```tsx
<Component variant="…" size="md" disabled />
```

The contract follows the component models of IBM Carbon, Material Design, Fluent UI, and Radix/Base UI, the Design Tokens Community Group naming principles, and WAI-ARIA Authoring Practices.

## 1. Shared vocabulary

The same concept always uses the same prop name, type and default.

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `variant` | component-specific union | component-specific | Visual hierarchy or fill style. Never encodes size or state. |
| `tone` | `Tone` = `"neutral" \| "primary" \| "success" \| "warning" \| "danger" \| "info"` | `"neutral"` | Semantic color role. Inherits the global role unless that component tone/variant has a local color override. |
| `size` | `Size` = `"sm" \| "md" \| "lg"` | `"md"` | The shared size scale. Maps to `controlHeight{Sm,Md,Lg}` and the size scale factors. |
| `radius` | `Radius` = `"sm" | "md" | "lg"` | omitted (global md by default) | Shape scale for components with corners. Resolves to shared global radius tokens. Omit to preserve a legacy numeric component radius override. Switch keeps its pill geometry and does not accept this prop. |
| `disabled` | `boolean` | `false` | Not interactive. Native `disabled` when possible. |
| `loading` | `boolean` | `false` | Busy. Blocks activation, keeps focus, sets `aria-busy`. |
| `readOnly` | `boolean` | `false` | Value can be focused and copied but not changed. Not the same as `disabled`. |
| `required` | `boolean` | `false` | Native `required`, so it is announced and validated. |
| `fullWidth` | `boolean` | `false` | Stretches to the container width. |
| `iconOnly` | `boolean` | `false` | Square control containing only an icon. Requires `aria-label` in the type. |
| `startIcon` / `endIcon` | `ReactNode` | — | Decorative icons before or after the content. Sized by the component (`--ds-icon-size`). |
| `label` | `ReactNode` | required | Visible label that also provides the accessible name. |
| `hideLabel` | `boolean` | `false` | Hides the label visually while keeping the accessible name. |
| `description` | `ReactNode` | — | Helper text linked with `aria-describedby`. |
| `error` | `ReactNode` | — | Error message. Its presence marks the field invalid (`aria-invalid`) and links the message. |
| `errorPosition` | `"below" \| "above"` | `"below"` | Error after description or before the label/control group; DOM order matches visual order. |
| `errorIcon` | `"none" \| "info" \| "warning"` | `"none"` | Fixed decorative, aria-hidden error glyph. |
| `appearance` | `NodeAppearance` | omitted | Typed local design overrides on the primary painted element, not a variant synonym. |
| `parts` | `NodeParts` | omitted | Field/choice-only typed overrides for root, label, control, description, error, plus choice row. |
| `labelPosition` | `"start" \| "end"` | `"end"` | Label side for inline choice controls. |
| `checked` / `defaultChecked` / `onCheckedChange` | Base UI | — | Controlled and uncontrolled pair for binary controls. |
| `value` / `defaultValue` / `onValueChange` | Base UI | — | Controlled and uncontrolled pair for value controls. |
| `className` | `string` | — | Applied to the root element. |

Do not invent synonyms such as `buttonSize`, `dimension`, `density`, `kind`, `color`, `isDisabled` or `helperText`.

## 2. Required props by category

All categories support the typed local `appearance` API in addition to the props below. Text fields and choices also support typed `parts`; these are instance values, not shared token axes.

| Category | Examples | Must support |
| --- | --- | --- |
| Action | Button, IconButton, MenuItem | `variant`, `size`, `radius`, `disabled`, `loading`, `fullWidth`, `iconOnly`, `startIcon`, `endIcon`, all native button props, `render` (Base UI composition) |
| Text field | Input, Textarea, NumberField, Select trigger | `label`, `hideLabel`, `description`, `error`, `errorPosition`, `errorIcon`, `size`, `radius` where corners are configurable, `disabled`, `readOnly`, `required`, `placeholder`, `name`, `value`/`defaultValue`/`onValueChange`, `startIcon`/`endIcon` where applicable, `type` for native inputs |
| Choice | Checkbox, Switch, Radio | `label`, `hideLabel`, `description`, `error`, `errorPosition`, `errorIcon`, `size`, `radius` where corners are configurable, `labelPosition`, `disabled`, `readOnly`, `required`, `name`, `value`, `checked`/`defaultChecked`/`onCheckedChange` (Checkbox also supports `indeterminate`) |
| Status | Badge, Tag, Alert, Toast | `variant` (`solid \| subtle \| outline`), `tone`, `size` (for inline statuses), `radius` for shape-bearing statuses, `startIcon` or `dot` |
| Container | Card, Dialog, Popover | `variant` (`outlined \| elevated \| filled` for surfaces), `size` (density), `radius`, compound parts: `.Header`, `.Title`, `.Description`, `.Content`, `.Footer`, and `.Icon` or `.Media` where relevant |
| Typography | Text | `variant` (`heading \| h1 \| h2 \| h3 \| h4 \| h5 \| h6 \| paragraph \| label \| caption`), `size`, `tone`, `as` (native `h1`–`h6`, `p`, or `span`), `children`, `className`, native HTML attributes |

Current components (all also accept `appearance`; every Card compound slot accepts its own `appearance`):

| Component | `variant` | Other props |
| --- | --- | --- |
| Button | `primary`, `secondary`, `outline`, `ghost`, `destructive`, `link` | `size`, `radius`, `loading`, `disabled`, `fullWidth`, `iconOnly`, `startIcon`, `endIcon` |
| Input | — | `type`, `size`, `radius`, `label`, `hideLabel`, `description`, `error`, `errorPosition`, `errorIcon`, `parts`, `readOnly`, `disabled`, `required`, `startIcon`, `endIcon` |
| Switch | — | `size`, `label`, `hideLabel`, `description`, `error`, `errorPosition`, `errorIcon`, `parts`, `labelPosition`, `disabled`, `readOnly`, `required`; shared switch radius keeps a pill shape |
| Checkbox | — | Same as Switch, plus `radius` and `indeterminate` |
| Badge | `solid`, `subtle`, `outline` | `tone`, `size`, `radius`, `dot`, `startIcon` |
| Card | `outlined`, `elevated`, `filled` | `size`, `radius`; parts: `Card.Icon`, `Card.Header`, `Card.Title`, `Card.Description`, `Card.Content`, `Card.Footer` |
| Text | `heading`, `h1`–`h6`, `paragraph` (default), `label`, `caption` | `size` (`md` default), `tone` (`neutral` default), `as`, `children`, `className`, native HTML attributes |

### Text API

`Text` is presentational and does not use Base UI. Its `variant` selects typography tokens independently of the semantic `as` element. By default, `h1`–`h6` render their matching heading elements, legacy `heading` renders `h2`, `paragraph` renders `p`, and `label` and `caption` render `span`. Set `as="h1"` through `as="h6"` to override the element independently of the visual variant; legacy `heading` retains its original tokens and appearance. Choose semantic headings to match the document's hierarchy; `variant="label"` is a visual style, not an HTML `<label>` associated with a form control.

```tsx
<Text variant="h1">Page title</Text>
<Text variant="h2" as="h3">Visually H2, semantically H3</Text>
<Text as="h1" variant="heading" size="lg">Legacy heading style</Text>
<Text tone="info">Supporting text</Text>
<Text variant="caption" as="span">Updated today</Text>
```

The shared `fontFamily` preset (`system` by default; six other local presets plus curated Google Fonts presets) exports a resolved font stack as `--ds-font-family` for Text and other typography consumers. Typography values come from `--ds-typography-{variant}-{font-size,line-height,font-weight,letter-spacing}` for each of `heading`, `h1`–`h6`, `paragraph`, `label`, and `caption`. All ten styles are independently editable and shared between Light and Dark; older v3 records without H1–H6 receive defaults on import. H1–H6 default font sizes descend from 48px to 20px (editor range 8–96px). Font size scales with `--ds-size-scale-sm` and `--ds-size-scale-lg` (`md` is unscaled); line height stays unitless, weight numeric, and letter spacing in px. Neutral text uses `--text-foreground` (inherited from `--ds-foreground` until overridden); other tones use the corresponding `--ds-{tone}-on-subtle` text color for readability on the theme background. An authored shared `componentStyles.text.root.color` supplies ink for every tone beneath the exact `componentRecipes.text["variant.tone.size"].root.color` override. Card Content/Footer recipe typography has the descendant scope documented below; local `appearance.color` still wins.

### Layout Container

`Container` accepts `maxWidth="narrow" | "wide" | "full"`. The omitted default remains `wide` (72rem); `narrow` remains 42rem. Both retain centered margins and inline `--ds-spacing-lg` padding. `full` is 100% border-box width with no max-width cap or inline padding; new composer frame roots opt into it explicitly. Existing/imported roots are not rewritten. Frame width, height and clipping are editor geometry, not Container props or responsive viewport breakpoints. Renderer and TSX export consume the same root props.

Container also accepts Stack's auto-layout vocabulary: `direction="row" | "column"`, `gap="sm" | "md" | "lg"`, `align="start" | "center" | "end" | "stretch"`, `justify="start" | "center" | "end" | "between"`, and boolean `wrap`. **Omitted direction preserves the historical block flow exactly** (including margin collapse); setting direction explicitly enables flex layout. Its active defaults are gap `md` (`--ds-spacing-md`), align `stretch`, justify `start`, and wrap `false`. The other settings can be stored while block flow is active but do not enable flex by themselves. Stack still defaults to column flex layout.

An optional numeric `appearance.gap` overrides the selected shared spacing step only for that instance; it has no layout effect while direction is omitted. Removing direction restores block flow without deleting the saved other settings. All maxWidth behaviors remain independent and unchanged. These props work on page/frame roots through the same renderer/export path; no new shared tokens are introduced.

## 3. Modeling rules

1. **Keep axes separate.** Hierarchy (`variant`), semantics (`tone`), dimensions (`size`) and state (`disabled`, `loading`, …) are independent props. Never combine them into one value such as `smallPrimary`, `dangerOutline` or `variant="disabled"`.
2. **No boolean variants.** Use `variant="subtle"`, not `subtle`. Use `size="lg"`, not `large`. Booleans are only for true binary behavior.
3. **State lives in data attributes.** Components expose public API as `data-variant`, `data-tone` and `data-size`. Interaction state uses Base UI attributes (`data-disabled`, `data-invalid`, `data-checked`, `data-pressed`, `data-active`) or native pseudo-classes. Style from those, never from ad-hoc classes such as `.active` or `.is-selected`.
4. **Use composition for structure.** When content has more than one region, use compound parts (`Card.Header`) instead of props like `title` or `footer`. Props are for configuration; children are for content.
5. **Keep the public surface small.** `appearance` and field `parts` are the supported, typed instance/slot styling API. Do not expose arbitrary slot CSS, internal class selectors or implementation toggles. Consumers also retain `className` on the root and the other documented props.
6. **Use Base UI first.** Build interactive components on the matching `@base-ui/react` part (see `docs/base-ui.md`) and keep its semantics, keyboard behavior and state attributes.

### Local instance appearance

All built-in components, Card compound slots, Container, Stack, Grid and Grid.Item accept `appearance?: NodeAppearance`. Fields additionally accept `parts?: NodeParts`. These are **local instance overrides**, not new global/component tokens or another variant axis. `components/appearance.ts` owns the reusable types and safe style conversion; `page-document/appearance.ts` supplies pure, kind-aware inspector metadata and patch/validation helpers. See [page-document.md](page-document.md#local-appearance-api-additive-version-1) for the complete allowlist, bounds, units, targets and reset contract.

Appearance supports separate padding and margin edges, corner radii, width/height/minimums/maxWidth, typography, layout gap, surface/color/border/shadow/opacity. Supplied values override native `style`, exact recipes and shared System Styles for the same properties; omitted fields keep their recipe/shared part/component/theme inheritance. Public native `style` remains the trusted React escape hatch, but it is never accepted in serialized documents. Shared tokens remain schema v3; old records without local appearance render unchanged. No raw CSS, URLs, arbitrary custom properties or focus-outline overrides can be serialized. Colors are theme-independent local choices; the existing token contrast audit does not certify them.

For Input, appearance styles the painted bordered shell, including independently controlled edge padding; native input typography inherits the shell. Switch/Checkbox appearance styles the track/box, **not** its label. Their `parts.root` styles the complete Field layout, `parts.row` the wrapping label/control row (choices only), `parts.label` only label text, `parts.description` and `parts.error` their respective Base UI elements. `parts.control` merges over primary appearance. Hidden labels retain their visually-hidden wrapper even with local dimensions/spacing. Base UI still owns label associations, validation, keyboard behavior and described-by links. An optional error icon never replaces the textual error.

Field DOM integration is stable independently of local values: `data-appearance-part="root|label|control|description|error|row"` identifies the corresponding element (row only for choices; optional messages only while rendered). When a field receives `data-page-node`, its Field.Root mirrors that value in `data-page-owner`, while the native Input or interactive choice control retains `data-page-node`. This lets editor code measure/select the complete field and inspect individual part styles without relying on CSS-module class names. These generated attributes are not extra serialized page props. Hidden label markers remain on the visually-hidden label wrapper, whose clipped geometry must not be treated as its unhidden layout.

Develop lists these props and their consumed fields in a separate local-instance reference, not the theme CSS-variable tables. Copyable snippets and expanded specimens demonstrate local edges, typography, Card slots and field error placement/icons while leaving shared tokens unchanged.

Switch's default radius remains a pill and the `radius` prop is still unsupported; shared control-corner styles can change its System shape, while explicit local corner overrides affect only that instance. Local track geometry also adjusts checked-thumb alignment. Card slots are independently styled via each slot's own `appearance`; Card's `parts` is unsupported. Local appearance itself introduces no shared tokens; the separate System Styles models below supply shared part defaults and exact recipes. Card.Content/Footer local typography also scopes nested Text and Button/Badge labels; each child's own local typography wins over that slot-local scope. Legacy shared slot typography does not acquire this descendant behavior.

## 4. Design tokens

- **Theme model** (`app/studio/tokens.ts`): schema v3 stores `themes.light` and `themes.dark` with independent sources, global colors, color scales and component variant/state color overrides. Shape, spacing, size, radius scale, numeric component overrides, component radius selections, variant border widths and shadow presets, the `fontFamily` preset and Text typography (including H1–H6) are shared across themes; edits from either theme update both records. Older v3 drafts receive deterministic defaults for additions without changing existing colors or numeric component radius overrides. Conflicting non-color values use Light on import while Light/Dark color data is retained. v1/v2 migration preserves exact historical values and component overrides while supplying new preset defaults.
- **Studio routes**: `/colors` and `/spacing` select the canvas foundations and their global inspectors; `/develop/colors` and `/develop/spacing` provide the corresponding theme-aware CSS references. `/text` and `/develop/text` cover the Text component and shared typography. Design/Develop links preserve the current selection.
- **Global tokens** (`app/studio/tokens.ts`, exported as `--ds-*`):
  - Surfaces: `background`, `foreground`, `muted`, `mutedForeground`, `border`
  - Roles: `primary`, `secondary`, `success`, `warning`, `danger` and `info`, each with an `on*` foreground
  - Shape and legacy spacing aliases: `radiusSm`, `radius` (legacy medium / `radiusMd` alias), `radiusLg`, `paddingX`, `paddingY`, `gap`, `margin`, `fontSize`, `borderWidth`. Exported radius variables are `--ds-radius-sm`, `--ds-radius-md`, and `--ds-radius-lg`; `--ds-radius` remains a compatibility alias for md.
  - Shared spacing presets: `spacingSm` (4px), `spacingMd` (8px), `spacingLg` (16px), exported as `--ds-spacing-sm`, `--ds-spacing-md`, `--ds-spacing-lg`. Card.Content consumes the matching preset as the gap between its children at Card sizes sm/md/lg. Legacy padding/gap globals and component overrides continue to control the Card shell and other components independently; editing a preset does not remap those aliases.
  - Size scale: `controlHeightSm`, `controlHeightMd`, `controlHeightLg`
- **Base component tokens** (exported as `--{component}-{token}`): `background`, `foreground`, `border`, legacy numeric `radius`, `paddingX`, `paddingY`, `gap`, `margin`, `fontSize`, `borderWidth`. They inherit from the appropriate global tokens until overridden. Shape-bearing Button, Input, Checkbox, Badge and Card accept `radius="sm" | "md" | "lg"` to select the global radius scale; when omitted, old numeric per-component radius overrides remain effective. Switch retains its pill shape. Among legacy Text aliases, the inspector exposes only the consumed `foreground`; shared typography and the separate Text part styles remain editable. Other Text aliases are compatibility exports and do not drive its rendered styles.
- **Component variant and state styles**: schema v3 stores sparse color overrides for each real style axis. Button supports `primary`, `secondary`, `outline`, `ghost`, `destructive` and `link`; each has editable background, foreground and border colors plus hover/active fills. Input supports `default`, `hover`, `invalid` and `readonly`; Switch and Checkbox support `checked`, `unchecked`, `invalidChecked` and `invalidUnchecked`; Badge supports every `solid | subtle | outline` × semantic tone pair; Card supports `outlined`, `elevated` and `filled`. Their stable `--{component}-variant-*` variables are consumed by component CSS and exported with resolved defaults. Unset values inherit from the component aliases, global roles or documented derived colors; local Button/Badge/Card combinations can diverge from global semantic roles. All these style entries accept a shared numeric `borderWidth` (0–6px) and a shared shadow preset (`none | sm | md | lg`) where CSS consumes it. Button hover/active colors are also editable; default fills derive from the configured variant unless an override is set. Background and border colors may be `transparent`; text foregrounds remain six-digit hex colors. The contrast model resolves transparent surfaces through the modeled parent (a shared choice row or Card slot where applicable), otherwise the global canvas background. Color overrides can differ by theme, while border width and shadow values always follow the shared non-color invariant. These token styles are separate from React props. Focus ring color and geometry remain global and are not replaced by decorative borders or shadows.
- **Derived roles** (`color-engine.ts`, emitted by `toCSSVariables(theme, mode)`): global role hover, active, subtle, on-subtle, outline and focus colors; component variant hover fills; Badge readable/outline derivatives; Card description ink. Link Buttons retain readable derived text. Recomputed from current resolved values, not saved source. Invalid manual pairs are reported rather than silently rewritten.
- **Shared font preset** (`themes.*.fontFamily`): the seven local choices are `system` (default), `sans`, `humanist`, `serif`, `editorial`, `mono` and `typewriter`; curated Google Fonts presets are available alongside them. JSON stores the chosen preset ID in both theme records, not a URL or downloaded font. Older schema-v3 records without `fontFamily` still default to `system`; accepting curated IDs does not change the schema version. Edits, reset and import keep this non-color value identical in Light and Dark (a conflicting imported v3 value uses Light). Local choices need no hosted fonts. Selecting a Google preset opts the browser into a stylesheet request to `fonts.googleapis.com` and font-file requests to `fonts.gstatic.com`, exposing request data such as IP address to Google; if unavailable or blocked, the resolved stack falls back to local fonts. CSS export puts the selected Google stylesheet `@import` at the top, before either theme selector, and exports the resolved family stack (not the ID) as `--ds-font-family` for both themes. CSS consumers also make these remote requests unless they remove the import or provide their own fonts.
- **System constants** (`systemConstants` in `tokens.ts`): state opacity/offset, global accessible focus geometry, size/icon scale, spacing insets, shadow presets, motion and fixed component typography. Both preview and CSS export consume the same map. Focus ring color/geometry is not a decorative variant token and cannot be disabled by changing component borders.
- No hard-coded colors or sizes in component CSS. Values come from these layers. CSS paints every public variant/tone combination and supported state from its matching `--{component}-variant-*` variables; these variables resolve to component overrides or documented global/derived defaults. Card filled surfaces and descriptions use the Card filled variant values; semantic Badge tones use their tone/variant variables. Input and choice-control invalid/readonly states use their own resolved style entries. Decorative border colors, widths and shadows remain separate from the global accessible focus ring.
- CSS export includes both theme selectors, raw color scale stops, and derived/system variables, not component markup or style rules. Only Google presets add a top-of-file `@import`; local presets remain network-free.
- Adding a global token requires updating `TokenValues`, `defaultSystem`, `tokenFields`, the schema migration in `parseDesignSystem`, and `tokens.test.mjs`.

### System Parameters and shared part styles

- **Parameters**: optional `DesignSystem.componentDefaults?: ComponentDefaults` (`component-defaults.ts`) stores insertion props, text and Card slot copy, not styles or field names. System Parameters affects only new built-in insertions; Project Parameters edits an existing instance. These are not changes to React API defaults. An explicit empty optional message (`description`/`error`) suppresses the starter copy and is omitted from the generated node; removing the default key restores the built-in starter. Required labels and Card copy remain nonempty. New Cards contain Header → Title/Description, Content → Text, and Footer → Button; Input and other components have complete starters, while layout primitives remain empty. Saved snapshots retain their captured parameters and local overrides, not a synchronized master definition.
- **Legacy shared part styles**: optional `ThemeTokens.componentStyles?: ComponentStyles` (`component-styles.ts`) stores sparse `{ component: { part: NodeAppearance } }` records. It affects linked existing components as well as new ones, across combinations and beneath exact recipes and local `appearance`/field `parts`. Colors (`background`, `color`, `borderColor`) may differ by theme; all other fields, including typography, border widths, opacity and shadow presets, are shared. Import normalizes shared values from Light, including omissions, without rounding historical values or recoloring; absent records retain the old CSS behavior. Unknown components, parts, unsupported fields and invalid values reject.
- Use **`componentStyleParts` / `componentStyleFields`** as the editable allowlist, not the full appearance catalog. Root/control variant paint stays in the existing variant/state entries; part geometry does not replace focus outlines. `componentStyleVariable` names consumed fields as `--{component}-part-{part}-{kebab-key}`. `toCSSVariables` includes sparse authored declarations plus conditional implementation helpers. Develop lists only metadata fields, distinguishes inherited CSS defaults from authored styles, and separates theme-specific colors from shared dimensions/effects and local appearance. Helpers for boxes, alignment and inner padding are not editable tokens; a generated minHeight is identified separately from an authored value.
- Reset removes a key, restoring its CSS fallback rather than freezing today's resolved value. CSS/JSON preserve the same inheritance; export resets omitted sparse Dark declarations to `initial` where necessary so Light overrides do not leak. System defaults are separate insertion data, not CSS. Old local overrides keep precedence, including in saved component snapshots.

| Shared part | Unset paint inheritance |
| --- | --- |
| Button/Badge/Card root; field root/control | No new paint fields here; existing variant/state surfaces, borders and effects remain authoritative. |
| Input label | Parent foreground on the surrounding surface (global canvas in the audit). |
| Switch/Checkbox row and label | Row inherits surrounding ink/surface; label inherits row ink and transparent surface. Control state paint is independent, with transparent fills revealing the row. |
| Field description/error | Muted foreground / danger on the field surroundings; outside the choice row. |
| Card header/title | Header inherits the Card variant ink/surface; Title inherits Header unless styled. |
| Card description | Variant-derived description ink, independent of Header ink; transparent background reveals Header. |
| Card content/footer/icon | Slot elements inherit the Card variant ink/surface; Icon border defaults to currentColor. Legacy shared Content/Footer ink does not enter the nested-component typography scope. Exact slot recipes and local slot typography do, as described below. |
| Text root | Neutral component foreground or semantic on-subtle ink; transparent surrounding surface. Shared root color overrides all tones. |

### Exact component recipes and matrix editing

`ThemeTokens.componentRecipes?: ComponentRecipes` is a second, sparse schema-v3 layer: `{ component: { exactRecipeKey: { part: NodeAppearance } } }`. `component-recipes.ts` is the Studio facade; `components/recipes.ts` owns the catalog/allowlists and `components/recipe-runtime.ts` supplies standalone CSS indirections. It is **not** a new React `recipe` prop. Public props and actual control state select the combination automatically.

The catalog contains **294 exact keys**. Every row below crosses `size = sm | md | lg`; only Badge and Text include a tone segment (`neutral | primary | success | warning | danger | info`). Keys are case-sensitive, use literal dots, and have no partial scopes, aliases or wildcard recipes.

| Component | Exact key format / axis values | Count |
| --- | --- | ---: |
| Button | `variant.size` — primary, secondary, outline, ghost, destructive, link | 18 |
| Input | `state.size` — default, invalid, readonly | 9 |
| Switch | `state.size` — checked, unchecked, invalidChecked, invalidUnchecked | 12 |
| Checkbox | `state.size` — checked, unchecked, invalidChecked, invalidUnchecked | 12 |
| Badge | `variant.tone.size` — solid, subtle, outline | 54 |
| Card | `variant.size` — outlined, elevated, filled | 9 |
| Text | `variant.tone.size` — heading, h1–h6, paragraph, label, caption | 180 |

For example, `primary.sm`, `invalidUnchecked.lg`, `subtle.warning.md`, `filled.lg` and `h2.info.md` are exact keys for their respective components. Input readonly wins over invalid; default hover is an interaction state, **not** another recipe key. Choice recipes follow Base UI's live checked/invalid attributes (indeterminate uses the checked recipe), including controlled/uncontrolled transitions; they are not fixed to insertion `defaultChecked`. Disabled, loading, radius, `as`, label position, copy and error presentation do not create additional recipes. Recipes never own interaction state or replace Base UI semantics.

**System Styles matrix selection** chooses `{ component, recipe, part, target: "frame" | "text" }`. Clicking a frame or its text edits only that exact combination/layer across linked instances, not every component of that kind. Matrix selection is independent of **System Parameters**, which only seeds future built-in insertions; changing insertion props does not select a recipe edit scope or rewrite existing pages/snapshots. Project Parameters and local appearance remain instance-specific.

| Component | Parts and editable targets |
| --- | --- |
| Button, Badge | `root`: Frame; `text`: Text (real inner label, not root icons or Badge dot). |
| Input | `root`: Frame; `label`, `control`, `description`, `error`: Frame + Text. Control is the painted shell; text typography reaches the native input. |
| Switch, Checkbox | `root`, `row`: Frame; `label`, `description`, `error`: Frame + Text; `control`: Frame + ink-only Text (`color`, no fonts). |
| Card | `root`, `header`: Frame; `title`, `description`, `content`, `footer`: Frame + Text; `icon`: Frame + ink-only Text. All use the enclosing Card's key. |
| Text | `root`: Frame + Text. `as` changes semantics, not the recipe. |

Frame and Text share a part record but have **disjoint editable fields**. Frame permits box dimensions, padding/margins, corners, supported layout gaps, background, borderColor/borderWidth, shadow and opacity. Text permits fontSize, fontWeight, lineHeight, letterSpacing, textAlign and color (only color for the ink-only parts). `componentRecipeFields(component, part, target, recipe)` is the authoritative consumed allowlist: do not use the complete appearance catalog. No focus-outline fields exist. Hidden labels keep their visually-hidden geometry; optional messages are only rendered when present.

The recipe-aware layer list and parser exclude unreachable `error` parts: Input `default.*` and valid Switch/Checkbox `checked.*`/`unchecked.*` never render an error without changing their recipe to an invalid state. Input `readonly.*` can render errors because readonly takes precedence over invalid; selecting that optional Error layer reveals its message in the corresponding canvas example without changing insertion parameters. `componentRecipeParts(component, recipe)` returns these exact available parts; omitting the recipe returns the component's full anatomy for runtime indirections.

#### Precedence and Card descendant scope

- Per property on an element: local `appearance` (field `parts.control` over primary appearance) → trusted native `style` → exact recipe → legacy shared part style → the existing component variant/state, global tokens and CSS inheritance. Old shared values, local values and native style callbacks keep their prior behavior. Omitted fields inherit; explicit transparent backgrounds replace the older fill and reveal the actual parent. Recipe surface changes do not regenerate variant-derived ink.
- Button/Badge `text` styles the inner label. Root-local typography/ink still wins there. Root icons and Badge dots keep the root's ink. A Button recipe background is its **resting** fill: hover/active use the variant feedback fills, while recipe label ink and decorative borders persist. Local inline paint retains its existing precedence.
- Default Input hover replaces the recipe resting fill/border color with the hover variant values, but recipe control ink and border width persist. Invalid/readonly use their own recipes. Placeholder ink stays global `mutedForeground`; control `color` does not recolor it. Field root backgrounds surround all parts; a choice row surrounds label/control only, not description/error. Recipe borders/shadows never suppress the global focus outline.
- Card Title inherits Header ink/surface unless overridden. Description uses variant-derived ink independently of Header ink, and its transparent background reveals Header. Content/Footer frames style the slot itself; child surfaces remain independent.
- **Card Content/Footer Text recipes scope all six typography/ink fields to nested Text and Button/Badge labels**, including semantic Text tones, before those children's own exact recipes and shared styles. This is intentional descendant scoping, not ordinary inherited `color`. Legacy `componentStyles.card.content/footer` typography still styles the slot/direct text only and does **not** enter this scope. A nested Card resets the outer scope. Nested Input/Switch/Checkbox are not scoped typography consumers.
- Descendant text precedence: child's local appearance/native typography → slot-local appearance/native typography → enclosing Card slot recipe → child's exact recipe → child's shared/default typography. Each field resolves independently. A nested Button's label may use Card footer ink while still sitting on the Button's own variant/recipe fill, not the footer background. Local colors remain outside the token-only contrast audit.

#### Storage, CSS and Develop

Colors (`background`, `color`, `borderColor`) are theme-specific; geometry, spacing, typography, border widths, opacity and shadow presets are shared across Light/Dark. Import normalizes non-colors from Light, including omissions, while retaining each theme's colors. Older v3 records without recipes keep their values and rendering; empty records prune, and unknown keys/parts/fields and invalid values reject. No coercion, step rounding or silent recoloring. Reset removes the authored field to restore its fallback.

Authored CSS variables use `--{component}-recipe-{kebab-recipe}-{part}-{kebab-field}`, e.g. `--card-recipe-filled-lg-footer-color` and `--checkbox-recipe-invalid-unchecked-lg-control-border-color`. Dots become hyphens and camelCase becomes kebab-case **for CSS variables only**. Runtime active-part, Card descendant-scope and state-selection variables are implementation indirections, not additional tokens. The same applies to conditional box-sizing, min-height, border-style, display, inner-padding and thumb-alignment helpers. An explicitly authored `minHeight` is editable; a generated minimum from `height` is not a second authored field.

Develop's exact-recipe table lists **only authored, metadata-backed consumed fields** in the current theme, with exact key, part, Frame/Text target, CSS declaration, and separate theme-color / shared-geometry / shared-typography / shared-effect labels. It excludes unset values and generated helpers; recipe variables do not appear again in Derived colors. Legacy shared-part fields and insertion Parameters retain separate references. CSS/JSON preserve sparsity; CSS export clears omitted Dark declarations to `initial` as needed so Light's recipe colors cannot leak into Dark.

#### Contrast scope and parent navigation contract

The default audit remains **150 modeled pairs per theme**, not 294 recipes multiplied by sizes/parts. Existing global, variant/state and shared-part diagnostics keep their IDs and targets. Empty recipes, typography/geometry-only edits, opacity and shadow edits do not expand this opaque-color audit. Recipe checks are additive and emitted only when an authored recipe affects the modeled foreground, visible background or painted border width/color. An authored border that is zero-width or transparent is omitted, not called compliant. Width-only edits can add boundaries using inherited color; a border-color-only edit cannot invent a border on a borderless part.

Recipe checks cover enabled normal text (4.5:1), visible marks/boundaries/focus colors (3:1), resting/hover/active Button label paint, Input text/placeholder and default hover, choice labels/helpers/control paint and parent-surface focus, Text tones, and Card slots. The new recipe checks do not add a mark for a hidden unchecked Checkbox indicator. Opaque child fills shield parent changes; transparent surfaces resolve through field/row/Header/slot ancestors to the active theme's canvas. Recipe fields that are masked by a higher-precedence layer do not introduce unrelated pairs.

Card Content and Footer additionally model nested **Text, Button and Badge** paint. Authored child recipes are considered against Card slot surfaces; slot recipe typography overrides child ink but not child surfaces. Equivalent unedited type/size combinations reuse a representative (prefer md/paragraph), rather than repeating all 294 combinations. Unedited Card sizes share an md context when needed for authored child paint. A child's opaque pair independent of the Card is already checked standalone and is not duplicated as a Card check. These are finite composition diagnostics, not a traversal of arbitrary page trees: nested Cards start a new scope, and arbitrary ancestors, field components nested in slots and external components require rendered review.

`ColorCheckTarget` preserves the original global/variant/shared-part contract and adds a recipe branch:

```ts
// Recipe branch returned by colorCheckTargets(check):
{
  selection: "card",
  recipe: "filled.lg",
  part: "footer",
  target: "text", // color => text; background/borderColor => frame
  key: "color"
}
```

Parent navigation must branch on `recipe` **before** the legacy `part` route, switch to System Styles, and set `ComponentRecipeSelection` to `{ component: selection, recipe, part, target }`. Then reveal the relevant collapsed groups and focus:

```text
system-recipe-{selection}-{recipe}-{part}-{target}-{key}
system-recipe-card-filled.lg-footer-text-color
system-recipe-checkbox-invalidUnchecked.lg-control-frame-borderColor
```

Keep dots and camelCase intact in the input ID; use `getElementById` or escape selector punctuation. Do not convert recipe `text` to the legacy shared `root` part. With no recipe, `{ selection, part, key }` still means the shared style control `system-style-{selection}-{part}-{key}`; variant/global routes are unchanged. A transparent surface navigates to its visible parent source. Inherited/derived colors target their actual shared, variant or global source, not a nonexistent recipe override. Nested Card checks may target Card content/footer for ink and Text/Button/Badge for a surface; use the full `(selection, recipe, part, target, variant, key)` identity when comparing navigation actions. `derived` remains a source-view hint. Check IDs are opaque diagnostics identifiers, not a navigation parser.

These diagnostics do **not** certify local appearance/native style, disabled/opacity compositing, arbitrary nested/external backgrounds, shadows or focus geometry. Text uses the normal-text threshold even after typography edits. Decorative-border warnings do not assert that every decorative border has a WCAG requirement. Passing the audit is not a blanket WCAG compliance claim; review actual compositions, focus behavior and both themes.

## 5. Accessibility checklist

- Use the native semantic element (`button`, `input`, `label`) or the Base UI part that renders it. Do not add ARIA that duplicates native semantics.
- Every control has an accessible name:
  - Labelled controls take `label`.
  - `iconOnly` requires `aria-label`, enforced in the type.
- If an element has visible text and an `aria-label`, the `aria-label` must contain the visible text (WCAG 2.5.3, Label in Name).
- Focus is visible via `:focus-visible` with the shared focus ring. Disabled controls are never focus-trapped, and loading controls stay focusable.
- `description` and `error` are linked with `aria-describedby`, and `error` also sets `aria-invalid`. Use Base UI `Field`.
- Follow the matching WAI-ARIA pattern:
  - Single-select button groups use ToggleGroup with `aria-pressed`.
  - View switchers use Tabs.
  - Navigation lists use `aria-current`.
- Do not convey information with color alone. Status dots get text or a visually hidden label.
- Accessibility target: 4.5:1 for normal text and 3:1 where UI-boundary/focus contrast is required. Generated defaults pass 150 modeled pairs per theme in `color-audit.ts`; exact recipes add only affected checks, not an exhaustive all-size count. See [contrast scope and navigation](#contrast-scope-and-parent-navigation-contract) for the finite composition model, inherited sources and exclusions. Existing shared field/row, Card-slot and Text diagnostics remain; legacy shared slot ink does not scope nested component ink, while exact Card Content/Footer recipe typography does. Every painted configured variant/part border is diagnosed against its modeled surrounding/interior surfaces where applicable, including custom borders on normally unbordered variants. Preserved legacy values and arbitrary manual combinations may fail; report them, never silently recolor. Derivatives remain based on their documented variant surfaces; recipe/local fills can make those pairs fail. A passing palette or audit is not a blanket WCAG compliance claim.
- Manual screen-reader and native browser-zoom acceptance is tracked in `docs/accessibility-checklist.md`.
- Respect `prefers-reduced-motion`.

## 6. Checklist for a new component

1. Pick the category in section 2 and implement every required prop.
2. Build on the Base UI part and read its documentation first.
3. Put the component in `app/studio/components/<name>.tsx`, export it from `index.ts`, and add styles to `components.module.css` using tokens only.
4. Add a `ComponentId` and meta if it should appear in the studio, and a specimen in `preview.tsx` that shows every variant, tone, size, radius option and state relevant to that component.
5. Verify keyboard behavior, accessible names and contrast in the running app. Confirm every editable variant/tone token is consumed by CSS and appears with its inheritance source in Develop.
