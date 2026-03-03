/**
 * GDPVal evaluation harness — quality regression suite.
 *
 * Ports ClawWork's task evaluation approach to TypeScript. Defines a
 * task structure, runs agent sessions, scores outputs, and computes
 * ROI using BLS wage data.
 *
 * Usage:
 *   const harness = new GDPValHarness(tasks);
 *   const results = await harness.run(agentFn);
 *   console.log(harness.summary(results));
 *
 * Inspired by HKUDS/ClawWork's `task_manager.py` + `llm_evaluator.py`.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface GDPValTask {
  /** Unique task ID. */
  id: string;
  /** Human-readable task title. */
  title: string;
  /** Full task description / prompt for the agent. */
  prompt: string;
  /** Occupation category (e.g. "Software Developer", "Data Analyst"). */
  occupation: string;
  /** Sector (e.g. "Technology", "Business & Finance"). */
  sector: string;
  /** Estimated human hours to complete. */
  estimatedHours: number;
  /** BLS hourly wage for this occupation (USD). */
  blsHourlyWage: number;
  /** Evaluation criteria (what makes a good answer). */
  criteria: string[];
  /** Optional reference answer for comparison. */
  referenceAnswer?: string;
  /** Tags for filtering (e.g. ["coding", "analysis", "writing"]). */
  tags: string[];
}

export interface TaskResult {
  taskId: string;
  /** Agent's output text. */
  output: string;
  /** Quality score 0-1 (evaluated by LLM or human). */
  qualityScore: number;
  /** Time the agent took (ms). */
  agentDurationMs: number;
  /** Token cost in cents. */
  costCents: number;
  /** Computed dollar value: quality × estimatedHours × blsHourlyWage. */
  dollarValue: number;
  /** ROI: dollarValue / (costCents / 100). */
  roi: number;
  /** Per-criterion scores (0-1 each). */
  criteriaScores: Record<string, number>;
}

export interface EvalSummary {
  /** Total tasks run. */
  totalTasks: number;
  /** Average quality score. */
  avgQuality: number;
  /** Total dollar value created. */
  totalDollarValue: number;
  /** Total cost in cents. */
  totalCostCents: number;
  /** Aggregate ROI (totalDollarValue / totalCost). */
  aggregateRoi: number;
  /** Per-sector breakdown. */
  bySector: Array<{
    sector: string;
    taskCount: number;
    avgQuality: number;
    totalValue: number;
  }>;
  /** Timestamp of evaluation run. */
  evaluatedAt: string;
}

// ── Payment formula ──────────────────────────────────────────────────

/**
 * ClawWork's payment formula:
 *   payment = qualityScore × estimatedHours × blsHourlyWage
 *
 * Converts AI output quality into dollar value using auditable BLS wage data.
 */
export function computeDollarValue(
  qualityScore: number,
  estimatedHours: number,
  blsHourlyWage: number,
): number {
  return qualityScore * estimatedHours * blsHourlyWage;
}

/**
 * Compute ROI: dollar value / cost.
 * Returns Infinity for zero cost (local models).
 */
export function computeRoi(dollarValue: number, costCents: number): number {
  if (costCents <= 0) return dollarValue > 0 ? Infinity : 0;
  return dollarValue / (costCents / 100);
}

// ── Eval harness ─────────────────────────────────────────────────────

export type AgentFunction = (prompt: string) => Promise<{
  output: string;
  durationMs: number;
  costCents: number;
}>;

export type EvalFunction = (params: {
  task: GDPValTask;
  output: string;
}) => Promise<{
  qualityScore: number;
  criteriaScores: Record<string, number>;
}>;

export class GDPValHarness {
  private tasks: GDPValTask[];

  constructor(tasks: GDPValTask[]) {
    this.tasks = tasks;
  }

  /** Run evaluation on all tasks using the provided agent and evaluator. */
  async run(agent: AgentFunction, evaluator: EvalFunction): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    for (const task of this.tasks) {
      const agentResult = await agent(task.prompt);
      const evalResult = await evaluator({ task, output: agentResult.output });
      const dollarValue = computeDollarValue(
        evalResult.qualityScore,
        task.estimatedHours,
        task.blsHourlyWage,
      );
      const roi = computeRoi(dollarValue, agentResult.costCents);

      results.push({
        taskId: task.id,
        output: agentResult.output,
        qualityScore: evalResult.qualityScore,
        agentDurationMs: agentResult.durationMs,
        costCents: agentResult.costCents,
        dollarValue,
        roi,
        criteriaScores: evalResult.criteriaScores,
      });
    }

    return results;
  }

  /** Compute summary statistics from results. */
  summary(results: TaskResult[]): EvalSummary {
    const totalTasks = results.length;
    const avgQuality = totalTasks > 0
      ? results.reduce((sum, r) => sum + r.qualityScore, 0) / totalTasks
      : 0;
    const totalDollarValue = results.reduce((sum, r) => sum + r.dollarValue, 0);
    const totalCostCents = results.reduce((sum, r) => sum + r.costCents, 0);

    // Per-sector breakdown.
    const sectorMap = new Map<string, { count: number; quality: number; value: number }>();
    for (const result of results) {
      const task = this.tasks.find((t) => t.id === result.taskId);
      if (!task) continue;
      const entry = sectorMap.get(task.sector) ?? { count: 0, quality: 0, value: 0 };
      entry.count++;
      entry.quality += result.qualityScore;
      entry.value += result.dollarValue;
      sectorMap.set(task.sector, entry);
    }

    return {
      totalTasks,
      avgQuality,
      totalDollarValue,
      totalCostCents,
      aggregateRoi: computeRoi(totalDollarValue, totalCostCents),
      bySector: [...sectorMap.entries()].map(([sector, data]) => ({
        sector,
        taskCount: data.count,
        avgQuality: data.quality / data.count,
        totalValue: data.value,
      })),
      evaluatedAt: new Date().toISOString(),
    };
  }

  /** Filter tasks by sector. */
  filterBySector(sector: string): GDPValTask[] {
    return this.tasks.filter((t) => t.sector.toLowerCase().includes(sector.toLowerCase()));
  }

  /** Filter tasks by tag. */
  filterByTag(tag: string): GDPValTask[] {
    return this.tasks.filter((t) => t.tags.includes(tag));
  }

  get taskCount(): number {
    return this.tasks.length;
  }
}

// ── Sample tasks (Technology & Business subsets) ─────────────────────

export const SAMPLE_TECHNOLOGY_TASKS: GDPValTask[] = [
  {
    id: "tech-001",
    title: "Debug a race condition in async TypeScript",
    prompt: "A TypeScript Node.js service has intermittent failures. Two async functions write to the same cache key. Identify the race condition and propose a fix using atomic operations or locking.",
    occupation: "Software Developer",
    sector: "Technology & Engineering",
    estimatedHours: 2,
    blsHourlyWage: 44.96,
    criteria: ["Correctly identifies the race condition", "Proposes a working fix", "Explains why the fix works"],
    tags: ["coding", "debugging", "typescript"],
  },
  {
    id: "tech-002",
    title: "Write a SQL migration for a new feature",
    prompt: "Design a database schema for a multi-tenant SaaS notification system. Create the migration SQL including tables, indexes, and constraints. Support email, SMS, and push channels.",
    occupation: "Database Administrator",
    sector: "Technology & Engineering",
    estimatedHours: 3,
    blsHourlyWage: 49.13,
    criteria: ["Schema is normalized", "Indexes cover query patterns", "Multi-tenancy is properly isolated"],
    tags: ["database", "sql", "architecture"],
  },
];

export const SAMPLE_BUSINESS_TASKS: GDPValTask[] = [
  {
    id: "biz-001",
    title: "Analyze Q4 sales data and recommend actions",
    prompt: "Given Q4 sales data showing 15% decline in enterprise segment but 30% growth in SMB, write a strategic analysis with 3 recommended actions for the executive team.",
    occupation: "Management Analyst",
    sector: "Business & Finance",
    estimatedHours: 4,
    blsHourlyWage: 48.89,
    criteria: ["Data-driven analysis", "Actionable recommendations", "Executive-appropriate tone"],
    tags: ["analysis", "strategy", "writing"],
  },
];
