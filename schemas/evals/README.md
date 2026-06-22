# Eval corpus — the harness evaluating itself

`spin eval` replays every case here through the **real** gate function and asserts the
re-computed verdict matches the recorded `expect`. A code change that makes a gate stop
blocking what it used to block is a regression this corpus catches. It is fully
deterministic and offline — no model, no network — so it evaluates the *harness*, not an
LLM.

## Case format

Each case is a directory with a `case.json`:

```json
{
  "id": "G_AUDIT-block",
  "gate": "G_AUDIT",
  "expect": "pass | block",
  "args": { "handoff": "audit.json" },
  "note": "one line on what this case pins down"
}
```

- `args` file paths resolve **relative to the case directory**.
- The case directory **is the gate root**: a state-coupled gate (e.g. `G_DEFINE`) reads a
  `.spindle/` tree placed inside the case dir; an arg-file gate reads the files named in
  `args`. Both work through the same mechanism.

## Coverage (honest, on the record)

This corpus currently pins the **arg-file gates** — the logic-dense ones replayable from
standalone fixtures: `G_AUDIT`, `G_OPS_CONFIG`, `G_PLAN`, `G_REVIEW_BLOCK`,
`G_ROUTER_COVERAGE` (a pass **and** a block case each).

The **state-coupled gates** — `G_DEFINE`, `G_DESIGN`, `G_BUILD`, `G_SHIP`,
`G_KB_STRUCTURE`, `G_KB_COVERAGE` — are exercised pass-and-block by the end-to-end suite
(`test/e2e/sdd-cycle.e2e.test.ts`, `test/e2e/kb-cycle.e2e.test.ts`) rather than by frozen
`.spindle/` snapshots here. `spin eval` reports them as uncovered in its coverage block;
`spin eval --strict` treats that as a failure. Bringing them into the corpus as recorded
snapshots is the next increment.
