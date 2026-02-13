#!/usr/bin/env bash
# ---
# name: "Logging Library"
# description: >
#   5-level color-coded dual logging (console + file). Provides phase markers,
#   checkpoint management, error handling, and progress indicators. All log
#   output goes to both stdout/stderr and a timestamped log file.
# produces:
#   - "Log functions: log_debug, log_info, log_warn, log_error, log_success"
#   - "Phase markers: phase_start, phase_end"
#   - "Checkpoint management: save_checkpoint, load_checkpoint, clear_checkpoint"
#   - "Error handling: handle_error"
# ---

# Color codes (if not already defined)
RED="${RED:-\033[0;31m}"
GREEN="${GREEN:-\033[0;32m}"
YELLOW="${YELLOW:-\033[1;33m}"
BLUE="${BLUE:-\033[0;34m}"
CYAN="${CYAN:-\033[0;36m}"
NC="${NC:-\033[0m}"

# Log file location
LOG_DIR="${LOG_DIR:-/tmp/openclaw-setup}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/setup-$(date +%Y%m%d-%H%M%S).log}"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Log levels
LOG_LEVEL_DEBUG=0
LOG_LEVEL_INFO=1
LOG_LEVEL_WARN=2
LOG_LEVEL_ERROR=3

# Current log level (VERBOSE env var sets debug, otherwise INFO)
if [ "${VERBOSE:-false}" = "true" ]; then
    CURRENT_LOG_LEVEL="${CURRENT_LOG_LEVEL:-$LOG_LEVEL_DEBUG}"
else
    CURRENT_LOG_LEVEL="${CURRENT_LOG_LEVEL:-$LOG_LEVEL_INFO}"
fi

# Log a message
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Always write to log file
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    # Write to stdout based on level
    case "$level" in
        "DEBUG")
            [ "$CURRENT_LOG_LEVEL" -le "$LOG_LEVEL_DEBUG" ] && echo -e "${CYAN}[DEBUG]${NC} $message"
            ;;
        "INFO")
            [ "$CURRENT_LOG_LEVEL" -le "$LOG_LEVEL_INFO" ] && echo -e "${BLUE}[INFO]${NC} $message"
            ;;
        "WARN")
            [ "$CURRENT_LOG_LEVEL" -le "$LOG_LEVEL_WARN" ] && echo -e "${YELLOW}[WARN]${NC} $message"
            ;;
        "ERROR")
            [ "$CURRENT_LOG_LEVEL" -le "$LOG_LEVEL_ERROR" ] && echo -e "${RED}[ERROR]${NC} $message" >&2
            ;;
        "SUCCESS")
            [ "$CURRENT_LOG_LEVEL" -le "$LOG_LEVEL_INFO" ] && echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
    esac
}

# Convenience functions
log_debug() { log "DEBUG" "$@"; }
log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# Progress indicator
show_progress() {
    local message="$1"
    local duration="${2:-30}"

    echo -ne "${BLUE}[PROGRESS]${NC} $message"

    for ((i=0; i<duration; i++)); do
        echo -n "."
        sleep 1
    done

    echo " Done!"
}

# Phase start/end markers
phase_start() {
    local phase_name="$1"
    local phase_num="$2"

    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} Phase $phase_num: $phase_name"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log "INFO" "Starting Phase $phase_num: $phase_name"
}

phase_end() {
    local phase_name="$1"
    local status="${2:-success}"

    echo ""
    if [ "$status" = "success" ]; then
        echo -e "${GREEN}✓${NC} Phase completed: $phase_name"
        log "SUCCESS" "Phase completed: $phase_name"
    else
        echo -e "${RED}✗${NC} Phase failed: $phase_name"
        log "ERROR" "Phase failed: $phase_name"
    fi
    echo ""
}

# Checkpoint management
save_checkpoint() {
    local phase="$1"
    local checkpoint_file="${LOG_DIR}/checkpoint.txt"

    echo "$phase" > "$checkpoint_file"
    log_debug "Checkpoint saved: $phase"
}

load_checkpoint() {
    local checkpoint_file="${LOG_DIR}/checkpoint.txt"

    if [ -f "$checkpoint_file" ]; then
        cat "$checkpoint_file"
    else
        echo ""
    fi
}

clear_checkpoint() {
    local checkpoint_file="${LOG_DIR}/checkpoint.txt"
    rm -f "$checkpoint_file"
    log_debug "Checkpoint cleared"
}

# Error handling
handle_error() {
    local exit_code="$1"
    local error_message="$2"
    local phase="$3"

    log_error "$error_message (Exit code: $exit_code)"

    if [ -n "$phase" ]; then
        phase_end "$phase" "failure"
        save_checkpoint "failed-$phase"
    fi

    echo ""
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║ SETUP FAILED${NC}"
    echo -e "${RED}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${RED}║${NC} Error: $error_message"
    echo -e "${RED}║${NC} Phase: $phase"
    echo -e "${RED}║${NC} Log file: $LOG_FILE"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    return "$exit_code"
}

# Export functions
export -f log log_debug log_info log_warn log_error log_success
export -f show_progress phase_start phase_end
export -f save_checkpoint load_checkpoint clear_checkpoint handle_error
