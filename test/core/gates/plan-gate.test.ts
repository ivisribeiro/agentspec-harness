import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { gPlan } from '../../../src/core/gates/plan-gate.js';
import { GATE_REGISTRY } from '../../../src/core/gates/registry.js';
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

// A task whose detail names a real file path -> falsifiable signal present.
const concreteTask = {
  title: 'Add G_PLAN gate',
  detail: 'Create src/core/gates/plan-gate.ts and register it in registry.ts.',
  effort: 'M',
  domains: ['gates'],
};

// A task whose detail names a command -> falsifiable signal present.
const commandTask = {
  title: 'Verify suite',
  detail: 'Run make test and confirm the suite is green.',
  effort: 'S',
  domains: ['ci'],
};

// A task whose detail is pure prose -> NO falsifiable signal.
const vagueTask = {
  title: 'Improve the plan quality',
  detail: 'Make the planning experience much better and more robust overall.',
  effort: 'M',
  domains: ['planning'],
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-plan-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('G_PLAN', () => {
  it('is registered in GATE_REGISTRY', () => {
    expect(GATE_REGISTRY.G_PLAN).toBe(gPlan);
  });

  it('PASSES on a clean plan (falsifiable tasks, no over-bundling, blocking gaps addressed)', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [concreteTask, commandTask],
        gaps: [{ capability: 'plan-gate', why: 'no plan quality check', priority: 'blocking' }],
      })
    );
    expect(r.passed).toBe(true);
    expect(r.gate).toBe('G_PLAN');
    expect(r.reasons[0]).toMatch(/plan ok/);
  });

  it('PASSES when there are no tasks and no gaps (vacuously clean)', () => {
    const r = gPlan(ctxWithAudit({ domain: 'plan', built: [goodBuilt] }));
    expect(r.passed).toBe(true);
  });

  it('PASSES a task whose detail names a command (no path) as falsifiable', () => {
    const r = gPlan(
      ctxWithAudit({ domain: 'plan', built: [goodBuilt], proposedTasks: [commandTask] })
    );
    expect(r.passed).toBe(true);
  });

  // (a) vague-task -----------------------------------------------------------
  it('BLOCKS a task whose detail is vague prose with no file/command signal', () => {
    const r = gPlan(
      ctxWithAudit({ domain: 'plan', built: [goodBuilt], proposedTasks: [vagueTask] })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('vague-task:proposedTasks[0]');
    expect(r.reasons.some((m) => m.includes('vague acceptance'))).toBe(true);
  });

  it('does NOT mistake a prose abbreviation like "e.g." or a trailing period for a path signal', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [
          {
            title: 'Polish docs',
            detail: 'Clean up wording, e.g. shorten the intro and make it crisper overall.',
            effort: 'S',
            domains: ['docs'],
          },
        ],
      })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('vague-task:proposedTasks[0]');
  });

  it('only flags the vague task, not the concrete one beside it', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [concreteTask, vagueTask],
      })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('vague-task:proposedTasks[1]');
    expect(r.unmet).not.toContain('vague-task:proposedTasks[0]');
  });

  // (b) bundled-task ---------------------------------------------------------
  it('BLOCKS an L task bundling >1 domain', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [
          {
            title: 'IP2 cross-layer fix',
            detail: 'Touch src/api/routes.ts and ui/src/page.tsx and the replan loop.',
            effort: 'L',
            domains: ['backend', 'frontend', 'replan'],
          },
        ],
      })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('bundled-task:proposedTasks[0]');
    expect(r.reasons.some((m) => m.includes('bundles 3 domains'))).toBe(true);
  });

  it('BLOCKS an XL task bundling >1 domain', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [
          {
            title: 'Rewrite everything',
            detail: 'Refactor src/core/a.ts and src/core/b.ts together.',
            effort: 'XL',
            domains: ['core', 'storage'],
          },
        ],
      })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('bundled-task:proposedTasks[0]');
  });

  it('does NOT flag an L task confined to a single domain', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [
          {
            title: 'Big single-subsystem refactor',
            detail: 'Restructure src/core/gates/ end to end.',
            effort: 'L',
            domains: ['gates'],
          },
        ],
      })
    );
    expect(r.passed).toBe(true);
  });

  it('does NOT flag a small (S/M) task that spans multiple domains', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [
          {
            title: 'Small touch-up',
            detail: 'Tweak src/a.ts and src/b.ts copy.',
            effort: 'M',
            domains: ['a', 'b'],
          },
        ],
      })
    );
    expect(r.passed).toBe(true);
  });

  // (c) orphan-gap -----------------------------------------------------------
  it('BLOCKS a blocking gap that no task addresses (set-diff by capability words)', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [concreteTask], // talks about "G_PLAN gate"/registry, not reconciliation
        gaps: [
          {
            capability: 'reconciliation loop between docs and code',
            why: 'doc drift is invisible',
            priority: 'blocking',
          },
        ],
      })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('orphan-gap:gaps[0]');
    expect(r.reasons.some((m) => m.includes('reconciliation'))).toBe(true);
  });

  it('does NOT flag a blocking gap whose capability word appears in a task', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [
          {
            title: 'Add reconcile subcommand',
            detail: 'Create src/commands/reconcile.ts to set-diff docs vs code.',
            effort: 'M',
            domains: ['cli'],
          },
        ],
        gaps: [
          {
            capability: 'reconcile docs against code',
            why: 'doc drift',
            priority: 'blocking',
          },
        ],
      })
    );
    expect(r.passed).toBe(true);
  });

  it('ignores non-blocking gaps in the orphan set-diff', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [concreteTask],
        gaps: [
          { capability: 'fancy unaddressed extra', why: 'nice', priority: 'nice-to-have' },
          { capability: 'somewhat important orphan', why: 'meh', priority: 'important' },
        ],
      })
    );
    expect(r.passed).toBe(true);
  });

  it('reports all three violation types together when present', () => {
    const r = gPlan(
      ctxWithAudit({
        domain: 'plan',
        built: [goodBuilt],
        proposedTasks: [
          vagueTask, // (a)
          {
            title: 'bundled',
            detail: 'Edit src/x.ts and src/y.ts together.',
            effort: 'L',
            domains: ['x', 'y'], // (b)
          },
        ],
        gaps: [
          {
            capability: 'idempotency under repeated runs',
            why: 'reruns double-write',
            priority: 'blocking', // (c) — no task mentions idempotency
          },
        ],
      })
    );
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('vague-task:proposedTasks[0]');
    expect(r.unmet).toContain('bundled-task:proposedTasks[1]');
    expect(r.unmet).toContain('orphan-gap:gaps[0]');
    expect(r.unmet.length).toBe(3);
  });

  // sidecar resolution + schema (mirrors the sibling audit gates) ------------
  it('reads the sidecar from an explicit --audit arg', () => {
    const p = path.join(root, 'elsewhere.json');
    fs.writeFileSync(
      p,
      JSON.stringify({ domain: 'plan', built: [goodBuilt], proposedTasks: [vagueTask] })
    );
    const r = gPlan(baseCtx({ args: { audit: p } }));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('vague-task:proposedTasks[0]');
  });

  it('BLOCKS when the audit file is missing', () => {
    const r = gPlan(baseCtx({ handoffDir: path.join(root, '.handoffs') }));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-file');
  });

  it('BLOCKS when there is no handoff dir at all', () => {
    const r = gPlan(baseCtx());
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-file');
  });

  it('BLOCKS on invalid JSON', () => {
    const r = gPlan(ctxWithAudit('{ not json'));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-json');
  });

  it('BLOCKS when the audit violates the AuditHandoff schema', () => {
    // missing domain (required) -> schema rejection
    const r = gPlan(ctxWithAudit({ built: [goodBuilt], proposedTasks: [concreteTask] }));
    expect(r.passed).toBe(false);
    expect(r.unmet).toContain('audit-schema');
  });
});
