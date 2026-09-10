# Static Docker Deployment

The `docker/` kit serves the Vite build as static files through nginx. It does not configure a
backend proxy, TLS, public hostnames, or Second Pass Library credentials. The supported production
shape is:

```text
HTTPS browser
  -> operator-managed reverse proxy or ingress (DNS, TLS, public access)
  -> private HTTP to secondpassreader-webclient:8000
  -> container nginx (static SPA, runtime presets, health endpoint)
```

Internal HTTP is expected. The operator-managed public HTTPS origin, not the internal hop, gives
the browser the secure context required by Web Locks and other offline-storage capabilities.

## Quick start

No `.env` file is required. Copy the Compose example, then build and run the Reader:

```bash
cp docker/compose.example.yml docker/compose.yml
docker/restart.sh
```

The container listens on HTTP port `8000`, which Compose exposes to other containers without
publishing it on the host. Route an operator-managed proxy on the same private network to
`secondpassreader-webclient:8000`. Copy `docker/.env.example` to `docker/.env` only when configuring
server presets.

## Optional server presets

Copy `docker/.env.example` to `docker/.env`, then configure known Library server URLs. The canonical
JSON form is an array of strings:

```dotenv
SECONDPASS_SERVER_PRESETS_JSON=["https://library.example.com","https://library-two.example.com"]
```

Alternatively, leave `SECONDPASS_SERVER_PRESETS_JSON` empty and use indexed URLs:

```dotenv
SECONDPASS_SERVER_1_URL=https://library.example.com
SECONDPASS_SERVER_2_URL=https://library-two.example.com
```

A valid `SECONDPASS_SERVER_PRESETS_JSON` value takes precedence, including `[]`. If it is empty or
invalid, startup reads non-empty indexed URL values. It trims URLs, then writes the public,
credential-free string array to `/usr/share/nginx/html/secondpass-servers.json`, which nginx
serves at `/secondpass-servers.json`. With no configuration, the file contains `[]`.

After changing presets, run `docker compose -f docker/compose.yml up -d secondpassreader-webclient`
to recreate the container with the new environment. You do not need to rebuild the image. Presets
only populate the server picker. On page load, the Reader requests each server's name and
description through unauthenticated discovery. Selecting a preset fills the URL field at any point
during that request. The normal Connect action verifies the server again before the existing
PIN/code pairing flow. Presets contain no display names or tokens and do not bypass linking.

## Version stamp

Vite stamps each build with `git describe --tags --always --dirty` and the latest commit date. Local
builds read both values from Git. `docker/restart.sh` passes them to Docker because `.git` is excluded
from the image build context.

The compiled values are shown under Settings > Library Server > This Device. Builds without Git metadata or explicit Docker build arguments report `development` and `unknown` rather than inventing a release identity.

The version stamp is build metadata. Changing server presets does not alter it or require an image
rebuild.

## Reverse proxy

For production, route the public reverse proxy to the Reader container on internal HTTP port
`8000`. Public DNS, certificates, TLS termination, exposure controls, and any edge-level HSTS are
operator responsibilities. Do not configure certificate paths or an internal HTTP-to-HTTPS redirect
for this container.

Container nginx serves only static files. It does not use `Host`, `Forwarded`, `X-Forwarded-Proto`,
`X-Forwarded-Host`, or `X-Forwarded-For` to generate URLs or redirects. Preserving `Host` is harmless
and often useful for ordinary proxy logs, but none of those headers is required by the application.
The container logs the immediate network peer and does not trust forwarded client IP headers.

The app is supported at the origin root, such as `https://reader.example.com/`. It is not currently
configured or tested for a subpath such as `/reader/`: Vite assets, the favicon, and
`/secondpass-servers.json` use root-relative URLs. Application navigation uses URL fragments such as
`/#/library`, so the fragment is never sent to nginx. The existing nginx fallback serves
`index.html`; dedicated asset, favicon, and runtime-preset locations return normal missing-file
responses instead of rewriting those requests.

Users pair the static Reader app to a Second Pass Library through the PIN/code Client API flow. Do
not put bearer tokens, credentials, or server API secrets in preset configuration.

## Browser-to-Library connectivity

The browser calls each configured Second Pass Library directly using the absolute origins returned
by discovery. The Reader container does not proxy Library API, publication, cover, WebSocket, or SSE
traffic. Therefore:

- the Library must be reachable from the user's browser, not merely from the Reader container;
- the Library must allow the Reader's public origin through its CORS policy;
- an HTTPS Reader deployment must use HTTPS-compatible Library and discovery URLs, or browser
  mixed-content policy will block them; and
- the operator's Reader reverse proxy does not remove the Library's CORS responsibility.

There is currently no WebSocket, SSE, service-worker, or proxy-upgrade requirement.

## Health and caching

`GET /healthz` returns `204` from container nginx without contacting a Library server, requiring
authentication, or depending on TLS. The image healthcheck probes
`http://127.0.0.1:8000/healthz`; an operator may use the same path through the private network.

| Resource | Container cache policy |
| --- | --- |
| `/assets/*` content-hashed build files | `public, max-age=31536000, immutable` |
| `/index.html` and the `/` document | `no-cache` |
| `/secondpass-servers.json` | `no-store` |
| `/favicon.png` | `public, max-age=86400` |
| `/healthz` | `no-store` |

An edge proxy may augment compression and caching, but it must not make `index.html` or runtime
presets immutable. The repository does not require Brotli or precompressed files, and the container
does not explicitly enable compression. Compression at the edge is optional.

The container does not currently impose CSP, COOP, COEP, CORP, frame, or Permissions Policy
headers. EPUB rendering, Blob URLs, remote Library origins, and dynamic imports require a dedicated
compatibility review before adding an aggressive CSP. HSTS belongs at the public HTTPS edge.

Official nginx container logging remains on stdout/stderr. Hashed asset and healthcheck access logs
are suppressed; application document and nginx error requests remain visible. URL fragments and
bearer authorization headers are not included in nginx request lines.

## Runtime filesystem

At startup, the entrypoint atomically writes `secondpass-servers.json` into the nginx document root.
The container therefore requires that location and nginx's normal runtime paths to be writable; a
fully read-only root filesystem is not currently supported. Supply presets through environment
variables rather than mounting a read-only file over the generated path.

## Build without compose

```bash
docker build -f docker/Dockerfile \
  --build-arg SECONDPASS_WEBCLIENT_VERSION="$(git describe --tags --always --dirty)" \
  --build-arg SECONDPASS_WEBCLIENT_RELEASE_DATE="$(git log -1 --format=%cs)" \
  -t secondpassreader-webclient:local .
docker run --rm -p 8000:8000 secondpassreader-webclient:local
```

Publishing port 8000 is useful for local verification. In production, keep the container on a
private network and expose it through the operator-managed HTTPS proxy.
