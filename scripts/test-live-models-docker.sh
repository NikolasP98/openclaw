#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${MINION_IMAGE:-${MINIONBOT_IMAGE:-minion:local}}"
CONFIG_DIR="${MINION_CONFIG_DIR:-${MINIONBOT_CONFIG_DIR:-$HOME/.minion}}"
WORKSPACE_DIR="${MINION_WORKSPACE_DIR:-${MINIONBOT_WORKSPACE_DIR:-$HOME/.minion/workspace}}"
PROFILE_FILE="${MINION_PROFILE_FILE:-${MINIONBOT_PROFILE_FILE:-$HOME/.profile}}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e MINION_LIVE_TEST=1 \
  -e MINION_LIVE_MODELS="${MINION_LIVE_MODELS:-${MINIONBOT_LIVE_MODELS:-all}}" \
  -e MINION_LIVE_PROVIDERS="${MINION_LIVE_PROVIDERS:-${MINIONBOT_LIVE_PROVIDERS:-}}" \
  -e MINION_LIVE_MODEL_TIMEOUT_MS="${MINION_LIVE_MODEL_TIMEOUT_MS:-${MINIONBOT_LIVE_MODEL_TIMEOUT_MS:-}}" \
  -e MINION_LIVE_REQUIRE_PROFILE_KEYS="${MINION_LIVE_REQUIRE_PROFILE_KEYS:-${MINIONBOT_LIVE_REQUIRE_PROFILE_KEYS:-}}" \
  -v "$CONFIG_DIR":/home/node/.minion \
  -v "$WORKSPACE_DIR":/home/node/.minion/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"
