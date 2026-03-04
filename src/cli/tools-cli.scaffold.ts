import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCommandWithTimeout } from "../platform/process/exec.js";

function toSnakeCase(name: string): string {
  return name.replace(/-/g, "_");
}

function toPascalCase(name: string): string {
  return name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

export function scaffoldTool(opts: { name: string; groups: string[]; toolsDir: string }): {
  metaPath: string;
  implPath: string;
} {
  const { name, groups, toolsDir } = opts;
  const id = toSnakeCase(name);
  const pascal = toPascalCase(name);
  const factoryName = `create${pascal}Tool`;
  const schemaName = `${pascal}Schema`;
  const filePrefix = `${name}-tool`;
  const metaPath = resolve(toolsDir, `${filePrefix}.meta.ts`);
  const implPath = resolve(toolsDir, `${filePrefix}.ts`);

  if (existsSync(metaPath) || existsSync(implPath)) {
    throw new Error(`Tool files already exist: ${filePrefix}.ts / ${filePrefix}.meta.ts`);
  }

  const groupsLiteral = groups.map((g) => `"${g}"`).join(", ");

  const metaContent = `import type { ToolMeta } from "../tool-meta.js";

export const meta: ToolMeta = {
  id: "${id}",
  factory: "${factoryName}",
  groups: [${groupsLiteral}],
};
`;

  const implContent = `import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

const ${schemaName} = Type.Object({
  // TODO: define parameters
});

export function ${factoryName}(): AnyAgentTool {
  return {
    label: "${pascal}",
    name: "${id}",
    description: "TODO: describe what this tool does",
    parameters: ${schemaName},
    execute: async (_toolCallId, args) => {
      // TODO: implement
      return jsonResult({ status: "ok" });
    },
  };
}
`;

  writeFileSync(metaPath, metaContent, "utf-8");
  writeFileSync(implPath, implContent, "utf-8");
  return { metaPath, implPath };
}

export async function runCodegen(projectRoot: string): Promise<void> {
  const result = await runCommandWithTimeout(["pnpm", "generate:tools"], {
    timeoutMs: 30_000,
    cwd: projectRoot,
  });
  if (result.code !== 0) {
    throw new Error(`Codegen failed (exit ${result.code}): ${result.stderr}`);
  }
}
