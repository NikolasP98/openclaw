/**
 * SQLite PRAGMA tuning — applied at every database connection open.
 *
 * WAL mode is the highest-impact change: enables concurrent reads while
 * writes are in progress (critical for multi-session + cron writes).
 *
 * Inspired by ZeroClaw's PRAGMA tuning and confirmed by PicoClaw v0.1.2
 * which fixed a concurrency/persistence bug with this exact approach.
 */

type DatabaseLike = {
  exec(sql: string): void;
};

/**
 * Apply performance and safety PRAGMAs to a SQLite database connection.
 * Safe to call on any connection — idempotent.
 */
export function applySqlitePragmas(db: DatabaseLike): void {
  // WAL mode — concurrent reads during writes. Most impactful change.
  db.exec("PRAGMA journal_mode = WAL");

  // NORMAL sync — 2x write speed, still durable (data is safe, WAL
  // protects against mid-transaction corruption on power loss).
  db.exec("PRAGMA synchronous = NORMAL");

  // Memory-mapped I/O — 8MB. Reduces read syscalls.
  db.exec("PRAGMA mmap_size = 8388608");

  // Page cache — 2MB (negative = KiB). Reduces disk reads for hot data.
  db.exec("PRAGMA cache_size = -2000");

  // Temp tables in memory — avoid temp file I/O for sorting/grouping.
  db.exec("PRAGMA temp_store = MEMORY");
}
