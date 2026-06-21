#!/usr/bin/env node
// Build the ahx CLI: compile src/ -> dist/ with the local TypeScript compiler.
// Ported from OpenSpec's build.js (MIT). No bundler — plain tsc, ESM output.

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const runTsc = (args = []) => {
  const tscPath = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tscPath, ...args], { stdio: 'inherit' });
};

console.log('Building ahx...');

if (existsSync('dist')) {
  rmSync('dist', { recursive: true, force: true });
}

try {
  runTsc();
  console.log('Build completed.');
} catch {
  console.error('Build failed.');
  process.exit(1);
}
