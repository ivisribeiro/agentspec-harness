import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fanoutCheckHandler } from '../../src/commands/handlers.js';

// spin fanout-check: a started-but-unfinished parallel_group at a phase boundary is a
// dropped fan-out worker — the silent failure parallel-fanout itself cannot catch.

const SCHEMA = `name: t
version: 1
artifacts:
  - id: a
    generates: A.md
    parallel_group: wave
    requires: []
  - id: b
    generates: B.md
    parallel_group: wave
    requires: []
  - id: c
    generates: C.md
    requires: [a, b]
`;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-fanout-'));
  fs.mkdirSync(path.join(root, '.spindle'), { recursive: true });
  fs.writeFileSync(path.join(root, '.spindle', 'schema.yaml'), SCHEMA);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function writeRun(completed: string[]) {
  const now = '2026-01-01T00:00:00.000Z';
  fs.writeFileSync(
    path.join(root, '.spindle', 'run.json'),
    JSON.stringify({
      version: 1,
      schema: 't',
      feature: 'f',
      completed,
      retries: {},
      gates: {},
      events: [],
      createdAt: now,
      updatedAt: now,
    })
  );
}

describe('spin fanout-check', () => {
  it('blocks when a parallel_group is partially complete (dropped worker)', () => {
    writeRun(['a']); // a done, b dropped
    const r = fanoutCheckHandler(root);
    expect(r.code).toBe(1);
    expect((r.json as { unmet: string[] }).unmet).toContain('incomplete-group:wave:b');
  });

  it('passes when every member of the group is complete', () => {
    writeRun(['a', 'b']);
    expect(fanoutCheckHandler(root).code).toBe(0);
  });

  it('passes when the group has not started (no member complete)', () => {
    writeRun([]);
    expect(fanoutCheckHandler(root).code).toBe(0);
  });

  it('is a usage error before init', () => {
    fs.rmSync(path.join(root, '.spindle', 'run.json'), { force: true });
    expect(fanoutCheckHandler(root).code).toBe(2);
  });
});
