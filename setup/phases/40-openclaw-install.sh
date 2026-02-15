#!/usr/bin/env bash
# ---
# name: "OpenClaw Install"
# phase: 40
# description: >
#   Installs OpenClaw via one of two methods:
#   - package (default): npm/pnpm/bun install -g @nikolasp98/openclaw
#   - source: git clone + pnpm install + pnpm build
#   Verifies the installation and exports binary paths for downstream phases.
# when: >
#   After environment setup. Node.js must be available.
# requires:
#   - "Phase 30 (environment setup) completed"
#   - "Node.js available"
# produces:
#   - "openclaw binary available (package) or OPENCLAW_ROOT with built source"
#   - "OPENCLAW_BIN, OPENCLAW_PKG_ROOT exported (package)"
#   - "OPENCLAW_ROOT, NODE_BIN_PATH exported (source)"
# flags:
#   -v, --verbose: "Enable debug-level logging"
#   --update: "Pull latest and rebuild instead of fresh clone (source only)"
# idempotent: true
# estimated_time: "1-8 minutes"
# ---

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/logging.sh"
source "${SCRIPT_DIR}/../lib/variables.sh"
source "${SCRIPT_DIR}/../lib/network.sh"

# Ensure derived variables are populated (idempotent)
derive_system_variables

# --- Package install path ---
install_via_package() {
    local exec_user="${AGENT_USERNAME:-$(whoami)}"
    local pkg_mgr="${PACKAGE_MANAGER:-npm}"
    local pkg_name="@nikolasp98/openclaw"

    log_info "Installing OpenClaw via $pkg_mgr package..."

    case "$pkg_mgr" in
        npm)
            run_cmd --as "$exec_user" "npm install -g ${pkg_name}"
            ;;
        pnpm)
            # Ensure PNPM_HOME is set up
            if [ -z "${PNPM_HOME:-}" ]; then
                log_info "Running pnpm setup to configure global bin directory..."
                run_cmd --as "$exec_user" "pnpm setup" 2>/dev/null || true
                export PNPM_HOME="${AGENT_HOME_DIR:-$HOME}/.local/share/pnpm"
                export PATH="$PNPM_HOME:$PATH"
            fi
            run_cmd --as "$exec_user" "pnpm add -g ${pkg_name}"
            ;;
        bun)
            run_cmd --as "$exec_user" "bun add -g ${pkg_name}"
            ;;
        *)
            handle_error 1 "Unknown package manager: $pkg_mgr" "OpenClaw Install"
            return 1
            ;;
    esac

    # Resolve OPENCLAW_BIN
    log_info "Resolving openclaw binary path..."
    OPENCLAW_BIN=$(run_cmd --as "$exec_user" "which openclaw" 2>/dev/null || echo "")

    if [ -z "$OPENCLAW_BIN" ]; then
        # Try known global bin paths
        local candidates=(
            "${AGENT_HOME_DIR:-$HOME}/.local/share/pnpm/openclaw"
            "${AGENT_HOME_DIR:-$HOME}/.bun/bin/openclaw"
            "/usr/local/bin/openclaw"
            "/usr/bin/openclaw"
        )
        for candidate in "${candidates[@]}"; do
            if [ -x "$candidate" ] || run_cmd --as "$exec_user" "[ -x '$candidate' ]" 2>/dev/null; then
                OPENCLAW_BIN="$candidate"
                break
            fi
        done
    fi

    if [ -z "$OPENCLAW_BIN" ]; then
        handle_error 1 "Could not find openclaw binary after install" "OpenClaw Install"
        return 1
    fi
    log_success "openclaw binary: $OPENCLAW_BIN"

    # Resolve OPENCLAW_PKG_ROOT (the installed package directory)
    log_info "Resolving package root..."
    case "$pkg_mgr" in
        npm)
            local npm_global_root
            npm_global_root=$(run_cmd --as "$exec_user" "npm root -g" 2>/dev/null || echo "")
            OPENCLAW_PKG_ROOT="${npm_global_root}/${pkg_name}"
            ;;
        pnpm)
            local pnpm_global_root
            pnpm_global_root=$(run_cmd --as "$exec_user" "pnpm root -g" 2>/dev/null || echo "")
            OPENCLAW_PKG_ROOT="${pnpm_global_root}/${pkg_name}"
            ;;
        bun)
            local bun_global_bin
            bun_global_bin=$(run_cmd --as "$exec_user" "bun pm -g bin" 2>/dev/null || echo "${AGENT_HOME_DIR:-$HOME}/.bun/bin")
            OPENCLAW_PKG_ROOT="$(dirname "$bun_global_bin")/install/global/node_modules/${pkg_name}"
            ;;
    esac
    log_info "Package root: $OPENCLAW_PKG_ROOT"

    # Verify install
    log_info "Verifying installation..."
    local version_output
    version_output=$(run_cmd --as "$exec_user" "'${OPENCLAW_BIN}' --version" 2>/dev/null || echo "")
    if [ -n "$version_output" ]; then
        log_success "openclaw --version: $version_output"
    else
        log_warn "openclaw --version returned empty (binary may still work)"
    fi

    # Store binary paths for downstream phases
    NODE_BIN_PATH=$(run_cmd --as "$exec_user" "which node" 2>/dev/null || echo "/usr/bin/node")
    export NODE_BIN_PATH OPENCLAW_BIN OPENCLAW_PKG_ROOT

    log_info "Node.js binary: $NODE_BIN_PATH"
}

# --- Source install path ---
install_via_source() {
    local exec_user="${AGENT_USERNAME:-$(whoami)}"

    OPENCLAW_ROOT="${OPENCLAW_ROOT:-${AGENT_HOME_DIR:-$HOME}/openclaw}"
    GITHUB_REPO="${GITHUB_REPO:-NikolasP98/openclaw}"
    GITHUB_BRANCH="${GITHUB_BRANCH:-main}"

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
            handle_error 1 "Build verification failed: neither dist/entry.js nor dist/entry.mjs found" "OpenClaw Install"
            return 1
        fi
    fi

    # Store binary paths for downstream phases
    NODE_BIN_PATH=$(run_cmd --as "$exec_user" "which node" 2>/dev/null || echo "/usr/bin/node")
    export NODE_BIN_PATH
    export OPENCLAW_ROOT

    log_info "Node.js binary: $NODE_BIN_PATH"
    log_info "OpenClaw root: $OPENCLAW_ROOT"
}

# --- Main entry point ---
install_openclaw() {
    local install_method="${INSTALL_METHOD:-package}"
    phase_start "OpenClaw Install" "40"

    log_info "Install method: $install_method"

    if [ "$install_method" = "source" ]; then
        install_via_source
    else
        install_via_package
    fi

    phase_end "OpenClaw Install" "success"
    save_checkpoint "40-openclaw-install"
    return 0
}

# Run install if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    install_openclaw
fi
