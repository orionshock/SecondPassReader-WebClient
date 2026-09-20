# Static Docker deployment

Second Pass Reader ships as a static Vite application served by container nginx on HTTP port
`8000`. The container does not own public ingress, TLS, DNS, or Second Pass Library credentials.

```text
HTTPS browser
  -> operator-managed reverse proxy or ingress
  -> private HTTP to secondpassreader-webclient:8000
  -> container nginx
```

| Concern | Owner |
| --- | --- |
| Public DNS, ingress, certificates, TLS, exposure controls, and edge HSTS | Operator |
| Static SPA, runtime presets, cache headers, and `/healthz` | Container nginx |
| Library API, publication, and cover requests | Browser to Second Pass Library |
| API CORS and HTTPS compatibility | Second Pass Library and operator configuration |

The browser-facing HTTPS origin provides the secure context required by Web Locks and offline
storage. Plain HTTP between the TLS-terminating proxy and the container is expected.

## Start with Compose

No `.env` file is required. Copy the example and start the container:

```bash
cp docker/compose.example.yml docker/compose.yml
docker/rebuild-deployment.sh
```

Compose exposes port `8000` to its container network without publishing it on the host. Connect the
operator-managed proxy to `secondpassreader-webclient:8000` on that private network.

## Runtime Library presets

Presets populate the connection page with Second Pass Library URLs. They contain no display names,
tokens, or credentials and do not bypass discovery, linking, or verification.

Copy `docker/.env.example` to `docker/.env` and provide either a JSON array:

```dotenv
SECONDPASS_SERVER_PRESETS_JSON=["https://library.example.com","https://library-two.example.com"]
```

or indexed URLs:

```dotenv
SECONDPASS_SERVER_1_URL=https://library.example.com
SECONDPASS_SERVER_2_URL=https://library-two.example.com
```

A valid `SECONDPASS_SERVER_PRESETS_JSON` value takes precedence, including `[]`. If that value is
empty or invalid, startup reads non-empty indexed URLs. With no configured URLs, the generated file
contains `[]`.

The entrypoint trims the URLs and atomically writes the credential-free array to
`/usr/share/nginx/html/secondpass-servers.json`. nginx serves it as
`/secondpass-servers.json` with `Cache-Control: no-store`.

After changing presets, recreate the container without rebuilding the image:

```bash
docker compose -f docker/compose.yml up -d secondpassreader-webclient
```

On page load, the browser obtains each preset's public name and description through unauthenticated
discovery. Selecting a preset fills the connection URL; Connect verifies it again before starting
the PIN/code flow.

## Reverse proxy and Library access

Route the public proxy to container port `8000`. Do not configure certificate paths or internal
HTTP-to-HTTPS redirects in this container.

Container nginx does not use `Host`, `Forwarded`, `X-Forwarded-Proto`, `X-Forwarded-Host`, or
`X-Forwarded-For` to generate URLs or redirects. Those headers are not application requirements.
Preserving `Host` may still be useful for proxy logs. nginx records the immediate network peer and
does not trust forwarded client-IP headers.

The browser calls each configured Second Pass Library directly. The Reader container does not proxy
Library API, publication, cover, WebSocket, or SSE traffic. Therefore:

- each Library must be reachable from the user's browser;
- each Library must allow the Reader's public origin through CORS; and
- an HTTPS Reader must use HTTPS-compatible Library and discovery URLs to avoid mixed-content
  blocking.

The operator's Reader proxy does not remove the Library's CORS responsibility. No WebSocket, SSE,
service-worker, or proxy-upgrade support is required.

## Base path and SPA routing

Deploy the app at an origin root such as `https://reader.example.com/`. Subpath deployment such as
`/reader/` is unsupported: Vite assets, the favicon, and `/secondpass-servers.json` use root-relative
URLs.

Application navigation uses fragments such as `/#/library`, which browsers do not send to nginx.
The nginx fallback serves `index.html` for application paths. Dedicated asset, favicon, and preset
locations return normal missing-file responses instead of rewriting them to the SPA.

## Version stamp

Vite stamps builds with `git describe --tags --always --dirty` and the latest commit date.
`docker/rebuild-deployment.sh` supplies both values because `.git` is excluded from the Docker build context.

Settings > Library Server > This Device displays the compiled values. Builds without Git metadata
or explicit build arguments report `development` and `unknown`. Changing runtime presets does not
change the version stamp.

## Health and caching

`GET /healthz` returns `204` from container nginx without contacting Second Pass Library, requiring
authentication, or depending on TLS. The image healthcheck requests
`http://127.0.0.1:8000/healthz`; operators may use the same path over the private network.

| Resource | Container cache policy |
| --- | --- |
| `/assets/*` content-hashed files | `public, max-age=31536000, immutable` |
| `/index.html` and `/` | `no-cache` |
| `/secondpass-servers.json` | `no-store` |
| `/favicon.png` | `public, max-age=86400` |
| `/healthz` | `no-store` |

An edge may add compression or compatible cache behavior, but it must not make `index.html` or the
runtime presets immutable. The container does not explicitly enable compression and ships no
precompressed files.

The container does not set CSP, COOP, COEP, CORP, frame, or Permissions Policy headers. EPUB
rendering, Blob URLs, remote Library origins, and dynamic imports require compatibility review before
adding an aggressive CSP. Set HSTS at the public HTTPS edge.

nginx logs to stdout and stderr. Hashed assets and healthchecks omit access logs; document requests
and nginx errors remain visible. URL fragments and bearer authorization headers do not appear in
nginx request lines.

## Runtime filesystem

The entrypoint writes `secondpass-servers.json` into the nginx document root. That location and
nginx's standard runtime paths must be writable; a fully read-only root filesystem is unsupported.
Supply presets through environment variables rather than mounting a read-only file over the
generated path.

## Build without Compose

```bash
docker build -f docker/Dockerfile \
  --build-arg SECONDPASS_WEBCLIENT_VERSION="$(git describe --tags --always --dirty)" \
  --build-arg SECONDPASS_WEBCLIENT_RELEASE_DATE="$(git log -1 --format=%cs)" \
  -t secondpassreader-webclient:local .
docker run --rm -p 8000:8000 secondpassreader-webclient:local
```

Publishing port `8000` is appropriate for local verification. In production, keep the container on
a private network behind the operator-managed HTTPS proxy.
