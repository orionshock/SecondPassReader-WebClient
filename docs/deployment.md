# Static Docker Deployment

This deployment kit packages the Vite Reader client as static files served by nginx. It does not include backend proxying, TLS, public hostnames, or SecondPass Library credentials. Put a reverse proxy in front of the container for those concerns.

## Quick start

No `.env` file is required. Copy the Compose example, then build and run the Reader:

```bash
cp compose.example.yml compose.yml
docker compose up -d --build
```

The container listens on port `8000`, which Compose exposes to other containers without publishing it on the host. Route a reverse proxy on the same Docker network to `secondpass-reader-client:8000`. Copy `.env.example` to `.env` only when configuring server presets.

## Optional server presets

Deployment operators can put known Library servers in `.env`. Use one JSON array:

```dotenv
SECONDPASS_SERVER_PRESETS_JSON=[{"name":"Production Library","url":"https://library.example.com"}]
```

Or use indexed name/URL pairs:

```dotenv
SECONDPASS_SERVER_1_NAME=Production Library
SECONDPASS_SERVER_1_URL=https://library.example.com
SECONDPASS_SERVER_2_NAME=Local Library
SECONDPASS_SERVER_2_URL=http://localhost:8000
```

A valid `SECONDPASS_SERVER_PRESETS_JSON` value takes precedence. Otherwise, complete indexed pairs are used and incomplete pairs are ignored. Container startup writes the resulting public, credential-free array to `/secondpass-servers.json`; no configuration produces `[]`.

After changing presets, run `docker compose up -d` to recreate/restart the container with the new environment. The image does not need to be rebuilt. Presets are only UI hints: selecting one still makes the Reader verify that server through `/.well-known/secondpass` before pairing. They do not carry tokens or bypass linking.

## Reverse proxy

For production, route your public reverse proxy to the reader container on internal port `8000`. The nginx config inside this image only serves the static Vite build and falls back to `/index.html` for SPA routes.

The Reader remains a standalone static app. Users still pair it to a SecondPass Library through the app UI using the PIN/code Client API linking flow. Do not put bearer tokens, credentials, or server API secrets in preset configuration.

## Build without compose

```bash
docker build -t secondpass-reader-client:local .
docker run --rm -p 8000:8000 secondpass-reader-client:local
```
