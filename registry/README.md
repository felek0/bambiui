# bambiui immutable registry archive

This directory is source-controlled release history, unlike generated `public/registry/` and `out/`. Every dev/build copies all entries in `releases.json` into the static registry before updating index.json. Clean CI builds therefore retain existing project pins.

- `releases.json`: sorted inventory of immutable SHA-256/UTF-8 byte records.
- `releases/<sha256>/registry.json`: exact release bytes, including source hashes and the original MIT notice/resolver identity.
- `npm run registry:snapshot`: explicitly archive the current release before publishing/deploying a source change. This command does not commit or deploy. Check the resulting files into Git together.
- `node scripts/generate-registry.mjs --check`: verify generated current AND archived artifacts.

Never edit/reformat, rename, prune or re-normalize a published snapshot. Do not filter old snapshots by today's component IDs or theme resolver. Missing/corrupt/unlisted/symlinked snapshots fail the build rather than silently losing a pinned release. Future format changes must retain readers for previously archived formats.

Snapshots are bounded to 8 MiB each and 128 MiB in total. If the archive outgrows that explicit budget, review storage or raise the budget; deleting existing pins is not an automatic recovery option. Snapshot creation is a maintainer operation; do not run concurrent writers on this source-controlled directory.

The archive contains licensed software source, not users' systems or projects. MIT terms are embedded in each release; private Studio files remain outside the explicit distribution scope.
