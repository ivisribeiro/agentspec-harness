---
name: model-routing
description: Model-routing doctrine for the agentspec-harness — when to pick Haiku, Sonnet, or Opus for a task kind, the two hard rules that protect critical gates, and how to ask the CLI for the tier via `ahx route`. Use when a workflow command needs to choose the model for a worker subagent, when adding a new task-kind, or when a `--budget low` run wants to downgrade a tier safely.
---

# Model routing

`ahx` never calls a model. The slash commands do — and every worker they fan out
runs on a tier (Haiku / Sonnet / Opus). This skill is the doctrine for picking
that tier. The authoritative answer for any task kind comes from the CLI, not
from guessing:

```
ahx route <taskKind> [--budget std|low]
```

It returns `{ tier, model, reason }`. Prefer this over hardcoding a model name —
the routing table is owned by the deterministic core, and `ahx route` is what the
harness protocol calls in step 2 when a worker's model hint is absent.

## The tier table

Default to the **cheapest tier that VERIFIABLY does the task**. A tier is cheap
enough when a deterministic gate (or the handoff schema check inside
`ahx complete --handoff`) can catch a bad output — the model does not have to be
trusted, it has to be checkable.

| Tier | Use for | Task kinds (`ahx route <kind>`) |
|---|---|---|
| **Haiku** | Mechanical work fully backstopped by a gate or schema check | `file-read`, `structure-extract`, `frontmatter-parse`, `template-fill`, `format-convert`, `claim-extract`, `ship-prose`, `section-scan`, `router-assemble` |
| **Sonnet** | Analysis & authoring — real judgment, but not the final word on a CRITICAL gate | `spec-authoring`, `design-synthesis`, `code-build`, `kb-concept`, `finding-analysis`, `claim-verify`, `migration-plan`, `merge` |
| **Opus** | Deepest reasoning and anything adversarial / final-judge | `architect`, `define-intent`, `design-intent`, `adversary`, `review-judge`, `equivalence-break` |

## The two hard rules

These are non-negotiable. They exist because a wrong call on a CRITICAL gate
ships a defect that no later step catches.

### Rule A — the verifier outranks the generator on critical gates

On any CRITICAL gate, the tier that **judges** must be **>= the tier that
generated** the thing being judged. Never let a cheaper model be the final arbiter
of a CRITICAL finding.

- If Sonnet authored the spec (`spec-authoring`), the adversary that can BLOCK it
  runs on Opus (`adversary` / `review-judge`) — not Sonnet.
- `G_REVIEW_BLOCK` blocks when surviving CRITICAL findings > 0. The model deciding
  whether a finding *survives* is the verifier, so it is Opus-tier.
- A generator may never review its own output as the gate's final judge.

### Rule B — downgrade only behind a gate

Under `--budget low` you may drop a tier **only where a deterministic gate
backstops the output**. The gate, not the model, is what guarantees correctness;
the cheaper model just has to be checkable.

- `ahx route code-build --budget low` drops Sonnet → Haiku because `G_BUILD`
  re-checks every manifest file on disk and the criteria-diff; the cheaper model
  only has to be checkable. The same gate-backstopped Sonnet → Haiku drop applies
  to `kb-concept` (backstopped by `G_KB_COVERAGE`) and `merge`. These are the only
  kinds that actually move under `--budget low`.
- A kind already at its floor does NOT drop — there is no cheaper tier to fall to.
  `template-fill` is natively Haiku (its floor), so `ahx route template-fill
  --budget low` still returns Haiku; the budget flag changes nothing.
- The **critical kinds NEVER downgrade**, regardless of budget:
  `architect`, `define-intent`, `design-intent`, `adversary`, `review-judge`,
  `equivalence-break`. `ahx route adversary --budget low` still returns Opus.

If no gate guards a kind (or it is already at its floor), `--budget low` leaves
its tier unchanged.

## Concrete examples

Ask the CLI; branch on what it returns.

```bash
# Authoring the DEFINE spec — Sonnet, gated downstream by G_DEFINE.
ahx route spec-authoring
# -> { tier: "sonnet", model: "...", reason: "analysis/authoring" }

# Per-file build under a tight budget — Sonnet DROPS to Haiku, because G_BUILD
# re-checks every manifest file on disk + the criteria-diff (Rule B in action).
ahx route code-build --budget low
# -> { tier: "haiku", ... }   # downgraded sonnet -> haiku (floor=haiku, G_BUILD backstops)

# Same build kind at the standard budget — stays Sonnet.
ahx route code-build
# -> { tier: "sonnet", ... }

# The adversary that can fire G_REVIEW_BLOCK — Opus, and stays Opus on low budget
# (Rule A: verifier >= generator on a CRITICAL gate; Rule B: critical never downgrades).
ahx route adversary --budget low
# -> { tier: "opus", ... }   # NOT downgraded

# A structure scan that feeds G_DESIGN's manifest check — Haiku is safe because
# the gate re-validates the table deterministically. Already at its Haiku floor,
# so --budget low leaves it unchanged (nothing cheaper to drop to).
ahx route section-scan --budget low
# -> { tier: "haiku", ... }

# Final design intent — Opus, never downgraded.
ahx route design-intent --budget low
# -> { tier: "opus", ... }
```

### How this slots into the harness protocol

When a workflow command processes a ready artifact:

1. `ahx next` reports the ready artifact(s) and a `model` hint.
2. If you need the tier explicitly (or are overriding for budget), call
   `ahx route <kind> [--budget low]` and dispatch the worker via Task on that
   model. Artifacts in the same `parallel_group` fan out in one message.
3. The worker writes its markdown artifact **and** a JSON handoff sidecar.
4. `ahx complete <id> --handoff <sidecar>` validates the handoff (`G_HANDOFF`).
   Exit 1 → re-dispatch, bounded by `ahx retry <id> --inc` (stop at `--ok`).
5. Run the phase gate — `G_DEFINE`, `G_DESIGN`, `G_BUILD`, `G_SHIP`,
   `G_REVIEW_BLOCK`, etc. Exit 1 → STOP and surface `{reasons, unmet}`.

The gate at step 5 is precisely what licenses a Haiku/Sonnet choice at step 2:
the cheap tier is only acceptable because the gate will catch it if it is wrong.

## Adding a new task-kind

1. Decide its tier by the table above — cheapest tier a gate or handoff schema can
   verify.
2. If it can ever be the **final judge** of a CRITICAL gate, it is Opus and must
   honor Rule A.
3. If `--budget low` should downgrade it, confirm a deterministic gate backstops
   it (Rule B); otherwise leave it pinned.
4. Wire it into the routing table so `ahx route <kind>` answers, and ensure
   `G_ROUTER_COVERAGE` still sees a clean agent→routing bijection (no silent
   skips).

> Adapted from the ECC model-selection doctrine (Haiku ≈ 90% of Sonnet at lower
> cost for high-frequency mechanical work; Sonnet for core authoring/analysis;
> Opus for deepest reasoning and adversarial review). The harness makes it
> enforceable by binding the cheap tiers to deterministic gates.
