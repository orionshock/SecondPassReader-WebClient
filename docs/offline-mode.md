# Offline behavior

Second Pass Reader supports offline reading continuity for Books explicitly made Available offline.
It does not reproduce Second Pass Library's catalog, Shelf, Reading Session history, or
administrative workflows.

## Product boundary

The application distinguishes three states:

- **Online:** Second Pass Library supplies current data and remains authoritative.
- **Saved details:** cached server projections may provide read-only context. They may be stale or
  evicted and do not make a Book readable offline.
- **Available offline:** the verified namespace contains a complete publication asset supported by
  the Reader. This is an explicit user-managed promise.

Cached data does not grant offline mutation or navigation capability. A cached Shelf preview is not
an offline Shelf, cached Book metadata is not a readable publication, and cached Reading Session
metadata is not editable offline.

Offline-capable routes branch only when centralized browser connectivity is explicitly `offline`.
`online` and `unknown` use the normal server-backed owners. A failed request, server error, or
authentication problem does not trigger an offline fallback.

## Identity and privacy

Account-owned records use a namespace derived from normalized Second Pass Library origin and the
verified profile ID returned by `/accounts/me`:

This is the current offline namespace model, pending a deliberate cutover to stable Library
`serverId` plus profile ID. The route-derived namespace must not be interpreted as canonical
Library identity. See [Library identity and routes](server-identity.md) for the impact audit.

```text
server:<encoded-origin>|profile:<encoded-profile-id>
```

Both values are required. Display names, bearer tokens, local connection IDs, client-session IDs,
API paths, and release metadata are not identity.

The Web Client keeps one active connection:

- A rejected credential enters repair-required state without deleting local data.
- Personal cached data stays inaccessible until identity is verified again.
- Repair preserves the namespace only when normalized server origin and profile ID both match.
- If repair verifies a different identity, the previous namespace is removed before the new
  identity becomes active.
- Intentional Sign out and Forget connection and local data remove the active connection and its
  complete namespace.

Repair is the only preservation path across an authentication interruption.

## Storage ownership

The native IndexedDB database `secondpass-reader-offline` is version 3 and contains five
namespace-indexed stores:

| Store | Ownership |
| --- | --- |
| `projections` | Successful server-derived snapshots such as retained Book details and Home previews |
| `publicationAssets` | Complete publication Blobs keyed by namespace, Book, and format |
| `publicationCovers` | Durable cover Blobs keyed by namespace and Book |
| `readerState` | Local Reader continuity keyed by namespace and Book |
| `readerOutbox` | Coalesced Reader delivery intent keyed by namespace and resource |

Repositories return detached values and expose namespace-scoped deletion. Persistence failures do
not fall back silently to `localStorage` or memory.

Reader continuity is one shared record with independent progress, annotation, and Session writers.
Existing-record mutations reread and write that record in one IndexedDB transaction, preserving
sibling fields committed by another tab. A mutation that finds no current record reports it missing
instead of recreating continuity from a stale snapshot.

Small synchronous preferences remain in browser storage outside this database. See
[DEVELOPMENT.md](./DEVELOPMENT.md) for the local-data summary.

## Publication availability

Making a Book Available offline is an explicit Book Detail action. Browsing, opening, or caching
metadata does not retain publication or cover bytes.

Publication identity consists of namespace, Book ID, normalized format, and SHA-256 checksum. A
stored asset is readable only when:

- it is complete;
- its format is supported by the Reader;
- its recorded checksum is valid; and
- its checksum matches current retained Book file metadata.

Missing, partial, unverifiable, format-mismatched, and checksum-mismatched assets are not admitted.
A file-size mismatch is diagnostic; a matching checksum remains decisive. Different Book IDs remain
different assets, and no CFI portability is inferred between editions.

Publication verification streams Blob chunks through incremental SHA-256 hashing. It does not copy
the entire file through Web Crypto's non-streaming `arrayBuffer()` digest path. There is no
arbitrary publication-size limit.

The acquisition sequence is:

1. Validate Book identity, EPUB metadata, browser capability, and storage admission.
2. Optionally request persistent storage from the explicit user action.
3. Download the publication through the authenticated SDK.
4. Verify and commit the complete Blob.
5. Attempt to acquire the durable cover.

The publication is primary. Cover failure never makes a verified publication unavailable.
A previous publication remains in place until its replacement commits successfully.

The storage admission policy reserves the greater of 10% of estimated quota or 100 MiB. An unknown
or failed estimate is not treated as available capacity. Browser quota races, eviction, and
user-initiated site-data removal can still invalidate retained data. A denied persistent-storage
request leaves IndexedDB usable under normal best-effort eviction rules.

EPUB is the only Reader format supported by this application. Publication storage remains
format-neutral; another format would require its own engine and location, navigation, selection,
and annotation semantics.

## Durable covers

Durable covers belong to explicit publication retention, not general browsing:

- Online screens continue to use server-provided cover URLs and normal browser caching.
- Explicit offline acquisition may retain a Book-scoped cover Blob.
- Offline Home, Library, and Book Detail use that Blob when available and otherwise show a
  placeholder without requesting the remote URL.
- Existing retained publications without durable covers remain valid and readable.

Cover URLs are public and unauthenticated. `spl.library.books.downloadCover(coverUrl)` resolves
relative URLs against Second Pass Library. Its relative, same-origin, and cross-origin requests
attach no Authorization header and do not opt into credential forwarding. Cross-origin Blob
acquisition still requires a CORS-readable response. Failure is diagnostic and nonfatal; a failed
changed-source replacement leaves the prior durable cover intact.

Accepted cover records contain a non-empty Blob with matching byte length and a supported image
type: AVIF, GIF, JPEG, PNG, or WebP. Rendering uses owned object URLs and revokes them when the
controller or component releases the cover.

Removing the last retained publication format for a Book also removes its durable cover. Removing
all offline copies removes all publication assets and covers in the namespace. Neither action
removes Reader state, progress, annotations, outbox work, or cached projections.

## Offline surfaces

| Surface | Explicit offline behavior |
| --- | --- |
| Home | Read-only saved Recent History and Shelf previews, with a local Reader progress overlay |
| Library | Downloaded Books only, with local title search |
| Book Detail | Saved metadata, publication status, Open Reader, Manage offline, and removal |
| Reader | Retained EPUB reading, or continued reading in an already-mounted online-open Reader, with local Reading Session/Marginalia continuity |
| Settings | Offline assets, pending Reader work, retry, and local cleanup |
| Shelves and standalone Reading Sessions | Unavailable; server query and mutation owners do not mount |

The authenticated shell shows a small Offline status. Repair-required authentication is separate
from connectivity and continues to block access to namespace-owned data.

### Home

Successful online Home loads retain two normalized projections:

- `home-recent`: the displayed Recent History items;
- `home-shelves`: the six-item Shelf preview.

Failed loads do not replace good snapshots, and cache-write failure does not affect online
rendering. Preview results and cache writes belong to the authenticated client and verified
namespace that started them; removal, replacement, repair, or a newer preview invalidates older
publication work so it cannot recreate a cleaned projection.

Offline Home preserves cached membership, ordering, Reading Session identity, status, and activity
metadata. Matching local Reader state may replace only desired CFI, percentage, and stable location
label. CFI strings are never compared for order. Provisional continuity does not change cached
server status, and local Books absent from the cached Recent History are not appended.

Shelf previews remain read-only and do not navigate into Shelf management. Missing sections are
independent: Recent History can render without Shelves and vice versa. With no useful snapshot,
Home links to the downloaded-only Library.

### Library

Offline Library lists only retained publication assets in the verified namespace. Cached metadata
alone never adds a Book. It provides case-insensitive local title search and deterministic title
ordering with a Book-ID fallback.

Library Groups, tags, Authors, Series, server ordering, and pagination are not recreated offline.
A retained asset remains visible when metadata is missing or the Reader cannot admit it, but it is
not presented as readable.

Selecting a Book opens local Book Detail. Publication changes refresh the current runtime, and a
focus refresh discovers changes from another tab without polling.

### Book Detail

Offline Book Detail loads the retained `reader-book:<bookId>` projection and falls back to a stable
Book ID when descriptive metadata is missing. It does not mount Book, Marginalia, Reading Session,
or Shelf request owners.

Open Reader is enabled only when the strict EPUB asset policy succeeds. Manage offline opens the
selected Book in Settings. Remove offline copy removes the publication and its durable cover while
leaving authored Reader state intact. Missing publication bytes cannot be acquired while offline.

Shelf mutations, Reading Session history, server metadata edits, and administrative actions are
absent.

### Reader admission

An offline Reader open requires:

- a verified account namespace;
- retained Book metadata;
- a complete retained EPUB Blob; and
- matching format and checksum metadata.

The local bootstrap carries Reader continuity and a distinct local Reading Session identity. It is
not a server Marginalia bootstrap and never exposes a provisional ID to SDK mutation owners. EPUB
navigation, Table of Contents, search, display settings, progress, bookmarks, highlights, and notes
remain available. Reading Session metadata changes and close operations remain server-owned.

The Reader lifecycle owns and revokes publication object URLs. Removing durable storage does not
force-close an already-open Reader.

### Online-open Reader handoff

An online-open Reader remains mounted when centralized connectivity becomes explicitly `offline`.
With the same verified namespace and working local persistence, it hands progress and current
Reading Session Marginalia to the existing durable local continuity owners. The EPUB engine, Blob,
object URL, visible location, search state, and staged annotation interaction remain in place.

The handoff retains confirmed server Reading Session authority when available and merges existing
local desired state without ordering CFIs or dropping pending annotations and tombstones. A known
closed Reading Session remains read-only. Server mutation owners stop before local mutation becomes
available, preventing simultaneous server and local writes.

After a successful handoff, that mounted Reader remains local-first. When connectivity returns, the
normal authority reconciliation and outbox replay pipeline delivers pending work. Exact revisions
protect concurrent newer local changes.

This does not retain the publication Blob or mark the Book Available offline. The current engine may
continue using bytes it already owns, but offline reopen after closing still requires normal retained
publication admission. Unknown connectivity, request failures, repair-required authentication,
namespace mismatch, and local-storage failure do not activate durable authoring. If persistence
cannot be established, the Reader remains readable but mutation stays unavailable.

## Local Reader continuity

Local Reading Session identity is separate from server authority. A confirmed local record carries
its server Reading Session ID and last-known `active`, `closed`, or unknown state. Only a
last-known-active confirmed Reading Session is writable offline.

When no writable confirmed Reading Session exists, the client creates or reuses one Book-scoped
provisional identity prefixed with `local:`. Its server Reading Session ID is null. Repeated opens
reuse it and coalesce one `establish-session` intent.

Reconciliation first performs the read-only active-session lookup. It binds local continuity to an
existing active Reading Session or calls normal `open` to converge on the server's writable
Reading Session. Binding preserves local progress, annotations, tombstones, and origins.
Provisional IDs are never sent as server IDs, and `start-over` is never automatic recovery.

### Progress

Settled offline movement persists the latest CFI, integer percentage, and stable location label.
Writes are debounced. Reader hide, page exit, or close requests a bounded local-only flush.
The interaction controller owns that timing; one progress persistence action owns revision
allocation and writes Reader state before its coalesced `replace-progress` intent.
These are intentionally separate durability steps: resume progress may survive an outbox failure,
and later retry can restore delivery work. They are not one atomic progress-plus-outbox commit.

Offline reopen uses durable local progress. CFI strings are never compared for recency. Exact
revision acknowledgement prevents a stale response from clearing newer movement.

### Marginalia

Current Reading Session authoring uses one semantic mutation vocabulary: bookmark upsert,
highlight upsert, or delete by `clientId`. Manual selections, note/color edits, bookmark controls,
and confirmed imports use the same annotation builders and exact-CFI highlight update policy.
CFI is the spatial anchor; `clientId` is annotation identity.

Online authority delivers the mutation through the serialized SDK owner and publishes the
authoritative response. Local-first authority displays the local change immediately and commits
the Reader annotation projection plus coalesced delivery intent in one IndexedDB read/write
transaction. Either record alone is insufficient to recover authored work after process loss.
Stable `clientId` and origin metadata survive edits, retries, and continuation.

The local commit rechecks durable Reading Session identity, writability, the expected annotation
revision, and the affected projection. A stale conflicting mutation cannot overwrite newer work.
Successful completion means both stores have committed; reopening finds matching desired state
and delivery intent. Retrying the same desired mutation after a lost completion preserves identity.

An unconfirmed create followed by delete leaves no delivery intent. Confirmed edits and deletes
retain the authority needed for reconciliation. Marginalia from previous or known-closed Reading
Sessions remains read-only.

A persistence failure rolls back both stores. The visible authored change remains an unsaved draft
with the existing error state and retry-on-flush behavior; it is never reported as durably saved.

## Outbox and exact revisions

The Reader outbox stores domain desired state, never HTTP requests, bearer tokens, URLs, raw errors,
or response bodies. Its scope is:

- establish a writable Reading Session;
- replace latest progress;
- upsert a complete annotation; and
- delete an annotation.

Reading Session close, `start-over`, Reading Session metadata, Shelves, and other Library mutations
are excluded.

Progress coalesces to the latest value. Annotation intent coalesces by namespace, Book, target
Reading Session, and stable `clientId`. Mutable resources carry an `intentRevision`. Delivery
removes or replaces a resource only when the current revision still matches the attempted revision.
A newer local edit clears obsolete attempt state and remains eligible as new work.

Each current revision may retain one normalized attempt:

- classification;
- attempt count;
- attempt time; and
- computed `retryEligibleAt` for retry-later work.

No success history is stored.

## Replay and Reading Session continuation

Replay groups work by namespace and Book, then orders it as:

1. writable Reading Session authority;
2. annotations;
3. latest progress.

Annotation replay delivers already-durable desired state; it does not create new authoring intent.
It sends one bounded batch of complete eligible desired state. It adopts the returned
server collection as baseline, overlays newer local intent, and acknowledges only exact delivered
revisions. Progress replay reloads current desired progress and applies the same exact-revision
rule. A later-stage failure does not undo an earlier successful stage.

`409 SESSION_CLOSED` never writes to the closed Reading Session. Reconciliation obtains another
writable Reading Session:

- local-unconfirmed annotation upserts retain their `clientId`;
- confirmed historical upserts receive a new stable `clientId`;
- progress transfers as the latest desired value; and
- confirmed deletes against the closed Reading Session are dropped rather than applied elsewhere.

Continuation uses the same local annotation commit repository and desired-state policy as ordinary
authoring. The annotation projection and outbox changes commit in one IndexedDB transaction.
The commit rechecks exact intent revisions and matching projection content; a conflict leaves both
stores unchanged for a later retry. A committed continuation therefore survives an interrupted or
unobserved completion without assigning another replacement identity.

The automatic sweep may report copied edits and dropped deletes in one nonblocking notice.
`start-over` remains explicit user intent.

## Failure and retry policy

Delivery failures are normalized as follows:

| Failure | Policy |
| --- | --- |
| Network interruption, `429`, `5xx`, or `IDEMPOTENCY_IN_PROGRESS` | Retry later |
| `401` | Repair authentication |
| `403` or ambiguous `404` | Refresh authority; do not retry blindly |
| Validation failure or `IDEMPOTENCY_KEY_REUSED` | Manual attention |
| `409 SESSION_CLOSED` | Reading Session continuation |
| Unknown failure | Manual attention |

Retry-later delay starts at 30 seconds, doubles per attempt, and caps at 15 minutes. A normalized
server retry delay overrides the computed backoff. The resulting `retryEligibleAt` is stored on the
exact resource revision.

Automatic sync skips deferred, authentication-blocked, authority-blocked, terminal, and unknown
manual-only resources. It may still deliver eligible progress when an unrelated annotation needs
attention. A verified user's explicit Settings retry overrides retry timing and manual-only
eligibility; repair-required state blocks network delivery.

## Foreground sync and coordination

Automatic delivery runs after authenticated startup when connectivity is `online`, after an
`offline` to `online` transition, and when the foreground retry scheduler reaches durable
eligibility.

One authenticated namespace generation owns the startup decision and connectivity-transition
subscription. The retry scheduler remains a separate durable-state lifecycle.

The namespace sweep lists the outbox once, derives eligible Books, and uses at most three workers.
Each Book sync obtains an exclusive Web Lock scoped by namespace and Book. Automatic callers use
non-waiting `if-available` coordination; Settings and connection removal use waiting coordination.
A busy lock is normal cross-tab contention and does not start a tight retry loop.

One foreground timer per authenticated namespace tracks the earliest future
`retryEligibleAt`. Outbox changes rescan the schedule. At wake, the scheduler rechecks namespace,
connectivity, and durable state before invoking the shared automatic sweep. Offline or `unknown`
connectivity cancels timer-driven delivery. Returning to a visible tab rescans overdue work to
tolerate browser timer throttling.

The timer is derived state. It does not recalculate backoff, create per-Book timers, poll, or promise
execution after the app or browser closes.

Routine success remains silent. New continuation or terminal outcomes may feed the existing
aggregated notice. Merely loading durable terminal state does not repeat a warning.

## Settings

Settings > Offline is the management surface for the verified namespace. It lists retained
publication assets and Books with pending Reader work, using cached titles or a Book-ID fallback.
Statuses distinguish Waiting to sync, Waiting to retry, Needs attention, connection repair, and
authority blocking without exposing internal revisions, IDs, or payloads.

Global and per-Book Retry use the shared waiting coordination path. Pending reading-position
delivery may be discarded without removing the durable local position used for resume. Annotation
discard is unavailable because the local projection does not retain a separate authoritative
baseline for safely undoing confirmed edits or deletes.

Removing one or all offline copies affects publication assets and durable covers only. It does not
remove authored Reader data.

## Sign out, Forget, and repair

Sign out and Forget connection and local data use complete namespace cleanup:

1. Inspect pending Reader work.
2. When online, attempt one waiting coordinated sync.
3. Re-read durable pending state.
4. Warn before discarding unsynced work.
5. Remove projections, covers, publication assets, Reader state, and outbox records in one
   IndexedDB transaction. Any store failure aborts the complete namespace deletion.
6. Remove the active connection only after local cleanup succeeds.

If remote sign-out succeeds but cleanup fails, the client retains enough local connection context
to retry cleanup. Intentional removal never leaves dormant account namespaces.

Authentication failure alone is nondestructive. Same-identity repair restores access to the existing
namespace; different-identity verification deletes the old namespace before activation.

## Browser requirements and unsupported capabilities

IndexedDB must pass a lightweight open-and-close probe before the application claims offline
storage support. Storage estimates and persistence APIs refine that capability but do not replace
the IndexedDB requirement. Capability inspection may create the empty versioned database; only the
explicit Available offline action requests persistent storage.

Web Locks require browser support and a secure context. Production HTTPS is supplied by the
operator-managed reverse proxy; internal HTTP to container nginx is valid. See
[deployment.md](./deployment.md).

The application intentionally does not support service-worker delivery, browser Background Sync,
periodic polling, offline Shelf management, standalone offline Reading Session management, general
catalog caching, partial publication downloads, or resumable downloads.

## Testing priorities

Tests protect namespace isolation, publication integrity, exact revision acknowledgement,
closed-Reading-Session immutability, latest-only progress, stable annotation identity, retry
eligibility, cross-tab ownership, cleanup, and zero-network offline route boundaries. They do not
lock down documentation prose or repository layout.
