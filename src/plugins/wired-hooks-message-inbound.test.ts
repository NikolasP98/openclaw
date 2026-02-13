import { describe, expect, it, vi } from "vitest";
import type { PluginRegistry } from "./registry.js";
import { createHookRunner } from "./hooks.js";

function createMockRegistry(
  hooks: Array<{ hookName: string; handler: (...args: unknown[]) => unknown }>,
): PluginRegistry {
  return {
    hooks: hooks as never[],
    typedHooks: hooks.map((h) => ({
      pluginId: "test-plugin",
      hookName: h.hookName,
      handler: h.handler,
      priority: 0,
      source: "test",
    })),
    tools: [],
    httpHandlers: [],
    httpRoutes: [],
    gatewayHandlers: {},
    cliRegistrars: [],
    services: [],
    providers: [],
    commands: [],
  } as unknown as PluginRegistry;
}

describe("message_inbound hook runner", () => {
  it("runMessageInbound invokes registered message_inbound hooks", async () => {
    const handler = vi.fn();
    const registry = createMockRegistry([{ hookName: "message_inbound", handler }]);
    const runner = createHookRunner(registry);

    const event = {
      channel: "telegram",
      accountId: "acc-1",
      chatId: "12345",
      senderId: "99",
      senderName: "Alice",
      isGroup: true,
      content: "Hello",
      messageId: "msg-1",
      timestamp: 1700000000000,
    };
    const ctx = { channelId: "telegram", accountId: "acc-1" };

    await runner.runMessageInbound(event, ctx);

    expect(handler).toHaveBeenCalledWith(event, ctx);
  });

  it("hasHooks returns true for registered message_inbound hooks", () => {
    const registry = createMockRegistry([{ hookName: "message_inbound", handler: vi.fn() }]);
    const runner = createHookRunner(registry);

    expect(runner.hasHooks("message_inbound")).toBe(true);
    expect(runner.hasHooks("message_received")).toBe(false);
  });

  it("runMessageInbound tolerates handler errors with catchErrors", async () => {
    const handler = vi.fn(() => {
      throw new Error("boom");
    });
    const registry = createMockRegistry([{ hookName: "message_inbound", handler }]);
    const runner = createHookRunner(registry, { catchErrors: true });

    // Should not throw
    await runner.runMessageInbound(
      {
        channel: "telegram",
        accountId: "acc-1",
        chatId: "1",
        isGroup: false,
        content: "test",
      },
      { channelId: "telegram" },
    );

    expect(handler).toHaveBeenCalled();
  });
});
