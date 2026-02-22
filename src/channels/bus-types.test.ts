import { describe, expect, it } from "vitest";
import type { ChannelMessageNormalizer, InboundMessage, OutboundMessage } from "./bus-types.js";

describe("InboundMessage type", () => {
  it("can construct a minimal text message", () => {
    const msg: InboundMessage = {
      id: "msg-001",
      channel: "whatsapp",
      type: "text",
      senderId: "+1234567890",
      text: "Hello bot",
      isDirect: true,
      isMention: false,
      timestamp: new Date().toISOString(),
    };

    expect(msg.id).toBe("msg-001");
    expect(msg.channel).toBe("whatsapp");
    expect(msg.type).toBe("text");
    expect(msg.isDirect).toBe(true);
  });

  it("can construct a group message with all fields", () => {
    const msg: InboundMessage = {
      id: "msg-002",
      channel: "telegram",
      type: "text",
      senderId: "user123",
      senderName: "Alice",
      text: "@bot help me",
      groupId: "group-456",
      threadId: "thread-789",
      isDirect: false,
      isMention: true,
      timestamp: "2025-01-01T00:00:00Z",
      accountId: "bot-1",
      raw: { update_id: 12345 },
    };

    expect(msg.groupId).toBe("group-456");
    expect(msg.isMention).toBe(true);
    expect(msg.raw).toEqual({ update_id: 12345 });
  });

  it("can construct an image message", () => {
    const msg: InboundMessage = {
      id: "msg-003",
      channel: "discord",
      type: "image",
      senderId: "user456",
      mediaUrl: "https://cdn.discord.com/image.png",
      mediaMimeType: "image/png",
      isDirect: false,
      isMention: false,
      timestamp: new Date().toISOString(),
    };

    expect(msg.type).toBe("image");
    expect(msg.mediaUrl).toContain("image.png");
  });
});

describe("OutboundMessage type", () => {
  it("can construct a text reply", () => {
    const msg: OutboundMessage = {
      channel: "whatsapp",
      type: "text",
      targetId: "+1234567890",
      text: "Hello! How can I help?",
      agentId: "main",
      sessionKey: "main",
    };

    expect(msg.text).toContain("Hello");
    expect(msg.agentId).toBe("main");
  });

  it("can construct a threaded reply", () => {
    const msg: OutboundMessage = {
      channel: "telegram",
      type: "text",
      targetId: "group-456",
      threadId: "thread-789",
      text: "Here's the answer",
      replyToMessageId: "msg-002",
    };

    expect(msg.threadId).toBe("thread-789");
    expect(msg.replyToMessageId).toBe("msg-002");
  });

  it("can construct a typing indicator", () => {
    const msg: OutboundMessage = {
      channel: "discord",
      type: "typing",
      targetId: "channel-123",
    };

    expect(msg.type).toBe("typing");
    expect(msg.text).toBeUndefined();
  });
});

describe("ChannelMessageNormalizer interface", () => {
  it("can be implemented for a mock channel", () => {
    type MockInbound = { msg_id: string; body: string; from: string };
    type MockOutbound = { to: string; content: string };

    const normalizer: ChannelMessageNormalizer<MockInbound, MockOutbound> = {
      normalizeInbound(raw: MockInbound): InboundMessage {
        return {
          id: raw.msg_id,
          channel: "mock",
          type: "text",
          senderId: raw.from,
          text: raw.body,
          isDirect: true,
          isMention: false,
          timestamp: new Date().toISOString(),
        };
      },
      denormalizeOutbound(message: OutboundMessage): MockOutbound {
        return {
          to: message.targetId,
          content: message.text ?? "",
        };
      },
    };

    const inbound = normalizer.normalizeInbound({
      msg_id: "x1",
      body: "test",
      from: "user1",
    });
    expect(inbound.id).toBe("x1");
    expect(inbound.text).toBe("test");

    const outbound = normalizer.denormalizeOutbound({
      channel: "mock",
      type: "text",
      targetId: "user1",
      text: "reply",
    });
    expect(outbound.to).toBe("user1");
    expect(outbound.content).toBe("reply");
  });
});
