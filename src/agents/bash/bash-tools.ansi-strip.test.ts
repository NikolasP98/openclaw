/**
 * Tests for ANSI escape code stripping in bash tool output (Sprint Z.1).
 *
 * Prevents prompt injection via terminal color/cursor control sequences and
 * reduces unnecessary token consumption from non-semantic escape bytes.
 */
import { describe, expect, it } from "vitest";
import { stripAnsi } from "./bash-tools.exec-runtime.js";

describe("stripAnsi (Sprint Z.1 — bash output ANSI escape stripping)", () => {
  it("passes clean text through unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
    expect(stripAnsi("")).toBe("");
    expect(stripAnsi("line1\nline2\n")).toBe("line1\nline2\n");
  });

  it("strips bold/reset sequences", () => {
    // ESC[1m = bold, ESC[0m = reset
    expect(stripAnsi("\x1B[1mBold text\x1B[0m")).toBe("Bold text");
  });

  it("strips foreground color sequences", () => {
    // ESC[31m = red, ESC[0m = reset
    expect(stripAnsi("\x1B[31mError\x1B[0m: something failed")).toBe("Error: something failed");
  });

  it("strips background color sequences", () => {
    expect(stripAnsi("\x1B[42mGreen background\x1B[0m")).toBe("Green background");
  });

  it("strips cursor movement sequences", () => {
    // ESC[2J = clear screen, ESC[H = home
    expect(stripAnsi("\x1B[2J\x1B[H")).toBe("");
  });

  it("strips 256-color sequences", () => {
    // ESC[38;5;196m = 256-color red
    expect(stripAnsi("\x1B[38;5;196mred text\x1B[0m")).toBe("red text");
  });

  it("strips hyperlink/OSC sequences (two-byte ESC @-_)", () => {
    // ESC] is ESC @-_ range (0x5D)
    expect(stripAnsi("\x1B]8;;https://example.com\x1B\\link\x1B]8;;\x1B\\")).toBe("link");
  });

  it("preserves newlines and tabs in output", () => {
    expect(stripAnsi("line1\n\tindented\x1B[0m\nline2")).toBe("line1\n\tindented\nline2");
  });

  it("strips multiple sequences in one string", () => {
    const input = "\x1B[1m\x1B[32mSuccess\x1B[0m: \x1B[33m3 tests\x1B[0m passed";
    expect(stripAnsi(input)).toBe("Success: 3 tests passed");
  });

  it("handles real ls --color=always style output", () => {
    // Simplified ls color output
    const input =
      "\x1B[0m\x1B[01;34mdir/\x1B[0m  \x1B[01;32mexecutable\x1B[0m  \x1B[0mfile.txt\x1B[0m";
    expect(stripAnsi(input)).toBe("dir/  executable  file.txt");
  });
});
