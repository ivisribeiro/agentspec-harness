import { describe, it, expect } from 'vitest';
import { specDrift } from '../../src/core/spec-drift.js';

describe('specDrift', () => {
  it('is clean when nothing was corrected', () => {
    const r = specDrift([
      { criterion: 'AC-1', status: 'passed' },
      { criterion: 'AC-2', status: 'passed', corrected_spec: false },
    ]);
    expect(r.clean).toBe(true);
    expect(r.drifted).toEqual([]);
  });

  it('flags a corrected criterion with its note', () => {
    const r = specDrift([
      { criterion: 'AC-1', status: 'passed', corrected_spec: true, correction: 'CRC is 29B1 not 1D3D' },
      { criterion: 'AC-2', status: 'passed' },
    ]);
    expect(r.clean).toBe(false);
    expect(r.drifted).toEqual([{ criterion: 'AC-1', correction: 'CRC is 29B1 not 1D3D' }]);
  });

  it('falls back to a placeholder when no correction note is given', () => {
    const r = specDrift([{ criterion: 'AC-3', status: 'passed', corrected_spec: true }]);
    expect(r.clean).toBe(false);
    expect(r.drifted[0].correction).toContain('no correction note');
  });

  it('converges once a correction is reconciled into DEFINE (G2)', () => {
    const r = specDrift([
      { criterion: 'AC-1', status: 'passed', corrected_spec: true, correction: 'x', reconciled: true },
    ]);
    expect(r.clean).toBe(true); // reconciled corrections no longer count as drift
    expect(r.drifted).toEqual([]);
    expect(r.reconciled).toEqual(['AC-1']);
  });

  it('a still-unreconciled correction keeps blocking even when another is reconciled', () => {
    const r = specDrift([
      { criterion: 'AC-1', status: 'passed', corrected_spec: true, reconciled: true },
      { criterion: 'AC-2', status: 'passed', corrected_spec: true, correction: 'still wrong' },
    ]);
    expect(r.clean).toBe(false);
    expect(r.drifted.map((d) => d.criterion)).toEqual(['AC-2']);
    expect(r.reconciled).toEqual(['AC-1']);
  });

  it('handles an empty result set', () => {
    expect(specDrift([])).toEqual({ drifted: [], reconciled: [], clean: true });
  });
});
