# Setup Framework — Improvement Proposals

Structured tracker for setup framework enhancements. LLM agents and contributors
can propose new items (`- [ ]`), add details in nested bullets, and check off
completed work (`- [x]`).

---

## High Priority

- [ ] **Health monitoring phase (Phase 75)**
  - Description: Add a post-verification phase that sets up periodic health checks via systemd timer or cron. Alerts when the gateway stops responding.
  - Affected files: `phases/75-health-monitoring.sh`, `templates/health-timer.service.template`
  - Dependencies: Phase 70 (verification)
  - Effort: Medium

- [ ] **Structured JSON logging**
  - Description: Replace plain-text log lines with JSON-structured logs (`{"ts":..., "level":..., "phase":..., "msg":...}`). Easier to parse, query, and ship to log aggregators.
  - Affected files: `lib/logging.sh`, all phase scripts (consumer changes minimal)
  - Dependencies: None
  - Effort: Medium

- [ ] **SQLite state integration**
  - Description: Wire up `config/schema.sql` so deployments, agents, and health checks are tracked in a local `state.db`. Currently the schema exists but nothing writes to it.
  - Affected files: `lib/state.sh` (new), `phases/00-preflight.sh`, `phases/70-verification.sh`, `config/schema.sql`
  - Dependencies: SQLite3 available on target
  - Effort: Large

## Medium Priority

- [ ] **Tailscale auto-configuration**
  - Description: If `--tailscale-key` is provided, automatically install Tailscale, authenticate, and configure SSH access. Currently the key is accepted but not acted on.
  - Affected files: `phases/30-environment-setup.sh` or new `phases/35-tailscale.sh`
  - Dependencies: Tailscale auth key
  - Effort: Medium

- [ ] **Template conditionals**
  - Description: Extend `lib/templates.sh` to support `{{#IF VAR}}...{{/IF}}` blocks, removing the need for post-render fixups. The SOUL.md template already uses mustache-like `{{#ENABLE_*}}` syntax that isn't processed.
  - Affected files: `lib/templates.sh`, `templates/SOUL.md.template`
  - Dependencies: None
  - Effort: Small

- [ ] **Port allocation manager**
  - Description: Automatic port allocation for multi-agent deployments. Query `state.db` for used ports, assign next available, and register allocation.
  - Affected files: `lib/variables.sh`, `config/schema.sql` (port_allocations table already exists)
  - Dependencies: SQLite state integration
  - Effort: Medium

- [ ] **Minions `fetch-profile.sh` utility**
  - Description: Add a utility that fetches profiles from the minions repo by name (e.g., `fetch-profile.sh customer-support`) without requiring a full clone. Supports `minions:profile-name` shorthand in `--profile=`.
  - Affected files: `utilities/fetch-profile.sh` (new), `setup.sh` (profile resolution)
  - Dependencies: Minions repo structure finalized
  - Effort: Small

- [ ] **Interactive setup wizard**
  - Description: When run with no flags, walk the user through configuration with prompts (agent name, API key, channels, etc.) using `read -p` and `select`.
  - Affected files: `setup.sh`, `lib/interactive.sh` (new)
  - Dependencies: None
  - Effort: Medium

## Low Priority

- [ ] **Dry-run test suite**
  - Description: Automated test harness that runs `--dry-run` with various flag combinations and asserts expected output. Uses bats or plain bash assertions.
  - Affected files: `tests/` (new directory), CI integration
  - Dependencies: None
  - Effort: Medium

- [ ] **Config diff on update**
  - Description: When running `--update`, show a diff of what changed in `openclaw.json` before applying. Allows the operator to review config changes.
  - Affected files: `phases/50-config-generation.sh`
  - Dependencies: `diff` available on target
  - Effort: Small

## Completed

- [x] **Decommission mode (Phase 95)**
  - Description: Non-destructive shutdown that stops services, frees disk (removes node_modules/dist), preserves config and credentials, writes `.decommissioned` marker, and prints reactivation instructions.
  - Delivered in: `phases/95-decommission.sh`, `--decommission` flag
  - Completed: 2026-02-12

- [x] **Cascading rollback (Phase 99)**
  - Description: Automatic cascading cleanup on phase failure. Rolls back from the last checkpoint in reverse phase order.
  - Delivered in: `phases/99-rollback.sh`, checkpoint system in `lib/logging.sh`
  - Completed: 2026-02-12

---

## Proposal Template

Copy this template when adding a new proposal:

```markdown
- [ ] **Title**
  - Description: What this improvement does and why it matters.
  - Affected files: `path/to/file.sh`, `path/to/other.sh`
  - Dependencies: Other proposals or external requirements
  - Effort: Small / Medium / Large
```
