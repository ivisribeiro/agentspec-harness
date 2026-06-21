import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// Parse + Zod-validate YAML frontmatter from agent/skill/command markdown.
// Fail-closed: malformed frontmatter is an error, never a silent skip. Replaces
// the fragile regex parse in AgentSpec's generate-agent-router.py.

export const AgentFrontmatter = z.object({
  name: z.string().min(1, 'agent name is required'),
  description: z.string().min(1, 'agent description is required'),
  model: z.string().optional(),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
  output_schema: z.string().optional(),
});
export type AgentFrontmatter = z.infer<typeof AgentFrontmatter>;

export interface FrontmatterResult {
  ok: boolean;
  data?: AgentFrontmatter;
  raw?: Record<string, unknown>;
  error?: string;
}

const FENCE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

/** Extracts the raw frontmatter block, or null if absent. */
export function extractFrontmatter(markdown: string): Record<string, unknown> | null {
  const match = FENCE.exec(markdown);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Parse + validate agent frontmatter. Fail-closed. */
export function parseAgentFrontmatter(markdown: string): FrontmatterResult {
  const raw = extractFrontmatter(markdown);
  if (raw === null) {
    return { ok: false, error: 'missing or unparseable frontmatter block' };
  }
  const result = AgentFrontmatter.safeParse(raw);
  if (!result.success) {
    const error = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { ok: false, raw, error };
  }
  return { ok: true, data: result.data, raw };
}
