<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Naming

- The product name is always written `bambiui`: one word, all lowercase, in UI copy, metadata, docs, comments and commit messages. Never write `Bambi UI`, `BambiUI` or `Bambi`.
- In code identifiers, follow the language's conventions (`BrandMark`, `bambiui.design-system.v1`).

## Base UI

- Read `docs/base-ui.md` before implementing or modifying Base UI components.
- Treat that project-local reference and its linked official documentation as authoritative over prior knowledge.
- Use only the current `@base-ui/react` package name and documented subpath imports.

## Component API

- Read `docs/component-api.md` before creating or modifying a component in `app/studio/components/`.
- Every component implements the full prop set for its category (`variant`, `size`, `tone`, states, content props) with the shared names and defaults defined there.

## Theme and component token invariants

- Schema v3 retains Light and Dark theme records. Global colors and component variant/state color overrides may differ by theme; shape, spacing, sizing, typography, component geometry, variant border widths and shadow presets are shared. Keep edits, undo/redo, reset, import normalization, previews, contrast checks and CSS/JSON export consistent with this invariant.
- Every public component `variant` and `tone` combination that paints a distinct surface must have an explicit documented inheritance path and, where appropriate, an editable component-level color override. Global semantic roles are defaults, not hardwired limitations: Button secondary/destructive, Badge semantic tone/variant, and Card surface variants must resolve through component CSS variables so local overrides can differ from globals. Input `default/hover/invalid/readonly` and Switch/Checkbox `checked/unchecked/invalidChecked/invalidUnchecked` styles must likewise resolve through explicit state entries.
- A token may be exposed in the inspector, CSS/JSON reference, or Develop view only if the rendered component consumes it. Conversely, every design-relevant variant/state color, border width, outline or shadow that users are expected to customize must have a typed token, inspector control, CSS consumer, reset/import/export behavior, contrast coverage where applicable, and test.
- `radius` is the legacy medium value and compatibility alias. `radiusSm`, `radius`/`radiusMd`, and `radiusLg` form one shared global scale. Shape-bearing components may accept `radius="sm" | "md" | "lg"`; the prop resolves to those shared values. Preserve old numeric component radius overrides when the prop is omitted.
- Keep accessible focus outlines separate from decorative variant borders. Focus geometry and focus contrast remain globally accessible; component variant borders and shadows may be customized without suppressing focus indicators.
- When extending schema v3, accept older records, apply deterministic defaults without recoloring or changing existing values, reject unknown keys and invalid values, and normalize shared non-color data from Light. Avoid silent rounding/migration of historical component overrides.
- Update `docs/component-api.md`, `tokens.test.mjs`, `color-audit.test.mjs`, component specimens, inspector metadata and Develop token references together whenever a component axis or token changes. Develop must distinguish theme-specific colors from shared effects and list only CSS-consumed variant/state variables.

## Commit conventions

- All commit messages must follow the Conventional Commits format enforced by commitlint: `<type>(<optional-scope>): <description>`.
- Use an appropriate lowercase type such as `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `build`, `ci`, or `revert`.
- Keep the description concise, imperative, and lowercase, without a trailing period.
- Use `!` or a `BREAKING CHANGE:` footer for breaking changes.
- Examples: `feat: add button component`, `fix(theme): correct dark mode colors`, `chore: update dependencies`.
