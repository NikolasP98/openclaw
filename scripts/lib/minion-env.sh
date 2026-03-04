#!/usr/bin/env bash
# Shared environment derivation for Minion Docker scripts.
# Sources container names, config dirs, and other derived values.

# Derive a slug from the image name for container naming.
# e.g. "myrepo/minion:1.0" -> "minion_1_0", "minion:local" -> "minion_local"
_MINION_IMAGE_SLUG="${MINION_IMAGE:-minion}"
_MINION_IMAGE_SLUG="${_MINION_IMAGE_SLUG##*/}"            # strip registry/repo prefix
_MINION_IMAGE_SLUG="${_MINION_IMAGE_SLUG//:/_}"           # colon -> underscore
_MINION_IMAGE_SLUG="${_MINION_IMAGE_SLUG//[^a-zA-Z0-9_]/_}" # sanitize

: "${MINION_ENV:=}"
: "${MINION_TENANT:=}"

# Derive container names from image slug (+ optional env/tenant suffix).
_MINION_NAME_SUFFIX=""
if [[ -n "${MINION_ENV:-}" ]]; then
  _MINION_NAME_SUFFIX="_${MINION_ENV}"
fi
if [[ -n "${MINION_TENANT:-}" ]]; then
  _MINION_NAME_SUFFIX="${_MINION_NAME_SUFFIX}_${MINION_TENANT}"
fi

MINION_GATEWAY_CONTAINER_NAME="${MINION_GATEWAY_CONTAINER_NAME:-minion_gateway${_MINION_NAME_SUFFIX}}"
MINION_CLI_CONTAINER_NAME="${MINION_CLI_CONTAINER_NAME:-minion_cli${_MINION_NAME_SUFFIX}}"

export MINION_GATEWAY_CONTAINER_NAME
export MINION_CLI_CONTAINER_NAME
export MINION_ENV
export MINION_TENANT
