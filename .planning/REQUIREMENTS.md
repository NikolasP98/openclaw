# Requirements: Auth Request/Response Framework

**Defined:** 2026-03-05
**Core Value:** When an agent starts an auth flow, it completes. The agent blocks until auth resolves — no wandering off, no dropped flows, no silent failures.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Core Auth Flow

- [ ] **CORE-01**: Agent can initiate auth via blocking tool call that doesn't return until resolved
- [ ] **CORE-02**: Auth tool resolves with success (tokens) when user completes OAuth
- [ ] **CORE-03**: Auth tool resolves with failure (reason) when OAuth errors or user denies
- [ ] **CORE-04**: Auth tool resolves with timeout after configurable period (default 5 min)
- [ ] **CORE-05**: Auth tool resolves with cancellation when user explicitly cancels
- [ ] **CORE-06**: Auth URL delivered via side-channel directly to user's chat channel (bypassing LLM response)
- [ ] **CORE-07**: Session tracks pending/completed auth state

### Provider Abstraction

- [x] **PROV-01**: AuthProvider interface defines URL building, code exchange, scope mapping, credential storage
- [x] **PROV-02**: Google OAuth implements AuthProvider as first provider
- [x] **PROV-03**: Provider interface supports all gog services (Drive, Gmail, Calendar) via scope configuration

### Observability & Control

- [ ] **OBSV-01**: Lifecycle hooks fire on auth-start, auth-pending, auth-complete, auth-failed via emitAgentEvent
- [ ] **OBSV-02**: Agent behavior locked during pending auth — tool policy prevents non-auth tool execution

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Auth

- **AUTH-01**: Auth status tool — agent can check if auth is pending/complete without starting new flow
- **AUTH-02**: Scope merging on re-auth — re-authentication preserves previously granted scopes
- **AUTH-03**: Configurable per-provider timeout (different defaults for different providers)

### Additional Providers

- **ADDP-01**: Microsoft OAuth provider implementation
- **ADDP-02**: GitHub OAuth provider implementation

## Out of Scope

| Feature                               | Reason                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| Token refresh/rotation in auth tool   | Separate concern — belongs in credential management layer  |
| Polling-based auth check              | Promise resolution is strictly superior                    |
| Custom OAuth consent UI               | Fragile, trust-reducing — use Google's standard flow       |
| Persistent auth queue across restarts | 5-min TTL makes persistence pointless — in-memory Map only |
| "Still waiting" animations            | Annoying, adds no value — tool blocks silently             |
| WebSocket-based auth callback         | OAuth protocol requires HTTP redirect                      |
| Multi-provider simultaneous auth      | No clear use case — sequential flows if needed             |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| CORE-01     | Phase 4 | Pending  |
| CORE-02     | Phase 4 | Pending  |
| CORE-03     | Phase 5 | Pending  |
| CORE-04     | Phase 5 | Pending  |
| CORE-05     | Phase 6 | Pending  |
| CORE-06     | Phase 3 | Pending  |
| CORE-07     | Phase 2 | Pending  |
| PROV-01     | Phase 1 | Complete |
| PROV-02     | Phase 1 | Complete |
| PROV-03     | Phase 1 | Complete |
| OBSV-01     | Phase 7 | Pending  |
| OBSV-02     | Phase 8 | Pending  |

**Coverage:**

- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---

_Requirements defined: 2026-03-05_
_Last updated: 2026-03-05 after roadmap creation_
