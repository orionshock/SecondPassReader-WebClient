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
| `ConnectionRepair.Controller`, `OfflineCacheNamespace.Policy` | Server ID plus profile namespace and repair cleanup | Durable identity | Preserve for same ID and profile; clean up a different identity | None |
| `AppAuthenticatedOfflineSync.Lifecycle`, Book availability | Build namespace and start sync | Durable identity | Keep the key across routes; replace sync generation when route changes | Route selection |
| Home/Library/Book Detail offline controllers, namespace publication | Read and write namespace-scoped projections | Namespace ownership | Protect current publication and cleanup lifetime | None |
| Reader state, outbox, publication assets/covers repositories | Namespace-indexed data and deletion | Namespace ownership | Keep one identity key across routes | None |
| Home, Shelves, Library, Book Detail, Reader cover components | Relative image and publication URL resolution | Location | Use current route | Route switch invalidation |
| Settings, app summary, debug details | Current Library URL and server details | Location plus identity in diagnostics | Show ID and declared routes in diagnostics | Route picker |

## Offline namespace

`OfflineCacheNamespace.Policy` forms
`server:<normalized UUID>|profile:<encoded verified profile ID>`. It does not accept a URL. This
pre-release cutover does not read or migrate old origin-based keys; old local data may be discarded.
IndexedDB remains at version 3 because its five stores still use a string `namespaceKey`.

The key scopes retained Home, Library, and Book Detail projections; publication assets and covers;
Reader state and outbox; foreground retry work; and Web Locks. A same-server route change keeps the
key and offline data. It replaces the active HTTP and sync generation, so work started against an
older route cannot publish as the current connection. Relative cover URLs resolve against the
current route, which is passed separately from the namespace.

Repair compares server ID and verified profile ID. It removes the prior namespace before saving a
different durable identity, including a different server behind the same URL or a different user on
the same server. Sign out and Forget delete the active namespace across all five stores. Automatic
route fallback remains a separate design pass; any candidate route must confirm the same server ID
before adoption.
