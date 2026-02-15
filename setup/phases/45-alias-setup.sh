#!/usr/bin/env bash
# ---
# name: "Alias Setup"
# phase: 45
# description: >
#   For source installs: creates the openclaw CLI wrapper script at
#   ~/.local/bin/openclaw that delegates to run-node.mjs for auto-rebuild support.
#   For package installs: ensures the package manager's global bin directory
#   is in PATH so the `openclaw` command is available.
# when: >
#   After OpenClaw is installed (phase 40). Makes the `openclaw` command
#   available system-wide for the agent user.
# requires:
#   - "Phase 40 (openclaw install) completed"
# produces:
#   - "~/.local/bin/openclaw wrapper script (source installs)"
#   - "PATH updated in shell rc file"
# flags:
#   -v, --verbose: "Enable debug-level logging"
# idempotent: true
# estimated_time: "0.5 minutes"
# ---

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/logging.sh"
source "${SCRIPT_DIR}/../lib/variables.sh"
source "${SCRIPT_DIR}/../lib/network.sh"
source "${SCRIPT_DIR}/../lib/templates.sh"

# Ensure derived variables are populated (idempotent)
derive_system_variables

# Ensure a directory is in PATH via shell rc files
ensure_path_entry() {
    local bin_dir="$1"
    local label="$2"
    local exec_user="${AGENT_USERNAME:-$(whoami)}"
    local agent_home="${AGENT_HOME_DIR:-$HOME}"

    local path_entry="export PATH=\"${bin_dir}:\$PATH\""
    local path_comment="# ${label}"

    # Detect shell rc files
    local rc_files=()
    if [ -f "${agent_home}/.bashrc" ] || [ "${EXEC_MODE:-local}" = "local" ]; then
        rc_files+=("${agent_home}/.bashrc")
    fi
    if [ -f "${agent_home}/.zshrc" ]; then
        rc_files+=("${agent_home}/.zshrc")
    fi
    if [ -f "${agent_home}/.profile" ]; then
        rc_files+=("${agent_home}/.profile")
    fi
    if [ ${#rc_files[@]} -eq 0 ]; then
        rc_files=("${agent_home}/.bashrc")
    fi

    for rc_file in "${rc_files[@]}"; do
        if run_cmd --as "$exec_user" "grep -q '${bin_dir}' '$rc_file'" 2>/dev/null; then
            log_debug "PATH entry for $bin_dir already in $rc_file"
        else
            log_info "Adding $bin_dir to PATH in $rc_file"
            if [ "${EXEC_MODE:-local}" = "remote" ]; then
                run_cmd --as "$exec_user" "echo '' >> '$rc_file' && echo '$path_comment' >> '$rc_file' && echo '$path_entry' >> '$rc_file'"
            else
                echo "" >> "$rc_file"
                echo "$path_comment" >> "$rc_file"
                echo "$path_entry" >> "$rc_file"
            fi
        fi
    done

    # Add to current session PATH
    export PATH="${bin_dir}:${PATH}"
}

# --- Package install alias setup ---
setup_alias_package() {
    local exec_user="${AGENT_USERNAME:-$(whoami)}"
    local pkg_mgr="${PACKAGE_MANAGER:-npm}"

    log_info "Setting up PATH for package install ($pkg_mgr)..."

    # The package manager already created the openclaw binary during install.
    # We just need to ensure its global bin dir is in PATH.
    case "$pkg_mgr" in
        npm)
            local npm_bin
            npm_bin=$(run_cmd --as "$exec_user" "npm bin -g" 2>/dev/null || echo "/usr/local/bin")
            ensure_path_entry "$npm_bin" "npm global bin"
            ;;
        pnpm)
            local pnpm_home="${PNPM_HOME:-${AGENT_HOME_DIR:-$HOME}/.local/share/pnpm}"
            ensure_path_entry "$pnpm_home" "pnpm global bin (PNPM_HOME)"

            # Also export PNPM_HOME in rc files
            local agent_home="${AGENT_HOME_DIR:-$HOME}"
            local pnpm_export="export PNPM_HOME=\"${pnpm_home}\""
            for rc_file in "${agent_home}/.bashrc" "${agent_home}/.profile"; do
                if [ -f "$rc_file" ] || [ "$rc_file" = "${agent_home}/.bashrc" ]; then
                    if ! run_cmd --as "$exec_user" "grep -q 'PNPM_HOME' '$rc_file'" 2>/dev/null; then
                        if [ "${EXEC_MODE:-local}" = "remote" ]; then
                            run_cmd --as "$exec_user" "echo '$pnpm_export' >> '$rc_file'"
                        else
                            echo "$pnpm_export" >> "$rc_file"
                        fi
                    fi
                fi
            done
            ;;
        bun)
            local bun_bin="${AGENT_HOME_DIR:-$HOME}/.bun/bin"
            ensure_path_entry "$bun_bin" "bun global bin"
            ;;
    esac

    # Verify the openclaw command is accessible
    log_info "Verifying openclaw command..."
    if run_cmd --as "$exec_user" "command -v openclaw" &> /dev/null || command -v openclaw &> /dev/null; then
        log_success "openclaw command is available in PATH"
    else
        log_warn "openclaw not yet in PATH for current session (will be available after re-login)"
    fi
}

# --- Source install alias setup ---
setup_alias_source() {
    local exec_user="${AGENT_USERNAME:-$(whoami)}"

    OPENCLAW_ROOT="${OPENCLAW_ROOT:-${AGENT_HOME_DIR:-$HOME}/openclaw}"
    OPENCLAW_WRAPPER="${OPENCLAW_WRAPPER:-${AGENT_HOME_DIR:-$HOME}/.local/bin/openclaw}"

    local wrapper_dir
    wrapper_dir="$(dirname "$OPENCLAW_WRAPPER")"

    # Ensure wrapper directory exists
    log_info "Creating wrapper directory: $wrapper_dir"
    run_cmd --as "$exec_user" "mkdir -p '$wrapper_dir'"

    # Check if we have a template or generate inline
    local template_file="${SCRIPT_DIR}/../templates/openclaw-wrapper.sh.template"
    if [ -f "$template_file" ]; then
        log_info "Rendering wrapper from template..."
        local temp_wrapper="/tmp/openclaw-wrapper-$$"
        export OPENCLAW_ROOT
        render_template "$template_file" "$temp_wrapper"

        # Deploy the wrapper
        if [ "${EXEC_MODE:-local}" = "remote" ]; then
            copy_file "$temp_wrapper" "$OPENCLAW_WRAPPER" "$exec_user"
            run_cmd --as root "chown ${exec_user}:${exec_user} '$OPENCLAW_WRAPPER'"
        else
            cp "$temp_wrapper" "$OPENCLAW_WRAPPER"
        fi
        rm -f "$temp_wrapper"
    else
        # Generate wrapper inline
        log_info "Generating wrapper script inline..."
        local wrapper_content="#!/usr/bin/env bash
# OpenClaw CLI - auto-rebuilds when source changes
OPENCLAW_ROOT=\"${OPENCLAW_ROOT}\"
cd \"\${OPENCLAW_ROOT}\" && exec node scripts/run-node.mjs \"\$@\"
"
        if [ "${EXEC_MODE:-local}" = "remote" ]; then
            local temp_wrapper="/tmp/openclaw-wrapper-$$"
            echo "$wrapper_content" > "$temp_wrapper"
            copy_file "$temp_wrapper" "$OPENCLAW_WRAPPER" "$exec_user"
            run_cmd --as root "chown ${exec_user}:${exec_user} '$OPENCLAW_WRAPPER'"
            rm -f "$temp_wrapper"
        else
            echo "$wrapper_content" > "$OPENCLAW_WRAPPER"
        fi
    fi

    # Make executable
    run_cmd --as "$exec_user" "chmod +x '$OPENCLAW_WRAPPER'" 2>/dev/null || \
        chmod +x "$OPENCLAW_WRAPPER" 2>/dev/null || true

    # Ensure ~/.local/bin is in PATH
    ensure_path_entry "$wrapper_dir" "OpenClaw CLI"

    # Verify wrapper works
    log_info "Verifying openclaw wrapper..."
    if [ "${EXEC_MODE:-local}" = "local" ]; then
        if [ -x "$OPENCLAW_WRAPPER" ]; then
            log_success "Wrapper installed at: $OPENCLAW_WRAPPER"
        else
            log_warn "Wrapper installed but may not be executable"
        fi
    else
        if run_cmd --as "$exec_user" "[ -x '$OPENCLAW_WRAPPER' ]" 2>/dev/null; then
            log_success "Wrapper installed at: $OPENCLAW_WRAPPER"
        else
            log_warn "Wrapper installed but may not be executable on remote"
        fi
    fi
}

# --- Main entry point ---
setup_alias() {
    phase_start "Alias Setup" "45"

    local install_method="${INSTALL_METHOD:-package}"

    if [ "$install_method" = "source" ]; then
        setup_alias_source
    else
        setup_alias_package
    fi

    phase_end "Alias Setup" "success"
    save_checkpoint "45-alias-setup"
    return 0
}

# Run alias setup if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    setup_alias
fi
