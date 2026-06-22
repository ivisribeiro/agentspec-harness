---
name: model-routing
description: Model-routing doctrine for Spindle — when to use Haiku, Sonnet, or Opus for a task kind, the two hard rules that protect critical gates, and how to read the tier from the CLI with `spin route` and `spin tier`. Use when a workflow command needs to choose a model for a worker subagent, when adding a new task-kind to the routing table, or when `--budget low` needs a safe downgrade decision.
---

# Model routing

Two source files own the routing engine:

- **`src/core/model-route/policy.ts`** — `TASK_KINDS` (every kind's `tier`, `floor`, `downgradable`, `reason`), the `route()` function, `MODEL_IDS`, and `UnknownTaskKindError`. This is what `spin route <kind> [--budget std|low]` runs.
- **`src/core/model-route/tiers.ts`** — `classifyTier()` (pure, deterministic) and `TIER_GUIDE`. This is what `spin tier` runs.

Both live on the deterministic side of the seam. Neither calls a model. Read them before adding a new kind or changing a floor.

The current model IDs (`MODEL_IDS` in policy.ts):

| Constant | Model string |
|---|---|
| `haiku` | `claude-haiku-4-5-20251001` |
| `sonnet` | `claude-sonnet-4-6` |
| `opus` | `claude-opus-4-8` |

## Two orthogonal decisions — decide in order

**1. Orchestration tier (T0/T1/T2) — how much orchestration this task deserves.**

Decide this before spawning anything. `classifyTier()` in tiers.ts takes `TierSignals` (`mechanical`, `reversible`, `risk`, `breadth`, `haveContext`) and returns a `TierDecision`. The CLI surface:

```bash
spin tier [--risk low|medium|high] [--breadth single|few|many] \
          [--have-context] [--mechanical] [--reversible|--irreversible]
# → { decision: { tier, orchestration, agents, adversary, budgetCap, reason } }
```

`classifyTier` judges in this order (first match wins):
1. `mechanical === true` OR trivial held-context lookup → **T0**
2. `risk === 'high'` OR not reversible → **T2** (adversary stays selective)
3. `haveContext === true` → **T1** (re-derivation, not discovery)
4. `breadth === 'many'` → **T2**
5. otherwise bounded → **T1**

| Tier | `TIER_SHAPE` | When |
|---|---|---|
| **T0** | `orchestration: 'main loop'`, `agents: '0'`, `adversary: 'none'` | Rename, config, one doc from a result already in hand, a lookup, mechanical edit |
| **T1** | `orchestration: 'one agent or main loop'`, `agents: '1'`, `adversary: 'optional-single'` | One analysis/file/review; OR planning/audit when the context is already held |
| **T2** | `orchestration: 'fan-out + shared context'`, `agents: 'many (bounded)'`, `adversary: 'selective'`, `budgetCap: 'required'` | Architecture, security-critical, irreversible, or broad discovery across unfamiliar material |

**The re-derivation rule.** `haveContext === true` pulls a task to T1 because fan-out is for *discovery* — covering material you do not yet hold. If the context is already in hand, the task is re-derivation, not discovery. Never spawn N agents to re-read the same material. `spin tier --have-context --breadth many` returns **T1**, not T2.

**Selective adversary.** Even at T2, the `adversary` mode in `TIER_SHAPE.T2` is `'selective'` — the adversary covers the critical items, not every artifact uniformly.

**"Ultra" modes are opt-in.** An exhaustive directive means *be thorough where it matters* — it does not override the T0/T1 classification for things that are genuinely cheap.

**2. Model tier (Haiku/Sonnet/Opus) — which model a given agent runs on.**

Once you have decided to spawn an agent, call:

```bash
spin route <kind> [--budget std|low]
# → { kind, tier, model, budget, reason }
```

`route()` in policy.ts looks up `TASK_KINDS[kind]`, enforces `floor` and `downgradable`, and returns `RouteResult`. The CLI is the authority — never hardcode a model name in a workflow command when `spin route` gives you the right answer.

## The TASK_KINDS routing table

Reproduced from policy.ts. The `floor` and `downgradable` fields are what enforce the two hard rules below.

| Tier | Task kinds (`spin route <kind>`) |
|---|---|
| **Haiku** | `file-read`, `structure-extract`, `frontmatter-parse`, `template-fill`, `format-convert`, `claim-extract`, `ship-prose`, `section-scan`, `router-assemble` |
| **Sonnet** | `spec-authoring`, `design-synthesis`, `code-build`, `kb-concept`, `finding-analysis`, `claim-verify`, `migration-plan`, `merge` |
| **Opus** | `architect`, `define-intent`, `design-intent`, `adversary`, `review-judge`, `equivalence-break` |

Default to the **cheapest tier that a deterministic gate can verify**. The model does not have to be trusted; it has to be checkable.

## The two hard rules

These are enforced by the `floor` and `downgradable` fields in `TASK_KINDS`. They exist because a wrong call on a critical gate ships a defect that no later step catches.

### Rule A — the verifier outranks the generator on critical gates

On any critical gate, the tier that **judges** must be `>=` the tier that generated the artifact. A cheaper model may not be the final arbiter of a CRITICAL finding.

- All six critical kinds (`architect`, `define-intent`, `design-intent`, `adversary`, `review-judge`, `equivalence-break`) have `floor: 'opus'` and `downgradable: false` in TASK_KINDS.
- `G_REVIEW_BLOCK` blocks when surviving CRITICAL findings > 0. The model deciding whether a finding *survives* is the verifier, so it is Opus-tier.
- A generator may not review its own output as the gate's final judge.

### Rule B — downgrade only behind a gate

Under `--budget low`, `route()` calls `lowerOneTier(def.tier, def.floor)` only when `def.downgradable === true`. The three kinds that actually move:

| Kind | Std → Low | Gate that backstops it |
|---|---|---|
| `code-build` | Sonnet → Haiku | `G_BUILD` (manifest on disk + criteria-diff) |
| `kb-concept` | Sonnet → Haiku | `G_KB_COVERAGE` |
| `merge` | Sonnet → Haiku | deterministic merge assist |

Everything else: either already at its floor (e.g. all Haiku kinds — `spin route template-fill --budget low` still returns Haiku) or `downgradable: false` (e.g. `spec-authoring`, `finding-analysis`). If no gate guards a kind and it is not at its floor, `--budget low` leaves it unchanged.

**Critical kinds NEVER downgrade regardless of budget.** `spin route adversary --budget low` returns Opus.

## Concrete CLI examples

```bash
# Authoring the DEFINE spec — Sonnet, gated downstream by G_DEFINE.
spin route spec-authoring
# → { tier: "sonnet", model: "claude-sonnet-4-6", reason: "spec authoring needs judgment" }

# Per-file build on a tight budget — Sonnet drops to Haiku (G_BUILD backstops; Rule B).
spin route code-build --budget low
# → { tier: "haiku", model: "claude-haiku-4-5-20251001",
#     reason: "per-file build, G_BUILD backstops; downgraded under --budget low (floor=haiku)" }

# Same kind at standard budget — stays Sonnet.
spin route code-build
# → { tier: "sonnet", ... }

# The adversary that fires G_REVIEW_BLOCK — Opus, and stays Opus on low budget
# (Rule A: verifier >= generator; Rule B: downgradable=false on critical kinds).
spin route adversary --budget low
# → { tier: "opus", model: "claude-opus-4-8", reason: "adversarial challenger — must outrank generator" }

# A section scan feeding G_DESIGN's manifest check — Haiku. Already at its floor;
# --budget low leaves it unchanged.
spin route section-scan --budget low
# → { tier: "haiku", ... }

# Classification that pulls planning down from T2 to T1 because context is in hand.
spin tier --have-context --breadth many
# → { tier: "T1", reason: "context already held — re-derivation, not discovery..." }
```

## How this fits into the harness

See the **harness-protocol** skill for the full exit-code ABI (0/1/2/3) and the `spin next` → Task → `spin complete --handoff` → `spin gate` loop. Model routing is step 2 of that loop:

> **Step 2 — Task fan-out**: pick the model from the `model` hint on each ready artifact, or call `spin route <kind> [--budget low]` for `{tier, model, reason}`, then dispatch via the Task tool. Artifacts in the same `parallel_group` fan out in a single message.

The gate at step 5 is what licenses the Haiku/Sonnet choice at step 2 — the cheap tier is acceptable because the gate will catch it if it is wrong.

## Adding a new task-kind

1. Add an entry to `TASK_KINDS` in `src/core/model-route/policy.ts`. Pick the cheapest `tier` a gate or handoff schema can verify.
2. Set `floor` to the minimum acceptable tier. Set `downgradable: true` only if a named deterministic gate (like `G_BUILD`) verifiably backstops the output under `--budget low`.
3. If the kind is ever the final judge of a CRITICAL gate, it must be Opus and `downgradable: false` (Rule A).
4. Verify `spin route <newKind>` answers correctly, and that `G_ROUTER_COVERAGE` still sees a clean agent→routing bijection (no silent skips).
