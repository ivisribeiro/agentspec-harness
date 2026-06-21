import * as fs from 'node:fs';
import * as path from 'node:path';
import { type GateContext, type GateResult, pass, block } from './types.js';
import { parseAgentFrontmatter } from '../validation/frontmatter.js';

// G_ROUTER_COVERAGE — asserts a bijection between the agent roster and the
// generated routing table: every agent frontmatter parses, each appears exactly
// once in routing, none missing, none extra. No silent skips (fixes the Python
// router's "[WARN] Skipping <path>" data-loss hole).

interface RoutingFile {
  agents?: string[];
}

function listAgentFiles(dir: string): string[] {
  const out: string[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) out.push(full);
    }
  }
  walk(dir);
  return out.sort();
}

export function gRouterCoverage(ctx: GateContext): GateResult {
  const gate = 'G_ROUTER_COVERAGE';
  const agentsDir = ctx.args.agents;
  const routingPath = ctx.args.routing;

  if (!agentsDir || !fs.existsSync(agentsDir)) {
    return block(gate, [`agents dir not found: ${agentsDir ?? '(unset)'}`], ['agents-dir']);
  }
  if (!routingPath || !fs.existsSync(routingPath)) {
    return block(gate, [`routing file not found: ${routingPath ?? '(unset)'}`], ['routing-file']);
  }

  const reasons: string[] = [];
  const unmet: string[] = [];

  // 1. Parse every agent frontmatter, fail-closed.
  const rosterNames: string[] = [];
  for (const file of listAgentFiles(agentsDir)) {
    const md = fs.readFileSync(file, 'utf-8');
    const fm = parseAgentFrontmatter(md);
    if (!fm.ok) {
      reasons.push(`invalid agent frontmatter: ${path.relative(agentsDir, file)} (${fm.error})`);
      unmet.push(path.relative(agentsDir, file));
    } else {
      rosterNames.push(fm.data!.name);
    }
  }

  // 2. Load routing output.
  let routing: RoutingFile;
  try {
    routing = JSON.parse(fs.readFileSync(routingPath, 'utf-8')) as RoutingFile;
  } catch {
    return block(gate, [`routing file is not valid JSON: ${routingPath}`], ['routing-json']);
  }
  const routed = routing.agents ?? [];

  // 3. Bijection checks.
  const rosterSet = new Set(rosterNames);
  const routedCounts = new Map<string, number>();
  for (const name of routed) routedCounts.set(name, (routedCounts.get(name) ?? 0) + 1);

  for (const name of rosterSet) {
    const count = routedCounts.get(name) ?? 0;
    if (count === 0) {
      reasons.push(`agent missing from routing: ${name}`);
      unmet.push(`missing:${name}`);
    } else if (count > 1) {
      reasons.push(`agent appears ${count}x in routing (bijection broken): ${name}`);
      unmet.push(`duplicate:${name}`);
    }
  }
  for (const name of routedCounts.keys()) {
    if (!rosterSet.has(name)) {
      reasons.push(`routing references unknown agent: ${name}`);
      unmet.push(`extra:${name}`);
    }
  }

  if (unmet.length === 0) {
    return pass(gate, [`bijection holds over ${rosterNames.length} agents`]);
  }
  return block(gate, reasons, unmet);
}
