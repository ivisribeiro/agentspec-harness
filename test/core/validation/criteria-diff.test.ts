import { describe, it, expect } from 'vitest';
import { criteriaDiff, isFullyMet } from '../../../src/core/validation/criteria-diff.js';

describe('criteriaDiff', () => {
  it('computes met / unmet', () => {
    const d = criteriaDiff(['AC-1', 'AC-2', 'AC-3'], ['AC-1', 'AC-3']);
    expect(d.met).toEqual(['AC-1', 'AC-3']);
    expect(d.unmet).toEqual(['AC-2']);
    expect(isFullyMet(d)).toBe(false);
  });

  it('flags extra results not declared in DEFINE', () => {
    const d = criteriaDiff(['AC-1'], ['AC-1', 'AC-9']);
    expect(d.extra).toEqual(['AC-9']);
    expect(isFullyMet(d)).toBe(true);
  });

  it('is fully met when every criterion passed', () => {
    expect(isFullyMet(criteriaDiff(['AC-1', 'AC-2'], ['AC-2', 'AC-1']))).toBe(true);
  });

  it('handles an empty criteria set as fully met', () => {
    expect(isFullyMet(criteriaDiff([], []))).toBe(true);
  });
});
