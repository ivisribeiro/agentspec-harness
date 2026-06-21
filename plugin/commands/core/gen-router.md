---
name: gen-router
description: Parse every agent frontmatter and assemble the agent-router routing.json, then assert bijection via G_ROUTER_COVERAGE. Replaces the legacy regex Python router that silently skipped malformed files.
---

Generate the agent-router routing table from source-of-truth agent frontmatter, validate it with a deterministic gate, and surface any parse failures or coverage gaps before they become silent skips.

## 1 — Discover agents and parse frontmatter

Dispatch one HAIKU worker per agent file found under `plugin/agents/`. Fan out all files in a **single message** (true parallel, same `parallel_group`).

```
ahx route frontmatter-parse
```

Each worker:
- Reads the agent `.md` file.
- Extracts `name`, `description`, `model`, `tools` from the YAML frontmatter.
- **Fails closed**: if frontmatter is missing, malformed YAML, or `name`/`description` are absent, the worker writes a `finding` handoff (schema id: `finding`) with `severity: CRITICAL` and exits non-zero — do NOT silently skip the file.
- On success writes a `build-task` handoff (schema id: `build-task`) with the parsed fields.

Complete each worker:

```
ahx complete <worker-id> --handoff .ahx/features/gen-router/.handoffs/<worker-id>.json
```

If `ahx complete` exits 1 (invalid handoff):

```
ahx retry <worker-id> --inc   # increment retry counter
ahx retry <worker-id> --ok    # exits 1 at ceiling — surface error and stop
```

Re-dispatch the worker on `--inc` success; stop on `--ok` ceiling.

## 2 — Fail-closed on any parse error

After all workers complete, check for any `finding` handoffs with `severity: CRITICAL`:

If any exist, surface the full list of malformed agent files and **stop**. Do not assemble a partial routing table. The gate in step 4 would catch this too, but failing here produces a clearer error message.

## 3 — Assemble routing.json

Dispatch one HAIKU worker (task-kind `router-assemble`) to merge all successful `build-task` handoffs into `plugin/skills/agent-router/routing.json` with the shape:

```json
{
  "agents": [
    { "name": "<name>", "description": "<description>", "model": "<model>", "tools": ["..."] }
  ]
}
```

```
ahx route router-assemble
```

Complete the worker:

```
ahx complete <assembler-id> --handoff .ahx/features/gen-router/.handoffs/<assembler-id>.json
```

Retry via `ahx retry` if `ahx complete` exits 1, bounded by the retry cap.

## 4 — Assert bijection with G_ROUTER_COVERAGE

```
ahx gate G_ROUTER_COVERAGE --agents plugin/agents --routing plugin/skills/agent-router/routing.json
```

Exit-code handling:

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | Bijection holds — every agent appears exactly once, no invalid entries, no silent skips | Proceed |
| 1 | Gate blocked — `{gate, passed, reasons, unmet}` printed by ahx | Surface `reasons` and `unmet` to the user; **stop** |
| 2 | Usage error | Surface the error; stop |
| 3 | Internal error | Surface the error; stop |

On gate pass, report the agent count and the path of the written `routing.json`. Done.
