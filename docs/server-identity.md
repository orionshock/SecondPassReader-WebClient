# Library identity and routes

The Library's `server_id` is a stable UUID identifying one installation. A Library base URL is a
route to that installation. Multiple URLs can lead to the same ID, and the same URL can later lead
to a different ID. Public `/.well-known/secondpass` supplies the ID and display metadata. The
client derives the API root as `<Library base URL>/api/v1/` for a root-mounted Library. Authenticated
`/api/v1/server/info/` confirms the ID and supplies ordered `server_urls`.

The declared URL order is operator preference. The client preserves it without sorting, deduping,
categorizing, or assuming reachability. The current route is stored separately. Automatic fallback,
route probing, and route selection are not implemented. Before a future route switch, the client
must confirm the candidate's `server_id` by HTTP. mDNS is not implemented in this Web Client; any
future mDNS result would be a candidate URL, with HTTP discovery establishing identity.

## URL and identity inventory

| Owner | URL use | Classification | Current action | Later work |
| --- | --- | --- | --- | --- |
| SDK `ClientApiAuth.Api`, `ServerRoute.Policy`, `ApiHttp.Adapter` | Public discovery, Client API calls, authenticated API root | Location | Derive one API root from the entered base URL; keep public calls anonymous | None |
| SDK `Server.Api`, server schema | Authenticated ID and declared routes | Identity plus location list | Validate UUID and route structure; preserve list order | Route selection |
| `ConnectionServer.Queries`, Connect screen, linking flow | Normalize entered URL, discover ID, pair through that route | Location plus identity | Keep one current route and explicit discovered ID | Reconnect flow |
| `ActiveConnection.Store` | Persisted ID, current route, declared routes; exact-record publication snapshot | Mixed | Validate and persist all three; retain generation and full-record stale guard | None |
| `ConnectionAccountProfile.Mapper`, verification, authenticated refresh, Settings check | Compare server IDs and verified profile IDs; refresh metadata | Identity | Reject mismatched IDs before publishing; retain profile identity | Alternate route verification |
| `ConnectionRepair.Controller`, `OfflineCacheNamespace.Policy` | Origin plus profile namespace and repair cleanup | Route used as offline identity | Keep formula and cleanup unchanged in this pass | Namespace cutover |
| `AppAuthenticatedOfflineSync.Lifecycle`, Book availability | Build namespace and start sync | Route used as offline identity | Retain route-based key | Namespace cutover |
| Home/Library/Book Detail offline controllers, projection publication | Read and write namespace-scoped projections | Namespace ownership | No change | Namespace cutover |
| Reader state, outbox, publication assets/covers repositories | Namespace-indexed data and deletion | Namespace ownership | No change | Namespace cutover |
| Home, Shelves, Library, Book Detail, Reader cover components | Relative image and publication URL resolution | Location | Use current route | Route switch invalidation |
| Settings, app summary, debug details | Current Library URL and server details | Location plus identity in diagnostics | Show ID and declared routes in diagnostics | Route picker |

## Offline namespace impact report

`OfflineCacheNamespace.Policy` currently forms
`server:<encoded normalized origin>|profile:<encoded verified profile ID>`. The URL is serving as
offline identity here, even though Library identity is now `serverId`. This remains an explicit
exception until a separate namespace design pass.

1. Switching to `serverId + profileId` changes every namespace key and the admission keys for
   projections, Home/Library/Book Detail caches, publication assets and covers, reader state,
   reader outbox, sync locks, and queued projection writes. The IndexedDB schema can still use a
   string namespace key; its records and ownership decisions change.
2. A verified route switch to the same server ID and profile could then preserve offline data.
   The new route must be verified before old data becomes usable under it. Cover source resolution
   currently uses `namespace.serverOrigin` and would need the active route as a separate input.
3. Repair compares `serverId` and profile ID for domain sameness, but it still removes the old
   namespace whenever the route-derived key changes. It refuses a different server ID at the
   same route because the current namespace cannot isolate that data. Connection removal deletes
   the one active namespace across all five stores.
4. Because this is pre-release and local test data may be discarded, a destructive cutover is
   simpler than migrating every record and in-flight writer. It still needs an explicit design for
   timing, cleanup failure, browser tabs, and pending outbox intent.
5. The next pass must update namespace policy and retention/atomic-cleanup tests, connection repair
   tests, offline sync and publication tests, Home/Library/Book Detail cache tests, cover-source
   tests, and publication-generation guards. A route-switch test must prove same ID plus profile
   retains data and a different ID at the same URL cannot read it.
