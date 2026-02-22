/**
 * Agent undo stack — track and reverse tool-call side effects.
 *
 * Records tool-call actions with their inverse operations, allowing
 * agents (or operators) to undo recent changes in LIFO order.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type UndoAction = {
  /** Unique ID for this action. */
  id: string;
  /** Tool name that performed the action. */
  toolName: string;
  /** Tool call ID from the LLM. */
  toolCallId?: string;
  /** Human-readable description of what was done. */
  description: string;
  /** Function that reverses the action. Returns true if undo succeeded. */
  undo: () => Promise<boolean>;
  /** Timestamp when the action was recorded. */
  recordedAt: number;
  /** Whether this action has been undone. */
  undone: boolean;
};

export type UndoResult = {
  success: boolean;
  actionId: string;
  description: string;
  error?: string;
};

export type UndoStackConfig = {
  /** Max actions to keep in the stack (default: 50). */
  maxSize?: number;
  /** Max age in ms before actions expire and are discarded (default: 1 hour). */
  maxAgeMs?: number;
};

// ── Implementation ───────────────────────────────────────────────────────────

const DEFAULT_MAX_SIZE = 50;
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export class UndoStack {
  private stack: UndoAction[] = [];
  private config: Required<UndoStackConfig>;

  constructor(config?: UndoStackConfig) {
    this.config = {
      maxSize: config?.maxSize ?? DEFAULT_MAX_SIZE,
      maxAgeMs: config?.maxAgeMs ?? DEFAULT_MAX_AGE_MS,
    };
  }

  /**
   * Record an undoable action.
   */
  push(action: Omit<UndoAction, "recordedAt" | "undone">): void {
    this.pruneExpired();

    this.stack.push({
      ...action,
      recordedAt: Date.now(),
      undone: false,
    });

    // Trim to max size (remove oldest)
    while (this.stack.length > this.config.maxSize) {
      this.stack.shift();
    }
  }

  /**
   * Undo the most recent non-undone action.
   *
   * Returns the result of the undo operation, or null if no actions available.
   */
  async undoLast(): Promise<UndoResult | null> {
    this.pruneExpired();

    // Find the most recent non-undone action
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const action = this.stack[i];
      if (!action.undone) {
        return this.executeUndo(action);
      }
    }

    return null;
  }

  /**
   * Undo a specific action by ID.
   */
  async undoById(actionId: string): Promise<UndoResult | null> {
    const action = this.stack.find((a) => a.id === actionId && !a.undone);
    if (!action) {
      return null;
    }
    return this.executeUndo(action);
  }

  /**
   * Get all actions in the stack (newest first).
   */
  getActions(): ReadonlyArray<Omit<UndoAction, "undo">> {
    this.pruneExpired();
    return this.stack.map(({ undo: _, ...rest }) => rest).toReversed();
  }

  /**
   * Get the number of undoable (non-undone, non-expired) actions.
   */
  undoableCount(): number {
    this.pruneExpired();
    return this.stack.filter((a) => !a.undone).length;
  }

  /**
   * Clear the entire undo stack.
   */
  clear(): void {
    this.stack = [];
  }

  /**
   * Get the current stack size.
   */
  get size(): number {
    return this.stack.length;
  }

  private async executeUndo(action: UndoAction): Promise<UndoResult> {
    try {
      const success = await action.undo();
      action.undone = true;
      return {
        success,
        actionId: action.id,
        description: action.description,
      };
    } catch (err) {
      return {
        success: false,
        actionId: action.id,
        description: action.description,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private pruneExpired(): void {
    const cutoff = Date.now() - this.config.maxAgeMs;
    this.stack = this.stack.filter((a) => a.recordedAt >= cutoff);
  }
}
