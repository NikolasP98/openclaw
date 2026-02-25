#!/usr/bin/env bash
set -euo pipefail

# Use the common git dir to find the main repo root (works from worktrees too)
_GIT_COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [[ -n "$_GIT_COMMON_DIR" ]]; then
  ROOT_DIR="$(cd "${_GIT_COMMON_DIR}/.." && pwd)"
else
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

if [[ $# -lt 1 ]]; then
  echo "usage: run-node-tool.sh <tool> [args...]" >&2
  exit 2
fi

tool="$1"
shift

if [[ -f "$ROOT_DIR/pnpm-lock.yaml" ]] && command -v pnpm >/dev/null 2>&1; then
  cd "$ROOT_DIR"
  exec pnpm exec "$tool" "$@"
fi

if { [[ -f "$ROOT_DIR/bun.lockb" ]] || [[ -f "$ROOT_DIR/bun.lock" ]]; } && command -v bun >/dev/null 2>&1; then
  cd "$ROOT_DIR"
  exec bunx --bun "$tool" "$@"
fi

if command -v npm >/dev/null 2>&1; then
  cd "$ROOT_DIR"
  exec npm exec -- "$tool" "$@"
fi

if command -v npx >/dev/null 2>&1; then
  exec npx "$tool" "$@"
fi

echo "Missing package manager: pnpm, bun, or npm required." >&2
exit 1
