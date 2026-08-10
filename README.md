# Second Pass Reader

Second Pass Reader is a browser application for reconnecting books with the activity around them:
reading sessions, progress, bookmarks, highlights, notes, shelves, and imported marginalia. It is a
companion client for a Second Pass Library server, which remains the source of truth for library,
session, progress, and annotation data.

The app runs as a standalone static site. A reader connects it to a Second Pass server through the
PIN/code Client API linking flow and then works with the books and data available to that account.

## What You Can Do

### Browse the library

- Search and browse books, authors, series, catalog tags, and library groups.
- Switch between list and grid views, ordering options, and paginated results.
- Resume recent reading from the home page and browse personal or shared shelves.
- Inspect book details and open accessible EPUB files in the Reader.

### Read and annotate EPUBs

- Read EPUB books with in-book search, table-of-contents navigation, themes, typography, spacing,
  and reader-width settings.
- Restore and autosave reading progress using EPUB CFI anchors.
- Create bookmarks and highlights with colors and notes.
- Review current-session annotations alongside selected read-only layers from previous sessions.
- Finish or restart a reading session and continue to the next book in a series when available.

### Review third-party marginalia

- Import third-party marginalia in the Reader; the currently supported format is Glasp CSV.
- Review imported rows individually, search for their location, and stage highlights through the
  normal annotation toolbar.
- Accept, skip, or mark rows manually completed while keeping temporary search and staging state
  separate from durable annotations.

Settings > Tools also includes a local Second Pass marginalia export splitter. It reads a
`SecondPassMarginaliaExport` JSON file and produces per-session JSON files, per-book ZIP files, or
one combined ZIP. This tool only repackages an existing export; it does not import annotations,
repair selectors, or contact the server.

### Work with sessions and shelves

- Browse reading sessions and inspect their progress, metadata, and annotations.
- Edit name and notes for active sessions, close sessions, and review closed sessions as read-only.
- Create and organize personal shelves while retaining access to shared shelves supplied by the
  server.

### Manage the local client

- Maintain local connection profiles and browser preferences for app appearance and Reader display.
- Link and verify a Second Pass server using the PIN/code Client API flow.
- Enable optional Reader, import, and staged-selection diagnostics from Settings > Tools.

## What This Repository Contains

- A React 19, TypeScript, and Vite static browser client.
- EPUB rendering through `@likecoin/epub-ts` behind a Reader engine boundary.
- The workspace package [`@secondpass/client`](packages/secondpass-client/README.md), which owns
  server API transport and app-facing data projection.
- Architecture, Reader, development, deployment, and renderer-support documentation.

## Project Status

Second Pass Reader is pre-release and evolves with the Second Pass server contract. It is developed
as an independent client and is not coupled to Django templates or server-rendered application
routes.

## Documentation

- [Architecture](docs/architecture.md)
- [Development](docs/development.md)
- [Deployment](docs/deployment.md)
- [Reader architecture and current limits](docs/reader.md)
- [epub-ts support issue ledger](docs/epub-ts-support-issues.md)
- [`@secondpass/client` package](packages/secondpass-client/README.md)
  - [SDK API](packages/secondpass-client/docs/API.md)
  - [SDK data model](packages/secondpass-client/docs/DATA_MODEL.md)
- [Contributor and agent policy](AGENTS.md)
