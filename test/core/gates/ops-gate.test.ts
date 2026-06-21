import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { gOpsConfig } from '../../../src/core/gates/ops-gate.js';
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

const enforcedControl = {
  control: 'runner-use-bundles',
  code_default: 'false',
  prod_value_required: 'true',
  env_files_checked: ['deploy/prod/.env'],
  enforced: true,
};

const inertControl = {
  control: 'RLS_ENFORCE',
  code_default: 'false (superuser bypasses)',
  prod_value_required: 'true + non-superuser role',
  env_files_checked: ['deploy/prod/.env'],
  enforced: false,
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-ops-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('G_OPS_CONFIG', () => {
  it('PASSES when every ops-readiness control is enforced', () => {
    const r = gOpsConfig(
      ctxWithAudit({ domain: 'ops', built: [goodBuilt], opsReadiness: [enforcedControl] })
    );
    expect(r.passed).toBe(true);
    expect(r.gate).toBe('G_OPS_CONFIG');
    expect(r.reasons[0]).toMatch(/1 control/);
  });

  it('PASSES when no ops-readiness controls are present', () => {
    const r = gOpsConfig(ctxWithAudit({ domain: 'ops', built: [goodBuilt], opsReadiness: [] }));
    expect(r.passed).toBe(true);
    expect(r.reasons[0]).toMatch(/no ops-readiness controls/);
  });

  it('PASSES when opsReadiness is omitted entirely (defaults to [])', () => {
    const r = gOpsConfig(ctxWithAudit({ domain: 'ops', built: [goodBuilt] }));
    expect(r.passed).toBe(true);
  });

  it('BLOCKS when any control has enforced=false', () => {
    const r = gOpsConfig(
      ctxWithAudit({ domain: 'ops', built: [goodBuilt], opsReadiness: [inertControl] })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet.length).toBe(1);
  });

  it('BLOCKS and lists the offending control in unmet + reasons', () => {
    const r = gOpsConfig(
      ctxWithAudit({
        domain: 'ops',
        built: [goodBuilt],
        opsReadiness: [enforcedControl, inertControl],
      })
    );
    expect(r.passed).toBe(false);
    // Only the un-enforced control is named; the enforced one is not flagged.
    expect(r.unmet).toContain('opsReadiness[1]:RLS_ENFORCE');
    expect(r.unmet).not.toContain('opsReadiness[0]:runner-use-bundles');
    expect(r.reasons.some((m) => m.includes('RLS_ENFORCE'))).toBe(true);
    expect(r.reasons.some((m) => m.includes('not verified'))).toBe(true);
  });

  it('reads the sidecar from an explicit --audit arg', () => {
    const p = path.join(root, 'elsewhere.json');
    fs.writeFileSync(
      p,
      JSON.stringify({ domain: 'ops', built: [goodBuilt], opsReadiness: [inertControl] })
    );
    const r = gOpsConfig(baseCtx({ args: { audit: p } }));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('opsReadiness[0]:RLS_ENFORCE');
  });

  it('BLOCKS when the audit file is missing', () => {
    const r = gOpsConfig(baseCtx({ handoffDir: path.join(root, '.handoffs') }));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-file');
  });

  it('BLOCKS when there is no handoff dir at all', () => {
    const r = gOpsConfig(baseCtx());
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-file');
  });

  it('BLOCKS on invalid JSON', () => {
    const r = gOpsConfig(ctxWithAudit('{ not json'));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-json');
  });

  it('BLOCKS when the audit violates the AuditHandoff schema', () => {
    // missing domain (required) -> schema rejection
    const r = gOpsConfig(ctxWithAudit({ built: [goodBuilt], opsReadiness: [enforcedControl] }));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-schema');
  });
});
