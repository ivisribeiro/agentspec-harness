# spindle-updates — quick reference

The changes shipped this session, at a glance.

## Commands added
| Command | Does |
|---|---|
| `spin tier [--risk\|--breadth\|--have-context\|--mechanical\|--reversible]` | classify a task into orchestration tier T0/T1/T2 |
| `spin reconcile --audit f.json` | doc-vs-code drift over an audit handoff (exit 1 on drift) |
| `spin config-drift --declared a,b --present a` | tool in CI but absent from the lockfile |
| `spin status` | alias of `spin state` (dogfood F1 — agents reach for `status` first) |
| `spin explain <gateId>` | what a gate reads, what blocks it, which flags apply — no source-diving (F2) |
| `spin schema show <handoff-id>` | describe a handoff's JSON shape (Zod introspection) so the sidecar is authorable without source (F2) |
| `spin spec-drift --build f.json` | acceptance criteria the build CORRECTED vs DEFINE (`corrected_spec`) — a false spec can't ride a green build (F6) |

## Dogfood loop #2 (pix-brcode greenfield)
A second self-driven SDD run (define→design→build→ship on a real PIX BR Code lib)
proved the harness holds end-to-end (4 honest gates, lib correct vs the real
standard) and surfaced the **AC-content gap**: G_DEFINE passed a factually wrong
acceptance criterion (a bad CRC value); the build caught it (executable AC) but
left DEFINE stale while gates still said "AC met". Fixes: I-A `status` alias,
I-B `explain` + `schema show <id>` (F2 — agents had read source every phase),
I-C `corrected_spec` + `spin spec-drift` + G_SHIP drift warning (F6).

## Gates added
| Gate | Blocks when |
|---|---|
| `G_AUDIT` | empty audit / built item without evidence / gap without priority |
| `G_OPS_CONFIG` | an `opsReadiness` flag is coded but `enforced: false` in prod |
| `G_PLAN` | vague-acceptance task / L-XL multi-domain bundle / orphan blocking gap |

## Schemas / handoffs added
- `brownfield` schema: `audit → define → design`.
- `audit` handoff: structured `built`/`gaps`/`opsReadiness`/`proposedTasks`/`invariants_at_risk`.
- `/audit` command: parallel fan-out by domain.

## The orchestration tiers (cost discipline)
- **T0** main loop · **T1** one agent / held-context draft · **T2** fan-out + selective adversary.
- Rule: fan-out is for discovery, not re-deriving what you already hold.

## Numbers
93 → 189 → **213 tests** · 11 gates · 4 drift/introspection commands added across two dogfood loops · all green.
