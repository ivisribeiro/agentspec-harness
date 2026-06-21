import type { GateFn } from './types.js';
import { gDefine, gDesign, gBuild, gShip } from './sdd-gates.js';
import { gKbStructure, gKbCoverage } from './kb-gates.js';
import { gRouterCoverage } from './router-gate.js';
import { gReviewBlock } from './review-gate.js';

// gate id -> implementation. Every gate reads filesystem + run-state only.
export const GATE_REGISTRY: Record<string, GateFn> = {
  G_DEFINE: gDefine,
  G_DESIGN: gDesign,
  G_BUILD: gBuild,
  G_SHIP: gShip,
  G_KB_STRUCTURE: gKbStructure,
  G_KB_COVERAGE: gKbCoverage,
  G_ROUTER_COVERAGE: gRouterCoverage,
  G_REVIEW_BLOCK: gReviewBlock,
};

export function listGates(): string[] {
  return Object.keys(GATE_REGISTRY).sort();
}

export function isGateId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(GATE_REGISTRY, id);
}
