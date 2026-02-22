import { describe, expect, it, vi } from "vitest";
import { UndoStack } from "./undo-stack.js";

describe("UndoStack", () => {
  function makeAction(id: string, undoFn = async () => true) {
    return {
      id,
      toolName: "write_file",
      description: `Created file ${id}`,
      undo: undoFn,
    };
  }

  it("pushes and retrieves actions", () => {
    const stack = new UndoStack();
    stack.push(makeAction("a1"));
    stack.push(makeAction("a2"));

    const actions = stack.getActions();
    expect(actions).toHaveLength(2);
    expect(actions[0].id).toBe("a2"); // newest first
    expect(actions[1].id).toBe("a1");
  });

  it("undoLast reverses the most recent action", async () => {
    const undoFn = vi.fn().mockResolvedValue(true);
    const stack = new UndoStack();
    stack.push(makeAction("a1"));
    stack.push(makeAction("a2", undoFn));

    const result = await stack.undoLast();
    expect(result).not.toBeNull();
    expect(result!.actionId).toBe("a2");
    expect(result!.success).toBe(true);
    expect(undoFn).toHaveBeenCalled();
  });

  it("undoLast skips already-undone actions", async () => {
    const stack = new UndoStack();
    stack.push(makeAction("a1"));
    stack.push(makeAction("a2"));

    await stack.undoLast(); // undoes a2
    const result = await stack.undoLast(); // should undo a1
    expect(result!.actionId).toBe("a1");
  });

  it("undoLast returns null when no undoable actions", async () => {
    const stack = new UndoStack();
    expect(await stack.undoLast()).toBeNull();

    stack.push(makeAction("a1"));
    await stack.undoLast();
    expect(await stack.undoLast()).toBeNull();
  });

  it("undoById undoes a specific action", async () => {
    const stack = new UndoStack();
    stack.push(makeAction("a1"));
    stack.push(makeAction("a2"));

    const result = await stack.undoById("a1");
    expect(result!.actionId).toBe("a1");
    expect(result!.success).toBe(true);
  });

  it("undoById returns null for unknown ID", async () => {
    const stack = new UndoStack();
    expect(await stack.undoById("nonexistent")).toBeNull();
  });

  it("handles undo failure gracefully", async () => {
    const stack = new UndoStack();
    stack.push(
      makeAction("a1", async () => {
        throw new Error("permission denied");
      }),
    );

    const result = await stack.undoLast();
    expect(result!.success).toBe(false);
    expect(result!.error).toContain("permission denied");
  });

  it("handles undo returning false", async () => {
    const stack = new UndoStack();
    stack.push(makeAction("a1", async () => false));

    const result = await stack.undoLast();
    expect(result!.success).toBe(false);
  });

  it("respects maxSize limit", () => {
    const stack = new UndoStack({ maxSize: 3 });
    stack.push(makeAction("a1"));
    stack.push(makeAction("a2"));
    stack.push(makeAction("a3"));
    stack.push(makeAction("a4"));

    expect(stack.size).toBe(3);
    const actions = stack.getActions();
    expect(actions[0].id).toBe("a4");
    expect(actions[2].id).toBe("a2"); // a1 was evicted
  });

  it("prunes expired actions", () => {
    const stack = new UndoStack({ maxAgeMs: 1000 });
    stack.push(makeAction("old"));

    // Advance time
    vi.useFakeTimers();
    vi.advanceTimersByTime(2000);

    stack.push(makeAction("new"));
    expect(stack.getActions()).toHaveLength(1);
    expect(stack.getActions()[0].id).toBe("new");

    vi.useRealTimers();
  });

  it("undoableCount returns count of non-undone actions", async () => {
    const stack = new UndoStack();
    stack.push(makeAction("a1"));
    stack.push(makeAction("a2"));

    expect(stack.undoableCount()).toBe(2);
    await stack.undoLast();
    expect(stack.undoableCount()).toBe(1);
  });

  it("clear empties the stack", () => {
    const stack = new UndoStack();
    stack.push(makeAction("a1"));
    stack.push(makeAction("a2"));

    stack.clear();
    expect(stack.size).toBe(0);
    expect(stack.getActions()).toHaveLength(0);
  });

  it("getActions excludes the undo function from returned objects", () => {
    const stack = new UndoStack();
    stack.push(makeAction("a1"));

    const actions = stack.getActions();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((actions[0] as any).undo).toBeUndefined();
    expect(actions[0].id).toBe("a1");
    expect(actions[0].description).toBeDefined();
  });

  it("records toolCallId when provided", () => {
    const stack = new UndoStack();
    stack.push({
      id: "a1",
      toolName: "write_file",
      toolCallId: "call-123",
      description: "Created file",
      undo: async () => true,
    });

    expect(stack.getActions()[0].toolCallId).toBe("call-123");
  });
});
