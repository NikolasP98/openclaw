/**
 * Lazy service initialization.
 *
 * A generic wrapper that defers service initialization until first use.
 * Supports concurrent first-use calls (only one initialization runs),
 * error surfacing, and graceful disposal.
 *
 * Inspired by Nanobot's lazy initialization pattern.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type LazyServiceOptions<T> = {
  /** Human-readable name for error messages. */
  name: string;
  /** Factory function called on first use. Should return the initialized service. */
  initializer: () => Promise<T>;
};

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * A service wrapper that defers initialization to first use.
 *
 * Thread-safe: concurrent calls to `get()` during initialization will
 * wait for the same promise (no duplicate init).
 *
 * ```typescript
 * const db = new LazyService({
 *   name: "database",
 *   initializer: () => connectToDatabase(),
 * });
 *
 * // Not connected yet — no startup cost
 *
 * const conn = await db.get(); // First call triggers connection
 * const conn2 = await db.get(); // Returns cached instance
 * ```
 */
export class LazyService<T> {
  private instance: T | undefined;
  private initPromise: Promise<T> | undefined;
  private initError: Error | undefined;
  private readonly options: LazyServiceOptions<T>;

  constructor(options: LazyServiceOptions<T>) {
    this.options = options;
  }

  /**
   * Get the service instance, initializing on first call.
   *
   * Concurrent calls during initialization share the same promise.
   * If initialization fails, the error is cached and re-thrown on
   * subsequent calls (call `reset()` to retry).
   */
  async get(): Promise<T> {
    if (this.instance) {
      return this.instance;
    }
    if (this.initError) {
      throw new Error(
        `Lazy service "${this.options.name}" previously failed to initialize: ${this.initError.message}`,
      );
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.options.initializer().then(
      (result) => {
        this.instance = result;
        this.initPromise = undefined;
        return result;
      },
      (err) => {
        this.initError = err instanceof Error ? err : new Error(String(err));
        this.initPromise = undefined;
        throw new Error(
          `Lazy service "${this.options.name}" failed to initialize: ${this.initError.message}`,
        );
      },
    );

    return this.initPromise;
  }

  /**
   * Check if the service has been initialized.
   */
  get initialized(): boolean {
    return this.instance !== undefined;
  }

  /**
   * Check if initialization has been attempted but failed.
   */
  get failed(): boolean {
    return this.initError !== undefined;
  }

  /**
   * Reset the service, allowing re-initialization on next `get()`.
   * Does NOT dispose the current instance — call `dispose()` first if needed.
   */
  reset(): void {
    this.instance = undefined;
    this.initPromise = undefined;
    this.initError = undefined;
  }

  /**
   * Dispose the service instance and reset state.
   * Calls the optional `disposer` callback if the instance exists.
   */
  async dispose(disposer?: (instance: T) => void | Promise<void>): Promise<void> {
    if (this.instance && disposer) {
      await disposer(this.instance);
    }
    this.reset();
  }
}
