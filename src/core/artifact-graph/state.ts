import * as fs from 'node:fs';
import type { CompletedSet } from './types.js';
import type { ArtifactGraph } from './graph.js';
import { artifactOutputExists } from './outputs.js';

// Ported from OpenSpec (MIT). Detects completion by file existence over the
// artifact `generates` path. The CLI unions this with the run-state ledger so
// completion survives a mid-session crash (filesystem + state, never conversation).

export function detectCompleted(graph: ArtifactGraph, baseDir: string): CompletedSet {
  const completed = new Set<string>();
  if (!fs.existsSync(baseDir)) {
    return completed;
  }
  for (const artifact of graph.getAllArtifacts()) {
    if (artifactOutputExists(baseDir, artifact.generates)) {
      completed.add(artifact.id);
    }
  }
  return completed;
}
