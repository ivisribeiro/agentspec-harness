#!/usr/bin/env node
// Build the ahx CLI into a SINGLE self-contained ESM bundle (deps inlined) so the
// plugin runs offline with no node_modules. Also typechecks with tsc.
// The bundle lands at dist/cli/index.js; bin/ahx.js imports it.

import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

console.log('Type-checking (tsc --noEmit)...');
try {
  const tscPath = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tscPath, '--noEmit'], { stdio: 'inherit' });
} catch {
  console.error('Type-check failed.');
  process.exit(1);
}

if (existsSync('dist')) rmSync('dist', { recursive: true, force: true });

console.log('Bundling with esbuild...');
await esbuild.build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: 'dist/cli/index.js',
  // Some bundled CJS deps reference require(); provide it in the ESM bundle.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
});

console.log('Build completed: dist/cli/index.js');
