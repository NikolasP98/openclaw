import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createKnowledgeGraphTools,
  findRelated,
  forget,
  getMemoryObject,
  linkObjects,
  listByType,
  recallEntity,
  remember,
  searchFacts,
} from "./knowledge-graph.js";
import { openTypedMemoryDb, resetTypedMemoryDbForTest } from "./typed-schema.js";

beforeEach(() => {
  openTypedMemoryDb(":memory:");
});

afterEach(() => {
  resetTypedMemoryDbForTest();
});

describe("remember", () => {
  it("stores an object and returns a non-empty id", () => {
    const id = remember({ label: "prod-01", type: "entity" });
    expect(id).toBeTruthy();
  });

  it("deduplicates entities with the same label", () => {
    const id1 = remember({ label: "prod-01", type: "entity" });
    const id2 = remember({ label: "prod-01", type: "entity" });
    expect(id1).toBe(id2);
  });

  it("deduplicates entities case-insensitively", () => {
    const id1 = remember({ label: "Prod-01", type: "entity" });
    const id2 = remember({ label: "prod-01", type: "entity" });
    expect(id1).toBe(id2);
  });

  it("does not deduplicate non-entity types", () => {
    const id1 = remember({ label: "Use TypeScript", type: "preference" });
    const id2 = remember({ label: "Use TypeScript", type: "preference" });
    expect(id1).not.toBe(id2);
  });

  it("returns empty string when DB is not ready", () => {
    resetTypedMemoryDbForTest();
    const id = remember({ label: "test", type: "entity" });
    expect(id).toBe("");
  });
});

describe("recallEntity", () => {
  it("finds an entity by exact label", () => {
    remember({ label: "prod-01", type: "entity" });
    const entity = recallEntity("prod-01");
    expect(entity).not.toBeNull();
    expect(entity!.label).toBe("prod-01");
  });

  it("finds an entity case-insensitively", () => {
    remember({ label: "prod-01", type: "entity" });
    const entity = recallEntity("PROD-01");
    expect(entity).not.toBeNull();
  });

  it("returns null when entity does not exist", () => {
    const entity = recallEntity("nonexistent");
    expect(entity).toBeNull();
  });

  it("returns null when DB is not ready", () => {
    resetTypedMemoryDbForTest();
    const entity = recallEntity("prod-01");
    expect(entity).toBeNull();
  });
});

describe("findRelated", () => {
  it("returns related objects after linkObjects", () => {
    const id1 = remember({ label: "prod-01", type: "entity" });
    const id2 = remember({ label: "prod-02", type: "entity" });
    linkObjects(id1, id2, "related_to");
    const related = findRelated(id1);
    expect(related).toHaveLength(1);
    expect(related[0].label).toBe("prod-02");
  });

  it("filters by relationship type", () => {
    const id1 = remember({ label: "event-A", type: "event" });
    const id2 = remember({ label: "cause-B", type: "fact" });
    const id3 = remember({ label: "part-C", type: "entity" });
    linkObjects(id1, id2, "caused_by");
    linkObjects(id1, id3, "part_of");
    const causal = findRelated(id1, "caused_by");
    expect(causal).toHaveLength(1);
    expect(causal[0].label).toBe("cause-B");
  });

  it("returns empty array for unknown entity", () => {
    const related = findRelated("unknown-id");
    expect(related).toEqual([]);
  });

  it("returns empty array when DB is not ready", () => {
    resetTypedMemoryDbForTest();
    const related = findRelated("some-id");
    expect(related).toEqual([]);
  });
});

describe("forget", () => {
  it("removes an object from the graph", () => {
    const id = remember({ label: "temp-entity", type: "entity" });
    expect(recallEntity("temp-entity")).not.toBeNull();
    forget(id);
    expect(recallEntity("temp-entity")).toBeNull();
  });

  it("does not throw when DB is not ready", () => {
    resetTypedMemoryDbForTest();
    expect(() => forget("some-id")).not.toThrow();
  });
});

describe("searchFacts", () => {
  it("returns matching facts via FTS5", () => {
    remember({ label: "TypeScript is a typed superset of JavaScript", type: "fact" });
    remember({ label: "Python is dynamically typed", type: "fact" });
    const results = searchFacts("TypeScript");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].label).toContain("TypeScript");
  });

  it("returns empty array when DB is not ready", () => {
    resetTypedMemoryDbForTest();
    const results = searchFacts("anything");
    expect(results).toEqual([]);
  });
});

describe("linkObjects", () => {
  it("is a no-op when DB is not ready", () => {
    resetTypedMemoryDbForTest();
    expect(() => linkObjects("a", "b", "related_to")).not.toThrow();
  });
});

describe("listByType", () => {
  it("lists only objects of the given type", () => {
    remember({ label: "ent-1", type: "entity" });
    remember({ label: "fact-1", type: "fact" });
    remember({ label: "ent-2", type: "entity" });
    const entities = listByType("entity");
    expect(entities).toHaveLength(2);
    expect(entities.every((e) => e.type === "entity")).toBe(true);
  });

  it("returns empty array when DB is not ready", () => {
    resetTypedMemoryDbForTest();
    expect(listByType("entity")).toEqual([]);
  });
});

describe("getMemoryObject", () => {
  it("returns an object by id", () => {
    const id = remember({ label: "my-entity", type: "entity" });
    const obj = getMemoryObject(id);
    expect(obj).not.toBeNull();
    expect(obj!.label).toBe("my-entity");
  });

  it("returns null for unknown id", () => {
    expect(getMemoryObject("unknown")).toBeNull();
  });
});

describe("createKnowledgeGraphTools", () => {
  it("returns 5 tools", () => {
    const tools = createKnowledgeGraphTools();
    expect(tools).toHaveLength(5);
  });

  it("tool names are correct", () => {
    const names = createKnowledgeGraphTools().map((t) => t.name);
    expect(names).toContain("remember");
    expect(names).toContain("recall_entity");
    expect(names).toContain("find_related");
    expect(names).toContain("forget");
    expect(names).toContain("search_facts");
  });

  describe("remember tool", () => {
    it("stores object and returns id message", async () => {
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "remember")!;
      const result = await tool.execute("call-1", { label: "my-thing", type: "entity" });
      expect(result.content[0].text).toMatch(/^Stored entity with id:/);
    });

    it("returns error when label is missing", async () => {
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "remember")!;
      const result = await tool.execute("call-2", { label: "", type: "entity" });
      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("recall_entity tool", () => {
    it("returns entity data when found", async () => {
      remember({ label: "known-entity", type: "entity" });
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "recall_entity")!;
      const result = await tool.execute("call-3", { name: "known-entity" });
      expect(result.content[0].text).toContain("known-entity");
    });

    it("returns not-found message when entity absent", async () => {
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "recall_entity")!;
      const result = await tool.execute("call-4", { name: "missing" });
      expect(result.content[0].text).toContain("No entity found");
    });
  });

  describe("find_related tool", () => {
    it("returns related objects", async () => {
      const id1 = remember({ label: "node-A", type: "entity" });
      const id2 = remember({ label: "node-B", type: "entity" });
      linkObjects(id1, id2, "related_to");
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "find_related")!;
      const result = await tool.execute("call-5", { entityId: id1 });
      expect(result.content[0].text).toContain("node-B");
    });

    it("returns no-related message when none found", async () => {
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "find_related")!;
      const result = await tool.execute("call-6", { entityId: "unknown-id" });
      expect(result.content[0].text).toContain("No related objects");
    });
  });

  describe("forget tool", () => {
    it("deletes the object", async () => {
      const id = remember({ label: "delete-me", type: "entity" });
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "forget")!;
      const result = await tool.execute("call-7", { id });
      expect(result.content[0].text).toContain("Deleted");
      expect(recallEntity("delete-me")).toBeNull();
    });

    it("returns error when id is missing", async () => {
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "forget")!;
      const result = await tool.execute("call-8", { id: "" });
      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("search_facts tool", () => {
    it("returns matching facts", async () => {
      remember({ label: "Node.js uses the V8 engine", type: "fact" });
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "search_facts")!;
      const result = await tool.execute("call-9", { query: "Node.js" });
      expect(result.content[0].text).toContain("Node.js");
    });

    it("returns error when query is empty", async () => {
      const tools = createKnowledgeGraphTools();
      const tool = tools.find((t) => t.name === "search_facts")!;
      const result = await tool.execute("call-10", { query: "" });
      expect(result.content[0].text).toContain("Error");
    });
  });
});
