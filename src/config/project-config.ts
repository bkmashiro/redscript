/**
 * Compatibility adapter for the pre-project redscript.toml API.
 *
 * New compiler code should use src/project/manifest.ts. This module keeps the
 * old return shape for existing callers while sharing the TOML 1.0 parser and
 * nearest-root discovery semantics.
 */

import * as fs from 'fs'
import { parse } from 'smol-toml'

import { discoverProjectManifest } from '../project/discovery'

export interface ProjectConfig {
  project?: {
    name?: string
    namespace?: string
    'mc-version'?: string
    description?: string
  }
  compiler?: {
    optimization?: number
    'include-dirs'?: string[]
    'no-dce'?: boolean
  }
  output?: {
    dir?: string
  }
}

interface Table {
  [key: string]: unknown
}

function isTable(value: unknown): value is Table {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value as string[]
    : undefined
}

function toCompatibilityConfig(raw: Table): ProjectConfig {
  const config: ProjectConfig = {}
  if (isTable(raw.project)) {
    config.project = {}
    if (typeof raw.project.name === 'string') config.project.name = raw.project.name
    if (typeof raw.project.namespace === 'string') config.project.namespace = raw.project.namespace
    if (typeof raw.project['mc-version'] === 'string') config.project['mc-version'] = raw.project['mc-version']
    if (typeof raw.project.description === 'string') config.project.description = raw.project.description
  }
  if (isTable(raw.compiler)) {
    config.compiler = {}
    if (typeof raw.compiler.optimization === 'number') config.compiler.optimization = raw.compiler.optimization
    const includeDirs = strings(raw.compiler['include-dirs'])
    if (includeDirs) config.compiler['include-dirs'] = includeDirs
    if (typeof raw.compiler['no-dce'] === 'boolean') config.compiler['no-dce'] = raw.compiler['no-dce']
  }
  if (isTable(raw.output)) {
    config.output = {}
    if (typeof raw.output.dir === 'string') config.output.dir = raw.output.dir
  }
  return config
}

/**
 * Load the nearest manifest using the legacy shape.
 *
 * Parse/read failures remain warnings for compatibility. The strict project
 * loader instead raises ProjectManifestError and should be used by new paths.
 */
export function loadProjectConfig(startPath: string): ProjectConfig | null {
  const discovered = discoverProjectManifest(startPath)
  if (!discovered) return null

  try {
    const source = fs.readFileSync(discovered.manifestPath, 'utf8')
    const raw = parse(source)
    return toCompatibilityConfig(raw as Table)
  } catch (error) {
    console.warn(`Warning: failed to parse ${discovered.manifestPath}: ${(error as Error).message}`)
    return null
  }
}
/** Default template content for a new redscript.toml file. */
export function buildTomlTemplate(namespace: string): string {
  const ns = namespace.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_') || 'redscript_pack'
  return `# RedScript project configuration

[project]
name = "${ns}"
module = "local/${ns}"
namespace = "${ns}"
mc-version = "1.21.4"
source-roots = ["src"]

[compiler]
optimization = 2
include-dirs = []
no-dce = false

[target.pack]
kind = "datapack"
entry = "local/${ns}::main"
out = "dist"
default = true
`
}
