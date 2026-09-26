# Registry-backed Docker deployment

Second Pass Reader is published as a static nginx image. A deployment host needs only Docker,
Docker Compose, registry access when required, and a copy of `docker/compose.example.yml`. It does
not need this repository, Git, Node.js, npm, or an application build toolchain.

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

## Start with Compose

1. Copy `docker/compose.example.yml` to the deployment host.
2. Edit the image tag, host port, and Library preset URLs inline.
3. If the registry requires authentication, run `docker login git.zcaprica.duckdns.org`.
4. Start the service:

```bash
docker compose up -d
```

The example is self-contained and does not require a `.env` file. Operators may use Compose
variable substitution or an env file in private deployment configuration, but neither is part of
the repository-owned example.

The example binds container port `8000` to `127.0.0.1:8000`. Change the host address or attach a
private Compose network when the reverse proxy runs elsewhere. Keep the service behind an
operator-managed HTTPS proxy in production.

## Image tags

The image repository is:

```text
git.zcaprica.duckdns.org/orionshock/secondpassreader-webclient
```

- `dev` is the latest development image that passed source verification, image build, image smoke,
  registry publication, and pull-back verification. It is mutable.
- `dev-sha-<full-commit-sha>` is the immutable identity behind a development publication.
- `alpha-rcN` and `alpha-rcN.M` are exact immutable release tags produced from matching Git tags.
- `sha-<full-commit-sha>` is the immutable forensic identity published with a release.
- `latest` is not published; no stable-release channel has been defined.

Use an immutable SHA or exact release tag for a reproducible deployment. Use `dev` only when the
deployment is intentionally following the verified development channel.

## Update a deployment

Change the image tag when moving to a different immutable build. When following the mutable `dev`
channel, leave the tag unchanged. Then run:

```bash
docker compose pull
docker compose up -d
```

Confirm the container is healthy and verify the application endpoint:

```bash
docker compose ps
curl -fsS -o /dev/null http://127.0.0.1:8000/
curl -fsS -o /dev/null http://127.0.0.1:8000/healthz
```

`/healthz` returns HTTP `204` without contacting Second Pass Library or requiring authentication.

## Runtime Library presets

The example defines `SECONDPASS_SERVER_PRESETS_JSON` inline. It is a JSON array of Library URLs:

```yaml
environment:
  SECONDPASS_SERVER_PRESETS_JSON: '["https://library.example.com","https://library-two.example.com"]'
```

Alternatively, private operator configuration may use indexed variables such as
`SECONDPASS_SERVER_1_URL` and `SECONDPASS_SERVER_2_URL`. A valid JSON array takes precedence,
including `[]`. With no valid configured URLs, the generated preset list is empty.

Presets contain no display names, tokens, or credentials. On startup the entrypoint trims the URLs
and atomically writes `/usr/share/nginx/html/secondpass-servers.json`. Selecting a preset still uses
normal public discovery, verification, and PIN/code linking.

## Image publication

Ordinary pushes and pull requests run the complete `npm run verify` gate and never build or publish
an image. The manually dispatched `Build development image` workflow publishes `dev-sha-*` and
advances `dev` only after its immutable image has been pulled back and smoked. Matching release Git
tags trigger the `Release` workflow, which publishes `sha-*` and the exact release tag; it does not
move `dev` or publish `latest`.

Workflow registry coordinates are repository variables named `REGISTRY_HOST`, `REGISTRY_IMAGE`, and
`REGISTRY_USERNAME`. `REGISTRY_TOKEN` is a repository secret containing a dedicated Gitea access
token limited to `write:package`; the OCI registry does not accept the Actions job token for Docker
login. Credentials must not be committed to workflows, Compose, or documentation examples.

## Reverse proxy and Library access

Route the public proxy to container port `8000`. Container nginx does not generate external URLs or
redirects from forwarded headers. Preserving `Host` may still be useful for proxy logs.

The browser calls each configured Second Pass Library directly. The Reader container does not proxy
Library API, publication, cover, WebSocket, or SSE traffic. Therefore each Library must be reachable
from the browser, allow the Reader's public origin through CORS, and use HTTPS-compatible URLs when
the Reader is served over HTTPS.

Deploy at an origin root such as `https://reader.example.com/`. Subpath deployment such as
`/reader/` is unsupported because assets and runtime preset URLs are root-relative. Fragment routes
such as `/#/library` remain browser-local; nginx supplies the normal SPA fallback for application
paths.

## Build identity, caching, and filesystem

Image workflows stamp the application with the exact image identity and source commit date. The
values appear in Settings > Library Server > This Device and are verified by the image smoke test.
Changing runtime presets does not change the build identity.

| Resource | Container cache policy |
| --- | --- |
| `/assets/*` content-hashed files | `public, max-age=31536000, immutable` |
| `/index.html` and `/` | `no-cache` |
| `/secondpass-servers.json` | `no-store` |
| `/favicon.png` | `public, max-age=86400` |
| `/healthz` | `no-store` |

nginx logs to stdout and stderr. Hashed assets and healthchecks omit access logs; document requests
and nginx errors remain visible. The entrypoint writes the runtime preset file into nginx's document
root, so that location and nginx's normal runtime paths must be writable. A fully read-only root
filesystem is unsupported.
