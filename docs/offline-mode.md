# Offline and Cached Mode

## Purpose

Web offline mode preserves reading continuity for books a reader explicitly makes available
offline. The Web client remains lightweight and on-demand by default. Offline mode does not turn
the full library, shelf, or administration surface into an offline-writable application.

This document defines the product model and the boundaries that later implementation must preserve.
It does not select a complete storage or synchronization architecture.

## Product Model

- **Live:** The client is connected, reads current server state, and sends mutations directly. The
  server remains authoritative.
- **Cached:** The client may show recent Home or reading state as a resilience convenience. Cached
  data may be stale or evicted and is not a promise that a book can be opened offline.
- **Available offline:** The reader has explicitly requested offline-stable access to a book. A
  later implementation must retain the required EPUB asset and Reader state, report when that
  availability is lost, and provide an explicit removal path.

## Initial Scope

- Cache the application shell, Home snapshot, and recent reading state later as conveniences.
- Add explicit offline-ready books in a later phase.
- Support offline Reader progress and annotation activity for those books later.
- Keep library search and paginated browsing online-dependent.
- Keep shelf mutations and library or administration mutations online-only.
- Keep reading-session metadata edits online-only initially.

## Android Parity Rules

Web may use different browser mechanisms, but it must preserve these session and marginalia
semantics where applicable:

- The server authorizes access before book content is delivered or retained for offline use.
- A closed session is immutable: it is never reopened and receives no later progress, annotation,
  or metadata writes.
- A provisional local session identity is not a server session identity. Reconciliation must not
  confuse or silently merge them.
- Reader-authored progress and annotation intent is recorded locally first when offline operation
  is supported.
- Progress is latest-only; replay does not preserve obsolete intermediate positions.
- Annotation client IDs remain stable across retries and continuation.
- A queued mutation is cleared only by an exact acknowledgement of that mutation.
- `SESSION_CLOSED` ends writes to the closed session. Unacknowledged Reader activity continues
  through a new valid session rather than reopening or modifying the closed one.

## Web-Specific Choices

- Durable EPUB retention requires an explicit **Available offline** action. Opening a book does not
  silently make its EPUB durable.
- Large assets and durable Reader data belong in app-owned browser storage such as IndexedDB, not
  `localStorage`. The specific storage design remains a later decision.
- A service worker is not required for the first phase. Add one only when a defined runtime behavior
  requires it.
- Browser quota and eviction are expected conditions. The app must be able to detect and explain
  when requested offline availability is no longer intact.
- No background-sync guarantee is assumed. Replay must also work when the app is open and regains
  connectivity.
- Cross-tab ownership, single-writer behavior, and replay coordination must be designed before
  mutation queues are introduced.

## Data Categories

| Data | Initial stance |
| --- | --- |
| Connection profile and bearer token | Keep existing behavior unchanged in this phase; credential persistence policy remains an open question. |
| Home and recent snapshots | Cache later as replaceable convenience data. |
| Library search and pages | Do not promise offline availability. |
| EPUB assets | Retain later only through explicit offline availability. |
| Progress | Store one durable latest local value later, scoped to the correct book and session lifecycle. |
| Annotations | Store durable desired-state operations later with stable client IDs and exact acknowledgement. |
| Shelves | Online-only initially. |

## Architecture Seams

Keep these seams explicit before broad feature wiring, with server calls behind the existing client
boundary and renderer details behind the Reader bridge:

- browser connectivity source limited to `online`, `offline`, or `unknown`; it reports browser
  connectivity signals only and does not infer server, authentication, cache, or book availability
- account/profile-scoped cache namespace
- cache repositories for replaceable snapshots and durable Reader state
- EPUB asset store
- annotation desired-state outbox
- replay executor with exact outcomes
- sync outcome notice presenter

These are responsibility boundaries, not prescribed classes or storage schemas.

## Testing Principles

- Test executable runtime behavior, contracts, and invariants only.
- Do not add tests for this document, repository layout, labels, or configuration text.
- Avoid coverage-driven test volume.
- Test each storage, lifecycle, and replay seam before large feature wiring depends on it.
- Give special protection to closed-session immutability, latest-only progress, stable annotation
  identity, exact acknowledgement, continuation, and cross-tab ownership.

## Open Questions

- What browser credential and storage policy is acceptable for offline use?
- How should quota pressure, eviction, and lost availability be presented?
- What are the exact download, status, retry, and remove interactions for **Available offline**?
- How should terminally failed annotation operations be retained and resolved?
- What should **Forget account** do when unacknowledged Reader writes remain?
