/**
 * CLI undo command — list and reverse recent tool-call actions.
 *
 * Exposes the session-scoped UndoStack as `minion undo`.
 *
 * @module
 */

import type { RuntimeEnv } from "../../runtime.js";
import { UndoStack } from "../../tools/undo-stack.js";

// Session-scoped singleton — shared with before-tool-call hooks that push entries.
let sessionStack: UndoStack | undefined;

/**
 * Get the session-scoped undo stack (creates one if needed).
 */
export function getSessionUndoStack(): UndoStack {
  if (!sessionStack) {
    sessionStack = new UndoStack();
  }
  return sessionStack;
}

/**
 * Replace the session-scoped undo stack (useful for testing).
 */
export function setSessionUndoStack(stack: UndoStack): void {
  sessionStack = stack;
}

export type UndoCommandOpts = {
  list?: boolean;
  all?: boolean;
  id?: string;
  json?: boolean;
};

export async function undoCommand(opts: UndoCommandOpts, runtime: RuntimeEnv): Promise<void> {
  const stack = getSessionUndoStack();

  if (opts.list) {
    const actions = stack.getActions();
    if (actions.length === 0) {
      runtime.log("Nothing to undo.");
      return;
    }
    if (opts.json) {
      runtime.log(JSON.stringify(actions, null, 2));
      return;
    }
    runtime.log(`Undo history (${actions.length} actions, ${stack.undoableCount()} undoable):\n`);
    for (const action of actions) {
      const status = action.undone ? "✓ undone" : "pending";
      const time = new Date(action.recordedAt).toLocaleTimeString();
      runtime.log(
        `  [${action.id}] ${action.toolName}: ${action.description} (${status}, ${time})`,
      );
    }
    return;
  }

  if (opts.all) {
    const count = stack.undoableCount();
    if (count === 0) {
      runtime.log("Nothing to undo.");
      return;
    }
    let undone = 0;
    let failed = 0;
    while (stack.undoableCount() > 0) {
      const result = await stack.undoLast();
      if (!result) {
        break;
      }
      if (result.success) {
        undone++;
        runtime.log(`Undone: ${result.description}`);
      } else {
        failed++;
        runtime.log(`Failed to undo: ${result.description} — ${result.error ?? "unknown error"}`);
      }
    }
    runtime.log(`\nUndone ${undone} action(s)${failed > 0 ? `, ${failed} failed` : ""}.`);
    return;
  }

  if (opts.id) {
    const result = await stack.undoById(opts.id);
    if (!result) {
      runtime.log(`No undoable action with ID "${opts.id}".`);
      return;
    }
    if (result.success) {
      runtime.log(`Undone: ${result.description}`);
    } else {
      runtime.log(`Failed to undo: ${result.description} — ${result.error ?? "unknown error"}`);
    }
    return;
  }

  // Default: undo last
  const result = await stack.undoLast();
  if (!result) {
    runtime.log("Nothing to undo.");
    return;
  }
  if (result.success) {
    runtime.log(`Undone: ${result.description}`);
  } else {
    runtime.log(`Failed to undo: ${result.description} — ${result.error ?? "unknown error"}`);
  }
}
