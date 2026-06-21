import { describe, it, expect } from 'vitest';
import { describeHandoff, listHandoffIds } from '../../../src/core/handoff/describe.js';
import { HANDOFF_SCHEMAS } from '../../../src/core/handoff/schemas.js';

describe('describeHandoff (Zod introspection)', () => {
  it('describes every handoff id without throwing', () => {
    for (const id of Object.keys(HANDOFF_SCHEMAS)) {
      const d = describeHandoff(id);
      expect(d, id).not.toBeNull();
      expect(d!.fields.length, id).toBeGreaterThan(0);
    }
  });

  it('returns null for an unknown id', () => {
    expect(describeHandoff('nope')).toBeNull();
  });

  it('captures required-ness, types, and constraints (define)', () => {
    const d = describeHandoff('define')!;
    const byName = Object.fromEntries(d.fields.map((f) => [f.name, f]));

    expect(byName.feature.type).toBe('string');
    expect(byName.feature.required).toBe(true);

    // clarity: number 0..1, required
    expect(byName.clarity.type).toBe('number');
    expect(byName.clarity.constraints).toEqual(expect.arrayContaining(['min 0', 'max 1']));

    // criteria: array<string> with the AC regex constraint
    expect(byName.criteria.type).toBe('array<string>');

    // open_questions has a default -> not required
    expect(byName.open_questions.required).toBe(false);
  });

  it('describes nested array-of-object element shape (design.manifest)', () => {
    const d = describeHandoff('design')!;
    const manifest = d.fields.find((f) => f.name === 'manifest')!;
    expect(manifest.type).toBe('array<object>');
    const elNames = (manifest.fields ?? []).map((f) => f.name).sort();
    expect(elNames).toEqual(['action', 'file', 'purpose']);
    const action = manifest.fields!.find((f) => f.name === 'action')!;
    expect(action.type).toBe('enum');
    expect(action.enumValues).toEqual(['create', 'modify', 'delete']);
  });

  it('surfaces the new build-report corrected_spec field (I-C)', () => {
    const d = describeHandoff('build-report')!;
    const results = d.fields.find((f) => f.name === 'results')!;
    const names = (results.fields ?? []).map((f) => f.name);
    expect(names).toContain('corrected_spec');
    expect(names).toContain('correction');
  });

  it('listHandoffIds matches the schema registry', () => {
    expect(listHandoffIds()).toEqual(Object.keys(HANDOFF_SCHEMAS).sort());
  });
});
