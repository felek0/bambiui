# bambiui software licensing

Decision: 2026-10-15. The CLI and distributed component/shared sources are MIT licensed. The Studio application remains private except for the explicitly listed shared files.

## Exact scope

- `packages/cli/`, including its generated runtime and package documentation: MIT. Full standard terms: [CLI LICENSE](../packages/cli/LICENSE).
- Shared source files enumerated in [distribution-license.json](../distribution-license.json): MIT. This is a per-file grant, not a grant for the entire `app/studio/` tree.
- The CLI/static registry/manual source package carries the same MIT text and a scope notice with the provided software and integration templates.
- No license to other repository files is granted by the [root scope notice](../LICENSE). Studio editor, canvas, inspector and composer code outside that explicit list is not open-sourced by publishing the CLI.

User-authored System JSON, designs, token values, project data and content are not relicensed by bambiui. MIT is the license of the supplied software, not a claim over user work. Trademark rights in the bambiui name/logos are separate. Fonts and third-party dependencies keep their own licenses; font files and third-party package implementations are not bundled into the CLI.

## Distribution checks

`source-collector.mjs` and `build-cli.mjs` check every collected source against the explicit scope allowlist. Adding a new source dependency requires an intentional licensing review and allowlist update; it cannot silently expose additional private Studio code.

The canonical MIT text in `packages/cli/LICENSE` must match `distribution-license.ts`, which supplies browser/CLI output notices. The registry embeds its MIT license and the CLI rejects missing/different notices. Initialization writes LICENSE/NOTICE.md with the component source directory; keep those notices when redistributing substantial software portions. Authored theme data is excluded by NOTICE.md.

The npm package declares `license: MIT`. Its prepublish check verifies the exact notice and compiled runtime integrity. These checks do not replace third-party attribution review or prove authorship/trademark rights.
