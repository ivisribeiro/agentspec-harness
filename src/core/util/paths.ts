import * as path from 'node:path';

// Deterministic path/slug guards. Pure string + path math — never a model decision.
// Keep editable-schema and user-supplied paths inside the project tree so a `..`
// escape can't make a gate read/verify a file outside the root.

/** A feature/domain slug safe to use as a directory name and a run-state value. */
export function isSafeSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

/** True when `rel` resolves to a location at or under `root` — no `..` escape and no
 *  absolute path that leaves the tree. */
export function isContainedPath(root: string, rel: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, rel);
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}
