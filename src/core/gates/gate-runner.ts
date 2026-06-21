import * as fs from 'node:fs';
import { GATE_REGISTRY, isGateId, listGates } from './registry.js';
import { type GateContext, type GateResult, block } from './types.js';
import { ArtifactGraph } from '../artifact-graph/graph.js';
import {
  loadRunState,
  runStateExists,
  featureDir,
  handoffDir,
  schemaCopyPath,
} from '../run/run-state.js';
import type { RunState } from '../run/run-state.schema.js';

// Builds the gate context from filesystem + run-state, then runs a named gate.

export function buildGateContext(root: string, args: Record<string, string> = {}): GateContext {
  let runState: RunState | null = null;
  let graph: ArtifactGraph | null = null;
  let fDir: string | null = null;
  let hDir: string | null = null;

  if (runStateExists(root)) {
    runState = loadRunState(root);
    fDir = featureDir(root, runState.feature);
    hDir = handoffDir(root, runState.feature);
    const schemaPath = schemaCopyPath(root);
    if (fs.existsSync(schemaPath)) {
      graph = ArtifactGraph.fromYaml(schemaPath);
    }
  }

  return { root, args, runState, graph, featureDir: fDir, handoffDir: hDir };
}

export function runGate(gateId: string, ctx: GateContext): GateResult {
  if (!isGateId(gateId)) {
    return block(gateId, [`unknown gate "${gateId}". Known: ${listGates().join(', ')}`], ['unknown-gate']);
  }
  return GATE_REGISTRY[gateId](ctx);
}
