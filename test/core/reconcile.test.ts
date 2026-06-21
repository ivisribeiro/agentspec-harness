import { describe, it, expect } from 'vitest';
import { reconcileAudit, type BuiltItem, type AuditLike } from '../../src/core/reconcile.js';

// Helper: build a minimal BuiltItem with sensible defaults.
function item(overrides: Partial<BuiltItem> & { item: string }): BuiltItem {
  return {
    status: 'proven',
    verified_in_code: false,
    resolved_at_commit: null,
    ...overrides,
  };
}

describe('reconcileAudit — pure set-diff over built[] items', () => {
  it('returns empty buckets for an empty audit', () => {
    const r = reconcileAudit({ built: [] });
    expect(r.inconsistent).toEqual([]);
    expect(r.drift_open).toEqual([]);
    expect(r.silently_fixed).toEqual([]);
  });

  // ---- inconsistent bucket -----------------------------------------------

  it('flags verified_in_code=true with no commit as inconsistent', () => {
    const r = reconcileAudit({
      built: [item({ item: 'RLS', verified_in_code: true, resolved_at_commit: null })],
    });
    expect(r.inconsistent).toEqual(['RLS']);
    expect(r.drift_open).toEqual([]);
    expect(r.silently_fixed).toEqual([]);
  });

  it('flags verified_in_code=true with undefined commit as inconsistent', () => {
    const r = reconcileAudit({
      built: [
        {
          item: 'auth-bypass',
          status: 'proven',
          verified_in_code: true,
          // resolved_at_commit deliberately absent
        } as BuiltItem,
      ],
    });
    expect(r.inconsistent).toEqual(['auth-bypass']);
  });

  it('flags verified_in_code=true with empty-string commit as inconsistent', () => {
    const r = reconcileAudit({
      built: [item({ item: 'X', verified_in_code: true, resolved_at_commit: '' })],
    });
    expect(r.inconsistent).toEqual(['X']);
  });

  // ---- drift_open bucket -------------------------------------------------

  it('flags status=proven with verified_in_code=false as drift_open', () => {
    const r = reconcileAudit({
      built: [item({ item: 'rate-limit', status: 'proven', verified_in_code: false })],
    });
    expect(r.drift_open).toEqual(['rate-limit']);
    expect(r.inconsistent).toEqual([]);
    expect(r.silently_fixed).toEqual([]);
  });

  it('does NOT flag status=partial as drift_open even when verified_in_code=false', () => {
    const r = reconcileAudit({
      built: [item({ item: 'migration', status: 'partial', verified_in_code: false })],
    });
    expect(r.drift_open).toEqual([]);
    expect(r.inconsistent).toEqual([]);
  });

  it('does NOT flag status=scaffolded as drift_open', () => {
    const r = reconcileAudit({
      built: [item({ item: 'stub', status: 'scaffolded', verified_in_code: false })],
    });
    expect(r.drift_open).toEqual([]);
  });

  // ---- silently_fixed bucket ---------------------------------------------

  it('classifies commit+verified as silently_fixed', () => {
    const r = reconcileAudit({
      built: [
        item({ item: 'csrf-guard', verified_in_code: true, resolved_at_commit: 'abc1234' }),
      ],
    });
    expect(r.silently_fixed).toEqual(['csrf-guard']);
    expect(r.inconsistent).toEqual([]);
    expect(r.drift_open).toEqual([]);
  });

  it('silently_fixed even when status is partial (commit+verified wins)', () => {
    const r = reconcileAudit({
      built: [
        item({
          item: 'rls-policy',
          status: 'partial',
          verified_in_code: true,
          resolved_at_commit: 'deadbeef',
        }),
      ],
    });
    expect(r.silently_fixed).toEqual(['rls-policy']);
  });

  // ---- normal in-progress items (no bucket) ------------------------------

  it('unremarkable in-progress item (partial, no commit, not verified) lands in no bucket', () => {
    const r = reconcileAudit({
      built: [item({ item: 'wip', status: 'partial', verified_in_code: false, resolved_at_commit: null })],
    });
    expect(r.inconsistent).toEqual([]);
    expect(r.drift_open).toEqual([]);
    expect(r.silently_fixed).toEqual([]);
  });

  it('scaffolded with commit but not verified lands in no bucket', () => {
    // commit alone without verified_in_code doesn't mean anything special
    const r = reconcileAudit({
      built: [
        item({ item: 'placeholder', status: 'scaffolded', verified_in_code: false, resolved_at_commit: 'xyz' }),
      ],
    });
    // The only special case for "has commit AND not verified" that matters is
    // status=proven (drift_open) — scaffolded stays unremarkable.
    expect(r.inconsistent).toEqual([]);
    expect(r.drift_open).toEqual([]);
    expect(r.silently_fixed).toEqual([]);
  });

  // ---- mixed audit -------------------------------------------------------

  it('correctly partitions a mixed audit into all three buckets', () => {
    const audit: AuditLike = {
      built: [
        // inconsistent: claimed verified but no commit
        item({ item: 'A', verified_in_code: true, resolved_at_commit: null, status: 'proven' }),
        // drift_open: proven but not verified
        item({ item: 'B', status: 'proven', verified_in_code: false, resolved_at_commit: null }),
        // silently_fixed: both commit and verified
        item({ item: 'C', verified_in_code: true, resolved_at_commit: 'c0ffee', status: 'proven' }),
        // unremarkable wip
        item({ item: 'D', status: 'partial', verified_in_code: false, resolved_at_commit: null }),
        // another drift_open
        item({ item: 'E', status: 'proven', verified_in_code: false }),
      ],
    };
    const r = reconcileAudit(audit);
    expect(r.inconsistent).toEqual(['A']);
    expect(r.drift_open).toEqual(['B', 'E']);
    expect(r.silently_fixed).toEqual(['C']);
  });

  it('buckets are disjoint — no item appears in more than one bucket', () => {
    const audit: AuditLike = {
      built: [
        item({ item: 'A', verified_in_code: true, resolved_at_commit: null }),
        item({ item: 'B', status: 'proven', verified_in_code: false }),
        item({ item: 'C', verified_in_code: true, resolved_at_commit: 'sha' }),
        item({ item: 'D', status: 'partial', verified_in_code: false }),
      ],
    };
    const r = reconcileAudit(audit);
    const all = [...r.inconsistent, ...r.drift_open, ...r.silently_fixed];
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });
});
