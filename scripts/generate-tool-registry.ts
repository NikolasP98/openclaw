/**
 * Codegen script: scans `src/agents/tools/*.meta.ts`, imports each `meta`
 * export, and generates:
 *
 *   1. `src/agents/tools/_registry.generated.ts`  — tool registry barrel
 *   2. `src/agents/tools/_groups.generated.ts`     — derived tool groups
 *
 * Run: `pnpm generate:tools`  (or `node --import tsx scripts/generate-tool-registry.ts`)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolMeta } from "../src/agents/tool-meta.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS_DIR = path.join(ROOT_DIR, "src", "agents", "tools");
const HEADER = "// AUTO-GENERATED — do not edit. Run: pnpm generate:tools\n";

async function loadAllMeta(): Promise<Array<{ fileName: string; meta: ToolMeta }>> {
  const files = fs.readdirSync(TOOLS_DIR).filter((f) => f.endsWith(".meta.ts"));
  files.sort();

  const entries: Array<{ fileName: string; meta: ToolMeta }> = [];

  for (const file of files) {
    const absPath = path.join(TOOLS_DIR, file);
    const mod = (await import(absPath)) as { meta: ToolMeta };
    if (!mod.meta) {
      throw new Error(`Missing \`meta\` export in ${file}`);
    }
    if (!mod.meta.id || !mod.meta.factory) {
      throw new Error(`Invalid ToolMeta in ${file}: missing id or factory`);
    }
    entries.push({ fileName: file, meta: mod.meta });
  }

  return entries;
}

function resolveModulePath(entry: { fileName: string; meta: ToolMeta }): string {
  if (entry.meta.modulePath) {
    return entry.meta.modulePath;
  }
  // Derive from meta file name: foo-tool.meta.ts → ./foo-tool.js
  const base = entry.fileName.replace(/\.meta\.ts$/, ".js");
  return `./${base}`;
}

function generateRegistry(entries: Array<{ fileName: string; meta: ToolMeta }>): string {
  const lines: string[] = [
    HEADER,
    'import type { ToolMeta } from "../tool-meta.js";',
    "",
    "export type ToolRegistryEntry = {",
    "  meta: ToolMeta;",
    "  load: () => Promise<Record<string, unknown>>;",
    "};",
    "",
    "export const TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {",
  ];

  for (const entry of entries) {
    const { meta } = entry;
    const modulePath = resolveModulePath(entry);

    // Serialize meta inline (compact but readable)
    const metaStr = serializeMeta(meta);

    lines.push(`  ${JSON.stringify(meta.id)}: {`);
    lines.push(`    meta: ${metaStr},`);
    lines.push(`    load: () => import(${JSON.stringify(modulePath)}),`);
    lines.push("  },");
  }

  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

function serializeMeta(meta: ToolMeta): string {
  // Build a clean object literal with only defined fields
  const parts: string[] = [];
  parts.push(`id: ${JSON.stringify(meta.id)}`);
  parts.push(`factory: ${JSON.stringify(meta.factory)}`);
  parts.push(`groups: ${JSON.stringify(meta.groups)}`);

  if (meta.contextKeys) {
    parts.push(`contextKeys: ${JSON.stringify(meta.contextKeys)}`);
  }
  if (meta.skillPromptFile) {
    parts.push(`skillPromptFile: ${JSON.stringify(meta.skillPromptFile)}`);
  }
  if (meta.requires) {
    parts.push(`requires: ${JSON.stringify(meta.requires)}`);
  }
  if (meta.install) {
    parts.push(`install: ${JSON.stringify(meta.install)}`);
  }
  if (meta.optional) {
    parts.push("optional: true");
  }
  if (meta.mcpExport) {
    parts.push("mcpExport: true");
  }
  if (meta.multi) {
    parts.push("multi: true");
  }
  if (meta.condition) {
    parts.push(`condition: ${JSON.stringify(meta.condition)}`);
  }
  if (meta.modulePath) {
    parts.push(`modulePath: ${JSON.stringify(meta.modulePath)}`);
  }

  return `{ ${parts.join(", ")} }`;
}

function generateGroups(entries: Array<{ fileName: string; meta: ToolMeta }>): string {
  // Collect group → tool ids
  const groupMap = new Map<string, Set<string>>();

  for (const { meta } of entries) {
    // For multi-tools, we skip individual id inclusion since they emit multiple tool names
    // that aren't known until runtime. The group will still contain the meta.id as a proxy.
    for (const group of meta.groups) {
      if (!groupMap.has(group)) {
        groupMap.set(group, new Set());
      }
      groupMap.get(group)!.add(meta.id);
    }
  }

  // Sort groups for stable output
  const sortedGroups = [...groupMap.entries()].toSorted(([a], [b]) => a.localeCompare(b));

  const lines: string[] = [
    HEADER,
    "export const GENERATED_TOOL_GROUPS: Record<string, string[]> = {",
  ];

  for (const [group, toolIds] of sortedGroups) {
    const sorted = [...toolIds].toSorted((a, b) => a.localeCompare(b));
    lines.push(`  ${JSON.stringify(group)}: ${JSON.stringify(sorted)},`);
  }

  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const entries = await loadAllMeta();

  // Validate no duplicate IDs
  const ids = new Set<string>();
  for (const { meta, fileName } of entries) {
    if (ids.has(meta.id)) {
      throw new Error(`Duplicate tool id ${JSON.stringify(meta.id)} in ${fileName}`);
    }
    ids.add(meta.id);
  }

  const registryContent = generateRegistry(entries);
  const groupsContent = generateGroups(entries);

  const registryPath = path.join(TOOLS_DIR, "_registry.generated.ts");
  const groupsPath = path.join(TOOLS_DIR, "_groups.generated.ts");

  fs.writeFileSync(registryPath, registryContent);
  fs.writeFileSync(groupsPath, groupsContent);

  // eslint-disable-next-line no-console
  console.log(`Generated ${entries.length} tool entries:`);
  // eslint-disable-next-line no-console
  console.log(`  ${registryPath}`);
  // eslint-disable-next-line no-console
  console.log(`  ${groupsPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("generate-tool-registry failed:", err);
  process.exit(1);
});
