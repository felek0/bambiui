# bambiui

A local-first design system editor built with Next.js, Tailwind CSS v4, and Base UI. Customize foundations and exact component layers, then deliver System CSS/JSON or React/CSS Modules sources through Develop. Systems are stored in this browser. Project/page authoring is paused; existing records and shared model/source modules are preserved. See [the roadmap](docs/roadmap.md) and [the frozen System-first contract](docs/system-first-sf0-contract.md) for scope.

## System workspace and paused Project routes

- `/` and `/colors` open **System / Design / Colors**. `/spacing`, all seven component routes, `/develop` and `/develop/<component>` remain available. Design/Develop, System selector, Light/Dark, history and CSS/JSON import/export remain in the shell. Narrow screens use overlay library/inspector panels.
- `/pages`, `/pages/` and `/examples/page-editor` show **Project editing is paused**, with **Open design system** and **Download local recovery data**. No Studio/composer is mounted behind the suspended screen. Unknown routes retain static not-found behavior; there is no authoring bypass.
- Recovery runs only on an explicit button action. It exports raw strings in `bambiui-local-recovery.json`, including malformed JSON, from the exact composer index, nonempty document-prefix keys, the legacy page-editor bundle, and System collection/mirror keys. Unrelated storage keys are excluded; there is no upload, storage write/delete or migration.
- Recovery is a raw artifact, **not a supported import or portable Project bundle**. Limits are 1005 records, 8 MiB combined UTF-8 key/value bytes per record and 64 MiB serialized JSON. Unreadable, vanished or changed records fail the entire capture; no partial backup is reported as complete. An empty store is reported explicitly. Retry without clearing records.
- Read-only Project reference checks fail closed for malformed/future, missing, inaccessible and orphan records, refresh on storage/focus and recheck before and after deletion confirmation. Valid unrelated Projects do not block System deletion. Linked Systems must be kept; duplicate/export instead. At least one System remains.
- Another tab's unsaved memory/history cannot be inspected. **Export unsaved work in old authoring tabs before reloading them.** These localStorage checks and recovery are best effort, not an atomic multi-tab transaction or a guarantee of a complete backup.
- **Styles** inspects the explicit matrix example and frame/text layer. The editor writes non-color fields across supported variants/states/tones of that component at the selected size, part and target; Text also retains its typographic variant (`paragraph.sm` reaches all six tones, not h1/caption). Colors (`background`, `color`, `borderColor`) remain selected exact recipe/current theme only. Field reset uses the same scope, including per-field scoping for a mixed target reset. **Playground** independently changes one live sample's props, content and states; it does not change matrix examples, insertion defaults, tokens, history or exports. The contextual right panel shows Styles in Variants mode and temporary Props in Playground mode; there is no second inspector Preview tab. A null selection has no implicit medium edit target. Shared/base controls remain separate.
- Playground args reset on System/component change, import, explicit Reset playground and reload. They survive Variants/Playground mode switches, matrix recipe/layer/filter changes, theme changes, Design/Develop navigation and token edits/resets. Reset starts from the latest saved `componentDefaults` and clears action/native form state. Changing Playground axes never changes matrix selection. Draft fields discard outgoing context on theme/view/System/component changes; inspector/matrix own recipe/target/filter guards.
- Saved `componentDefaults` remain unchanged: matrix samples fall back to them and manual ZIP populated examples use the saved snapshot. CLI sources keep their React API defaults. No distributed model/storage/public component graph is removed.

The UI is English-only. Cloud sync, page authoring, linked master propagation and responsive multi-frame code delivery are not active features.

## Design studio (implemented)

- Edit 32 global tokens across light/dark design themes; only colors differ by theme:
  - Surface colors (background, foreground, muted, border)
  - Brand and status roles (primary, secondary, success, warning, danger and info, each with an on-color)
  - Radius, padding, gap, margin, font size and border width, plus shared spacing presets `spacingSm`/`spacingMd`/`spacingLg` (4/8/16px by default)
  - A shared `sm`/`md`/`lg` control height scale and `fontFamily` preset (`system` by default; the seven local choices are `system`, `sans`, `humanist`, `serif`, `editorial`, `mono` and `typewriter`, with curated Google Fonts presets alongside them); shape, spacing, sizing, and typography are shared across themes
- Components follow one API contract (`variant`, `size`, `tone`, `disabled`, `loading`, `label`, `description`, `error`, …). See [docs/component-api.md](docs/component-api.md).
- Customize Button, Input, Card, Badge, Switch, Checkbox, and Text. Component colors can be overridden per variant/tone/state, including Input and choice-control states; applicable border widths and shadow presets are shared across Light and Dark. Values inherit from component/global tokens or derived colors until overridden. Text uses its foreground override and shared typography styles. Reset an override to reconnect it.
- **Design** uses three task-focused regions: a compact Library, a full-width central workbench and a contextual right panel. **Variants** is the default component mode: compare every combination and select a frame or text layer to edit **Styles**. **Playground** uses that same central area for one live sample and puts grouped **Props** in the right panel. The modes are not side-by-side or vertically stacked; both stay mounted to preserve selection, filters and transient sample state. Component navigation returns to Variants. Narrow screens keep one active workbench and open Library/Styles/Props as overlays below the toolbar. Foundations remain a full-width canvas. Playground exposes every supported public variant/size/tone plus content, field states, error placement/icons, safe icon presets and Text's semantic element. Value/Checked control the live sample rather than offering duplicate initial-value controls. Executable props, callbacks, names, arbitrary JSX and inline styles are not edited. Real Button/Input/choice interactions update only the sample; submit never navigates. Both previews consume the live System tokens and selected theme; all navigation, filters and Props controls retain neutral Studio styling. Playground props are grouped into Appearance, Content, State & behavior, and collapsed More options.
- The selected component's matrix shows every exact variant/state × tone × size combination—294 across the seven components. Click an example's frame or text layer to inspect its actual values. Under the [superseding editor amendment](docs/system-first-sf0-contract.md#superseding-user-amendment--size-based-editor-write-groups), non-color edits use the selected-size write group; colors stay exact. The inspector labels both selection and write scope; inspection never normalizes peers. Matrix selection is independent of insertion defaults; there is no starting-component editor. Optional interaction previews retain read-only choices, a real loading action and a controlled-form demo. Component examples render at their real token sizes, without a transform camera, Fit/zoom tools or a dotted background. Variant/state/tone groups and size labels remain visible; narrow matrix panes stack sizes rather than shrinking them. Filters and selection context stick while scrolling, and selected examples are revealed within the matrix only. Theme/view/layer/token changes preserve its scroll position. Colors and Shape & spacing retain their existing Foundation canvas with desktop pan/zoom. The form demo validates and reads `FormData` locally; it does not submit to a server. Both preview panes follow the selected System theme; the real Card component keeps its own surface. Choose Light or Dark with the common workbench toolbar, in the same position in Design and Develop; the inspector edits the selected theme's colors and shared non-color values. Editor chrome uses neutral gray controls and surfaces, independently of the user's palette; the header logo retains its brand color and semantic success/warning/error indicators retain their meanings.
- Select a Button, Input, Switch or Checkbox example to reveal **Test interaction states** beneath it. Open the disclosure for a real, keyboard/pointer-interactive copy with temporary Disabled/Loading/Read only/Indeterminate conditions where supported. Hover/press/focus use native behavior, not simulated CSS. **Live recipe** can change without changing the inspector's edit scope. Typed values and conditions never save to tokens, insertion defaults or Project; Reset/close clears them. The 294-combination matrix stays unchanged.
- **Develop** view: **Use this system in your project** provides a direct **Download System JSON** action beside copyable published `npx bambiui@0.2.1` init/add commands using this build's static registry. The separate CLI is available on npm under MIT. Download the saved System JSON there, then run the CLI commands and follow the generated stylesheet/ThemeScope guidance. **Manual source ZIP (fallback)** remains collapsed and downloads the selected component or all seven as `bambiui-system-source.zip`. It includes real React/CSS Modules sources, populated saved-default examples (never Playground args), an isolated Light/Dark theme, a system snapshot and dependency/integration guidance—not just CSS variables. Card includes the Text/Button used by its example; Text alone needs no Base UI runtime. Export captures the system before loading sources and never changes storage or history. Copyable React usage and token references remain below. Switch Light/Dark in the common workbench toolbar to inspect either theme's tokens. Expand props/defaults, token inheritance or derived colors only when needed. Colors and Shape & spacing open their respective global token references. Full-system CSS remains available; examples reference this project's components, not a published package.
- In System, the header shows the active design system. Open its selector to switch systems, create a blank one, duplicate the current one, rename it, delete the current one (after confirmation), or import JSON as a new system. The sidebar groups Foundations and Components; Design/Develop navigation sits beside the logo. Both views share the selected component and theme; the token inspector appears only in Design. Switching views or themes preserves Playground args but discards outgoing field drafts; switching systems resets transient canvas and edit state. On narrow screens, panel toggles open the library or inspector over the canvas; long System specimens scroll inside the work area. The studio UI is English-only.
- Systems are saved in this browser using localStorage; existing single-system drafts are loaded into the new collection on first use without changing their token schema. Use Undo/Redo in the workbench toolbar while editing styles to revisit edits in the active system during this session; histories are cleared on switching systems and after reload. Typing and slider changes to one field are grouped until focus leaves it, while palette application, reset, and replacement import are single steps. No account, server storage, or cross-device sync is included.
- Export both themes as CSS custom properties, including sparse shared `--{component}-part-{part}-*` styles and exact `--{component}-recipe-{key}-{part}-*` styles, `--ds-font-family`, `--ds-spacing-sm`/`--ds-spacing-md`/`--ds-spacing-lg`, raw color scales, derived state colors and system constants, or as a version 3 JSON backup. For a Google Fonts preset, CSS export puts its Google Fonts `@import` at the very top, before the theme selectors, and `--ds-font-family` contains the resolved family stack with local fallbacks; local presets need no import. Component markup and style rules are not included. JSON stores the selected preset ID in both theme records, not font files or stylesheet contents. It also preserves the separate `componentDefaults` insertion parameters and per-theme `componentStyles`/`componentRecipes`; CSS resets omitted sparse variables at theme boundaries to prevent color inheritance from the other theme.
- Import a JSON backup to restore a system. The system selector offers **Replace from JSON…**, which validates the file and asks before replacing the active system, and **Import as new system**, which keeps the current one. CSS and JSON exports include only the active system. Version 1/2 backups and saved drafts are upgraded to version 3: existing values and overrides are copied independently into both themes without recoloring. Version 1 additions use historical defaults. Older version 3 backups without the new presets receive `system` and 4/8/16px on import; curated Google preset IDs remain valid within schema v3 without a version bump, and font family remains shared between Light and Dark; legacy `paddingX`, `paddingY` and `gap` values and overrides are retained, not remapped to the spacing presets. Regenerate a theme explicitly if you want new accessible colors.

Google Fonts are optional: selecting or reopening a saved draft with a curated Google preset makes the browser request a stylesheet from `fonts.googleapis.com` and font files from `fonts.gstatic.com`. This shares request data such as your IP address with Google; the seven local presets make no Google Fonts requests. If offline, blocked, or unavailable, the selected font falls back to the local fonts in its stack. Using exported CSS with a Google preset likewise requires network access unless the consumer removes the import or provides its own fonts.

In Design, select a component in the sidebar to edit its tokens, or choose **Colors** or **Shape & spacing** for global foundations. Click a color stop or spacing sample to focus its inspector field. Colors apply to the selected theme; dimensions, spacing presets and the font family are shared. Card.Content uses the matching spacing preset for its children's gap at sm/md/lg sizes; these presets do not rewrite legacy padding/gap tokens or their component overrides. Changes apply immediately. Color inputs accept six-digit hex values; numeric controls use pixels.

### Editor amendment boundaries

The selected-size policy is editor behavior, not a new public component API or token layer. A UI helper fans out into existing schema-v3 exact records; CSS, resolver, import and runtime inheritance remain unchanged. Existing divergent records stay until the specific field is edited/reset. Only supported recipes participate: Input error uses invalid/readonly; choice error uses invalid states only. Each gesture emits one combined `onRecipesChange` for one undo group. The separate **All combinations** shared section still spans all sizes. Pure distributed graphs stay untouched, so CLI/catalog/registry fingerprints are expected unchanged; the selected-size helper and browser regressions have been verified. No component/source release or npm publish is needed for these editor changes.

## CLI and static registry

The primary developer delivery path is now **CLI + static registry**. See [the CLI contract](docs/cli-registry.md) and [package README](packages/cli/README.md). The CLI package is separate from the private Next application. **`bambiui@0.2.1` is published on [npm](https://www.npmjs.com/package/bambiui/v/0.2.1)** under MIT and is the `latest` release. Published tarball integrity matches the reviewed artifact. Registry deployment is separate; this verification does not deploy the Studio or static files.

```bash
npm run registry:build
npm run cli:build
npm run test:cli
npm run check:cli
# Opt-in: downloads fresh dependencies and uses the published CLI + production registry
npm run check:cli:clean
```

Run these **from an existing React 19 project** (init defaults to the production registry):

```bash
npx bambiui@0.2.1 init --system ./bambiui-tokens.json
npx bambiui@0.2.1 add button
npx bambiui@0.2.1 add card input checkbox
npx bambiui@0.2.1 theme --system ./bambiui-tokens.json
```

The production registry is **https://bambiui.com/registry/index.json**. Published `0.2.0` requires `--registry` in noninteractive runs. Published `0.2.1` defaults to that production URL and adds entry-relative Next/React setup instructions plus package-manager install hints. Override with `--registry` for a custom trusted host. Omitting `--system` uses the default system. This is a source installer, not a runtime component package.

`add` copies only actual source dependencies; Card does not install the Button/Text used in Studio's populated example. The CLI adds a missing Base UI declaration only when needed, preserves existing dependency ranges, and does not execute package-manager installs or alter host entry files. Review package.json, install with your package manager and follow the generated stylesheet/ThemeScope instructions. `--dry-run` writes nothing; conflicting local edits fail the whole plan unless `--overwrite` explicitly permits replacement. Repeated add is idempotent.

`npm run dev/build` emits `public/registry/index.json` and immutable content-addressed releases into the static export. System JSON is processed locally using the compiled Studio resolver; no snapshot is uploaded. Registry hashes/pins are integrity checks, not signatures. Clean-build retention is implemented through the tracked [registry archive](registry/README.md): every build validates/copies all inventoried snapshots before updating the current index. Commit the archive inventory and snapshot files together; generated public/registry alone is not durable history. Use npm run registry:snapshot before a new source release, and npm run check:registry for the published-0.2.0 clean-output regression. The CLI and explicitly enumerated distributable/shared sources are MIT licensed; the rest of Studio remains private. See [license scope](docs/licensing.md). LICENSE/NOTICE travel with the CLI, registry and installed sources; authored designs/data and third-party/trademark rights remain separate. Source collection rejects files outside the explicit grant, and `prepublishOnly` verifies the exact notice/build. The production endpoint has been verified with the published CLI. After the reported deployment, the original immutable release is still available and byte-identical to the tracked archive. Fresh npm dependency installation is verified with the published 0.2.1 CLI and production registry: an isolated React/Vite host builds and renders before Next is installed, then the same host builds/prerenders and hydrates with Next. This opt-in check uses a new temporary directory/cache and deletes it afterward; it does not modify this repository's dependencies or run dependency lifecycle scripts. Manual accessibility/full visual acceptance remain open; a future changed-release deployment is the next live cross-release retention check. Npm publication additionally requires account authorization/2FA.

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

After a coordinator-owned `npm run build`, run `npm run test:system-only` (`node scripts/studio-system-only-smoke.mjs`) for System-first route/single-shell, legacy data preservation, recovery/privacy/errors and deletion/reference gates. The command does not build; run browser checks serially against a stable `out/`. The first System-only candidate passed 17 controlled browser scenarios; these are not human usability, VoiceOver or native browser-zoom acceptance. Focused read-only adapter checks: `node --test app/studio/legacy-project-recovery.test.mjs`.

Legacy `studio-workspace-smoke.mjs`, `studio-composer-smoke.mjs` and `page-editor-smoke.mjs` authoring scenarios are dormant against the paused public routes, not current acceptance gates. Their composer/page-document/page-editor model unit coverage remains; do not reopen authoring via a public query/environment bypass to run them.

Workspace browser cleanup requests graceful shutdown, signals only its own dedicated Chrome process group on POSIX, and releases its stderr pipe after the browser exits. Server/profile cleanup is attempted even if browser shutdown fails. Run `npm run test:browser-process` for inherited-pipe, TERM-resistant child, launch-failure, idempotence and process-ownership regressions. Other Chrome windows/process groups are not signaled.

For the shared System editor, run `node scripts/studio-smoke.mjs` with Node.js 22+ and Google Chrome installed. The dependency-free harness checks the single visible preview and theme switch, one-step color application, invalid input, per-theme manual overrides, contrast warnings, Design/Develop state, CSS/JSON export, import round-trip, accessible names and 375px reflow. `--screenshots` captures representative images in `.next/color-review/` for manual review; there is no automated pixel regression test. The harness serves `out/` locally using a temporary browser profile; your regular browser data is not used. Set `CHROME_PATH` to override the default macOS Chrome executable. Automated checks do not replace a real screen-reader or browser-native zoom session.

See [docs/roadmap.md](docs/roadmap.md) for implemented capabilities and staged product scope, [the interface composer plan](docs/interface-composer-plan.md) for page authoring/backend decisions, and [the acceptance session](docs/studio-acceptance.md) plus [accessibility checklist](docs/accessibility-checklist.md) for manual acceptance. The active session provides System-only tasks and separate keyboard/VoiceOver/native-zoom checks with an unfilled results log; automated success does not mark these as passed.

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
