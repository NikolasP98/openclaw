/**
 * Metadata sidecar type for the modular tool registry.
 *
 * Each tool declares a `*.meta.ts` file next to its implementation that
 * exports `meta: ToolMeta`. The codegen script (`scripts/generate-tool-registry.ts`)
 * scans these files to produce `_registry.generated.ts` and `_groups.generated.ts`.
 */
export type ToolMeta = {
  /** Unique tool identifier (matches `tool.name`). */
  id: string;
  /** Factory export name, e.g. `"createSummarizeTool"`. */
  factory: string;
  /** Tool groups this tool belongs to (e.g. `["group:runtime"]`). */
  groups: string[];
  /**
   * Which keys from the options bag this factory needs.
   * Used by the registry loop to pass only relevant context.
   */
  contextKeys?: string[];
  /** Co-located skill prompt file path (relative to meta file). */
  skillPromptFile?: string;
  /** External binary / env requirements. */
  requires?: {
    bins?: string[];
    env?: string[];
  };
  /** Install instructions (matches existing MinionSkillMetadata.install). */
  install?: Array<{ kind: string; formula?: string; bins?: string[]; label?: string }>;
  /** If true, tool is excluded unless explicitly allowed. */
  optional?: boolean;
  /** If true, include in MCP server export. */
  mcpExport?: boolean;
  /** If true, factory returns multiple tools (e.g. `createKnowledgeGraphTools`). */
  multi?: boolean;
  /**
   * Conditional inclusion predicate key.
   * Evaluated at runtime by `evaluateCondition()` in openclaw-tools.ts.
   */
  condition?: string;
  /**
   * Module path relative to the tools directory.
   * Only needed for tools outside `src/agents/tools/` (e.g. knowledge-graph in `src/memory/`).
   * If omitted, the codegen infers the path from the meta file location.
   */
  modulePath?: string;
};
