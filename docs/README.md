# Documentation

This folder describes the current Second Pass Reading Client. It is meant for future developers and agents who need to understand the app without reading the whole source tree first.

## Start Here

- [Architecture](./architecture.md): app boundaries, routing, data ownership, and source layout.
- [Development](./development.md): local setup, commands, build, and test notes.
- [Server and API Integration](./server-api.md): Second Pass server assumptions, auth/linking, and SPL client boundaries.
- [Reader](./reader.md): EPUB rendering, sessions, search, annotations, imports, and reader lifecycle invariants.
- [Code Organization](./code-organization.md): file organization, naming, and practical extraction guidance.
- [Known Limits](./known-limits.md): intentional limits, non-goals, and useful backlog notes.
- [epub-ts Support Issues](./epub-ts-support-issues.md): upstream defects, API limitations, client mitigations, and suggested library fixes.

## Other Reference Material

- Operational agent rules live in [../AGENTS.md](../AGENTS.md).
- The `@secondpass/client` package has package-owned docs in [../packages/secondpass-client/docs/API.md](../packages/secondpass-client/docs/API.md) and [../packages/secondpass-client/docs/DATA_MODEL.md](../packages/secondpass-client/docs/DATA_MODEL.md).
- If present, `docs/specs/reading-session-annotation-profile` is a read-only Windows junction to a server-owned specification. Do not edit it from this repo.
