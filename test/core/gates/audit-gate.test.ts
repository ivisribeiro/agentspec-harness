import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { gAudit } from '../../../src/core/gates/audit-gate.js';
import type { GateContext } from '../../../src/core/gates/types.js';

let root: string;

function baseCtx(over: Partial<GateContext> = {}): GateContext {
  return {
    root,
    args: {},
    runState: null,
    graph: null,
    featureDir: null,
    handoffDir: null,
    ...over,
  };
}

// Write an audit.json into a fresh handoff dir and return a ctx pointing at it.
function ctxWithAudit(audit: unknown): GateContext {
  const handoffDir = path.join(root, '.handoffs');
  fs.mkdirSync(handoffDir, { recursive: true });
  fs.writeFileSync(
    path.join(handoffDir, 'audit.json'),
    typeof audit === 'string' ? audit : JSON.stringify(audit)
  );
  return baseCtx({ handoffDir });
}

const goodBuilt = {
  item: 'RLS on tenant tables',
  evidence: { files: ['src/db/rls.sql'], proof: 'ENABLE ROW LEVEL SECURITY present' },
  status: 'proven',
};
const goodGap = { capability: 'rate limiting', why: 'brute force unbounded', priority: 'blocking' };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-audit-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('G_AUDIT', () => {
  it('PASSES a well-formed audit (evidenced built + prioritized gaps)', () => {
    const r = gAudit(ctxWithAudit({ domain: 'auth', built: [goodBuilt], gaps: [goodGap] }));
    expect(r.passed).toBe(true);
    expect(r.gate).toBe('G_AUDIT');
  });

  it('PASSES an audit with only built items (no gaps)', () => {
    const r = gAudit(ctxWithAudit({ domain: 'auth', built: [goodBuilt], gaps: [] }));
    expect(r.passed).toBe(true);
  });

  it('PASSES an audit with only gaps (nothing built yet)', () => {
    const r = gAudit(ctxWithAudit({ domain: 'auth', built: [], gaps: [goodGap] }));
    expect(r.passed).toBe(true);
  });

  it('reads the sidecar from an explicit --handoff arg', () => {
    const p = path.join(root, 'somewhere.json');
    fs.writeFileSync(p, JSON.stringify({ domain: 'auth', built: [goodBuilt], gaps: [goodGap] }));
    const r = gAudit(baseCtx({ args: { handoff: p } }));
    expect(r.passed).toBe(true);
  });

  it('BLOCKS when the audit file is missing', () => {
    const r = gAudit(baseCtx({ handoffDir: path.join(root, '.handoffs') }));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-file');
  });

  it('BLOCKS when there is no handoff dir at all', () => {
    const r = gAudit(baseCtx());
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-file');
  });

  it('BLOCKS on invalid JSON', () => {
    const r = gAudit(ctxWithAudit('{ not json'));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-json');
  });

  it('BLOCKS when the audit violates the AuditHandoff schema', () => {
    // missing domain (required) -> schema rejection
    const r = gAudit(ctxWithAudit({ built: [goodBuilt], gaps: [goodGap] }));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-schema');
  });

  it('BLOCKS an empty audit (zero built AND zero gaps)', () => {
    const r = gAudit(ctxWithAudit({ domain: 'auth', built: [], gaps: [] }));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-empty');
  });

  it('BLOCKS a built item with empty evidence.files', () => {
    const r = gAudit(
      ctxWithAudit({
        domain: 'auth',
        built: [{ item: 'x', evidence: { files: [], proof: 'some proof' }, status: 'proven' }],
        gaps: [goodGap],
      })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('built[0]:evidence.files');
  });

  it('BLOCKS a built item with empty evidence.proof', () => {
    const r = gAudit(
      ctxWithAudit({
        domain: 'auth',
        built: [{ item: 'x', evidence: { files: ['a.ts'], proof: '   ' }, status: 'proven' }],
        gaps: [goodGap],
      })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('built[0]:evidence.proof');
  });

  it('BLOCKS a gap missing its priority (schema rejection, surfaced as audit-schema)', () => {
    const r = gAudit(
      ctxWithAudit({
        domain: 'auth',
        built: [goodBuilt],
        gaps: [{ capability: 'rate limiting', why: 'brute force' }],
      })
    );
    expect(r.passed).toBe(false);
    // The Zod enum rejects the missing priority before the gate's own loop runs.
    expect(r.unmet).toContain('audit-schema');
  });
});
