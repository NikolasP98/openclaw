#!/usr/bin/env bash
# Shared environment variable derivation for OpenClaw.
# Source this file AFTER setting any pre-source defaults (e.g. OPENCLAW_IMAGE).
# All derived variables respect existing overrides via ${VAR:-default}.

# --- OPENCLAW_ENV (required, default: dev, forced lowercase) ---
OPENCLAW_ENV="${OPENCLAW_ENV:-dev}"
OPENCLAW_ENV="$(printf '%s' "$OPENCLAW_ENV" | tr '[:upper:]' '[:lower:]')"

if ! [[ "$OPENCLAW_ENV" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
  echo "ERROR: OPENCLAW_ENV='$OPENCLAW_ENV' is invalid (must match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$)" >&2
  exit 1
fi

# --- OPENCLAW_TENANT (optional, forced lowercase) ---
OPENCLAW_TENANT="${OPENCLAW_TENANT:-}"
if [[ -n "$OPENCLAW_TENANT" ]]; then
  OPENCLAW_TENANT="$(printf '%s' "$OPENCLAW_TENANT" | tr '[:upper:]' '[:lower:]')"
  if ! [[ "$OPENCLAW_TENANT" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "ERROR: OPENCLAW_TENANT='$OPENCLAW_TENANT' is invalid (must match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$)" >&2
    exit 1
  fi
fi

# --- Compute suffixes ---
# Directories use hyphens: env or env-tenant
# Containers use underscores: env or env_tenant
if [[ -n "$OPENCLAW_TENANT" ]]; then
  _OC_DIR_SUFFIX="${OPENCLAW_ENV}-${OPENCLAW_TENANT}"
  _OC_CTR_SUFFIX="${OPENCLAW_ENV}_${OPENCLAW_TENANT}"
else
  _OC_DIR_SUFFIX="${OPENCLAW_ENV}"
  _OC_CTR_SUFFIX="${OPENCLAW_ENV}"
fi

# --- Derive variables (each individually overridable) ---
OPENCLAW_IMAGE="${OPENCLAW_IMAGE:-ghcr.io/nikolasp98/openclaw:${OPENCLAW_ENV}}"
OPENCLAW_GATEWAY_CONTAINER_NAME="${OPENCLAW_GATEWAY_CONTAINER_NAME:-openclaw_${_OC_CTR_SUFFIX}_gw}"
OPENCLAW_CLI_CONTAINER_NAME="${OPENCLAW_CLI_CONTAINER_NAME:-openclaw_${_OC_CTR_SUFFIX}_cli}"
OPENCLAW_CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-${HOME}/.openclaw-${_OC_DIR_SUFFIX}}"
OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${OPENCLAW_CONFIG_DIR}/workspace}"

# Clean up internal vars
unset _OC_DIR_SUFFIX _OC_CTR_SUFFIX
