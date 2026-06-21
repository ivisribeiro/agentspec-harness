// Pure set-diff of DEFINE acceptance-criteria IDs vs BUILD results that passed.
// Backbone of G_BUILD / G_SHIP. No I/O, no markdown scraping — operates on IDs.

export interface CriteriaDiff {
  met: string[];
  unmet: string[];
  extra: string[]; // results referencing criteria not declared in DEFINE
}

/**
 * @param defined  acceptance-criteria IDs declared in DEFINE (e.g. ["AC-1","AC-2"])
 * @param passed   criteria IDs the BUILD report marks status=passed
 */
export function criteriaDiff(defined: string[], passed: string[]): CriteriaDiff {
  const definedSet = new Set(defined);
  const passedSet = new Set(passed);

  const met = defined.filter((id) => passedSet.has(id)).sort();
  const unmet = defined.filter((id) => !passedSet.has(id)).sort();
  const extra = passed.filter((id) => !definedSet.has(id)).sort();

  return { met, unmet, extra };
}

export function isFullyMet(diff: CriteriaDiff): boolean {
  return diff.unmet.length === 0;
}
