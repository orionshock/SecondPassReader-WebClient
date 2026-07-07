# Static Docker Deployment

This deployment kit packages the Vite Reader client as static files served by nginx. It does not include backend proxying, TLS, public hostnames, or SecondPass Library credentials. Put a reverse proxy in front of the container for those concerns.

## Local compose test

Copy the examples and customize the names or local port as needed:

```bash
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
```

Then build and run:

```bash
docker compose up --build -d
```

By default, compose exposes the nginx service on port `8000` internally and can be reached from the reverse proxy on that same port. If you need to change the host-facing port, update the reverse proxy target rather than the container's internal listener.

## Reverse proxy

For production, route your public reverse proxy to the reader container on internal port `8000`. The nginx config inside this image only serves the static Vite build and falls back to `/index.html` for SPA routes.

The Reader remains a standalone static app. Users still pair it to a SecondPass Library through the app UI using the PIN/code Client API linking flow. Do not bake a Library server URL, bearer token, or server API secret into this image.

## Build without compose

```bash
docker build -t secondpass-reader-client:local .
docker run --rm -p 8000:8000 secondpass-reader-client:local
```
