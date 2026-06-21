# agentspec-harness

**AgentSpec made harness-native** — a Claude Code plugin that turns the AgentSpec SDD cycle (Brainstorm → Define → Design → Build → Ship) into a deterministic, gate-backed workflow where `ahx` is the spine and Claude is the worker.

---

## The hard-seam doctrine

```
ahx  ─── deterministic spine ───  never calls a model
                │
          exit code (0/1/2/3)
                │
     slash commands branch here
                │
         Claude (worker agents)
         spawned via Task tool
```

`ahx` is a pure state machine: it reads `.ahx/run.json`, applies Kahn ordering, validates handoffs against JSON schemas, enforces gates, and exits with a code. It never touches an inference endpoint. The slash commands (`/brainstorm`, `/define`, `/design`, `/build`, `/ship`, `/review`, `/migrate`) are the only place a model runs — they call `ahx` for every ordering, validation, and gate decision, then branch strictly on the exit code.

**Fake-dispatch anti-pattern (never do this):** dispatching a model from Node, calling `ahx` to "help" an LLM decide, or advancing state without `ahx complete --handoff`. Every gate is an exit code. Every state change is written by `ahx`, not by Claude.

---

## Install

### Option A — Claude Code plugin (canonical)

```bash
# in your project or globally
claude plugin add agentspec-harness
```

The plugin wires the slash commands and ships the prebuilt `dist/cli/index.js` binary. All slash commands invoke the CLI as:

```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js <args>
```

The documented shorthand throughout this README is `ahx <args>`.

### Option B — npx fallback (no plugin install)

```bash
npx agentspec-harness <args>
```

Same binary, no plugin wiring — useful for CI or one-off validation.

### Option C — prebuilt dist (embed in your repo)

Copy `dist/` into your project and invoke `node dist/cli/index.js` directly. Pin the version in your lockfile.

---

## Command surface

| Command | What it does | Exit codes |
|---|---|---|
| `ahx init --schema <sdd\|kb> --feature <slug>` | Scaffold `.ahx/`, copy editable schema to `.ahx/schema.yaml`, create `run.json` | 0 / 2 |
| `ahx next` | Returns `{ ready:[{id,model,parallel_group}], blocked:{}, complete:bool }` — the ready artifact queue | 0 |
| `ahx order` | Full Kahn build order for the active schema | 0 |
| `ahx state` | Print the `run.json` ledger (`completed[]`, `retries{}`, `gates{}`) | 0 |
| `ahx complete <id> [--handoff f.json]` | Validate the worker handoff against the artifact's schema, then mark complete. **exit 1 if invalid** | 0 / 1 |
| `ahx validate <id\|path>` | Structural checks (MD sections / manifest table / criteria IDs) | 0 / 1 |
| `ahx gate <gateId> [--agents d] [--routing f] [--findings f]` | Run a named gate. exit 0 = pass, exit 1 = BLOCK with `{gate,passed,reasons,unmet}` | 0 / 1 |
| `ahx diff-criteria --define f --build f` | Set-diff DEFINE criteria vs BUILD passed → `unmet[]` | 0 / 1 |
| `ahx handoff-check <schemaId> <file.json>` | Standalone handoff validation | 0 / 1 |
| `ahx retry <id> --inc \| --ok` | Retry counter vs `config.build_retry_cap`. `--ok` exits 1 at ceiling | 0 / 1 |
| `ahx route <taskKind> [--budget std\|low]` | Returns `{ tier, model, reason }` for a task kind | 0 |
| `ahx schema show\|validate` | Inspect or validate the active editable schema | 0 / 1 |

**Exit-code ABI:** `0` = pass · `1` = gate blocked / handoff invalid · `2` = usage error · `3` = internal error

---

## Gates

Gates are run via `ahx gate <id>`. A command that receives exit 1 surfaces `{gate, passed, reasons, unmet}` and stops — it does not advance the phase.

| Gate ID | Fires before | Checks |
|---|---|---|
| `G_DEFINE` | `/design` | DEFINE sections present, AC-n IDs valid, define handoff valid |
| `G_DESIGN` | `/build` | Manifest table present, design handoff valid |
| `G_BUILD` | `/ship` | Every manifest file exists on disk, `diff-criteria` empty, BUILD_REPORT present |
| `G_SHIP` | publish | DEFINE criteria minus build.passed must be empty |
| `G_KB_STRUCTURE` | KB publish | KB structure checks |
| `G_KB_COVERAGE` | KB publish | KB coverage checks |
| `G_ROUTER_COVERAGE` | router validate | Agent→routing bijection, no silent skips |
| `G_REVIEW_BLOCK` | `/review` · `/migrate` ship | Surviving CRITICAL findings > 0 → block |
| `G_HANDOFF` | (enforced inside `ahx complete --handoff`) | Handoff JSON matches declared schema |

---

## Handoff schema IDs

Workers write a JSON sidecar matching one of these schema IDs; the slash command passes it to `ahx complete --handoff <sidecar>`.

`define` · `design` · `build-task` · `build-report` · `finding` · `claim` · `migration-plan` · `claudemd-section` · `kb-concept`

---

## Model routing

`ahx route <taskKind>` returns the right tier. Commands use this to pick which model to dispatch each worker on.

| Tier | Task kinds |
|---|---|
| **HAIKU** (mechanical, gate-backstopped) | `file-read` · `structure-extract` · `frontmatter-parse` · `template-fill` · `format-convert` · `claim-extract` · `ship-prose` · `section-scan` · `router-assemble` |
| **SONNET** (analysis / authoring) | `spec-authoring` · `design-synthesis` · `code-build` · `kb-concept` · `finding-analysis` · `claim-verify` · `migration-plan` · `merge` |
| **OPUS** (deepest + adversarial) | `architect` · `define-intent` · `design-intent` · `adversary` · `review-judge` · `equivalence-break` |

**Doctrine:** default to the cheapest tier that verifiably does the task. Two hard rules: (a) the verifier/adversary outranks-or-equals the generator on any CRITICAL gate — never let a cheaper tier be the final judge; (b) downgrade a tier under `--budget low` only where a deterministic gate backstops the output. Critical kinds (`adversary`, `architect`, `review-judge`, `*-intent`) never downgrade.

---

## Quickstart — the SDD cycle

### 1. Initialise

```bash
ahx init --schema sdd --feature payments-reconciliation
```

Creates `.ahx/`, `.ahx/run.json`, `.ahx/schema.yaml` (your editable copy), and `.ahx/features/payments-reconciliation/`.

### 2. Brainstorm

Run `/brainstorm`. The command calls `ahx next` to get the ready artifact, dispatches a SONNET worker via Task, the worker writes `BRAINSTORM.md` + a `define` handoff sidecar, then:

```bash
ahx complete BRAINSTORM --handoff .ahx/features/payments-reconciliation/.handoffs/brainstorm.json
```

### 3. Define

Run `/define`. Before finishing, the command runs:

```bash
ahx gate G_DEFINE
```

Exit 1 → surface `{reasons, unmet}` and stop. Exit 0 → proceed.

### 4. Design

Run `/design`. Gate fires:

```bash
ahx gate G_DESIGN
```

### 5. Build

Run `/build`. The command loops over `ahx next`, fanning out independent artifacts in the same `parallel_group` in a single Task dispatch. Each worker writes its artifact + a `build-task` handoff. For each:

```bash
ahx complete <id> --handoff .ahx/features/<feature>/.handoffs/<id>.json
# exit 1 → ahx retry <id> --inc  (bounded by build_retry_cap)
# at ceiling → ahx retry <id> --ok  exits 1, command surfaces the block
```

When all artifacts complete, `ahx gate G_BUILD` must pass before `/ship` is allowed.

### 6. Ship

Run `/ship`. Gate fires:

```bash
ahx gate G_SHIP
```

Exit 0 → the command assembles the SHIP doc and marks the feature complete.

---

## Harness protocol (the full mechanism)

Every workflow command follows these five steps — this is the whole mechanism:

```
1. ahx next               → ready artifacts + model hints
2. ahx route <kind>       → tier/model for each artifact
3. Task (worker)          → writes artifact + handoff sidecar
4. ahx complete <id> --handoff <sidecar>
      exit 1 → ahx retry <id> --inc / --ok (bounded)
5. ahx gate <gateId>
      exit 1 → STOP, surface {reasons, unmet}
      exit 0 → advance
```

Deterministic decisions live in `ahx`. Authoring lives in workers. Control flow branches on exit codes.

---

## On-disk layout

```
.ahx/
├── run.json                              # ledger (CLI-written only; never edit by hand)
├── schema.yaml                           # active editable workflow (fork this)
└── features/
    └── <feature>/
        ├── BRAINSTORM.md
        ├── DEFINE.md
        ├── DESIGN.md
        ├── BUILD_REPORT.md
        └── .handoffs/
            ├── brainstorm.json
            ├── define.json
            ├── design.json
            └── build-report.json
```

---

## Forking `schema.yaml`

The editable schema at `.ahx/schema.yaml` is yours to customise. It controls:

- Which artifacts exist and their dependency edges (Kahn order)
- The `model` hint per artifact (used by `ahx next`)
- The `build_retry_cap` (cap for `ahx retry --ok`)
- Gate configurations

```bash
ahx schema show      # print the active schema
ahx schema validate  # check it is well-formed
```

After editing, run `ahx schema validate` before running any workflow command. The schema is intentionally small — artifact nodes + edges + a handful of config keys. Start from the `sdd` or `kb` built-in and trim or extend from there.

---

## Test and CI story

The harness ships with 63 unit and integration tests covering:

- Kahn ordering correctness under all dependency topologies
- Gate pass/block logic for every gate ID
- Handoff schema validation for all 9 schema IDs
- Exit-code ABI conformance
- **No-model-calls guard** — the test suite asserts that no `ahx` code path imports or invokes an inference SDK. This is enforced as a hard test failure, not a lint warning.
- E2E: a full `sdd` cycle from `ahx init` through `ahx gate G_SHIP`, using fixture artifacts and handoffs, verifying that every `ahx complete` and gate transition produces the correct `run.json` state.

### Run locally

```bash
npm test
```

### CI

Add to your pipeline:

```yaml
- run: npm ci
- run: npm test
```

No model credentials needed — all tests are deterministic. The no-model-calls guard will catch any accidental inference import introduced in a future change.

---

## Attribution

- **[AgentSpec](https://github.com/agentspec)** — the SDD workflow doctrine (Brainstorm → Define → Design → Build → Ship), gate philosophy, and handoff contract model that this harness implements.
- **[OpenSpec](https://openspec.dev)** — the open specification format underlying the schema and handoff JSON schemas.
- **[ECC](https://github.com/ECC)** — the Claude Code plugin conventions, skill/agent authoring patterns, and harness tooling that the command layer follows.

---

> `ahx` is the spine. Claude is the worker. The gate is the judge.
