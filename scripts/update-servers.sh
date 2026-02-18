#!/usr/bin/env bash
# Update @nikolasp98/minion on all production servers (parallel).
# Reads server list from .github/servers/production.json.
#
# Usage:
#   bash scripts/update-servers.sh [tag]
#
# Examples:
#   bash scripts/update-servers.sh              # installs @latest
#   bash scripts/update-servers.sh dev          # installs @dev
#   bash scripts/update-servers.sh 2026.2.18-7  # installs specific version

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$ROOT_DIR/.github/servers/production.json"
PKG="@nikolasp98/minion"
TAG="${1:-latest}"

if [[ ! -f "$CONFIG" ]]; then
  echo "ERROR: $CONFIG not found" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required" >&2
  exit 1
fi

SERVER_COUNT=$(jq '.servers | length' "$CONFIG")
echo "Updating $SERVER_COUNT servers to $PKG@$TAG (parallel)"
echo ""

TMPDIR_LOGS=$(mktemp -d)
PIDS=()
SERVER_IDS=()

for i in $(seq 0 $((SERVER_COUNT - 1))); do
  ID=$(jq -r ".servers[$i].id" "$CONFIG")
  HOST=$(jq -r ".servers[$i].host" "$CONFIG")
  USER=$(jq -r ".servers[$i].user" "$CONFIG")
  ADMIN=$(jq -r ".servers[$i].admin_user // .servers[$i].user" "$CONFIG")

  SERVER_IDS+=("$ID")

  (
    LOG="$TMPDIR_LOGS/$ID.log"
    echo "--- $ID ($HOST) ---" > "$LOG"

    # Install via admin user (has sudo)
    echo "  Installing via $ADMIN@$HOST..." >> "$LOG"
    if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$ADMIN@$HOST" \
      "sudo rm -rf /usr/lib/node_modules/$PKG && sudo npm cache clean --force 2>/dev/null && sudo npm install -g $PKG@$TAG" \
      2>&1 | grep -E "(added|up to date|ERR)" >> "$LOG" 2>&1; then
      echo "  FAILED: install" >> "$LOG"
      exit 1
    fi

    # Verify version via service user
    VERSION=$(ssh -o ConnectTimeout=5 "$USER@$HOST" "minion --version" 2>/dev/null || echo "unknown")
    echo "  Version: $VERSION" >> "$LOG"

    # Restart gateway via service user
    echo "  Restarting gateway via $USER@$HOST..." >> "$LOG"
    if ssh -o ConnectTimeout=10 -o BatchMode=yes "$USER@$HOST" \
      "XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user restart minion-gateway" >> "$LOG" 2>&1; then
      sleep 2
      STATUS=$(ssh "$USER@$HOST" "XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user is-active minion-gateway" 2>/dev/null || echo "unknown")
      echo "  Gateway: $STATUS" >> "$LOG"
    else
      echo "  FAILED: restart" >> "$LOG"
      exit 1
    fi
  ) &
  PIDS+=($!)
done

# Wait for all and collect results
FAILED=()
for idx in "${!PIDS[@]}"; do
  if ! wait "${PIDS[$idx]}"; then
    FAILED+=("${SERVER_IDS[$idx]}")
  fi
done

# Print logs in order
for ID in "${SERVER_IDS[@]}"; do
  cat "$TMPDIR_LOGS/$ID.log"
  echo ""
done
rm -rf "$TMPDIR_LOGS"

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "FAILED servers: ${FAILED[*]}"
  exit 1
else
  echo "All $SERVER_COUNT servers updated to $PKG@$TAG"
fi
