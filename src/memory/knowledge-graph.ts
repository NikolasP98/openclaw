/**
 * Knowledge graph query interface — high-level API over the typed memory schema.
 *
 * Exposes five operations as both TypeScript functions and agent tool definitions:
 *   remember       — create/upsert a typed memory object
 *   recall_entity  — find an entity by name (exact or fuzzy label match)
 *   find_related   — one-hop relationship traversal
 *   forget         — delete a memory object
 *   search_facts   — FTS5 full-text search over labels
 *
 * Gracefully degrades when the DB is not initialised (returns null / empty arrays).
 *
 * @module
 */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { resolveStateDir } from "../config/paths.js";
import type { MemoryObject, MemoryRelationship, ObjectType, RelType } from "./typed-schema.js";
import {
  createObject,
  createObjectInDb,
  createRelationship,
  createRelationshipInDb,
  deleteObject,
  deleteObjectInDb,
  getObject,
  getObjectInDb,
  getOrOpenDb,
  getRelated,
  getRelatedInDb,
  getTypedMemoryDb,
  listAllObjectsInDb,
  listAllRelationshipsInDb,
  listObjectsByType,
  listObjectsByTypeInDb,
  searchObjects,
  searchObjectsInDb,
} from "./typed-schema.js";

// ── Re-exports for callers ─────────────────────────────────────────────────────

export type { MemoryObject, MemoryRelationship, ObjectType, RelType };

// ── Helpers ────────────────────────────────────────────────────────────────────

function isDbReady(): boolean {
  return getTypedMemoryDb() !== null;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

// ── Core query functions ───────────────────────────────────────────────────────

/**
 * Create (or replace) a typed memory object.
 * Returns the generated ID.
 */
export function remember(params: {
  label: string;
  type: ObjectType;
  data?: Record<string, unknown>;
  ttl?: number | null;
}): string {
  if (!isDbReady()) {
    return "";
  }
  // Check for existing entity with the same label to avoid duplication
  if (params.type === "entity") {
    const existing = recallEntity(params.label);
    if (existing) {
      return existing.id;
    }
  }
  const id = randomUUID();
  createObject({ id, ...params });
  return id;
}

/**
 * Find an entity by label — exact match first, then fuzzy FTS5.
 * Returns null if not found or DB not ready.
 */
export function recallEntity(name: string): MemoryObject | null {
  if (!isDbReady()) {
    return null;
  }
  // Exact match via FTS
  const hits = searchObjects(name, "entity");
  const exact = hits.find((h) => h.label.trim().toLowerCase() === name.trim().toLowerCase());
  if (exact) {
    return exact;
  }
  // Return best FTS match
  return hits[0] ?? null;
}

/**
 * Find all objects related to the given entity ID.
 * Optionally filter by relationship type.
 * Returns empty array if DB not ready or entity not found.
 */
export function findRelated(entityId: string, relType?: RelType): MemoryObject[] {
  if (!isDbReady()) {
    return [];
  }
  return getRelated(entityId, relType);
}

/**
 * Delete a memory object by ID.
 * Cascades to its relationships.
 */
export function forget(id: string): void {
  if (!isDbReady()) {
    return;
  }
  deleteObject(id);
}

/**
 * Full-text search over fact labels.
 * Returns matching Fact objects sorted by relevance.
 */
export function searchFacts(query: string): MemoryObject[] {
  if (!isDbReady()) {
    return [];
  }
  return searchObjects(query, "fact");
}

/**
 * Link two objects with a typed relationship.
 * No-op if DB is not ready.
 */
export function linkObjects(fromId: string, toId: string, relType: RelType, weight = 1.0): void {
  if (!isDbReady()) {
    return;
  }
  createRelationship({ fromId, toId, relType, weight });
}

/**
 * Get all objects of a given type.
 */
export function listByType(type: ObjectType): MemoryObject[] {
  if (!isDbReady()) {
    return [];
  }
  return listObjectsByType(type);
}

/**
 * Get a single object by ID.
 */
export function getMemoryObject(id: string): MemoryObject | null {
  if (!isDbReady()) {
    return null;
  }
  return getObject(id);
}

// ── KnowledgeGraphSession ─────────────────────────────────────────────────────

/**
 * Per-agent knowledge graph session.
 * Each agent gets its own isolated SQLite DB at {stateDir}/agents/{agentId}/KG/kg.sqlite.
 */
export class KnowledgeGraphSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any) {}

  /** Open a session for the given DB file path (creates if absent). */
  static open(dbPath: string): KnowledgeGraphSession {
    return new KnowledgeGraphSession(getOrOpenDb(dbPath));
  }

  /** Open a session for a named agent, using the configured state directory. */
  static forAgent(agentId: string): KnowledgeGraphSession {
    const stateDir = resolveStateDir(process.env, os.homedir.bind(os));
    const kgDir = path.join(stateDir, "agents", agentId, "KG");
    mkdirSync(kgDir, { recursive: true });
    const dbPath = path.join(kgDir, "kg.sqlite");
    return KnowledgeGraphSession.open(dbPath);
  }

  remember(params: {
    label: string;
    type: ObjectType;
    data?: Record<string, unknown>;
    ttl?: number | null;
  }): string {
    if (params.type === "entity") {
      const existing = this.recallEntity(params.label);
      if (existing) {
        return existing.id;
      }
    }
    const id = randomUUID();
    createObjectInDb(this.db, { id, ...params });
    return id;
  }

  recallEntity(name: string): MemoryObject | null {
    const hits = searchObjectsInDb(this.db, name, "entity");
    const exact = hits.find((h) => h.label.trim().toLowerCase() === name.trim().toLowerCase());
    return exact ?? hits[0] ?? null;
  }

  findRelated(entityId: string, relType?: RelType): MemoryObject[] {
    return getRelatedInDb(this.db, entityId, relType);
  }

  forget(id: string): void {
    deleteObjectInDb(this.db, id);
  }

  searchFacts(query: string): MemoryObject[] {
    return searchObjectsInDb(this.db, query, "fact");
  }

  linkObjects(fromId: string, toId: string, relType: RelType, weight = 1.0): void {
    createRelationshipInDb(this.db, { fromId, toId, relType, weight });
  }

  listByType(type: ObjectType): MemoryObject[] {
    return listObjectsByTypeInDb(this.db, type);
  }

  listAll(): MemoryObject[] {
    return listAllObjectsInDb(this.db);
  }

  listAllRelationships(): MemoryRelationship[] {
    return listAllRelationshipsInDb(this.db);
  }

  getMemoryObject(id: string): MemoryObject | null {
    return getObjectInDb(this.db, id);
  }
}

// ── Agent tool definitions ─────────────────────────────────────────────────────

const RememberSchema = Type.Object({
  label: Type.String({ description: "Short, descriptive name for this memory object." }),
  type: Type.Union(
    [
      Type.Literal("entity"),
      Type.Literal("fact"),
      Type.Literal("event"),
      Type.Literal("preference"),
      Type.Literal("task"),
      Type.Literal("belief"),
      Type.Literal("interaction"),
      Type.Literal("skill"),
    ],
    { description: "Type of memory object to create." },
  ),
  data: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Optional structured data to attach (JSON object).",
    }),
  ),
});

const RecallEntitySchema = Type.Object({
  name: Type.String({ description: "Entity name or label to search for." }),
});

const FindRelatedSchema = Type.Object({
  entityId: Type.String({ description: "ID of the source entity." }),
  relType: Type.Optional(
    Type.Union(
      [
        Type.Literal("related_to"),
        Type.Literal("caused_by"),
        Type.Literal("part_of"),
        Type.Literal("precedes"),
        Type.Literal("contradicts"),
      ],
      { description: "Filter by relationship type. Omit to return all." },
    ),
  ),
});

const ForgetSchema = Type.Object({
  id: Type.String({ description: "ID of the memory object to delete." }),
});

const SearchFactsSchema = Type.Object({
  query: Type.String({ description: "Search query to match against fact labels." }),
});

/**
 * Create the set of knowledge graph agent tools.
 * When a `session` is provided, all operations use the session's isolated DB.
 * When omitted, falls back to the module-level singleton (CLI / legacy path).
 */
export function createKnowledgeGraphTools(session?: KnowledgeGraphSession): AnyAgentTool[] {
  const rememberTool: AnyAgentTool = {
    label: "Remember",
    name: "remember",
    description:
      "Store a typed fact permanently (person, preference, decision, event, etc.). Call this proactively whenever you learn something worth remembering across sessions — don't wait to be asked.",
    parameters: RememberSchema,
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const label = (params["label"] as string | undefined) ?? "";
      const type = (params["type"] ?? "fact") as ObjectType;
      const data =
        params["data"] && typeof params["data"] === "object" && !Array.isArray(params["data"])
          ? (params["data"] as Record<string, unknown>)
          : undefined;
      if (!label) {
        return textResult("Error: label is required");
      }
      const objectId = session
        ? session.remember({ label, type, data })
        : remember({ label, type, data });
      return textResult(objectId ? `Stored ${type} with id: ${objectId}` : "DB not ready");
    },
  };

  const recallEntityTool: AnyAgentTool = {
    label: "Recall Entity",
    name: "recall_entity",
    description:
      "Look up a known entity by name before answering questions about a person, place, or thing. Use this first; fall back to search_facts for broad queries.",
    parameters: RecallEntitySchema,
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const name = (params["name"] as string | undefined) ?? "";
      const entity = session ? session.recallEntity(name) : recallEntity(name);
      if (!entity) {
        return textResult(`No entity found for: ${name}`);
      }
      return textResult(
        JSON.stringify({ id: entity.id, label: entity.label, data: entity.data }, null, 2),
      );
    },
  };

  const findRelatedTool: AnyAgentTool = {
    label: "Find Related",
    name: "find_related",
    description:
      "Find all facts, events, or entities connected to a known entity. Use when you need surrounding context (e.g. preferences linked to a person, decisions linked to a project).",
    parameters: FindRelatedSchema,
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const entityId = (params["entityId"] as string | undefined) ?? "";
      const relType = params["relType"] as RelType | undefined;
      const related = session
        ? session.findRelated(entityId, relType)
        : findRelated(entityId, relType);
      if (related.length === 0) {
        return textResult("No related objects found.");
      }
      const summary = related.map((o) => `[${o.type}] ${o.label} (id: ${o.id})`).join("\n");
      return textResult(summary);
    },
  };

  const forgetTool: AnyAgentTool = {
    label: "Forget",
    name: "forget",
    description:
      "Remove a fact that is outdated, wrong, or superseded. Prefer updating via remember (upsert) unless the fact should be fully erased.",
    parameters: ForgetSchema,
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const objectId = (params["id"] as string | undefined) ?? "";
      if (!objectId) {
        return textResult("Error: id is required");
      }
      if (session) {
        session.forget(objectId);
      } else {
        forget(objectId);
      }
      return textResult(`Deleted memory object: ${objectId}`);
    },
  };

  const searchFactsTool: AnyAgentTool = {
    label: "Search Facts",
    name: "search_facts",
    description:
      "Full-text search across all stored facts. Use when you don't know the entity name yet, or want to find anything related to a keyword.",
    parameters: SearchFactsSchema,
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const query = (params["query"] as string | undefined) ?? "";
      if (!query) {
        return textResult("Error: query is required");
      }
      const facts = session ? session.searchFacts(query) : searchFacts(query);
      if (facts.length === 0) {
        return textResult(`No facts found for: ${query}`);
      }
      const summary = facts
        .slice(0, 10)
        .map(
          (f) => `• ${f.label}${Object.keys(f.data).length ? ` — ${JSON.stringify(f.data)}` : ""}`,
        )
        .join("\n");
      return textResult(summary);
    },
  };

  return [rememberTool, recallEntityTool, findRelatedTool, forgetTool, searchFactsTool];
}
