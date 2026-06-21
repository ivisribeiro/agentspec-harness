import { describe, it, expect } from 'vitest';
import { configDrift } from '../../src/core/config-drift.js';

// Tests for the pure configDrift function (dogfood improvement I9).
// configDrift(declared, present) => { missing: string[] }
// missing = declared ∖ present  (declared tools absent from the lockfile).

describe('configDrift — pure set-diff', () => {
  // ---- no drift -----------------------------------------------------------

  it('returns empty missing when declared is empty', () => {
    const r = configDrift([], ['ruff', 'pytest']);
    expect(r.missing).toEqual([]);
  });

  it('returns empty missing when all declared tools are present', () => {
    const r = configDrift(['ruff', 'pytest', 'mypy'], ['ruff', 'pytest', 'mypy', 'black']);
    expect(r.missing).toEqual([]);
  });

  it('returns empty missing when both arrays are empty', () => {
    const r = configDrift([], []);
    expect(r.missing).toEqual([]);
  });

  it('returns empty missing when declared and present are identical', () => {
    const r = configDrift(['vitest', 'eslint'], ['vitest', 'eslint']);
    expect(r.missing).toEqual([]);
  });

  // ---- drift detected -----------------------------------------------------

  it('flags a single declared tool absent from lockfile', () => {
    const r = configDrift(['ruff', 'pytest'], ['pytest']);
    expect(r.missing).toEqual(['ruff']);
  });

  it('flags multiple declared tools absent from lockfile', () => {
    const r = configDrift(['ruff', 'mypy', 'pytest'], ['pytest']);
    expect(r.missing).toEqual(['ruff', 'mypy']);
  });

  it('flags all declared tools when present is empty', () => {
    const r = configDrift(['tool-a', 'tool-b'], []);
    expect(r.missing).toEqual(['tool-a', 'tool-b']);
  });

  // ---- order + duplicates -------------------------------------------------

  it('preserves the order of declared when reporting missing', () => {
    const r = configDrift(['z-tool', 'a-tool', 'm-tool'], []);
    expect(r.missing).toEqual(['z-tool', 'a-tool', 'm-tool']);
  });

  it('tools in present but NOT in declared are ignored (not flagged)', () => {
    // present has extra tools — that is fine, not a drift
    const r = configDrift(['ruff'], ['ruff', 'extra-tool', 'another-extra']);
    expect(r.missing).toEqual([]);
  });

  it('is case-sensitive — "Ruff" !== "ruff"', () => {
    const r = configDrift(['Ruff'], ['ruff']);
    expect(r.missing).toEqual(['Ruff']);
  });

  it('handles duplicates in declared without double-reporting', () => {
    // If declared has a tool twice and it is absent, it appears twice in missing
    // (we preserve the declared array order faithfully, including duplicates).
    const r = configDrift(['ruff', 'ruff', 'pytest'], ['pytest']);
    expect(r.missing).toEqual(['ruff', 'ruff']);
  });
});

// ---- CLI integration via configDriftHandler --------------------------------

import { configDriftHandler } from '../../src/commands/handlers.js';

describe('configDriftHandler — CLI adapter', () => {
  it('exits 0 and returns empty missing when all declared are present', () => {
    const r = configDriftHandler({ declared: 'ruff,pytest', present: 'ruff,pytest,mypy' });
    expect(r.code).toBe(0);
    expect((r.json as { missing: string[] }).missing).toEqual([]);
  });

  it('exits 1 and lists missing when drift detected', () => {
    const r = configDriftHandler({ declared: 'ruff,pytest,mypy', present: 'pytest' });
    expect(r.code).toBe(1);
    expect((r.json as { missing: string[] }).missing).toEqual(['ruff', 'mypy']);
  });

  it('trims whitespace from comma-split items', () => {
    const r = configDriftHandler({ declared: ' ruff , pytest ', present: ' ruff , pytest ' });
    expect(r.code).toBe(0);
    expect((r.json as { missing: string[] }).missing).toEqual([]);
  });

  it('drops empty strings produced by trailing commas', () => {
    const r = configDriftHandler({ declared: 'ruff,', present: 'ruff' });
    expect(r.code).toBe(0);
    expect((r.json as { missing: string[] }).missing).toEqual([]);
  });

  it('exits 2 (usage) when --declared is missing', () => {
    const r = configDriftHandler({ present: 'ruff' });
    expect(r.code).toBe(2);
  });

  it('exits 2 (usage) when --present is missing', () => {
    const r = configDriftHandler({ declared: 'ruff' });
    expect(r.code).toBe(2);
  });

  it('exits 1 with all declared missing when present list is empty', () => {
    const r = configDriftHandler({ declared: 'tool-a,tool-b', present: '' });
    expect(r.code).toBe(1);
    expect((r.json as { missing: string[] }).missing).toEqual(['tool-a', 'tool-b']);
  });
});

// ---- BuildReportHandoff coverage field (pure-additive schema check) --------

import { checkHandoffObject } from '../../src/core/handoff/handoff-check.js';

describe('BuildReportHandoff coverage field (optional, additive)', () => {
  const base = {
    feature: 'auth',
    results: [{ criterion: 'AC-1', status: 'passed' }],
    files_written: ['src/auth.ts'],
  };

  it('validates without coverage field (backward compatible)', () => {
    const r = checkHandoffObject('build-report', base);
    expect(r.ok).toBe(true);
  });

  it('validates with a well-formed coverage field', () => {
    const r = checkHandoffObject('build-report', {
      ...base,
      coverage: { tool: 'vitest', pct: 87.5, threshold: 80 },
    });
    expect(r.ok).toBe(true);
  });

  it('rejects coverage with pct out of range', () => {
    const r = checkHandoffObject('build-report', {
      ...base,
      coverage: { tool: 'vitest', pct: 110, threshold: 80 },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects coverage with threshold out of range', () => {
    const r = checkHandoffObject('build-report', {
      ...base,
      coverage: { tool: 'vitest', pct: 80, threshold: -5 },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects coverage with empty tool string', () => {
    const r = checkHandoffObject('build-report', {
      ...base,
      coverage: { tool: '', pct: 80, threshold: 80 },
    });
    expect(r.ok).toBe(false);
  });
});
