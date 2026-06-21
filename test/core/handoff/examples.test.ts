import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHandoffFile } from '../../../src/core/handoff/handoff-check.js';
import { HANDOFF_SCHEMAS } from '../../../src/core/handoff/schemas.js';

// The canonical handoff examples in schemas/handoffs/examples/<id>.json are the
// reference the commands point workers at. They MUST validate against their
// schema — this is what stops command-doc-vs-schema drift (the class of bug the
// final adversary found in /review, /migrate, /gen-router).

const EXAMPLES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'schemas',
  'handoffs',
  'examples'
);

describe('canonical handoff examples', () => {
  const ids = Object.keys(HANDOFF_SCHEMAS);

  it('ships exactly one example per handoff schema id', () => {
    const files = fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.json'));
    expect(files.sort()).toEqual(ids.map((id) => `${id}.json`).sort());
  });

  it.each(ids)('schemas/handoffs/examples/%s.json validates against its schema', (id) => {
    const result = checkHandoffFile(id, path.join(EXAMPLES_DIR, `${id}.json`));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
