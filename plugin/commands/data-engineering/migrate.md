---
name: migrate
description: Highest-risk REWRITE command. Fans out migrate-dbt-worker + migrate-spark-worker (sonnet) in independent contexts as competing migration-plans, picks the engine from the data, has an independent equivalence-worker verify source/target equivalence, then an Opus adversary attempt an equivalence-break against the chosen plan. Emits findings.json and gates on G_REVIEW_BLOCK before recommending. No single agent both decides and validates.
---

# /migrate

Migrate a legacy ETL pipeline to a modern engine (dbt or Spark) as a controlled
**rewrite**. This is the highest-risk command in the harness: the deliverable is
not code but a **recommended migration plan that has survived adversarial
equivalence review**. Separation of duties is structural — the agent that
authors a plan never validates it, and the agent that verifies equivalence never
authors a plan.

The chain: **two independent plans → engine pick from the data → independent
equivalence verification → adversarial equivalence-break → findings.json →
G_REVIEW_BLOCK → recommend.**

## Inputs

- The legacy pipeline source (SQL/stored procs/scripts), its source and target
  schemas, and representative volume/throughput characteristics. Pass these
  paths to every worker; they decide nothing the data does not support.

## Protocol

### 1. Author TWO competing migration plans — independent contexts, true parallel

Dispatch **migrate-dbt-worker** and **migrate-spark-worker** via the Task tool
**in a single message** so they run in fully independent contexts. Neither sees the other's
output. Each is a *plan author only* — it does not validate, and it does not see
the equivalence or adversary phases.

Route each on `migration-plan` (sonnet — analysis/authoring):

```bash
ahx route migration-plan
```

Use the returned `{ tier, model, reason }` (expected: sonnet) for **both**
workers. Then dispatch, in one message:

**Worker A — migrate-dbt-worker (sonnet).** Instruct it:

> Read the legacy pipeline source, source schema, target schema, and the
> volume/throughput profile. Decide whether **dbt** is the right engine for THIS
> data — base the call on the evidence (transformation shape, batch vs. set-based
> work, warehouse-pushdown fit, volume). If the data argues against dbt, say so
> in `risks` and still produce the most honest dbt plan possible; do not force it.
> Author `.ahx/features/<feature>/MIGRATION_PLAN_DBT.md`, then write a JSON
> handoff sidecar at `.ahx/features/<feature>/.handoffs/plan-dbt.json` matching
> the `migration-plan` schema:
>
> ```json
> {
>   "handoff": "migration-plan",
>   "engine": "dbt",
>   "steps": [ "<ordered migration step>" ],
>   "risks": [ "<risk with severity and trigger>" ],
>   "rollback": [ "<rollback / safe-revert step>" ]
> }
> ```
>
> Do not validate equivalence. Do not run the rewrite. Plan only.

**Worker B — migrate-spark-worker (sonnet).** Same instruction, engine `spark`, writing
`.ahx/features/<feature>/MIGRATION_PLAN_SPARK.md` and
`.ahx/features/<feature>/.handoffs/plan-spark.json` with `"engine": "spark"`.

### 2. Validate both plan handoffs

For each plan, validate the sidecar against the `migration-plan` schema:

```bash
ahx handoff-check migration-plan .ahx/features/<feature>/.handoffs/plan-dbt.json
ahx handoff-check migration-plan .ahx/features/<feature>/.handoffs/plan-spark.json
```

Exit 1 on either → that plan's handoff is invalid. Bounded re-dispatch of **only
that worker**:

```bash
ahx retry MIGRATE --inc   # exit 1 at ceiling -> STOP "migrate retry ceiling reached"
```

Exit 0 on both → continue.

### 3. Pick the engine from the data

Read both `migration-plan` handoffs. Select the engine whose plan the **evidence
in the data** supports — set-based/warehouse-pushdown transforms favor dbt;
large-volume shuffle/joins, streaming, or non-SQL logic favor Spark. The choice
is a function of the data and the two plans' `risks`, **not** a preference. Record
the chosen engine and the losing engine; carry the **chosen** plan into review.
The plan authors do not participate in this decision.

### 4. Independent equivalence verification (NOT a plan author)

Dispatch a separate **equivalence-worker** — a different agent from either plan
author, with no authority to amend the plan. Route on `claim-verify` (sonnet):

```bash
ahx route claim-verify
```

Instruct it:

> You did not write this plan and you may not change it. Read the chosen
> migration plan and the legacy source. Verify **source/target equivalence**:
> for every legacy output (row grain, column semantics, aggregations, null/empty
> handling, dedup keys, watermark/late-data behavior, type coercions), confirm
> the migrated plan reproduces it. For each gap, emit a `finding`. Write each
> finding's JSON sidecar matching the `finding` schema, e.g.
> `.ahx/features/<feature>/.handoffs/equiv-<n>.json`:
>
> ```json
> {
>   "handoff": "finding",
>   "severity": "CRITICAL|HIGH|MEDIUM|LOW",
>   "claim": "<equivalence property under test>",
>   "evidence": "<where source and target diverge>",
>   "location": "<file/step in the plan>"
> }
> ```
>
> An equivalence break that changes output values, grain, or row count is
> CRITICAL. Do not propose fixes — report divergences only.

Validate each finding sidecar:

```bash
ahx handoff-check finding .ahx/features/<feature>/.handoffs/equiv-<n>.json
```

### 5. Adversarial equivalence-break (Opus)

Dispatch the **adversary / challenger** on the `equivalence-break` task kind — a
critical routing kind that **never downgrades**, even under `--budget low`:

```bash
ahx route equivalence-break --budget low
```

Use the returned model (expected: opus). The adversary did not author the plan
and is not the equivalence-worker. Instruct it:

> Assume the chosen migration plan is wrong. Try to **break** source/target
> equivalence: construct concrete inputs (skew, nulls, duplicate keys, late
> records, type overflow, timezone/locale, empty partitions, ordering
> non-determinism) for which the migrated plan diverges from the legacy output.
> Treat the equivalence-worker's PASSes as hypotheses to falsify. Emit a `finding`
> for every break you can substantiate, written to
> `.ahx/features/<feature>/.handoffs/adversary-<n>.json` matching the `finding`
> schema (same shape as step 4). A reproducible divergence in output values,
> grain, or row count is CRITICAL. Do not soften severity and do not patch the
> plan.

Validate each adversary finding:

```bash
ahx handoff-check finding .ahx/features/<feature>/.handoffs/adversary-<n>.json
```

### 6. Emit findings.json

Aggregate **every** validated finding from the equivalence-worker (step 4) and
the adversary (step 5) into one array at
`.ahx/features/<feature>/findings.json`. Do not drop, merge, or downgrade any
finding. Preserve each finding's `severity`, `claim`, `evidence`, and `location`.
This file is the sole input to the gate — the agents that produced the findings
do not get to clear them.

### 7. Gate G_REVIEW_BLOCK (before any recommendation)

```bash
ahx gate G_REVIEW_BLOCK --findings .ahx/features/<feature>/findings.json
```

`G_REVIEW_BLOCK` blocks when surviving **CRITICAL** findings > 0.

- **Exit 1 → STOP. Do NOT recommend the migration.** Surface
  `{gate, passed, reasons, unmet}` and the CRITICAL findings. The chosen plan
  failed equivalence review; report which equivalence properties broke and halt.
  Remediation means re-authoring the plan (re-run step 1 for the affected
  engine), not editing `findings.json`.
- **Exit 0 → continue.** No surviving CRITICAL equivalence breaks.

### 8. Recommend (only after G_REVIEW_BLOCK passes)

Only now record the chosen migration plan as the recommendation. Run:

```bash
ahx complete MIGRATE --handoff .ahx/features/<feature>/.handoffs/plan-<engine>.json
```

(`<engine>` = the engine chosen in step 3.) Exit 1 → bounded retry via
`ahx retry MIGRATE --inc`, re-dispatch that engine's plan worker; STOP at ceiling.
Exit 0 → report to the user:

- The recommended engine and **why the data chose it** (vs. the rejected engine).
- The remaining HIGH/MEDIUM/LOW findings that survived review (carry-forward risk).
- The plan's `steps`, `risks`, and `rollback`.
- The paths to `MIGRATION_PLAN_<ENGINE>.md` and `findings.json`.

State explicitly that the recommendation cleared G_REVIEW_BLOCK with zero
surviving CRITICAL equivalence breaks.

## Error surfaces

| Condition | Action |
|---|---|
| `ahx handoff-check migration-plan` exit 1 (step 2) | Re-dispatch ONLY that plan worker via `ahx retry MIGRATE --inc`. Stop at ceiling. |
| `ahx handoff-check finding` exit 1 (step 4/5) | Re-dispatch that reviewer to re-emit the malformed finding sidecar. Stop at ceiling. |
| Both plans argue against their engine | Surface both `risks` sets to the user; do not force a recommendation. The data may not be migratable as-is. |
| `G_REVIEW_BLOCK` exit 1 (step 7) | STOP. Print `reasons` + surviving CRITICAL findings. Re-author the affected plan (step 1); never edit findings.json to pass the gate. |
| `ahx complete MIGRATE` exit 1 (step 8) | Retry via `ahx retry MIGRATE --inc`; re-dispatch the chosen engine's plan worker. Stop at ceiling. |

## Constraints — separation of duties

- **No single agent both decides and validates.** Plan authors (migrate-dbt-worker,
  migrate-spark-worker) never verify equivalence. The equivalence-worker is not a plan
  author and cannot amend the plan. The adversary is neither.
- The engine is **picked from the data**, not chosen by a plan author.
- The **verifier/adversary outranks the generator on the CRITICAL gate**: the
  `equivalence-break` adversary runs on opus and never downgrades. Plan authors
  (sonnet) are never the final judge of a CRITICAL equivalence finding.
- `findings.json` is authored only by aggregation; findings are never dropped,
  merged, or downgraded to clear `G_REVIEW_BLOCK`.
- **No recommendation before `G_REVIEW_BLOCK` passes.** Never auto-advance past a
  failing gate. Never mark `MIGRATE` complete without `ahx complete --handoff`.
- Never invent `ahx` flags, gate IDs, task kinds, or handoff schema ids beyond
  those used above.
