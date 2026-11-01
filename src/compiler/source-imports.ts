import * as fs from 'fs'
import * as path from 'path'
import { getStdlibDir, stdlibModuleName } from '../stdlib/paths'
import type { SourceManager } from './source-manager'

export interface SourceImportLocation {
  fromFile?: string
  includeDirs?: readonly string[]
  /** File-backed buffers can exist in the session before they exist on disk. */
  sources?: Pick<SourceManager, 'getByPath'>
}

/** Shared filesystem discovery for standalone source consumers. Explicit stdlib/
 * paths belong to the compiler; local relative/short imports keep file precedence.
 * Canonical symbol identity and visibility are determined by the binder.
 */
export function resolveSourceImport(specifier: string, options: SourceImportLocation = {}): string | null {
  const available = (candidate: string): boolean => Boolean(options.sources?.getByPath(candidate))
    || (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
  if (specifier.startsWith('stdlib/')) {
    const name = stdlibModuleName(specifier)
    const candidate = name ? path.join(getStdlibDir(), `${name}.mcrs`) : undefined
    return candidate && available(candidate) ? candidate : null
  }
  const candidates = specifier.endsWith('.mcrs') ? [specifier] : [specifier, `${specifier}.mcrs`]
  for (const candidate of candidates) {
    if (options.fromFile) {
      const local = path.resolve(path.dirname(options.fromFile), candidate)
      if (available(local)) return local
    }
    const standard = path.resolve(getStdlibDir(), candidate)
    if (available(standard)) return standard
    for (const directory of options.includeDirs ?? []) {
      const included = path.resolve(directory, candidate)
      if (available(included)) return included
    }
  }
  return null
}
