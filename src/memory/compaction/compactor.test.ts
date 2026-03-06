import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCompactor } from "./compactor.js";
import type { CompactorDeps } from "./compactor.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeDeps(overrides: Partial<CompactorDeps> = {}): CompactorDeps {
  return {
    prune: vi.fn().mockReturnValue(0),
    listByType: vi.fn().mockReturnValue([]),
    writeRelationship: vi.fn(),
    ...overrides,
  };
}

describe("startCompactor — basic scheduling", () => {
  it("does not run immediately on start", () => {
    const deps = makeDeps();
    const compactor = startCompactor({ intervalMs: 1000, deps });
    expect(deps.prune).not.toHaveBeenCalled();
    compactor.stop();
  });

  it("runs after the interval elapses", async () => {
    const deps = makeDeps();
    const compactor = startCompactor({ intervalMs: 1000, deps });

    await vi.advanceTimersByTimeAsync(1000);

    expect(deps.prune).toHaveBeenCalledTimes(1);
    compactor.stop();
  });

  it("runs multiple times on repeated intervals", async () => {
    const deps = makeDeps();
    const compactor = startCompactor({ intervalMs: 1000, deps });

    await vi.advanceTimersByTimeAsync(3000);

    expect(deps.prune).toHaveBeenCalledTimes(3);
    compactor.stop();
  });

  it("stops running after stop() is called", async () => {
    const deps = makeDeps();
    const compactor = startCompactor({ intervalMs: 1000, deps });

    await vi.advanceTimersByTimeAsync(1000);
    compactor.stop();

    await vi.advanceTimersByTimeAsync(2000);

    expect(deps.prune).toHaveBeenCalledTimes(1);
  });
});

describe("startCompactor — runOnce()", () => {
  it("runs all phases immediately when called manually", async () => {
    const deps = makeDeps();
    const compactor = startCompactor({ deps });

    await compactor.runOnce();

    expect(deps.prune).toHaveBeenCalledTimes(1);
    expect(deps.listByType).toHaveBeenCalled();
    compactor.stop();
  });

  it("does nothing after stop() is called", async () => {
    const deps = makeDeps();
    const compactor = startCompactor({ deps });
    compactor.stop();

    await compactor.runOnce();
    expect(deps.prune).not.toHaveBeenCalled();
  });
});

describe("startCompactor — prune phase", () => {
  it("calls prune dep once per cycle", async () => {
    const deps = makeDeps({ prune: vi.fn().mockReturnValue(3) });
    const compactor = startCompactor({ deps });

    await compactor.runOnce();
    expect(deps.prune).toHaveBeenCalledTimes(1);
    compactor.stop();
  });

  it("does not crash main process when prune throws", async () => {
    const deps = makeDeps({
      prune: vi.fn().mockImplementation(() => {
        throw new Error("DB locked");
      }),
    });
    const compactor = startCompactor({ deps });

    await expect(compactor.runOnce()).resolves.toBeUndefined();
    compactor.stop();
  });
});

describe("startCompactor — infer phase (debounced)", () => {
  it("calls inferFn when interactions exist", async () => {
    const inferFn = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({
      listByType: vi.fn().mockReturnValue([{ id: "i1", label: "test interaction" }]),
      inferFn,
    });
    const compactor = startCompactor({ inferDebounceMs: 0, deps });

    await compactor.runOnce();
    expect(inferFn).toHaveBeenCalledWith([{ id: "i1", label: "test interaction" }]);
    compactor.stop();
  });

  it("does not call inferFn when there are no interactions", async () => {
    const inferFn = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ inferFn, listByType: vi.fn().mockReturnValue([]) });
    const compactor = startCompactor({ inferDebounceMs: 0, deps });

    await compactor.runOnce();
    expect(inferFn).not.toHaveBeenCalled();
    compactor.stop();
  });

  it("respects the debounce — does not call inferFn twice within debounce window", async () => {
    const inferFn = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({
      listByType: vi.fn().mockReturnValue([{ id: "i1", label: "x" }]),
      inferFn,
    });
    const compactor = startCompactor({ inferDebounceMs: 300_000, deps });

    await compactor.runOnce();
    await compactor.runOnce(); // second call within debounce window

    expect(inferFn).toHaveBeenCalledTimes(1);
    compactor.stop();
  });

  it("writes inferred relationships to the DB", async () => {
    const proposal = { fromId: "a", toId: "b", relType: "related_to" as const };
    const inferFn = vi.fn().mockResolvedValue([proposal]);
    const deps = makeDeps({
      listByType: vi.fn().mockReturnValue([{ id: "i1", label: "x" }]),
      inferFn,
    });
    const compactor = startCompactor({ inferDebounceMs: 0, deps });

    await compactor.runOnce();
    expect(deps.writeRelationship).toHaveBeenCalledWith({
      fromId: "a",
      toId: "b",
      relType: "related_to",
      weight: 1.0,
    });
    compactor.stop();
  });

  it("does not crash when inferFn throws", async () => {
    const deps = makeDeps({
      listByType: vi.fn().mockReturnValue([{ id: "i1", label: "x" }]),
      inferFn: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    });
    const compactor = startCompactor({ inferDebounceMs: 0, deps });

    await expect(compactor.runOnce()).resolves.toBeUndefined();
    compactor.stop();
  });
});

describe("startCompactor — dedupe phase", () => {
  it("links near-duplicate entities with related_to", async () => {
    const deps = makeDeps({
      listByType: vi.fn((type) =>
        type === "entity"
          ? [
              { id: "e1", label: "Production Server" },
              { id: "e2", label: "production server" }, // same after normalisation
            ]
          : [],
      ),
    });
    const compactor = startCompactor({ deps });

    await compactor.runOnce();
    expect(deps.writeRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ fromId: "e2", toId: "e1", relType: "related_to" }),
    );
    compactor.stop();
  });

  it("does not create self-relationships for unique entity labels", async () => {
    const deps = makeDeps({
      listByType: vi.fn((type) =>
        type === "entity"
          ? [
              { id: "e1", label: "Server A" },
              { id: "e2", label: "Server B" },
            ]
          : [],
      ),
    });
    const compactor = startCompactor({ deps });

    await compactor.runOnce();
    expect(deps.writeRelationship).not.toHaveBeenCalled();
    compactor.stop();
  });

  it("does not crash when dedupe phase throws", async () => {
    const deps = makeDeps({
      listByType: vi.fn().mockImplementation(() => {
        throw new Error("oops");
      }),
    });
    const compactor = startCompactor({ deps });

    await expect(compactor.runOnce()).resolves.toBeUndefined();
    compactor.stop();
  });
});
