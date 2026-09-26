#!/bin/sh
set -eu

if [ "$#" -ne 3 ] || [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: $0 <image> <expected-version> <expected-release-date>" >&2
    exit 2
fi

IMAGE=$1
EXPECTED_VERSION=$2
EXPECTED_RELEASE_DATE=$3
SMOKE_ID=${SECOND_PASS_SMOKE_ID:-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}}
SAFE_SMOKE_ID=$(printf '%s' "$SMOKE_ID" | tr -cd 'A-Za-z0-9_.-')
CONTAINER=secondpass-web-smoke-$SAFE_SMOKE_ID
CREATED=false

cleanup() {
    if [ "$CREATED" = true ]; then
        docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT HUP INT TERM

if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "Smoke container already exists: $CONTAINER" >&2
    exit 1
fi

docker run --detach --name "$CONTAINER" \
    --publish 127.0.0.1::8000 \
    --env 'SECONDPASS_SERVER_PRESETS_JSON=["https://library.example.com"]' \
    "$IMAGE" >/dev/null
CREATED=true

attempt=1
while [ "$attempt" -le 45 ]; do
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$CONTAINER")
    if [ "$health" = healthy ]; then
        break
    fi
    if [ "$health" = unhealthy ] || [ "$attempt" -eq 45 ]; then
        echo "Web image did not become healthy (status: $health)." >&2
        docker logs "$CONTAINER" >&2
        exit 1
    fi
    attempt=$((attempt + 1))
    sleep 1
done

docker port "$CONTAINER" 8000/tcp >/dev/null
docker exec "$CONTAINER" wget -q -O /dev/null http://127.0.0.1:8000/healthz
root_document=$(docker exec "$CONTAINER" wget -q -O - http://127.0.0.1:8000/)
case "$root_document" in
    *'<div id="root"></div>'*) ;;
    *) echo "Served root is not the Web Client application shell." >&2; exit 1 ;;
esac

presets=$(docker exec "$CONTAINER" wget -q -O - http://127.0.0.1:8000/secondpass-servers.json)
[ "$presets" = '["https://library.example.com"]' ] || {
    echo "Runtime Library presets were not generated correctly." >&2
    exit 1
}

docker exec "$CONTAINER" grep -R -F -- "$EXPECTED_VERSION" /usr/share/nginx/html/assets >/dev/null
docker exec "$CONTAINER" grep -R -F -- "$EXPECTED_RELEASE_DATE" /usr/share/nginx/html/assets >/dev/null

echo "Production image smoke test passed: $IMAGE ($EXPECTED_VERSION, $EXPECTED_RELEASE_DATE)"
