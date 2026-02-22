import { afterEach, describe, expect, it } from "vitest";
import {
  canFetchHost,
  canReadPath,
  canWritePath,
  fullCapabilities,
  hasCapability,
  minimalCapabilities,
  networkCapabilities,
  readOnlyCapabilities,
} from "./capabilities.js";
import { buildHostImports } from "./host.js";
import { createSandbox, resetSandboxCounter } from "./sandbox.js";

afterEach(() => {
  resetSandboxCounter();
});

describe("capabilities", () => {
  it("minimal allows only clock and random", () => {
    const caps = minimalCapabilities();
    expect(hasCapability(caps, "clock:now")).toBe(true);
    expect(hasCapability(caps, "random")).toBe(true);
    expect(hasCapability(caps, "fs:read")).toBe(false);
    expect(hasCapability(caps, "net:fetch")).toBe(false);
  });

  it("readOnly allows fs:read for specified paths", () => {
    const caps = readOnlyCapabilities(["/workspace/**"]);
    expect(hasCapability(caps, "fs:read")).toBe(true);
    expect(canReadPath(caps, "/workspace/file.txt")).toBe(true);
    expect(canReadPath(caps, "/etc/passwd")).toBe(false);
  });

  it("networkCapabilities allows fetch for specified hosts", () => {
    const caps = networkCapabilities(["api.example.com"]);
    expect(canFetchHost(caps, "api.example.com")).toBe(true);
    expect(canFetchHost(caps, "evil.com")).toBe(false);
  });

  it("canFetchHost matches subdomains", () => {
    const caps = networkCapabilities(["example.com"]);
    expect(canFetchHost(caps, "api.example.com")).toBe(true);
    expect(canFetchHost(caps, "example.com")).toBe(true);
    expect(canFetchHost(caps, "notexample.com")).toBe(false);
  });

  it("fullCapabilities grants all", () => {
    const caps = fullCapabilities({
      readPaths: ["/data/**"],
      writePaths: ["/output/**"],
      hosts: ["api.example.com"],
      envVars: ["API_KEY"],
    });
    expect(hasCapability(caps, "fs:read")).toBe(true);
    expect(hasCapability(caps, "fs:write")).toBe(true);
    expect(hasCapability(caps, "net:fetch")).toBe(true);
    expect(hasCapability(caps, "env:read")).toBe(true);
    expect(canReadPath(caps, "/data/file.csv")).toBe(true);
    expect(canWritePath(caps, "/output/result.json")).toBe(true);
    expect(canWritePath(caps, "/etc/shadow")).toBe(false);
  });

  it("canReadPath returns false without fs:read capability", () => {
    const caps = minimalCapabilities();
    expect(canReadPath(caps, "/any/path")).toBe(false);
  });

  it("canWritePath returns false without fs:write capability", () => {
    const caps = readOnlyCapabilities(["/workspace/**"]);
    expect(canWritePath(caps, "/workspace/file.txt")).toBe(false);
  });
});

describe("host imports", () => {
  it("fs_read returns error for disallowed path", () => {
    const caps = readOnlyCapabilities(["/allowed/**"]);
    const imports = buildHostImports(caps);
    const result = imports.fs_read("/forbidden/file.txt");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not permitted");
  });

  it("fs_read returns success for allowed path", () => {
    const caps = readOnlyCapabilities(["/allowed/**"]);
    const imports = buildHostImports(caps);
    const result = imports.fs_read("/allowed/data.txt");
    expect(result.success).toBe(true);
  });

  it("fs_write returns error without write capability", () => {
    const caps = readOnlyCapabilities(["/data/**"]);
    const imports = buildHostImports(caps);
    const result = imports.fs_write("/data/file.txt", "content");
    expect(result.success).toBe(false);
  });

  it("net_fetch returns error for disallowed host", () => {
    const caps = networkCapabilities(["api.safe.com"]);
    const imports = buildHostImports(caps);
    const result = imports.net_fetch("https://evil.com/data");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not permitted");
  });

  it("net_fetch returns error for invalid URL", () => {
    const caps = networkCapabilities(["api.safe.com"]);
    const imports = buildHostImports(caps);
    const result = imports.net_fetch("not-a-url");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid URL");
  });

  it("env_get returns error without env:read capability", () => {
    const caps = minimalCapabilities();
    const imports = buildHostImports(caps);
    const result = imports.env_get("PATH");
    expect(result.success).toBe(false);
  });

  it("clock_now returns 0 without capability", () => {
    const caps = { allow: new Set<never>() };
    const imports = buildHostImports(caps);
    expect(imports.clock_now()).toBe(0);
  });

  it("clock_now returns timestamp with capability", () => {
    const caps = minimalCapabilities();
    const imports = buildHostImports(caps);
    const now = imports.clock_now();
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe("sandbox", () => {
  it("creates a sandbox with unique ID", () => {
    const s1 = createSandbox(minimalCapabilities());
    const s2 = createSandbox(minimalCapabilities());
    expect(s1.id).not.toBe(s2.id);
    expect(s1.id).toMatch(/^wasm-sandbox-\d+$/);
  });

  it("executes and returns result", async () => {
    const sandbox = createSandbox(minimalCapabilities());
    const result = await sandbox.execute("myFunction", [1, 2, 3]);
    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.output).toContain("myFunction");
  });

  it("returns error after termination", async () => {
    const sandbox = createSandbox(minimalCapabilities());
    sandbox.terminate();
    expect(sandbox.terminated).toBe(true);

    const result = await sandbox.execute("fn", []);
    expect(result.success).toBe(false);
    expect(result.error).toContain("terminated");
  });

  it("exposes host imports matching capabilities", () => {
    const sandbox = createSandbox(readOnlyCapabilities(["/data/**"]));
    const readResult = sandbox.hostImports.fs_read("/data/file.txt");
    expect(readResult.success).toBe(true);

    const writeResult = sandbox.hostImports.fs_write("/data/file.txt", "x");
    expect(writeResult.success).toBe(false);
  });
});
