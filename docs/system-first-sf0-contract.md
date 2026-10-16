# bambiui · SF0 implementation contract

Date: 2026-10-16. Status: **frozen for implementation** after Agent D read-only QA baseline review and coordinator approval (2026-10-16). Coordinator owns later interface changes. This is a UI-only contract: no schema/public component/resolver/CLI change.

## Superseding user amendment — size-based editor write groups

**Status: implemented; automated unit/browser verification passed (2026-10-16). Human acceptance remains not run.** This explicit user amendment supersedes the initial exact-only non-color editing/reset expectations in this contract and active acceptance docs. Earlier baseline reviews and test results remain evidence for the earlier candidate only; they are not verification of this amendment.

- Selection remains `{ component, recipe, part, target }`: the inspector measures and displays the selected canonical example, identifies its exact recipe/theme, and separately labels the field's write scope. Inspection, selection, help and unchanged focus/blur never normalize divergent peers or write history/storage.
- A non-color patch applies to the same **component + size + part + target** across all supported variants, states and tones. Text additionally retains its **typographic variant**: `paragraph.sm` typography reaches all six tones, not `h1`, `caption` or other sizes. Geometry, spacing, typography, border widths, opacity and shadow remain shared across Light/Dark.
- Colors are exactly `background`, `color`, `borderColor`: each writes only the selected exact recipe/part/target in the selected theme. A mixed patch is scoped per field, not assigned one blanket scope.
- Fan-out includes only recipes whose existing anatomy/target allowlist supports that field. Input error edits reach `invalid` and `readonly` at the selected size, never `default`; Switch/Checkbox error edits reach only `invalidChecked` and `invalidUnchecked` at that size.
- A field reset removes that field using the same write scope as an edit. Resetting a target containing both color and non-color fields uses each field's scope independently; it preserves unrelated fields, parts, sizes and Text variants. Reset restores each entry's existing fallback, not one frozen computed value.
- Implement this solely as a UI helper fanning out edits/removals into existing schema-v3 exact entries. No size tokens, wildcard records, runtime inheritance, schema migration, CSS/resolver/import changes or public API changes. Historical divergent recipe records remain untouched until that specific field is explicitly edited/reset; opening or importing a System does not unify recipes beyond existing import behavior.
- One `onRecipesChange` call carries the combined result for an edit/reset gesture; fan-out must not create one callback or undo step per recipe. Existing continuous-field history grouping remains in force. Undo/Redo restores the entire gesture group.
- The separate **All combinations** shared section remains broad across **all sizes**; it is not the selected-size write group. Exact declarations still override it through the unchanged cascade.
- Distributed component/pure resolver graphs remain untouched. Production build, catalog/registry freshness and CLI tests passed with unchanged source identities. No version changes or publish. The UI-only helper `recipe-edit-scope.ts` and inspector integration were tested over all seven components' consumed field allowlists. The 99-check System smoke includes real Button six-variant small geometry/shadow/typography, Text six-tone paragraph small typography, exact colors/theme isolation, grouped reset and single-step Undo/Redo. The 17-check System-only smoke verifies Card medium grouping and preservation of historical divergent records until edit. Full app suite: 637 tests. This does not close manual acceptance.

## Superseding user amendment — independent split Playground

This amendment supersedes the original inspector Preview wiring and **session sample defaults** lifecycle column below. The earlier interface description is retained as historical integration context, not the active Studio contract. The size-based write policy above is unchanged.

- Desktop component workspace is a 50/50 split: canonical variant/state/tone/size matrix and a separate Storybook-style Playground. Narrow screens stack them; Foundations stay full width. History/theme/camera tools belong to the matrix pane. Playground has its own scrolling and is outside camera pointer/wheel handling.
- Matrix always receives saved `system.componentDefaults`; Playground owns detached ephemeral args. Neither edits nor reset of those args affect matrix DOM, selection, tokens, saved defaults, history, storage or CSS/JSON/source ZIP/CLI output. Both previews consume current System tokens and the selected theme.
- Active `SystemComponentEditor` uses `showPreview={false}`: style controls only, no duplicate Preview tab. Optional legacy inspector Preview props remain for internal compatibility/tests, without active Studio state/write wiring. `Preview` no longer accepts session `previewDefaults`.
- Playground exposes every supported public variant/size/tone and metadata-backed scalar/content/state option for all seven components. Value and Checked edit controlled live state, replacing duplicate defaultValue/defaultChecked controls. Safe fixed icon presets and populated Card slots are supported. Arbitrary JSX/styles, executable callbacks/render functions and names are not editable; no public API/token/schema is added. Submit is prevented; reset clears action count and remounts native form state.

| Event | Playground args | Matrix/inspector |
| --- | --- | --- |
| Component/System change, import, reload | Initialize from saved component defaults; clear actions/native state | Existing selection/draft lifecycle remains |
| Matrix recipe/part/target/filter or contrast navigation within component | Preserve | Existing exact selection/filter/draft guards remain |
| Theme or Design/Develop | Preserve | Existing theme/view draft discard remains |
| Token edits, Undo/Redo, component-style reset | Preserve; repaint with live tokens | Existing scoped writes/history remain |
| Reset playground | Restore latest saved defaults; clear actions/native state | No change or writes |

The per-recipe **Test interaction states** disclosures remain separate legacy sandboxes with their documented close/recipe reset behavior; they are not the independent Playground lifecycle. Human usability, VoiceOver and native zoom acceptance remain open.

## Routes and shell

- `/` and `/colors`: System Design / Colors. Existing `/spacing`, seven component Design routes and Develop routes remain.
- `/pages` and `/pages/`: a single suspended screen, heading **Project editing is paused**, link **Open design system**, explicit button **Download local recovery data** and accessible status/error output. No Studio/composer behind it.
- `/examples/page-editor`: same suspended authoring policy. Existing page-editor unit/model storage modules remain.
- Unknown paths keep static not-found behavior; suspension is not a catch-all. No environment/query public bypass.
- `(workspace)/layout.tsx` currently mounts Studio before children; implementation must avoid double/hidden mounts. Route ownership A decides a minimal static-export-compatible boundary; no server runtime redirect.

## Existing state and frozen integration interfaces

`ComponentRecipeSelection = { component, recipe, part, target: "frame" | "text" }` remains authoritative. Counts: button 18, input 9, switch 12, checkbox 12, badge 54, card 9, text 180.

Keep existing style callbacks and data attributes for exact controls; their selection identity is not the non-color write-group identity (see the superseding amendment). No inferred/implicit md selection when selection is null.

**Inspector (B) adds optional props to SystemComponentEditorProps:**
- `previewDefaults?: ComponentDefaults`: full effective session sample defaults, separate from persisted `defaults`. Undefined means use saved defaults.
- `onPreviewDefaultsChange?: (next: ComponentDefaults | undefined) => void`: session-only update/reset, never System mutation.
- `ComponentEditorTab` becomes `"styles" | "preview"`. Remove the insertion-default UI path; existing `onDefaultsChange` may remain optional/deprecated for source compatibility during integration but is never called from active UI. A removes its saved-write wiring.
- Preview controls expose content, supported icons/error position/field sample props, not variant/size/tone/radius/geometry controls competing with the matrix. They can use existing metadata/strict parsing internally, but parse results go only to session callback.

**Matrix (C) adds optional `onClearSelection?: () => void`.** Existing `component/defaults/selection/onSelect` props remain. Matrix `defaults` is already the effective sample set supplied by A through Preview. Do not add another session store or write defaults. If a local filter hides the selection, call clear once and disable hidden-target editing; empty results show Clear filters. Externally selected contrast/layer target resets incompatible filters so it becomes visible.

**Preview parent (A):** add optional `previewDefaults?: ComponentDefaults`, `onClearRecipeSelection?: () => void`; pass `defaults={previewDefaults ?? system.componentDefaults}` and clear callback into ComponentMatrix. Preview-only defaults never enter `system` or exported snapshot. A owns Studio state + Preview parent wiring; B/C do not edit those files.

B owns interaction-preview internals if changes are necessary; C consumes its existing defaults prop. A owns parent data flow and Develop copy. Types/helper modules in the distributed graph are not changed.

## Selection, sample and draft lifecycle

| Event | Exact selection / filter | Session sample defaults | Pending field draft |
| --- | --- | --- | --- |
| Fresh/reload | No exact selection; all combinations | Undefined (saved sample defaults) | None |
| Component or System switch, import replacement | Clear selection; reset local filters | Clear | Discard on outgoing target; never apply to new target |
| Different exact recipe | New explicit selection | Clear | Discard on outgoing target; never apply to new target |
| Different part/target in same recipe | Explicit new layer | Preserve | Discard on outgoing target |
| Theme switch | Preserve valid selection/filter | Preserve | Discard outgoing theme draft; committed shared geometry remains |
| Design/Develop | Preserve selection | Preserve during same session | Discard on outgoing view |
| Filter hides selection | Clear selection; no new default target | Clear | Discard; no hidden-target write |
| External contrast target | Clear incompatible filters; reveal target | Clear if recipe changes | Discard old target draft |
| Reset/close preview | Selection/style edits unchanged | Clear session changes; interaction local state resets | Preview drafts discarded |
| Valid Enter or ordinary blur within same target | No selection change | As edited only for preview controls | Existing commit/no-op validation applies |
| Invalid Enter/blur in same target | Stay same target, associated error | Unchanged | Retain invalid draft until corrected/Escape/reset |

The event ordering matters: a pointer action changing target must not commit an outgoing draft to a newly selected target. B guards callback/target scope and keys fields by selection; A keys context/remount for theme/system/view and C prevents hidden-target edits. No automatic normalization/rounding. Existing native input undo/composition remains.

## Card pilot presentation

- Exact selection header shows component / actual axes / part / frame or text, plus selected-example measurement and per-field write scope: exact recipe/current theme for colors; selected size across supported variants/states/tones and Both themes for non-colors, retaining Text variant.
- Null selection: “Select a component layer” explanation; shared/base controls remain explicitly collapsed, not an implicit exact editor.
- Frame groups use existing field allowlist: layout/size, padding/margin, corners, surface/border/shadow as applicable. Text: typography, text color and genuinely consumed geometry where supported.
- All-combination/shared and base/variant defaults remain separate collapsed areas; no loss of editable supported tokens. Existing effective values, help, units, independent-edge linking, reset and history maintained.
- Card nested Content/Footer text edits Card recipe, not standalone Text/Button. Button exact parts remain root/text; no icon recipe invented.
- Keyboard example selector then inspector layer buttons remains a valid route; matrix bodies are noninteractive design hit targets. Real interactive conditions remain in optional interaction preview.

## Legacy Project reference and recovery boundary

Read-only adapter does not instantiate composer. Reads happen after hydration, on relevant storage events/focus and immediately before and after deletion confirmation, not full-document parsing each render.

- Registered index/documents, missing/malformed/future records and I/O failures: fail closed for system deletion. Inspect own document-prefix keys too: any orphan/partial key conservatively blocks deletion until separately recovered; do not infer absence from an empty index.
- Valid unrelated stored projects do not prevent deletion of an unreferenced System. At least one System remains per existing UI policy.
- Another open authoring tab's unsaved memory/history cannot be read; checks are best-effort localStorage evidence, not a transaction. Tell users to export unsaved work in old tabs before reloading. No automatic close/delete/rebind.
- System storage authoritative key `bambiui.systems.v1`, mirror `bambiui.design-system.v1`; normal System edits may write these, but never Project keys. New adapter/recovery never writes any storage.

**Recovery allowlist:** exact composer index `bambiui.composer.projects.v1`, all `bambiui.composer.document.v1.<nonempty suffix>` keys, legacy page-editor `bambiui.examples.page-editor.bundle.v1`, exact System collection/mirror keys above. No fuzzy prefix matching or unrelated app keys.

**Raw recovery envelope:** `{ format: "bambiui.local-recovery", version: 1, records: [{ key: string, raw: string }] }`; deterministic key sort. This is an explicit raw export artifact, not a supported import or portable Project bundle. Preserve raw strings, including malformed JSON/Unicode/whitespace. Filename `bambiui-local-recovery.json`. No upload and no automatic download/read aggregation before explicit action (reference-check reads are separate).

Limits: at most 1005 allowlisted records; at most 8 MiB combined UTF-8 key + raw bytes per record; at most 64 MiB serialized recovery JSON, with conservative prechecks before allocation. Enumeration/key/getItem errors, vanished keys or changed observed values fail the export instead of silently omitting records. No multi-key atomicity claim; recheck captured records/key set before serializing. Error gives retry without clearing records. No records: report explicitly, do not label an empty capture a complete backup. Export all stored System records because broken Project JSON cannot reliably identify links.

Deletion block messages never suggest an unavailable Project rebind action. Offer duplicate/export System as a safe alternative; no recovery delete/reset button.

## Validated deletion-confirmation amendment

The initial native `window.confirm` implementation failed the real same-origin second-tab test: a document rebind written while the native modal was open was not observed before deletion. Adding a single deferred task did not fix the browser test. Only System deletion now uses a controlled Base UI dialog; import/reset confirmations retain their existing behavior.

- Trigger: **Delete current system**, `[data-system-delete-trigger]`.
- Dialog: **Delete system?**, `#system-delete-dialog[data-system-delete-dialog]`, role dialog; description identifies the System and irreversible action.
- **Cancel** or Escape closes without writes and returns focus to the System summary.
- **Delete system**, `[data-system-delete-confirm]`, rechecks current references and request/collection identity before saving; repeated accept commits once.
- Storage/focus updates remain active while open. A new linked Project blocks acceptance and announces `[data-system-delete-status]` as an alert; both Systems remain. No auto-delete after a blocking reference changes.
- The real two-tab scenario, unrelated-System positive delete, Cancel/Escape/focus and repeated acceptance passed in the new 17-check System-only smoke. This remains a best-effort observation boundary, not an atomic multi-tab transaction.

## Ownership and rollout

A: routes/layout/Studio/Preview/Develop/read-only adapter/recovery/persistence; B: inspector and interaction-preview; C: matrix; D: new System-only browser smoke/legacy coverage adaptation; E: Figma documentation. Pure component/model/source contracts untouched.

D reviewed the draft against legacy script dependencies and fixtures; no blocking contradictions found. Pointer target changes must discard an outgoing draft before its blur, including avoiding an old-target commit. A/SF1, B/SF2 and C/SF3 can now run in parallel with disjoint write sets; A integrates, D validates serially against a stable build. No publish/commit/deploy. Existing staged planning changes belong to the user and are not reverted.

System data safety regressions are rollout blockers. Legacy authoring browser scripts become explicitly dormant after route suspension; model/unit tests remain. New System-only smoke must cover root, routes, single shell, keyboard/mobile, Project raw-byte preservation, recovery/privacy/errors, reference fail-closed and deletion recheck. Exact/filter/draft/preview parity is verified once B/C integrate. All human acceptance remains not run.
