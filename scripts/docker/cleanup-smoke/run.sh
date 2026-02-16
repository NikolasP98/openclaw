#!/usr/bin/env bash
set -euo pipefail

cd /repo

export MINION_STATE_DIR="/tmp/minion-test"
export MINION_CONFIG_PATH="${MINION_STATE_DIR}/minion.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${MINION_STATE_DIR}/credentials"
mkdir -p "${MINION_STATE_DIR}/agents/main/sessions"
echo '{}' >"${MINION_CONFIG_PATH}"
echo 'creds' >"${MINION_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${MINION_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm minion reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${MINION_CONFIG_PATH}"
test ! -d "${MINION_STATE_DIR}/credentials"
test ! -d "${MINION_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${MINION_STATE_DIR}/credentials"
echo '{}' >"${MINION_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm minion uninstall --state --yes --non-interactive

test ! -d "${MINION_STATE_DIR}"

echo "OK"
