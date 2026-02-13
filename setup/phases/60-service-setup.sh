#!/usr/bin/env bash
# ---
# name: "Service Setup"
# phase: 60
# description: >
#   Reloads systemd user daemon, enables and starts the openclaw-gateway
#   service. Waits for the service to stabilize and checks its status.
#   Uses the systemd user service unit deployed in Phase 50.
# when: >
#   After configuration files are deployed. Starts the OpenClaw gateway
#   as a persistent background service.
# requires:
#   - "Phase 50 (config generation) completed"
#   - "systemd user service file at ~/.config/systemd/user/openclaw-gateway.service"
# produces:
#   - "Running openclaw-gateway systemd user service"
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

# Ensure derived variables are populated (idempotent)
derive_system_variables

setup_service() {
    phase_start "Service Setup" "60"

    local exec_user="${AGENT_USERNAME:-$(whoami)}"

    log_info "Setting up systemd user service..."

    # Reload systemd user daemon
    log_info "Reloading systemd user daemon..."
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        if ! run_cmd --as "$exec_user" "systemctl --user daemon-reload"; then
            handle_error $? "Failed to reload systemd daemon" "Service Setup"
            return 1
        fi
    else
        if ! systemctl --user daemon-reload; then
            handle_error $? "Failed to reload systemd daemon" "Service Setup"
            return 1
        fi
    fi

    # Enable the service
    log_info "Enabling OpenClaw gateway service..."
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        if ! run_cmd --as "$exec_user" "systemctl --user enable openclaw-gateway.service"; then
            handle_error $? "Failed to enable service" "Service Setup"
            return 1
        fi
    else
        if ! systemctl --user enable openclaw-gateway.service; then
            handle_error $? "Failed to enable service" "Service Setup"
            return 1
        fi
    fi

    # Start the service
    log_info "Starting OpenClaw gateway service..."
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        if ! run_cmd --as "$exec_user" "systemctl --user start openclaw-gateway.service"; then
            handle_error $? "Failed to start service" "Service Setup"
            return 1
        fi
    else
        if ! systemctl --user start openclaw-gateway.service; then
            handle_error $? "Failed to start service" "Service Setup"
            return 1
        fi
    fi

    # Wait for service to stabilize
    log_info "Waiting for service to stabilize..."
    sleep 5

    # Check service status
    log_info "Checking service status..."
    local service_status
    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        service_status=$(run_cmd --as "$exec_user" "systemctl --user is-active openclaw-gateway.service" || echo "failed")
    else
        service_status=$(systemctl --user is-active openclaw-gateway.service || echo "failed")
    fi

    if [ "$service_status" != "active" ]; then
        log_error "Service is not running properly (status: $service_status)"
        log_info "Fetching service logs..."
        if [ "${EXEC_MODE:-local}" = "remote" ]; then
            run_cmd --as "$exec_user" "journalctl --user -u openclaw-gateway.service -n 50 --no-pager" || true
        else
            journalctl --user -u openclaw-gateway.service -n 50 --no-pager 2>/dev/null || true
        fi
        handle_error 1 "Service failed to start" "Service Setup"
        return 1
    fi

    log_success "Service is running (status: active)"

    phase_end "Service Setup" "success"
    save_checkpoint "60-service-setup"
    return 0
}

# Run service setup if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    setup_service
fi
