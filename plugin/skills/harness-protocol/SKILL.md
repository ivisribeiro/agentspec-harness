---
name: harness-protocol
description: The canonical ahx-call protocol every workflow command obeys — ahx next → Task fan-out → ahx complete --handoff → ahx gate, branching strictly on exit codes. Read this when authoring or debugging any agentspec-harness command, or whenever you need to understand how the deterministic ahx CLI orchestrates LLM workers without ever calling a model itself.
---

# Harness protocol

This is the contract every workflow command in `agentspec-harness` obeys. It defines
how a slash command (the only place a model runs) talks to `ahx` (the deterministic
state machine), fans out worker subagents, and branches on exit codes.

## The one invariant — `ahx` NEVER calls a model

`ahx` is a pure deterministic CLI: it orders artifacts, validates handoffs, runs
gates, counts retries, and routes task-kinds to model tiers. It returns data and an
exit code. **It never performs inference.**

The SLASH COMMAND is the only place a model runs. The command:

- calls `ahx` for **every** ordering / validation / gate / state / routing decision,
- branches **strictly on the exit code** it gets back,
- and fans out worker subagents via the **Task** tool to do the actual authoring.

Never tell Claude to "run the agents from node" or hit an inference endpoint from the
CLI. That is the **fake-dispatch anti-pattern**. Dispatch happens only through Task.

Invoke the CLI with:

```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js <args>
```

Documented shorthand throughout the harness docs: `ahx <args>`.

## Exit-code ABI — branch on this, nothing else

| Exit | Meaning | Command must… |
|------|---------|---------------|
| `0`  | pass | proceed to the next step |
| `1`  | gate blocked / handoff invalid | STOP or re-dispatch; surface `{reasons, unmet}` |
| `2`  | usage error | fix the invocation; do not retry blindly |
| `3`  | internal error | abort; this is not a "try again" condition |

Never parse prose to decide flow. The exit code is the ABI.

## The protocol (the whole mechanism)

```
                         ┌──────────────────────────────────────────────┐
                         │  SLASH COMMAND  (the only place a model runs)  │
                         └──────────────────────────────────────────────┘
                                            │
                  ┌─────────────────────────┼──────────────────────────────┐
                  ▼                          ▼                              ▼
          (1) ahx next            (2) Task fan-out            (3) worker writes
       ready:[{id,model,            one Task per ready          ARTIFACT.md
       parallel_group}]             artifact; same                +  .handoffs/<id>.json
       blocked:{} complete:bool     parallel_group =>           (markdown + JSON sidecar)
                  │                  ONE message (parallel)            │
                  │                          │                        │
                  │                          ▼                        │
                  │            (model hint from ahx next, or          │
                  │             ahx route <kind> --budget …)          │
                  │                          │                        │
                  └──────────────┬───────────┴────────────────────────┘
                                 ▼
                   (4) ahx complete <id> --handoff <sidecar>
                                 │
                 ┌───────────────┴────────────────┐
            exit 1 (invalid handoff)          exit 0 (recorded)
                 │                                  │
        ahx retry <id> --inc                        ▼
        re-dispatch worker            (5) ahx gate <gateId>   (phase boundary)
        ahx retry <id> --ok                         │
        exit 1 at ceiling → STOP        ┌────────────┴────────────┐
                                   exit 0 pass               exit 1 BLOCK
                                   advance to next        {gate,passed,
                                   phase                   reasons,unmet}
                                                           → STOP, surface,
                                                             do NOT advance
```

### Step by step

1. **`ahx next`** — learn the ready artifact(s) and each one's model hint.
   Returns `{ ready:[{id, model, parallel_group}], blocked:{}, complete:bool }`.
   If `complete:true`, the schema is done; if `ready` is empty but `complete:false`,
   something is `blocked` — surface it, do not invent work.

2. **Task fan-out** — for each ready artifact, pick the model from its `model` hint
   (or call `ahx route <taskKind> [--budget std|low]` for `{tier, model, reason}`),
   then dispatch a worker via the **Task** tool on that model. Artifacts/files sharing
   the same `parallel_group` fan out in a **SINGLE message** for true parallelism.

3. **Worker writes two things** — its markdown artifact (`.ahx/features/<feature>/<ARTIFACT>.md`)
   AND a JSON handoff **sidecar** (`.ahx/features/<feature>/.handoffs/<id>.json`)
   matching one of the handoff schema ids. The sidecar is machine-checkable; the
   markdown is for humans and downstream phases.

4. **`ahx complete <id> --handoff <sidecar>`** — validates the sidecar against the
   artifact's handoff schema (this is `G_HANDOFF`, enforced inside `complete`), THEN
   marks complete in `run.json`.
   - **exit 1** → the handoff is invalid. Bump the bounded loop with
     `ahx retry <id> --inc`, re-dispatch the worker, and stop when
     `ahx retry <id> --ok` exits 1 at the `config.build_retry_cap` ceiling.
   - **NEVER** mark an artifact complete by hand. Only `ahx complete` writes the ledger.

5. **`ahx gate <gateId>`** — run the phase's gate at the boundary.
   - **exit 0** → proceed to the next phase.
   - **exit 1** → STOP. Surface `{gate, passed, reasons, unmet}` verbatim. Do **not** advance.

Deterministic decisions live in `ahx`. Authoring lives in workers. Control flow is
nothing but branching on exit codes.

## Sidecar handoff vs human markdown

Every worker produces **both**, and they serve different masters:

- **JSON handoff sidecar** (`.handoffs/<id>.json`) — the machine contract. It must
  match one of the handoff schema ids: `define`, `design`, `build-task`,
  `build-report`, `finding`, `claim`, `migration-plan`, `claudemd-section`,
  `kb-concept`. This is what `ahx complete --handoff` (and standalone
  `ahx handoff-check <schemaId> <file.json>`) validate. If it doesn't conform, the
  artifact does not advance.
- **Human markdown artifact** (`<ARTIFACT>.md`) — the readable deliverable consumed
  by downstream phases and people. `ahx validate <id|path>` does structural checks on
  it (md sections / manifest table / criteria IDs).

The sidecar is the gate-bearing surface; the markdown is the payload. A worker that
writes only one of the two has not finished.

## Gate ids (phase boundaries)

Run with `ahx gate <gateId>`:

| Gate | Boundary | Blocks when |
|------|----------|-------------|
| `G_DEFINE` | before `/design` | DEFINE sections / `AC-n` ids / define handoff invalid |
| `G_DESIGN` | before `/build` | manifest table / design handoff invalid |
| `G_BUILD` | before `/ship` | a manifest file is missing on disk, criteria-diff non-empty, or no BUILD_REPORT |
| `G_SHIP` | ship | `define.criteria` minus `build.passed` is non-empty |
| `G_KB_STRUCTURE`, `G_KB_COVERAGE` | KB schema | structure / coverage shortfalls |
| `G_ROUTER_COVERAGE` | router | agent→routing not a bijection (silent skips) |
| `G_REVIEW_BLOCK` | `/review`, `/migrate` | surviving CRITICAL findings > 0 |
| `G_HANDOFF` | inside `ahx complete --handoff` | handoff sidecar fails its schema |

`G_BUILD` is the deterministic replacement for the old prose "max 3 retries +
checkbox" — the manifest-on-disk + empty criteria-diff + BUILD_REPORT checks are now
machine-enforced, not narrated.

## Worked example — one DEFINE→DESIGN boundary

A `/define` command driving the SDD schema, end to end:

```bash
# (1) what is ready?
ahx next
# -> { "ready":[{"id":"DEFINE","model":"opus","parallel_group":null}],
#      "blocked":{}, "complete":false }
```

```bash
# (2) confirm the tier for the authoring kind (intent work never downgrades)
ahx route define-intent
# -> { "tier":"OPUS", "model":"opus", "reason":"*-intent kinds never downgrade" }
```

```text
(2/3) Dispatch ONE worker via the Task tool on opus. The worker:
      - writes  .ahx/features/<feature>/DEFINE.md
      - writes  .ahx/features/<feature>/.handoffs/DEFINE.json   (schema id: define)
```

```bash
# (4) validate the sidecar, then record completion (never by hand)
ahx complete DEFINE --handoff .ahx/features/<feature>/.handoffs/DEFINE.json
echo $?        # 0 => recorded in run.json
```

If that `ahx complete` had exited `1` (invalid handoff), the bounded loop runs:

```bash
ahx retry DEFINE --inc        # bump the counter
# ...re-dispatch the worker via Task, regenerate the sidecar...
ahx complete DEFINE --handoff .ahx/features/<feature>/.handoffs/DEFINE.json
ahx retry DEFINE --ok         # exit 1 here means we hit config.build_retry_cap -> STOP
```

```bash
# (5) run the phase gate before advancing to /design
ahx gate G_DEFINE
# exit 0 -> proceed.   exit 1 -> STOP and surface, e.g.:
#   { "gate":"G_DEFINE", "passed":false,
#     "reasons":["missing AC-3 acceptance id"], "unmet":["AC-3"] }
```

```bash
# loop back: ask what is ready next (now DESIGN, gated by G_DESIGN before /build)
ahx next
```

That single boundary — `ahx next` → Task → `ahx complete --handoff` → `ahx gate` —
is the entire harness. Every workflow command (`/define`, `/design`, `/build`,
`/ship`, `/review`, `/migrate`, KB and router flows) is the same loop with a
different artifact, handoff schema id, and gate id.

## Checklist for any command author

- [ ] Drives ordering only through `ahx next` / `ahx order` — never hardcodes sequence.
- [ ] Dispatches authoring exclusively via the **Task** tool (no model calls from node).
- [ ] Reads the model from `ahx next` hints or `ahx route <kind>` — never guesses tiers.
- [ ] Same `parallel_group` ⇒ a single fan-out message.
- [ ] Workers emit BOTH the markdown artifact and the JSON handoff sidecar.
- [ ] Completion only via `ahx complete <id> --handoff <sidecar>` (exit 1 ⇒ retry loop).
- [ ] Retry loop bounded by `ahx retry <id> --inc` / `--ok` against `build_retry_cap`.
- [ ] Branches strictly on exit codes (0/1/2/3); surfaces `{reasons, unmet}` on a blocked gate.
- [ ] Runs the correct `ahx gate <gateId>` at every phase boundary and stops on exit 1.
