#!/usr/bin/env bash
# ---
# name: "Rollback"
# phase: 99
# description: >
#   Cleans up a failed deployment by cascading through phases in reverse order
#   from the last checkpoint. Stops services, removes config files, deletes
#   the source directory, removes the wrapper, and optionally removes the
#   user account (remote mode only).
# when: >
#   Automatically triggered on phase failure, or run manually to clean up.
# requires:
#   - "Checkpoint file indicating last successful phase"
# produces:
#   - "Clean state (as if deployment never happened)"
# flags:
#   -v, --verbose: "Enable debug-level logging"
# idempotent: true
# estimated_time: "1-2 minutes"
# ---

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/logging.sh"
source "${SCRIPT_DIR}/../lib/variables.sh"
source "${SCRIPT_DIR}/../lib/network.sh"

rollback_deployment() {
    phase_start "Rollback" "99"

    local checkpoint
    checkpoint=$(load_checkpoint)
    local exec_user="${AGENT_USERNAME:-$(whoami)}"
    local agent_home="${AGENT_HOME_DIR:-$HOME}"

    log_warn "Rolling back deployment from checkpoint: ${checkpoint:-none}"

    # Cascading rollback using ;& (fall-through)
    case "$checkpoint" in
        "70-verification"|"failed-70-verification"|"60-service-setup"|"failed-60-service-setup")
            log_info "Stopping OpenClaw service..."
            if [ "${EXEC_MODE:-local}" = "remote" ]; then
                run_cmd --as "$exec_user" "systemctl --user stop openclaw-gateway.service" || true
                run_cmd --as "$exec_user" "systemctl --user disable openclaw-gateway.service" || true
            else
                systemctl --user stop openclaw-gateway.service 2>/dev/null || true
                systemctl --user disable openclaw-gateway.service 2>/dev/null || true
            fi
            ;;&

        "50-config-generation"|"failed-50-config-generation")
            log_info "Removing configuration files..."
            local config_dir="${OPENCLAW_CONFIG_DIR:-${agent_home}/.openclaw}"
            local workspace_dir="${WORKSPACE_DIR:-${config_dir}/workspace}"
            local systemd_dir="${agent_home}/.config/systemd/user"

            run_cmd --as "$exec_user" "rm -f '${config_dir}/openclaw.json'" || true
            run_cmd --as "$exec_user" "rm -f '${workspace_dir}/SOUL.md'" || true
            run_cmd --as "$exec_user" "rm -f '${systemd_dir}/openclaw-gateway.service'" || true
            ;;&

        "45-alias-setup"|"failed-45-alias-setup")
            log_info "Removing openclaw wrapper..."
            local wrapper="${OPENCLAW_WRAPPER:-${agent_home}/.local/bin/openclaw}"
            run_cmd --as "$exec_user" "rm -f '$wrapper'" || true

            # Remove PATH entry from shell rc files
            for rc_file in "${agent_home}/.bashrc" "${agent_home}/.zshrc"; do
                if [ -f "$rc_file" ] || run_cmd --as "$exec_user" "[ -f '$rc_file' ]" 2>/dev/null; then
                    run_cmd --as "$exec_user" "sed -i '/# OpenClaw CLI/d' '$rc_file'" || true
                    run_cmd --as "$exec_user" "sed -i '/\\.local\\/bin/d' '$rc_file'" || true
                fi
            done
            ;;&

        "40-openclaw-install"|"failed-40-openclaw-install")
            log_info "Removing OpenClaw source directory..."
            local openclaw_root="${OPENCLAW_ROOT:-${agent_home}/openclaw}"
            run_cmd --as "$exec_user" "rm -rf '$openclaw_root'" || true
            ;;&

        "30-environment-setup"|"failed-30-environment-setup")
            log_info "Removing gh authentication..."
            run_cmd --as "$exec_user" "gh auth logout --yes" 2>/dev/null || true
            ;;&

        "20-user-creation"|"failed-20-user-creation")
            if [ "${EXEC_MODE:-local}" = "remote" ]; then
                log_info "Removing agent user and home directory..."
                run_cmd --as root "loginctl disable-linger $exec_user" || true
                run_cmd --as root "userdel -r $exec_user" || true
            else
                log_info "Local mode: skipping user removal (not removing current user)"
            fi
            ;;&

        *)
            log_info "No specific rollback actions for checkpoint: ${checkpoint:-none}"
            ;;
    esac

    # Cleanup temp files
    log_info "Cleaning up temporary files..."
    rm -rf /tmp/openclaw-config-* /tmp/openclaw-wrapper-* 2>/dev/null || true
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        run_cmd --as root "rm -rf /tmp/openclaw-deploy-*" || true
    fi

    clear_checkpoint

    log_warn "Rollback completed"
    phase_end "Rollback" "success"
    return 0
}

# Run rollback if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    rollback_deployment
fi
