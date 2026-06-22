# Opportunities & roadmap (parked)

Deliberately-deferred opportunities surfaced by the v1 gap audit (5-dimension
parallel audit + per-finding adversarial verification against the code, 2026-06-22).
These are **not bugs** — the deterministic core is sound. They are higher-leverage
bets parked for later, on purpose.

> Tier 0/1/2 findings from the same audit (command-prose↔CLI drift, coverage holes,
> unfulfilled schema promises) are being **fixed** separately, not parked here.

---

## 1. Multi-feature / worktree ledger — `M`–`L`

`run.json` tracks a single active `feature` (`src/core/run/run-state.schema.ts` —
`feature: z.string()`, singular; `featureDir()` is a single-feature path). A team with
several features in flight needs separate cloned dirs and loses cross-feature
dependency tracking.

**Bet:** a `features{}` map in the ledger + `spin list-features` / `spin switch <feature>`,
so one repo holds many concurrent SDD cycles (matches the multi-id reality of real
codebases and competing harnesses).

## 2. Sidecar↔markdown cross-check gate — `M`

The one seam that remains **model-trust**: a worker can author `DEFINE.md` with an `AC-1`
description and a sidecar with the same id but a *different* summary — every gate passes
(gates trust the JSON; humans read the markdown). Documented as a known residual in
`docs/HARNESS.md` ("Sidecar drift … not fully closed in MVP").

**Bet:** `spin validate define --cross-check` that diffs sidecar `criteria[]` ids against
`DEFINE.md` heading-anchored `AC-n` sections and fails if an id has no matching prose.
Closes the last prose-vs-data trust gap the same way `spec-drift` closed build-vs-define.

## 3. `spin pack add` — installable specialist catalog — `M`

`packs/` ships ~48 specialist agents, but there is **no install path** (`packs/` isn't in
`package.json` `files[]`; `packs/README.md` notes `spin pack add` as "future"). They are
unreachable to an installed user, and a manual `git mv` would trip `G_ROUTER_COVERAGE`
unless routing is regenerated.

**Bet:** `spin pack add <pack>` that (a) copies the pack into `plugin/agents/`, (b)
regenerates the router, (c) leaves `G_ROUTER_COVERAGE` green. This is the extension point
that makes Spindle defensible against AgentSpec's specialist-breadth advantage.

## 4. PostToolUse hook — real-time gate feedback — `M`

`plugin/hooks/hooks.json` only has `SessionStart`/`SessionEnd`. A `PostToolUse` hook on
`Write`/`Edit` that runs `spin gate G_BUILD --silent` when a file in the active design
manifest changes would give live gate feedback during the build phase — no need to wait for
`/ship`. Already noted as a future item in `plugin/commands/review/judge.md` ("V3 — opt-in
PostToolUse hook"). High-value for the "lowest hallucination surface" goal.

## 5. Cost observability — `M`

`spin budget` is advisory, self-reported, exits 0, and **does not export**. No baseline
("this run spent 40% more than the last green run of this feature type"), no per-gate cost
attribution, no CI cost dashboard. The dogfood measured 8.8M tokens across 10 agents as a
*surprise* (`docs/DOGFOOD_LOG_erin-planning.md`).

**Bet:** `spin budget --export json` + a recorded per-run baseline in the ledger + per-phase
attribution, so cost becomes observable, not just post-hoc countable.

## 6. Model-layer evals — `L`

Today `spin eval` replays **gate** fixtures (deterministic pass/block). The command layer —
which holds the real hallucination surface — has **no structured eval**. The product goal
("lowest hallucination surface") wants a second eval layer.

**Bet:** recorded command transcripts where `spin` exit codes are mocked to specific values
and the command's branching behavior is asserted — eval the model layer's *control flow*,
not its prose.

---

## Meta-opportunity — kill the drift class permanently — `M`

Almost every Tier 0/1 bug in the audit was **prose (command templates) drifting from the
schema/CLI** — exactly the failure mode Spindle exists to prevent. A guard (or eval) that
validates the JSON examples inside command templates against the real Zod handoff schemas,
and the `${CLAUDE_PLUGIN_ROOT}/...` paths against disk, would kill this entire class of bug
forever. It is Spindle dogfooding its own principle on itself. Highest structural ROI.
