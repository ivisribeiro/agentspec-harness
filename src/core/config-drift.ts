// config-drift.ts — pure config-drift detection (dogfood improvement I9).
//
// configDrift performs a set-diff over two string arrays:
//
//   declared  — tools/env-vars declared in CI (your expected requirements)
//   present   — tools/env-vars found in the lockfile or conftest
//
// Returns `missing`: items that are declared (required by CI) but absent from
// the lockfile/conftest. An empty `missing` means no drift.
//
// This is a PURE function: no filesystem, no shell. The caller supplies the
// arrays (e.g. parsed from a CI config and a lockfile).

export interface ConfigDriftReport {
  /** Items declared (required by CI) but absent from the lockfile/conftest. */
  missing: string[];
}

/**
 * Pure set-diff: returns tools declared in CI that are absent from the lockfile.
 *
 * @param declared  - tools listed in the CI config (required)
 * @param present   - tools found in the lockfile / conftest (available)
 * @returns         - { missing } where missing = declared ∖ present
 */
export function configDrift(declared: string[], present: string[]): ConfigDriftReport {
  const presentSet = new Set(present);
  const missing = declared.filter((d) => !presentSet.has(d));
  return { missing };
}
