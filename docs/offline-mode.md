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
- Large assets and durable Reader data belong in the app-owned IndexedDB database, not
  `localStorage`.
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

## Cache Identity

Account-owned cached data is isolated by normalized server origin and the verified account profile
ID from `/accounts/me`. Both are required. The serialized namespace is
`server:<encoded-origin>|profile:<encoded-profile-id>`.

- Server display metadata, bearer tokens, local connection IDs, client-session IDs, and release
  fields are never part of cache identity.
- Token refresh and re-pairing do not create a new namespace for the same server account.
- Identity that is missing or invalid produces no namespace; account-owned data must not be cached,
  displayed, or replayed without one.
- Server identity follows the current origin-level discovery model. API paths are endpoint
  locations, not cache identity.

Future records remain inside that namespace and add their own identity: Home/recent uses a fixed
snapshot category; EPUB assets use book identity and the file checksum when present; Reader state
uses book and session identity; catalog results and contextual tag aggregates use the exact query
context; scope-level tag endpoints remain separate tag universes.

## Cache Result State

Cached projections use a shared data-oriented state: `missing`, `fresh`, `stale`, `refreshing`, or
`refreshFailed`. Every non-missing state carries the cached value and its `fetchedAt` time. A
refresh failure retains that usable value but does not retain raw error details.

This state describes cached projection usability only. Connectivity, authentication, and offline
book-asset availability remain separate concerns. Initial loading and failure without a cached
value remain page or query states; they must not be presented as stale cached data. Cache records
must also retain enough query context to establish which projection was fetched.

## EPUB Asset Availability

Cached Book metadata and cover images do not admit a book to the offline Reader. **Available
offline** requires a complete local EPUB asset whose recorded SHA-256 checksum matches the checksum
from current Book file metadata. The asset identity is cache namespace, Book ID, and checksum;
title, author, description, cover, download URL, and file size are not identity.

Missing, partial, unsupported, or checksum-mismatched assets are not offline-readable. Complete
assets without a valid server and recorded checksum are `unverifiable` and do not receive the
offline-stable promise. File size is diagnostic metadata only: a mismatch must be reported, but a
matching checksum remains decisive. A known checksum change requires replacement; different Book
IDs remain different assets and no CFI portability is inferred between editions.

Downloaded EPUBs are verified by streaming Blob chunks through an incremental SHA-256 hash. This
avoids the whole-file `arrayBuffer()` copy required by Web Crypto's non-streaming digest API, so
working memory is bounded to the browser-owned Blob, the current stream chunk, and hash state as
far as the runtime permits. There is no arbitrary file-size limit. Missing or malformed server
checksums skip hashing and remain unverifiable; completed bytes are not published as an offline
asset until the checksum matches.

Explicit offline acquisition checks browser capability and quota before optionally requesting
persistent storage, downloading through the authenticated SDK, and verifying the Blob. Limited
capability may proceed best-effort when quota can still be established; persistence denial or
failure is advisory. Only a verified complete Blob is published. A previous verified asset remains
in place until its replacement commits successfully. Partial and resumable downloads remain out of
scope.

Book Detail is the first explicit offline-stability surface. It can make one Book available
offline, update a changed EPUB, or remove its EPUB asset. Removal does not clear cached projections,
Reader continuity state, annotations, or pending Reader intents. Library-wide asset management in
Settings and Reader consumption of stored EPUBs remain separate later phases.

## EPUB Storage Admission

Before retaining an EPUB, the client uses the browser's advisory origin usage and quota estimate.
There is no universal EPUB size cap. Admission preserves the greater of 10% of estimated quota or
100 MiB, and declines an attempt that would cross the remaining usable budget. Missing, incomplete,
or failed estimates remain explicit unknown or unavailable capacity; they are not evidence of free
space.

An admitted write is still subject to quota races and browser eviction. A stored asset does not
become offline-readable until the checksum admission rules above verify it. Persistent storage may
reduce automatic eviction, but grant behavior varies by browser and users can still clear it. The
explicit Book Detail offline action may check `persisted()` and request `persist()`; startup does
not request persistence.

## Browser Offline Capability

Browser offline capability is separate from connectivity, current quota admission, and whether a
specific Book asset is verified. IndexedDB must pass a lightweight open-and-close probe before the
client can claim offline-stable support. A useful storage estimate plus working persistence query
and request APIs provide full capability; missing or failed StorageManager features leave
best-effort storage as limited capability rather than making IndexedDB unusable.

Capability checks are read-only except for creating the empty versioned IndexedDB schema when it
does not exist. They query `persisted()` but never call `persist()`. A later explicit **Available
offline** action owns any persistence request. Persistent permission reduces automatic eviction,
but browser or user site-data clearing can still remove local data.

Persistent storage is never requested during startup, capability inspection, or background work.
A future explicit offline-availability action first checks `persisted()` and calls `persist()` at
most once when needed. A denied request does not make IndexedDB unusable; it leaves any later
offline-retention attempt subject to best-effort eviction. A grant reduces automatic eviction risk
but does not prevent the user or browser controls from clearing site data.

## Reader Outbox Intents

The Reader outbox stores domain desired state, never serialized HTTP requests. Initial queued scope
is limited to establishing a writable Session through normal `open`, latest progress, and complete
annotation upsert or delete intent. Session close, `start-over`, Session metadata, Shelves, and
other library mutations remain excluded. Bearer tokens and request URLs do not belong in intents.

Progress coalesces to the latest CFI, percentage, and stable location label without comparing CFI
order. Annotation intent coalesces by account namespace, Book, target Session, and stable
`clientId`: edits replace earlier upserts, an unconfirmed create followed by delete disappears,
confirmed edit followed by delete becomes one delete, restore replaces delete, and repeated deletes
become one. Mutable intents carry a local revision so later replay can acknowledge only the exact
version it delivered.

After `SESSION_CLOSED`, unresolved progress and annotation upserts may transfer to the writable
continuation Session. Upserts that originated as confirmed annotations retain their original
server Session identity so a future reconciler can assign a new `clientId` when required. Deletes
of annotations confirmed in the closed Session do not transfer. Session establishment resolves
through normal `open`; `start-over` is never automatic recovery.

## Durable Repository Boundaries

Browser persistence uses one versioned native IndexedDB database, split by ownership: successful
authoritative projections, complete EPUB assets, local Reader continuity state, and Reader outbox
intents use separate async repositories. Complete EPUB payloads use structured-clone-safe browser
`Blob` values.
All account-owned records and operations are namespace-scoped, namespace purge is isolated, and
repository reads and writes do not expose mutable stored object identity.

The outbox repository owns atomic read-coalesce-write and exact-revision removal. Listing order is
not a replay contract. IndexedDB adapters must satisfy the shared repository conformance cases.
Persistence failures remain failures: there is no silent `localStorage` or in-memory fallback.
Service-worker behavior and cross-tab single-writer or replay coordination remain later decisions.

## Retry and Replay Policy

Delivery failures are classified without retaining raw response bodies or request URLs. Network
interruption, `429`, known in-progress idempotency work, and `5xx` retry later; `401` requires
reauthentication; `403` and ambiguous `404` require authority refresh rather than blind retry;
validation failures are terminal for the unchanged intent. `409 SESSION_CLOSED` remains distinct
because eligible Reader state may continue through a newly opened writable Session.

Transient retries use deterministic exponential backoff beginning at 30 seconds and capped at 15
minutes, unless a valid server retry delay is supplied. Policy computes delay only: there is no
fixed periodic sync loop, timer, or background job. Time-dependent code receives a clock with a
`now()` function so tests need no wall-clock sleeps.

Replay is grouped by account namespace and Book, then ordered deterministically as writable Session
authority, annotations, and latest progress. Repository list order has no meaning. Mutable intents
are acknowledged only when the delivered revision still exactly matches current desired state.
Closed-Session continuation retains Phase 0F transfer/drop rules, and `start-over` is never
automatic recovery. A future executor must enforce one active replay writer per account namespace
across browser tabs.

## Architecture Seams

Keep these seams explicit before broad feature wiring, with server calls behind the existing client
boundary and renderer details behind the Reader bridge:

- browser connectivity source limited to `online`, `offline`, or `unknown`; it reports browser
  connectivity signals only and does not infer server, authentication, cache, or book availability
- server/account-profile cache namespace independent of storage implementation
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
