# Second Pass Reader

Second Pass Reader is the Web client for Second Pass Library. It browses the Library, opens EPUB
Books, and works with Reading Sessions, Marginalia, and Shelves. Second Pass Library remains the
source of truth for catalog and account-owned data.

The Web Client runs as a standalone static browser application and keeps one active Second Pass
Library connection. It links through the PIN/code Client API flow.

The Android app is a sibling Second Pass Library client. Web and Android share product and server
semantics where appropriate, while each platform owns its user experience, storage, and capability
boundaries.

## Features

- Browse and search Books, Authors, Series, catalog tags, and Library Groups.
- Resume Books from Recent History and organize personal Shelves.
- Read EPUBs with search, Table of Contents navigation, display settings, and CFI-based progress.
- Create and review Reading Sessions, bookmarks, highlights, notes, and Marginalia from previous
  Reading Sessions.
- Import Glasp CSV Marginalia and split `SecondPassMarginaliaExport` files locally.
- Keep selected Books Available offline for reading and local Marginalia continuity.
- Configure appearance, Reader preferences, the active connection, and diagnostic logging.

## Local development

Install the committed dependency set and start Vite:

```powershell
npm.cmd ci
npm.cmd run dev
```

Vite prints the local development URL. See [Development](docs/DEVELOPMENT.md) for server presets,
CORS requirements, tests, and validation commands.

When intentionally changing a dependency, use `npm.cmd install <package>` and commit the resulting
manifest and lockfile changes.

## Repository

- React 19, TypeScript, and Vite browser application
- EPUB rendering through `@likecoin/epub-ts` behind the Reader engine boundary
- Workspace SDK [`@secondpass/client`](packages/secondpass-client/README.md) for Second Pass Library
  transport and data projection

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Deployment](docs/deployment.md)
- [Reader](docs/reader.md)
- [Offline behavior](docs/offline-mode.md)
- [epub-ts support ledger](docs/epub-ts-support-issues.md)
- [`@secondpass/client` SDK](packages/secondpass-client/README.md)
  - [API](packages/secondpass-client/docs/API.md)
  - [Data model](packages/secondpass-client/docs/DATA_MODEL.md)
- [Contributor and agent rules](AGENTS.md)
