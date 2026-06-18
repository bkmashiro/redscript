import type { LIRFunction, LIRInstr } from '../lir/types'

/**
 * Convert a LIR function name to its datapack `.mcfunction` path.
 * LIR method names use `::`; Minecraft function paths use `/` and lowercase.
 */
export function fnNameToPath(name: string, namespace: string): string {
  const mcName = name.replace(/::/g, '/').toLowerCase()
  return `data/${namespace}/function/${mcName}.mcfunction`
}

/** Produce a fully-qualified Minecraft function reference such as `rs:player/heal`. */
export function qualifiedFunctionRef(name: string, namespace: string): string {
  return `${namespace}:${name.replace(/::/g, '/').toLowerCase()}`
}

/** Human-readable function display name for source-map entries. */
export function humanFunctionName(fn: Pick<LIRFunction, 'name' | 'sourceSnippet'>): string {
  const match = fn.sourceSnippet?.match(/^fn\s+([^(]+)/)
  return match?.[1] ?? fn.name.split('::').pop() ?? fn.name
}

/** Emit source header comments for a `.mcfunction` body. */
export function emitFunctionHeader(fn: LIRFunction): string[] {
  if (!fn.sourceLoc) return []
  const lines: string[] = []
  lines.push(`# Generated from: ${fn.sourceLoc.file}:${fn.sourceLoc.line} (fn ${humanFunctionName(fn)})`)
  if (fn.sourceSnippet) {
    lines.push(`# Source: ${fn.sourceSnippet}`)
  }
  return lines
}

/** Format a source location as a compact `file:line` marker. */
export function formatSourceMarker(sourceLoc: NonNullable<LIRInstr['sourceLoc']>): string {
  return `${sourceLoc.file}:${sourceLoc.line}`
}
