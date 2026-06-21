---
name: spin
description: Orientation / "where am I" command. Reports the active Spindle run (spin state + spin next), shows the workflow map, and recommends the exact next slash command to run. Read-only — never mutates state.
---

# /spin

The friendly entry point. Run this any time to see **where the current workflow
stands and what to do next**. It is read-only: it inspects state and orients you,
it never advances a phase or writes anything.

The `spin` shorthand below means: `node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js <args>`.

## Protocol

### 1. Check for an active run

```bash
spin state
```

- **Exit 2 ("no run state")** → there is no active run in this directory. Go to
  step 4 (No active run).
- **Exit 0** → parse the JSON: note `schema` (sdd | kb), `feature`, the
  `completed[]` set, and the `gates{}` ledger. Continue to step 2.

### 2. Show what is ready

```bash
spin next
```

Parse `{ ready, blocked, complete }`:

- If `complete` is `true` → the workflow is done. Report it and suggest the
  closing command (`/ship` for SDD, or that the KB domain is fully covered).
- Otherwise → for each artifact in `ready`, surface its `id` and `model` hint,
  and map it to the slash command the user should run next (table below).
- List `blocked` artifacts with their unmet dependencies so the path is clear.

### 3. Recommend the next slash command

Map the ready artifact id to the command that drives it:

| Ready artifact | Run next | Gate it must clear |
|---|---|---|
| `brainstorm` | `/brainstorm` (optional — skip straight to `/define` if requirements are clear) | none |
| `define` | `/define` | `G_DEFINE` |
| `design` | `/design` | `G_DESIGN` |
| `build` | `/build` | `G_BUILD` |
| `ship` | `/ship` | `G_SHIP` |
| `manifest` / `concepts` / `quick-reference` / `index` (kb) | `/create-kb` | `G_KB_STRUCTURE`, `G_KB_COVERAGE` |

Tell the user the single most useful next action. If a gate already has a
`passed: false` record in the ledger, point that out and what it blocked on.

### 4. No active run — orient and offer to start

If there is no `.spindle/` run, present the map and the two ways in:

```bash
# guided exploration first (optional):
/brainstorm "<your idea>"

# or jump straight to requirements:
/define "<what you want to build>"

# under the hood either path scaffolds the run via:
spin init --schema sdd --feature <slug>
```

For a knowledge-base domain instead of a feature: `/create-kb <domain>`
(scaffolds `spin init --schema kb`).

### 5. Always show the map

End by rendering the workflow so the user is oriented:

```
SDD:  /brainstorm → /define → /design → /build → /ship
gates:            G_DEFINE   G_DESIGN   G_BUILD   G_SHIP
KB:   /create-kb  (manifest → concepts → quick-reference → index)
```

You can confirm the exact order for the active schema with:

```bash
spin order
```

## Other entry points worth surfacing

- `/review` and `/migrate` — adversarial review flows gated by `G_REVIEW_BLOCK`
  (one-shot; they do not use the SDD run).
- `/gen-router` — rebuild and validate the agent routing table (`G_ROUTER_COVERAGE`).
- `/generate-slides`, `/generate-web-diagram`, `/project-recap`, `/share` — the
  visual-explainer suite (self-contained HTML output).
- `spin route <task-kind> [--budget low]` — see which model tier a task resolves
  to (Haiku / Sonnet / Opus).

## Constraints

- **Read-only.** Only ever calls `spin state`, `spin next`, `spin order`, and
  `spin route`. Never `spin complete`, `spin gate`, `spin retry`, or `spin init`
  — orientation does not change state.
- Never invent `spin` subcommands, gate ids, or slash commands beyond those above.
