# Agent instructions (SecondPassReaderClient)

This repo is a **standalone browser app**. Keep it statically deployable and independent of the Django server implementation.

## Hard constraints

- Do **not** couple the app to Django templates, server-rendered pages, or Django-specific routing assumptions.
- Do **not** introduce styling frameworks or state-management libraries without asking first.
- Do **not** add OAuth/OIDC libraries unless explicitly requested.
- Assume the primary dev environment is **Windows 10 + VS Code**.

## Architecture rules of thumb

- Isolate all server calls behind a `ServerBridge` / API client layer.
- Isolate renderer-specific code behind a `ReaderBridge` abstraction.
- Renderer state must **not** become the app’s canonical data model.
- Canonical annotation/session data is **W3C Web Annotation JSON-LD** (with EPUB CFI selectors), not epub.js internal state.

## Auth/linking

- Use the server’s PIN/code based Client API linking flow:
  - Discover via `/.well-known/secondpass`
  - Create login request
  - Display `code` and `authorize_url`
  - Poll `poll_url` for a one-time bearer token
  - Verify with `GET /api/v1/accounts/me/`
- Treat bearer tokens as password-equivalent: never log them and avoid persisting unless explicitly designed.

## Coding style

- Prefer simple, boring, understandable code.
- Keep layers explicit; avoid “magic” abstractions.
- If a change would introduce a large new dependency or framework, ask first and explain why.

## Spec junction (read-only reference)

- `docs/specs/reading-session-annotation-profile` is a **Windows junction** / reference copy of a **server-owned** spec.
- Do **not** edit files inside that folder from this client repo.
- If the spec needs changes, stop and ask; changes must be made in the server/spec owner project first.
- Client implementation may reference the spec, but runtime TypeScript types belong in `src/schemas/`.
- Do not import runtime app code from `docs/` (docs are reference material only).

