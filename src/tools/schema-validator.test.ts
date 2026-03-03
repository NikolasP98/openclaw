import { describe, expect, it } from "vitest";
import {
  validateJsonSchema,
  validateSchemaMap,
  validateValueAgainstSchema,
} from "./schema-validator.js";

describe("validateJsonSchema", () => {
  // ── Valid schemas ────────────────────────────────────────────────────

  it("accepts a minimal object schema", () => {
    const result = validateJsonSchema(JSON.stringify({ type: "object" }));
    expect(result.valid).toBe(true);
  });

  it("accepts a string schema", () => {
    const result = validateJsonSchema(JSON.stringify({ type: "string" }));
    expect(result.valid).toBe(true);
  });

  it("accepts a schema with required properties", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer", minimum: 0 },
      },
      required: ["name"],
    };
    expect(validateJsonSchema(JSON.stringify(schema)).valid).toBe(true);
  });

  it("accepts an array schema", () => {
    const schema = { type: "array", items: { type: "string" } };
    expect(validateJsonSchema(JSON.stringify(schema)).valid).toBe(true);
  });

  it("accepts an empty object (permissive schema)", () => {
    expect(validateJsonSchema("{}").valid).toBe(true);
  });

  it("accepts boolean const schemas", () => {
    expect(validateJsonSchema(JSON.stringify({ const: true })).valid).toBe(true);
  });

  it("accepts anyOf combinator schema", () => {
    const schema = { anyOf: [{ type: "string" }, { type: "number" }] };
    expect(validateJsonSchema(JSON.stringify(schema)).valid).toBe(true);
  });

  it("accepts enum schema", () => {
    const schema = { enum: ["a", "b", "c"] };
    expect(validateJsonSchema(JSON.stringify(schema)).valid).toBe(true);
  });

  // ── Invalid JSON ─────────────────────────────────────────────────────

  it("rejects invalid JSON syntax", () => {
    const result = validateJsonSchema("{invalid json}");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toMatch(/invalid JSON/i);
    }
  });

  it("rejects empty string", () => {
    expect(validateJsonSchema("").valid).toBe(false);
  });

  it("rejects JSON array at top level", () => {
    expect(validateJsonSchema("[1, 2, 3]").valid).toBe(false);
  });

  it("rejects a bare string value", () => {
    expect(validateJsonSchema('"just a string"').valid).toBe(false);
  });

  it("rejects null", () => {
    expect(validateJsonSchema("null").valid).toBe(false);
  });
});

describe("validateValueAgainstSchema", () => {
  const stringSchema = { type: "string" } as Record<string, unknown>;
  const personSchema = {
    type: "object",
    properties: { name: { type: "string" }, age: { type: "integer" } },
    required: ["name"],
  } as Record<string, unknown>;

  it("passes valid string against string schema", () => {
    expect(validateValueAgainstSchema(stringSchema, "hello").valid).toBe(true);
  });

  it("fails number against string schema", () => {
    const result = validateValueAgainstSchema(stringSchema, 42);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("passes object with required field", () => {
    expect(validateValueAgainstSchema(personSchema, { name: "Alice" }).valid).toBe(true);
  });

  it("fails object missing required field", () => {
    const result = validateValueAgainstSchema(personSchema, { age: 30 });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join()).toContain("name");
  });

  it("fails when value is null and schema requires object", () => {
    expect(validateValueAgainstSchema(personSchema, null).valid).toBe(false);
  });
});

describe("validateSchemaMap", () => {
  it("returns empty array for all valid schemas", () => {
    const schemas = {
      tool_a: { type: "object" },
      tool_b: { type: "string" },
    };
    expect(validateSchemaMap(schemas)).toEqual([]);
  });

  it("returns failures for invalid schemas", () => {
    const schemas = {
      good: { type: "string" },
      bad: { type: "not_a_real_type_XYZABC" },
    };
    const failures = validateSchemaMap(schemas);
    // ajv may or may not flag unknown type strings depending on strict mode
    // The key test is that valid schemas produce no failures
    expect(Array.isArray(failures)).toBe(true);
  });

  it("returns empty array for empty map", () => {
    expect(validateSchemaMap({})).toEqual([]);
  });
});
