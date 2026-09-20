# `@secondpass/client`

`@secondpass/client` is the TypeScript SDK used by Second Pass Reader. It exposes workflow-shaped
methods rather than raw endpoints. Application code should not construct server payloads,
authentication headers, or publication URLs for normal flows.

## Workspace import

```ts
import { createSecondPassClient, deriveApiRootUrl } from "@secondpass/client";
```

## Create a client

```ts
const spl = createSecondPassClient({
  apiRootUrl: deriveApiRootUrl(libraryBaseUrl),
  accessToken,
  tokenType,
});

`serverId` identifies a Library; its base URLs are routes. The SDK derives the API root from the
current root-mounted Library URL. Authenticated server info exposes ordered `serverUrls` without
implying that each route is reachable.
```

`accessToken` is optional for public discovery, linking, and cover retrieval. It is required for
`spl.server.info()` and all other account, Library, Shelf, publication, and Marginalia operations.
`tokenType` defaults to `Bearer`.

## Documentation

- [API](docs/API.md)
- [Data model](docs/DATA_MODEL.md)

## Validation

Run from the repository root:

```powershell
npm.cmd --prefix packages/secondpass-client test
npm.cmd --prefix packages/secondpass-client run build
```
