/**
 * JSON Schema validator for runtime schema validation.
 *
 * Validates JSON schema strings using ajv (meta-schema check) and
 * validates data against schemas at runtime. Used for V.2 sprint item:
 * validate tool input schemas on registration so malformed schemas fail
 * loudly at startup rather than silently at tool call time.
 */

import AjvPkg, { type ErrorObject } from "ajv";

const Ajv = AjvPkg as unknown as new (opts?: object) => import("ajv").default;

const ajv = new Ajv({ allErrors: true, strict: false });

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) return ["unknown validation error"];
  return errors.map((e) => {
    const location = e.instancePath ? `at ${e.instancePath}` : "at root";
    return `${location}: ${e.message ?? "invalid"}`;
  });
}

export type SchemaValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

/**
 * Parse and meta-validate a JSON schema string.
 *
 * Returns `{ valid: true }` if the string is valid JSON and a valid
 * JSON Schema draft-07 schema. Otherwise returns error messages.
 */
export function validateJsonSchema(schemaString: string): SchemaValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaString);
  } catch (e) {
    return { valid: false, errors: [`invalid JSON: ${(e as Error).message}`] };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, errors: ["schema must be a JSON object"] };
  }

  // Compile against meta-schema; ajv will throw on structural issues.
  try {
    ajv.compile(parsed as object);
    return { valid: true };
  } catch (e) {
    // ajv.compile throws for unsupported keywords / structural violations.
    const msg = e instanceof Error ? e.message : String(e);
    return { valid: false, errors: [msg] };
  }
}

/**
 * Validate a value against a pre-parsed schema object.
 * Returns formatted error messages on failure.
 */
export function validateValueAgainstSchema(
  schema: Record<string, unknown>,
  value: unknown,
): SchemaValidationResult {
  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(schema);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { valid: false, errors: [`schema compilation failed: ${msg}`] };
  }

  if (validate(value)) {
    return { valid: true };
  }
  return { valid: false, errors: formatErrors(validate.errors) };
}

/**
 * Validate a map of named schemas (e.g., built-in tool input schemas).
 * Logs and returns any invalid entries. Designed for startup validation.
 *
 * @returns Array of `{ name, errors }` for schemas that failed validation.
 */
export function validateSchemaMap(
  schemas: Record<string, unknown>,
): Array<{ name: string; errors: string[] }> {
  const failures: Array<{ name: string; errors: string[] }> = [];

  for (const [name, schema] of Object.entries(schemas)) {
    try {
      ajv.compile(schema as object);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ name, errors: [msg] });
    }
  }

  return failures;
}
