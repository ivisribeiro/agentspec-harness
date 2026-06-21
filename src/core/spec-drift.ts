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
  reconciled?: boolean;
}

export interface SpecDriftReport {
  drifted: Array<{ criterion: string; correction: string }>;
  reconciled: string[]; // criteria that were corrected AND already reconciled into DEFINE
  clean: boolean;
}

/**
 * Collect every criterion the build flagged as a corrected-spec divergence that
 * has NOT yet been reconciled into DEFINE. A correction with `reconciled: true`
 * is acknowledged — DEFINE has been updated — so it no longer counts as drift and
 * the ship loop converges (dogfood run #2, G2). `clean` is true iff nothing is
 * left unreconciled.
 */
export function specDrift(results: ReadonlyArray<BuildResult>): SpecDriftReport {
  const corrected = results.filter((r) => r.corrected_spec === true);
  const drifted = corrected
    .filter((r) => r.reconciled !== true)
    .map((r) => ({
      criterion: r.criterion,
      correction: r.correction ?? '(no correction note provided)',
    }));
  const reconciled = corrected.filter((r) => r.reconciled === true).map((r) => r.criterion);
  return { drifted, reconciled, clean: drifted.length === 0 };
}
