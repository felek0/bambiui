# bambiui

A local-first design system Studio built with Next.js, Tailwind CSS v4, and Base UI. The planned direction is a design-system-first interface designer: create reusable components, compose responsive web/app pages visually, and export matching code. A JSON-driven page/layout prototype exists, but visual page authoring, saved projects and cloud sync are **not yet implemented**. See [the roadmap](docs/roadmap.md) for priorities and pending decisions, and [the interface composer plan](docs/interface-composer-plan.md) for technical scope.

## Design studio (implemented)

- Edit 32 global tokens across light/dark design themes; only colors differ by theme:
  - Surface colors (background, foreground, muted, border)
  - Brand and status roles (primary, secondary, success, warning, danger and info, each with an on-color)
  - Radius, padding, gap, margin, font size and border width, plus shared spacing presets `spacingSm`/`spacingMd`/`spacingLg` (4/8/16px by default)
  - A shared `sm`/`md`/`lg` control height scale and `fontFamily` preset (`system` by default; the seven local choices are `system`, `sans`, `humanist`, `serif`, `editorial`, `mono` and `typewriter`, with curated Google Fonts presets alongside them); shape, spacing, sizing, and typography are shared across themes
- Components follow one API contract (`variant`, `size`, `tone`, `disabled`, `loading`, `label`, `description`, `error`, …). See [docs/component-api.md](docs/component-api.md).
- Customize Button, Input, Card, Badge, Switch, Checkbox, and Text. Component colors can be overridden per variant/tone/state, including Input and choice-control states; applicable border widths and shadow presets are shared across Light and Dark. Values inherit from component/global tokens or derived colors until overridden. Text uses its foreground override and shared typography styles. Reset an override to reconnect it.
- **Design** view: explore component variants, sizes and states—including read-only choices, a button that enters a real loading state, and an expandable local controlled-form demo—on a pan/zoom canvas that follows the selected theme's background and foreground tokens. Use Fit or zoom controls on desktop; on mobile, scroll the page normally. The form demo validates and reads `FormData` locally; it does not submit to a server. The dots are decorative and derived from those colors; the real Card component keeps its own surface. Choose Light or Dark with the icon-only switch at the canvas's top right; the inspector edits the selected theme's colors and shared non-color values. Editor chrome uses neutral gray controls and surfaces, independently of the user's palette; the header logo retains its brand color and semantic success/warning/error indicators retain their meanings.
- **Develop** view: start with copyable React usage for the selected component. Switch Light/Dark in the header to inspect either theme's tokens. Expand props/defaults, token inheritance or derived colors only when needed. Colors and Shape & spacing open their respective global token references. Full-system CSS remains available; examples reference this project's components, not a published package.
- The header shows the active design system. Open its selector to switch systems, create a blank one, duplicate the current one, rename it, delete the current one (after confirmation), or import JSON as a new system. The sidebar groups Foundations and Components; Design/Develop navigation sits beside the logo. Both views share the selected component and theme; the token inspector appears only in Design. Switching views or themes preserves mounted demo state; switching systems resets transient canvas and edit state. On narrow screens, Edit tokens / Back to preview links connect the stacked Design workspace and inspector. The studio UI is English-only.
- Systems are saved in this browser using localStorage; existing single-system drafts are loaded into the new collection on first use without changing their token schema. Use Undo/Redo at the canvas's top left to revisit edits in the active system during this session; histories are cleared on switching systems and after reload. Typing and slider changes to one field are grouped until focus leaves it, while palette application, reset, and replacement import are single steps. No account, server storage, or cross-device sync is included.
- Export both themes as CSS custom properties, including `--ds-font-family`, `--ds-spacing-sm`/`--ds-spacing-md`/`--ds-spacing-lg`, raw color scales, derived state colors and system constants, or as a version 3 JSON backup. For a Google Fonts preset, CSS export puts its Google Fonts `@import` at the very top, before the theme selectors, and `--ds-font-family` contains the resolved family stack with local fallbacks; local presets need no import. Component markup and style rules are not included. JSON stores the selected preset ID in both theme records, not font files or stylesheet contents.
- Import a JSON backup to restore a system. The header Import button validates the file and asks before replacing the active system; the system selector offers Import as new system to keep the current one. CSS and JSON exports include only the active system. Version 1/2 backups and saved drafts are upgraded to version 3: existing values and overrides are copied independently into both themes without recoloring. Version 1 additions use historical defaults. Older version 3 backups without the new presets receive `system` and 4/8/16px on import; curated Google preset IDs remain valid within schema v3 without a version bump, and font family remains shared between Light and Dark; legacy `paddingX`, `paddingY` and `gap` values and overrides are retained, not remapped to the spacing presets. Regenerate a theme explicitly if you want new accessible colors.

Google Fonts are optional: selecting or reopening a saved draft with a curated Google preset makes the browser request a stylesheet from `fonts.googleapis.com` and font files from `fonts.gstatic.com`. This shares request data such as your IP address with Google; the seven local presets make no Google Fonts requests. If offline, blocked, or unavailable, the selected font falls back to the local fonts in its stack. Using exported CSS with a Google preset likewise requires network access unless the consumer removes the import or provides its own fonts.

In Design, select a component in the sidebar to edit its tokens, or choose **Colors** or **Shape & spacing** for global foundations. Click a color stop or spacing sample to focus its inspector field. Colors apply to the selected theme; dimensions, spacing presets and the font family are shared. Card.Content uses the matching spacing preset for its children's gap at sm/md/lg sizes; these presets do not rewrite legacy padding/gap tokens or their component overrides. Changes apply immediately. Color inputs accept six-digit hex values; numeric controls use pixels.

## Page/layout prototype (not a composer)

Open `/examples/account-settings` to view the v1 JSON fixture in `app/studio/page-document/account-settings.json`. It renders Container/Stack/Grid and five existing components using a **detached bundle snapshot of the default system in Light mode**, not the active saved Studio system. `bundle.ts` pairs page JSON and both design themes in a separately versioned backup format, validates imports up to 1 MiB UTF-8, and preserves the existing design-system migration/shared-geometry rules. The bundle renderer supports both modes; this route shows Light. It is not a live project/system reference or an import/download UI, and remote font loading remains the consumer's responsibility. Layout gaps use the existing spacing presets; Grid collapses at a container width of 32rem or less. There is no breakpoint editor or page persistence. The example form uses native GET navigation and does not save data.

The prototype validates a restricted tree/prop allowlist and generates TSX with relative source imports. Tests type-check the fixture and compare server-rendered HTML from the renderer and generated TSX using real components. Attribute order and React-generated IDs are normalized while preserving ID references; CSS module names are stubbed. This proves the tested SSR structure, not independent installation, hydration, browser DOM or visual/CSS equivalence. A separate build-time source-delivery prototype now collects used component sources and their local dependencies, layout sources, CSS, theme variables, the JSON backup and dependency/install guidance. It is not connected to a download UI. See the plan for validator limits and remaining semantic checks.

### Copied-source consumer check

```bash
node --experimental-strip-types scripts/check-page-source.mjs
```

This generates a temporary source deliverable, type-checks it as React without Studio/Next imports, and builds an isolated Next consumer with Light/Dark routes and real exported CSS. It reuses installed `node_modules`; it does not test a fresh dependency install, browser hydration or visual behavior. Temporary files are removed by default. Add `--keep` to inspect the generated `ui/` source directory in the reported `.next/page-source-*` fixture; do not run a main build while inspecting it, since `.next` is disposable.

Source collection is implemented in `scripts/page-source-files.mjs`. Component code is copied unchanged; unused component sources are omitted, while the shared component CSS remains complete. No Tailwind runtime is required; the source prototype includes its own minimal page baseline and scoped `sr-only` utility. This is not a registry, npm release or finalized licensing/distribution policy.

## Themes and accessibility

- Studio chrome follows the selected Light/Dark mode with neutral surfaces and controls, independently of the system's colors. The logo retains its `#e8673c` brand color, which is also the fresh design system's source. **Design** shows one theme on the canvas at a time; choose **Light** or **Dark** at the canvas's top right to target manual color editing in the inspector. Developer reference follows that target; exports always include both themes.
- Manual color edits remain independent per theme; shape, spacing, sizing, and typography edits update both themes. Choosing a color in the Color builder applies a generated light/dark pair together.
- CSS uses `:root, [data-ds-theme="light"]` and `[data-ds-theme="dark"]`. Apply the corresponding attribute to your consuming theme container.
- Generated defaults now drive component hover/pressed colors, editable Input and choice-control states, badge subtle/outline roles, focus rings and filled-card text. Unchecked control defaults remain opaque; component surface and border overrides may be transparent where supported. Only disabled controls are dimmed. Decorative icons are excluded from accessible names, invalid token inputs retain a separate keyboard focus ring, and motion reduction disables component animation.

The modeled default color audit passes **150 pairs per theme** (normal text 4.5:1, required boundaries/focus 3:1). Custom combinations and preserved legacy designs may fail and are highlighted in the inspector, not silently rewritten. Browser tests cover keyboard and accessibility-tree semantics, but are **not a screen-reader session or full WCAG certification**. Manual VoiceOver and native browser-zoom acceptance remain outstanding; see [docs/accessibility-checklist.md](docs/accessibility-checklist.md).

## Color builder

In the Design inspector, open the Color builder from the right-hand icon in the Colors inspector header. Enter a valid six-digit brand color or choose a preset: both light and dark palettes apply immediately in one update. An incomplete/invalid value is not applied. The source and both themes' 17 generated global colors are updated together; dimensions and component overrides are preserved. Manual color editing still targets only the selected theme; non-color edits are shared. Imported backups with distinct historical sources remain unchanged until you choose a new color.

The dependency-free engine uses OKLCH scales and reduces chroma to fit the sRGB gamut. Primary and neutral colors follow the source; success, warning, danger and info keep semantic green, amber, red and blue families. An accessible light primary keeps the exact source color (including the logo color) with dark button ink when possible; otherwise a safe usage tone is generated. Links use a separately derived, contrast-safe primary text color. Each recipe includes 12-step scales and solid, on-solid, hover, active, subtle, on-subtle, outline and focus roles.

Generated recipes check normal text at 4.5:1 and boundaries/focus at 3:1 on their specified surfaces, using final hex colors. A light primary fill with dark ink may meet the 3:1 button-boundary target without also meeting 4.5:1 as standalone text; use the derived `--ds-primary-on-subtle` for links. Raw scale stops do **not** guarantee arbitrary contrast pairs. The current-system report also checks modeled component mixes and enabled states, including overrides. On a component inspector, the status icon beside its token heading opens all checked pairs in a dialog and signals when pairs need attention; the global report opens from the Colors inspector header. The sidebar marks components with failing checked pairs and marks Colors for failing global pairs in the selected Light/Dark theme, separately from component override dots. Select a pair in the dialog to open its component or global color source and focus the highlighted inspector field; where available, a second action opens the other side of the pair. Derived colors link to their editable source role, not to raw scale stops. These checks cover finite color pairs, **not full WCAG compliance**. The same derivation powers rendered interaction colors and exported CSS. Impossible manual color combinations retain their explicit values and produce warnings rather than a false compliance claim.

Applied sources and both themes are included in JSON backups. Incomplete hex input stays in the open page only. CSS includes both themes’ current variables, raw scale stops and derived states. Generate a separate reproducible recipe from the CLI when needed:

```bash
node --experimental-strip-types scripts/generate-palette.mjs '#e8673c'
```

The CLI writes `bambiui.color-recipe` version 1 JSON to stdout, including the original source and both palettes. It is **not** a studio backup and cannot be imported through the existing design-system importer. No network service or new package is used.

## Icons and social images

The logo artwork lives in `app/studio/brand.ts`. The Apple touch icon, the web manifest icons, and the Open Graph and Twitter images are generated from it at build time. `app/icon.svg` (the output of `brandSvg()`) and `app/favicon.ico` (a 16/32/48 px render) are static files; regenerate them when the artwork changes.

Social images need an absolute URL. Set `NEXT_PUBLIC_SITE_URL` to the production domain, for example `https://bambiui.com`. Cloudflare Pages builds fall back to the deployment URL (`CF_PAGES_URL`).

## Token and color tests

Run the complete suite with Node.js 22.15+ (the SSR parity loader uses `registerHooks`; validated here on Node.js 24.14):

```bash
node --experimental-strip-types --test app/studio/*.test.mjs app/studio/page-document/*.test.mjs
```

The page-document tests cover fixture JSON round-trip, selected invalid trees/props, boundary limits, escaping, generated TSX type-checking and renderer/export SSR HTML parity, including omitted props and legacy normalization. The Studio tests cover shared font/spacing presets, legacy alias independence, inheritance, component isolation, CSS/JSON compatibility, invalid imports, deterministic palette generation, gamut and semantic hue preservation, contrast thresholds, modeled component mixes, CLI output, and type-checking every copyable React snippet against the real component APIs.

To verify a direct Server Component consumer of Checkbox, run `node scripts/check-checkbox-server.mjs`. It builds a disposable Next.js fixture under `.next`, checks the static markup and client-reference manifest, then removes the fixture. This does not execute browser hydration.

## Studio smoke tests

After building, run `node scripts/studio-smoke.mjs` with Node.js 22+ and Google Chrome installed. The dependency-free harness checks the single visible preview and theme switch, one-step color application, invalid input, per-theme manual overrides, contrast warnings, Design/Develop state, CSS/JSON export, import round-trip, accessible names and 375px reflow. `--screenshots` captures representative images in `.next/color-review/` for manual review; there is no automated pixel regression test. The harness serves `out/` locally using a temporary browser profile; your regular browser data is not used. Set `CHROME_PATH` to override the default macOS Chrome executable. Automated checks do not replace a real screen-reader or browser-native zoom session.

See [docs/roadmap.md](docs/roadmap.md) for implemented capabilities and staged product scope, [the interface composer plan](docs/interface-composer-plan.md) for page authoring/backend decisions, and [the accessibility checklist](docs/accessibility-checklist.md) for manual acceptance.

## Development

```bash
npm run dev
```

The application runs at [http://localhost:3000](http://localhost:3000) by default.

## Commands

```bash
npm run dev
npm run build

npm run lint
```

`npm run build` produces the static `out/` directory (`output: "export"`). Serve that directory with a static host; `next start` is not the production preview path for this configuration. The smoke harness supplies its own temporary static server.
