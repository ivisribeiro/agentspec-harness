---
name: sdd-workflow
description: |
  Spec-Driven Development workflow guidance for structured feature development.
  Use PROACTIVELY when the user discusses building features, planning implementations, capturing requirements,
  designing architectures, or shipping completed work. Guides through the 5-phase SDD workflow:
  Brainstorm → Define → Design → Build → Ship.
---

# SDD Workflow Guide

You are the Spec-Driven Development workflow assistant. Help users navigate the 5-phase SDD workflow for structured, traceable feature development.

## Phases

| Phase | Command | Output | Purpose |
|-------|---------|--------|---------|
| 0 | `/brainstorm` | `BRAINSTORM_{FEATURE}.md` | Explore ideas, compare approaches |
| 1 | `/define` | `DEFINE_{FEATURE}.md` | Capture requirements (clarity recorded 0..1) |
| 2 | `/design` | `DESIGN_{FEATURE}.md` | Architecture + file manifest |
| 3 | `/build` | Code + `BUILD_REPORT_{FEATURE}.md` | Implementation with tests |
| 4 | `/ship` | `SHIPPED_{DATE}.md` | Archive + lessons learned |

## When to Guide

- User says "I want to build..." → Suggest starting with `/brainstorm` or `/define`
- User has requirements → Suggest `/define` to structure them
- User has a DEFINE doc → Suggest `/design` to create architecture
- User has a DESIGN doc → Suggest `/build` to implement
- User completed building → Suggest `/ship` to archive

## Workflow Rules

1. **Phase 0 (Brainstorm)** is optional — skip for well-defined tasks
2. **Phase 1 (Define)** records a clarity score (0..1) in the handoff; `G_DEFINE` blocks below `config.clarity_floor` only when the schema sets that knob (it is unset by default — the score is informational unless a floor is configured)
3. **Phase 2 (Design)** must produce a complete file manifest with agent assignments
4. **Phase 3 (Build)** extracts tasks from the DESIGN manifest and delegates to specialist agents
5. **Phase 4 (Ship)** archives everything and captures lessons learned

## Cross-Phase Updates

Use `/iterate` to update any phase document when requirements change. It detects cascading impacts across phases.

## Templates

Phase templates are available at `${CLAUDE_PLUGIN_ROOT}/schemas/sdd/templates/`:
- `brainstorm.md`
- `define.md`
- `design.md`
- `build-report.md`
- `shipped.md`

## Workflow Schema

Phase gate rules are defined in `${CLAUDE_PLUGIN_ROOT}/schemas/sdd/schema.yaml`.

## Output Locations

All SDD documents are written to the user's project workspace:
- Features: `.spindle/features/<feature>/`
- Handoffs: `.spindle/features/<feature>/.handoffs/`
