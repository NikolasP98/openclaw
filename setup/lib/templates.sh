#!/usr/bin/env bash
# ---
# name: "Template Rendering"
# description: >
#   Renders {{VARIABLE}} placeholders in template files using environment
#   variable values. Validates rendered output for unresolved placeholders.
# produces:
#   - "Functions: render_template, validate_template, render_templates_from_dir"
# ---

# Source logging if not already loaded
if ! command -v log_info &> /dev/null; then
    source "$(dirname "${BASH_SOURCE[0]}")/logging.sh"
fi

# Render template by replacing {{VARIABLE}} placeholders
render_template() {
    local template_file="$1"
    local output_file="$2"

    if [ ! -f "$template_file" ]; then
        log_error "Template file not found: $template_file"
        return 1
    fi

    log_info "Rendering template: $template_file -> $output_file"

    local content
    content=$(cat "$template_file")

    # Replace all {{VARIABLE}} patterns with environment variable values
    local variables
    variables=$(echo "$content" | grep -oP '\{\{[A-Z_]+\}\}' | sort -u | sed 's/[{}]//g')

    for var in $variables; do
        local value="${!var:-}"
        if [ -z "$value" ]; then
            log_warn "Variable $var not set, leaving placeholder"
        else
            # Escape special characters for sed
            local escaped_value
            escaped_value=$(printf '%s\n' "$value" | sed 's/[[\.*^$/]/\\&/g')
            content=$(echo "$content" | sed "s|{{${var}}}|${escaped_value}|g")
        fi
    done

    # Write rendered content
    echo "$content" > "$output_file"

    log_success "Template rendered successfully"
    return 0
}

# Validate rendered template (check for remaining placeholders)
validate_template() {
    local file="$1"

    if grep -q '{{[A-Z_]\+}}' "$file"; then
        log_error "Template validation failed: unresolved placeholders found in $file"
        grep -o '{{[A-Z_]\+}}' "$file" | sort -u | while read -r placeholder; do
            log_error "  Unresolved: $placeholder"
        done
        return 1
    fi

    log_success "Template validation passed: no unresolved placeholders"
    return 0
}

# Render multiple templates from directory
render_templates_from_dir() {
    local template_dir="$1"
    local output_dir="$2"

    log_info "Rendering all templates from $template_dir to $output_dir"

    mkdir -p "$output_dir"

    local failed=0
    for template in "$template_dir"/*.template; do
        if [ -f "$template" ]; then
            local basename
            basename=$(basename "$template" .template)
            local output="$output_dir/$basename"

            if ! render_template "$template" "$output"; then
                failed=$((failed + 1))
            fi
        fi
    done

    if [ $failed -gt 0 ]; then
        log_error "Failed to render $failed templates"
        return 1
    fi

    log_success "All templates rendered successfully"
    return 0
}

# Export functions
export -f render_template validate_template render_templates_from_dir
