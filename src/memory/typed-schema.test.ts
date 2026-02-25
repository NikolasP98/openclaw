import { afterEach, describe, expect, it } from "vitest";
import {
  closeTypedMemoryDb,
  createObject,
  createRelationship,
  deleteObject,
  deleteRelationship,
  getObject,
  getRelated,
  getRelationshipsFrom,
  getTypedMemoryDb,
  listObjectsByType,
  openTypedMemoryDb,
  pruneExpiredObjects,
  resetTypedMemoryDbForTest,
  searchObjects,
  updateObject,
} from "./typed-schema.js";

afterEach(() => {
  closeTypedMemoryDb();
  resetTypedMemoryDbForTest();
});

describe("openTypedMemoryDb", () => {
  it("initialises without error on :memory:", () => {
    expect(() => openTypedMemoryDb(":memory:")).not.toThrow();
  });

  it("creates memory_objects table", () => {
    openTypedMemoryDb(":memory:");
    const db = getTypedMemoryDb();
    const rows = db!
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_objects'")
      .all();
    expect(rows).toHaveLength(1);
  });

  it("creates memory_relationships table", () => {
    openTypedMemoryDb(":memory:");
    const db = getTypedMemoryDb();
    const rows = db!
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_relationships'",
      )
      .all();
    expect(rows).toHaveLength(1);
  });

  it("is idempotent — second call does not throw", () => {
    openTypedMemoryDb(":memory:");
    closeTypedMemoryDb();
    resetTypedMemoryDbForTest();
    expect(() => openTypedMemoryDb(":memory:")).not.toThrow();
  });
});

describe("createObject / getObject", () => {
  it("creates and retrieves an entity", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "prod-01" });
    const obj = getObject("e1");
    expect(obj).not.toBeNull();
    expect(obj!.id).toBe("e1");
    expect(obj!.type).toBe("entity");
    expect(obj!.label).toBe("prod-01");
    expect(obj!.data).toEqual({});
  });

  it("stores and retrieves JSON data blob", () => {
    openTypedMemoryDb(":memory:");
    createObject({
      id: "f1",
      type: "fact",
      label: "prod-01 is a web server",
      data: { hostname: "prod-01", port: 443 },
    });
    const obj = getObject("f1");
    expect(obj!.data).toEqual({ hostname: "prod-01", port: 443 });
  });

  it("returns null for unknown id", () => {
    openTypedMemoryDb(":memory:");
    expect(getObject("no-such-id")).toBeNull();
  });

  it("supports all 8 object types", () => {
    openTypedMemoryDb(":memory:");
    const types = [
      "entity",
      "fact",
      "event",
      "preference",
      "task",
      "belief",
      "interaction",
      "skill",
    ] as const;
    for (const type of types) {
      createObject({ id: type, type, label: `test ${type}` });
      expect(getObject(type)!.type).toBe(type);
    }
  });
});

describe("updateObject", () => {
  it("updates label", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "old" });
    updateObject("e1", { label: "new" });
    expect(getObject("e1")!.label).toBe("new");
  });

  it("updates data", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "x", data: { a: 1 } });
    updateObject("e1", { data: { a: 2, b: 3 } });
    expect(getObject("e1")!.data).toEqual({ a: 2, b: 3 });
  });

  it("updates ttl", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "x", ttl: 1000 });
    updateObject("e1", { ttl: 5000 });
    expect(getObject("e1")!.ttl).toBe(5000);
  });

  it("is a no-op for unknown id", () => {
    openTypedMemoryDb(":memory:");
    expect(() => updateObject("ghost", { label: "x" })).not.toThrow();
  });
});

describe("deleteObject", () => {
  it("removes the object", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "x" });
    deleteObject("e1");
    expect(getObject("e1")).toBeNull();
  });

  it("is safe to call on unknown id", () => {
    openTypedMemoryDb(":memory:");
    expect(() => deleteObject("ghost")).not.toThrow();
  });
});

describe("listObjectsByType", () => {
  it("returns all objects of the given type", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "A" });
    createObject({ id: "e2", type: "entity", label: "B" });
    createObject({ id: "f1", type: "fact", label: "C" });
    const entities = listObjectsByType("entity");
    expect(entities).toHaveLength(2);
    expect(entities.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("returns empty array when no objects of that type exist", () => {
    openTypedMemoryDb(":memory:");
    expect(listObjectsByType("skill")).toEqual([]);
  });
});

describe("pruneExpiredObjects", () => {
  it("removes objects past their TTL", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "expired", ttl: 1000 });
    // Backdate created_at by 2 seconds to guarantee TTL has elapsed
    getTypedMemoryDb()!
      .prepare("UPDATE memory_objects SET created_at = ? WHERE id = ?")
      .run(Date.now() - 2000, "e1");
    const pruned = pruneExpiredObjects();
    expect(pruned).toBe(1);
    expect(getObject("e1")).toBeNull();
  });

  it("keeps objects that have not yet expired", () => {
    openTypedMemoryDb(":memory:");
    // TTL = 1 hour from now
    createObject({ id: "e1", type: "entity", label: "fresh", ttl: 3_600_000 });
    const pruned = pruneExpiredObjects();
    expect(pruned).toBe(0);
    expect(getObject("e1")).not.toBeNull();
  });

  it("keeps permanent objects (ttl = null)", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "permanent" });
    const pruned = pruneExpiredObjects();
    expect(pruned).toBe(0);
    expect(getObject("e1")).not.toBeNull();
  });
});

describe("createRelationship / getRelated", () => {
  it("creates a relationship and retrieves related objects", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "Server A" });
    createObject({ id: "e2", type: "entity", label: "Server B" });
    createRelationship({ fromId: "e1", toId: "e2", relType: "part_of" });

    const related = getRelated("e1", "part_of");
    expect(related).toHaveLength(1);
    expect(related[0]!.id).toBe("e2");
  });

  it("returns all related objects when relType is omitted", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "A" });
    createObject({ id: "e2", type: "entity", label: "B" });
    createObject({ id: "e3", type: "entity", label: "C" });
    createRelationship({ fromId: "e1", toId: "e2", relType: "related_to" });
    createRelationship({ fromId: "e1", toId: "e3", relType: "precedes" });

    const related = getRelated("e1");
    expect(related).toHaveLength(2);
  });

  it("supports all 5 relationship types", () => {
    openTypedMemoryDb(":memory:");
    const relTypes = ["related_to", "caused_by", "part_of", "precedes", "contradicts"] as const;
    createObject({ id: "src", type: "entity", label: "source" });
    for (const rt of relTypes) {
      createObject({ id: `tgt-${rt}`, type: "entity", label: rt });
      createRelationship({ fromId: "src", toId: `tgt-${rt}`, relType: rt });
    }
    const related = getRelated("src");
    expect(related).toHaveLength(5);
  });

  it("returns empty array when no relationships exist", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "lonely" });
    expect(getRelated("e1")).toEqual([]);
  });
});

describe("deleteRelationship", () => {
  it("removes a specific relationship", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "a", type: "entity", label: "A" });
    createObject({ id: "b", type: "entity", label: "B" });
    createRelationship({ fromId: "a", toId: "b", relType: "related_to" });
    deleteRelationship("a", "b", "related_to");
    expect(getRelated("a", "related_to")).toEqual([]);
  });
});

describe("deleteObject cascades relationships", () => {
  it("removes relationships when referenced object is deleted", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "a", type: "entity", label: "A" });
    createObject({ id: "b", type: "entity", label: "B" });
    createRelationship({ fromId: "a", toId: "b", relType: "related_to" });
    deleteObject("b");
    expect(getRelationshipsFrom("a")).toEqual([]);
  });
});

describe("searchObjects (FTS5)", () => {
  it("finds objects by label substring", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "production server" });
    createObject({ id: "e2", type: "entity", label: "staging server" });
    createObject({ id: "f1", type: "fact", label: "database host" });

    const results = searchObjects("server");
    expect(results.map((r) => r.id).sort()).toEqual(["e1", "e2"]);
  });

  it("filters by type when provided", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "prod server" });
    createObject({ id: "f1", type: "fact", label: "prod fact" });

    const results = searchObjects("prod", "entity");
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("e1");
  });

  it("returns empty array for empty query", () => {
    openTypedMemoryDb(":memory:");
    createObject({ id: "e1", type: "entity", label: "test" });
    expect(searchObjects("")).toEqual([]);
  });
});
