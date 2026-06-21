import { describe, it, expect } from 'vitest';
import { route, TASK_KINDS, UnknownTaskKindError, MODEL_IDS } from '../../../src/core/model-route/policy.js';

describe('model-route policy', () => {
  it('routes mechanical kinds to haiku', () => {
    expect(route('claim-extract').tier).toBe('haiku');
    expect(route('frontmatter-parse').tier).toBe('haiku');
    expect(route('ship-prose').tier).toBe('haiku');
  });

  it('routes authoring kinds to sonnet', () => {
    expect(route('code-build').tier).toBe('sonnet');
    expect(route('migration-plan').tier).toBe('sonnet');
  });

  it('routes critical kinds to opus', () => {
    expect(route('adversary').tier).toBe('opus');
    expect(route('architect').tier).toBe('opus');
    expect(route('review-judge').tier).toBe('opus');
  });

  it('NEVER downgrades a critical kind under --budget low', () => {
    for (const kind of ['adversary', 'architect', 'review-judge', 'equivalence-break', 'define-intent', 'design-intent']) {
      expect(route(kind, 'low').tier).toBe('opus');
    }
  });

  it('downgrades a gate-backstopped authoring kind under --budget low', () => {
    expect(route('code-build', 'low').tier).toBe('haiku');
    expect(route('kb-concept', 'low').tier).toBe('haiku');
  });

  it('does NOT downgrade an authoring kind that lacks a backstop', () => {
    expect(route('spec-authoring', 'low').tier).toBe('sonnet');
    expect(route('finding-analysis', 'low').tier).toBe('sonnet');
  });

  it('every kind resolves at or above its declared floor', () => {
    const rank = { haiku: 0, sonnet: 1, opus: 2 } as const;
    for (const [kind, def] of Object.entries(TASK_KINDS)) {
      const r = route(kind, 'low');
      expect(rank[r.tier]).toBeGreaterThanOrEqual(rank[def.floor]);
    }
  });

  it('maps tiers to concrete model ids', () => {
    expect(route('adversary').model).toBe(MODEL_IDS.opus);
    expect(route('code-build').model).toBe(MODEL_IDS.sonnet);
    expect(route('claim-extract').model).toBe(MODEL_IDS.haiku);
  });

  it('throws on unknown kinds', () => {
    expect(() => route('nonsense')).toThrow(UnknownTaskKindError);
  });
});
