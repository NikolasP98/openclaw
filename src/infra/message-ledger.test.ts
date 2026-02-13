import { afterEach, describe, expect, it } from "vitest";
import {
  closeMessageLedger,
  getMessageLedgerDb,
  openMessageLedger,
  recordInboundMessage,
  recordOutboundMessage,
  resetMessageLedgerForTest,
} from "./message-ledger.js";

describe("message-ledger", () => {
  afterEach(() => {
    closeMessageLedger();
    resetMessageLedgerForTest();
  });

  it("opens a database and creates the messages table", () => {
    openMessageLedger(":memory:");
    const db = getMessageLedgerDb();
    expect(db).not.toBeNull();

    const tables = db!
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it("records an inbound message", () => {
    openMessageLedger(":memory:");
    const db = getMessageLedgerDb()!;

    recordInboundMessage({
      channel: "telegram",
      accountId: "acc-1",
      chatId: "12345",
      senderId: "99",
      senderName: "Alice",
      senderUsername: "alice",
      isBot: false,
      isGroup: true,
      content: "Hello world",
      messageId: "msg-1",
      timestamp: 1700000000000,
    });

    const rows = db.prepare("SELECT * FROM messages WHERE direction = 'inbound'").all() as Record<
      string,
      unknown
    >[];
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.channel).toBe("telegram");
    expect(row.account_id).toBe("acc-1");
    expect(row.chat_id).toBe("12345");
    expect(row.sender_id).toBe("99");
    expect(row.sender_name).toBe("Alice");
    expect(row.sender_username).toBe("alice");
    expect(row.is_bot).toBe(0);
    expect(row.is_group).toBe(1);
    expect(row.content).toBe("Hello world");
    expect(row.message_id).toBe("msg-1");
    expect(row.timestamp).toBe(1700000000000);
    expect(row.created_at).toBeTypeOf("number");
  });

  it("records an outbound message", () => {
    openMessageLedger(":memory:");
    const db = getMessageLedgerDb()!;

    recordOutboundMessage(
      { to: "chat-42", content: "Reply text", success: true },
      { channelId: "discord", accountId: "acc-2" },
    );

    const rows = db.prepare("SELECT * FROM messages WHERE direction = 'outbound'").all() as Record<
      string,
      unknown
    >[];
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.channel).toBe("discord");
    expect(row.account_id).toBe("acc-2");
    expect(row.chat_id).toBe("chat-42");
    expect(row.content).toBe("Reply text");
    expect(row.success).toBe(1);
    expect(row.error).toBeNull();
  });

  it("records outbound message with error", () => {
    openMessageLedger(":memory:");
    const db = getMessageLedgerDb()!;

    recordOutboundMessage(
      { to: "chat-1", content: "fail", success: false, error: "timeout" },
      { channelId: "slack", accountId: "acc-3" },
    );

    const rows = db.prepare("SELECT * FROM messages").all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].success).toBe(0);
    expect(rows[0].error).toBe("timeout");
  });

  it("silently ignores writes when db is not open", () => {
    // Should not throw
    recordInboundMessage({
      channel: "telegram",
      accountId: "acc-1",
      chatId: "1",
      isGroup: false,
      content: "test",
    });
    recordOutboundMessage({ to: "1", content: "test", success: true }, { channelId: "telegram" });
  });

  it("does not re-open if already open", () => {
    openMessageLedger(":memory:");
    const db1 = getMessageLedgerDb();
    openMessageLedger(":memory:");
    const db2 = getMessageLedgerDb();
    expect(db1).toBe(db2);
  });

  it("close followed by open works", () => {
    openMessageLedger(":memory:");
    closeMessageLedger();
    expect(getMessageLedgerDb()).toBeNull();
    openMessageLedger(":memory:");
    expect(getMessageLedgerDb()).not.toBeNull();
  });

  it("creates expected indexes", () => {
    openMessageLedger(":memory:");
    const db = getMessageLedgerDb()!;

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_messages_%'")
      .all() as Record<string, unknown>[];
    const names = indexes.map((r) => r.name);
    expect(names).toContain("idx_messages_direction");
    expect(names).toContain("idx_messages_channel");
    expect(names).toContain("idx_messages_chat_id");
    expect(names).toContain("idx_messages_timestamp");
  });
});
