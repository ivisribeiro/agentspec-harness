# spindle

**A deterministic harness for spec-driven development in Claude Code** — it turns the SDD cycle (Brainstorm → Define → Design → Build → Ship) into a gate-backed workflow where `spin` is the spine and Claude is the worker.

> **The idea in one line:** separate the thing that *decides* from the thing that *generates*. Claude writes; a deterministic TypeScript CLI named `spin` decides what "done" means — and `spin` **never calls a model** (a CI grep-guard fails the build if `src/` so much as references `fetch(`). "Done" becomes a checkable verdict over files, evidence, and acceptance-criterion identity — returned as an exit code — not a self-marked checkbox.

### Why it exists / what makes it different

Most spec-driven AI tools have one blind spot: when every check is green, you assume the spec is right. Spindle is built to make that assumption *testable*. Versus a file-existence model (OpenSpec):

- **"Done" can be a content verdict, not just a file existing** — for any artifact whose schema declares a `handoff:`, `spin complete` refuses to mark it done unless a Zod sidecar passes, and `G_BUILD` set-diffs every acceptance criterion. It also enforces criteria-set consistency *both ways* — blocking a **phantom** AC the build certifies that DEFINE never declared (an ID-set drift the spine catches with no disclosure; note this is *not* the same as a wrong-*value* drift, which is `spec-drift`'s job) — and, *when* a `passed` criterion cites a test file via `verified_by`, requires that file to exist (opt-in, existence-only — it doesn't make evidence mandatory).
- **The deterministic spine is a *verifiable property*** — the no-model invariant is enforced by a guard that bans all network egress, not just LLM SDKs.
- **The adversarial verifier outranks the generator** — on a CRITICAL gate the judging model tier is pinned ≥ the generator's and never downgrades; `G_REVIEW_BLOCK` (not the agent) decides.
- **Spec↔build divergence is a first-class, typed loop** (`spin spec-drift`) — a green build can't silently leave a false spec behind once the correction is disclosed.

> **Honest limit (on the record):** gates certify *structure and identity, not truth*. The spine can prove a file exists, a criterion is `passed`, a verifier is cited, the criteria sets are consistent — it **cannot** prove a CRC value is correct or that a non-executable prose claim is true. Spindle makes confidence *checkable*; it does not make meaning self-verifying. See [`docs/DOGFOOD_LOG_pix-brcode.md`](docs/DOGFOOD_LOG_pix-brcode.md) for where exactly that line falls.

---

## The hard-seam doctrine

```
spin  ─── deterministic spine ───  never calls a model
                │
          exit code (0/1/2/3)
                │
     slash commands branch here
                │
         Claude (worker agents)
         spawned via Task tool
```

`spin` is a pure state machine: it reads `.spindle/run.json`, applies Kahn ordering, validates handoffs against JSON schemas, enforces gates, and exits with a code. It never touches an inference endpoint. The slash commands (`/brainstorm`, `/define`, `/design`, `/build`, `/ship`, `/review`, `/migrate`) are the only place a model runs — they call `spin` for every ordering, validation, and gate decision, then branch strictly on the exit code.

**Fake-dispatch anti-pattern (never do this):** dispatching a model from Node, calling `spin` to "help" an LLM decide, or advancing state without `spin complete --handoff`. Every gate is an exit code. Every state change is written by `spin`, not by Claude.

---

## Install

### Option A — Claude Code plugin (local, works today)

```bash
git clone https://github.com/ivisribeiro/spindle.git
claude --plugin-dir ./spindle/plugin
```

`plugin/` ships the prebuilt, self-contained `dist/cli/index.js` (deps inlined,
runs offline) and `schemas/`, so the slash commands work with no `npm install`.
All commands invoke the CLI as:

```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js <args>
```

The documented shorthand throughout this README is `spin <args>`.

### Option B — build from source / use the CLI directly

```bash
git clone https://github.com/ivisribeiro/spindle.git
cd spindle && npm install && npm run build
node bin/spin.js <args>      # the `spin` CLI
```

> Marketplace install (`claude plugin add …`) and an `npx` package are planned
> once published; the two paths above are the supported install methods today.

### Option C — prebuilt dist (embed in your repo)

Copy `dist/` into your project and invoke `node dist/cli/index.js` directly. Pin the version in your lockfile.

---

## Command surface

| Command | What it does | Exit codes |
|---|---|---|
| `spin init --schema <sdd\|kb> --feature <slug>` | Scaffold `.spindle/`, copy editable schema to `.spindle/schema.yaml`, create `run.json` | 0 / 2 |
| `spin next` | Returns `{ ready:[{id,model,parallel_group}], blocked:{}, complete:bool }` — the ready artifact queue | 0 |
| `spin order` | Full Kahn build order for the active schema | 0 |
| `spin state` (alias `spin status`) | Print the `run.json` ledger (`completed[]`, `retries{}`, `gates{}`) | 0 |
| `spin explain <gateId>` | What a gate reads, what blocks it, which flags apply — no source-diving | 0 / 2 |
| `spin complete <id> [--handoff f.json]` | Validate the worker handoff against the artifact's schema, then mark complete. **exit 1 if invalid** | 0 / 1 |
| `spin validate <id\|path>` | Structural checks (MD sections / manifest table / criteria IDs) | 0 / 1 |
| `spin gate <gateId> [--agents d] [--routing f] [--findings f]` | Run a named gate. exit 0 = pass, exit 1 = BLOCK with `{gate,passed,reasons,unmet}` | 0 / 1 |
| `spin diff-criteria --define f --build f` | Set-diff DEFINE criteria vs BUILD passed → `unmet[]` | 0 / 1 |
| `spin handoff-check <schemaId> <file.json>` | Standalone handoff validation | 0 / 1 |
| `spin retry <id> --inc \| --ok` | Retry counter vs `config.build_retry_cap`. `--ok` exits 1 at ceiling | 0 / 1 |
| `spin route <taskKind> [--budget std\|low]` | Model tier for an agent: `{ tier, model, reason }` | 0 |
| `spin tier [--risk\|--breadth\|--have-context\|--mechanical\|--reversible\|--irreversible]` | Orchestration tier T0/T1/T2 — main loop / one agent / fan-out | 0 |
| `spin reconcile --audit f.json` | Doc-vs-code drift over an audit handoff | 0 / 1 |
| `spin config-drift --declared a,b --present a` | Tools required by CI but absent from the lockfile | 0 / 1 |
| `spin spec-drift --build f.json` | Acceptance criteria the build CORRECTED vs DEFINE (`corrected_spec`) — a false spec can't ride a green build | 0 / 1 |
| `spin schema show\|validate [handoffId]` | Inspect/validate the active schema; `show <handoff-id>` describes a handoff JSON shape | 0 / 1 / 2 |

**Exit-code ABI:** `0` = pass · `1` = gate blocked / handoff invalid · `2` = usage error · `3` = internal error

---

## Gates

Gates are run via `spin gate <id>`. A command that receives exit 1 surfaces `{gate, passed, reasons, unmet}` and stops — it does not advance the phase.

| Gate ID | Fires before | Checks |
|---|---|---|
| `G_DEFINE` | `/design` | DEFINE sections present, AC-n IDs valid, define handoff valid |
| `G_DESIGN` | `/build` | Manifest table present, design handoff valid |
| `G_BUILD` | `/ship` | Every manifest file exists on disk; every DEFINE criterion `passed`; **no phantom criterion** (a `passed` AC-n DEFINE never declared → set-drift); a cited `verified_by` file must exist; BUILD_REPORT present |
| `G_SHIP` | publish | DEFINE criteria minus build.passed must be empty; no phantom criterion; surfaces `spec-drift` |
| `G_KB_STRUCTURE` | KB publish | KB structure checks |
| `G_KB_COVERAGE` | KB publish | KB coverage checks |
| `G_ROUTER_COVERAGE` | router validate | Agent→routing bijection, no silent skips |
| `G_REVIEW_BLOCK` | `/review` · `/migrate` ship | Surviving CRITICAL findings > 0 → block |
| `G_AUDIT` | `/audit` (brownfield) | Empty audit, or a `built[]` item without evidence, or a gap without a priority |
| `G_OPS_CONFIG` | brownfield sign-off | Any `opsReadiness[]` item `enforced: false` (coded but inert-in-prod flag) |
| `G_PLAN` | before `/build` of a plan | Vague-acceptance task, L/XL task bundling >1 domain, or an unaddressed blocking gap |
| `G_HANDOFF` | (enforced inside `spin complete --handoff`) | Handoff JSON matches declared schema |

---

## Handoff schema IDs

Workers write a JSON sidecar matching one of these schema IDs; the slash command passes it to `spin complete --handoff <sidecar>`.

`define` · `design` · `build-task` · `build-report` · `finding` · `claim` · `migration-plan` · `claudemd-section` · `kb-concept` · `audit`

> The `audit` handoff is the **brownfield** contract — structured `built[]`/`gaps[]`/`weakPoints[]`/`opsReadiness[]`/`proposedTasks[]`/`invariants_at_risk[]` — driven by the separate `brownfield` schema (`audit → define → design`) and the `/audit` command, so the spine models audit-then-plan, not just greenfield. See `docs/IMPROVEMENTS_FROM_DOGFOOD.md`.

---

## Model routing

`spin route <taskKind>` returns the right tier. Commands use this to pick which model to dispatch each worker on.

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
spin init --schema sdd --feature payments-reconciliation
```

Creates `.spindle/`, `.spindle/run.json`, `.spindle/schema.yaml` (your editable copy), and `.spindle/features/payments-reconciliation/`.

### 2. Brainstorm

Run `/brainstorm`. The command calls `spin next` to get the ready artifact, dispatches a SONNET worker via Task, the worker writes `BRAINSTORM.md` + a `define` handoff sidecar, then:

```bash
spin complete BRAINSTORM --handoff .spindle/features/payments-reconciliation/.handoffs/brainstorm.json
```

### 3. Define

Run `/define`. Before finishing, the command runs:

```bash
spin gate G_DEFINE
```

Exit 1 → surface `{reasons, unmet}` and stop. Exit 0 → proceed.

### 4. Design

Run `/design`. Gate fires:

```bash
spin gate G_DESIGN
```

### 5. Build

Run `/build`. The command loops over `spin next`, fanning out independent artifacts in the same `parallel_group` in a single Task dispatch. Each worker writes its artifact + a `build-task` handoff. For each:

```bash
spin complete <id> --handoff .spindle/features/<feature>/.handoffs/<id>.json
# exit 1 → spin retry <id> --inc  (bounded by build_retry_cap)
# at ceiling → spin retry <id> --ok  exits 1, command surfaces the block
```

When all artifacts complete, `spin gate G_BUILD` must pass before `/ship` is allowed.

### 6. Ship

Run `/ship`. Gate fires:

```bash
spin gate G_SHIP
```

Exit 0 → the command assembles the SHIP doc and marks the feature complete.

---

## Harness protocol (the full mechanism)

Every workflow command follows these five steps — this is the whole mechanism:

```
1. spin next               → ready artifacts + model hints
2. spin route <kind>       → tier/model for each artifact
3. Task (worker)          → writes artifact + handoff sidecar
4. spin complete <id> --handoff <sidecar>
      exit 1 → spin retry <id> --inc / --ok (bounded)
5. spin gate <gateId>
      exit 1 → STOP, surface {reasons, unmet}
      exit 0 → advance
```

Deterministic decisions live in `spin`. Authoring lives in workers. Control flow branches on exit codes.

---

## On-disk layout

```
.spindle/
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

The editable schema at `.spindle/schema.yaml` is yours to customise. It controls:

- Which artifacts exist and their dependency edges (Kahn order)
- The `model` hint per artifact (used by `spin next`)
- The `build_retry_cap` (cap for `spin retry --ok`)
- Gate configurations

```bash
spin schema show      # print the active schema
spin schema validate  # check it is well-formed
```

After editing, run `spin schema validate` before running any workflow command. The schema is intentionally small — artifact nodes + edges + a handful of config keys. Start from the `sdd` or `kb` built-in and trim or extend from there.

---

## Test and CI story

The harness ships with **222 unit, integration, and end-to-end tests** (run `npm test`) covering:

- Kahn ordering correctness under all dependency topologies
- Gate pass/block logic for every gate ID (incl. phantom-criterion + evidence checks)
- Handoff schema validation for all 10 schema IDs
- Exit-code ABI conformance
- **No-model-calls guard** — the test suite asserts that no `spin` code path imports or invokes an inference SDK. This is enforced as a hard test failure, not a lint warning.
- E2E: a full `sdd` cycle from `spin init` through `spin gate G_SHIP`, using fixture artifacts and handoffs, verifying that every `spin complete` and gate transition produces the correct `run.json` state.

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

## Proven on itself — the dogfood

Spindle was driven on itself, twice, against a *real* PIX BR Code library (a TS lib that
generates + parses a static PIX copia-e-cola: EMV TLV + CRC16-CCITT). Each phase agent
drove `spin`, parked at the gate, and was *forbidden* from faking a pass (no `--force`, no
hand-edited `run.json`) — honesty enforced mechanically, not by good behavior.

- **Run #1** — the harness held end-to-end (4 honest gates; the library independently
  re-verified by the observer, not trusted from the agent's word). It also produced a *true
  positive against the harness itself*: `G_DEFINE` passed a **factually-wrong** acceptance
  criterion (a CRC value that didn't match the standard), because gates check structure, not
  truth. The build caught it (the criterion was executable) but left the spec false while
  every gate stayed green — a silent spec↔build drift. → fixed with the `corrected_spec` /
  `spin spec-drift` mechanism.
- **Run #2** — the fixes worked (zero source-diving, a real drift flagged + reconciled, not
  shipped silently) and surfaced two more gaps *in the fixes themselves* — both then fixed.

The loop did its job twice: it proved the harness holds, then caught the holes in its own
repair. Full write-up: [`docs/DOGFOOD_LOG_pix-brcode.md`](docs/DOGFOOD_LOG_pix-brcode.md).

---

## Attribution

- **[AgentSpec](https://github.com/agentspec)** — the SDD workflow doctrine (Brainstorm → Define → Design → Build → Ship), gate philosophy, and handoff contract model that this harness implements.
- **[OpenSpec](https://openspec.dev)** — the open specification format underlying the schema and handoff JSON schemas.
- **[ECC](https://github.com/ECC)** — the Claude Code plugin conventions, skill/agent authoring patterns, and harness tooling that the command layer follows.

---

> `spin` is the spine. Claude is the worker. The gate is the judge.
