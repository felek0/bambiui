# bambiui System-only acceptance session

Status: **not run**. This is a session protocol, not evidence of user or accessibility acceptance.

**Candidate protocol — 2026-10-16:** The first [System-first UI](roadmap.md) candidate is implemented locally and automated System/source/browser checks passed. It has not been deployed or accepted by a human participant. Run this protocol against an identified candidate build; Agent D checked representative controls against the frozen SF0 contract, not every manual environment. An unavailable planned control is blocked/feature pending, not a participant failure or a reason to reopen Project. The [previous Project protocol](studio-acceptance-history-2026-10-16.md) is archived; it also has no observed passes.

**Superseding scope amendment:** This protocol now targets the [user-requested size-based editor policy](system-first-sf0-contract.md#superseding-user-amendment--size-based-editor-write-groups). Implementation and automated checks passed for this amendment: 637 unit/SSR/source tests, 99 System browser checks and 17 System-only checks, including Button/Text grouping and Card historical-value preservation. Source delivery checks also passed with unchanged catalog/registry identities. No participant, VoiceOver or native-zoom session result is claimed; the result table remains Not run.

**Historical split Playground amendment (layout superseded below):** Inspector Preview was replaced with an independent central Playground beside the canonical matrix. Props/content/state changes repaint only its live sample; matrix selection/content and all saved/exported data remain unchanged. Args survive matrix/filter/theme/view/token changes; component/System/import/reload/Reset playground reinitialize them. Apply this lifecycle instead of the original inspector Preview lifecycle. Human results below remain Not run.

**Natural matrix amendment:** Component examples now use native scrolling at real rendered sizes, with sticky filters/selection context, not a zoomable/pannable camera or dotted canvas. Verify that sizes stack readably in a narrow pane; all combinations stay accessible. Matrix and Playground scroll independently. Selecting an offscreen recipe reveals only the matrix; theme/layer/token changes preserve its position. Colors/Shape & spacing retain their Foundation canvas. Include these observations in T01/T03 and A01/A03/A04; no manual pass is implied by automated tests.

**Active task-first workbench amendment:** The central area now shows **Variants or Playground**, never both at once. Right panel is Styles for Variants and grouped temporary Props for Playground. Mode changes preserve matrix selection/filter/scroll and Playground args/actions, without storage/history writes; inactive controls stay outside Tab/AX reading order. Component navigation defaults to Variants. Theme/history/panel access lives in a common toolbar; mobile overlays do not obscure it. Layer selector and supported Frame/Text buttons precede editable styles; the full Layers list and source details are collapsed. Field scope is described accessibly, while accurate group scope remains visible. System import is in the System menu. Develop has Download System JSON next to the CLI commands. The [UX review](studio-ux-review-2026-10-17.md) records the rationale and automated checks; all human results below remain Not run.

## Purpose and safety

Validate that a regular Figma user can distinguish selected-example inspection, selected-size non-color write groups, exact recipe/theme colors, all-combination/all-size defaults and temporary preview content without learning bambiui's implementation. Run the task session before explaining the inspector. Follow with keyboard, VoiceOver and native-zoom checks from [the accessibility checklist](accessibility-checklist.md).

- Use the deployed site or a fresh local static export. Record the URL and build/commit before testing.
- Use a separate browser profile and a disposable system. Do not clear or overwrite a participant's normal browser storage. Systems are browser-local; they are not shared between browser profiles. Project creation is outside this session.
- Export the System before testing existing work. Test legacy Project-data preservation and the read-only recovery download separately with synthetic data; do not use a participant's real data. Raw legacy recovery is not a supported Project restore/import flow.
- Never put npm credentials, personal project data or identifying participant details in the results. Obtain consent before screenshots or recordings.
- Approximate session budget: 30 minutes for tasks, then a separate accessibility pass. Times are observations, not performance guarantees or a universal pass threshold.

## Session record

| Field | Record |
| --- | --- |
| Date / facilitator | Not recorded |
| Participant alias / Figma experience | Not recorded |
| URL / build or commit | Not recorded |
| OS / browser version / device | Not recorded |
| Viewport / native browser zoom | Not recorded |
| Assistive technology and version, if used | Not recorded |
| Disposable system name / imported snapshot ID | Not recorded |
| SF0 contract / candidate readiness | Not recorded |

## Facilitation

Read only the **participant goal** first. Do not reveal the route, control name or expected path. Ask the participant to think aloud. Record the first attempted path, pauses, mistaken edits and questions. If stuck, record the point of failure before providing a hint; completion after a hint is **assisted**, not an unassisted pass.

After each task ask: “What changed, and where else do you expect to see that change?” Compare their answer with the acceptance criteria. Discoverability and correctness are separate results; correct output after coaching does not prove the UI is understandable.

Do not insist on pointer use: Layers and keyboard alternatives are valid. If a required action cannot be reached without a pointer, record it as a blocker for the keyboard pass, not as participant failure.

## Participant tasks

### T01 — Inspect one example and edit its size group

**Participant goal:** “Find the medium outlined Card. Make medium Card titles 19.375px and weight 635 across its surface variants. Keep small and large Cards and other layers unchanged.”

Facilitator checks:
- The participant finds System, the Card matrix and the title layer without changing insertion defaults.
- Selection identifies `outlined.md`, title and text styling; selecting the Card root exposes frame styling instead.
- Title typography changes in outlined/elevated/filled md Card title/text entries in both themes; sm/lg, other fields/layers and standalone Text/Button do not. Controls measure the selected canonical example and label the broader write scope, not a fabricated normalized peer value.
- Fields show effective numeric values, not an unhelpful inherited placeholder.
- The participant predicts the selected-size non-color group correctly and distinguishes it from exact recipe/current-theme colors and the all-size All combinations section. They do not expect a temporary preview edit or the normal CLI `theme` command to live-sync remote applications.
- Repeat on Text `paragraph.neutral.sm`: a typography edit reaches all six paragraph sm tones, not h1/caption or md/lg. On a divergent fixture, inspection alone leaves peers unchanged; only the specific edited/reset field fans out.

### T02 — Independent frame geometry and recovery

**Participant goal:** “For that same Card, set left padding to 23.125px and only the top-left corner to 17.25px. Undo and redo one change, then reset it to its default.”

Facilitator checks:
- Root/frame selection is understandable and distinct from title text selection.
- The two root/frame non-color fields reach all md Card variants in both themes. Other edges/corners, sizes and title typography retain their values.
- Each edit/reset emits one combined `onRecipesChange`; Undo/Redo restores the whole fan-out gesture group, not one recipe at a time. Field reset removes that field over its write group and returns each entry to its own effective fallback, not necessarily zero or identical values.
- For a mixed target reset, non-colors reset across the supported selected-size group while background/color/borderColor reset only on the selected recipe/current theme; unrelated fields/parts/sizes remain. Historical divergent entries remain until that field's explicit edit/reset.
- Looking at values or opening help does not create an edit/history entry.

### T03 — Separate temporary content from saved design

**Participant goal:** “Try a much longer title on your Card without saving new default content. Then return to the original example and check that your typography edits remain.”

Facilitator checks:
- The participant switches to Playground and finds Content in the Props panel, not a Project or insertion-default editor. Switching back to Variants confirms the canonical matrix title never changed.
- Variants/Playground switches preserve the selected matrix layer and temporary sample. Playground axes/content/state are independent of matrix selection. Changing the selected recipe/layer/filter, theme or Design/Develop preserves args; changing component/System, importing, reloading or Reset playground restores saved defaults. Temporary text is clearly distinguished from saved styles.
- T01/T02 typography and geometry remain unchanged; preview actions do not enter token Undo or persist after reload/system switch.
- Exported System JSON and source example still use the saved System/defaults, not session text. The participant understands the distinction; perform exact data comparisons in automated fixtures, not by forcing a user to inspect raw hashes.

### T04 — Error message anatomy

**Participant goal:** “Make an Input show an error above the field with a warning icon. Make medium Input error messages 12.625px wherever an error is supported.”

Facilitator checks:
- Playground owns temporary error content, icon and position. Selecting `invalid.md` error/text writes saved typography into invalid.md and readonly.md in both themes, never default.md. Export is not promised to reproduce temporary props.
- Root, control text, label, description and error selection are distinguishable. The canonical invalid recipe exposes its error layer; preview props must not silently change the inspector's edit recipe.
- Other sizes, normal Input text and unrelated component recipes remain unchanged. Repeat on Switch/Checkbox: error typography reaches only invalidChecked/invalidUnchecked at that size, never valid checked/unchecked entries; unsupported error records are not invented.
- Read-only and disabled are not mistaken for styling-only preview effects.

### T05 — Inspect interaction without changing the system

**Participant goal:** “Try a Button's loading and disabled behavior. Then return to the original component and explain whether you changed your saved design.”

Facilitator checks:
- The participant discovers Playground's supported Loading/Disabled props and understands their temporary state. The older optional per-recipe interaction disclosure remains available separately.
- A real loading action cannot be repeatedly activated and keeps understandable focus; disabled controls do not activate.
- Hover, pressed and keyboard focus can be inspected without confusing the live state with the inspector's selected recipe.
- Reset playground clears temporary interaction data without authoring insertion defaults or tokens. Mode switches preserve each view's state; Props scrolls independently of the live sample. On mobile, Props is reachable from the toolbar and Escape restores its toggle.

### T06 — Themes, persistence and developer handoff

**Participant goal:** “Give your selected Card title a different color in Dark, keeping its size and padding the same in both themes. Save a System backup, import it as a separate system, reload, then find how to use it in an existing React project.”

Facilitator checks:
- Light/Dark title colors are independent and only the selected exact recipe changes; other variants/tones/sizes keep their colors. Geometry/typography remain shared across themes with the selected-size non-color write group. `background`, `color` and `borderColor` all obey exact recipe/current-theme scope.
- Saved System name/values and both themes survive reload. Import as a new System does not replace the original; temporary preview text is not in the backup.
- Existing `componentDefaults` values in an imported fixture remain preserved even though their former insertion editor is not shown. A standalone API's default props are not silently rewritten.
- Develop exposes Download System JSON beside the published CLI instructions and explicit stylesheet/ThemeScope setup, without needing to return to header export. The participant does not mistake the collapsed ZIP fallback for the primary path.
- The participant understands that System JSON stays local and `theme` does not rewrite component code. Running npm commands is optional here and requires a disposable host; credentials never belong in this session record.

## Accessibility pass

Run separately; do not infer these results from the pointer task session.

| ID | Environment and task | Required observation |
| --- | --- | --- |
| A01 | Keyboard only, T01–T04 | Reach matrix/frame and layer alternatives, filters, inspector and preview; identify selection; no keyboard trap; visible focus returns after overlays close. Hidden or filtered examples are not focusable. |
| A02 | VoiceOver + Safari, then Chrome | Announce selected example/layer, selected-size non-color (Text variant retained) versus exact-color/current-theme scope, all-combinations/all-sizes and preview context, actual values/units, invalid drafts and per-field reset actions; hidden panels stay out of reading order. |
| A03 | Native browser 200% zoom | Use the browser's menu to verify 200%, not canvas zoom or viewport emulation. Inspector, Layers, help, errors and floating tools remain reachable without obscured focus. |
| A04 | Real mobile Safari/Chrome | Open/close overlay panels, read long values and scroll Develop. Check native scroll/pinch and increased text size. Touch/pen canvas authoring is not currently claimed. |
| A05 | Keyboard + real form/error controls | Verify names, helper/error associations, checked/mixed/readonly/disabled/loading announcements and focus; test actual submitted values only in a disposable consumer. |
| A06 | Forced colors / non-default themes | Selection, error and focus do not rely on color alone; focus is not clipped or replaced by decorative borders. |

Follow the detailed [accessibility checklist](accessibility-checklist.md) too. CDP accessibility-tree checks, mobile emulation and canvas scaling do not close these manual gates.

## Results and triage

Use **not run**, **pass**, **assisted**, **fail** or **blocked**. Only observed, unassisted completion with correct scope understanding is a task pass. Record actual time; never prefill a pass from automated evidence.

| ID | Result | Time | First path / assistance | Expected vs actual / evidence | Issue |
| --- | --- | --- | --- | --- | --- |
| T01 | Not run | — | — | — | — |
| T02 | Not run | — | — | — | — |
| T03 | Not run | — | — | — | — |
| T04 | Not run | — | — | — | — |
| T05 | Not run | — | — | — | — |
| T06 | Not run | — | — | — | — |
| A01 | Not run | — | — | — | — |
| A02 | Not run (separate Safari/Chrome records) | — | — | — | — |
| A03 | Not run | — | — | — | — |
| A04 | Not run (record actual devices/browsers) | — | — | — | — |
| A05 | Not run | — | — | — | — |
| A06 | Not run | — | — | — | — |

For each issue record the build, task ID, environment, reproduction steps, expected/actual behavior and evidence. Classify:
- **Blocker:** data loss, wrong edit scope, inaccessible essential action, keyboard trap or impossible task. Resolve and rerun the affected task and regressions before acceptance.
- **Major:** completion needs coaching, scope is repeatedly misunderstood, or an essential value/control cannot be found. Keep the relevant product gate open.
- **Minor:** non-blocking wording or visual polish; record owner/follow-up instead of silently dismissing it.

SF2/SF3 use T01/T02; temporary preview and SF4 coverage use T03–T05; System persistence/developer handoff uses T06. SF5 requires the observed task results and applicable A01–A06 passes in the declared environments. SF1 route/legacy-data safety and SF6 Figma authoring have separate acceptance evidence; these tasks do not close them. Agent D verifies task/control names against the implemented candidate before a human session. Retest fixes with a fresh session where practical. One session is evidence for that participant/environment, not universal usability or WCAG conformance. Do not close roadmap gates until results are actually recorded and blockers/major issues are addressed.
