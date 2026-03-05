---
phase: 01-provider-interface-google-implementation
plan: 01
subsystem: auth
tags: [oauth, google, provider-interface, credential-migration, zod]

# Dependency graph
requires: []
provides:
  - AuthProvider interface in src/auth/provider.ts
  - GoogleAuthProvider factory function in src/auth/google/google-auth-provider.ts
  - Auth providers config types and Zod schema
  - Credential path migration from gog-credentials/ to auth-credentials/google/
affects: [01-02, 02-provider-wiring, 03-side-channel]

# Tech tracking
tech-stack:
  added: []
  patterns: [factory-function-provider, credential-path-migration, provider-owned-scopes]

key-files:
  created:
    - src/auth/provider.ts
    - src/auth/google/google-auth-provider.ts
    - src/auth/google/google-auth-provider.test.ts
    - src/config/types.auth-providers.ts
    - src/config/zod-schema.auth-providers.ts
  modified:
    - src/config/types.ts
    - src/config/zod-schema.ts

key-decisions:
  - "Used type alias (not interface) for AuthProvider per codebase convention of factory functions"
  - "StoredCredentials aliases GogCredentials for backward compatibility during migration"
  - "Auth providers schema not yet wired into root MinionSchema (deferred to Plan 02 config migration)"

patterns-established:
  - "Factory function pattern for providers: createXxxProvider() returns AuthProvider"
  - "Provider-owned credential paths: auth-credentials/{provider}/ directory structure"
  - "Atomic credential migration: copy to new path, verify, then delete old file"

requirements-completed: [PROV-01, PROV-02, PROV-03]

# Metrics
duration: 4min
completed: 2026-03-05
---

# Phase 1 Plan 01: Provider Interface & Google Implementation Summary

**AuthProvider interface with factory-function GoogleAuthProvider, credential path migration from gog-credentials/ to auth-credentials/google/, and Zod-validated config types**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T07:13:47Z
- **Completed:** 2026-03-05T07:17:47Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- AuthProvider interface defining buildAuthUrl, exchangeCode, getScopesForServices, getSupportedServices, storeCredentials, loadCredentials
- GoogleAuthProvider implementation via createGoogleAuthProvider() with all 6 Google services
- Auto-migration of credentials from gog-credentials/ to auth-credentials/google/ (atomic: copy then delete)
- Auth providers config types and Zod schema with .strict() validation
- 17 unit tests covering URL building, scope mapping, credential storage, and migration

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for AuthProvider and GoogleAuthProvider** - `9bced2f8b` (test)
2. **Task 1 (GREEN): GoogleAuthProvider implementation** - `c00738db8` (feat)
3. **Task 2: Auth providers config types and Zod schema** - `dcef74004` (feat)

## Files Created/Modified

- `src/auth/provider.ts` - AuthProvider interface with AuthUrlParams, TokenResponse, StoreCredentialsParams, StoredCredentials types
- `src/auth/google/google-auth-provider.ts` - GoogleAuthProvider factory function with credential path migration
- `src/auth/google/google-auth-provider.test.ts` - 17 unit tests (URL building, scopes, storage, migration)
- `src/config/types.auth-providers.ts` - AuthProvidersConfig, AuthServerConfig, GoogleProviderConfig types
- `src/config/zod-schema.auth-providers.ts` - AuthProvidersConfigSchema with .strict() validation
- `src/config/types.ts` - Added re-export of auth-providers types
- `src/config/zod-schema.ts` - Added re-export of AuthProvidersConfigSchema

## Decisions Made

- Used `type` alias for AuthProvider (not `interface`) to match factory function pattern where the provider is a plain object
- StoredCredentials aliases GogCredentials for backward compatibility -- avoids introducing a new credential type
- Auth providers Zod schema not wired into root MinionSchema yet to avoid Zod strict mode conflict (deferred to Plan 02)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AuthProvider interface ready for Plan 02 to wire into gog-auth-start-tool.ts and gog-oauth-server.ts
- Config types ready for Plan 02 to integrate with root schema and add migration from hooks.gogOAuth

---

_Phase: 01-provider-interface-google-implementation_
_Completed: 2026-03-05_
