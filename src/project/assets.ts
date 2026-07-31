import * as fs from 'fs'
import * as path from 'path'

import type { LoadedProject } from './model'
import { ProjectManifestError } from './manifest'

const IGNORED_DIRECTORIES = new Set(['.git', '.hg', '.svn', 'node_modules'])
export const MAX_PROJECT_ASSET_BYTES = 64 * 1024 * 1024

export interface ProjectAssetFile {
  readonly assetRoot: string
  readonly absolutePath: string
  readonly assetRelativePath: string
  readonly projectRelativePath: string
}

function isInside(rootDir: string, candidate: string): boolean {
  const relative = path.relative(rootDir, candidate)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

function globPatternToRegExp(pattern: string): RegExp {
  let source = '^'
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]
    if (char === '*' && pattern[index + 1] === '*') {
      index++
      if (pattern[index + 1] === '/') {
        index++
        source += '(?:.*/)?'
      } else {
        source += '.*'
      }
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`${source}$`)
}

export function projectAssetMatches(project: LoadedProject, relativePath: string): boolean {
  return (project.assets?.include ?? []).some(pattern => globPatternToRegExp(pattern).test(relativePath))
}

function canonicalAssetRoots(project: LoadedProject): string[] {
  const roots = (project.assets?.roots ?? []).map(root => fs.realpathSync(root))
  for (let index = 0; index < roots.length; index++) {
    for (let other = index + 1; other < roots.length; other++) {
      if (isInside(roots[index], roots[other]) || isInside(roots[other], roots[index])) {
        throw new ProjectManifestError(
          project.manifestPath,
          `Overlapping asset roots '${roots[index]}' and '${roots[other]}' make asset provenance ambiguous`,
        )
      }
    }
  }
  return roots
}

/** Discover every configured JSON/NBT asset without following symlinks. */
export function discoverProjectAssets(project: LoadedProject): ProjectAssetFile[] {
  const projectRoot = fs.realpathSync(project.rootDir)
  const discovered: ProjectAssetFile[] = []

  const visit = (assetRoot: string, dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        throw new ProjectManifestError(
          project.manifestPath,
          `Configured asset tree contains symbolic link '${absolutePath}'`,
        )
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue
        visit(assetRoot, absolutePath)
        continue
      }
      if (!entry.isFile()) continue

      const canonicalPath = fs.realpathSync(absolutePath)
      if (!isInside(assetRoot, canonicalPath) || !isInside(projectRoot, canonicalPath)) {
        throw new ProjectManifestError(
          project.manifestPath,
          `Asset '${absolutePath}' escapes its configured asset root or owning module`,
        )
      }
      const assetRelativePath = path.relative(assetRoot, canonicalPath).split(path.sep).join('/')
      if (!projectAssetMatches(project, assetRelativePath)) continue
      const size = fs.statSync(canonicalPath).size
      if (size > MAX_PROJECT_ASSET_BYTES) {
        throw new ProjectManifestError(
          project.manifestPath,
          `Asset '${assetRelativePath}' exceeds ${MAX_PROJECT_ASSET_BYTES} bytes`,
        )
      }
      discovered.push(Object.freeze({
        assetRoot,
        absolutePath: canonicalPath,
        assetRelativePath,
        projectRelativePath: path.relative(projectRoot, canonicalPath).split(path.sep).join('/'),
      }))
    }
  }

  for (const assetRoot of canonicalAssetRoots(project)) visit(assetRoot, assetRoot)
  return discovered.sort((left, right) => {
    const byRelative = left.assetRelativePath.localeCompare(right.assetRelativePath)
    return byRelative || left.projectRelativePath.localeCompare(right.projectRelativePath)
  })
}

export function resolveProjectAsset(project: LoadedProject, sourcePath: string): ProjectAssetFile {
  if ((project.assets?.roots.length ?? 0) === 0) {
    throw new ProjectManifestError(
      project.manifestPath,
      `Resource source '${sourcePath}' requires at least one [assets].roots entry`,
    )
  }
  if (!projectAssetMatches(project, sourcePath)) {
    throw new ProjectManifestError(
      project.manifestPath,
      `Resource source '${sourcePath}' is not included by [assets].include`,
    )
  }

  const matches = discoverProjectAssets(project).filter(asset => asset.assetRelativePath === sourcePath)
  if (matches.length === 0) {
    throw new ProjectManifestError(project.manifestPath, `Resource source '${sourcePath}' does not exist in [assets].roots`)
  }
  if (matches.length > 1) {
    throw new ProjectManifestError(project.manifestPath, `Ambiguous resource source '${sourcePath}' across [assets].roots`)
  }
  return matches[0]
}
