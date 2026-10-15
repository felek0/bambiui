# bambiui CLI

MIT-licensed CLI for installing editable React + TypeScript + CSS Modules sources from a static registry. Node.js 22.15+ is required. The CLI has no runtime npm dependencies and does not upload your System JSON.

## Use

From an existing React 19 project:

```sh
npx bambiui@0.2.0 init --registry http://localhost:3000/registry/index.json
npx bambiui@0.2.0 add button
npx bambiui@0.2.0 add card input checkbox
npx bambiui@0.2.0 add --all
npx bambiui@0.2.0 add layout
```

The loopback URL is a **development example**, not a hosted public registry. Use the registry index URL of your deployed bambiui static build in production. This release requires `--registry` in noninteractive init; an interactive terminal prompts if it is omitted. HTTPS is required except on loopback. Credentials, query strings, fragments and redirects are rejected.

Apply your own design system by exporting System JSON from bambiui and initializing with:

```sh
npx bambiui@0.2.0 init --registry http://localhost:3000/registry/index.json --system ./bambiui-tokens.json
```

Run init once. To change the installed system later:

```sh
npx bambiui@0.2.0 theme --system ./bambiui-tokens.json
```

A palette recipe, PageBundle or Project JSON is not a System backup. Relative input paths resolve from the React project's working directory.

## What is installed

- `init`: scoped Light/Dark theme CSS, `ThemeScope.tsx`, System snapshot, MIT LICENSE/NOTICE, setup README and `bambiui.json`. No components are installed yet.
- `add`: copies only actual component source dependencies and maintains `ui/index.ts`. Card does not install the Button/Text used in Studio's populated example. `layout` explicitly installs Container/Stack/Grid.
- `theme`: processes local System JSON using the same parser/resolver as Studio, without registry requests or rewriting component code. Theme-specific colors, shared geometry/typography, exact layer/recipe overrides and fractional values are preserved.

The output defaults to `src/components/bambiui` when a real src directory exists, otherwise `components/bambiui`. Set `--dir` during init to choose a different relative source directory. Source imports stay relative; no alias rewriting is needed.

Import the generated `styles.css` in your host entry/Next app layout and wrap consumers in the named `ThemeScope` export. Import installed components from the generated `ui/` entry. Keep shipped client boundaries; host callbacks/hooks belong in your own Client Components. Next html/body and Base UI portal isolation remain host responsibilities. CSS Modules must be supported; no Tailwind or Studio runtime is needed.

Missing Base UI is added to package.json at the registry's tested exact version only when required. Existing declarations are preserved with an advisory; React is never upgraded. **The CLI does not run package-manager installs, edit lockfiles or patch host entry files.** Review package.json, run your package manager's install command and follow the setup README. System Parameters are saved in the snapshot, not rewritten into React API defaults.

## Safety

`--dry-run` validates and prints the plan without writing. Existing edited/untracked conflicting files fail the whole plan before writes. Repeating add is idempotent. `--overwrite` explicitly replaces conflicting planned targets; it is not an automatic merge. Init never resets an existing configuration.

Paths/ancestors are validated and symlinks are refused. A project `.bambiui.lock` excludes concurrent CLI writers. Writes use temporary sibling files and per-file rename with attempted rollback on caught errors; this is **not crash-atomic across multiple files**. Inspect an interrupted project/lock before retry and avoid other concurrent file generators.

The static index resolves a content-addressed release. `bambiui.json` pins its URL/size/SHA-256 and the compiled theme resolver fingerprint. Add/theme refuse a mismatched resolver, and missing pins never silently fall back to latest. Registry hashes prove integrity, not authenticity; registry source becomes application code, so use only a trusted host. Only GET requests are made; your System JSON stays local.

Registry responses are limited to 8 MiB; source payload to 128 files/5 MiB, System input to 5 MiB and config to 256 KiB. Static hosting must retain older immutable release directories for existing pins. There is no upgrade/merge command in this release.

Optional Google Fonts imports remain remote and send request data to Google; local presets avoid those requests. User-authored designs/data are not relicensed. The CLI and supplied sources are MIT licensed; Studio code outside the explicit shared-source grant remains private. See LICENSE and NOTICE.md; trademarks and third-party licenses are separate.

## Build and test from the source repository

```sh
npm run registry:build
npm run cli:build
npm run test:cli
npm run check:cli
```

Dev/build emits registry files into the static export. Test fixtures check real child-process commands, packed/local npm exec behavior, file conflicts and hash/format/path/size protections. Consumer checks reuse installed dependencies, not a fresh remote install or full visual/accessibility certification.

The npm target is `bambiui@0.2.0`. The private Next application is a separate package. `prepublishOnly` validates MIT notice and compiled runtime integrity; publishing still requires npm authorization and may require 2FA. No account credentials belong in source code or chat.
