# Static Docker Deployment

The `docker/` deployment kit packages the Vite Reader client as static files served by nginx. It does not include backend proxying, TLS, public hostnames, or SecondPass Library credentials. Put a reverse proxy in front of the container for those concerns.

## Quick start

No `.env` file is required. Copy the Compose example, then build and run the Reader:

```bash
cp docker/compose.example.yml docker/compose.yml
docker/restart.sh
```

The container listens on port `8000`, which Compose exposes to other containers without publishing it on the host. Route a reverse proxy on the same Docker network to `web:8000`. Copy `docker/.env.example` to `docker/.env` only when configuring server presets.

## Optional server presets

Copy `docker/.env.example` to `docker/.env`, then configure known Library servers using one of the forms below. For the JSON form, set one JSON array:

```dotenv
SECONDPASS_SERVER_PRESETS_JSON=[{"name":"Production Library","url":"https://library.example.com"}]
```

Alternatively, leave `SECONDPASS_SERVER_PRESETS_JSON` empty and use indexed name/URL pairs:

```dotenv
SECONDPASS_SERVER_1_NAME=Production Library
SECONDPASS_SERVER_1_URL=https://library.example.com
SECONDPASS_SERVER_2_NAME=Local Library
SECONDPASS_SERVER_2_URL=http://localhost:8000
```

A valid `SECONDPASS_SERVER_PRESETS_JSON` value takes precedence, including `[]`. Otherwise, complete indexed pairs are used and incomplete pairs are ignored. Container startup writes the resulting public, credential-free array to `/usr/share/nginx/html/secondpass-servers.json`, served by nginx at `/secondpass-servers.json`; no configuration produces `[]`.

After changing presets, run `docker compose -f docker/compose.yml up -d web` to recreate/restart the container with the new environment. The image does not need to be rebuilt. Presets are only UI hints: selecting one still makes the Reader verify that server through `/.well-known/secondpass` before pairing. They do not carry tokens or bypass linking.

## Version stamp

Vite stamps each build with `git describe --tags --always --dirty` and the latest commit date. Local builds read those values directly from Git. `docker/restart.sh` passes them into the Docker build because the image build context intentionally excludes `.git`.

The compiled values are shown under Settings > Library Server > This Device. Builds without Git metadata or explicit Docker build arguments report `development` and `unknown` rather than inventing a release identity.

The version stamp is static build metadata. Runtime server-preset changes do not alter it and do not require an image rebuild.

## Reverse proxy

For production, route your public reverse proxy to the reader container on internal port `8000`. The nginx config inside this image only serves the static Vite build and falls back to `/index.html` for SPA routes.

The Reader remains a standalone static app. Users still pair it to a SecondPass Library through the app UI using the PIN/code Client API linking flow. Do not put bearer tokens, credentials, or server API secrets in preset configuration.

## Build without compose

```bash
docker build -f docker/Dockerfile \
  --build-arg SECONDPASS_WEBCLIENT_VERSION="$(git describe --tags --always --dirty)" \
  --build-arg SECONDPASS_WEBCLIENT_RELEASE_DATE="$(git log -1 --format=%cs)" \
  -t secondpassreader-webclient:local .
docker run --rm -p 8000:8000 secondpassreader-webclient:local
```
