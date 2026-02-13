#!/usr/bin/env bash
# ---
# name: "Network & Execution Abstraction"
# description: >
#   Dual-mode execution layer. Provides run_cmd() and copy_file() that work
#   in both local and remote modes. In remote mode, delegates to SSH/SCP.
#   In local mode, executes commands directly.
# requires:
#   - "EXEC_MODE variable (local or remote)"
#   - "VPS_HOSTNAME variable (remote mode only)"
# produces:
#   - "Functions: run_cmd, copy_file, test_ssh_connection, wait_for_service"
# ---

# Source logging if not already loaded
if ! command -v log_info &> /dev/null; then
    source "$(dirname "${BASH_SOURCE[0]}")/logging.sh"
fi

# --- Dual-mode execution ---

# Execute a command in the appropriate mode.
# Usage: run_cmd [--as USER] COMMAND...
# In remote mode: runs via SSH on VPS_HOSTNAME as USER (default: EXEC_USER or root)
# In local mode: runs locally via bash -c
run_cmd() {
    local exec_user="${EXEC_USER:-root}"

    # Parse optional --as flag
    if [ "${1:-}" = "--as" ]; then
        exec_user="$2"
        shift 2
    fi

    local command="$*"
    log_debug "run_cmd [${EXEC_MODE:-local}] (${exec_user}): $command"

    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        remote_exec "${VPS_HOSTNAME}" "$exec_user" "$command"
    else
        # Local mode - run directly
        bash -c "$command"
    fi
}

# Copy a file to the target location.
# Usage: copy_file SOURCE DESTINATION [USER]
# In remote mode: uses SCP to copy to VPS
# In local mode: uses cp
copy_file() {
    local source="$1"
    local destination="$2"
    local user="${3:-${EXEC_USER:-root}}"

    log_debug "copy_file [${EXEC_MODE:-local}]: $source -> $destination"

    if [ "${EXEC_MODE:-local}" = "remote" ]; then
        remote_copy "$source" "${VPS_HOSTNAME}" "$user" "$destination"
    else
        cp "$source" "$destination"
    fi
}

# --- Remote operations ---

# Test SSH connection to VPS
test_ssh_connection() {
    local hostname="$1"
    local user="${2:-root}"
    local timeout="${3:-10}"

    log_info "Testing SSH connection to ${user}@${hostname}..."

    if timeout "$timeout" ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${user}@${hostname}" "echo 'SSH connection successful'" &> /dev/null; then
        log_success "SSH connection successful"
        return 0
    else
        log_error "SSH connection failed to ${user}@${hostname}"
        return 1
    fi
}

# Execute remote command via SSH
remote_exec() {
    local hostname="$1"
    local user="$2"
    shift 2
    local command="$*"

    log_debug "Remote exec on ${user}@${hostname}: $command"

    ssh -o StrictHostKeyChecking=no "${user}@${hostname}" "$command"
    return $?
}

# Copy file to remote server via SCP
remote_copy() {
    local source="$1"
    local hostname="$2"
    local user="$3"
    local destination="$4"

    log_info "Copying $source to ${user}@${hostname}:${destination}"

    scp -o StrictHostKeyChecking=no "$source" "${user}@${hostname}:${destination}"
    return $?
}

# --- Connectivity tests ---

# Test Tailscale connectivity
test_tailscale() {
    local hostname="$1"

    log_info "Testing Tailscale connectivity to $hostname..."

    if ping -c 1 -W 5 "$hostname" &> /dev/null; then
        log_success "Tailscale connectivity confirmed"
        return 0
    else
        log_warn "Tailscale connectivity test failed (may not be critical)"
        return 1
    fi
}

# Wait for a TCP service to be ready
wait_for_service() {
    local hostname="$1"
    local port="$2"
    local timeout="${3:-60}"
    local interval="${4:-5}"

    log_info "Waiting for service on ${hostname}:${port} (timeout: ${timeout}s)..."

    local elapsed=0
    while [ $elapsed -lt "$timeout" ]; do
        if nc -z -w 2 "$hostname" "$port" 2>/dev/null; then
            log_success "Service is ready on ${hostname}:${port}"
            return 0
        fi

        sleep "$interval"
        elapsed=$((elapsed + interval))
        echo -n "."
    done

    echo ""
    log_error "Service failed to start within ${timeout}s"
    return 1
}

# Check if port is available
check_port_available() {
    local port="$1"

    log_debug "Checking if port $port is available..."

    if run_cmd "! ss -tuln 2>/dev/null | grep -q ':${port} '"; then
        log_debug "Port $port is available"
        return 0
    else
        log_warn "Port $port is already in use"
        return 1
    fi
}

# Export functions
export -f run_cmd copy_file
export -f test_ssh_connection remote_exec remote_copy
export -f test_tailscale wait_for_service check_port_available
