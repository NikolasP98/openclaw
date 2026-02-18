#!/usr/bin/env bash
# Update @nikolasp98/minion on all production servers.
# Reads server list from .github/servers/production.json.
#
# Usage:
#   bash scripts/update-servers.sh [tag]
#
# Examples:
#   bash scripts/update-servers.sh          # installs @latest
#   bash scripts/update-servers.sh dev      # installs @dev
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
echo "Updating $SERVER_COUNT servers to $PKG@$TAG"
echo ""

FAILED=()

for i in $(seq 0 $((SERVER_COUNT - 1))); do
  ID=$(jq -r ".servers[$i].id" "$CONFIG")
  HOST=$(jq -r ".servers[$i].host" "$CONFIG")
  USER=$(jq -r ".servers[$i].user" "$CONFIG")
  ADMIN=$(jq -r ".servers[$i].admin_user // .servers[$i].user" "$CONFIG")

  echo "--- $ID ($HOST) ---"

  # Install via admin user (has sudo)
  echo "  Installing via $ADMIN@$HOST..."
  if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$ADMIN@$HOST" \
    "sudo rm -rf /usr/lib/node_modules/$PKG && sudo npm cache clean --force 2>/dev/null && sudo npm install -g $PKG@$TAG" \
    2>&1 | grep -E "(added|up to date|ERR)"; then
    echo "  FAILED: install"
    FAILED+=("$ID")
    continue
  fi

  # Verify version
  VERSION=$(ssh -o ConnectTimeout=5 "$ADMIN@$HOST" "minion --version" 2>/dev/null || echo "unknown")
  echo "  Version: $VERSION"

  # Restart gateway via service user
  echo "  Restarting gateway via $USER@$HOST..."
  if ssh -o ConnectTimeout=10 -o BatchMode=yes "$USER@$HOST" \
    "XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user restart minion-gateway" 2>&1; then
    sleep 2
    STATUS=$(ssh "$USER@$HOST" "XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user is-active minion-gateway" 2>/dev/null || echo "unknown")
    echo "  Gateway: $STATUS"
  else
    echo "  FAILED: restart"
    FAILED+=("$ID")
  fi

  echo ""
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "FAILED servers: ${FAILED[*]}"
  exit 1
else
  echo "All $SERVER_COUNT servers updated to $PKG@$TAG"
fi
