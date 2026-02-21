---
name: gog
description: Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs.
homepage: https://gogcli.sh
metadata:
  {
    "minion":
      {
        "emoji": "🎮",
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "steipete/tap/gogcli",
              "bins": ["gog"],
              "label": "Install gog (brew)",
            },
          ],
      },
  }
---

# gog

Use `gog` for Gmail/Calendar/Drive/Contacts/Sheets/Docs. Requires OAuth setup.

## Authentication

> **CRITICAL: NEVER construct Google OAuth URLs manually.**
> Always use the `gog_auth_start` tool to initiate OAuth. Do not fabricate `accounts.google.com/o/oauth2/...` URLs — the tool handles client IDs, ports, callback paths, and state tokens automatically. Manually constructed URLs will fail with "deleted_client" or "invalid_request" errors.

Minion provides **non-blocking OAuth authentication** via agent tools. When you need to access Google services:

1. Use `gog_auth_start` to initiate OAuth (provides a clickable link with correct client ID, port, and callback path)
2. Remain responsive while the user authorizes in their browser
3. Receive automatic notification when authentication completes
4. While an OAuth flow is in progress, focus on completing it (check status, guide the user) unless the user explicitly cancels

**Tools available:**

- `gog_auth_start` — Start OAuth flow (non-blocking). This is the **primary** authentication method.
- `gog_auth_status` — Check authentication status
- `gog_auth_revoke` — Revoke credentials
- `gog_exec` — **Preferred way to run gog commands.** Auto-injects session credentials (account, keyring env). No need to manually set `GOG_ACCOUNT` or `--account` flags.

**Usage pattern:** Authenticate with `gog_auth_start`, then use `gog_exec` for all commands:

```
gog_exec(command: "gmail search 'newer_than:7d' --max 10")
gog_exec(command: "calendar events primary --from 2026-02-20T00:00:00Z --to 2026-02-27T00:00:00Z")
```

**Note:** The `gog` CLI binary must be installed on the server for `gog_exec` to work. The auth tools (`gog_auth_start/status/revoke`) work independently of the CLI.

**Traditional manual setup** (requires `gog` CLI to be installed):

- `gog auth credentials /path/to/client_secret.json`
- `gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets`
- `gog auth list`

Session credentials are isolated per chat session. Each user/session maintains separate OAuth credentials stored in `~/.minion/agents/{agentId}/gog-credentials/`.

Common commands

- Gmail search: `gog gmail search 'newer_than:7d' --max 10`
- Gmail messages search (per email, ignores threading): `gog gmail messages search "in:inbox from:ryanair.com" --max 20 --account you@example.com`
- Gmail send (plain): `gog gmail send --to a@b.com --subject "Hi" --body "Hello"`
- Gmail send (multi-line): `gog gmail send --to a@b.com --subject "Hi" --body-file ./message.txt`
- Gmail send (stdin): `gog gmail send --to a@b.com --subject "Hi" --body-file -`
- Gmail send (HTML): `gog gmail send --to a@b.com --subject "Hi" --body-html "<p>Hello</p>"`
- Gmail draft: `gog gmail drafts create --to a@b.com --subject "Hi" --body-file ./message.txt`
- Gmail send draft: `gog gmail drafts send <draftId>`
- Gmail reply: `gog gmail send --to a@b.com --subject "Re: Hi" --body "Reply" --reply-to-message-id <msgId>`
- Calendar list events: `gog calendar events <calendarId> --from <iso> --to <iso>`
- Calendar create event: `gog calendar create <calendarId> --summary "Title" --from <iso> --to <iso>`
- Calendar create with color: `gog calendar create <calendarId> --summary "Title" --from <iso> --to <iso> --event-color 7`
- Calendar update event: `gog calendar update <calendarId> <eventId> --summary "New Title" --event-color 4`
- Calendar show colors: `gog calendar colors`
- Drive search: `gog drive search "query" --max 10`
- Contacts: `gog contacts list --max 20`
- Sheets get: `gog sheets get <sheetId> "Tab!A1:D10" --json`
- Sheets update: `gog sheets update <sheetId> "Tab!A1:B2" --values-json '[["A","B"],["1","2"]]' --input USER_ENTERED`
- Sheets append: `gog sheets append <sheetId> "Tab!A:C" --values-json '[["x","y","z"]]' --insert INSERT_ROWS`
- Sheets clear: `gog sheets clear <sheetId> "Tab!A2:Z"`
- Sheets metadata: `gog sheets metadata <sheetId> --json`
- Docs export: `gog docs export <docId> --format txt --out /tmp/doc.txt`
- Docs cat: `gog docs cat <docId>`

Calendar Colors

- Use `gog calendar colors` to see all available event colors (IDs 1-11)
- Add colors to events with `--event-color <id>` flag
- Event color IDs (from `gog calendar colors` output):
  - 1: #a4bdfc
  - 2: #7ae7bf
  - 3: #dbadff
  - 4: #ff887c
  - 5: #fbd75b
  - 6: #ffb878
  - 7: #46d6db
  - 8: #e1e1e1
  - 9: #5484ed
  - 10: #51b749
  - 11: #dc2127

Email Formatting

- Prefer plain text. Use `--body-file` for multi-paragraph messages (or `--body-file -` for stdin).
- Same `--body-file` pattern works for drafts and replies.
- `--body` does not unescape `\n`. If you need inline newlines, use a heredoc or `$'Line 1\n\nLine 2'`.
- Use `--body-html` only when you need rich formatting.
- HTML tags: `<p>` for paragraphs, `<br>` for line breaks, `<strong>` for bold, `<em>` for italic, `<a href="url">` for links, `<ul>`/`<li>` for lists.
- Example (plain text via stdin):

  ```bash
  gog gmail send --to recipient@example.com \
    --subject "Meeting Follow-up" \
    --body-file - <<'EOF'
  Hi Name,

  Thanks for meeting today. Next steps:
  - Item one
  - Item two

  Best regards,
  Your Name
  EOF
  ```

- Example (HTML list):
  ```bash
  gog gmail send --to recipient@example.com \
    --subject "Meeting Follow-up" \
    --body-html "<p>Hi Name,</p><p>Thanks for meeting today. Here are the next steps:</p><ul><li>Item one</li><li>Item two</li></ul><p>Best regards,<br>Your Name</p>"
  ```

Notes

- When using `gog_exec`, `--account` is auto-injected. For raw CLI usage, set `GOG_ACCOUNT=you@gmail.com` to avoid repeating `--account`.
- For scripting, prefer `--json` plus `--no-input`.
- Sheets values can be passed via `--values-json` (recommended) or as inline rows.
- Docs supports export/cat/copy. In-place edits require a Docs API client (not in gog).
- Confirm before sending mail or creating events.
- `gog gmail search` returns one row per thread; use `gog gmail messages search` when you need every individual email returned separately.

## OAuth Configuration

The OAuth callback server runs automatically with the gateway and listens on `localhost:51234` by default. Configure via `config.yaml`:

```yaml
hooks:
  gogOAuth:
    enabled: true # default
    port: 51234 # default
    bind: "127.0.0.1" # default (localhost only for security)
    timeoutMinutes: 5 # default
```

**Environment variables:**

- `GOOGLE_CLIENT_ID` - OAuth client ID (required)
- `GOOGLE_CLIENT_SECRET` - OAuth client secret (required)
- `OPENCLAW_SKIP_GOG_OAUTH=1` - Disable OAuth server

**Security:**

- Server binds to localhost only (never exposed publicly)
- Cryptographic state tokens prevent CSRF attacks
- Credentials stored with 0600 file permissions
- One-time use state tokens with 5-minute expiry
