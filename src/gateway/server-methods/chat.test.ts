import { describe, expect, it } from "vitest";
import { sanitizeChatSendMessageInput } from "./chat.js";

describe("sanitizeChatSendMessageInput", () => {
  it("passes normal text through unchanged", () => {
    const result = sanitizeChatSendMessageInput("Hello, world!");
    expect(result).toEqual({ ok: true, message: "Hello, world!" });
  });

  it("rejects messages containing null bytes", () => {
    const result = sanitizeChatSendMessageInput("hello\u0000world");
    expect(result).toEqual({ ok: false, error: "message must not contain null bytes" });
  });

  it("strips C0 control characters (except tab, LF, CR)", () => {
    // \x01 (SOH), \x02 (STX), \x03 (ETX) should be stripped
    const result = sanitizeChatSendMessageInput("a\x01b\x02c\x03d");
    expect(result).toEqual({ ok: true, message: "abcd" });
  });

  it("preserves tab, newline, and carriage return", () => {
    const result = sanitizeChatSendMessageInput("line1\tindented\nline2\r\nline3");
    expect(result).toEqual({ ok: true, message: "line1\tindented\nline2\r\nline3" });
  });

  it("strips DEL character (0x7F)", () => {
    const result = sanitizeChatSendMessageInput("before\x7Fafter");
    expect(result).toEqual({ ok: true, message: "beforeafter" });
  });

  it("handles empty string", () => {
    const result = sanitizeChatSendMessageInput("");
    expect(result).toEqual({ ok: true, message: "" });
  });

  it("handles whitespace-only string", () => {
    const result = sanitizeChatSendMessageInput("   \t\n  ");
    expect(result).toEqual({ ok: true, message: "   \t\n  " });
  });

  it("handles very long strings", () => {
    const long = "a".repeat(100_000);
    const result = sanitizeChatSendMessageInput(long);
    expect(result).toEqual({ ok: true, message: long });
  });

  it("NFC-normalizes unicode before processing", () => {
    // e + combining acute accent (NFD) -> e-acute (NFC)
    const nfd = "e\u0301"; // decomposed e-acute
    const nfc = "\u00E9"; // precomposed e-acute
    const result = sanitizeChatSendMessageInput(nfd);
    expect(result).toEqual({ ok: true, message: nfc });
  });
});
