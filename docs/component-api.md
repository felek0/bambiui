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
| `tone` | `Tone` = `"neutral" \| "primary" \| "success" \| "warning" \| "danger" \| "info"` | `"neutral"` | Semantic color role. Maps 1:1 to global color tokens. |
| `size` | `Size` = `"sm" \| "md" \| "lg"` | `"md"` | The shared size scale. Maps to `controlHeight{Sm,Md,Lg}` and the size scale factors. |
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
| `labelPosition` | `"start" \| "end"` | `"end"` | Label side for inline choice controls. |
| `checked` / `defaultChecked` / `onCheckedChange` | Base UI | — | Controlled and uncontrolled pair for binary controls. |
| `value` / `defaultValue` / `onValueChange` | Base UI | — | Controlled and uncontrolled pair for value controls. |
| `className` | `string` | — | Applied to the root element. |

Do not invent synonyms such as `buttonSize`, `dimension`, `density`, `kind`, `appearance`, `color`, `isDisabled` or `helperText`.

## 2. Required props by category

| Category | Examples | Must support |
| --- | --- | --- |
| Action | Button, IconButton, MenuItem | `variant`, `size`, `disabled`, `loading`, `fullWidth`, `iconOnly`, `startIcon`, `endIcon`, all native button props, `render` (Base UI composition) |
| Text field | Input, Textarea, NumberField, Select trigger | `label`, `hideLabel`, `description`, `error`, `size`, `disabled`, `readOnly`, `required`, `placeholder`, `name`, `value`/`defaultValue`/`onValueChange`, `startIcon`/`endIcon` where applicable, `type` for native inputs |
| Choice | Checkbox, Switch, Radio | `label`, `hideLabel`, `description`, `error`, `size`, `labelPosition`, `disabled`, `readOnly`, `required`, `name`, `value`, `checked`/`defaultChecked`/`onCheckedChange` (Checkbox also supports `indeterminate`) |
| Status | Badge, Tag, Alert, Toast | `variant` (`solid \| subtle \| outline`), `tone`, `size` (for inline statuses), `startIcon` or `dot` |
| Container | Card, Dialog, Popover | `variant` (`outlined \| elevated \| filled` for surfaces), `size` (density), compound parts: `.Header`, `.Title`, `.Description`, `.Content`, `.Footer`, and `.Icon` or `.Media` where relevant |
| Typography | Text | `variant` (`heading \| h1 \| h2 \| h3 \| h4 \| h5 \| h6 \| paragraph \| label \| caption`), `size`, `tone`, `as` (native `h1`–`h6`, `p`, or `span`), `children`, `className`, native HTML attributes |

Current components:

| Component | `variant` | Other props |
| --- | --- | --- |
| Button | `primary`, `secondary`, `outline`, `ghost`, `destructive`, `link` | `size`, `loading`, `disabled`, `fullWidth`, `iconOnly`, `startIcon`, `endIcon` |
| Input | — | `type`, `size`, `label`, `hideLabel`, `description`, `error`, `readOnly`, `disabled`, `required`, `startIcon`, `endIcon` |
| Switch | — | `size`, `label`, `hideLabel`, `description`, `error`, `labelPosition`, `disabled`, `readOnly`, `required` |
| Checkbox | — | Same as Switch, plus `indeterminate` |
| Badge | `solid`, `subtle`, `outline` | `tone`, `size`, `dot`, `startIcon` |
| Card | `outlined`, `elevated`, `filled` | `size`; parts: `Card.Icon`, `Card.Header`, `Card.Title`, `Card.Description`, `Card.Content`, `Card.Footer` |
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

Typography values come from `--ds-typography-{variant}-{font-size,line-height,font-weight,letter-spacing}` for each of `heading`, `h1`–`h6`, `paragraph`, `label`, and `caption`. All ten styles are independently editable and shared between Light and Dark; older v3 records without H1–H6 receive defaults on import. H1–H6 default font sizes descend from 48px to 20px (editor range 8–96px). Font size scales with `--ds-size-scale-sm` and `--ds-size-scale-lg` (`md` is unscaled); line height stays unitless, weight numeric, and letter spacing in px. Neutral text uses `--text-foreground` (inherited from `--ds-foreground` until overridden); other tones use the corresponding `--ds-{tone}-on-subtle` text color for readability on the theme background.

## 3. Modeling rules

1. **Keep axes separate.** Hierarchy (`variant`), semantics (`tone`), dimensions (`size`) and state (`disabled`, `loading`, …) are independent props. Never combine them into one value such as `smallPrimary`, `dangerOutline` or `variant="disabled"`.
2. **No boolean variants.** Use `variant="subtle"`, not `subtle`. Use `size="lg"`, not `large`. Booleans are only for true binary behavior.
3. **State lives in data attributes.** Components expose public API as `data-variant`, `data-tone` and `data-size`. Interaction state uses Base UI attributes (`data-disabled`, `data-invalid`, `data-checked`, `data-pressed`, `data-active`) or native pseudo-classes. Style from those, never from ad-hoc classes such as `.active` or `.is-selected`.
4. **Use composition for structure.** When content has more than one region, use compound parts (`Card.Header`) instead of props like `title` or `footer`. Props are for configuration; children are for content.
5. **Keep the public surface small.** Do not expose internal classes, slot styling props or implementation toggles. Consumers get `className` on the root and the documented props.
6. **Use Base UI first.** Build interactive components on the matching `@base-ui/react` part (see `docs/base-ui.md`) and keep its semantics, keyboard behavior and state attributes.

## 4. Design tokens

- **Theme model** (`app/studio/tokens.ts`): schema v3 stores `themes.light` and `themes.dark` with independent sources, color roles, color scales and component color overrides. All non-color tokens (global shape/spacing/size, component numeric overrides, Text typography, including H1–H6) are shared across themes; edits from either theme update both records. Older v3 drafts with conflicting values use Light non-color values on import; both color palettes are retained. v1/v2 migrate by copying their exact values into both themes.
- **Studio routes**: `/colors` and `/spacing` select the canvas foundations and their global inspectors; `/develop/colors` and `/develop/spacing` provide the corresponding theme-aware CSS references. `/text` and `/develop/text` cover the Text component and shared typography. Design/Develop links preserve the current selection.
- **Global tokens** (`app/studio/tokens.ts`, exported as `--ds-*`):
  - Surfaces: `background`, `foreground`, `muted`, `mutedForeground`, `border`
  - Roles: `primary`, `secondary`, `success`, `warning`, `danger` and `info`, each with an `on*` foreground
  - Shape and spacing: `radius`, `paddingX`, `paddingY`, `gap`, `margin`, `fontSize`, `borderWidth`
  - Size scale: `controlHeightSm`, `controlHeightMd`, `controlHeightLg`
- **Component tokens** (exported as `--{component}-{token}`): `background`, `foreground`, `border`, `radius`, `paddingX`, `paddingY`, `gap`, `margin`, `fontSize`, `borderWidth`. They inherit from the global tokens until overridden. Text's inspector exposes only its consumed `foreground` override and shared typography styles; other Text aliases appear in export but do not drive its rendered styles.
- **Derived roles** (`color-engine.ts`, emitted by `toCSSVariables(theme, mode)`): role hover, active, subtle, on-subtle, outline and focus colors; component-specific Button/Badge derivatives; Card description ink. Link Buttons use `--ds-primary-on-subtle` as readable text rather than assuming the primary fill meets 4.5:1 on a surface. Recomputed from current tokens, including overrides, not from the saved source. Invalid manual pairs are reported rather than silently rewritten.
- **System constants** (not editable, `systemConstants` in `tokens.ts`): state opacity/offset, focus geometry, size/icon scale, spacing insets, elevation and motion. Both preview and CSS export consume the same map.
- No hard-coded colors or sizes in component CSS. Values come from these layers. Variants and tones remap local custom properties (`--button-fill`, `--tone`). Filled Card uses global muted/foreground and a description derived from that surface. Badge neutral outline honors an explicit border override; semantic tones use role outlines.
- CSS export includes both theme selectors, raw color scale stops, and derived/system variables, not component markup or style rules.
- Adding a global token requires updating `TokenValues`, `defaultSystem`, `tokenFields`, the schema migration in `parseDesignSystem`, and `tokens.test.mjs`.

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
- Accessibility target: 4.5:1 for normal text and 3:1 where UI-boundary/focus contrast is required. Generated defaults pass 133 modeled pairs per theme, including neutral and semantic Text tones; `color-audit.ts` checks finite modeled pairs against current CSS variables. Preserved legacy values and arbitrary manual combinations may fail; report them explicitly. No blanket compliance claim from a passing palette or audit. Badge text/outline and filled-card descriptions must use the derivatives for their actual surfaces.
- Manual screen-reader and native browser-zoom acceptance is tracked in `docs/accessibility-checklist.md`.
- Respect `prefers-reduced-motion`.

## 6. Checklist for a new component

1. Pick the category in section 2 and implement every required prop.
2. Build on the Base UI part and read its documentation first.
3. Put the component in `app/studio/components/<name>.tsx`, export it from `index.ts`, and add styles to `components.module.css` using tokens only.
4. Add a `ComponentId` and meta if it should appear in the studio, and a specimen in `preview.tsx` that shows every variant, size and state.
5. Verify keyboard behavior, accessible names and contrast in the running app.
