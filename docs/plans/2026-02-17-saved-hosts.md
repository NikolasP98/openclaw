# Saved Hosts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a saved-hosts system to `minion-dashboard.html` so users can save multiple gateway hosts (name + URL + token) and switch with one click; URL/token are only visible in a manage-hosts overlay.

**Architecture:** All state lives in `localStorage` (`minion-dash-hosts` JSON array + `minion-dash-last-host` id). The topbar's three old elements (`#gw-url`, `#gw-token`, `#conn-btn`) are replaced by a single `#host-pill` button showing the active host name. A full-screen overlay handles host management. On page load the last used host auto-connects. Old `minion-dash-url`/`minion-dash-token` keys are migrated on first load.

**Tech Stack:** Vanilla JS + CSS in a single HTML file, no libraries, `localStorage`, existing WebSocket code (unchanged except where noted).

---

### Task 1: Add host data model + persistence helpers

**Files:**

- Modify: `minion-dashboard.html`
  - State object ~line 684 — add two new fields
  - After `ACCENT_COLORS` array ~line 734 — add helper functions
  - Init section ~line 2144 — swap `loadSettings()` call

**Step 1: Add `hosts` and `activeHostId` to state**

In the `state = { ... }` object (line ~720, after `lastTickAt`), add:

```js
hosts: [],           // [{ id, name, url, token, lastConnectedAt }]
activeHostId: null,
```

**Step 2: Add helper functions after ACCENT_COLORS array**

After the closing `];` of `ACCENT_COLORS` (~line 733), insert:

```js
// ============================================================
// Host Persistence
// ============================================================
function getActiveHost() {
  if (!state.activeHostId) return null;
  return (
    state.hosts.find(function (h) {
      return h.id === state.activeHostId;
    }) || null
  );
}

function loadHosts() {
  // Migrate old single-host format
  var oldUrl = localStorage.getItem("minion-dash-url");
  var oldToken = localStorage.getItem("minion-dash-token");
  if (oldUrl || oldToken) {
    var hostname = "host";
    try {
      hostname = new URL(oldUrl || "").hostname || "host";
    } catch (e) {}
    var migrated = [
      {
        id: uuid(),
        name: hostname,
        url: oldUrl || "",
        token: oldToken || "",
        lastConnectedAt: null,
      },
    ];
    localStorage.setItem("minion-dash-hosts", JSON.stringify(migrated));
    localStorage.removeItem("minion-dash-url");
    localStorage.removeItem("minion-dash-token");
  }

  try {
    state.hosts = JSON.parse(localStorage.getItem("minion-dash-hosts") || "[]");
  } catch (e) {
    state.hosts = [];
  }
  var lastId = localStorage.getItem("minion-dash-last-host");
  if (
    lastId &&
    state.hosts.some(function (h) {
      return h.id === lastId;
    })
  ) {
    state.activeHostId = lastId;
  } else if (state.hosts.length > 0) {
    state.activeHostId = state.hosts[0].id;
  }
}

function saveHosts() {
  localStorage.setItem("minion-dash-hosts", JSON.stringify(state.hosts));
}
```

**Step 3: Delete `loadSettings()` and `saveSettings()`**

Find and delete both functions (lines ~738-747):

```js
function loadSettings() {
  var url = localStorage.getItem("minion-dash-url");
  ...
}
function saveSettings() {
  localStorage.setItem("minion-dash-url", ...
  ...
}
```

**Step 4: Update init call**

In the init section (~line 2144), change:

```js
loadSettings();
```

to:

```js
loadHosts();
```

**Step 5: Verify in browser console**

Open dashboard, DevTools console:

```js
console.log(state.hosts, state.activeHostId);
```

Expected: `[]` and `null` (fresh page with no stored data).

---

### Task 2: Decouple `wsConnect()` and `sendConnect()` from DOM inputs

**Files:**

- Modify: `minion-dashboard.html`
  - `wsConnect()` ~line 849
  - `sendConnect()` ~line 970

**Step 1: Update `wsConnect()`**

Replace the first 6 lines of `wsConnect()`:

```js
// OLD:
function wsConnect() {
  var url = document.getElementById("gw-url").value.trim();
  var token = document.getElementById("gw-token").value.trim();
  if (!url) return;

  saveSettings();
  state.closed = false;
```

With:

```js
// NEW:
function wsConnect() {
  var host = getActiveHost();
  if (!host || !host.url) return;
  var url = host.url;
  state.closed = false;
```

**Step 2: Update `sendConnect()` to read token from active host**

Replace this one line inside `sendConnect()` (~line 974):

```js
// OLD:
var token = document.getElementById("gw-token").value.trim();
```

With:

```js
// NEW:
var activeHost = getActiveHost();
var token = activeHost ? activeHost.token : "";
```

**Step 3: Track `lastConnectedAt` and persist last-host on successful connect**

In `sendConnect()`'s `.then(function (hello) { ... })` handler, after `state.connectedAt = Date.now();` (~line 1005), add:

```js
// Track last connected time + persist which host was last used
if (state.activeHostId) {
  var connectedHost = state.hosts.find(function (h) {
    return h.id === state.activeHostId;
  });
  if (connectedHost) {
    connectedHost.lastConnectedAt = Date.now();
    saveHosts();
    localStorage.setItem("minion-dash-last-host", state.activeHostId);
  }
}
```

**Step 4: Verify via console**

```js
state.hosts = [
  { id: "h1", name: "local", url: "ws://localhost:18789", token: "", lastConnectedAt: null },
];
state.activeHostId = "h1";
wsConnect();
```

Check Network tab — WebSocket attempt to `ws://localhost:18789` should appear.

---

### Task 3: Remove `#conn-btn` references from `updateConnectionUI()`

**Files:**

- Modify: `minion-dashboard.html` — `updateConnectionUI()` ~line 1482

**Step 1: Strip button-related lines from `updateConnectionUI()`**

Replace the full function body:

```js
function updateConnectionUI() {
  var btn = document.getElementById("conn-btn");
  var led = document.getElementById("conn-led");

  if (state.connected) {
    btn.textContent = "Disconnect";
    btn.className = "conn-btn disconnect";
    led.className = "conn-led on";
    setConnStatus("Connected");
    setParticleHue("blue");
  } else if (state.connecting) {
    btn.textContent = "Cancel";
    btn.className = "conn-btn disconnect";
    led.className = "conn-led connecting";
    setConnStatus("Connecting\u2026");
    setParticleHue("amber");
  } else {
    btn.textContent = "Connect";
    btn.className = "conn-btn";
    led.className = "conn-led off";
    if (!state.closed) {
      setParticleHue("amber");
    } else {
      setConnStatus("Disconnected");
      setParticleHue("red");
    }
  }
}
```

With:

```js
function updateConnectionUI() {
  var led = document.getElementById("conn-led");

  if (state.connected) {
    if (led) led.className = "conn-led on";
    setConnStatus("Connected");
    setParticleHue("blue");
  } else if (state.connecting) {
    if (led) led.className = "conn-led connecting";
    setConnStatus("Connecting\u2026");
    setParticleHue("amber");
  } else {
    if (led) led.className = "conn-led off";
    if (!state.closed) {
      setParticleHue("amber");
    } else {
      setConnStatus("Disconnected");
      setParticleHue("red");
    }
  }
}
```

**Step 2: Verify no JS errors**

Reload the dashboard. Console should be clean (no `Cannot read properties of null` errors about `conn-btn`).

---

### Task 4: Add CSS for pill, dropdown, overlay, and host cards

**Files:**

- Modify: `minion-dashboard.html` — CSS section, just before `</style>` (~line 632)

**Step 1: Insert CSS block**

Add these styles just before the closing `</style>` tag:

```css
/* ─── Host Pill ─── */
#host-pill {
  position: relative;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 5px 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  transition: border-color 0.2s;
  white-space: nowrap;
  user-select: none;
}
#host-pill:hover {
  border-color: var(--accent);
}
#host-pill.add-host {
  border-color: var(--accent);
  color: var(--accent);
}
.pill-chevron {
  opacity: 0.5;
  font-size: 10px;
}

/* ─── Host Dropdown ─── */
#host-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 500;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  min-width: 200px;
  max-width: 320px;
  overflow: hidden;
}
.dropdown-host-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
  border-bottom: 1px solid rgba(42, 53, 72, 0.5);
  transition: background 0.12s;
}
.dropdown-host-item:hover {
  background: var(--bg3);
}
.dropdown-host-item:last-child {
  border-bottom: none;
}
.dropdown-host-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text3);
}
.dropdown-host-dot.active {
  background: var(--green);
  box-shadow: 0 0 5px var(--green);
}
.dropdown-host-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dropdown-host-last {
  font-size: 10px;
  color: var(--text3);
  flex-shrink: 0;
}
.dropdown-divider {
  height: 1px;
  background: var(--border);
}
.dropdown-manage {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--text3);
  cursor: pointer;
  transition: background 0.12s;
}
.dropdown-manage:hover {
  background: var(--bg3);
  color: var(--text2);
}
.dropdown-disconnect {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--red);
  cursor: pointer;
  transition: background 0.12s;
}
.dropdown-disconnect:hover {
  background: rgba(239, 68, 68, 0.08);
}

/* ─── Hosts Overlay ─── */
#hosts-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}
#hosts-overlay.hidden {
  display: none;
}
.hosts-panel {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 520px;
  max-width: calc(100vw - 40px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
}
.hosts-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.hosts-panel-title {
  font-size: 16px;
  font-weight: 700;
}
.hosts-panel-close {
  background: none;
  border: none;
  color: var(--text3);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.2s;
}
.hosts-panel-close:hover {
  color: var(--text);
}
.hosts-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.host-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.host-card.editing {
  border-color: var(--accent);
}
.host-card-info {
  flex: 1;
  min-width: 0;
}
.host-card-name {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.host-card-url {
  font-size: 11px;
  color: var(--text3);
  font-family: monospace;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.host-card-last {
  font-size: 10px;
  color: var(--text3);
  margin-top: 4px;
}
.host-card-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.host-card-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text3);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 8px;
  transition: all 0.15s;
}
.host-card-btn:hover {
  border-color: var(--text2);
  color: var(--text);
}
.host-card-btn.danger:hover {
  border-color: var(--red);
  color: var(--red);
}
.host-confirm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0 0;
  font-size: 12px;
  color: var(--amber);
}
.host-confirm-row button {
  background: var(--red);
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
}
.host-confirm-row .cancel-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text3);
}
.badge-connected {
  font-size: 10px;
  font-weight: 600;
  background: rgba(34, 197, 94, 0.12);
  color: var(--green);
  border: 1px solid rgba(34, 197, 94, 0.25);
  border-radius: 8px;
  padding: 1px 7px;
}
/* ─── Host Add/Edit Form ─── */
.hosts-form {
  border-top: 1px solid var(--border);
  padding: 14px 16px;
  flex-shrink: 0;
}
.hosts-form-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text3);
  margin-bottom: 10px;
}
.hosts-form-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.hosts-form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hosts-form-field.full-width {
  grid-column: 1 / -1;
}
.hosts-form-field label {
  font-size: 11px;
  color: var(--text3);
}
.hosts-form-field input {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  padding: 5px 9px;
  font-family: inherit;
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s;
}
.hosts-form-field input:focus {
  border-color: var(--accent);
}
.hosts-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.hosts-form-save {
  background: var(--accent);
  border: none;
  border-radius: 5px;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 16px;
  transition: filter 0.2s;
}
.hosts-form-save:hover {
  filter: brightness(1.15);
}
.hosts-form-cancel {
  background: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text3);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  padding: 6px 12px;
  transition: color 0.2s;
}
.hosts-form-cancel:hover {
  color: var(--text2);
}
```

**Step 2: Verify styles are parsed**

Reload page. Open DevTools → Elements → Styles. Search for `host-pill`. Rule should be visible.

---

### Task 5: Replace topbar HTML + add overlay container

**Files:**

- Modify: `minion-dashboard.html` — HTML section, lines ~638-646

**Step 1: Replace topbar HTML**

Find this block:

```html
<!-- Topbar -->
<div id="topbar">
  <input type="text" id="gw-url" placeholder="ws://host:port" spellcheck="false" />
  <input type="password" id="gw-token" placeholder="Auth token" />
  <button id="conn-btn" class="conn-btn" onclick="toggleConnection()">Connect</button>
  <div id="conn-led" class="conn-led off"></div>
  <span id="conn-status" class="conn-status">Disconnected</span>
  <div id="gw-info" style="display: none"></div>
</div>
```

Replace with:

```html
<!-- Hosts Overlay (hidden by default) -->
<div id="hosts-overlay" class="hidden"></div>

<!-- Topbar -->
<div id="topbar">
  <div id="host-pill" class="add-host" onclick="handlePillClick()">Add host +</div>
  <div id="conn-led" class="conn-led off"></div>
  <span id="conn-status" class="conn-status">Disconnected</span>
  <div id="gw-info" style="display: none"></div>
</div>
```

**Step 2: Remove old `gw-url`/`gw-token` event listeners at bottom of script**

Near the bottom of the `<script>` section (~lines 2146-2151), delete both event listeners that no longer have target elements:

```js
document.getElementById("gw-url").addEventListener("keydown", function (e) {
  if (e.key === "Enter") toggleConnection();
});
document.getElementById("gw-token").addEventListener("keydown", function (e) {
  if (e.key === "Enter") toggleConnection();
});
```

**Step 3: Verify**

Reload dashboard. Topbar should show "Add host +" (blue-bordered). No JS errors in console.

---

### Task 6: Implement `renderHostPill()` and wire into `updateConnectionUI()`

**Files:**

- Modify: `minion-dashboard.html` — JS section, after `setConnStatus()` (~line 1513)

**Step 1: Add `renderHostPill()` function**

After `setConnStatus()`, insert:

```js
function renderHostPill() {
  var pill = document.getElementById("host-pill");
  if (!pill) return;
  if (state.hosts.length === 0) {
    pill.className = "add-host";
    pill.textContent = "Add host +";
    return;
  }
  var host = getActiveHost();
  var name = host ? host.name : "No host";
  pill.className = "";
  pill.innerHTML = escHtml(name) + ' <span class="pill-chevron">\u25be</span>';
}
```

**Step 2: Call `renderHostPill()` from `updateConnectionUI()`**

At the very end of `updateConnectionUI()`, add:

```js
renderHostPill();
```

**Step 3: Call `renderHostPill()` right after `loadHosts()` in init**

In the init section (~line 2144), update:

```js
// OLD:
loadHosts();

// NEW:
loadHosts();
renderHostPill();
```

**Step 4: Verify pill rendering**

Open console and run:

```js
state.hosts = [
  {
    id: "h1",
    name: "protopi",
    url: "ws://localhost:18789",
    token: "",
    lastConnectedAt: Date.now() - 3600000,
  },
];
state.activeHostId = "h1";
renderHostPill();
```

Pill should now show "protopi ▾".

---

### Task 7: Implement dropdown open/close + `connectToHost()`

**Files:**

- Modify: `minion-dashboard.html` — JS section, after `renderHostPill()`

**Step 1: Add dropdown state variable**

After `var pollPresenceTimer = null;` (~line 1428), add:

```js
var dropdownOpen = false;
```

**Step 2: Add `handlePillClick()`, dropdown functions, and `connectToHost()`**

After `renderHostPill()`, insert:

```js
// ============================================================
// Host Dropdown
// ============================================================
function handlePillClick() {
  if (state.hosts.length === 0) {
    openManageOverlay(null);
    return;
  }
  if (dropdownOpen) {
    closeHostDropdown();
  } else {
    openHostDropdown();
  }
}

function openHostDropdown() {
  closeHostDropdown();
  dropdownOpen = true;
  var pill = document.getElementById("host-pill");
  if (!pill) return;

  var html = "";
  for (var i = 0; i < state.hosts.length; i++) {
    var h = state.hosts[i];
    var isActive = h.id === state.activeHostId && state.connected;
    var lastStr = h.lastConnectedAt ? fmtTimeAgo(h.lastConnectedAt) : "never";
    var safeId = h.id.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    html +=
      '<div class="dropdown-host-item" onclick="connectToHost(\'' +
      safeId +
      "')\">" +
      '<span class="dropdown-host-dot' +
      (isActive ? " active" : "") +
      '"></span>' +
      '<span class="dropdown-host-name">' +
      escHtml(h.name) +
      "</span>" +
      '<span class="dropdown-host-last">' +
      escHtml(lastStr) +
      "</span>" +
      "</div>";
  }
  if (state.connected) {
    html +=
      '<div class="dropdown-disconnect" onclick="wsDisconnect(); closeHostDropdown();">Disconnect</div>';
  }
  html += '<div class="dropdown-divider"></div>';
  html += '<div class="dropdown-manage" onclick="openManageOverlay(null)">Manage hosts\u2026</div>';

  var dropdown = document.createElement("div");
  dropdown.id = "host-dropdown";
  dropdown.innerHTML = html;
  pill.appendChild(dropdown);

  setTimeout(function () {
    document.addEventListener("click", outsideDropdownHandler);
    document.addEventListener("keydown", escDropdownHandler);
  }, 0);
}

function closeHostDropdown() {
  dropdownOpen = false;
  var existing = document.getElementById("host-dropdown");
  if (existing) existing.remove();
  document.removeEventListener("click", outsideDropdownHandler);
  document.removeEventListener("keydown", escDropdownHandler);
}

function outsideDropdownHandler(e) {
  var pill = document.getElementById("host-pill");
  if (pill && !pill.contains(e.target)) closeHostDropdown();
}

function escDropdownHandler(e) {
  if (e.key === "Escape") closeHostDropdown();
}

function connectToHost(hostId) {
  closeHostDropdown();
  var host = state.hosts.find(function (h) {
    return h.id === hostId;
  });
  if (!host) return;
  // Already connected to same host — no-op
  if (state.activeHostId === hostId && state.connected) return;
  // Disconnect current if any
  if (state.connected || state.connecting) wsDisconnect();
  state.activeHostId = hostId;
  renderHostPill();
  wsConnect();
}
```

**Step 3: Verify dropdown**

1. Add a host via console (as in Task 6, Step 4)
2. Click the pill → dropdown should appear with the host + "Manage hosts…"
3. Press Escape → dropdown closes
4. Click outside → dropdown closes
5. Click host in dropdown → `wsConnect()` is called (verify Network tab)

---

### Task 8: Implement Manage Hosts Overlay

**Files:**

- Modify: `minion-dashboard.html` — JS section, after the dropdown functions

**Step 1: Add overlay state variables**

After `var dropdownOpen = false;`:

```js
var overlayEditId = null; // null = add mode, string id = edit mode
var overlayConfirmDeleteId = null;
```

**Step 2: Add overlay open/close + render functions**

After the dropdown functions block, insert:

```js
// ============================================================
// Manage Hosts Overlay
// ============================================================
function openManageOverlay(editId) {
  closeHostDropdown();
  overlayEditId = editId;
  overlayConfirmDeleteId = null;
  renderManageOverlay();
  var overlay = document.getElementById("hosts-overlay");
  overlay.classList.remove("hidden");
  overlay.addEventListener("click", overlayBackdropHandler);
  document.addEventListener("keydown", escOverlayHandler);
}

function closeManageOverlay() {
  overlayEditId = null;
  overlayConfirmDeleteId = null;
  var overlay = document.getElementById("hosts-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.innerHTML = "";
  overlay.removeEventListener("click", overlayBackdropHandler);
  document.removeEventListener("keydown", escOverlayHandler);
}

function overlayBackdropHandler(e) {
  if (e.target === document.getElementById("hosts-overlay")) closeManageOverlay();
}

function escOverlayHandler(e) {
  if (e.key === "Escape") closeManageOverlay();
}

function renderManageOverlay() {
  var overlay = document.getElementById("hosts-overlay");
  if (!overlay) return;

  // Host cards
  var cardsHtml = "";
  if (state.hosts.length === 0) {
    cardsHtml =
      '<div style="color:var(--text3);font-size:12px;padding:8px 0;">No hosts saved yet.</div>';
  }
  for (var i = 0; i < state.hosts.length; i++) {
    var h = state.hosts[i];
    var isActive = h.id === state.activeHostId && state.connected;
    var isEditing = h.id === overlayEditId;
    var isConfirming = h.id === overlayConfirmDeleteId;
    var safeId = h.id.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

    var confirmHtml = "";
    if (isConfirming) {
      confirmHtml =
        '<div class="host-confirm-row">' +
        "Disconnect and delete? " +
        "<button onclick=\"confirmDeleteHost('" +
        safeId +
        "')\">Delete</button>" +
        '<button class="cancel-btn" onclick="cancelDeleteConfirm()">Cancel</button>' +
        "</div>";
    }

    cardsHtml +=
      '<div class="host-card' +
      (isEditing ? " editing" : "") +
      '">' +
      '<div class="host-card-info">' +
      '<div class="host-card-name">' +
      escHtml(h.name) +
      (isActive ? ' <span class="badge-connected">\u25cf connected</span>' : "") +
      "</div>" +
      '<div class="host-card-url">' +
      escHtml(h.url) +
      "</div>" +
      '<div class="host-card-last">Last connected: ' +
      (h.lastConnectedAt ? fmtTimeAgo(h.lastConnectedAt) : "never") +
      "</div>" +
      confirmHtml +
      "</div>" +
      '<div class="host-card-actions">' +
      '<button class="host-card-btn" onclick="startEditHost(\'' +
      safeId +
      "')\">&#9998;</button>" +
      '<button class="host-card-btn danger" onclick="requestDeleteHost(\'' +
      safeId +
      "')\">&#128465;</button>" +
      "</div>" +
      "</div>";
  }

  // Form
  var isEditMode = overlayEditId !== null;
  var editHost = isEditMode
    ? state.hosts.find(function (h) {
        return h.id === overlayEditId;
      })
    : null;

  var formHtml =
    '<div class="hosts-form">' +
    '<div class="hosts-form-title">' +
    (isEditMode ? "Edit host" : "Add host") +
    "</div>" +
    '<div class="hosts-form-fields">' +
    '<div class="hosts-form-field">' +
    "<label>Name</label>" +
    '<input id="hf-name" type="text" placeholder="e.g. protopi" value="' +
    escHtml(editHost ? editHost.name : "") +
    '" />' +
    "</div>" +
    '<div class="hosts-form-field">' +
    "<label>URL</label>" +
    '<input id="hf-url" type="text" placeholder="ws://host:port" spellcheck="false" value="' +
    escHtml(editHost ? editHost.url : "") +
    '" />' +
    "</div>" +
    '<div class="hosts-form-field full-width">' +
    "<label>Token</label>" +
    '<input id="hf-token" type="password" placeholder="Auth token" value="' +
    escHtml(editHost ? editHost.token : "") +
    '" />' +
    "</div>" +
    "</div>" +
    '<div class="hosts-form-actions">' +
    (isEditMode
      ? '<button class="hosts-form-cancel" onclick="cancelEditHost()">Cancel</button>'
      : "") +
    '<button class="hosts-form-save" onclick="submitHostForm()">' +
    (isEditMode ? "Update" : "Save") +
    "</button>" +
    "</div>" +
    "</div>";

  overlay.innerHTML =
    '<div class="hosts-panel">' +
    '<div class="hosts-panel-header">' +
    '<span class="hosts-panel-title">Hosts</span>' +
    '<button class="hosts-panel-close" onclick="closeManageOverlay()">&#10005;</button>' +
    "</div>" +
    '<div class="hosts-panel-body">' +
    cardsHtml +
    "</div>" +
    formHtml +
    "</div>";
}
```

**Step 3: Verify overlay renders**

Run in console: `openManageOverlay(null)`

Expected: full-screen dark overlay with a "Hosts" panel, empty host list, and Add host form with Name/URL/Token fields.

Run: `closeManageOverlay()` → overlay hides.

---

### Task 9: Implement host CRUD functions

**Files:**

- Modify: `minion-dashboard.html` — JS section, after `renderManageOverlay()`

**Step 1: Add CRUD functions**

```js
function submitHostForm() {
  var name = (document.getElementById("hf-name") || {}).value || "";
  var url = (document.getElementById("hf-url") || {}).value || "";
  var token = (document.getElementById("hf-token") || {}).value || "";
  name = name.trim();
  url = url.trim();
  token = token.trim();

  if (!name || !url) {
    alert("Name and URL are required.");
    return;
  }

  if (overlayEditId) {
    var host = state.hosts.find(function (h) {
      return h.id === overlayEditId;
    });
    if (host) {
      host.name = name;
      host.url = url;
      host.token = token;
    }
    overlayEditId = null;
  } else {
    var newHost = { id: uuid(), name: name, url: url, token: token, lastConnectedAt: null };
    state.hosts.push(newHost);
    if (!state.activeHostId) state.activeHostId = newHost.id;
  }

  saveHosts();
  renderHostPill();
  renderManageOverlay();
}

function startEditHost(hostId) {
  overlayEditId = hostId;
  overlayConfirmDeleteId = null;
  renderManageOverlay();
  setTimeout(function () {
    var el = document.getElementById("hf-name");
    if (el) el.focus();
  }, 50);
}

function cancelEditHost() {
  overlayEditId = null;
  renderManageOverlay();
}

function requestDeleteHost(hostId) {
  var isActive = hostId === state.activeHostId && state.connected;
  if (isActive) {
    overlayConfirmDeleteId = hostId;
    renderManageOverlay();
  } else {
    doDeleteHost(hostId);
  }
}

function confirmDeleteHost(hostId) {
  if (hostId === state.activeHostId && (state.connected || state.connecting)) {
    wsDisconnect();
  }
  doDeleteHost(hostId);
}

function cancelDeleteConfirm() {
  overlayConfirmDeleteId = null;
  renderManageOverlay();
}

function doDeleteHost(hostId) {
  state.hosts = state.hosts.filter(function (h) {
    return h.id !== hostId;
  });
  if (state.activeHostId === hostId) {
    state.activeHostId = state.hosts.length > 0 ? state.hosts[0].id : null;
  }
  overlayConfirmDeleteId = null;
  saveHosts();
  if (state.hosts.length === 0) localStorage.removeItem("minion-dash-last-host");
  renderHostPill();
  renderManageOverlay();
}
```

**Step 2: Verify CRUD**

1. Open overlay: `openManageOverlay(null)`
2. Fill Name: "local", URL: "ws://localhost:18789", Token: "abc" → click Save → host card appears, pill shows "local ▾"
3. Click ✎ → form pre-fills, Save becomes "Update" → change name, click Update → card updates
4. Click 🗑 on disconnected host → immediately removed; if no hosts left, pill reverts to "Add host +"
5. If connected and you delete the active host → confirm row appears with Delete/Cancel buttons

---

### Task 10: Update auto-connect init

**Files:**

- Modify: `minion-dashboard.html` — bottom of `<script>`, the `autoConnect()` IIFE ~lines 2154-2168

**Step 1: Replace the `autoConnect()` IIFE**

Find and replace the entire IIFE:

```js
// Auto-connect: ?autoconnect in URL, or ?url=...&token=... params
(function autoConnect() {
  var params = new URLSearchParams(window.location.search);
  if (params.get("url")) document.getElementById("gw-url").value = params.get("url");
  if (params.get("token")) document.getElementById("gw-token").value = params.get("token");
  if (params.has("url") || params.has("token")) saveSettings();

  var shouldConnect = params.has("autoconnect") || params.has("url");
  var url = document.getElementById("gw-url").value.trim();
  var token = document.getElementById("gw-token").value.trim();
  if (shouldConnect && url && token) {
    setTimeout(function () {
      if (!state.connected && !state.connecting) wsConnect();
    }, 500);
  }
})();
```

With:

```js
// Auto-connect from saved hosts or ?url= params
(function autoConnect() {
  var params = new URLSearchParams(window.location.search);
  var paramUrl = params.get("url");
  var paramToken = params.get("token");

  if (paramUrl) {
    // URL param: create or reuse a host entry
    var paramName =
      params.get("name") ||
      (function () {
        try {
          return new URL(paramUrl).hostname || "host";
        } catch (e) {
          return "host";
        }
      })();
    var existing = state.hosts.find(function (h) {
      return h.url === paramUrl;
    });
    if (existing) {
      if (paramToken) existing.token = paramToken;
      state.activeHostId = existing.id;
    } else {
      var newH = {
        id: uuid(),
        name: paramName,
        url: paramUrl,
        token: paramToken || "",
        lastConnectedAt: null,
      };
      state.hosts.push(newH);
      state.activeHostId = newH.id;
    }
    saveHosts();
    renderHostPill();
    setTimeout(function () {
      if (!state.connected && !state.connecting) wsConnect();
    }, 500);
    return;
  }

  // Auto-connect to last used host
  if (state.activeHostId && getActiveHost()) {
    setTimeout(function () {
      if (!state.connected && !state.connecting) wsConnect();
    }, 500);
  }
})();
```

**Step 2: Verify auto-connect on reload**

1. Add a host via the overlay and save it
2. Reload the page
3. Dashboard should auto-connect to the saved host (LED goes blue/amber, agents load)
4. Also test `?url=ws://localhost:18789&token=testtoken` URL param — should create a host and connect

---

### Task 11: End-to-end Playwright verification

**Files:**

- Create: `/tmp/test_saved_hosts.py` (temp, not committed)

**Step 1: Create test script**

```python
from playwright.sync_api import sync_playwright, expect

TOKEN = "502c5a92f4999c7e95457a16c5791e1ffbad84132eafb29acc816271472166d2"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Clear any saved state before starting
    page.goto('http://localhost:8787/minion-dashboard.html')
    page.wait_for_load_state('networkidle')
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_load_state('networkidle')

    page.screenshot(path='/tmp/hosts_01_initial.png')

    # 1. Initial state: "Add host +" pill, no url/token inputs
    pill_text = page.locator('#host-pill').inner_text()
    assert 'Add host' in pill_text, f"Expected 'Add host +', got: {pill_text!r}"
    assert page.locator('#gw-url').count() == 0, "gw-url should not exist"
    assert page.locator('#gw-token').count() == 0, "gw-token should not exist"
    print("✓ Initial state: 'Add host +' pill, no url/token inputs")

    # 2. Click pill -> opens overlay directly (no hosts yet)
    page.click('#host-pill')
    page.wait_for_selector('.hosts-panel')
    assert page.locator('#hosts-overlay:not(.hidden)').count() == 1
    print("✓ Clicking pill with no hosts opens overlay")

    # 3. Add a host
    page.fill('#hf-name', 'protopi')
    page.fill('#hf-url', 'ws://localhost:18789')
    page.fill('#hf-token', TOKEN)
    page.click('.hosts-form-save')
    page.screenshot(path='/tmp/hosts_02_after_add.png')

    # Pill should now show "protopi ▾"
    pill_text = page.locator('#host-pill').inner_text()
    assert 'protopi' in pill_text, f"Expected 'protopi' in pill, got: {pill_text!r}"
    print(f"✓ Pill shows host name: {pill_text.strip()!r}")

    # Host card visible in overlay
    card_name = page.locator('.host-card-name').first.inner_text()
    assert 'protopi' in card_name
    print(f"✓ Host card: {card_name.strip()!r}")

    # 4. Close overlay
    page.click('.hosts-panel-close')
    page.wait_for_selector('#hosts-overlay.hidden')
    print("✓ Overlay closes via ✕ button")

    # 5. Click pill -> opens dropdown (has hosts now)
    page.click('#host-pill')
    page.wait_for_selector('#host-dropdown')
    items = page.locator('.dropdown-host-item').all()
    assert len(items) == 1, f"Expected 1 host item, got {len(items)}"
    manage = page.locator('.dropdown-manage')
    assert manage.count() == 1
    page.screenshot(path='/tmp/hosts_03_dropdown.png')
    print(f"✓ Dropdown: {len(items)} host(s) + 'Manage hosts...'")

    # 6. Click host to connect
    page.locator('.dropdown-host-item').first.click()
    page.wait_for_timeout(4000)
    led_class = page.locator('#conn-led').get_attribute('class')
    print(f"✓ After connect attempt, LED class: {led_class!r}")
    page.screenshot(path='/tmp/hosts_04_connected.png')

    # 7. Re-open overlay and verify "● connected" badge
    page.click('#host-pill')
    page.wait_for_timeout(200)
    page.locator('.dropdown-manage').click()
    page.wait_for_selector('.hosts-panel')
    page.screenshot(path='/tmp/hosts_05_overlay_connected.png')

    # 8. Edit host
    page.locator('.host-card-btn').first.click()  # ✎ edit
    hf_name_val = page.locator('#hf-name').input_value()
    assert hf_name_val == 'protopi', f"Form should be pre-filled, got: {hf_name_val!r}"
    page.fill('#hf-name', 'protopi-edited')
    save_label = page.locator('.hosts-form-save').inner_text()
    assert save_label == 'Update', f"Save button should say 'Update', got: {save_label!r}"
    page.click('.hosts-form-save')
    updated = page.locator('.host-card-name').first.inner_text()
    assert 'protopi-edited' in updated
    print(f"✓ Host edit: name updated to {updated.strip()!r}")

    # 9. Delete - since connected, should show confirm row
    page.locator('.host-card-btn.danger').first.click()
    page.wait_for_timeout(200)
    confirm_row = page.locator('.host-confirm-row')
    if confirm_row.count() > 0:
        print("✓ Active host delete shows confirmation row")
        page.locator('.host-confirm-row button').first.click()  # click Delete
    page.wait_for_timeout(500)
    remaining = page.locator('.host-card').count()
    print(f"✓ After delete: {remaining} host(s) remaining (expected 0)")

    # 10. Pill reverts to "Add host +"
    page.click('.hosts-panel-close')
    pill_text = page.locator('#host-pill').inner_text()
    assert 'Add host' in pill_text, f"Expected 'Add host +', got: {pill_text!r}"
    print("✓ Pill reverts to 'Add host +' when no hosts remain")

    browser.close()
    print("\n✅ All checks passed!")
```

**Step 2: Run the test**

```bash
python /tmp/test_saved_hosts.py
```

Expected output:

```
✓ Initial state: 'Add host +' pill, no url/token inputs
✓ Clicking pill with no hosts opens overlay
✓ Pill shows host name: 'protopi ▾'
✓ Host card: 'protopi'
✓ Overlay closes via ✕ button
✓ Dropdown: 1 host(s) + 'Manage hosts...'
✓ After connect attempt, LED class: 'conn-led on'  (or 'conn-led connecting')
✓ Host edit: name updated to 'protopi-edited ● connected'  (or without badge if disconnected)
✓ Active host delete shows confirmation row
✓ After delete: 0 host(s) remaining (expected 0)
✓ Pill reverts to 'Add host +' when no hosts remain

✅ All checks passed!
```

**Step 3: Test migration from old localStorage format**

In browser console:

```js
localStorage.clear();
localStorage.setItem("minion-dash-url", "ws://localhost:18789");
localStorage.setItem("minion-dash-token", "oldtoken");
location.reload();
```

After reload:

- `localStorage.getItem('minion-dash-url')` should be `null` (migrated + removed)
- `state.hosts` should have 1 entry with `name: 'localhost'`
- Pill should show "localhost ▾"
- Dashboard should auto-connect

**Step 4: Commit**

```bash
cd /home/nikolas/Documents/CODE/AI/openclaw
git add minion-dashboard.html
git commit -m "feat(dashboard): add saved hosts with dropdown and manage overlay"
```
