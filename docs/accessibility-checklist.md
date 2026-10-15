# bambiui accessibility acceptance

## Scope

**Target scope (2026-10-16):** [The System-first roadmap](roadmap.md) suspends Project authoring. Manual checks below target the planned candidate, not a claim that the new UI is shipped. Agent D validates control names and availability against the SF0 contract and candidate build before testing. A feature not implemented is blocked/not run; do not reopen Project to satisfy an old task.

Acceptance covers **System exact-combination/layer editing, session-only preview and developer handoff**, not only component specimens. Start with [the task-session protocol](studio-acceptance.md): six participant tasks, separate keyboard/VoiceOver/native-zoom passes, environment records and issue triage. All manual results are still **not run**. Use disposable browser data. Legacy Project read-only recovery/data retention has a separate synthetic-data test; Project authoring is not a requirement.

The detailed specimen checks below remain relevant, but the dated 20-route/125-test baseline is historical evidence, not a description of today's whole application. For the new candidate `/` must open System and `/pages[/]` must not expose authoring; SF1 owns those route checks. Source SSR checks, static builds, Chromium emulation and accessibility-tree assertions do not prove assistive-technology behavior or complete visual/HTML-semantic parity. See [the roadmap](roadmap.md) for current phase gates.

## System-only candidate automated evidence · 2026-10-16

- First local candidate: 615 unit/SSR/source, 17 System-only browser, 97 System smoke and 7 source/CLI browser scenario groups passed. Representative Card exact typography, outgoing pointer-draft discard, filter-hidden selection clear and session-preview CSS/JSON/ZIP isolation were observed.
- Controlled System deletion dialog: Cancel/Escape/focus, repeated accept, valid unrelated reference and a real same-origin second-tab rebind while the dialog is open passed. Legacy recovery/download/privacy/error checks passed without authoring or storage writes.
- These are automated Chromium checks, not actual VoiceOver, native 200% zoom, IME or participant results. Human records below remain unchecked. Full details and outstanding storage/performance scope are in the roadmap.

## Pre-transition automated evidence and its limits

- Workspace: 23 checks cover Project/page/frame creation, exact Card/Input layer recipes, instance versus insertion-default isolation, history, themes, snapshots and export/reload. Browser process cleanup has five regression tests; three full runs exited cleanly after the cleanup fix. This is not evidence of human discoverability or screen-reader acceptance.
- `npm run check:cli:clean` uses public npm `bambiui@0.2.1` and the production registry in an isolated host with fresh npm dependencies. React/Vite and then Next builds/browser checks cover Light/Dark, layer typography, fractional edges/corners, Input errors, choice controls and narrow reflow. This is not a full accessibility audit.
- Current results and exact command scope are recorded in [the roadmap](roadmap.md) and [CLI evidence](cli-registry.md). Do not substitute a historical run or another fixture for the environment under review.

### Specimen coverage and historical baseline

- Unit tests check inheritance, migration, generated contrast, derived roles and finite color-audit pairs. The default light/dark palettes pass 150 modeled pairs per theme at 4.5:1 normal-text and 3:1 non-text thresholds, including Input, Switch and Checkbox states; configured visible borders are audited. Manual overrides and imports can fail and are reported.
- `node scripts/studio-smoke.mjs --screenshots` runs against the static export after `npm run build`, using Chromium/CDP and a disposable browser profile. Captures are written to `.next/color-review/`; screenshot capture alone is not visual acceptance.
- Studio route checks directly open these 20 URLs: `/`, `/develop`, and both `/<id>` and `/develop/<id>` for `colors`, `spacing`, `button`, `input`, `card`, `badge`, `switch`, `checkbox`, and `text`. They check real navigation links with `aria-current="page"`, headings, selected inspector fields, header Design/Develop selection, the absence of breadcrumbs and browser Back/Forward.
- Persistent-layout checks compare DOM identity and retain the same button count and input value across theme changes and client navigation. One theme pane contains six standalone component specimens, one Text specimen integrated with the Text foundation, and the Colors and Shape & Spacing areas; Text is not duplicated on the canvas; switching Light/Dark changes tokens rather than creating independent demo state.
- Canvas smoke checks target a transformed, non-scrollable desktop camera: viewport width/height without native scrollbars, route-selection camera animation (instant with reduced motion), Fit, Reset zoom, zoom in/out, unbounded empty-background pointer dragging, wheel panning, Shift+wheel horizontal panning, Ctrl/⌘+wheel pointer-anchored zoom, focused-canvas arrow panning and interactive specimen controls. On desktop, Ctrl/⌘+wheel **over the canvas** is intentionally consumed for canvas zoom, so that gesture does not zoom the browser there. Elsewhere, browser zoom remains available. This is limited keyboard coverage, not a complete keyboard accessibility audit. Canvas scaling is not browser zoom.
- A separate `node scripts/check-checkbox-server.mjs` fixture builds a Server Component that renders Checkbox directly and checks static markup and client-reference wiring. It does not execute browser hydration or a screen reader.
- Specimen behavior checks exercise readonly Switch/Checkbox with pointer and keyboard, required email validation, invalid checked/unchecked and disabled states, large Card/Checkbox, Badge icon, Text tones and an interactive loading Button with a real callback. The expandable controlled form additionally checks Input/Switch/Checkbox state, required constraints and native `FormData`; submission stays local. These do not replace consuming-app integration or assistive technology testing.
- Develop checks cover separation from the hidden canvas/inspector, copying React usage to the browser clipboard and selected-theme token references, including CSS-consumed variant/state colors and shared effects. Color checks retain both-theme preset application, override/geometry preservation, invalid input rejection, contrast warnings, CSS/JSON export, JSON import and reload persistence. Foundation checks cover the live color-scale swatch, visual examples of all ten shape/spacing/sizing values in both themes and H1–H6 plus legacy typography in the single Text area, their dedicated Develop references, exported CSS and reload persistence; color edits remain theme-specific while typography and geometry edits synchronize across themes. Old v3 JSON files without the optional foundation fields still import.
- At a 375px emulated viewport, checks exercise all seven components and both token foundation navigation targets in Design and Develop, page-width and header-control overflow, inspector/preview focus links, header theme selection and selected accessible names. Mobile emulation additionally checks document scrolling, touch-action and that canvas touchmove is not canceled. These checks do not prove native mobile pinch-to-zoom or a real touch-scrolling session. CDP accessibility-tree assertions are not a screen-reader session; viewport emulation is not browser-native zoom.

Automated validation (2026-09-29): production build, lint, TypeScript no-emit check, 125 unit tests (including snippet type-checks) and static-export Chromium smoke passed across all 20 routes. Coverage includes component state color/border/shadow editing, Light/Dark scope, CSS/JSON export, undo/redo, contrast navigation and Develop references, as well as expanded readonly/required/error specimens, controlled forms and interactive loading behavior. Screenshots were captured but not visually reviewed in this pass; this is not full visual or pixel-regression acceptance. Manual gates below remain outstanding; automated success does not close them.

## Manual acceptance still required

Record browser/OS, build, assistive technology, scenario, result and issues using [the session record](studio-acceptance.md#session-record) before closing this gate. Keep **not run** distinct from **pass** and record assisted completion explicitly.

### System editing and preview scope

- [ ] Reach `outlined.md / Card.Title` without a pointer through available navigation/layer controls; understand selection, effective values and whether an edit affects one recipe or all combinations.
- [ ] Switch root/text selection, edit independent padding/corners and title typography, and operate reset/Undo/Redo without losing focus or changing unrelated layers.
- [ ] Reach exact invalid Input error styling, field help and validation feedback by keyboard and VoiceOver; associate announcements with the owning control.
- [ ] Change temporary example content without authoring insertion defaults; reset/close/reload follow the documented preview lifecycle. Saved style edits remain; transient content is excluded from exports.
- [ ] Operate component/layer selection, matrix filters, panel toggles and Design/Develop navigation; overlays dismiss on Escape and return focus appropriately. Hidden/filtered examples have no tabbable descendants. No essential task depends on dragging alone.
- [ ] Switch component/theme/system or filter with a pending valid/invalid field draft. The old draft never lands on a new target; validation/reset behavior and focus remain understandable.
- [ ] From a contrast issue, reach the exact layer/control even when a matrix filter previously hid it. Foundations, shared/base controls and effective value sources remain reachable.
- [ ] Inspect temporary interaction states without mistaking them for saved token/default edits. Selected recipe, live state and theme remain understandable.

### VoiceOver with Safari and Chrome

- [ ] Navigate landmarks and headings. Skip-to-workspace reaches main; the hidden workspace panel and the inspector in Develop are absent from reading order. There is only one theme pane, not an inactive second preview.
- [ ] Component and Design/Develop navigation announce links and the current page, not tabs. Tab reaches each link and Enter navigates. Verify all seven component targets, direct opening, Back/Forward, focus placement and route-change announcements.
- [ ] Light and Dark theme controls announce their selected state in Design and Develop and identify the inspector's editing target in Design. Preview persistence/reset follows the SF0 lifecycle table; do not assume it persists across every route or System switch.
- [ ] Explore all seven component matrices, optional interaction previews and the Colors and Text foundation areas. Canvas help, zoom output, Fit and Reset zoom are understandable; focused-canvas arrow panning and zoom controls provide alternatives to pointer dragging. Interactive specimen controls do not initiate panning; check text selection separately in real browsers.
- [ ] Develop usage, prop references, token tables and local scroll regions are readable and keyboard reachable; Copy React code announces success or failure without moving focus unexpectedly.
- [ ] In the live preview/consumer, Input labels, helper text, required state and errors are announced. Read-only controls stay focusable; disabled controls cannot activate. The design matrix's noninteractive hit targets instead have keyboard-accessible frame/layer selectors; they need not masquerade as live form inputs.
- [ ] Switch/Checkbox names and checked/mixed states are announced; decorative icons do not duplicate names.
- [ ] Busy buttons remain focusable and cannot activate. The studio's interactive Save changes specimen has an action handler and automated focus/repeat-activation checks; also verify its announcements with VoiceOver and in a consuming app.
- [ ] Contrast warnings and import/copy feedback announce meaningful changes without excessive interruption.
- [ ] Export dialog announces title and description, contains focus, closes on Escape and restores focus to its trigger.

### Native zoom and layout

- [ ] Use actual browser 200% zoom (not canvas zoom). All controls remain reachable and readable without obscured keyboard focus. On desktop, verify browser zoom still works via browser controls, keyboard shortcuts and Ctrl/⌘+wheel outside the canvas; Ctrl/⌘+wheel on the canvas intentionally zooms the canvas instead.
- [ ] Check the full-bleed Design canvas in both Light and Dark at desktop and mobile viewport widths, including the floating zoom controls, and check Develop. There is no desktop/mobile preview toggle. Local code/table scrolling is expected; page-wide horizontal scrolling is not.
- [ ] Check mobile Safari/Chrome at 375px and increased system text size, including native document touch scrolling and pinch-to-zoom (neither should be intercepted by the canvas), all seven component navigation links in both views, Edit tokens / Back to preview focus navigation in Design, the inspector, expanded Color builder and export dialog.

### Color and interaction review

- [ ] Verify focus visibility in Safari/Chrome on non-default backgrounds and near container edges.
- [ ] Test forced-colors/high-contrast settings; state is not conveyed by color alone.
- [ ] In the Color scales editor, use only the keyboard to reach each role and stop (50–1000), edit and reset overrides, and verify the role, stop, current value and invalid input feedback are announced. Check the live swatch and Develop ramp table in both themes; swatch color alone must not convey the value or selection. Review contrast of text on custom swatches, including invalid or low-contrast overrides.
- [ ] In the Typography editor, reach heading, paragraph, label and caption fields by keyboard; verify variant, property, unit, bounds and validation feedback are announced. Edit heading font size and check Text preview, exported CSS and Develop reference at normal and 200% browser zoom, with long text, increased system text size and reflow. Text visual variant must not imply heading semantics: check the actual heading level and reading order; a visual label must not replace an associated form label.
- [ ] Review imported/custom values separately; old v3 saves without foundation fields still import, migration preserves legacy colors, and applying generated colors preserves component overrides. Check light/dark independence after edits and reload.

Manual VoiceOver sessions, real 200% browser zoom, desktop modified-wheel behavior in real browsers, and mobile native scroll/pinch-to-zoom have not been completed. No WCAG conformance claim is made.
