# bambiui

A local-first interface designer built with Next.js, Tailwind CSS v4, and Base UI. Build a design system, compose pages on a large frame canvas, customize component layers, and save reusable project components. Projects and systems are stored separately in this browser. Cloud sync, linked master-component propagation, and responsive multi-frame code delivery are not implemented. See [the roadmap](docs/roadmap.md) for scope and [the page-document contract](docs/page-document.md) for validation and source export details.

## Canvas workspace

- `/` and `/pages` open **Project**. Create or open a project, choose its design system, add a page, then use **Add frame** for Web, Tablet, Mobile or custom dimensions. No demo project or frame is created on load.
- The 48px header and slim panels leave most of the screen to the canvas. **Layers / Assets** live on the left; **Parameters / Project** on the right. The Parameters inspector shows only the selected frame or node. Panel toggles and **Focus canvas** reclaim the full work area; narrow screens use overlay panels instead of stacking long menus above the canvas.
- Drag components and layouts from Assets. Select, arrange, wrap, duplicate and delete through the canvas, layer tree or visible Actions menu. Space-drag/middle-drag pans; Ctrl/⌘ + wheel zooms. The floating toolbar contains history, frame insertion, zoom/Fit, theme and help.
- Select a frame to edit its dimensions, position, optional row/column auto layout, padding, corners and surface. Frames have independent trees, not automatically synchronized desktop/mobile variants.
- Components arrive ready to use: Card includes Header, Title, Description, Content and a Footer action; fields include meaningful labels and supporting copy. **Project → Parameters** edits instance content, options and states—not shared component styles. Layouts and frames retain their local geometry/appearance controls.
- **System → Parameters** authors insertion defaults. **System → Styles** edits the exact variant/state × tone × size and frame/text layer selected in the canvas matrix. Select a medium Card Title to change only that combination's typography, or an invalid Input Error to style its message. Padding/margin edges and corners start independent; linking applies one edit to all four. Shared all-combination defaults and base/variant tokens stay in separate collapsed sections; decorative borders never replace accessible focus outlines.
- Style fields display their actual rendered values without creating overrides on inspection. Authored values retain their precision; clearing/reset restores the effective default. Shared settings show **Mixed** when examples differ. The same value-display behavior applies to Project frame/layout appearance.
- Style fields show length units (`px`), unitless line height (`×`) and opacity (`0–1`). Use the field's **ⓘ** disclosure to read its full value, accepted range/options and reset help. Color/shadow fields use a full row; open help and inline errors expand without losing input focus. System styles and Project layout/frame appearance share validation, preserve decimals and reject arbitrary CSS; unitless fields no longer report pixel-only errors.
- System labels distinguish **This combination**, **All combinations**, **Base / variant defaults**, and **New instances only**. Collapsed **Scope & value sources** details explain direct style declarations, reset destinations and linked-project impact without adding editable fields. Final component/parent CSS is identified as a fallback boundary, not an inferred token source. Legacy instance styles can mask System changes.
- Select Card Header/Title/Description/Content/Footer in Layers or **Component layers** to edit instance copy. Missing slots can be added there. Input, Switch and Checkbox errors support above/below placement and optional info/warning icons; their text/placement/icon are parameters, while message typography belongs to System Styles. Canvas labels and error messages select the owning field.
- Shared System Styles update linked projects immediately. Starting parameter changes affect only new built-in insertions, never existing content or saved snapshots. Historical local `appearance`/`parts` remain honored; Project shows their status and an explicit **Reset local styles** action instead of a full component style editor.
- **Assets → Saved components** stores named project-local snapshots of a selected component/layout. Inserted copies remain independently editable, with fresh IDs and inherited system tokens. This is not linked-master synchronization or a cross-project asset library. See [reusable-components.md](docs/reusable-components.md).
- **Project → Change linked system** previews and confirms a new system reference without replacing content, local appearance or saved components. **System** opens shared foundations/component tokens without rebinding the project. Local appearance values apply in both themes; reset explicit colors to follow a new system's colors. Global contrast checks do not certify local color overrides.
- Valid edits autosave locally and use project Undo/Redo. Revision conflicts and storage errors preserve in-memory edits and show recovery actions. Project JSON download includes the content and assets, but only a system reference—not a portable system snapshot. Project import and the page Develop/download UI remain future work. Keep system JSON backups as well.

The UI is English-only. **Preview** enables native controls but prevents form submission. Touch/pen authoring, free-coordinate node placement, vector editing, native breakpoint mapping, cloud collaboration and full Figma feature parity are outside the current implementation.

## Design studio (implemented)

- Edit 32 global tokens across light/dark design themes; only colors differ by theme:
  - Surface colors (background, foreground, muted, border)
  - Brand and status roles (primary, secondary, success, warning, danger and info, each with an on-color)
  - Radius, padding, gap, margin, font size and border width, plus shared spacing presets `spacingSm`/`spacingMd`/`spacingLg` (4/8/16px by default)
  - A shared `sm`/`md`/`lg` control height scale and `fontFamily` preset (`system` by default; the seven local choices are `system`, `sans`, `humanist`, `serif`, `editorial`, `mono` and `typewriter`, with curated Google Fonts presets alongside them); shape, spacing, sizing, and typography are shared across themes
- Components follow one API contract (`variant`, `size`, `tone`, `disabled`, `loading`, `label`, `description`, `error`, …). See [docs/component-api.md](docs/component-api.md).
- Customize Button, Input, Card, Badge, Switch, Checkbox, and Text. Component colors can be overridden per variant/tone/state, including Input and choice-control states; applicable border widths and shadow presets are shared across Light and Dark. Values inherit from component/global tokens or derived colors until overridden. Text uses its foreground override and shared typography styles. Reset an override to reconnect it.
- **Design** view: the selected component's matrix shows every exact variant/state × tone × size combination—294 across the seven components. Click an example's frame or text layer to edit only that combination and layer. Matrix selection is independent of insertion defaults; there is no starting-component editor. Optional interaction previews retain read-only choices, a real loading action and a controlled-form demo. The pan/zoom canvas follows the selected theme's background and foreground tokens. Use Fit or zoom controls on desktop; on mobile, scroll the page normally. The form demo validates and reads `FormData` locally; it does not submit to a server. The dots are decorative and derived from those colors; the real Card component keeps its own surface. Choose Light or Dark with the icon-only switch at the System canvas's top right; the inspector edits the selected theme's colors and shared non-color values. Editor chrome uses neutral gray controls and surfaces, independently of the user's palette; the header logo retains its brand color and semantic success/warning/error indicators retain their meanings.
- Select a Button, Input, Switch or Checkbox example to reveal **Test interaction states** beneath it. Open the disclosure for a real, keyboard/pointer-interactive copy with temporary Disabled/Loading/Read only/Indeterminate conditions where supported. Hover/press/focus use native behavior, not simulated CSS. **Live recipe** can change without changing the inspector's edit scope. Typed values and conditions never save to tokens, insertion defaults or Project; Reset/close clears them. The 294-combination matrix stays unchanged.
- **Develop** view: **Install with the CLI** copies published `npx bambiui@0.2.0` init/add commands using this build's static registry. The separate CLI is available on npm under MIT. Export System JSON first to apply your own design locally. **Manual source ZIP (fallback)** remains collapsed and downloads the selected component or all seven as `bambiui-system-source.zip`. It includes real React/CSS Modules sources, populated System Parameters examples, an isolated Light/Dark theme, a system snapshot and dependency/integration guidance—not just CSS variables. Card includes the Text/Button used by its example; Text alone needs no Base UI runtime. Export captures the system before loading sources and never changes storage or history. Copyable React usage and token references remain below. Switch Light/Dark in the header to inspect either theme's tokens. Expand props/defaults, token inheritance or derived colors only when needed. Colors and Shape & spacing open their respective global token references. Full-system CSS remains available; examples reference this project's components, not a published package.
- In System, the header shows the active design system. Open its selector to switch systems, create a blank one, duplicate the current one, rename it, delete the current one (after confirmation), or import JSON as a new system. The sidebar groups Foundations and Components; Design/Develop navigation sits beside the logo. Both views share the selected component and theme; the token inspector appears only in Design. Switching views or themes preserves mounted demo state; switching systems resets transient canvas and edit state. On narrow screens, panel toggles open the library or inspector over the canvas; long System specimens scroll inside the work area. The studio UI is English-only.
- Systems are saved in this browser using localStorage; existing single-system drafts are loaded into the new collection on first use without changing their token schema. Use Undo/Redo at the canvas's top left to revisit edits in the active system during this session; histories are cleared on switching systems and after reload. Typing and slider changes to one field are grouped until focus leaves it, while palette application, reset, and replacement import are single steps. No account, server storage, or cross-device sync is included.
- Export both themes as CSS custom properties, including sparse shared `--{component}-part-{part}-*` styles and exact `--{component}-recipe-{key}-{part}-*` styles, `--ds-font-family`, `--ds-spacing-sm`/`--ds-spacing-md`/`--ds-spacing-lg`, raw color scales, derived state colors and system constants, or as a version 3 JSON backup. For a Google Fonts preset, CSS export puts its Google Fonts `@import` at the very top, before the theme selectors, and `--ds-font-family` contains the resolved family stack with local fallbacks; local presets need no import. Component markup and style rules are not included. JSON stores the selected preset ID in both theme records, not font files or stylesheet contents. It also preserves the separate `componentDefaults` insertion parameters and per-theme `componentStyles`/`componentRecipes`; CSS resets omitted sparse variables at theme boundaries to prevent color inheritance from the other theme.
- Import a JSON backup to restore a system. The header Import button validates the file and asks before replacing the active system; the system selector offers Import as new system to keep the current one. CSS and JSON exports include only the active system. Version 1/2 backups and saved drafts are upgraded to version 3: existing values and overrides are copied independently into both themes without recoloring. Version 1 additions use historical defaults. Older version 3 backups without the new presets receive `system` and 4/8/16px on import; curated Google preset IDs remain valid within schema v3 without a version bump, and font family remains shared between Light and Dark; legacy `paddingX`, `paddingY` and `gap` values and overrides are retained, not remapped to the spacing presets. Regenerate a theme explicitly if you want new accessible colors.

Google Fonts are optional: selecting or reopening a saved draft with a curated Google preset makes the browser request a stylesheet from `fonts.googleapis.com` and font files from `fonts.gstatic.com`. This shares request data such as your IP address with Google; the seven local presets make no Google Fonts requests. If offline, blocked, or unavailable, the selected font falls back to the local fonts in its stack. Using exported CSS with a Google preset likewise requires network access unless the consumer removes the import or provides its own fonts.

In Design, select a component in the sidebar to edit its tokens, or choose **Colors** or **Shape & spacing** for global foundations. Click a color stop or spacing sample to focus its inspector field. Colors apply to the selected theme; dimensions, spacing presets and the font family are shared. Card.Content uses the matching spacing preset for its children's gap at sm/md/lg sizes; these presets do not rewrite legacy padding/gap tokens or their component overrides. Changes apply immediately. Color inputs accept six-digit hex values; numeric controls use pixels.

## CLI and static registry

The primary developer delivery path is now **CLI + static registry**. See [the CLI contract](docs/cli-registry.md) and [package README](packages/cli/README.md). The CLI package is separate from the private Next application. **`bambiui@0.2.0` is published on [npm](https://www.npmjs.com/package/bambiui/v/0.2.0)** under MIT and is the `latest` release. Published tarball integrity matches the reviewed artifact. Registry deployment is separate; this verification does not deploy the Studio or static files.

```bash
npm run registry:build
npm run cli:build
npm run test:cli
npm run check:cli
```

Run these **from an existing React project** (the loopback registry URL is a development example):

```bash
npx bambiui@0.2.0 init --registry http://localhost:3000/registry/index.json --system ./bambiui-tokens.json
npx bambiui@0.2.0 add button
npx bambiui@0.2.0 add card input checkbox
npx bambiui@0.2.0 theme --system ./bambiui-tokens.json
```

Until a production origin is established, `init` requires `--registry` in noninteractive runs. Omitting `--system` uses the default system. The verified npm entrypoint is `npx bambiui@0.2.0 init` / `npx bambiui@0.2.0 add button`. This is a source installer, not a runtime component package.

`add` copies only actual source dependencies; Card does not install the Button/Text used in Studio's populated example. The CLI adds a missing Base UI declaration only when needed, preserves existing dependency ranges, and does not execute package-manager installs or alter host entry files. Review package.json, install with your package manager and follow the generated stylesheet/ThemeScope instructions. `--dry-run` writes nothing; conflicting local edits fail the whole plan unless `--overwrite` explicitly permits replacement. Repeated add is idempotent.

`npm run dev/build` emits `public/registry/index.json` and immutable content-addressed releases into the static export. System JSON is processed locally using the compiled Studio resolver; no snapshot is uploaded. Registry hashes/pins are integrity checks, not signatures. Production hosting must retain old immutable release URLs across clean deploys—Git-ignored local generated directories alone do not guarantee retention. The CLI and explicitly enumerated distributable/shared sources are MIT licensed; the rest of Studio remains private. See [license scope](docs/licensing.md). LICENSE/NOTICE travel with the CLI, registry and installed sources; authored designs/data and third-party/trademark rights remain separate. Source collection rejects files outside the explicit grant, and `prepublishOnly` verifies the exact notice/build. Production registry/retention and clean-install acceptance remain deployment gates; npm publication additionally requires account authorization/2FA.

## Page-document fixtures and source delivery

Open `/examples/account-settings` to view the v1 JSON fixture in `app/studio/page-document/account-settings.json`. It renders Container/Stack/Grid and five existing components using a **detached bundle snapshot of the default system in Light mode**, not the active saved Studio system. `bundle.ts` pairs page JSON and both design themes in a separately versioned backup format, validates imports up to 1 MiB UTF-8, and preserves the existing design-system migration/shared-geometry rules. The bundle renderer supports both modes; this route shows Light. It is not a live project/system reference or an import/download UI, and remote font loading remains the consumer's responsibility. Layout gaps use the existing spacing presets; Grid collapses at a container width of 32rem or less. There is no breakpoint editor or page persistence. The example form uses native GET navigation and does not save data.

The prototype validates a restricted tree/prop allowlist and generates TSX with relative source imports. Tests type-check the fixture and compare server-rendered HTML from the renderer and generated TSX using real components. Attribute order and React-generated IDs are normalized while preserving ID references; CSS module names are stubbed. This proves the tested SSR structure, not independent installation, hydration, browser DOM or visual/CSS equivalence. A separate build-time source-delivery prototype now collects used component sources and their local dependencies, layout sources, CSS, theme variables, the JSON backup and dependency/install guidance. It is not connected to a download UI. See the plan for validator limits and remaining semantic checks.

### Shared page editing engine

`app/studio/page-document/commands.ts` supports atomic insert/delete/move/update/rename batches. Moves address the target index after removal; prop patches merge existing values and use `null` to remove optional props. Final validation rejects invalid slots/props, duplicate IDs, root deletion/movement and moves into descendants without changing the source document.

`history.ts` adds separate session-only Undo/Redo (50 steps by default). A batch is one step; no-ops/errors preserve redo and a real edit clears it. Composer wraps these commands in project-wide history and validated persistence; it does not mix them with System token history. Layout containers and Card.Content/Footer accept explicit empty children. Card and Card.Header retain their required-slot constraints. Typed appearance/part patches merge values and use `null` to restore inheritance.

### Copied-source consumer check

```bash
node --experimental-strip-types scripts/check-page-source.mjs
```

This generates a temporary source deliverable, type-checks it as React without Studio/Next imports, and builds an isolated Next consumer with Light/Dark routes and real exported CSS. It reuses installed `node_modules`; it does not test a fresh dependency install. Without `--browser`, it only checks build/prerender. Temporary files are removed by default. Add `--keep` to inspect the generated `ui/` source directory in the reported `.next/page-source-*` fixture; do not run a main build while inspecting it, since `.next` is disposable.

Add `--browser` to run a disposable headless Chrome profile against the copied consumer: hydration marker and runtime errors, painted theme colors, 1440/375px Grid columns/gaps/reflow, Switch pointer/Space behavior, native input/required/email validation, FormData and preserved GET action. `CHROME_PATH` overrides the default macOS Chrome executable. The browser phase is bounded to 120 seconds and cleans up its server/profile. These are fixed fixture checks, not screenshot review, native mobile/zoom, screen-reader or full accessibility acceptance.

Source collection is implemented in `scripts/page-source-files.mjs`. Component code is copied unchanged; unused component sources are omitted, while the shared component CSS remains complete. No Tailwind runtime is required; the source prototype includes its own minimal page baseline and scoped `sr-only` utility. This page prototype is not the CLI npm package; its copied software includes the MIT LICENSE/NOTICE under the explicit repository distribution scope.

The [source-delivery contract](docs/source-delivery.md) documents the implemented **System → Develop → Manual source ZIP (fallback)** download. The [CLI contract](docs/cli-registry.md) supersedes ZIP as the primary path; selected-frame ZIP is paused. System packages contain copied React/CSS Modules sources, snapshot-scoped Light/Dark styles, a populated example, JSON snapshot, strict manifest and integration guidance. They do not style the host `:root`/body or add wrapper padding/viewport height; ordinary CSS-variable export keeps its existing global scope. Selected-frame ZIP remains deferred D03; clean-install acceptance now targets the CLI in C04/D04, and the software's MIT scope is documented separately from private Studio/user data.

`npm run dev` and `npm run build` regenerate both the static source catalog and CLI registry through the same import collector as the page prototype. The catalog is fetched only on download; source text/TypeScript AST is not bundled into the canvas, and no system data is sent to a server. A missing/offline/stale catalog fails explicitly with retry, not a partial package. Archives use deterministic ZIP STORE with 128-file/5 MiB text-payload limits. Generated static catalog files are ignored by Git; the small `source-catalog-meta.json` descriptor pins the browser to the build's exact source hash. Regenerating unchanged content preserves descriptor/catalog timestamps. After editing component source during a running dev session, run `npm run source:catalog` and reload before testing exports.

```bash
node scripts/generate-source-catalog.mjs --check
node scripts/check-system-source.mjs --browser
node scripts/studio-source-smoke.mjs --screenshots
```

The System consumer checks standalone React types, a separate Next build/hydration, host/two-system/nested-theme isolation, exact typography and native states/choices at desktop/mobile widths. It reuses installed dependencies, not a clean install or full visual/accessibility acceptance. The Studio check verifies published npx CLI clipboard commands and the built static registry release/hash, then opens real downloaded fallback ZIPs with Python's standard ZIP reader after native browser download completion. It checks selected/all-seven packages, capture during navigation, retry and unchanged localStorage. Python 3 is a **test-only** requirement; production downloads need no Python or server. Optional screenshots are saved under `.next/color-review/`.

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
node --test app/studio/*.test.mjs app/studio/composer/*.test.mjs app/studio/page-document/*.test.mjs app/examples/page-editor/*.test.mjs
```

The page-document tests cover fixture JSON round-trip, selected invalid trees/props, boundary limits, escaping, generated TSX type-checking and renderer/export SSR HTML parity, including omitted props and legacy normalization. The Studio tests cover shared font/spacing presets, legacy alias independence, inheritance, component isolation, CSS/JSON compatibility, invalid imports, deterministic palette generation, gamut and semantic hue preservation, contrast thresholds, modeled component mixes, CLI output, and type-checking every copyable React snippet against the real component APIs.

To verify a direct Server Component consumer of Checkbox, run `node scripts/check-checkbox-server.mjs`. It builds a disposable Next.js fixture under `.next`, checks the static markup and client-reference manifest, then removes the fixture. This does not execute browser hydration.

## Studio smoke tests

After `npm run build`, run `node scripts/studio-workspace-smoke.mjs` for the System/Project workflow: project/page/frame creation, desktop/mobile panels, populated insertion, shared Card edges/typography, Input parts/errors, new-instance defaults versus existing content, saved-copy independence, themes, history, reload and actual CSS/JSON downloads. Run `node scripts/studio-composer-smoke.mjs` for the deeper insertion/movement/recovery/system-link regression checks (`--first-drag` isolates the trusted-pointer regression).

For the shared System editor, run `node scripts/studio-smoke.mjs` with Node.js 22+ and Google Chrome installed. The dependency-free harness checks the single visible preview and theme switch, one-step color application, invalid input, per-theme manual overrides, contrast warnings, Design/Develop state, CSS/JSON export, import round-trip, accessible names and 375px reflow. `--screenshots` captures representative images in `.next/color-review/` for manual review; there is no automated pixel regression test. The harness serves `out/` locally using a temporary browser profile; your regular browser data is not used. Set `CHROME_PATH` to override the default macOS Chrome executable. Automated checks do not replace a real screen-reader or browser-native zoom session.

See [docs/roadmap.md](docs/roadmap.md) for implemented capabilities and staged product scope, [the interface composer plan](docs/interface-composer-plan.md) for page authoring/backend decisions, and [the accessibility checklist](docs/accessibility-checklist.md) for manual acceptance.

## Development

Use Node.js 22.15+ (validated on Node.js 24.14). The dev/build source-catalog step runs TypeScript modules using Node's native type stripping.

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
