# Static Docker Deployment

The `docker/` kit serves the Vite build as static files through nginx. It does not configure a
backend proxy, TLS, public hostnames, or Second Pass Library credentials. Configure those at the
reverse proxy in front of the container.

## Quick start

No `.env` file is required. Copy the Compose example, then build and run the Reader:

```bash
cp docker/compose.example.yml docker/compose.yml
docker/restart.sh
```

The container listens on port `8000`, which Compose exposes to other containers without publishing it on the host. Route a reverse proxy on the same Docker network to `secondpassreader-webclient:8000`. Copy `docker/.env.example` to `docker/.env` only when configuring server presets.

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

A valid `SECONDPASS_SERVER_PRESETS_JSON` value takes precedence, including `[]`. If it is empty,
startup reads complete indexed pairs and ignores incomplete pairs. It writes the resulting public,
credential-free array to `/usr/share/nginx/html/secondpass-servers.json`, which nginx serves at
`/secondpass-servers.json`. With no configuration, the file contains `[]`.

After changing presets, run `docker compose -f docker/compose.yml up -d secondpassreader-webclient`
to recreate the container with the new environment. You do not need to rebuild the image. Presets
only populate the server picker. The Reader still verifies the selected server through
`/.well-known/secondpass` before pairing. Presets contain no tokens and do not bypass linking.

## Version stamp

Vite stamps each build with `git describe --tags --always --dirty` and the latest commit date. Local
builds read both values from Git. `docker/restart.sh` passes them to Docker because `.git` is excluded
from the image build context.

The compiled values are shown under Settings > Library Server > This Device. Builds without Git metadata or explicit Docker build arguments report `development` and `unknown` rather than inventing a release identity.

The version stamp is build metadata. Changing server presets does not alter it or require an image
rebuild.

## Reverse proxy

For production, route your public reverse proxy to the reader container on internal port `8000`. The nginx config inside this image only serves the static Vite build and falls back to `/index.html` for SPA routes.

Users pair the static Reader app to a Second Pass Library through the PIN/code Client API flow. Do
not put bearer tokens, credentials, or server API secrets in preset configuration.

## Build without compose

```bash
docker build -f docker/Dockerfile \
  --build-arg SECONDPASS_WEBCLIENT_VERSION="$(git describe --tags --always --dirty)" \
  --build-arg SECONDPASS_WEBCLIENT_RELEASE_DATE="$(git log -1 --format=%cs)" \
  -t secondpassreader-webclient:local .
docker run --rm -p 8000:8000 secondpassreader-webclient:local
```
