import { describe, it, expect } from 'vitest';
import { explainGate, gateDocsCoverage, GATE_DOCS } from '../../../src/core/gates/gate-docs.js';
import { listGates } from '../../../src/core/gates/registry.js';

describe('gate docs', () => {
  it('documents every registered gate and nothing extra', () => {
    const { undocumented, orphaned } = gateDocsCoverage();
    expect(undocumented).toEqual([]);
    expect(orphaned).toEqual([]);
  });

  it('explainGate returns the doc for a known gate', () => {
    const doc = explainGate('G_DEFINE');
    expect(doc).not.toBeNull();
    expect(doc!.gate).toBe('G_DEFINE');
    expect(doc!.handoff).toBe('define');
    expect(doc!.flags).toEqual([]); // SDD gates read from disk, take no flags
    expect(doc!.reads.join(' ')).toContain('define.json');
  });

  it('explainGate returns null for an unknown gate', () => {
    expect(explainGate('G_NOPE')).toBeNull();
  });

  it('flag-taking gates name their flags', () => {
    expect(explainGate('G_ROUTER_COVERAGE')!.flags.join(' ')).toContain('--agents');
    expect(explainGate('G_REVIEW_BLOCK')!.flags.join(' ')).toContain('--findings');
    expect(explainGate('G_AUDIT')!.flags.join(' ')).toContain('--handoff');
  });

  it('each doc has a non-empty purpose, reads, and blocks_when', () => {
    for (const id of listGates()) {
      const doc = GATE_DOCS[id];
      expect(doc.purpose.length, id).toBeGreaterThan(0);
      expect(doc.reads.length, id).toBeGreaterThan(0);
      expect(doc.blocks_when.length, id).toBeGreaterThan(0);
    }
  });
});
