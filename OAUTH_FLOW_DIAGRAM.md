# Google OAuth Non-Blocking Flow - Visual Diagram

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      GOOGLE OAUTH NON-BLOCKING FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐         ┌──────────┐         ┌──────────────┐         ┌─────────┐
│   User   │         │  Agent   │         │ OAuth Server │         │ Google  │
│ (Telegram)         │ (Claude) │         │ (localhost)  │         │  OAuth  │
└────┬─────┘         └────┬─────┘         └──────┬───────┘         └────┬────┘
     │                    │                       │                      │
     │                    │    [Gateway Start]    │                      │
     │                    │◄──────────────────────┤                      │
     │                    │   Server: 127.0.0.1:51234                    │
     │                    │   Health: /health ✓   │                      │
     │                    │                       │                      │
┌────┴────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: AUTHENTICATION REQUEST                                             │
└─────────────────────────────────────────────────────────────────────────────┘
     │                    │                       │                      │
     │  "Check my Gmail"  │                       │                      │
     ├───────────────────>│                       │                      │
     │                    │                       │                      │
     │                    │ gog_auth_status()     │                      │
     │                    │ → No credentials      │                      │
     │                    │                       │                      │
     │                    │ gog_auth_start()      │                      │
     │                    │ email: user@gmail.com │                      │
     │                    │ services: [gmail]     │                      │
     │                    │                       │                      │
     │                    │ 1. Generate state     │                      │
     │                    │    crypto.randomBytes(32)                    │
     │                    │    → "a3f9e2..."      │                      │
     │                    │                       │                      │
     │                    │ 2. Build OAuth URL    │                      │
     │                    │    + client_id        │                      │
     │                    │    + redirect_uri     │                      │
     │                    │    + state            │                      │
     │                    │    + scopes           │                      │
     │                    │                       │                      │
     │                    │ 3. Store pending flow │                      │
     │                    ├──────────────────────>│                      │
     │                    │    pendingFlows.set() │                      │
     │                    │    expires: +5min     │                      │
     │                    │                       │                      │
     │                    │ 4. Update session     │                      │
     │                    │    gogAuthPending: {  │                      │
     │                    │      state, email,    │                      │
     │                    │      expiresAt        │                      │
     │                    │    }                  │                      │
     │                    │                       │                      │
     │  [OAuth URL]       │                       │                      │
     │  "Visit: https://..│                       │                      │
     │  I'll notify when  │                       │                      │
     │  complete"         │                       │                      │
     │◄───────────────────┤                       │                      │
     │                    │                       │                      │
     │  Agent stays       │  [Agent responsive]   │                      │
     │  responsive! ✓     │  Can answer Qs        │                      │
     │                    │                       │                      │
┌────┴────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: USER AUTHORIZATION (In Browser)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
     │                    │                       │                      │
     │ [Clicks link]      │                       │                      │
     ├────────────────────────────────────────────────────────────────>│
     │                    │                       │    [Google OAuth]    │
     │                    │                       │    1. Sign in        │
     │                    │                       │    2. Grant perms    │
     │                    │                       │    3. Generate code  │
     │                    │                       │                      │
┌────┴────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: OAUTH CALLBACK & TOKEN EXCHANGE                                    │
└─────────────────────────────────────────────────────────────────────────────┘
     │                    │                       │                      │
     │                    │                       │  Redirect to         │
     │                    │                       │  localhost:51234     │
     │                    │                       │◄─────────────────────┤
     │                    │                       │  code=abc&state=xyz  │
     │                    │                       │                      │
     │                    │                       │ 1. Validate state    │
     │                    │                       │    getPendingFlow()  │
     │                    │                       │    Check expiry      │
     │                    │                       │    ✓ Valid           │
     │                    │                       │                      │
     │                    │                       │ 2. Exchange code     │
     │                    │                       ├─────────────────────>│
     │                    │                       │  POST /token         │
     │                    │                       │  code + client_id    │
     │                    │                       │  + client_secret     │
     │                    │                       │                      │
     │                    │                       │  {                   │
     │                    │                       │    access_token,     │
     │                    │                       │    refresh_token,    │
     │                    │                       │    expires_in        │
     │                    │                       │  }                   │
     │                    │                       │◄─────────────────────┤
     │                    │                       │                      │
     │                    │                       │ 3. Save credentials  │
     │                    │                       │    Path: ~/.minion/│
     │                    │                       │    /agents/main/     │
     │                    │                       │    /gog-credentials/ │
     │                    │                       │    telegram_123_     │
     │                    │                       │    user@gmail.json   │
     │                    │                       │    Mode: 0600 🔒     │
     │                    │                       │                      │
     │                    │                       │ 4. Update session    │
     │                    │                       │    gogCredentialsFile│
     │                    │                       │    gogAuthEmail      │
     │                    │                       │    delete pending    │
     │                    │                       │                      │
     │                    │                       │ 5. Remove state      │
     │                    │                       │    pendingFlows      │
     │                    │                       │    .delete(state)    │
     │                    │                       │                      │
┌────┴────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: ASYNC NOTIFICATION                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
     │                    │                       │                      │
     │                    │  [Async notification] │                      │
     │                    │  enqueueFollowup()    │                      │
     │                    │◄──────────────────────┤                      │
     │                    │  "Gmail auth complete!│                      │
     │                    │   You can now use     │                      │
     │                    │   Gmail features."    │                      │
     │                    │                       │                      │
     │  "✓ Gmail auth     │                       │                      │
     │  complete!"        │                       │                      │
     │◄───────────────────┤                       │                      │
     │                    │                       │                      │
     │  [Browser shows]   │                       │                      │
     │  ✓ Success         │                       │                      │
     │  You can close     │                       │                      │
     │◄───────────────────────────────────────────┤                      │
     │                    │                       │                      │
┌────┴────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: USING GMAIL (Credentials Loaded)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
     │                    │                       │                      │
     │ "Show my emails"   │                       │                      │
     ├───────────────────>│                       │                      │
     │                    │                       │                      │
     │                    │ 1. Load credentials   │                      │
     │                    │    getValidCredentials│                      │
     │                    │    Check expiry       │                      │
     │                    │    Auto-refresh if    │                      │
     │                    │    needed             │                      │
     │                    │                       │                      │
     │                    │ 2. Execute gog cmd    │                      │
     │                    │    gog gmail messages │                      │
     │                    │    --account user@... │                      │
     │                    │    GOG_CREDENTIALS_   │                      │
     │                    │    FILE=~/.minion/..│                      │
     │                    │                       │                      │
     │  [Gmail results]   │                       │                      │
     │◄───────────────────┤                       │                      │
     │                    │                       │                      │
     └────────────────────┴───────────────────────┴──────────────────────┘


═══════════════════════════════════════════════════════════════════════════════
                              ERROR SCENARIOS
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 1: TIMEOUT (5 minutes)                                             │
└─────────────────────────────────────────────────────────────────────────────┘

User receives OAuth link but doesn't authorize within 5 minutes:

  OAuth Server:
    - Cleanup timer runs every 60 seconds
    - Finds expired flow (expiresAt < now)
    - Removes from pendingFlows
    - Enqueues timeout notification

  User:
    ← "⏱ Gmail authorization timed out (5 minutes).
       Would you like to try again?"

┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 2: USER DENIES                                                     │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks "Deny" in Google OAuth screen:

  Google redirects:
    → http://localhost:51234/oauth-callback?error=access_denied&state=xyz

  OAuth Server:
    - Validates state
    - Removes flow
    - Enqueues error notification

  User:
    ← "✗ Gmail authorization was declined.
       Let me know if you'd like to try again."

┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 3: INVALID STATE (CSRF Attack Attempt)                             │
└─────────────────────────────────────────────────────────────────────────────┘

Attacker tries callback with invalid state:

  Attacker:
    → http://localhost:51234/oauth-callback?code=fake&state=invalid

  OAuth Server:
    - getPendingFlow("invalid") → null
    - Returns 400 Bad Request
    - Logs security warning
    - No credentials created

  Browser:
    ← 400 Bad Request
       "Invalid or expired authorization request"

┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 4: TOKEN EXPIRED (Auto-Refresh)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

User's access token expires (1 hour default):

  Agent executes Gmail command:
    1. loadSessionCredentials()
    2. Check: Date.now() >= expiresAt - 5min
    3. Token expired → refreshAccessToken()
    4. POST to Google with refresh_token
    5. Save new access_token
    6. Execute command with fresh token

  User: [No interruption, seamless]


═══════════════════════════════════════════════════════════════════════════════
                           MULTI-USER SCENARIO
═══════════════════════════════════════════════════════════════════════════════

Three users authenticate simultaneously:

┌────────────┬──────────────┬────────────────────────────────────────────────┐
│ User       │ Session Key  │ Credential Path                                │
├────────────┼──────────────┼────────────────────────────────────────────────┤
│ Alice      │ telegram:111 │ ~/.minion/agents/main/gog-credentials/       │
│            │              │   telegram_111_alice@gmail.com.json            │
├────────────┼──────────────┼────────────────────────────────────────────────┤
│ Bob        │ telegram:222 │ ~/.minion/agents/main/gog-credentials/       │
│            │              │   telegram_222_bob@gmail.com.json              │
├────────────┼──────────────┼────────────────────────────────────────────────┤
│ Carol      │ discord:333  │ ~/.minion/agents/main/gog-credentials/       │
│            │              │   discord_333_carol@gmail.com.json             │
└────────────┴──────────────┴────────────────────────────────────────────────┘

Each user:
  - Gets unique state token (no collision)
  - Authorizes independently
  - Stores credentials in separate file
  - Can use Gmail simultaneously
  - Credentials never mix ✓


═══════════════════════════════════════════════════════════════════════════════
                            KEY FEATURES
═══════════════════════════════════════════════════════════════════════════════

✅ NON-BLOCKING:    Agent remains responsive during auth
✅ ASYNC:           User notified when complete
✅ SECURE:          CSRF protection, localhost-only, 0600 permissions
✅ ISOLATED:        Per-session credentials
✅ AUTO-REFRESH:    Tokens refreshed automatically
✅ ERROR-HANDLING:  Timeout, denial, invalid state
✅ MULTI-USER:      Concurrent authentication support
✅ GRACEFUL:        Server shutdown cleanup
```
