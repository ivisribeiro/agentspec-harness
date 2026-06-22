---
name: bounded-loop
description: Bound a build/retry loop with a deterministic counter that lives in the CLI ledger, not in prose. Use whenever a worker handoff fails `spin complete` and you need to re-dispatch, or whenever you would otherwise write "retry up to N times" into a command. The ceiling is `config.build_retry_cap` read by `retryHandler` in src/commands/handlers.ts; the counter is `incRetry`/`getRetry` in src/core/run/run-state.ts writing `retries{}` in run.json.
---

# Bounded loop

The mechanism backing this skill is **`retryHandler`** in
`src/commands/handlers.ts`, which reads the retry ceiling from
`graph.getSchema().config?.build_retry_cap ?? 3` and delegates the actual
counter to **`incRetry`** and **`getRetry`** in
`src/core/run/run-state.ts`. Both write `state.retries[id]` into
`run.json` via an atomic rename. The CLI enforces the ceiling; the model
never counts in its own head.

For the exit-code ABI (0 pass · 1 blocked · 2 usage error · 3 internal),
the full `spin next → Task → spin complete → spin gate` protocol, and the
fake-dispatch anti-pattern, see the **harness-protocol** skill. This skill
covers only the bounded-loop mechanics.

## What makes a loop bounded

A loop is bounded when:

1. The counter lives in `run.json` under `retries{<id>}` (written by `incRetry`).
2. The ceiling is `config.build_retry_cap` from the active schema (read by
   `retryHandler` at every `--inc` and `--ok` call).
3. The command branches **strictly on the exit code** of `spin retry` — it
   does not count in prose, in memory, or in a shell variable.

"Retry up to 3 times" written anywhere in a command is not a bound. It is a
suggestion the model can ignore. The only bound is `spin retry <id> --ok`
returning exit `1` when `getRetry(root, id) >= cap`.

## The two sub-commands and what they do

```
spin retry <id> --ok
```

**Read gate.** Calls `getRetry` to fetch the current count and compares it
against the cap. Exits `1` when `count >= cap` (ceiling hit); exits `0`
while budget remains. Call this **before** `--inc` to check whether the
attempt you are about to start is still within budget.

```
spin retry <id> --inc
```

**Write.** Calls `incRetry`, which increments `state.retries[id]`, appends a
`{kind:'retry', id, attempt}` event to the ledger, and atomically writes
`run.json`. Returns the new count. Exits `1` if the count after increment
exceeds the cap (exceeded); exits `0` otherwise.

The separation matters: `--ok` tells you whether to loop again; `--inc`
records that you are looping. Never skip `--ok` or you will start an attempt
that the ceiling has already disallowed.

## The loop for one artifact

```text
loop:
  # Dispatch a fresh worker via the Task tool on the routed model.
  # The worker writes the markdown artifact AND its JSON handoff sidecar.

  spin complete <id> --handoff <sidecar>
  if exit 0:  break          # handoff valid — artifact done, leave the loop

  # exit 1 -> G_HANDOFF blocked. Gate the next attempt first:
  spin retry <id> --ok
  if exit 1:  STOP           # ceiling hit -> surface artifact id + retries{} + cap -> halt

  spin retry <id> --inc      # record the attempt in run.json
  goto loop                  # re-dispatch a fresh Task worker
```

The `--ok` check precedes `--inc` so the attempt that would breach the
ceiling is never dispatched. On ceiling hit, surface the artifact id, the
`retries{}` count, and `config.build_retry_cap` from `spin state`, then
halt. Do not run `spin gate G_BUILD` as though it passed.

## Inspecting the counter

```bash
spin state
```

`run.json` contains `retries{<id>}` (the live attempt count) and `events[]`
(the full retry trajectory with timestamps). These are the source of truth.
Never assert "we have retried N times" from memory — read `spin state`.

## Where the loop sits in the phase flow

The bounded loop produces per-artifact handoffs. `G_BUILD` (run at the
DEFINE→SHIP boundary; exits `1` if any manifest file is missing on disk,
criteria-diff is non-empty, or no BUILD_REPORT exists) is the phase-level
deterministic check that supersedes prose "max 3 retries + checkbox". The
loop guarantees forward progress on each artifact; `G_BUILD` guarantees the
result set is complete.

```bash
spin gate G_BUILD     # exit 0 -> proceed to /ship; exit 1 -> STOP, surface {reasons,unmet}
```

## Checklist before shipping a command that loops

- [ ] Workers are dispatched via the **Task** tool, not via any inference endpoint.
- [ ] `spin retry <id> --ok` (read) is called **before** `spin retry <id> --inc` (write).
- [ ] The retry ceiling is nowhere in prose; it comes from `config.build_retry_cap`.
- [ ] Completion is only via `spin complete <id> --handoff <sidecar>`; no hand-editing of `run.json`.
- [ ] On ceiling hit, control flow halts and surfaces the artifact id + `retries{}` from `spin state`; `G_BUILD` is not advanced.
