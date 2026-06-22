import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { mergeFindingsHandler } from '../../src/commands/handlers.js';

// spin merge-findings: a deterministic merge so a CRITICAL can't be dropped (and a source
// forged) by a prose merge before G_REVIEW_BLOCK sees it.

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-merge-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function writeFile(name: string, findings: unknown[]) {
  const p = path.join(root, name);
  fs.writeFileSync(p, JSON.stringify({ findings }));
  return p;
}
const f = (over: Record<string, unknown>) => ({
  file: 'a.ts',
  line: 1,
  severity: 'high',
  rule: 'r',
  message: 'm',
  source: 'arch-worker',
  ...over,
});

describe('spin merge-findings', () => {
  it('dedups by file+line+rule, keeps higher severity, and aggregates sources', () => {
    const a = writeFile('arch.json', [f({ severity: 'low', source: 'arch-worker' })]);
    const b = writeFile('codex.json', [f({ severity: 'critical', source: 'codex' })]); // same key, higher severity
    const r = mergeFindingsHandler(root, [a, b], {});
    expect(r.code).toBe(0);
    const json = r.json as { findings: Array<{ severity: string }>; sources: string[]; count: number };
    expect(json.count).toBe(1);
    expect(json.findings[0].severity).toBe('critical'); // higher severity wins
    expect(json.sources).toEqual(['arch-worker', 'codex']); // both contributors aggregated
  });

  it('writes the canonical {findings,sources} to --out', () => {
    const a = writeFile('a.json', [f({ rule: 'r1' })]);
    const b = writeFile('b.json', [f({ rule: 'r2', source: 'security-worker' })]);
    const r = mergeFindingsHandler(root, [a, b], { out: 'merged.json' });
    expect(r.code).toBe(0);
    const written = JSON.parse(fs.readFileSync(path.join(root, 'merged.json'), 'utf-8'));
    expect(written.findings.length).toBe(2);
    expect(written.sources.sort()).toEqual(['arch-worker', 'security-worker']);
  });

  it('usage error (exit 2) with no files', () => {
    expect(mergeFindingsHandler(root, [], {}).code).toBe(2);
  });
});
