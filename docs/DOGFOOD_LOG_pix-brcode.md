# Dogfood log — pix-brcode (greenfield SDD cycle)

**Date:** 2026-06-21
**Setup:** brand-new greenfield project `/Users/ivis/dev/pix-brcode` (a TS lib that
generates + parses a static PIX BR Code: EMV TLV + CRC16-CCITT).
**Method:** Spindle's SDD cycle (`define → design → build → ship`) run **autonomously**
by a workflow — each phase agent drove the `spin` CLI itself (`spin state` / `spin next` /
`spin complete` / `spin gate`), parked at the gate, forbidden from faking a pass.
**Observer:** main loop did not interfere; it read the factual phase reports + the journal,
re-ran the tests independently, and verified the PIX output against the real standard.

Workflow run: `wf_0c4bc076-7e8` (task `wqqsxi2ov`). 4 agents, ~368k tokens, ~20 min.

## Verdict
**The harness held end-to-end.** 4 gates passed **honestly** (no `--force`, no run-state
edits). The library is not just self-consistent — it is **correct against the real PIX
standard**, independently verified by the observer:
- `crc16("123456789")` = **29B1** (the canonical CRC-16/CCITT-FALSE check value) ✓
- the BCB reference payload → **1D3D** ✓ (a real, correct vector)
- a freshly generated copia-e-cola had CRC `C6A6`; recomputed independently in Python = `C6A6` ✓ → any bank would accept it.
- 27/27 vitest tests pass (re-run by the observer, not trusting the agent's word).

Gap #1 ("does the harness hold in a real run?") → **answered: it holds.**

---

## ⭐ The star finding (gap #2, made concrete)
The **DEFINE phase hallucinated a factually wrong acceptance criterion**, and **G_DEFINE
passed it** — because the gate validates *structure*, not *truth*:

- `DEFINE.md` **AC-1** states: `crc16("123456789") === "1D3D"`. **This is false** — the real
  value is `29B1` (independently confirmed). The agent confused the CCITT check value with
  the CRC of a different payload.
- `G_DEFINE` checked: sections present ✓, AC IDs match `/^AC-\d+$/` ✓, handoff valid ✓ →
  **passed.** It has no way to know the CRC value is wrong. A plausible-but-false spec sailed through.

What happened next is the interesting part:
1. ✅ **The build agent CAUGHT it** — because the AC was *executable*. It implemented CRC,
   the real value didn't match, and it **honestly documented the discrepancy** in the test
   file (citing crccalc.com, lammertbies.nl, the RevEng catalogue).
2. ⚠️ **It fixed the TEST but not the SPEC.** The test now correctly asserts `29B1` (+ adds a
   real `1D3D` vector). But `DEFINE.md` line 104 **still says the wrong "1D3D" for "123456789".**
   → **spec ↔ test/build drift**: the spec is still false, the implementation is right.
3. ❌ **G_BUILD and G_SHIP still reported "AC-1 met" / "all 8 acceptance criteria met"** —
   they match AC **IDs** to build results, **not the AC's literal text**. The harness
   certified "AC-1 met" while AC-1's stated claim remains factually false.

**Lesson:** executable ACs are self-healing (caught downstream — the saving grace). But the
gate certifies AC *identity*, not AC *content*, and nothing flags a build that silently
corrected a wrong spec. A non-executable false claim would have shipped uncaught.

---

## Phase-by-phase

### Phase 1 — DEFINE ✅ held (with the latent bug above)
- Drove the CLI cleanly: `spin init`→`state`→`next`→`schema show`→`order`→`validate`→
  `handoff-check`→`complete`→`gate G_DEFINE`. Self-describing enough to navigate without source — *except* the handoff schema.
- ⚠️ friction: prompt said `spin status`; real verb is `spin state` (exit 2). CLI suggested "Did you mean state?".
- ⚠️ friction: the gate's handoff requirement is implicit — `next`/`state` never say "this gate also needs `.handoffs/define.json`". Learned only by reading `sdd-gates.ts`.
- ⚠️ friction: `DefineHandoff` shape (clarity 0..1, `/^AC-\d+$/`) not surfaced by any command — only in the example JSON / source.

### Phase 2 — DESIGN ✅ held
- Clean drive; `spin schema show` revealed `[Overview, File Manifest, Decisions]` + `manifest_table:true`.
- ⚠️ friction (repeat): `spin status` again (2nd of 4 agents to hit it). Handoff schema again only in source.
- ⚠️ friction: md validator only recognizes `##` headers; a `### File Manifest` would silently fail the gate, undocumented.

### Phase 3 — BUILD ✅ held + caught the DEFINE bug
- Implemented zero-dep TS (crc16/tlv/generate/parse/index), 27 tests, all real-green. `G_BUILD` passed first try.
- ⭐ caught AC-1's wrong CRC (see star finding). Honest, well-cited.
- ⚠️ friction: circular import generate↔index resolved with `import type`; design didn't call it out.
- ⚠️ friction: dual handoff location (`design-handoff.json` sidecar **and** `.handoffs/design.json`) — unclear which `complete` reads.

### Phase 4 — SHIP ✅ held
- `G_SHIP` cleared ("all 8 acceptance criteria met"), SHIPPED.md authored. No friction reported — but it inherited the ID-not-content certification (see ❌ above).

---

## Friction tally
| # | Friction | Severity | Hits |
|---|---|---|---|
| F1 | `spin status` doesn't exist (verb is `state`) | low | 2/4 agents |
| F2 | Gate's required inputs (handoff path, schema shape) not discoverable via CLI — agents read source | **high** | every phase |
| F3 | `spin gate --help` lists flags for OTHER gates; no per-gate help | medium | 2 phases |
| F4 | md-section validator only accepts `##`; silent fail on `###` | medium | 1 phase |
| F5 | Dual handoff location (sidecar vs `.handoffs/`) undocumented | low | 1 phase |
| F6 | Gate certifies AC **IDs**, not AC **content**; no spec↔build drift detection | **high (gap #2)** | structural |

## Improvement candidates (→ the plan we build together)
- ✅ **I-A (F1) — SHIPPED:** `spin status` is now an alias of `spin state`.
- ✅ **I-B (F2) — SHIPPED:** `spin explain <GATE>` (declarative gate docs: reads / blocks_when / flags, with a coverage invariant test) + `spin schema show <handoff-id>` (Zod introspector prints the sidecar's field shape). An agent no longer reads source to learn a gate's contract.
- ✅ **I-C (F6, the deep one) — SHIPPED:** `BuildReportHandoff.results[]` gains `corrected_spec` + `correction`; the build command-doc requires flagging a corrected AC instead of burying it in a comment; `G_SHIP` appends a `⚠ … CORRECTED …` warning; `spin spec-drift --build <f>` exits 1 until DEFINE is reconciled (and the ship command-doc runs it). A green build can no longer silently leave a false spec behind.
- ⬜ **I-D (F4):** make the md validator's header-level failure explicit ("found '### X', gate requires '## X'"). *Deferred.*
- ⬜ **I-E (F3/F5):** per-gate `--help` + document the dual handoff path. *Partly covered by `spin explain`; rest deferred.*

**Result:** 213 tests green (24 new), `spin` guard clean, plugin bundle rebuilt. The three high-leverage gaps the dogfood surfaced are closed and verified live against the `spin` CLI.

---

# Run #2 — post-fix re-run (fresh project pix-brcode-2)

Same self-driven SDD cycle, now on the I-A/I-B/I-C harness. Run `wf_2c6fce06-f89`
(4 agents, ~348k tokens). The point: does the fix hold, and does new friction appear?

## ✅ The fixes demonstrably worked
- **F1/F2 closed — zero source-diving.** Every one of the 4 phases reported
  `read_source=false` and drove the cycle via the NEW introspection: `spin status`,
  `spin explain <gate>`, `spin schema show <handoff-id>`. In Run #1 the agents read
  `sdd-gates.ts` / `schemas.ts` **every phase**; in Run #2, **never**.
- **I-C worked end-to-end on a real, NEW drift.** The build found a *different*
  hallucinated value — DEFINE AC-4 stated the tag-26 outer length as `33`, the
  correct EMV length is `29` (18+11). This time the build **flagged it**
  (`corrected_spec=true` + note) instead of burying it in a comment; `G_SHIP`
  surfaced the ⚠; the ship agent **reconciled DEFINE.md** (33→29). The Run #1
  silent-drift failure **did not recur** — it was loud and reconciled. Independently
  verified: 58 tests pass, generated copia-e-cola CRC `60F8==60F8` (valid).

## ⚠ Two NEW gaps — in the fixes themselves (the loop continues)
- **G1 — `schema show` drops array-element constraints (residual F2).** The define
  agent's only retry: `spin schema show define` printed `criteria: array<string>`
  but **lost the `^AC-\d+$` per-item regex** (my describer keeps the element's
  *type* but discards its *constraints*). The agent put prose ACs in `criteria`, hit
  an opaque `criteria.N: Invalid`, and recovered by **probing `spin handoff-check`**
  (not reading source — good) — but the one constraint that would have prevented the
  retry is exactly the one `schema show` failed to surface.
- **G2 — `spec-drift` can't converge after reconciliation (I-C design hole).** After
  the ship agent corrected DEFINE.md, `spin spec-drift --build` **still exits 1** with
  AC-4 drifted — because it reads the build-report's `corrected_spec` flag, which
  updating DEFINE.md doesn't clear. There is no "reconciled" acknowledgment, so the
  loop never closes (the agent noticed: "DEFINE.md clearly contains 29, yet spec-drift
  reports exit 1"). Same shape as `reconcile.ts`'s `resolved_at_commit` — I-C needs the
  equivalent. Confirmed live: `spec-drift` still `clean:false drifted:[AC-4]` post-fix.

## Follow-up candidates
- ✅ **G1 — SHIPPED:** `spin schema show` now prints array-element constraints —
  `criteria` shows `['min 1 item(s)', 'items matches /^AC-\d+$/']` — and the
  DefineHandoff refinement carries a custom message ("expected a bare
  acceptance-criterion id like AC-1, no prose/colon/spaces"). The exact retry from
  run #2 is closed: verified live.
- ✅ **G2 — SHIPPED:** `BuildReportHandoff.results[]` gains `reconciled`; `specDrift`
  ignores a reconciled correction, so after DEFINE.md is fixed and the result is
  marked `reconciled: true`, `spin spec-drift` exits 0 — the loop converges. The
  ship command-doc spells out the 3-step reconciliation. Verified live on
  pix-brcode-2 (AC-4 went from `drifted` to `reconciled`, exit 1 → exit 0).
- ⬜ minor: `spin explain G_HANDOFF` exits 2 — the handoff check fires inside
  `spin complete`, not as a registered gate; the id shown in errors isn't explainable. *Deferred.*

**Run #2 result:** 217 tests green (+4), guard clean, plugin rebuilt. Both gaps the
post-fix run surfaced — in the fixes themselves — are closed and verified live. The
dogfood loop did its job twice: it proved the harness holds, then caught the holes in
its own repair.
