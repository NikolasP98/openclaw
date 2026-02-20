import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InternalHookEvent } from "../../internal-hooks.js";
import handler from "./handler.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join("/tmp", "session-autosave-test-"));
  // Set env so resolveStateDir returns our tmpDir
  process.env.OPENCLAW_STATE_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.OPENCLAW_STATE_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function createEvent(overrides?: Partial<InternalHookEvent>): InternalHookEvent {
  return {
    type: "message",
    action: "sent",
    sessionKey: "agent:main:main",
    timestamp: new Date("2026-02-20T14:30:05.000Z"),
    messages: [],
    context: {
      content: "Hello! How can I help?",
      channelId: "telegram",
      to: "user123",
      success: true,
    },
    ...overrides,
  };
}

describe("session-autosave handler", () => {
  it("ignores non-message events", async () => {
    const event = createEvent({ type: "command", action: "new" });
    await handler(event);
    // No files created
    const files = await fs.readdir(tmpDir).catch(() => []);
    expect(files).not.toContain("memory");
  });

  it("ignores message:received events", async () => {
    const event = createEvent({ action: "received" });
    await handler(event);
    const sessionsDir = path.join(tmpDir, "workspace", "memory", "sessions");
    const exists = await fs
      .access(sessionsDir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("ignores failed sends", async () => {
    const event = createEvent({
      context: {
        content: "Some content",
        channelId: "telegram",
        to: "user123",
        success: false,
      },
    });
    await handler(event);
    const sessionsDir = path.join(tmpDir, "workspace", "memory", "sessions");
    const exists = await fs
      .access(sessionsDir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("ignores empty content", async () => {
    const event = createEvent({
      context: {
        content: "  ",
        channelId: "telegram",
        to: "user123",
        success: true,
      },
    });
    await handler(event);
    const sessionsDir = path.join(tmpDir, "workspace", "memory", "sessions");
    const exists = await fs
      .access(sessionsDir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("creates session log file with header and turn entry", async () => {
    const event = createEvent();
    await handler(event);

    const sessionsDir = path.join(tmpDir, "workspace", "memory", "sessions");
    const files = await fs.readdir(sessionsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^2026-02-20-agent-main-main\.md$/);

    const content = await fs.readFile(path.join(sessionsDir, files[0]), "utf-8");
    expect(content).toContain("# Session Log: agent:main:main");
    expect(content).toContain("## Turn at 14:30:05 UTC");
    expect(content).toContain("**Channel**: telegram");
    expect(content).toContain("Hello! How can I help?");
  });

  it("appends multiple turns to same file", async () => {
    const event1 = createEvent({
      timestamp: new Date("2026-02-20T14:30:05.000Z"),
      context: {
        content: "First response.",
        channelId: "telegram",
        to: "user123",
        success: true,
      },
    });
    const event2 = createEvent({
      timestamp: new Date("2026-02-20T14:31:15.000Z"),
      context: {
        content: "Second response.",
        channelId: "telegram",
        to: "user123",
        success: true,
      },
    });

    await handler(event1);
    await handler(event2);

    const sessionsDir = path.join(tmpDir, "workspace", "memory", "sessions");
    const files = await fs.readdir(sessionsDir);
    expect(files.length).toBe(1);

    const content = await fs.readFile(path.join(sessionsDir, files[0]), "utf-8");
    expect(content).toContain("First response.");
    expect(content).toContain("Second response.");
    expect(content).toContain("14:30:05");
    expect(content).toContain("14:31:15");
  });

  it("sanitizes session key for filename", async () => {
    const event = createEvent({
      sessionKey: "agent:main:user@email.com/chat",
    });
    await handler(event);

    const sessionsDir = path.join(tmpDir, "workspace", "memory", "sessions");
    const files = await fs.readdir(sessionsDir);
    expect(files.length).toBe(1);
    // Should not contain @, /, or .
    expect(files[0]).not.toContain("@");
    expect(files[0]).not.toContain("/");
  });
});
