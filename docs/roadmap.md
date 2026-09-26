# bambiui implementation status

## Product decisions

The studio has one English-only, light editor interface. Design displays one preview at a time. Choose Light or Dark in the header to target manual color editing in Design; the same switch remains available in Develop to inspect either theme's reference. Non-color edits update both themes. There is no editor appearance switch, Compare mode or Scenario context; Develop focuses on code and token references.

The Color builder accepts one brand color. A valid six-digit hex value or preset immediately generates and applies both light and dark global color roles in a single update. Invalid/incomplete input does not change the saved system. Shared numeric values, typography, component overrides and name remain untouched. Existing imported systems with different light/dark sources retain them until a new color is chosen; manual color edits still target the selected theme only.

The studio stores its schema-v3 system locally; v1/v2 migration copies historical values to both themes without recoloring. Both-theme CSS exports include raw scale stops, derived colors and system constants; v3 JSON backups include both theme records. Auth, server persistence and account-based saving remain outside scope. The separate palette CLI still emits raw scales and roles when detailed recipes are needed.

## Implemented capabilities

- Seven components (Button, Input, Switch, Checkbox, Card, Badge, Text) with consistent APIs and interactive Design specimens on a pan/zoom canvas with the selected theme's dotted background. Fit and zoom controls are available on desktop; mobile uses natural page scrolling. Actual Card specimens retain their own tokens. Mounted previews retain demo state when switching views or themes.
- Design-only inspector for 27 global tokens and optional per-component overrides; colors are theme-specific, while numeric and typography tokens are shared. The contrast summary appears outside Shape & spacing, highlighting failed checks; details list modeled color pairs and warnings, including manual color failures. On narrow screens, jump links connect the workspace and inspector without adding tabs.
- OKLCH generation of accessible light/dark usage colors from one source, preserving the source in JSON. A safe light brand source can remain the exact primary fill with dark ink; links use derived accessible text ink. The logo color is the fresh system's source. Generated defaults pass 133 modeled color pairs per theme; manual or legacy values may not.
- Develop view with React examples, props/defaults, live aliases, raw color scales, derived values and full CSS, without a token inspector. Code snippets are project examples, not a standalone component package.
- Export of both-theme CSS (including raw color scales) and JSON backup/import, with v1/v2 migration and v3 round-trip. Import resets the generator input to the imported source; token input drafts remount with the imported system.

## Validation and outstanding acceptance

- Run `npm run build`, `npm run lint`, `node --experimental-strip-types --test app/studio/*.test.mjs` and, after building, `node scripts/studio-smoke.mjs`.
- Smoke tests exercise the single visible theme preview, one-step generation and invalid input, selected-theme color overrides, contrast warnings, view/theme retention, export/import, accessible names and responsive reflow. Optional `--screenshots` writes review images; there is no pixel regression suite. The old localization/appearance/structural-baseline tests are obsolete and have been replaced with checks of the current workflow.
- **Full accessibility acceptance remains open:** Chromium AX inspection and responsive reflow cannot replace VoiceOver and browser-native 200% zoom. Complete the manual checks in `docs/accessibility-checklist.md` before claiming full WCAG conformance.
