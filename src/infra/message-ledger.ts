import type { PluginHookMessageContext } from "../plugins/hooks.js";
/**
 * Message Ledger — SQLite inbound/outbound message logging.
 *
 * Persists every message flowing through the gateway to a local SQLite database,
 * regardless of whether the message reaches an agent (filtered by mention gating,
 * allowFrom, group policy, etc.).
 *
 * Opt-in feature — enable via:
 *   - Config:   gateway.messageLedger.enabled: true
 *   - Env var:  OPENCLAW_MESSAGE_LEDGER=1
 *
 * Database path defaults to {workspaceDir}/message-ledger.db but can be overridden:
 *   - Config:   gateway.messageLedger.dbPath
 *   - Env var:  OPENCLAW_MESSAGE_LEDGER_PATH
 */
import type {
  PluginHookMessageInboundEvent,
  PluginHookMessageSentEvent,
} from "../plugins/types.js";
import { requireNodeSqlite } from "../memory/sqlite.js";

type DatabaseSync = InstanceType<ReturnType<typeof requireNodeSqlite>["DatabaseSync"]>;

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL,
    channel TEXT NOT NULL,
    account_id TEXT,
    chat_id TEXT,
    sender_id TEXT,
    sender_name TEXT,
    sender_username TEXT,
    is_bot INTEGER,
    is_group INTEGER,
    content TEXT,
    message_id TEXT,
    agent_id TEXT,
    session_key TEXT,
    success INTEGER,
    error TEXT,
    timestamp INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
  CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
`;

let db: DatabaseSync | null = null;

export function openMessageLedger(dbPath: string): void {
  if (db) {
    return;
  }
  const { DatabaseSync } = requireNodeSqlite();
  db = new DatabaseSync(dbPath);
  db.exec(INIT_SQL);
}

export function closeMessageLedger(): void {
  if (!db) {
    return;
  }
  try {
    db.close();
  } catch {
    // ignore close errors
  }
  db = null;
}

export function recordInboundMessage(event: PluginHookMessageInboundEvent): void {
  if (!db) {
    return;
  }
  try {
    const stmt = db.prepare(`
      INSERT INTO messages (
        direction, channel, account_id, chat_id, sender_id, sender_name,
        sender_username, is_bot, is_group, content, message_id, timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      "inbound",
      event.channel,
      event.accountId ?? null,
      event.chatId ?? null,
      event.senderId ?? null,
      event.senderName ?? null,
      event.senderUsername ?? null,
      event.isBot != null ? (event.isBot ? 1 : 0) : null,
      event.isGroup ? 1 : 0,
      event.content ?? null,
      event.messageId ?? null,
      event.timestamp ?? null,
      Date.now(),
    );
  } catch {
    // fire-and-forget — never block the message pipeline
  }
}

export function recordOutboundMessage(
  event: PluginHookMessageSentEvent,
  ctx: PluginHookMessageContext,
): void {
  if (!db) {
    return;
  }
  try {
    const stmt = db.prepare(`
      INSERT INTO messages (
        direction, channel, account_id, chat_id, content, success, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      "outbound",
      ctx.channelId ?? null,
      ctx.accountId ?? null,
      event.to ?? null,
      event.content ?? null,
      event.success ? 1 : 0,
      event.error ?? null,
      Date.now(),
    );
  } catch {
    // fire-and-forget — never block the message pipeline
  }
}

/** Expose the active database for testing. */
export function getMessageLedgerDb(): DatabaseSync | null {
  return db;
}

/** Reset module state (testing only). */
export function resetMessageLedgerForTest(): void {
  db = null;
}
