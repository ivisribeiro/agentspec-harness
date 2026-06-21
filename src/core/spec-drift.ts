// spec-drift — the deterministic half of dogfood improvement I-C (friction F6).
//
// The gates certify acceptance-criterion IDs, not their CONTENT: G_BUILD / G_SHIP
// confirm "AC-1 was marked passed", never that AC-1's stated value is true. In the
// pix-brcode dogfood run, DEFINE.md AC-1 asserted a wrong CRC ("1D3D"); the build
// implemented the correct value ("29B1") and quietly diverged, leaving the spec
// false while every gate stayed green.
//
// The fix is not to make the spine verify arbitrary claims (it can't). It is to
// make the divergence IMPOSSIBLE TO HIDE: the build-report flags `corrected_spec`
// on any criterion it implemented against a wrong stated value, and this pure
// function surfaces those so `spin spec-drift` (and G_SHIP) can demand the DEFINE
// be reconciled before the feature is considered clean.

export interface BuildResult {
  criterion: string;
  status: string;
  corrected_spec?: boolean;
  correction?: string;
}

export interface SpecDriftReport {
  drifted: Array<{ criterion: string; correction: string }>;
  clean: boolean;
}

/**
 * Collect every criterion the build flagged as a corrected-spec divergence.
 * `clean` is true iff none drifted — i.e. the spec and the implementation agree.
 */
export function specDrift(results: ReadonlyArray<BuildResult>): SpecDriftReport {
  const drifted = results
    .filter((r) => r.corrected_spec === true)
    .map((r) => ({
      criterion: r.criterion,
      correction: r.correction ?? '(no correction note provided)',
    }));
  return { drifted, clean: drifted.length === 0 };
}
