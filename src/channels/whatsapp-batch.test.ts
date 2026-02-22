import { describe, expect, it } from "vitest";
import {
  escapeXml,
  formatGroupMessages,
  formatGroupMessagesPlainText,
  type GroupMessage,
} from "./whatsapp-batch.js";

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeXml("<tag>")).toBe("&lt;tag&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeXml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes apostrophes", () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  it("escapes multiple special chars in one string", () => {
    expect(escapeXml('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
  });

  it("returns unchanged string with no special chars", () => {
    expect(escapeXml("hello world 123")).toBe("hello world 123");
  });

  it("handles empty string", () => {
    expect(escapeXml("")).toBe("");
  });
});

describe("formatGroupMessages", () => {
  it("formats a single message", () => {
    const result = formatGroupMessages([{ sender: "Agent", text: "Hello world" }]);
    expect(result).toContain("<messages>");
    expect(result).toContain('sender="Agent"');
    expect(result).toContain("Hello world");
    expect(result).toContain("</messages>");
  });

  it("formats multiple messages", () => {
    const msgs: GroupMessage[] = [
      { sender: "Agent", text: "First" },
      { sender: "Bot", text: "Second", timestamp: "2025-01-01T00:00:00Z" },
    ];
    const result = formatGroupMessages(msgs);
    expect(result).toContain('sender="Agent"');
    expect(result).toContain('sender="Bot"');
    expect(result).toContain('timestamp="2025-01-01T00:00:00Z"');
    expect(result.match(/<message /g)).toHaveLength(2);
  });

  it("skips empty messages", () => {
    const msgs: GroupMessage[] = [
      { sender: "Agent", text: "" },
      { sender: "Bot", text: "Valid" },
    ];
    const result = formatGroupMessages(msgs);
    expect(result.match(/<message /g)).toHaveLength(1);
    expect(result).toContain("Valid");
  });

  it("returns empty string when all messages are empty", () => {
    expect(formatGroupMessages([{ sender: "A", text: "" }])).toBe("");
    expect(formatGroupMessages([])).toBe("");
  });

  it("escapes XML in sender name and text", () => {
    const result = formatGroupMessages([{ sender: 'O"Brien', text: "1 < 2 & 3 > 0" }]);
    expect(result).toContain("O&quot;Brien");
    expect(result).toContain("1 &lt; 2 &amp; 3 &gt; 0");
  });
});

describe("formatGroupMessagesPlainText", () => {
  it("formats messages as [sender] text", () => {
    const result = formatGroupMessagesPlainText([
      { sender: "Agent", text: "Hello" },
      { sender: "Bot", text: "World" },
    ]);
    expect(result).toBe("[Agent] Hello\n[Bot] World");
  });

  it("skips empty messages", () => {
    const result = formatGroupMessagesPlainText([
      { sender: "A", text: "" },
      { sender: "B", text: "Valid" },
    ]);
    expect(result).toBe("[B] Valid");
  });

  it("returns empty string for no messages", () => {
    expect(formatGroupMessagesPlainText([])).toBe("");
  });
});
