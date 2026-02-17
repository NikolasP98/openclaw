# Saved Hosts Feature — Design

**Date:** 2026-02-17
**File:** `minion-dashboard.html`

## Goal

Allow the user to save multiple gateway hosts (name + URL + token) and switch between them with one click. URL/token fields are only visible in the hosts management overlay, not the main topbar.

## Data Model

Stored in `localStorage`:

- **`minion-dash-hosts`** — JSON array of host objects:
  ```js
  { id: string, name: string, url: string, token: string, lastConnectedAt: number | null }
  ```
- **`minion-dash-last-host`** — `id` of the last successfully connected host (for auto-connect on page load).

**Migration:** on first load, if `minion-dash-url` / `minion-dash-token` exist from the old single-host format, auto-migrate them into a host entry named after the URL's hostname. Delete the old keys after migration.

## UI

### Topbar

The `#gw-url` input, `#gw-token` input, and `#conn-btn` are replaced by a single `#host-pill` button:

- **Connected:** `protopi ▾`
- **Disconnected:** `No host ▾` (or `Add host +` if no hosts saved)

Clicking the pill opens a small dropdown anchored below it listing saved hosts (click any = auto-connect) plus a "Manage hosts…" option at the bottom.

Active host shown with a green dot. Dropdown closes on outside click or Escape.

### Manage Hosts Overlay

Full-screen dark backdrop, centered panel (~520px wide). Triggered by "Manage hosts…" in dropdown, or by clicking the pill when no hosts are saved.

Contents:

- Header: "Hosts" title + ✕ close button
- List of host cards, each showing: name, URL, last-connected time, ✎ edit icon, 🗑 delete icon. Active host shows "● connected" badge.
- "Add host" form at the bottom: Name, URL, Token fields + Save button. In edit mode the form is pre-filled and Save becomes "Update".

## Behavior

| Action                          | Result                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Page load                       | Auto-connect to `minion-dash-last-host` if it exists                              |
| Click host in dropdown          | Disconnect current (if any), load host credentials, `wsConnect()`, close dropdown |
| Click ✎ edit                    | Fill add-host form with host data; card highlighted; Save → Update                |
| Click 🗑 delete (inactive host) | Remove immediately                                                                |
| Click 🗑 delete (active host)   | Inline confirm "Disconnect and delete?"                                           |
| Successful connect              | Update `lastConnectedAt`; save `minion-dash-last-host`                            |
| No saved hosts                  | Pill shows "Add host +"; click opens overlay directly                             |

## Out of Scope

- Per-host agent/session memory (agents are fetched live on connect)
- Host reordering
- Export/import of host list
