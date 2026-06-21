import * as fs from 'node:fs';
import * as path from 'node:path';
import { type GateContext, type GateResult, pass, block } from './types.js';
import { checkHandoffObject } from '../handoff/handoff-check.js';

// G_AUDIT — guards the brownfield `audit` artifact. Reads the audit handoff
// sidecar (handoffDir/audit.json) and BLOCKS when the inventory is not
// evidence-backed: any built[] item missing evidence.files or evidence.proof,
// any gap without a priority, or an empty audit (zero built AND zero gaps).
// This is what makes "the LLM wrote 'done' in prose" un-gameable for an audit.

interface AuditShape {
  built: Array<{ item: string; evidence: { files: string[]; proof: string } }>;
  gaps: Array<{ capability: string; priority: string }>;
}

const VALID_PRIORITIES = new Set(['blocking', 'important', 'nice-to-have']);

export function gAudit(ctx: GateContext): GateResult {
  const gate = 'G_AUDIT';

  // The audit sidecar can be pointed at explicitly via --handoff, else it lives
  // in the feature's handoff dir as audit.json.
  const explicit = ctx.args.handoff;
  const auditPath = explicit
    ? explicit
    : ctx.handoffDir
      ? path.join(ctx.handoffDir, 'audit.json')
      : null;

  if (!auditPath || !fs.existsSync(auditPath)) {
    return block(gate, [`audit handoff not found: ${auditPath ?? '(no handoff dir)'}`], ['audit-file']);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
  } catch {
    return block(gate, [`audit handoff is not valid JSON: ${auditPath}`], ['audit-json']);
  }

  const check = checkHandoffObject('audit', parsed);
  if (!check.ok) {
    return block(
      gate,
      [`audit does not match AuditHandoff contract: ${check.errors.join('; ')}`],
      ['audit-schema']
    );
  }

  const data = check.data as AuditShape;
  const reasons: string[] = [];
  const unmet: string[] = [];

  // An empty audit (nothing built AND no gaps) is not an audit.
  if (data.built.length === 0 && data.gaps.length === 0) {
    return block(gate, ['empty audit: zero built items and zero gaps'], ['audit-empty']);
  }

  // Every built item must carry evidence: at least one file AND a non-empty proof.
  data.built.forEach((b, i) => {
    const label = b.item || `built[${i}]`;
    if (b.evidence.files.length === 0) {
      reasons.push(`built item "${label}" has no evidence files`);
      unmet.push(`built[${i}]:evidence.files`);
    }
    if (b.evidence.proof.trim() === '') {
      reasons.push(`built item "${label}" has no evidence proof`);
      unmet.push(`built[${i}]:evidence.proof`);
    }
  });

  // Every gap must carry a valid priority. (The Zod enum already rejects bad
  // values, so this also covers any defensive future loosening of the schema.)
  data.gaps.forEach((g, i) => {
    const label = g.capability || `gaps[${i}]`;
    if (!g.priority || !VALID_PRIORITIES.has(g.priority)) {
      reasons.push(`gap "${label}" lacks a valid priority`);
      unmet.push(`gaps[${i}]:priority`);
    }
  });

  if (unmet.length > 0) {
    return block(gate, reasons, unmet);
  }

  return pass(gate, [
    `audit ok: ${data.built.length} built (all evidenced), ${data.gaps.length} gaps (all prioritized)`,
  ]);
}
