#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE="$SCRIPT_DIR/compose.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Compose file not found: $COMPOSE_FILE" >&2
    echo "Create it from $SCRIPT_DIR/compose.example.yml first." >&2
    exit 1
fi

cd "$REPOSITORY_ROOT"

VERSION=$(git describe --tags --always --dirty)
RELEASE_DATE=$(git log -1 --format=%cs)
export SECONDPASS_WEBCLIENT_VERSION="$VERSION"
export SECONDPASS_WEBCLIENT_RELEASE_DATE="$RELEASE_DATE"

echo "Stopping SecondPassReader-WebClient..."
docker compose -f "$COMPOSE_FILE" down

echo "Building SecondPassReader-WebClient $VERSION ($RELEASE_DATE)..."
docker compose -f "$COMPOSE_FILE" up -d --build web
