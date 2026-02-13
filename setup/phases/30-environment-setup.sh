#!/usr/bin/env bash
# ---
# name: "Environment Setup"
# phase: 30
# description: >
#   Installs Node.js (via apt, nvm, or skip), enables pnpm via corepack,
#   installs gh CLI, and sets up essential build tools. Uses run_cmd for
#   dual-mode support.
# when: >
#   After user creation. Ensures the build toolchain is available before
#   cloning and building OpenClaw from source.
# requires:
#   - "Phase 20 (user creation) completed"
#   - "Internet connectivity"
# produces:
#   - "Node.js 22.x installed"
#   - "pnpm available via corepack"
#   - "gh CLI installed and authenticated"
#   - "Build tools (git, curl) available"
# flags:
#   -v, --verbose: "Enable debug-level logging"
# idempotent: true
# estimated_time: "2-5 minutes"
# ---

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/logging.sh"
source "${SCRIPT_DIR}/../lib/variables.sh"
source "${SCRIPT_DIR}/../lib/network.sh"

# Ensure derived variables are populated (idempotent)
derive_system_variables

setup_environment() {
    phase_start "Environment Setup" "30"

    NODE_INSTALL_METHOD="${NODE_INSTALL_METHOD:-apt}"

    # --- Node.js ---
    local node_ver
    node_ver=$(run_cmd "node --version" 2>/dev/null || echo "")

    if [[ "$node_ver" == v22.* ]]; then
        log_info "Node.js $node_ver already installed, skipping"
    else
        log_info "Installing Node.js via $NODE_INSTALL_METHOD..."

        case "$NODE_INSTALL_METHOD" in
            "apt")
                log_info "Adding NodeSource repository for Node.js 22..."
                run_cmd --as root "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
                run_cmd --as root "apt-get install -y nodejs"
                ;;
            "nvm")
                log_info "Installing via NVM..."
                if [ "${EXEC_MODE:-local}" = "remote" ]; then
                    run_cmd --as "$AGENT_USERNAME" "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash"
                    run_cmd --as "$AGENT_USERNAME" "source ~/.nvm/nvm.sh && nvm install 22 && nvm use 22"
                else
                    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
                    export NVM_DIR="$HOME/.nvm"
                    # shellcheck disable=SC1091
                    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
                    nvm install 22 && nvm use 22
                fi
                ;;
            "skip")
                log_warn "Skipping Node.js installation (assuming already installed)"
                ;;
            *)
                log_error "Unknown Node.js install method: $NODE_INSTALL_METHOD"
                handle_error 1 "Invalid NODE_INSTALL_METHOD" "Environment Setup"
                return 1
                ;;
        esac

        node_ver=$(run_cmd "node --version" 2>/dev/null || echo "not found")
        if [ "$node_ver" = "not found" ]; then
            handle_error 1 "Node.js not available after installation" "Environment Setup"
            return 1
        fi
    fi
    log_success "Node.js version: $node_ver"

    # Update NODE_BIN_PATH
    NODE_BIN_PATH=$(run_cmd "which node")
    export NODE_BIN_PATH

    # --- pnpm via corepack ---
    local pnpm_ver
    pnpm_ver=$(run_cmd "pnpm --version" 2>/dev/null || echo "")

    if [ -n "$pnpm_ver" ]; then
        log_info "pnpm $pnpm_ver already installed, skipping"
    else
        log_info "Setting up pnpm via corepack..."
        if run_cmd "command -v corepack" &> /dev/null; then
            run_cmd --as root "corepack enable" || run_cmd "corepack enable" || true
            run_cmd "corepack prepare pnpm@10.23.0 --activate" 2>/dev/null || \
                log_warn "corepack prepare failed, trying npm fallback"
        fi

        # Verify pnpm or install fallback
        if ! run_cmd "command -v pnpm" &> /dev/null; then
            log_warn "pnpm not available via corepack, installing via npm..."
            run_cmd --as root "npm install -g pnpm@10.23.0" || run_cmd "npm install -g pnpm@10.23.0"
        fi

        pnpm_ver=$(run_cmd "pnpm --version" 2>/dev/null || echo "not found")
    fi
    log_success "pnpm version: $pnpm_ver"

    # --- gh CLI ---
    if run_cmd "command -v gh" &> /dev/null; then
        local gh_ver
        gh_ver=$(run_cmd "gh --version" 2>/dev/null | head -1 || echo "")
        log_info "gh CLI already installed ($gh_ver), skipping"
    else
        log_info "Installing gh CLI..."
        run_cmd --as root "type -p curl >/dev/null || apt-get install curl -y"
        run_cmd --as root "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null"
        run_cmd --as root "chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg"
        run_cmd --as root "echo 'deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main' | tee /etc/apt/sources.list.d/github-cli.list > /dev/null"
        run_cmd --as root "apt-get update && apt-get install gh -y"
    fi

    # Authenticate gh if PAT is provided
    if [ -n "${GITHUB_PAT:-}" ]; then
        log_info "Authenticating gh CLI with PAT..."
        if [ "${EXEC_MODE:-local}" = "remote" ]; then
            run_cmd --as "$AGENT_USERNAME" "echo '$GITHUB_PAT' | gh auth login --with-token"
        else
            echo "$GITHUB_PAT" | gh auth login --with-token 2>/dev/null || \
                log_warn "gh auth login failed (may already be authenticated)"
        fi
    fi

    # --- Build tools ---
    if run_cmd "dpkg -s build-essential" &> /dev/null; then
        log_info "build-essential already installed, skipping"
    else
        log_info "Installing build tools..."
        run_cmd --as root "apt-get install -y build-essential git curl" 2>/dev/null || \
            log_warn "Could not install build tools via apt (may not have root access or not Debian-based)"
    fi

    phase_end "Environment Setup" "success"
    save_checkpoint "30-environment-setup"
    return 0
}

# Run environment setup if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    setup_environment
fi
