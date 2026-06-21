import type { Artifact, SchemaYaml, CompletedSet, BlockedArtifacts } from './types.js';
import { loadSchema, parseSchema } from './schema.js';

// Ported verbatim from OpenSpec (MIT). Deterministic Kahn topological sort,
// ready-set and blocked-set queries over the artifact dependency graph.

export class ArtifactGraph {
  private artifacts: Map<string, Artifact>;
  private schema: SchemaYaml;

  private constructor(schema: SchemaYaml) {
    this.schema = schema;
    this.artifacts = new Map(schema.artifacts.map((a) => [a.id, a]));
  }

  static fromYaml(filePath: string): ArtifactGraph {
    return new ArtifactGraph(loadSchema(filePath));
  }

  static fromYamlContent(yamlContent: string): ArtifactGraph {
    return new ArtifactGraph(parseSchema(yamlContent));
  }

  static fromSchema(schema: SchemaYaml): ArtifactGraph {
    return new ArtifactGraph(schema);
  }

  getArtifact(id: string): Artifact | undefined {
    return this.artifacts.get(id);
  }

  getAllArtifacts(): Artifact[] {
    return Array.from(this.artifacts.values());
  }

  getName(): string {
    return this.schema.name;
  }

  getVersion(): number {
    return this.schema.version;
  }

  getSchema(): SchemaYaml {
    return this.schema;
  }

  /** Computes the topological build order using Kahn's algorithm (sorted for determinism). */
  getBuildOrder(): string[] {
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const artifact of this.artifacts.values()) {
      inDegree.set(artifact.id, artifact.requires.length);
      dependents.set(artifact.id, []);
    }

    for (const artifact of this.artifacts.values()) {
      for (const req of artifact.requires) {
        dependents.get(req)!.push(artifact.id);
      }
    }

    const queue = [...this.artifacts.keys()]
      .filter((id) => inDegree.get(id) === 0)
      .sort();

    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const newlyReady: string[] = [];
      for (const dep of dependents.get(current)!) {
        const newDegree = inDegree.get(dep)! - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) {
          newlyReady.push(dep);
        }
      }
      queue.push(...newlyReady.sort());
    }

    return result;
  }

  /** Artifacts whose dependencies are all completed and which are not themselves completed. */
  getNextArtifacts(completed: CompletedSet): string[] {
    const ready: string[] = [];
    for (const artifact of this.artifacts.values()) {
      if (completed.has(artifact.id)) continue;
      if (artifact.requires.every((req) => completed.has(req))) {
        ready.push(artifact.id);
      }
    }
    return ready.sort();
  }

  isComplete(completed: CompletedSet): boolean {
    for (const artifact of this.artifacts.values()) {
      if (!completed.has(artifact.id)) return false;
    }
    return true;
  }

  getBlocked(completed: CompletedSet): BlockedArtifacts {
    const blocked: BlockedArtifacts = {};
    for (const artifact of this.artifacts.values()) {
      if (completed.has(artifact.id)) continue;
      const unmetDeps = artifact.requires.filter((req) => !completed.has(req));
      if (unmetDeps.length > 0) {
        blocked[artifact.id] = unmetDeps.sort();
      }
    }
    return blocked;
  }
}
