/**
 * redscript.toml project configuration file support.
 *
 * Provides ProjectConfig interface and loadProjectConfig() which walks up the
 * directory tree to find the nearest redscript.toml file.
 */

import * as fs from 'fs'
import * as path from 'path'

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

// ---------------------------------------------------------------------------
// Minimal TOML parser
// Supports:
//   - [section] headers
//   - key = value  (string, number, boolean)
//   - key = ["a", "b"]  (array of strings)
//   - # comments
// ---------------------------------------------------------------------------

type TomlValue = string | number | boolean | string[]

function parseTomlValue(raw: string): TomlValue {
  const trimmed = raw.trim()

  // Array
  if (trimmed.startsWith('[')) {
    const inner = trimmed.slice(1, trimmed.lastIndexOf(']'))
    if (inner.trim() === '') return []
    return inner
      .split(',')
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(s => s.length > 0)
  }

  // Boolean
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false

  // Number (integer)
  const num = Number(trimmed)
  if (!isNaN(num) && trimmed !== '') return num

  // String (quoted)
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }

  // Bare string
  return trimmed
}

function parseToml(content: string): Record<string, Record<string, TomlValue>> {
  const result: Record<string, Record<string, TomlValue>> = {}
  let currentSection = '__root__'

  for (const rawLine of content.split('\n')) {
    // Strip comments and trim
    const commentIdx = rawLine.indexOf('#')
    const line = (commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine).trim()

    if (line === '') continue

    // Section header
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim()
      if (!result[currentSection]) result[currentSection] = {}
      continue
    }

    // Key = value
    const eqIdx = line.indexOf('=')
    if (eqIdx < 0) continue
    const key = line.slice(0, eqIdx).trim()
    const valueRaw = line.slice(eqIdx + 1).trim()

    if (!result[currentSection]) result[currentSection] = {}
    result[currentSection][key] = parseTomlValue(valueRaw)
  }

  return result
}

/** Convert raw parsed TOML sections into a typed ProjectConfig. */
function tomlToConfig(raw: Record<string, Record<string, TomlValue>>): ProjectConfig {
  const config: ProjectConfig = {}

  const project = raw['project']
  if (project) {
    config.project = {}
    if (typeof project['name'] === 'string') config.project.name = project['name']
    if (typeof project['namespace'] === 'string') config.project.namespace = project['namespace']
    if (typeof project['mc-version'] === 'string') config.project['mc-version'] = project['mc-version']
    if (typeof project['description'] === 'string') config.project.description = project['description']
  }

  const compiler = raw['compiler']
  if (compiler) {
    config.compiler = {}
    if (typeof compiler['optimization'] === 'number') config.compiler.optimization = compiler['optimization']
    if (Array.isArray(compiler['include-dirs'])) config.compiler['include-dirs'] = compiler['include-dirs'] as string[]
    if (typeof compiler['no-dce'] === 'boolean') config.compiler['no-dce'] = compiler['no-dce']
  }

  const output = raw['output']
  if (output) {
    config.output = {}
    if (typeof output['dir'] === 'string') config.output.dir = output['dir']
  }

  return config
}

/**
 * Walk up the directory tree starting at `startDir` to find the nearest
 * `redscript.toml`.  Returns a parsed ProjectConfig or null if not found.
 */
export function loadProjectConfig(startDir: string): ProjectConfig | null {
  let dir = path.resolve(startDir)

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, 'redscript.toml')
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, 'utf-8')
        const raw = parseToml(content)
        return tomlToConfig(raw)
      } catch {
        return null
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir) {
      // Reached filesystem root
      return null
    }
    dir = parent
  }
}

/** Default template content for a new redscript.toml file. */
export function buildTomlTemplate(namespace: string): string {
  return `[project]
name = "${namespace}"
namespace = "${namespace}"
mc-version = "1.21.4"
description = "${namespace} datapack"

[compiler]
# optimization = 2
# include-dirs = ["src/shared"]
# no-dce = false

[output]
dir = "dist/"
`
}
