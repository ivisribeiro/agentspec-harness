# AUDIT: {Domain / Subsystem}

> Brownfield inventory of an existing codebase. Every "built" claim carries
> file+line evidence and a status; every gap carries a priority. The typed
> `audit.json` sidecar (AuditHandoff) is the source of truth — this Markdown is
> the human-readable rendering of it. `spin` runs `G_AUDIT` over the sidecar.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Domain** | {DOMAIN} |
| **Date** | {YYYY-MM-DD} |
| **Auditor** | {agent / human} |
| **Handoff** | `audit.json` (AuditHandoff) |

---

## Built

What already exists and works. Each item names the evidence (files + lines + a
proof string) and a status of `proven` (verified in code), `partial`, or
`scaffolded` (present but inert/incomplete).

| Item | Status | Evidence (files) | Proof | Resolved at commit | Verified in code |
|------|--------|------------------|-------|--------------------|------------------|
| {what was built} | proven / partial / scaffolded | `path/a.ts`, `path/b.ts` | {one-line proof} | {sha or —} | {yes/no} |

---

## Weak Points

Existing code that works but is fragile, bypassable, or surprising. Severity is
`critical` / `high` / `medium` / `low`.

| Item | Severity | Evidence |
|------|----------|----------|
| {weak point} | high | {file + why it is weak} |

---

## Gaps

Capabilities that do NOT exist yet. Priority is `blocking` / `important` /
`nice-to-have`.

| Capability | Priority | Why |
|------------|----------|-----|
| {missing capability} | blocking | {why it matters} |

---

## Ops Readiness

"Code is complete but inert pending config" — flags with insecure defaults whose
production override was not verified in an env file. `enforced=false` means the
prod value was NOT confirmed.

| Control | Code default | Prod value required | Env files checked | Enforced |
|---------|--------------|---------------------|-------------------|----------|
| {FLAG_NAME} | false | true | `deploy/.env` | no |

---

## Invariants at Risk

System invariants acknowledged in a comment/PR but not protected by a test
(isolation / idempotency / concurrency / survives-redeploy):

- {invariant} — {why it is at risk}

---

## Test Tiers

| Tier | What runs |
|------|-----------|
| **unit** | {always-passes-offline suite} |
| **infra_bound** | {tests that need live Postgres / S3 / etc.} |

---

## Proposed Tasks

The typed bridge into `/define`. Each task names an effort, optional dependency,
external preconditions, and the domains it spans. A task spanning >1 domain MUST
be decomposed during `/design`.

| Title | Effort | Depends on | External preconditions | Domains |
|-------|--------|------------|------------------------|---------|
| {task} | S / M / L / XL | {other task or —} | {precondition or —} | {domain(s)} |

---

## Next Step

**Ready for:** `/define` — distill the blocking proposedTasks into AC-n criteria.
