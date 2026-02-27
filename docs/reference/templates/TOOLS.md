---
title: "TOOLS.md Template"
summary: "Workspace template for TOOLS.md"
read_when:
  - Bootstrapping a workspace manually
---

# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Knowledge Graph

Use `remember` to store structured facts that should persist across sessions:

- Entities: people, projects, services, devices (type: entity)
- Preferences: "user prefers dark mode", "always use bun not npm" (type: preference)
- Decisions: "we decided to use SQLite over Postgres" (type: belief)
- Recurring facts: "prod server is on port 18789" (type: fact)

Use `recall_entity` before answering questions about known things.
Use `search_facts` for broad keyword lookup.

### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
