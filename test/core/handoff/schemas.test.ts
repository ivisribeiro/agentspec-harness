import { describe, it, expect } from 'vitest';
import { checkHandoffObject } from '../../../src/core/handoff/handoff-check.js';

describe('handoff contracts', () => {
  it('accepts a valid define handoff', () => {
    const r = checkHandoffObject('define', {
      feature: 'auth',
      clarity: 0.9,
      criteria: ['AC-1', 'AC-2'],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects a define handoff with zero criteria', () => {
    const r = checkHandoffObject('define', { feature: 'auth', clarity: 0.9, criteria: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects malformed criteria ids', () => {
    const r = checkHandoffObject('define', { feature: 'a', clarity: 1, criteria: ['crit-1'] });
    expect(r.ok).toBe(false);
  });

  it('accepts a valid design handoff with a manifest', () => {
    const r = checkHandoffObject('design', {
      feature: 'auth',
      manifest: [{ file: 'src/a.ts', action: 'create', purpose: 'x' }],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects a design handoff with an empty manifest', () => {
    const r = checkHandoffObject('design', { feature: 'auth', manifest: [] });
    expect(r.ok).toBe(false);
  });

  it('validates finding severity enum', () => {
    const good = checkHandoffObject('finding', {
      findings: [{ file: 'a.ts', severity: 'critical', rule: 'X', message: 'm', source: 'sec' }],
    });
    expect(good.ok).toBe(true);
    const bad = checkHandoffObject('finding', {
      findings: [{ file: 'a.ts', severity: 'apocalyptic', rule: 'X', message: 'm', source: 'sec' }],
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects an unknown handoff schema id', () => {
    const r = checkHandoffObject('does-not-exist', {});
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('unknown handoff schema');
  });
});
