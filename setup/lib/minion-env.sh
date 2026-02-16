#!/usr/bin/env bash
# ---
# name: "Minion Environment Derivation"
# description: >
#   Shared environment variable derivation for Minion. Normalizes MINION_ENV
#   and MINION_TENANT, computes directory/service suffixes, and derives config
#   and workspace paths. Source this file AFTER setting any pre-source defaults.
# produces:
#   - "MINION_CONFIG_DIR, MINION_WORKSPACE_DIR"
#   - "Directory and service suffix variables"
# ---

# --- MINION_ENV (required, default: prd, forced lowercase) ---
MINION_ENV="${MINION_ENV:-prd}"
MINION_ENV="$(printf '%s' "$MINION_ENV" | tr '[:upper:]' '[:lower:]')"

if ! [[ "$MINION_ENV" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "ERROR: MINION_ENV='$MINION_ENV' is invalid (must match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$)" >&2
    exit 1
fi

# --- MINION_TENANT (optional, forced lowercase) ---
MINION_TENANT="${MINION_TENANT:-}"
if [[ -n "$MINION_TENANT" ]]; then
    MINION_TENANT="$(printf '%s' "$MINION_TENANT" | tr '[:upper:]' '[:lower:]')"
    if ! [[ "$MINION_TENANT" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
        echo "ERROR: MINION_TENANT='$MINION_TENANT' is invalid (must match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$)" >&2
        exit 1
    fi
fi

# --- Compute suffixes ---
# Directories use hyphens: env or env-tenant
if [[ -n "$MINION_TENANT" ]]; then
    _OC_DIR_SUFFIX="${MINION_ENV}-${MINION_TENANT}"
else
    _OC_DIR_SUFFIX="${MINION_ENV}"
fi

# --- Derive variables (each individually overridable) ---
MINION_CONFIG_DIR="${MINION_CONFIG_DIR:-${HOME}/.minion-${_OC_DIR_SUFFIX}}"
MINION_WORKSPACE_DIR="${MINION_WORKSPACE_DIR:-${MINION_CONFIG_DIR}/workspace}"

# Clean up internal vars
unset _OC_DIR_SUFFIX
