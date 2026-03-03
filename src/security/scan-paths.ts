import fs from "node:fs";
import path from "node:path";

export function isPathInside(basePath: string, candidatePath: string): boolean {
  const base = path.resolve(basePath);
  const candidate = path.resolve(candidatePath);
  const rel = path.relative(base, candidate);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

/**
 * Symlink-safe path containment check.
 *
 * Resolves symlinks via `fs.realpathSync` before checking that `candidatePath`
 * is inside `basePath`. Prevents workspace escape via symlinks pointing outside
 * the workspace root.
 *
 * Falls back to `path.resolve()` (no symlink resolution) if the path doesn't
 * exist yet — this allows creating new files inside the workspace.
 *
 * Inspired by PicoClaw v0.1.2 security patch (filepath.EvalSymlinks).
 */
export function isRealPathInside(basePath: string, candidatePath: string): boolean {
  const base = realpathSafe(path.resolve(basePath));
  const candidate = realpathSafe(path.resolve(basePath, candidatePath));
  const rel = path.relative(base, candidate);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

/**
 * Assert that a path stays within the workspace root after symlink resolution.
 * Throws if the path escapes.
 */
export function assertRealPathInWorkspace(filePath: string, workspaceRoot: string): void {
  if (!isRealPathInside(workspaceRoot, filePath)) {
    throw new Error(
      `Path escape blocked: '${filePath}' resolves outside workspace root '${workspaceRoot}'`,
    );
  }
}

/**
 * Resolve the real path (following symlinks), falling back to `path.resolve()`
 * if the target doesn't exist (e.g. new file creation).
 */
function realpathSafe(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    // Path doesn't exist yet — fall back to logical resolution.
    return path.resolve(p);
  }
}

export function extensionUsesSkippedScannerPath(entry: string): boolean {
  const segments = entry.split(/[\\/]+/).filter(Boolean);
  return segments.some(
    (segment) =>
      segment === "node_modules" ||
      (segment.startsWith(".") && segment !== "." && segment !== ".."),
  );
}
