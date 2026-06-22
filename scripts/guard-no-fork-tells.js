#!/usr/bin/env node
// Authorship guard. Upstream source names (AgentSpec / OpenSpec / ECC) must NOT appear
// in plugin/ visible prose — that is what makes the product read as a fork. Provenance is
// centralized in CREDITS.md and, per ported file, a frontmatter `origin:` stamp. This
// guard fails CI if a source name leaks back into the surface. `npm run guard:authorship`.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin');
const FORK_TELLS = [/\bagentspec\b/i, /\bopenspec\b/i, /\becc\b/i];
const SCAN_EXT = new Set(['.md', '.json', '.py', '.txt', '.yaml', '.yml']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist') continue; // build output — regenerated, not authored
      out.push(...walk(full));
    } else if (SCAN_EXT.has(path.extname(entry.name)) && entry.name !== 'CREDITS.md') {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of walk(PLUGIN)) {
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*origin\s*:/.test(line)) return; // allowed: frontmatter provenance stamp
    for (const re of FORK_TELLS) {
      if (re.test(line)) {
        violations.push(`${path.relative(PLUGIN, file)}:${i + 1}: ${line.trim()}`);
        break;
      }
    }
  });
}

if (violations.length > 0) {
  console.error('AUTHORSHIP GUARD FAILED — upstream source names leak into plugin/ prose.');
  console.error('Move provenance to CREDITS.md or a frontmatter `origin:` stamp. Hits:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('authorship guard ok: no fork-tells in plugin/ prose');
