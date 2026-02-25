-- Migration 001: Typed memory objects schema
-- Sprint E.2 — Spacebot-inspired typed graph memory
--
-- Safe to run on fresh DB or existing DB (all statements use IF NOT EXISTS).
-- Does NOT modify existing tables (messages, etc.).
--
-- To roll back: DROP TABLE memory_relationships;
--               DROP TABLE memory_objects_fts;
--               DROP TABLE memory_objects;

-- ── Objects table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_objects (
  id         TEXT    PRIMARY KEY,
  type       TEXT    NOT NULL CHECK(type IN (
               'entity','fact','event','preference',
               'task','belief','interaction','skill'
             )),
  label      TEXT    NOT NULL,
  data       TEXT    NOT NULL DEFAULT '{}',  -- JSON blob
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ttl        INTEGER           -- milliseconds from created_at; NULL = permanent
);

CREATE INDEX IF NOT EXISTS idx_memory_objects_type
  ON memory_objects(type);

CREATE INDEX IF NOT EXISTS idx_memory_objects_label
  ON memory_objects(label);

CREATE INDEX IF NOT EXISTS idx_memory_objects_ttl
  ON memory_objects(ttl) WHERE ttl IS NOT NULL;

-- ── Relationships table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_relationships (
  from_id    TEXT NOT NULL REFERENCES memory_objects(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES memory_objects(id) ON DELETE CASCADE,
  rel_type   TEXT NOT NULL CHECK(rel_type IN (
               'related_to','caused_by','part_of','precedes','contradicts'
             )),
  weight     REAL NOT NULL DEFAULT 1.0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id, rel_type)
);

CREATE INDEX IF NOT EXISTS idx_memory_rels_from
  ON memory_relationships(from_id);

CREATE INDEX IF NOT EXISTS idx_memory_rels_to
  ON memory_relationships(to_id);

-- ── Full-text search ──────────────────────────────────────────────────────────

CREATE VIRTUAL TABLE IF NOT EXISTS memory_objects_fts USING fts5(
  id    UNINDEXED,
  label,
  content='memory_objects',
  content_rowid='rowid'
);
