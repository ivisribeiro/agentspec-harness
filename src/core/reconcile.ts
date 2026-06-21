// reconcile.ts — pure doc-vs-code drift detection (dogfood improvement I3).
//
// reconcileAudit performs a set-diff over the fields of each built[] item in an
// AuditHandoff and classifies each item into one of three buckets:
//
//   inconsistent    — verified_in_code=true BUT resolved_at_commit is null/absent.
//                     The doc claims "verified in code" but no commit backs it.
//
//   drift_open      — status="proven" BUT verified_in_code=false (default).
//                     The doc says "proven" but the code check was never done.
//
//   silently_fixed  — resolved_at_commit is set AND verified_in_code=true.
//                     Item is genuinely closed; no action needed.
//
// Everything else (status != "proven", no commit, not verified) is unremarkable
// — it is the normal state of an in-progress audit item.
//
// This is a PURE function: no filesystem, no git shelling. The caller loads and
// validates the audit handoff; reconcileAudit only reads the built[] array.

export interface BuiltItem {
  item: string;
  status: 'proven' | 'partial' | 'scaffolded';
  resolved_at_commit?: string | null;
  verified_in_code: boolean;
}

export interface ReconcileReport {
  /** verified_in_code=true but resolved_at_commit is null/absent — claim without commit */
  inconsistent: string[];
  /** status="proven" but verified_in_code=false — doc says done, code not checked */
  drift_open: string[];
  /** resolved_at_commit set AND verified_in_code=true — genuinely closed */
  silently_fixed: string[];
}

export interface AuditLike {
  built: BuiltItem[];
}

/**
 * Pure set-diff over the built[] items of an AuditHandoff.
 * Returns three disjoint buckets. Exits with no filesystem side-effects.
 */
export function reconcileAudit(audit: AuditLike): ReconcileReport {
  const inconsistent: string[] = [];
  const drift_open: string[] = [];
  const silently_fixed: string[] = [];

  for (const b of audit.built) {
    const hasCommit = b.resolved_at_commit != null && b.resolved_at_commit !== '';
    const verifiedInCode = b.verified_in_code === true;
    const isProven = b.status === 'proven';

    if (verifiedInCode && !hasCommit) {
      // Claims verified in code but no commit reference to back it up.
      inconsistent.push(b.item);
    } else if (isProven && !verifiedInCode) {
      // Doc says "proven" but the code check flag was never set.
      drift_open.push(b.item);
    } else if (hasCommit && verifiedInCode) {
      // Both fields agree: closed with a commit and code-verified.
      silently_fixed.push(b.item);
    }
    // Remaining cases (partial/scaffolded, no commit, not verified) are normal
    // in-progress items — not classified, not reported.
  }

  return { inconsistent, drift_open, silently_fixed };
}
