import { describe, expect, it } from "vitest";
import {
  chainCredentialStores,
  envCredentialStore,
  injectCredentials,
  mapCredentialStore,
  parseCredentialRefs,
  replaceCredentialPlaceholders,
  type CredentialRef,
} from "./credential-injector.js";

describe("parseCredentialRefs", () => {
  it("parses env credential placeholder", () => {
    const refs = parseCredentialRefs("key=${{credential:API_KEY:env}}");
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe("API_KEY");
    expect(refs[0].source).toBe("env");
  });

  it("parses file credential with path", () => {
    const refs = parseCredentialRefs("${{credential:token:file:/etc/secret.txt}}");
    expect(refs).toHaveLength(1);
    expect(refs[0].source).toBe("file");
    expect(refs[0].filePath).toBe("/etc/secret.txt");
  });

  it("parses vault credential with path", () => {
    const refs = parseCredentialRefs("${{credential:db_pass:vault:secret/data/db}}");
    expect(refs).toHaveLength(1);
    expect(refs[0].source).toBe("vault");
    expect(refs[0].vaultPath).toBe("secret/data/db");
  });

  it("parses multiple refs in one string", () => {
    const refs = parseCredentialRefs("url=${{credential:HOST:env}} key=${{credential:KEY:env}}");
    expect(refs).toHaveLength(2);
  });

  it("returns empty for no placeholders", () => {
    expect(parseCredentialRefs("no credentials here")).toHaveLength(0);
  });
});

describe("replaceCredentialPlaceholders", () => {
  it("replaces placeholder with resolved value", () => {
    const store = mapCredentialStore({ API_KEY: "sk-123" });
    const { output, missing } = replaceCredentialPlaceholders(
      "Bearer ${{credential:API_KEY:env}}",
      store,
    );
    expect(output).toBe("Bearer sk-123");
    expect(missing).toHaveLength(0);
  });

  it("leaves unresolved placeholders and reports missing", () => {
    const store = mapCredentialStore({});
    const { output, missing } = replaceCredentialPlaceholders(
      "key=${{credential:MISSING:env}}",
      store,
    );
    expect(output).toBe("key=${{credential:MISSING:env}}");
    expect(missing).toHaveLength(1);
    expect(missing[0].name).toBe("MISSING");
  });

  it("handles mixed resolved and unresolved", () => {
    const store = mapCredentialStore({ A: "val_a" });
    const { output, missing } = replaceCredentialPlaceholders(
      "${{credential:A:env}} ${{credential:B:env}}",
      store,
    );
    expect(output).toContain("val_a");
    expect(output).toContain("${{credential:B:env}}");
    expect(missing).toHaveLength(1);
  });
});

describe("credential stores", () => {
  it("envCredentialStore resolves from env", () => {
    const store = envCredentialStore({ MY_KEY: "abc" });
    expect(store.resolve({ name: "MY_KEY", source: "env" })).toBe("abc");
  });

  it("envCredentialStore returns undefined for non-env source", () => {
    const store = envCredentialStore({ MY_KEY: "abc" });
    expect(store.resolve({ name: "MY_KEY", source: "keychain" })).toBeUndefined();
  });

  it("mapCredentialStore resolves from map", () => {
    const store = mapCredentialStore({ token: "xyz" });
    expect(store.resolve({ name: "token", source: "env" })).toBe("xyz");
  });

  it("chainCredentialStores uses first match", () => {
    const store = chainCredentialStores(
      mapCredentialStore({ A: "from-first" }),
      mapCredentialStore({ A: "from-second", B: "from-second" }),
    );
    expect(store.resolve({ name: "A", source: "env" })).toBe("from-first");
    expect(store.resolve({ name: "B", source: "env" })).toBe("from-second");
    expect(store.resolve({ name: "C", source: "env" })).toBeUndefined();
  });
});

describe("injectCredentials", () => {
  it("injects resolved credentials into env", () => {
    const refs: CredentialRef[] = [
      { name: "API_KEY", source: "env" },
      { name: "DB_PASS", source: "env" },
    ];
    const store = mapCredentialStore({ API_KEY: "key1", DB_PASS: "pass1" });
    const result = injectCredentials(refs, store);

    expect(result.env.API_KEY).toBe("key1");
    expect(result.env.DB_PASS).toBe("pass1");
    expect(result.injectedCount).toBe(2);
    expect(result.missing).toHaveLength(0);
  });

  it("reports missing required credentials", () => {
    const refs: CredentialRef[] = [{ name: "MISSING", source: "env", required: true }];
    const store = mapCredentialStore({});
    const result = injectCredentials(refs, store);

    expect(result.missing).toHaveLength(1);
    expect(result.injectedCount).toBe(0);
  });

  it("skips optional missing credentials without reporting", () => {
    const refs: CredentialRef[] = [{ name: "OPTIONAL", source: "env", required: false }];
    const store = mapCredentialStore({});
    const result = injectCredentials(refs, store);

    expect(result.missing).toHaveLength(0);
    expect(result.injectedCount).toBe(0);
  });

  it("merges into base env", () => {
    const refs: CredentialRef[] = [{ name: "NEW", source: "env" }];
    const store = mapCredentialStore({ NEW: "value" });
    const result = injectCredentials(refs, store, { EXISTING: "keep" });

    expect(result.env.EXISTING).toBe("keep");
    expect(result.env.NEW).toBe("value");
  });
});
