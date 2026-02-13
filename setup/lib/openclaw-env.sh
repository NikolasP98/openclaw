#!/usr/bin/env bash
# ---
# name: "OpenClaw Environment Derivation"
# description: >
#   Shared environment variable derivation for OpenClaw. Normalizes OPENCLAW_ENV
#   and OPENCLAW_TENANT, computes directory/service suffixes, and derives config
#   and workspace paths. Source this file AFTER setting any pre-source defaults.
# produces:
#   - "OPENCLAW_CONFIG_DIR, OPENCLAW_WORKSPACE_DIR"
#   - "Directory and service suffix variables"
# ---

# --- OPENCLAW_ENV (required, default: prd, forced lowercase) ---
OPENCLAW_ENV="${OPENCLAW_ENV:-prd}"
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
if [[ -n "$OPENCLAW_TENANT" ]]; then
    _OC_DIR_SUFFIX="${OPENCLAW_ENV}-${OPENCLAW_TENANT}"
else
    _OC_DIR_SUFFIX="${OPENCLAW_ENV}"
fi

# --- Derive variables (each individually overridable) ---
OPENCLAW_CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-${HOME}/.openclaw-${_OC_DIR_SUFFIX}}"
OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${OPENCLAW_CONFIG_DIR}/workspace}"

# Clean up internal vars
unset _OC_DIR_SUFFIX
