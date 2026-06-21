import * as fs from 'node:fs';
import * as path from 'node:path';
import { type GateContext, type GateResult, pass, block } from './types.js';
import { checkHandoffFile } from '../handoff/handoff-check.js';

// KB gates — replace create-kb's blind delegation to kb-architect with concrete
// structural + coverage checks over the generated domain.

interface KbManifest {
  concepts?: Array<{ slug: string }>;
}

function exists(p: string | null): boolean {
  return !!p && fs.existsSync(p);
}

/** G_KB_STRUCTURE — domain has the required scaffolding + at least one concept. */
export function gKbStructure(ctx: GateContext): GateResult {
  const gate = 'G_KB_STRUCTURE';
  const dir = ctx.featureDir;
  if (!dir || !fs.existsSync(dir)) {
    return block(gate, [`KB domain dir not found: ${dir ?? '(unset)'}`], ['domain-dir']);
  }
  const reasons: string[] = [];
  const unmet: string[] = [];

  for (const required of ['index.md', 'quick-reference.md', 'manifest.json']) {
    if (!exists(path.join(dir, required))) {
      reasons.push(`missing ${required}`);
      unmet.push(required);
    }
  }
  const conceptFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.startsWith('concept-') && f.endsWith('.md'))
    : [];
  if (conceptFiles.length === 0) {
    reasons.push('no concept files (concept-*.md)');
    unmet.push('concepts');
  }

  return unmet.length === 0 ? pass(gate, ['KB structure complete']) : block(gate, reasons, unmet);
}

/** G_KB_COVERAGE — every manifest concept has a file + enough test cases. */
export function gKbCoverage(ctx: GateContext): GateResult {
  const gate = 'G_KB_COVERAGE';
  const dir = ctx.featureDir;
  if (!dir || !fs.existsSync(dir)) {
    return block(gate, [`KB domain dir not found: ${dir ?? '(unset)'}`], ['domain-dir']);
  }
  const manifestPath = path.join(dir, 'manifest.json');
  let manifest: KbManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as KbManifest;
  } catch {
    return block(gate, [`manifest.json missing or invalid: ${manifestPath}`], ['manifest']);
  }
  const minCases = ctx.runState && ctx.graph ? (ctx.graph.getSchema().config?.kb_min_test_cases ?? 1) : 1;

  const concepts = manifest.concepts ?? [];
  if (concepts.length === 0) {
    return block(gate, ['manifest declares zero concepts'], ['concepts']);
  }

  const reasons: string[] = [];
  const unmet: string[] = [];
  for (const { slug } of concepts) {
    const conceptFile = path.join(dir, `concept-${slug}.md`);
    if (!exists(conceptFile)) {
      reasons.push(`concept declared but not authored: ${slug}`);
      unmet.push(`concept:${slug}`);
      continue;
    }
    if (ctx.handoffDir) {
      const hPath = path.join(ctx.handoffDir, `kb-concept-${slug}.json`);
      const check = checkHandoffFile('kb-concept', hPath);
      if (!check.ok) {
        reasons.push(`concept "${slug}" handoff invalid: ${check.errors.join('; ')}`);
        unmet.push(`handoff:${slug}`);
      } else {
        const data = check.data as { test_cases?: string[] };
        if ((data.test_cases?.length ?? 0) < minCases) {
          reasons.push(`concept "${slug}" has fewer than ${minCases} test case(s)`);
          unmet.push(`test-cases:${slug}`);
        }
      }
    }
  }

  return unmet.length === 0
    ? pass(gate, [`all ${concepts.length} concepts covered`])
    : block(gate, reasons, unmet);
}
