# Codebase opportunities — Spindle

Date: 2026-06-22

Scope: this review is based on the executable codebase: `src/`, `schemas/`,
`plugin/`, `test/`, package metadata, and direct CLI probes. It intentionally
does not use the existing opportunities document as input.

## Codebase score

**88/100**

Spindle's codebase is strong for its stated architecture. The deterministic
spine is real, the CLI has broad command coverage, gates and handoffs are typed,
the run ledger is persisted, the model-free invariant is tested, and the suite is
healthy.

Validation run during this review:

- `npm test`: 32 test files, 295 tests, all passing.
- `npm run test:coverage`: all passing, 95.57% statement coverage.
- `npm run eval`: 22/22 gate eval fixtures passing, with pass/block coverage for
  all 11 registered gates.

The remaining gap is not "missing architecture"; it is tightening the places
where command orchestration can still observe misleading state, where editable
schemas can declare invalid references, and where a few CLI paths do not fully
honor the exit-code ABI.

## What the codebase already does well

- The CLI surface is real and broad: init, next, order, state/status, complete,
  invalidate, approve, validate, gate, merge-findings, diff-criteria,
  handoff-check, retry, route, tier, kinds, kb-install, schema, explain,
  spec-drift, reconcile, eval, budget, trace, fanout-check, and config-drift.
- The deterministic/model seam is protected by a guard test that scans `src/`
  for model/network/token-pricing signals.
- Gates are centralized in a closed registry and return structured pass/block
  verdicts.
- Handoff sidecars are Zod contracts, and `spin complete --handoff` canonicalizes
  validated sidecars into `.spindle/features/<feature>/.handoffs/`.
- The artifact graph has deterministic topological ordering, blocked/ready
  queries, cycle validation, and downstream invalidation.
- The ledger is atomically written and records completions, gates, retries, usage
  annotations, and approvals.
- The eval corpus replays real gate functions, which gives the project a useful
  deterministic regression layer.
- The plugin layer is not just a placeholder: there are workflow, review, KB,
  migration, visual, and core commands plus routed agents and skills.

## Opportunities

### P0 — Make `spin next` gate-aware and handoff-aware

Current behavior: `effectiveCompleted()` unions ledger completion with filesystem
detection. That means an artifact can be considered complete by `spin next` just
because its markdown file exists, even when its handoff was never validated and
`spin complete` never recorded it.

Probe result:

- After `spin init`, writing only `DEFINE.md` caused `spin next` to report
  `design` as ready while `run.json.completed` was still empty.
- After marking `build` complete with a valid build handoff but no
  `BUILD_REPORT.md` and no manifest file, `spin next` reported `ship` as ready;
  `spin gate G_BUILD` correctly blocked afterward.

Why it matters: commands are supposed to branch on `spin next`; a misleading
ready queue increases reliance on command prose to remember gates.

Suggested fix:

- For artifacts with `handoff`, treat ledger completion as authoritative.
- Keep filesystem detection as a separate field such as `detected_on_disk` or
  `candidate_complete`, not as readiness.
- Add gate blockers to `spin next`, for example:
  `{ ready: [], gate_blocked: { design: ["G_DEFINE"] } }`.
- Add e2e tests proving that `next` does not advance to `design`, `build`, or
  `ship` until the required ledger completion and lifecycle gates are green.

### P0 — Align unknown gates and internal failures with the exit-code ABI

Current behavior:

- `spin gate G_NOPE` exits `1` as a domain block and, when a run state exists,
  records `G_NOPE` into `run.json.gates`.
- A corrupt `.spindle/run.json` surfaced through `spin state` exits `2`, because
  the top-level CLI catch maps thrown errors to usage.

Why it matters: unknown gate ids are malformed invocations, not real gate
verdicts. Corrupt run state is an internal/runtime failure, not user syntax.

Suggested fix:

- Move unknown-gate handling from `runGate()` block verdict to `gateHandler()`
  usage error, exit `2`, with no ledger mutation.
- Add a typed error boundary in `runCli()`:
  - known commander/user invocation errors -> `2`
  - unexpected exceptions/run-state corruption -> `3`
- Emit structured JSON for internal errors where possible, not only stderr.
- Add tests for unknown gate with initialized state, corrupt run state, and
  ledger write failure.

### P0 — Validate editable schema references and safe paths

Current behavior:

- `ArtifactSchema.handoff` is any string.
- `gates:` entries are any string or string array.
- Artifact ids and generated paths are minimally constrained.
- Handoff fields such as design manifest files and `verified_by` paths can carry
  `..` or other path shapes that escape the intended repo-relative contract.

Why it matters: the repo has closed sets for gates and handoff ids, but active
schemas can reference invalid ids. Path escape does not make the CLI model-aware,
but it weakens the deterministic contract and can create confusing pass/fail
states outside the project root.

Suggested fix:

- Extend `spin schema validate` to check:
  - every `handoff` id exists in `HANDOFF_SCHEMAS`
  - every lifecycle gate exists in `GATE_REGISTRY`
  - artifact ids are slug-like and path-safe
  - `generates` is a safe relative path with no `..` escape
- Add shared `safeRelativePath()` utility and reuse it for:
  - design manifest file checks
  - `verified_by` path checks
  - canonical handoff destination writes
  - `kb-install --from/--dest` if kept root-scoped
- Add fixtures for malicious or accidental `../` paths.

### P0 — Validate feature slugs in `spin init`

Current behavior: `spin init --feature ../../escape` can create directories
outside `.spindle/features/` and then fail while copying `.spindle/schema.yaml`.
The failure exits through the generic CLI catch.

Why it matters: `feature` is later trusted by `featureDir()` and `handoffDir()`.
Because the run state stores a raw string, this should be constrained at the
entrypoint.

Suggested fix:

- Require feature slugs to match a safe pattern, such as
  `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.
- Ensure `.spindle/` is created before feature subdirectories.
- Add tests for invalid feature values and for normal initialization.

### P1 — Make `spin complete` verify generated outputs

Current behavior: `spin complete <id>` validates the handoff when one is
required, but it does not require the artifact's `generates` file to exist before
marking the artifact complete. Some later gates catch this for key phases, but
non-handoff artifacts like `brainstorm` and `ship` can be marked complete without
their generated markdown existing.

Why it matters: the ledger says an artifact is complete even when the human-facing
artifact may be missing. That weakens traceability and can make `spin next`
advance too optimistically.

Suggested fix:

- Before `markComplete()`, require the generated file/glob to exist.
- If there are valid artifact types that intentionally produce no file, encode
  that explicitly in the schema rather than relying on absence.
- Add tests for `brainstorm`, `ship`, and `build` completion without generated
  files.

### P1 — Make `reconcile` honor `--root`

Current behavior: `reconcileHandler()` resolves relative audit paths against
`process.cwd()`, and the CLI action does not pass the global root into the
handler.

Probe result:

- `node dist/cli/index.js --root <tmp> reconcile --audit .spindle/.../audit.json`
  looked under the current repo checkout instead of `<tmp>`.

Why it matters: most other file-oriented commands honor `--root`; this one is an
API inconsistency and makes scripted use brittle.

Suggested fix:

- Change `reconcileHandler(opts)` to `reconcileHandler(root, opts)`.
- Resolve relative `--audit` paths against `root`.
- Add a CLI test that invokes `reconcile` from a different cwd with `--root`.

### P1 — Strengthen evidence gates from "non-empty" to "verifiable"

Current behavior:

- `G_AUDIT` requires evidence file strings and proof strings, but does not check
  that evidence files exist or that line ranges are plausible.
- `G_OPS_CONFIG` trusts the handoff's `enforced` boolean and does not verify that
  `env_files_checked` exist or contain the required value.
- `G_BUILD` checks manifest files and path-looking `verified_by` values, but path
  containment should be enforced before existence checks.

Why it matters: the project goal is deterministic confidence. Non-empty evidence
is useful, but the codebase can cheaply verify more without crossing the model
seam.

Suggested fix:

- For audit evidence, optionally require evidence files to exist under the repo
  root and validate simple `lines` formats.
- For ops readiness, add a deterministic env-file reader for simple `KEY=value`
  controls, or add explicit fields that make the expected key machine-readable.
- For build evidence, reject unsafe relative paths before checking existence.

### P1 — Replace heuristic plan matching with explicit gap linkage

Current behavior: `G_PLAN` checks whether a blocking gap is addressed by finding
capability words as substrings inside task title/detail haystacks.

Why it matters: substring matching is deterministic, but it is still a heuristic.
It can produce false positives and false negatives as task language changes.

Suggested fix:

- Give gaps stable ids, for example `GAP-1`.
- Add `addresses_gaps: ["GAP-1"]` to proposed tasks.
- Have `G_PLAN` set-diff blocking gaps against explicit task links, while keeping
  the current heuristic only as a fallback warning.

### P1 — Validate merged findings before writing output

Current behavior: `merge-findings` accepts arrays or `{findings:[...]}` and casts
entries to `RawFinding`. The downstream `G_REVIEW_BLOCK` validates the final
shape, but invalid findings can affect dedupe, source aggregation, and severity
ranking before that point.

Why it matters: this command exists to make review merging deterministic. It
should fail closed before it transforms untrusted review output.

Suggested fix:

- Validate each input through the `finding` handoff schema before merging.
- Normalize or reject unknown severity values before ranking.
- Add tests for malformed findings, missing source, mixed array/object inputs,
  and duplicate keys with invalid severity.

### P2 — Expand command-template contract tests

Current behavior: the e2e command-reference test checks that command docs only
reference real gate ids, route kinds, and handoff ids in `handoff-check`. That is
valuable, but command markdown still contains many executable examples and JSON
snippets that are not parsed against the real CLI/schema contracts.

Why it matters: the plugin command layer is the model-facing control plane. Drift
there can reintroduce prose-only failure modes even when `src/` is sound.

Suggested fix:

- Extract fenced `bash` command snippets and validate that referenced `spin`
  subcommands, flags, gate ids, handoff ids, and route kinds exist.
- Extract fenced JSON sidecar examples and validate them against
  `HANDOFF_SCHEMAS`.
- Add a test that every command using `${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js`
  references a real bundled path.

### P2 — Make budget and trace more operational

Current behavior: `trace` and `budget` are useful pure reads, but budget is
advisory and based on optional model-reported usage. There is no baseline,
export mode, or phase-level comparison beyond the current ledger summary.

Why it matters: the code already records events and optional usage. A little more
structure would turn it from post-hoc accounting into operational feedback
without making `src/` model-aware.

Suggested fix:

- Add `spin budget --export json` or structured output modes suitable for CI.
- Add per-phase and per-artifact usage aggregation.
- Track a project-local baseline file for comparable runs, still with advisory
  exit behavior unless explicitly configured otherwise.

### P2 — Support multiple active features in one workspace

Current behavior: `RunStateSchema` stores one `feature` string. Concurrent
features require separate worktrees or manual state juggling.

Why it matters: the artifact graph is already feature-scoped under
`.spindle/features/<feature>/`; the ledger is the piece that makes one active
feature global.

Suggested fix:

- Move toward a `features` map in run state, or introduce `spin list-features`
  and `spin switch <feature>` while preserving backward compatibility.
- Keep the current single-feature schema as version 1 and add a migration path
  for version 2.

## Suggested implementation order

1. Fix `spin next` readiness semantics.
2. Fix unknown-gate/internal-error ABI behavior.
3. Add schema/reference/path validation and feature slug validation.
4. Make `complete` require generated outputs.
5. Fix `reconcile --root`.
6. Strengthen evidence gates.
7. Replace plan heuristic matching with explicit gap ids.
8. Expand command-template contract tests.
9. Improve budget/trace observability.
10. Add multi-feature workspace support.

## Bottom line

The codebase already proves the core thesis: deterministic gates and typed
handoffs can make model-driven workflows testable. The highest-leverage next
work is to make the CLI's own state projection stricter, so the command layer has
less room to misinterpret "ready" or "complete."
