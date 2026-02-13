---
skill: lessons-learned
description: >
  After completing a coding task, implementation, or deployment, capture observations,
  improvements, and actionable fixes discovered during the work. Use this iterative
  approach to turn each task into a feedback loop that improves the codebase.
triggers:
  - lessons learned
  - improvements found
  - observations from deployment
  - what did we learn
  - iterative improvements
  - post-task review
---

# Lessons Learned — Iterative Improvement Workflow

After completing any coding task, deployment, or implementation request, follow this
structured approach to capture and act on observations.

## When to Activate

This skill applies after completing any non-trivial task:

- Server provisioning or deployment
- Feature implementation
- Bug fix that revealed systemic issues
- CI/CD pipeline changes
- Configuration or infrastructure work

## Workflow

### 1. Observe During Execution

While working on the primary task, note:

- **Friction points** — steps that took longer than expected or required workarounds
- **Drift** — version mismatches, stale defaults, outdated references
- **Missing features** — flags, options, or automation that would have helped
- **Output issues** — confusing messages, wrong numbering, missing information
- **Performance** — excessive round-trips, slow operations, unnecessary waits

### 2. Summarize Observations

After the primary task completes, present findings as a numbered list:

```
**Observations & potential improvements I noticed:**

1. **[Category]** — Brief description of what was observed and why it matters.
2. **[Category]** — ...
```

Categories include: Performance, UX, Drift, Missing Feature, Bug, Documentation.

### 3. Ask to Fix

After presenting observations, ask:

> Want me to file these as improvements and/or fix any of them now?

### 4. Implement Fixes

When approved, for each fix:

- Create a task list tracking each improvement
- Implement changes across all affected files (don't leave partial updates)
- For version bumps: grep for ALL references and update consistently
- For UX fixes: test the output logic mentally for all conditional branches
- For performance: measure the before/after (e.g., "20 SSH calls -> 5")

### 5. Commit with Context

Use a commit message that ties fixes back to the observation context:

```
fix(scope): N improvements from [task-name] observations

- Improvement 1 (quantify the change)
- Improvement 2
- ...
```

### 6. Update Memory

If a pattern emerges across multiple sessions (e.g., "always check for version drift
after deployments"), record it in the auto memory for future reference.

## Principles

- **Fix forward** — Don't just note problems, fix them in the same session when possible
- **Be thorough** — A version bump in one file means checking every file that references it
- **Quantify** — "Batched 20 SSH calls into 5" is better than "reduced SSH calls"
- **Don't over-scope** — Fix what was observed, don't redesign the whole system
- **Separate concerns** — Keep improvement commits separate from the primary task commit
