import * as fs from 'node:fs';
import { type GateContext, type GateResult, pass, block } from './types.js';
import { checkHandoffObject } from '../handoff/handoff-check.js';

// G_REVIEW_BLOCK — shared by /review and /migrate. Counts surviving CRITICAL
// findings over a validated Finding[] (after the adversarial pass). Security-
// critical: a cheaper tier is never the final judge of a CRITICAL finding.

interface FindingsShape {
  findings: Array<{ severity: string; file: string; rule: string; message: string }>;
}

export function gReviewBlock(ctx: GateContext): GateResult {
  const gate = 'G_REVIEW_BLOCK';
  const findingsPath = ctx.args.findings;

  if (!findingsPath || !fs.existsSync(findingsPath)) {
    return block(gate, [`findings file not found: ${findingsPath ?? '(unset)'}`], ['findings-file']);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(findingsPath, 'utf-8'));
  } catch {
    return block(gate, [`findings file is not valid JSON: ${findingsPath}`], ['findings-json']);
  }

  const check = checkHandoffObject('finding', parsed);
  if (!check.ok) {
    return block(gate, [`findings do not match Finding contract: ${check.errors.join('; ')}`], [
      'findings-schema',
    ]);
  }

  const data = check.data as FindingsShape;
  const critical = data.findings.filter((f) => f.severity === 'critical');
  if (critical.length > 0) {
    return block(
      gate,
      critical.map((f) => `CRITICAL: ${f.rule} @ ${f.file} — ${f.message}`),
      critical.map((f) => `${f.file}:${f.rule}`)
    );
  }
  return pass(gate, [`no surviving CRITICAL findings over ${data.findings.length} total`]);
}
