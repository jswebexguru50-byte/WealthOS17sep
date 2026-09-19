export interface DependencyNode {
  id: string;
  type:
    | 'DATASET'
    | 'STRATEGY'
    | 'ENGINE'
    | 'ARTIFACT'
    | 'REPORT';
  dependsOn: string[];
}

export class R2C2DependencyGraph {
  private readonly nodes = new Map<string, DependencyNode>();

  register(node: DependencyNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(
        `Duplicate dependency node: ${node.id}`,
      );
    }

    this.nodes.set(node.id, {
      ...node,
      dependsOn: [...new Set(node.dependsOn)],
    });
  }

  get(id: string): DependencyNode | undefined {
    return this.nodes.get(id);
  }

  getAffectedNodes(changedNodeIds: string[]): string[] {
    const changed = new Set(changedNodeIds);
    const affected = new Set<string>();

    let changedSomething = true;

    while (changedSomething) {
      changedSomething = false;

      for (const node of this.nodes.values()) {
        if (affected.has(node.id)) {
          continue;
        }

        const dependencyHit =
          node.dependsOn.some(
            dependency =>
              changed.has(dependency) ||
              affected.has(dependency),
          );

        if (dependencyHit) {
          affected.add(node.id);
          changedSomething = true;
        }
      }
    }

    return [...affected];
  }

  getArtifactsAffectedByDataset(
    datasetId: string,
  ): string[] {
    return this.getAffectedNodes([datasetId])
      .filter(id => this.nodes.get(id)?.type === 'ARTIFACT');
  }
}
