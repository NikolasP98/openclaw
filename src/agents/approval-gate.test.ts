import { describe, expect, it, vi } from "vitest";
import {
  applyApprovalGate,
  classifyToolCategory,
  resolveApprovalMode,
} from "./approval-gate.js";
import type { ApprovalContext, ApprovalGateCategoryConfig } from "./approval-gate.js";

// ── classifyToolCategory ───────────────────────────────────────────────────────

describe("classifyToolCategory", () => {
  it("classifies shell tools", () => {
    expect(classifyToolCategory("exec")).toBe("shell");
    expect(classifyToolCategory("bash")).toBe("shell");
    expect(classifyToolCategory("sh")).toBe("shell");
    expect(classifyToolCategory("run_command")).toBe("shell");
    expect(classifyToolCategory("execute")).toBe("shell");
  });

  it("classifies file write tools", () => {
    expect(classifyToolCategory("write_file")).toBe("file_write");
    expect(classifyToolCategory("edit_file")).toBe("file_write");
    expect(classifyToolCategory("delete_file")).toBe("file_write");
    expect(classifyToolCategory("apply_patch")).toBe("file_write");
    expect(classifyToolCategory("str_replace_editor")).toBe("file_write");
  });

  it("classifies network tools", () => {
    expect(classifyToolCategory("http")).toBe("network");
    expect(classifyToolCategory("fetch")).toBe("network");
    expect(classifyToolCategory("curl")).toBe("network");
    expect(classifyToolCategory("web_request")).toBe("network");
    expect(classifyToolCategory("webhook")).toBe("network");
  });

  it("classifies database tools", () => {
    expect(classifyToolCategory("query_db")).toBe("database");
    expect(classifyToolCategory("execute_sql")).toBe("database");
    expect(classifyToolCategory("db_write")).toBe("database");
  });

  it("returns null for uncategorised tools", () => {
    expect(classifyToolCategory("memory_search")).toBeNull();
    expect(classifyToolCategory("sessions_spawn")).toBeNull();
    expect(classifyToolCategory("read_file")).toBeNull();
    expect(classifyToolCategory("cron")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(classifyToolCategory("EXEC")).toBe("shell");
    expect(classifyToolCategory("Write_File")).toBe("file_write");
  });
});

// ── resolveApprovalMode ────────────────────────────────────────────────────────

describe("resolveApprovalMode", () => {
  it("returns auto when gate config is absent", () => {
    expect(resolveApprovalMode("exec", undefined)).toBe("auto");
  });

  it("returns auto for uncategorised tools regardless of config", () => {
    expect(resolveApprovalMode("memory_search", { shell: "confirm" })).toBe("auto");
  });

  it("returns the configured mode for the tool category", () => {
    const gate = { shell: "confirm", database: "admin-only" } as const;
    expect(resolveApprovalMode("exec", gate)).toBe("confirm");
    expect(resolveApprovalMode("execute_sql", gate)).toBe("admin-only");
  });

  it("returns auto when the category has no explicit config", () => {
    const gate = { shell: "confirm" } as const;
    expect(resolveApprovalMode("fetch", gate)).toBe("auto");
  });
});

// ── applyApprovalGate — auto mode ─────────────────────────────────────────────

describe("applyApprovalGate — auto mode", () => {
  it("allows all tools when gate config is absent", async () => {
    const result = await applyApprovalGate("exec", undefined, {});
    expect(result.allowed).toBe(true);
  });

  it("allows uncategorised tools even with gate config present", async () => {
    const result = await applyApprovalGate("memory_search", { shell: "confirm" }, {});
    expect(result.allowed).toBe(true);
  });

  it("allows tools explicitly set to auto", async () => {
    const result = await applyApprovalGate("exec", { shell: "auto" }, {});
    expect(result.allowed).toBe(true);
  });
});

// ── applyApprovalGate — admin-only mode ───────────────────────────────────────

describe("applyApprovalGate — admin-only mode", () => {
  const gate = { database: "admin-only" } as const;

  it("allows admin users", async () => {
    const result = await applyApprovalGate("execute_sql", gate, { isAdmin: true });
    expect(result.allowed).toBe(true);
  });

  it("blocks non-admin users with a clear reason", async () => {
    const result = await applyApprovalGate("execute_sql", gate, { isAdmin: false });
    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toContain("admin");
  });

  it("blocks when isAdmin is absent (defaults to false)", async () => {
    const result = await applyApprovalGate("execute_sql", gate, {});
    expect(result.allowed).toBe(false);
  });
});

// ── applyApprovalGate — confirm mode ──────────────────────────────────────────

describe("applyApprovalGate — confirm mode", () => {
  const gate = { shell: "confirm" } as const;

  it("allows when confirmFn returns true", async () => {
    const ctx: ApprovalContext = { confirmFn: vi.fn().mockResolvedValue(true) };
    const result = await applyApprovalGate("exec", gate, ctx);
    expect(result.allowed).toBe(true);
    expect(ctx.confirmFn).toHaveBeenCalledWith("exec", "shell");
  });

  it("blocks when confirmFn returns false", async () => {
    const ctx: ApprovalContext = { confirmFn: vi.fn().mockResolvedValue(false) };
    const result = await applyApprovalGate("exec", gate, ctx);
    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toContain("denied");
  });

  it("blocks with APPROVAL_REQUIRED when no confirmFn is provided", async () => {
    const result = await applyApprovalGate("exec", gate, {});
    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toContain("APPROVAL_REQUIRED");
  });

  it("blocks when confirmFn times out", async () => {
    const neverResolves: ApprovalContext = {
      confirmFn: () => new Promise(() => {}), // never resolves
    };
    const gateWithShortTimeout = { shell: "confirm" as const, timeoutMs: 10 };
    const result = await applyApprovalGate("exec", gateWithShortTimeout, neverResolves);
    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toContain("timed out");
  });

  it("blocks when confirmFn throws", async () => {
    const ctx: ApprovalContext = {
      confirmFn: vi.fn().mockRejectedValue(new Error("channel unavailable")),
    };
    const result = await applyApprovalGate("exec", gate, ctx);
    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toContain("failed");
  });
});

// ── Re-export type check ───────────────────────────────────────────────────────

// Verify the ApprovalGateCategoryConfig type is re-exported correctly for callers
describe("type exports", () => {
  it("ApprovalGateCategoryConfig accepts partial mode config", () => {
    const cfg: ApprovalGateCategoryConfig = { shell: "confirm", network: "auto" };
    expect(cfg).toBeDefined();
  });
});
