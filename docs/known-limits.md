# Known Limits And Non-Goals

This doc lists current intentional limits and useful future work notes. It is not a changelog.

## App Shell

- The app is hash-routed.
- It is designed as a static browser app and does not support server-rendered routes.
- Connection profiles are local browser state.

## Server Integration

- The Django server is separate and must be configured for CORS in local development.
- Bearer tokens are stored in local browser storage as part of connection profiles.
- OAuth/OIDC is not implemented.

## Reader

- EPUB rendering is implemented through `@likecoin/epub-ts`.
- CFI is the restore anchor; visible range is not currently persisted as a canonical model.
- Reader settings are local browser preferences, not server-synced.
- EPUB renderer state is not canonical annotation/session state.

## Search

- In-book search is client-side and searches the opened EPUB.
- Search is explicit only; it does not run on every keystroke.
- Search uses epub-ts section search and same-section range repair for guided imports.
- There is no custom fuzzy matching.
- Search repair does not cross spine sections.

## Guided Import

- Glasp CSV is the only supported import format.
- Import jobs are in-memory and do not survive reload.
- Import is guided row-by-row, not bulk.
- Import does not persist provenance metadata.
- Import does not do duplicate detection.
- Import does not create annotations directly.
- Imported highlight range repair is exact normalized same-section matching only.

## Annotations

- Annotation anchors are immutable after creation.
- Range adjustment handles are not implemented.
- To change a highlight range, delete and create a new annotation.
- Previous session layers are read-only context.

## Styling

- There is no styling framework.
- Reader themes rely on CSS variables and reader activity data attributes.

