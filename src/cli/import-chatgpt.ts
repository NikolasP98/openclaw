/**
 * ChatGPT history import — cold-start knowledge graph hydration.
 *
 * Parses a ChatGPT export JSON file (conversations.json) and extracts:
 *   - Interaction objects  — one per conversation
 *   - Entity objects       — named people, tools, projects, places
 *   - Preference objects   — "I prefer X", "I always use Y" statements
 *   - Fact objects         — technical/factual statements (code, configs, …)
 *
 * All imported objects are tagged with `source: "chatgpt-import"` in their
 * data blob for auditability. Duplicate entities (same label) are skipped.
 *
 * Usage:
 *   minion import-chatgpt ./conversations.json
 *   minion import-chatgpt ./conversations.json --dry-run
 *
 * @module
 */

import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  listByType,
  remember,
} from "../memory/knowledge-graph.js";

// ── ChatGPT export types ───────────────────────────────────────────────────────

type ChatGptMessageContent =
  | { content_type: "text"; parts: (string | null)[] }
  | { content_type: string; [key: string]: unknown };

type ChatGptMessage = {
  id: string;
  author: { role: "user" | "assistant" | "system" | "tool" };
  content: ChatGptMessageContent;
  create_time: number | null;
};

type ChatGptNode = {
  id: string;
  message: ChatGptMessage | null;
};

type ChatGptConversation = {
  id: string;
  title: string;
  create_time: number;
  mapping: Record<string, ChatGptNode>;
};

type ChatGptExport = {
  conversations?: ChatGptConversation[];
} | ChatGptConversation[];

// ── Text extraction ────────────────────────────────────────────────────────────

function extractText(content: ChatGptMessageContent): string {
  if (content.content_type !== "text") return "";
  const parts = content.parts ?? [];
  return parts
    .filter((p): p is string => typeof p === "string")
    .join(" ")
    .trim();
}

function collectMessages(conv: ChatGptConversation): Array<{ role: string; text: string }> {
  return Object.values(conv.mapping)
    .filter((node): node is ChatGptNode & { message: ChatGptMessage } => node.message !== null)
    .filter((node) => node.message.author.role === "user" || node.message.author.role === "assistant")
    .map((node) => ({
      role: node.message.author.role,
      text: extractText(node.message.content),
    }))
    .filter((m) => m.text.length > 0);
}

// ── Extraction heuristics ──────────────────────────────────────────────────────

/** Patterns that suggest a user preference statement. */
const PREFERENCE_PATTERNS = [
  /\bi\s+(prefer|always\s+use|like|love|use|want|favour|favor)\s+([^.!?]+)/gi,
  /\bmy\s+(preferred|favourite|favorite|go-to|default)\s+\w+\s+is\s+([^.!?]+)/gi,
  /\bplease\s+always\s+use\s+([^.!?]+)/gi,
];

/** Extract preference statements from user messages. */
function extractPreferences(text: string): string[] {
  const found: string[] = [];
  for (const pattern of PREFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const pref = match[0].trim();
      if (pref.length > 5 && pref.length < 200) {
        found.push(pref);
      }
    }
  }
  return [...new Set(found)];
}

/** Extract named entities: capitalised sequences that look like proper nouns. */
function extractEntities(text: string): string[] {
  // Match sequences of 1-3 capitalised words (handles product names, projects, people)
  const matches = text.match(/\b[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){0,2}\b/g) ?? [];
  const STOP_WORDS = new Set([
    "I", "The", "A", "An", "In", "Of", "To", "And", "Or", "For",
    "But", "Not", "With", "Is", "It", "If", "As", "On", "At", "My",
    "We", "You", "He", "She", "They", "What", "How", "Why", "When",
    "Where", "Which", "This", "That", "These", "Those", "Could", "Would",
    "Should", "Please", "Yes", "No", "Can", "Will", "Do", "Did", "Has",
    "Have", "Had", "Been", "Be", "Are", "Was", "Were",
  ]);
  return [
    ...new Set(
      matches
        .map((m) => m.trim())
        .filter((m) => m.length >= 2 && !STOP_WORDS.has(m))
        .filter((m) => !/^\d+$/.test(m)),
    ),
  ];
}

/** Extract technical facts: lines that look like code or technical statements. */
function extractFacts(text: string): string[] {
  const facts: string[] = [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Lines with code-like patterns or technical statements
    if (
      (line.includes("=") || line.includes("->") || line.includes(":")) &&
      line.length > 10 &&
      line.length < 200 &&
      !line.startsWith("#") &&
      !line.startsWith("//")
    ) {
      facts.push(line);
    }
  }
  return facts.slice(0, 5); // cap at 5 facts per message
}

// ── Import logic ───────────────────────────────────────────────────────────────

export type ImportResult = {
  conversations: number;
  interactions: number;
  entities: number;
  preferences: number;
  facts: number;
  skippedDuplicates: number;
};

export type ImportOptions = {
  dryRun?: boolean;
  maxConversations?: number;
};

/**
 * Parse and validate a ChatGPT export JSON file.
 * Returns the array of conversations or throws on invalid format.
 */
export function parseChatGptExport(json: unknown): ChatGptConversation[] {
  if (Array.isArray(json)) {
    return json as ChatGptConversation[];
  }
  if (json && typeof json === "object" && Array.isArray((json as ChatGptExport & { conversations?: unknown[] }).conversations)) {
    return (json as { conversations: ChatGptConversation[] }).conversations;
  }
  throw new Error(
    "Invalid ChatGPT export format — expected an array or { conversations: [] }",
  );
}

/**
 * Import conversations into the knowledge graph.
 * When dryRun=true, returns counts without writing.
 */
export async function importChatGptHistory(
  conversations: ChatGptConversation[],
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const { dryRun = false, maxConversations } = opts;

  const result: ImportResult = {
    conversations: 0,
    interactions: 0,
    entities: 0,
    preferences: 0,
    facts: 0,
    skippedDuplicates: 0,
  };

  // Build a set of already-known entity labels for dedup
  const knownEntities = new Set<string>();
  if (!dryRun) {
    for (const obj of listByType("entity")) {
      knownEntities.add(obj.label.trim().toLowerCase());
    }
  }

  const convSlice = maxConversations
    ? conversations.slice(0, maxConversations)
    : conversations;

  result.conversations = convSlice.length;

  for (const conv of convSlice) {
    const messages = collectMessages(conv);
    if (messages.length === 0) continue;

    // Create Interaction object for the whole conversation
    if (!dryRun) {
      remember({
        label: conv.title || `ChatGPT conversation ${conv.id.slice(0, 8)}`,
        type: "interaction",
        data: {
          source: "chatgpt-import",
          conversationId: conv.id,
          messageCount: messages.length,
          createdAt: conv.create_time,
        },
      });
    }
    result.interactions++;

    // Process user messages for extraction
    for (const msg of messages.filter((m) => m.role === "user")) {
      const { text } = msg;

      // Preferences
      for (const pref of extractPreferences(text)) {
        if (!dryRun) {
          remember({
            label: pref,
            type: "preference",
            data: { source: "chatgpt-import", conversationId: conv.id },
          });
        }
        result.preferences++;
      }

      // Entities
      for (const entity of extractEntities(text)) {
        const key = entity.toLowerCase();
        if (knownEntities.has(key)) {
          result.skippedDuplicates++;
          continue;
        }
        if (!dryRun) {
          knownEntities.add(key);
          remember({
            label: entity,
            type: "entity",
            data: { source: "chatgpt-import", conversationId: conv.id },
          });
        }
        result.entities++;
      }

      // Facts (from longer technical messages)
      if (text.length > 100) {
        for (const fact of extractFacts(text)) {
          if (!dryRun) {
            remember({
              label: fact,
              type: "fact",
              data: { source: "chatgpt-import", conversationId: conv.id },
            });
          }
          result.facts++;
        }
      }
    }
  }

  return result;
}

// ── CLI registration ───────────────────────────────────────────────────────────

export function registerImportChatGptCli(program: Command): void {
  program
    .command("import-chatgpt")
    .description("Import ChatGPT conversation history into the knowledge graph")
    .argument("<file>", "Path to ChatGPT export file (conversations.json)")
    .option("--dry-run", "Parse and count without writing to the DB", false)
    .option("--max-conversations <n>", "Limit import to first N conversations", parseInt)
    .option("--db <path>", "Path to the typed memory DB", "memory-objects.db")
    .action(async (file: string, opts: { dryRun: boolean; maxConversations?: number; db: string }) => {
      try {
        // Initialise DB (unless dry-run)
        if (!opts.dryRun) {
          const { openTypedMemoryDb } = await import("../memory/typed-schema.js");
          openTypedMemoryDb(opts.db);
        }

        const raw = readFileSync(file, "utf-8");
        const json: unknown = JSON.parse(raw);
        const conversations = parseChatGptExport(json);

        console.log(`Parsed ${conversations.length} conversation(s) from ${file}`);

        const result = await importChatGptHistory(conversations, {
          dryRun: opts.dryRun,
          maxConversations: opts.maxConversations,
        });

        const label = opts.dryRun ? "[dry-run] Would import" : "Imported";
        console.log(`\n${label}:`);
        console.log(`  Conversations  : ${result.conversations}`);
        console.log(`  Interactions   : ${result.interactions}`);
        console.log(`  Entities       : ${result.entities}`);
        console.log(`  Preferences    : ${result.preferences}`);
        console.log(`  Facts          : ${result.facts}`);
        console.log(`  Skipped dupes  : ${result.skippedDuplicates}`);
        if (opts.dryRun) {
          console.log("\n(no changes written — pass without --dry-run to import)");
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
