import { describe, it, expect } from 'vitest';
import { parseAgentFrontmatter } from '../../../src/core/validation/frontmatter.js';

describe('parseAgentFrontmatter', () => {
  it('parses clean frontmatter strictly', () => {
    const r = parseAgentFrontmatter('---\nname: alpha\ndescription: does things\n---\n# x');
    expect(r.ok).toBe(true);
    expect(r.data!.name).toBe('alpha');
    expect(r.degraded).toBeFalsy();
  });

  it('tolerates a block-scalar description with embedded examples (Claude Code style)', () => {
    const md = [
      '---',
      'name: kb-architect',
      'description: |',
      '  Knowledge base architect.',
      '  <example>',
      '  Context: foo',
      '  </example>',
      'tools: Read, Write',
      '---',
      '# body',
    ].join('\n');
    const r = parseAgentFrontmatter(md);
    expect(r.ok).toBe(true);
    expect(r.data!.name).toBe('kb-architect');
  });

  it('recovers the name when an unquoted colon breaks strict YAML', () => {
    const md = '---\nname: define-worker\ndescription: writes DEFINE. Model: opus tier.\n---\n# x';
    const r = parseAgentFrontmatter(md);
    expect(r.ok).toBe(true);
    expect(r.data!.name).toBe('define-worker');
    expect(r.degraded).toBe(true);
  });

  it('fails closed when there is no frontmatter block', () => {
    expect(parseAgentFrontmatter('# just a heading\n').ok).toBe(false);
  });

  it('fails closed when the frontmatter has no name', () => {
    expect(parseAgentFrontmatter('---\ndescription: nameless\n---\n').ok).toBe(false);
  });
});
