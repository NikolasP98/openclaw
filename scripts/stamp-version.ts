/**
 * Stamps package.json with a date-based version: yyyy.M.d
 *
 * Usage:
 *   node --import tsx scripts/stamp-version.ts               # today's date
 *   node --import tsx scripts/stamp-version.ts 2026.2.15     # explicit version
 *   node --import tsx scripts/stamp-version.ts --dev         # today's date + -dev suffix
 *   node --import tsx scripts/stamp-version.ts 2026.2.15 --dev # explicit + -dev suffix
 *
 * If the version already exists on the registry, appends a revision suffix:
 *   2026.2.14-1, 2026.2.14-2, etc.
 *
 * With --dev flag, the suffix becomes -dev:
 *   2026.2.14-dev, 2026.2.14-1-dev, 2026.2.14-2-dev, etc.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(rootDir, "package.json");

const args = process.argv.slice(2);
const devFlag = args.includes("--dev");
const positionalArgs = args.filter((a) => !a.startsWith("--"));

function todayVersion(): string {
  const now = new Date();
  return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
}

function registryVersionExists(name: string, version: string): boolean {
  try {
    execFileSync("npm", ["view", `${name}@${version}`, "version"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function resolveVersion(name: string, base: string, dev: boolean): string {
  const suffix = dev ? "-dev" : "";
  const candidate = `${base}${suffix}`;

  if (!registryVersionExists(name, candidate)) {
    return candidate;
  }

  // Version already published — find next revision
  let revision = 1;
  while (registryVersionExists(name, `${base}-${revision}${suffix}`)) {
    revision++;
  }
  return `${base}-${revision}${suffix}`;
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name: string; version: string };
const requestedVersion = positionalArgs[0] ?? todayVersion();
const finalVersion = resolveVersion(pkg.name, requestedVersion, devFlag);

pkg.version = finalVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(finalVersion);
