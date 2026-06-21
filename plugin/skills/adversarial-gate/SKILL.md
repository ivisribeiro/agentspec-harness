---
name: adversarial-gate
description: Adversarial verification pattern — dispatch N independent critics that try to REFUTE an artifact (anti-anchoring, no shared context), aggregate their findings into one `finding` handoff, then `spin gate G_REVIEW_BLOCK` blocks on any surviving CRITICAL under a hard round cap. Use when a CRITICAL artifact (spec, design, code, claim) must survive challenge before it advances, not just pass a single self-review.
---

# Adversarial gate

A single reviewer rubber-stamps. This pattern instead runs **independent critics
whose job is to break the artifact**, then lets the deterministic gate
(`G_REVIEW_BLOCK`) decide. The CLI is the judge of record; the critics only
produce typed evidence.

The `adversary` task-kind IS the implementation here — it is an OPUS-tier critic
(`spin route adversary`) and, per the routing doctrine, **never downgrades** (the
verifier outranks-or-equals the generator on a CRITICAL gate). `G_REVIEW_BLOCK`
is the gate: surviving CRITICAL findings > 0 ⇒ BLOCK.

## Five rules (do not relax)

1. **Independence (anti-anchoring).** Each critic is a separate Task dispatch
   that sees ONLY the artifact under test — never the generator's rationale,
   never another critic's findings, never a prior round's verdict. Shared
   context = correlated blind spots = a missed CRITICAL.
2. **Try-to-refute framing.** Each critic's standing instruction is "find the
   CRITICAL flaw that makes this wrong," not "review this." Reward refutation,
   not agreement.
3. **Typed verdict.** Every critic emits typed `finding` items
   (`{ file, severity, rule, message, source }`, severity ∈
   `critical|high|medium|low`). No prose-only verdicts — the gate reads the typed
   findings, not your summary.
4. **Severity rule, gate-owned.** You do NOT decide pass/block yourself. You
   aggregate every critic's items into ONE `finding` handoff and hand it to
   `spin gate G_REVIEW_BLOCK`, then branch on its exit code. The gate owns the
   verdict: any surviving CRITICAL finding ⇒ BLOCK.
5. **Hard cap on rounds.** Refute → fix → re-challenge is bounded by
   `spin retry <id>`; stop at the `--ok` ceiling. No infinite adversarial loops.

## Procedure

### 1. Confirm the target is ready and route the critic tier

```bash
spin next                 # the artifact under challenge must be in ready[]
spin route adversary      # -> OPUS tier; the critic model. NEVER downgrade this.
```

### 2. Fan out N independent critics in ONE message (true parallel)

Dispatch the critics as parallel Task calls in a **single** message so they run
concurrently and cannot see each other. Give each the SAME artifact and the SAME
try-to-refute brief; give them NOTHING else (no generator notes, no sibling
output). An odd N (3 is the default) widens coverage — any one critic landing a
CRITICAL is enough to BLOCK; the gate does not need a quorum.

Each critic worker MUST:
- attempt to refute the artifact, focusing on CRITICAL defects;
- write its result as a `finding` JSON sidecar to
  `.spindle/features/<feature>/.handoffs/<criticId>.json`, shaped
  `{ "findings": [ … ] }` where each item is
  `{ file, severity, rule, message, source }` (`line` optional) and `severity ∈
  critical | high | medium | low`. A critic that finds the CRITICAL flaw emits an
  item with `severity: "critical"`; "clean" = an empty `findings` array.

### 3. Validate each critic's handoff (typed, not trusted)

Before aggregating, prove each critic's sidecar is a structurally valid `finding`
— never trust prose:

```bash
spin handoff-check finding .spindle/features/<feature>/.handoffs/<criticId>.json
```

Exit `1` ⇒ that sidecar is malformed (not a valid `finding`): re-dispatch that
ONE critic, bounded by the retry counter below. A critic that can't produce a
typed verdict does not get to vote.

### 4. Aggregate into ONE findings file, then run the gate

`G_REVIEW_BLOCK` reads a SINGLE JSON file shaped `{ "findings": [ … ] }`, not a
directory of per-critic sidecars. Concatenate every valid critic's `findings[]`
items into one aggregated file, then point the gate at that file:

```bash
# Merge all critics' findings[] arrays into one finding handoff.
jq -s '{ findings: map(.findings) | add }' \
  .spindle/features/<feature>/.handoffs/critic-*.json \
  > .spindle/features/<feature>/.handoffs/findings.json

spin gate G_REVIEW_BLOCK --findings .spindle/features/<feature>/.handoffs/findings.json
```

Branch strictly on the exit code:

- **exit 0** — no surviving CRITICAL findings. The artifact passed the
  adversarial challenge. Proceed.
- **exit 1** — BLOCK. The gate returns `{ gate, passed:false, reasons, unmet }`.
  Surface `reasons`/`unmet` verbatim and go to the bounded refute loop.

### 5. Bounded refute → fix → re-challenge loop

Each time the gate BLOCKs and the generator fixes the artifact, count the round
and re-challenge with a FRESH, independent panel (step 2). The cap powers the
loop:

```bash
spin retry <id> --inc     # one charge per re-challenge round
spin retry <id> --ok      # exit 1 == ceiling hit (config.build_retry_cap)
```

When `--ok` exits `1`, STOP. Do not advance and do not re-run the panel. Report
the surviving CRITICAL `reasons`/`unmet` and the exhausted round count, and hand
the decision back to the human. A blocked-at-ceiling artifact never silently
proceeds.

## The omission checklist (hunt what's MISSING, not just defects in what's there)

A critic that only refutes what is *written* misses the most expensive class of
flaw: the task or test that should exist and does not. The adversary's strongest
real contribution on a live plan was five **omitted** tasks — found only by asking
"what breaks under repetition / concurrency / redeploy?". So every critic, in
addition to refuting the artifact, MUST answer this fixed checklist for each claim
the artifact marks "done", "resolved", or "safe":

- **Regression** — is there a test that PINS this fix? A bug fixed without a test
  reopens on the next refactor. (Emit a `finding` if the fix has no regression test.)
- **Idempotency** — does it stay correct across N repeated runs? (Schedulers,
  retries, replays. A "full reload" that appends instead of replacing silently
  corrupts data across cron runs.)
- **Concurrency** — is it safe under concurrent execution? (A path that was
  "flaky" once is a concurrency bug that a single retry hid.)
- **Redeploy / restart** — does it survive a process restart or container
  recreate? (Connection leaks, in-memory state, orphaned resources.)
- **Inert-by-config** — is the capability actually ENFORCED in prod, or merely
  coded? (A flag whose code default is unsafe and whose prod override was never
  verified is a live hole no static review catches.)

Unanswered items become `finding`s (or, in an audit context, `proposedTasks`).
Track the invariants explicitly — isolation, idempotency, concurrency-safety —
so "acknowledged in a comment but no test asserts it" becomes a typed, plannable
item rather than buried prose.

## Anti-patterns

- **Shared-context critics** — reusing one chat or piping critic A's output into
  critic B. That destroys independence (rule 1); always separate Task dispatches
  seeing only the artifact.
- **You decide the verdict** — eyeballing the findings and declaring the artifact
  "fine." The surviving-CRITICAL verdict is `spin gate G_REVIEW_BLOCK`'s job;
  aggregate the findings, run the gate, and branch on its exit code only.
- **Directory as `--findings`** — pointing the gate at the `.handoffs/` folder
  instead of one aggregated `findings.json`. The gate `JSON.parse`s a single
  file; a directory path throws and always BLOCKs. Aggregate first (step 4).
- **Cheaper final judge** — routing the critic below `spin route adversary` to
  save budget. Critical kinds never downgrade; the verifier must outrank-or-equal
  the generator on a CRITICAL gate.
- **Unbounded re-challenge** — looping fix→re-review without `spin retry --inc` /
  `--ok`. The round cap is mandatory.
- **Prose verdicts** — accepting a critic's "looks good" without a typed
  `finding` sidecar. No `finding` JSON that passes `spin handoff-check finding`,
  no vote.
