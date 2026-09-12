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
  verified publication asset exists and the app has a Reader capable of its format. The client
  must report when that availability is lost and provide an explicit removal path.

## Initial Scope

- Cache successful Home Recent and Shelf preview responses as replaceable convenience snapshots.
- Offer explicit offline-ready EPUB files from Book Detail and admit verified files to a local
  Reader bootstrap while the browser explicitly reports offline.
- Support durable offline Reader progress and current-session annotation activity for those books.
- While explicitly offline, show only locally retained publication assets and provide local title
  search over that downloaded subset. Full catalog search and pagination remain online-dependent.
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

- Durable publication-asset retention requires an explicit **Available offline** action. Opening a
  book does not silently make its file durable.
- Large assets and durable Reader data belong in the app-owned IndexedDB database, not
  `localStorage`.
- A service worker is not required for the first phase. Add one only when a defined runtime behavior
  requires it.
- Browser quota and eviction are expected conditions. The app must be able to detect and explain
  when requested offline availability is no longer intact.
- No background-sync guarantee is assumed. Replay must also work when the app is open and regains
  connectivity.
- Cross-tab ownership and single-writer behavior must be designed before replay is introduced.

## Data Categories

| Data | Initial stance |
| --- | --- |
| Connection profile and bearer token | Keep existing behavior unchanged in this phase; credential persistence policy remains an open question. |
| Home and recent snapshots | Retain successful Recent and Shelf previews for a narrow read-only offline Home. |
| Library search and pages | Offline mode lists downloaded Books only and searches their retained titles locally; the full catalog remains online-only. |
| Publication assets | Retain only through explicit offline availability. EPUB is the only currently supported Reader format. |
| Progress | Store one durable latest local value, scoped to the correct book and session lifecycle. |
| Annotations | Store current local desired state and coalesced delivery intents with stable client IDs. |
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
snapshot category; publication assets use Book, format, and file-checksum identity; Reader state
uses book and session identity; catalog results and contextual tag aggregates use the exact query
context; scope-level tag endpoints remain separate tag universes.

## Publication Asset Availability

Cached Book metadata and cover images do not admit a book to the offline Reader. A stored
publication asset is valid only when it is complete and its recorded SHA-256 checksum matches the
current Book file metadata. Its identity is cache namespace, Book ID, normalized format, and
checksum; title, author, description, cover, download URL, and file size are not identity.

Missing, partial, format-mismatched, or checksum-mismatched assets are not offline-readable. Complete
assets without a valid server and recorded checksum are `unverifiable` and do not receive the
offline-stable promise. File size is diagnostic metadata only: a mismatch must be reported, but a
matching checksum remains decisive. A known checksum change requires replacement; different Book
IDs remain different assets and no CFI portability is inferred between editions.

Downloaded publication files are verified by streaming Blob chunks through an incremental SHA-256 hash. This
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

Book Detail is the first explicit offline-stability surface. It can make one supported Book file
available offline, update a changed file, or remove its publication asset. Removal does not clear cached projections,
Reader continuity state, annotations, or pending Reader intents. Settings owns namespace-wide asset
management separately.

The shared asset policy, storage, checksum verification, and acquisition ownership are
format-neutral. EPUB is the only currently supported Reader format. Future formats require their
own engines and format-owned navigation, location, selection, and annotation semantics; EPUB CFI
is not a generic publication location model.

## Offline Library

When browser connectivity is explicitly `offline`, Library mounts a local downloaded-only view
instead of its server catalog query owners. `online` and `unknown` retain the existing
server-authoritative Library. The local view requires a verified account namespace and lists its
retained publication assets; cached Book metadata without an asset never admits a Book.

Offline Library search is case-insensitive title search over that local subset, with deterministic
local title ordering and a Book-ID fallback when retained metadata is missing. Groups, tags,
Authors, Series, remote sorting, and pagination are not fabricated offline. Retained metadata has
only remote cover URLs, not durable cover bytes, so the offline view uses a placeholder and makes
no cover request.

Reader admission remains stricter than storage listing: the current Web Reader opens only a
complete EPUB Blob whose retained checksum and format match the cached Book file metadata. A
retained asset that lacks usable metadata, is corrupt, or uses an unsupported format stays visible
as unavailable rather than masquerading as readable. Offline Library opens a local cached Book
Detail before the existing local Reader route. Publication-asset changes refresh the current
runtime, and focus refresh picks up later changes from another tab; there is no polling or cross-tab
catalog channel.

## Offline Home

When connectivity is explicitly `offline`, Home mounts a local cached-preview page before any of
the server-backed Home owners. `online` and `unknown` keep the existing server Home. Successful
online loads retain two normalized projections for the verified namespace: `home-recent` contains
the most recently displayed Recent History items, and `home-shelves` contains the six-item Shelf
preview. Failed loads never replace these snapshots, and cache persistence failure does not affect
online rendering.

Offline Recent preserves the cached server membership, order, Session identity, name, status, and
activity metadata. A matching durable local Reader state may replace only the desired CFI,
percentage, and stable location label; no CFI ordering comparison is performed. Provisional local
continuity does not make a cached Session active, and Reader state for Books outside the cached
Recent membership is not appended.

Cached Shelves preserve the server preview membership and order but are read-only offline. There
is no Shelf navigation, editing, pagination, or locally reconstructed organization. Home preview
covers are remote URLs rather than durable image bytes, so the offline page uses placeholders and
makes no image request. Recent Books open the local cached Book Detail. Reader opening from there
remains available only when the existing verified EPUB asset admission policy succeeds; cached
activity without publication bytes remains visible and manageable but cannot open the Reader.

Each cached section is independent. Missing Shelf data does not hide Recent data, and an empty
cache presents a route to the downloaded-only Offline Library. Local Reader changes and window
focus re-read durable state without polling. Offline Home remains an incomplete convenience
snapshot; online Home remains server-authoritative.

## Offline Book Detail

When connectivity is explicitly `offline`, Book Detail branches before mounting its server Book,
marginalia, Session, or Shelf owners. It renders the retained `reader-book:<bookId>` projection,
with a stable Book-ID fallback when descriptive metadata is missing. `online` and `unknown` retain
the existing server-authoritative Book Detail path. Retained cover references are remote URLs, so
the offline detail deliberately uses a placeholder rather than requesting cover bytes.

The local detail exposes only locally valid operations. `Open reader` uses the existing strict EPUB
asset policy and remains disabled for missing, corrupt, mismatched, or unsupported assets. `Manage
offline` opens the selected Book in Settings, and `Remove offline copy` removes only the publication
asset; Reader progress, annotations, continuity, projections, and pending sync work remain intact.
There is no offline acquisition, Shelf mutation, Session history, marginalia fetch, or other
fabricated server authority. Offline Home and Library now use this local detail as their normal Book
navigation step.

## Offline Surface Behavior

The authenticated app shell shows a small `Offline` connectivity status while retaining navigation.
Each destination then owns one explicit behavior:

| Surface | Explicit offline behavior |
| --- | --- |
| Home | Last-known cached Recent and Shelf previews, with local Reader progress overlay. |
| Library | Downloaded publication assets with local title search. |
| Book Detail | Saved projection metadata and publication-asset management. |
| Reader | Local EPUB reading and authored state when opened from an offline bootstrap. A Reader already opened online remains mounted but pauses server-owned mutations until connectivity returns. |
| Settings | Local sync inspection, manual retry eligibility, asset management, and connection-removal actions. Server connection checks, repair, and remote logout are disabled while offline. |
| Sessions and Shelves | Intentional offline-unavailable state; their server query and mutation owners do not mount. |

`Offline` describes connectivity, `Available offline` describes a verified retained publication
asset, saved details/previews describe cached server snapshots, and `Waiting to sync` or `Needs
attention` describes durable authored work. Repair-required authentication remains distinct from
browser connectivity and continues to gate all namespace-owned personal data.

Cached data provides read-only continuity or context; it does not enable server-owned workflows.
A cached Shelf preview is not an offline Shelf, cached Book metadata is not a readable publication,
and cached Reading Session metadata is not editable offline.

## Offline Reader Admission

Reader opening branches only on an explicit browser `offline` signal. `online` and `unknown` keep
the existing server-authorized Session-open and download path; arbitrary server failure does not
fall back to cached bytes. Offline opening requires the account namespace, a retained Book-detail
projection, current EPUB Reader support, and a complete stored Blob whose format and checksum
match that Book metadata.

The local bootstrap carries local continuity and its distinct local Session identity. It is not a
server marginalia bootstrap and never exposes a provisional identity to SDK mutation owners. The
offline Reader permits EPUB reading, navigation, TOC, search, display settings, and local-first
current-session annotation authoring. Session metadata, close, and other server-backed mutations
remain disabled.
The existing Reader lifecycle owns and revokes object URLs for both downloaded and stored Blobs.

### Durable Offline Progress

Settled offline Reader movement persists the latest canonical CFI, integer percentage, and stable
percent-first location label in local Reader continuity. Writes are debounced to reduce IndexedDB
churn, and Reader hide, page exit, or close requests a bounded local-only flush. Reader state is
written before its coalesced `replace-progress` outbox intent, so an outbox failure cannot erase the
latest durable position.

Offline reopen prefers that durable local progress; CFI strings are never compared for ordering.
The online three-second server autosave remains separate and unchanged. Foreground reconciliation
uses exact revisions so a stale acknowledgement cannot clear newer local progress.

### Durable Offline Annotations

Offline current-session highlights, bookmarks, and notes update the local projection immediately,
then persist Reader state before their coalesced outbox intent. Stable annotation client IDs and
origin metadata are preserved through edits. An unconfirmed create followed by delete leaves no
delivery intent; confirmed edits and deletes retain the authority context needed by later
reconciliation. Previous-session annotations and known-closed Sessions remain read-only.

Persistence failure does not roll back the visible authored change. State-write failure skips the
outbox write; outbox failure retains the durable local projection and dirty intent for another
local flush opportunity. The existing online annotation path remains server-authoritative and
unchanged; per-annotation pending badges remain out of scope.

Annotation replay is an explicit action after Session authority resolution. It sends one bounded
batch of complete annotation desired state to the authoritative active Session, adopts the complete
server collection as baseline, overlays newer local intent, and exact-acknowledges only delivered
revisions that are still current. Terminal validation failure retains authored state and intent.

If delivery reports `SESSION_CLOSED`, that Session receives no retry. Authority is resolved again;
local-unconfirmed upserts continue with the same client ID, while confirmed historical edits are
copied forward under a new stable client ID and become local-unconfirmed. Confirmed deletes against
the closed Session are dropped rather than applied to the continuation Session. The action returns
continuation counts that the automatic foreground sweep can aggregate into a single notice.
`start-over` is never automatic recovery.

Progress replay is a separate explicit action after Session authority resolution and annotation
replay. It sends only the progress value that still matches durable local desired state and
exact-acknowledges only the delivered revision. A newer local revision written during delivery
remains visible and pending; CFI strings are never compared for recency. `SESSION_CLOSED` stops
delivery to that Session, resolves a writable continuation, reloads the current desired progress,
and sends that latest value to the continuation. Same-runtime delivery is serialized per account
and Book because server progress is last-write-wins.

One explicit Reader sync action composes a complete manual cycle: inspect pending Book intent,
resolve writable Session authority, replay annotations, then replay progress against the final
Session returned by any annotation continuation. A failed later stage does not roll back successful
earlier delivery; the result reports safe stage, count, continuation, and partial-success metadata.
The coordinator shares one same-runtime cycle per account and Book and never mutates the outbox
outside the lower-level exact-acknowledgement actions. Automatic foreground triggers invoke the
cross-tab coordinated entry point; retry loops remain future work.

The cross-tab entry point wraps that explicit cycle in an exclusive Web Lock scoped by normalized
account namespace and Book. Waiting is the default; a non-waiting caller may receive `busy` without
starting sync. Durable intent is inspected by the sync action only after ownership is acquired, so a
waiter can observe that the previous tab already finished the work. Different Books and namespaces
remain independent. Web Locks require a supporting browser and secure context; unsupported contexts
report unavailable coordination rather than using a fragile storage mutex. Production deployment
expects the operator's reverse proxy to provide HTTPS and its certificate configuration.

Pending Reader outbox work has two automatic foreground triggers: authenticated startup while the
centralized browser status is explicitly `online`, and a later explicit `offline` to `online`
transition. Startup initially at `unknown` waits for the first definite state; `online` runs its one
catch-up attempt, while `offline` leaves later delivery to reconnect. Reconnect detection itself
still ignores initial `online` and `unknown` to `online`.

Both triggers share one namespace-scoped pending-Book sweep and same-runtime guard. The sweep lists
the namespace outbox once, derives distinct Books, and uses up to three workers to invoke non-waiting
cross-tab coordination per Book. `busy` means another tab owns that Book and is not an error. Account
lifecycle disposal prevents an old namespace generation from starting more Books, while already
started work settles before its shared repository connection closes. Failed work remains durable
for a later reconnect or manual action; there is no retry timer, periodic sweep, service worker,
or background sync.

Each completed automatic foreground sweep also aggregates safe reconciliation outcomes across its
Books. Routine success, no work, cross-tab contention, and transient retry remain silent. Confirmed
annotation edits carried into a continuation Session, deletes that could not be applied to an
already-closed Session, and terminal authored work can produce one dismissible, nonblocking app
notice for the sweep. Terminal work remains saved locally; the notice does not discard it or imply
that a repair workflow exists. Cross-tab notice fan-out, retry scheduling, background sync, and a
per-intent repair UI remain future work.

Settings includes a focused Offline surface for the current verified account namespace. It reports
distinct Books and resource counts with pending Reader work, and an explicit retry runs the shared
pending-Book sweep with waiting cross-tab lock semantics. Automatic startup and reconnect sweeps
remain non-waiting. Settings also lists locally retained publication assets using cached Book
metadata when available, with an ID-based fallback when it is not, and reports Blob-backed file
sizes without contacting the server.

Removing one offline copy deletes only its namespace, Book, and format asset. Removing all offline
copies uses the publication-asset namespace deletion and requires confirmation. Neither operation
deletes projections, Reader continuity, progress, annotations, outbox intent, or account data; an
already-open Reader retains its in-memory Blob URL until its existing lifecycle closes. There is no
periodic retry, service-worker delivery, background sync, or repair console.

Credential rejection is a repairable connection state, not a deletion signal. A rejected token
does not clear publication assets, cached projections, Reader continuity, annotations, or pending
Reader intent. Repair uses the normal pair-and-verify flow. Only the verified normalized server
origin and `/accounts/me` profile ID may reclaim an existing namespace: the same identity resumes
it unchanged. If repair verifies a different server or profile, the previous namespace is removed
before the new identity becomes active. Retained data is not exposed through authenticated feature
UI until verification succeeds.

The Web Client keeps one active signed-in user context. Intentional remote or local sign-out and
`Forget connection and local data` all remove the saved connection and its complete offline
namespace. They inspect pending Reader work, make one waiting coordinated sync attempt when online,
recheck durable state, and require confirmation before deleting projections, publication assets,
Reader state, and outbox records for that exact namespace. A failed cleanup keeps enough connection
context to retry it. Repair is the only path that preserves local data, and only for the same
verified identity. Settings `Remove all offline copies` remains publication-asset-only and does not
use complete namespace cleanup. There is still no background sync, service worker, or authored-work
repair console.

Offline Settings presents pending Reader work by Book using cached titles when available and a
Book-ID fallback otherwise. It describes session reconnection, reading position, annotation
changes, and annotation deletions in user terms without exposing outbox keys, revisions, Session
IDs, or payloads. A Book can be selected through
`#/settings?tab=offline&book=<book-id>` and retried through the existing coordinated sync action
with waiting lock semantics. Book Detail links retained offline copies to that selected management
state; Reader opening still uses the normal Reader route and admission policy.

Pending reading-position delivery may be explicitly discarded without removing the durable local
position used for local resume. Later Reader movement can create a new latest progress intent.
Annotation discard is not offered yet: the current durable projection does not retain a separate
authoritative baseline for safely undoing confirmed edits/deletes, and local projection plus outbox
updates do not yet share one transaction. Offline asset removal remains separate from Reader-authored
pending state.

## Publication Asset Storage Admission

Before retaining a publication asset, the client uses the browser's advisory origin usage and quota estimate.
There is no universal asset size cap. Admission preserves the greater of 10% of estimated quota or
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
  does not exist. They query `persisted()` but never call `persist()`. The explicit **Available
offline** action owns any persistence request. Persistent permission reduces automatic eviction,
but browser or user site-data clearing can still remove local data.

Persistent storage is never requested during startup, capability inspection, or background work.
An explicit offline-availability action first checks `persisted()` and calls `persist()` at
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

## Local Reader Continuity

Local Reader Session identity is separate from server Session authority. A server-confirmed local
record carries its server Session ID and last-known `active`, `closed`, or unknown status. Only a
last-known-active confirmed Session is selected for offline local writes. A confirmed closed or
authority-unknown Session is never treated as writable or reopened.

When no writable confirmed Session exists, the client creates or reuses one Book-scoped
provisional Session for the account namespace. Its durable identity is prefixed `local:` and its
server Session ID is always null. It is only a container for local Reader continuity and authored
intent. Repeated loads reuse that identity and ensure one coalesced `establish-session` intent.

Reconnect resolves Session authority before any Reader intent is replayed. The client first uses
the read-only active-session lookup and binds local continuity to its active Session when present;
otherwise normal `open` converges on the server's one writable Session. A successful bind preserves
the local Session identity, progress, annotations, tombstones, and annotation origins while adding
the authoritative active server Session ID. It may then exact-remove only the fulfilled
`establish-session` intent. Provisional IDs are never sent as server Session IDs, and `start-over`
remains explicit user intent rather than a recovery path. Progress and annotation delivery remain
explicit replay actions rather than automatic reconnect behavior.

## Durable Repository Boundaries

Browser persistence uses one versioned native IndexedDB database, split by ownership: successful
authoritative projections, complete publication assets, local Reader continuity state, and Reader outbox
intents use separate async repositories. Complete publication payloads use structured-clone-safe browser
`Blob` values.
All account-owned records and operations are namespace-scoped, namespace purge is isolated, and
repository reads and writes do not expose mutable stored object identity.

The outbox repository owns atomic read-coalesce-write and exact-revision removal. Listing order is
not a replay contract. IndexedDB adapters must satisfy the shared repository conformance cases.
Persistence failures remain failures: there is no silent `localStorage` or in-memory fallback.
Cross-tab Reader replay uses namespace-and-Book-scoped Web Locks. Service-worker behavior remains a
later decision.

## Retry and Replay Policy

Delivery failures are classified without retaining raw response bodies or request URLs. Network
interruption, `429`, known in-progress idempotency work, and `5xx` retry later; `401` requires
reauthentication; `403` and ambiguous `404` require authority refresh rather than blind retry;
validation failures are terminal for the unchanged intent. `409 SESSION_CLOSED` remains distinct
because eligible Reader state may continue through a newly opened writable Session.

Each pending Reader resource retains only its latest normalized attempt state, tied to the exact
resource revision. A newer edit or replacement clears the old failure state. Retry-later attempts
store a computed eligibility time using the existing backoff and normalized server retry delay;
terminal, authentication, authority, and unknown failures remain durable without raw errors or
response data. Automatic startup and reconnect sweeps skip resources that are not currently
eligible, while an explicit Settings retry may attempt deferred or manual-attention work. Eligible
progress can still sync when an unrelated annotation requires manual attention. Settings therefore
keeps `Needs attention` and deferred status across reloads.

While an authenticated foreground app remains alive, one namespace timer tracks the earliest
durable retry eligibility. At wake it rechecks connectivity and durable outbox state, then invokes
the existing non-waiting, cross-tab-coordinated pending sweep. Terminal, authentication, authority,
and other manual-only work never schedules the timer. Offline or unknown connectivity suspends
timer-driven delivery, and returning to a visible tab rescans overdue work to tolerate browser timer
throttling. The scheduler is disposed with its authenticated namespace and does not promise execution
after the app or browser closes. There is still no polling, service worker, or browser background sync.

Transient retries use deterministic exponential backoff beginning at 30 seconds and capped at 15
minutes, unless a valid server retry delay is supplied. Policy computes delay only; the foreground
scheduler consumes its durable timestamp and does not run a periodic loop. Time-dependent code receives a clock with a
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
- publication asset store, keyed by Book and format
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
