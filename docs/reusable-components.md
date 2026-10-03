# Project-local saved components

Saved components in bambiui composer are **snapshots/templates**, not linked master definitions. **Copies stay independently editable.** Saving captures the selected subtree's content, props, layout, appearance and parts. Inserting makes a detached copy with fresh node IDs; editing or deleting the source, template or another copy never synchronizes existing copies.

Tokens are not baked into a snapshot. Each inserted component still inherits the project's linked design system, except for its explicit local overrides. Switching the project's `systemId` preserves assets, node content and overrides; browsing another system does not rebind the project. There is no separate asset system reference, library synchronization or automatic recoloring.

## Integration API

In the existing composer client tree:

```tsx
import { SavedAssetsPanel } from "./assets-panel";

<SavedAssetsPanel composer={composer} />
```

The panel accepts the existing `Composer` from `use-composer`. It provides a named save action, snapshot list, insertion into the selected node/frame, two-step deletion and a live status message. It does not need a new provider or dependency. Shell mounting belongs to the caller; the panel does not modify the existing composer UI.

Inspector callers can also use:

- `composer.controller.saveSelectionAsAssetReason(): string | null`: explain unavailable selections or editing state.
- `composer.controller.saveSelectionAsAsset(name): boolean`: save the current selected subtree; invalid/blank names report an error without a history entry.
- `composer.controller.insertAsset(assetId, target?): boolean`: insert into the exact optional target, or append into the current selection (the selected frame root when no node is selected).
- `target` is `{ projectId, pageId, frameId, parentId, index }`, on the current project's current page. Explicit targets may address another frame on that page. Indexes refer to the current child list.
- `composer.controller.execute({ type: "renameAsset", assetId, name })` and `execute({ type: "deleteAsset", assetId })` manage library entries. Disable these UI actions outside Design or while editing is blocked, as the supplied panel does.

Methods report validation failures through the controller's existing `state.message` and return `false`. Successful mutations return `true` even if local storage fails: the valid in-memory edit is retained with `project.status === "unsaved"` and `project.error`, just like other composer edits. Retry/JSON recovery remains available through existing project UI.

## Document and commands

`ComposerDocument.version` remains 1. Optional `assets?: ComposerAsset[]` contains exact `{ id, name, root: PageNode }` records. `assets` is **not added** when parsing, creating, copying or editing historical records without it. An explicit empty array stays explicit; deleting the last template leaves `assets: []`. Undo of the first save restores the original absence.

- Up to **32 assets per project**, with unique project-local asset IDs and nonblank names of at most 120 characters. Names need not be unique; commands address IDs.
- Node IDs are unique inside each snapshot. Existing frame/snapshot IDs may overlap; every insertion reserves fresh IDs across all live frames and saved snapshots, including adapters. Repeated allocator values and 64-character IDs are handled safely.
- The 2,000-node project quota counts frame trees plus stored snapshot trees, not temporary validation wrappers.
- Root kinds: Button, Input, Switch, Checkbox, Badge, Card, Text, Stack, Grid and Form. Frame roots, Grid.Item and individual Card compound slots are unavailable: select their complete component/layout instead. A complete Card/Grid can contain its required slots.
- The strict page-document parser validates each root in the smallest compatible temporary Container (and Stack for root-level controls). Its existing **100 nodes/depth 12** limits include these temporary ancestors. Thus a direct-root template can have at most 99 nodes; every saved template must fit in at least one empty frame. Temporary wrapper IDs avoid snapshot IDs and never persist.
- No arbitrary styles, callbacks, unknown fields, inherited/accessor fields, duplicate slots or invalid props are accepted. New page-document-supported appearance/parts fields pass through without a second field projection; snapshot/copy code uses `structuredClone`.

Pure commands are `saveAsset { asset }`, `renameAsset { assetId, name }` and `deleteAsset { assetId }`. Save appends a new ID, never silently replaces an existing definition. All command batches are strict and atomic. Asset insertion is one ordinary `nodeCommands` batch, including any adapter subtree, so save/insert/rename/delete each use the normal project Undo/Redo and persistence flow. Deleting an asset only removes the saved template, not its copies.

## Placement and lifecycle

Insertion reuses `insertion.ts`'s exact-slot adapter: controls at a frame root get an explicit Stack, compatible Grid children get Grid.Item, and Card body insertion appends into its existing Card.Content or creates that slot. Unsupported leaves/headers, nested forms, illegal Card/Grid content, missing targets and node/depth/project limits reject the entire operation. There is no fallback to an ancestor or another frame. The inserted actual component is selected, not its adapter.

Assets are normal document data, so project JSON backup, storage, reload, project duplication and whole-document history preserve them without another storage key. Project duplication detaches templates but retains their project-local asset IDs; it creates no links back to the source project. Deleting pages/frames does not delete saved components. A new project starts without assets, and old project hydration neither migrates nor resets stored records. Token histories and the design-system catalog remain independent.
