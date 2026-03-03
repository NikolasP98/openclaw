# Knowledge Graph Memory Instructions Design

**Date:** 2026-02-26
**Status:** Implemented

## Problem

Agents had knowledge graph tools (`remember`, `recall_entity`, `find_related`, `search_facts`, `forget`) registered in their tool list but never used them. Root causes:

1. No usage guidance in system prompts — agents didn't know when or why to call them
2. Tool descriptions were terse and descriptive, not prescriptive ("what it does" not "when to call it")
3. Zero calls in production logs vs. 20 calls for `memory_search`

## Design

### Approach: New system prompt section + improved tool descriptions

**Option C chosen:** Add a `buildKnowledgeGraphSection()` to `system-prompt.ts` AND improve the 5 KG tool descriptions to be action-oriented.

Tool descriptions teach agents mid-reasoning (shown every turn in tool list). The guidance section teaches the overall workflow and distinguishes KG from file-based memory.

### KG vs. file memory relationship

**Current (complementary):** Both systems coexist. KG for structured/typed facts; MEMORY.md + daily notes for prose context and session summaries.

**Future migration target:** KG becomes primary for structured data (preferences, people, entities, decisions); file memory stays for prose only.

## Implementation

### 1. `src/memory/knowledge-graph.ts` — tool descriptions

Updated all 5 tool descriptions from descriptive to prescriptive:

| Tool            | Before                                                                       | After                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `remember`      | "Store a new memory object..."                                               | "Store a typed fact permanently...Call this proactively whenever you learn something worth remembering across sessions — don't wait to be asked."         |
| `recall_entity` | "Look up an entity in the knowledge graph by name."                          | "Look up a known entity by name before answering questions about a person, place, or thing. Use this first; fall back to search_facts for broad queries." |
| `find_related`  | "Traverse the knowledge graph to find objects related to a given entity ID." | "Find all facts, events, or entities connected to a known entity. Use when you need surrounding context."                                                 |
| `forget`        | "Delete a memory object from the knowledge graph by its ID."                 | "Remove a fact that is outdated, wrong, or superseded. Prefer updating via remember (upsert) unless the fact should be fully erased."                     |
| `search_facts`  | "Full-text search over stored facts in the knowledge graph."                 | "Full-text search across all stored facts. Use when you don't know the entity name yet, or want to find anything related to a keyword."                   |

### 2. `src/agents/system-prompt.ts` — new section

Added `buildKnowledgeGraphSection()` function:

- Activates in full prompt mode only (skips minimal/none)
- Gated on `availableTools.has("remember")`
- Placed after `buildMemorySection()` in prompt output
- Content distinguishes KG (structured facts) from file memory (prose/summaries)

## Notes

- KG tools were already unconditionally registered for all agents via `minion-tools.ts:162` — no change needed there
- KG SQLite databases (`~/.minion/memory/*.sqlite`) are initialized per agent at first use
- The `memory_objects` table schema is created lazily — no pre-seeding needed
