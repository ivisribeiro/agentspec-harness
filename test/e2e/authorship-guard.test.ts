import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Authorship invariant (mirrors scripts/guard-no-fork-tells.js): upstream source names
// must NOT appear in plugin/ visible prose — that is what makes the product read as a
// fork. Provenance lives in CREDITS.md and per-file frontmatter `origin:` stamps only.

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugin');
const FORK_TELLS = [/\bagentspec\b/i, /\bopenspec\b/i, /\becc\b/i];
const SCAN_EXT = new Set(['.md', '.json', '.py', '.txt', '.yaml', '.yml']);

function scanFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist') continue; // build output — regenerated, not authored
      out.push(...scanFiles(full));
    } else if (SCAN_EXT.has(path.extname(entry.name)) && entry.name !== 'CREDITS.md') {
      out.push(full);
    }
  }
  return out;
}

describe('authorship: no upstream source names in plugin/ prose', () => {
  it('plugin/ prose names no AgentSpec / OpenSpec / ECC outside CREDITS.md and origin: stamps', () => {
    const violations: string[] = [];
    for (const file of scanFiles(PLUGIN)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*origin\s*:/.test(line)) return; // allowed: frontmatter provenance stamp
        if (FORK_TELLS.some((re) => re.test(line))) {
          violations.push(`${path.relative(PLUGIN, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
