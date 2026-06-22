---
name: create-specialist
description: Generate a specialist agent WITH its knowledge base, on demand — the design-driven path that replaces a pre-loaded catalog. Chains /create-kb (gated) → spin kb-install → author the agent with kb_domains → regenerate routing → G_ROUTER_COVERAGE. The gate proves the specialist's KB resolves, so a specialist literally cannot ship without its KB.
---

Create a domain specialist whose knowledge base is generated and bound in the same pass.
The point: a specialist is born grounded — `G_ROUTER_COVERAGE` refuses any agent whose
declared `kb_domains` does not resolve, so "create the specialist with the correct KB"
becomes the only outcome the harness allows.

Input: a kebab-case domain/role slug (e.g. `dbt`, `fastapi`). Or, from `/design`, take each
slug in the design handoff's `technologies[]` and run this once per technology — that is the
design-driven loop (the stack the design chose decides which specialists get generated).

## Steps

### 1. Resolve the domain(s)

If invoked with a slug, use it. If continuing from `/design`, read the `technologies[]`
array from the design handoff (`.spindle/features/<feature>/.handoffs/design.json`) and run
steps 2-6 once per slug not already present under `plugin/kb/`.

### 2. Generate the KB (gated)

Run the `/create-kb <domain>` flow — it drives the kb artifact graph (manifest → parallel
concept fan-out → assembly) and gates on `G_KB_STRUCTURE` + `G_KB_COVERAGE`, enforcing the
`kb-concept` handoff (incl. E-1 `decoding_note`). Do not hand-author; let the gates pass.
The domain lands in the workspace at `.spindle/features/<domain>/`.

### 3. Publish the KB so it resolves

```
node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js kb-install <domain>
```

Exit 1 → the KB is not a complete flat domain (a gate did not pass in step 2). Go back to
step 2; do not author the agent against a missing KB. Exit 0 → the domain is now at
`plugin/kb/<domain>/` where `G_ROUTER_COVERAGE --kb` resolves it.

### 4. Author the specialist agent

Write `plugin/agents/<category>/<name>.md` with valid frontmatter:

```yaml
---
name: <name>            # kebab-case, the routing key
description: <purpose + when to dispatch, with 1-2 trigger examples>
model: sonnet           # or opus for deep-reasoning specialists
kb_domains: [<domain>]  # the domain just installed — this is the binding the gate checks
---
```

Body: ground it in the harness — KB-First resolution against its own `<domain>`, how it is
dispatched (`spin route <kind>` → Task), and that it authors a typed handoff and never
decides control flow. No upstream source names in the prose (the authorship guard forbids them).

### 5. Regenerate the routing table

Run `/gen-router` (it scans `plugin/agents/` and rewrites
`plugin/skills/agent-router/routing.json`) so the new agent has a routing entry.

### 6. Prove the binding

```
node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js gate G_ROUTER_COVERAGE --agents plugin/agents --routing plugin/skills/agent-router/routing.json --kb plugin/kb
```

Exit 0 → the roster↔routing bijection holds AND every declared `kb_domains` resolves —
including the one you just created. The specialist is grounded by construction.

Exit 1 → STOP and surface `reasons`/`unmet`:
- `dangling-kb-domain:<name>:<domain>` → the KB was not installed (step 3 did not run or
  failed). Re-run step 3.
- `missing:<name>` / `extra:<name>` → routing was not regenerated. Re-run step 5.

### 7. Report

Tell the user: the domain created, where its KB lives, the agent created with its bound
`kb_domains`, and the green `G_ROUTER_COVERAGE`. Note honestly: the binding proves the KB
EXISTS and is declared — it does not prove the agent reads it at runtime (that stays model
behavior; the KB is gated at creation, not at consultation).
