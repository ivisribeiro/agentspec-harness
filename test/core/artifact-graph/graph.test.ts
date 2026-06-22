import { describe, it, expect } from 'vitest';
import { ArtifactGraph } from '../../../src/core/artifact-graph/graph.js';
import { parseSchema, SchemaValidationError } from '../../../src/core/artifact-graph/schema.js';

const SDD_YAML = `
name: sdd
version: 1
artifacts:
  - id: define
    generates: DEFINE.md
    requires: []
  - id: design
    generates: DESIGN.md
    requires: [define]
  - id: build
    generates: BUILD_REPORT.md
    requires: [design]
  - id: ship
    generates: SHIPPED.md
    requires: [build]
`;

describe('ArtifactGraph (ported OpenSpec spine)', () => {
  it('computes a deterministic Kahn build order', () => {
    const g = ArtifactGraph.fromYamlContent(SDD_YAML);
    expect(g.getBuildOrder()).toEqual(['define', 'design', 'build', 'ship']);
  });

  it('computes the downstream closure (getDownstream) for the iterate cascade', () => {
    const g = ArtifactGraph.fromYamlContent(SDD_YAML);
    expect(g.getDownstream(['design'])).toEqual(['build', 'design', 'ship']);
    expect(g.getDownstream(['ship'])).toEqual(['ship']);
    expect(g.getDownstream(['define'])).toEqual(['build', 'define', 'design', 'ship']);
  });

  it('returns only the ready artifacts given completed set', () => {
    const g = ArtifactGraph.fromYamlContent(SDD_YAML);
    expect(g.getNextArtifacts(new Set())).toEqual(['define']);
    expect(g.getNextArtifacts(new Set(['define']))).toEqual(['design']);
    expect(g.getNextArtifacts(new Set(['define', 'design']))).toEqual(['build']);
  });

  it('reports blocked artifacts with unmet deps', () => {
    const g = ArtifactGraph.fromYamlContent(SDD_YAML);
    const blocked = g.getBlocked(new Set());
    expect(blocked.design).toEqual(['define']);
    expect(blocked.build).toEqual(['design']);
  });

  it('detects completion of the whole graph', () => {
    const g = ArtifactGraph.fromYamlContent(SDD_YAML);
    expect(g.isComplete(new Set(['define', 'design', 'build', 'ship']))).toBe(true);
    expect(g.isComplete(new Set(['define']))).toBe(false);
  });

  it('parallel siblings both appear in the ready wave', () => {
    const g = ArtifactGraph.fromYamlContent(`
name: fan
version: 1
artifacts:
  - id: root
    generates: root.md
    requires: []
  - id: a
    generates: a.md
    requires: [root]
  - id: b
    generates: b.md
    requires: [root]
`);
    expect(g.getNextArtifacts(new Set(['root']))).toEqual(['a', 'b']);
  });

  it('rejects a schema with a dependency cycle', () => {
    expect(() =>
      parseSchema(`
name: cyclic
version: 1
artifacts:
  - id: a
    generates: a.md
    requires: [b]
  - id: b
    generates: b.md
    requires: [a]
`)
    ).toThrow(SchemaValidationError);
  });

  it('rejects a dangling requires reference', () => {
    expect(() =>
      parseSchema(`
name: dangling
version: 1
artifacts:
  - id: a
    generates: a.md
    requires: [ghost]
`)
    ).toThrow(SchemaValidationError);
  });

  it('rejects duplicate artifact ids', () => {
    expect(() =>
      parseSchema(`
name: dup
version: 1
artifacts:
  - id: a
    generates: a.md
  - id: a
    generates: a2.md
`)
    ).toThrow(SchemaValidationError);
  });
});
