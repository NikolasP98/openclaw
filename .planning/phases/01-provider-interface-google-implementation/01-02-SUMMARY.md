---
phase: 01-provider-interface-google-implementation
plan: 02
subsystem: auth
tags: [oauth, google, provider-wiring, config-migration, integration-test]

# Dependency graph
requires:
  - phase: 01-01
    provides: AuthProvider interface, GoogleAuthProvider factory, auth-providers config types
provides:
  - Rewired gog-auth-start tool using GoogleAuthProvider for URL building and scope resolution
  - Rewired OAuth callback handler using provider.exchangeCode() and provider.storeCredentials()
  - authProviders field in root MinionSchema and MinionConfig
  - Legacy migration from hooks.gogOAuth to authProviders
  - PendingOAuthFlow.providerId field for multi-provider dispatch
  - Integration test validating full provider flow with mock OAuth server
affects: [02-provider-wiring, 03-side-channel]

# Tech tracking
tech-stack:
  added: []
  patterns: [provider-delegation-in-tool, provider-delegation-in-callback, config-auto-migration]

key-files:
  created:
    - src/auth/google/google-auth-provider.integration.test.ts
  modified:
    - src/agents/tools/gog-auth-start-tool.ts
    - src/hooks/gog-oauth-server.ts
    - src/hooks/gog-oauth-types.ts
    - src/config/zod-schema.ts
    - src/config/types.minion.ts
    - src/config/legacy.migrations.part-3.ts

key-decisions:
  - "Provider instantiated at tool creation time (not per-call) for both schema and execute"
  - "syncToGogKeyring result no longer passed to notifyAuthSuccess (provider handles sync internally)"
  - "buildCallbackHtml extracted to shrink gog-oauth-server.ts under 500 lines"
  - "resolveProvider() placeholder dispatches on flow.providerId for future multi-provider support"

patterns-established:
  - "Tool schema dynamically generated from provider.getSupportedServices() (no hardcoded service list)"
  - "Callback handler resolves provider via resolveProvider(flow) for extensibility"
  - "Config auto-migration pattern: hooks.gogOAuth -> authProviders with deprecation warning"

requirements-completed: [PROV-01, PROV-02, PROV-03]

# Metrics
duration: 21min
completed: 2026-03-05
---

# Phase 1 Plan 02: Provider Wiring & Config Migration Summary

**Rewired gog-auth-start tool and OAuth callback to delegate to GoogleAuthProvider, added authProviders root config with hooks.gogOAuth auto-migration, integration test with mock OAuth server**

## Performance

- **Duration:** 21 min
- **Started:** 2026-03-05T07:20:39Z
- **Completed:** 2026-03-05T07:42:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- gog-auth-start tool now delegates URL building and scope resolution to GoogleAuthProvider instead of inline construction
- OAuth callback handler delegates token exchange and credential storage to provider instead of internal functions
- Root config schema accepts authProviders key; legacy migration auto-copies hooks.gogOAuth on startup
- Integration test exercises full flow: buildAuthUrl -> mock token exchange -> storeCredentials -> loadCredentials
- gog-oauth-server.ts reduced from 566 to 490 lines (under 500-line limit)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire gog-auth-start tool and callback handler** - `e0be38de4` (feat)
2. **Task 2: Wire auth config into root schema and add auto-migration** - `ca984f7b5` (feat)
3. **Task 3: Integration test with mock OAuth server** - `359bc5af0` (test)

## Files Created/Modified

- `src/agents/tools/gog-auth-start-tool.ts` - Rewired to use GoogleAuthProvider for URL building, scope resolution, credential loading
- `src/hooks/gog-oauth-server.ts` - Callback handler delegates to provider.exchangeCode() and provider.storeCredentials()
- `src/hooks/gog-oauth-types.ts` - Added optional providerId field to PendingOAuthFlow
- `src/config/zod-schema.ts` - Added authProviders field to MinionSchema
- `src/config/types.minion.ts` - Added authProviders field to MinionConfig type
- `src/config/legacy.migrations.part-3.ts` - Added hooks.gogOAuth -> authProviders migration
- `src/auth/google/google-auth-provider.integration.test.ts` - 3 integration tests with mock OAuth server

## Decisions Made

- Provider is instantiated once at tool creation time (in createGogAuthStartTool), reused for both schema generation and execute function
- The notifyAuthSuccess call no longer receives keyring sync error because the provider handles sync internally via storeCredentials
- buildCallbackHtml extracted as a helper function to keep gog-oauth-server.ts under 500 lines
- resolveProvider() dispatches on flow for future multi-provider support (currently always returns Google provider)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted HTML template to reduce gog-oauth-server.ts line count**

- **Found during:** Task 1
- **Issue:** After rewiring, gog-oauth-server.ts was 520 lines (over 500-line limit from check:loc)
- **Fix:** Extracted inline HTML template into buildCallbackHtml() helper function, compacted CSS
- **Files modified:** src/hooks/gog-oauth-server.ts
- **Verification:** check:loc passes, file at 490 lines
- **Committed in:** e0be38de4 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to meet LOC limit. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AuthProvider interface fully wired into tool and callback
- Config auto-migration enables smooth transition for existing deployments
- Integration test validates end-to-end flow
- Ready for Phase 2 (side-channel URL delivery) or further provider work

---

_Phase: 01-provider-interface-google-implementation_
_Completed: 2026-03-05_

## Self-Check: PASSED

All 7 files exist. All 3 commits verified.
