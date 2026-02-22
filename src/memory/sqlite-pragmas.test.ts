import { describe, expect, it } from "vitest";
import { applySqlitePragmas } from "./sqlite-pragmas.js";

describe("sqlite-pragmas", () => {
  it("executes all 5 PRAGMAs without throwing", () => {
    const executed: string[] = [];
    const mockDb = {
      exec(sql: string) {
        executed.push(sql);
      },
    };

    applySqlitePragmas(mockDb);

    expect(executed).toHaveLength(5);
    expect(executed[0]).toContain("journal_mode = WAL");
    expect(executed[1]).toContain("synchronous = NORMAL");
    expect(executed[2]).toContain("mmap_size");
    expect(executed[3]).toContain("cache_size");
    expect(executed[4]).toContain("temp_store = MEMORY");
  });
});
