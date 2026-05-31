# `@secondpass/client`

TypeScript client library for the Second Pass Reader app.

This package exposes product/workflow-shaped methods (not raw endpoints). App code should call the client facade and should not construct server wire payloads, auth headers, or download URLs for normal flows.

## Install / import (workspace)

```ts
import { createSecondPassClient } from "@secondpass/client";
```

## Create a client

```ts
const spl = createSecondPassClient({
  apiBaseUrl,
  accessToken, // optional for `spl.server.*`
  tokenType,   // optional, defaults to "Bearer"
});
```

- `spl.server.*` methods may run without an access token (discovery/linking).
- Other namespaces require auth and throw an `ApiError(kind="unauthorized")` if called without credentials.

## Docs

- API: `packages/secondpass-client/docs/API.md`
- Domain notes: `packages/secondpass-client/docs/DATA_MODEL.md`

## Tests

Run tests from the repo root:

```bash
npm run test
```

Or for this workspace only:

```bash
npm run test -w @secondpass/client
```

