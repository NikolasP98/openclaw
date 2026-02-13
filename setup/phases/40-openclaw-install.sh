#!/usr/bin/env bash
# ---
# name: "OpenClaw Source Install"
# phase: 40
# description: >
#   Clones the OpenClaw repository from GitHub, checks out the specified branch,
#   runs pnpm install and pnpm build. Verifies dist/entry.js exists after build.
#   Supports --update mode to pull latest and rebuild.
# when: >
#   After environment setup. Node.js and pnpm must be available.
# requires:
#   - "Phase 30 (environment setup) completed"
#   - "Node.js and pnpm available"
#   - "git available"
# produces:
#   - "OPENCLAW_ROOT directory with built source"
#   - "dist/entry.js verified"
#   - "NODE_BIN_PATH exported"
# flags:
#   -v, --verbose: "Enable debug-level logging"
#   --update: "Pull latest and rebuild instead of fresh clone"
# idempotent: true
# estimated_time: "3-8 minutes"
# ---

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/logging.sh"
source "${SCRIPT_DIR}/../lib/variables.sh"
source "${SCRIPT_DIR}/../lib/network.sh"

# Ensure derived variables are populated (idempotent)
derive_system_variables

install_openclaw() {
    phase_start "OpenClaw Source Install" "40"

    OPENCLAW_ROOT="${OPENCLAW_ROOT:-${AGENT_HOME_DIR:-$HOME}/openclaw}"
    GITHUB_REPO="${GITHUB_REPO:-NikolasP98/openclaw}"
    GITHUB_BRANCH="${GITHUB_BRANCH:-main}"

    local exec_user="${AGENT_USERNAME:-$(whoami)}"

    log_info "Install directory: $OPENCLAW_ROOT"
    log_info "Repository: $GITHUB_REPO (branch: $GITHUB_BRANCH)"

    # Check if already cloned
    if run_cmd --as "$exec_user" "[ -d '${OPENCLAW_ROOT}/.git' ]" 2>/dev/null; then
        if [ "${UPDATE_MODE:-false}" = "true" ] || [ "${FORCE_REINSTALL:-false}" = "true" ]; then
            log_info "Existing install found, updating..."
            run_cmd --as "$exec_user" "cd '${OPENCLAW_ROOT}' && git fetch origin"
            run_cmd --as "$exec_user" "cd '${OPENCLAW_ROOT}' && git checkout '${GITHUB_BRANCH}'"
            run_cmd --as "$exec_user" "cd '${OPENCLAW_ROOT}' && git pull origin '${GITHUB_BRANCH}'"
        else
            log_warn "OpenClaw already cloned at $OPENCLAW_ROOT"
            log_info "Use --update to pull latest changes, or --force-reinstall to rebuild"

            # Verify build exists
            if run_cmd --as "$exec_user" "[ -f '${OPENCLAW_ROOT}/dist/entry.js' ]" 2>/dev/null; then
                log_success "Existing build verified (dist/entry.js exists)"
                phase_end "OpenClaw Source Install" "success"
                save_checkpoint "40-openclaw-install"
                return 0
            else
                log_warn "Build artifacts missing, rebuilding..."
            fi
        fi
    else
        log_info "Cloning OpenClaw repository..."
        run_cmd --as "$exec_user" "git clone 'https://github.com/${GITHUB_REPO}.git' '${OPENCLAW_ROOT}'"
        run_cmd --as "$exec_user" "cd '${OPENCLAW_ROOT}' && git checkout '${GITHUB_BRANCH}'"
    fi

    # Install dependencies
    log_info "Installing dependencies with pnpm..."
    run_cmd --as "$exec_user" "cd '${OPENCLAW_ROOT}' && pnpm install --frozen-lockfile"

    # Build
    log_info "Building OpenClaw..."
    run_cmd --as "$exec_user" "cd '${OPENCLAW_ROOT}' && pnpm build"

    # Verify build
    log_info "Verifying build artifacts..."
    if run_cmd --as "$exec_user" "[ -f '${OPENCLAW_ROOT}/dist/entry.js' ]" 2>/dev/null; then
        log_success "Build verified: dist/entry.js exists"
    else
        # Check for entry.mjs as alternative
        if run_cmd --as "$exec_user" "[ -f '${OPENCLAW_ROOT}/dist/entry.mjs' ]" 2>/dev/null; then
            log_success "Build verified: dist/entry.mjs exists"
        else
            handle_error 1 "Build verification failed: neither dist/entry.js nor dist/entry.mjs found" "OpenClaw Source Install"
            return 1
        fi
    fi

    # Store binary paths for downstream phases
    NODE_BIN_PATH=$(run_cmd --as "$exec_user" "which node" 2>/dev/null || echo "/usr/bin/node")
    export NODE_BIN_PATH
    export OPENCLAW_ROOT

    log_info "Node.js binary: $NODE_BIN_PATH"
    log_info "OpenClaw root: $OPENCLAW_ROOT"

    phase_end "OpenClaw Source Install" "success"
    save_checkpoint "40-openclaw-install"
    return 0
}

# Run install if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    install_openclaw
fi
