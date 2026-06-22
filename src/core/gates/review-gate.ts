import * as fs from 'node:fs';
import { type GateContext, type GateResult, pass, block } from './types.js';
import { checkHandoffObject } from '../handoff/handoff-check.js';

// G_REVIEW_BLOCK — shared by /review and /migrate. Counts surviving CRITICAL
// findings over a validated Finding[] (after the adversarial pass). Security-
// critical: a cheaper tier is never the final judge of a CRITICAL finding.

interface FindingsShape {
  findings: Array<{ severity: string; file: string; rule: string; message: string; source: string }>;
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

  // Reject the wrong shape loudly — a flat finding object or a missing `findings`
  // key must NOT be silently treated as zero findings (that would drop CRITICALs).
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { findings?: unknown }).findings)
  ) {
    return block(
      gate,
      ['findings file must be an object with a "findings" array (got the wrong shape)'],
      ['findings-shape']
    );
  }

  const check = checkHandoffObject('finding', parsed);
  if (!check.ok) {
    return block(gate, [`findings do not match Finding contract: ${check.errors.join('; ')}`], [
      'findings-schema',
    ]);
  }

  const data = check.data as FindingsShape;

  // Optional independence floor: require >=N distinct review sources (set via --min-sources).
  // Prefer the machine-merged `sources` summary (from spin merge-findings) over the
  // per-finding source so a deduped set still reflects who actually reviewed. A single model
  // CAN still forge two source tags — true isolation is the orchestration layer's job — but
  // this raises the bar from "one reviewer" to "the artifact attributes >=N".
  const minSources = Number(ctx.args['min-sources'] ?? '1');
  if (Number.isFinite(minSources) && minSources > 1) {
    const summary = (parsed as { sources?: unknown }).sources;
    const distinct = Array.isArray(summary)
      ? [...new Set(summary as string[])]
      : [...new Set(data.findings.map((f) => f.source))];
    if (distinct.length < minSources) {
      return block(
        gate,
        [`requires >=${minSources} distinct review sources; got ${distinct.length} (${distinct.join(', ') || 'none'})`],
        ['insufficient-sources']
      );
    }
  }

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
