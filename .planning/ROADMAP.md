# Roadmap: Auth Request/Response Framework

## Overview

Transform the fire-and-forget OAuth tool into a blocking auth framework where the agent waits for resolution. We start with the provider abstraction and Google implementation (foundation), then build the deferred Promise registry that tracks flows, solve the URL delivery deadlock via side-channel messaging, wire up the blocking tool with success resolution, add failure/timeout/cancellation paths, and finish with observability hooks and agent behavior constraints.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Provider Interface & Google Implementation** - Define AuthProvider abstraction and implement Google OAuth as first provider
- [ ] **Phase 2: Auth Flow Registry** - Deferred Promise registry that tracks pending/completed auth flows
- [ ] **Phase 3: Side-Channel URL Delivery** - Deliver auth URL directly to user's chat channel, bypassing agent response
- [ ] **Phase 4: Blocking Auth Tool (Success Path)** - Agent calls auth tool, blocks until OAuth completes with tokens
- [ ] **Phase 5: Failure & Timeout Resolution** - Auth tool resolves with failure reason or configurable timeout
- [ ] **Phase 6: User Cancellation** - Auth flow resolves when user explicitly cancels
- [ ] **Phase 7: Lifecycle Hooks** - Auth events fire via emitAgentEvent for gateway observability
- [ ] **Phase 8: Agent Behavior Lock** - Tool policy prevents non-auth tool execution during pending auth

## Phase Details

### Phase 1: Provider Interface & Google Implementation

**Goal**: A clean provider abstraction exists and Google OAuth works through it
**Depends on**: Nothing (first phase)
**Requirements**: PROV-01, PROV-02, PROV-03
**Success Criteria** (what must be TRUE):

1. AuthProvider interface defines methods for URL building, code exchange, scope mapping, and credential storage
2. Google OAuth provider implements AuthProvider and generates correct OAuth URLs with access_type=offline
3. Google provider supports Drive, Gmail, and Calendar scopes via scope configuration
4. Existing gog CLI tools continue to work unchanged (backward compatibility)
   **Plans**: 2 plans

Plans:

- [ ] 01-01-PLAN.md — Define AuthProvider interface, GoogleAuthProvider implementation, config types and Zod schema
- [ ] 01-02-PLAN.md — Rewire tool and callback handler to use provider, add config auto-migration

### Phase 2: Auth Flow Registry

**Goal**: The system can track auth flows from initiation to resolution using deferred Promises
**Depends on**: Phase 1
**Requirements**: CORE-07
**Success Criteria** (what must be TRUE):

1. AuthFlowRegistry stores pending flows keyed by OAuth state token with resolve/reject handles
2. Registry exposes methods to create, resolve, reject, and query flows
3. Gateway shutdown cleans up all pending flows (no Promise leaks)
   **Plans**: TBD

Plans:

- [ ] 02-01: TBD

### Phase 3: Side-Channel URL Delivery

**Goal**: Auth URL reaches the user directly via their chat channel without requiring agent tool response
**Depends on**: Phase 2
**Requirements**: CORE-06
**Success Criteria** (what must be TRUE):

1. Auth URL is sent directly to the user's active channel (WhatsApp/Telegram/etc.) before the tool blocks
2. URL delivery does not depend on the agent's LLM response (uses enqueueFollowupRun or equivalent side-channel)
3. User receives a clickable auth URL they can act on while the tool is blocking
   **Plans**: TBD

Plans:

- [ ] 03-01: TBD

### Phase 4: Blocking Auth Tool (Success Path)

**Goal**: Agent initiates auth via a tool call that blocks until OAuth succeeds and returns tokens
**Depends on**: Phase 3
**Requirements**: CORE-01, CORE-02
**Success Criteria** (what must be TRUE):

1. Agent calls the auth tool and the tool does not return until auth resolves
2. When user completes OAuth in browser, the HTTP callback resolves the tool's Promise with tokens
3. Agent receives success result with token data and can proceed to use authenticated services
   **Plans**: TBD

Plans:

- [ ] 04-01: TBD

### Phase 5: Failure & Timeout Resolution

**Goal**: Auth tool handles error cases -- OAuth failures resolve with reasons, stale flows time out
**Depends on**: Phase 4
**Requirements**: CORE-03, CORE-04
**Success Criteria** (what must be TRUE):

1. When OAuth errors or user denies consent, auth tool resolves with failure and a human-readable reason
2. Auth flow times out after configurable period (default 5 minutes) if user never completes OAuth
3. Timed-out flows are cleaned up from the registry (no resource leaks)
   **Plans**: TBD

Plans:

- [ ] 05-01: TBD

### Phase 6: User Cancellation

**Goal**: Users can explicitly cancel a pending auth flow
**Depends on**: Phase 4
**Requirements**: CORE-05
**Success Criteria** (what must be TRUE):

1. User can tell the agent to cancel auth and the pending flow resolves with cancellation status
2. Cancelled flows are cleaned up from the registry
3. Agent receives cancellation result and can respond appropriately (not stuck blocking)
   **Plans**: TBD

Plans:

- [ ] 06-01: TBD

### Phase 7: Lifecycle Hooks

**Goal**: Gateway and system can observe auth flow events for logging, metrics, and coordination
**Depends on**: Phase 4
**Requirements**: OBSV-01
**Success Criteria** (what must be TRUE):

1. auth-start event fires when agent initiates an auth flow
2. auth-pending event fires when URL is delivered and tool is blocking
3. auth-complete event fires on successful token exchange
4. auth-failed event fires on failure, timeout, or cancellation
   **Plans**: TBD

Plans:

- [ ] 07-01: TBD

### Phase 8: Agent Behavior Lock

**Goal**: Agent cannot wander off during pending auth -- tool execution is gated
**Depends on**: Phase 2, Phase 7
**Requirements**: OBSV-02
**Success Criteria** (what must be TRUE):

1. While auth is pending, agent cannot execute non-auth tools (tool policy rejects them)
2. After auth resolves (any outcome), normal tool execution resumes
3. Tool policy enforcement uses the AuthFlowRegistry to check pending state (no separate tracking)
   **Plans**: TBD

Plans:

- [ ] 08-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase                                         | Plans Complete | Status      | Completed |
| --------------------------------------------- | -------------- | ----------- | --------- |
| 1. Provider Interface & Google Implementation | 1/2            | In Progress |           |
| 2. Auth Flow Registry                         | 0/1            | Not started | -         |
| 3. Side-Channel URL Delivery                  | 0/1            | Not started | -         |
| 4. Blocking Auth Tool (Success Path)          | 0/1            | Not started | -         |
| 5. Failure & Timeout Resolution               | 0/1            | Not started | -         |
| 6. User Cancellation                          | 0/1            | Not started | -         |
| 7. Lifecycle Hooks                            | 0/1            | Not started | -         |
| 8. Agent Behavior Lock                        | 0/1            | Not started | -         |
