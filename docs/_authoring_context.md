# Authoring context for agentspec-harness content (read this fully)

You are authoring ONE file for the `agentspec-harness` Claude Code plugin.
The deterministic core (the `ahx` CLI) is ALREADY BUILT AND TESTED. Your job is
the LLM-facing layer (commands, worker agents, skills, docs) that orchestrates
Claude AROUND the CLI. Repo root: /Users/ivis/dev/agentspec-harness

## The one invariant (never violate it)
`ahx` (the CLI) NEVER calls a model. It is the deterministic state machine and
gatekeeper. The SLASH COMMANDS are the only place a model runs — they call `ahx`
for every ordering/validation/gate/state decision, branch strictly on its EXIT
CODE, and fan out worker subagents via the Task tool. Never tell Claude to "run
the agents from node" or hit an inference endpoint — that is the fake-dispatch
anti-pattern. Commands invoke `ahx` via:  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js <args>`
(documented shorthand: `ahx <args>`).

## Exit-code ABI (commands branch on this)
0 = pass · 1 = gate blocked / handoff invalid · 2 = usage error · 3 = internal error

## ahx command surface (this is the WHOLE surface — do not invent commands)
- `ahx init --schema <sdd|kb> --feature <slug>`  scaffold .ahx/, copy editable schema, create run.json
- `ahx next`            -> { ready:[{id,model,parallel_group}], blocked:{}, complete:bool }
- `ahx order`           -> full Kahn build order
- `ahx state`           -> the run.json ledger (completed[], retries{}, gates{})
- `ahx complete <id> [--handoff f.json]`  validate the worker handoff against the artifact's schema, THEN mark complete. exit 1 if invalid.
- `ahx validate <id|path>`   structural checks (md sections / manifest table / criteria IDs). exit 0/1
- `ahx gate <gateId> [--agents d] [--routing f] [--findings f]`   run a named gate. exit 0 pass / 1 BLOCK with {gate,passed,reasons,unmet}
- `ahx diff-criteria --define f --build f`   set-diff DEFINE criteria vs BUILD passed -> unmet[]
- `ahx handoff-check <schemaId> <file.json>`   standalone handoff validation
- `ahx retry <id> --inc | --ok`   retry counter vs config.build_retry_cap (powers the bounded loop). --ok exits 1 at ceiling.
- `ahx route <taskKind> [--budget std|low]`   -> { tier, model, reason }
- `ahx schema show|validate`   inspect/validate the active editable schema

## Gate ids (run via `ahx gate <id>`)
G_DEFINE (before /design: DEFINE sections + AC-n ids + define handoff valid),
G_DESIGN (before /build: manifest table + design handoff),
G_BUILD (before /ship: every manifest file exists on disk + criteria-diff empty + BUILD_REPORT exists — THIS REPLACES the old prose "max 3 retry" + checkbox),
G_SHIP (define.criteria minus build.passed must be empty),
G_KB_STRUCTURE, G_KB_COVERAGE (KB),
G_ROUTER_COVERAGE (agent->routing bijection, no silent skips),
G_REVIEW_BLOCK (surviving CRITICAL findings > 0 -> block; shared by /review and /migrate),
G_HANDOFF (enforced inside `ahx complete --handoff`).

## Handoff schema ids (the `handoff:` field / `ahx complete --handoff` / `ahx handoff-check`)
define, design, build-task, build-report, finding, claim, migration-plan, claudemd-section, kb-concept.
Workers write a JSON sidecar matching one of these; the command passes it to `ahx complete --handoff`.

## Model-routing task-kinds (`ahx route <kind>`) + doctrine
HAIKU (mechanical, gate-backstopped): file-read, structure-extract, frontmatter-parse, template-fill, format-convert, claim-extract, ship-prose, section-scan, router-assemble.
SONNET (analysis/authoring): spec-authoring, design-synthesis, code-build, kb-concept, finding-analysis, claim-verify, migration-plan, merge.
OPUS (deepest + adversarial): architect, define-intent, design-intent, adversary, review-judge, equivalence-break.
DOCTRINE: default to the cheapest tier that VERIFIABLY does the task. Two hard rules — (a) the verifier/adversary outranks-or-equals the generator on any CRITICAL gate (never let a cheaper tier be the final judge of a CRITICAL finding); (b) downgrade a tier under `--budget low` ONLY where a deterministic gate backstops the output. Critical kinds (adversary/architect/review-judge/*-intent) NEVER downgrade.

## The harness protocol every workflow command obeys
1. `ahx next` to learn the ready artifact(s) + their model hint.
2. For each ready artifact: read `ahx route <kind>` (or the artifact's model hint), dispatch a worker via Task on that model. Independent artifacts/files in the same parallel_group fan out in a SINGLE message (true parallel).
3. The worker writes its markdown artifact AND a JSON handoff sidecar.
4. `ahx complete <id> --handoff <sidecar>` — if exit 1, the handoff is invalid: re-dispatch (bounded by `ahx retry <id> --inc`, stop at `--ok` ceiling). NEVER mark complete by hand.
5. `ahx gate <gateId>` for the phase. exit 1 => STOP, surface {reasons,unmet}, do not advance. exit 0 => proceed to the next phase.
This is the whole mechanism: deterministic decisions in `ahx`, authoring in workers, control flow branching on exit codes.

## .ahx/ on-disk layout
.ahx/run.json (the ledger, CLI-written only) · .ahx/schema.yaml (the active editable workflow) · .ahx/features/<feature>/<ARTIFACT>.md · .ahx/features/<feature>/.handoffs/<id>.json

## Style
Match Claude Code command/skill conventions: YAML frontmatter (name, description; agents also: tools, model), concise imperative markdown, real `ahx` invocations in fenced blocks, no invented flags. Worker agent files MUST have valid `name` + `description` frontmatter (G_ROUTER_COVERAGE validates the roster). Do not pad. Write the file to its given absolute path with the Write tool.
