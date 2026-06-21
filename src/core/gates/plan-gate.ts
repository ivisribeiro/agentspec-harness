import * as fs from 'node:fs';
import * as path from 'node:path';
import { type GateContext, type GateResult, pass, block } from './types.js';
import { checkHandoffObject } from '../handoff/handoff-check.js';

// G_PLAN — the plan-quality gate (dogfood improvement I5). Runs after the audit
// produces `proposedTasks` + `gaps`, BEFORE /build, to mechanize the adversary's
// `tooCoarse` + `omissions` passes that no other gate catches. Reads the audit
// handoff sidecar (ctx.args.audit, else handoffDir/audit.json) and BLOCKS on:
//
//   (a) a task whose `detail` is vague prose — heuristic: NO falsifiable signal
//       (no file-path-like token nor command-like token). A task that can't be
//       checked against the filesystem or a command is not a buildable task.
//   (b) a task of effort L or XL whose `domains.length > 1` — bundling >1
//       independent subsystem; the plan must split it before /build.
//   (c) a gap with priority "blocking" that NO proposedTask addresses — set-diff
//       by the gap's capability words appearing in some task's title/detail.
//
// PASSES when proposedTasks + gaps are clean. Each violation is named in `unmet`
// with a typed prefix (vague-task / bundled-task / orphan-gap) so the verdict is
// machine-actionable.

interface PlanTask {
  title: string;
  detail: string;
  effort: string;
  domains: string[];
}

interface PlanGap {
  capability: string;
  priority: string;
}

interface PlanShape {
  proposedTasks: PlanTask[];
  gaps: PlanGap[];
}

const BUNDLE_EFFORTS = new Set(['L', 'XL']);

// A "falsifiable signal" is a token that can be checked against the world:
//   - a path-like token: a word containing "/" or "." that isn't bare prose
//     punctuation (e.g. src/core/foo.ts, package.json, .spindle/run.json).
//   - a command-like token: a recognizable invocation verb / tool name.
// We tokenize on whitespace so a trailing sentence period ("done.") is NOT a
// false positive — that token is "done." whose dot is terminal, handled below.

const COMMAND_TOKENS = new Set([
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'make',
  'spin',
  'pytest',
  'uv',
  'cargo',
  'go',
  'docker',
  'git',
  'ruff',
  'eslint',
  'tsc',
  'vitest',
  'jest',
  'psql',
  'curl',
  'bash',
  'sh',
  'alembic',
  'python',
  'node',
]);

// True when the token carries a real path-like signal: a slash, or a dot that
// sits BETWEEN two filename characters (so "foo.ts", ".env", "a/b.json" count,
// but "done." / "etc." / "e.g." trailing-or-prose dots do not).
function hasPathSignal(token: string): boolean {
  if (token.includes('/')) return true;
  // dot must be internal with a filename char on each side, e.g. file.ext or .env-style "x.y".
  // Reject pure prose abbreviations like "e.g." / "i.e." / "etc." by requiring
  // an alphanumeric run of length >= 2 on at least one side of the dot.
  return /[A-Za-z0-9_-]\.[A-Za-z0-9_-]/.test(token) && /[A-Za-z0-9_]{2,}/.test(token);
}

// An argument token that makes a preceding command word read as a real
// invocation: a flag (-x / --foo), or a lowercase bareword subcommand
// (test / build / run / check ...). Prose words like "it"/"the" after a
// command word also pass shape-wise, which is why command words that are also
// English words ("make it", "go there") additionally require the command token
// itself to be backtick/quote-wrapped (see below).
function looksLikeArg(token: string): boolean {
  if (token.startsWith('-')) return true;
  return /^[a-z][a-z0-9_-]*$/.test(token);
}

// Command words that are ALSO common English words. For these, a bare lowercase
// occurrence is ambiguous: "make test" is a command but "make it crisper" is
// prose. The discriminator is the FOLLOWING word — a real invocation's argument
// is a subcommand/flag, never an English function word like "it"/"the"/"sure".
const ENGLISH_AMBIGUOUS = new Set(['make', 'go', 'node', 'sh', 'uv', 'curl']);

// Function words that, when they follow an ambiguous command word, prove it is
// prose ("make it", "go there", "make sure"). An argument from this set vetoes
// the command-signal even though it is shaped like a bareword.
const PROSE_AFTER_COMMAND = new Set([
  'it',
  'the',
  'a',
  'an',
  'this',
  'that',
  'them',
  'there',
  'here',
  'sure',
  'them',
  'us',
  'me',
  'you',
  'your',
  'our',
  'its',
  'his',
  'her',
  'their',
  'to',
  'into',
  'through',
  'over',
  'up',
  'down',
  'and',
  'or',
  'but',
]);

function hasFalsifiableSignal(detail: string): boolean {
  const raws = detail.split(/\s+/).filter(Boolean);
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    // strip surrounding quotes/backticks/parens/commas that wrap an otherwise
    // real reference, e.g. `src/foo.ts`, (package.json), "make test".
    const token = raw.replace(/^[`'"(),[\]]+|[`'",;:)\]]+$/g, '');
    if (token.length === 0) continue;
    if (hasPathSignal(token)) return true;

    // Command tokens count only when written lowercase, as a real invocation is
    // ("make test", "npm run build"). A capitalized sentence-starter like "Make"
    // or "Go" is English prose, not a command — don't let it fake a signal.
    if (token === token.toLowerCase() && COMMAND_TOKENS.has(token)) {
      const wrapped = raw !== token; // had surrounding backticks/quotes/parens
      const nextRaw = raws[i + 1];
      const next = nextRaw
        ? nextRaw.replace(/^[`'"(),[\]]+|[`'",;:)\]]+$/g, '')
        : '';
      const hasArg = next.length > 0 && looksLikeArg(next);
      if (ENGLISH_AMBIGUOUS.has(token)) {
        // "make it crisper" / "make sure" stay prose; "make test" counts because
        // the following token is a real subcommand, not an English function word.
        if (wrapped || (hasArg && !PROSE_AFTER_COMMAND.has(next))) return true;
      } else if (hasArg || wrapped) {
        // unambiguous tools (npm/pytest/git/...) just need a plausible argument
        // or to be wrapped — "run npm install" / `git commit`.
        return true;
      }
    }
  }
  return false;
}

// Capability "words" for the orphan-gap set-diff: lowercase alphanumeric tokens
// of length >= 4 (drop tiny stop-words like "a", "to", "the", "of"). A blocking
// gap is addressed iff at least one of its capability words appears in some
// task's combined title+detail haystack.
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'into',
  'from',
  'that',
  'this',
  'when',
  'must',
  'must',
  'gap',
  'task',
]);

function capabilityWords(capability: string): string[] {
  return capability
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

export function gPlan(ctx: GateContext): GateResult {
  const gate = 'G_PLAN';

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

  const data = check.data as PlanShape;
  const reasons: string[] = [];
  const unmet: string[] = [];

  // (a) Vague-prose tasks: a task whose detail carries no falsifiable signal.
  data.proposedTasks.forEach((t, i) => {
    const label = t.title || `proposedTasks[${i}]`;
    if (!hasFalsifiableSignal(t.detail)) {
      reasons.push(
        `task "${label}" has vague acceptance: detail names no file path or command to check against`
      );
      unmet.push(`vague-task:proposedTasks[${i}]`);
    }
  });

  // (b) Bundled L/XL tasks spanning >1 domain: must be split before /build.
  data.proposedTasks.forEach((t, i) => {
    const label = t.title || `proposedTasks[${i}]`;
    if (BUNDLE_EFFORTS.has(t.effort) && t.domains.length > 1) {
      reasons.push(
        `task "${label}" is effort ${t.effort} and bundles ${t.domains.length} domains [${t.domains.join(', ')}] — split into one task per subsystem`
      );
      unmet.push(`bundled-task:proposedTasks[${i}]`);
    }
  });

  // (c) Orphan blocking gaps: a blocking gap no proposedTask addresses.
  const haystacks = data.proposedTasks.map((t) =>
    `${t.title} ${t.detail}`.toLowerCase()
  );
  data.gaps.forEach((g, i) => {
    if (g.priority !== 'blocking') return;
    const words = capabilityWords(g.capability);
    // With no usable words we cannot prove coverage either way; a blocking gap
    // whose capability is all stop-words is itself a planning defect — flag it.
    const addressed =
      words.length > 0 && words.some((w) => haystacks.some((h) => h.includes(w)));
    if (!addressed) {
      reasons.push(
        `blocking gap "${g.capability}" is addressed by no proposed task`
      );
      unmet.push(`orphan-gap:gaps[${i}]`);
    }
  });

  if (unmet.length > 0) {
    return block(gate, reasons, unmet);
  }

  return pass(gate, [
    `plan ok: ${data.proposedTasks.length} task(s) (all falsifiable, none over-bundled), ${data.gaps.filter((g) => g.priority === 'blocking').length} blocking gap(s) all addressed`,
  ]);
}
