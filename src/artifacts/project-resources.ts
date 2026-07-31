import * as fs from 'fs'
import type { DatapackFile } from '../emit'
import { resolveProjectAsset } from '../project/assets'
import type { BuildTarget, LoadedProject } from '../project/model'
import { reachablePackagePaths, type PackageGraph } from '../project/package-graph'
import type { McVersion } from '../types/mc-version'
import {
  createDatapackArtifactGraph,
  createResourceArtifact,
  generatedDatapackArtifacts,
} from './graph'
import { createTagResourceArtifact } from './tag-builder'
import { isTagResourceArtifactKind } from './registry'
import {
  ArtifactGraphError,
  type DatapackArtifact,
  type DatapackArtifactGraph,
} from './model'


export function collectProjectResourceArtifacts(
  project: LoadedProject,
  graph: PackageGraph,
  minecraftVersion: McVersion | number,
): DatapackArtifact[] {
  // Retained in the public boundary so provenance stays rooted in the selected project.
  void project
  const reachable = reachablePackagePaths(graph)
  const artifacts: DatapackArtifact[] = []
  for (const packageId of graph.topologicalOrder) {
    if (!reachable.has(packageId.path)) continue
    const loaded = graph.packages.get(packageId.path)!
    const moduleProject = graph.moduleGraph.modules.get(loaded.id.modulePath)?.project
    if (!moduleProject) {
      throw new ArtifactGraphError(`No project provenance exists for module '${loaded.id.modulePath}'`)
    }
    for (const program of loaded.programs) {
      for (const declaration of program.resourceDeclarations ?? []) {
        if (declaration.sourcePath && declaration.builder) {
          throw new ArtifactGraphError(`Resource '${declaration.registry} ${declaration.id}' cannot use both from-file and typed builder contributions`)
        }
        const provenance = {
          kind: 'source' as const,
          modulePath: loaded.id.modulePath,
          packagePath: loaded.id.path,
          sourceFile: declaration.span?.file ?? loaded.sourceFiles[0]?.absolutePath ?? moduleProject.manifestPath,
          line: declaration.span?.line ?? 1,
          col: declaration.span?.col ?? 1,
        }
        if (declaration.sourcePath) {
          const sourcePath = resolveProjectAsset(moduleProject, declaration.sourcePath).absolutePath
          artifacts.push(createResourceArtifact({
            kind: declaration.registry,
            id: declaration.id,
            sourcePath,
            content: fs.readFileSync(sourcePath),
            provenance,
            minecraftVersion,
          }))
        } else if (declaration.builder?.kind === 'tag') {
          if (!isTagResourceArtifactKind(declaration.registry)) {
            throw new ArtifactGraphError(`Resource kind '${declaration.registry}' is not a tag resource kind`)
          }
          artifacts.push(createTagResourceArtifact({
            kind: declaration.registry,
            id: declaration.id,
            policy: declaration.builder.policy,
            values: declaration.builder.values,
            provenance,
            minecraftVersion,
          }))
        }
      }
    }
  }
  return artifacts
}

export function buildProjectDatapackArtifactGraph(
  generatedFiles: readonly DatapackFile[],
  project: LoadedProject,
  target: BuildTarget,
  graph: PackageGraph,
  minecraftVersion: McVersion | number,
): DatapackArtifactGraph {
  const resources = collectProjectResourceArtifacts(project, graph, minecraftVersion)
  const candidates = [
    ...generatedDatapackArtifacts(generatedFiles, minecraftVersion),
    ...resources,
  ]
  const localNamespaces = new Set<string>([
    target.namespace,
    project.manifest.project.namespace,
  ])
  for (const artifact of resources) {
    if (artifact.identity.namespace) localNamespaces.add(artifact.identity.namespace)
  }
  return createDatapackArtifactGraph(candidates, {
    minecraftVersion,
    localNamespaces: [...localNamespaces],
  })
}
