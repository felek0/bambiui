# bambiui CLI

MIT-licensed CLI for installing editable React + TypeScript + CSS Modules sources from a static registry. Node.js 22.15+ is required. The CLI has no runtime npm dependencies and does not upload your System JSON.

## Quick start

From an existing React 19 project:

```sh
npx bambiui@0.2.1 init
npx bambiui@0.2.1 add button
npx bambiui@0.2.1 add card input checkbox
```

Init defaults to **https://bambiui.com/registry/index.json**, with no registry prompt. To use your own trusted registry or local development server:

```sh
npx bambiui@0.2.1 init --registry http://localhost:3000/registry/index.json
```

HTTPS is required except on loopback. Credentials, query strings, fragments and redirects are rejected. An existing project's immutable registry pin is not changed by the default address or a CLI patch upgrade.

## Use your design system

Export System JSON from bambiui, then initialize once:

```sh
npx bambiui@0.2.1 init --system ./bambiui-tokens.json
```

To change the installed system later:

```sh
npx bambiui@0.2.1 theme --system ./bambiui-tokens.json
```

A palette recipe, PageBundle or Project JSON is not a System backup. Input paths resolve from the React project's working directory. Both themes, shared geometry/typography and fractional overrides use the same parser/resolver as Studio. The theme command does not fetch a registry or rewrite component code.

## Finish host setup

Init prints the stylesheet and named `ThemeScope` imports, relative to a detected Next/React TypeScript entry. It never edits that entry. If no supported entry is found, examples are explicitly relative to the project root; adjust them for your entry file.

1. Import the generated `styles.css` once in your app entry or Next layout.
2. Wrap your component tree with `<ThemeScope mode="light">` or `mode="dark"`.
3. After add, import installed components from the generated `ui/` entry.
4. If package.json changes, run the suggested package-manager install command yourself.

Missing Base UI is added to package.json at the registry's tested exact version only when needed. Existing ranges are preserved with an advisory; React is never upgraded. The CLI recognizes an explicit packageManager or common lockfiles to suggest npm/pnpm/yarn/bun install. **It does not execute installs, lifecycle scripts or edit lockfiles.**

Keep shipped client boundaries; host callbacks/hooks belong in your own Client Components. Next html/body and Base UI portal isolation remain host responsibilities. CSS Modules must be supported; no Tailwind or Studio runtime is required.

## Component sources

- `init` writes scoped Light/Dark CSS, ThemeScope, System snapshot, LICENSE/NOTICE, README and bambiui.json. Components are not installed yet.
- `add` copies only the actual source dependency closure and maintains ui/index.ts. Card does not install the Button/Text used in Studio's populated example.
- `add --all` installs all seven built-ins. `add layout` explicitly installs Container/Stack/Grid.
- Default directory: src/components/bambiui when a real src directory exists, otherwise components/bambiui. Set --dir during init to choose another relative directory. Source imports remain relative; no alias rewriting is needed.
- System Parameters remain in the snapshot, not rewritten into React API defaults. Host content and application behavior remain yours.

## Safety and pinned releases

`--dry-run` validates/prints without writing. Edited or untracked conflicting targets fail the entire plan before writes. Repeating add is idempotent. `--overwrite` explicitly replaces conflicting planned targets; it is not a merge. Init never resets existing configuration.

Paths/ancestors are validated and symlinks refused. A project .bambiui.lock excludes concurrent CLI writers. Temporary sibling files and per-file rename provide attempted rollback on caught errors, **not crash-atomic multi-file transactions**. Inspect interrupted projects/locks before retry and avoid other concurrent generators.

bambiui.json pins the immutable registry URL/size/SHA-256 and theme resolver fingerprint. Add/theme do not silently switch to latest, migrate the resolver or discard local edits. 0.2.1 keeps the 0.2.0 config format/resolver unchanged. Sources installed by 0.2.0 remain supported while their pinned release stays hosted. Missing or incompatible releases fail explicitly.

In the source repository, published snapshots live in the tracked registry/releases archive. Every clean build copies that inventory back into the static output before updating the latest index. Custom registry operators must retain published pins too. Hashes prove integrity, not authenticity; choose a trusted host because registry source becomes application code.

Registry responses are limited to 8 MiB, source payload to 128 files/5 MiB, System input to 5 MiB and config to 256 KiB. There is no upgrade/merge command in this release.

## License and privacy

Only registry GET requests are made; System JSON stays local. Optional Google Fonts imports remain remote and send request data to Google; local presets avoid those requests. User-authored designs/data are not relicensed. CLI and supplied sources are MIT licensed; private Studio code is outside the explicit shared-source grant. See LICENSE/NOTICE; trademarks and third-party licenses remain separate.

## Source repository checks

```sh
npm run registry:snapshot
npm run registry:build
npm run cli:build
npm run test:cli
npm run check:registry
npm run check:cli
```

Snapshotting is an explicit maintainer operation before a source release: commit both the snapshot and its inventory. Do not edit/reformat/prune existing snapshots. Test fixtures verify clean output retention, real published 0.2.0 clients, local 0.2.1 compatibility, package execution and file/integrity safety. Consumer checks reuse installed dependencies, not a fresh dependency install or full visual/accessibility certification.

The private Next application is separate from the npm CLI. prepublishOnly validates MIT notice and compiled runtime integrity. Publication requires npm authorization and may require 2FA; account credentials do not belong in source code or chat.
