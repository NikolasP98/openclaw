#!/usr/bin/env bash
# ---
# name: "Alias Setup"
# phase: 45
# description: >
#   Creates the openclaw CLI wrapper script at ~/.local/bin/openclaw that
#   delegates to run-node.mjs for auto-rebuild support. Ensures ~/.local/bin
#   is in PATH by appending to .bashrc/.zshrc if needed.
# when: >
#   After OpenClaw is built from source. The wrapper provides the `openclaw`
#   command system-wide for the agent user.
# requires:
#   - "Phase 40 (openclaw install) completed"
#   - "OPENCLAW_ROOT set and built"
# produces:
#   - "~/.local/bin/openclaw wrapper script"
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

setup_alias() {
    phase_start "Alias Setup" "45"

    OPENCLAW_ROOT="${OPENCLAW_ROOT:-${AGENT_HOME_DIR:-$HOME}/openclaw}"
    OPENCLAW_WRAPPER="${OPENCLAW_WRAPPER:-${AGENT_HOME_DIR:-$HOME}/.local/bin/openclaw}"

    local exec_user="${AGENT_USERNAME:-$(whoami)}"
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
    log_info "Checking PATH for $wrapper_dir..."

    local agent_home="${AGENT_HOME_DIR:-$HOME}"
    local path_entry='export PATH="$HOME/.local/bin:$PATH"'
    local path_comment="# OpenClaw CLI"

    # Detect shell rc file
    local rc_files=()
    if [ -f "${agent_home}/.bashrc" ] || [ "${EXEC_MODE:-local}" = "local" ]; then
        rc_files+=("${agent_home}/.bashrc")
    fi
    if [ -f "${agent_home}/.zshrc" ]; then
        rc_files+=("${agent_home}/.zshrc")
    fi

    # Default to .bashrc if no rc file found
    if [ ${#rc_files[@]} -eq 0 ]; then
        rc_files=("${agent_home}/.bashrc")
    fi

    for rc_file in "${rc_files[@]}"; do
        if run_cmd --as "$exec_user" "grep -q '.local/bin' '$rc_file'" 2>/dev/null; then
            log_debug "PATH entry already in $rc_file"
        else
            log_info "Adding ~/.local/bin to PATH in $rc_file"
            if [ "${EXEC_MODE:-local}" = "remote" ]; then
                run_cmd --as "$exec_user" "echo '' >> '$rc_file' && echo '$path_comment' >> '$rc_file' && echo '$path_entry' >> '$rc_file'"
            else
                echo "" >> "$rc_file"
                echo "$path_comment" >> "$rc_file"
                echo "$path_entry" >> "$rc_file"
            fi
        fi
    done

    # Verify wrapper works (add to current PATH for this session)
    export PATH="${wrapper_dir}:${PATH}"

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

    phase_end "Alias Setup" "success"
    save_checkpoint "45-alias-setup"
    return 0
}

# Run alias setup if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    setup_alias
fi
