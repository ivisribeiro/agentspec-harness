import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';

// Ported from OpenSpec (MIT), simplified to drop the FileSystemUtils dependency.
// Resolves an artifact's `generates` path (literal or glob) to existing files.

export function isGlobPattern(pattern: string): boolean {
  return pattern.includes('*') || pattern.includes('?') || pattern.includes('[');
}

export function resolveArtifactOutputs(baseDir: string, generates: string): string[] {
  if (!isGlobPattern(generates)) {
    const fullPath = path.join(baseDir, generates);
    try {
      return fs.statSync(fullPath).isFile() ? [path.normalize(fullPath)] : [];
    } catch {
      return [];
    }
  }

  const normalizedPattern = generates.split(path.sep).join('/');
  const matches = fg
    .sync(normalizedPattern, { cwd: baseDir, onlyFiles: true, absolute: true })
    .map((m) => path.normalize(m));

  return Array.from(new Set(matches)).sort();
}

export function artifactOutputExists(baseDir: string, generates: string): boolean {
  return resolveArtifactOutputs(baseDir, generates).length > 0;
}
