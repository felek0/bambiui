# bambiui System / Project acceptance session

Status: **not run**. This is a session protocol, not evidence of user or accessibility acceptance.

## Purpose and safety

Validate that a regular Figma user can distinguish shared component styling from project-instance parameters without learning bambiui's implementation. Run the task session before explaining the inspector. Follow with keyboard, VoiceOver and native-zoom checks from [the accessibility checklist](accessibility-checklist.md).

- Use the deployed site or a fresh local static export. Record the URL and build/commit before testing.
- Use a separate browser profile and a disposable system/project. Do not clear or overwrite a participant's normal browser storage. Systems and projects are browser-local; they are not shared between browser profiles.
- If testing existing work, export both System and Project JSON before starting. Project JSON alone is not a portable backup of its linked System.
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
| Disposable system / project names | Not recorded |

## Facilitation

Read only the **participant goal** first. Do not reveal the route, control name or expected path. Ask the participant to think aloud. Record the first attempted path, pauses, mistaken edits and questions. If stuck, record the point of failure before providing a hint; completion after a hint is **assisted**, not an unassisted pass.

After each task ask: “What changed, and where else do you expect to see that change?” Compare their answer with the acceptance criteria. Discoverability and correctness are separate results; correct output after coaching does not prove the UI is understandable.

Do not insist on pointer use: Layers and keyboard alternatives are valid. If a required action cannot be reached without a pointer, record it as a blocker for the keyboard pass, not as participant failure.

## Participant tasks

### T01 — Find and edit one combination

**Participant goal:** “Find the medium outlined Card. Change only its title to 19.375px and weight 635. Keep the other Card sizes and variants unchanged.”

Facilitator checks:
- The participant finds System, the Card matrix and the title layer without changing insertion defaults.
- Selection identifies `outlined.md`, title and text styling; selecting the Card root exposes frame styling instead.
- Only this exact title combination changes; other sizes/variants and standalone Text/Button recipes do not.
- Fields show effective numeric values, not an unhelpful inherited placeholder.
- The participant correctly predicts the effect on matching linked-project instances.

### T02 — Independent frame geometry and recovery

**Participant goal:** “For that same Card, set left padding to 23.125px and only the top-left corner to 17.25px. Undo and redo one change, then reset it to its default.”

Facilitator checks:
- Root/frame selection is understandable and distinct from title text selection.
- Other edges/corners retain their values; title typography stays intact.
- Undo/Redo and reset produce the expected visible result. Reset is explained as returning to the effective default, not necessarily zero.
- Looking at values or opening help does not create an edit/history entry.

### T03 — Separate component styling from instance content

**Participant goal:** “Create a project linked to your system, add a mobile frame and a ready-to-use Card. Give its title your own wording without changing the design of all Cards.”

Facilitator checks:
- The participant can create/open a project, select its system, add a page/frame and insert a populated Card.
- Project parameters edit local content/options, while System owns shared component styling.
- Use an `outlined` / `md` instance to compare T01; if insertion defaults differ, choose those axes through Project parameters.
- Local title copy changes; the System insertion default and other instances' copy do not.
- A subsequent System title style edit reaches the matching linked instance, but not other combinations. Use a newly inserted instance so historical local style overrides cannot mask the test.

### T04 — Error message anatomy

**Participant goal:** “Make an Input show an error above the field with a warning icon. Make only the medium invalid Input's error message 12.625px.”

Facilitator checks:
- Project parameters own error content, icon and position; System `invalid.md` error text owns typography.
- Root, control text, label, description and error selection are distinguishable. Label/error clicks in Project select the owning Input.
- Other sizes, normal Input text and unrelated component recipes remain unchanged.
- Read-only and disabled are not mistaken for styling-only preview effects.

### T05 — Inspect interaction without changing the system

**Participant goal:** “Try a Button's loading and disabled behavior. Then return to the original component and explain whether you changed your saved design.”

Facilitator checks:
- The participant discovers the optional interaction preview and understands its temporary state.
- A real loading action cannot be repeatedly activated and keeps understandable focus; disabled controls do not activate.
- Hover, pressed and keyboard focus can be inspected without confusing the live state with the inspector's selected recipe.
- Closing/resetting the preview clears temporary interaction data without authoring insertion defaults or tokens.

### T06 — Themes, persistence and developer handoff

**Participant goal:** “Give your selected Card title a different color in Dark, keeping its size and padding the same in both themes. Reload, then find how to use this system in an existing React project.”

Facilitator checks:
- Light/Dark title colors are independent; geometry/typography remain shared.
- Project content, linked system and authored values survive reload in this profile.
- Develop exposes the published CLI instructions, System JSON export and explicit stylesheet/ThemeScope setup. The participant does not mistake the collapsed ZIP fallback for the primary path.
- The participant understands that System JSON stays local and `theme` does not rewrite component code. Running npm commands is optional here and requires a disposable host; credentials never belong in this session record.

## Accessibility pass

Run separately; do not infer these results from the pointer task session.

| ID | Environment and task | Required observation |
| --- | --- | --- |
| A01 | Keyboard only, T01–T04 | Reach matrix/layer alternatives, inspector and frame insertion; identify selection; no keyboard trap; visible focus returns after overlays close. |
| A02 | VoiceOver + Safari, then Chrome | Announce System/Project context, exact combination/layer, actual values/units, invalid drafts and reset actions; hidden panels stay out of reading order. |
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
| A01–A06 | Not run (record each environment separately) | — | — | — | — |

For each issue record the build, task ID, environment, reproduction steps, expected/actual behavior and evidence. Classify:
- **Blocker:** data loss, wrong edit scope, inaccessible essential action, keyboard trap or impossible task. Resolve and rerun the affected task and regressions before acceptance.
- **Major:** completion needs coaching, scope is repeatedly misunderstood, or an essential value/control cannot be found. Keep the relevant product gate open.
- **Minor:** non-blocking wording or visual polish; record owner/follow-up instead of silently dismissing it.

M1 S01–S03 require T01–T05 and the applicable accessibility passes; CLI handoff acceptance also needs T06. Retest fixes with a fresh session where practical. One session is evidence for that participant/environment, not universal usability or WCAG conformance. Do not close roadmap gates until results are actually recorded and blockers/major issues are addressed.
