import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_PROGRESS_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
} from "./workspace.js";

describe("bootstrap file constants", () => {
  it("exports progress.txt filename constant", () => {
    expect(DEFAULT_PROGRESS_FILENAME).toBe("progress.txt");
  });

  it("exports all expected bootstrap filename constants", () => {
    const allFilenames = [
      DEFAULT_AGENTS_FILENAME,
      DEFAULT_SOUL_FILENAME,
      DEFAULT_TOOLS_FILENAME,
      DEFAULT_IDENTITY_FILENAME,
      DEFAULT_USER_FILENAME,
      DEFAULT_HEARTBEAT_FILENAME,
      DEFAULT_BOOTSTRAP_FILENAME,
      DEFAULT_MEMORY_FILENAME,
      DEFAULT_MEMORY_ALT_FILENAME,
      DEFAULT_PROGRESS_FILENAME,
    ];

    // All should be non-empty strings
    for (const name of allFilenames) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }

    // All should be unique
    expect(new Set(allFilenames).size).toBe(allFilenames.length);
  });

  it("progress.txt is a .txt file, not .md", () => {
    expect(DEFAULT_PROGRESS_FILENAME).toMatch(/\.txt$/);
  });
});
