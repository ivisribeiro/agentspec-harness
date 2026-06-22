import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { buildGateContext, runGate } from '../gates/gate-runner.js';
import { listGates } from '../gates/registry.js';

// `spin eval` — the harness evaluating ITSELF. A corpus of recorded fixtures, each
// declaring a gate, its inputs, and the EXPECTED verdict. We replay every case
// through the REAL gate function and assert the re-computed verdict matches. A code
// change that makes a gate stop blocking what it used to block is a regression the
// corpus catches. This is 100% deterministic and offline — no model, no network —
// so it is the purest possible eval: of the harness, not of an LLM.

export const EvalCaseSchema = z.object({
  id: z.string().min(1),
  gate: z.string().min(1),
  expect: z.enum(['pass', 'block']),
  // Arg file paths handed to the gate (e.g. {findings:"findings.json"}), resolved
  // relative to the case directory. A state-coupled gate (G_DEFINE...) instead reads
  // a `.spindle/` tree inside the case dir — both work, the case dir IS the gate root.
  args: z.record(z.string(), z.string()).default({}),
  note: z.string().optional(),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export interface EvalCaseResult {
  id: string;
  gate: string;
  expect: 'pass' | 'block';
  actual: 'pass' | 'block' | 'error';
  ok: boolean;
  detail: string;
}

export interface EvalCoverage {
  registry_gates: string[];
  covered: string[];
  uncovered: string[];
  missing_pass: string[];
  missing_block: string[];
  complete: boolean; // every registry gate has at least one pass AND one block case
}

export interface EvalReport {
  corpus: string;
  total: number;
  ok: number;
  failed: number;
  results: EvalCaseResult[];
  regressions: EvalCaseResult[];
  coverage: EvalCoverage;
}

export class EvalError extends Error {}

/** Find every case.json under the corpus (one per case directory). */
function findCaseFiles(corpusDir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(corpusDir)) return out;
  for (const entry of fs.readdirSync(corpusDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const caseFile = path.join(corpusDir, entry.name, 'case.json');
    if (fs.existsSync(caseFile)) out.push(caseFile);
  }
  return out.sort();
}

function evalOne(caseFile: string): EvalCaseResult {
  const caseDir = path.dirname(caseFile);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(caseFile, 'utf-8'));
  } catch {
    return { id: path.basename(caseDir), gate: '?', expect: 'pass', actual: 'error', ok: false, detail: `case.json is not valid JSON` };
  }
  const parsed = EvalCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      id: path.basename(caseDir),
      gate: '?',
      expect: 'pass',
      actual: 'error',
      ok: false,
      detail: `invalid case.json: ${parsed.error.issues.map((e) => e.message).join('; ')}`,
    };
  }
  const c = parsed.data;

  // Resolve arg file paths relative to the case dir; the case dir is the gate root.
  const resolvedArgs: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.args)) {
    resolvedArgs[k] = path.isAbsolute(v) ? v : path.join(caseDir, v);
  }

  try {
    const ctx = buildGateContext(caseDir, resolvedArgs);
    const res = runGate(c.gate, ctx);
    const actual: 'pass' | 'block' = res.passed ? 'pass' : 'block';
    return {
      id: c.id,
      gate: c.gate,
      expect: c.expect,
      actual,
      ok: actual === c.expect,
      detail: res.reasons.join('; '),
    };
  } catch (e) {
    return { id: c.id, gate: c.gate, expect: c.expect, actual: 'error', ok: false, detail: (e as Error).message };
  }
}

function computeCoverage(results: EvalCaseResult[]): EvalCoverage {
  const registry = listGates();
  const passByGate = new Set<string>();
  const blockByGate = new Set<string>();
  for (const r of results) {
    if (r.expect === 'pass') passByGate.add(r.gate);
    if (r.expect === 'block') blockByGate.add(r.gate);
  }
  const covered = registry.filter((g) => passByGate.has(g) || blockByGate.has(g));
  const uncovered = registry.filter((g) => !passByGate.has(g) && !blockByGate.has(g));
  const missing_pass = registry.filter((g) => !passByGate.has(g));
  const missing_block = registry.filter((g) => !blockByGate.has(g));
  return {
    registry_gates: registry,
    covered,
    uncovered,
    missing_pass,
    missing_block,
    complete: missing_pass.length === 0 && missing_block.length === 0,
  };
}

export function runEvalCorpus(corpusDir: string): EvalReport {
  const caseFiles = findCaseFiles(corpusDir);
  const results = caseFiles.map(evalOne);
  const regressions = results.filter((r) => !r.ok);
  return {
    corpus: corpusDir,
    total: results.length,
    ok: results.length - regressions.length,
    failed: regressions.length,
    results,
    regressions,
    coverage: computeCoverage(results),
  };
}
