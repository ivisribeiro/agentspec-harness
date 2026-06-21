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

  it('handles an empty result set', () => {
    expect(specDrift([])).toEqual({ drifted: [], clean: true });
  });
});
