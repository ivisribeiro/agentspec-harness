import * as fs from 'node:fs';
import * as path from 'node:path';
import { type GateContext, type GateResult, pass, block } from './types.js';
import { checkHandoffObject } from '../handoff/handoff-check.js';

// G_OPS_CONFIG — guards the ops-readiness bucket of the brownfield `audit`
// artifact (dogfood improvement I4). A control whose code default is unsafe and
// whose prod override was NOT verified in an env file is "code complete but inert
// in prod" — invisible to static analysis and code review (e.g. RLS defeated by
// superuser, runner-use-bundles default false, auth-mode mismatch).
//
// Reads the audit handoff sidecar (ctx.args.audit, else handoffDir/audit.json)
// and BLOCKS when any opsReadiness item has enforced=false. PASSES when every
// item is enforced or none are present. "Feature ready but flag off in prod"
// becomes an exit-1.

interface OpsShape {
  opsReadiness: Array<{
    control: string;
    code_default: string;
    prod_value_required: string;
    env_files_checked: string[];
    enforced: boolean;
  }>;
}

export function gOpsConfig(ctx: GateContext): GateResult {
  const gate = 'G_OPS_CONFIG';

  // The audit sidecar can be pointed at explicitly via --audit, else it lives in
  // the feature's handoff dir as audit.json.
  const explicit = ctx.args.audit;
  const auditPath = explicit
    ? explicit
    : ctx.handoffDir
      ? path.join(ctx.handoffDir, 'audit.json')
      : null;

  if (!auditPath || !fs.existsSync(auditPath)) {
    return block(
      gate,
      [`audit handoff not found: ${auditPath ?? '(no handoff dir)'}`],
      ['audit-file']
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
  } catch {
    return block(gate, [`audit handoff is not valid JSON: ${auditPath}`], ['audit-json']);
  }

  const check = checkHandoffObject('audit', parsed);
  if (!check.ok) {
    return block(
      gate,
      [`audit does not match AuditHandoff contract: ${check.errors.join('; ')}`],
      ['audit-schema']
    );
  }

  const data = check.data as OpsShape;
  const reasons: string[] = [];
  const unmet: string[] = [];

  // Every ops-readiness control with enforced=false is a flag whose unsafe code
  // default's prod override was not verified — block and name each control.
  data.opsReadiness.forEach((o, i) => {
    if (!o.enforced) {
      const label = o.control || `opsReadiness[${i}]`;
      reasons.push(
        `ops control "${label}" not enforced: code default "${o.code_default}" requires prod value "${o.prod_value_required}", not verified in env files [${o.env_files_checked.join(', ')}]`
      );
      unmet.push(`opsReadiness[${i}]:${label}`);
    }
  });

  if (unmet.length > 0) {
    return block(gate, reasons, unmet);
  }

  const n = data.opsReadiness.length;
  return pass(gate, [
    n === 0
      ? 'ops config ok: no ops-readiness controls declared'
      : `ops config ok: ${n} control(s), all enforced`,
  ]);
}
