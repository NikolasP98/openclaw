/**
 * Stamps package.json with a date-based version: yyyy.M.d
 *
 * Usage:
 *   node --import tsx scripts/stamp-version.ts          # today's date
 *   node --import tsx scripts/stamp-version.ts 2026.2.15 # explicit version
 *
 * If the version already exists on the registry, appends a revision suffix:
 *   2026.2.14-1, 2026.2.14-2, etc.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(rootDir, "package.json");

function todayVersion(): string {
  const now = new Date();
  return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
}

function registryVersionExists(name: string, version: string): boolean {
  try {
    execSync(`npm view ${name}@${version} version`, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function resolveVersion(name: string, base: string): string {
  if (!registryVersionExists(name, base)) {
    return base;
  }

  // Version already published — find next revision
  let revision = 1;
  while (registryVersionExists(name, `${base}-${revision}`)) {
    revision++;
  }
  return `${base}-${revision}`;
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name: string; version: string };
const requestedVersion = process.argv[2] ?? todayVersion();
const finalVersion = resolveVersion(pkg.name, requestedVersion);

pkg.version = finalVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(finalVersion);
