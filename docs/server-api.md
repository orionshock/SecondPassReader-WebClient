# Server and API Integration

The app talks to a Second Pass server through the workspace package `@secondpass/client`.

## Boundary Rule

Feature code should use `createSecondPassClient(...)` and the client facade. Normal app code should not construct endpoint URLs, auth headers, pagination details, download URLs, or live annotation payloads directly.

Package-owned API docs:

- [../packages/secondpass-client/docs/API.md](../packages/secondpass-client/docs/API.md)
- [../packages/secondpass-client/docs/DATA_MODEL.md](../packages/secondpass-client/docs/DATA_MODEL.md)

## Client API Linking

The app uses the server's PIN/code based Client API flow, not OAuth/OIDC.

Flow:

1. Discover server metadata with `GET /.well-known/secondpass`.
2. Create a login request through the discovered Client API endpoint.
3. Display the returned code and authorization URL.
4. Poll the returned `poll_url`.
5. Store the returned bearer token after approval.
6. Verify with `GET /api/v1/accounts/me/`.

Verification stores current user display metadata on the connection profile.

## Server Assumptions

- One library book has one backing file.
- `spl.reading.openForReading(book)` opens or creates reading session state and downloads the backing book blob.
- Reading progress persists EPUB CFI as the meaningful restore anchor.
- Approximate `bookProgress` may be sent as presentation metadata, but it is not the restore source of truth.
- Live reading annotations use the SPL Marginalia Profile shape with EPUB CFI selectors.
- Highlight anchor fields are immutable after creation; changing a range means delete and create.

## Package Shape

`@secondpass/client` exposes namespaces:

- `server`
- `account`
- `library`
- `shelves`
- `reading`

Endpoint modules inside `packages/secondpass-client/src/` are implementation details.

## Spec Reference

If present, `docs/specs/reading-session-annotation-profile` is a read-only Windows junction to a server-owned spec. It is reference material only. Runtime TypeScript types belong in app or package source, not in `docs/`.
