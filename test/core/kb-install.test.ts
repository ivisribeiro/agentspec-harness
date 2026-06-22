import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { kbInstallHandler } from '../../src/commands/handlers.js';

// spin kb-install publishes a generated flat KB domain from the .spindle workspace into a
// shippable kb root (default plugin/kb) so an agent's kb_domains resolves under
// G_ROUTER_COVERAGE. Pure file copy; refuses an incomplete source.

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-kbinstall-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function seedSource(domain: string, complete: boolean) {
  const dir = path.join(root, '.spindle', 'features', domain);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ concepts: [{ slug: 'foo' }] }));
  fs.writeFileSync(path.join(dir, 'concept-foo.md'), '# foo\n');
  if (complete) {
    fs.writeFileSync(path.join(dir, 'index.md'), '# index\n');
    fs.writeFileSync(path.join(dir, 'quick-reference.md'), '# qr\n');
  }
}

describe('spin kb-install', () => {
  it('publishes a complete flat KB domain into plugin/kb/<domain>', () => {
    seedSource('mydom', true);
    const r = kbInstallHandler(root, 'mydom', {});
    expect(r.code).toBe(0);
    const dest = path.join(root, 'plugin', 'kb', 'mydom');
    expect(fs.existsSync(path.join(dest, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'concept-foo.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'index.md'))).toBe(true);
  });

  it('blocks (exit 1) when the source is an incomplete domain', () => {
    seedSource('partial', false);
    const r = kbInstallHandler(root, 'partial', {});
    expect(r.code).toBe(1);
    expect((r.json as { installed: boolean }).installed).toBe(false);
  });

  it('usage error (exit 2) on a bad domain slug', () => {
    expect(kbInstallHandler(root, 'Bad/Slug', {}).code).toBe(2);
  });

  it('honors --dest for a non-default kb root', () => {
    seedSource('d2', true);
    const r = kbInstallHandler(root, 'd2', { dest: 'mykb' });
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(root, 'mykb', 'd2', 'manifest.json'))).toBe(true);
  });
});
